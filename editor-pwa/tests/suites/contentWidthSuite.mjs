// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT, openMenu } from "../lib.mjs";

// ---- 本文の幅(v260) ----
// ユーザー指示「画面いっぱいまで表示したほうが、情報量が多くて好ましい」「選べる・調整できるように」「基本は見えないところに置いておきたい」。
// 表示 → 本文の幅… の小さな窓のスライダーで変える(標準 920px。600px〜画面いっぱい)。幅はこの画面の好み(ユーザー決定 X)で、
// localStorage に覚える。保存した HTML の見え方は変わらない。
export default async function contentWidthSuite({ browser }) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1000 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const docWidth = () => fresh.evaluate(() => Math.round(document.querySelector(".doc").getBoundingClientRect().width));
  const mainWidth = () => fresh.evaluate(() => Math.round(document.querySelector(".main").clientWidth));
  const stored = () => fresh.evaluate(() => localStorage.getItem("pagelith-content-width"));
  const popoverShown = () => fresh.evaluate(() => !document.querySelector("#content-width-popover").hidden);
  const openPopover = async () => {
    await openMenu(fresh, "view");
    await fresh.locator("#menu-content-width").click();
    await fresh.waitForTimeout(150);
  };
  const slide = (value) => fresh.evaluate((v) => {
    const range = document.querySelector("#content-width-range");
    range.value = String(v);
    range.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await fresh.evaluate(() => localStorage.removeItem("pagelith-content-width"));
    await fresh.reload();
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 既定は 920px(ふだんの画面には何も増えない: 窓は閉じている)。
    const initial = { width: await docWidth(), stored: await stored(), shown: await popoverShown() };

    // 2) 表示 → 本文の幅… で窓が出て、スライダーで幅が変わる。覚える。
    await openPopover();
    const opened = { shown: await popoverShown(), label: await fresh.locator("#content-width-value").textContent() };
    await slide(1400);
    await fresh.waitForTimeout(100);
    const slid = { width: await docWidth(), stored: await stored(), label: await fresh.locator("#content-width-value").textContent() };
    // Esc で閉じる。
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(100);
    const closedByEsc = !(await popoverShown());

    // 3) 開き直しても覚えている。
    await fresh.reload();
    await fresh.waitForSelector("#blocks .block-content");
    await fresh.waitForTimeout(200);
    const reloaded = { width: await docWidth(), stored: await stored() };

    // 4) 画面いっぱい・外のクリックで閉じる・標準に戻す。
    await openPopover();
    await fresh.locator("#content-width-full").click();
    await fresh.waitForTimeout(100);
    const full = { width: await docWidth(), main: await mainWidth(), stored: await stored(), label: await fresh.locator("#content-width-value").textContent() };
    await fresh.mouse.click(5, 900);
    await fresh.waitForTimeout(100);
    const closedByClick = !(await popoverShown());
    await openPopover();
    await fresh.locator("#content-width-default").click();
    await fresh.waitForTimeout(100);
    const reset = { width: await docWidth(), stored: await stored() };

    // 5) 保存した HTML には入らない(幅を変えてから保存しても、文書の中身・保存HTMLの CSS は同じ)。
    await slide(1600);
    await fresh.keyboard.press("Escape");
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "content-width-saved.html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    const savedClean = !html.includes("doc-max-width") && !html.includes("1600");
    await openPopover();
    await fresh.locator("#content-width-default").click();

    result.contentWidthDefaultIs920 = initial.width === 920 && initial.stored === null && !initial.shown && opened.shown && /920px/.test(opened.label);
    result.contentWidthSliderChangesAndRemembers = slid.width === 1400 && slid.stored === "1400" && /1400px/.test(slid.label)
      && reloaded.width === 1400 && reloaded.stored === "1400";
    result.contentWidthFullAndReset = Math.abs(full.width - full.main) <= 2 && full.stored === "full" && full.label === "画面いっぱい"
      && reset.width === 920 && reset.stored === null;
    result.contentWidthPopoverCloses = closedByEsc && closedByClick;
    result.contentWidthNotSaved = savedClean;
    result.contentWidthEvidence = JSON.stringify({ initial, opened, slid, reloaded, full, reset, closedByEsc, closedByClick, savedClean });
    result.contentWidthNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.contentWidthPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
