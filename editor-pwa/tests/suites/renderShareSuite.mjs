// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 描き直し1回の中で文書全体を何度も数え直さない(Issue #205) ----
// 部分の描き直し(v225)の後も、render 1回ごとに文書全体の大きさに比例する仕事が何度も重なっていた:
// 1) 図表の番号(figureNumbers)を題名つきのブロック1つごとに2回、参照の行き先(referenceTargets)も別に数え直していた
// 2) 提案: ブロック1つごとに全提案の全変更をなめ、変更の状態を出すたびに findBlockAnywhere で文書全体を探していた
// 3) ロック: markDirty のたびにロック中のページ全体を文字列にして比べていた(1回の処理で何度も)
// 4) 日本語入力: 変換の始めと確定のたびに文書全体を JSON にして比べていた
// 5) 図表の題名・ページの題名の打鍵: 1文字ごとに番号・参照の印・目次・ページの一覧を作り直していた
// 数える回数(関数の呼び出し・探した要素の数)で確かめ、あわせて番号・印・提案の印・ロックの結果が変わらないことを見る。
export default async function renderShareSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const evidence = {};
  const SECTIONS = 40;
  const FILLER = 10;
  const blocks = [{ id: "toc", type: "toc", text: "" }];
  const fillerIds = [];
  for (let i = 0; i < SECTIONS; i += 1) {
    blocks.push({ id: "H" + i, type: "heading2", text: "節 " + i });
    blocks.push({ id: "T" + i, type: "table", caption: "表題 " + i, rows: [[{ text: "a" + i }, { text: "b" }], [{ text: "1" }, { text: "2" }]] });
    blocks.push({
      id: "R" + i, type: "paragraph", text: "参照 表" + (i + 1) + " と 節",
      html: '参照 <span class="figure-ref" data-ref="T' + i + '">表' + (i + 1) + '</span> と <span class="figure-ref" data-ref="H' + i + '">節</span>',
    });
    for (let j = 0; j < FILLER; j += 1) {
      const fid = "F" + i + "_" + j;
      fillerIds.push(fid);
      blocks.push({ id: fid, type: "paragraph", text: "段落 " + i + "-" + j + " の本文。測定は室温で行う。" });
    }
  }
  blocks.push({ id: "END", type: "paragraph", text: "おわり" });
  // 提案: 本文の段落 200 か所の書き換え(差分の印が付く)と、表のセル 40 か所。
  const changes = fillerIds.filter((_, index) => index % 2 === 0).map((fid) => ({ op: "setText", block: fid, text: "段落の本文。測定は 23℃ で行う。" }));
  for (let i = 0; i < SECTIONS; i += 1) changes.push({ op: "setCell", block: "T" + i, row: 1, col: 1, text: "20" });
  const lockedBlocks = Array.from({ length: 400 }, (_, i) => ({ id: "L" + i, type: "paragraph", text: "ロックしたページの段落 " + i + " の本文。" }));
  const literal = {
    title: "使い回し", fonts: [], attachments: [], settings: { headingNumbers: true },
    pages: [
      { id: "P1", title: "本文", blocks },
      { id: "P2", title: "鍵のページ", locked: true, blocks: lockedBlocks },
    ],
    suggestions: [{ author: { name: "Claude", kind: "ai" }, title: "書き換え", changes }],
  };

  // 数える仕掛け: SingleHtmlFormat の数える関数・JSON・findIndex(探した要素の数)。on の間だけ数える。
  const installCounters = () => fresh.evaluate(() => {
    const c = { on: false, figureNumbers: 0, headingNumbers: 0, referenceTargets: 0, renders: 0, derivePageTree: 0, scanned: 0, lockKeys: 0, docKeys: 0, parses: 0 };
    window.__count = c;
    const fmt = window.SingleHtmlFormat;
    for (const [name, counter] of [["figureNumbers", "figureNumbers"], ["headingNumbers", "headingNumbers"], ["referenceTargets", "referenceTargets"], ["numberedListMarkers", "renders"], ["derivePageTree", "derivePageTree"]]) {
      const original = fmt[name];
      fmt[name] = function (...args) {
        if (c.on) c[counter] += 1;
        return original.apply(this, args);
      };
    }
    const findIndex = Array.prototype.findIndex;
    Array.prototype.findIndex = function (predicate, thisArg) {
      if (!c.on) return findIndex.call(this, predicate, thisArg);
      return findIndex.call(this, function (...args) {
        c.scanned += 1;
        return predicate.apply(thisArg, args);
      });
    };
    const stringify = JSON.stringify;
    JSON.stringify = function (value, replacer, space) {
      if (c.on && value && typeof value === "object" && !Array.isArray(value)) {
        const keys = Object.keys(value);
        // ロックの比べ合わせの鍵(lockContentKey: { title, blocks })
        if (keys.length === 2 && keys[0] === "title" && keys[1] === "blocks") c.lockKeys += 1;
        // 文書全体を文字列にした(変換の比べ合わせ。replacer つき)
        if (typeof replacer === "function" && Array.isArray(value.pages)) c.docKeys += 1;
      }
      return stringify.call(this, value, replacer, space);
    };
    const parse = JSON.parse;
    JSON.parse = function (text, reviver) {
      if (c.on) c.parses += 1;
      return parse.call(this, text, reviver);
    };
  });
  const startCount = () => fresh.evaluate(() => {
    const c = window.__count;
    for (const key of Object.keys(c)) if (key !== "on") c[key] = 0;
    c.on = true;
  });
  const stopCount = () => fresh.evaluate(() => {
    window.__count.on = false;
    const { on, ...rest } = window.__count;
    return rest;
  });
  const frames = (n = 2) => fresh.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
  const open = async () => {
    const path = join(OUT, "render-share.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector('#blocks .block[data-id="END"]'), null, { timeout: 30000 });
    await fresh.waitForTimeout(500);
  };
  // 画面の番号・印・提案の印(描き直しの結果が変わらないことを見る)
  const view = () => fresh.evaluate(() => ({
    labels: [...document.querySelectorAll("#blocks .block-caption-label")].map((label) => label.textContent).join(","),
    chips: [...document.querySelectorAll("#blocks .figure-ref")].map((chip) => chip.textContent + (chip.classList.contains("is-missing") ? "!" : "")).join(","),
    toc: [...document.querySelectorAll("#blocks .toc-item")].length,
    sgText: document.querySelectorAll("#blocks .sg-text").length,
    sgCell: document.querySelectorAll("#blocks .sg-cell").length,
    toggle: document.querySelector("#suggest-toggle")?.hidden ? null : document.querySelector("#suggest-toggle")?.textContent,
  }));
  const expectedLabels = (from = 1, count = SECTIONS) => Array.from({ length: count }, (_, i) => "表" + (from + i) + ":").join(",");

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await installCounters();
    await open();
    const initial = await view();
    evidence.initial = initial;
    // 開いた直後の見え方(番号・印・提案の印)
    result.renderShareInitialView = initial.labels === expectedLabels()
      && initial.chips.startsWith("表1,0.1 節 0,表2,0.2 節 1") && initial.sgText === 200 && initial.sgCell === SECTIONS
      && initial.toggle === "提案 440" && initial.toc === SECTIONS;

    // 1) Enter(部分の描き直し)1回: 図表・見出しの番号と参照の行き先は描き直し1回につき1回まで。
    //    提案の状態を出すために文書全体を探さない(探した要素の数がブロックの数の数倍で収まる)。
    await fresh.evaluate(() => {
      const el = document.querySelector('#blocks .block-content[data-id="F5_3"]');
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await startCount();
    const enterMs = await fresh.evaluate(() => {
      const el = document.querySelector('#blocks .block-content[data-id="F5_3"]');
      const t0 = performance.now();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      return performance.now() - t0;
    });
    await fresh.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    const enter = await stopCount();
    const blockCount = await fresh.evaluate(() => document.querySelectorAll("#blocks .block").length);
    evidence.enter = { ...enter, ms: Math.round(enterMs), blockCount };
    result.renderShareEnterCountsOnce = enter.renders >= 1 && enter.figureNumbers <= enter.renders
      && enter.referenceTargets <= enter.renders && enter.headingNumbers <= enter.renders;
    result.renderShareEnterNoSuggestScan = enter.renders >= 1 && enter.scanned <= blockCount * 6;
    const afterEnter = await view();
    evidence.afterEnter = afterEnter;
    result.renderShareEnterKeepsView = afterEnter.labels === initial.labels && afterEnter.chips === initial.chips
      && afterEnter.sgText === initial.sgText && afterEnter.sgCell === initial.sgCell && afterEnter.toggle === initial.toggle;
    // 速さ(数える仕掛けを止めて、Enter 5回の中央値。証拠として残す)
    const enterTimes = [];
    for (let i = 0; i < 5; i += 1) {
      enterTimes.push(await fresh.evaluate((index) => {
        const el = document.querySelector('#blocks .block-content[data-id="F' + (10 + index) + '_3"]');
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        const t0 = performance.now();
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
        return performance.now() - t0;
      }, i));
      await fresh.waitForTimeout(50);
    }
    evidence.enterMedianMs = Math.round([...enterTimes].sort((a, b) => a - b)[2]);

    // 2) ページを替える(丸ごと描き直し): 題名つきの表 40 個でも、図表の番号は描き直し1回につき1回まで
    //    (以前は表1つごとに figureNumbers を2回 = 80 回)。
    await fresh.locator(".page-tree-item", { hasText: "鍵のページ" }).first().click();
    await fresh.waitForTimeout(300);
    await startCount();
    await fresh.locator(".page-tree-item", { hasText: "本文" }).first().click();
    await fresh.waitForFunction(() => document.querySelector('#blocks .block[data-id="END"]'), null, { timeout: 10000 });
    const full = await stopCount();
    evidence.full = full;    result.renderShareFullRenderCountsOnce = full.renders >= 1 && full.figureNumbers <= full.renders && full.referenceTargets <= full.renders;
    const afterFull = await view();
    result.renderShareFullRenderKeepsView = afterFull.labels === initial.labels && afterFull.chips === initial.chips
      && afterFull.sgText === initial.sgText && afterFull.toggle === initial.toggle;

    // 3) 図表の題名の打鍵: 同じ処理の中の5打鍵では番号・参照・目次を数え直さず、次のフレームで1回だけ。
    //    題名を空にすると、その表は番号から外れて後ろの番号が1つずつ詰まる(結果は今までと同じ)。
    await startCount();
    const captionSync = await fresh.evaluate(() => {
      const input = document.querySelector('#blocks .block[data-id="T0"] .block-caption-input');
      input.focus();
      for (const value of ["表題 0x", "表題 0", "表題 ", "表", ""]) {
        input.value = value;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      }
      const { on, ...rest } = window.__count;
      return { ...rest };
    });
    await frames(3);
    const captionAll = await stopCount();
    evidence.caption = { sync: captionSync, all: captionAll };
    result.renderShareCaptionTypingCoalesced = captionSync.figureNumbers === 0 && captionSync.referenceTargets === 0
      && captionAll.figureNumbers <= 1 && captionAll.referenceTargets <= 1;
    const afterCaption = await view();
    evidence.afterCaption = afterCaption.labels.slice(0, 40) + " / " + afterCaption.chips.slice(0, 60);
    result.renderShareCaptionRelabels = afterCaption.labels === "," + expectedLabels(1, SECTIONS - 1)
      && afterCaption.chips.startsWith("参照先なし!,0.1 節 0,表1,0.2 節 1,表2");
    // 題名を戻す(フォーカスを外さない: 空のまま離れると題名ごと外れる)
    await fresh.evaluate(() => {
      const input = document.querySelector('#blocks .block[data-id="T0"] .block-caption-input');
      input.value = "表題 0";
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "0" }));
    });
    await frames(3);
    result.renderShareCaptionRestored = (await view()).labels === expectedLabels();

    // 4) ページの題名の打鍵: 同じ処理の中の5打鍵ではページの一覧を作り直さず、次のフレームで1回だけ。一覧には新しい題名が出る。
    await startCount();
    const titleSync = await fresh.evaluate(() => {
      const title = document.querySelector("#doc-title");
      title.focus();
      for (const value of ["本文A", "本文AB", "本文ABC", "本文ABCD", "本文ABCDE"]) {
        title.textContent = value;
        title.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      }
      return window.__count.derivePageTree;
    });
    await frames(3);
    const titleAll = await stopCount();
    const treeTitle = await fresh.evaluate(() => [...document.querySelectorAll(".page-tree-item")].map((item) => item.textContent.trim()).join("|"));
    evidence.title = { sync: titleSync, all: titleAll.derivePageTree, treeTitle };
    result.renderShareTitleTypingCoalesced = titleSync === 0 && titleAll.derivePageTree <= 1 && treeTitle.includes("本文ABCDE");

    // 5) ロックの確かめ: 1つの処理の中で markDirty が5回あっても、ロック中のページを比べるのは1回。
    await startCount();
    await fresh.evaluate(async () => {
      const el = document.querySelector('#blocks .block-content[data-id="F7_1"]');
      for (let i = 0; i < 5; i += 1) {
        el.textContent = "打った文字 " + i;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(i) }));
      }
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const lock = await stopCount();
    evidence.lock = lock;
    result.renderShareLockCheckOncePerTask = lock.lockKeys >= 1 && lock.lockKeys <= 2;

    // 6) 日本語入力: 変換の始めと確定で文書全体を JSON にしない(変換したブロックだけを比べる)。
    const cdp = await context.newCDPSession(fresh);
    await fresh.evaluate(() => {
      const el = document.querySelector('#blocks .block-content[data-id="F9_1"]');
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await fresh.waitForTimeout(100);
    await startCount();
    for (const text of ["か", "かん", "感"]) {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
      await fresh.waitForTimeout(40);
    }
    await cdp.send("Input.insertText", { text: "感" });
    await fresh.waitForTimeout(150);
    const ime = await stopCount();
    evidence.ime = ime;
    const imeText = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="F9_1"]').textContent);
    result.renderShareImeNoWholeDocKey = ime.docKeys === 0 && imeText.endsWith("感");

    result.renderShareNoPageErrors = pageErrors.length === 0;
    result.renderShareEvidence = JSON.stringify({ ...evidence, pageErrors });
    return result;
  } finally {
    await fresh.close();
  }
}
