// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 表のフィルハンドル(Excel のオートフィル) ----
// 文書全体の状態に依存しないよう、新しいページで検証する。
export default async function fillSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    const cellSelector = (r, c) => '#blocks .block.type-table .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
    const setCell = async (r, c, text) => {
      await fresh.evaluate(([row, cell, value]) => {
        const td = document.querySelector('#blocks .block.type-table .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]');
        if (!td) return;
        td.focus();
        td.textContent = value;
        td.dispatchEvent(new Event("input", { bubbles: true }));
        td.blur();
      }, [r, c, text]);
      await fresh.waitForTimeout(70);
    };
    // クリックで移す(素の focus() は直前の範囲選択を消さないため、
    // 前のフィルが残した選択がソース扱いになってしまう)。
    const focusCell = async (r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(250);
    };
    // 式セルは表示値ではなく生の式(title 属性に入っている)を読む。
    const rawCell = (r, c) => fresh.evaluate((selector) => {
      const td = document.querySelector(selector);
      if (!td) return null;
      return td.classList.contains("formula-cell") && td.title ? td.title : td.textContent;
    }, cellSelector(r, c));
    const dispCell = (r, c) => fresh.evaluate((selector) => (
      document.querySelector(selector)?.textContent ?? null
    ), cellSelector(r, c));
    const useTool = async (tool, r, c) => {
      await focusCell(r, c);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
    };
    const dragCells = async (from, to) => {
      const box = await fresh.evaluate(([a, b]) => {
        const q = (r, c) => document.querySelector('#blocks .block.type-table .editor-table [data-row="' + r + '"][data-cell="' + c + '"]');
        const one = q(a[0], a[1]).getBoundingClientRect();
        const two = q(b[0], b[1]).getBoundingClientRect();
        return {
          from: { x: one.left + one.width / 2, y: one.top + one.height / 2 },
          to: { x: two.left + two.width / 2, y: two.top + two.height / 2 },
        };
      }, [from, to]);
      await fresh.mouse.move(box.from.x, box.from.y);
      await fresh.mouse.down();
      await fresh.mouse.move(box.to.x, box.to.y, { steps: 8 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(250);
    };
    // フィルハンドルから対象セルまでドラッグする。
    const dragFillTo = async (r, c) => {
      const handle = fresh.locator("#blocks .block .table-fill-handle").first();
      const handleBox = await handle.boundingBox();
      const cellBox = await fresh.locator(cellSelector(r, c)).boundingBox();
      await fresh.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2, { steps: 8 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(300);
    };

    // 5行3列の表を用意する。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await useTool("row-after", 2, 0);
    await useTool("row-after", 3, 0);
    await setCell(0, 0, "1");
    await setCell(0, 1, "2");
    await setCell(0, 2, "=A1+B1");
    await setCell(1, 0, "3");
    await setCell(1, 1, "4");
    await setCell(2, 0, "5");
    await setCell(2, 1, "6");

    // アクティブセルの右下にフィルハンドルが1つだけ出る。
    await focusCell(0, 0);
    result.tableFillHandleAppearsOnActiveCell = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .block .table-fill-handle").length === 1
    ));

    // 数式セルを下へフィルすると相対参照が行ぶんずれて計算し直すことは、tableExcelSuite.tableAbsoluteRefFill が見る
    // (1つのセルからハンドルで2行下へ。B1→B2→B3 と値)。ここでは範囲の参照(A1:B1)もずれることを見る。
    await setCell(3, 2, "=SUM(A1:B1)");
    await focusCell(3, 2);
    await dragFillTo(4, 2);
    result.tableFillFormulaShiftsRangeRefs = (await rawCell(4, 2)) === "=SUM(A2:B2)"
      && (await dispCell(4, 2)) === "7";

    // 2セル以上の等差数列(1,3)は継続する(5,7)。範囲選択からのフィル。
    await dragCells([0, 0], [1, 0]);
    await dragFillTo(3, 0);
    result.tableFillContinuesArithmeticSeries = (await dispCell(2, 0)) === "5"
      && (await dispCell(3, 0)) === "7";

    // 「項目1」のような末尾数値はインクリメントする。
    await setCell(2, 1, "項目1");
    await focusCell(2, 1);
    await dragFillTo(4, 1);
    result.tableFillTextSuffixIncrements = (await dispCell(3, 1)) === "項目2"
      && (await dispCell(4, 1)) === "項目3";

    // その他のテキストは値コピー。
    await setCell(2, 0, "りんご");
    await focusCell(2, 0);
    await dragFillTo(3, 0);
    result.tableFillCopiesPlainText = (await dispCell(3, 0)) === "りんご";

    // フィル1回 = Undo 1手で戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.tableFillUndoIsSingleStep = (await dispCell(3, 0)) === "7"
      && (await dispCell(2, 0)) === "りんご";

    // 1セルの数値は数列にせず値コピー(Excel の既定)。複数セルへ横に伸ばせる。
    await setCell(4, 0, "9");
    await focusCell(4, 0);
    await dragFillTo(4, 2);
    result.tableFillCopiesSingleValueAcross = (await dispCell(4, 1)) === "9"
      && (await dispCell(4, 2)) === "9";

    // セルの色(背景)もフィル先へ写る。
    await focusCell(0, 0);
    await fresh.locator("#format-background-trigger").click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#format-background-options .color-swatch").nth(3).click();
    await fresh.waitForTimeout(250);
    await focusCell(0, 0);
    await dragFillTo(1, 0);
    result.tableFillCopiesCellColors = await fresh.evaluate(() => {
      const q = (r, c) => document.querySelector('#blocks .block.type-table .editor-table [data-row="' + r + '"][data-cell="' + c + '"]');
      const source = getComputedStyle(q(0, 0)).backgroundColor;
      const target = getComputedStyle(q(1, 0)).backgroundColor;
      return source !== "rgba(0, 0, 0, 0)" && source === target && q(1, 0).textContent === "1";
    });

    // ハンドル以外からのセル間ドラッグは、これまでどおり範囲選択(フィルしない)。
    const beforeDrag = await dispCell(1, 1);
    await dragCells([0, 1], [1, 1]);
    result.tableFillDoesNotHijackCellDragSelection = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .editor-table .cell-selected").length === 2
    )) && (await dispCell(1, 1)) === beforeDrag;

    // 結合セルがソースに絡むときはハンドルを出さない(安全側)。
    await dragCells([3, 1], [4, 1]);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(300);
    await focusCell(3, 1);
    result.tableFillHandleHiddenOnMergedSelection = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .block .table-fill-handle").length === 0
    ));

    // 適用先に結合セルが絡むフィルは何も起きない(安全側)。
    const mergedBefore = await rawCell(3, 1);
    await focusCell(3, 0);
    await dragFillTo(3, 1);
    result.tableFillSkipsMergedTarget = (await rawCell(3, 1)) === mergedBefore;

    // 左方向のフィル(値コピー)。
    await setCell(1, 0, "3");
    await setCell(1, 1, "4");
    await focusCell(1, 1);
    await dragFillTo(1, 0);
    result.tableFillLeftCopiesValue = (await dispCell(1, 0)) === "4";

    return result;
  } finally {
    await fresh.close();
  }
}
