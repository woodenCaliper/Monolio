// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- 文中のページへのリンク(Issue #174。保存形式 0.8.18)。候補の並べ方(fmt.rankByQuery)も ----
// Notion との差の調査で、ユーザーが「最低限欲しい」とした1つ。「@」に続けて打つとページの一覧が出て、選ぶと文中にページへのリンク
// (参照の印 span.figure-ref。data-ref はページの id)が入る。ページの題名を写し、題名を変えるとついてくる。押すとそのページへ移る。
// 画面(メモリ上)と、保存したファイルの両方で確かめる。
export default async function pageMentionSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error)));
  const literal = { pages: [
    { id: "P1", title: "設計書", blocks: [
      { id: "a1", type: "paragraph", text: "" },
      { id: "a2", type: "paragraph", text: "前後" },
      { id: "a3", type: "paragraph", text: "" },
      { id: "l2", type: "page", pageId: "P2", text: "" },
      { id: "l3", type: "page", pageId: "P3", text: "" },
      { id: "l4", type: "page", pageId: "P4", text: "" },
    ] },
    { id: "P2", title: "試験の記録", blocks: [{ id: "b1", type: "paragraph", text: "試験の本文" }] },
    { id: "P3", title: "議事録", blocks: [{ id: "c1", type: "paragraph", text: "議事録の本文" }] },
    { id: "P4", title: "記録の書き方", blocks: [{ id: "d1", type: "paragraph", text: "書き方" }] },
  ], fonts: [], attachments: [] };
  const path = join(OUT, "page-mention.html");
  const menuState = () => fresh.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    return { open: !menu.hidden, items: [...menu.querySelectorAll(".menu-item .menu-title")].map((node) => node.textContent), empty: menu.querySelector(".menu-empty")?.textContent || "" };
  });
  const innerOf = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block-content[data-id="' + blockId + '"]')?.innerHTML || "", id);
  const textOf = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block-content[data-id="' + blockId + '"]')?.textContent || "", id);
  const caretAtEnd = (id) => fresh.evaluate((blockId) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, id);
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "設計書", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);

    // 1) 「@」で一覧(全部のページ)、続けて打つと絞られる。Enter でページの印が入り、「@…」は消える
    await caretAtEnd("a1");
    await fresh.keyboard.type("結果は@");
    await fresh.waitForTimeout(150);
    const allPages = await menuState();
    await fresh.keyboard.type("試");
    await fresh.waitForTimeout(150);
    const filtered = await menuState();
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    const inserted = await fresh.evaluate(() => {
      const chip = document.querySelector('#blocks .block-content[data-id="a1"] .figure-ref');
      return chip ? { ref: chip.dataset.ref, text: chip.textContent, page: chip.classList.contains("is-page"), editable: chip.contentEditable } : null;
    });
    result.mentionMenuListsPages = allPages.open && JSON.stringify(allPages.items) === JSON.stringify(["設計書", "試験の記録", "議事録", "記録の書き方"]);
    result.mentionMenuFilters = filtered.open && JSON.stringify(filtered.items) === JSON.stringify(["試験の記録"]);
    result.mentionInsertsPageChip = inserted?.ref === "P2" && inserted.text === "試験の記録" && inserted.page && (await textOf("a1")) === "結果は試験の記録";
    result.mentionEvidence = JSON.stringify({ allPages, filtered, inserted, text: await textOf("a1") });
    // 2) 続けて打った字は印の後ろに入る
    await fresh.keyboard.type("を見る");
    await fresh.waitForTimeout(150);
    result.mentionTypingContinuesAfterChip = (await textOf("a1")) === "結果は試験の記録を見る";
    // 3) Ctrl+Z で印を入れる前(「を見る」を打つ前)へ戻せる(印を入れるのは1手)
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const afterUndo1 = await textOf("a1");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const afterUndo2 = await textOf("a1");
    result.mentionUndo = afterUndo1 === "結果は試験の記録" && afterUndo2 === "結果は@試";
    result.mentionUndoEvidence = JSON.stringify({ afterUndo1, afterUndo2 });
    await fresh.keyboard.press("Control+Shift+z");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+Shift+z");
    await fresh.waitForTimeout(200);
    // 4) 文の途中でも入る(キャレットの所)。全角の「＠」でも出る
    await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="a2"]');
      editable.focus();
      const range = document.createRange();
      range.setStart(editable.firstChild, 1);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await fresh.keyboard.type("＠議");
    await fresh.waitForTimeout(150);
    const fullWidth = await menuState();
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    result.mentionMidTextAndFullWidth = fullWidth.open && JSON.stringify(fullWidth.items) === JSON.stringify(["議事録"])
      && (await textOf("a2")) === "前議事録後" && /data-ref="P3"/.test(await innerOf("a2"));
    // 4b) 並べ方(ユーザー指示「打った語で始まる題名を先に」): 全部一致 → 始まる → 含む → 文字を全部含む(並びは違う)。同じ順位は文書の順
    await caretAtEnd("a3");
    await fresh.keyboard.type("@記録");
    await fresh.waitForTimeout(150);
    const startsFirst = await menuState();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.type(" @録記");
    await fresh.waitForTimeout(150);
    const anyOrder = await menuState();
    await fresh.keyboard.press("Escape");
    await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="a3"]');
      editable.textContent = "";
      editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    const unit = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const names = ["基板の試験", "試験", "試験の記録", "記録試験", "ほか"];
      return {
        order: fmt.rankByQuery(names, "試験", (name) => name),
        loose: fmt.rankByQuery(names, "験試", (name) => name),
        width: fmt.rankByQuery(["ＴＥＳＴ ｐｌａｎ", "a test"], "test", (name) => name),
      };
    });
    result.mentionRanksStartsFirst = JSON.stringify(startsFirst.items) === JSON.stringify(["記録の書き方", "試験の記録"])
      && JSON.stringify(anyOrder.items) === JSON.stringify(["試験の記録", "記録の書き方"])
      && JSON.stringify(unit.order) === JSON.stringify(["試験", "試験の記録", "基板の試験", "記録試験"])
      && JSON.stringify(unit.loose) === JSON.stringify(["基板の試験", "試験", "試験の記録", "記録試験"])
      && JSON.stringify(unit.width) === JSON.stringify(["ＴＥＳＴ ｐｌａｎ", "a test"]);
    result.mentionRankEvidence = JSON.stringify({ startsFirst: startsFirst.items, anyOrder: anyOrder.items, unit });

    // 5) メールアドレス(英数字のすぐ後の「@」)では出ない。合うページが無いと出ず、Enter はふつうに改行(ブロックを分ける)
    await caretAtEnd("a3");
    await fresh.keyboard.type("mail a@b");
    await fresh.waitForTimeout(150);
    const email = await menuState();
    await fresh.keyboard.type(" @zzz");
    await fresh.waitForTimeout(150);
    const noHit = await menuState();
    const blocksBefore = await fresh.evaluate(() => document.querySelectorAll("#blocks .block").length);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    const blocksAfter = await fresh.evaluate(() => document.querySelectorAll("#blocks .block").length);
    result.mentionNotForEmailOrNoHit = !email.open && !noHit.open && blocksAfter === blocksBefore + 1;
    result.mentionNoHitEvidence = JSON.stringify({ email, noHit, blocksBefore, blocksAfter });
    // 6) Esc で一覧だけ閉じ、打った文字は残る
    await fresh.keyboard.type("@議");
    await fresh.waitForTimeout(150);
    const beforeEscape = await menuState();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    const afterEscape = await menuState();
    result.mentionEscapeKeepsText = beforeEscape.open && !afterEscape.open
      && await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].some((node) => node.textContent === "@議"));
    // 7) ページの題名を変えると、印の文字がついてくる(画面とブロックの text の両方)
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "試験の記録" }).first().click();
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "試験の記録", null, { timeout: 5000 }).catch(() => {});
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("2");
    await fresh.waitForTimeout(200);
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "設計書" }).first().click();
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "設計書", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(200);
    const renamed = await textOf("a1");
    result.mentionFollowsRename = renamed === "結果は試験の記録2を見る";
    result.mentionRenameEvidence = renamed;
    // 8) 印を押すとそのページへ移る
    await fresh.locator('#blocks .block-content[data-id="a1"] .figure-ref').click();
    await fresh.waitForTimeout(300);
    result.mentionClickOpensPage = await fresh.evaluate(() => document.querySelector("#doc-title")?.textContent === "試験の記録2");
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "設計書" }).first().click();
    await fresh.waitForTimeout(300);
    // 9) 保存すると形式 0.8.18 で、保存HTMLではページへのリンク(ページの印つき)。開き直しても印が残る
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "page-mention-saved.html");
    await (await download).saveAs(savedPath);
    const saved = await readFile(savedPath, "utf8");
    const parsed = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), saved);
    const savedLinks = await fresh.evaluate((text) => {
      const page = new DOMParser().parseFromString(text, "text/html");
      return [...page.querySelectorAll("main a.figure-ref")].map((link) => ({ href: link.getAttribute("href"), text: link.textContent, page: link.classList.contains("is-page") }));
    }, saved);
    const a1 = parsed.pages[0].blocks.find((block) => block.id === "a1");
    result.mentionSavedAsLink = parsed.formatVersion === FORMAT_VERSION && /data-ref="P2"/.test(a1?.html || "")
      && savedLinks.some((link) => link.text === "試験の記録2" && link.page && /^#/.test(link.href || ""));
    result.mentionSavedEvidence = JSON.stringify({ version: parsed.formatVersion, savedLinks });
    // 保存HTMLで押すと、そのページへ移る
    const view = await context.newPage();
    await view.goto("file:///" + savedPath.replace(/\\/g, "/"));
    await view.locator("main a.figure-ref.is-page", { hasText: "試験の記録2" }).first().click();
    await view.waitForTimeout(300);
    result.mentionSavedLinkOpensPage = await view.evaluate(() => {
      const shown = [...document.querySelectorAll("section.doc-page")].find((section) => !section.hidden && getComputedStyle(section).display !== "none");
      return Boolean(shown?.textContent.includes("試験の本文"));
    });
    await view.close();
    // 10) ページを消すと、印は「参照先なし」になる(文字は残る。押しても何も起きない)
    await fresh.evaluate(() => window.__docEditorPages.deletePage("P2"));
    await fresh.waitForTimeout(300);
    result.mentionDeletedPageIsMissing = await fresh.evaluate(() => {
      const chip = document.querySelector('#blocks .block-content[data-id="a1"] .figure-ref');
      return Boolean(chip?.classList.contains("is-missing")) && chip.textContent === "参照先なし";
    });
    result.mentionNoPageErrors = pageErrors.length === 0;
    result.mentionPageErrorEvidence = pageErrors.join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
