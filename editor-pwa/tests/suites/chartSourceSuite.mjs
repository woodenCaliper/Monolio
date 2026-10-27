// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, insertBlock, openMenu } from "../lib.mjs";

// ---- グラフのコードを既定で畳む(v161。グラフ編集GUI 段4) ----
// 出典はユーザー原文「コードはあくまで上級者や AI 向けとし、普通の人には GUI で操作させたい」。細部はユーザー委任下の
// PdM 判断(開閉は保存しない UI 状態・既定は畳む・畳んでもエラーや GUI で編集できない行が分かる)。
export default async function chartSourceSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    pages: [{
      id: "CS1",
      title: "Chart Source",
      blocks: [
        { id: "t1", type: "table", rows: [cells("1", "10"), cells("2", "20"), cells("3", "30")] },
        { id: "p1", type: "paragraph", text: "above" },
        { id: "g1", type: "chart", text: 'scatter(A1:A3, B1:B3)\ntitle("T")' },
        { id: "g2", type: "chart", text: 'scatter(A1:A3, Z1:Z3)\ngrid(false)\nannotate("memo")' },
        { id: "p2", type: "paragraph", text: "after" },
      ],
    }],
    fonts: [],
    attachments: [],
  };
  const view = (id) => fresh.evaluate((blockId) => {
    const row = document.querySelector('.block[data-id="' + blockId + '"]');
    const content = row.querySelector(".block-content");
    const rect = content.getBoundingClientRect();
    const bar = row.querySelector(".chart-source-bar");
    return {
      open: row.classList.contains("source-open"),
      codeVisible: getComputedStyle(content).opacity !== "0" && rect.height > 20 && getComputedStyle(content).position !== "absolute",
      toggle: bar?.querySelector(".chart-source-toggle")?.textContent ?? null,
      expanded: bar?.querySelector(".chart-source-toggle")?.getAttribute("aria-expanded") ?? null,
      status: bar?.querySelector(".chart-source-status")?.textContent ?? "",
      barWarns: Boolean(bar?.classList.contains("has-error") || bar?.classList.contains("has-foreign")),
      code: content.textContent,
    };
  }, id);
  const openPane = async (id) => {
    const box = await fresh.locator('.block[data-id="' + id + '"] .chart-canvas').boundingBox();
    await fresh.mouse.click(box.x + box.width / 2, box.y + 30);
    await fresh.waitForTimeout(300);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "chart-source.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Source", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // 既定で畳まれていて、畳んでいることが分かる(「コードを表示」と行数)。
    const initial = await view("g1");
    result.chartCodeCollapsedByDefault = !initial.open && !initial.codeVisible && initial.toggle === "コードを表示"
      && initial.expanded === "false" && initial.status.includes("2 行") && !initial.barWarns;

    // 表示 → 隠す で開閉する(開いたコードにフォーカスするとペインが開くことは chartPaneSuite.chartPaneShowsWhileEditingChart が見る)。
    await fresh.locator('.block[data-id="g1"] .chart-source-toggle').click();
    await fresh.waitForTimeout(150);
    const shown = await view("g1");
    await fresh.locator('.block[data-id="g1"] .chart-source-toggle').click();
    await fresh.waitForTimeout(150);
    const hidden = await view("g1");
    // フォーカスがコードの中にあるまま畳まれても(ボタンの click() だけで閉じても)、見えないコードの中に残らない。
    await fresh.locator('.block[data-id="g1"] .chart-source-toggle').click();
    await fresh.evaluate(() => {
      document.querySelector('.block[data-id="g1"] .block-content').focus();
      document.querySelector('.block[data-id="g1"] .chart-source-toggle').click();
    });
    await fresh.waitForTimeout(150);
    const focusAfterHide = await fresh.evaluate(() => document.activeElement?.className ?? "");
    result.chartCodeShowHideToggles = shown.open && shown.codeVisible && shown.toggle === "コードを隠す" && shown.expanded === "true"
      && !hidden.open && !hidden.codeVisible && hidden.toggle === "コードを表示"
      && focusAfterHide.includes("chart-source-toggle");

    // 畳んだまま GUI で編集するとコードが変わり、Undo が効く。
    await openPane("g1");
    await fresh.evaluate(() => {
      const input = document.querySelector("#chart-pane-title");
      input.focus();
      input.select();
    });
    await fresh.keyboard.type("U");
    await fresh.waitForTimeout(250);
    const edited = await view("g1");
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await view("g1");
    result.chartCollapsedCodeEditsThroughGuiAndUndoes = !edited.open && edited.code.includes('title("U")')
      && !undone.code.includes('title("U")') && undone.code.includes('title("T")') && !undone.open;

    // エラーのあるコード・GUI では編集できない行があるときは、畳んでいてもそれが分かる。
    const warned = await view("g2");
    result.chartCollapsedCodeShowsErrorsAndForeignLines = !warned.open && warned.barWarns
      && warned.status.includes("エラー") && warned.status.includes("GUI では編集できない行 1");

    // キーボードでコードへ入ったら(フォーカスが入ったら)開く(見えない所で打たせない)。
    await fresh.evaluate(() => document.querySelector('.block[data-id="g2"] .block-content').focus());
    await fresh.waitForTimeout(200);
    result.chartCodeOpensWhenFocusedByKeyboard = (await view("g2")).open && (await view("g2")).codeVisible;

    // 開閉は文書に保存しない(UI 状態)。保存HTMLのコードは既定で閉じた <details>(エディタと同じく畳む。P7)。
    const download = fresh.waitForEvent("download");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "chart-source-saved.html");
    await (await download).saveAs(savedPath);
    const raw = await readFile(savedPath, "utf8");
    const parsed = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), raw);
    const savedBlocks = parsed.pages.flatMap((page) => page.blocks);
    result.chartSourceStateIsNotSavedAndExportCollapses = raw.includes('<details class="doc-chart-source"><summary>コード</summary><pre>')
      && !raw.includes('<details class="doc-chart-source" open')
      && savedBlocks.every((block) => !("sourceOpen" in block) && !("codeOpen" in block));
    // 保存HTMLで <details> を開くと、コードに枠・背景・余白が付き、長い行は横スクロールになる(CSS が <details> の中の
    // <pre> を指している。v161 ではクラスが <details> へ移ったのに CSS が pre.doc-chart-source のままで効いていなかった)。
    const viewer = await context.newPage();
    await viewer.setContent(raw, { waitUntil: "load" });
    const exported = await viewer.evaluate(() => {
      const details = document.querySelector("details.doc-chart-source");
      if (!details) return null;
      details.open = true;
      const pre = getComputedStyle(details.querySelector("pre"));
      const summary = getComputedStyle(details.querySelector("summary"));
      return { border: pre.borderTopWidth, overflowX: pre.overflowX, background: pre.backgroundColor, summarySize: summary.fontSize };
    });
    await viewer.close();
    result.exportedChartSourceKeepsCodeStyle = Boolean(exported) && exported.border === "1px" && exported.overflowX === "auto"
      && exported.background !== "rgba(0, 0, 0, 0)" && exported.summarySize === "12px";

    // 開いて Undo しても開閉は戻らない(開閉は Undo の履歴に入らない UI 状態)。
    if (!(await view("g1")).open) await fresh.locator('.block[data-id="g1"] .chart-source-toggle').click();
    await openPane("g1");
    await fresh.evaluate(() => {
      const input = document.querySelector("#chart-pane-title");
      input.focus();
      input.select();
    });
    await fresh.keyboard.type("W");
    await fresh.waitForTimeout(250);
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const afterUndoOpen = await view("g1");
    result.chartSourceOpenStateIsNotUndone = afterUndoOpen.open && !afterUndoOpen.code.includes('title("W")');

    // 複製(コピー→貼り付け)したグラフは畳んだ状態で始まる。
    await openPane("g1");
    await fresh.keyboard.press("Control+c");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(400);
    const pastedChart = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.type-chart")]
      .map((row) => ({ id: row.dataset.id, open: row.classList.contains("source-open") }))
      .find((row) => !["g1", "g2"].includes(row.id)) ?? null);
    result.chartPastedCopyStartsCollapsed = Boolean(pastedChart) && !pastedChart.open;

    // 矢印キーで畳んだグラフへ入ると、コードではなくグラフを選ぶ(絵へ)。打っても隠れたコードに文字が入らない。
    // 絵の上の矢印キーで次のブロックへ移れる。
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.evaluate(() => {
      for (const id of ["g1", "g2"]) document.querySelector('.block[data-id="' + id + '"] .chart-source-toggle')
        && document.querySelector('.block[data-id="' + id + '"]').classList.contains("source-open")
        && document.querySelector('.block[data-id="' + id + '"] .chart-source-toggle').click();
    });
    await fresh.waitForTimeout(200);
    const codeBeforeArrow = await view("g1");
    await fresh.locator('.block[data-id="p1"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(250);
    const onChart = await fresh.evaluate(() => ({
      canvas: Boolean(document.activeElement?.classList?.contains("chart-canvas")),
      block: document.activeElement?.closest?.(".block")?.dataset.id ?? null,
      pane: !document.querySelector("#chart-pane").hidden,
    }));
    await fresh.keyboard.type("zz");
    await fresh.waitForTimeout(200);
    const codeAfterTyping = await view("g1");
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(250);
    const nextBlock = await fresh.evaluate(() => document.activeElement?.closest?.(".block")?.dataset.id ?? null);
    // 次のブロックへは、ブロックの選択(ハンドル)ではなく、そのブロックの中へ入る(次も畳んだグラフなら絵へ)。
    const nextIsEntered = await fresh.evaluate(() => Boolean(document.activeElement?.matches?.(".chart-canvas, .block-content")));
    result.chartArrowKeysSelectCollapsedChartWithoutTyping = onChart.canvas && onChart.block === "g1" && onChart.pane
      && !codeAfterTyping.open && codeAfterTyping.code === codeBeforeArrow.code && nextBlock !== "g1" && nextBlock !== null && nextIsEntered;

    // 畳んだコードの中の語を検索すると、そのグラフのコードが開いて一致が見える。
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.type("annotate");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const searched = await view("g2");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    result.chartSearchInCollapsedCodeOpensIt = searched.open && searched.codeVisible;

    // 新しく入れたグラフ(/chart)は畳んだまま始まり、ペインの最初の欄にフォーカスが入る。
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await insertBlock(fresh, "chart");
    await fresh.waitForTimeout(400);
    const created = await fresh.evaluate(() => {
      const rows = [...document.querySelectorAll("#blocks .block.type-chart")];
      const row = rows.find((item) => !["g1", "g2"].includes(item.dataset.id) && item.previousElementSibling?.dataset.id === "p2")
        ?? rows.at(-1);
      return {
        open: row?.classList.contains("source-open"),
        pane: !document.querySelector("#chart-pane").hidden,
        focusInPaneX: document.activeElement?.matches?.('#chart-pane .chart-pane-series input[data-field="x"]') ?? false,
      };
    });
    result.newChartStartsCollapsedWithFocusInPane = created.open === false && created.pane && created.focusInPaneX;

    // 開き直すと畳んだ状態に戻る(開閉は保存しない)。
    await fresh.locator('.block[data-id="g1"] .chart-source-toggle').click();
    await fresh.waitForTimeout(150);
    const reopen = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await reopen).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Chart Source", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    result.chartSourceCollapsesAfterReopen = !(await view("g1")).open;
    return result;
  } finally {
    await fresh.close();
  }
}
