// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PORT } from "../lib.mjs";

// ---- app.js を役割ごとのファイルに分ける(Issue #207 の1回目) ----
// 表の計算(table-formula.js)・グラフ(chart.js)を app.js から、数式の変換(tex-math.js)を document-format.js から分けた。
// 次を見る:
//   - 分けたファイルが、PWA のキャッシュ・デスクトップ版の同梱・index.html の読み込み(順番つき)のどれにも入っている
//     (どれかが抜けると、その場所だけでアプリが起動しない・オフラインで開けない)
//   - 同じ関数を2か所に持たない(app.js・document-format.js に移した関数の写しが残っていない。app.js の呼び口は渡すだけ)
//   - 分けたファイルは app.js に頼らずに動く(画面を通さず、ファイルの窓口だけで表の式・グラフ・数式を作れる)
const FILES = ["tex-math.js", "table-formula.js", "chart.js"];

// いちばん外の関数の宣言の名前(IIFE の直下 = 字下げ2つ)。分けたファイルは create(…) の直下(字下げ4つ)も数える。
function functionNames(source) {
  const names = new Set([...source.matchAll(/^ {2}(?:async )?function\*? ?([A-Za-z0-9_$]+)\(/gm)].map((m) => m[1]));
  const create = source.indexOf("\n  function create(");
  if (create >= 0) [...source.slice(create).matchAll(/^ {4}(?:async )?function\*? ?([A-Za-z0-9_$]+)\(/gm)].forEach((m) => names.add(m[1]));
  return names;
}

// 関数の宣言の本体(次の同じ字下げの「}」まで)。
function functionBody(source, name) {
  const match = new RegExp("^( *)function " + name + "\\(", "m").exec(source);
  if (!match) return "";
  const end = source.indexOf("\n" + match[1] + "}", match.index);
  return source.slice(match.index, end < 0 ? undefined : end);
}

export default async function appSplitSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  const evidence = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const text = (path) => readFile(resolve(path), "utf8");
    const [appJs, formatJs, indexHtml, worker, stage, ...moduleSources] = await Promise.all([
      text("editor-pwa/app.js"), text("editor-pwa/document-format.js"), text("editor-pwa/index.html"),
      text("editor-pwa/service-worker.js"), text("src-tauri/stage-frontend.mjs"),
      ...FILES.map((file) => text("editor-pwa/" + file)),
    ]);

    // 1) 配る場所の全部に入っている。読み込みの順: tex-math.js → document-format.js(読んだその場で window.TexMath を使う)、
    //    table-formula.js → chart.js(表の計算を使う)→ app.js。
    const scripts = [...indexHtml.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    const at = (file) => scripts.indexOf(file);
    evidence.scripts = scripts;
    evidence.missing = FILES.flatMap((file) => [
      worker.includes('"./' + file + '"') ? null : "service-worker.js:" + file,
      stage.includes('"' + file + '"') ? null : "stage-frontend.mjs:" + file,
      at(file) >= 0 ? null : "index.html:" + file,
    ]).filter(Boolean);
    result.splitFilesAreShipped = evidence.missing.length === 0
      && at("tex-math.js") < at("document-format.js")
      && at("document-format.js") < at("table-formula.js") && at("table-formula.js") < at("chart.js") && at("chart.js") < at("app.js");

    // 2) 写しを持たない。分けたファイルの関数の名前が app.js・document-format.js に宣言として残っていない。
    //    app.js の呼び口(読むページの既定を渡すだけ)は、同じ名前で chartTools / window.DocumentChart の関数を呼ぶだけ。
    const WRAPPERS = { buildChart: "chartTools.buildChart(", chartSourceTable: "window.DocumentChart.chartSourceTable(", chartSampleText: "chartTools.chartSampleText(" };
    const appNames = functionNames(appJs);
    const formatNames = functionNames(formatJs);
    evidence.duplicated = moduleSources.flatMap((source, index) => [...functionNames(source)]
      .filter((name) => appNames.has(name) || formatNames.has(name))
      .filter((name) => !(WRAPPERS[name] && functionBody(appJs, name).includes(WRAPPERS[name]) && functionBody(appJs, name).split("\n").length <= 3))
      .map((name) => FILES[index] + ":" + name));
    result.splitHasNoCopies = evidence.duplicated.length === 0
      && !/function (evaluateTableFormula|renderChartSvg|buildChartUnguarded|withTableCalcPass)\(/.test(appJs)
      && !/function (texToMathML|tokenizeTex)\(/.test(formatJs + appJs);

    // 3) 分けたファイルは app.js に頼らずに動く。表の行を整える関数だけを渡して式を計算し、グラフを組み立てて絵にし、数式を変換する。
    const standalone = await fresh.evaluate(() => {
      const tableRows = (block) => block.rows.map((row) => row.map((cell) => ({ colSpan: 1, rowSpan: 1, ...cell })));
      const tableFormula = window.TableFormula.create({ tableRows });
      const table = { id: "t1", type: "table", rows: [[{ text: "a" }, { text: "2" }], [{ text: "b" }, { text: "=B1*3" }], [{ text: "合計" }, { text: "=SUM(B1:B2)" }]] };
      const chartBlock = { id: "c1", type: "chart", text: 'bar(A1:A2, B1:B2)\ntitle("見本")' };
      const charts = window.DocumentChart.create({ tableFormula });
      const chart = charts.buildChart(chartBlock, [table, chartBlock]);
      const svg = window.DocumentChart.renderChartSvg(chart);
      return {
        sum: tableFormula.tableCellResult(table, 2, 1),
        cycle: tableFormula.tableCellResult({ rows: [[{ text: "=A1" }]] }, 0, 0),
        series: chart.series.length,
        errors: chart.errors,
        bars: (svg.match(/class="chart-bar"/g) || []).length,
        title: svg.includes("見本"),
        math: window.TexMath.texToMathML("\\frac{a}{b}", true),
        sameMath: window.TexMath.texToMathML === window.SingleHtmlFormat.texToMathML,
      };
    });
    evidence.standalone = standalone;
    result.splitFilesWorkWithoutApp = standalone.sum === "8" && standalone.cycle === "#CYCLE"
      && standalone.series === 1 && standalone.errors.length === 0 && standalone.bars === 2 && standalone.title
      && /^<math[^>]*display="block"/.test(standalone.math || "") && standalone.math.includes("<mfrac>") && standalone.sameMath;

    result.appSplitEvidence = JSON.stringify(evidence);
    return result;
  } finally {
    await fresh.close();
  }
}
