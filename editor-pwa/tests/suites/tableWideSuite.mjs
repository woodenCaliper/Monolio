// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 広い表の横スクロール(v231) ----
// 列幅を広げて本文の欄より広くなった表は、右が切れて見えず、横にスクロールもできなかった(v201 の題名の帯で本文の欄を
// overflow-x: clip にしたため)。ユーザー選択「1」: 表の中で横にスクロールする。取っ手・番号は見えている範囲だけ。描き直しても
// 位置は戻らない。列のドラッグは左右の端で横に自動スクロール。保存HTMLも同じ(印刷は紙の幅に縮めて全部刷る)。
export default async function tableWideSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const c = (text) => ({ text, colSpan: 1, rowSpan: 1 });
  const wideRows = [Array.from({ length: 10 }, (_, i) => c("列" + i)), Array.from({ length: 10 }, (_, i) => c(String(i))), Array.from({ length: 10 }, (_, i) => c(String(i * 10)))];
  const literal = { pages: [{ id: "W", title: "広い表", blocks: [
    { id: "p1", type: "paragraph", text: "前の段落" },
    { id: "t", type: "table", tableHeader: true, rows: wideRows, tableColumnWidths: Array(10).fill(200) },
    { id: "n", type: "table", rows: [[c("ふつう"), c("の表")]] },
    { id: "sub", type: "page", pageId: "W2" },
  ] }, { id: "W2", title: "別のページ", blocks: [{ id: "q1", type: "paragraph", text: "別のページの本文" }] }], fonts: [], attachments: [] };
  const open = async () => {
    const path = join(OUT, "table-wide.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "広い表", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const cell = (r, k) => fresh.locator('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
  const box = () => fresh.evaluate(() => {
    const content = document.querySelector('#blocks .block[data-id="t"] > .block-content');
    const view = content.getBoundingClientRect();
    const labels = [...document.querySelectorAll('#blocks .block[data-id="t"] .table-axis-label.column')];
    return {
      scrollLeft: Math.round(content.scrollLeft),
      scrollable: content.scrollWidth > content.clientWidth + 100,
      labels: labels.map((node) => node.textContent).join(""),
      labelsInView: labels.every((node) => { const r = node.getBoundingClientRect(); return r.left >= view.left - 2 && r.right <= view.right + 2; }),
      pageNotWider: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  try {
    for (const width of [1100, 800]) {
      await fresh.setViewportSize({ width, height: 760 });
      await fresh.goto(`http://127.0.0.1:${PORT}/`);
      await fresh.waitForSelector("#blocks .block-content");
      await open();
      // 1) 広い表は入れ物の中で横にスクロールでき、ページ自体は横に広がらない。右端の列も見える所へ動かせる。
      await cell(1, 0).click();
      await fresh.waitForTimeout(150);
      const start = await box();
      for (let i = 0; i < 9; i += 1) await fresh.keyboard.press("Tab");
      await fresh.waitForTimeout(300);
      const end = await box();
      const lastVisible = await fresh.evaluate(() => {
        const content = document.querySelector('#blocks .block[data-id="t"] > .block-content').getBoundingClientRect();
        const last = document.querySelector('#blocks .block[data-id="t"] [data-row="1"][data-cell="9"]').getBoundingClientRect();
        return last.right <= content.right + 2 && last.left >= content.left - 2;
      });
      result["tableWideScrolls" + width] = start.scrollable && start.pageNotWider && end.scrollLeft > 300 && lastVisible;
      // 2) 番号は見えている列だけ(スクロールしても入れ物の外に出ない)。
      result["tableWideLabelsStayInView" + width] = start.labelsInView && end.labelsInView && start.labels.startsWith("A") && end.labels.endsWith("J") && !end.labels.includes("A");
      // 3) 描き直し(列を右に挿入)しても、横の位置は先頭へ戻らない。Undo でも。
      await fresh.locator('#table-toolbar [data-tool="col-after"]').click();
      await fresh.waitForTimeout(300);
      const afterInsert = await box();
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(300);
      const afterUndo = await box();
      result["tableWideKeepsScrollOnRender" + width] = afterInsert.scrollLeft > 300 && afterUndo.scrollLeft > 300;
      // 3b) 表の外にいるまま描き直されても(別のページへ移って戻る)、横の位置は戻らない。
      await fresh.evaluate(() => { document.activeElement?.blur?.(); document.querySelector('#blocks .block[data-id="t"] > .block-content').scrollLeft = 700; });
      await fresh.waitForTimeout(200);
      // 狭い画面では目次が隠れているので、目次の項目を直接押す(押したときの動きは同じ)。
      await fresh.evaluate(() => document.querySelector('#page-tree-body .page-tree-item[data-page-id="W2"]').click());
      await fresh.waitForTimeout(300);
      await fresh.evaluate(() => document.querySelector('#page-tree-body .page-tree-item[data-page-id="W"]').click());
      await fresh.waitForTimeout(300);
      const afterPages = await box();
      result["tableWideKeepsScrollAcrossPages" + width] = afterPages.scrollLeft === 700;
      result["tableWideEvidence" + width] = JSON.stringify({ start, end, afterInsert: afterInsert.scrollLeft, afterUndo: afterUndo.scrollLeft, afterPages: afterPages.scrollLeft });
    }

    // 4) 列のドラッグ: 入れ物の右端にとどまると横に自動スクロールし、見えていなかった位置へ置ける。
    await fresh.setViewportSize({ width: 1100, height: 760 });
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await open();
    await cell(1, 0).click();
    await fresh.waitForTimeout(150);
    const handle = await fresh.locator('#blocks .block[data-id="t"] .table-range-handle.column').boundingBox();
    const view = await fresh.evaluate(() => { const r = document.querySelector('#blocks .block[data-id="t"] > .block-content').getBoundingClientRect(); return { right: r.right }; });
    await fresh.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(handle.x + 60, handle.y + 3, { steps: 4 });
    await fresh.mouse.move(view.right - 8, handle.y + 3, { steps: 8 });
    await fresh.waitForTimeout(1300);
    const scrolledLeft = (await box()).scrollLeft;
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    const order = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] [data-row="0"]')].map((node) => node.textContent).join(","));
    result.tableWideColumnDragAutoScrolls = scrolledLeft > 300 && order.indexOf("列0") > order.indexOf("列5");
    result.tableWideDragEvidence = JSON.stringify({ scrolledLeft, order });
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);

    // 5) 保存HTML: 列幅のある表だけ、横にスクロールする箱で包む。印刷では紙の幅に縮めて全部刷る(列の幅の比はそのまま)。
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "table-wide-saved.html");
    await (await download).saveAs(path);
    const saved = await readFile(path, "utf8");
    const view2 = await context.newPage();
    try {
      await view2.setViewportSize({ width: 1100, height: 760 });
      await view2.goto("file:///" + path.replaceAll("\\", "/"));
      await view2.waitForTimeout(400);
      const screen = await view2.evaluate(() => {
        const boxes = document.querySelectorAll(".doc-table-scroll");
        const box = boxes[0];
        return { boxes: boxes.length, scrolls: box ? box.scrollWidth > box.clientWidth + 100 : false, pageNotWider: document.documentElement.scrollWidth <= window.innerWidth };
      });
      await view2.emulateMedia({ media: "print" });
      const print = await view2.evaluate(() => {
        const table = document.querySelector(".doc-table-scroll table");
        const main = document.querySelector("main").getBoundingClientRect();
        const widths = [...table.querySelectorAll("tr:first-child td")].map((td) => Math.round(td.getBoundingClientRect().width));
        return { fits: table.getBoundingClientRect().width <= main.width + 1, even: Math.max(...widths) - Math.min(...widths) <= 2 };
      });
      result.tableWideSavedHtmlScrolls = screen.boxes === 1 && screen.scrolls && screen.pageNotWider && saved.includes('<div class="doc-table-scroll">');
      result.tableWidePrintFitsPage = print.fits && print.even;
      result.tableWideSavedEvidence = JSON.stringify({ screen, print });
    } finally {
      await view2.close();
    }
    result.tableWideNoPageErrors = pageErrors.length === 0;
    result.tableWidePageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
