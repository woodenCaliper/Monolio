// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, insertBlock, openMenu } from "../lib.mjs";

// ---- グラフ編集GUI 段2(v158): データの表の選択・温存行の表示・本文の右にペインの幅を空ける ----
// 出典はユーザー原文(グラフの編集UI。Excel/スプレッドシートを参考に右ペインで)。細部はユーザー委任下の PdM 判断。
export default async function chartLayoutSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    pages: [
      {
        id: "CL1",
        title: "Chart Layout",
        blocks: [
          // 本文の列が縮むと折り返しが増える長い段落(グラフより上の高さが変わる)。
          { id: "p0", type: "paragraph", text: "長い段落の文。".repeat(60) },
          { id: "h1", type: "heading2", text: "売上" },
          { id: "t1", type: "table", rows: [cells("月", "金額"), cells("1", "10"), cells("2", "20")] },
          // 値の桁で「どの表を読んでいるか」が絵の目盛りから分かるようにする(2000 はこの表にしかない)。
          { id: "t2", type: "table", rows: [cells("x", "y"), cells("1", "1000"), cells("3", "2000")] },
          { id: "g1", type: "chart", text: 'scatter(A2:A3, B2:B3)\ntitle("T")\nannotate("memo")' },
          { id: "t3", type: "table", rows: [cells("", ""), cells("5", "6")] },
          { id: "g2", type: "chart", text: "table(9)\nscatter(A1:A2, B1:B2)" },
          { id: "g3", type: "chart", text: 'scatter(A1:A2, B1:B2, marker="o")\n# メモ\nannotate("memo")' },
          // 手書きの位置指定(従来どおり位置で読む)。
          { id: "g4", type: "chart", text: "table(2)\nscatter(A2:A3, B2:B3)" },
          { id: "td", type: "todo", text: "check me", checked: false },
          { id: "p2", type: "paragraph", text: "after the charts" },
        ],
      },
      {
        id: "CL2",
        title: "Wide Table",
        blocks: [
          // 列幅を決めた表(合計 760px)。本文の列を縮めるとはみ出すので、この頁では空けない。
          { id: "w1", type: "table", rows: [cells("a", "b"), cells("1", "2")], tableColumnWidths: [380, 380] },
          { id: "wg", type: "chart", text: "scatter(A2:A2, B2:B2)" },
          { id: "wp", type: "paragraph", text: "below" },
        ],
      },
    ],
    fonts: [],
    attachments: [],
  };
  const path = join(OUT, "chart-layout.html");
  const pane = () => fresh.evaluate(() => {
    const el = document.querySelector("#chart-pane");
    const select = document.querySelector("#chart-pane-table");
    const note = document.querySelector("#chart-pane-foreign");
    return {
      open: !el.hidden,
      reserved: document.querySelector(".app").classList.contains("chart-pane-reserved"),
      tableValue: select.value,
      options: [...select.options].map((option) => ({ value: option.value, label: option.textContent })),
      note: note.hidden ? null : note.textContent,
    };
  });
  const layout = (id) => fresh.evaluate((blockId) => {
    const rect = (el) => el.getBoundingClientRect();
    const row = document.querySelector('.block[data-id="' + blockId + '"]');
    const canvas = row.querySelector(".chart-canvas");
    const svg = canvas.querySelector("svg");
    return {
      rowTop: rect(row).top,
      canvasRight: rect(canvas).right,
      paneLeft: rect(document.querySelector("#chart-pane")).left,
      svgWidth: rect(svg).width,
      canvasInner: canvas.clientWidth,
      canvasScroll: canvas.scrollWidth,
      docContent: document.querySelector(".doc").clientWidth,
      pageScrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
      inView: rect(row).top < window.innerHeight && rect(row).bottom > 0,
    };
  }, id);
  const clickCanvas = async (id) => {
    await fresh.locator('.block[data-id="' + id + '"]').scrollIntoViewIfNeeded();
    const box = await fresh.locator('.block[data-id="' + id + '"] .chart-canvas').boundingBox();
    await fresh.mouse.click(box.x + box.width / 2, box.y + 30);
    await fresh.waitForTimeout(300);
  };
  const code = (id) => fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .block-content').textContent, id);
  // グラフの絵の文字(目盛り・エラー)。どの表を読んでいるか・見つからないかをここから見る。
  const chartText = (id) => fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas')?.textContent ?? "", id);
  const pickTable = async (value) => {
    await fresh.locator("#chart-pane-table").selectOption(value);
    await fresh.waitForTimeout(250);
  };
  const selectWithGrip = async (id) => {
    await fresh.locator('.block[data-id="' + id + '"]').scrollIntoViewIfNeeded();
    await fresh.locator('.block[data-id="' + id + '"]').hover();
    await fresh.locator('.block[data-id="' + id + '"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
  };
  const pageBlocks = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => ({
    id: row.dataset.id,
    type: [...row.classList].find((name) => name.startsWith("type-"))?.slice(5) ?? null,
    code: row.classList.contains("type-chart") ? row.querySelector(".block-content").textContent : null,
    chart: row.querySelector(".chart-canvas")?.textContent ?? null,
  })));

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Layout", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // ---- B: 広い幅では本文の右にペインの幅を空け、グラフとペインが重ならない ----
    await fresh.locator('.block[data-id="g1"]').scrollIntoViewIfNeeded();
    const closedLayout = await layout("g1");
    await clickCanvas("g1");
    const opened = await pane();
    const openLayout = await layout("g1");
    result.chartPaneReservesSpaceOnWideScreen = opened.open && opened.reserved
      && openLayout.canvasRight <= openLayout.paneLeft && !openLayout.pageScrolls;
    // 開いた瞬間に本文が縮んでも、クリックしたグラフは画面上の同じ位置に残る。
    result.chartPaneKeepsClickedChartInPlace = openLayout.inView && Math.abs(openLayout.rowTop - closedLayout.rowTop) <= 2;
    // グラフの絵は縮んだ列の幅で描かれる(はみ出さず、絵の入れ物に横スクロールが出ない)。
    result.chartSvgFitsReservedColumn = openLayout.svgWidth <= openLayout.canvasInner + 1
      && openLayout.canvasScroll <= openLayout.canvasInner + 1 && openLayout.canvasInner < closedLayout.canvasInner;

    // ---- A: データの表 ----
    // 一覧: 直上の表(自動。いま読んでいる表を添える)+ページの表。見出し・先頭行で見分けがつく。
    result.chartPaneTableOptionsAreDistinguishable = opened.tableValue === "auto"
      && opened.options.length === 4
      && opened.options[0].label.includes("x / y")
      && opened.options[1].label.includes("売上") && opened.options[1].label.includes("月 / 金額")
      && opened.options[2].label.includes("x / y")
      && opened.options[3].label.includes("(1行目: 空)")
      && new Set(opened.options.map((option) => option.label)).size === 4;
    // 表を選ぶと、位置ではなく表そのもの(ブロックの id)を指す table(id="…") 行が書かれ、別の表を選ぶとその行が
    // 書き換わる(行は1本のまま)。
    await pickTable("id:t3");
    const picked3 = await code("g1");
    await pickTable("id:t1");
    const picked1 = await code("g1");
    result.chartPaneTablePickWritesLine = picked3.split("\n")[0] === 'table(id="t3")'
      && picked1.split("\n")[0] === 'table(id="t1")' && (picked1.match(/table\(/g) || []).length === 1
      && (await pane()).tableValue === "id:t1";
    // 自動に戻すと行が消える。
    await fresh.locator("#chart-pane-table").selectOption("auto");
    await fresh.waitForTimeout(200);
    const backToAuto = await code("g1");
    result.chartPaneTableAutoRemovesLine = !backToAuto.includes("table(") && backToAuto.startsWith("scatter(A2:A3, B2:B3)");
    // GUI では編集できない設定(grid)があると知らせる。
    result.chartPaneNotesUneditableLines = Boolean(opened.note && opened.note.includes("1 行"));

    // GUI で表を選んだグラフは、上に表を足しても同じ表を読む。手書きの table(2) は従来どおり位置で読む。
    await pickTable("id:t2");
    const beforeInsert = { g1: await chartText("g1"), g4: await chartText("g4") };
    await fresh.locator('.block[data-id="p0"] .block-content').click();
    await insertBlock(fresh, "table");
    await fresh.waitForTimeout(400);
    const afterInsert = { g1: await chartText("g1"), g4: await chartText("g4"), tables: (await pageBlocks()).filter((b) => b.type === "table").length };
    result.chartTablePickedByIdSurvivesInsertAbove = beforeInsert.g1.includes("2000") && afterInsert.tables === 4
      && afterInsert.g1.includes("2000");
    result.handwrittenTablePositionStillReadsByPosition = beforeInsert.g4.includes("2000") && !afterInsert.g4.includes("2000")
      && !afterInsert.g4.includes("見つかりません");

    // 表を削除すると「データの表が見つかりません」と出て、ペインでは「見つからない表」を選んだ状態で見える。Undo で戻る。
    await selectWithGrip("t2");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const deletedText = await chartText("g1");
    await clickCanvas("g1");
    const deletedPane = await pane();
    result.chartTableDeletedShowsNotFound = deletedText.includes("データの表が見つかりません")
      && deletedPane.tableValue === "id:t2"
      && deletedPane.options.some((option) => option.value === "id:t2" && option.label.includes("見つからない表"));
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const restoredText = await chartText("g1");

    // 存在しない n を指しているときは「見つからない表 (n)」を選んだ状態で見える。温存行が無ければ知らせない。
    await clickCanvas("g2");
    const missing = await pane();
    result.chartPaneShowsMissingTable = missing.tableValue === "n:9"
      && missing.options.some((option) => option.value === "n:9" && option.label === "見つからない表 (9)")
      && missing.note === null;
    // 知らないオプション(color=)と xlim は数え、コメントは数えない。
    await clickCanvas("g3");
    result.chartPaneCountsUneditableLinesButNotComments = (await pane()).note?.includes("2 行") === true;

    // 押している間は本文をずらさない: ペインを空けた状態でチェックボックスを押すと、押した瞬間にペインが閉じても
    // 離すまで本文は動かず、クリックが届いてチェックが入る。
    await fresh.locator('.block[data-id="td"] .todo-box').click();
    await fresh.waitForTimeout(300);
    result.chartPaneCloseKeepsLayoutUntilRelease = restoredText.includes("2000")
      && await fresh.evaluate(() => document.querySelector('.block[data-id="td"] .todo-box').checked);

    // 閉じるクリック: 本文が広がっても、クリックした段落にキャレットが入る(押した瞬間には本文をずらさない)。
    await clickCanvas("g3");
    await fresh.locator('.block[data-id="p2"]').scrollIntoViewIfNeeded();
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(300);
    const afterClose = await fresh.evaluate(() => ({
      reserved: document.querySelector(".app").classList.contains("chart-pane-reserved"),
      activeBlock: document.activeElement?.closest?.(".block")?.dataset.id ?? null,
      caretBlock: getSelection().rangeCount ? getSelection().getRangeAt(0).startContainer.parentElement?.closest?.(".block")?.dataset.id ?? null : null,
    }));
    result.chartPaneCloseClickLandsInClickedBlock = !afterClose.reserved && afterClose.activeBlock === "p2" && afterClose.caretBlock === "p2";

    // 表とグラフを一緒にコピーして貼る → 貼った側のグラフは、貼った側の表(新しい id)を読む(組として独立した複製)。
    await fresh.locator('.block[data-id="t2"]').scrollIntoViewIfNeeded();
    const pairRows = await fresh.evaluate(() => {
      const a = document.querySelector('.block[data-id="t2"]').getBoundingClientRect();
      const b = document.querySelector('.block[data-id="g1"]').getBoundingClientRect();
      return { left: a.left, top: a.top, bottom: b.bottom };
    });
    await fresh.mouse.move(pairRows.left - 30, pairRows.top + 6);
    await fresh.mouse.down();
    await fresh.mouse.move(pairRows.left - 20, pairRows.top + 12, { steps: 3 });
    await fresh.mouse.move(pairRows.left + 160, Math.min(pairRows.bottom - 6, 880), { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const pairSelected = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id));
    const beforePairPaste = new Set((await pageBlocks()).map((b) => b.id));
    await fresh.keyboard.press("Control+c");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(400);
    const pairPasted = (await pageBlocks()).filter((b) => !beforePairPaste.has(b.id));
    const pastedTable = pairPasted.find((b) => b.type === "table");
    const pastedChart = pairPasted.find((b) => b.type === "chart");
    result.chartAndTableCopiedTogetherReadPastedTable = pairSelected.join(",") === "t2,g1"
      && Boolean(pastedTable && pastedChart) && pastedTable.id !== "t2"
      && pastedChart.code.split("\n")[0] === 'table(id="' + pastedTable.id + '")'
      && (await code("g1")).split("\n")[0] === 'table(id="t2")';

    // 表だけを切り取って同じページに貼る → id はそのまま(移動)で、グラフは読み続ける。同じ切り取りを2回貼ると、
    // 2回目は id が既にあるので別の id になる。コピー→貼り付けは従来どおり新しい id(上の組の複製で確認済み)。
    await selectWithGrip("t2");
    await fresh.keyboard.press("Control+x");
    await fresh.waitForTimeout(300);
    const cutText = await chartText("g1");
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(350);
    const afterFirstPaste = await pageBlocks();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(350);
    const afterSecondPaste = await pageBlocks();
    const ids = afterSecondPaste.map((b) => b.id);
    result.cutTablePastedKeepsIdAndChartReadsIt = cutText.includes("データの表が見つかりません")
      && afterFirstPaste.some((b) => b.id === "t2" && b.type === "table")
      && (afterFirstPaste.find((b) => b.id === "g1")?.chart || "").includes("2000");
    result.sameCutPastedTwiceGetsNewIdSecondTime = afterSecondPaste.filter((b) => b.type === "table").length
      === afterFirstPaste.filter((b) => b.type === "table").length + 1
      && ids.filter((item) => item === "t2").length === 1 && new Set(ids).size === ids.length;

    // グラフだけを別ページへ貼る → その表は貼った先のページに無いので「データの表が見つかりません」。
    await clickCanvas("g1");
    await fresh.keyboard.press("Control+c");
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Wide Table" }).first().click();
    await fresh.waitForTimeout(400);
    const beforeOtherPage = new Set((await pageBlocks()).map((b) => b.id));
    await fresh.locator('.block[data-id="wp"] .block-content').click();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(400);
    const otherPageChart = (await pageBlocks()).find((b) => !beforeOtherPage.has(b.id) && b.type === "chart");
    result.chartPastedToOtherPageShowsTableNotFound = Boolean(otherPageChart)
      && otherPageChart.code.split("\n")[0] === 'table(id="t2")'
      && otherPageChart.chart.includes("データの表が見つかりません");
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Chart Layout" }).first().click();
    await fresh.waitForTimeout(400);

    // 列幅を決めた表が縮んだ列からはみ出すなら空けない(従来どおり重ねる)。
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Wide Table" }).first().click();
    await fresh.waitForTimeout(400);
    await clickCanvas("wg");
    const wide = await pane();
    const tableFits = await fresh.evaluate(() => {
      const table = document.querySelector('.block[data-id="w1"] .editor-table');
      return table.getBoundingClientRect().right <= table.closest(".block-content").getBoundingClientRect().right + 1;
    });
    result.chartPaneSkipsReserveWhenSizedTableWouldOverflow = wide.open && !wide.reserved && tableFits;
    await fresh.locator('.block[data-id="wp"] .block-content').click();
    await fresh.waitForTimeout(200);
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Chart Layout" }).first().click();
    await fresh.waitForTimeout(400);

    // 外から来た id は安全な形のときだけそのまま使う(id は data-id のセレクタにも入る)。安全でない id は振り直す。
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.evaluate(() => {
      const payload = {
        format: "doc-editor-blocks",
        version: 1,
        blocks: [
          { id: 'bad"] *[x="', type: "paragraph", text: "HOSTILE-ID" },
          { id: "kept-id-1", type: "paragraph", text: "SAFE-ID" },
        ],
        attachments: [],
        pageTitles: {},
      };
      const transfer = new DataTransfer();
      transfer.setData("application/x-doc-editor-blocks+json", JSON.stringify(payload));
      transfer.setData("text/plain", "ids");
      document.querySelector('.block[data-id="p2"] .block-content').dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.waitForTimeout(350);
    const pastedIds = await pageBlocks();
    const hostileRow = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].find((row) => row.textContent.includes("HOSTILE-ID"))?.dataset.id ?? null);
    result.pastedBlockIdIsKeptOnlyWhenSafe = Boolean(hostileRow) && /^[A-Za-z0-9_-]+$/.test(hostileRow)
      && pastedIds.some((b) => b.id === "kept-id-1");

    // 両方が収まらない幅では従来どおり重ねる(本文の幅は変えない)。
    await fresh.setViewportSize({ width: 1000, height: 900 });
    await fresh.waitForTimeout(250);
    await fresh.locator('.block[data-id="g1"]').scrollIntoViewIfNeeded();
    const narrowClosed = await layout("g1");
    await clickCanvas("g1");
    const narrow = await pane();
    const narrowOpen = await layout("g1");
    result.chartPaneOverlaysWhenBothDoNotFit = narrow.open && !narrow.reserved && narrowOpen.docContent === narrowClosed.docContent;
    return result;
  } finally {
    await fresh.close();
  }
}
