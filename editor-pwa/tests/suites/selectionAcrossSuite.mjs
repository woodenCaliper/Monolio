// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- ページ全体・ブロックをまたぐ選択とリンク(v254。Issue #100。ユーザー決定「a 消せる / b できる / c 推奨で」) ----
// a) Ctrl+A 2回(ページ全体の選択)で Delete・Backspace・Ctrl+X が何もしなかった。Ctrl+C は題名ごと1つの段落になった。
//    いまはマウスでブロックをまたいで選んだときと同じく、ページの全ブロックを選んだ扱い(題名は入れない)。
// b) キーボード(Shift+↓ / Shift+→ / Ctrl+Shift+End)ではブロックをまたいで選べなかった。いまはまたいで伸ばせ、そのまま
//    Backspace・切り取り・貼り付けができる(Google ドキュメントと同じ)。
// c) リンクの途中から外へ伸ばした範囲にリンクを付けると、元のリンクの行き先が変わるだけだった。いまは合わせた全体が1つのリンク。
export default async function selectionAcrossSuite({ browser }) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  let opened = 0;
  const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const openDoc = async (blocks, title = "Select" + (opened + 1)) => {
    const path = join(OUT, "selection-across-" + (opened += 1) + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), { pages: [{ id: "S", title, blocks }], fonts: [], attachments: [] }), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const press = async (key, times = 1) => {
    for (let i = 0; i < times; i += 1) {
      await fresh.keyboard.press(key);
      await fresh.waitForTimeout(100);
    }
  };
  const placeAt = async (id, start, end = null) => {
    await fresh.locator('#blocks .block-content[data-id="' + id + '"]').click();
    await fresh.evaluate(({ id, start, end }) => {
      const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
      editable.focus();
      const find = (offset) => {
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        let total = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (offset <= total + node.nodeValue.length) return [node, offset - total];
          total += node.nodeValue.length;
        }
        return [editable, editable.childNodes.length];
      };
      const range = document.createRange();
      range.setStart(...find(start));
      if (end === null) range.collapse(true);
      else range.setEnd(...find(end));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, { id, start, end });
    await fresh.waitForTimeout(60);
  };
  const texts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content[data-id]")].map((node) => node.textContent).join("|"));
  const title = () => fresh.locator("#doc-title").textContent();
  const selectPage = async (id) => {
    await placeAt(id, 1);
    await press("Control+a", 2);
    await fresh.waitForTimeout(100);
    return fresh.evaluate(() => window.__lastSelectAllMode);
  };
  const base = () => [P("a", "alpha"), P("b", "bravo"), P("c", "charlie")];
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // ---- a) ページ全体の選択 ----
    const pageResults = {};
    for (const key of ["Delete", "Backspace"]) {
      await openDoc(base(), "Page " + key);
      const mode = await selectPage("b");
      await press(key);
      const after = { texts: await texts(), title: await title() };
      await press("Control+z");
      await fresh.waitForTimeout(150);
      pageResults[key] = { mode, after, undone: await texts() };
    }
    await openDoc(base(), "Page cut");
    await selectPage("b");
    await press("Control+x");
    const afterCut = { texts: await texts(), title: await title() };
    // 消したあとに残った空の段落へ貼り戻す(空の段落は貼ったブロックに置き換わる)。
    const firstId = await fresh.evaluate(() => document.querySelector("#blocks .block-content[data-id]")?.dataset.id);
    await placeAt(firstId, 0);
    await press("Control+v");
    await fresh.waitForTimeout(200);
    const afterCutPaste = await texts();
    await openDoc(base(), "Page copy");
    await selectPage("b");
    await press("Control+c");
    await placeAt("c", 7);
    await press("Control+v");
    await fresh.waitForTimeout(200);
    const afterCopyPaste = await texts();
    result.pageSelectDeleteRemovesAllBlocks = ["Delete", "Backspace"].every((key) => pageResults[key].mode === "page"
      && pageResults[key].after.texts === "" && pageResults[key].after.title === "Page " + key && pageResults[key].undone === "alpha|bravo|charlie");
    result.pageSelectCutAndCopyAreBlocks = afterCut.texts === "" && afterCut.title === "Page cut" && afterCutPaste.split("|").includes("charlie")
      && afterCutPaste.replace(/^\|/, "").startsWith("alpha|bravo|charlie")
      && afterCopyPaste === "alpha|bravo|charlie|alpha|bravo|charlie";
    result.pageSelectEvidence = JSON.stringify({ pageResults, afterCut, afterCutPaste, afterCopyPaste });

    // ---- b) キーボードでブロックをまたいで選ぶ ----
    const across = {};
    // Shift+↓ でまたいで、Backspace で消して繋ぐ。
    await openDoc(base(), "Shift down");
    await placeAt("a", 2);
    await press("Shift+ArrowDown");
    across.downSelected = await fresh.evaluate(() => getSelection().toString());
    await press("Backspace");
    across.downDeleted = await texts();
    await press("Control+z");
    await fresh.waitForTimeout(150);
    across.downUndone = await texts();
    // Shift+→ を末尾から押すと次のブロックへ伸びる。
    await placeAt("a", 5);
    const probe = () => fresh.evaluate(() => { const s = getSelection(); return { text: s.toString(), anchor: (s.anchorNode?.parentElement?.closest?.("[data-id]")?.dataset.id || s.anchorNode?.nodeName) + "@" + s.anchorOffset, focus: (s.focusNode?.parentElement?.closest?.("[data-id]")?.dataset.id || s.focusNode?.nodeName) + "@" + s.focusOffset, host: document.querySelector("#blocks").getAttribute("contenteditable"), active: document.activeElement?.id || document.activeElement?.className }; });
    across.rightBefore = await probe();
    await fresh.keyboard.down("Shift");
    await fresh.keyboard.press("ArrowRight");
    across.rightOne = await probe();
    await fresh.keyboard.press("ArrowRight");
    across.rightTwo = await probe();
    await fresh.keyboard.up("Shift");
    across.rightSelected = await fresh.evaluate(() => getSelection().toString());
    await placeAt("a", 5);
    await fresh.keyboard.press("Shift+ArrowRight");
    await fresh.waitForTimeout(100);
    across.sepOne = await probe();
    // Shift を離して、もう一度 Shift+→(Shift だけを押したときに選択を解かない)。
    await fresh.keyboard.press("Shift+ArrowRight");
    await fresh.waitForTimeout(100);
    across.sepTwo = await probe();
    // Ctrl+Shift+End で文書の終わりまで。Delete で消す。
    await placeAt("a", 2);
    await press("Control+Shift+End");
    across.endSelected = await fresh.evaluate(() => getSelection().toString());
    await press("Delete");
    across.endDeleted = await texts();
    await press("Control+z");
    await fresh.waitForTimeout(150);
    // 1つのブロックの中だけで伸ばしたら、ふつうの編集に戻る(続けて打つと、そのブロックに入る)。
    await placeAt("b", 0);
    await press("Shift+ArrowRight", 2);
    across.withinStatic = await fresh.evaluate(() => document.querySelector("#blocks").getAttribute("contenteditable"));
    await fresh.keyboard.type("Z");
    await fresh.waitForTimeout(150);
    across.withinTyped = await texts();
    await press("Control+z");
    await fresh.waitForTimeout(150);
    // 切り取りと貼り付け。
    await placeAt("a", 2);
    await press("Shift+ArrowDown");
    await press("Control+x");
    await fresh.waitForTimeout(150);
    across.cutTexts = await texts();
    across.cutClipboard = await fresh.evaluate(() => navigator.clipboard.readText());
    await press("Control+z");
    await fresh.waitForTimeout(150);
    await fresh.evaluate(() => navigator.clipboard.writeText("ZZ"));
    await placeAt("a", 2);
    await press("Shift+ArrowDown");
    await press("Control+v");
    await fresh.waitForTimeout(200);
    across.pasteTexts = await texts();
    // 画面だけでなく、保存する中身(文書のモデル)も同じ形になっていること(既定の貼り付けに任せると、画面だけが書き換わる)。
    {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "selection-across-paste.html");
      await (await download).saveAs(path);
      const saved = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), await readFile(path, "utf8"));
      across.pasteSaved = saved.pages[0].blocks.map((block) => block.text).join("|");
    }
    // Shift+↓ の行き先の列は文字の幅で決まる(1文字ずれることがある)ので、「a の 2 文字目から b の途中まで」で見る。
    const downTail = across.downDeleted.split("|")[0].slice(2);
    result.keyboardSelectionCrossesBlocks = /^pha\s*br?$/.test(across.downSelected.trim()) && across.downDeleted.startsWith("al")
      && "bravo".endsWith(downTail) && downTail.length >= 3 && across.downDeleted.split("|").length === 2
      && across.downUndone === "alpha|bravo|charlie"
      && across.rightSelected.replace(/\s+/g, "") === "b" && across.sepTwo.text.replace(/\s+/g, "") === "b"
      && across.endSelected.replace(/\s+/g, "") === "phabravocharlie" && across.endDeleted === "al";
    result.keyboardSelectionWithinBlockStaysNormal = across.withinStatic === null && across.withinTyped === "alpha|Zavo|charlie";
    result.keyboardSelectionCutAndPaste = across.cutTexts === across.downDeleted && across.cutClipboard.trim() === across.downSelected.trim()
      && across.pasteTexts === "alZZ" + downTail + "|charlie" && across.pasteSaved === across.pasteTexts;
    result.keyboardSelectionEvidence = JSON.stringify(across);

    // ---- c) リンクの範囲を伸ばす ----
    await openDoc([P("l", "go here now", { html: 'go <a href="https://a.example/">here</a> now' })], "Link");
    await placeAt("l", 5, 10);
    await fresh.locator("#format-link").click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#link-url").fill("https://b.example/");
    await fresh.locator("#link-apply").click();
    await fresh.waitForTimeout(200);
    const linkHtml = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="l"]').innerHTML);
    // 1つのリンクの中だけを選んで付け直すと、今までどおりそのリンクの行き先を変える。
    await openDoc([P("m", "go here now", { html: 'go <a href="https://a.example/">here</a> now' })], "Link inside");
    await placeAt("m", 4, 6);
    await fresh.locator("#format-link").click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#link-url").fill("https://c.example/");
    await fresh.locator("#link-apply").click();
    await fresh.waitForTimeout(200);
    const insideHtml = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="m"]').innerHTML);
    result.linkExtendedRangeBecomesOneLink = linkHtml === 'go <a href="https://b.example/">here no</a>w'
      && insideHtml === 'go <a href="https://c.example/">here</a> now';
    result.linkExtendEvidence = JSON.stringify({ linkHtml, insideHtml });

    result.selectionAcrossNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.selectionAcrossPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
