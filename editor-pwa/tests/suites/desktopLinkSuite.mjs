// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT } from "../lib.mjs";

// ---- デスクトップ版(exe)で、表のリンクの別の文書を Monolio の中で開く(v236) ----
// ユーザー「クリックしても下にメッセージが出るだけなのはなぜか」→「1でできるようになってないってこと？」→「まずは1で」。
// exe は今の文書の場所を知っているので、表のリンクの別の文書(相対パス)を Ctrl+クリックしたら、その文書を読んで今の文書と入れ替える。
// テストでは exe の橋渡し(window.__TAURI__.core)をアプリより先に差し込み、呼ばれ方と答えを決める(読むのは Rust の read_linked_document)。
export default async function desktopLinkSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  await fresh.addInitScript(() => {
    window.__desktopCalls = [];
    window.__desktopFiles = {};
    window.__confirmAnswer = true;
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          window.__desktopCalls.push({ command, args: args ?? null });
          if (command === "read_document") return window.__desktopFiles.open;
          if (command === "read_linked_document") {
            const file = window.__desktopFiles[args.href];
            if (!file) throw new Error("見つかりません: " + args.href);
            return file;
          }
          if (command === "confirm_discard") return window.__confirmAnswer;
          return null;
        },
      },
    };
  });
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    // 元の文書(表のリンク2つ)と、リンク先の文書を用意する
    await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const index = fmt.buildPortableHtml({ pages: [{ id: "I", title: "目次の文書", blocks: [
        { id: "lt", type: "table", database: { columns: [{ type: "text" }, { type: "link" }] }, rows: [
          [{ text: "名前" }, { text: "資料" }],
          [{ text: "A" }, { text: "設計書", link: "sub/設計書.html" }],
          [{ text: "B" }, { text: "無い文書", link: "missing.html" }],
        ] },
      ] }], fonts: [], attachments: [] });
      const linked = fmt.buildPortableHtml({ pages: [{ id: "D", title: "設計書の文書", blocks: [{ id: "d1", type: "paragraph", text: "リンク先の本文" }] }], fonts: [], attachments: [] });
      window.__desktopFiles.open = { path: "C:\\docs\\index.html", name: "index.html", contents: index };
      window.__desktopFiles[encodeURI("sub/設計書.html")] = { path: "C:\\docs\\sub\\設計書.html", name: "設計書.html", contents: linked };
    });
    await fresh.locator("#menu-file-button").click();
    await fresh.locator("#menu-open-document").click();
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "目次の文書", null, { timeout: 5000 }).catch(() => {});
    const ctrlClick = async (selector) => {
      const box = await fresh.locator(selector).first().boundingBox();
      await fresh.keyboard.down("Control");
      await fresh.mouse.click(box.x + 5, box.y + box.height / 2);
      await fresh.keyboard.up("Control");
      await fresh.waitForTimeout(500);
    };
    const title = () => fresh.evaluate(() => document.querySelector("#doc-title")?.textContent);
    const status = () => fresh.evaluate(() => document.querySelector("#status")?.textContent || "");

    // 1) 無い文書は知らせて、今の文書のまま
    await ctrlClick('#blocks .block[data-id="lt"] a.db-link[href="missing.html"]');
    // 知らせが出るまで待つ(決め打ちの待ちだけだと、全テストが重いときに間に合わないことがあった)
    await fresh.waitForFunction(() => (document.querySelector("#status")?.textContent || "").includes("missing.html"), null, { timeout: 5000 }).catch(() => {});
    result.desktopLinkMissingNotifies = (await status()).includes("missing.html") && (await title()) === "目次の文書";

    // 2) 保存していない変更があるときは確かめ、やめたら今の文書のまま
    await fresh.locator("#blocks .block-content").first().click().catch(() => {});
    await fresh.evaluate(() => { window.__confirmAnswer = false; });
    await fresh.locator('#blocks .block[data-id="lt"] [data-row="1"][data-cell="0"]').click();
    await fresh.keyboard.type("X");
    await fresh.keyboard.press("Escape").catch(() => {});
    await fresh.waitForTimeout(200);
    await ctrlClick('#blocks .block[data-id="lt"] a.db-link[href*="sub"]');
    const askedWhenDirty = await fresh.evaluate(() => window.__desktopCalls.some((call) => call.command === "confirm_discard"));
    result.desktopLinkAsksBeforeDiscarding = askedWhenDirty && (await title()) === "目次の文書";

    // 3) 確かめて OK なら、リンク先の文書を今の文書のフォルダから読んで入れ替える。次の Ctrl+S はリンク先へ
    await fresh.evaluate(() => { window.__confirmAnswer = true; window.__desktopCalls = []; });
    await ctrlClick('#blocks .block[data-id="lt"] a.db-link[href*="sub"]');
    // 外での書き換えの見張り(v245)も、同じコマンドで今の文書(index.html)を読み直すので、それは除いて数える。
    const readCall = await fresh.evaluate(() => window.__desktopCalls.find((call) => call.command === "read_linked_document" && call.args?.href !== encodeURIComponent("index.html"))?.args || null);
    const opened = await fresh.evaluate(() => ({
      title: document.querySelector("#doc-title")?.textContent,
      body: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent).join("|"),
    }));
    result.desktopLinkOpensLinkedDocument = readCall?.base === "C:\\docs\\index.html" && decodeURI(readCall?.href || "") === "sub/設計書.html"
      && opened.title === "設計書の文書" && opened.body.includes("リンク先の本文");
    await fresh.evaluate(() => { window.__desktopCalls = []; });
    await fresh.keyboard.press("Control+s");
    await fresh.waitForTimeout(500);
    const writeCall = await fresh.evaluate(() => window.__desktopCalls.find((call) => call.command === "write_document")?.args || null);
    result.desktopLinkSavesToLinkedDocument = writeCall?.path === "C:\\docs\\sub\\設計書.html";
    result.desktopLinkEvidence = { readCall, opened, writePath: writeCall?.path || null };
    return result;
  } finally {
    await fresh.close();
  }
}
