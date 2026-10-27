// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 表セル編集の Esc キャンセル(Excel と同じ) ----
// Esc は「セル編集セッションのキャンセル」: 編集開始時の値へ戻し、途中の編集も
// ポイントモードの参照挿入も丸ごと破棄。数式専用にしない。局所(セル)が最優先で、
// 検索バー等のグローバル Esc へは漏らさない。Undo 履歴に編集途中の値を残さない。
export default async function escCancelSuite({ context }) {
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
    const dispCell = (r, c) => fresh.evaluate((selector) => (
      document.querySelector(selector)?.textContent ?? null
    ), cellSelector(r, c));
    const clickCell = async (r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
    };
    const activeCoord = () => fresh.evaluate(() => (
      (document.activeElement?.dataset?.row ?? "-") + "," + (document.activeElement?.dataset?.cell ?? "-")
    ));
    const blurActive = async () => {
      await fresh.evaluate(() => document.activeElement?.blur?.());
      await fresh.waitForTimeout(200);
    };
    const dragCells = async (a, b) => {
      const box = await fresh.evaluate(([s1, s2]) => {
        const one = document.querySelector(s1)?.getBoundingClientRect();
        const two = document.querySelector(s2)?.getBoundingClientRect();
        if (!one || !two) return null;
        return {
          from: { x: one.left + one.width / 2, y: one.top + one.height / 2 },
          to: { x: two.left + two.width / 2, y: two.top + two.height / 2 },
        };
      }, [cellSelector(a[0], a[1]), cellSelector(b[0], b[1])]);
      if (!box) return;
      await fresh.mouse.move(box.from.x, box.from.y);
      await fresh.mouse.down();
      await fresh.mouse.move(box.to.x, box.to.y, { steps: 6 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(250);
    };
    const clickMerge = async () => {
      await fresh.evaluate(() => document.querySelector('#table-toolbar .table-tool[data-tool="merge"]')?.click());
      await fresh.waitForTimeout(250);
    };

    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await setCell(0, 0, "keep");
    await setCell(0, 1, "5");
    await setCell(0, 2, "=B1");

    // プレーンセル: 編集を Esc で捨てると開始時の値へ戻り、フォーカスはセルのまま。
    await clickCell(0, 0);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("XYZ");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    result.escCancelRestoresPlainCell = (await dispCell(0, 0)) === "keep"
      && (await activeCoord()) === "0,0";

    // 数式セル: 式の編集途中で Esc → 開始時の式に戻り、blur 後は計算結果。
    await clickCell(0, 2);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("+9");
    const midFormula = await dispCell(0, 2);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const restoredFormula = await dispCell(0, 2);
    await blurActive();
    result.escCancelRestoresFormulaCell = midFormula === "=B1+9"
      && restoredFormula === "=B1"
      && (await dispCell(0, 2)) === "5";

    // 結合セル: キャンセルで全メンバーが開始時の値に戻る(別名参照で確認)。
    await setCell(1, 0, "7");
    await dragCells([1, 0], [2, 0]);
    await clickMerge();
    await setCell(1, 2, "=A3");
    await clickCell(1, 0);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("99");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    await blurActive();
    result.escCancelRestoresMergedMembers = (await dispCell(1, 0)) === "7"
      && (await dispCell(1, 2)) === "7";

    // ポイントモード中の Esc: 参照挿入の途中でも編集全体をキャンセル(Excel と同じ)。
    // ハイライトも消え、その後のクリックは通常のセル移動に戻る。
    await clickCell(2, 2);
    await fresh.keyboard.type("=");
    await clickCell(0, 1);
    const pointedText = await dispCell(2, 2);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const cancelledText = await dispCell(2, 2);
    const previewCount = await fresh.evaluate(() => document.querySelectorAll("#blocks .editor-table .ref-preview").length);
    await clickCell(0, 0);
    result.escCancelDuringPointMode = pointedText === "=B1"
      && cancelledText === ""
      && previewCount === 0
      && (await activeCoord()) === "0,0";

    // Undo を汚さない: Esc 後に Ctrl+Z しても編集途中の値は出ず、
    // その前の操作(セルへの値入力)が戻る。
    // (2,0) は上の結合で covered になっているため、独立したセル (2,1) を使う。
    await setCell(2, 1, "base");
    // saveHistory の coalesce 窓(1.5秒)を跨いでから編集を始める。跨がないと
    // "base" の入力とこの編集が1つの履歴に合流し、Undo の段数が変わる。
    await fresh.waitForTimeout(1700);
    await clickCell(2, 1);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("junk");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const afterEsc = await dispCell(2, 1);
    // セル内の Ctrl+Z はブラウザ既定(contenteditable のネイティブ undo)に
    // 渡り得るため、blur してからアプリの Undo を確かめる。
    await blurActive();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const firstUndo = await dispCell(2, 1);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const secondUndo = await dispCell(2, 1);
    result.escCancelKeepsUndoClean = afterEsc === "base"
      && firstUndo === "base" && secondUndo === "";

    // 優先順位: セル編集中の Esc はセルが消費し、検索バーは開いたまま。
    // 検索欄へフォーカスすれば従来どおり Esc で閉じる。
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(200);
    await clickCell(0, 0);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("Q");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const cellAfterEsc = await dispCell(0, 0);
    const barOpenAfterCellEsc = await fresh.evaluate(() => !document.querySelector("#search-bar").hidden);
    await fresh.locator("#search-input").click();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const barClosedAfterInputEsc = await fresh.evaluate(() => document.querySelector("#search-bar").hidden);
    result.escCancelScopedAgainstSearchBar = cellAfterEsc === "keep"
      && barOpenAfterCellEsc && barClosedAfterInputEsc;

    return result;
  } finally {
    await fresh.close();
  }
}
