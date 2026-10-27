// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 目次の幅(v199) ----
// 子の階層が深いと、左の目次の名前が「…」で切れて読めない(240px 固定だった)。
// 目次の右端のつまみをドラッグして幅を変えられるようにし、切れた名前はマウスを乗せると全文が出るようにした。
// エディタと保存HTMLの両方に同じものがある。エディタは幅を localStorage に覚える(既定の幅に戻すと消す)。
const KEY = "pagelith-page-tree-width";

export default async function pageTreeWidthSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  // 深い階層の文書(12段)。名前は長めにして、240px では深いところが切れるようにする。
  const DEPTH = 12;
  const pages = [];
  for (let i = 0; i <= DEPTH; i++) {
    const blocks = [{ id: "t" + i, type: "paragraph", text: "本文 " + i }];
    if (i < DEPTH) blocks.push({ id: "l" + i, type: "page", text: "", pageId: "D" + (i + 1) });
    pages.push({ id: "D" + i, title: i === 0 ? "目次の幅" : "第" + i + "階層のページ(長めの名前)", blocks });
  }
  const literal = { title: "目次の幅", pages, fonts: [], attachments: [] };
  const target = "第8階層のページ(長めの名前)";
  const treeWidth = (page, selector) => page.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().width), selector);
  const isCut = (page, selector, name) => page.evaluate(([sel, text]) => {
    const item = [...document.querySelectorAll(sel)].find((node) => node.textContent === text);
    return item ? item.scrollWidth > item.clientWidth + 1 : null;
  }, [selector, name]);
  const drag = async (page, selector, dx) => {
    const box = await page.locator(selector).boundingBox();
    const x = box.x + box.width / 2;
    const y = 300;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 3 });
    await page.mouse.move(x + dx, y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  };
  const stored = () => fresh.evaluate((key) => localStorage.getItem(key), KEY);
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.evaluate((key) => localStorage.removeItem(key), KEY);
    await fresh.reload();
    await fresh.waitForSelector("#blocks .block-content");
    const html = await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal);
    const path = join(OUT, "tree-width.html");
    await writeFile(path, html, "utf8");
    const openDoc = async () => {
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(path);
      await fresh.waitForFunction(() => document.querySelectorAll("#page-tree-body .page-tree-item").length >= 13, null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(200);
    };
    await openDoc();
    const ITEM = "#page-tree-body .page-tree-item";

    // 1) 既定は 240px。深いページの名前は切れている。
    const before = await treeWidth(fresh, "#page-tree");
    const cutBefore = await isCut(fresh, ITEM, target);
    result.treeWidthStartsAtDefault = before === 240;
    // 2) 右端のつまみを 200px 右へドラッグすると目次が広がり、切れていた名前が読める。本文は右へ寄る。
    const mainLeftBefore = await fresh.evaluate(() => Math.round(document.querySelector(".main").getBoundingClientRect().left));
    await drag(fresh, "#page-tree-resizer", 200);
    const after = await treeWidth(fresh, "#page-tree");
    const mainLeftAfter = await fresh.evaluate(() => Math.round(document.querySelector(".main").getBoundingClientRect().left));
    result.treeDragWidens = Math.abs(after - 440) <= 2 && Math.abs(mainLeftAfter - mainLeftBefore - (after - before)) <= 2;
    result.treeWideningShowsDeepName = cutBefore === true && (await isCut(fresh, ITEM, target)) === false;
    result.treeWidthNoPageScroll = await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    result.treeWidthEvidence = { before, after, mainLeftBefore, mainLeftAfter, cutBefore };
    // 3) 幅は覚えていて、開き直しても同じ。
    result.treeWidthStored = (await stored()) === String(after);
    await fresh.reload();
    await fresh.waitForSelector("#blocks .block-content");
    result.treeWidthRemembered = (await treeWidth(fresh, "#page-tree")) === after;
    await openDoc();
    // 4) ダブルクリックで既定の幅に戻り、覚えた幅も消える。
    await fresh.locator("#page-tree-resizer").dblclick();
    await fresh.waitForTimeout(100);
    result.treeDoubleClickResets = (await treeWidth(fresh, "#page-tree")) === 240 && (await stored()) === null;
    // 5) キーボード(→/←)でも変えられ、読み上げ用の値も追う。
    await fresh.locator("#page-tree-resizer").focus();
    await fresh.keyboard.press("ArrowRight");
    const keyed = await fresh.evaluate(() => ({
      width: Math.round(document.querySelector("#page-tree").getBoundingClientRect().width),
      now: document.querySelector("#page-tree-resizer").getAttribute("aria-valuenow"),
    }));
    result.treeKeyboardResizes = keyed.width === 256 && keyed.now === "256";
    // 6) 狭すぎ・広すぎにはならない(最小 160px、最大は 600px と画面の半分の小さい方)。
    await drag(fresh, "#page-tree-resizer", -600);
    const narrowest = await treeWidth(fresh, "#page-tree");
    await drag(fresh, "#page-tree-resizer", 1200);
    const widest = await treeWidth(fresh, "#page-tree");
    result.treeWidthClamped = narrowest === 160 && widest === 600;
    result.treeWidthClampEvidence = { narrowest, widest };
    await fresh.locator("#page-tree-resizer").dblclick();
    await fresh.waitForTimeout(100);

    // 7) 切れた名前はマウスを乗せると全文が出る。切れていない名前には出さない(うるさいので)。
    await fresh.locator(ITEM, { hasText: target }).first().hover();
    const cutTitle = await fresh.locator(ITEM, { hasText: target }).first().getAttribute("title");
    await fresh.locator(ITEM, { hasText: "目次の幅" }).first().hover();
    const shortTitle = await fresh.locator(ITEM, { hasText: "目次の幅" }).first().getAttribute("title");
    result.treeCutNameShowsTooltip = cutTitle === target;
    result.treeShortNameHasNoTooltip = !shortTitle;
    result.treeTooltipEvidence = { cutTitle, shortTitle };

    // 8) 目次を畳んだとき・狭い画面(目次は重ねて出す)では、つまみを出さない。
    await fresh.locator("#page-tree-toggle").click();
    await fresh.waitForTimeout(100);
    const hiddenWhenCollapsed = await fresh.locator("#page-tree-resizer").isHidden();
    await fresh.locator("#page-tree-toggle").click();
    await fresh.waitForTimeout(100);
    const shownWhenOpen = await fresh.locator("#page-tree-resizer").isVisible();
    await fresh.setViewportSize({ width: 800, height: 800 });
    await fresh.waitForTimeout(100);
    const hiddenWhenNarrow = await fresh.locator("#page-tree-resizer").isHidden();
    await fresh.setViewportSize({ width: 1280, height: 800 });
    result.treeResizerHiddenWhenNotBeside = hiddenWhenCollapsed && shownWhenOpen && hiddenWhenNarrow;

    // ---- 保存HTML(閲覧用)にも同じつまみ ----
    const view = await context.newPage();
    await view.setViewportSize({ width: 1280, height: 800 });
    try {
      await view.goto(pathToFileURL(path).href);
      await view.waitForSelector(".doc-page-tree-resizer");
      const SAVED_ITEM = "#doc-page-tree .doc-page-tree-item";
      const savedBefore = await treeWidth(view, "#doc-page-tree");
      const savedCutBefore = await isCut(view, SAVED_ITEM, target);
      await drag(view, ".doc-page-tree-resizer", 200);
      const savedAfter = await treeWidth(view, "#doc-page-tree");
      result.savedTreeDragWidens = savedBefore === 240 && Math.abs(savedAfter - 440) <= 2
        && savedCutBefore === true && (await isCut(view, SAVED_ITEM, target)) === false;
      result.savedTreeWidthEvidence = { savedBefore, savedAfter, savedCutBefore };
      await view.locator(".doc-page-tree-resizer").dblclick();
      await view.waitForTimeout(100);
      result.savedTreeDoubleClickResets = (await treeWidth(view, "#doc-page-tree")) === 240;
      await view.locator(SAVED_ITEM, { hasText: target }).first().hover();
      const savedCutTitle = await view.locator(SAVED_ITEM, { hasText: target }).first().getAttribute("title");
      await view.locator(SAVED_ITEM, { hasText: "目次の幅" }).first().hover();
      const savedShortTitle = await view.locator(SAVED_ITEM, { hasText: "目次の幅" }).first().getAttribute("title");
      result.savedTreeCutNameShowsTooltip = savedCutTitle === target && !savedShortTitle;
      result.savedTreeTooltipEvidence = { savedCutTitle, savedShortTitle };
      // 印刷には出さない。
      await view.emulateMedia({ media: "print" });
      result.savedTreeResizerNotPrinted = await view.locator(".doc-page-tree-resizer").isHidden();
    } finally {
      await view.close();
    }
  } finally {
    // 後のスイートが既定の幅で始まるように、覚えた幅を消しておく。
    await fresh.evaluate((key) => localStorage.removeItem(key), KEY).catch(() => {});
    await fresh.close();
  }
  return result;
}
