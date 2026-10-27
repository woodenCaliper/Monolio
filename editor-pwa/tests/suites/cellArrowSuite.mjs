// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 表セルの上下キー移動 (Excel / スプレッドシート風) ----
// 文書全体の状態に依存しないよう、新しいページで検証する。
export default async function cellArrowSuite({ context }) {
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
    const focusCell = async (r, c) => {
      await fresh.evaluate((selector) => {
        document.querySelector(selector)?.focus();
      }, cellSelector(r, c));
      await fresh.waitForTimeout(120);
    };
    const activeInfo = () => fresh.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName || "",
        row: el?.dataset?.row ?? null,
        cell: el?.dataset?.cell ?? null,
        isBlock: Boolean(el?.classList?.contains("block-content")),
        text: el?.textContent || "",
        rowSpan: el?.rowSpan || 1,
      };
    });
    // アクティブ要素の中のキャレット位置(先頭からの文字数と全文字数)。
    // 左右移動の「移動先で先頭/末尾に置く」仕様を確かめるのに使う。
    const caretPosInActive = () => fresh.evaluate(() => {
      const el = document.activeElement;
      const selection = getSelection();
      if (!el || !selection?.rangeCount) return null;
      const range = selection.getRangeAt(0);
      if (!el.contains(range.startContainer)) return null;
      const probe = document.createRange();
      probe.selectNodeContents(el);
      probe.setEnd(range.startContainer, range.startOffset);
      return { before: probe.toString().length, total: (el.textContent || "").length };
    });
    // キャレットをセル本文の指定位置へ置く(中間位置のテスト用)。
    const placeCaretAt = async (r, c, offset) => {
      await fresh.evaluate(([selector, at]) => {
        const td = document.querySelector(selector);
        td.focus();
        const range = document.createRange();
        range.setStart(td.firstChild, at);
        range.collapse(true);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }, [cellSelector(r, c), offset]);
      await fresh.waitForTimeout(120);
    };
    // 素の focus() はキャレットをセルの先頭に置く(実測済み)。「最下行にいる」
    // 前提のテストでは、アプリの focusTableCell と同じ置き方で末尾に置いてから測る。
    const placeCaretAtEnd = async (r, c) => {
      await fresh.evaluate((selector) => {
        const td = document.querySelector(selector);
        td.focus();
        const range = document.createRange();
        range.selectNodeContents(td);
        range.collapse(false);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }, cellSelector(r, c));
      await fresh.waitForTimeout(120);
    };
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
      await fresh.waitForTimeout(200);
    };

    // 表の前後に段落を置く(端からの脱出先が要る)。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("before table");
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const tableId = await fresh.evaluate(() => document.querySelector("#blocks .block.type-table").dataset.id);
    await fresh.locator('#blocks .block[data-id="' + tableId + '"] .insert-block').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("after table");
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) await setCell(r, c, "r" + r + "c" + c);
    }

    // ↓ で同じ列の下のセルへ、↑ で上のセルへ。
    await focusCell(0, 1);
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(120);
    const movedDown = await activeInfo();
    result.tableArrowDownMovesToCellBelow = movedDown.row === "1" && movedDown.cell === "1";
    await focusCell(1, 1);
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(120);
    const movedUp = await activeInfo();
    result.tableArrowUpMovesToCellAbove = movedUp.row === "0" && movedUp.cell === "1";

    // 先頭行の ↑ と最終行の ↓ は、これまでどおり表の外のブロックへ出る。
    // (↑の脱出はキャレットが文頭にあるときだけなので、空セルで確かめる)
    await setCell(0, 1, "");
    await focusCell(0, 1);
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(120);
    const escapedUp = await activeInfo();
    result.tableArrowUpAtTopLeavesTable = escapedUp.isBlock && escapedUp.text === "before table";
    await setCell(0, 1, "r0c1");
    await placeCaretAtEnd(2, 1);
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(120);
    const escapedDown = await activeInfo();
    result.tableArrowDownAtBottomLeavesTable = escapedDown.isBlock && escapedDown.text === "after table";

    // 移動先が表の右下(最後)のセルでも、表の外へ抜けずにセルに入って留まる。
    // セル移動の keydown が .block-content へ伝播すると、移動後のキャレットが
    // 本文末尾にあるため moveAcrossBlocks が二重に働いて脱出してしまう(Bug-T1)。
    await placeCaretAtEnd(1, 2);
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(120);
    const intoLastCell = await activeInfo();
    result.tableArrowDownIntoLastCellStays = intoLastCell.tag === "TD"
      && intoLastCell.row === "2" && intoLastCell.cell === "2";
    // 空の先頭セル(0,0)への ↑ も同じ機序で抜けない。移動先のキャレットが
    // 表ブロック本文の先頭に立つため、伝播すると「文頭にいる」と誤判定される。
    await setCell(0, 0, "");
    await focusCell(1, 0);
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(120);
    const intoEmptyTop = await activeInfo();
    result.tableArrowUpIntoEmptyTopCellStays = intoEmptyTop.tag === "TD"
      && intoEmptyTop.row === "0" && intoEmptyTop.cell === "0";
    await setCell(0, 0, "r0c0");

    // ---- 左右キーのセル間移動 ----
    // 末尾の → で右隣のセルへ(移動先は先頭)。
    await placeCaretAtEnd(0, 0);
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(120);
    const rightMoved = await activeInfo();
    const rightCaret = await caretPosInActive();
    result.tableArrowRightAtEndMovesToNextCell = rightMoved.row === "0" && rightMoved.cell === "1"
      && rightCaret?.before === 0;
    // 先頭の ← で左隣のセルへ(移動先は末尾)。
    await placeCaretAt(0, 1, 0);
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(120);
    const leftMoved = await activeInfo();
    const leftCaret = await caretPosInActive();
    result.tableArrowLeftAtStartMovesToPreviousCell = leftMoved.row === "0" && leftMoved.cell === "0"
      && leftCaret?.before === leftCaret?.total && (leftCaret?.total || 0) > 0;
    // 文字の途中では移動せず、ブラウザ既定のキャレット移動のまま。
    await placeCaretAt(0, 1, 2);
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(120);
    const midRight = await activeInfo();
    const midRightCaret = await caretPosInActive();
    await placeCaretAt(0, 1, 2);
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(120);
    const midLeft = await activeInfo();
    const midLeftCaret = await caretPosInActive();
    result.tableArrowSidewaysMidTextStaysInCell = midRight.row === "0" && midRight.cell === "1"
      && midRightCaret?.before === 3
      && midLeft.row === "0" && midLeft.cell === "1"
      && midLeftCaret?.before === 1;
    // 行の右端の → は次の行の先頭セルへ、行の左端の ← は前の行の末尾セルへ折り返す。
    await placeCaretAtEnd(0, 2);
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(120);
    const wrappedRight = await activeInfo();
    const wrappedRightCaret = await caretPosInActive();
    result.tableArrowRightWrapsToNextRow = wrappedRight.row === "1" && wrappedRight.cell === "0"
      && wrappedRightCaret?.before === 0;
    await placeCaretAt(1, 0, 0);
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(120);
    const wrappedLeft = await activeInfo();
    const wrappedLeftCaret = await caretPosInActive();
    result.tableArrowLeftWrapsToPreviousRowEnd = wrappedLeft.row === "0" && wrappedLeft.cell === "2"
      && wrappedLeftCaret?.before === wrappedLeftCaret?.total;
    // 表全体の端では表の外のブロックへ出る。
    await placeCaretAtEnd(2, 2);
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(120);
    const rightEscaped = await activeInfo();
    result.tableArrowRightAtLastCellLeavesTable = rightEscaped.isBlock && rightEscaped.text === "after table";
    await placeCaretAt(0, 0, 0);
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(120);
    const leftEscaped = await activeInfo();
    result.tableArrowLeftAtFirstCellLeavesTable = leftEscaped.isBlock && leftEscaped.text === "before table";

    // 折り返しで複数行になったセルでは、まずセル内の行移動が優先される。
    // 最上の表示行に達してから、もう一度 ↑ で上のセルへ移る。
    await setCell(1, 1, "w".repeat(120));
    await placeCaretAtEnd(1, 1);
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(120);
    const stillInside = await activeInfo();
    result.tableArrowUpStaysInsideMultilineCell = stillInside.row === "1" && stillInside.cell === "1";
    let reached = null;
    for (let i = 0; i < 8; i += 1) {
      await fresh.keyboard.press("ArrowUp");
      await fresh.waitForTimeout(100);
      const info = await activeInfo();
      if (!(info.row === "1" && info.cell === "1")) {
        reached = info;
        break;
      }
    }
    result.tableArrowUpLeavesMultilineCellAtTopLine = reached !== null
      && reached.row === "0" && reached.cell === "1";
    await setCell(1, 1, "r1c1");

    // ヘッダー行(th)でも同じように行き来できる。
    await useTool("header", 0, 2);
    await focusCell(1, 2);
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(120);
    const upToHeader = await activeInfo();
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(120);
    const backToBody = await activeInfo();
    result.tableArrowMovesAcrossHeaderRow = upToHeader.tag === "TH"
      && upToHeader.row === "0" && upToHeader.cell === "2"
      && backToBody.tag === "TD" && backToBody.row === "1" && backToBody.cell === "2";
    // ヘッダー行(th)の中でも ←→ でセルを行き来できる。
    await placeCaretAtEnd(0, 1);
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(120);
    const headerRight = await activeInfo();
    result.tableArrowRightWorksInHeaderRow = headerRight.tag === "TH"
      && headerRight.row === "0" && headerRight.cell === "2";
    await useTool("header", 0, 2);

    // 縦に結合したセルの上では、覆われた位置を飛ばして本体セルと行き来する。
    await dragCells([0, 0], [1, 0]);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(300);
    await focusCell(2, 0);
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(120);
    const ontoMerged = await activeInfo();
    result.tableArrowUpSkipsCoveredCell = ontoMerged.row === "0" && ontoMerged.cell === "0"
      && ontoMerged.rowSpan === 2;
    await focusCell(0, 0);
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(120);
    const belowMerged = await activeInfo();
    result.tableArrowDownFromMergedCellSkipsCoveredRows = belowMerged.row === "2" && belowMerged.cell === "0";
    // (1,0) は縦結合で覆われているので、(1,1) の先頭からの ← は本体 (0,0) へ。
    await placeCaretAt(1, 1, 0);
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(120);
    const leftOntoMerged = await activeInfo();
    result.tableArrowLeftSkipsCoveredCell = leftOntoMerged.row === "0" && leftOntoMerged.cell === "0"
      && leftOntoMerged.rowSpan === 2;

    return result;
  } finally {
    await fresh.close();
  }
}
