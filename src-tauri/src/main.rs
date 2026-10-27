// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri_plugin_dialog::DialogExt;

/// Paths the user picked through a native dialog in this session.
///
/// `write_document` overwrites a file silently (no dialog), so it must only ever touch a file the
/// user already chose here — the document they opened (`read_document`) or saved (`save_document_as`).
/// Without this gate, any script running in the WebView could call `write_document` with an arbitrary
/// path and write anywhere the process can reach (e.g. the Windows Startup folder). `withGlobalTauri`
/// is on, so a single sanitizer bypass in a hostile document (past the CSP in tauri.conf.json) would otherwise
/// reach the whole machine. This caps the blast radius to the one file the user is already working on.
#[derive(Default)]
struct AllowedPaths(Mutex<HashSet<PathBuf>>);

/// The key a path is remembered and matched by. Canonicalizing collapses `.`/`..` and symlinks so the
/// same file is recognized however it is spelled; if that fails (e.g. the file was removed) the path is
/// used as written, which can only ever be stricter, never looser.
fn path_key(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn remember_path(allowed: &AllowedPaths, path: &Path) {
    if let Ok(mut set) = allowed.0.lock() {
        set.insert(path_key(path));
    }
}

fn is_allowed_path(allowed: &AllowedPaths, path: &Path) -> bool {
    allowed
        .0
        .lock()
        .map(|set| set.contains(&path_key(path)))
        .unwrap_or(false)
}

/// Writes a file so that it is either the old contents or the new contents, never half of each (v275, Issue #200).
///
/// `std::fs::write` truncates the file first, so a crash or power loss mid-write left an empty or cut-off file —
/// and a Monolio document is the whole document in one file. Instead the bytes go to a temporary file in the same
/// folder (same volume, so the rename below is a replace, not a copy), are flushed to disk, and then the temporary
/// file replaces the target (`std::fs::rename` replaces an existing file on Windows and Unix). On any failure the
/// temporary file is removed and the target is left untouched. Every write to a user file goes through here.
fn write_file_atomically(path: &Path, contents: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let folder = path.parent().filter(|folder| !folder.as_os_str().is_empty()).unwrap_or_else(|| Path::new("."));
    let name = path
        .file_name()
        .ok_or_else(|| "保存先のファイル名が分かりません".to_string())?
        .to_string_lossy();
    let temp = folder.join(format!(".{name}.{}.monolio-saving", std::process::id()));
    let written = (|| -> std::io::Result<()> {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&temp);
        return Err(error.to_string());
    }
    Ok(())
}

/// A cheap fingerprint of a file on disk: its modified time (nanoseconds since the Unix epoch) and size (v275, Issue #199).
/// The editor checks for outside edits every few seconds; with this it reads the whole file only when the fingerprint
/// changed, instead of reading and hashing a possibly tens-of-megabytes file every time.
fn file_stamp(path: &Path) -> Result<String, String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    Ok(format!("{modified}:{}", metadata.len()))
}

/// The fingerprint (`file_stamp`) of a file the user opened or saved in this session.
#[tauri::command]
fn document_stamp(allowed: tauri::State<'_, AllowedPaths>, path: String) -> Result<String, String> {
    let path = Path::new(&path);
    if !is_allowed_path(&allowed, path) {
        return Err("このファイルは見られません(このセッションで開いたか保存したファイルだけ)".to_string());
    }
    file_stamp(path)
}

/// Opens a native save dialog, writes the document, and returns the chosen path.
/// Returns `None` when the user cancels.
// The commands that show a native dialog are async (v281): a plain #[tauri::command] fn runs on the main thread, and the
// dialog plugin's blocking_* calls hand the dialog to the main thread and wait for it, so on Linux (GTK) the app froze as soon
// as Open, Save As, saving an attachment or the discard confirmation was used. An async command waits on a worker thread.
#[tauri::command]
async fn save_document_as(
    app: tauri::AppHandle,
    allowed: tauri::State<'_, AllowedPaths>,
    suggested_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(suggested_name)
        .add_filter("Single HTML document", &["html"])
        .blocking_save_file();

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    write_file_atomically(&path, contents.as_bytes())?;
    // Remember it so the next Ctrl+S (`write_document`) may overwrite this same file.
    remember_path(&allowed, &path);
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Saves an attachment's bytes through a native "Save As" dialog and returns the chosen path.
/// Returns `None` when the user cancels.
///
/// The WebView's own download (an `<a download>` click) saves silently into the Downloads folder
/// with no visible sign in this window, so users thought downloads did not work (v189).
/// The bytes arrive as the raw request body (no JSON array of numbers, which is slow for large files);
/// the suggested file name arrives percent-encoded in the `x-file-name` header (headers are ASCII only).
#[tauri::command]
async fn save_attachment(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_attachment expects the file bytes as the request body".to_string());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let mut dialog = app.dialog().file();
    if !name.is_empty() {
        dialog = dialog.set_file_name(name);
    }
    let Some(picked) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    write_file_atomically(&path, bytes)?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Decodes `encodeURIComponent` output (`%XX` bytes, UTF-8). Malformed escapes are kept as written.
fn percent_decode(text: &str) -> String {
    let source = text.as_bytes();
    let mut bytes = Vec::with_capacity(source.len());
    let mut index = 0;
    while index < source.len() {
        if source[index] == b'%' && index + 2 < source.len() {
            let hex = std::str::from_utf8(&source[index + 1..index + 3]).ok();
            if let Some(value) = hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                bytes.push(value);
                index += 3;
                continue;
            }
        }
        bytes.push(source[index]);
        index += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Opens a link from the document in the user's default browser / mail app (v200).
/// Only http, https and mailto are accepted, matching the editor's own check.
///
/// The URL goes to the OS's own "open this URL" call (ShellExecuteW), never to explorer.exe on a command
/// line (v270, Issue #67). explorer.exe reads its command line as comma-separated switches, so a link like
/// `http://x/?q=1,C:\path\file.cmd` (or `…,/root,…`) made it run the local file, and any URL with a comma
/// opened the wrong thing (reproduced on Windows 11). ShellExecuteW takes the whole URL as one object.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    let allowed = lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:");
    if !allowed || url.chars().any(|c| c.is_whitespace() || c == '"' || c == '<' || c == '>') {
        return Err("このリンクは開けません(http・https・mailto だけ)".to_string());
    }
    shell_open_url(&url)
}

#[cfg(windows)]
fn shell_open_url(url: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let verb = wide("open");
    let file = wide(url);
    // SAFETY: both strings are NUL-terminated UTF-16 buffers that outlive the call; the other pointers are null.
    let result = unsafe {
        ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL)
    };
    // ShellExecuteW reports success with a value greater than 32.
    if result as isize > 32 {
        Ok(())
    } else {
        Err(format!("リンクを開けませんでした(コード {})", result as isize))
    }
}

/// Linux (v278): the desktop's own "open this URL" (GIO, the library GTK and Tauri already use) gets the
/// whole URL as one value and hands it to the default browser, so it is never split on commas or spaces.
#[cfg(target_os = "linux")]
fn shell_open_url(url: &str) -> Result<(), String> {
    gio::AppInfo::launch_default_for_uri(url, None::<&gio::AppLaunchContext>)
        .map_err(|error| format!("リンクを開けませんでした({error})"))
}

#[cfg(not(any(windows, target_os = "linux")))]
fn shell_open_url(_url: &str) -> Result<(), String> {
    Err("この環境ではリンクを開けません".to_string())
}

/// Overwrites a file the user already picked in this session and returns its new fingerprint (`file_stamp`).
///
/// Refuses any path the user did not open or save here (see `AllowedPaths`): without a dialog there is
/// no user intent for an arbitrary destination, so a script-supplied path is rejected rather than written.
#[tauri::command]
fn write_document(
    allowed: tauri::State<'_, AllowedPaths>,
    path: String,
    contents: String,
) -> Result<String, String> {
    let path = Path::new(&path);
    if !is_allowed_path(&allowed, path) {
        return Err("このファイルには保存できません(このセッションで開いたか保存したファイルだけ上書きできます)".to_string());
    }
    write_file_atomically(path, contents.as_bytes())?;
    file_stamp(path)
}

/// Opens a native file dialog and returns the picked document.
/// Returns `None` when the user cancels.
#[tauri::command]
async fn read_document(
    app: tauri::AppHandle,
    allowed: tauri::State<'_, AllowedPaths>,
) -> Result<Option<OpenedDocument>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Single HTML document", &["html"])
        .blocking_pick_file();

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let stamp = file_stamp(&path).ok();
    // Remember it so the next Ctrl+S (`write_document`) may overwrite this same file.
    remember_path(&allowed, &path);
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(Some(OpenedDocument {
        path: path.to_string_lossy().to_string(),
        name,
        contents,
        stamp,
    }))
}

/// Opens the document a table link points to (v236). `href` is relative to the folder of `base`, the document
/// currently open. `base` must be a file the user opened or saved in this session (`AllowedPaths`), so a script
/// cannot pick an arbitrary starting folder. Only relative paths to .html / .htm files are accepted (no drive letters,
/// schemes or absolute paths). The opened file becomes the next Ctrl+S target, like a file picked in the open dialog.
#[tauri::command]
fn read_linked_document(
    allowed: tauri::State<'_, AllowedPaths>,
    base: String,
    href: String,
) -> Result<OpenedDocument, String> {
    let base_path = Path::new(&base);
    if !is_allowed_path(&allowed, base_path) {
        return Err("今の文書の場所が分かりません(このセッションで開いたか保存した文書から開けます)".to_string());
    }
    let without_fragment = href.split(['#', '?']).next().unwrap_or("");
    let relative = percent_decode(without_fragment);
    let looks_absolute = relative.contains(':') || relative.starts_with('/') || relative.starts_with('\\');
    if relative.trim().is_empty() || looks_absolute {
        return Err(format!("この行き先は開けません(同じ場所からの相対パスだけ): {relative}"));
    }
    let folder = base_path.parent().ok_or_else(|| "今の文書のフォルダが分かりません".to_string())?;
    let target = std::fs::canonicalize(folder.join(&relative)).map_err(|_| format!("見つかりません: {relative}"))?;
    let is_html = target
        .extension()
        .map(|ext| ext.eq_ignore_ascii_case("html") || ext.eq_ignore_ascii_case("htm"))
        .unwrap_or(false);
    if !is_html {
        return Err(format!("HTML の文書だけ開けます: {relative}"));
    }
    let contents = std::fs::read_to_string(&target).map_err(|error| error.to_string())?;
    let stamp = file_stamp(&target).ok();
    remember_path(&allowed, &target);
    let name = target
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    let shown = target.to_string_lossy().trim_start_matches(r"\\?\").to_string();
    Ok(OpenedDocument { path: shown, name, contents, stamp })
}

/// Native confirmation dialog. Returns true when the user accepts.
#[tauri::command]
async fn confirm_discard(app: tauri::AppHandle, message: String) -> bool {
    app.dialog()
        .message(message)
        .title("Monolio")
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
        .blocking_show()
}

#[derive(serde::Serialize)]
struct OpenedDocument {
    path: String,
    name: String,
    contents: String,
    /// `file_stamp` of the file as read, so the editor knows when it changes outside (v275). None if it could not be read.
    stamp: Option<String>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AllowedPaths::default())
        .invoke_handler(tauri::generate_handler![save_document_as, save_attachment, open_url, write_document, document_stamp, read_document, read_linked_document, confirm_discard])
        .run(tauri::generate_context!())
        .expect("failed to run the Monolio window");
}

// Issue #200 / #199: saving replaces the file whole (no leftover temporary file, the old contents stay when the
// write fails), and the fingerprint changes when the file changes. `cargo test` (runs by default).
#[cfg(test)]
mod save_tests {
    use super::{file_stamp, write_file_atomically};

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("monolio-save-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn replaces_the_file_and_leaves_no_temporary_file() {
        let dir = scratch("replace");
        let target = dir.join("文書.html");
        std::fs::write(&target, "old contents that are longer than the new ones").unwrap();
        write_file_atomically(&target, "new".as_bytes()).unwrap();
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        let names: Vec<String> = std::fs::read_dir(&dir).unwrap().map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["文書.html".to_string()], "a temporary file was left behind: {names:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn keeps_the_old_contents_when_the_write_fails() {
        let dir = scratch("fail");
        // The target is a folder, so replacing it fails after the temporary file was written.
        let target = dir.join("folder.html");
        std::fs::create_dir_all(target.join("inside")).unwrap();
        assert!(write_file_atomically(&target, "new".as_bytes()).is_err());
        assert!(target.join("inside").is_dir(), "the target was touched");
        let leftovers = std::fs::read_dir(&dir).unwrap().filter(|entry| entry.as_ref().unwrap().file_name() != "folder.html").count();
        assert_eq!(leftovers, 0, "a temporary file was left behind");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_stamp_changes_when_the_file_changes() {
        let dir = scratch("stamp");
        let target = dir.join("a.html");
        write_file_atomically(&target, "one".as_bytes()).unwrap();
        let first = file_stamp(&target).unwrap();
        assert_eq!(first, file_stamp(&target).unwrap());
        std::thread::sleep(std::time::Duration::from_millis(20));
        write_file_atomically(&target, "one more".as_bytes()).unwrap();
        assert_ne!(first, file_stamp(&target).unwrap());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

// Issue #67: a crafted link must not run a local file, and a URL with a comma must reach the browser whole.
// It opens the default browser, so it only runs when asked: `cargo test -- --ignored` (Windows).
#[cfg(all(test, windows))]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    #[ignore]
    fn open_url_keeps_commas_and_runs_no_local_file() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (sender, paths) = mpsc::channel::<String>();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut stream = stream;
                let mut buffer = [0u8; 4096];
                let length = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..length]).to_string();
                let path = request.split_whitespace().nth(1).unwrap_or("").to_string();
                let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nMonolio #67 test. You can close this tab.");
                let _ = sender.send(path);
            }
        });
        let dir = std::env::temp_dir().join(format!("monolio-67-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("ran.txt");
        let payload = dir.join("payload.cmd");
        std::fs::write(&payload, format!("@echo ran> \"{}\"\r\n@exit\r\n", marker.display())).unwrap();
        let payload = payload.display().to_string();
        for (name, url) in [
            ("query", format!("http://127.0.0.1:{port}/query?q=1,{payload}")),
            ("root", format!("http://127.0.0.1:{port}/root,/root,{payload}")),
        ] {
            super::open_url(url).unwrap();
            let mut got = None;
            while let Ok(path) = paths.recv_timeout(Duration::from_secs(10)) {
                if path.starts_with(&format!("/{name}")) {
                    got = Some(path);
                    break;
                }
            }
            let got = got.unwrap_or_else(|| panic!("{name}: the browser got nothing"));
            assert!(got.contains(','), "{name}: the comma was cut off: {got}");
        }
        std::thread::sleep(Duration::from_secs(3));
        assert!(!marker.exists(), "a crafted link ran a local file");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

// Linux (v278): the same check as the Windows test above, without a real browser. A stand-in browser
// (a .desktop entry registered as the default for http in a throwaway XDG folder) only writes down the URL
// it was given, so the test can see that GIO handed over the whole URL as one value and ran nothing else.
#[cfg(all(test, target_os = "linux"))]
mod linux_tests {
    use std::os::unix::fs::PermissionsExt;
    use std::time::{Duration, Instant};

    #[test]
    fn open_url_gives_the_whole_url_to_the_browser_and_runs_no_local_file() {
        let dir = std::env::temp_dir().join(format!("monolio-open-url-{}", std::process::id()));
        let apps = dir.join("data/applications");
        std::fs::create_dir_all(&apps).unwrap();
        std::fs::create_dir_all(dir.join("config")).unwrap();
        let got = dir.join("got.txt");
        let marker = dir.join("ran.txt");
        let browser = dir.join("browser.sh");
        std::fs::write(&browser, format!("#!/bin/sh\nprintf '%s\\n' \"$#\" \"$1\" > '{}'\n", got.display())).unwrap();
        std::fs::set_permissions(&browser, std::fs::Permissions::from_mode(0o755)).unwrap();
        let payload = dir.join("payload.sh");
        std::fs::write(&payload, format!("#!/bin/sh\necho ran > '{}'\n", marker.display())).unwrap();
        std::fs::set_permissions(&payload, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(
            apps.join("monolio-test-browser.desktop"),
            format!("[Desktop Entry]\nType=Application\nName=Monolio test browser\nExec={} %u\nMimeType=x-scheme-handler/http;\n", browser.display()),
        )
        .unwrap();
        std::fs::write(
            dir.join("config/mimeapps.list"),
            "[Default Applications]\nx-scheme-handler/http=monolio-test-browser.desktop\n",
        )
        .unwrap();
        std::env::set_var("XDG_DATA_HOME", dir.join("data"));
        std::env::set_var("XDG_CONFIG_HOME", dir.join("config"));
        std::env::set_var("XDG_DATA_DIRS", dir.join("data"));

        let url = format!("http://127.0.0.1:9/q?x=1,{}", payload.display());
        super::open_url(url.clone()).unwrap();
        let start = Instant::now();
        while !got.exists() && start.elapsed() < Duration::from_secs(10) {
            std::thread::sleep(Duration::from_millis(100));
        }
        let received = std::fs::read_to_string(&got).expect("the stand-in browser was not started");
        let mut lines = received.lines();
        assert_eq!(lines.next(), Some("1"), "the URL was split into several arguments: {received}");
        assert_eq!(lines.next(), Some(url.as_str()), "the URL changed on the way: {received}");
        std::thread::sleep(Duration::from_millis(500));
        assert!(!marker.exists(), "a crafted link ran a local file");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
