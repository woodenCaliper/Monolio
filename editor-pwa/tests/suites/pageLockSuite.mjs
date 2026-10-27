// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- ページのロック(v178。Issue #6) ----
// ロックしたページは、ロックを外すまで編集できない。読む・選んでコピー・検索・トグルの開閉・移動・保存はできる。
// 入り口(キー・貼り付け・道具・メニュー・置換・Undo・削除)で止め、何かの経路で変わっても元の中身へ戻す(安全網)。
export default async function pageLockSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    // 2ページの文書を開く(子ページのメニュー・置換を確かめるため)
    const html = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      pages: [
        { id: "L1", title: "Lock Root", blocks: [
          { id: "l1", type: "paragraph", text: "LOCK body text" },
          { id: "l2", type: "toggle", text: "LOCK toggle", open: true },
          { id: "l3", type: "paragraph", text: "LOCK inside toggle", indent: 1 },
          { id: "l4", type: "todo", text: "LOCK todo", checked: false },
          { id: "l5", type: "page", text: "", pageId: "L2" },
        ] },
        { id: "L2", title: "Lock Child", blocks: [{ id: "c1", type: "paragraph", text: "CHILD body text" }] },
      ],
      fonts: [],
      attachments: [],
    }));
    const path = join(OUT, "page-lock.html");
    await writeFile(path, html, "utf8");
    const openDoc = async (file) => {
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(file);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Lock Root", null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(300);
    };
    await openDoc(path);
    const pageText = () => fresh.evaluate(() => ({
      title: document.querySelector("#doc-title").textContent,
      blocks: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent).join("|"),
      count: document.querySelectorAll("#blocks .block").length,
    }));
    const lockState = () => fresh.evaluate(() => ({
      pressed: document.querySelector("#page-lock-toggle")?.getAttribute("aria-pressed"),
      bodyLocked: document.body.classList.contains("page-locked"),
      titleEditable: document.querySelector("#doc-title").isContentEditable,
      anyEditable: [...document.querySelectorAll("#blocks [contenteditable]")].some((node) => node.isContentEditable),
      handleShown: [...document.querySelectorAll("#blocks .handle")].some((node) => getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden"),
      treeLock: Boolean(document.querySelector('#page-tree-body .page-tree-item.is-current .page-tree-lock')),
      noticeShown: !document.querySelector("#notice").hidden,
      toolsDisabled: ["format-bold", "format-italic", "format-strike", "format-font", "format-size", "format-math", "format-reset", "format-color-trigger", "attach-files-toolbar"]
        .every((id) => document.getElementById(id)?.disabled),
      todoDisabled: Boolean(document.querySelector("#blocks .todo-box")?.disabled),
    }));

    // 編集しておいてからロックする(Undo の確認用)
    await fresh.locator("#blocks .block-content", { hasText: "LOCK body text" }).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" edited");
    await fresh.waitForTimeout(150);

    // ロックしても、本文の幅や位置(見た目の並び)は変わらない(つまみの列を消すと本文が細く詰まっていた)
    const layout = () => fresh.evaluate(() => {
      const target = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes("LOCK body text"));
      const rect = target.getBoundingClientRect();
      const item = document.querySelector("#page-tree-body .page-tree-item.is-current");
      return { left: Math.round(rect.left), width: Math.round(rect.width), treeItemHeight: Math.round(item.getBoundingClientRect().height) };
    });
    const layoutBefore = await layout();
    // 1) 鍵のボタンでロックする
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(150);
    const locked = await lockState();
    result.lockButtonLocksPage = locked.pressed === "true" && locked.bodyLocked && !locked.titleEditable && !locked.anyEditable
      && !locked.handleShown && locked.treeLock;
    result.lockedPageDisablesTools = locked.toolsDisabled && locked.todoDisabled;
    result.lockKeepsLayout = JSON.stringify(await layout()) === JSON.stringify(layoutBefore);
    const before = await pageText();

    // 2) 本文と題名へのキー入力・Enter・Backspace・Delete・Tab・書式のキーは効かない
    await fresh.locator("#blocks .block-content", { hasText: "LOCK body text" }).click();
    for (const key of ["x", "Enter", "Backspace", "Delete", "Tab", "Control+b", "Control+x"]) await fresh.keyboard.press(key);
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.type("T");
    await fresh.waitForTimeout(150);
    result.lockedPageIgnoresTyping = JSON.stringify(await pageText()) === JSON.stringify(before);
    result.lockedPageShowsNotice = (await lockState()).noticeShown;
    // 3) 貼り付けも効かない
    await fresh.evaluate(() => {
      const target = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes("LOCK body text"));
      const data = new DataTransfer();
      data.setData("text/plain", "PASTED");
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await fresh.waitForTimeout(150);
    result.lockedPageIgnoresPaste = JSON.stringify(await pageText()) === JSON.stringify(before);
    // 4) Undo で、ロックしたページの中身は戻らない(ロックの前の編集も)
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(150);
    result.undoKeepsLockedPage = (await pageText()).blocks.includes("LOCK body text edited") && (await lockState()).pressed === "true";
    // 5) 選んでコピーはできる
    result.lockedPageAllowsSelection = await fresh.evaluate(() => {
      const target = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes("LOCK body text"));
      const range = document.createRange();
      range.selectNodeContents(target);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      let copied = "";
      const onCopy = (event) => { copied = getSelection().toString(); };
      document.addEventListener("copy", onCopy, { once: true });
      document.execCommand("copy");
      return copied.includes("LOCK body text");
    });
    // 6) トグルの開閉はできる
    await fresh.locator("#blocks .block", { hasText: "LOCK toggle" }).locator(".toggle-caret").first().click();
    await fresh.waitForTimeout(150);
    result.lockedPageAllowsToggle = !(await pageText()).blocks.includes("LOCK inside toggle");
    await fresh.locator("#blocks .block", { hasText: "LOCK toggle" }).locator(".toggle-caret").first().click();
    await fresh.waitForTimeout(150);
    // 7) 安全網: 何かの経路で編集できてしまっても、元の中身へ戻る
    await fresh.evaluate(() => {
      const target = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes("LOCK body text"));
      target.contentEditable = "true";
      target.focus();
    });
    await fresh.evaluate(() => {
      const target = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes("LOCK body text"));
      target.textContent = "SNEAKED IN";
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
    });
    await fresh.waitForTimeout(250);
    const afterSneak = await pageText();
    result.lockSafetyNetRestoresContent = !afterSneak.blocks.includes("SNEAKED IN") && afterSneak.blocks.includes("LOCK body text edited");

    // 8) 置換は、ロックしたページを書き換えない(ほかのページは置き換わる)
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(150);
    const scope = fresh.locator("#search-scope");
    await scope.selectOption("all");
    await fresh.locator("#search-input").fill("body text");
    await fresh.locator("#search-replace-input").fill("BODY");
    await fresh.waitForTimeout(150);
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Escape");
    const afterReplace = await pageText();
    result.replaceSkipsLockedPage = afterReplace.blocks.includes("LOCK body text edited");

    // 9) 保存するとロックが残り(形式 0.8.2 から。今は 0.8.6)、開き直してもロックのまま
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = await (await download).path();
    const saved = await readFile(savedPath, "utf8");
    const parsedLock = await fresh.evaluate((text) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
      const manifest = JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent);
      return {
        version: manifest.formatVersion,
        root: parsed.pages.find((page) => page.id === "L1")?.locked === true,
        child: parsed.pages.find((page) => page.id === "L2")?.locked === true,
        childReplaced: parsed.pages.find((page) => page.id === "L2")?.blocks.some((block) => block.text === "CHILD BODY"),
        rootKept: parsed.pages.find((page) => page.id === "L1")?.blocks.some((block) => block.text === "LOCK body text edited"),
      };
    }, saved);
    // 0.8.2 でロックが入った。いまの版(0.8.6。0.8.3 の図表の題名・0.8.4 の改ページ・0.8.5 の Mermaid の図・0.8.6 の図表の参照)でもそのまま保存される。
    result.lockIsSavedInFile = parsedLock.version === FORMAT_VERSION && parsedLock.root && !parsedLock.child;
    // ロックしていない子ページは置換される(ロックしたページだけが残る)
    result.replaceSkipsLockedPage = result.replaceSkipsLockedPage && parsedLock.rootKept && parsedLock.childReplaced;
    const savedCopy = join(OUT, "page-lock-saved.html");
    await writeFile(savedCopy, saved, "utf8");
    await openDoc(savedCopy);
    result.lockSurvivesReopen = (await lockState()).pressed === "true" && (await lockState()).bodyLocked;
    // 10) 旧い形式(locked が無い)のファイルはロックなし
    result.oldFileOpensUnlocked = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "O1", title: "Old", blocks: [] }], fonts: [], attachments: [] })
        .replace('"formatVersion":"' + window.SingleHtmlFormat.VERSION + '"', '"formatVersion":"0.8.1"');
      return window.SingleHtmlFormat.parsePortableHtml(html).pages.every((page) => page.locked !== true);
    });

    // 11) 子ページ: 目次のメニューでロックでき、ロック中は削除できない
    const childRow = fresh.locator("#page-tree-body .page-tree-row", { has: fresh.locator(".page-tree-item", { hasText: "Lock Child" }) }).first();
    await childRow.hover();
    await childRow.locator(".page-tree-more").click();
    await fresh.locator('#page-menu [data-action="toggle-page-lock"]').click();
    await fresh.waitForTimeout(150);
    result.pageMenuLocksPage = await fresh.evaluate(() => Boolean([...document.querySelectorAll("#page-tree-body .page-tree-item")]
      .find((node) => node.textContent.includes("Lock Child"))?.querySelector(".page-tree-lock")));
    await childRow.hover();
    await childRow.locator(".page-tree-more").click();
    await fresh.locator('#page-menu [data-action="delete-page"]').click();
    await fresh.waitForTimeout(250);
    result.lockedPageCannotBeDeleted = await fresh.evaluate(() => [...document.querySelectorAll("#page-tree-body .page-tree-item")]
      .some((node) => node.textContent.includes("Lock Child")));

    // 12) ロックを外すと、また編集できる
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#blocks .block-content[data-id="l1"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" again");
    await fresh.waitForTimeout(150);
    const unlocked = await lockState();
    result.unlockAllowsEditing = unlocked.pressed === "false" && !unlocked.bodyLocked && unlocked.titleEditable
      && !unlocked.toolsDisabled && (await pageText()).blocks.includes("LOCK body text edited again");
    return result;
  } finally {
    await fresh.close();
  }
}
