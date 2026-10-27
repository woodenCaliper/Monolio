// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の切り取り→貼り付けと並べ替えを Excel と同じに(v246。Issue #87 「87はexcelと同じにできる？」) ----
// v242 までは:
//   - 範囲の切り取りは「値をコピーして、その場で空にする」。貼ると式は値になり、切り取ったセルを指していた式は元の(空の)
//     場所を読み続けた(=SUM(A1:A2) が 0)
//   - 並べ替えは「式は動いたセルについていく」。上の行を足していく累計の式が、並べ替えると累計にならなかった
// いまは Excel と同じ:
//   - 切り取りはその場で消さず点線で囲む。同じ表へ貼ると式ごと移り、移したセルを指す式・グラフの範囲は移した先を指す。
//     範囲は全部が切り取った範囲の中のときだけ移る。上書きされたセルを指していた参照は #REF。Undo 1手
//   - Esc・ほかの編集でやめる。別の表へ貼ると値を貼って元を空にする。表の外へ貼っても元は残る。結合が掛かれば移さない
//   - 並べ替えは、行を新しい位置へコピーした扱い(相対の行の参照が動いた行数ぶんずれる)。累計の式は並べ替えた順で計算し直す
export default async function tableCutSortSuite({ browser }) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1300, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const c = (text, extra = {}) => ({ text, colSpan: 1, rowSpan: 1, ...extra });
  const grid = (lines) => lines.map((line) => line.map((text) => (typeof text === "object" ? c(text.text, text) : c(text))));
  let opened = 0;
  const openBlocks = async (blocks) => {
    const title = "CutSort" + (opened += 1);
    const path = join(OUT, "table-cut-sort-" + opened + ".html");
    const literal = { pages: [{ id: "Q" + opened, title, blocks }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const sel = (id, r, k) => '#blocks .block[data-id="' + id + '"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]';
  const cell = (id, r, k) => fresh.locator(sel(id, r, k));
  const click = async (id, r, k) => {
    await cell(id, r, k).click();
    await fresh.waitForTimeout(150);
  };
  const drag = async (id, r0, c0, r1, c1) => {
    const a = await cell(id, r0, c0).boundingBox();
    const b = await cell(id, r1, c1).boundingBox();
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
  const texts = (id) => fresh.evaluate((bid) => [...document.querySelectorAll('#blocks .block[data-id="' + bid + '"] .editor-table tr')]
    .map((tr) => [...tr.children].map((td) => td.textContent).join("|")).join("/"), id);
  // 式のセルは生の式(title)を読む。
  const raws = (id) => fresh.evaluate((bid) => [...document.querySelectorAll('#blocks .block[data-id="' + bid + '"] .editor-table tr')]
    .map((tr) => [...tr.children].map((td) => (td.classList.contains("formula-cell") && td.title ? td.title : td.textContent)).join("|")).join("/"), id);
  const frames = () => fresh.evaluate(() => document.querySelectorAll("#blocks .table-cut-frame").length);
  const clipboardText = () => fresh.evaluate(() => navigator.clipboard.readText());
  const status = () => fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
  const tool = async (key) => {
    await fresh.locator('#table-toolbar [data-tool="' + key + '"]').click();
    await fresh.waitForTimeout(150);
  };
  const menu = async (toolKey, itemKey) => {
    await tool(toolKey);
    await fresh.locator('.table-tool-menu [data-key="' + itemKey + '"]').click();
    await fresh.waitForTimeout(200);
  };
  let saved = 0;
  const saveAndRead = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "table-cut-sort-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html);
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 切り取って同じ表へ貼る(A1:B2 → A3)。
    //    A1:B2 = 1 2 / 3 4。C1 =A1+B1(中を指す1つのセル)、C2 =SUM(A1:B2)(全部が中の範囲)、C3 =A2*10、
    //    C4 =SUM(A1:A3)(一部だけ掛かる範囲 → 動かさない)、C5 =B4(上書きされるセル → #REF)。グラフ bar(A1:A2, B1:B2)。
    const base = () => [
      { id: "T", type: "table", rows: grid([
        ["1", "2", "=A1+B1"],
        ["3", "4", "=SUM(A1:B2)"],
        ["", "", "=A2*10"],
        ["x", "y", "=SUM(A1:A3)"],
        ["", "", "=B4"],
      ]) },
      { id: "P", type: "paragraph", text: "本文" },
      { id: "G", type: "chart", text: 'table(id="T")\nbar(A1:A2, B1:B2)' },
      { id: "U", type: "table", rows: grid([["p", "q", "r"], ["s", "t", "u"]]) },
    ];
    await openBlocks(base());
    const before = await raws("T");
    await drag("T", 0, 0, 1, 1);
    await press("Control+x");
    const cutClipboard = await clipboardText();
    const afterCut = await raws("T");
    const cutFrames = await frames();
    await click("T", 2, 0);
    await press("Control+v");
    const moved = await raws("T");
    const movedValues = await texts("T");
    const movedChart = (await saveAndRead()).pages[0].blocks.find((block) => block.id === "G")?.text;
    const framesAfterPaste = await frames();
    await press("Control+z");
    const undone = await raws("T");
    result.tableCutKeepsCellsUntilPaste = cutClipboard === "1\t2\n3\t4" && afterCut === before && cutFrames === 1;
    result.tableCutPasteMovesFormulas = moved === "||=A3+B3/||=SUM(A3:B4)/1|2|=A4*10/3|4|=SUM(A1:A3)/||=#REF"
      && movedValues === "||3/||10/1|2|30/3|4|1/||#REF" && framesAfterPaste === 0;
    result.tableCutPasteMovesChartRange = movedChart === 'table(id="T")\nbar(A3:A4, B3:B4)';
    result.tableCutPasteUndoOneStep = undone === before;
    result.tableCutPasteEvidence = JSON.stringify({ cutClipboard, afterCut, cutFrames, moved, movedValues, movedChart, framesAfterPaste, undone });

    // 2) Esc でやめる → 点線が消え、貼ると普通の貼り付け(値)。元は残る。
    await drag("T", 0, 0, 0, 1);
    await press("Control+x");
    const framesBeforeEsc = await frames();
    await press("Escape");
    const framesAfterEsc = await frames();
    await click("T", 4, 0);
    await press("Control+v");
    const escPasted = await raws("T");
    await press("Control+z");
    result.tableCutEscCancels = framesBeforeEsc === 1 && framesAfterEsc === 0
      && escPasted === "1|2|=A1+B1/3|4|=SUM(A1:B2)/||=A2*10/x|y|=SUM(A1:A3)/1|2|=B4";

    // 3) 切り取ったあとにほかの編集をしたら、切り取りはやめになる(貼っても移さない)。
    await drag("T", 0, 0, 0, 1);
    await press("Control+x");
    await click("T", 2, 0);
    await fresh.keyboard.type("z");
    await press("Enter");
    const framesAfterEdit = await frames();
    await click("T", 4, 0);
    await press("Control+v");
    const editPasted = await raws("T");
    await press("Control+z");
    await press("Control+z");
    result.tableCutEditCancels = framesAfterEdit === 0
      && editPasted === "1|2|=A1+B1/3|4|=SUM(A1:B2)/z||=A2*10/x|y|=SUM(A1:A3)/1|2|=B4";

    // 4) 表の外(段落)へ貼っても、元は残る(Excel と同じ)。
    await drag("T", 0, 0, 0, 1);
    await press("Control+x");
    await fresh.locator('#blocks .block-content[data-id="P"]').click();
    await fresh.keyboard.press("End");
    await press("Control+v");
    const paragraph = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="P"]').textContent);
    result.tableCutPasteOutsideKeepsSource = paragraph.includes("本文1\t2") && (await raws("T")) === before;
    await press("Control+z");
    await press("Escape");

    // 5) 別の表へ貼る → 値を貼って、元の範囲を空にする。Undo 1手で両方戻る。
    await drag("T", 0, 0, 0, 1);
    await press("Control+x");
    await click("U", 1, 1);
    await press("Control+v");
    const otherTable = await texts("U");
    const otherSource = await raws("T");
    await press("Control+z");
    result.tableCutPasteOtherTableMovesValues = otherTable === "p|q|r/s|1|2"
      && otherSource === "||=A1+B1/3|4|=SUM(A1:B2)/||=A2*10/x|y|=SUM(A1:A3)/||=B4";
    result.tableCutPasteOtherTableUndoOneStep = (await texts("U")) === "p|q|r/s|t|u" && (await raws("T")) === before;
    result.tableCutOtherTableEvidence = JSON.stringify({ otherTable, otherSource });

    // 6) 移した先に結合したセルが掛かるなら移さず、そう伝える(何も変わらない)。
    await openBlocks([{ id: "T", type: "table", rows: grid([
      ["1", "2", "3"],
      [{ text: "M", colSpan: 2 }, { text: "", covered: true }, "c"],
    ]) }]);
    const mergedBefore = await raws("T");
    await drag("T", 0, 0, 0, 1);
    await press("Control+x");
    await click("T", 1, 0);
    await press("Control+v");
    result.tableCutPasteRefusesMerged = (await raws("T")) === mergedBefore && (await status()).includes("結合");
    await press("Escape");

    // 7) 並べ替え: 上の行を足していく累計の式(C2 =C1+B2 …)は、並べ替えた順で計算し直す(Excel と同じ)。
    //    同じ行を指す式(D =B*2)は同じ行を指したまま。$ の付いた行は動かない(E =B2/$B$2 → どの行でも $B$2)。
    await openBlocks([{ id: "S", type: "table", tableHeader: true, rows: grid([
      ["品", "数", "累計", "倍", "比"],
      ["a", "30", "=C1+B2", "=B2*2", "=B2/$B$2"],
      ["b", "10", "=C2+B3", "=B3*2", "=B3/$B$2"],
      ["c", "20", "=C3+B4", "=B4*2", "=B4/$B$2"],
    ]) }]);
    await click("S", 1, 1);
    await menu("sort", "asc");
    const sorted = await raws("S");
    const sortedValues = await texts("S");
    await press("Control+z");
    result.tableSortShiftsRelativeRows = sorted === "品|数|累計|倍|比/b|10|=C1+B2|=B2*2|=B2/$B$2/c|20|=C2+B3|=B3*2|=B3/$B$2/a|30|=C3+B4|=B4*2|=B4/$B$2";
    result.tableSortRecomputesRunningTotal = sortedValues.startsWith("品|数|累計|倍|比/b|10|10|20|1/c|20|30|40|2/a|30|60|60|3");
    result.tableSortEvidence = JSON.stringify({ sorted, sortedValues });

    result.tableCutSortNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.tableCutSortPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
