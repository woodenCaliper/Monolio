// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- いま読んでいる所の見出し(v205) ----
// スクロールで見出しが上へ流れても、どの見出しの下を読んでいるかが分かるように、ツールバーの下に
// 「見出し1 › 見出し2 › 見出し3」を1行で残す(ユーザー選択の案B。VS Code の Sticky Scroll を1行にしたもの)。
// 見出しが帯の下へすっかり隠れた時点で載せる。見出し4・5は載せない。押すとその見出しへ戻る。
// View → Sticky headings で入/切(localStorage に覚える)。保存HTMLにも同じ帯(見出し1〜3がある文書だけ)。
const KEY = "pagelith-heading-path";
const LONG = "1.2 範囲(とても長い見出しの名前。道筋の帯は1行のままで、はみ出す分は名前を詰めて表示する。さらに長くして確かめる)";
// 帯からはみ出さないことを、書体の幅によらず確かめるための見出し(v224)。1つだけでも帯より長い見出し1と、
// 「…」に詰めきれないほど短い見出し1の下の長い見出し2。どちらも縮む割合の合計が1未満だった頃は、どの環境でもはみ出した。
const LONG_ALONE = "3. " + "1つだけでも帯より長い見出し1の名前。".repeat(6);
const LONG_UNDER_SHORT = "4.1 " + "とても短い見出し1の下の長い見出し2の名前。".repeat(5);

export default async function headingPathSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  await fresh.setViewportSize({ width: 1100, height: 700 });
  const result = {};
  const p = (id, text) => ({ id, type: "paragraph", text });
  const filler = (prefix, n) => Array.from({ length: n }, (_, i) => p(prefix + i, prefix + " の本文 " + (i + 1)));
  const literal = { title: "見出しの道筋", pages: [{ id: "P", title: "見出しの道筋", blocks: [
    { id: "h1a", type: "heading1", text: "1. 概要" }, ...filler("a", 3),
    { id: "h2a", type: "heading2", text: "1.1 目的" }, ...filler("b", 4),
    { id: "h3a", type: "heading3", text: "1.1.1 前提" }, ...filler("c", 10),
    { id: "h4a", type: "heading4", text: "見出し4は載せない" }, ...filler("f", 6),
    { id: "h2b", type: "heading2", text: LONG }, ...filler("d", 10),
    { id: "h1b", type: "heading1", text: "2. 制御の方式" }, ...filler("e", 30),
    { id: "h1c", type: "heading1", text: LONG_ALONE }, ...filler("g", 12),
    { id: "h1d", type: "heading1", text: "4" }, ...filler("h", 3),
    { id: "h2d", type: "heading2", text: LONG_UNDER_SHORT }, ...filler("i", 30),
  ] }], fonts: [], attachments: [] };
  // 帯の状態(項目の名前の並び・位置)
  const bar = (page, selector, itemSelector) => page.evaluate(([sel, itemSel]) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden || !el.getClientRects().length) return { shown: false, items: [] };
    const box = el.getBoundingClientRect();
    const items = [...el.querySelectorAll(itemSel)];
    return {
      shown: true,
      items: items.map((item) => item.textContent),
      top: Math.round(box.top),
      height: Math.round(box.height),
      fits: items.every((item) => item.getBoundingClientRect().right <= box.right + 1),
      // 帯の右端からはみ出した幅(px。はみ出していなければ 0)
      overflow: Math.max(0, Math.round(Math.max(...items.map((item) => item.getBoundingClientRect().right)) - box.right)),
      firstLeft: items[0] ? Math.round(items[0].getBoundingClientRect().left) : null,
    };
  }, [selector, itemSelector]);
  // 見出しの下端を、帯の下端から dy だけ上(正)/下(負)に置く。
  const placeHeading = (page, headingSelector, barTop, dy) => page.evaluate(([sel, top, dy]) => {
    const heading = document.querySelector(sel);
    scrollTo(0, scrollY + heading.getBoundingClientRect().bottom - (top + 30) + dy);
  }, [headingSelector, barTop, dy]);
  const settle = (page) => page.waitForTimeout(120);
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.evaluate((key) => localStorage.removeItem(key), KEY);
    await fresh.reload();
    await fresh.waitForSelector("#blocks .block-content");
    const html = await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal);
    const path = join(OUT, "heading-path.html");
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelectorAll("#blocks .block").length > 60, null, { timeout: 5000 }).catch(() => {});
    await fresh.evaluate(() => { document.activeElement?.blur(); getSelection().removeAllRanges(); });
    await fresh.mouse.move(1000, 650);
    const BAR = "#heading-path";
    const ITEM = ".heading-path-item";
    const toolbarBottom = await fresh.evaluate(() => Math.round(document.querySelector(".toolbar").getBoundingClientRect().bottom));
    const editorHeading = (id) => '#blocks .block[data-id="' + id + '"] .block-content';

    // 1) 一番上では出ない
    result.headingPathHiddenAtTop = !(await bar(fresh, BAR, ITEM)).shown;
    // 2) 見出し3が帯の下へ隠れたら、見出し1 › 2 › 3。ツールバーのすぐ下に1行で、文字の頭は本文と同じ
    await placeHeading(fresh, editorHeading("h3a"), toolbarBottom, 4);
    await settle(fresh);
    const deep = await bar(fresh, BAR, ITEM);
    const textLeft = await fresh.evaluate(() => {
      const content = document.querySelector('#blocks .block[data-id="c5"] .block-content');
      return Math.round(content.getBoundingClientRect().left + parseFloat(getComputedStyle(content).paddingLeft));
    });
    result.headingPathShowsLevels = JSON.stringify(deep.items) === JSON.stringify(["1. 概要", "1.1 目的", "1.1.1 前提"]);
    result.headingPathSitsUnderToolbar = deep.top === toolbarBottom && deep.height <= 31;
    result.headingPathAlignsWithText = deep.firstLeft !== null && Math.abs(deep.firstLeft - textLeft) <= 3;
    // 3) まだ一部でも見えている見出しは載せない(帯とすぐ下に二重に出さない)
    await placeHeading(fresh, editorHeading("h3a"), toolbarBottom, -6);
    await settle(fresh);
    const partly = await bar(fresh, BAR, ITEM);
    result.headingPathWaitsUntilHidden = JSON.stringify(partly.items) === JSON.stringify(["1. 概要", "1.1 目的"]);
    // 4) 見出し4は載せない
    await placeHeading(fresh, editorHeading("h4a"), toolbarBottom, 4);
    await settle(fresh);
    const four = await bar(fresh, BAR, ITEM);
    result.headingPathSkipsHeading4 = JSON.stringify(four.items) === JSON.stringify(["1. 概要", "1.1 目的", "1.1.1 前提"]);
    // 5) 次の見出し2が来たら入れ替わる(見出し3は外れる)。長い名前でも1行に収める
    await placeHeading(fresh, editorHeading("h2b"), toolbarBottom, 4);
    await settle(fresh);
    const next = await bar(fresh, BAR, ITEM);
    result.headingPathReplacesSibling = JSON.stringify(next.items) === JSON.stringify(["1. 概要", LONG]);
    result.headingPathStaysOneLine = next.height <= 31 && next.fits;
    // 6) 次の見出し1では、その見出しだけ
    await placeHeading(fresh, editorHeading("h1b"), toolbarBottom, 4);
    await settle(fresh);
    result.headingPathResetsAtHeading1 = JSON.stringify((await bar(fresh, BAR, ITEM)).items) === JSON.stringify(["2. 制御の方式"]);
    result.headingPathEvidence = { deep, partly, four, next, toolbarBottom, textLeft };
    // 7) 押すとその見出しへ戻る(帯に隠れない位置。道筋はその親だけになる)
    await placeHeading(fresh, editorHeading("h3a"), toolbarBottom, 200);
    await settle(fresh);
    await fresh.locator(ITEM, { hasText: "1.1 目的" }).click();
    await settle(fresh);
    const jumped = await fresh.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().top), editorHeading("h2a"));
    const afterJump = await bar(fresh, BAR, ITEM);
    result.headingPathClickJumps = jumped >= toolbarBottom + 30 && jumped <= toolbarBottom + 80
      && JSON.stringify(afterJump.items) === JSON.stringify(["1. 概要"]);
    result.headingPathClickEvidence = { jumped, afterJump: afterJump.items };

    // 8) View → Sticky headings で切ると出ない。覚えていて、入れ直すと戻る
    await placeHeading(fresh, editorHeading("h3a"), toolbarBottom, 4);
    await settle(fresh);
    await openMenu(fresh, "view");
    await fresh.locator("#menu-heading-path").click();
    await settle(fresh);
    const off = {
      shown: (await bar(fresh, BAR, ITEM)).shown,
      checked: await fresh.locator("#menu-heading-path").getAttribute("aria-checked"),
      stored: await fresh.evaluate((key) => localStorage.getItem(key), KEY),
    };
    await openMenu(fresh, "view");
    await fresh.locator("#menu-heading-path").click();
    await settle(fresh);
    const on = {
      shown: (await bar(fresh, BAR, ITEM)).shown,
      checked: await fresh.locator("#menu-heading-path").getAttribute("aria-checked"),
      stored: await fresh.evaluate((key) => localStorage.getItem(key), KEY),
    };
    result.headingPathToggleOff = !off.shown && off.checked === "false" && off.stored === "off";
    result.headingPathToggleOn = on.shown && on.checked === "true" && on.stored === null;
    result.headingPathToggleEvidence = { off, on };

    // 9) 本文の中の図(Mermaid の SVG)に class="block" の要素があっても止まらない(v205 で機能見本の作成中に発見:
    // SVG の className は文字列でなく、道筋を求める処理が例外で止まった)。図の代わりに同じ形の SVG を本文に置いて確かめる。
    await fresh.evaluate(() => {
      const host = document.querySelector('#blocks .block[data-id="a0"] .block-content');
      host.insertAdjacentHTML("beforeend", '<svg class="block" width="1" height="1"><g class="block type-heading1"></g></svg>');
    });
    const errorsBefore = pageErrors.length;
    await placeHeading(fresh, editorHeading("h2b"), toolbarBottom, 4);
    await settle(fresh);
    const withSvg = await bar(fresh, BAR, ITEM);
    result.headingPathIgnoresSvgBlocks = pageErrors.length === errorsBefore
      && JSON.stringify(withSvg.items) === JSON.stringify(["1. 概要", LONG]);
    result.headingPathSvgEvidence = { errors: pageErrors.slice(errorsBefore), items: withSvg.items };

    // 10) 1つだけでも帯より長い見出し、ごく短い見出しの下の長い見出しでも、帯は1行のままではみ出さない(v224)。
    // 縮む割合(flex-shrink)の合計が1未満になると、はみ出した分の一部しか縮めない(CSS の決まり)。今の見出しの割合を .25 に
    // していたので、今の見出しだけが縮めるとき(帯にそれ1つ・親が「…」に詰めきった)に、はみ出したまま残った。
    await placeHeading(fresh, editorHeading("h1c"), toolbarBottom, 4);
    await settle(fresh);
    const alone = await bar(fresh, BAR, ITEM);
    result.headingPathLongAloneFits = JSON.stringify(alone.items) === JSON.stringify([LONG_ALONE]) && alone.height <= 31 && alone.fits;
    await placeHeading(fresh, editorHeading("h2d"), toolbarBottom, 4);
    await settle(fresh);
    const underShort = await bar(fresh, BAR, ITEM);
    result.headingPathShortParentFits = JSON.stringify(underShort.items) === JSON.stringify(["4", LONG_UNDER_SHORT])
      && underShort.height <= 31 && underShort.fits;
    result.headingPathOverflowEvidence = { next: next.overflow, alone: alone.overflow, underShort: underShort.overflow };

    // ---- 保存HTML ----
    const view = await context.newPage();
    await view.setViewportSize({ width: 1100, height: 700 });
    try {
      await view.goto(pathToFileURL(path).href);
      await view.waitForTimeout(300);
      const SBAR = ".doc-heading-path";
      const SITEM = ".doc-heading-path button";
      const savedHidden = !(await bar(view, SBAR, SITEM)).shown;
      await placeHeading(view, "#block-h3a", 0, 4);
      await settle(view);
      const savedDeep = await bar(view, SBAR, SITEM);
      const savedTextLeft = await view.evaluate(() => Math.round(document.querySelector("#block-h3a").getBoundingClientRect().left));
      result.savedHeadingPathShowsLevels = savedHidden && savedDeep.top === 0
        && JSON.stringify(savedDeep.items) === JSON.stringify(["1. 概要", "1.1 目的", "1.1.1 前提"])
        && Math.abs(savedDeep.firstLeft - savedTextLeft) <= 3;
      await placeHeading(view, "#block-h4a", 0, 4);
      await placeHeading(view, "#block-h2b", 0, 4);
      await settle(view);
      const savedNext = await bar(view, SBAR, SITEM);
      result.savedHeadingPathReplacesSibling = JSON.stringify(savedNext.items) === JSON.stringify(["1. 概要", LONG]) && savedNext.height <= 31 && savedNext.fits;
      await view.locator(SITEM, { hasText: "1. 概要" }).click();
      await settle(view);
      const savedJump = await view.evaluate(() => Math.round(document.querySelector("#block-h1a").getBoundingClientRect().top));
      result.savedHeadingPathClickJumps = savedJump >= 30 && savedJump <= 80 && !(await bar(view, SBAR, SITEM)).shown;
      result.savedHeadingPathEvidence = { savedDeep, savedNext: savedNext.items, savedJump, savedTextLeft };
      // 長い見出しでも、帯からはみ出さない(上の 10 と同じ。保存HTMLの帯も同じ規則で縮める)
      await placeHeading(view, "#block-h1c", 0, 4);
      await settle(view);
      const savedAlone = await bar(view, SBAR, SITEM);
      result.savedHeadingPathLongAloneFits = JSON.stringify(savedAlone.items) === JSON.stringify([LONG_ALONE])
        && savedAlone.height <= 31 && savedAlone.fits;
      await placeHeading(view, "#block-h2d", 0, 4);
      await settle(view);
      const savedUnderShort = await bar(view, SBAR, SITEM);
      result.savedHeadingPathShortParentFits = JSON.stringify(savedUnderShort.items) === JSON.stringify(["4", LONG_UNDER_SHORT])
        && savedUnderShort.height <= 31 && savedUnderShort.fits;
      result.savedHeadingPathOverflowEvidence = { next: savedNext.overflow, alone: savedAlone.overflow, underShort: savedUnderShort.overflow };
      await placeHeading(view, "#block-h3a", 0, 4);
      await settle(view);
      await view.emulateMedia({ media: "print" });
      result.savedHeadingPathNotPrinted = !(await bar(view, SBAR, SITEM)).shown;
    } finally {
      await view.close();
    }
    // 見出し1〜3が無い文書の保存HTMLには足さない(その文書の出力は変わらない)
    result.savedHeadingPathOnlyWithHeadings = await fresh.evaluate(() => {
      const plain = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "Q", title: "見出しなし", blocks: [{ id: "x", type: "paragraph", text: "本文" }, { id: "y", type: "heading4", text: "見出し4だけ" }] }], fonts: [], attachments: [] });
      const withHeading = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "Q", title: "見出しあり", blocks: [{ id: "x", type: "toggleHeading2", text: "トグル見出し2" }] }], fonts: [], attachments: [] });
      return !plain.includes("doc-heading-path") && withHeading.includes("doc-heading-path");
    });
  } finally {
    await fresh.evaluate((key) => localStorage.removeItem(key), KEY).catch(() => {});
    await fresh.close();
  }
  return result;
}
