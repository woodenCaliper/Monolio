// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 横棒 barh(v167。グラフ編集GUI 段5c) ----
// 位置(分類・数)は縦の軸、値は横の軸。分類は表の順に上から。xlim は値の軸・ylim は位置の軸(matplotlib と同じ)。
// 目盛線の既定は値の軸(縦の線)。ほかの種類と混ぜたら見える形のエラー。
export default async function chartBarhSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    pages: [{
      id: "BH1",
      title: "Chart Barh",
      blocks: [
        { id: "t1", type: "table", rows: [cells("部署", "売上", "利益"), cells("営業部", "1,200", "300"), cells("開発部", "2,500", "-400"), cells("管理部", "1,800", "600")] },
        { id: "hc", type: "chart", text: "barh(A2:A4, B2:B4)" },
        { id: "hm", type: "chart", text: 'barh(A2:A4, B2:B4, label="売上", values=True)\nbarh(A2:A4, C2:C4, label="利益", values=True)' },
        { id: "hx", type: "chart", text: "barh(A2:A4, B2:B4)\nxlim(0, 2000)" },
        { id: "hy", type: "chart", text: "barh(A2:A4, B2:B4)\nylim(0, 5)" },
        { id: "hmix", type: "chart", text: "barh(A2:A4, B2:B4)\nplot(A2:A4, B2:B4)" },
        { id: "hmix2", type: "chart", text: "bar(A2:A4, B2:B4)\nbarh(A2:A4, B2:B4)" },
        { id: "hg", type: "chart", text: 'barh(A2:A4, B2:B4)\ngrid("y")' },
        { id: "t2", type: "table", rows: [cells("1", "10"), cells("2", "35"), cells("4", "60"), cells("5", "20")] },
        { id: "hn", type: "chart", text: "barh(A1:A4, B1:B4)\nylim(0, 6)" },
        { id: "hi", type: "chart", text: "barh(A1:A4, B1:B4, values=True)\nxlim(0, 60)" },
        { id: "hp", type: "chart", text: "barh(A1:A4, B1:B4)" },
        // 長い分類の名前は、名前の幅だけ左を空けて縮めずに出す(上限を越える分だけ「…」)。
        { id: "t3", type: "table", rows: [cells("とても長い名前の管理部門", "5"), cells("営業部", "3")] },
        { id: "hl", type: "chart", text: "barh(A1:A2, B1:B2)" },
        // 左の凡例は外側(左端)、分類の名前はその内側(重ならない)。
        { id: "hll", type: "chart", text: 'barh(A1:A2, B1:B2, label="長い系列の名前")\nbarh(A1:A2, B1:B2, label="B")\nlegend(loc="left")' },
        // invert_yaxis(): 縦の軸を逆に(横棒の分類は下から=matplotlib・Excel の並び。縦棒は値が下へ増える)。
        { id: "hv", type: "chart", text: 'table(id="t1")\nbarh(A2:A4, B2:B4)\ninvert_yaxis()' },
        { id: "hv2", type: "chart", text: 'table(id="t1")\nbarh(A2:A4, B2:B4)\ninvert_yaxis(True)' },
        { id: "cv1", type: "chart", text: 'table(id="t1")\nbar(A2:A4, B2:B4, values=True)\ninvert_yaxis()' },
        // 自動の値の軸の上端は目盛りの値(PdM 実測: 最大値 210 で上端が 210 ちょうどになり、棒が枠の上端に付いていた)。
        { id: "t4", type: "table", rows: [cells("1月", "120"), cells("2月", "150"), cells("3月", "90"), cells("4月", "180"), cells("5月", "210"), cells("6月", "170")] },
        { id: "vtop", type: "chart", text: "bar(A1:A6, B1:B6, values=True)" },
        { id: "htop", type: "chart", text: "barh(A1:A6, B1:B6, values=True)" },
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
    const axes = [...(svg?.querySelectorAll("line.chart-axis") ?? [])];
    const grids = [...(svg?.querySelectorAll("line.chart-grid") ?? [])];
    return {
      // 左の目盛り(横棒では位置=分類の名前・数)と下の目盛り(横棒では値)。
      left: [...(svg?.querySelectorAll('text.chart-tick[text-anchor="end"]') ?? [])].map((text) => ({ text: text.textContent, y: num(text, "y") })),
      bottom: [...(svg?.querySelectorAll('text.chart-tick[text-anchor="middle"]') ?? [])].map((text) => ({ text: text.textContent, x: num(text, "x") })),
      bars: [...(svg?.querySelectorAll("rect.chart-bar") ?? [])].map((rect) => ({
        left: num(rect, "x"), right: num(rect, "x") + num(rect, "width"), top: num(rect, "y"), bottom: num(rect, "y") + num(rect, "height"),
        cy: num(rect, "y") + num(rect, "height") / 2,
      })),
      values: [...(svg?.querySelectorAll("text.chart-value") ?? [])].map((text) => ({
        text: text.textContent, x: num(text, "x"), y: num(text, "y"), anchor: text.getAttribute("text-anchor"), cls: text.getAttribute("class"),
      })),
      lines: svg?.querySelectorAll("polyline.chart-line").length ?? 0,
      gridV: grids.filter((line) => line.getAttribute("x1") === line.getAttribute("x2")).length,
      gridH: grids.filter((line) => line.getAttribute("y1") === line.getAttribute("y2")).length,
      gridXs: grids.filter((line) => line.getAttribute("x1") === line.getAttribute("x2")).map((line) => num(line, "x1")),
      frame: axes.length < 2 ? null : { left: num(axes[0], "x1"), right: num(axes[0], "x2"), top: num(axes[1], "y1"), bottom: num(axes[0], "y1") },
      errors: canvas?.querySelector(".chart-errors")?.textContent ?? "",
    };
  }, id);
  const code = (id) => fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .block-content')?.textContent ?? "", id);
  const openPane = async (id) => {
    await fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas')?.scrollIntoView({ block: "center" }), id);
    await fresh.waitForTimeout(100);
    const box = await fresh.locator('.block[data-id="' + id + '"] .chart-canvas').boundingBox();
    await fresh.mouse.click(box.x + box.width / 2, box.y + Math.min(60, box.height / 2));
    await fresh.waitForTimeout(300);
  };
  // 棒の縦の中心が、その目盛りの文字の位置(文字の基準線は中心 +4)に揃うか。
  const centeredOn = (bar, tick) => Boolean(bar && tick) && Math.abs(bar.cy - (tick.y - 4)) < 0.5;
  const within = (bar, frame) => bar.left >= frame.left - 0.5 && bar.right <= frame.right + 0.5 && bar.top >= frame.top - 0.5 && bar.bottom <= frame.bottom + 0.5;
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "chart-barh.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Barh", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // 分類: 縦の軸に表の順で上から。棒は分類の枠の真ん中、0 から右へ伸び、長さは値の順。
    const category = await info("hc");
    const zeroX = (chart) => chart.bottom.find((tick) => tick.text === "0")?.x;
    result.chartBarhCategoriesTopDown = !category.errors && category.left.map((tick) => tick.text).join(",") === "営業部,開発部,管理部"
      && category.left[0].y < category.left[1].y && category.left[1].y < category.left[2].y && category.bars.length === 3
      && category.bars.every((bar, index) => centeredOn(bar, category.left[index]))
      && category.bars.every((bar) => Math.abs(bar.left - zeroX(category)) < 0.5)
      && category.bars[1].right > category.bars[2].right && category.bars[2].right > category.bars[0].right;
    // 数の位置: 値の位置を中心に(数の軸は下から上へ)。ylim は位置の軸(0〜6)。
    const numeric = await info("hn");
    const tickAt = (chart, text) => chart.left.find((tick) => tick.text === text);
    result.chartBarhNumericPositions = !numeric.errors && numeric.bars.length === 4 && Boolean(numeric.frame)
      && tickAt(numeric, "0")?.y > tickAt(numeric, "6")?.y && centeredOn(numeric.bars[2], tickAt(numeric, "4"))
      && numeric.bars[0].cy > numeric.bars[1].cy && numeric.bars.every((bar) => within(bar, numeric.frame));
    // 複数系列: 分類の枠の中で縦に並べる(先の系列が上。重ならない)。負の値は 0 から左へ。
    const multi = await info("hm");
    const multiZero = zeroX(multi);
    result.chartBarhMultiSeriesStacksVertically = multi.bars.length === 6
      && [0, 1, 2].every((index) => multi.bars[index].bottom <= multi.bars[index + 3].top + 0.5 && multi.bars[index].top < multi.bars[index + 3].top);
    result.chartBarhNegativeGoesLeft = multiZero !== undefined && Math.abs(multi.bars[4].right - multiZero) < 0.5 && multi.bars[4].left < multiZero - 1
      && [0, 1, 2, 3, 5].every((index) => Math.abs(multi.bars[index].left - multiZero) < 0.5);
    // データラベル: 棒の右(負なら左)。文字は表の表示。はみ出すときは棒の中の先端に(白。右寄せ)。
    const inside = await info("hi");
    const top = inside.values.find((value) => value.text === "60");
    const topBar = inside.bars[2];
    result.chartBarhValueLabels = multi.values.map((value) => value.text).join(",") === "1,200,2,500,1,800,300,-400,600"
      && multi.values.every((value, index) => {
        const bar = multi.bars[index];
        const beside = value.text.startsWith("-") ? value.x < bar.left && value.anchor === "end" : value.x > bar.right && value.anchor === "start";
        return beside && value.y > bar.top && value.y < bar.bottom + 4 && value.cls === "chart-value";
      })
      && Boolean(top && topBar) && top.cls === "chart-value chart-value-inside" && top.anchor === "end" && top.x < topBar.right && top.x > topBar.left
      && inside.values.filter((value) => value !== top).every((value) => value.cls === "chart-value");
    // xlim は値の軸(横)。範囲の外の棒は枠で切る。
    const clipped = await info("hx");
    result.chartBarhLimitsMeaning = !clipped.errors && clipped.bottom.map((tick) => tick.text).at(-1) === "2000"
      && Boolean(clipped.frame) && clipped.bars.every((bar) => within(bar, clipped.frame)) && Math.abs(clipped.bars[1].right - clipped.frame.right) < 0.5
      && numeric.left.map((tick) => Number(tick.text)).every((tick) => tick >= 0 && tick <= 6) && tickAt(numeric, "6") !== undefined;
    // 分類の軸(横棒の Y)で ylim はエラー(縦棒の xlim と対称)。
    result.chartBarhCategoryYlimError = (await info("hy")).errors.includes("分類の軸では Y の範囲(ylim)を指定できません");
    // ほかの種類と混ぜたらエラー(最初の系列の向きに揃え、違う向きの系列は描かない)。
    const mixed = await info("hmix");
    const mixed2 = await info("hmix2");
    result.chartBarhMixShowsError = mixed.errors.includes("横棒(barh)のグラフに折れ線は混ぜられません") && mixed.lines === 0 && mixed.bars.length === 3
      && mixed2.errors.includes("横棒(barh)はほかの種類と1つのグラフに混ぜられません") && mixed2.bars.length === 3
      && mixed2.bottom.map((tick) => tick.text).join(",") === "営業部,開発部,管理部";
    // 目盛線の既定は値の軸(横棒は縦の線)。grid("y") は画面の向きどおり横の線。
    const grid = await info("hg");
    // 縦の線は値の目盛り(下の目盛り)の位置に引く。
    result.chartBarhGridDefault = category.gridV > 0 && category.gridH === 0 && grid.gridH > 0 && grid.gridV === 0
      && category.gridV === category.bottom.length && category.gridXs.every((x, index) => Math.abs(x - category.bottom[index].x) < 0.5);
    // 左の凡例と分類の名前が重ならない(実際に描いた文字の箱で比べる)。名前は縮めずに出る。
    const leftLegend = await fresh.evaluate(() => {
      const svg = document.querySelector('.block[data-id="hll"] .chart-canvas svg');
      const legendRight = Math.max(...[...svg.querySelectorAll("text.chart-legend")].map((text) => text.getBBox().x + text.getBBox().width));
      const ticks = [...svg.querySelectorAll('text.chart-tick[text-anchor="end"]')];
      return { legendRight, tickLeft: Math.min(...ticks.map((text) => text.getBBox().x)), names: ticks.map((text) => text.textContent).join(",") };
    });
    result.chartBarhLeftLegendDoesNotOverlap = leftLegend.legendRight < leftLegend.tickLeft && leftLegend.names === "とても長い名前の管理部門,営業部";
    // invert_yaxis(): 横棒の分類は下から(棒も名前の位置)。引数つきは見える形のエラー。縦棒では値が下へ増え、値は伸びた先(下)に出る。
    const inverted = await info("hv");
    const invertedBad = await info("hv2");
    result.chartBarhInvertYaxis = !inverted.errors && inverted.left.map((tick) => tick.text).join(",") === "営業部,開発部,管理部"
      && inverted.left[0].y > inverted.left[1].y && inverted.left[1].y > inverted.left[2].y
      && inverted.bars.length === 3 && inverted.bars.every((bar, index) => centeredOn(bar, inverted.left[index]))
      && invertedBad.errors.includes("invert_yaxis() は引数なしで書きます");
    const column = await info("cv1");
    const zeroTick = column.left.find((tick) => tick.text === "0");
    result.chartInvertYaxisOnColumns = !column.errors && Boolean(zeroTick) && column.left.every((tick) => tick.y >= zeroTick.y)
      && column.values.length === 3 && column.bars.length === 3 && column.values.every((value, index) => value.y > column.bars[index].bottom);
    // 自動の値の軸の上端は目盛りの値: 最大値 210(目盛り間隔 50)なら上端 250。いちばん高い棒は枠の上端に付かず、ラベルは棒の外(上)。
    // 横棒でも同じ(右端 250)。
    const columnTop = await info("vtop");
    const barTop = await info("htop");
    const tallest = columnTop.bars[4];
    const tallestLabel = columnTop.values.find((value) => value.text === "210");
    result.chartAutoAxisEndsOnTick = !columnTop.errors && columnTop.left.map((tick) => tick.text).at(-1) === "250"
      && Boolean(columnTop.frame && tallest && tallestLabel) && tallest.top > columnTop.frame.top + 10
      && tallestLabel.cls === "chart-value" && tallestLabel.y < tallest.top
      && !barTop.errors && barTop.bottom.map((tick) => tick.text).at(-1) === "250" && barTop.bars[4].right < barTop.frame.right - 10;
    const long = await info("hl");
    result.chartBarhLongCategoryNamesFit = !long.errors && long.left.map((tick) => tick.text).join(",") === "とても長い名前の管理部門,営業部"
      && Boolean(long.frame) && long.frame.left > 150;

    // GUI: 種類に横棒。範囲の欄は X=値・Y=位置の名前で、分類の軸では Y の欄が無効。目盛線の既定は「縦」。
    await openPane("hc");
    const categoryPane = await fresh.evaluate(() => ({
      labels: [...document.querySelectorAll(".chart-pane-limits label")].map((label) => label.firstChild.nodeValue.trim()).join("/"),
      disabled: ["xmin", "xmax", "ymin", "ymax"].map((key) => document.querySelector("#chart-pane-" + key).disabled).join(","),
      note: document.querySelector("#chart-pane-xlim-note").textContent,
      grid: document.querySelector("#chart-pane-grid").value,
      gridDefault: document.querySelector('#chart-pane-grid option[value="x"]').textContent,
      kinds: [...document.querySelectorAll('#chart-pane .chart-pane-series select[data-field="kind"] option')].map((option) => option.value),
      kind: document.querySelector('#chart-pane .chart-pane-series select[data-field="kind"]').value,
    }));
    result.chartPaneBarhLimitsAndKind = categoryPane.labels === "X(値) の最小/X(値) の最大/Y(位置) の最小/Y(位置) の最大"
      && categoryPane.disabled === "false,false,true,true" && categoryPane.note.includes("Y の範囲")
      && categoryPane.grid === "x" && categoryPane.gridDefault === "縦(既定)" && categoryPane.kinds.includes("barh") && categoryPane.kind === "barh";
    // invert_yaxis() は GUI に出さないが読める行(「GUI では編集できない設定」に数えない)。引数つきは数える。
    await openPane("hv");
    const invertForeign = await fresh.evaluate(() => !document.querySelector("#chart-pane-foreign").hidden);
    await openPane("hv2");
    const invertBadForeign = await fresh.evaluate(() => !document.querySelector("#chart-pane-foreign").hidden);
    result.chartPaneInvertYaxisIsNotForeign = !invertForeign && invertBadForeign;
    // GUI でコードが書き換わる: 値の軸の最大(X)・目盛線(横を選ぶと grid("y")、既定の縦に戻すと行が消える)・系列の追加は横棒。
    await openPane("hp");
    await fresh.locator("#chart-pane-xmax").fill("50");
    await fresh.waitForTimeout(250);
    const afterLimit = await code("hp");
    await fresh.locator("#chart-pane-grid").selectOption("y");
    await fresh.waitForTimeout(200);
    const afterGridY = await code("hp");
    await fresh.locator("#chart-pane-grid").selectOption("x");
    await fresh.waitForTimeout(200);
    const afterGridX = await code("hp");
    await fresh.locator("#chart-pane-add").click();
    await fresh.waitForTimeout(250);
    const afterAdd = await code("hp");
    result.chartPaneBarhWritesCode = afterLimit.includes("xlim(right=50)") && afterGridY.includes('grid("y")') && !afterGridX.includes("grid(")
      && (afterAdd.match(/barh\(/g) || []).length === 2 && !afterAdd.includes("scatter(") && !(await info("hp")).errors;
    // 種類を縦棒へ切り替えると、コードも縦棒に(1系列目。2系列目の横棒は混ぜられないエラーになる)。
    await fresh.locator('#chart-pane .chart-pane-series select[data-field="kind"]').first().selectOption("bar");
    await fresh.waitForTimeout(250);
    const switched = await code("hp");
    // 切り替えるとペインも組み立て直す(範囲の欄の名前が縦棒の名前に戻る。v168)。
    const switchedLabel = await fresh.evaluate(() => document.querySelector(".chart-pane-limits label").firstChild.nodeValue.trim());
    result.chartPaneBarhKindSwitch = /^bar\(A1:A4, B1:B4\)/m.test(switched) && (await info("hp")).errors.includes("横棒(barh)はほかの種類と")
      && switchedLabel === "X の最小";
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(200);

    // 保存HTML: 無害化は描いた SVG に対して恒等(新しい要素・属性は無い)。保存HTMLを直接開いても同じに描かれる。
    const signature = () => [...document.querySelectorAll("svg.chart-svg")].map((svg) => {
      const walk = (node) => (node.nodeType === 3 ? node.nodeValue
        : node.nodeName + "[" + [...node.attributes].map((attr) => attr.name + "=" + attr.value).sort().join("|") + "](" + [...node.childNodes].map(walk).join("") + ")");
      return walk(svg);
    });
    result.chartBarhSvgSanitizeIsIdentity = await fresh.evaluate(() => {
      const svgs = [...document.querySelectorAll("#blocks .chart-canvas svg")].map((svg) => svg.outerHTML);
      return svgs.length >= 9 && svgs.every((svg) => window.SingleHtmlFormat.sanitizeChartSvg(svg) === svg
        || new DOMParser().parseFromString(window.SingleHtmlFormat.sanitizeChartSvg(svg), "image/svg+xml").documentElement.outerHTML
          === new DOMParser().parseFromString(svg, "image/svg+xml").documentElement.outerHTML);
    });
    const editorSignature = await fresh.evaluate(signature);
    const download = fresh.waitForEvent("download");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "chart-barh-saved.html");
    await (await download).saveAs(savedPath);
    const raw = await readFile(savedPath, "utf8");
    const viewer = await context.newPage();
    await viewer.setContent(raw, { waitUntil: "load" });
    const savedSignature = await viewer.evaluate(signature);
    await viewer.close();
    result.chartBarhSurvivesExport = editorSignature.length >= 9 && editorSignature.length === savedSignature.length
      && editorSignature.every((item, index) => item === savedSignature[index]);
    return result;
  } finally {
    await fresh.close();
  }
}
