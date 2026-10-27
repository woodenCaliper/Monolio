// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 列・行まるごと参照 (A:A / 2:2): 評価と構造変更の追随 ----
// 「生きた参照」: 書いた時点の表の形に固定せず、評価のたびに現在の形へ解決する
// (行を増やせば SUM の対象も増える)。行・列の挿入では参照ラベル自体も
// remapTableFormulaRefs で追随し、参照先そのものの削除は #REF になる。
export default async function wholeRefSuite({ context }) {
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

    // 4行3列の表: A1=1 A2=2 / B1=3 B2=4。式は C 列に置く(A:B を汚さない)。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await useTool("row-after", 2, 0);
    await setCell(0, 0, "1");
    await setCell(1, 0, "2");
    await setCell(0, 1, "3");
    await setCell(1, 1, "4");
    await setCell(0, 2, "=SUM(A:A)");
    await setCell(1, 2, "=SUM(1:1)");
    await setCell(2, 2, "=SUM(A:B)");
    await setCell(3, 2, "=MIN(2:3)");
    // 構文と計算: 列(A:A)・行(1:1)・複数列(A:B)・複数行(2:3)。
    // C2=SUM(1:1) は行1の C1(式の計算値 3)も足す = 1+3+3。
    result.wholeColumnRowSyntaxComputes = (await dispCell(0, 2)) === "3"
      && (await dispCell(1, 2)) === "7"
      && (await dispCell(2, 2)) === "10"
      && (await dispCell(3, 2)) === "2";

    // 生きた参照の核心: 行を挿入して値を足すと SUM(A:A) の合計が増える。
    // 式のテキストは A:A のまま(A1:A4 などに展開・固定されない)。
    await useTool("row-after", 1, 0);
    await setCell(2, 0, "10");
    result.wholeColumnRefFollowsRowInsert = (await dispCell(0, 2)) === "13"
      && (await rawCell(0, 2)) === "=SUM(A:A)"
      && (await dispCell(3, 2)) === "20";

    // 列を挿入して値を入れると SUM(1:1) の合計も増える(行参照の生きた解決)。
    await useTool("col-after", 0, 0);
    await setCell(0, 1, "5");
    result.wholeRowRefFollowsColumnInsert = (await dispCell(1, 3)) === "22"
      && (await rawCell(1, 3)) === "=SUM(1:1)";
    // 挿入をまたいだ範囲ラベルの追随: A:B は A:C に、2:3 は 2:4 になっている。
    result.wholeColRangeRemapsOnColumnInsert = (await rawCell(3, 3)) === "=SUM(A:C)"
      && (await dispCell(3, 3)) === "25";
    result.wholeRowRangeRemapsOnRowInsert = (await rawCell(4, 3)) === "=MIN(2:4)"
      && (await dispCell(4, 3)) === "2";

    // 削除にも追従する: 挿入した列・行を消すと元の合計へ戻る。
    await useTool("col-delete", 0, 1);
    const afterColDelete = (await dispCell(1, 2)) === "17" && (await dispCell(0, 2)) === "13";
    await useTool("row-delete", 2, 0);
    result.wholeRefFollowsDeletes = afterColDelete
      && (await dispCell(0, 2)) === "3"
      && (await dispCell(1, 2)) === "7"
      && (await rawCell(3, 2)) === "=MIN(2:3)";

    // 自己参照は #CYCLE(Excel の循環参照と同じ扱い。式セル自身を除外しない)。
    await setCell(3, 0, "=SUM(A:A)");
    await setCell(3, 1, "=SUM(4:4)");
    result.wholeRefSelfCycleDetected = (await dispCell(3, 0)) === "#CYCLE"
      && (await dispCell(3, 1)) === "#CYCLE";
    await setCell(3, 0, "");
    await setCell(3, 1, "");

    // 参照先そのものの削除は #REF で、表示も #REF(Excel の語彙。#ERR は構文・
    // 型・0除算などそれ以外、#CYCLE は循環)。行→列の順に確かめる。
    await useTool("row-delete", 0, 0);
    result.wholeRowRefDeletedRowBecomesRef = String(await rawCell(0, 2)).includes("#REF")
      && (await dispCell(0, 2)) === "#REF";
    await setCell(2, 0, "=SUM(B:B)");
    await useTool("col-delete", 0, 1);
    result.wholeColumnRefDeletedColumnBecomesRef = String(await rawCell(2, 0)).includes("#REF")
      && (await dispCell(2, 0)) === "#REF";

    return result;
  } finally {
    await fresh.close();
  }
}
