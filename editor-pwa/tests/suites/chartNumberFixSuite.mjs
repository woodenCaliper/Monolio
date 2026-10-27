// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- グラフの目盛り・式の結果・ヒストグラムの区間の数の端の値(v213) ----
// 1. 表に 1e-12 のような小さな値があると、目盛りを 1e-10 の位で丸めていたので全部 0 になり、間隔 0 のまま目盛りを
//    足すループが終わらず「Invalid array length」で落ちた。保存したファイルも「開けませんでした」になった。
//    目盛りは間隔に対して丸め、ループには上限を置き、描けないグラフはそのグラフのエラーとして出す(開くのは止めない)。
// 2. 式の結果を 1e-10 の位で丸めていたので、=6.626*10^-34 が 0、=2^1000 が Infinity になった。
// 3. hist の bins に上限が無く、bins=100000000 でタブが落ち、100000 で「Maximum call stack size exceeded」が出た。
export default async function chartNumberFixSuite({ context }) {
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const pageErrors = [];
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  await fresh.setViewportSize({ width: 1280, height: 900 });
  // 終わらない描画(直す前の不具合)で試験ごと止まらないよう、待ちには上限を置く。
  const within = (promise, ms, label) => Promise.race([
    promise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error("timeout: " + label)), ms)),
  ]);
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    const title = literal.pages[0].title;
    await fresh.waitForFunction((text) => document.querySelector("#doc-title")?.textContent === text, title, { timeout: 8000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const info = (id) => fresh.evaluate((blockId) => {
    const canvas = document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas');
    const svg = canvas?.querySelector("svg");
    return {
      exists: Boolean(canvas),
      svg: Boolean(svg),
      ticks: [...(svg?.querySelectorAll("text.chart-tick") ?? [])].map((text) => text.textContent),
      bars: svg?.querySelectorAll("rect.chart-bar").length ?? 0,
      lines: svg?.querySelectorAll("polyline.chart-line").length ?? 0,
      points: svg?.querySelectorAll("circle").length ?? 0,
      message: svg?.querySelector("text.chart-message")?.textContent ?? "",
      errors: canvas?.querySelector(".chart-errors")?.textContent ?? "",
    };
  }, id);
  const setCode = (id, code) => fresh.evaluate(([blockId, text]) => {
    const element = document.querySelector('.block[data-id="' + blockId + '"] .block-content');
    element.textContent = text;
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, [id, code]);
  const setCell = (id, row, cell, text) => fresh.evaluate(([blockId, r, c, value]) => {
    const td = document.querySelector('#blocks .block[data-id="' + blockId + '"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]');
    td.focus();
    td.textContent = value;
    td.dispatchEvent(new Event("input", { bubbles: true }));
    td.blur();
  }, [id, row, cell, text]);
  const cellText = (id, row, cell) => fresh.evaluate(([blockId, r, c]) => document.querySelector(
    '#blocks .block[data-id="' + blockId + '"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]',
  )?.textContent ?? null, [id, row, cell]);
  const blockIds = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((block) => block.dataset.id));
  const distinct = (values) => new Set(values).size === values.length;

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // ---- 1. 小さな値の表を読むグラフを含むファイルが開け、どの種類のグラフも目盛りが別々の値で描ける ----
    const tiny = {
      pages: [{
        id: "CN1",
        title: "Chart Tiny",
        blocks: [
          { id: "t1", type: "table", rows: [cells("1", "1e-12"), cells("2", "2e-12"), cells("3", "3.3e-12")] },
          { id: "gplot", type: "chart", text: 'plot(A1:A3, B1:B3)\ntitle("small")' },
          { id: "gbar", type: "chart", text: "bar(A1:A3, B1:B3)" },
          { id: "gbarh", type: "chart", text: "barh(A1:A3, B1:B3)" },
          { id: "gscatter", type: "chart", text: "scatter(B1:B3, A1:A3)" },
          { id: "ghist", type: "chart", text: "hist(B1:B3)" },
          { id: "gylim", type: "chart", text: "plot(A1:A3, B1:B3)\nylim(0, )" },
          { id: "p9", type: "paragraph", text: "after" },
        ],
      }],
      fonts: [],
      attachments: [],
    };
    pageErrors.length = 0;
    await within(openLiteral(tiny, "chart-tiny"), 20000, "open tiny").catch((error) => pageErrors.push(error.message));
    const openedIds = await within(blockIds(), 5000, "ids").catch(() => []);
    const status = await within(fresh.evaluate(() => document.querySelector("#status")?.textContent || ""), 5000, "status").catch(() => "");
    result.chartTinyValuesFileOpens = openedIds.includes("gplot") && openedIds.includes("p9") && !status.includes("開けませんでした")
      && !pageErrors.some((message) => /Invalid array length/.test(message));
    const kinds = {};
    for (const id of ["gplot", "gbar", "gbarh", "gscatter", "ghist", "gylim"]) {
      kinds[id] = await within(info(id), 5000, id).catch((error) => ({ error: error.message }));
    }
    // 値の軸の目盛りは 0 だけにならず、別々の値(例: 0, 5.0e-13, 1.0e-12 …)。
    const valueTicks = (data) => (data.ticks || []).filter((text) => /e-1[23]$/.test(text));
    result.chartTinyValuesTicksDistinct = ["gplot", "gbar", "gbarh", "gylim"].every((id) => kinds[id].svg && !kinds[id].errors
      && valueTicks(kinds[id]).length >= 3 && distinct(valueTicks(kinds[id])))
      && kinds.gplot.lines === 1 && kinds.gbar.bars === 3 && kinds.gbarh.bars === 3
      && kinds.gscatter.svg && !kinds.gscatter.errors && valueTicks(kinds.gscatter).length >= 3
      && kinds.ghist.svg && !kinds.ghist.errors && kinds.ghist.bars > 0;
    result.chartTinyValuesEvidence = { status, openedIds, pageErrors: pageErrors.slice(0, 3), gplot: kinds.gplot, gbar: kinds.gbar?.ticks, gylim: kinds.gylim?.ticks };

    // 普通の値のグラフを描いたあと、表の値を小さくしても落ちない(グラフは描き直され、ほかの操作も生きている)。
    pageErrors.length = 0;
    const edit = {
      pages: [{
        id: "CN2",
        title: "Chart Tiny Edit",
        blocks: [
          { id: "t1", type: "table", rows: [cells("1", "1"), cells("2", "2"), cells("3", "3")] },
          { id: "g1", type: "chart", text: "plot(A1:A3, B1:B3)" },
          { id: "p9", type: "paragraph", text: "after" },
        ],
      }],
      fonts: [],
      attachments: [],
    };
    await within(openLiteral(edit, "chart-tiny-edit"), 20000, "open edit").catch((error) => pageErrors.push(error.message));
    let edited = { error: "not run" };
    try {
      for (const [row, value] of [[0, "1e-12"], [1, "2e-12"], [2, "3e-12"]]) {
        await within(setCell("t1", row, 1, value), 5000, "set " + value);
      }
      await fresh.waitForTimeout(150);
      edited = await within(info("g1"), 5000, "info g1");
    } catch (error) {
      edited = { error: error.message };
    }
    result.chartTinyValuesAfterEditRedraws = Boolean(edited.svg) && edited.lines === 1 && !edited.errors
      && valueTicks(edited).length >= 3 && !pageErrors.some((message) => /Invalid array length/.test(message));
    result.chartTinyValuesAfterEditEvidence = { edited, pageErrors: pageErrors.slice(0, 3) };

    // ---- 1'. 目盛りのループはどんな値でも終わる(大きな値に小さな幅・数で表せる幅の端) ----
    pageErrors.length = 0;
    const extreme = {
      pages: [{
        id: "CN3",
        title: "Chart Extreme",
        blocks: [
          // 1e17 の近くでは隣の数が 16 離れる。間隔 5 を足しても値が変わらない(以前の足し算のループは終わらない)。
          { id: "t1", type: "table", rows: [cells("1", "100000000000000000"), cells("2", "100000000000000016")] },
          { id: "gbig", type: "chart", text: "plot(A1:A2, B1:B2)" },
          { id: "t2", type: "table", rows: [cells("1", "-1e308"), cells("2", "1e308")] },
          { id: "gwide", type: "chart", text: "bar(A1:A2, B1:B2)" },
          { id: "t3", type: "table", rows: [cells("1", "0"), cells("2", "5e-324")] },
          { id: "gsub", type: "chart", text: "plot(A1:A2, B1:B2)" },
          { id: "p9", type: "paragraph", text: "after" },
        ],
      }],
      fonts: [],
      attachments: [],
    };
    await within(openLiteral(extreme, "chart-extreme"), 20000, "open extreme").catch((error) => pageErrors.push(error.message));
    const extremeIds = await within(blockIds(), 5000, "ids extreme").catch(() => []);
    const extremeInfo = {};
    for (const id of ["gbig", "gwide", "gsub"]) extremeInfo[id] = await within(info(id), 5000, id).catch((error) => ({ error: error.message }));
    result.chartTickLoopsAlwaysEnd = ["gbig", "gwide", "gsub", "p9"].every((id) => extremeIds.includes(id))
      // 描けないエラー(目盛りの計算が配列の上限に達した、など)にもならず、絵が出る。
      && ["gbig", "gwide", "gsub"].every((id) => extremeInfo[id].svg && !extremeInfo[id].error
        && !extremeInfo[id].errors.includes("グラフを描けませんでした"))
      && !pageErrors.some((message) => /Invalid array length|timeout/.test(message));
    result.chartTickLoopsEvidence = { extremeIds, extremeInfo, pageErrors: pageErrors.slice(0, 3) };

    // ---- 1''. 描けないグラフ(描く途中で投げる)は、そのグラフのエラーとして出し、文書は開ける ----
    // 描く処理が使う escapeHtml を、題名が目印のときだけ投げるように差し替えて、描画の途中の例外を作る。
    pageErrors.length = 0;
    await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      window.__chartNumberFixEscape = fmt.escapeHtml;
      fmt.escapeHtml = (value) => {
        if (String(value) === "__chart_throw__") throw new Error("test throw");
        return window.__chartNumberFixEscape(value);
      };
    });
    const broken = {
      pages: [{
        id: "CN4",
        title: "Chart Broken",
        blocks: [
          { id: "t1", type: "table", rows: [cells("1", "1"), cells("2", "2")] },
          { id: "gbad", type: "chart", text: 'plot(A1:A2, B1:B2)\ntitle("__chart_throw__")' },
          { id: "p9", type: "paragraph", text: "after" },
        ],
      }],
      fonts: [],
      attachments: [],
    };
    let brokenInfo = {};
    let brokenIds = [];
    let brokenStatus = "";
    try {
      await within(openLiteral(broken, "chart-broken"), 20000, "open broken");
      brokenIds = await blockIds();
      brokenInfo = await info("gbad");
      brokenStatus = await fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
    } catch (error) {
      pageErrors.push(error.message);
    } finally {
      await fresh.evaluate(() => {
        window.SingleHtmlFormat.escapeHtml = window.__chartNumberFixEscape;
      });
    }
    result.chartRenderErrorDoesNotAbortOpen = brokenIds.includes("gbad") && brokenIds.includes("p9")
      && !brokenStatus.includes("開けませんでした") && brokenInfo.errors.includes("グラフを描けませんでした");
    result.chartRenderErrorEvidence = { brokenIds, brokenStatus, brokenInfo, pageErrors: pageErrors.slice(0, 3) };

    // ---- 2. 式の結果: とても小さい・大きい値は有効数字で、ふつうの値は従来どおり ----
    const formulas = [
      ["=6.626*10^-34", "6.626e-34"],
      ["=1/3000000000000", "3.33333333333e-13"],
      ["=2^1000", "1.07150860719e+301"],
      ["=10^299", "1e+299"],
      ["=-(2^1000)", "-1.07150860719e+301"],
      ["=0.1+0.2", "0.3"],
      ["=1/3", "0.3333333333"],
      ["=10/4", "2.5"],
      ["=1-1", "0"],
      ["=2^60", "1152921504606847000"],
      ["=1/8000", "0.000125"],
      ["=3*0.00001", "0.00003"],
    ];
    const formulaDoc = {
      pages: [{
        id: "CN5",
        title: "Formula Digits",
        blocks: [
          { id: "t1", type: "table", rows: formulas.map(([formula]) => cells(formula)) },
          { id: "t2", type: "table", rows: [cells("1", "=1*10^-12"), cells("2", "=2*10^-12"), cells("3", "=3*10^-12")] },
          { id: "gf", type: "chart", text: "plot(A1:A3, B1:B3)" },
        ],
      }],
      fonts: [],
      attachments: [],
    };
    pageErrors.length = 0;
    await within(openLiteral(formulaDoc, "formula-digits"), 20000, "open formulas").catch((error) => pageErrors.push(error.message));
    const shown = [];
    for (let row = 0; row < formulas.length; row += 1) shown.push(await cellText("t1", row, 0));
    const wrong = formulas.map(([formula, expected], index) => [formula, expected, shown[index]]).filter(([, expected, got]) => expected !== got);
    result.tableFormulaTinyAndHugeKeepDigits = wrong.length === 0;
    // 空の配列は「真偽値の配列」として判定されてしまうので、証拠はオブジェクトに包む。
    result.tableFormulaDigitsEvidence = { wrong, shown };
    // 式で作った小さな値もグラフが読める(0 にならないので、点が別々の高さに並ぶ)。
    const formulaChart = await within(info("gf"), 5000, "gf").catch((error) => ({ error: error.message }));
    result.tableFormulaTinyFeedsChart = Boolean(formulaChart.svg) && formulaChart.lines === 1 && !formulaChart.errors
      && valueTicks(formulaChart).length >= 3;
    result.tableFormulaTinyChartEvidence = formulaChart;

    // ---- 3. hist の区間の数には上限(1000)がある ----
    const histDoc = {
      pages: [{
        id: "CN6",
        title: "Hist Bins",
        blocks: [
          { id: "t1", type: "table", rows: [cells("x", "y"), cells("1", "10"), cells("2", "20"), cells("3", "30")] },
          { id: "gh", type: "chart", text: "hist(B2:B4)" },
        ],
      }],
      fonts: [],
      attachments: [],
    };
    pageErrors.length = 0;
    await within(openLiteral(histDoc, "hist-bins"), 20000, "open hist").catch((error) => pageErrors.push(error.message));
    const histRuns = [];
    for (const bins of [100000, 100000000]) {
      try {
        await within(setCode("gh", "hist(B2:B4, bins=" + bins + ")"), 15000, "bins " + bins);
        await fresh.waitForTimeout(100);
        const data = await within(info("gh"), 5000, "info bins " + bins);
        histRuns.push({ bins, bars: data.bars, errors: data.errors, pageErrors: pageErrors.splice(0) });
      } catch (error) {
        histRuns.push({ bins, error: error.message, pageErrors: pageErrors.splice(0) });
        // 直す前は、ここでタブが固まる(次の値は試さない)。
        break;
      }
    }
    result.chartHistBinsCapped = histRuns.length === 2 && histRuns.every((run) => !run.error && !run.pageErrors.length
      && run.bars > 0 && run.bars <= 1000 && run.errors.includes("1000"));
    // 上限以内の値は、そのまま(エラーも出ない)。
    let normalHist = {};
    try {
      await within(setCode("gh", "hist(B2:B4, bins=3)"), 5000, "bins 3");
      await fresh.waitForTimeout(100);
      normalHist = await within(info("gh"), 5000, "info bins 3");
    } catch (error) {
      normalHist = { error: error.message };
    }
    result.chartHistNormalBinsUnchanged = normalHist.bars === 3 && !normalHist.errors;
    result.chartHistBinsEvidence = { histRuns, normalHist };
  } finally {
    await fresh.close({ runBeforeUnload: false }).catch(() => {});
  }
  return result;
}
