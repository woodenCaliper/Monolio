// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の Excel の基本機能(v232) ----
// ユーザー指示「全部対応してほしい」(足りない Excel の基本機能の一覧に対して): Shift+矢印の範囲選択・配置・数の見せ方・関数(COUNT・ROUND・
// IF など)・$ の絶対参照(F4)・並べ替え・絞り込み。どれも Ctrl+Z 1回で戻り、保存HTMLでも同じに見える(P7)。
export default async function tableExcelSuite({ browser }) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1200, height: 860 } });
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
    const title = "Excel" + (opened += 1);
    const path = join(OUT, "table-excel-" + opened + ".html");
    const literal = { pages: [{ id: "X" + opened, title, blocks }], fonts: [], attachments: [] };
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
  const press = async (key) => {
    await fresh.keyboard.press(key);
    await fresh.waitForTimeout(150);
  };
  // 見えている行(隠した行は [隠] を付ける)を「|」と「/」でつないだ文字。
  const texts = (id) => fresh.evaluate((bid) => [...document.querySelectorAll('#blocks .block[data-id="' + bid + '"] .editor-table tr')]
    .map((tr) => (tr.hidden ? "[隠]" : "") + [...tr.children].map((td) => td.textContent).join("|")).join("/"), id);
  const selected = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .cell-selected")].map((node) => node.dataset.row + ":" + node.dataset.cell).join(","));
  const raw = (id, r, k) => fresh.evaluate((s) => {
    const td = document.querySelector(s);
    if (!td) return null;
    return td.classList.contains("formula-cell") && td.title ? td.title : td.textContent;
  }, sel(id, r, k));
  const tool = async (key) => {
    await fresh.locator('#table-toolbar [data-tool="' + key + '"]').click();
    await fresh.waitForTimeout(150);
  };
  const menu = async (toolKey, itemKey) => {
    await tool(toolKey);
    await fresh.locator('.table-tool-menu [data-key="' + itemKey + '"]').click();
    await fresh.waitForTimeout(200);
  };
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
  };
  let saved = 0;
  const saveAndRead = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "table-excel-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    const doc = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html);
    return { html, path, doc };
  };
  // 保存HTMLをブラウザで開いて、表の行を読む(隠した行は [隠])。
  const viewSaved = async (path) => {
    const view = await context.newPage();
    try {
      await view.goto("file:///" + path.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      return await view.evaluate(() => [...document.querySelectorAll("table.doc-table")].map((table) => ({
        rows: [...table.rows].map((tr) => (tr.hidden || getComputedStyle(tr).display === "none" ? "[隠]" : "") + [...tr.cells].map((td) => td.textContent + (td.style.textAlign ? "@" + td.style.textAlign : "")).join("|")).join("/"),
        note: table.closest(".doc-table-scroll")?.nextElementSibling?.className === "doc-table-filter-note"
          ? table.closest(".doc-table-scroll").nextElementSibling.textContent
          : table.nextElementSibling?.className === "doc-table-filter-note" ? table.nextElementSibling.textContent : "",
      })));
    } finally {
      await view.close();
    }
  };
  const readClipboard = () => fresh.evaluate(() => navigator.clipboard.readText());

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) Shift+矢印: セルの端(文字の終わり)から Shift+↓ で範囲を下へ伸ばし、Shift+→ で右へ、Shift+↑ で縮める。
    //    文字の途中の Shift+← は文字の選択のまま(範囲にしない)。Shift なしの矢印で範囲は解ける。
    //    範囲が無くても Shift+クリックで今のセルからの範囲になる。
    await openBlocks([{ id: "t", type: "table", rows: grid([["a1", "b1", "c1"], ["a2", "b2", "c2"], ["a3", "b3", "c3"], ["a4", "b4", "c4"]]) }]);
    await click("t", 1, 1);
    await press("End");
    await press("Shift+ArrowDown");
    await press("Shift+ArrowDown");
    const down2 = await selected();
    await press("Shift+ArrowRight");
    const right1 = await selected();
    await press("Shift+ArrowUp");
    const up1 = await selected();
    await press("ArrowLeft");
    const cleared = await selected();
    await click("t", 0, 0);
    await press("End");
    await press("ArrowLeft");
    await press("Shift+ArrowLeft");
    const midText = { range: await selected(), text: await fresh.evaluate(() => getSelection().toString()) };
    await click("t", 0, 0);
    await cell("t", 2, 2).click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(150);
    const shiftClick = await selected();
    result.tableShiftArrowExtendsRange = down2 === "1:1,2:1,3:1" && right1 === "1:1,1:2,2:1,2:2,3:1,3:2" && up1 === "1:1,1:2,2:1,2:2";
    result.tableShiftArrowInsideTextSelectsText = cleared === "" && midText.range === "" && midText.text === "a";
    result.tableShiftClickStartsRangeFromActiveCell = shiftClick === "0:0,0:1,0:2,1:0,1:1,1:2,2:0,2:1,2:2";
    result.tableShiftArrowEvidence = JSON.stringify({ down2, right1, up1, cleared, midText, shiftClick });

    // 2) 配置: 範囲を右寄せ → 範囲のセルが右寄せ。同じボタンをもう一度で外れる。Ctrl+Z 1回で戻る。保存HTMLも右寄せ。
    //    書式のクリア(Tx)で外れる。開き直しても残る。
    await openBlocks([{ id: "t", type: "table", rows: grid([["名", "数"], ["x", "1"], ["y", "2"]]) }]);
    await click("t", 1, 1);
    await press("End");
    await press("Shift+ArrowDown");
    await tool("align-right");
    const alignOf = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] td')].map((td) => td.style.textAlign || "-").join(","));
    const aligned = await alignOf();
    const pressed = await fresh.evaluate(() => document.querySelector('#table-toolbar [data-tool="align-right"]')?.getAttribute("aria-pressed"));
    const alignSaved = await saveAndRead();
    const alignView = await viewSaved(alignSaved.path);
    const alignModel = alignSaved.doc.pages[0].blocks[0].rows.map((row) => row.map((one) => one.align || "-").join(",")).join("/");
    await undo();
    const afterUndo = await alignOf();
    await click("t", 1, 1);
    await tool("align-center");
    await tool("align-center");
    const toggledOff = await alignOf();
    await tool("align-center");
    await fresh.locator("#format-reset").click();
    await fresh.waitForTimeout(150);
    const resetOff = await alignOf();
    result.tableAlignAppliesToRange = aligned === "-,-,-,right,-,right" && pressed === "true" && alignModel === "-,-/-,right/-,right";
    result.tableAlignSavedHtml = alignView[0].rows === "名|数/x|1@right/y|2@right";
    result.tableAlignUndoToggleAndReset = afterUndo === "-,-,-,-,-,-" && toggledOff === "-,-,-,-,-,-" && resetOff === "-,-,-,-,-,-";
    result.tableAlignEvidence = JSON.stringify({ aligned, pressed, alignModel, view: alignView[0].rows, afterUndo, toggledOff, resetOff });

    // 3) 数の見せ方: 桁区切り・パーセント・小数の桁。式の結果にも効く。編集中は元の文字。コピーは元の値。保存HTMLも同じ見え方。
    await openBlocks([{ id: "t", type: "table", rows: grid([["1234567.5", "0.256", "=A1*2"], ["5", "abc", "=B1/4"]]) }]);
    await click("t", 0, 0);
    await press("End");
    await press("Shift+ArrowDown");
    await menu("number-format", "comma");
    await menu("number-format", "decimals-up");
    await click("t", 0, 1);
    await menu("number-format", "percent");
    await menu("number-format", "decimals-up");
    await click("t", 0, 2);
    await press("End");
    await press("Shift+ArrowDown");
    await menu("number-format", "comma");
    await menu("number-format", "decimals-down");
    await click("t", 1, 1);
    const shown = await texts("t");
    await click("t", 0, 0);
    const editing = await cell("t", 0, 0).textContent();
    await click("t", 1, 1);
    await click("t", 0, 0);
    await cell("t", 0, 1).click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(200);
    const copied = await readClipboard();
    await click("t", 1, 1);
    const numberSaved = await saveAndRead();
    const numberView = await viewSaved(numberSaved.path);
    await undo();
    // Undo はカーソルを変えたセル(C1)へ戻すので、式が見える。別のセルへ移ってから読む。
    await click("t", 1, 1);
    const afterNumberUndo = await texts("t");
    result.tableNumberFormatShows = shown === "1,234,567.50|25.6%|2,469,135/5.00|abc|0";
    result.tableNumberFormatEditsRawAndCopiesRaw = editing === "1234567.5" && copied === "1234567.5\t0.256";
    result.tableNumberFormatSavedHtml = numberView[0].rows === shown && numberSaved.doc.pages[0].blocks[0].rows[0][0].numberFormat?.comma === true;
    result.tableNumberFormatUndo = afterNumberUndo === "1,234,567.50|25.6%|2,469,135/5.00|abc|0.064";
    result.tableNumberFormatEvidence = JSON.stringify({ shown, editing, copied, view: numberView[0].rows, afterNumberUndo });

    // 4) 関数・比べる・文字・&。IF は選ばなかった側を計算しない(0 除算にならない)。文字の中の "A1" は参照ではない。
    await openBlocks([
      { id: "d", type: "table", tableHeader: true, rows: grid([
        ["名", "点", "区分"],
        ["佐藤", "72", "A組"],
        ["鈴木", "45", "B組"],
        ["高橋", "", "A組"],
        ["田中", "88", "b組"],
        ["0", "=COUNT(B2:B5)", "=COUNTA(A2:A5)"],
      ]) },
      { id: "f", type: "table", rows: grid([
        ['=IF(1>0,"合格","不合格")', "=IF(A2=0,0,1/A2)", "=ROUND(2.345,2)", "=ROUNDUP(2.341,1)", "=ROUNDDOWN(-2.349,2)"],
        ["0", "=IFERROR(1/0,-1)", "=AND(1>0,2>1)", "=OR(FALSE,0)", "=NOT(TRUE)"],
        ['="x"&"A1"&1', "=INT(-2.5)", "=ABS(-3)", '="abc"="ABC"', "=FOO(1)"],
        ["=ROUND(1234,-2)", '=IF(1,"ＡＢ","")', "=TRUE", '="x#REF"', "=2>10"],
      ]) },
      { id: "g", type: "table", rows: grid([
        ["72", "A組"], ["45", "B組"], ["", "A組"], ["88", "b組"],
        ['=COUNTIF(B1:B4,"A組")', '=COUNTIF(A1:A4,">=60")'],
        ['=SUMIF(B1:B4,"a*",A1:A4)', '=COUNTIF(B1:B4,"<>A組")'],
        ['=COUNTIF(A1:A4,"")', "=AVERAGE(A1,A3,A4)"],
      ]) },
    ]);
    const fn = await texts("f");
    const counts = await texts("d");
    const cond = await texts("g");
    result.tableFunctionsBasic = fn === "合格|0|2.35|2.4|-2.34/0|-1|TRUE|FALSE|FALSE/xA11|-3|3|TRUE|#ERR/1200|ＡＢ|TRUE|x#REF|FALSE";
    result.tableFunctionsCount = counts.endsWith("/0|3|4");
    result.tableFunctionsConditional = cond === "72|A組/45|B組/|A組/88|b組/2|2/72|2/1|80";
    result.tableFunctionsEvidence = JSON.stringify({ fn, counts, cond });
    // 文字の中の "A1" は、行を足しても書き換えない(参照だけがずれる)。
    await click("f", 0, 0);
    await tool("row-before");
    const literalKept = await raw("f", 3, 0);
    const refMoved = await raw("f", 1, 1);
    await undo();
    result.tableFormulaStringNotRewritten = literalKept === '="x"&"A1"&1' && refMoved === "=IF(A3=0,0,1/A3)";
    result.tableFormulaStringEvidence = JSON.stringify({ literalKept, refMoved });

    // 5) $ の絶対参照: フィルで $ の向きは動かない。行を足すと $ の付いた参照もついていく(Excel と同じ)。F4 で $ を切り替える。
    await openBlocks([{ id: "t", type: "table", rows: grid([["10", "1", "=B1*$A$1+B$1+$B1"], ["", "2", ""], ["", "3", ""]]) }]);
    await click("t", 0, 2);
    await click("t", 1, 1);
    await click("t", 0, 2);
    const fillHandle = await fresh.locator('#blocks .block[data-id="t"] .table-fill-handle').boundingBox();
    const target = await cell("t", 2, 2).boundingBox();
    await fresh.mouse.move(fillHandle.x + fillHandle.width / 2, fillHandle.y + fillHandle.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    const filled = [await raw("t", 1, 2), await raw("t", 2, 2)];
    const filledValues = await texts("t");
    await click("t", 0, 0);
    await tool("row-before");
    const afterInsert = await raw("t", 1, 2);
    await undo();
    await click("t", 1, 0);
    await fresh.keyboard.type("=A1+B2");
    await press("ArrowLeft");
    await press("ArrowLeft");
    await press("ArrowLeft");
    await press("ArrowLeft");
    const f4 = [];
    for (let i = 0; i < 4; i += 1) {
      await press("F4");
      f4.push(await cell("t", 1, 0).textContent());
    }
    await press("Escape");
    result.tableAbsoluteRefFill = filled[0] === "=B2*$A$1+B$1+$B2" && filled[1] === "=B3*$A$1+B$1+$B3" && filledValues.split("/")[2] === "|3|34";
    result.tableAbsoluteRefFollowsInsert = afterInsert === "=B2*$A$2+B$2+$B2";
    result.tableAbsoluteRefF4Cycles = f4.join(",") === "=$A$1+B2,=A$1+B2,=$A1+B2,=A1+B2";
    result.tableAbsoluteRefEvidence = JSON.stringify({ filled, filledValues, afterInsert, f4 });

    // 6) 並べ替え: 見出しの行は動かない。数は数の順、空は最後。同じ行を指す式は同じ行を指したまま(v246 から、式は
    //    「行を新しい位置へコピーした」扱い。Excel と同じ。tableCutSortSuite)。範囲(合計)はそのまま。
    //    その表を読むグラフの範囲もそのまま。Ctrl+Z 1回で戻る。縦の結合がある表では使えない。
    await openBlocks([
      { id: "t", type: "table", tableHeader: true, rows: grid([
        ["名", "点", "倍"], ["佐藤", "72", "=B2*2"], ["鈴木", "", "=B3*2"], ["高橋", "9", "=B4*2"], ["田中", "100", "=B5*2"],
      ]) },
      { id: "s", type: "paragraph", text: "合計の表" },
      { id: "ch", type: "chart", text: 'table(id="t")\nbar(A2:A5, B2:B5)' },
    ]);
    await click("t", 1, 1);
    await menu("sort", "asc");
    const ascending = await texts("t");
    const followFormula = await raw("t", 1, 2);
    await menu("sort", "desc");
    const descending = await texts("t");
    const sortedSaved = await saveAndRead();
    const chartText = sortedSaved.doc.pages[0].blocks.find((block) => block.id === "ch")?.text;
    await undo();
    const sortUndo = await texts("t");
    result.tableSortOrdersBody = ascending === "名|点|倍/高橋|9|18/佐藤|72|144/田中|100|200/鈴木||0"
      && descending === "名|点|倍/田中|100|200/佐藤|72|144/高橋|9|18/鈴木||0";
    result.tableSortFormulasFollow = followFormula === "=B2*2" && chartText === 'table(id="t")\nbar(A2:A5, B2:B5)';
    result.tableSortUndoOneStep = sortUndo === ascending;
    result.tableSortEvidence = JSON.stringify({ ascending, followFormula, descending, chartText, sortUndo });
    await openBlocks([{ id: "t", type: "table", rows: grid([[{ text: "x", rowSpan: 2 }, "2"], [{ text: "", covered: true }, "1"], ["z", "3"]]) }]);
    await click("t", 0, 1);
    await menu("sort", "asc");
    result.tableSortRefusesVerticalMerge = (await texts("t")) === "x|2/1/z|3";

    // 7) 絞り込み: 列の値を外すとその行が隠れ、表の下に「絞り込み中」。↓ は隠した行を飛ばす。範囲の消去とコピーは見えている行だけ。
    //    保存HTMLでも隠し、同じ一言。開き直しても残る。列を左に足すと、絞り込みの列もずれる。Ctrl+Z 1回で戻る。すべて解除で戻る。
    await openBlocks([{ id: "t", type: "table", tableHeader: true, rows: grid([
      ["名", "区分", "点"], ["a", "A", "1"], ["b", "B", "2"], ["c", "A", "3"], ["d", "B", "4"], ["e", "A", "5"],
    ]) }]);
    await click("t", 1, 1);
    await tool("filter");
    const options = await fresh.evaluate(() => [...document.querySelectorAll(".table-filter-option")].map((node) => node.textContent).join(","));
    await fresh.locator('.table-filter-option input[data-value="B"]').click();
    await fresh.locator('.table-filter-actions [data-key="apply"]').click();
    await fresh.waitForTimeout(250);
    const filtered = await texts("t");
    const note = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] > .block-content').dataset.filterNote || "");
    const filterOn = await fresh.evaluate(() => document.querySelector('#table-toolbar [data-tool="filter"]')?.getAttribute("aria-pressed"));
    await click("t", 1, 2);
    await press("End");
    await press("ArrowDown");
    const afterDown = await fresh.evaluate(() => document.activeElement?.dataset.row);
    await click("t", 1, 2);
    await cell("t", 5, 2).click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(200);
    const copiedVisible = await readClipboard();
    await press("Delete");
    const afterClear = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] tr')].map((tr) => tr.children[2].textContent).join(","));
    await undo();
    const filterSaved = await saveAndRead();
    const filterView = await viewSaved(filterSaved.path);
    const savedFilter = JSON.stringify(filterSaved.doc.pages[0].blocks[0].tableFilter);
    await click("t", 1, 0);
    await tool("col-before");
    const shiftedFilter = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] > .block-content').dataset.filterNote || "");
    const shiftedHidden = await texts("t");
    await undo();
    await undo();
    const filterUndo = await texts("t");
    await click("t", 1, 1);
    await tool("filter");
    await fresh.locator('.table-filter-option input[data-value="B"]').click();
    await fresh.locator('.table-filter-actions [data-key="apply"]').click();
    await fresh.waitForTimeout(200);
    await tool("filter");
    await fresh.locator('.table-filter-actions [data-key="clear-all"]').click();
    await fresh.waitForTimeout(200);
    const clearedAll = await texts("t");
    result.tableFilterHidesRows = options === "すべて,A3,B2" && filtered === "名|区分|点/a|A|1/[隠]b|B|2/c|A|3/[隠]d|B|4/e|A|5"
      && note === "絞り込み中: 5 行のうち 3 行を表示" && filterOn === "true";
    result.tableFilterKeysAndRangeSkipHidden = afterDown === "3" && copiedVisible === "1\n3\n5" && afterClear === "点,,2,,4,";
    result.tableFilterSavedHtml = filterView[0].rows === "名|区分|点/a|A|1/[隠]b|B|2/c|A|3/[隠]d|B|4/e|A|5"
      && filterView[0].note === "絞り込み中: 5 行のうち 3 行を表示" && savedFilter === '[{"column":1,"hide":["B"]}]';
    result.tableFilterFollowsColumnInsert = shiftedHidden === "|名|区分|点/|a|A|1/[隠]|b|B|2/|c|A|3/[隠]|d|B|4/|e|A|5" && shiftedFilter.includes("3 行を表示");
    result.tableFilterUndoAndClear = filterUndo === "名|区分|点/a|A|1/b|B|2/c|A|3/d|B|4/e|A|5" && clearedAll === filterUndo;
    result.tableFilterEvidence = JSON.stringify({ options, filtered, note, filterOn, afterDown, copiedVisible, afterClear, view: filterView[0], savedFilter, shiftedHidden, filterUndo, clearedAll });

    result.tableExcelNoPageErrors = pageErrors.length === 0;
    result.tableExcelPageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await context.close();
  }
}
