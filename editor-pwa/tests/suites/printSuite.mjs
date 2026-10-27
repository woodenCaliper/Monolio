// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 印刷・PDF(v182) ----
// File の「Print / PDF」と Ctrl+P は、エディタの画面ではなく保存HTMLと同じ形(全ページ・改ページ)を見えない枠で刷る。
// 保存HTMLの @media print: 色と点は「背景も印刷」によらず出す・閉じたトグルも開く・グラフのコードは刷らない・
// 表の見出しの行は次のページにも出る(<thead>)。PDF はブラウザの印刷の「PDF に保存」なので、ここでは印刷の呼び出しと
// 刷られる文書の形を確かめる(印刷の画面そのものはテストで開けない)。
export default async function printSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  // どの枠でも window.print を記録に置き換える(見えない枠は後から作られるので、初期化スクリプトで全部の枠に入れる)。
  await fresh.addInitScript(() => {
    window.print = () => {
      const host = window.top;
      host.__printCalls = host.__printCalls || [];
      host.__printCalls.push({
        inFrame: window !== window.top,
        isPortable: Boolean(document.querySelector("#document-manifest")),
        hasEditorChrome: Boolean(document.querySelector("#menubar")),
        pageTitles: [...document.querySelectorAll("h1")].map((node) => node.textContent),
        togglesOpen: [...document.querySelectorAll("details.toggle")].map((node) => node.open),
        hostTitle: host.document.title,
      });
    };
  });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    title: "印刷の見本",
    fonts: [],
    attachments: [],
    pages: [
      { id: "PR1", title: "印刷の見本", blocks: [
        { id: "pb", type: "bullet", text: "点のある項目" },
        { id: "pt", type: "toggle", text: "閉じたトグル", open: false },
        { id: "pc", type: "paragraph", text: "トグルの中身", indent: 1 },
        { id: "ph", type: "table", tableHeader: true, rows: [cells("見出しA", "見出しB"), cells("1", "2"), cells("3", "4")] },
        { id: "pn", type: "table", rows: [cells("x", "y"), cells("5", "6")] },
        { id: "pd", type: "paragraph", text: "グラフの説明(図と同じ紙に残す)" },
        { id: "pg", type: "chart", text: "plot(A2:A3, B2:B3)" },
      ] },
      { id: "PR2", title: "二枚目", blocks: [{ id: "q1", type: "paragraph", text: "二枚目の本文" }] },
    ],
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const source = join(OUT, "print-literal.html");
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "印刷の見本", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    const calls = () => fresh.evaluate(() => window.__printCalls || []);

    // Ctrl+P: 見えない枠の保存HTMLを刷る(エディタの画面は刷らない)
    await fresh.locator("#blocks .block-content", { hasText: "点のある項目" }).click();
    await fresh.evaluate(() => { document.title = "TAB-TITLE"; });
    await fresh.keyboard.press("Control+p");
    await fresh.waitForFunction(() => (window.__printCalls || []).length >= 1, null, { timeout: 5000 }).catch(() => {});
    const [first] = await calls();
    result.ctrlPPrintsPortableDocument = Boolean(first && first.inFrame && first.isPortable && !first.hasEditorChrome);
    result.printIncludesAllPages = Boolean(first && first.pageTitles.includes("印刷の見本") && first.pageTitles.includes("二枚目"));
    result.printOpensClosedToggles = Boolean(first && first.togglesOpen.length === 1 && first.togglesOpen[0] === true);
    result.printUsesDocumentTitle = first?.hostTitle === "印刷の見本";
    result.printEvidence = first || null;
    await fresh.waitForTimeout(200);
    result.printFrameRemovedAfter = await fresh.evaluate(() => !document.querySelector(".print-frame"));
    // 刷る間だけ文書の題名にし(PDF の既定のファイル名)、終わったらタブの題名を戻す
    result.printRestoresTabTitle = (await fresh.evaluate(() => document.title)) === "TAB-TITLE";

    // File メニューからも刷れる
    await openMenu(fresh, "file");
    await fresh.locator("#menu-print").click();
    await fresh.waitForFunction(() => (window.__printCalls || []).length >= 2, null, { timeout: 5000 }).catch(() => {});
    result.menuPrintWorks = (await calls()).length === 2 && (await calls())[1].isPortable;

    // ブラウザのメニューから直接刷られたときも、エディタの道具・目次は刷らない
    await fresh.emulateMedia({ media: "print" });
    result.editorPrintHidesChrome = await fresh.evaluate(() => ["header.toolbar", "#page-tree", "#version-badge"]
      .every((selector) => !document.querySelector(selector)?.checkVisibility()));
    await fresh.emulateMedia({ media: "screen" });

    // 保存HTMLの印刷の形(スクリプトの有無によらない CSS の部分)
    const view = await context.newPage();
    await view.goto("file://" + source);
    await view.waitForTimeout(300);
    const screenState = await view.evaluate(() => ({
      toggleChildShown: document.querySelector("details.toggle p")?.checkVisibility(),
      chartSourceShown: document.querySelector(".doc-chart-source")?.checkVisibility(),
    }));
    await view.emulateMedia({ media: "print" });
    const printState = await view.evaluate(() => {
      const li = document.querySelector("ul > li");
      const tables = [...document.querySelectorAll("table.doc-table")];
      const headerTable = tables.find((table) => table.classList.contains("doc-table-header"));
      const plainTable = tables.find((table) => !table.classList.contains("doc-table-header"));
      const bodyFirstCell = headerTable?.querySelector("tbody td");
      return {
        bulletColorExact: getComputedStyle(li, "::before").printColorAdjust,
        toggleChildShown: document.querySelector("details.toggle p")?.checkVisibility(),
        chartSourceShown: document.querySelector(".doc-chart-source")?.checkVisibility(),
        headerInThead: headerTable?.querySelector("thead")?.textContent,
        theadDisplay: headerTable?.querySelector("thead") ? getComputedStyle(headerTable.querySelector("thead")).display : null,
        plainHasThead: Boolean(plainTable?.querySelector("thead")),
        headerBold: headerTable?.querySelector("thead td") ? getComputedStyle(headerTable.querySelector("thead td")).fontWeight : null,
        bodyBold: bodyFirstCell ? getComputedStyle(bodyFirstCell).fontWeight : null,
        pagesShown: [...document.querySelectorAll("section.doc-page")].filter((node) => node.checkVisibility()).length,
        // v197: 図・数式・表の直前の段落(図の説明)は、図と同じ紙に残す(段落のあとで改ページしない)
        paragraphBeforeChartBreak: (() => {
          const chart = document.querySelector(".doc-chart");
          const before = chart?.previousElementSibling;
          return before?.tagName === "P" ? getComputedStyle(before).breakAfter : "no-paragraph";
        })(),
        // トグルの中身は、エディタと同じくトグルの文字の頭にそろう(字下げ)
        toggleChildOffset: Math.round(document.querySelector("details.toggle > p").getBoundingClientRect().left
          - document.querySelector("details.toggle > summary > *").getBoundingClientRect().left),
      };
    });
    await view.close();
    result.printKeepsBulletDots = printState.bulletColorExact === "exact";
    result.printOpensToggleByCss = screenState.toggleChildShown === false && printState.toggleChildShown === true;
    result.printHidesChartSource = screenState.chartSourceShown === true && printState.chartSourceShown === false;
    result.printRepeatsTableHeader = printState.headerInThead === "見出しA見出しB" && printState.theadDisplay === "table-header-group"
      && !printState.plainHasThead;
    // 見出しの意匠は見出しの行だけ(<tbody> の先頭の行は太字にしない)
    result.tableHeaderStyleOnlyOnHeaderRow = Number(printState.headerBold) >= 700 && printState.bodyBold !== null && Number(printState.bodyBold) < 700;
    result.printShowsEveryPage = printState.pagesShown === 2;
    // v182: 保存HTMLではトグルの中身が字下げされず、左端に出ていた(エディタでは字下げされる。P7)
    result.toggleChildIndentedLikeEditor = Math.abs(printState.toggleChildOffset) <= 1;
    result.printKeepsFigureIntroWithFigure = printState.paragraphBeforeChartBreak === "avoid";
    result.printStateEvidence = { screenState, printState };
  } finally {
    await fresh.close();
  }
  return result;
}
