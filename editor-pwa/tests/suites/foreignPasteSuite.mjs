// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- ほかのアプリでコピーしたブロックを、ブロックとして貼る(v265。Issue #141) ----
// ユーザー要望「Notion でブロックごとコピーしたら、Monolio でも同じようにブロックで再現できるように」。
// 以前は書式を落とした文字として、カーソルのある1つの段落の中へ改行つきで入っていた。
// Notion の見本(tests/fixtures/notion-clipboard.json)は、2026-10-23 に Notion(Web 版・Chrome)で実際にコピーした
// クリップボードの中身(text/plain・text/html・text/_notion-blocks-v3-production)。id とワークスペースの情報は置き換えた。
// 貼った直後の画面(メモリ上)と、保存して開き直した中身の両方で見る(開くときの無害化で不具合が隠れないように)。
export default async function foreignPasteSuite({ context }) {
  const fixture = JSON.parse(await readFile(fileURLToPath(new URL("../fixtures/notion-clipboard.json", import.meta.url)), "utf8"));
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const saveAndParse = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, name);
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return { html, parsed: await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html) };
  };
  // 文書を1つの段落だけにして、そこへ貼る(クリップボードの中身は種類ごとに渡す)。
  const pasteInto = async (selector, items) => {
    await fresh.locator(selector).first().click();
    await fresh.evaluate(({ selector: target, items: data }) => {
      const transfer = new DataTransfer();
      Object.entries(data).forEach(([type, value]) => transfer.setData(type, value));
      document.querySelector(target).dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, { selector, items });
    await fresh.waitForTimeout(400);
  };
  // 画面の並び(種類・字下げ・文字)。
  const screenBlocks = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks > .block, #blocks .block")]
    .filter((row, index, all) => all.indexOf(row) === index)
    .map((row) => ({ type: row.dataset.type || row.querySelector(".block-content")?.dataset.type || "", text: (row.querySelector(".block-content")?.textContent || "").trim() })));
  const shape = (blocks) => blocks.map((block) => block.type + ":" + (block.indent || 0));
  const notionItems = {
    "text/plain": fixture["text/plain"],
    "text/html": fixture["text/html"],
    "text/_notion-blocks-v3-production": fixture["text/_notion-blocks-v3-production"],
  };
  const emptyDoc = (title, blocks = [{ id: "e1", type: "paragraph", text: "" }]) => ({ pages: [{ id: "P", title, blocks }], fonts: [], attachments: [] });
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) Notion の形: 種類・入れ子・チェック・コード・表・数式・トグル・色が、ブロックとして入る(空の段落は置き換わる)
    await openLiteral(emptyDoc("Notion貼り付け"), "foreign-notion.html");
    await pasteInto('#blocks .block-content[data-id="e1"]', notionItems);
    const onScreen = await screenBlocks();
    const { parsed, html: savedHtml } = await saveAndParse("foreign-notion-saved.html");
    const blocks = parsed.pages[0].blocks;
    const expectedShape = [
      "heading1:0", "paragraph:0", "heading2:0",
      "bullet:0", "bullet:0", "bullet:1", "bullet:2", "bullet:0",
      "numbered:0", "numbered:0", "numbered:1", "numbered:0",
      "todo:0", "todo:0", "heading3:0", "quote:0", "divider:0", "code:0", "table:0", "math:0", "paragraph:0",
      "toggle:0", "paragraph:1", "bullet:1",
      // v283(#161): Notion の呼び出しは呼び出しのブロック(中身の箇条書きは1段下)。以前は箇条書きの頭に 💡 を付けていた。
      "callout:0", "bullet:1", "paragraph:0", "paragraph:0", "toggleHeading2:0", "paragraph:1",
    ];
    const byText = (needle) => blocks.find((block) => String(block.text || "").includes(needle));
    const table = blocks.find((block) => block.type === "table");
    const todos = blocks.filter((block) => block.type === "todo");
    const inlineParagraph = byText("ふつうの段落");
    result.notionPasteKeepsBlockShape = JSON.stringify(shape(blocks)) === JSON.stringify(expectedShape);
    result.notionPasteShowsBlocksOnScreen = onScreen.length === expectedShape.length && onScreen.some((row) => row.text === "さらに入れ子");
    result.notionPasteKeepsTodoCheck = todos.length === 2 && todos[0].checked !== true && todos[1].checked === true && todos[1].text === "済んだ ToDo";
    result.notionPasteKeepsCodeAndMath = blocks.find((block) => block.type === "code")?.text === "def hello(name):\n    return 'hello ' + name"
      && blocks.find((block) => block.type === "math")?.text === "E = mc^2";
    result.notionPasteKeepsTable = table?.tableHeader === true
      && JSON.stringify(table.rows.map((row) => row.map((cell) => cell.text))) === JSON.stringify([["名前", "数量", "単価"], ["りんご", "3", "120"], ["みかん", "5", "80"]]);
    result.notionPasteKeepsInlineFormat = /<b>太字<\/b>/.test(inlineParagraph?.html || "") && /<i>斜体<\/i>/.test(inlineParagraph?.html || "")
      && /<s>取り消し<\/s>/.test(inlineParagraph?.html || "") && /inline-code/.test(inlineParagraph?.html || "")
      && /href="https:\/\/example\.com\/"/.test(inlineParagraph?.html || "");
    result.notionPasteKeepsInlineMath = /data-tex="a\^2\+b\^2=c\^2"/.test(byText("最後の段落")?.html || "");
    // v283(#162): Notion のブロックの色はブロックの色(color)。文中の一部の色は今までどおり文中の色。
    result.notionPasteKeepsColors = byText("赤いブロックの文")?.color === "red"
      && /color:\s*rgb\(193, 63, 47\)/.test(byText("ここだけ色つき")?.html || "");
    result.notionPasteCalloutKeepsIcon = blocks.some((block) => block.type === "callout" && block.icon === "💡") && Boolean(byText("呼び出し"));
    result.notionPasteEvidence = { shape: shape(blocks), screen: onScreen.length };

    // 2) Ctrl+Z 1回で貼る前(空の段落1つ)に戻る
    await fresh.locator("body").click({ position: { x: 5, y: 400 } }).catch(() => {});
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.notionPasteUndoesInOneStep = (await fresh.evaluate(() => document.querySelectorAll("#blocks .block").length)) === 1;

    // 3) Notion の HTML だけ(Notion の形が無い)でも、見出し・リスト・ToDo(「[ ] 」の印)・表・コード・引用・区切り線になる
    await openLiteral(emptyDoc("NotionHTMLだけ"), "foreign-notion-html.html");
    await pasteInto('#blocks .block-content[data-id="e1"]', { "text/plain": fixture["text/plain"], "text/html": fixture["text/html"] });
    const htmlOnly = (await saveAndParse("foreign-notion-html-saved.html")).parsed.pages[0].blocks;
    const htmlTodos = htmlOnly.filter((block) => block.type === "todo");
    result.htmlPasteMakesBlocks = ["heading1", "heading2", "heading3", "bullet", "numbered", "quote", "divider", "code", "table"].every((type) => htmlOnly.some((block) => block.type === type))
      && htmlOnly.some((block) => block.type === "bullet" && block.indent === 2 && block.text === "さらに入れ子");
    result.htmlPasteReadsTodoMarks = htmlTodos.length === 2 && htmlTodos[0].text === "まだの ToDo" && htmlTodos[0].checked !== true && htmlTodos[1].checked === true;
    // Notion の HTML のトグル(<li><p>見出し</p><p>中身</p><ul>…</ul></li>)は、2つ目からの段落が子になる。「$$…$$」だけの段落は数式
    const toggleAt = htmlOnly.findIndex((block) => block.text === "トグルの見出し");
    result.htmlPasteSplitsItemParagraphs = toggleAt >= 0 && htmlOnly[toggleAt + 1]?.text === "トグルの中の段落" && htmlOnly[toggleAt + 1]?.indent === 1
      && htmlOnly[toggleAt + 2]?.type === "bullet" && htmlOnly[toggleAt + 2]?.indent === 1;
    result.htmlPasteReadsMathParagraph = htmlOnly.some((block) => block.type === "math" && block.text === "E = mc^2");
    result.htmlPasteEvidence = shape(htmlOnly).join(",");

    // 4) ほかのアプリの HTML(ブラウザのページ・Google ドキュメントなど): 行ごとの div は別の段落、details はトグル、
    //    チェックボックスの項目は ToDo、全体を包む <b>(Google ドキュメント)は中を塊として読む
    await openLiteral(emptyDoc("ほかのHTML"), "foreign-web.html");
    await pasteInto('#blocks .block-content[data-id="e1"]', {
      "text/plain": "章の題\n1行目の太字\n2行目",
      "text/html": '<b id="docs-internal-guid-1" style="font-weight:normal"><h2>章の題</h2><div>1行目の<strong>太字</strong></div><div>2行目</div>'
        + '<ul><li><input type="checkbox" checked> 済み</li><li>ふつう<ol><li>入れ子の番号</li></ol></li></ul>'
        + '<details><summary>開閉</summary><p>中身</p></details><figure><img src="data:," alt="図1"></figure><table><tr><td>a</td><td>b</td></tr></table></b>',
    });
    const web = (await saveAndParse("foreign-web-saved.html")).parsed.pages[0].blocks;
    result.webHtmlPasteMakesBlocks = JSON.stringify(shape(web)) === JSON.stringify(["heading2:0", "paragraph:0", "paragraph:0", "todo:0", "bullet:0", "numbered:1", "toggle:0", "paragraph:1", "paragraph:0", "table:0"])
      && web[3].checked === true && web[3].text === "済み" && /<b>太字<\/b>/.test(web[1].html || "") && web[7].text === "中身";
    // 1つの塊として置かれた画像は、黙って消さずに貼れなかったことを書く
    result.webHtmlPasteNotesImage = web[8]?.text === "(画像は貼り付けられませんでした: 図1)";
    result.webHtmlPasteEvidence = shape(web);

    // 5) 塊の無い書式つきの1行がカーソルの位置へ文字として入ること(ブロックは増えない)は、htmlPasteSuite の
    //    htmlPasteOneLineStaysInline(書式なしの文字が1行なら HTML の中身によらず文の中へ。同じ入口の同じ判定)。

    // 5b) 表計算の2行以上の範囲は、段落へ貼ると表のブロックになる(1行はこれまでどおり文字。pasteFixSuite の pasteTabbedRowKeepsTabs)
    await openLiteral(emptyDoc("表計算"), "foreign-sheet.html");
    await pasteInto('#blocks .block-content[data-id="e1"]', {
      "text/plain": "品名\t数\nりんご\t3\n",
      "text/html": '<google-sheets-html-origin><table data-sheets-root="1"><tbody><tr><td>品名</td><td>数</td></tr><tr><td>りんご</td><td>3</td></tr></tbody></table>',
    });
    const sheet = (await saveAndParse("foreign-sheet-saved.html")).parsed.pages[0].blocks;
    result.sheetRowsBecomeTable = sheet.length === 1 && sheet[0].type === "table"
      && JSON.stringify(sheet[0].rows.map((row) => row.map((cell) => cell.text))) === JSON.stringify([["品名", "数"], ["りんご", "3"]]);

    // 6) コードのブロックの中へ文字として入ることは、htmlPasteSuite の htmlPasteIntoCodeAndCellStaysText
    //    (コードの判定は onForeignBlocksPaste の中で Notion の形・HTML のどちらを読むより先)。

    // 6b) キャレットが無くブロックを選んでいるときも、選んだブロックの後ろへブロックとして貼る(アプリの中のブロックの貼り付けと同じ)
    await openLiteral(emptyDoc("選んで貼る", [{ id: "k1", type: "paragraph", text: "選ぶ段落" }, { id: "k2", type: "paragraph", text: "最後" }]), "foreign-selected.html");
    await fresh.locator('#blocks .block[data-id="k1"] .drag-grip').click();
    await fresh.waitForTimeout(150);
    const selectedBefore = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id).join(","));
    await fresh.evaluate((data) => {
      const transfer = new DataTransfer();
      Object.entries(data).forEach(([type, value]) => transfer.setData(type, value));
      // ハンドルを押すとメニュー(絞り込み欄)が開く。その欄で Ctrl+V したのと同じに、欄へ送る(開いていなければ今の焦点へ)。
      const menuField = document.querySelector("#block-menu:not([hidden]) input");
      window.__pasteTarget = menuField ? "menu" : document.activeElement?.className || "";
      (menuField || document.activeElement || document.body).dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, notionItems);
    await fresh.waitForTimeout(400);
    const selectedPaste = (await saveAndParse("foreign-selected-saved.html")).parsed.pages[0].blocks;
    result.notionPasteAfterSelectedBlock = selectedBefore === "k1" && selectedPaste[0]?.text === "選ぶ段落" && selectedPaste[1]?.type === "heading1"
      && selectedPaste[selectedPaste.length - 1]?.text === "最後" && selectedPaste.length === expectedShape.length + 2;
    result.notionPasteAfterSelectedEvidence = selectedBefore + " / " + selectedPaste.length + " / " + await fresh.evaluate(() => window.__pasteTarget);

    // 7) 外から来た値は信用しない: javascript: のリンク・イベント属性・script は残らない(保存したファイルそのもので見る)
    await openLiteral(emptyDoc("細工"), "foreign-hostile.html");
    const hostile = JSON.stringify({ blocks: [{ blockId: "h1", blockSubtree: { __version__: 3, block: {
      h1: { value: { id: "h1", type: "text", alive: true, properties: { title: [["押す", [["a", "javascript:window.__foreignXss=1"]]], ["<img src=x onerror=window.__foreignXss=2>"]] } } },
    } } }, { blockId: "h2", blockSubtree: { __version__: 3, block: {
      h2: { value: { id: "h2", type: "bulleted_list", alive: true, properties: { title: [["色", [["h", "red\" onmouseover=\"window.__foreignXss=3"]]]] } } },
    } } }] });
    await pasteInto('#blocks .block-content[data-id="e1"]', { "text/plain": "x", "text/_notion-blocks-v3-production": hostile });
    const hostileSaved = await saveAndParse("foreign-hostile-saved.html");
    await pasteInto("#blocks .block-content", { "text/plain": "題\nリンク\n項目", "text/html": '<h2 onclick="window.__foreignXss=4">題</h2><p><a href="javascript:window.__foreignXss=5">リンク</a><img src=x onerror="window.__foreignXss=6"></p><ul><li>項目</li></ul>' });
    const hostileSaved2 = await saveAndParse("foreign-hostile-saved2.html");
    // 保存したファイルの要素に、イベント属性・javascript: の行き先・外の画像が無いこと(文字として残るのはよい)。
    const dangerous = (html) => fresh.evaluate((text) => {
      const parsedDoc = new DOMParser().parseFromString(text, "text/html");
      return [...parsedDoc.querySelectorAll("body *")].filter((node) => node.nodeName !== "SCRIPT").flatMap((node) => [...node.attributes]
        .filter((attr) => /^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value) || (node.nodeName === "IMG" && attr.name === "src" && attr.value === "x"))
        .map((attr) => node.nodeName + " " + attr.name + "=" + attr.value));
    }, html);
    const found = [...await dangerous(hostileSaved.html), ...await dangerous(hostileSaved2.html)];
    result.foreignPasteEvidence = found.join(" | ");
    result.foreignPasteIsSanitized = found.length === 0
      && (await fresh.evaluate(() => window.__foreignXss === undefined))
      && hostileSaved.parsed.pages[0].blocks.some((block) => block.text === "押す<img src=x onerror=window.__foreignXss=2>");
    return result;
  } finally {
    await fresh.close();
  }
}
