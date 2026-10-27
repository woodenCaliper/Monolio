// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 題名の帯(v201)とページの場所(v207) ----
// ユーザー原文「タイトルは段が一番高いだけ、というのでは不十分」→ 題名から上を薄い灰色に(「そこから上全部」「薄いグレー」)。
// ページの場所: v201 は題名の上に親のページ名を全部並べていた。v207 でツールバーのメニューの下の1行(ユーザー選択の案B)に移し、
// 「階層全部ではなく、自分と親だけ。親の親があったら … > 親 > 自分」(ユーザー原文)にした。題名の上のものは消した(ユーザー指示)。
// 保存HTMLでは上のバー(☰ ← →)の右に同じものを出す。
export default async function pageCrumbSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const literal = { pages: [
    { id: "CR1", title: "根", blocks: [{ id: "a1", type: "page", pageId: "CR2" }] },
    { id: "CR2", title: "子", blocks: [{ id: "b1", type: "page", pageId: "CR3" }] },
    { id: "CR3", title: "孫", blocks: [{ id: "c1", type: "page", pageId: "CR4" }] },
    { id: "CR4", title: "曾孫", blocks: [{ id: "d1", type: "paragraph", text: "曾孫の本文" }] },
  ], fonts: [], attachments: [] };
  // 場所の行: 押せる項目(親・…)の名前と、自分の名前。
  const path = () => fresh.evaluate(() => {
    const nav = document.querySelector("#page-path");
    return {
      hidden: nav.hidden,
      text: nav.innerText.replace(/\s+/g, " ").trim(),
      items: [...nav.querySelectorAll(".page-path-item")].map((item) => item.textContent + (item.title ? "[" + item.title + "]" : "")),
      current: nav.querySelector(".page-path-current")?.textContent,
      inToolbar: Boolean(nav.closest(".toolbar")),
      // メニューの行の下、書式の道具の行の上の1行(ユーザー選択の案B)。
      ownRow: !nav.hidden && document.querySelector("#menubar").getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1
        && nav.getBoundingClientRect().bottom <= document.querySelector(".format-toolbar").getBoundingClientRect().top + 1,
      title: document.querySelector("#doc-title").textContent,
      oldCrumb: Boolean(document.querySelector("#page-crumb")),
    };
  });
  const go = async (title) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: title }).first().click();
    await fresh.waitForTimeout(200);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    // 1ページの文書では出さない。
    result.crumbHiddenForSinglePage = (await path()).hidden === true;
    const file = join(OUT, "page-crumb.html");
    await writeFile(file, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(file);
    await fresh.waitForTimeout(500);
    const root = await path();
    await go("子");
    const child = await path();
    await go("孫");
    const grandchild = await path();
    await go("曾孫");
    const deep = await path();
    // 先頭は自分だけ、子は「親 › 自分」、それより深いと「… › 親 › 自分」(… は省いた上の階層を名前で持つ)。
    result.pagePathShowsParentAndSelf = !root.hidden && root.inToolbar && root.ownRow && root.text === "根" && root.items.length === 0
      && child.text === "根 › 子" && JSON.stringify(child.items) === JSON.stringify(["根[根]"]);
    result.pagePathCollapsesHigherAncestors = grandchild.text === "… › 子 › 孫" && JSON.stringify(grandchild.items) === JSON.stringify(["…[根]", "子[子]"])
      && deep.text === "… › 孫 › 曾孫" && JSON.stringify(deep.items) === JSON.stringify(["…[根 › 子]", "孫[孫]"]) && deep.current === "曾孫";
    // 題名の上の親のページ名(v201)は無い。
    result.pagePathReplacesTitleCrumb = !deep.oldCrumb;
    result.pagePathEvidence = { root, child, grandchild, deep };
    // 親を押すとそのページへ。… を押すと親の親へ。
    await fresh.locator("#page-path .page-path-item", { hasText: "孫" }).click();
    await fresh.waitForTimeout(200);
    const toParent = (await path()).title;
    await go("曾孫");
    await fresh.locator("#page-path .page-path-item", { hasText: "…" }).click();
    await fresh.waitForTimeout(200);
    const toGrand = (await path()).title;
    result.crumbShowsAncestorsAndNavigates = toParent === "孫" && toGrand === "子";
    // 題名を書き換えると、場所の行の自分の名前も変わる。
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(150);
    result.pagePathFollowsTitleEdit = (await path()).current === "子X";
    await fresh.keyboard.press("Backspace");
    // 題名から上は灰色(題名の行に影で塗る)。
    result.titleBandIsGray = await fresh.evaluate(() => {
      const style = getComputedStyle(document.querySelector(".title-row"));
      return style.backgroundColor === "rgb(241, 242, 244)" && style.boxShadow.includes("rgb(241, 242, 244)");
    });
    // 保存HTML: 上のバーの右に同じ規則で出る。押せば移れる。題名の上の親のページ名は無い。
    const view = await context.newPage();
    try {
      await view.setViewportSize({ width: 1280, height: 800 });
      await view.goto("file:///" + file.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      const saved = () => view.evaluate(() => {
        const nav = document.querySelector("#doc-page-path");
        return {
          text: nav.innerText.replace(/\s+/g, " ").trim(),
          links: [...nav.querySelectorAll("a")].map((a) => a.textContent + "@" + a.getAttribute("href") + "[" + a.title + "]"),
          inBar: Boolean(nav.closest("#doc-page-bar")),
          // エディタと同じく、☰ ← → の行の下の1行(ユーザー指示「HTMLで表示を変えないで」)。
          ownRow: document.querySelector("#doc-page-back").getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1,
          title: document.querySelector("section.doc-page.is-current h1")?.textContent,
          oldCrumb: document.querySelectorAll(".doc-crumb").length,
        };
      });
      const savedRoot = await saved();
      await view.locator("#doc-page-tree .doc-page-tree-item", { hasText: "曾孫" }).click();
      await view.waitForTimeout(200);
      const savedDeep = await saved();
      await view.locator("#doc-page-path a", { hasText: "…" }).click();
      await view.waitForTimeout(200);
      const savedAfter = await saved();
      result.savedCrumbLinksToAncestors = savedRoot.inBar && savedRoot.ownRow && savedDeep.ownRow && savedRoot.text === "根" && savedRoot.oldCrumb === 0
        && savedDeep.text === "… › 孫 › 曾孫"
        && JSON.stringify(savedDeep.links) === JSON.stringify(["…@#page-CR2[根 › 子]", "孫@#page-CR3[孫]"])
        && savedAfter.title === "子" && savedAfter.text === "根 › 子";
      result.savedPagePathEvidence = { savedRoot, savedDeep, savedAfter };
      result.savedTitleBandIsGray = await view.evaluate(() => getComputedStyle(document.querySelector("section.doc-page.is-current h1")).backgroundColor === "rgb(241, 242, 244)");
    } finally {
      await view.close();
    }

    // 長い題名でも、場所の行からはみ出さず「…」で詰まる(v224。縮む割合が 親 1 : 自分 .25 だと、合計が1未満で
    // はみ出した分の一部しか縮まず、長い題名が行の右端から切れていた)。エディタと保存HTMLの両方。
    const longTitle = "とても長いページの題名".repeat(12);
    const longLiteral = { pages: [
      { id: "LP1", title: "根", blocks: [{ id: "l1", type: "page", pageId: "LP2" }] },
      { id: "LP2", title: longTitle, blocks: [{ id: "l2", type: "page", pageId: "LP3" }] },
      { id: "LP3", title: "孫" + longTitle, blocks: [{ id: "l3", type: "paragraph", text: "本文" }] },
    ], fonts: [], attachments: [] };
    const overflowOf = (page, selector) => page.evaluate((sel) => {
      const nav = document.querySelector(sel);
      const box = nav.getBoundingClientRect();
      return Math.max(0, Math.round(Math.max(...[...nav.children].map((item) => item.getBoundingClientRect().right)) - box.right));
    }, selector);
    const longFile = join(OUT, "page-path-long.html");
    await writeFile(longFile, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), longLiteral), "utf8");
    const longChooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await longChooser).setFiles(longFile);
    await fresh.waitForTimeout(500);
    await fresh.locator("#page-tree-body .page-tree-item").nth(1).click();
    await fresh.waitForTimeout(200);
    const editorChild = await overflowOf(fresh, "#page-path");
    await fresh.locator("#page-tree-body .page-tree-item").nth(2).click();
    await fresh.waitForTimeout(200);
    const editorGrandchild = await overflowOf(fresh, "#page-path");
    result.pagePathLongTitleStaysInRow = editorChild === 0 && editorGrandchild === 0;
    const longView = await context.newPage();
    try {
      await longView.setViewportSize({ width: 1280, height: 800 });
      await longView.goto("file:///" + longFile.replaceAll("\\", "/"));
      await longView.waitForTimeout(300);
      await longView.locator("#doc-page-tree .doc-page-tree-item").nth(1).click();
      await longView.waitForTimeout(200);
      const savedChild = await overflowOf(longView, "#doc-page-path");
      await longView.locator("#doc-page-tree .doc-page-tree-item").nth(2).click();
      await longView.waitForTimeout(200);
      const savedGrandchild = await overflowOf(longView, "#doc-page-path");
      result.savedPagePathLongTitleStaysInRow = savedChild === 0 && savedGrandchild === 0;
      result.pagePathOverflowEvidence = { editorChild, editorGrandchild, savedChild, savedGrandchild };
    } finally {
      await longView.close();
    }
    return result;
  } finally {
    await fresh.close();
  }
}
