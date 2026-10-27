// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- ヘッダー境界と結合の制約 ----
// 宣言された軸ごとに「ヘッダー|本文」境界(行0|行1・列0|列1)をまたぐ結合を禁止。
// 境界をまたがない結合(ヘッダー行内の横結合など)は従来どおり。トグルONや
// ヘッダー行/列の削除で境界をまたぐ形になる結合は自動分解して通知する。
export default async function headerMergeSuite({ context }) {
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
    const cellShape = (r, c) => fresh.evaluate((selector) => {
      const td = document.querySelector(selector);
      if (!td) return null;
      return { colSpan: td.colSpan || 1, rowSpan: td.rowSpan || 1, tag: td.tagName };
    }, cellSelector(r, c));
    const useTool = async (tool, r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
    };
    const dragCells = async (a, b) => {
      // 赤確認で結合の拒否が壊れると、覆われたセルが消えて座標を引けなくなる。
      // クラッシュではなく「赤」で落ちるよう null 安全にする(過去の教訓)。
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
    const mergeState = () => fresh.evaluate(() => (
      document.querySelector('#table-toolbar .table-tool[data-tool="merge"]')?.disabled ?? null
    ));
    const clickMerge = async () => {
      // disabled でも DOM の click() 自体は無反応で済む(実行されないことの検証)。
      await fresh.evaluate(() => document.querySelector('#table-toolbar .table-tool[data-tool="merge"]')?.click());
      await fresh.waitForTimeout(250);
    };
    const statusText = () => fresh.evaluate(() => document.querySelector("#status")?.textContent ?? "");

    // 4行3列。ヘッダー行をON。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await useTool("row-after", 2, 0);
    await useTool("header", 0, 0);

    // 境界をまたぐ結合(A1:A2)は、ボタンが無効になり実行もされない。
    await dragCells([0, 0], [1, 0]);
    const rowCrossDisabled = await mergeState();
    await clickMerge();
    const rowCrossShape = await cellShape(0, 0);
    result.headerMergeCrossBoundaryRefused = rowCrossDisabled === true
      && rowCrossShape.rowSpan === 1;

    // 境界をまたがない結合(ヘッダー行内の横結合 B1:C1)は従来どおり可能。
    await dragCells([0, 1], [0, 2]);
    const insideDisabled = await mergeState();
    await clickMerge();
    const merged = await cellShape(0, 1);
    result.headerRowInternalMergeAllowed = insideDisabled === false && merged.colSpan === 2;
    await useTool("split", 0, 1);

    // 行・列の両方を宣言した角セル(A1)は、どちらの軸の結合も特別分岐なしで拒否。
    await useTool("header-col", 1, 1);
    await dragCells([0, 0], [0, 1]);
    const cornerRight = await mergeState();
    await dragCells([0, 0], [1, 0]);
    const cornerDown = await mergeState();
    result.headerCornerMergeRefused = cornerRight === true && cornerDown === true;

    // またぐ結合が既にある表でトグルON → 自動分解+通知+ヘッダー化。
    // いったん両ヘッダーを外し、A1:A2 を結合してから行ヘッダーをONにする。
    await useTool("header-col", 1, 1);
    await useTool("header", 1, 1);
    await setCell(0, 0, "X");
    await setCell(1, 0, "Y");
    await dragCells([0, 0], [1, 0]);
    await clickMerge();
    const preToggle = await cellShape(0, 0);
    await useTool("header", 1, 1);
    const afterToggle = await cellShape(0, 0);
    const bodyCell = await cellShape(1, 0);
    result.headerToggleSplitsCrossingMerge = preToggle.rowSpan === 2
      && afterToggle.rowSpan === 1 && afterToggle.tag === "TH"
      && bodyCell !== null && bodyCell.rowSpan === 1
      && String(await dispCell(0, 0)).includes("X")
      && (await statusText()).includes("結合を解除");

    // Undo 1手で「分解+ヘッダー化」がまとめて戻る(結合が復元し、ヘッダーOFF)。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await cellShape(0, 0);
    result.headerToggleSplitUndoIsOneStep = undone.rowSpan === 2 && undone.tag === "TD";

    // 自動分解の後も全体参照のヘッダー除外が正しく効く(v114 との組み合わせ)。
    // (redo ではなく、もう一度トグルONで同じ「分解+ヘッダー化」を実行する)
    await useTool("header", 1, 1);
    await setCell(0, 0, "2024");
    await setCell(1, 0, "1");
    await setCell(2, 0, "2");
    await setCell(2, 2, "=SUM(A:A)");
    result.headerExclusionWorksAfterAutoSplit = (await dispCell(2, 2)) === "3";

    // ヘッダー行そのものを削除すると、本文の結合が新行0へずり上がって境界を
    // またぐことがある。その結合は自動分解される(またぎ状態を作る全経路を塞ぐ)。
    await dragCells([1, 1], [2, 1]);
    await clickMerge();
    const slid = await cellShape(1, 1);
    await useTool("row-delete", 0, 0);
    const afterDelete = await cellShape(0, 1);
    result.headerDeleteAutoSplitsSlidingMerge = slid.rowSpan === 2
      && afterDelete !== null && afterDelete.rowSpan === 1 && afterDelete.tag === "TH"
      && (await cellShape(1, 1)) !== null;

    return result;
  } finally {
    await fresh.close();
  }
}
