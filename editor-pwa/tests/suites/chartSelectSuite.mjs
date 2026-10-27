// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, insertBlock, openMenu } from "../lib.mjs";

// ---- グラフを選ぶと右のペインが開く(v157。グラフ編集GUI 段1) ----
// ユーザー原文「グラフの編集 UI が欲しい…右ペインにグラフに関する編集UIが出てきて、そこでグラフについての編集が
// できるようにする/コードはあくまで上級者がAI向けにして、普通の人にはGUIで操作させたい」(以降はユーザー委任下の
// PdM 判断)。開閉は「選んでいるグラフ」という状態で決まる。入口は絵のクリック・Enter・コード欄・ブロック選択、
// 閉じるのは別の場所・Esc・ページ切り替え・削除・Undo・開き直し。狭い画面では目次のオーバーレイと同時に開かない。
export default async function chartSelectSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const literal = {
    pages: [
      {
        id: "CS1",
        title: "Chart First",
        blocks: [
          { id: "p1", type: "paragraph", text: "before" },
          { id: "t1", type: "table", rows: [[{ text: "1" }, { text: "2" }], [{ text: "3" }, { text: "4" }]] },
          { id: "g1", type: "chart", text: 'scatter(A1:A2, B1:B2)\ntitle("T")' },
          { id: "p2", type: "paragraph", text: "after" },
        ],
      },
      { id: "CS2", title: "Chart Second", blocks: [{ id: "q1", type: "paragraph", text: "second page" }] },
    ],
    fonts: [],
    attachments: [],
  };
  const path = join(OUT, "chart-select.html");
  const openLiteral = async () => {
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart First", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const pane = () => fresh.evaluate(() => {
    const el = document.querySelector("#chart-pane");
    const active = document.activeElement;
    const range = getSelection().rangeCount ? getSelection().getRangeAt(0) : null;
    return {
      open: !el.hidden && getComputedStyle(el).display !== "none",
      series: el.querySelectorAll(".chart-pane-series").length,
      title: document.querySelector("#chart-pane-title").value,
      activeIsCanvas: Boolean(active?.classList?.contains("chart-canvas")),
      activeInCode: Boolean(active?.closest?.(".block.type-chart .block-content")),
      caretInCode: Boolean(range && range.startContainer.parentElement?.closest?.(".block.type-chart .block-content")),
      selected: [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id),
      overlayOpen: Boolean(document.querySelector(".page-tree")?.classList.contains("is-overlay-open")),
      hasChart: Boolean(document.querySelector('#blocks .block[data-id="g1"]')),
    };
  });
  const clickCanvas = async () => {
    const box = await fresh.locator('.block[data-id="g1"] .chart-canvas').boundingBox();
    await fresh.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await fresh.waitForTimeout(250);
  };
  const clickParagraph = async (id) => {
    await fresh.locator('.block[data-id="' + id + '"] .block-content').click();
    await fresh.waitForTimeout(200);
  };
  const chartCode = () => fresh.evaluate(() => document.querySelector('.block[data-id="g1"] .block-content')?.textContent ?? "");

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    await openLiteral();

    // 絵をクリック → ペインが開き、系列と設定が見える。ブロックは選ばれ、コード欄にはキャレットもフォーカスも入らない。
    const before = await pane();
    await clickCanvas();
    const clicked = await pane();
    result.chartCanvasClickOpensPane = !before.open && clicked.open && clicked.series === 1 && clicked.title === "T"
      && clicked.selected.length === 1 && clicked.selected[0] === "g1";
    result.chartCanvasClickKeepsCaretOutOfCode = clicked.activeIsCanvas && !clicked.activeInCode && !clicked.caretInCode;

    // ペインの中を操作しても閉じない(入力がコードへ書き戻ることは chartPaneSuite.chartPaneTitleEditsCodeOnly が見る。
    // ここでは書き戻ったコードを証拠に残す)。
    await fresh.locator("#chart-pane-title").click();
    await fresh.keyboard.press("Control+a");
    await fresh.keyboard.type("U");
    await fresh.waitForTimeout(250);
    const editing = await pane();
    result.chartPaneStaysOpenWhileEditingIt = editing.open;
    result.chartPaneEditingCodeEvidence = await chartCode();

    // 本文の別の場所をクリック → 閉じる。
    await clickParagraph("p1");
    result.chartPaneClosesOnOutsideClick = !(await pane()).open;

    // Esc で閉じる → フォーカスは絵に残り、Enter でまた開く(キーボードでも選べる)。
    await clickCanvas();
    const reopened = (await pane()).open;
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const afterEscape = await pane();
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const afterEnter = await pane();
    result.chartPaneClosesOnEscape = reopened && !afterEscape.open;
    const canvasTabIndex = await fresh.evaluate(() => document.querySelector('.block[data-id="g1"] .chart-canvas')?.tabIndex);
    result.chartCanvasEnterOpensPane = canvasTabIndex === 0 && afterEscape.activeIsCanvas && afterEnter.open && afterEnter.activeIsCanvas;
    // フォーカスの移らない場所(余白など)を押しても閉じる(pointerdown の経路。フォーカスの経路とは別)。
    await fresh.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await fresh.waitForTimeout(150);
    result.chartPaneClosesOnNonFocusClick = !(await pane()).open;

    // ここから先はコードを開いた状態で確かめる(コード欄にフォーカスすると開くことは
    // chartPaneSuite.chartPaneShowsWhileEditingChart が見る。同じ focusin → syncChartPaneToTarget の経路)。
    await clickParagraph("p1");
    await fresh.locator('.block[data-id="g1"] .chart-source-toggle').click();
    await fresh.waitForTimeout(150);

    // ハンドルでブロックを選んでも開く。
    await clickParagraph("p1");
    await fresh.locator('.block[data-id="g1"]').hover();
    await fresh.locator('.block[data-id="g1"] .drag-grip').click();
    await fresh.waitForTimeout(250);
    result.chartGripSelectionOpensPane = (await pane()).open;
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);

    // 矩形選択でグラフのブロックだけを選んでも開く(余白からドラッグ)。
    await clickParagraph("p1");
    const chartRow = await fresh.evaluate(() => {
      const rect = document.querySelector('.block[data-id="g1"]').getBoundingClientRect();
      return { left: rect.left, top: rect.top, bottom: rect.bottom };
    });
    await fresh.mouse.move(chartRow.left - 30, chartRow.top + 6);
    await fresh.mouse.down();
    await fresh.mouse.move(chartRow.left - 20, chartRow.top + 12, { steps: 3 });
    await fresh.mouse.move(chartRow.left + 160, chartRow.bottom - 6, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const marquee = await pane();
    result.chartMarqueeSelectionOpensPane = marquee.selected.length === 1 && marquee.selected[0] === "g1" && marquee.open;
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);

    // ページを切り替える → 閉じる。戻っても勝手には開かない。
    await clickCanvas();
    const beforeSwitch = (await pane()).open;
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Chart Second" }).first().click();
    await fresh.waitForTimeout(300);
    const onSecond = await pane();
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Chart First" }).first().click();
    await fresh.waitForTimeout(300);
    const backOnFirst = await pane();
    result.chartPaneClosesOnPageSwitch = beforeSwitch && !onSecond.open && !backOnFirst.open;

    // グラフを削除する → 閉じる。
    await clickCanvas();
    const beforeDelete = (await pane()).open;
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const deleted = await pane();
    result.chartPaneClosesOnDelete = beforeDelete && !deleted.hasChart && !deleted.open;
    // Undo でグラフを戻し、開いてから Redo で(=履歴の操作で)グラフが消える → 閉じる。
    await clickParagraph("p1");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    await clickCanvas();
    const beforeRedo = await pane();
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);
    const redone = await pane();
    result.chartPaneClosesWhenHistoryRemovesChart = beforeRedo.hasChart && beforeRedo.open && !redone.hasChart && !redone.open;

    // 新しく作ったグラフ(/chart でコード欄に入り、ペインが開く)を Undo で取り消す → 閉じる。
    await clickParagraph("p2");
    await insertBlock(fresh);
    await fresh.keyboard.type("/chart");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(400);
    const madeChart = await fresh.evaluate(() => ({
      open: !document.querySelector("#chart-pane").hidden,
      charts: document.querySelectorAll("#blocks .block.type-chart").length,
    }));
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const undoneChart = await fresh.evaluate(() => ({
      open: !document.querySelector("#chart-pane").hidden,
      charts: document.querySelectorAll("#blocks .block.type-chart").length,
    }));
    result.chartPaneClosesWhenUndoRemovesChart = madeChart.open && madeChart.charts === 1
      && undoneChart.charts === 0 && !undoneChart.open;

    // ファイルを開き直す(同じ id のグラフがある) → 閉じる。メニューを押すと「別の場所のクリック」で先に閉じてしまうので、
    // 絵にフォーカスを置いたまま Ctrl+O で開き直す(文書の差し替えそのもので閉じることを確かめる)。
    await openLiteral();
    await clickCanvas();
    const beforeReopen = (await pane()).open;
    const reopenChooser = fresh.waitForEvent("filechooser");
    await fresh.keyboard.press("Control+o");
    await (await reopenChooser).setFiles(path);
    await fresh.waitForTimeout(600);
    result.chartPaneClosesOnReopen = beforeReopen && !(await pane()).open;

    // 狭い画面: 目次のオーバーレイを開くとペインが閉じ、グラフを選ぶと目次が閉じる(同時に開かない)。
    await fresh.setViewportSize({ width: 800, height: 900 });
    await fresh.waitForTimeout(200);
    await clickCanvas();
    const narrowOpen = await pane();
    await fresh.locator("#page-tree-toggle").click();
    await fresh.waitForTimeout(250);
    const treeOpened = await pane();
    // 目次を開いたまま、キーボードでグラフの絵を選ぶ(ポインタで目次の外を押して閉じる経路を使わない)。
    await fresh.evaluate(() => document.querySelector('.block[data-id="g1"] .chart-canvas')?.focus());
    await fresh.waitForTimeout(250);
    const chartPicked = await pane();
    result.chartPaneAndPageTreeNeverBothOpenOnNarrow = narrowOpen.open && !narrowOpen.overlayOpen
      && treeOpened.overlayOpen && !treeOpened.open
      && chartPicked.open && !chartPicked.overlayOpen;
    // 目次の開閉がフォーカスもポインタも伴わずに起きても(ボタンの click() だけ)、ペインは閉じる(開閉の規則そのもの)。
    await fresh.evaluate(() => document.querySelector("#page-tree-toggle").click());
    await fresh.waitForTimeout(200);
    const treeByClickOnly = await pane();
    result.pageTreeOverlayClosesChartPaneByItself = chartPicked.open && treeByClickOnly.overlayOpen && !treeByClickOnly.open;
    return result;
  } finally {
    await fresh.close();
  }
}
