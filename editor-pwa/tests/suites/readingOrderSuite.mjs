// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 番号とページの順・絞り込みとグラフ(v253。ユーザー決定) ----
// 1) Issue #105(「推奨で」): 見出しの番号・図表の番号・保存HTMLと印刷のページの並びは、ページ一覧の並び(読む順)。以前は作った順で、
//    子ページを後から足すと番号が飛んだ(ホーム 1 / A 2 / A1 4 / B 3)。保存する manifest の pages の並びは作った順のまま。
// 2) Issue #109(「描く。隠しているだけなのに結果に影響するのは不適切。削除と非表示はまったく別のもの」): 絞り込みで隠した行も
//    グラフに描く(Excel の既定とは違う。今の動きのまま決めた)。式の計算にも入る。
export default async function readingOrderSuite({ browser }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  let opened = 0;
  const openDoc = async (literal) => {
    const path = join(OUT, "reading-order-" + (opened += 1) + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const cells = (...values) => values.map((text) => ({ text, colSpan: 1, rowSpan: 1 }));
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) #105 作った順: ホーム → A → B → A1(A1 は B より後に A の中で作った)。ページ一覧の並び: ホーム → A → A1 → B。
    await openDoc({ fonts: [], attachments: [], settings: { headingNumbers: true }, pages: [
      { id: "H", title: "ホーム", blocks: [{ id: "h1", type: "heading1", text: "ホームの見出し" }, { id: "hA", type: "page", pageId: "A" }, { id: "hB", type: "page", pageId: "B" }] },
      { id: "A", title: "A", blocks: [{ id: "a1", type: "heading1", text: "Aの見出し" }, { id: "aA1", type: "page", pageId: "A1" }] },
      { id: "B", title: "B", blocks: [{ id: "b1", type: "heading1", text: "Bの見出し" }, { id: "bt", type: "table", caption: "Bの表", rows: [cells("x")] }] },
      { id: "A1", title: "A1", blocks: [{ id: "c1", type: "heading1", text: "A1の見出し" }, { id: "ct", type: "table", caption: "A1の表", rows: [cells("y")] }] },
    ] });
    const numbers = {};
    for (const pageId of ["H", "A", "A1", "B"]) {
      await fresh.evaluate((id) => document.querySelector('#page-tree-body [data-page-id="' + id + '"]').click(), pageId);
      await fresh.waitForTimeout(250);
      numbers[pageId] = await fresh.evaluate(() => ({
        heading: document.querySelector("#blocks .type-heading1 .block-content")?.dataset.headingNumber,
        caption: document.querySelector("#blocks .block-caption, #blocks .table-caption")?.textContent || "",
      }));
    }
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "reading-order-saved.html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    const sectionOrder = [...html.matchAll(/<section class="doc-page" id="[^"]*" data-page-id="([^"]+)"/g)].map((match) => match[1]);
    const manifestOrder = (await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html)).pages.map((page) => page.id);
    result.headingNumbersFollowPageTree = numbers.H.heading === "1" && numbers.A.heading === "2" && numbers.A1.heading === "3" && numbers.B.heading === "4";
    result.figureNumbersFollowPageTree = numbers.A1.caption.includes("表1") && numbers.B.caption.includes("表2");
    result.savedPagesFollowPageTree = sectionOrder.join(",") === "H,A,A1,B" && manifestOrder.join(",") === "H,A,B,A1";
    result.readingOrderEvidence = JSON.stringify({ numbers, sectionOrder, manifestOrder });

    // 2) #109 絞り込みで隠した行もグラフに描く・計算に入れる
    await openDoc({ fonts: [], attachments: [], pages: [{ id: "C", title: "絞り込みとグラフ", blocks: [
      { id: "t", type: "table", tableHeader: true, tableFilter: [{ column: 1, hide: ["欠席"] }],
        rows: [cells("名前", "区分", "点"), cells("A", "出席", "70"), cells("B", "欠席", "5"), cells("C", "出席", "90"), cells("計", "", "=SUM(C2:C4)")] },
      { id: "c", type: "chart", text: 'table(id="t")\nbar(A2:A4, C2:C4)' },
    ] }] });
    await fresh.waitForTimeout(500);
    const filtered = await fresh.evaluate(() => ({
      hiddenRows: [...document.querySelectorAll('#blocks .block[data-id="t"] tr')].filter((row) => row.hidden).length,
      labels: [...document.querySelectorAll('#blocks .block[data-id="c"] svg text')].map((node) => node.textContent),
      total: document.querySelector('#blocks .block[data-id="t"] [data-row="4"][data-cell="2"]')?.textContent,
    }));
    result.filteredRowsStillInChartAndFormulas = filtered.hiddenRows === 1 && filtered.labels.includes("B") && filtered.total === "165";
    result.filteredChartEvidence = JSON.stringify(filtered);

    result.readingOrderNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.readingOrderPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
