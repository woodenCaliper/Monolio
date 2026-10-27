// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 列・行まるごと参照: フィルの相対シフトと行・列ハンドルからの挿入 ----
export default async function wholeRefPointSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const cellSelector = (r, c) => '#blocks .block.type-table .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
    const setCell = async (r, c, text) => {
      await fresh.evaluate(([selector, value]) => {
        const td = document.querySelector(selector);
        if (!td) return;
        td.focus();
        td.textContent = value;
        td.dispatchEvent(new Event("input", { bubbles: true }));
        td.blur();
      }, [cellSelector(r, c), text]);
      await fresh.waitForTimeout(70);
    };
    const focusCell = async (r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
    };
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
    const dragFillTo = async (r, c) => {
      const grip = await fresh.evaluate(() => {
        const handle = document.querySelector("#blocks .block .table-fill-handle");
        if (!handle) return null;
        const rect = handle.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      const target = await fresh.evaluate((selector) => {
        const td = document.querySelector(selector);
        if (!td) return null;
        const rect = td.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, cellSelector(r, c));
      await fresh.mouse.move(grip?.x ?? 0, grip?.y ?? 0);
      await fresh.mouse.down();
      await fresh.mouse.move(target?.x ?? 0, target?.y ?? 0, { steps: 8 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(300);
    };

    // 4行4列: 参照される側(A・B列と1・2行)は純データにし、式は安全域(C・D列の
    // 3・4行)に置く。列参照の式を参照対象の行に置くと、行参照の式との相互参照で
    // #CYCLE になる(仕様どおりの挙動)ため、フィルの検証では置き場所を分離する。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await useTool("row-after", 2, 0);
    await useTool("col-after", 0, 2);
    await setCell(0, 0, "1");
    await setCell(1, 0, "2");
    await setCell(0, 1, "3");
    await setCell(1, 1, "4");
    const blurActive = async () => {
      await fresh.evaluate(() => document.activeElement?.blur?.());
      await fresh.waitForTimeout(150);
    };

    // 行参照は下方向のフィルで 1:1 → 2:2 とシフトする。
    await setCell(2, 3, "=MAX(1:1)");
    await focusCell(2, 3);
    await dragFillTo(3, 3);
    await blurActive();
    result.wholeRowRefFillDownShifts = (await rawCell(3, 3)) === "=MAX(2:2)"
      && (await dispCell(3, 3)) === "4"
      && (await dispCell(2, 3)) === "3";

    // 列参照(A:A)は下方向のフィルでは変化しない(Excel と同じ)。
    await setCell(2, 2, "=SUM(A:A)");
    await focusCell(2, 2);
    await dragFillTo(3, 2);
    await blurActive();
    result.wholeColumnRefFillDownUnchanged = (await rawCell(3, 2)) === "=SUM(A:A)"
      && (await dispCell(3, 2)) === "3";

    // 行参照(2:2)は右方向のフィルでは変化しない。
    await setCell(3, 2, "=MIN(2:2)");
    await focusCell(3, 2);
    await dragFillTo(3, 3);
    await blurActive();
    result.wholeRowRefFillRightUnchanged = (await rawCell(3, 3)) === "=MIN(2:2)"
      && (await dispCell(3, 3)) === "2";

    // 列参照は右方向のフィルで A:A → B:B とシフトする。
    await setCell(2, 2, "=MIN(A:A)");
    await focusCell(2, 2);
    await dragFillTo(2, 3);
    await blurActive();
    result.wholeColumnRefFillRightShifts = (await rawCell(2, 3)) === "=MIN(B:B)"
      && (await dispCell(2, 3)) === "3";

    // 表の左端からはみ出す方向へのフィルは #REF(表示も #REF。Excel の語彙)。
    await focusCell(2, 2);
    await dragFillTo(2, 1);
    await blurActive();
    result.wholeColumnRefFillPastEdgeRef = String(await rawCell(2, 1)).includes("#REF")
      && (await dispCell(2, 1)) === "#REF";

    // 式のポイントモード中に列ハンドルを押すと列まるごと参照(A:A)が入る
    // (Excel の列ヘッダクリックと同等)。続けて行ハンドルを押すと置き換わる。
    await focusCell(2, 0);
    await fresh.keyboard.type("=SUM(");
    await fresh.locator("#blocks .table-range-handle.column").click();
    await fresh.waitForTimeout(200);
    const afterColumnHandle = await fresh.evaluate((selector) => ({
      text: document.querySelector(selector)?.textContent ?? null,
      active: (document.activeElement?.dataset?.row ?? "-") + "," + (document.activeElement?.dataset?.cell ?? "-"),
    }), cellSelector(2, 0));
    result.wholeRefHandleInsertsColumnRef = afterColumnHandle.text === "=SUM(A:A"
      && afterColumnHandle.active === "2,0";
    await fresh.locator("#blocks .table-range-handle.row").click();
    await fresh.waitForTimeout(200);
    result.wholeRefHandleInsertsRowRefReplacing = await fresh.evaluate((selector) => (
      document.querySelector(selector)?.textContent === "=SUM(3:3"
    ), cellSelector(2, 0));

    // 式編集中でなければ、ハンドルは従来どおり列・行の選択のまま。
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(150);
    await focusCell(0, 0);
    await fresh.locator("#blocks .table-range-handle.column").click();
    await fresh.waitForTimeout(200);
    result.wholeRefHandleStillSelectsOutsidePointMode = await fresh.evaluate((selector) => (
      document.querySelectorAll("#blocks .editor-table .cell-selected").length === 4
      && document.querySelector(selector)?.textContent === "1"
    ), cellSelector(0, 0));

    return result;
  } finally {
    await fresh.close();
  }
}
