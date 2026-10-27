// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// Linux のデスクトップ版で、web 版と違う道(Rust のコマンドと OS の画面)を通る保存まわりを、外から操作して確かめる(v281)。
// 開く・上書き保存・外での書き換え・名前を付けて保存(日本語とスペースの名前)・添付の保存・リンク先の文書・変更を捨てる確認。手順は HANDOVER §4.44。
// アプリの中は Tauri の自動操作(tauri-driver + WebKitWebDriver)、OS のファイルの画面・確認の画面は xdotool で操作する
// (アプリを GDK_BACKEND=x11 で立て、画面を X の窓にする)。
// 使い方(Linux): node src-tauri/linux-save-e2e.mjs <アプリの場所> [作業フォルダ]   要るもの: tauri-driver・webkitgtk-webdriver・xdotool
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const app = process.argv[2];
const dir = process.argv[3] || "/tmp/monolio-save-e2e";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const env = { ...process.env, GDK_BACKEND: "x11", DISPLAY: process.env.DISPLAY || ":0", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };
const driver = spawn(process.env.HOME + "/.cargo/bin/tauri-driver", [], { stdio: ["ignore", "ignore", "pipe"], env });
let driverLog = "";
driver.stderr.on("data", (d) => { driverLog += d; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "http://127.0.0.1:4444";
const call = async (method, path, body) => {
  // アプリが固まったら、待ち続けずに「応答なし」で落とす(固まりを結果として見えるようにする)。
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) })
    .catch((error) => { throw new Error(method + " " + path + ": アプリが応答しない(" + error.name + ")"); });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(method + " " + path + ": " + JSON.stringify(json).slice(0, 300));
  return json.value;
};
const xdo = (...args) => execFileSync("xdotool", args, { env, encoding: "utf8" }).trim();
const windowsNamed = (re) => { try { return xdo("search", "--onlyvisible", "--name", re).split("\n").filter(Boolean); } catch { return []; } };
// 前から無かった、題名が re に合う窓が出るのを待つ。
const waitNewWindow = async (re, known = [], ms = 10000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const fresh = windowsNamed(re).filter((id) => !known.includes(id));
    if (fresh.length) return fresh[fresh.length - 1];
    await wait(200);
  }
  return null;
};
// WSLg では窓を前に出す命令が効かないので、窓の上の帯をマウスで押して焦点を移す(押すのは題名の帯で、中の部品は押さない)。
// 出たばかりの窓は、置き場所が決まるまで変な座標(-32000 あたり)を返すので、決まるまで待つ。
const focusWindow = async (win) => {
  for (let i = 0; i < 30; i += 1) {
    const geometry = Object.fromEntries(xdo("getwindowgeometry", "--shell", win).split("\n").map((line) => line.split("=")));
    const x = Number(geometry.X);
    const y = Number(geometry.Y);
    if (x >= 0 && y >= 0) {
      xdo("mousemove", String(x + Math.floor(Number(geometry.WIDTH) / 2)), String(y + 12), "click", "1");
      return;
    }
    await wait(150);
  }
};
const manifestOf = (file) => {
  const html = readFileSync(file, "utf8");
  const marker = 'id="document-manifest">';
  const start = html.indexOf(marker) + marker.length;
  return JSON.parse(html.slice(start, html.indexOf("</script>", start)));
};
const textsOf = (manifest) => manifest.pages.flatMap((page) => page.blocks.map((block) => block.text || "")).join("|");
const results = {};
let session = null;
try {
  for (let i = 0; i < 40; i += 1) {
    await wait(250);
    if (await fetch(base + "/status").then((r) => r.ok, () => false)) break;
  }
  session = (await call("POST", "/session", { capabilities: { alwaysMatch: { "tauri:options": { application: app } } } })).sessionId;
  const s = (path) => "/session/" + session + path;
  const run = (script, args = []) => call("POST", s("/execute/sync"), { script, args });
  const runAsync = (script, args = []) => call("POST", s("/execute/async"), { script, args });
  const find = async (css) => Object.values(await call("POST", s("/element"), { using: "css selector", value: css }))[0];
  const click = async (css) => call("POST", s("/element/" + (await find(css)) + "/click"), {});
  const keys = (list) => call("POST", s("/actions"), { actions: [{ type: "key", id: "k", actions: list.flatMap((k) => (Array.isArray(k) ? [...k.map((v) => ({ type: "keyDown", value: v })), ...[...k].reverse().map((v) => ({ type: "keyUp", value: v }))] : [{ type: "keyDown", value: k }, { type: "keyUp", value: k }])) }] });
  const CTRL = "";
  const END = "";
  const typeText = async (css, text) => {
    await click(css);
    await keys([END]);
    await call("POST", s("/element/" + (await find(css)) + "/value"), { text });
  };
  const title = () => run("return document.querySelector('#doc-title').textContent");
  const status = () => run("return document.querySelector('#status')?.textContent || ''");
  // メニューの項目は、画面の中から押す(メニューを開いて押す操作は WebDriver では届かないことがあった)。
  const menu = (id) => run("document.getElementById(arguments[0]).click(); return true", [id]);
  // OS のファイルの画面に、場所を打ち込んで決める(開く: Ctrl+L で場所の欄を出す。保存: 名前の欄を全部選んで打ち換える)。
  const answerFileDialog = async (re, path, { open = false } = {}) => {
    const win = await waitNewWindow(re);
    if (!win) return false;
    // --window で送る打鍵は「作り物」として GTK が無視するので、窓に焦点を移してから、ふつうに打つ。
    await focusWindow(win);
    await wait(400);
    xdo("key", open ? "ctrl+l" : "ctrl+a");
    await wait(300);
    // xdotool は日本語を打つとき、文字ごとに鍵を割り当て直すので、速いと字を落とす(「保存」の「保」が抜けた)。ゆっくり打つ。
    xdo("type", "--delay", "150", path);
    await wait(400);
    xdo("key", "Return");
    for (let i = 0; i < 40 && windowsNamed(re).includes(win); i += 1) await wait(150);
    return !windowsNamed(re).includes(win);
  };
  for (let i = 0; i < 40; i += 1) {
    if (await run("return Boolean(document.querySelector('#blocks .block-content'))").catch(() => false)) break;
    await wait(250);
  }
  const mainWindows = windowsNamed("^Monolio$");
  results.mainWindow = mainWindows.length;

  // 0) 試す文書を、アプリの保存と同じ形で作ってフォルダに置く(リンク先の文書・添付の画像・表のリンクのセルつき)。
  const made = await runAsync(`
    const done = arguments[arguments.length - 1];
    (async () => {
      const fmt = window.SingleHtmlFormat;
      const canvas = document.createElement("canvas");
      canvas.width = 8; canvas.height = 8;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#c1512f"; ctx.fillRect(0, 0, 8, 8);
      const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const bytes = new Uint8Array(await png.arrayBuffer());
      const image = await fmt.fileToAttachment(new File([bytes], "red dot.png", { type: "image/png" }), "att1");
      const source = fmt.buildPortableHtml({ pages: [{ id: "P1", title: "保存の試し", blocks: [
        { id: "p1", type: "paragraph", text: "元の文" },
        { id: "img", type: "attachment", attachmentId: "att1" },
        { id: "t", type: "table", database: { columns: [{ type: "text" }, { type: "link" }] }, rows: [[{ text: "名前" }, { text: "行き先" }], [{ text: "A" }, { text: "リンク先", link: "linked.html" }]] },
      ] }], fonts: [], attachments: [image] });
      const linked = fmt.buildPortableHtml({ pages: [{ id: "L", title: "リンク先の文書", blocks: [{ id: "l1", type: "paragraph", text: "リンク先です" }] }], fonts: [], attachments: [] });
      done({ source, linked, png: btoa(String.fromCharCode(...bytes)) });
    })().catch((e) => done({ error: String(e) }));
  `);
  if (made.error) throw new Error("make: " + made.error);
  const sourcePath = join(dir, "source doc.html");
  writeFileSync(sourcePath, made.source);
  writeFileSync(join(dir, "linked.html"), made.linked);
  const pngBytes = Buffer.from(made.png, "base64");

  // 1) 開く(OS の「Open File」の画面)。
  await menu("menu-open-document");
  results.openDialogAnswered = await answerFileDialog("^Open File$", sourcePath, { open: true });
  await wait(1200);
  results.openedTitle = await title();
  results.opened = results.openedTitle === "保存の試し" && (await run("return document.body.innerText.includes('元の文')"));

  // 2) 上書き保存(Ctrl+S。画面を出さずに、開いたファイルへ書く)。一時ファイルが残らない。
  await typeText('#blocks .block-content[data-id="p1"]', " 追記1");
  await keys([[CTRL, "s"]]);
  await wait(1200);
  const afterSave = manifestOf(sourcePath);
  results.overwrite = { texts: textsOf(afterSave), files: readdirSync(dir).sort(), dialogs: windowsNamed("^(Save|Open) File$").length };
  results.overwriteOk = results.overwrite.texts.includes("元の文 追記1") && results.overwrite.dialogs === 0
    && results.overwrite.files.join("|") === "linked.html|source doc.html";

  // 3) 外での書き換え(開いているファイルを、アプリの外で書き換える)。気づいて提案「ファイルの外の変更」を出す。
  const raw = readFileSync(sourcePath, "utf8");
  writeFileSync(sourcePath, raw.replace('"text": "元の文 追記1"', '"text": "外で書き換えた文"'));
  let noticed = false;
  for (let i = 0; i < 30 && !noticed; i += 1) {
    await wait(500);
    noticed = await run("return document.body.innerText.includes('ファイルの外の変更')");
  }
  results.externalChangeNoticed = noticed;
  results.externalChangeStatus = await status();

  // 4) 名前を付けて保存(OS の「Save File」の画面。日本語とスペースの入った名前)。そのあとの Ctrl+S は新しい場所へ書く。
  const savedAsPath = join(dir, "保存 した.html");
  await menu("menu-save-as");
  results.saveAsDialogAnswered = await answerFileDialog("^Save File$", savedAsPath);
  await wait(1200);
  results.savedAsExists = existsSync(savedAsPath);
  if (results.savedAsExists) {
    results.savedAsTitle = manifestOf(savedAsPath).pages[0].title;
    // 段落 p1 は外の変更の提案を出している最中で打てないので、表のセルに打つ。
    await typeText('#blocks .block[data-id="t"] [data-row="1"][data-cell="0"]', " 追記2");
    await keys([[CTRL, "s"]]);
    await wait(1200);
    results.secondSaveGoesToNewFile = JSON.stringify(manifestOf(savedAsPath)).includes("追記2") && !JSON.stringify(manifestOf(sourcePath)).includes("追記2");
  }
  results.statusAfterSaveAs = await status();

  // 5) 添付の保存(OS の「Save File」の画面)。中身が元の画像と同じ。
  const attachmentOut = join(dir, "取り出した 画像.png");
  // 添付の保存のボタンはマウスを乗せたときだけ見えるので、画面の中から押す。
  await run("document.querySelector('#blocks .attachment-download').click(); return true");
  results.attachmentDialogAnswered = await answerFileDialog("^Save File$", attachmentOut);
  await wait(800);
  results.attachmentSaved = existsSync(attachmentOut) && Buffer.compare(readFileSync(attachmentOut), pngBytes) === 0;

  // 6) リンク先の文書を開く(表のリンクのセルを Ctrl+クリック。同じフォルダの linked.html)。変更があれば確認が出るので OK で進む。
  const before = windowsNamed("^Monolio$");
  // Ctrl+クリックは、アプリが受ける「Ctrl を押しながらの押し下げ」を画面の中で起こす(WebDriver の Ctrl+クリックは WebKitWebDriver で通らなかった)。
  await run("const a = document.querySelector('#blocks a.db-link[href=\"linked.html\"]'); a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 })); return true");
  const confirmWin = await waitNewWindow("^Monolio$", before, 2500);
  if (confirmWin) { await focusWindow(confirmWin); await wait(300); xdo("key", "Return"); }
  await wait(1500);
  results.linkedOpenedTitle = await title();
  results.linkedOpened = results.linkedOpenedTitle === "リンク先の文書";

  // 7) 変更を捨てる確認(OS の確認の画面)。「やめる」(Esc)なら文書が残り、「OK」(Enter)なら新しい文書になる。
  await typeText('#blocks .block-content[data-id="l1"]', " 未保存の変更");
  const known = windowsNamed("^Monolio$");
  await menu("menu-new-document");
  const cancelWin = await waitNewWindow("^Monolio$", known, 5000);
  results.confirmShown = Boolean(cancelWin);
  if (cancelWin) { await focusWindow(cancelWin); await wait(300); xdo("key", "Escape"); }
  await wait(800);
  results.cancelKeeps = (await title()) === "リンク先の文書" && (await run("return document.body.innerText.includes('未保存の変更')"));
  const known2 = windowsNamed("^Monolio$");
  await menu("menu-new-document");
  const okWin = await waitNewWindow("^Monolio$", known2, 5000);
  if (okWin) { await focusWindow(okWin); await wait(300); xdo("key", "Return"); }
  await wait(1000);
  // Enter で OK になるか(Windows の確認の画面は Enter が OK)。
  results.enterChoosesOk = !(await run("return document.body.innerText.includes('未保存の変更')"));
  if (!results.enterChoosesOk) {
    // Enter で決まらなかったら、OK のボタンを Alt+O(GTK の「_OK」の近道)で押す。画面が残っていれば先に Esc で閉じる。
    const stillOpen = windowsNamed("^Monolio$").filter((id) => !known2.includes(id));
    if (stillOpen.length) { xdo("key", "Escape"); await wait(500); }
    const known3 = windowsNamed("^Monolio$");
    await menu("menu-new-document");
    const okWin2 = await waitNewWindow("^Monolio$", known3, 5000);
    if (okWin2) { await focusWindow(okWin2); await wait(300); xdo("key", "alt+o"); }
    await wait(1000);
  }
  results.okDiscards = !(await run("return document.body.innerText.includes('未保存の変更')"));
  results.files = readdirSync(dir).sort();
} catch (error) {
  results.error = String(error.message || error);
  results.driverLog = driverLog.slice(-600);
} finally {
  if (session) await call("DELETE", "/session/" + session).catch(() => {});
  driver.kill();
  console.log(JSON.stringify(results, null, 1));
  setTimeout(() => process.exit(0), 300);
}
