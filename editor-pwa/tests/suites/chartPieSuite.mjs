// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 円グラフ pie(v168。グラフ編集GUI 段5d) ----
// pie(分類, 値)・pie(値, labels=分類)。12時から時計回り。扇形は分類ごとの既定の配色。1系列だけ・ほかの種類と混ぜない。
// 軸まわりの設定は書いてあっても使わない(GUI では隠す)。扇形の輪郭は path の d で、無害化は d の語彙まで検査する。
export default async function chartPieSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    pages: [{
      id: "PI1",
      title: "Chart Pie",
      blocks: [
        { id: "t1", type: "table", rows: [cells("部署", "売上"), cells("営業部", "1,200"), cells("開発部", "2,500"), cells("管理部", "1,800"), cells("総務部", "0")] },
        { id: "pa", type: "chart", text: "pie(A2:A5, B2:B5)" },
        { id: "pm", type: "chart", text: "pie(B2:B5, labels=A2:A5)" },
        { id: "pv", type: "chart", text: "pie(A2:A5, B2:B5, values=True, autopct=True)" },
        { id: "pf", type: "chart", text: 'pie(A2:A5, B2:B5, autopct="%1.1f%%")' },
        { id: "pmix", type: "chart", text: "pie(A2:A5, B2:B5)\nbar(A2:A5, B2:B5)" },
        { id: "pmix2", type: "chart", text: "bar(A2:A5, B2:B5)\npie(A2:A5, B2:B5)" },
        { id: "p2x", type: "chart", text: "pie(A2:A5, B2:B5)\npie(A2:A5, B2:B5)" },
        { id: "pc", type: "chart", text: 'pie(A2:A5, B2:B5, color="red")' },
        { id: "pi", type: "chart", text: 'pie(A2:A5, B2:B5)\nxlim(0, 5)\nylim(0, 5)\ngrid("both")\nxlabel("x")\nylabel("y")\ninvert_yaxis()' },
        { id: "pl", type: "chart", text: "pie(A2:A5, B2:B5)\nlegend(False)" },
        { id: "pone", type: "chart", text: "pie(A2:A2, B2:B2, values=True)" },
        { id: "t2", type: "table", rows: [cells("A", "30"), cells("B", "-10"), cells("C", "70")] },
        { id: "pn", type: "chart", text: "pie(A1:A3, B1:B3)" },
        { id: "t3", type: "table", rows: [cells("A", "0"), cells("B", "0")] },
        { id: "pz", type: "chart", text: "pie(A1:A2, B1:B2)" },
        // 向きは最初の系列の行で先に決める(書きかけの barh() でも横棒の向き)。向きの違う系列の分類は入れない(v168。段5c の記録)。
        { id: "t4", type: "table", rows: [cells("営業部", "10", "北", "5"), cells("開発部", "20", "南", "6"), cells("管理部", "30", "東", "7")] },
        { id: "ho", type: "chart", text: "barh()\nplot(A1:A3, B1:B3)" },
        { id: "hc", type: "chart", text: "barh(A1:A3, B1:B3)\nplot(C1:C3, D1:D3)" },
        { id: "pp", type: "chart", text: "bar(A1:A3, B1:B3)" },
        // 形(TL 設計注意): 描く扇が1つなら円全体/半分を越える扇は large-arc=1/ちょうど半分/極端な値(指数表記を出さない)。
        { id: "t5", type: "table", rows: [cells("A", "5"), cells("B", "0"), cells("C", "0")] },
        { id: "pfull", type: "chart", text: "pie(A1:A3, B1:B3)" },
        { id: "t6", type: "table", rows: [cells("A", "3"), cells("B", "1")] },
        { id: "plarge", type: "chart", text: "pie(A1:A2, B1:B2)" },
        { id: "pccw", type: "chart", text: "pie(A1:A2, B1:B2, counterclock=True)" },
        { id: "pang", type: "chart", text: "pie(A1:A2, B1:B2, startangle=90, counterclock=False)" },
        { id: "pang0", type: "chart", text: "pie(A1:A2, B1:B2, startangle=0)" },
        { id: "pbad", type: "chart", text: 'pie(A1:A2, B1:B2, startangle="a", counterclock=1)' },
        { id: "t7", type: "table", rows: [cells("A", "1"), cells("B", "1")] },
        { id: "phalf", type: "chart", text: "pie(A1:A2, B1:B2)" },
        { id: "t8", type: "table", rows: [cells("A", "1"), cells("B", "1000000")] },
        { id: "pext1", type: "chart", text: "pie(A1:A2, B1:B2, autopct=True)" },
        { id: "t9", type: "table", rows: [cells("A", "999999"), cells("B", "0.001")] },
        { id: "pext2", type: "chart", text: "pie(A1:A2, B1:B2, values=True)" },
        // 同じ名前の分類は黙って合計しない(行ごとに1つの扇)。
        { id: "t10", type: "table", rows: [cells("1月", "10"), cells("1月", "20")] },
        { id: "pdup", type: "chart", text: "pie(A1:A2, B1:B2)" },
        // 別名 line(= plot)の行。ペインでは「折れ線」として見え、種類を変えるまで行の名前は変わらない。
        { id: "pline", type: "chart", text: "line(A1:A2, B1:B2)" },
        // 見本は読む表から作る(v170): 見出しのある表の下にグラフを作っても、最初からエラーにならない。
        { id: "t11", type: "table", rows: [cells("月", "売上", "利益"), cells("1月", "10", "3"), cells("2月", "20", "5")] },
        // 見出しを宣言した表(1行目が数でも見出し。範囲選択と同じ規則。TL の注意)。
        { id: "t12", type: "table", tableHeader: true, rows: [cells("番号", "2024"), cells("1", "10"), cells("2", "20"), cells("3", "15")] },
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
      paths: [...(svg?.querySelectorAll("path.chart-slice") ?? [])].map((path) => ({ d: path.getAttribute("d"), fill: path.getAttribute("fill") })),
      values: [...(svg?.querySelectorAll("text.chart-value") ?? [])].map((text) => text.textContent),
      legend: [...(svg?.querySelectorAll("text.chart-legend") ?? [])].map((text) => text.textContent),
      swatches: [...(svg?.querySelectorAll("rect.chart-legend-swatch") ?? [])].map((rect) => rect.getAttribute("fill")),
      axes: svg?.querySelectorAll("line.chart-axis").length ?? 0,
      grid: svg?.querySelectorAll("line.chart-grid").length ?? 0,
      labels: svg?.querySelectorAll("text.chart-label").length ?? 0,
      ticks: [...(svg?.querySelectorAll("text.chart-tick") ?? [])].map((text) => text.textContent),
      bars: svg?.querySelectorAll("rect.chart-bar").length ?? 0,
      lines: svg?.querySelectorAll("polyline.chart-line").length ?? 0,
      message: svg?.querySelector("text.chart-message")?.textContent ?? "",
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
  // d を数の並びにする(M cx cy L x1 y1 A r r 0 large 1 x2 y2 Z)。
  const numbers = (d) => d.split(/[^0-9.\-]+/).filter(Boolean).map(Number);
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "chart-pie.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Pie", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // 12時から時計回り: 最初の扇形は中心の真上から始まり、右側(時計回り)で終わる。扇形は分類ごとの既定の配色。0 の分類は扇形なし。
    const basic = await info("pa");
    const [cx, cy, x1, y1, , , , , , x2] = basic.paths.length ? numbers(basic.paths[0].d) : [];
    result.chartPieSlicesStartAtTopClockwise = !basic.errors && basic.paths.length === 3 && Math.abs(x1 - cx) < 0.01 && y1 < cy && x2 > cx
      && basic.paths.map((slice) => slice.fill).join(",") === "#2f6fb2,#c1512f,#16835f"
      && basic.axes === 0 && basic.ticks.length === 0;
    // matplotlib の形 pie(値, labels=分類) も同じに描く。
    const matplotlib = await info("pm");
    result.chartPieMatplotlibFormSame = !matplotlib.errors && JSON.stringify(matplotlib.paths) === JSON.stringify(basic.paths)
      && matplotlib.legend.join(",") === basic.legend.join(",");
    // データラベル: values=True は値(表の表示)、autopct=True は整数の %、"%1.1f%%" は小数1桁。
    result.chartPieLabelsValuesAndPercent = (await info("pv")).values.join("/") === "1,200(22%)/2,500(45%)/1,800(33%)";
    result.chartPieAutopctFormat = (await info("pf")).values.join("/") === "21.8%/45.5%/32.7%";
    // 負の値は見える形のエラー(その扇形は描かない)。すべて 0 もエラー。
    const negative = await info("pn");
    const zero = await info("pz");
    result.chartPieNegativeAndZero = negative.errors.includes("円グラフに負の値は使えません") && negative.errors.includes("-10") && negative.paths.length === 2
      && zero.errors.includes("円グラフの値がすべて 0 です") && zero.paths.length === 0 && basic.legend.includes("総務部");
    // ほかの種類と混ぜたらエラー(最初の系列の向きに揃える)。円は1系列だけ。color= はエラー(扇形は分類ごとの配色のまま)。
    const mixed = await info("pmix");
    const mixed2 = await info("pmix2");
    const twice = await info("p2x");
    const colored = await info("pc");
    result.chartPieMixShowsError = mixed.errors.includes("円グラフ(pie)のグラフに縦棒は混ぜられません") && mixed.bars === 0 && mixed.paths.length === 3
      && mixed2.errors.includes("円グラフ(pie)はほかの種類と1つのグラフに混ぜられません") && mixed2.paths.length === 0 && mixed2.bars === 4;
    result.chartPieOneSeriesOnly = twice.errors.includes("円グラフは1つのグラフに1系列だけです") && twice.paths.length === 3;
    result.chartPieColorIsError = colored.errors.includes("円グラフでは color= は使えません") && JSON.stringify(colored.paths) === JSON.stringify(basic.paths);
    // 軸まわりの設定(xlim・ylim・grid・xlabel・ylabel・invert_yaxis)は書いてあっても使わない(エラーにもしない)。
    const ignored = await info("pi");
    // 効いていないことは見える: コードの帯に「円では効かない行 6」(温存行とは別に数える。P22)。
    const ignoredBand = await fresh.evaluate(() => document.querySelector('.block[data-id="pi"] .chart-source-status')?.textContent ?? "");
    const basicBand = await fresh.evaluate(() => document.querySelector('.block[data-id="pa"] .chart-source-status')?.textContent ?? "");
    result.chartPieIgnoresAxisSettings = !ignored.errors && JSON.stringify(ignored.paths) === JSON.stringify(basic.paths)
      && ignored.grid === 0 && ignored.axes === 0 && ignored.labels === 0
      && ignoredBand.includes("円では効かない行 6") && !ignoredBand.includes("GUI では編集できない行") && !basicBand.includes("効かない");
    // 凡例は既定で分類の名前(扇形と同じ色。0 の分類も)。legend(False) で消える。
    const hidden = await info("pl");
    result.chartPieLegend = basic.legend.join(",") === "営業部,開発部,管理部,総務部"
      && basic.swatches.slice(0, 3).join(",") === "#2f6fb2,#c1512f,#16835f" && hidden.legend.length === 0 && hidden.paths.length === 3;
    // 1つで円全体(半円の弧2本)。値は中心に。
    const whole = await info("pone");
    // 描く扇が1つ(ほかが 0 で描かない場合も)なら円全体。
    const onlyOne = await info("pfull");
    result.chartPieFullCircle = whole.paths.length === 1 && (whole.paths[0].d.match(/A/g) || []).length === 2 && whole.values.join() === "1,200"
      && onlyOne.paths.length === 1 && (onlyOne.paths[0].d.match(/A/g) || []).length === 2
      // 円全体は中心を通らない(中心から12時への半径の線を描かない。v170)。
      && !/L/.test(whole.paths[0].d) && !/L/.test(onlyOne.paths[0].d);
    // 弧はいつも半分以下(v169): 半分を越える扇(3:1 の 3)は中点で2本の弧、large-arc は常に 0。ちょうど半分は1本。
    // 弧の向きのフラグは時計回りが 1。扇の終わりの点は d の最後の2つの数。
    const flagsOf = (d) => [...d.matchAll(/A \S+ \S+ 0 (\d) (\d)/g)].map((match) => match[1] + match[2]);
    const endOf = (d) => numbers(d).slice(-2);
    const large = await info("plarge");
    const half = await info("phalf");
    result.chartPieLargeArcFlag = flagsOf(large.paths[0].d).join(",") === "01,01" && flagsOf(large.paths[1].d).join(",") === "01"
      && half.paths.length === 2 && half.paths.every((slice) => flagsOf(slice.d).join(",") === "01");
    // ほぼ 100% の扇([1, 1000000]・[999999, 0.001])も描かれる: いちばん大きい扇の箱の幅が直径に近い(v169。TL M監査。
    // 以前は1本の大きな弧の始点と終点が丸めで同じ点になり、扇が丸ごと消えていた)。
    const nearlyFull = await fresh.evaluate(() => ["pext1", "pext2"].map((id) => {
      const paths = [...document.querySelectorAll('.block[data-id="' + id + '"] path.chart-slice')];
      const radius = Number((/A (\S+)/.exec(paths[0]?.getAttribute("d") || "") || [])[1] || 0);
      return { radius, widest: Math.max(0, ...paths.map((path) => path.getBBox().width)) };
    }));
    result.chartPieNearlyFullSliceIsDrawn = nearlyFull.every(({ radius, widest }) => radius > 50 && widest > radius * 2 - 2);
    // startangle / counterclock(matplotlib と同じ意味)。書かないときは startangle=90, counterclock=False と同じ。3:1 の大きい扇は、時計回りなら9時(左)、反時計回りなら3時(右)で終わる。
    const ccw = await info("pccw");
    const [ccx] = numbers(ccw.paths[0].d);
    const [ccx2] = endOf(ccw.paths[0].d);
    const bad = await info("pbad");
    // startangle=0 は matplotlib と同じく3時の位置から(向きは既定の時計回り。3:1 の大きい扇は12時で終わる)。
    const angleZero = (await info("pang0")).paths[0].d;
    const [zx, zy, zx1, zy1] = numbers(angleZero);
    const [zx2, zy2] = endOf(angleZero);
    const startsAtThree = zx1 > zx + 100 && Math.abs(zy1 - zy) < 0.5 && Math.abs(zx2 - zx) < 0.5 && zy2 < zy - 100;
    result.chartPieStartAngleAndDirection = startsAtThree && JSON.stringify((await info("pang")).paths) === JSON.stringify(large.paths)
      && ccx2 > ccx && endOf(large.paths[0].d)[0] < numbers(large.paths[0].d)[0] && flagsOf(ccw.paths[0].d).join(",") === "00,00"
      && bad.errors.includes("startangle= は角度の数で書いてください") && bad.errors.includes("counterclock= は True か False で書いてください");
    // 同じ名前の分類は行ごとに1つの扇(黙って合計しない)。凡例にも2つ。
    const duplicate = await info("pdup");
    result.chartPieDuplicateNamesNotMerged = duplicate.paths.length === 2 && duplicate.legend.join(",") === "1月,1月" && !duplicate.errors;

    // 向きは最初の系列の行で先に決める: 書きかけの barh() の次の plot は、横棒のグラフに混ぜた扱い(以前は折れ線のグラフになった)。
    const early = await info("ho");
    result.chartOrientationFromFirstSeriesLine = early.errors.includes("barh() にはセルの範囲が必要です")
      && early.errors.includes("横棒(barh)のグラフに折れ線は混ぜられません") && early.lines === 0;
    // 落とした系列(向きの違う plot)の分類は、分類の軸に入らない(空の枠が残らない)。
    const dropped = await info("hc");
    result.chartDroppedSeriesAddNoCategories = dropped.ticks.filter((tick) => ["営業部", "開発部", "管理部", "北", "南", "東"].includes(tick)).join(",")
      === "営業部,開発部,管理部";

    // GUI: 種類に pie。円のときは軸まわりの欄・系列の色・ラベル・「系列を追加」を隠し、「割合を表示」を出す。凡例の既定は「自動(表示)」。
    await openPane("pa");
    const shown = (selector) => fresh.evaluate((sel) => {
      const element = document.querySelector(sel);
      return Boolean(element) && element.getClientRects().length > 0 && getComputedStyle(element).display !== "none";
    }, selector);
    const piePane = {
      kind: await fresh.evaluate(() => document.querySelector('#chart-pane .chart-pane-series select[data-field="kind"]').value),
      xlabel: await shown("#chart-pane-xlabel"),
      ylabel: await shown("#chart-pane-ylabel"),
      limits: await shown("#chart-pane-xmin"),
      grid: await shown("#chart-pane-grid"),
      add: await shown("#chart-pane-add"),
      color: await shown("#chart-pane .chart-pane-color"),
      percent: await shown('#chart-pane input[data-field="autopct"]'),
      title: await shown("#chart-pane-title"),
      legendAuto: await fresh.evaluate(() => document.querySelector('#chart-pane-legend option[value="auto"]').textContent),
      foreign: await fresh.evaluate(() => !document.querySelector("#chart-pane-foreign").hidden),
    };
    await openPane("pi");
    const ignoredForeign = await fresh.evaluate(() => !document.querySelector("#chart-pane-foreign").hidden);
    // matplotlib の形 pie(値, labels=分類) は GUI で編集できない行(温存行。値が分類の欄に出る誤表示を避ける。PdM 判断)。
    await openPane("pm");
    const labelsForm = await fresh.evaluate(() => ({
      foreign: !document.querySelector("#chart-pane-foreign").hidden,
      rows: document.querySelectorAll("#chart-pane .chart-pane-series").length,
    }));
    result.chartPanePieLabelsFormIsForeign = labelsForm.foreign && labelsForm.rows === 0;
    result.chartPanePieHidesAxisFields = piePane.kind === "pie" && !piePane.xlabel && !piePane.ylabel && !piePane.limits && !piePane.grid
      && !piePane.add && !piePane.color && piePane.percent && piePane.title && piePane.legendAuto === "自動(表示)" && !piePane.foreign && !ignoredForeign;
    // GUI でコードが書き換わる: 縦棒から円へ切り替え(軸の欄が隠れる)・割合のチェックで autopct=True。縦棒へ戻すと欄が出る。
    await openPane("pp");
    const barFieldsBefore = await shown("#chart-pane-xmin");
    await fresh.locator('#chart-pane .chart-pane-series select[data-field="kind"]').selectOption("pie");
    await fresh.waitForTimeout(300);
    const switched = await code("pp");
    const barFieldsAfter = await shown("#chart-pane-xmin");
    await fresh.locator('#chart-pane input[data-field="autopct"]').check();
    await fresh.waitForTimeout(250);
    const withPercent = await code("pp");
    const percentShown = (await info("pp")).values.join("/");
    result.chartPanePieWritesCode = barFieldsBefore && switched === "pie(A1:A3, B1:B3)" && !barFieldsAfter
      && withPercent === "pie(A1:A3, B1:B3, autopct=True)" && percentShown === "17%/33%/50%";
    // 種類の選択肢は意味ごとに1つ(plot と line、hist と histogram を重ねない)・日本語の名前。line の行は「折れ線」を選んだ状態で見え、
    // ほかの欄を変えても行の名前は line のまま。種類を変えたときだけ正の名前(plot)で書く(v168。PdM)。
    await openPane("pline");
    const kindOptions = await fresh.evaluate(() => {
      const select = document.querySelector('#chart-pane .chart-pane-series select[data-field="kind"]');
      return {
        values: [...select.options].map((option) => option.value).join(","),
        texts: [...select.options].map((option) => option.textContent).join(","),
        shown: select.selectedOptions[0]?.textContent,
      };
    });
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="label"]').fill("売上");
    await fresh.waitForTimeout(250);
    const keptAlias = await code("pline");
    await fresh.locator('#chart-pane .chart-pane-series select[data-field="kind"]').selectOption("bar");
    await fresh.waitForTimeout(250);
    await fresh.locator('#chart-pane .chart-pane-series select[data-field="kind"]').selectOption("plot");
    await fresh.waitForTimeout(250);
    const canonical = await code("pline");
    result.chartPaneKindChoicesAreUnique = kindOptions.values === "scatter,plot,bar,barh,hist,pie"
      && kindOptions.texts === "散布図,折れ線,縦棒,横棒,ヒストグラム,円" && kindOptions.shown === "折れ線"
      && keptAlias === 'line(A1:A2, B1:B2, label="売上")' && canonical === 'plot(A1:A2, B1:B2, label="売上")';
    // 見出しのある表の下にグラフを作ると、見本は表から: 範囲はデータの行だけ、A 列が文字なら縦棒、ラベル・題名・軸の名前は見出しから。
    // 以前は固定の scatter(A1:A10, B1:B10) で「散布図の X は数で…」のエラーになっていた(v170。TL の棚卸し)。
    // 表のすぐ後ろへ、画面の操作(＋ → /chart)でグラフを作り、その id を返す。
    const insertChartAfter = async (tableId) => {
      await fresh.evaluate((id) => document.querySelector('.block[data-id="' + id + '"]').scrollIntoView({ block: "center" }), tableId);
      await fresh.locator('.block[data-id="' + tableId + '"] .insert-block').click();
      await fresh.waitForTimeout(200);
      await fresh.keyboard.type("/chart");
      await fresh.waitForTimeout(300);
      await fresh.keyboard.press("Enter");
      await fresh.waitForTimeout(500);
      return fresh.evaluate((id) => {
        const blocks = [...document.querySelectorAll("#blocks .block")];
        const next = blocks[blocks.findIndex((block) => block.dataset.id === id) + 1];
        return next?.classList.contains("type-chart") ? next.dataset.id : null;
      }, tableId);
    };
    // 宣言した見出しの表: 1行目(番号・2024)は数でも見出し。A 列は数なので散布図、範囲は2行目から最後の行まで。
    const declaredId = await insertChartAfter("t12");
    const declared = declaredId ? await info(declaredId) : null;
    const declaredCode = declaredId ? await code(declaredId) : "";
    const declaredOk = Boolean(declared) && !declared.errors
      && declaredCode === 'scatter(A2:A4, B2:B4, label="2024")\ntitle("2024")\nxlabel("番号")\nylabel("2024")';
    const createdId = await insertChartAfter("t11");
    const created = createdId ? await info(createdId) : null;
    const createdCode = createdId ? await code(createdId) : "";
    result.chartSampleFromHeaderTable = declaredOk && Boolean(created) && !created.errors && created.bars === 2
      && createdCode === 'bar(A2:A3, B2:B3, label="売上")\ntitle("売上")\nxlabel("月")\nylabel("売上")';
    // 系列を追加も同じ関数で: 値は次の列(利益)、種類は前の系列(縦棒)、ラベルは見出し。
    if (createdId) {
      await openPane(createdId);
      await fresh.locator("#chart-pane-add").click();
      await fresh.waitForTimeout(300);
    }
    const addedCode = createdId ? await code(createdId) : "";
    // もう一度足すと、使われていない列が無いので最後の列(C)を使う(エラーにしない。GUI で直せる)。
    if (createdId) {
      await fresh.locator("#chart-pane-add").click();
      await fresh.waitForTimeout(300);
    }
    const addedAgain = createdId ? await code(createdId) : "";
    result.chartAddSeriesFromTable = addedCode.startsWith('bar(A2:A3, B2:B3, label="売上")\nbar(A2:A3, C2:C3, label="利益")')
      && addedAgain.startsWith('bar(A2:A3, B2:B3, label="売上")\nbar(A2:A3, C2:C3, label="利益")\nbar(A2:A3, C2:C3, label="利益")')
      && createdId !== null && !(await info(createdId)).errors;
    // ペインの言葉は日本語(v170。PdM 判断。アプリ全体の表示言語はこのサイクルでは変えない)。
    const paneTexts = await fresh.evaluate(() => ({
      header: document.querySelector(".chart-pane-header").textContent,
      aria: document.querySelector("#chart-pane").getAttribute("aria-label"),
      add: document.querySelector("#chart-pane-add").textContent,
      labels: ["#chart-pane-title", "#chart-pane-xlabel", "#chart-pane-ylabel"].map((id) => document.querySelector(id).closest("label").firstChild.nodeValue.trim()).join("/"),
      placeholder: document.querySelector('#chart-pane input[data-field="label"]').placeholder,
      remove: document.querySelector("#chart-pane .chart-pane-remove").title,
    }));
    result.chartPaneTextsAreJapanese = paneTexts.header === "グラフの設定" && paneTexts.aria === "グラフの設定" && paneTexts.add.trim() === "系列を追加"
      && paneTexts.labels === "題名/X 軸の名前/Y 軸の名前" && paneTexts.placeholder === "ラベル" && paneTexts.remove === "系列を削除";
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(200);

    // 無害化: 円の SVG に対して恒等。d に描画の語彙の外の文字(url(・英字・引用符)があれば path ごと落とす。
    result.chartPieSvgSanitizeIsIdentity = await fresh.evaluate(() => {
      const svgs = [...document.querySelectorAll("#blocks .chart-canvas svg")].filter((svg) => svg.querySelector("path"));
      // 極端な値(ほぼ 0・ほぼ 100% の扇)を含む円でも、d に指数表記が出ず、無害化で落ちない。
      const extremes = ["pext1", "pext2"].map((id) => document.querySelector('.block[data-id="' + id + '"] .chart-canvas svg'));
      const ds = extremes.flatMap((svg) => [...(svg?.querySelectorAll("path") ?? [])].map((path) => path.getAttribute("d")));
      return svgs.length >= 14 && ds.length >= 4 && ds.every((d) => !/e/i.test(d))
        && svgs.every((svg) => new DOMParser().parseFromString(window.SingleHtmlFormat.sanitizeChartSvg(svg.outerHTML), "image/svg+xml").documentElement.outerHTML
        === new DOMParser().parseFromString(svg.outerHTML, "image/svg+xml").documentElement.outerHTML);
    });
    result.chartSanitizeDropsBadPathData = await fresh.evaluate(() => {
      const wrap = (d) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path class="chart-slice" d="' + d + '" fill="#2f6fb2"/><rect class="chart-bar" x="1" y="1" width="2" height="2"/></svg>';
      const good = window.SingleHtmlFormat.sanitizeChartSvg(wrap("M 5 5 L 5 0 A 5 5 0 0 1 10 5 Z"));
      // 字句の単位で検査する: 語彙の外の文字だけでなく、区切りの無い数(1-2)・小数点の重なり(1..2)・符号の重なり(--1)も落とす。
      const bad = ["M 5 5 L url(#x) Z", "M 5 5 L 5 0 C 1 2 3 4 5 6", "M 5 5 L 5 0 z", "M 5 5 L 1e3 2 Z", "", "M 5 5 L 1-2 Z", "M 5 5 L 1..2 3 Z", "M --1 5 Z"]
        .map((d) => window.SingleHtmlFormat.sanitizeChartSvg(wrap(d)));
      return good.includes("<path") && good.includes('d="M 5 5 L 5 0 A 5 5 0 0 1 10 5 Z"')
        && bad.every((svg) => !svg.includes("<path") && svg.includes("<rect"));
    });
    // d は path にだけ許す: rect・line などに付けた d は落ちる(要素は残る)。path の d は残る(v169。TL)。
    result.chartSanitizeDropsDOutsidePath = await fresh.evaluate(() => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect class="chart-bar" x="1" y="1" width="2" height="2" d="M 1 1 Z"/>'
        + '<line class="chart-axis" x1="0" y1="0" x2="5" y2="5" d="M 0 0 L 5 5"/><path class="chart-slice" d="M 5 5 L 5 0 A 5 5 0 0 1 10 5 Z" fill="#2f6fb2"/></svg>';
      const clean = window.SingleHtmlFormat.sanitizeChartSvg(svg);
      const doc = new DOMParser().parseFromString(clean, "image/svg+xml");
      return Boolean(doc.querySelector("rect") && doc.querySelector("line")) && !doc.querySelector("rect").hasAttribute("d")
        && !doc.querySelector("line").hasAttribute("d") && doc.querySelector("path")?.getAttribute("d") === "M 5 5 L 5 0 A 5 5 0 0 1 10 5 Z";
    });
    // 保存HTMLを直接開いても同じに描かれる。
    const signature = () => [...document.querySelectorAll("svg.chart-svg")].map((svg) => {
      const walk = (node) => (node.nodeType === 3 ? node.nodeValue
        : node.nodeName + "[" + [...node.attributes].map((attr) => attr.name + "=" + attr.value).sort().join("|") + "](" + [...node.childNodes].map(walk).join("") + ")");
      return walk(svg);
    });
    const editorSignature = await fresh.evaluate(signature);
    const download = fresh.waitForEvent("download");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "chart-pie-saved.html");
    await (await download).saveAs(savedPath);
    const raw = await readFile(savedPath, "utf8");
    const viewer = await context.newPage();
    await viewer.setContent(raw, { waitUntil: "load" });
    const savedSignature = await viewer.evaluate(signature);
    const savedPaths = await viewer.evaluate(() => document.querySelectorAll(".doc-chart svg path.chart-slice").length);
    await viewer.close();
    result.chartPieSurvivesExport = editorSignature.length >= 10 && editorSignature.length === savedSignature.length
      && editorSignature.every((item, index) => item === savedSignature[index]) && savedPaths >= 20;
    return result;
  } finally {
    await fresh.close();
  }
}
