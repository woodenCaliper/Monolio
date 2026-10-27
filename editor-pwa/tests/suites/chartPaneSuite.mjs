// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT, insertBlock } from "../lib.mjs";

// ---- グラフ設定GUI(右ペイン) ----
// GUI はコードを書き換えるボタンで、コードが唯一の真実であること。
// 文書全体の状態に依存しないよう、新しいページで検証する。
export default async function chartPaneSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

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
    const paneState = () => fresh.evaluate(() => {
      const pane = document.querySelector("#chart-pane");
      return {
        hidden: pane.hidden,
        display: getComputedStyle(pane).display,
        insideBlocks: Boolean(document.querySelector("#blocks #chart-pane")),
      };
    });
    const chartCode = () => fresh.evaluate(() => (
      document.querySelector("#blocks .block.type-chart .block-content").textContent
    ));
    const focusChart = async () => {
      // v161 からコードは既定で畳む。コード欄を編集する経路は「コードを表示」してから。
      const open = await fresh.evaluate(() => document.querySelector("#blocks .block.type-chart")?.classList.contains("source-open"));
      if (!open) await fresh.locator("#blocks .block.type-chart .chart-source-toggle").click();
      await fresh.locator("#blocks .block.type-chart .block-content").click();
      await fresh.waitForTimeout(250);
    };
    const retypeInto = async (selector, text) => {
      await fresh.evaluate((sel) => {
        const input = document.querySelector(sel);
        input.focus();
        input.select();
      }, selector);
      await fresh.keyboard.type(text);
      await fresh.waitForTimeout(200);
    };

    // グラフの値の読み先になる表と、グラフブロックを用意する。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await setCell(0, 0, "1");
    await setCell(0, 1, "2");
    await setCell(1, 0, "3");
    await setCell(1, 1, "4");
    const tableId = await fresh.evaluate(() => document.querySelector("#blocks .block.type-table").dataset.id);
    await fresh.locator('#blocks .block[data-id="' + tableId + '"] .insert-block').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("/chart");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(400);

    // グラフのコード欄の編集中だけ、右ペインが(算出値で)表示される。
    await focusChart();
    const shownState = await paneState();
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    const hiddenState = await paneState();
    result.chartPaneShowsWhileEditingChart = shownState.display !== "none" && hiddenState.display === "none";

    // ペインは #blocks の外にあり、グラフ本文の textContent を汚さない
    // (.block-content に装飾要素を入れると壊れる罠のガード)。
    await focusChart();
    result.chartPaneStaysOutsideDocument = await fresh.evaluate(() => {
      const content = document.querySelector("#blocks .block.type-chart .block-content");
      return !document.querySelector("#blocks #chart-pane")
        && content.textContent === 'scatter(A1:A2, B1:B2)\ntitle("グラフ")\nxlabel("横軸")\nylabel("縦軸")';
    });

    // コードの内容が GUI に反映されている。
    result.chartPaneReflectsCode = await fresh.evaluate(() => {
      const row = document.querySelector("#chart-pane .chart-pane-series");
      return row?.querySelector("select")?.value === "scatter"
        && row?.querySelector('input[data-field="x"]')?.value === "A1:A2"
        && row?.querySelector('input[data-field="y"]')?.value === "B1:B2"
        && document.querySelector("#chart-pane-title").value === "グラフ"
        && document.querySelector("#chart-pane-xlabel").value === "横軸"
        && document.querySelector("#chart-pane-ylabel").value === "縦軸";
    });

    // GUI の Title 入力は title(...) の行だけを書き換え、他の行は温存する。
    // 書き換えた結果は既存の描画経路に乗り、SVG のタイトルにも現れる。
    await retypeInto("#chart-pane-title", "実測値");
    const afterTitle = await chartCode();
    result.chartPaneTitleEditsCodeOnly = afterTitle.includes('title("実測値")')
      && !afterTitle.includes('title("グラフ")')
      && afterTitle.includes("scatter(A1:A2, B1:B2)")
      && afterTitle.includes('xlabel("横軸")')
      && afterTitle.includes('ylabel("縦軸")')
      && await fresh.evaluate(() => (
        document.querySelector("#blocks .block.type-chart .chart-canvas")?.textContent.includes("実測値") ?? false
      ));

    // 系列のレンジ入力はその系列の行を書き換える。
    await retypeInto('#chart-pane .chart-pane-series input[data-field="x"]', "A1:A3");
    result.chartPaneSeriesRangeEditsCode = (await chartCode()).includes("scatter(A1:A3, B1:B2)");

    // 種類の切り替えは行の関数名を書き換える。
    await fresh.locator("#chart-pane .chart-pane-series select[data-field=\"kind\"]").selectOption("plot");
    await fresh.waitForTimeout(200);
    const afterKind = await chartCode();
    result.chartPaneKindSwitchRewritesLine = afterKind.includes("plot(A1:A3, B1:B2)")
      && !afterKind.includes("scatter(");

    // 系列を追加は既存の系列のすぐ後ろへ、読む表から作った行を挿す(X は前の系列と同じ、値はまだ使われていない最初の列=C、
    // 行は X と同じ、種類は前の系列。v170。PdM)。
    await fresh.locator("#chart-pane-add").click();
    await fresh.waitForTimeout(200);
    const afterAdd = await chartCode();
    result.chartPaneAddSeriesInsertsLine = afterAdd.indexOf("plot(A1:A3") >= 0
      && afterAdd.indexOf("plot(A1:A3, C1:C3)") > afterAdd.indexOf("plot(A1:A3, B1:B2)")
      && await fresh.evaluate(() => document.querySelectorAll("#chart-pane .chart-pane-series").length === 2);

    // × はその系列の行だけを消す。
    await fresh.locator("#chart-pane .chart-pane-series").nth(1).locator(".chart-pane-remove").click();
    await fresh.waitForTimeout(200);
    const afterRemove = await chartCode();
    result.chartPaneRemoveSeriesDeletesLine = !afterRemove.includes("plot(A1:A3, C1:C3)")
      && afterRemove.includes("plot(A1:A3, B1:B2)")
      && await fresh.evaluate(() => document.querySelectorAll("#chart-pane .chart-pane-series").length === 1);

    // 手書きのコメントや未知の行は GUI 操作後も原文のまま残る。
    await fresh.evaluate(() => {
      const el = document.querySelector("#blocks .block.type-chart .block-content");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.type("\n# メモ\ngrid(true)");
    await fresh.waitForTimeout(300);
    await retypeInto("#chart-pane-title", "T2");
    const afterForeign = await chartCode();
    result.chartPanePreservesHandwrittenLines = afterForeign.includes("# メモ")
      && afterForeign.includes("grid(true)")
      && afterForeign.includes('title("T2")');

    // GUI 操作(タイプのひとまとまり)は Undo 1手で戻る。
    await fresh.waitForTimeout(1600);
    await retypeInto("#chart-pane-title", "T3");
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const afterUndo = await fresh.evaluate(() => (
      document.querySelector("#blocks .block.type-chart .block-content")?.textContent || ""
    ));
    result.chartPaneEditsUndoInOneStep = afterUndo.includes('title("T2")')
      && !afterUndo.includes('title("T3")');

    // 保存HTMLへペインの痕跡が混入しない。
    const savePromise = fresh.waitForEvent("download", { timeout: 8000 });
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+S");
    const saved = await savePromise;
    const savedPath = join(DOWNLOADS, "chart-pane-probe.html");
    await saved.saveAs(savedPath);
    const savedHtml = await readFile(savedPath, "utf8");
    result.exportedHtmlHasNoChartPane = !savedHtml.includes("chart-pane");

    // モバイル幅でもペインが画面内に収まり、横スクロールを生まない。
    await fresh.setViewportSize({ width: 375, height: 812 });
    await focusChart();
    result.chartPaneFitsMobileViewport = await fresh.evaluate(() => {
      const pane = document.querySelector("#chart-pane");
      const rect = pane.getBoundingClientRect();
      return getComputedStyle(pane).display !== "none"
        && rect.left >= 0
        && rect.right <= window.innerWidth + 1
        && rect.bottom <= window.innerHeight + 1
        && document.documentElement.scrollWidth <= window.innerWidth + 1;
    });

    return result;
  } finally {
    await fresh.close();
  }
}
