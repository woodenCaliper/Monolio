// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 外から貼った HTML をブロックに分ける(v263。Issue #141) ----
// ブラウザのページ・Google ドキュメント・Notion などからまとめてコピーして貼ると、以前は書式を落とした文字が1つのブロックの中に
// 改行つきで入った(見出し・リスト・表・コードの区切りと種類が消えた)。いまは見出し・段落・箇条書き・番号付き・ToDo・引用・コード・
// 表・区切り線・トグル(<details>)をそれぞれのブロックにし、入れ子のリストとトグルの中身は字下げにする。貼る位置・字下げ・Undo は
// アプリの中のブロックの貼り付けと同じ。1つの段落・文の一部・1行の表(スプレッドシートの1行)・書式なしの文字が1行のものは、
// 今までどおり文の中へ入れる。
export default async function htmlPasteSuite({ browser }) {
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
  let saved = 0;
  const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const openDoc = async (blocks) => {
    const title = "HtmlPaste" + (opened + 1);
    const path = join(OUT, "html-paste-" + (opened += 1) + ".html");
    const literal = { pages: [{ id: "P1", title, blocks }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  // 保存した文書のブロックを「種類@字下げ 中身」の列にする(ToDo は [x]/[ ]、トグルは (open)/(closed)、表はセルの文字)
  const model = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "html-paste-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text).pages[0].blocks.map((b) => b.type + "@" + (b.indent || 0)
      + (b.checked !== undefined ? (b.checked ? "[x]" : "[ ]") : "") + (b.open !== undefined ? (b.open ? "(open)" : "(closed)") : "")
      + " " + (b.type === "table" ? JSON.stringify(b.rows.map((r) => r.map((c) => c.text))) : (b.html || b.text || ""))), await readFile(path, "utf8"));
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
    await fresh.waitForTimeout(300);
  };
  const caretAtEnd = async (selector) => {
    await fresh.locator(selector).first().click();
    await fresh.keyboard.press("End");
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const base = () => [P("a", "before"), P("b", ""), P("z", "after")];
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 見出し・段落(書式とリンク)・入れ子の箇条書き・番号付き。空の段落は置き換わる
    await openDoc(base());
    await caretAtEnd('#blocks .block-content[data-id="b"]');
    await pasteData({ "text/plain": "x\ny", "text/html": '<h1>Big</h1><p>Body <b>bold</b> <a href="https://example.com/">link</a></p><ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><ol><li>first</li><li>second</li></ol>' });
    const splits = await model();
    result.htmlPasteSplitsBlocks = same(splits, ["paragraph@0 before", "heading1@0 Big", 'paragraph@0 Body <b>bold</b> <a href="https://example.com/">link</a>',
      "bullet@0 one", "bullet@1 nested", "bullet@0 two", "numbered@0 first", "numbered@0 second", "paragraph@0 after"]);
    result.htmlPasteSplitsEvidence = splits;
    // Ctrl+Z 1回で貼る前へ
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const undone = await model();
    result.htmlPasteUndoIsOneStep = same(undone, ["paragraph@0 before", "paragraph@0 ", "paragraph@0 after"]);
    result.htmlPasteUndoEvidence = undone;

    // 2) ToDo(チェックの有無)・引用・コード・区切り線・表(見出しの行。結合は空のマスに)
    await openDoc(base());
    await caretAtEnd('#blocks .block-content[data-id="b"]');
    await pasteData({ "text/plain": "x\ny", "text/html": '<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul><blockquote>quoted</blockquote><pre><code>let a = 1;\nlet b = 2;\n</code></pre><hr><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td colspan="2">merged</td></tr></tbody></table>' });
    const kinds = await model();
    result.htmlPasteTodoQuoteCodeTable = same(kinds, ["paragraph@0 before", "todo@0[x] done", "todo@0[ ] todo", "paragraph@0 quoted".replace("paragraph", "quote"),
      "code@0 let a = 1;\nlet b = 2;", "divider@0 ", 'table@0 [["Name","Value"],["A","1"],["merged",""]]', "paragraph@0 after"]);
    result.htmlPasteTodoQuoteCodeTableEvidence = kinds;

    // 3) トグル(<details>): 題名と開閉、中身は1段深く
    await openDoc(base());
    await caretAtEnd('#blocks .block-content[data-id="b"]');
    await pasteData({ "text/plain": "x\ny", "text/html": "<details><summary>Toggle</summary><p>inside</p><ul><li>item</li></ul></details><p>outside</p>" });
    const toggle = await model();
    result.htmlPasteToggleCarriesChildren = same(toggle, ["paragraph@0 before", "toggle@0(closed) Toggle", "paragraph@1 inside", "bullet@1 item", "paragraph@0 outside", "paragraph@0 after"]);
    result.htmlPasteToggleEvidence = toggle;

    // 4) Google ドキュメントの複数の段落(全体が <b id="docs-internal-guid…"> に包まれる。書体・大きさは落とす)
    await openDoc(base());
    await caretAtEnd('#blocks .block-content[data-id="b"]');
    await pasteData({ "text/plain": "x\ny", "text/html": '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h2 dir="ltr"><span style="font-size:16pt;font-family:Arial;">Head</span></h2><p dir="ltr"><span style="font-weight:700;">Thick</span><span style="font-family:Arial;"> plain</span></p><ul><li dir="ltr"><p dir="ltr"><span>item</span></p></li></ul></b>' });
    const docs = await model();
    result.htmlPasteGoogleDocsParagraphs = same(docs, ["paragraph@0 before", "heading2@0 Head", "paragraph@0 <b>Thick</b> plain", "bullet@0 item", "paragraph@0 after"]);
    result.htmlPasteGoogleDocsEvidence = docs;

    // 5) 1行(書式つきの文・1つの段落・スプレッドシートの1行)は、今までどおり文の中へ
    await openDoc([P("a", "hello"), P("c", "cell")]);
    await caretAtEnd('#blocks .block-content[data-id="a"]');
    await pasteData({ "text/plain": "Bold", "text/html": '<b style="font-weight:normal;" id="docs-internal-guid-2"><span style="font-weight:700;">Bold</span></b>' });
    await caretAtEnd('#blocks .block-content[data-id="c"]');
    await pasteData({ "text/plain": "one", "text/html": "<p>one</p>" });
    await caretAtEnd('#blocks .block-content[data-id="c"]');
    await pasteData({ "text/plain": "1\t2", "text/html": '<google-sheets-html-origin><table data-sheets-root="1"><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' });
    // 書式なしの文字が1行なら、見出しとリンクのような2つに分けられる HTML でも文の中へ(v213・v250 の決まり)
    await caretAtEnd('#blocks .block-content[data-id="c"]');
    await pasteData({ "text/plain": "T l", "text/html": '<h1>T</h1><a href="https://x.example/">l</a>' });
    const inline = await model();
    result.htmlPasteOneLineStaysInline = same(inline, ["paragraph@0 hello<b>Bold</b>", 'paragraph@0 cellone1\t2T<a href="https://x.example/">l</a>']);
    result.htmlPasteOneLineEvidence = inline;

    // 6) コードの中・表のセルの中は、今までどおり文字だけ
    await openDoc([{ id: "code", type: "code", text: "x" }, { id: "t", type: "table", tableHeader: false, rows: [[{ text: "c" }, { text: "d" }]] }]);
    await caretAtEnd('#blocks .block-content[data-id="code"]');
    await pasteData({ "text/plain": "\nplain", "text/html": "<h1>H</h1><p>plain</p>" });
    await fresh.locator('#blocks .editor-table [data-row="0"][data-cell="0"]').click();
    await fresh.keyboard.press("End");
    await pasteData({ "text/plain": "text", "text/html": "<h1>H</h1><p>text</p>" });
    // Esc はセルの編集を取り消すので、ほかを押して確定する
    await fresh.locator('#blocks .block-content[data-id="code"]').click();
    const plainPlaces = await model();
    result.htmlPasteIntoCodeAndCellStaysText = same(plainPlaces, ["code@0 x\nplain", 'table@0 [["ctext","d"]]']);
    result.htmlPasteIntoCodeAndCellEvidence = plainPlaces;

    // 7) 危ないリンク・スクリプトは持ち込まない
    await openDoc(base());
    await caretAtEnd('#blocks .block-content[data-id="b"]');
    await pasteData({ "text/plain": "x\ny", "text/html": '<p><a href="javascript:alert(1)">bad</a> and <a href="https://ok.example/">good</a></p><script>window.__pwned = 1</script><p onclick="window.__pwned = 2">second</p>' });
    const safe = await model();
    const pwned = await fresh.evaluate(() => window.__pwned || 0);
    result.htmlPasteDropsUnsafe = same(safe, ["paragraph@0 before", 'paragraph@0 bad and <a href="https://ok.example/">good</a>', "paragraph@0 second", "paragraph@0 after"]) && pwned === 0;
    result.htmlPasteDropsUnsafeEvidence = { safe, pwned };

    // 8) トグルの中(字下げ 1)へ貼ると、貼ったブロックはその深さから(入れ子はさらに1段)
    await openDoc([{ id: "tg", type: "toggle", text: "T", open: true }, P("in", "in", { indent: 1 }), P("z", "after")]);
    await caretAtEnd('#blocks .block-content[data-id="in"]');
    await pasteData({ "text/plain": "x\ny", "text/html": "<h3>Sub</h3><ul><li>p<ul><li>q</li></ul></li></ul>" });
    const nested = await model();
    result.htmlPasteKeepsTargetIndent = same(nested, ["toggle@0(open) T", "paragraph@1 in", "heading3@1 Sub", "bullet@1 p", "bullet@2 q", "paragraph@0 after"]);
    result.htmlPasteKeepsTargetIndentEvidence = nested;

    result.htmlPasteNoPageErrors = pageErrors.length === 0;
    result.htmlPastePageErrorsEvidence = { errors: pageErrors };
  } finally {
    await context.close();
  }
  return result;
}
