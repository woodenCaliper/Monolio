// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 近似曲線(v177) ----
// ユーザー原文「Pagelith に直線近似を引く機能が欲しい」「二次や対数の近似曲線なども対応できるか」「指数も入れよう」。
// trendline="linear"(True)・"poly2"・"log"・"exp" と、式・R²(trendline_eq / trendline_r2)。散布図・折れ線だけ。
// 式の数値は、別に計算した最小二乗の値(有効数字4桁)と合うこと。
export default async function chartTrendSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const opt = ", trendline_eq=True, trendline_r2=True";
  const literal = {
    pages: [{
      id: "TR1",
      title: "Chart Trend",
      blocks: [
        { id: "t1", type: "table", rows: [cells("温度", "A", "B"), cells("10", "102", "98"), cells("20", "108", "101"), cells("30", "113", "109"), cells("40", "121", "112"), cells("50", "126", "119"), cells("60", "131", "122")] },
        { id: "cl", type: "chart", text: 'scatter(A2:A7, B2:B7, label="A", trendline=True' + opt + ')\nscatter(A2:A7, C2:C7, label="B", trendline="linear"' + opt + ")" },
        { id: "t2", type: "table", rows: [cells("1", "2.1", "95"), cells("2", "3.9", "71"), cells("3", "8.2", "48"), cells("4", "15.8", "37"), cells("5", "33", "25"), cells("6", "61", "19"), cells("7", "130", "13"), cells("8", "250", "10")] },
        { id: "cq", type: "chart", text: 'scatter(A1:A8, B1:B8, trendline="poly2"' + opt + ")" },
        { id: "ce", type: "chart", text: 'scatter(A1:A8, B1:B8, trendline="exp"' + opt + ")" },
        { id: "cg", type: "chart", text: 'scatter(A1:A8, C1:C8, trendline="log"' + opt + ")" },
        { id: "cn", type: "chart", text: "scatter(A1:A8, C1:C8, trendline=True)" },
        // 分類の軸の折れ線: X は 1, 2, 3…として式を出す(Excel と同じ)。10, 20, 30 なら y = 10x(切片 0 は省く)。
        { id: "t3", type: "table", rows: [cells("1月", "10"), cells("2月", "20"), cells("3月", "30")] },
        { id: "cc", type: "chart", text: 'plot(A1:A3, B1:B3, trendline=True, trendline_eq=True)' },
        // 使えない形は見える形のエラー。
        { id: "t4", type: "table", rows: [cells("0", "-1"), cells("1", "2"), cells("2", "3")] },
        { id: "xb", type: "chart", text: 'bar(A1:A3, B1:B3, trendline=True)' },
        { id: "xl", type: "chart", text: 'scatter(A1:A3, B1:B3, trendline="log")' },
        { id: "xe", type: "chart", text: 'scatter(A1:A3, B1:B3, trendline="exp")' },
        { id: "xu", type: "chart", text: 'scatter(A1:A3, B1:B3, trendline="cubic")' },
        { id: "p2", type: "paragraph", text: "after" },
      ],
    }],
    fonts: [],
    attachments: [],
  };
  const info = (id) => fresh.evaluate((blockId) => {
    const canvas = document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas');
    const svg = canvas?.querySelector("svg");
    return {
      trends: [...(svg?.querySelectorAll("polyline.chart-trend") ?? [])].map((line) => ({
        stroke: line.getAttribute("stroke"),
        dash: line.getAttribute("stroke-dasharray"),
        points: line.getAttribute("points").split(" ").length,
      })),
      texts: [...(svg?.querySelectorAll("text.chart-trend-text") ?? [])].map((text) => text.textContent.replace(/\u3000/g, " | ")),
      legend: [...(svg?.querySelectorAll("text.chart-legend:not(.chart-trend-text)") ?? [])].map((text) => text.textContent),
      yTicks: [...(svg?.querySelectorAll('text.chart-tick[text-anchor="end"]') ?? [])].map((text) => Number(text.textContent)),
      errors: canvas?.querySelector(".chart-errors")?.textContent ?? "",
    };
  }, id);
  const code = (id) => fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .block-content').textContent, id);
  const openPane = async (id) => {
    await fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas')?.scrollIntoView({ block: "center" }), id);
    await fresh.waitForTimeout(100);
    const box = await fresh.locator('.block[data-id="' + id + '"] .chart-canvas').boundingBox();
    await fresh.mouse.click(box.x + box.width / 2, box.y + Math.min(60, box.height / 2));
    await fresh.waitForTimeout(300);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "chart-trend.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Trend", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // 直線: 式と R²(別に計算した値)。系列の色の破線。2系列なら凡例に「名前(直線近似)」。trendline=True と "linear" は同じ。
    const linear = await info("cl");
    result.trendLinearEquationAndR2 = linear.texts[0] === "y = 0.5914x + 96.13 | R² = 0.9956"
      && linear.texts[1] === "y = 0.5057x + 92.47 | R² = 0.9840" && !linear.errors;
    result.trendDrawnAsDashedSeriesColor = linear.trends.length === 2 && linear.trends.every((line) => line.dash === "6 4")
      && linear.trends[0].stroke === "#2f6fb2" && linear.trends[1].stroke === "#c1512f";
    result.trendLegendNamesType = linear.legend.join(",") === "A,B,A(直線近似),B(直線近似)";
    // 二次・指数・対数(式の形と値)。曲線は細かい点で描く。
    const quad = await info("cq");
    const expo = await info("ce");
    const log = await info("cg");
    result.trendCurveEquations = quad.texts[0] === "y = 8.613x² - 47.26x + 56.05 | R² = 0.9643" && !quad.errors
      && expo.texts[0] === "y = 1.027e^(0.6875x) | R² = 0.9997" && !expo.errors
      && log.texts[0] === "y = -42.71ln(x) + 96.37 | R² = 0.9944" && !log.errors;
    result.trendCurveEquationEvidence = JSON.stringify({
      poly2: { text: quad.texts[0] ?? null, errors: quad.errors },
      exp: { text: expo.texts[0] ?? null, errors: expo.errors },
      log: { text: log.texts[0] ?? null, errors: log.errors },
    });
    result.trendCurveIsSmooth = expo.trends.length === 1 && expo.trends[0].points > 30;
    // 自動の Y の範囲は近似曲線も含める(二次の谷が 0 を下回る所で切れない。Excel と同じ)。
    result.trendIncludedInAutoRange = Math.min(...quad.yTicks) < 0 && quad.trends.length === 1;
    // 式・R² を出さなければ文字は無い(線だけ)。
    const plain = await info("cn");
    result.trendWithoutLabelsHasNoText = plain.trends.length === 1 && plain.texts.length === 0;
    // 分類の軸: X は 1, 2, 3…。切片 0 は省く。
    const category = await info("cc");
    result.trendCategoryAxisUsesOneBasedX = category.texts[0] === "y = 10x" && !category.errors;
    // 使えない形: 棒・対数の X ≤ 0・指数の Y ≤ 0・知らない種類はエラーで、線を描かない。
    const bar = await info("xb");
    const badLog = await info("xl");
    const badExp = await info("xe");
    const unknown = await info("xu");
    result.trendInvalidUsesShowErrors = bar.errors.includes("散布図と折れ線だけ") && badLog.errors.includes("対数近似は X がすべて 0 より大きい")
      && badExp.errors.includes("指数近似は Y がすべて 0 より大きい") && unknown.errors.includes("trendline=")
      && [bar, badLog, badExp, unknown].every((item) => item.trends.length === 0);
    // 保存HTMLの無害化は、近似曲線の SVG に対して恒等(破線の属性を落とさない)。
    result.trendSvgSurvivesSanitize = await fresh.evaluate(() => {
      const svg = document.querySelector('.block[data-id="cl"] .chart-canvas svg').outerHTML;
      const clean = window.SingleHtmlFormat.sanitizeChartSvg(svg);
      const count = (text) => (text.match(/stroke-dasharray="6 4"/g) || []).length;
      return count(svg) >= 2 && count(clean) === count(svg) && clean.includes("chart-trend-text");
    });

    // 設定欄: 種類の選択と式・R² のチェックがコードに書き戻る。式・R² は「近似なし」のとき隠れる。
    await openPane("cg");
    const pane = () => fresh.evaluate(() => {
      const row = document.querySelector("#chart-pane .chart-pane-series");
      const select = row.querySelector('select[data-field="trendline"]');
      const eq = row.querySelector('input[data-field="trendlineEq"]');
      return { type: select.value, eq: eq.checked, eqHidden: eq.closest("label").hidden };
    });
    const before = await pane();
    await fresh.locator('#chart-pane .chart-pane-series select[data-field="trendline"]').selectOption("exp");
    const toExp = await code("cg");
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="trendlineEq"]').uncheck();
    const noEq = await code("cg");
    await fresh.locator('#chart-pane .chart-pane-series select[data-field="trendline"]').selectOption("");
    const none = await code("cg");
    const after = await pane();
    result.trendPaneWritesCode = before.type === "log" && before.eq && !before.eqHidden
      && toExp.includes('trendline="exp"') && toExp.includes("trendline_eq=True")
      && !noEq.includes("trendline_eq") && noEq.includes("trendline_r2=True")
      && !none.includes("trendline") && after.type === "" && after.eqHidden;
    // 設定欄の近似の行は、散布図・折れ線のときだけ出る。
    await fresh.locator('#chart-pane .chart-pane-series select[data-field="kind"]').selectOption("bar");
    await fresh.waitForTimeout(150);
    result.trendPaneOnlyForScatterAndLine = await fresh.evaluate(() => document.querySelector("#chart-pane .chart-pane-trend")?.hidden === true);
    return result;
  } finally {
    await fresh.close();
  }
}
