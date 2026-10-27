// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 画面に無いグラフの保存用 SVG(chartSvg)を、保存・印刷の前に描き直す ----
// chartSvg は画面で塗ったときにしか変わらなかったので、閉じたトグルの中のグラフや、開いていないページのグラフは、
// 読んでいる表を書き換えても(すべて置換など)古い絵のまま保存・印刷されていた。保存・印刷の前に、全ページの
// グラフをいまの表の値で描き直す(settleChartSvgs)。ロック中のページのグラフも描き直すが、それで「ロックされて
// います」と出たり Undo が断られたりしない(chartSvg はロックの比べ合わせに入れない)。
export default async function chartStaleSvgSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  // 印刷の枠の中身(グラフの目盛り)を記録する(window.print は記録に置き換える。見えない枠は後から作られる)。
  await fresh.addInitScript(() => {
    window.print = () => {
      const host = window.top;
      host.__chartPrintTicks = host.__chartPrintTicks || [];
      host.__chartPrintTicks.push([...document.querySelectorAll(".doc-chart-canvas svg text")].map((node) => node.textContent));
    };
  });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text, colSpan: 1, rowSpan: 1 }));
  const svgTexts = (svg) => [...String(svg || "").matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
  let fileIndex = 0;

  const openLiteral = async (literal) => {
    const source = join(OUT, "chart-stale-svg-" + (fileIndex += 1) + ".html");
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  // 保存して、保存HTMLから文書を読み直す。saveAs なら「名前を付けて保存」のメニューから。
  const save = async (saveAs = false) => {
    await fresh.evaluate(() => document.activeElement?.blur?.());
    const download = fresh.waitForEvent("download");
    if (saveAs) {
      await openMenu(fresh, "file");
      await fresh.locator("#menu-save-as").click();
    } else {
      await fresh.keyboard.press("Control+s");
    }
    const path = join(DOWNLOADS, "chart-stale-svg-saved-" + (fileIndex += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html);
  };
  const chartOf = (model, pageTitle) => (model.pages.find((page) => page.title === pageTitle) || model.pages[0]).blocks.find((block) => block.type === "chart");
  const setCell = async (blockId, row, cell, value) => {
    await fresh.evaluate(([selector, text]) => {
      const node = document.querySelector(selector);
      node.focus();
      node.textContent = text;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.blur();
    }, [`#blocks .block[data-id="${blockId}"] .editor-table [data-row="${row}"][data-cell="${cell}"]`, value]);
    await fresh.waitForTimeout(150);
  };
  const screenSvg = (blockId) => fresh.evaluate((id) => document.querySelector(`#blocks .block[data-id="${id}"] .chart-canvas svg`)?.outerHTML ?? null, blockId);

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 閉じたトグルの中のグラフ: 表を書き換えて保存すると、保存したグラフも新しい値(画面で描くのと同じ SVG)
    await openLiteral({ title: "トグルのグラフ", fonts: [], attachments: [], pages: [
      { id: "CS1", title: "トグルのグラフ", blocks: [
        { id: "ct", type: "table", text: "", tableHeader: true, rows: [cells("name", "val"), cells("a", "10"), cells("b", "20")] },
        { id: "cg", type: "toggle", text: "グラフ", open: true },
        { id: "cc", type: "chart", text: 'bar(A2:A3, B2:B3)\ntitle("T")', indent: 1 },
      ] },
    ] });
    const drawnBefore = svgTexts(await screenSvg("cc"));
    await fresh.locator('#blocks .block[data-id="cg"] .toggle-caret').click();
    await fresh.waitForTimeout(300);
    const chartHidden = await fresh.evaluate(() => !document.querySelector('#blocks .block[data-id="cc"]'));
    await setCell("ct", 1, 1, "9000");
    const savedToggle = await save();
    const savedTicks = svgTexts(chartOf(savedToggle).chartSvg);
    result.chartStaleSvgToggleSetup = drawnBefore.includes("25") && chartHidden
      && savedToggle.pages[0].blocks.find((block) => block.type === "table").rows[1][1].text === "9000";
    result.chartStaleSvgClosedToggleSavedFresh = savedTicks.includes("8000") && !savedTicks.includes("25");
    result.chartStaleSvgToggleEvidence = savedTicks.join("|");

    // 2) 印刷も同じ(閉じたトグルのまま、表をもう一度書き換えて刷る)
    await setCell("ct", 2, 1, "50000");
    await fresh.locator("#blocks .block-content").first().click().catch(() => {});
    await fresh.keyboard.press("Control+p");
    await fresh.waitForFunction(() => (window.__chartPrintTicks || []).length >= 1, null, { timeout: 5000 }).catch(() => {});
    const printedTicks = (await fresh.evaluate(() => window.__chartPrintTicks || []))[0] || [];
    result.chartStaleSvgPrintFresh = printedTicks.includes("5.0e+4") && !printedTicks.includes("8000");
    result.chartStaleSvgPrintEvidence = printedTicks.join("|");

    // 3) トグルを開くと、画面の絵は保存したものと同じ文字列(描き方は画面と1つ)
    await fresh.waitForTimeout(300);
    const savedAgain = await save();
    await fresh.locator('#blocks .block[data-id="cg"] .toggle-caret').click();
    await fresh.waitForTimeout(300);
    result.chartStaleSvgSavedMatchesScreen = chartOf(savedAgain).chartSvg === (await screenSvg("cc"));

    // 4) 開いていないページのグラフ: 先頭のページから全ページの「すべて置換」で表が変わっても、保存(名前を付けて保存)したグラフは新しい値
    await openLiteral({ title: "Root", fonts: [], attachments: [], pages: [
      { id: "CR", title: "Root", blocks: [{ id: "r1", type: "paragraph", text: "root" }, { id: "r2", type: "page", text: "", pageId: "CSUB" }] },
      { id: "CSUB", title: "Sub", blocks: [
        { id: "st", type: "table", text: "", tableHeader: true, rows: [cells("name", "val"), cells("a", "777"), cells("b", "20")] },
        { id: "sc", type: "chart", text: 'bar(A2:A3, B2:B3)\ntitle("T")' },
      ] },
    ] });
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Sub" }).first().click();
    await fresh.waitForTimeout(400);
    const subDrawn = svgTexts(await screenSvg("sc"));
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Root" }).first().click();
    await fresh.waitForTimeout(400);
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+f");
    await fresh.locator("#search-input").fill("777");
    await fresh.waitForTimeout(200);
    await fresh.selectOption("#search-scope", "all");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-replace-input").fill("5");
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(400);
    await fresh.keyboard.press("Escape");
    const savedPages = await save(true);
    const subTicks = svgTexts(chartOf(savedPages, "Sub").chartSvg);
    const subTable = savedPages.pages.find((page) => page.title === "Sub").blocks.find((block) => block.type === "table");
    result.chartStaleSvgOtherPageSetup = subDrawn.includes("800") && subTable.rows[1][1].text === "5";
    result.chartStaleSvgOtherPageSavedFresh = subTicks.includes("25") && !subTicks.includes("800");
    result.chartStaleSvgOtherPageEvidence = subTicks.join("|");

    // 5) ロック中のページ(開いていない)のグラフも描き直す。それで「ロックされています」と出ない・Undo も断られない
    const OLD = '<svg class="chart-svg" viewBox="0 0 560 320" role="img" aria-label="Chart"><text x="10" y="20" class="chart-title">OLDPIC</text></svg>';
    await openLiteral({ title: "Root2", fonts: [], attachments: [], pages: [
      { id: "LR", title: "Root2", blocks: [{ id: "l1", type: "paragraph", text: "root" }, { id: "l2", type: "page", text: "", pageId: "LSUB" }] },
      { id: "LSUB", title: "Locked", locked: true, blocks: [
        { id: "lt", type: "table", text: "", tableHeader: true, rows: [cells("name", "val"), cells("a", "10"), cells("b", "20")] },
        { id: "lc", type: "chart", text: 'bar(A2:A3, B2:B3)\ntitle("T")', chartSvg: OLD },
      ] },
    ] });
    const savedLocked = await save();
    const lockedTicks = svgTexts(chartOf(savedLocked, "Locked").chartSvg);
    result.chartStaleSvgLockedPageRedrawn = !lockedTicks.includes("OLDPIC") && lockedTicks.includes("25");
    await fresh.locator('#blocks .block[data-id="l1"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("x");
    await fresh.waitForTimeout(300);
    const statusAfterEdit = await fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const rootText = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="l1"] .block-content')?.textContent);
    result.chartStaleSvgLockedPageNoFalseLockNotice = !statusAfterEdit.includes("ロック") && rootText === "root";
    result.chartStaleSvgLockedEvidence = { statusAfterEdit, rootText };
  } finally {
    await fresh.close();
  }
  return result;
}
