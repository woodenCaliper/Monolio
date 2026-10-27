// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- グラフの分類の軸・系列の色・凡例・目盛線(v163。グラフ編集GUI 段5a) ----
// 出典はユーザー原文「私の理想は、Excel のグラフ機能+コードでもグラフを書ける機能」(主要機能に絞る)。細部はユーザー委任下の
// PdM 判断。書式の読み取り・描画・GUI・保存HTML の4か所がそろうこと(P7)。
export default async function chartStyleSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    pages: [{
      id: "ST1",
      title: "Chart Style",
      blocks: [
        { id: "t1", type: "table", rows: [cells("月", "売上", "費用"), cells("1月", "10", "7"), cells("2月", "25", "9"), cells("3月", "18", "12")] },
        { id: "cb", type: "chart", text: 'bar(A2:A4, B2:B4, label="売上", color="#2a9d8f")\nbar(A2:A4, C2:C4, label="費用")\ntitle("月別")' },
        { id: "cl", type: "chart", text: 'plot(A2:A4, B2:B4, label="売上")' },
        { id: "cs", type: "chart", text: "scatter(A2:A4, B2:B4)" },
        { id: "cc", type: "chart", text: 'bar(A2:A4, B2:B4, color="url(x)")' },
        // 色の書き方(matplotlib): 配色の順 C3・名前 tab:red・CSS の名前 red は受けない。色を指定しない系列は自分の既定の色のまま。
        { id: "k3", type: "chart", text: 'bar(A2:A4, B2:B4, color="C3")\nbar(A2:A4, C2:C4)' },
        { id: "kt", type: "chart", text: 'bar(A2:A4, B2:B4, color="tab:red")' },
        { id: "kr", type: "chart", text: 'bar(A2:A4, B2:B4, color="red")' },
        // Y 軸の上の余白(最大値 25 が目盛りにちょうど乗る)。ylim を書いたらそれに従う。凡例の長い名前は縮める。
        { id: "hy", type: "chart", text: "bar(A2:A4, B2:B4)" },
        { id: "hl", type: "chart", text: "bar(A2:A4, B2:B4)\nylim(0, 25)" },
        { id: "ll", type: "chart", text: 'bar(A2:A4, B2:B4, label="とても長い系列の名前をここに書いてみるとどうなるかを確かめる")\nbar(A2:A4, C2:C4, label="費用")' },
        { id: "gx", type: "chart", text: 'plot(B2:B4, C2:C4)\ngrid("x")' },
        { id: "gb", type: "chart", text: 'plot(B2:B4, C2:C4)\ngrid("both")' },
        { id: "gn", type: "chart", text: "plot(B2:B4, C2:C4)\ngrid(False)" },
        { id: "go", type: "chart", text: "plot(B2:B4, C2:C4)\ngrid(false)\nlegend(loc=\"top\")" },
        { id: "lb", type: "chart", text: 'bar(A2:A4, B2:B4, label="売上")\nbar(A2:A4, C2:C4, label="費用")\nlegend(loc="bottom")' },
        { id: "lh", type: "chart", text: 'bar(A2:A4, B2:B4, label="売上")\nbar(A2:A4, C2:C4, label="費用")\nlegend(False)' },
        { id: "gp", type: "chart", text: "plot(B2:B4, C2:C4)" },
        // Y の途中が空欄(数の軸): その点だけ抜け、後ろの点の X は正しい。折れ線はそこで切れる。
        { id: "tn", type: "table", rows: [cells("1", "10"), cells("2", "20"), cells("3", ""), cells("4", "40"), cells("5", "50")] },
        { id: "bn", type: "chart", text: "plot(A1:A5, B1:B5)" },
        // 数の X の縦棒: X の値の位置に立つ(Y の3番目が空欄でも、4番目の棒は目盛り「4」の位置)。
        { id: "nb", type: "chart", text: "bar(A1:A5, B1:B5)" },
        // Y の途中が空欄(分類の軸): その棒だけ抜け、後ろの棒は自分の分類の枠に立つ。
        { id: "tm", type: "table", rows: [cells("月", "値"), cells("1月", "5"), cells("2月", ""), cells("3月", "7"), cells("4月", "9")] },
        { id: "bm", type: "chart", text: "bar(A2:A5, B2:B5)" },
        // 2系列で分類の並びが違う: 分類は最初に出てきた順の和集合、各系列は自分の分類の枠へ。
        { id: "tu", type: "table", rows: [cells("1月", "1", "2月", "4"), cells("2月", "2", "3月", "5"), cells("3月", "3", "4月", "6")] },
        { id: "bu", type: "chart", text: "bar(A1:A3, B1:B3)\nbar(C1:C3, D1:D3)" },
        // X が「1,000」だけなら数の軸(数の判定は表と同じ)。
        { id: "tc", type: "table", rows: [cells("1,000", "1"), cells("2,000", "2"), cells("3,000", "3")] },
        { id: "bc", type: "chart", text: "plot(A1:A3, B1:B3)" },
        // 長い分類名は枠に収まるよう縮める(「…」)。
        { id: "tl", type: "table", rows: Array.from({ length: 12 }, (_, index) => cells("とても長い分類の名前その" + (index + 1), String(index + 1))) },
        { id: "bl", type: "chart", text: "bar(A1:A12, B1:B12)" },
        { id: "p2", type: "paragraph", text: "after" },
      ],
    }],
    fonts: [],
    attachments: [],
  };
  const svgInfo = (id) => fresh.evaluate((blockId) => {
    const canvas = document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas');
    const svg = canvas?.querySelector("svg");
    const lines = [...(svg?.querySelectorAll("line.chart-grid") ?? [])].map((line) => ({
      horizontal: line.getAttribute("y1") === line.getAttribute("y2"),
      vertical: line.getAttribute("x1") === line.getAttribute("x2"),
    }));
    const axis = svg?.querySelector("line.chart-axis");
    return {
      bars: [...(svg?.querySelectorAll("rect.chart-bar") ?? [])].map((rect) => ({ x: Number(rect.getAttribute("x")), fill: rect.getAttribute("fill") })),
      points: svg?.querySelectorAll("circle.chart-point").length ?? 0,
      lines: svg?.querySelectorAll("polyline.chart-line").length ?? 0,
      xticks: [...(svg?.querySelectorAll('text.chart-tick[text-anchor="middle"]') ?? [])].map((text) => text.textContent),
      xtickY: Number(svg?.querySelector('text.chart-tick[text-anchor="middle"]')?.getAttribute("y") ?? 0),
      legend: [...(svg?.querySelectorAll("text.chart-legend") ?? [])].map((text) => ({ name: text.textContent, x: Number(text.getAttribute("x")), y: Number(text.getAttribute("y")) })),
      plotRight: axis ? Number(axis.getAttribute("x2")) : 0,
      plotLeft: axis ? Number(axis.getAttribute("x1")) : 0,
      horizontalGrid: lines.filter((line) => line.horizontal).length,
      verticalGrid: lines.filter((line) => line.vertical).length,
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
  const note = () => fresh.evaluate(() => {
    const el = document.querySelector("#chart-pane-foreign");
    return el.hidden ? null : el.textContent;
  });
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "chart-style.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Style", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // 分類の軸: X が文字なら等間隔に並べ、目盛に文字を出す。縦棒が2つなら枠の中で横に並ぶ。
    const bar = await svgInfo("cb");
    result.chartCategoryAxisBarTicks = bar.xticks.join(",") === "1月,2月,3月" && bar.bars.length === 6
      && bar.bars[3].x > bar.bars[0].x && bar.bars[3].x < bar.bars[1].x && !bar.errors;
    const line = await svgInfo("cl");
    result.chartCategoryAxisLineTicks = line.xticks.join(",") === "1月,2月,3月" && line.points === 3 && line.lines === 1;
    // 散布図の文字の X は見える形のエラー(以前は黙って何も描かなかった)。
    const scatter = await svgInfo("cs");
    result.chartScatterTextXShowsError = scatter.points === 0 && scatter.errors.includes("散布図の X は数で指定してください");

    // 系列の色: color= が効く。使えない色はエラーにして既定の色で描く。
    const bad = await svgInfo("cc");
    result.chartSeriesColorApplied = bar.bars.slice(0, 3).every((item) => item.fill === "#2a9d8f")
      && bar.bars.slice(3).every((item) => item.fill === "#c1512f")
      && bad.errors.includes("使えない色") && bad.bars.every((item) => item.fill === "#2f6fb2");

    // 色の書き方: C3 は配色の4番目、tab:red は matplotlib の赤、CSS の名前 red は受けずにエラー+既定の色。色を指定しない系列は、
    // ほかの系列の指定に関係なく自分の既定の色(2番目の系列は C1)。
    const cycle = await svgInfo("k3");
    const tab = await svgInfo("kt");
    const cssName = await svgInfo("kr");
    result.chartColorGrammarAndDefaults = cycle.bars.slice(0, 3).every((item) => item.fill === "#7651a8")
      && cycle.bars.slice(3).every((item) => item.fill === "#c1512f")
      && tab.bars.every((item) => item.fill === "#d62728")
      && cssName.errors.includes("使えない色") && cssName.bars.every((item) => item.fill === "#2f6fb2");

    // 数の X の縦棒は X の値を中心に立つ(v164)。Y の3番目が空欄でも4番目の棒の中心は目盛り「4」の位置。端の棒ははみ出さない。
    const numericBars = await fresh.evaluate(() => {
      const svg = document.querySelector('.block[data-id="nb"] .chart-canvas svg');
      const axis = svg.querySelector("line.chart-axis");
      const bars = [...svg.querySelectorAll("rect.chart-bar")].map((rect) => ({
        left: Number(rect.getAttribute("x")),
        right: Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
      }));
      const tick = [...svg.querySelectorAll('text.chart-tick[text-anchor="middle"]')].find((text) => text.textContent === "4");
      return { bars, tick4: tick ? Number(tick.getAttribute("x")) : null, left: Number(axis.getAttribute("x1")), right: Number(axis.getAttribute("x2")) };
    });
    result.chartNumericBarsSitAtXValues = numericBars.bars.length === 4 && numericBars.tick4 !== null
      && Math.abs((numericBars.bars[2].left + numericBars.bars[2].right) / 2 - numericBars.tick4) < 0.5
      && numericBars.bars[0].left >= numericBars.left - 0.5 && numericBars.bars[3].right <= numericBars.right + 0.5;
    // 自動の Y 軸は、最大値がちょうど目盛りに乗るときもう1目盛り上まで取る(いちばん高い棒が上端に付かない)。ylim を書けばそれに従う。
    const yTicksOf = (id) => fresh.evaluate((blockId) => [...document.querySelectorAll('.block[data-id="' + blockId + '"] text.chart-tick[text-anchor="end"]')]
      .map((text) => Number(text.textContent)), id);
    const headroom = await yTicksOf("hy");
    const fixed = await yTicksOf("hl");
    result.chartYAxisHasHeadroom = Math.max(...headroom) > 25 && Math.min(...headroom) === 0 && Math.max(...fixed) === 25;
    // 凡例の長い名前は縮める(「…」。分類の目盛と同じ縮め方)。
    const longLegend = await svgInfo("ll");
    result.chartLegendLongNameIsShortened = longLegend.legend.length === 2 && longLegend.legend[0].name.endsWith("…")
      && longLegend.legend[1].name === "費用";

    // 位置で組にする: Y の途中の空欄は、その点だけ抜ける(数の軸では最後の点が右端のまま。折れ線は切れて2本)。
    const blankNumeric = await fresh.evaluate(() => {
      const svg = document.querySelector('.block[data-id="bn"] .chart-canvas svg');
      const axis = svg.querySelector("line.chart-axis");
      const circles = [...svg.querySelectorAll("circle.chart-point")].map((circle) => Number(circle.getAttribute("cx")));
      return { circles, lines: svg.querySelectorAll("polyline.chart-line").length, right: Number(axis.getAttribute("x2")) };
    });
    const slotsOf = (info, count) => info.bars.map((item) => Math.floor((item.x - info.plotLeft) / ((info.plotRight - info.plotLeft) / count)));
    const blankCategory = await svgInfo("bm");
    result.chartBlankYDoesNotShiftPoints = blankNumeric.circles.length === 4 && blankNumeric.lines === 2
      && Math.abs(blankNumeric.circles[3] - blankNumeric.right) < 0.5
      && blankCategory.xticks.join(",") === "1月,2月,3月,4月" && slotsOf(blankCategory, 4).join(",") === "0,2,3";
    // 分類は和集合の順。2番目の系列(2月〜4月)は自分の分類の枠に立つ。
    const union = await svgInfo("bu");
    result.chartCategoryUnionOrder = union.xticks.join(",") === "1月,2月,3月,4月"
      && slotsOf({ ...union, bars: union.bars.slice(0, 3) }, 4).join(",") === "0,1,2"
      && slotsOf({ ...union, bars: union.bars.slice(3) }, 4).join(",") === "1,2,3";
    // 「1,000」の X は数の軸(文字の目盛にならない)。
    const commaNumber = await svgInfo("bc");
    result.chartCommaNumbersStayNumericAxis = commaNumber.points === 3 && !commaNumber.xticks.includes("1,000") && !commaNumber.errors;
    // 長い分類名は縮める(「…」で終わる)。
    const longNames = await svgInfo("bl");
    result.chartLongCategoryNamesAreShortened = longNames.xticks.length === 12 && longNames.xticks.every((tick) => tick.endsWith("…"));
    // 無害化は、アプリ自身が描いた SVG に対して恒等(許可リストと描画の語彙が一致。足し忘れを捕まえる不変条件)。
    result.chartSvgSanitizeIsIdentity = await fresh.evaluate(() => {
      const parse = (text) => new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
      const children = (node) => [...node.childNodes].filter((kid) => kid.nodeType === 1 || (kid.nodeType === 3 && kid.nodeValue.trim()));
      const attrs = (node) => [...node.attributes].map((attr) => attr.name + "=" + attr.value).sort().join("|");
      const same = (a, b) => {
        if (!a || !b || a.nodeName !== b.nodeName) return false;
        if (a.nodeType === 3) return a.nodeValue === b.nodeValue;
        if (attrs(a) !== attrs(b)) return false;
        const x = children(a);
        const y = children(b);
        return x.length === y.length && x.every((kid, index) => same(kid, y[index]));
      };
      const svgs = [...document.querySelectorAll("#blocks .chart-canvas svg")].map((svg) => svg.outerHTML);
      return svgs.length >= 10 && svgs.every((svg) => same(parse(svg), parse(window.SingleHtmlFormat.sanitizeChartSvg(svg))));
    });

    // 凡例: 既定は「系列が2つ以上でラベルがあれば右に」。1系列なら出さない。legend(False) で出さない。loc で位置。
    const bottom = await svgInfo("lb");
    const hidden = await svgInfo("lh");
    result.chartLegendDefaultPlacementAndHide = bar.legend.map((item) => item.name).join("|") === "売上|費用"
      && bar.legend.every((item) => item.x > bar.plotRight && item.x < 620)
      && line.legend.length === 0 && hidden.legend.length === 0
      && bottom.legend.length === 2 && bottom.legend.every((item) => item.y > bottom.xtickY);
    const top = await svgInfo("go");
    result.chartLegendTopShowsSeriesName = top.legend.length === 1 && top.legend[0].name === "系列 1" && top.legend[0].y < 60;

    // 目盛線: 既定は横だけ。grid("x") は縦だけ、grid("both") は両方、grid(False)・grid(false)(後方互換)は無し。
    const plain = await svgInfo("gp");
    const vertical = await svgInfo("gx");
    const both = await svgInfo("gb");
    const none = await svgInfo("gn");
    result.chartGridFourKinds = plain.horizontalGrid > 0 && plain.verticalGrid === 0
      && vertical.verticalGrid > 0 && vertical.horizontalGrid === 0
      && both.verticalGrid > 0 && both.horizontalGrid > 0
      && none.verticalGrid === 0 && none.horizontalGrid === 0
      && top.verticalGrid === 0 && top.horizontalGrid === 0;

    // grid と legend は GUI で読める設定になった(温存行として数えない)。
    await openPane("go");
    result.chartGridAndLegendAreNotForeign = (await note()) === null
      && await fresh.evaluate(() => document.querySelector("#chart-pane-grid").value === "none"
        && document.querySelector("#chart-pane-legend").value === "top");

    // GUI: 目盛線と凡例の選択でコードの行が書き換わる(既定を選ぶと行が消える)。
    await openPane("gp");
    const gridPick = async (value) => {
      await fresh.locator("#chart-pane-grid").selectOption(value);
      await fresh.waitForTimeout(200);
      return code("gp");
    };
    const legendPick = async (value) => {
      await fresh.locator("#chart-pane-legend").selectOption(value);
      await fresh.waitForTimeout(200);
      return code("gp");
    };
    const gridX = await gridPick("x");
    const gridNone = await gridPick("none");
    const gridDefault = await gridPick("y");
    result.chartPaneGridSelectWritesLine = gridX.includes('grid("x")') && gridNone.includes("grid(False)") && !gridNone.includes('grid("x")')
      && !gridDefault.includes("grid(");
    const legendBottom = await legendPick("bottom");
    const legendNone = await legendPick("none");
    const legendAuto = await legendPick("auto");
    result.chartPaneLegendSelectWritesLine = legendBottom.includes('legend(loc="bottom")') && legendNone.includes("legend(False)")
      && !legendAuto.includes("legend(");

    // GUI: 色の見本を押すと color= が書かれ、欄に書けばその色、欄を空にすると自動(行から消える)。
    await fresh.locator("#chart-pane .chart-pane-series .chart-pane-swatch").nth(2).click();
    await fresh.waitForTimeout(200);
    const swatched = await code("gp");
    const pressed = await fresh.evaluate(() => document.querySelectorAll('#chart-pane .chart-pane-swatch[aria-pressed="true"]').length);
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="color"]').fill("#123456");
    await fresh.waitForTimeout(250);
    const typed = await code("gp");
    const typedFill = (await svgInfo("gp")).points;
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="color"]').fill("");
    await fresh.waitForTimeout(250);
    const cleared = await code("gp");
    result.chartPaneColorWritesLine = swatched.includes('color="C2"') && pressed === 1 && typed.includes('color="#123456"')
      && typedFill === 3 && !cleared.includes("color=");
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(200);

    // 保存HTMLでも同じ見た目(P7): 保存したファイルの絵に分類の目盛・色・凡例が載り、開き直しても同じ。直接開いても描かれる。
    const download = fresh.waitForEvent("download");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "chart-style-saved.html");
    await (await download).saveAs(savedPath);
    const raw = await readFile(savedPath, "utf8");
    const viewer = await context.newPage();
    await viewer.setContent(raw, { waitUntil: "load" });
    const exported = await viewer.evaluate(() => {
      const svg = [...document.querySelectorAll(".doc-chart svg")][0];
      return {
        bars: svg ? [...svg.querySelectorAll("rect.chart-bar")].map((rect) => rect.getAttribute("fill")) : [],
        ticks: svg ? [...svg.querySelectorAll('text.chart-tick[text-anchor="middle"]')].map((text) => text.textContent).join(",") : "",
        legend: svg ? [...svg.querySelectorAll("text.chart-legend")].map((text) => text.textContent).join("|") : "",
      };
    });
    await viewer.close();
    const reopen = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await reopen).setFiles(savedPath);
    await fresh.waitForTimeout(600);
    const reopened = await svgInfo("cb");
    result.chartStyleSurvivesSaveAndExport = exported.bars.length === 6 && exported.bars.slice(0, 3).every((fill) => fill === "#2a9d8f")
      && exported.ticks === "1月,2月,3月" && exported.legend === "売上|費用"
      && reopened.bars.length === 6 && reopened.xticks.join(",") === "1月,2月,3月" && reopened.legend.length === 2;
    return result;
  } finally {
    await fresh.close();
  }
}
