// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- New-24: 先頭行/先頭列の削除で、軸違いの全体参照が #REF 化しない ----
// 列まるごと(A:A)の remap は代表行0を通るが、行0の削除は行の「端点」だけを
// 失効させ、端点でない代表行は巻き込まない(軸対応の rowRole/colRole)。
export default async function wholeRefAxisSuite({ context }) {
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
    const rawCell = (r, c) => fresh.evaluate((selector) => {
      const td = document.querySelector(selector);
      if (!td) return null;
      return td.classList.contains("formula-cell") && td.title ? td.title : td.textContent;
    }, cellSelector(r, c));
    const dispCell = (r, c) => fresh.evaluate((selector) => (
      document.querySelector(selector)?.textContent ?? null
    ), cellSelector(r, c));
    const useTool = async (tool, r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
    };

    // 3行3列: 列参照は C2、行参照は C3 に置く(削除される行0・列0を避ける)。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await setCell(0, 0, "5");
    await setCell(0, 1, "6");
    await setCell(1, 0, "1");
    await setCell(1, 1, "2");
    await setCell(2, 0, "3");
    await setCell(2, 1, "4");
    await setCell(1, 2, "=SUM(A:A)");
    await setCell(2, 2, "=SUM(2:2)");

    // 行0(タイトル行を消す想定)を削除しても A:A は生きたまま再計算される。
    const beforeRowDelete = (await dispCell(1, 2)) === "9";
    await useTool("row-delete", 0, 1);
    result.wholeColRefSurvivesFirstRowDelete = beforeRowDelete
      && (await rawCell(0, 2)) === "=SUM(A:A)"
      && (await dispCell(0, 2)) === "4";
    // 巻き添え確認: 行まるごと参照(2:2)は通常どおり 1:1 へ詰まる。
    result.wholeRowRefShiftsOnFirstRowDelete = (await rawCell(1, 2)) === "=SUM(1:1)";

    // 列0を削除しても行まるごと参照は生きたまま再計算される。A:A(列0参照)は
    // 巻き込まれて #REF になるのが正(既存仕様)なので、先に消しておく。
    await setCell(0, 2, "");
    await useTool("col-delete", 0, 0);
    result.wholeRowRefSurvivesFirstColumnDelete = (await rawCell(1, 1)) === "=SUM(1:1)"
      && (await dispCell(1, 1)) === "2";

    return result;
  } finally {
    await fresh.close();
  }
}
