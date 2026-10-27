// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 文書内検索・置換 (Ctrl+F / Ctrl+H) ----
// 文書全体の状態に依存しないよう、新しいページで検証する。
export default async function searchSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    const setCell = async (r, c, text) => {
      await fresh.evaluate(([row, cell, value]) => {
        const td = document.querySelector('#blocks .block.type-table .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]');
        if (!td) return;
        td.focus();
        td.textContent = value;
        td.dispatchEvent(new Event("input", { bubbles: true }));
        td.blur();
      }, [r, c, text]);
      await fresh.waitForTimeout(70);
    };
    const blockTextExists = (text) => fresh.evaluate((needle) => (
      [...document.querySelectorAll("#blocks .block-content")].some((el) => el.textContent === needle)
    ), text);
    const countText = () => fresh.evaluate(() => document.querySelector("#search-count").textContent);
    const retypeInto = async (selector, text) => {
      await fresh.evaluate((sel) => {
        const input = document.querySelector(sel);
        input.focus();
        input.select();
      }, selector);
      await fresh.keyboard.type(text);
      await fresh.waitForTimeout(150);
    };

    // 検索語 needle を段落・コード・表のセル・閉じたトグルの中に散らす。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("alpha needle one");
    await insertBlock(fresh);
    await fresh.keyboard.type("second Needle two");
    await insertBlock(fresh);
    await fresh.keyboard.type("/code");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("needle in code");
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await setCell(0, 0, "1");
    await setCell(0, 1, "2");
    await setCell(0, 2, "=A1+B1");
    await setCell(1, 0, "needle cell");
    // トグルは表の後ろに置く。挿入の起点をセルにするとブロックが特定できない
    // ため、表ブロックの ＋ ボタンから直下に足す。
    const tableId = await fresh.evaluate(() => document.querySelector("#blocks .block.type-table").dataset.id);
    await fresh.locator('#blocks .block[data-id="' + tableId + '"] .insert-block').click();
    await fresh.keyboard.type("/toggle");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("parent toggle");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("needle hidden");
    await fresh.waitForTimeout(120);
    await fresh.locator("#blocks .block.type-toggle .toggle-caret").first().click();
    await fresh.waitForTimeout(200);
    const hiddenBeforeSearch = await fresh.evaluate(() => (
      ![...document.querySelectorAll("#blocks .block-content")].some((el) => el.textContent.includes("needle hidden"))
    ));

    // 開閉は hidden 属性ではなく算出値(computed display と可視高さ)で確かめる。
    // author 側の .search-bar { display: grid } は UA 既定の [hidden]{display:none}
    // に勝つため、対の [hidden] 規則が抜けると「閉じたつもりで出っぱなし」になる。
    // 属性だけを見ていた過去のテストはこれを見落とした。
    const searchBarComputed = () => fresh.evaluate(() => {
      const bar = document.querySelector("#search-bar");
      const row = document.querySelector("#search-replace-row");
      return {
        barDisplay: getComputedStyle(bar).display,
        barHeight: bar.getBoundingClientRect().height,
        rowDisplay: getComputedStyle(row).display,
      };
    });
    const closedAtStart = await searchBarComputed();
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(120);
    const openAfterCtrlF = await searchBarComputed();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(120);
    const closedAfterEscape = await searchBarComputed();
    result.searchBarHiddenByComputedStyle = closedAtStart.barDisplay === "none"
      && closedAtStart.barHeight === 0
      && openAfterCtrlF.barDisplay !== "none"
      && openAfterCtrlF.barHeight > 0
      && openAfterCtrlF.rowDisplay === "none"
      && closedAfterEscape.barDisplay === "none"
      && closedAfterEscape.barHeight === 0;

    // Ctrl+F で検索バーが開き、入力欄へフォーカスが移る。置換行はまだ出ない。
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(120);
    result.searchBarOpensWithCtrlF = await fresh.evaluate(() => (
      !document.querySelector("#search-bar").hidden
      && document.activeElement === document.querySelector("#search-input")
      && document.querySelector("#search-replace-row").hidden
    ));

    // 段落2つ + コード + セル + 閉じたトグルの中 = 5件。大文字の Needle も数える。
    await fresh.keyboard.type("needle");
    await fresh.waitForTimeout(200);
    result.searchCountsMatchesAcrossBlocks = (await countText()) === "1/5";

    // ハイライトは CSS Custom Highlight API に載る。描画されていないトグル内の
    // 1件を除く4件が対象で、現在の一致は別レジストリに入る。
    result.searchHighlightsMatches = await fresh.evaluate(() => {
      const current = CSS.highlights.get("doc-search-current");
      const rest = CSS.highlights.get("doc-search-match");
      if (!current || !rest) return false;
      const texts = [...rest].map((range) => range.toString().toLowerCase());
      return current.size === 1
        && [...current][0].toString().toLowerCase() === "needle"
        && rest.size === 3
        && texts.every((text) => text === "needle");
    });
    // 本文の DOM に装飾要素を挿し込まない(textContent がそのまま)。
    result.searchLeavesBlockTextClean = await blockTextExists("alpha needle one");

    // Enter / Shift+Enter で次・前の一致へ移る。
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(120);
    const afterNext = await countText();
    await fresh.keyboard.press("Shift+Enter");
    await fresh.waitForTimeout(120);
    const afterPrev = await countText();
    result.searchEnterNavigatesMatches = afterNext === "2/5" && afterPrev === "1/5";

    // 先頭からさらに前へ行くと最後の一致へ折り返し、閉じたトグルが開く。
    await fresh.keyboard.press("Shift+Enter");
    await fresh.waitForTimeout(200);
    result.searchWrapsAndOpensClosedToggle = hiddenBeforeSearch
      && (await countText()) === "5/5"
      && await fresh.evaluate(() => (
        [...document.querySelectorAll("#blocks .block-content")].some((el) => el.textContent.includes("needle hidden"))
      ));

    // 数式セルは表示値(3)ではなく式文字列(=A1+B1)が検索対象。
    await retypeInto("#search-input", "A1+B1");
    result.searchTargetsFormulaSource = (await countText()) === "1/1";
    // 表示中の計算値には塗る範囲が無いので、セルの枠線で現在の一致を示す。
    result.searchFormulaCellShownByOutline = await fresh.evaluate(() => {
      const td = document.querySelector('#blocks .block.type-table .editor-table [data-row="0"][data-cell="2"]');
      return td.classList.contains("search-current-cell") && td.textContent === "3";
    });
    await retypeInto("#search-input", "3");
    result.searchIgnoresFormulaDisplayValue = (await countText()) === "0/0";

    // Ctrl+H で置換行が現れる。
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(120);
    result.searchCtrlHShowsReplaceRow = await fresh.evaluate(() => (
      !document.querySelector("#search-bar").hidden
      && !document.querySelector("#search-replace-row").hidden
    ));

    // Replace は現在の一致だけを置き換えて、次の一致へ進む。
    await retypeInto("#search-input", "needle");
    await retypeInto("#search-replace-input", "nail");
    await fresh.locator("#search-replace-one").click();
    await fresh.waitForTimeout(250);
    result.searchReplaceOneReplacesAndAdvances = (await blockTextExists("alpha nail one"))
      && (await countText()) === "1/4";

    // 置換1回は Ctrl+Z 1回で戻る(検索バーの外から)。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.searchReplaceUndoRestoresInOneStep = (await blockTextExists("alpha needle one"))
      && (await countText()).endsWith("/5");

    // すべて置換は、段落・コード・表のセル・トグルの中まで一度に置き換える。
    await retypeInto("#search-replace-input", "bolt");
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(300);
    result.searchReplaceAllReplacesEverywhere = await fresh.evaluate(() => {
      const texts = [...document.querySelectorAll("#blocks .block-content")].map((el) => el.textContent);
      const cell = document.querySelector('#blocks .block.type-table .editor-table [data-row="1"][data-cell="0"]');
      return !texts.some((text) => /needle/i.test(text))
        && texts.some((text) => text.includes("bolt in code"))
        && texts.some((text) => text === "second bolt two")
        && texts.some((text) => text.includes("bolt hidden"))
        && cell.textContent === "bolt cell"
        && document.querySelector("#search-count").textContent === "0/0";
    });

    // すべて置換も Ctrl+Z 1回でまとめて戻る。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.searchReplaceAllUndoIsSingleStep = await fresh.evaluate(() => {
      const texts = [...document.querySelectorAll("#blocks .block-content")].map((el) => el.textContent);
      const cell = document.querySelector('#blocks .block.type-table .editor-table [data-row="1"][data-cell="0"]');
      return texts.some((text) => text === "alpha needle one")
        && texts.some((text) => text === "second Needle two")
        && texts.some((text) => text.includes("needle in code"))
        && cell.textContent === "needle cell"
        && document.querySelector("#search-count").textContent.endsWith("/5");
    });

    // リッチ書式(太字)の中の置換は、書式を保ったまま文字だけ入れ替える。
    await insertBlock(fresh);
    await fresh.keyboard.type("styled uniqword tail");
    await fresh.evaluate(() => {
      const el = [...document.querySelectorAll("#blocks .block-content")].find((item) => item.textContent === "styled uniqword tail");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.locator("#format-bold").click();
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(120);
    await retypeInto("#search-input", "uniqword");
    await retypeInto("#search-replace-input", "swapped");
    await fresh.locator("#search-replace-one").click();
    await fresh.waitForTimeout(250);
    result.searchReplaceKeepsFormatting = await fresh.evaluate(() => {
      const el = [...document.querySelectorAll("#blocks .block-content")].find((item) => item.textContent === "styled swapped tail");
      const bold = el?.querySelector("b, strong");
      return Boolean(el && bold && bold.textContent.includes("swapped"));
    });

    // 本文で選択したテキストは Ctrl+F の検索語に引き継がれる。
    await fresh.evaluate(() => {
      const el = [...document.querySelectorAll("#blocks .block-content")].find((item) => item.textContent === "alpha needle one");
      el.focus();
      const text = el.firstChild;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 5);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(200);
    result.searchPrefillsFromSelection = await fresh.evaluate(() => (
      document.querySelector("#search-input").value === "alpha"
      && document.querySelector("#search-count").textContent === "1/1"
    ));

    // Esc で閉じ、ハイライトも消える。
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(120);
    result.searchEscapeClosesAndClears = await fresh.evaluate(() => (
      document.querySelector("#search-bar").hidden
      && !CSS.highlights.get("doc-search-match")
      && !CSS.highlights.get("doc-search-current")
    ));

    return result;
  } finally {
    await fresh.close();
  }
}
