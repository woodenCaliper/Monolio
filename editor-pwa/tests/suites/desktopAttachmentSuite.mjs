// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT } from "../lib.mjs";

// ---- デスクトップ版(exe)の添付のダウンロード(v189) ----
// exe の中の画面では <a download> が黙ってダウンロードフォルダへ保存し、目に見える知らせも出ないので、
// 「ダウンロードが機能しない」と見えていた(ユーザー報告。実際は保存されていた)。exe では「名前を付けて保存」の画面
// (Tauri のコマンド save_attachment)で保存する(ユーザー指示: 案1)。テストでは exe の橋渡し(window.__TAURI__.core)を
// アプリより先に差し込み、呼ばれ方(コマンド名・中身のバイト列・名前の見出し)を記録する。
export default async function desktopAttachmentSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let browserDownloads = 0;
  fresh.on("download", () => { browserDownloads += 1; });
  await fresh.addInitScript(() => {
    window.__desktopCalls = [];
    window.__desktopAnswer = "C:\\saved\\レポート 2026.txt";
    window.__TAURI__ = {
      core: {
        invoke: async (command, args, options) => {
          window.__desktopCalls.push({
            command,
            bytes: args instanceof Uint8Array ? [...args] : null,
            args: args instanceof Uint8Array ? null : args ?? null,
            header: options?.headers?.["x-file-name"] ?? null,
          });
          return command === "save_attachment" ? window.__desktopAnswer : null;
        },
      },
    };
  });
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const name = "レポート 2026.txt";
    const content = "desktop download ✓\n";
    const file = join(OUT, "desktop-attachment.txt");
    await writeFile(file, content, "utf8");
    // 添付は名前を日本語にしたいので、ブラウザ側で File を作って入力欄へ渡す。
    await fresh.evaluate(async ({ name, content }) => {
      const input = document.querySelector("#attach-input");
      const transfer = new DataTransfer();
      transfer.items.add(new File([content], name, { type: "text/plain" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, { name, content });
    await fresh.waitForSelector(".attachment-download");
    await fresh.locator(".attachment-download").first().click();
    await fresh.waitForTimeout(400);
    const calls = await fresh.evaluate(() => window.__desktopCalls.filter((call) => call.command === "save_attachment"));
    const expected = [...new TextEncoder().encode(content)];
    result.desktopAttachmentUsesSaveDialog = calls.length === 1
      && JSON.stringify(calls[0].bytes) === JSON.stringify(expected)
      && decodeURIComponent(calls[0].header || "") === name;
    // exe ではブラウザのダウンロード(黙ってダウンロードフォルダへ)を使わない。
    result.desktopAttachmentSkipsBrowserDownload = browserDownloads === 0;
    // 保存先を選ばずに閉じた(null)ときは、何も保存せず注意も出さない。
    await fresh.evaluate(() => { window.__desktopAnswer = null; });
    await fresh.locator(".attachment-download").first().click();
    await fresh.waitForTimeout(300);
    result.desktopAttachmentCancelIsQuiet = await fresh.evaluate(() => document.querySelector("#notice")?.hidden !== false)
      && browserDownloads === 0;
    // 本文のリンク(v200): exe では Ctrl+クリックで既定のブラウザに開く(Tauri のコマンド open_url。新しいウィンドウは開かない)。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "https://desk.example/page");
      document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await fresh.locator("#blocks .block-content a", { hasText: "https://desk.example/page" }).click({ modifiers: ["Control"] });
    await fresh.waitForTimeout(150);
    result.desktopLinkOpensInBrowser = await fresh.evaluate(() => {
      const calls = window.__desktopCalls.filter((call) => call.command === "open_url");
      return calls.length === 1 && calls[0].args?.url === "https://desk.example/page";
    });

    // v195: exe では Service Worker を使わない。以前の exe で登録された古い SW と控え(doc-editor-pwa-v186 など)が残り、
    // WebView2 からは更新できないので、右下の版数が古いまま出ていた(PdM が exe で確認して発見)。ブラウザ版のページで
    // 古い SW と控えを作っておき(以前の exe の状態の再現。控えの版は今より大きくして、古い控えを読むと版数が狂うようにする)、
    // exe として開くと、控えが消え・SW の登録を外し・版数がファイルの版数になることを見る。
    // (登録が本当に消えるのは受け持つページが無くなってから。テストでは同じブラウザに別のページが開いたままなので、
    // 外す呼び出しを数える。実際の exe での消え方は、作った exe で確かめた。)
    const url = `http://127.0.0.1:${PORT}/`;
    const asDesktop = async () => {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__TAURI__ = { core: { invoke: async () => null } };
        window.__unregisterCalls = 0;
        const original = ServiceWorkerRegistration.prototype.unregister;
        ServiceWorkerRegistration.prototype.unregister = function () { window.__unregisterCalls += 1; return original.call(this); };
      });
      await page.goto(url);
      await page.waitForSelector("#blocks .block-content");
      await page.waitForFunction(async () => !(await caches.keys()).some((key) => key.startsWith("doc-editor-pwa-")), null, { timeout: 5000, polling: 200 }).catch(() => {});
      return page;
    };
    const plain = await context.newPage();
    await plain.goto(url);
    await plain.waitForSelector("#blocks .block-content");
    await plain.evaluate(async () => {
      await navigator.serviceWorker.ready;
      await (await caches.open("doc-editor-pwa-v9999")).put("/stale-check", new Response("stale"));
    });
    await plain.close();
    const desk = await asDesktop();
    await desk.waitForFunction(() => window.__unregisterCalls > 0, null, { timeout: 5000, polling: 200 }).catch(() => {});
    const desktopState = await desk.evaluate(async () => ({
      unregisterCalls: window.__unregisterCalls,
      caches: await caches.keys(),
      badge: document.querySelector("#version-badge")?.textContent || "",
      file: /doc-editor-pwa-v(\d+)/.exec(await (await fetch("./service-worker.js", { cache: "no-store" })).text())?.[1],
    }));
    await desk.close();
    result.desktopDropsServiceWorker = !desktopState.caches.some((key) => key.startsWith("doc-editor-pwa-"))
      && desktopState.unregisterCalls > 0;
    result.desktopVersionBadgeReadsFile = desktopState.badge.endsWith(" · build " + desktopState.file) && /^v\d+\.\d+\.\d+ · /.test(desktopState.badge);
    result.desktopServiceWorkerEvidence = JSON.stringify(desktopState);
    return result;
  } finally {
    await fresh.close();
  }
}
