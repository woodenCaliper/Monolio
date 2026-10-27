// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- セル結合の新モデル: 参照の意味論(グループ=1つの論理値) ----
// どのメンバー座標でも同じ値/範囲・全体参照・グラフはグループを1回だけ数える/
// 1つの式に同一グループの異なる座標を混ぜると #MERGE/別名経由の循環も #CYCLE。
export default async function mergedLogicalSuite({ context }) {
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
    const titleOf = (r, c) => fresh.evaluate((selector) => (
      document.querySelector(selector)?.title ?? null
    ), cellSelector(r, c));
    const useTool = async (tool, r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
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

    // 5行3列。A1=5 を入れて A1:A2 を結合(グループ)。式は B・C 列に置く。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await useTool("row-after", 2, 0);
    await useTool("row-after", 3, 0);
    await setCell(0, 0, "5");
    await dragCells([0, 0], [1, 0]);
    await clickMerge();

    // どのメンバー座標(A1/A2)への参照も同じ値を返す。
    await setCell(0, 2, "=A1");
    await setCell(1, 2, "=A2");
    result.mergedMemberAliasSharesValue = (await dispCell(0, 2)) === "5"
      && (await dispCell(1, 2)) === "5";

    // 範囲参照・全体参照はグループを1回だけ数える(見た目どおりの集計)。
    await setCell(2, 1, "=SUM(A1:A2)");
    await setCell(3, 1, "=SUM(A:A)");
    result.mergedRangeCountsGroupOnce = (await dispCell(2, 1)) === "5"
      && (await dispCell(3, 1)) === "5";

    // 本体(A1)が範囲の外でもメンバー(A2)が触れていれば1回数える
    // (covered スキップ方式だと取りこぼすケース)。
    await setCell(4, 1, "=SUM(A2:B2)");
    result.mergedMemberTouchCountsOnce = (await dispCell(4, 1)) === "5";

    // 同一グループの異なる座標を1つの式に混ぜると #MERGE。ツールチップは
    // 「式 — 説明」で、確定時に setStatus でも同じ説明が出る。
    await setCell(2, 2, "=A1+A2");
    const mergeTitle = await titleOf(2, 2);
    const mergeStatus = await fresh.evaluate(() => document.querySelector("#status")?.textContent ?? "");
    result.mergedAliasMixShowsMergeError = (await dispCell(2, 2)) === "#MERGE"
      && String(mergeTitle).includes("=A1+A2")
      && String(mergeTitle).includes("A1 と A2 は同じ結合セルの別名")
      && String(mergeStatus).includes("#MERGE");

    // 同じ座標名を複数回使うのは合法(禁止は「異なる座標の混在」)。
    await setCell(3, 2, "=A1+A1");
    result.mergedSameAliasTwiceLegal = (await dispCell(3, 2)) === "10";

    // グラフの range もグループを1回だけ数える(scatter の点が1つ)。
    const tableId = await fresh.evaluate(() => document.querySelector("#blocks .block.type-table").dataset.id);
    await fresh.locator('#blocks .block[data-id="' + tableId + '"] .insert-block').click();
    await fresh.keyboard.type("/chart");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await fresh.evaluate(() => {
      const content = document.querySelector("#blocks .block.type-chart .block-content");
      content.focus();
      content.textContent = "scatter(A1:A2, A1:A2)";
      content.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true }));
      content.blur();
    });
    await fresh.waitForTimeout(400);
    result.mergedChartCountsGroupOnce = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .block.type-chart svg circle.chart-point").length === 1
    ));

    // 別名(メンバー座標)経由の自己参照も、正規化された鍵で #CYCLE になる。
    await setCell(0, 0, "=A2");
    result.mergedAliasCycleDetected = (await dispCell(0, 0)) === "#CYCLE";
    await setCell(0, 0, "5");

    return result;
  } finally {
    await fresh.close();
  }
}
