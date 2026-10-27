// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 貼り付け・置換・Markdown の目印の不具合(v250。探索的なデバッグで見つけたもの。ユーザー指示「あなたの側で、順番に直していってほしい」) ----
// 1) Issue #91: Web の表・スプレッドシートの1行を段落に貼ると、セルの区切りが消えて「123」になった。
// 2) Issue #96: 貼り付けで要らない書式が付く(アプリの見出し・コードの一部をコピー → 大きさ・背景)、Google ドキュメントの太字・斜体が
//    消えて元のページの書体・大きさ・色だけが付く、HTML のコメントの中身が文字になる。
// 3) Issue #95: 題名の欄に貼ると改行や書式がそのまま入った。
// 4) Issue #98: ブロックをコピーして表のセルに貼ると、ブロックの HTML がセルに入った。
// 5) Issue #97: 行末で Shift+Enter した段落を置換すると、見えない改行が1つ増えた。
// 6) Issue #99: すでに番号リストのブロックの頭で「数字. 」と打つと、もう一度変換されて文字が消えた。
export default async function pasteFixSuite({ browser }) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1200, height: 860 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  let opened = 0;
  const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const openDoc = async (blocks, title = "Paste" + (opened + 1)) => {
    const path = join(OUT, "paste-fix-" + (opened += 1) + ".html");
    const literal = { pages: [{ id: "P1", title, blocks }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  let saved = 0;
  const save = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "paste-fix-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), await readFile(path, "utf8"));
  };
  // ブロックの文字の [start, end) を選ぶ(end を省くとキャレット)。
  const select = async (id, start, end = null) => {
    await fresh.locator('#blocks .block-content[data-id="' + id + '"]').first().click();
    await fresh.evaluate(({ id, start, end }) => {
      const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
      editable.focus();
      const find = (offset) => {
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        let total = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (offset <= total + node.nodeValue.length) return [node, offset - total];
          total += node.nodeValue.length;
        }
        return [editable, editable.childNodes.length];
      };
      const range = document.createRange();
      range.setStart(...find(start));
      if (end === null) range.collapse(true);
      else range.setEnd(...find(end));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, { id, start, end });
    await fresh.waitForTimeout(60);
  };
  // 外から来たクリップボード(text/plain と text/html)を、本物の Ctrl+V で貼る(copy を差し替えて入れる)。
  const pasteData = async (data) => {
    await fresh.evaluate((value) => {
      window.addEventListener("copy", (event) => {
        Object.entries(value).forEach(([type, text]) => event.clipboardData.setData(type, text));
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { once: true, capture: true });
    }, data);
    await fresh.keyboard.press("Control+c");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(250);
  };
  const html = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block-content[data-id="' + blockId + '"]')?.innerHTML, id);
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) #91 タブを含む1行
    await openDoc([P("a", "hello world"), P("b", "end")]);
    await select("a", 5);
    await pasteData({ "text/plain": "1\t2\t3", "text/html": '<google-sheets-html-origin><table data-sheets-root="1"><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>' });
    const sheetRow = (await save()).pages[0].blocks[0].text;
    result.pasteTabbedRowKeepsTabs = sheetRow === "hello1\t2\t3 world";
    result.pasteTabbedRowEvidence = JSON.stringify(sheetRow);

    // 2) #96 アプリの中のコピー(見出し・コード・太字)と、外から来た書式
    await openDoc([{ id: "h", type: "heading1", text: "Heading" }, { id: "c", type: "code", text: "x = 1" }, P("bold", "**bo**ld", { html: "<b>bo</b>ld" }), P("size", "big", { html: '<span style="font-size: 24px;">big</span>' }), P("t", "target")]);
    const inApp = {};
    for (const [name, id, start, end] of [["heading", "h", 0, 5], ["code", "c", 0, 5], ["bold", "bold", 0, 4], ["size", "size", 0, 3]]) {
      await select(id, start, end);
      await fresh.keyboard.press("Control+c");
      await select("t", 6);
      await fresh.keyboard.press("End");
      await fresh.keyboard.press("Control+v");
      await fresh.waitForTimeout(250);
      inApp[name] = await html("t");
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(200);
    }
    // 文字の切り取りも同じ形でクリップボードへ。切り取りは Ctrl+Z 1回で戻る。
    await select("bold", 0, 2);
    await fresh.keyboard.press("Control+x");
    await fresh.waitForTimeout(200);
    const afterCut = await html("bold");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const cutUndone = await html("bold");
    result.inlineCutIsOneUndoStep = afterCut === "ld" && cutUndone === "<b>bo</b>ld";
    inApp.cut = { afterCut, cutUndone };
    result.pasteInAppCopyDropsContextStyle = inApp.heading === "targetHeadi" && inApp.code === "targetx = 1";
    result.pasteInAppCopyKeepsBold = /^target<b>bo<\/b>ld$/.test(inApp.bold);
    // 自分で付けた文字の大きさ(本文の書式)は、アプリの中のコピーならそのまま(外から来た大きさは落とす)。
    result.pasteInAppCopyKeepsUserSize = /^target<span style="font-size: 24px;">big<\/span>$/.test(inApp.size);
    await openDoc([P("a", "hello world")]);
    await select("a", 5);
    await pasteData({
      "text/plain": "Bold ital red",
      "text/html": '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:700;">Bold</span><span style="font-size:11pt;font-family:Arial;color:#000000;font-style:italic;"> ital</span><span style="font-size:11pt;color:#ff0000;"> red</span></b>',
    });
    const docsHtml = await html("a");
    await openDoc([P("a", "hello world")]);
    await select("a", 5);
    await pasteData({ "text/plain": "Word text", "text/html": "<html><body><!--StartFragment--><span>Word text</span><!--EndFragment--></body></html>" });
    const commentText = await fresh.locator('#blocks .block-content[data-id="a"]').textContent();
    result.pasteGoogleDocsKeepsBoldItalicColor = /<b>Bold<\/b>/.test(docsHtml) && /<i> ital<\/i>/.test(docsHtml) && /color: rgb\(255, 0, 0\)/.test(docsHtml)
      && !/Arial|11pt|font-size|font-family|rgb\(0, 0, 0\)/.test(docsHtml);
    result.pasteHtmlCommentIsDropped = commentText === "helloWord text world";
    result.pasteStyleEvidence = JSON.stringify({ inApp, docsHtml, commentText });

    // 3) #95 題名の欄
    await openDoc([P("a", "body")], "Ttl");
    const titleEnd = async () => {
      await fresh.locator("#doc-title").click();
      await fresh.keyboard.press("End");
    };
    await titleEnd();
    await pasteData({ "text/plain": "Line1\nLine2" });
    const titleLines = await fresh.locator("#doc-title").textContent();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const titleUndone = await fresh.locator("#doc-title").textContent();
    await titleEnd();
    await pasteData({ "text/plain": "Big red", "text/html": '<h1 style="color:red;font-size:60px">Big <i>red</i></h1>' });
    const titleRich = await fresh.evaluate(() => document.querySelector("#doc-title").innerHTML);
    const titleSaved = (await save()).pages[0].title;
    result.pasteIntoTitleIsOnePlainLine = titleLines === "TtlLine1 Line2" && titleUndone === "Ttl" && titleRich === "TtlBig red" && titleSaved === "TtlBig red";
    result.pasteTitleEvidence = JSON.stringify({ titleLines, titleUndone, titleRich, titleSaved });

    // 4) #98 ブロックのコピーを表のセルへ
    await openDoc([{ id: "t", type: "table", rows: [[{ text: "c1" }, { text: "c2" }]] }]);
    await fresh.locator('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]').click();
    await fresh.keyboard.press("End");
    await pasteData({ "text/plain": "Head\n", "text/html": '<div data-doc-editor-blocks="{}"><h3 style="color:red">Head</h3></div>' });
    const cellHtml = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]').innerHTML);
    const cellSaved = (await save()).pages[0].blocks[0].rows[0][0].text;
    result.pasteIntoCellIsPlainText = cellSaved === "c1Head" && !/<(div|h3)/i.test(cellHtml);
    result.pasteCellEvidence = JSON.stringify({ cellHtml, cellSaved });

    // 5) #97 Shift+Enter のある段落の置換
    await openDoc([P("a", ""), P("b", "other")]);
    await select("a", 0);
    await fresh.keyboard.type("line");
    await fresh.keyboard.press("Shift+Enter");
    await fresh.locator('#blocks .block-content[data-id="b"]').click();
    const beforeReplace = (await save()).pages[0].blocks[0].text;
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-input").fill("line");
    await fresh.locator("#search-replace-input").fill("LINE");
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(300);
    const afterReplace = (await save()).pages[0].blocks[0].text;
    await fresh.keyboard.press("Escape");
    result.replaceKeepsTrailingNewlineCount = beforeReplace === "line\n" && afterReplace === "LINE\n";
    result.replaceNewlineEvidence = JSON.stringify({ beforeReplace, afterReplace });

    // 6) #99 番号リストの中の「数字. 」
    await openDoc([P("a", "")]);
    await select("a", 0);
    await fresh.keyboard.type("2026. 10. 17 meeting");
    await fresh.waitForTimeout(200);
    const chain = (await save()).pages[0].blocks.map((block) => block.type + ":" + block.text).join(",");
    await openDoc([{ id: "n", type: "numbered", text: "item" }]);
    await select("n", 0);
    await fresh.keyboard.type("3. ");
    await fresh.waitForTimeout(200);
    const inList = (await save()).pages[0].blocks.map((block) => block.type + ":" + block.text).join(",");
    result.markdownShortcutSkipsSameType = chain === "numbered:10. 17 meeting" && inList === "numbered:3. item";
    result.markdownSameTypeEvidence = JSON.stringify({ chain, inList });

    result.pasteFixNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.pasteFixPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
