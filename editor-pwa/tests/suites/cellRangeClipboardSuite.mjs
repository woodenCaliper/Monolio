// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表のセル範囲のコピー・切り取り・削除と、表計算の範囲の貼り付け(v213) ----
// v208 までは、セルをドラッグして範囲を選んでも:
//   - Ctrl+C でクリップボードが変わらなかった(範囲の値が載らない)
//   - Delete / Backspace で先頭のセル1つだけが消えた
//   - 表計算からコピーしたタブ区切り("10\t20\n30\t40\n")を貼ると、1つのセルへタブと改行ごと入った
// 表計算(Excel・スプレッドシート)と同じに: コピーは見えている値のタブ区切り、Delete は範囲を全部空に(Undo 1手)、
// 切り取りはコピー+空に(Undo 1手。v246 からは貼ったときに移す。tableCutSortSuite)、タブ区切り・複数行の貼り付けはアクティブなセル(範囲なら左上)から1マスずつ
// (足りなければ行・列を足す。Undo 1手。式は計算し直す)。1行でタブの無い文字は今までどおりセルの中へ。
// 実際のキー(Ctrl+C / Ctrl+V)でクリップボードを通すため、読み書きを許した別の文脈で確かめる。
export default async function cellRangeClipboardSuite({ browser }) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1400, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const cells = (...values) => values.map((text) => ({ text }));
    const openLiteral = async (blocks) => {
      const title = "CellRange" + (opened += 1);
      const literal = { title, fonts: [], attachments: [], pages: [{ id: "CR1", title, blocks }] };
      const source = join(OUT, "cell-range-" + opened + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    const sel = (r, c) => '#blocks .block[data-id="T1"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
    // 表の見た目(行ごとの td/th の文字。結合で覆われた位置は出ない)。
    const grid = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="T1"] .editor-table tr')]
      .map((tr) => [...tr.querySelectorAll("td, th")].map((td) => td.textContent)));
    // 式のセルは生の式(title)を読む。
    const raw = (r, c) => fresh.evaluate((s) => {
      const td = document.querySelector(s);
      if (!td) return null;
      return td.classList.contains("formula-cell") && td.title ? td.title : td.textContent;
    }, sel(r, c));
    const selectedCount = () => fresh.evaluate(() => document.querySelectorAll("#blocks .editor-table .cell-selected").length);
    const clipboardText = () => fresh.evaluate(() => navigator.clipboard.readText());
    const setClipboard = (text) => fresh.evaluate((value) => navigator.clipboard.writeText(value), text);
    const status = () => fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
    const click = async (r, c) => {
      await fresh.locator(sel(r, c)).click();
      await fresh.waitForTimeout(150);
    };
    const drag = async (r0, c0, r1, c1) => {
      const a = await fresh.locator(sel(r0, c0)).boundingBox();
      const b = await fresh.locator(sel(r1, c1)).boundingBox();
      await fresh.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(200);
    };
    const press = async (key) => {
      await fresh.keyboard.press(key);
      await fresh.waitForTimeout(250);
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const base = () => [
      { id: "P1", type: "paragraph", text: "before" },
      { id: "T1", type: "table", text: "", rows: [cells("1", "2", "=A1+B1"), cells("4", "a\tb", "6"), cells("7", "8", "9")] },
      { id: "P2", type: "paragraph", text: "after" },
    ];
    const BASE_GRID = [["1", "2", "3"], ["4", "a\tb", "6"], ["7", "8", "9"]];

    // 1) 範囲(B1:C2)を選んで Ctrl+C → クリップボードは見えている値のタブ区切り。式(C1 = A1+B1)は計算した値 3、
    //    タブを含む値は " で囲む(表計算と同じ。貼り戻すと1つのセルに戻る)。
    await openLiteral(base());
    await setClipboard("EMPTY");
    await drag(0, 1, 1, 2);
    await press("Control+c");
    const copied = await clipboardText();
    result.cellRangeCopyWritesTsvOfValues = copied === '2\t3\n"a\tb"\t6';
    if (!result.cellRangeCopyWritesTsvOfValues) result.cellRangeCopyWritesTsvOfValuesDetail = JSON.stringify(copied);

    // 2) そのまま Delete → 範囲の4セルが全部空になり、範囲の外は残る。範囲は選んだまま。Undo 1手で全部戻る。
    await press("Delete");
    const afterDelete = await grid();
    const stillSelected = await selectedCount();
    await press("Control+z");
    const afterUndo = await grid();
    result.cellRangeDeleteClearsAllCells = same(afterDelete, [["1", "", ""], ["4", "", ""], ["7", "8", "9"]]) && stillSelected === 4;
    result.cellRangeDeleteUndoIsOneStep = same(afterUndo, BASE_GRID);
    if (!result.cellRangeDeleteClearsAllCells || !result.cellRangeDeleteUndoIsOneStep) {
      result.cellRangeDeleteDetail = JSON.stringify({ afterDelete, stillSelected, afterUndo });
    }

    // 3) Backspace も同じ(縦の範囲 A2:A3)。
    await drag(1, 0, 2, 0);
    await press("Backspace");
    const afterBackspace = await grid();
    await press("Control+z");
    result.cellRangeBackspaceClearsAllCells = same(afterBackspace, [["1", "2", "3"], ["", "a\tb", "6"], ["", "8", "9"]])
      && same(await grid(), BASE_GRID);

    // 4) Ctrl+X → 値のタブ区切りをクリップボードへ。その場では消さない(v246。貼ったときに移す。Excel と同じ。
    //    移し方は tableCutSortSuite)。Esc でやめる。
    await setClipboard("EMPTY");
    await drag(0, 0, 0, 1);
    await press("Control+x");
    const cut = await clipboardText();
    const afterCut = await grid();
    await press("Escape");
    result.cellRangeCutCopiesAndKeepsCells = cut === "1\t2" && same(afterCut, BASE_GRID);
    if (!result.cellRangeCutCopiesAndKeepsCells) result.cellRangeCutDetail = JSON.stringify({ cut, afterCut });

    // 5) 範囲を選んだあとセルへ文字を打つと範囲は解ける。打ち間違いを Backspace で直しても、範囲の他のセルは消えない。
    await drag(1, 0, 2, 2);
    await fresh.keyboard.type("Q");
    await press("Backspace");
    result.cellRangeTypingReleasesRange = same(await grid(), BASE_GRID) && (await selectedCount()) === 0;

    // 6) 表計算のタブ区切り(末尾の改行つき)を B3 で Ctrl+V → B3 から1マスずつ入り、足りない行を下へ足す。
    //    式は計算し直す(C4 = A3+B3 = 7+10)。末尾の改行で空の行は増えない。Undo 1手で行の追加ごと戻る。
    await click(2, 1);
    await setClipboard("10\t20\n30\t=A3+B3\n");
    await press("Control+v");
    const afterPaste = await grid();
    const pastedFormula = await raw(3, 2);
    result.cellGridPasteFillsFromActiveCell = same(afterPaste, [["1", "2", "3"], ["4", "a\tb", "6"], ["7", "10", "20"], ["", "30", "17"]])
      && pastedFormula === "=A3+B3";
    if (!result.cellGridPasteFillsFromActiveCell) result.cellGridPasteDetail = JSON.stringify({ afterPaste, pastedFormula });
    result.cellGridPasteSelectsPastedRange = (await selectedCount()) === 4;
    await press("Control+z");
    result.cellGridPasteUndoIsOneStep = same(await grid(), BASE_GRID);

    // 7) 1行でも列が足りなければ右へ列を足す(C1 に3列)。
    await click(0, 2);
    await setClipboard("x\ty\tz");
    await press("Control+v");
    result.cellGridPasteAddsColumns = same(await grid(), [["1", "2", "x", "y", "z"], ["4", "a\tb", "6", "", ""], ["7", "8", "9", "", ""]]);
    await press("Control+z");

    // 8) 範囲を選んでいれば、範囲の左上から貼る(右下から左上へドラッグしても左上)。
    await drag(2, 2, 1, 1);
    await setClipboard("p\tq\n");
    await press("Control+v");
    result.cellGridPasteStartsAtRangeTopLeft = same(await grid(), [["1", "2", "3"], ["4", "p", "q"], ["7", "8", "9"]]);
    await press("Control+z");

    // 9) 1行でタブの無い文字は今までどおり、そのセルの中へ(ほかのセルは変わらない)。
    await click(2, 2);
    await fresh.keyboard.press("End");
    await setClipboard("Z");
    await press("Control+v");
    result.cellSingleLinePasteStaysInCell = same(await grid(), [["1", "2", "3"], ["4", "a\tb", "6"], ["7", "8", "9Z"]]);
    await press("Control+z");

    // 10) コピーした範囲を別の場所へ貼り戻す(往復)。タブを含む値は1つのセルに戻る。
    await drag(1, 0, 1, 2);
    await press("Control+c");
    await click(2, 0);
    await press("Control+v");
    result.cellRangeCopyPasteRoundTrip = same(await grid(), [["1", "2", "3"], ["4", "a\tb", "6"], ["4", "a\tb", "6"]]);
    await press("Control+z");

    // 11) 範囲のコピーを本文の段落へ貼っても、段落の中に表(<table>)は入らない(文字として入る)。
    await drag(0, 0, 0, 1);
    await press("Control+c");
    await fresh.locator('#blocks .block-content[data-id="P2"]').click();
    await fresh.keyboard.press("End");
    await press("Control+v");
    const paragraph = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="P2"]').innerHTML);
    result.cellRangePasteIntoParagraphIsText = !paragraph.includes("<table") && paragraph.includes("after1\t2");
    if (!result.cellRangePasteIntoParagraphIsText) result.cellRangePasteIntoParagraphDetail = paragraph;
    await press("Control+z");

    // 12) 結合セル: 範囲に左上が入っている結合は消え、左上が範囲の外の結合は(一部が範囲に掛かっていても)消えない。
    //     結合が掛かる場所への表計算の貼り付けは、貼らずにそう伝える(結合を壊さない)。
    await openLiteral([
      { id: "T1", type: "table", text: "", rows: [
        [{ text: "M", colSpan: 2, rowSpan: 1 }, { text: "", covered: true }, { text: "c1" }],
        [{ text: "a2" }, { text: "N", colSpan: 1, rowSpan: 2 }, { text: "c2" }],
        [{ text: "a3" }, { text: "", covered: true }, { text: "c3" }],
      ] },
    ]);
    // 範囲 A1:A2(結合 M の左上 A1 が入る)→ M・a2 が消える。
    await drag(0, 0, 1, 0);
    await press("Delete");
    const mergedA = await grid();
    await press("Control+z");
    // 範囲 A3:C3 は結合 N(左上 B2)の下半分だけに掛かる → N は残り、a3・c3 だけが消える。
    await drag(2, 0, 2, 2);
    await press("Delete");
    const mergedB = await grid();
    await press("Control+z");
    result.cellRangeDeleteHandlesMerged = same(mergedA, [["", "c1"], ["", "N", "c2"], ["a3", "c3"]])
      && same(mergedB, [["M", "c1"], ["a2", "N", "c2"], ["", ""]]);
    if (!result.cellRangeDeleteHandlesMerged) result.cellRangeDeleteMergedDetail = JSON.stringify({ mergedA, mergedB });
    await click(1, 0);
    await setClipboard("u\tv\nw\tx\n");
    await press("Control+v");
    result.cellGridPasteRefusesMergedTarget = same(await grid(), [["M", "c1"], ["a2", "N", "c2"], ["a3", "c3"]])
      && (await status()).includes("結合");
  } finally {
    await context.close();
  }
  return result;
}
