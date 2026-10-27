// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT } from "../lib.mjs";

// ---- 本文のリンク(v200) ----
// ユーザー原文「URL などにリンクを付与する機能はあるか」→「13をやって / 2は、Gmail などのように、リンク付与のようなアイコンを用意して」。
// 1) 自動で付くのは「URL だけを貼り付けたとき」だけ(v202。ユーザー指示「リンクはあくまで付与したときに付くもので、勝手に付いたりしないようにしてほしい」)。
//    打った URL・文の途中の URL・書いてある URL は文字のまま。外したリンクは、描き直しても戻らない。
// 2) 書式ツールバーのリンクのボタンで、選んだ文字にリンクを付ける・外す。
// 3) 行き先は http・https・mailto だけ。エディタでは Ctrl+クリックで開き、保存HTMLは別のタブ(noopener)で開く。
export default async function linkSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  await fresh.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(url); return null; };
  });
  const result = {};
  const blockOf = (needle) => fresh.evaluate((text) => {
    const el = [...document.querySelectorAll("#blocks .block-content")].find((item) => item.textContent.includes(text));
    return el ? { text: el.textContent, links: [...el.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]) } : null;
  }, needle);
  const selectText = (needle, word) => fresh.evaluate(({ needle, word }) => {
    const el = [...document.querySelectorAll("#blocks .block-content")].find((item) => item.textContent.includes(needle));
    el.focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf(word);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + word.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      return true;
    }
    return false;
  }, { needle, word });
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await fresh.locator("#blocks .block-content").nth(1).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");

    // 1) 打った URL は文字のまま(空白や Enter で区切ってもリンクにならない)。
    await fresh.keyboard.type("詳しくは https://example.com/docs. を見る ");
    await fresh.keyboard.press("Enter");
    const typed = await blockOf("詳しくは");
    result.linkTypedUrlStaysText = typed?.text.startsWith("詳しくは https://example.com/docs. を見る") && typed.links.length === 0;

    // URL だけを貼り付けると、その URL がリンクになる。
    await fresh.keyboard.type("貼り付け: ");
    await fresh.evaluate((text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, "https://paste.example/a?b=1");
    await fresh.waitForTimeout(100);
    const pasted = await blockOf("貼り付け:");
    result.linkPastedUrlBecomesLink = pasted?.text === "貼り付け: https://paste.example/a?b=1"
      && JSON.stringify(pasted.links) === JSON.stringify([["https://paste.example/a?b=1", "https://paste.example/a?b=1"]]);
    // 文の中に URL を含む貼り付けは文字のまま(URL だけのときに限る)。
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("混ざった: ");
    await fresh.evaluate((text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, "資料は https://mixed.example/ です\n2行目");
    await fresh.waitForTimeout(100);
    const mixed = await blockOf("混ざった:");
    result.linkMixedPasteStaysText = Boolean(mixed?.text.includes("https://mixed.example/")) && mixed.links.length === 0;

    // 2) 文字を選んでリンクのボタン → 行き先を入れる。javascript: は受けない。「example.com」は https:// を補う。
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("参考資料はこちら");
    await selectText("参考資料", "こちら");
    await fresh.locator("#format-link").click();
    await fresh.waitForTimeout(100);
    await fresh.keyboard.type("javascript:alert(1)");
    await fresh.keyboard.press("Enter");
    const refused = await fresh.evaluate(() => ({
      error: !document.querySelector("#link-error").hidden,
      open: !document.querySelector("#link-popover").hidden,
    }));
    await fresh.locator("#link-url").fill("pagelith.example/manual");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(100);
    const linked = await blockOf("参考資料");
    result.linkButtonRefusesUnsafe = refused.error && refused.open
      && !(await fresh.evaluate(() => document.querySelector('#blocks a[href^="javascript"]')));
    result.linkButtonAddsLink = JSON.stringify(linked?.links) === JSON.stringify([["こちら", "https://pagelith.example/manual"]])
      && linked.text === "参考資料はこちら";

    // Undo で付けたリンクが外れる。Redo で戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(100);
    const undone = await blockOf("参考資料");
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(100);
    const redone = await blockOf("参考資料");
    result.linkUndoRedo = undone?.links.length === 0 && redone?.links.length === 1;

    // 3) エディタ: ふつうのクリックは編集(開かない)、Ctrl+クリックで開く。
    const link = fresh.locator("#blocks .block-content a", { hasText: "こちら" });
    // Ctrl を押している間だけ、リンクの上のカーソルが指の形になる(開けることが分かる)。
    await link.hover();
    const cursorOf = () => link.evaluate((a) => getComputedStyle(a).cursor);
    const cursorBefore = await cursorOf();
    await fresh.keyboard.down("Control");
    const cursorHeld = await cursorOf();
    await fresh.keyboard.up("Control");
    const cursorAfter = await cursorOf();
    result.linkPointerWhileCtrl = cursorHeld === "pointer" && cursorBefore !== "pointer" && cursorAfter !== "pointer";
    await link.click();
    const plainClick = await fresh.evaluate(() => window.__opened.length);
    await link.click({ modifiers: ["Control"] });
    const opened = await fresh.evaluate(() => window.__opened.slice());
    result.linkCtrlClickOpens = plainClick === 0 && JSON.stringify(opened) === JSON.stringify(["https://pagelith.example/manual"]);

    // キャレットがリンクの中なら、ボタンから外せる(文字は残る)。
    await selectText("参考資料", "こち");
    await fresh.evaluate(() => getSelection().collapseToEnd());
    await fresh.locator("#format-link").click();
    await fresh.waitForTimeout(100);
    const removeShown = await fresh.evaluate(() => !document.querySelector("#link-remove").hidden
      && document.querySelector("#link-url").value === "https://pagelith.example/manual");
    await fresh.locator("#link-remove").click();
    await fresh.waitForTimeout(100);
    const removed = await blockOf("参考資料");
    result.linkRemoveKeepsText = removeShown && removed?.links.length === 0 && removed.text === "参考資料はこちら";
    // 外したリンクは、改行などで描き直しても戻らない(v200 では表示のたびに URL をリンクにしていて戻っていた。ユーザー指摘)。
    // URL の文字そのものを外した場合も同じ。
    await selectText("貼り付け:", "paste");
    await fresh.evaluate(() => getSelection().collapseToEnd());
    await fresh.locator("#format-link").click();
    await fresh.waitForTimeout(100);
    await fresh.locator("#link-remove").click();
    await fresh.waitForTimeout(100);
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("次の行");
    await fresh.keyboard.press("Enter");
    const urlAfter = await blockOf("貼り付け:");
    const wordAfter = await blockOf("参考資料");
    result.linkRemovedStaysRemoved = urlAfter?.links.length === 0 && urlAfter.text === "貼り付け: https://paste.example/a?b=1"
      && wordAfter?.links.length === 0;

    // 保存HTML: リンクは別のタブ・noopener。書いてある URL は文字のまま(v202)。javascript: はリンクにならない。
    const saved = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "L", title: "Links", blocks: [
        { id: "a", type: "paragraph", text: "plain https://example.org/x と書いた" },
        { id: "b", type: "paragraph", text: "x", html: '<a href="javascript:alert(1)">bad</a> <a href="https://ok.example/">ok</a> <code class="inline-code">https://code.example/</code>' },
        { id: "c", type: "paragraph", text: "mail", html: '<a href="mailto:someone@example.com">mail</a>' },
      ] }], fonts: [], attachments: [] });
      const view = new DOMParser().parseFromString(html, "text/html");
      const links = [...view.querySelectorAll("main a.doc-link")].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]);
      const reopened = window.SingleHtmlFormat.parsePortableHtml(html).pages[0].blocks;
      return {
        links,
        badAnchor: Boolean(view.querySelector('main a[href^="javascript"]')),
        codeLinked: Boolean(view.querySelector("code a")),
        reopenedKeepsLink: String(reopened.find((block) => block.id === "b")?.html || "").includes('href="https://ok.example/"'),
      };
    });
    result.linkSavedOpensNewTab = JSON.stringify(saved.links) === JSON.stringify([
      ["ok", "https://ok.example/", "_blank", "noopener noreferrer"],
      ["mail", "mailto:someone@example.com", "_blank", "noopener noreferrer"],
    ]);
    result.linkSavedIsSafe = !saved.badAnchor && !saved.codeLinked && saved.reopenedKeepsLink;
    return result;
  } finally {
    await fresh.close();
  }
}
