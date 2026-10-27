// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FONT_FAMILY, FONT_FIXTURE, OUT, PORT, openMenu, pickFont } from "../lib.mjs";

// ---- ロック中のページと文書全体の操作 / 表の構造の変更とグラフ・結合(v213) ----
// (A) ページの削除・埋め込みフォントの削除は、ほかのページの本文も書き換える。ロック中のページを書き換えると安全網が
//     戻すので、ロックしたページに行き先の無いリンクや、中身の無いフォントの指定が残っていた。ロック中のページが
//     そのページ(フォント)を使っているときは、操作そのものを断って知らせる(部分的には変えない)。
// (B) 表の行・列の挿入削除に、その表を読むグラフのコードの範囲も追随する(P18)。Undo 1回で表とコードが一緒に戻る。
// (C) すでに結合したセルを含めて結合し直しても、文字が重ならない(覆われた位置の写しを数えない)。
// (D) 結合の先頭の行(列)を消しても、引き継いだセルが色などを保つ。
// (E) セルにキャレットがあるまま行・列を消しても、消えたセルの blur でエラーにならない。
export default async function lockTableFixSuite({ context }) {
  const fresh = await context.newPage();
  const dialogs = [];
  fresh.on("dialog", (dialog) => { dialogs.push(dialog.message()); dialog.accept(); });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  const result = {};
  const cells = (...values) => values.map((text) => ({ text, colSpan: 1, rowSpan: 1 }));
  let fileIndex = 0;

  const openLiteral = async (literal) => {
    const source = join(OUT, "lock-table-fix-" + (fileIndex += 1) + ".html");
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const save = async () => {
    await fresh.evaluate(() => document.activeElement?.blur?.());
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "lock-table-fix-saved-" + (fileIndex += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html);
  };
  const notice = () => fresh.evaluate(() => {
    const node = document.querySelector("#notice");
    return node && !node.hidden ? node.textContent : "";
  });
  const hideNotice = () => fresh.evaluate(() => { const node = document.querySelector("#notice"); if (node) node.hidden = true; });
  const gotoPage = async (title) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: title }).first().click();
    await fresh.waitForTimeout(300);
  };
  const pageMenuDelete = async (title) => {
    const row = fresh.locator("#page-tree-body .page-tree-row", { hasText: title }).first();
    await row.hover();
    await row.locator(".page-tree-more").click();
    await fresh.locator('#page-menu [data-action="delete-page"]').click();
    await fresh.waitForTimeout(300);
  };
  const cellSelector = (blockId, row, cell) => `#blocks .block[data-id="${blockId}"] .editor-table [data-row="${row}"][data-cell="${cell}"]`;
  const tool = async (blockId, name, row, cell) => {
    await fresh.evaluate((selector) => document.querySelector(selector)?.focus(), cellSelector(blockId, row, cell));
    await fresh.waitForTimeout(120);
    await fresh.locator(`#table-toolbar .table-tool[data-tool="${name}"]`).click();
    await fresh.waitForTimeout(260);
  };
  const grid = (blockId) => fresh.evaluate((id) => [...document.querySelectorAll(`#blocks .block[data-id="${id}"] .editor-table tr`)]
    .map((tr) => [...tr.querySelectorAll("td, th")].map((td) => td.textContent)), blockId);
  const drag = async (blockId, r0, c0, r1, c1) => {
    const a = await fresh.locator(cellSelector(blockId, r0, c0)).boundingBox();
    const b = await fresh.locator(cellSelector(blockId, r1, c1)).boundingBox();
    await fresh.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move((a.x + b.x) / 2 + b.width / 2, (a.y + b.y) / 2 + b.height / 2, { steps: 4 });
    await fresh.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
  };

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // ---- (A-1) ロック中のページがリンクしているページは削除しない ----
    await openLiteral({ title: "Root", fonts: [], attachments: [], pages: [
      { id: "P1", title: "Root", blocks: [{ id: "a", type: "paragraph", text: "root" }, { id: "l2", type: "page", pageId: "P2" }, { id: "l3", type: "page", pageId: "P3" }] },
      { id: "P2", title: "Locked", locked: true, blocks: [{ id: "b", type: "paragraph", text: "locked body" }, { id: "l3b", type: "page", pageId: "P3" }] },
      { id: "P3", title: "Target", blocks: [{ id: "c", type: "paragraph", text: "target" }] },
    ] });
    dialogs.length = 0;
    await hideNotice();
    await pageMenuDelete("Target");
    const refusedNotice = await notice();
    const directDelete = await fresh.evaluate(() => window.__docEditorPages.deletePage("P3"));
    const refusedModel = await save();
    const linksOf = (model, pageId) => model.pages.find((page) => page.id === pageId)?.blocks.filter((block) => block.type === "page").map((block) => block.pageId);
    result.deletePageLinkedFromLockedPageIsRefused = dialogs.length === 0
      && refusedNotice.includes("ロック中のページ「Locked」") && refusedNotice.includes("ロックを解除")
      && directDelete === false
      && refusedModel.pages.some((page) => page.id === "P3")
      && JSON.stringify(linksOf(refusedModel, "P1")) === JSON.stringify(["P2", "P3"])
      && JSON.stringify(linksOf(refusedModel, "P2")) === JSON.stringify(["P3"]);
    // ロックを解除すれば、両方のページのリンクごと削除できる(確認の件数も事実どおり)。
    // (断られずに消えていたら Target が無いので、ここは調べない。)
    result.deletePageAfterUnlockRemovesAllLinks = false;
    if (result.deletePageLinkedFromLockedPageIsRefused) {
      await gotoPage("Locked");
      await fresh.locator("#page-lock-toggle").click();
      await fresh.waitForTimeout(200);
      dialogs.length = 0;
      await pageMenuDelete("Target");
      const deletedModel = await save();
      result.deletePageAfterUnlockRemovesAllLinks = dialogs.some((text) => text.includes("2 箇所のリンク"))
        && !deletedModel.pages.some((page) => page.id === "P3")
        && JSON.stringify(linksOf(deletedModel, "P1")) === JSON.stringify(["P2"])
        && JSON.stringify(linksOf(deletedModel, "P2")) === JSON.stringify([]);
    }

    // ---- (A-2) ロック中のページで使っている埋め込みフォントは削除しない ----
    await openLiteral({ title: "Home", fonts: [], attachments: [], pages: [
      { id: "P1", title: "Home", blocks: [{ id: "a", type: "paragraph", text: "home" }, { id: "l2", type: "page", pageId: "P2" }] },
      { id: "P2", title: "Styled", blocks: [{ id: "b", type: "paragraph", text: "styled text" }] },
    ] });
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "files");
    await fresh.locator("#embed-font").click();
    await (await chooser).setFiles(FONT_FIXTURE);
    await fresh.waitForFunction((family) => [...document.fonts].some((face) => face.family === family), FONT_FAMILY, { timeout: 5000 }).catch(() => {});
    await fresh.keyboard.press("Escape");
    await gotoPage("Styled");
    await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="b"]');
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await pickFont(fresh, FONT_FAMILY);
    await fresh.waitForTimeout(200);
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(200);
    await gotoPage("Home");
    await hideNotice();
    await openMenu(fresh, "files");
    await fresh.locator(`#attachment-summary .attachment-remove[data-font-family="${FONT_FAMILY}"]`).click();
    await fresh.waitForTimeout(200);
    const fontNotice = await notice();
    const stillRegistered = await fresh.evaluate((family) => [...document.fonts].some((face) => face.family === family), FONT_FAMILY);
    await fresh.keyboard.press("Escape");
    const fontModel = await save();
    const styledHtml = fontModel.pages.find((page) => page.id === "P2")?.blocks[0]?.html || "";
    result.deleteFontUsedOnLockedPageIsRefused = fontNotice.includes("ロック中のページ「Styled」") && fontNotice.includes("フォント")
      && stillRegistered
      && fontModel.fonts.some((font) => font.family === FONT_FAMILY)
      && styledHtml.includes(FONT_FAMILY);

    // ---- (B) グラフの範囲が表の行・列の挿入削除に追随する ----
    const chartLiteral = { title: "Charts", fonts: [], attachments: [], pages: [{ id: "P1", title: "Charts", blocks: [
      { id: "t1", type: "table", text: "", tableHeader: true, rows: [cells("名前", "値", "合計"), cells("りんご", "10", "=SUM(B2:B4)"), cells("みかん", "20", ""), cells("ぶどう", "30", "")] },
      // 上にある表(t1)を読む。題名の中の範囲の形の文字は書き換えない。
      { id: "g1", type: "chart", text: 'bar(A2:A4, B2:B4, label="B2:B4")\ntitle("A2 の値")' },
      { id: "t2", type: "table", text: "", rows: [cells("x", "1"), cells("y", "2"), cells("z", "3")] },
      // table(1) で t1 を読む(t1 の変更に追随する)。
      { id: "g2", type: "chart", text: "table(1)\nplot(A2:A4, B2:B4)" },
      // 上にある表 t2 を読む(t1 の変更には追随しない)。
      { id: "g3", type: "chart", text: "bar(A1:A3, B1:B3)" },
    ] }] };
    await openLiteral(chartLiteral);
    const codes = async () => {
      const model = await save();
      const blocks = model.pages[0].blocks;
      const byId = (id) => blocks.find((block) => block.id === id);
      return { g1: byId("g1").text, g2: byId("g2").text, g3: byId("g3").text, formula: byId("t1").rows.map((row) => row[2].text).find((text) => text.startsWith("=")), rows: byId("t1").rows.length };
    };
    const original = await codes();
    await tool("t1", "row-before", 1, 0);
    const inserted = await codes();
    const insertedBars = await fresh.evaluate(() => document.querySelectorAll('.block[data-id="g1"] .chart-svg rect.chart-bar').length);
    result.chartRangesFollowRowInsert = inserted.g1 === 'bar(A3:A5, B3:B5, label="B2:B4")\ntitle("A2 の値")'
      && inserted.g2 === "table(1)\nplot(A3:A5, B3:B5)"
      && inserted.g3 === original.g3
      && inserted.formula === "=SUM(B3:B5)"
      && insertedBars === 3;
    // Undo 1回で、表とグラフのコードが一緒に戻る。
    await fresh.evaluate((selector) => document.querySelector(selector)?.focus(), cellSelector("t1", 0, 0));
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await codes();
    result.chartRangeFollowUndoesInOneStep = undone.g1 === original.g1 && undone.g2 === original.g2
      && undone.formula === "=SUM(B2:B4)" && undone.rows === 4;
    // 行の削除(範囲の先頭の行)は式と同じく範囲を縮め、列の挿入は列をずらす。
    await tool("t1", "row-delete", 1, 0);
    const rowDeleted = await codes();
    await tool("t1", "col-before", 1, 1);
    const colInserted = await codes();
    result.chartRangesFollowRowDeleteAndColumnInsert = rowDeleted.g1.startsWith("bar(A2:A3, B2:B3,")
      && rowDeleted.formula === undefined
      && colInserted.g1.startsWith("bar(A2:A3, C2:C3,") && colInserted.g2 === "table(1)\nplot(A2:A3, C2:C3)"
      && colInserted.g3 === original.g3;

    // ---- (C) 結合済みのセルを含めて結合し直しても、文字が重ならない ----
    await openLiteral({ title: "Merge", fonts: [], attachments: [], pages: [{ id: "P1", title: "Merge", blocks: [
      { id: "m1", type: "table", text: "", rows: [
        [{ text: "X", colSpan: 2, rowSpan: 1 }, { text: "", covered: true }, { text: "Y" }],
        cells("1", "2", "3"),
      ] },
      { id: "m2", type: "table", text: "", rows: [
        [{ text: "5", colSpan: 2, rowSpan: 1 }, { text: "", covered: true }, { text: "" }],
        cells("1", "2", "3"),
      ] },
    ] }] });
    await drag("m1", 0, 0, 0, 2);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(300);
    const m1 = await grid("m1");
    await drag("m2", 0, 0, 0, 2);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(300);
    const m2 = await grid("m2");
    result.remergeDoesNotDuplicateMergedText = JSON.stringify(m1[0]) === JSON.stringify(["X Y"])
      && JSON.stringify(m2[0]) === JSON.stringify(["5"]);

    // ---- (D) 結合の先頭の行・列を消しても、引き継いだセルの色が残る ----
    await openLiteral({ title: "Colors", fonts: [], attachments: [], pages: [{ id: "P1", title: "Colors", blocks: [
      { id: "c1", type: "table", text: "", rows: [
        [{ text: "M", rowSpan: 2, colSpan: 1, background: "#ffcc00", color: "#ff0000" }, { text: "a" }],
        [{ text: "", covered: true }, { text: "b" }],
        cells("c", "d"),
      ] },
      { id: "c2", type: "table", text: "", rows: [
        [{ text: "N", rowSpan: 2, colSpan: 2, background: "#00ccff" }, { text: "", covered: true }, { text: "p" }],
        [{ text: "", covered: true }, { text: "", covered: true }, { text: "q" }],
        cells("r", "s", "t"),
      ] },
    ] }] });
    await tool("c1", "row-delete", 0, 1);
    await tool("c2", "col-delete", 2, 0);
    const colorModel = await save();
    const c1 = colorModel.pages[0].blocks.find((block) => block.id === "c1").rows;
    const c2 = colorModel.pages[0].blocks.find((block) => block.id === "c2").rows;
    result.deletingFirstRowOrColumnOfMergeKeepsCellColor = c1[0][0].text === "M" && c1[0][0].background === "#ffcc00" && c1[0][0].color === "#ff0000"
      && c2[0][0].text === "N" && c2[0][0].background === "#00ccff" && c2[0][0].rowSpan === 2 && c2[0][0].colSpan === 1;

    // ---- (E) キャレットのあるセルの行・列を消しても、エラーにならない ----
    await openLiteral({ title: "Blur", fonts: [], attachments: [], pages: [{ id: "P1", title: "Blur", blocks: [
      { id: "e1", type: "table", text: "", rows: [cells("1", "2", "=A1+B1"), cells("3", "4", "=A2+B2"), cells("5", "6", "=SUM(A1:A3)")] },
    ] }] });
    pageErrors.length = 0;
    await tool("e1", "row-delete", 2, 0);
    await tool("e1", "col-delete", 0, 2);
    result.deletingFocusedRowOrColumnHasNoError = pageErrors.length === 0
      && JSON.stringify(await grid("e1")) === JSON.stringify([["1", "2"], ["3", "4"]]);
    if (!result.deletingFocusedRowOrColumnHasNoError) console.log("  lockTableFix pageErrors:", pageErrors.join(" / "));
    return result;
  } finally {
    await fresh.close();
  }
}
