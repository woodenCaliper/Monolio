// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- 下線(Issue #172。保存形式 0.8.17) ----
// Notion との差の調査で、文の書式に下線が無かった(書式バーにも Ctrl+U にも無く、Notion などから貼った下線は落ちた)。
// 書式バーの U・Ctrl+U で付け外しでき、保存して開き直しても残り、貼り付けた下線も残る。リンクの見た目の下線は下線として扱わない。
// 画面(メモリ上)の本文と、保存したファイルの両方で確かめる。
export default async function underlineSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error)));
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const saveAndParse = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, name);
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return { html, path, parsed: await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html) };
  };
  // ブロックの文字の start〜end を選ぶ
  const selectText = (id, start, end) => fresh.evaluate(({ id: blockId, start: from, end: to }) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    editable.focus();
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    const point = (offset) => {
      let left = offset;
      while (walker.nextNode()) {
        if (left <= walker.currentNode.nodeValue.length) return [walker.currentNode, left];
        left -= walker.currentNode.nodeValue.length;
      }
      return [editable, editable.childNodes.length];
    };
    const range = document.createRange();
    range.setStart(...point(from));
    walker.currentNode = editable;
    range.setEnd(...point(to));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, { id, start, end });
  const innerOf = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block-content[data-id="' + blockId + '"]').innerHTML, id);
  const buttonActive = () => fresh.evaluate(() => document.querySelector("#format-underline").classList.contains("active"));
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await openLiteral({ pages: [{ id: "P", title: "下線", blocks: [
      { id: "u1", type: "paragraph", text: "ここに下線を引く" },
      { id: "u2", type: "paragraph", text: "キーで下線" },
      { id: "u3", type: "paragraph", text: "リンクの文字", html: '<a href="https://example.com/">リンクの文字</a>' },
      { id: "u4", type: "paragraph", text: "選んだブロック" },
      { id: "u5", type: "paragraph", text: "" },
      { id: "t1", type: "table", rows: [[{ text: "a" }, { text: "b" }]] },
    ] }], fonts: [], attachments: [] }, "underline.html");

    // 1) 書式バーの U で付く(画面の本文に <u>)。ボタンが点き、もう一度押すと外れる
    await selectText("u1", 3, 5);
    await fresh.locator("#format-underline").click();
    await fresh.waitForTimeout(150);
    const afterOn = await innerOf("u1");
    await selectText("u1", 3, 5);
    await fresh.waitForTimeout(100);
    const activeOn = await buttonActive();
    await fresh.locator("#format-underline").click();
    await fresh.waitForTimeout(150);
    const afterOff = await innerOf("u1");
    result.underlineButtonToggles = afterOn === "ここに<u>下線</u>を引く" && activeOn && !/<u>/.test(afterOff) && afterOff.includes("下線");
    result.underlineButtonEvidence = JSON.stringify({ afterOn, afterOff, activeOn });
    // 2) Ctrl+Z 1回で付ける前に戻る(付けて → 戻す)
    await selectText("u1", 3, 5);
    await fresh.locator("#format-underline").click();
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    result.underlineUndoOneStep = !/<u>/.test(await innerOf("u1"));
    await selectText("u1", 3, 5);
    await fresh.locator("#format-underline").click();
    await fresh.waitForTimeout(150);
    // 3) 本文を編集中の Ctrl+U でも付く
    await selectText("u2", 0, 2);
    await fresh.keyboard.press("Control+u");
    await fresh.waitForTimeout(150);
    result.underlineCtrlU = (await innerOf("u2")) === "<u>キー</u>で下線";
    // 4) リンクの見た目の下線では、ボタンは点かない
    await selectText("u3", 1, 3);
    await fresh.waitForTimeout(100);
    result.underlineLinkNotActive = !(await buttonActive());
    // 5) ブロックを選んで Ctrl+U で、ブロックの文字全部に付く
    await fresh.locator('#blocks .block[data-id="u4"] .drag-grip').click();
    await fresh.keyboard.press("Escape").catch(() => {});
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+u");
    await fresh.waitForTimeout(200);
    result.underlineSelectedBlockCtrlU = (await innerOf("u4")) === "<u>選んだブロック</u>";
    result.underlineSelectedBlockEvidence = await innerOf("u4");
    // 6) 表のセルの編集中は、U のボタンは押せない(セルは書式を持たない)
    await fresh.locator('#blocks .block[data-id="t1"] td').first().click();
    await fresh.waitForTimeout(150);
    result.underlineDisabledInCell = await fresh.evaluate(() => document.querySelector("#format-underline").disabled);
    // 7) 外から貼った下線(<u> と text-decoration:underline)は残り、リンクの下線は下線にならない
    await fresh.locator('#blocks .block-content[data-id="u5"]').click();
    await fresh.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", "外の下線と飾りとリンク");
      transfer.setData("text/html", '<span><u>外の下線</u>と<span style="text-decoration: underline">飾り</span>と<a href="https://example.com/" style="text-decoration: underline">リンク</a></span>');
      document.querySelector('#blocks .block-content[data-id="u5"]').dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.waitForTimeout(200);
    const pasted = await innerOf("u5");
    result.underlinePasteKeeps = /<u>外の下線<\/u>/.test(pasted) && /<u>飾り<\/u>/.test(pasted) && /<a href="https:\/\/example\.com\/">リンク<\/a>/.test(pasted);
    result.underlinePasteEvidence = pasted;
    // 8) 保存すると形式 0.8.17 で <u> が残り、保存HTMLでは下線で見え、開き直しても残る
    const saved = await saveAndParse("underline-saved.html");
    const blocks = saved.parsed.pages[0].blocks;
    const byId = (id) => blocks.find((block) => block.id === id);
    const view = await context.newPage();
    await view.goto("file:///" + saved.path.replace(/\\/g, "/"));
    const savedLook = await view.evaluate(() => {
      const u = document.querySelector("main u");
      return u ? getComputedStyle(u).textDecorationLine : "";
    });
    await view.close();
    result.underlineSavedAndReopened = saved.parsed.formatVersion === FORMAT_VERSION && /<u>下線<\/u>/.test(byId("u1")?.html || "")
      && /<u>キー<\/u>/.test(byId("u2")?.html || "") && /<u>外の下線<\/u>/.test(byId("u5")?.html || "") && savedLook.includes("underline");
    result.underlineSavedEvidence = JSON.stringify({ version: saved.parsed.formatVersion, u1: byId("u1")?.html, look: savedLook });
    // 9) Notion から貼った下線(印 "_")も残る
    await openLiteral({ pages: [{ id: "N", title: "Notion下線", blocks: [{ id: "n1", type: "paragraph", text: "" }] }], fonts: [], attachments: [] }, "underline-notion.html");
    await fresh.locator('#blocks .block-content[data-id="n1"]').click();
    await fresh.evaluate(() => {
      const notion = JSON.stringify({ blocks: [{ blockId: "a1", blockSubtree: { __version__: 3, block: {
        a1: { value: { id: "a1", type: "text", alive: true, properties: { title: [["前と"], ["下線", [["_"]]], ["と後"]] } } },
      } } }] });
      const transfer = new DataTransfer();
      transfer.setData("text/plain", "前と下線と後");
      transfer.setData("text/_notion-blocks-v3-production", notion);
      document.querySelector('#blocks .block-content[data-id="n1"]').dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.waitForTimeout(300);
    result.underlineNotionPaste = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].some((node) => node.innerHTML === "前と<u>下線</u>と後"));
    result.underlineNoPageErrors = pageErrors.length === 0;
    result.underlinePageErrorEvidence = pageErrors.join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
