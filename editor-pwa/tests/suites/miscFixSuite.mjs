// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 操作とデータの不具合(v251。探索的なデバッグで見つけたもの。ユーザー指示「あなたの側で、順番に直していってほしい」) ----
// 1) Issue #102: 表の全画面で Ctrl+F を押すと見えない検索欄が開き、打った文字が表のセルに入った。
// 2) Issue #103: 子ページの中の「親へ戻るリンク」で Shift+Tab を押すと、親ページの中に親自身へのリンクができた。
// 3) Issue #106: 文字色のパレットを開いたまま Ctrl+F、File メニューを開いたまま Ctrl+K で、前のものが開いたまま重なった。
// 4) Issue #113: AI 用の写し(derived.values)が、数の見せ方を付けたセルで画面と違った(25.0% が 0.25)。
// 5) Issue #115: pages が空(blocks も無し)のファイルを開くと、段落にスクリプトや添付の中身が入った。
// 6) Issue #116: コードブロックのゼロ幅スペースが、編集すると消えた。
export default async function miscFixSuite({ browser }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
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
  const openHtml = async (html, title) => {
    const path = join(OUT, "misc-fix-" + (opened += 1) + ".html");
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    if (title) await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const openPages = async (pages) => openHtml(await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), { pages, fonts: [], attachments: [] }), pages[0].title);
  let saved = 0;
  const saveHtml = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "misc-fix-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return readFile(path, "utf8");
  };
  const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const cells = (rows) => rows.map((line) => line.map((text) => (typeof text === "object" ? { colSpan: 1, rowSpan: 1, ...text } : { text, colSpan: 1, rowSpan: 1 })));
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) #102 全画面で Ctrl+F
    await openPages([{ id: "P1", title: "Focus find", blocks: [{ id: "t", type: "table", rows: cells([["部品1", "x"], ["部品2", "y"]]) }] }]);
    await fresh.locator('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]').click();
    await fresh.locator('#table-toolbar [data-tool="focus"]').click();
    await fresh.waitForTimeout(250);
    const focusedBefore = await fresh.evaluate(() => document.body.classList.contains("table-focus"));
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("ねじ");
    await fresh.waitForTimeout(200);
    const find = await fresh.evaluate(() => ({
      focus: document.body.classList.contains("table-focus"),
      visible: Boolean(document.querySelector("#search-bar")?.offsetParent),
      value: document.querySelector("#search-input")?.value,
      cell: document.querySelector('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]')?.textContent,
    }));
    await fresh.keyboard.press("Escape");
    // 全画面が残っていたら閉じる(全画面では上のメニューが隠れていて、次の文書を開けない)。
    if (await fresh.locator(".table-focus-bar .table-focus-close").count()) await fresh.locator(".table-focus-bar .table-focus-close").click();
    await fresh.waitForTimeout(150);
    result.focusFindOpensVisibleSearch = focusedBefore && !find.focus && find.visible && find.value === "ねじ" && find.cell === "部品1";
    result.focusFindEvidence = JSON.stringify({ focusedBefore, ...find });

    // 2) #103 親へ戻るリンクで Shift+Tab
    await openPages([
      { id: "P1", title: "親", blocks: [{ id: "a1", type: "page", pageId: "P2" }, P("a2", "親の本文")] },
      { id: "P2", title: "子", blocks: [P("b0", "子の本文"), { id: "b1", type: "page", pageId: "P1" }] },
    ]);
    await fresh.evaluate(() => document.querySelector('#page-tree-body [data-page-id="P2"]').click());
    await fresh.waitForTimeout(400);
    await fresh.locator('#blocks .block[data-id="b1"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    if (await fresh.evaluate(() => !document.querySelector("#block-menu").hidden)) {
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(150);
    }
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(300);
    const nest = await fresh.evaluate(() => ({ status: document.querySelector("#status").textContent, tree: document.querySelector("#page-tree-body").innerText }));
    const parentHtml = await saveHtml();
    const parentDoc = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), parentHtml);
    const parentLinks = parentDoc.pages.find((page) => page.id === "P1").blocks.filter((block) => block.type === "page").map((block) => block.pageId);
    // (この文書は子の中に親へのリンクがあるので、ページ一覧には元から「親・子・親」と並ぶ。見るのは親の本文の中身。)
    result.pageLinkShiftTabNoSelfLink = !nest.status.includes("移しました") && JSON.stringify(parentLinks) === '["P2"]';
    result.pageLinkShiftTabEvidence = JSON.stringify({ ...nest, parentLinks });

    // 3) #106 開いたままのパレット・メニュー
    await openPages([{ id: "P1", title: "Popovers", blocks: [P("a", "本文の段落")] }]);
    await fresh.locator('#blocks .block-content[data-id="a"]').click();
    await fresh.locator("#format-color-trigger").click();
    await fresh.waitForTimeout(150);
    const colorOpen = await fresh.evaluate(() => !document.querySelector("#format-color-menu").hidden);
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(250);
    const colorAfterFind = await fresh.evaluate(() => !document.querySelector("#format-color-menu").hidden);
    await fresh.keyboard.press("Escape");
    await fresh.locator('#blocks .block-content[data-id="a"]').click();
    await fresh.locator("#menu-file-button").click();
    await fresh.waitForTimeout(150);
    const fileOpen = await fresh.evaluate(() => [...document.querySelectorAll("#menubar .menu-panel, .menu-panel")].some((panel) => !panel.hidden));
    await fresh.keyboard.press("Control+k");
    await fresh.waitForTimeout(250);
    const fileAfterPalette = await fresh.evaluate(() => [...document.querySelectorAll("#menubar .menu-panel, .menu-panel")].some((panel) => !panel.hidden));
    await fresh.keyboard.press("Escape");
    result.popoversCloseWhenFindOrPaletteOpens = colorOpen && !colorAfterFind && fileOpen && !fileAfterPalette;
    result.popoversEvidence = JSON.stringify({ colorOpen, colorAfterFind, fileOpen, fileAfterPalette });

    // 4) #113 AI 用の写しの値と数の見せ方
    await openPages([{ id: "P1", title: "Derived", blocks: [{ id: "t", type: "table", rows: cells([
      [{ text: "=1/4", numberFormat: { percent: true, decimals: 1 } }, { text: "1234567", numberFormat: { comma: true } }, { text: "=1+2", numberFormat: { decimals: 2 } }],
    ]) }] }]);
    const derivedHtml = await saveHtml();
    const derivedDoc = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), derivedHtml);
    const manifest = JSON.parse(derivedHtml.match(/id="document-manifest"[^>]*>\s*([\s\S]*?)\s*<\/script>/)[1]);
    const derivedValues = manifest.pages[0].blocks[0].derived?.values?.[0];
    result.derivedValuesMatchShownFormat = JSON.stringify(derivedValues) === JSON.stringify(["25.0%", "1,234,567", "3.00"])
      && derivedDoc.pages[0].blocks[0].rows[0][0].text === "=1/4";
    result.derivedValuesEvidence = JSON.stringify(derivedValues);

    // 5) #115 pages が空のファイル
    const emptyPages = (await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      pages: [{ id: "P1", title: "Empty", blocks: [{ id: "a", type: "paragraph", text: "本文の文字" }] }], fonts: [], attachments: [],
    }))).replace(/("pages":\s*)\[[\s\S]*?\]\s*(,\s*"fonts")/, (all, head, tail) => head + "[]" + tail);
    const parsedEmpty = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), emptyPages);
    const emptyText = parsedEmpty.pages[0].blocks.map((block) => block.text).join("|");
    result.emptyPagesFileHasNoScriptText = parsedEmpty.pages.length === 1 && !/function|SingleHtml|document-manifest|\{"/.test(emptyText) && emptyText.length < 2000;
    result.emptyPagesEvidence = JSON.stringify({ length: emptyText.length, head: emptyText.slice(0, 120), pagesReplaced: /"pages":\s*\[\]/.test(emptyPages) });

    // 6) #116 コードのゼロ幅スペース
    await openPages([{ id: "P1", title: "Zwsp", blocks: [{ id: "c", type: "code", text: "a​b" }, P("p", "x")] }]);
    await fresh.locator('#blocks .block-content[data-id="c"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("!");
    await fresh.waitForTimeout(150);
    const codeText = (await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), await saveHtml())).pages[0].blocks[0].text;
    result.codeKeepsZeroWidthSpace = codeText === "a​b!";
    result.codeZwspEvidence = JSON.stringify(codeText);

    result.miscFixNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.miscFixPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
