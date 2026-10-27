// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- ヘッダー行・列と全体参照の除外(Excel の構造化テーブル方式) ----
// 全体参照(A:A / 2:2)だけが宣言済みヘッダーを除外する。明示範囲(A1:B3)は全部
// 含む。ヘッダーは「位置」に付く(先頭へ挿入したら新しい行0/列0がヘッダー)。
export default async function headerRefSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const cellSelector = (r, c) => '#blocks .block.type-table .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
    const setCell = async (r, c, text) => {
      await fresh.evaluate(([selector, value]) => {
        const td = document.querySelector(selector);
        if (!td) return;
        td.focus();
        td.textContent = value;
        td.dispatchEvent(new Event("input", { bubbles: true }));
        td.blur();
      }, [cellSelector(r, c), text]);
      await fresh.waitForTimeout(70);
    };
    const focusCell = async (r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
    };
    const dispCell = (r, c) => fresh.evaluate((selector) => (
      document.querySelector(selector)?.textContent ?? null
    ), cellSelector(r, c));
    const tagOf = (r, c) => fresh.evaluate((selector) => (
      document.querySelector(selector)?.tagName ?? null
    ), cellSelector(r, c));
    const useTool = async (tool, r, c) => {
      await focusCell(r, c);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
    };

    // 4行3列。行1は数値に見えるタイトル(2024/10)、列Aの行2も数値タイトル(7)。
    // 文字列タイトルは「数値だけ集計」規則で元々無害なので、本命の検証は
    // 「数値に見えるヘッダーを含まない」こと。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await useTool("row-after", 2, 0);
    await setCell(0, 0, "2024");
    await setCell(0, 1, "10");
    await setCell(1, 0, "7");
    await setCell(1, 1, "1");
    await setCell(2, 1, "2");
    await setCell(0, 2, "=SUM(B:B)");
    await setCell(2, 2, "=SUM(2:2)");
    await setCell(3, 2, "=SUM(B1:B3)");

    // ヘッダー未宣言の表では全体参照は全部含む(素の Excel の A:A と同じ)。
    result.wholeRefIncludesAllWithoutHeader = (await dispCell(0, 2)) === "13"
      && (await dispCell(2, 2)) === "8";

    // ヘッダー行を宣言すると、同じ式のまま再計算で B1(10) が外れる(生きた参照)。
    await useTool("header", 1, 1);
    result.headerToggleRecomputesWholeRefs = (await dispCell(0, 2)) === "3"
      && (await dispCell(2, 2)) === "8";
    // 明示範囲(B1:B3)はヘッダー宣言後も全セルを含む(意図的に含める逃げ道)。
    result.explicitRangeIncludesHeader = (await dispCell(3, 2)) === "13";

    // ヘッダー列を宣言すると、行の全体参照(2:2)から最左列 A2(7) が外れる。
    await useTool("header-col", 1, 1);
    result.headerColumnExcludedFromWholeRowRef = (await dispCell(2, 2)) === "1"
      && (await dispCell(0, 2)) === "3";

    // th 化: 行0 と列0 のセルが th、本文セルは td のまま。
    result.headerColumnTogglesTh = (await tagOf(0, 1)) === "TH"
      && (await tagOf(2, 0)) === "TH"
      && (await tagOf(1, 1)) === "TD";

    // アイコンの対称性(ユーザー指示): ヘッダー行(上辺を塗った四角)とヘッダー列(左辺を塗った四角)は
    // 「片側が塗られた四角」の同じ視覚言語で、ツールチップも対称。v174 で字形 ⬒/◧ から図形へ。
    result.headerToggleIconsArePaired = await fresh.evaluate(() => {
      const rowButton = document.querySelector('#table-toolbar .table-tool[data-tool="header"]');
      const colButton = document.querySelector('#table-toolbar .table-tool[data-tool="header-col"]');
      return Boolean(rowButton?.querySelector('svg[data-icon="header-row"]')) && rowButton?.title === "ヘッダー行"
        && Boolean(colButton?.querySelector('svg[data-icon="header-col"]')) && colButton?.title === "ヘッダー列";
    });

    // 見た目: ヘッダーセルは本文セルと算出スタイルで区別できる(背景トーン+太字。
    // 点線下線=式セル・破線枠=フィル/参照プレビュー・塗り=選択、とは別系統)。
    result.headerCellsVisuallyDistinct = await fresh.evaluate(([rowSel, colSel, bodySel]) => {
      const s = (selector) => {
        const el = document.querySelector(selector);
        return el ? getComputedStyle(el) : null;
      };
      const rowHead = s(rowSel);
      const colHead = s(colSel);
      const body = s(bodySel);
      if (!rowHead || !colHead || !body) return false;
      const bold = (style) => Number(style.fontWeight) >= 600;
      return bold(rowHead) && bold(colHead) && !bold(body)
        && rowHead.backgroundColor !== body.backgroundColor
        && colHead.backgroundColor !== body.backgroundColor
        && rowHead.backgroundColor === colHead.backgroundColor;
    }, [cellSelector(0, 1), cellSelector(2, 0), cellSelector(1, 1)]);

    // ヘッダーは「位置」に付く: 先頭へ行を挿入すると新しい行0がヘッダーになり、
    // 全体参照の除外対象も新行0へ移る(旧タイトル行 2024/10 はデータに戻る)。
    await useTool("row-before", 0, 0);
    result.headerFlagSticksToPosition = (await tagOf(0, 1)) === "TH"
      && (await tagOf(1, 1)) === "TD"
      && (await dispCell(1, 2)) === "13";

    // 保存HTML: ヘッダー行・列とも同じ意匠(背景トーン+太字)で焼き込まれ、
    // manifest 経由のラウンドトリップで両フラグが戻る。
    const exported = await fresh.evaluate(() => {
      const table = {
        id: "header-probe-table",
        type: "table",
        text: "",
        tableHeader: true,
        tableHeaderColumn: true,
        rows: [
          [{ text: "項目", colSpan: 1, rowSpan: 1 }, { text: "2024", colSpan: 1, rowSpan: 1 }],
          [{ text: "売上", colSpan: 1, rowSpan: 1 }, { text: "7", colSpan: 1, rowSpan: 1 }],
        ],
      };
      const html = window.SingleHtmlFormat.buildPortableHtml({ title: "header-probe", blocks: [table], fonts: [], attachments: [] });
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const back = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.type === "table");
      return { html, headerBack: back?.tableHeader === true, headerColBack: back?.tableHeaderColumn === true };
    });
    result.headerColumnRoundtrips = exported.headerBack && exported.headerColBack;
    const viewer = await context.newPage();
    try {
      await viewer.setContent(exported.html, { waitUntil: "domcontentloaded" });
      result.exportedHeaderKeepsLook = await viewer.evaluate(() => {
        // v182 から見出しの行は <thead>、残りは <tbody>(印刷で次のページにも見出しの行を出すため)。
        const rowHead = document.querySelector(".doc-table thead tr:first-child td:last-child");
        const colHead = document.querySelector(".doc-table tbody tr:last-child td.doc-th-col");
        const body = document.querySelector(".doc-table tbody tr:last-child td:last-child");
        if (!rowHead || !colHead || !body) return false;
        const s = (el) => getComputedStyle(el);
        const bold = (el) => Number(s(el).fontWeight) >= 600;
        return bold(rowHead) && bold(colHead) && !bold(body)
          && s(rowHead).backgroundColor !== s(body).backgroundColor
          && s(colHead).backgroundColor !== s(body).backgroundColor;
      });
    } finally {
      await viewer.close();
    }

    return result;
  } finally {
    await fresh.close();
  }
}
