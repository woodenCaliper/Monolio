// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT } from "../lib.mjs";

// ---- 表の拡張機能とグラフ ----
// ここまでのテストで文書が育っているため、まっさらなページで確かめる。
// 表とグラフは文書全体の並びに影響されるので、状態を切り離したい。
export default async function tableSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const shape = () => fresh.evaluate(() => {
      const table = document.querySelector("#blocks .block.type-table .editor-table");
      if (!table) return null;
      return {
        rows: [...table.querySelectorAll("tr")].map((tr) => (
          [...tr.querySelectorAll("td, th")].map((td) => ({
            tag: td.tagName.toLowerCase(),
            row: Number(td.dataset.row),
            cell: Number(td.dataset.cell),
            colSpan: td.colSpan,
            rowSpan: td.rowSpan,
            text: td.textContent,
          }))
        )),
        rowCount: table.querySelectorAll("tr").length,
        columnCount: table.querySelector("tr")?.querySelectorAll("td, th").length ?? 0,
      };
    });
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
    const cellText = (r, c) => fresh.evaluate(([row, cell]) => {
      const td = document.querySelector('#blocks .block.type-table .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]');
      return td?.textContent ?? null;
    }, [r, c]);
    const focusCell = async (r, c) => {
      await fresh.evaluate(([row, cell]) => {
        document.querySelector('#blocks .block.type-table .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]')?.focus();
      }, [r, c]);
      await fresh.waitForTimeout(120);
    };
    const useTool = async (tool, r, c) => {
      await focusCell(r, c);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
    };

    // /table コマンドで表を作る(3×3 で作られることは core の slashTableCreated が見る)。
    await fresh.locator("#blocks .block-content").last().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(400);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(400);

    // 操作ボタンが表の中にいるときだけ出て、本文の外にあること。
    await focusCell(0, 0);
    result.tableToolbarAppears = await fresh.evaluate(() => {
      const bar = document.querySelector("#table-toolbar");
      const content = document.querySelector("#blocks .block.type-table .block-content");
      return !bar.hidden
        // v232: 配置(3)・数の見せ方・並べ替え・絞り込みを足して 17。v238: 全画面を足して 18。Issue #179: グループを足して 19。
        && bar.querySelectorAll(".table-tool").length === 19
        && !content.contains(bar);
    });
    // 操作アイコンは画面の一番下の帯に出す(v216。ユーザー選択)。表の上へ浮かせる方式は直前の本文へ覆いかぶさって
    // 文字を隠し(以前の指摘)、上部のツールバーに出す方式は狭い画面でツールバーが1行増えて文書全体がずれた。
    // 帯は上のツールバーの外で、画面の下端に付き、本文の列(.main)の幅に収まり、表には重ならない。
    result.tableToolbarShownAtBottom = await fresh.evaluate(() => {
      const bar = document.querySelector("#table-toolbar");
      const box = bar.getBoundingClientRect();
      const main = document.querySelector(".main").getBoundingClientRect();
      const table = document.querySelector("#blocks .block.type-table .editor-table").getBoundingClientRect();
      return !bar.closest("header.toolbar") && getComputedStyle(bar).position === "fixed"
        && Math.abs(box.bottom - innerHeight) <= 1 && box.left >= main.left - 1 && box.right <= main.right + 1
        && (table.bottom <= box.top || table.top >= box.bottom);
    });
    // 表の外（普通の段落）へ移ったら、操作ボタンは見えなくなること。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    result.tableToolbarHidesOutsideTable = await fresh.evaluate(() => (
      document.querySelector("#table-toolbar").hidden
    ));

    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) await setCell(r, c, "r" + r + "c" + c);
    }

    // 行の挿入と削除。
    await useTool("row-after", 0, 0);
    const afterRowInsert = await shape();
    result.tableInsertsRowBelow = afterRowInsert.rowCount === 4
      && afterRowInsert.rows[1].every((cell) => cell.text === "")
      && afterRowInsert.rows[2][0].text === "r1c0";
    await useTool("row-before", 0, 0);
    result.tableInsertsRowAbove = (await shape()).rowCount === 5;
    await useTool("row-delete", 0, 0);
    await useTool("row-delete", 0, 0);
    result.tableDeletesRow = (await shape()).rowCount === 3;

    // 列の挿入と削除。直前の行操作で中身が動いているので、入れ直してから見る。
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) await setCell(r, c, "r" + r + "c" + c);
    }
    await useTool("col-after", 0, 0);
    const afterColInsert = await shape();
    result.tableInsertsColumnRight = afterColInsert.columnCount === 4
      && afterColInsert.rows[0][1].text === ""
      && afterColInsert.rows[0][2].text === "r0c1";
    await useTool("col-before", 0, 0);
    result.tableInsertsColumnLeft = (await shape()).columnCount === 5;
    await useTool("col-delete", 0, 0);
    await useTool("col-delete", 0, 0);
    result.tableDeletesColumn = (await shape()).columnCount === 3;

    // Undo で構造の変更を戻せること。
    const beforeUndo = (await shape()).columnCount;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.tableStructureUndoWorks = (await shape()).columnCount === beforeUndo + 1;
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);

    // 最低1行1列は残すこと。
    await useTool("row-delete", 0, 0);
    await useTool("row-delete", 0, 0);
    await useTool("row-delete", 0, 0);
    result.tableKeepsAtLeastOneRow = (await shape()).rowCount === 1;
    await useTool("row-after", 0, 0);
    await useTool("row-after", 0, 0);

    // セルをドラッグで選び、結合する。
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
    await setCell(0, 0, "m1");
    await setCell(0, 1, "m2");
    await setCell(1, 0, "m3");
    await setCell(1, 1, "m4");
    await dragCells([0, 0], [1, 1]);
    result.tableCellDragSelectsRange = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .editor-table .cell-selected").length === 4
    ));
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(300);
    const merged = await shape();
    const mergedCell = merged.rows[0][0];
    // 縦横どちらも結合されること。中身は失わずに繋ぐこと。
    result.tableMergesCells = mergedCell.colSpan === 2 && mergedCell.rowSpan === 2;
    result.tableMergeKeepsText = mergedCell.text === "m1 m2 m3 m4";
    result.tableMergeHidesCoveredCells = merged.rows[0].length === 2 && merged.rows[1].length === 1;

    // 結合を解除する。
    await useTool("split", 0, 0);
    const split = await shape();
    result.tableSplitsMergedCell = split.rows[0][0].colSpan === 1
      && split.rows[0][0].rowSpan === 1
      && split.rows[0].length === 3
      && split.rows[1].length === 3;

    // ヘッダー行。
    await useTool("header", 0, 0);
    result.tableTogglesHeaderRow = (await shape()).rows[0].every((cell) => cell.tag === "th");
    await useTool("header", 0, 0);
    result.tableHeaderRowCanBeTurnedOff = (await shape()).rows[0].every((cell) => cell.tag === "td");

    // ---- 数式 ----
    await setCell(0, 0, "10");
    await setCell(0, 1, "4");
    await setCell(1, 0, "6");
    await setCell(1, 1, "3");
    const formula = async (text) => {
      await setCell(2, 0, text);
      return cellText(2, 0);
    };
    // 式と期待する表示を1つの表で回す(A1=10, B1=4, A2=6, B2=3。A3 に書いて読む)。外れた式は証拠に残す。
    const formulaCases = [
      // 四則・括弧・集計・引数の並び。
      ["=A1+B1", "14"], ["=A1-B1", "6"], ["=A1*B1", "40"], ["=A1/B1", "2.5"], ["=(A1+B1)*2", "28"],
      ["=SUM(A1:B2)", "23"], ["=MIN(A1:B2)", "3"], ["=MAX(A1:B2)", "10"], ["=SUM(A1,B1,100)", "114"],
      // 累乗 ^（Excel と同じ思想。* より強い・左から・単項の - が先・負の指数）。
      ["=A1^2", "100"], ["=2*A1^2+B1", "204"], ["=2^3^2", "64"], ["=-2^2", "4"], ["=2^-2", "0.25"],
      // 剰余 %（* / と同じ強さ、0除算は #ERR、符号は割られる側）。
      ["=A1%B1", "2"], ["=A1+B1%3", "11"], ["=2^3%5", "3"], ["=A1%0", "#ERR"], ["=-A1%3", "-1"],
      // AVERAGE（数値セルだけで平均。対象が無ければ #ERR）。
      ["=AVERAGE(A1:B2)", "5.75"], ["=AVERAGE(A1,B1)", "7"], ["=AVERAGE(D8:D9)", "#ERR"],
      // 誤り(0除算・書きかけ・知らない関数)と循環参照。
      ["=A1/0", "#ERR"], ["=A1+", "#ERR"], ["=NOPE(A1)", "#ERR"], ["=A3+1", "#CYCLE"],
    ];
    const formulaMismatches = [];
    for (const [text, expected] of formulaCases) {
      const shown = await formula(text);
      if (shown !== expected) formulaMismatches.push({ text, expected, shown });
    }
    result.tableFormulaCasesMatch = formulaMismatches.length === 0;
    result.tableFormulaCaseMismatches = JSON.stringify(formulaMismatches);

    // 参照先を変えたら計算し直すこと。
    await formula("=A1+B1");
    await setCell(0, 0, "20");
    result.tableFormulaRecalculates = (await cellText(2, 0)) === "24";

    // 編集中は式そのもの、離れたら結果を出すこと。
    await focusCell(2, 0);
    const editingText = await cellText(2, 0);
    await fresh.evaluate(() => document.activeElement?.blur());
    await fresh.waitForTimeout(200);
    result.tableFormulaShowsSourceWhileEditing = editingText === "=A1+B1"
      && (await cellText(2, 0)) === "24";

    // ---- グラフ ----
    await setCell(0, 0, "1");
    await setCell(1, 0, "2");
    await setCell(2, 0, "3");
    await setCell(0, 1, "3");
    await setCell(1, 1, "7");
    await setCell(2, 1, "5");
    await setCell(0, 2, "=B1*2");
    await setCell(1, 2, "=B2*2");
    await setCell(2, 2, "=B3*2");

    // グラフは「上にある一番近い表」を読む仕様なので、表の直下に作る。
    // （最後の編集可能ブロックから Enter で作ると表より上に入ってしまう）
    const tableRowId = await fresh.evaluate(() => (
      document.querySelector("#blocks .block.type-table")?.dataset.id
    ));
    await fresh.locator('#blocks .block[data-id="' + tableRowId + '"] .insert-block').click();
    await fresh.keyboard.type("/chart");
    await fresh.waitForTimeout(400);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(500);

    const chartState = () => fresh.evaluate(() => {
      const row = document.querySelector("#blocks .block.type-chart");
      if (!row) return null;
      const svg = row.querySelector(".chart-canvas svg");
      return {
        hasSvg: Boolean(svg),
        points: svg ? svg.querySelectorAll("circle.chart-point").length : 0,
        bars: svg ? svg.querySelectorAll("rect.chart-bar").length : 0,
        lines: svg ? svg.querySelectorAll("polyline.chart-line").length : 0,
        title: svg?.querySelector("text.chart-title")?.textContent ?? null,
        xlabel: [...(svg?.querySelectorAll("text.chart-label") ?? [])].map((t) => t.textContent).join("|"),
        ticks: svg ? [...svg.querySelectorAll("text.chart-tick")].map((t) => t.textContent).join(",") : "",
        errors: row.querySelector(".chart-errors")?.textContent ?? null,
        canvasOutsideContent: !row.querySelector(".block-content")?.contains(row.querySelector(".chart-canvas")),
        legend: [...(svg?.querySelectorAll("text.chart-legend") ?? [])].map((t) => t.textContent).join("|"),
      };
    });
    const setSpec = async (spec) => {
      await fresh.evaluate((text) => {
        const content = document.querySelector("#blocks .block.type-chart .block-content");
        content.focus();
        content.textContent = text;
        content.dispatchEvent(new Event("input", { bubbles: true }));
      }, spec);
      await fresh.waitForTimeout(320);
    };

    const initialChart = await chartState();
    result.chartCreatedByCommand = Boolean(initialChart?.hasSvg);
    result.chartCanvasOutsideBlockText = initialChart?.canvasOutsideContent === true;

    await setSpec('scatter(A1:A3, B1:B3)\ntitle("plot title")\nxlabel("x axis")\nylabel("y axis")');
    const scatter = await chartState();
    result.chartShowsTitleAndLabels = scatter.title === "plot title"
      && scatter.xlabel.includes("x axis") && scatter.xlabel.includes("y axis");

    // 種類ごとの描き方: 散布図は点だけ・折れ線は線1本・棒は3本・ヒストグラムは3つの区間。
    await setSpec("plot(A1:A3, B1:B3)");
    const plotted = await chartState();
    await setSpec("bar(A1:A3, B1:B3)");
    const barred = await chartState();
    await setSpec("hist(B1:B3, bins=3)");
    const histogram = await chartState();
    result.chartKindsDraw = scatter.points === 3 && scatter.lines === 0
      && plotted.lines === 1 && barred.bars === 3 && histogram.bars === 3;
    result.chartKindEvidence = JSON.stringify({
      scatter: { points: scatter.points, lines: scatter.lines }, plot: { lines: plotted.lines },
      bar: { bars: barred.bars }, hist: { bars: histogram.bars },
    });

    // 式の列の値を読めること。
    await setSpec("scatter(A1:A3, C1:C3)");
    const usingFormula = await chartState();
    result.chartUsesFormulaValues = usingFormula.points === 3
      && usingFormula.ticks.includes("14");

    // 系列を2つ並べ、凡例を出せること。
    await setSpec('scatter(A1:A3, B1:B3, label="raw")\nplot(A1:A3, C1:C3, label="double")');
    const twoSeries = await chartState();
    result.chartDrawsTwoSeries = twoSeries.points === 6 && twoSeries.lines === 1;
    result.chartShowsLegend = twoSeries.legend === "raw|double";

    // 表を書き換えたらグラフが追従すること。
    await setSpec("scatter(A1:A3, B1:B3)");
    const beforeEdit = (await chartState()).ticks;
    await setCell(0, 1, "100");
    await fresh.waitForTimeout(400);
    const afterEdit = (await chartState()).ticks;
    result.chartFollowsTableEdit = beforeEdit !== afterEdit && afterEdit.includes("100");

    // 書き方の誤りは、その場で理由を出すこと。
    // (v168 で pie は使える種類になったので、使えないコマンドの例は donut にした)
    // 使えないコマンド・範囲の無い呼び出し・読めない行の3つを見る。
    await setSpec("donut(A1:A3)");
    const unknownCommand = (await chartState()).errors;
    await setSpec("scatter()");
    const missingRange = (await chartState()).errors;
    await setSpec("not a call at all");
    const unreadableLine = (await chartState()).errors;
    result.chartReportsSpecErrors = unknownCommand?.includes("使えないコマンド: donut()") === true
      && missingRange?.includes("範囲") === true && unreadableLine?.includes("読めない行") === true;
    result.chartSpecErrorEvidence = JSON.stringify({ unknownCommand, missingRange, unreadableLine });

    // 保存の確認用のグラフは、このあと結合する1行目(結合すると「1 100」の文字になる)を含めない。v163 から X と Y は位置で組にし、
    // X に文字があれば分類の軸(散布図ならエラー)になる。以前は文字のセルを黙って飛ばし、後ろの組が1つずれていた。
    await setSpec("scatter(A2:A3, B2:B3)");

    // 保存の確認用に、もう一度セルを結合しておく（分解のテストで解いてある）。
    await dragCells([0, 0], [0, 1]);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(300);

    // 保存したHTMLにも、見えていたグラフと定義が載ること。
    // 書き出した文書では値が変わらないので、描き直しの仕組みは持たせていない。
    const savePromise = fresh.waitForEvent("download", { timeout: 8000 });
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+S");
    const saved = await savePromise;
    const savedPath = join(DOWNLOADS, "chart-" + saved.suggestedFilename());
    await saved.saveAs(savedPath);
    const savedHtml = await readFile(savedPath, "utf8");
    result.exportedContainsChart = savedHtml.includes('class="doc-chart"')
      && savedHtml.includes("chart-point")
      && savedHtml.includes("doc-chart-source")
      && savedHtml.includes("scatter(A2:A3, B2:B3)");
    // 結合した表も、colspan / rowspan つきで載ること。
    result.exportedContainsMergedTable = savedHtml.includes('colspan="2"');

    return result;
  } finally {
    await fresh.close();
  }
}
