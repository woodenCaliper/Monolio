// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- グラフの軸の最小・最大とデータラベル(v165。グラフ編集GUI 段5b) ----
// 出典はユーザー原文(Excel のグラフ機能の主要機能)。細部はユーザー委任下の PdM 判断。書式の読み取り・描画・GUI・保存HTML の4か所。
export default async function chartAxisSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    pages: [{
      id: "AX1",
      title: "Chart Axis",
      blocks: [
        { id: "t1", type: "table", rows: [cells("月", "売上", "利益"), cells("1月", "1,200", "300"), cells("2月", "2,500", "-400"), cells("3月", "1,800", "600")] },
        { id: "ca", type: "chart", text: "bar(A2:A4, B2:B4)\nxlim(0, 5)" },
        { id: "cv", type: "chart", text: "bar(A2:A4, B2:B4, values=True)\nbar(A2:A4, C2:C4, values=True)" },
        { id: "t2", type: "table", rows: [cells("1", "10"), cells("2", "35"), cells("3", "60"), cells("4", "20")] },
        { id: "lb", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(0, 40)" },
        { id: "lo", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(0, )" },
        { id: "hi", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(, 100)" },
        { id: "xl", type: "chart", text: "plot(A1:A4, B1:B4)\nxlim(2, 3)" },
        { id: "kw", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(bottom=0, top=50)" },
        { id: "b1", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(5, 1)" },
        { id: "b2", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(a, 3)" },
        { id: "b3", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(,)" },
        // 引数が1つなら下限だけ(matplotlib の set_ylim(bottom=5) と同じ。v166)。名前つきと同じに描く。
        { id: "b4", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(5)" },
        { id: "b5", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(bottom=5)" },
        { id: "x1", type: "chart", text: "plot(A1:A4, B1:B4)\nxlim(2)" },
        { id: "x2", type: "chart", text: "plot(A1:A4, B1:B4)\nxlim(left=2)" },
        // 片側だけ(matplotlib の名前つきの形と None)。書かない側は自動(余白も付く)。
        { id: "bt", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(bottom=0)" },
        { id: "tp", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(top=50)" },
        { id: "nn", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(None, 100)" },
        // 範囲をデータより狭く: 0 から立つ棒も枠の中だけ。ラベルは枠からはみ出すとき、棒の中/点の下へ。
        { id: "yb", type: "chart", text: "bar(A1:A4, B1:B4)\nylim(50, 100)" },
        { id: "od", type: "chart", text: "plot(A1:A4, B1:B4)\nylim(5, 37)" },
        { id: "vt", type: "chart", text: "bar(A1:A4, B1:B4, values=True)\nylim(0, 60)" },
        { id: "vp", type: "chart", text: "plot(A1:A4, B1:B4, values=True)\nylim(0, 60)" },
        // ペインの範囲の欄(v166): 打ちかけの形を書かない/同じ名前の行が2つなら後の行(題名も後の行が効く)。
        { id: "pt", type: "chart", text: "plot(A1:A4, B1:B4)" },
        { id: "dp", type: "chart", text: 'plot(A1:A4, B1:B4)\nylim(0, 100)\nylim(0, 50)\ntitle("A")\ntitle("B")' },
        { id: "pv", type: "chart", text: "plot(A1:A4, B1:B4, values=True)" },
        { id: "pg", type: "chart", text: "plot(A1:A4, B1:B4)" },
        { id: "p2", type: "paragraph", text: "after" },
      ],
    }],
    fonts: [],
    attachments: [],
  };
  const info = (id) => fresh.evaluate((blockId) => {
    const canvas = document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas');
    const svg = canvas?.querySelector("svg");
    const num = (element, name) => Number(element.getAttribute(name));
    return {
      yticks: [...(svg?.querySelectorAll('text.chart-tick[text-anchor="end"]') ?? [])].map((text) => Number(text.textContent)),
      xticks: [...(svg?.querySelectorAll('text.chart-tick[text-anchor="middle"]') ?? [])].map((text) => text.textContent),
      points: [...(svg?.querySelectorAll("circle.chart-point") ?? [])].map((circle) => ({ x: num(circle, "cx"), y: num(circle, "cy") })),
      lines: svg?.querySelectorAll("polyline.chart-line").length ?? 0,
      bars: [...(svg?.querySelectorAll("rect.chart-bar") ?? [])].map((rect) => ({ top: num(rect, "y"), bottom: num(rect, "y") + num(rect, "height"), x: num(rect, "x") + num(rect, "width") / 2 })),
      values: [...(svg?.querySelectorAll("text.chart-value") ?? [])].map((text) => ({
        text: text.textContent, x: num(text, "x"), y: num(text, "y"),
        cls: text.getAttribute("class"), paint: getComputedStyle(text).fill, size: getComputedStyle(text).fontSize,
      })),
      // 枠: 1本目の軸(横)が下端、2本目(縦)が上端から下端。
      frame: (() => {
        const axes = [...(svg?.querySelectorAll("line.chart-axis") ?? [])];
        return axes.length < 2 ? null : { left: num(axes[0], "x1"), right: num(axes[0], "x2"), top: num(axes[1], "y1"), bottom: num(axes[0], "y1") };
      })(),
      errors: canvas?.querySelector(".chart-errors")?.textContent ?? "",
    };
  }, id);
  // ブロックが消えていても落ちずに赤にする(消えたこと自体を判定で見る)。
  const code = (id) => fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .block-content')?.textContent ?? "", id);
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
    const path = join(OUT, "chart-axis.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Axis", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // 両側: ylim(0, 40) の軸は 0〜40 ちょうど(上の余白を足さない)。範囲外の点(60)は描かず、線は枠で切れて2本。
    const both = await info("lb");
    result.chartYlimBothSidesClips = Math.min(...both.yticks) === 0 && Math.max(...both.yticks) === 40
      && both.points.length === 3 && both.lines === 2;
    // 片側だけ: ylim(0, ) は下が 0 で上は自動(余白の規則で 60 より上)。ylim(, 100) は上が 100 で下は自動。名前つき(bottom/top)も読む。
    const low = await info("lo");
    const high = await info("hi");
    const named = await info("kw");
    result.chartYlimOneSideAuto = Math.min(...low.yticks) === 0 && Math.max(...low.yticks) > 60
      && Math.max(...high.yticks) === 100 && Math.min(...high.yticks) <= 10
      && Math.max(...named.yticks) === 50 && Math.min(...named.yticks) === 0;
    // xlim(2, 3): X の目盛りは範囲の中だけ、範囲外の点は描かない。
    const xrange = await info("xl");
    result.chartXlimClipsPoints = xrange.xticks.length > 0 && xrange.xticks.every((tick) => Number(tick) >= 2 && Number(tick) <= 3)
      && xrange.points.length === 2;
    // 不正な範囲・読めない範囲は見える形のエラー。
    const bad1 = await info("b1");
    const bad2 = await info("b2");
    const bad3 = await info("b3");
    // 読めない側だけ自動で、読める側は使う(ylim(a, 3) の上は 3)。下 ≥ 上は黙って入れ替えない(両側自動)。
    result.chartBadLimitsShowErrors = bad1.errors.includes("範囲が不正") && bad2.errors.includes("範囲の指定が読めません")
      && bad3.errors.includes("範囲の指定が読めません")
      && Math.max(...bad2.yticks) === 3 && Math.max(...bad1.yticks) > 5;
    // ylim(5) は下限 5・上は自動(余白も付く)。ylim(bottom=5) と同じ SVG。xlim(2) も xlim(left=2) と同じ(v166。PdM 指示)。
    const svgOf = (id) => fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas svg')?.outerHTML ?? "", id);
    const single = await info("b4");
    const singleX = await info("x1");
    result.chartSingleArgLimitIsLowerBound = !single.errors && !singleX.errors
      && Math.min(...single.yticks) >= 5 && Math.max(...single.yticks) > 60
      && Math.min(...singleX.xticks.map(Number)) >= 2 && Math.max(...singleX.xticks.map(Number)) >= 4
      && (await svgOf("b4")) === (await svgOf("b5")) && (await svgOf("x1")) === (await svgOf("x2"));
    // 片側だけ(名前つき・None): 書かない側は自動。ylim(bottom=0) の上は最大値 60 より1目盛り上まで。
    const bottomOnly = await info("bt");
    const topOnly = await info("tp");
    const noneLow = await info("nn");
    result.chartYlimNamedOneSide = !bottomOnly.errors && !topOnly.errors && !noneLow.errors
      && Math.min(...bottomOnly.yticks) === 0 && Math.max(...bottomOnly.yticks) > 60
      && Math.max(...topOnly.yticks) === 50 && Math.max(...noneLow.yticks) === 100 && Math.min(...noneLow.yticks) <= 10;
    // 範囲をデータより狭くしても、0 から立つ縦棒は枠の中だけ(軸の下へ伸びない)。全部が下の外の棒は描かない。
    const narrow = await info("yb");
    result.chartNarrowYlimKeepsBarsInFrame = Boolean(narrow.frame) && narrow.bars.length === 1
      && narrow.bars.every((bar) => bar.top >= narrow.frame.top - 0.5 && bar.bottom <= narrow.frame.bottom + 0.5);
    // 目盛りのきりのよい値に乗らない範囲(ylim(5, 37))でも、範囲の外の目盛りは出さない。
    const odd = await info("od");
    result.chartTicksStayInsideOddLimits = odd.yticks.length >= 2 && odd.yticks.every((tick) => tick >= 5 && tick <= 37);
    // 分類の軸で xlim を書いたら見える形のエラー(黙って無視しない)。
    result.chartCategoryXlimShowsError = (await info("ca")).errors.includes("分類の軸では X の範囲");

    // データラベル: 縦棒は棒の上(負なら下)、折れ線は点の上。文字は表のセルの表示と同じ(1,200)。
    const labelled = await info("cv");
    const labelOf = (text) => labelled.values.find((value) => value.text === text);
    const barAt = (label) => labelled.bars.find((bar) => Math.abs(bar.x - label.x) < 0.5);
    const positive = labelOf("2,500");
    const negative = labelOf("-400");
    result.chartBarValueLabelsAboveAndBelow = labelled.values.length === 6 && Boolean(positive && negative)
      && positive.y < barAt(positive).top && negative.y > barAt(negative).bottom
      && labelled.values.map((value) => value.text).join(",") === "1,200,2,500,1,800,300,-400,600";
    const lineValues = await info("pv");
    result.chartLineValueLabelsAbovePoints = lineValues.values.map((value) => value.text).join(",") === "10,35,60,20"
      && lineValues.values.every((value, index) => value.y < lineValues.points[index].y);
    // 上端の値(ylim(0, 60) の 60)のラベルは枠からはみ出さない: 縦棒は棒の中の先端に白い文字、折れ線は点の下。ほかは上のまま。
    const topBar = await info("vt");
    const topLine = await info("vp");
    const tall = topBar.values.find((value) => value.text === "60");
    const tallBar = tall && topBar.bars.find((bar) => Math.abs(bar.x - tall.x) < 0.5);
    const tallPoint = topLine.values.findIndex((value) => value.text === "60");
    result.chartValueLabelsStayInFrame = topBar.values.length === 4 && Boolean(tallBar) && Boolean(topBar.frame)
      // 見た目はクラスで(v166): 棒の中は chart-value-inside(白)、ほかは chart-value(10px)。
      && tall.y > tallBar.top && tall.y < tallBar.bottom && tall.cls === "chart-value chart-value-inside" && tall.paint === "rgb(255, 255, 255)"
      && topBar.values.filter((value) => value !== tall).every((value) => value.cls === "chart-value" && value.paint !== "rgb(255, 255, 255)")
      && topBar.values.every((value) => value.size === "10px")
      && topBar.values.every((value) => value.y - 10 >= topBar.frame.top - 0.5)
      && topLine.values.length === 4 && tallPoint >= 0 && topLine.values[tallPoint].y > topLine.points[tallPoint].y
      && topLine.values.every((value) => value.y - 10 >= topLine.frame.top - 0.5);

    // GUI: 分類の軸では X の範囲の欄が無効で、理由が出る。
    await openPane("ca");
    result.chartPaneXlimDisabledOnCategoryAxis = await fresh.evaluate(() => document.querySelector("#chart-pane-xmin").disabled
      && document.querySelector("#chart-pane-xmax").disabled
      && !document.querySelector("#chart-pane-xlim-note").hidden
      && document.querySelector("#chart-pane-xlim-note").textContent.includes("分類の軸"));
    // GUI: 範囲の欄で ylim / xlim の行が書き換わる(空の側は自動、両方空なら行が消える)。ylim は温存行にならない。
    await openPane("pg");
    const type = async (id, text) => {
      await fresh.locator(id).fill(text);
      await fresh.waitForTimeout(200);
      return code("pg");
    };
    const lowOnly = await type("#chart-pane-ymin", "0");
    const bothSides = await type("#chart-pane-ymax", "50");
    const xOnly = await type("#chart-pane-xmax", "3");
    await type("#chart-pane-ymin", "");
    const cleared = await type("#chart-pane-ymax", "");
    const note = await fresh.evaluate(() => document.querySelector("#chart-pane-foreign").hidden);
    // 片側だけは matplotlib の名前つきの形(ylim(bottom=0)・xlim(right=3))で書く(PdM 指示)。
    result.chartPaneLimitFieldsWriteLines = lowOnly.includes("ylim(bottom=0)") && bothSides.includes("ylim(0, 50)")
      && xOnly.includes("xlim(right=3)") && !cleared.includes("ylim(") && cleared.includes("xlim(right=3)") && note;
    // グラフを選んだまま、パネルの欄で打った Backspace / Delete / ↑ / Enter / Tab はその欄のもの(v165: グラフが消えていた)。
    const keysBefore = await fresh.evaluate(() => document.querySelector('.block[data-id="pg"]')?.classList.contains("selected") ?? false);
    await fresh.locator("#chart-pane-ymin").click();
    await fresh.keyboard.type("5");
    await fresh.keyboard.press("Backspace");
    await fresh.keyboard.press("Backspace");
    await fresh.keyboard.press("Delete");
    await fresh.keyboard.press("ArrowUp");
    await fresh.keyboard.press("Enter");
    await fresh.locator("#chart-pane-title").click();
    await fresh.keyboard.type("T");
    await fresh.keyboard.press("Backspace");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(250);
    const keysAfter = await fresh.evaluate(() => ({
      blocks: [...document.querySelectorAll("#blocks .block")].map((el) => el.dataset.id).join(","),
      pane: !document.querySelector("#chart-pane").hidden,
      ymin: document.querySelector("#chart-pane-ymin").value,
    }));
    const keysCode = await code("pg");
    result.chartPaneFieldKeysKeepChart = keysBefore && keysAfter.blocks.split(",").includes("pg") && keysAfter.pane
      && keysAfter.ymin === "" && !keysCode.includes("ylim(") && !keysCode.includes("title(");
    // GUI: 系列の「値を表示」で values=True が書かれ、外すと消える。
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="values"]').check();
    await fresh.waitForTimeout(200);
    const checked = await code("pg");
    const shown = (await info("pg")).values.length;
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="values"]').uncheck();
    await fresh.waitForTimeout(200);
    const unchecked = await code("pg");
    result.chartPaneValuesCheckboxWritesOption = checked.includes("values=True") && shown > 0 && !unchecked.includes("values=");
    // 読めない ylim の行は温存する行(真実はコード。P6): 欄は空のまま、「GUI では編集できない設定」に数える。
    await openPane("b2");
    result.chartPaneUnreadableLimitStaysForeign = await fresh.evaluate(() => !document.querySelector("#chart-pane-foreign").hidden
      && document.querySelector("#chart-pane-ymin").value === "" && document.querySelector("#chart-pane-ymax").value === "");
    // 欄に打つと、読めない行そのものを置き換える(行を足さない。v166)。
    const ylimCount = (text) => (text.match(/ylim\s*\(/g) || []).length;
    await fresh.locator("#chart-pane-ymax").click();
    await fresh.keyboard.type("7");
    await fresh.waitForTimeout(250);
    const replaced = await code("b2");
    result.chartPaneLimitReplacesUnreadableLine = ylimCount(replaced) === 1 && replaced.includes("ylim(top=7)") && !replaced.includes("ylim(a, 3)");
    // 打ちかけ(「-」「0.」)は数として読めるまでコードに書かず、欄に印(aria-invalid)を付けるだけ。ylim の行は1つのまま(v166。TL M監査)。
    await openPane("pt");
    const invalidOf = () => fresh.evaluate(() => document.querySelector("#chart-pane-ymin").getAttribute("aria-invalid"));
    await fresh.locator("#chart-pane-ymin").click();
    await fresh.keyboard.type("-");
    await fresh.waitForTimeout(150);
    const dash = { code: await code("pt"), invalid: await invalidOf() };
    await fresh.keyboard.type("5");
    await fresh.waitForTimeout(150);
    const minus5 = await code("pt");
    await fresh.keyboard.press("Backspace");
    await fresh.keyboard.press("Backspace");
    await fresh.keyboard.type("0.");
    await fresh.waitForTimeout(150);
    const zeroDot = { code: await code("pt"), invalid: await invalidOf() };
    await fresh.keyboard.type("5");
    await fresh.waitForTimeout(250);
    const half = await code("pt");
    const halfInfo = await info("pt");
    const halfInvalid = await invalidOf();
    result.chartPaneLimitPartialTypingOneLine = ylimCount(dash.code) === 0 && dash.invalid === "true"
      && ylimCount(minus5) === 1 && minus5.includes("ylim(bottom=-5)")
      && ylimCount(zeroDot.code) === 1 && zeroDot.code.includes("ylim(bottom=0)") && zeroDot.invalid === "true"
      && ylimCount(half) === 1 && half.includes("ylim(bottom=0.5)") && !halfInfo.errors && halfInvalid === null;
    // 同じ名前の行が2つあれば、描画と同じく後の行を映して書き換える(前の行は温存する行)。題名も後の行が効く。
    await openPane("dp");
    const dupShown = await fresh.evaluate(() => ({
      ymax: document.querySelector("#chart-pane-ymax").value,
      title: document.querySelector("#chart-pane-title").value,
      foreign: !document.querySelector("#chart-pane-foreign").hidden,
    }));
    await fresh.locator("#chart-pane-ymax").fill("40");
    await fresh.waitForTimeout(250);
    const dupCode = await code("dp");
    result.chartPaneLimitWritesLastSameNameLine = dupShown.ymax === "50" && dupShown.title === "B" && dupShown.foreign
      && ylimCount(dupCode) === 2 && dupCode.includes("ylim(0, 100)") && dupCode.includes("ylim(0, 40)") && !dupCode.includes("ylim(0, 50)");
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(200);

    // 保存HTML: 無害化は描いた SVG に対して恒等(データラベルの font-size も許可リストにある)。保存HTMLを直接開いても同じに描かれる。
    result.chartAxisSvgSanitizeIsIdentity = await fresh.evaluate(() => {
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
    const download = fresh.waitForEvent("download");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "chart-axis-saved.html");
    await (await download).saveAs(savedPath);
    const raw = await readFile(savedPath, "utf8");
    const viewer = await context.newPage();
    await viewer.setContent(raw, { waitUntil: "load" });
    const exported = await viewer.evaluate(() => {
      const svgs = [...document.querySelectorAll(".doc-chart svg")];
      const valueTexts = svgs[1] ? [...svgs[1].querySelectorAll("text.chart-value")] : [];
      return {
        values: valueTexts.map((text) => text.textContent).join(","),
        // 見た目は保存HTMLの CSS のクラスで(属性ではない。v166)。
        fontSize: valueTexts[0] ? getComputedStyle(valueTexts[0]).fontSize : null,
        attribute: document.querySelectorAll(".doc-chart text[font-size]").length,
        insidePaint: (() => {
          const inside = document.querySelector(".doc-chart text.chart-value-inside");
          return inside ? getComputedStyle(inside).fill : null;
        })(),
        clippedTicks: svgs[2] ? [...svgs[2].querySelectorAll('text.chart-tick[text-anchor="end"]')].map((text) => text.textContent).join(",") : "",
      };
    });
    await viewer.close();
    result.chartAxisSurvivesExport = exported.values === "1,200,2,500,1,800,300,-400,600" && exported.fontSize === "10px"
      && exported.attribute === 0 && exported.insidePaint === "rgb(255, 255, 255)"
      && exported.clippedTicks === "0,10,20,30,40";
    return result;
  } finally {
    await fresh.close();
  }
}
