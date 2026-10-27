// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { insertBlock, PORT, FORMAT_VERSION } from "../lib.mjs";

// ---- 改ページ(v192) ----
// ユーザー原文「pdfにした時のページ区切りの機能が欲しい」。提案どおり「改ページ」ブロック(/pagebreak・/改ページ)。
// エディタでは点線と「改ページ」の文字で位置を見せ、印刷・PDF でそこから次の紙へ送る。保存HTMLの画面には何も出さない
// (ユーザー決定「出さない」)。保存形式は 0.8.4(古い版では空の段落に見え、種類は残る)。
export default async function pageBreakSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await fresh.locator("#blocks .block-content").nth(1).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("before break");
    // スラッシュメニューから入れると、改ページの下に段落ができ、そこへ続けて書ける。
    await insertBlock(fresh, "pagebreak");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("after break");
    const editor = await fresh.evaluate(() => {
      const row = document.querySelector("#blocks .block.type-pagebreak");
      const content = row?.querySelector(".block-content");
      const blocks = [...document.querySelectorAll("#blocks .block")];
      const at = blocks.indexOf(row);
      return {
        exists: Boolean(row),
        editable: content?.isContentEditable,
        label: row?.querySelector(".page-break-mark")?.textContent,
        prev: blocks[at - 1]?.querySelector(".block-content")?.textContent,
        next: blocks[at + 1]?.querySelector(".block-content")?.textContent,
      };
    });
    result.pageBreakInsertedFromSlash = editor.exists && editor.editable === false && editor.label === "改ページ"
      && editor.prev === "before break" && editor.next === "after break";

    // 保存HTML: 画面では何も出さない(高さ 0・文字なし)、印刷では次の紙へ(break-after: page)。
    const saved = await fresh.evaluate(() => {
      // 画面の並び(段落・改ページ・段落)を、保存HTMLの組み立て(buildPortableHtml)に渡す。
      const blocks = [...document.querySelectorAll("#blocks .block")].map((row, index) => ({
        id: "b" + index,
        type: row.classList.contains("type-pagebreak") ? "pagebreak" : "paragraph",
        text: row.classList.contains("type-pagebreak") ? "" : row.querySelector(".block-content")?.textContent || "",
      }));
      return window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "PB", title: "Page Break", blocks }], fonts: [], attachments: [] });
    });
    const view = await context.newPage();
    try {
      await view.setContent(saved, { waitUntil: "load" });
      const screen = await view.evaluate(() => {
        const mark = document.querySelector(".page-break");
        return { exists: Boolean(mark), height: mark?.getBoundingClientRect().height, text: mark?.textContent };
      });
      await view.emulateMedia({ media: "print" });
      const print = await view.evaluate(() => getComputedStyle(document.querySelector(".page-break")).breakAfter);
      result.pageBreakHiddenOnScreen = screen.exists && screen.height === 0 && screen.text === "";
      result.pageBreakBreaksWhenPrinted = print === "page";
    } finally {
      await view.close();
    }

    // 保存して開き直しても改ページのまま。形式の版数は 0.8.4 から(今は 0.8.6。v198 の図表の参照)。
    const roundTrip = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "PB", title: "Round", blocks: [
        { id: "a", type: "paragraph", text: "one" }, { id: "b", type: "pagebreak", text: "" }, { id: "c", type: "paragraph", text: "two" },
      ] }], fonts: [], attachments: [] });
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const manifest = JSON.parse(new DOMParser().parseFromString(html, "text/html").querySelector("#document-manifest").textContent);
      return { types: parsed.pages[0].blocks.map((block) => block.type).join(","), version: manifest.formatVersion };
    });
    result.pageBreakRoundTrips = roundTrip.types === "paragraph,pagebreak,paragraph" && roundTrip.version === FORMAT_VERSION;

    // 下の段落の先頭で Backspace を押すと、区切り線と同じく改ページを消せる。
    await fresh.locator("#blocks .block-content", { hasText: "after break" }).click();
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(150);
    result.pageBreakRemovedByBackspace = await fresh.evaluate(() => !document.querySelector("#blocks .block.type-pagebreak")
      && [...document.querySelectorAll("#blocks .block-content")].some((item) => item.textContent === "after break"));
    return result;
  } finally {
    await fresh.close();
  }
}
