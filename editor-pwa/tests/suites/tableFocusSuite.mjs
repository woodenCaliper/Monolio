// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の全画面の編集(v238) ----
// ユーザー指示「表を何か操作したら、もっと画面全体を使って操作できるモード」「今だと表の幅も制限されていて、編集などがしにくい」。
// 案「全画面で開く」: 表の道具の帯の「全画面」で、表だけを画面の幅いっぱいで編集する。ほかのもの(目次・上のツールバー・題名・
// ほかのブロック)は隠す。Esc(取り消す編集が無いとき)か「閉じる」で戻り、スクロールの位置も戻る。保存する文書には何も残さない。
export default async function tableFocusSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const head = ["品番", "名前", "区分", "数量", "単価", "金額"];
  const rows = [head.map((text) => ({ text, colSpan: 1, rowSpan: 1 }))];
  for (let i = 1; i <= 12; i += 1) {
    rows.push(["P-" + (100 + i), "部品" + i, i % 2 ? "A" : "B", String(i * 3), String(120 * i), "=D" + (i + 1) + "*E" + (i + 1)].map((text) => ({ text, colSpan: 1, rowSpan: 1 })));
  }
  const filler = Array.from({ length: 14 }, (_, i) => ({ id: "f" + i, type: "paragraph", text: "前の段落 " + (i + 1) }));
  const literal = { pages: [{ id: "F", title: "全画面", blocks: [
    ...filler,
    { id: "t", type: "table", tableHeader: true, caption: "部品の一覧", rows },
    { id: "after", type: "paragraph", text: "後の段落" },
    { id: "sub", type: "page", pageId: "F2" },
    // 最後が区切り線だと、余白を押したときに「最後のブロックの後ろへ段落を足す」が働く(全画面では隠れたまま足されてしまう)。
    { id: "end", type: "divider" },
  ] }, { id: "F2", title: "別のページ", blocks: [{ id: "q", type: "paragraph", text: "別のページ" }] }], fonts: [], attachments: [] };
  const cell = (r, k) => fresh.locator('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
  const state = () => fresh.evaluate(() => {
    const table = document.querySelector('#blocks .block[data-id="t"] .editor-table');
    const shown = (selector) => {
      const node = document.querySelector(selector);
      return Boolean(node) && getComputedStyle(node).display !== "none";
    };
    return {
      on: document.body.classList.contains("table-focus"),
      bar: document.querySelector(".table-focus-bar .table-focus-name")?.textContent ?? null,
      tableWidth: table ? Math.round(table.getBoundingClientRect().width) : 0,
      viewport: innerWidth,
      otherShown: shown('#blocks .block[data-id="f0"]') || shown('#blocks .block[data-id="after"]'),
      treeShown: shown("#page-tree"),
      toolbarShown: shown(".main > .toolbar"),
      titleShown: shown(".title-row"),
      active: document.activeElement?.closest?.(".block")?.dataset.id + ":" + document.activeElement?.dataset?.row + ":" + document.activeElement?.dataset?.cell,
      scrollY: Math.round(scrollY),
      focusButton: document.querySelector('#table-toolbar [data-tool="focus"]')?.getAttribute("aria-pressed") ?? null,
    };
  });
  try {
    for (const width of [1280, 800]) {
      await fresh.setViewportSize({ width, height: 760 });
      await fresh.goto(`http://127.0.0.1:${PORT}/`);
      await fresh.waitForSelector("#blocks .block-content");
      const path = join(OUT, "table-focus.html");
      await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(path);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "全画面", null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(300);

      // 1) 「全画面」で、表だけが画面の幅いっぱいになる。ほかのものは隠れ、上に表の呼び名。今のセルはそのまま。
      await cell(3, 1).click();
      await fresh.waitForTimeout(150);
      const before = await state();
      await fresh.locator('#table-toolbar [data-tool="focus"]').click();
      await fresh.waitForTimeout(300);
      const on = await state();
      result["tableFocusOpens" + width] = on.on && on.bar === "表1: 部品の一覧" && !on.otherShown && !on.treeShown && !on.toolbarShown && !on.titleShown
        && on.active === "t:3:1" && on.focusButton === "true" && on.tableWidth >= on.viewport - 120 && on.tableWidth >= before.tableWidth;

      // 2) 全画面のまま編集できる(打つ・Ctrl+Z)。余白を押しても、隠しているブロックへ移らない。
      await fresh.keyboard.press("End");
      await fresh.keyboard.type("X");
      await fresh.keyboard.press("Tab");
      await fresh.waitForTimeout(150);
      const typed = await cell(3, 1).textContent();
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(250);
      const undone = await cell(3, 1).textContent();
      const blockCount = () => fresh.evaluate(() => document.querySelectorAll("#blocks .block").length);
      const countBefore = await blockCount();
      const tableBox = await fresh.locator('#blocks .block[data-id="t"]').boundingBox();
      await fresh.mouse.click(tableBox.x + 20, Math.min(740, tableBox.y + tableBox.height + 30));
      await fresh.waitForTimeout(200);
      const afterBlank = { ...(await state()), added: (await blockCount()) - countBefore };
      result["tableFocusEditsInPlace" + width] = typed === "部品3X" && undone === "部品3" && afterBlank.on && afterBlank.added === 0 && !afterBlank.active.startsWith("f") && !afterBlank.active.startsWith("after");

      // 3) Esc: 編集中なら、まず編集を取り消す(全画面のまま)。取り消すものが無ければ全画面を閉じ、スクロールの位置も戻る。
      await cell(4, 1).click();
      await fresh.keyboard.press("End");
      await fresh.keyboard.type("Y");
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(150);
      const firstEsc = { ...(await state()), text: await cell(4, 1).textContent() };
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(300);
      const secondEsc = await state();
      result["tableFocusEscCancelsThenCloses" + width] = firstEsc.on && firstEsc.text === "部品4" && !secondEsc.on && secondEsc.bar === null
        && secondEsc.otherShown && secondEsc.focusButton === "false" && Math.abs(secondEsc.scrollY - before.scrollY) <= 40;
      result["tableFocusEvidence" + width] = JSON.stringify({ before, on, typed, undone, afterBlank, firstEsc, secondEsc });
    }

    // 3b) 全画面の見出し(行番号・列番号。Excel と同じ。ユーザー指示「Excel を参考にして、同様にしてほしい」)。
    await fresh.setViewportSize({ width: 1280, height: 760 });
    await cell(2, 1).click();
    await fresh.locator('#table-toolbar [data-tool="focus"]').click();
    await fresh.waitForTimeout(300);
    const selectedCells = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .cell-selected')]
      .map((node) => node.dataset.row + ":" + node.dataset.cell));
    const headerState = () => fresh.evaluate(() => ({
      cols: [...document.querySelectorAll(".sheet-col-header")].map((node) => node.textContent).join(""),
      rows: document.querySelectorAll(".sheet-row-header").length,
      activeCols: [...document.querySelectorAll(".sheet-col-header.is-active, .sheet-col-header.is-full")].map((node) => node.textContent).join(""),
      fullCols: [...document.querySelectorAll(".sheet-col-header.is-full")].map((node) => node.textContent).join(""),
      fullRows: [...document.querySelectorAll(".sheet-row-header.is-full")].map((node) => node.textContent).join(","),
      oldLabels: document.querySelectorAll(".table-axis-label, .table-range-handle").length,
      active: document.activeElement?.dataset?.row + ":" + document.activeElement?.dataset?.cell,
    }));
    const header = (kind, index) => fresh.locator(kind === "col" ? '.sheet-col-header[data-col="' + index + '"]' : '.sheet-row-header[data-row="' + index + '"]');
    const shown = await headerState();
    // 列の見出しを押すと列を選ぶ(今のセルはその列の先頭)。ドラッグで3列。Shift+押すで広げる。行の見出し・左上の角も。
    await header("col", 2).click();
    await fresh.waitForTimeout(150);
    const oneCol = { ...(await headerState()), cells: (await selectedCells()).length };
    const from = await header("col", 1).boundingBox();
    const to = await header("col", 3).boundingBox();
    await fresh.mouse.move(from.x + from.width / 2, from.y + 10);
    await fresh.mouse.down();
    await fresh.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
    const dragCols = await headerState();
    await header("col", 4).click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(150);
    const shiftCols = await headerState();
    await header("row", 5).click();
    await fresh.waitForTimeout(150);
    const oneRow = { ...(await headerState()), cells: (await selectedCells()).length };
    await fresh.locator(".sheet-corner").click();
    await fresh.waitForTimeout(150);
    const all = (await selectedCells()).length;
    result.tableSheetHeadersShown = shown.cols === "ABCDEF" && shown.rows === 13 && shown.oldLabels === 0 && shown.activeCols === "B";
    result.tableSheetHeaderSelects = oneCol.fullCols === "C" && oneCol.cells === 13 && oneCol.active === "0:2" && dragCols.fullCols === "BCD"
      && shiftCols.fullCols === "BCDE" && oneRow.fullRows === "6" && oneRow.cells === 6 && oneRow.active === "5:0" && all === 78;
    // 境目をドラッグで列の幅。Ctrl+Z 1回で戻る。
    await header("col", 1).click();
    await fresh.waitForTimeout(150);
    const widthOf = () => fresh.evaluate(() => Math.round(document.querySelector('#blocks .block[data-id="t"] [data-row="0"][data-cell="1"]').getBoundingClientRect().width));
    const width0 = await widthOf();
    const grip = await fresh.locator('.sheet-col-resizer[data-col="1"]').boundingBox();
    await fresh.mouse.move(grip.x + grip.width / 2, grip.y + 10);
    await fresh.mouse.down();
    await fresh.mouse.move(grip.x + grip.width / 2 + 90, grip.y + 10, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const width1 = await widthOf();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const width2 = await widthOf();
    result.tableSheetHeaderResizesColumn = Math.abs(width1 - width0 - 90) <= 3 && Math.abs(width2 - width0) <= 2;
    // 複数の列を選んでいるとき、境目のダブルクリックは選んだ列の全部をそれぞれの中身に合わせ、ドラッグは全部を同じ幅にする(Excel と同じ。
    // ユーザー指摘「列の境界をダブルクリックして列幅を調整する機能が、複数選択では使えない」)。Ctrl+Z 1回で戻る。
    const colWidths = () => fresh.evaluate(() => [0, 1, 2, 3, 4, 5].map((c) => Math.round(document.querySelector('#blocks .block[data-id="t"] .editor-table [data-row="0"][data-cell="' + c + '"]').getBoundingClientRect().width)));
    const selectCols = async (a, b) => {
      await header("col", a).click();
      await header("col", b).click({ modifiers: ["Shift"] });
      await fresh.waitForTimeout(150);
    };
    await selectCols(1, 3);
    const multi0 = await colWidths();
    await fresh.locator('.sheet-col-resizer[data-col="2"]').dblclick();
    await fresh.waitForTimeout(250);
    const multiFit = await colWidths();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const multiFitUndo = await colWidths();
    await selectCols(1, 3);
    const edge = await fresh.locator('.sheet-col-resizer[data-col="1"]').boundingBox();
    await fresh.mouse.move(edge.x + edge.width / 2, edge.y + 10);
    await fresh.mouse.down();
    await fresh.mouse.move(edge.x + edge.width / 2 - 60, edge.y + 10, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    const multiDrag = await colWidths();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const multiDragUndo = await colWidths();
    result.tableSheetMultiColumnAutoFit = [1, 2, 3].every((c) => multiFit[c] < multi0[c] - 40) && multiFit[0] === multi0[0] && multiFit[4] === multi0[4]
      && JSON.stringify(multiFitUndo) === JSON.stringify(multi0);
    result.tableSheetMultiColumnDragSameWidth = Math.abs(multiDrag[1] - (multi0[1] - 60)) <= 3 && multiDrag[2] === multiDrag[1] && multiDrag[3] === multiDrag[1]
      && multiDrag[0] === multi0[0] && multiDrag[4] === multi0[4] && JSON.stringify(multiDragUndo) === JSON.stringify(multi0);
    result.tableSheetMultiColumnEvidence = JSON.stringify({ multi0, multiFit, multiFitUndo, multiDrag, multiDragUndo });
    // 選んである列の見出しを押して動かすと、列の入れ替え。
    await header("col", 0).click();
    await fresh.waitForTimeout(150);
    const head0 = await header("col", 0).boundingBox();
    const head2 = await header("col", 2).boundingBox();
    await fresh.mouse.move(head0.x + head0.width / 2, head0.y + 10);
    await fresh.mouse.down();
    await fresh.mouse.move(head0.x + head0.width / 2 + 40, head0.y + 12, { steps: 4 });
    await fresh.mouse.move(head2.x + head2.width - 4, head0.y + 12, { steps: 8 });
    await fresh.waitForTimeout(100);
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    const order = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table [data-row="0"]')].map((node) => node.textContent).join(","));
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.tableSheetHeaderDragMoves = order === "名前,区分,品番,数量,単価,金額";
    // 下へスクロールしても、列の見出しは上の帯の下にとどまる(低い画面で、表の上が隠れるまでスクロールする)。
    await fresh.setViewportSize({ width: 1280, height: 420 });
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => window.scrollTo(0, 260));
    await fresh.waitForTimeout(300);
    const sticky = await fresh.evaluate(() => ({
      strip: Math.round(document.querySelector(".sheet-col-strip").getBoundingClientRect().top),
      bar: Math.round(document.querySelector(".table-focus-bar").getBoundingClientRect().bottom),
    }));
    await fresh.evaluate(() => window.scrollTo(0, 0));
    await fresh.setViewportSize({ width: 1280, height: 760 });
    await fresh.waitForTimeout(200);
    result.tableSheetHeaderSticks = Math.abs(sticky.strip - sticky.bar) <= 2;
    // 右クリック: 2列を選んで「2列を削除」→ Ctrl+Z 1回で戻る。「左に2列を挿入」。
    await header("col", 3).click();
    await header("col", 4).click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(150);
    await header("col", 4).click({ button: "right" });
    await fresh.waitForTimeout(150);
    const menuItems = await fresh.evaluate(() => [...document.querySelectorAll(".table-tool-menu .menu-item")].map((node) => node.textContent).join(","));
    await fresh.locator('.table-tool-menu [data-key="delete"]').click();
    await fresh.waitForTimeout(250);
    const afterDelete = (await headerState()).cols;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const afterUndo = (await headerState()).cols;
    await header("col", 1).click({ button: "right" });
    await fresh.waitForTimeout(150);
    await fresh.locator('.table-tool-menu [data-key="insert-before"]').click();
    await fresh.waitForTimeout(250);
    const afterInsert = { cols: (await headerState()).cols, b: await cell(0, 1).textContent(), c: await cell(0, 2).textContent() };
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.tableSheetHeaderMenu = menuItems === "左に2列を挿入,右に2列を挿入,2列を削除,列の幅を自動調整" && afterDelete === "ABCD" && afterUndo === "ABCDEF"
      && afterInsert.cols === "ABCDEFG" && afterInsert.b === "" && afterInsert.c === "名前";
    // 式を書いている途中に列の見出しを押すと、列まるごとの参照が入る(Excel と同じ)。
    await cell(1, 5).click();
    await fresh.keyboard.press("Control+a");
    await fresh.keyboard.type("=SUM(");
    await header("col", 3).click();
    await fresh.waitForTimeout(150);
    const pointRef = await cell(1, 5).textContent();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    result.tableSheetHeaderInsertsRefWhileEditingFormula = pointRef === "=SUM(D:D";
    result.tableSheetEvidence = JSON.stringify({ shown, oneCol, dragCols, shiftCols, oneRow, all, width0, width1, width2, order, sticky, menuItems, afterDelete, afterUndo, afterInsert, pointRef });
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);

    // 4) 「閉じる」でも戻る。保存した文書には全画面の印が残らない。
    await cell(3, 1).click();
    await fresh.locator('#table-toolbar [data-tool="focus"]').click();
    await fresh.waitForTimeout(250);
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "table-focus-saved.html");
    await (await download).saveAs(savedPath);
    const saved = await readFile(savedPath, "utf8");
    await fresh.locator(".table-focus-bar .table-focus-close").click();
    await fresh.waitForTimeout(250);
    const closed = await state();
    result.tableFocusCloseButtonAndNotSaved = !closed.on && closed.otherShown && !saved.includes("table-focus");

    // 5) 別のページへ移ったら全画面は抜ける(戻ってきても全画面ではない)。
    await cell(3, 1).click();
    await fresh.locator('#table-toolbar [data-tool="focus"]').click();
    await fresh.waitForTimeout(250);
    await fresh.evaluate(() => document.querySelector('#page-tree-body .page-tree-item[data-page-id="F2"]').click());
    await fresh.waitForTimeout(300);
    const moved = await state();
    await fresh.evaluate(() => document.querySelector('#page-tree-body .page-tree-item[data-page-id="F"]').click());
    await fresh.waitForTimeout(300);
    const back = await state();
    result.tableFocusEndsOnPageChange = !moved.on && moved.bar === null && !back.on;
    result.tableFocusMoreEvidence = JSON.stringify({ closed, moved, back });

    // 6) 見せる高さ(v235)を決めた表も、全画面では全行を出す(中でスクロールしない・高さのつまみも出さない)。閉じたら高さに戻り、
    //    決めた高さ(viewHeight)はそのまま。
    {
      const tall = { pages: [{ id: "H", title: "高さ", blocks: [{ id: "t", type: "table", tableHeader: true, viewHeight: 160, rows }] }], fonts: [], attachments: [] };
      const path = join(OUT, "table-focus-height.html");
      await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), tall), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(path);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "高さ", null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(300);
      const heightState = () => fresh.evaluate(() => {
        const row = document.querySelector('#blocks .block[data-id="t"]');
        const content = row.querySelector(":scope > .block-content");
        return { limited: row.classList.contains("has-view-height"), maxHeight: content.style.maxHeight, scrolls: content.scrollHeight > content.clientHeight + 2,
          grip: Boolean(row.querySelector(":scope > .table-height-grip")), active: document.activeElement?.dataset?.row + ":" + document.activeElement?.dataset?.cell };
      });
      const normal = await heightState();
      await cell(1, 1).click();
      await fresh.locator('#table-toolbar [data-tool="focus"]').click();
      await fresh.waitForTimeout(300);
      const focused = await heightState();
      await fresh.locator(".table-focus-bar .table-focus-close").click();
      await fresh.waitForTimeout(300);
      const back = await heightState();
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const savedPath = join(DOWNLOADS, "table-focus-height-saved.html");
      await (await download).saveAs(savedPath);
      const savedDoc = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), await readFile(savedPath, "utf8"));
      const keptHeight = savedDoc.pages[0].blocks[0].viewHeight;
      result.tableFocusIgnoresViewHeight = normal.limited && normal.scrolls && !focused.limited && !focused.maxHeight && !focused.scrolls && !focused.grip
        && focused.active === "1:1" && back.limited && back.scrolls && back.grip && back.active === "1:1" && keptHeight === 160;
      result.tableFocusViewHeightEvidence = JSON.stringify({ normal, focused, back, keptHeight });
    }

    result.tableFocusNoPageErrors = pageErrors.length === 0;
    result.tableFocusPageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
