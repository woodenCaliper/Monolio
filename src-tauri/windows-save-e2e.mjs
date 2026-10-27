// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// Windows のデスクトップ版(exe)で、Linux と同じ保存まわりを確かめる(v281)。exe は WebView2 のデバッグの口つきで立て、画面の中は
// Playwright(CDP)で、OS の画面(開く・名前を付けて保存・確認)は windows-dialog.ps1 で操作する。
// 使い方(Windows): node src-tauri/windows-save-e2e.mjs <exe の場所>   OS の画面を前に出して打つので、流している間は PC を触らない
import { chromium } from "../node_modules/playwright-core/index.mjs";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const exe = process.argv[2];
const dir = join(tmpdir(), "monolio-save-e2e");
const dialogScript = fileURLToPath(new URL("./windows-dialog.ps1", import.meta.url));
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dialog = (args) => { try { return execFileSync("pwsh", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", dialogScript, ...args], { encoding: "utf8" }).trim(); } catch (e) { return "error " + String(e.stdout || e.message).trim(); } };
const manifestOf = (file) => { const html = readFileSync(file, "utf8"); const m = 'id="document-manifest">'; const s = html.indexOf(m) + m.length; return JSON.parse(html.slice(s, html.indexOf("</script>", s))); };
const app = spawn(exe, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9334" }, stdio: "ignore" });
const results = {};
let browser = null;
try {
  for (let i = 0; i < 40 && !browser; i += 1) { await wait(500); browser = await chromium.connectOverCDP("http://127.0.0.1:9334").catch(() => null); }
  let page = null;
  for (let i = 0; i < 20 && !page; i += 1) { page = browser.contexts().flatMap((c) => c.pages()).find((p) => !p.url().startsWith("devtools")) || null; if (!page) await wait(500); }
  await page.waitForSelector("#blocks .block-content", { timeout: 15000 });
  results.version = await page.evaluate(() => [...document.querySelectorAll("*")].map((n) => (n.childElementCount === 0 ? n.textContent : "")).find((t) => /^v2\d\d$/.test((t || "").trim())));
  const made = await page.evaluate(async () => {
    const fmt = window.SingleHtmlFormat;
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#c1512f"; ctx.fillRect(0, 0, 8, 8);
    const bytes = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, "image/png"))).arrayBuffer());
    const image = await fmt.fileToAttachment(new File([bytes], "red dot.png", { type: "image/png" }), "att1");
    return {
      source: fmt.buildPortableHtml({ pages: [{ id: "P1", title: "保存の試し", blocks: [
        { id: "p1", type: "paragraph", text: "元の文" },
        { id: "img", type: "attachment", attachmentId: "att1" },
        { id: "t", type: "table", database: { columns: [{ type: "text" }, { type: "link" }] }, rows: [[{ text: "名前" }, { text: "行き先" }], [{ text: "A" }, { text: "リンク先", link: "linked.html" }]] },
      ] }], fonts: [], attachments: [image] }),
      linked: fmt.buildPortableHtml({ pages: [{ id: "L", title: "リンク先の文書", blocks: [{ id: "l1", type: "paragraph", text: "リンク先です" }] }], fonts: [], attachments: [] }),
      png: btoa(String.fromCharCode(...bytes)),
    };
  });
  const sourcePath = join(dir, "source doc.html");
  writeFileSync(sourcePath, made.source);
  writeFileSync(join(dir, "linked.html"), made.linked);
  const pngBytes = Buffer.from(made.png, "base64");
  // 押したことを先にアプリへ届ける(下の OS の画面の操作は Node を止めて待つので、送る前に止めると押されない)。
  const menu = async (id) => { await page.evaluate((x) => { setTimeout(() => document.getElementById(x).click(), 0); }, id); await wait(200); };
  const title = () => page.evaluate(() => document.querySelector("#doc-title").textContent);
  const typeAt = async (css, text) => { await page.locator(css).first().click(); await page.keyboard.press("End"); await page.keyboard.type(text); };
  // 1) 開く
  await menu("menu-open-document");
  results.openDialog = dialog(["-Title", "開く", "-Path", sourcePath]);
  await wait(1500);
  results.opened = (await title()) === "保存の試し";
  // 2) 上書き保存(Ctrl+S)
  await typeAt('#blocks .block-content[data-id="p1"]', " 追記1");
  await page.keyboard.press("Control+s");
  await wait(1500);
  results.overwriteOk = JSON.stringify(manifestOf(sourcePath)).includes("追記1") && readdirSync(dir).sort().join("|") === "linked.html|source doc.html";
  // 3) 名前を付けて保存(日本語とスペースの名前)→ 次の Ctrl+S は新しいファイルへ
  const savedAs = join(dir, "保存 した.html");
  await menu("menu-save-as");
  results.saveAsDialog = dialog(["-Title", "名前を付けて保存", "-Path", savedAs]);
  await wait(1500);
  results.savedAsExists = existsSync(savedAs);
  if (results.savedAsExists) {
    await typeAt('#blocks .block[data-id="t"] [data-row="1"][data-cell="0"]', " 追記2");
    await page.keyboard.press("Control+s");
    await wait(1500);
    results.secondSaveGoesToNewFile = JSON.stringify(manifestOf(savedAs)).includes("追記2") && !JSON.stringify(manifestOf(sourcePath)).includes("追記2");
  }
  // 4) 添付の保存
  const out = join(dir, "取り出した 画像.png");
  await page.evaluate(() => { setTimeout(() => document.querySelector("#blocks .attachment-download").click(), 0); });
  await wait(200);
  results.attachmentDialog = dialog(["-Title", "名前を付けて保存", "-Path", out]);
  await wait(1200);
  results.attachmentSaved = existsSync(out) && Buffer.compare(readFileSync(out), pngBytes) === 0;
  // 5) リンク先の文書(Ctrl を押しながらの押し下げ)
  await page.evaluate(() => document.querySelector('#blocks a.db-link[href="linked.html"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, ctrlKey: true, button: 0 })));
  await wait(1500);
  if ((await title()) !== "リンク先の文書") { dialog(["-Title", "Monolio", "-Keys", "{ENTER}", "-TimeoutMs", "2000"]); await wait(1500); }
  results.linkedOpened = (await title()) === "リンク先の文書";
  // 6) 変更を捨てる確認: Esc でやめる、Enter で OK
  await typeAt('#blocks .block-content[data-id="l1"]', " 未保存の変更");
  await menu("menu-new-document");
  results.confirmEsc = dialog(["-Title", "Monolio", "-Keys", "{ESC}"]);
  await wait(800);
  results.cancelKeeps = await page.evaluate(() => document.body.innerText.includes("未保存の変更"));
  await menu("menu-new-document");
  results.confirmEnter = dialog(["-Title", "Monolio", "-Keys", "{ENTER}"]);
  await wait(1200);
  results.enterChoosesOk = !(await page.evaluate(() => document.body.innerText.includes("未保存の変更")));
  results.files = readdirSync(dir).sort();
} catch (error) {
  results.error = String(error.message || error).slice(0, 500);
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  console.log(JSON.stringify(results, null, 1));
  setTimeout(() => process.exit(0), 300);
}
