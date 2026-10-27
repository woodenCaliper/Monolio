// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の行の高さ(v238。形式 0.8.13) ----
// ユーザー指摘「行に対しては対応していないのか。列について言えることは、行についても言えるはず」。列の幅と対になる操作を
// 行にも: 境目のドラッグで高さ・ダブルクリックで中身に合わせる・↑↓キー・複数選んだ行の全部・右クリックの自動調整。保存・開き直しで残り、
// 保存HTMLも同じ高さ(P7)。行の挿入・削除・入れ替え・並べ替えで、高さは行についていく。Ctrl+Z 1回で戻る。
export default async function tableRowHeightSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1200, height: 860 });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const c = (text) => ({ text, colSpan: 1, rowSpan: 1 });
  let opened = 0;
  const openBlocks = async (blocks) => {
    const title = "RowHeight" + (opened += 1);
    const path = join(OUT, "table-row-height-" + opened + ".html");
    const literal = { pages: [{ id: "R" + opened, title, blocks }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    return path;
  };
  const cell = (r, k) => fresh.locator('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
  const heights = () => fresh.evaluate(() => [...document.querySelector('#blocks .block[data-id="t"] .editor-table').rows].map((tr) => Math.round(tr.getBoundingClientRect().height)));
  const firstCells = () => fresh.evaluate(() => [...document.querySelector('#blocks .block[data-id="t"] .editor-table').rows].map((tr) => tr.cells[0].textContent).join(","));
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
  };
  const drag = async (selector, dy) => {
    const box = await fresh.locator(selector).boundingBox();
    await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
  };
  let saved = 0;
  const saveAndRead = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "table-row-height-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return { path, html, doc: await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html) };
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) ふだんの画面: 行の番号の下の端のつまみをドラッグで高さ。保存・保存HTML・開き直しで残る。Ctrl+Z 1回で戻る。
    await openBlocks([{ id: "t", type: "table", rows: [["a1", "b1"], ["a2", "b2"], ["a3", "b3"], ["a4", "b4"]].map((line) => line.map(c)) }]);
    await cell(1, 0).click();
    await fresh.waitForTimeout(150);
    const before = await heights();
    await drag('#blocks .block[data-id="t"] .table-row-resizer[data-row="1"]', 40);
    const dragged = await heights();
    const first = await saveAndRead();
    const savedHeights = first.doc.pages[0].blocks[0].tableRowHeights;
    const view = await context.newPage();
    let viewHeights = [];
    try {
      await view.setViewportSize({ width: 1200, height: 860 });
      await view.goto("file:///" + first.path.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      viewHeights = await view.evaluate(() => [...document.querySelector("table.doc-table").rows].map((tr) => Math.round(tr.getBoundingClientRect().height)));
    } finally {
      await view.close();
    }
    await openBlocks([{ id: "t", type: "table", tableRowHeights: savedHeights, rows: [["a1", "b1"], ["a2", "b2"], ["a3", "b3"], ["a4", "b4"]].map((line) => line.map(c)) }]);
    const reopened = await heights();
    await cell(1, 0).click();
    await drag('#blocks .block[data-id="t"] .table-row-resizer[data-row="2"]', 30);
    const second = await heights();
    await undo();
    const undone = await heights();
    result.tableRowHeightDragAndSave = Math.abs(dragged[1] - before[1] - 40) <= 2 && dragged[0] === before[0] && dragged[2] === before[2]
      && Array.isArray(savedHeights) && savedHeights[1] === dragged[1] && !savedHeights[0] && first.html.includes('style="height:' + dragged[1] + 'px"')
      && Math.abs(viewHeights[1] - dragged[1]) <= 2 && reopened[1] === dragged[1];
    result.tableRowHeightUndoOneStep = Math.abs(second[2] - before[2] - 30) <= 2 && JSON.stringify(undone) === JSON.stringify(reopened);

    // 2) ダブルクリックで中身に合わせる(決めた高さを外す)。↑↓キーで 8px ずつ。
    await fresh.locator('#blocks .block[data-id="t"] .table-row-resizer[data-row="1"]').dblclick();
    await fresh.waitForTimeout(250);
    const fitted = await heights();
    const fittedModel = await saveAndRead();
    await cell(2, 0).click();
    await fresh.locator('#blocks .block[data-id="t"] .table-row-resizer[data-row="2"]').focus();
    // フォーカスが表のセルから離れたときの片付け(次の一巡で走る)を待ってから押す(片付けでつまみが消えないこと)。
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("ArrowDown");
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(200);
    const keyed = await heights();
    result.tableRowHeightAutoFitAndKeys = fitted[1] === before[1] && fittedModel.doc.pages[0].blocks[0].tableRowHeights === undefined
      && keyed[2] === before[2] + 16;

    // 3) 行の挿入・削除・並べ替えで、高さは行についていく。
    await openBlocks([{ id: "t", type: "table", tableHeader: true, tableRowHeights: [0, 0, 90, 0], rows: [["名", "点"], ["x", "3"], ["y", "1"], ["z", "2"]].map((line) => line.map(c)) }]);
    await cell(1, 0).click();
    await fresh.locator('#table-toolbar [data-tool="row-before"]').click();
    await fresh.waitForTimeout(250);
    const afterInsert = { heights: await heights(), names: await firstCells() };
    await undo();
    await cell(1, 1).click();
    await fresh.locator('#table-toolbar [data-tool="sort"]').click();
    await fresh.locator('.table-tool-menu [data-key="asc"]').click();
    await fresh.waitForTimeout(250);
    const afterSort = { heights: await heights(), names: await firstCells() };
    await undo();
    await cell(2, 0).click();
    await fresh.locator('#table-toolbar [data-tool="row-delete"]').click();
    await fresh.waitForTimeout(250);
    const afterDelete = { heights: await heights(), names: await firstCells() };
    await undo();
    const at = (state, name) => state.heights[state.names.split(",").indexOf(name)];
    result.tableRowHeightFollowsRows = at(afterInsert, "y") >= 89 && at(afterSort, "y") >= 89 && afterSort.names === "名,y,z,x"
      && at(afterSort, "x") < 60 && !afterDelete.names.includes("y") && afterDelete.heights.every((height) => height < 60);

    // 4) 全画面: 行の見出しの下の端で高さ。行を丸ごと複数選んでいれば全部同じ高さ、ダブルクリック・右クリックで全部を中身に合わせる。
    await openBlocks([{ id: "t", type: "table", rows: [["a1", "b1"], ["a2", "b2"], ["a3", "b3"], ["a4", "b4"]].map((line) => line.map(c)) }]);
    await cell(0, 0).click();
    await fresh.locator('#table-toolbar [data-tool="focus"]').click();
    await fresh.waitForTimeout(300);
    const base = await heights();
    await fresh.locator('.sheet-row-header[data-row="1"]').click();
    await fresh.locator('.sheet-row-header[data-row="2"]').click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(150);
    await drag('.sheet-row-resizer[data-row="1"]', 30);
    const multi = await heights();
    await fresh.locator('.sheet-row-resizer[data-row="2"]').dblclick();
    await fresh.waitForTimeout(250);
    const multiFit = await heights();
    await undo();
    await fresh.locator('.sheet-row-header[data-row="1"]').click({ button: "right" });
    await fresh.waitForTimeout(150);
    const menu = await fresh.evaluate(() => [...document.querySelectorAll(".table-tool-menu .menu-item")].map((node) => node.textContent).join(","));
    await fresh.locator('.table-tool-menu [data-key="autofit"]').click();
    await fresh.waitForTimeout(250);
    const menuFit = await heights();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    result.tableRowHeightSheetMulti = Math.abs(multi[1] - base[1] - 30) <= 2 && multi[2] === multi[1] && multi[0] === base[0] && multi[3] === base[3]
      && JSON.stringify(multiFit) === JSON.stringify(base) && menu.includes("行の高さを自動調整") && JSON.stringify(menuFit) === JSON.stringify(base);
    // 5) ドラッグしている最中も、番号・見出し・つまみが境目について動く(離してからではなく。ユーザー指摘「動かしている最中は上が連動しない」
    //    「行に対しても同じ考え」)。ふだんの画面と全画面、列の幅と行の高さの4通り。
    // 前の段の全画面を閉じておく(全画面では上のメニューが隠れていて、文書を開けない)。
    if (await fresh.locator(".table-focus-bar .table-focus-close").count()) await fresh.locator(".table-focus-bar .table-focus-close").click();
    await fresh.waitForTimeout(200);
    await openBlocks([{ id: "t", type: "table", rows: [["A", "B", "C", "D"], ["1", "2", "3", "4"], ["5", "6", "7", "8"]].map((line) => line.map(c)) }]);
    const live = () => fresh.evaluate(() => {
      const table = document.querySelector('#blocks .block[data-id="t"] .editor-table');
      const td = table.querySelector('[data-row="0"][data-cell="1"]').getBoundingClientRect();
      const tr = table.rows[1].getBoundingClientRect();
      const center = (node, axis) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return Math.round(axis === "x" ? box.left + box.width / 2 : box.top + box.height / 2);
      };
      const labels = [...document.querySelectorAll(".table-axis-label")];
      return {
        colEdge: Math.round(td.right), colMid: Math.round(td.left + td.width / 2), rowEdge: Math.round(tr.bottom), rowMid: Math.round(tr.top + tr.height / 2),
        colLabel: center(labels.find((node) => node.classList.contains("column") && node.textContent === "B"), "x"),
        rowLabel: center(labels.find((node) => node.classList.contains("row") && node.textContent === "2"), "y"),
        colGrip: center(document.querySelector('.table-col-resizer[data-col="1"], .sheet-col-resizer[data-col="1"]'), "x"),
        rowGrip: center(document.querySelector('.table-row-resizer[data-row="1"], .sheet-row-resizer[data-row="1"]'), "y"),
        colHead: document.querySelector('.sheet-col-header[data-col="1"]') ? Math.round(document.querySelector('.sheet-col-header[data-col="1"]').getBoundingClientRect().right) : null,
        rowHead: document.querySelector('.sheet-row-header[data-row="1"]') ? Math.round(document.querySelector('.sheet-row-header[data-row="1"]').getBoundingClientRect().bottom) : null,
      };
    });
    const during = async (selector, dx, dy) => {
      const box = await fresh.locator(selector).boundingBox();
      await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
      await fresh.waitForTimeout(150);
      const state = await live();
      await fresh.mouse.up();
      await fresh.waitForTimeout(200);
      return state;
    };
    const near = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 2;
    await cell(1, 1).click();
    const normalCol = await during('#blocks .block[data-id="t"] .table-col-resizer[data-col="1"]', 80, 0);
    await cell(1, 1).click();
    const normalRow = await during('#blocks .block[data-id="t"] .table-row-resizer[data-row="1"]', 0, 40);
    await fresh.locator('#table-toolbar [data-tool="focus"]').click();
    await fresh.waitForTimeout(300);
    const sheetCol = await during('.sheet-col-resizer[data-col="1"]', 60, 0);
    const sheetRow = await during('.sheet-row-resizer[data-row="1"]', 0, 30);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    result.tableResizeHandlesFollowDuringDrag = near(normalCol.colLabel, normalCol.colMid) && near(normalCol.colGrip, normalCol.colEdge)
      && near(normalRow.rowLabel, normalRow.rowMid) && near(normalRow.rowGrip, normalRow.rowEdge)
      && near(sheetCol.colHead, sheetCol.colEdge) && near(sheetCol.colGrip, sheetCol.colEdge)
      && near(sheetRow.rowHead, sheetRow.rowEdge) && near(sheetRow.rowGrip, sheetRow.rowEdge);
    result.tableResizeLiveEvidence = JSON.stringify({ normalCol, normalRow, sheetCol, sheetRow });
    result.tableRowHeightEvidence = JSON.stringify({ before, dragged, savedHeights, viewHeights, reopened, second, undone, fitted, keyed, afterInsert, afterSort, afterDelete, base, multi, multiFit, menu, menuFit });
    result.tableRowHeightNoPageErrors = pageErrors.length === 0;
    result.tableRowHeightPageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
