// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FIXTURE, FONT_FAMILY, FONT_FIXTURE, OUT, PORT, UNUSED_FONT_FAMILY, UNUSED_FONT_FIXTURE, clickNeutralArea, downloadedFiles, dragBlock, insertBlock, openMenu, pickFont, setFontSize, sha256, nextFrames } from "./lib.mjs";

// 通しのスモークテスト(1つのページで文書を育てながら順に確かめる)。後半は前半の文書の状態を
// 引き継ぐので、分けずに1つのスイートにしてある。スイートの名前は coreSuite(--only=coreSuite)。
export default async function coreSuite({ context, localFontsPermitted }) {
  const page = await context.newPage();
  // 未保存の変更を捨てる確認ダイアログの応答を、テスト側から切り替える。
  let dialogAction = "accept";
  const dialogMessages = [];
  page.on("dialog", (dialog) => {
    dialogMessages.push(dialog.message());
    if (dialogAction === "accept") dialog.accept();
    else dialog.dismiss();
  });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

  await page.locator("#doc-title").fill("PWA Smoke Test");
  await page.locator(".block-content").nth(1).click();
  await page.keyboard.press("Control+A");
  const firstSelect = await page.evaluate(() => getSelection().toString());
  await page.keyboard.press("Control+A");
  const secondSelect = await page.evaluate(() => getSelection().toString());
  const secondSelectMode = await page.evaluate(() => window.__lastSelectAllMode);
  await page.locator(".block-content").nth(1).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("PWA paragraph");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("PWA generated heading");

  await insertBlock(page, "bullet");
  await page.keyboard.type("Bullet one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bullet two");
  const bulletContinuation = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".block")];
    return ["Bullet one", "Bullet two"].map((text) => {
      const row = rows.find((item) => item.innerText.includes(text));
      return Boolean(row?.classList.contains("type-bullet"));
    });
  });
  const bulletMarkerOnFirstLine = await page.evaluate(() => {
    const block = [...document.querySelectorAll(".block.type-bullet")].find((row) => row.innerText.includes("Bullet two"));
    const content = block?.querySelector(".block-content");
    const marker = block?.querySelector(".bullet-marker");
    if (!content || !marker) return false;
    content.textContent = "Bullet two\nwrapped line\nthird line";
    content.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true }));
    const textNode = content.firstChild;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, "Bullet two".length);
    const firstLineRect = range.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const firstLineCenter = firstLineRect.top + firstLineRect.height / 2;
    const markerCenter = markerRect.top + markerRect.height / 2;
    return Math.abs(firstLineCenter - markerCenter) < 1.25;
  });
  const dragHandleOnFirstLine = await page.evaluate(() => {
    const block = [...document.querySelectorAll(".block.type-bullet")].find((row) => row.innerText.includes("Bullet two"));
    const content = block?.querySelector(".block-content");
    const grip = block?.querySelector(".drag-grip");
    if (!content || !grip) return false;
    const textNode = content.firstChild;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, "Bullet two".length);
    const firstLineRect = range.getBoundingClientRect();
    const gripRect = grip.getBoundingClientRect();
    const firstLineCenter = firstLineRect.top + firstLineRect.height / 2;
    const gripCenter = gripRect.top + gripRect.height / 2;
    return Math.abs(firstLineCenter - gripCenter) < 1.25;
  });
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block.type-bullet .block-content")].find((item) => item.textContent.includes("Bullet two"));
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    content.focus();
  });
  await page.keyboard.press("ArrowUp");
  const arrowUpMovesBlock = await page.evaluate(() => document.activeElement?.closest(".block")?.innerText.includes("Bullet one"));
  await page.keyboard.press("ArrowDown");
  const arrowDownMovesBlock = await page.evaluate(() => document.activeElement?.closest(".block")?.innerText.includes("Bullet two"));

  await insertBlock(page, "to-do");
  await page.keyboard.type("Todo one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Todo two");
  const todoContinuation = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".block")];
    return ["Todo one", "Todo two"].map((text) => {
      const row = rows.find((item) => item.innerText.includes(text));
      return Boolean(row?.classList.contains("type-todo"));
    });
  });
  const todoCheckboxOnFirstLine = await page.evaluate(() => {
    const block = [...document.querySelectorAll(".block.type-todo")].find((row) => row.innerText.includes("Todo two"));
    const content = block?.querySelector(".block-content");
    const checkbox = block?.querySelector(".todo-box");
    if (!content || !checkbox) return false;
    content.textContent = "Todo two\nwrapped line\nthird line";
    content.dispatchEvent(new InputEvent("input", { inputType: "insertText", bubbles: true }));
    const range = document.createRange();
    range.setStart(content.firstChild, 0);
    range.setEnd(content.firstChild, "Todo two".length);
    const lineRect = range.getBoundingClientRect();
    const boxRect = checkbox.getBoundingClientRect();
    const lineCenter = lineRect.top + lineRect.height / 2;
    const boxCenter = boxRect.top + boxRect.height / 2;
    const endRange = document.createRange();
    endRange.selectNodeContents(content);
    endRange.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(endRange);
    content.focus();
    return Math.abs(lineCenter - boxCenter) < 1.25;
  });

  await page.keyboard.press("Enter");
  // \u8a18\u53f7\u304b\u3089\u306e\u5909\u63db(## \u3068 - \u3068 1.)\u305d\u306e\u3082\u306e\u306f markdownSpaceSuite(markdownAllPrefixesFireOnSpace)\u304c\u898b\u308b\u3002
  // \u3053\u3053\u306f\u5f8c\u306e\u78ba\u304b\u3081\u304c\u4f7f\u3046\u30d6\u30ed\u30c3\u30af\u3092\u4f5c\u308b\u3002
  await page.keyboard.type("## Markdown heading");

  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.type("Markdown bullet");
  const markdownBulletAcceptsText = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("Markdown bullet"));
    return Boolean(row?.classList.contains("type-bullet"));
  });
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  const emptyBulletBeforeBackspace = await page.evaluate(() => ({
    id: document.activeElement?.closest(".block-content")?.dataset.id,
    count: document.querySelectorAll(".block").length,
  }));
  await page.locator(`.block-content[data-id="${emptyBulletBeforeBackspace.id}"]`).focus();
  await page.waitForTimeout(50);
  await page.keyboard.press("Backspace");
  const emptyBulletBackspaceDebug = await page.evaluate(({ id, count }) => {
    const row = id ? document.querySelector(`.block-content[data-id="${id}"]`)?.closest(".block") : null;
    return {
      id,
      beforeCount: count,
      afterCount: document.querySelectorAll(".block").length,
      className: row?.className || "",
      text: row?.querySelector(".block-content")?.textContent || "",
      hasMarker: Boolean(row?.querySelector(".bullet-marker")),
    };
  }, emptyBulletBeforeBackspace);
  const emptyBulletBackspaceReturnsParagraph = Boolean(
    emptyBulletBackspaceDebug.id &&
    !emptyBulletBackspaceDebug.className.includes("type-bullet") &&
    !emptyBulletBackspaceDebug.hasMarker &&
    emptyBulletBackspaceDebug.afterCount === emptyBulletBackspaceDebug.beforeCount
  );
  await insertBlock(page, "to-do");
  const emptyTodoBeforeBackspace = await page.evaluate(() => ({
    id: document.activeElement?.closest(".block-content")?.dataset.id,
    count: document.querySelectorAll(".block").length,
  }));
  await page.locator(`.block-content[data-id="${emptyTodoBeforeBackspace.id}"]`).focus();
  await page.waitForTimeout(50);
  await page.keyboard.press("Backspace");
  const emptyTodoBackspaceDebug = await page.evaluate(({ id, count }) => {
    const row = id ? document.querySelector(`.block-content[data-id="${id}"]`)?.closest(".block") : null;
    return {
      id,
      beforeCount: count,
      afterCount: document.querySelectorAll(".block").length,
      className: row?.className || "",
      text: row?.querySelector(".block-content")?.textContent || "",
      hasCheckbox: Boolean(row?.querySelector(".todo-box")),
    };
  }, emptyTodoBeforeBackspace);
  const emptyTodoBackspaceReturnsParagraph = Boolean(
    emptyTodoBackspaceDebug.id &&
    !emptyTodoBackspaceDebug.className.includes("type-todo") &&
    !emptyTodoBackspaceDebug.hasCheckbox &&
    emptyTodoBackspaceDebug.afterCount === emptyTodoBackspaceDebug.beforeCount
  );

  await insertBlock(page, "numbered");
  await page.keyboard.type("Number parent one");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Number child one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Number child two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Number grandchild");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Number parent two");
  const hierarchicalNumberedMarkers = await page.evaluate(() => {
    const expected = [
      ["Number parent one", "1."],
      ["Number child one", "1.1"],
      ["Number child two", "1.2"],
      ["Number grandchild", "1.2.1"],
      ["Number parent two", "2."],
    ];
    return expected.map(([text, marker]) => {
      const row = [...document.querySelectorAll(".block.type-numbered")].find((item) => item.querySelector(".block-content")?.textContent === text);
      return row?.querySelector(".numbered-marker")?.textContent === marker;
    });
  });
  const numberedIndentLevelsPersist = await page.evaluate(() => {
    const expected = new Map([
      ["Number parent one", "0"],
      ["Number child one", "1"],
      ["Number child two", "1"],
      ["Number grandchild", "2"],
      ["Number parent two", "0"],
    ]);
    return [...expected].every(([text, indent]) => {
      const row = [...document.querySelectorAll(".block.type-numbered")].find((item) => item.querySelector(".block-content")?.textContent === text);
      return row?.dataset.indent === indent;
    });
  });
  const numberedMarkerOnFirstLine = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block.type-numbered")].find((item) => item.querySelector(".block-content")?.textContent === "Number child two");
    const content = row?.querySelector(".block-content");
    const marker = row?.querySelector(".numbered-marker");
    if (!content || !marker) return false;
    const range = document.createRange();
    range.setStart(content.firstChild, 0);
    range.setEnd(content.firstChild, content.firstChild.nodeValue.length);
    const lineRect = range.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    return Math.abs(lineRect.top + lineRect.height / 2 - markerRect.top - markerRect.height / 2) < 1.25;
  });
  const imeCompositionEnterKeepsNumberedBlock = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block.type-numbered")].find((item) => item.querySelector(".block-content")?.textContent === "Number parent two");
    const content = row?.querySelector(".block-content");
    if (!content) return false;
    content.focus();
    const beforeCount = document.querySelectorAll(".block").length;
    const composingEnter = new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true });
    const composingAccepted = content.dispatchEvent(composingEnter);
    const legacyEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(legacyEnter, "keyCode", { value: 229 });
    const legacyAccepted = content.dispatchEvent(legacyEnter);
    return composingAccepted && legacyAccepted && document.querySelectorAll(".block").length === beforeCount && document.activeElement === content;
  });
  const numberedParent = page.locator(".block.type-numbered", { hasText: "Number parent one" });
  await numberedParent.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "numbered-list-desktop.png") });
  await page.setViewportSize({ width: 390, height: 700 });
  await numberedParent.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "numbered-list-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press("Enter");
  const emptyNumberedBeforeBackspace = await page.evaluate(() => ({
    id: document.activeElement?.closest(".block-content")?.dataset.id,
    count: document.querySelectorAll(".block").length,
  }));
  await page.keyboard.press("Backspace");
  const emptyNumberedBackspaceReturnsParagraph = await page.evaluate(({ id, count }) => {
    const row = id ? document.querySelector(`.block-content[data-id="${id}"]`)?.closest(".block") : null;
    return Boolean(
      row &&
      row.classList.contains("type-paragraph") &&
      !row.querySelector(".numbered-marker") &&
      document.querySelectorAll(".block").length === count
    );
  }, emptyNumberedBeforeBackspace);
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. ");
  await page.keyboard.type("Markdown numbered");
  await page.keyboard.press("Enter");
  const emptyNumberedBeforeEnter = await page.evaluate(() => ({
    id: document.activeElement?.closest(".block-content")?.dataset.id,
    count: document.querySelectorAll(".block").length,
  }));
  await page.keyboard.press("Enter");
  const emptyNumberedEnterReturnsParagraph = await page.evaluate(({ id, count }) => {
    const row = id ? document.querySelector(`.block-content[data-id="${id}"]`)?.closest(".block") : null;
    return Boolean(
      row &&
      row.classList.contains("type-paragraph") &&
      !row.querySelector(".numbered-marker") &&
      document.querySelectorAll(".block").length === count
    );
  }, emptyNumberedBeforeEnter);

  await page.keyboard.type("1. ");
  const numberedShortcutBeforeEnter = await page.evaluate(() => ({
    id: document.activeElement?.closest(".block-content")?.dataset.id,
    count: document.querySelectorAll(".block").length,
  }));
  await page.keyboard.press("Enter");
  const numberedShortcutEnterReturnsParagraph = await page.evaluate(({ id, count }) => {
    const row = id ? document.querySelector(`.block-content[data-id="${id}"]`)?.closest(".block") : null;
    return Boolean(
      row &&
      row.classList.contains("type-paragraph") &&
      !row.querySelector(".numbered-marker") &&
      row.querySelector(".block-content")?.textContent.replaceAll("\u200b", "").trim() === "" &&
      document.querySelectorAll(".block").length === count
    );
  }, numberedShortcutBeforeEnter);

  await page.keyboard.type("- ");
  const bulletShortcutBeforeEnter = await page.evaluate(() => ({
    id: document.activeElement?.closest(".block-content")?.dataset.id,
    count: document.querySelectorAll(".block").length,
  }));
  await page.keyboard.press("Enter");
  const bulletShortcutEnterReturnsParagraph = await page.evaluate(({ id, count }) => {
    const row = id ? document.querySelector(`.block-content[data-id="${id}"]`)?.closest(".block") : null;
    return Boolean(
      row &&
      row.classList.contains("type-paragraph") &&
      !row.querySelector(".bullet-marker") &&
      row.querySelector(".block-content")?.textContent.replaceAll("\u200b", "").trim() === "" &&
      document.querySelectorAll(".block").length === count
    );
  }, bulletShortcutBeforeEnter);

  await page.keyboard.type("stale model");
  const staleModelBeforeBackspace = await page.evaluate(() => {
    const editable = document.activeElement?.closest(".block-content");
    if (!editable) return { id: null, count: document.querySelectorAll("#blocks .block").length };
    // input イベントを発生させずにDOMだけ空にして、モデルとのずれを作る。
    editable.textContent = "";
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return { id: editable.dataset.id, count: document.querySelectorAll("#blocks .block").length };
  });
  await page.keyboard.press("Backspace");
  const staleModelBackspaceRemovesBlock = await page.evaluate(({ id, count }) => {
    return Boolean(
      id &&
      !document.querySelector(`.block-content[data-id="${id}"]`) &&
      document.querySelectorAll("#blocks .block").length === count - 1 &&
      document.activeElement?.closest(".block")
    );
  }, staleModelBeforeBackspace);

  // ブロックハンドルの ＋ が、そのブロックの直下に空ブロックを足してフォーカスすること。
  const insertButtonBefore = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll("#blocks .block")];
    return { id: blocks[0]?.dataset.id, count: blocks.length };
  });
  const insertButtonIsLeftOfGrip = await page.evaluate(({ id }) => {
    const block = document.querySelector(`#blocks .block[data-id="${id}"]`);
    const insert = block?.querySelector(".insert-block")?.getBoundingClientRect();
    const grip = block?.querySelector(".drag-grip")?.getBoundingClientRect();
    const content = block?.querySelector(".block-content")?.getBoundingClientRect();
    if (!insert || !grip || !content) return false;
    return insert.right <= grip.left && grip.right <= content.left;
  }, insertButtonBefore);
  await page.locator(`#blocks .block[data-id="${insertButtonBefore.id}"] .insert-block`).click();
  const insertButtonAddsBlockBelow = await page.evaluate(({ id, count }) => {
    const blocks = [...document.querySelectorAll("#blocks .block")];
    const index = blocks.findIndex((row) => row.dataset.id === id);
    const next = blocks[index + 1];
    return Boolean(
      blocks.length === count + 1 &&
      next?.classList.contains("type-paragraph") &&
      next.querySelector(".block-content")?.textContent === "" &&
      next.contains(document.activeElement)
    );
  }, insertButtonBefore);
  await page.keyboard.press("Control+Z");
  const insertButtonUndoWorks = await page.evaluate(
    ({ count }) => document.querySelectorAll("#blocks .block").length === count,
    insertButtonBefore
  );

  // 文字サイズとフォントを選択範囲へ適用できること。
  await insertBlock(page);
  await page.keyboard.type("Font sample text");
  // span で分割されたあとでも先頭から length 文字を選べるようにする。
  const selectWords = (count) => page.evaluate((length) => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Font sample text"));
    editable.focus();
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let seen = 0;
    let started = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const size = node.nodeValue.length;
      if (!started) {
        range.setStart(node, 0);
        started = true;
      }
      if (seen + size >= length) {
        range.setEnd(node, length - seen);
        break;
      }
      seen += size;
    }
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, count);
  await selectWords(4);
  await setFontSize(page, 28);
  const fontSizeApplies = await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Font sample text"));
    const span = [...editable.querySelectorAll("span")].find((node) => node.style.fontSize);
    return span?.style.fontSize === "28px" && span.textContent === "Font";
  });
  await selectWords(4);
  // 選んだ書体が付くことは fontPickerSuite の mousePickAppliesFont が見る(ここは下の再描画の確かめの準備)。
  await pickFont(page, "Serif (環境標準)");
  // 既定フォントの選択肢に、実際に使われている書体名が出ること。
  const defaultFontOption = await page.evaluate(() => {
    const option = document.querySelector("#format-font-list .font-option");
    return { label: option?.textContent || "", value: option?.dataset.value ?? null };
  });
  // 先頭の選択肢は本文書体そのもの。空値のまま style.css の指定が効く。
  const defaultFontOptionShowsFontName = defaultFontOption.label === "Sans-serif (環境標準)"
    && defaultFontOption.value === "";
  // ラベルがボタンの幅で切れていないこと。
  const defaultFontOptionFitsSelect = await page.evaluate(() => {
    const select = document.querySelector("#format-font");
    return select.scrollWidth <= select.clientWidth + 1;
  });

  // インデント変更で再描画させ、指定が文書モデルにも入っていることを確かめる。
  await selectWords(1);
  await page.keyboard.press("Tab");
  const fontStylesSurviveRerender = await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Font sample text"));
    // サイズとフォントは入れ子の span に分かれるため、両方の存在を確かめる。
    const spans = [...editable.querySelectorAll("span")];
    return spans.some((node) => node.style.fontSize === "28px")
      && spans.some((node) => node.style.fontFamily.includes("Hiragino Mincho ProN"));
  });
  await selectWords(1);
  await page.keyboard.press("Shift+Tab");
  await selectWords(16);
  await page.locator("#format-reset").click();
  const fontResetClearsStyles = await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Font sample text"));
    return ![...editable.querySelectorAll("span")].some((node) => node.style.fontSize || node.style.fontFamily);
  });

  // 文字サイズの一覧が Google ドキュメントと同じ段階を持つこと。
  await insertBlock(page);
  await page.keyboard.type("stepper sample");
  const selectStepperSample = () => page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("stepper sample"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await selectStepperSample();
  await page.locator("#format-size").click();
  const sizeMenuOffersGoogleLadder = await page.evaluate(() => {
    const menu = document.querySelector("#format-size-menu");
    if (menu?.hidden) return false;
    const values = [...menu.querySelectorAll(".size-option")].map((item) => item.textContent);
    return values.join(",") === "6,7,8,9,10,11,12,14,18,24,30,36,48,60,72,96";
  });
  // 一覧から選んでも選択範囲を失わず、その場で反映されること。
  await page.locator("#format-size-menu .size-option[data-size='36']").click();
  await page.waitForTimeout(80);
  const sizeMenuAppliesWithoutLosingSelection = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("stepper sample"));
    const span = [...editable.querySelectorAll("span")].find((node) => node.style.fontSize);
    return span?.style.fontSize === "36px"
      && span.textContent === "stepper sample"
      && document.querySelector("#format-size").value === "36";
  });
  // ＋ と − で 1 ずつ動くこと。
  // ＋・−・続けて押す(下)は sizeStepperButtonsStepByOne の1件、キー(Ctrl+Shift+. ,)と数値欄の ↑(後段)は
  // sizeKeysStepByOne の1件にまとめ、場面ごとの結果と読んだ値を証拠(…Evidence)に残す。
  const stepperSpanState = () => page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("stepper sample"));
    return {
      spanSizes: [...editable.querySelectorAll("span")].map((node) => node.style.fontSize).filter(Boolean),
      field: document.querySelector("#format-size").value,
    };
  });
  await selectStepperSample();
  await page.locator("#format-size-increment").click();
  await page.waitForTimeout(80);
  const afterIncrement = await stepperSpanState();
  const incrementStepsUp = afterIncrement.spanSizes.includes("37px") && afterIncrement.field === "37";
  await selectStepperSample();
  await page.locator("#format-size-decrement").click();
  await page.waitForTimeout(80);
  const afterDecrement = await stepperSpanState();
  const decrementStepsDown = afterDecrement.spanSizes.includes("36px") && afterDecrement.field === "36";
  // Ctrl+Shift+. と Ctrl+Shift+, でも動くこと。ここまでで出ていない値へ動かして確かめる。
  const stepperSampleSize = () => page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("stepper sample"));
    const span = [...editable.querySelectorAll("span")].find((node) => node.style.fontSize);
    return span?.style.fontSize ?? null;
  });
  await selectStepperSample();
  await setFontSize(page, 40);
  await selectStepperSample();
  await page.keyboard.press("Control+Shift+Period");
  await page.waitForTimeout(80);
  const afterShortcutUp = await stepperSampleSize();
  const shortcutStepsUp = afterShortcutUp === "41px";
  await selectStepperSample();
  await page.keyboard.press("Control+Shift+Comma");
  await page.waitForTimeout(80);
  await selectStepperSample();
  await page.keyboard.press("Control+Shift+Comma");
  await page.waitForTimeout(80);
  const afterShortcutDownTwice = await stepperSampleSize();
  const shortcutStepsDown = afterShortcutDownTwice === "39px";
  // サイズやフォントを変えた直後でも、続けて押した太字・斜体が効くこと。
  // <font> を span へ差し替えるとノードが入れ替わるため、選択範囲を戻す必要がある。
  await selectStepperSample();
  await setFontSize(page, 20);
  await page.locator("#format-bold").click();
  await page.waitForTimeout(80);
  const boldWorksAfterSizeChange = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("stepper sample"));
    return Boolean(editable.querySelector("b, strong"))
      && [...editable.querySelectorAll("span")].some((node) => node.style.fontSize === "20px");
  });
  await selectStepperSample();
  await pickFont(page, "Serif (環境標準)");
  await page.waitForTimeout(80);
  await page.locator("#format-italic").click();
  await page.waitForTimeout(80);
  const italicWorksAfterFontChange = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("stepper sample"));
    return Boolean(editable.querySelector("i, em"))
      && [...editable.querySelectorAll("span")].some((node) => node.style.fontFamily.includes("Hiragino Mincho ProN"));
  });
  // ステッパーは選択し直さなくても続けて押せること。
  await selectStepperSample();
  await setFontSize(page, 30);
  await page.locator("#format-size-increment").click();
  await page.waitForTimeout(80);
  await page.locator("#format-size-increment").click();
  await page.waitForTimeout(80);
  const afterRepeatedIncrement = await stepperSampleSize();
  const sizeStepperButtonsEvidence = {
    checks: {
      incrementStepsUp,
      decrementStepsDown,
      repeatsWithoutReselecting: afterRepeatedIncrement === "32px",
    },
    // 36 → ＋ → 37、− → 36、30 → ＋＋ → 32 を期待する。
    values: { afterIncrement, afterDecrement, afterRepeatedIncrement },
  };
  const sizeStepperButtonsStepByOne = Object.values(sizeStepperButtonsEvidence.checks).every((value) => value === true);

  // 複数のサイズ・書体が混ざった選択では、ツールバーを空欄にすること。
  // どれかの値を出すと嘘になるため、Google ドキュメントと同じく該当なしを空欄で示す。
  await insertBlock(page);
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.isContentEditable).pop();
    editable.replaceChildren();
    const small = document.createElement("span");
    small.style.fontSize = "12px";
    small.style.fontFamily = '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "MS PMincho", serif';
    small.textContent = "mixedA";
    const large = document.createElement("span");
    large.style.fontSize = "24px";
    large.textContent = "mixedB";
    editable.append(small, large);
    editable.focus();
  });
  // 文字数で範囲を作り、ツールバーの表示を読む。
  // 書式の表示の見直しは selectionchange の次のフレーム(Issue #204)なので、1フレーム待ってから読む。
  const mixedToolbar = (from, to) => page.evaluate(async ([a, b]) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("mixedAmixedB"));
    editable.focus();
    const texts = [];
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
    const locate = (offset) => {
      let total = 0;
      for (const text of texts) {
        if (offset <= total + text.nodeValue.length) return { node: text, offset: offset - total };
        total += text.nodeValue.length;
      }
      return null;
    };
    const start = locate(a);
    const end = locate(b);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      size: document.querySelector("#format-size").value,
      font: document.querySelector("#format-font").textContent ?? null,
    };
  }, [from, to]);
  const uniformSmall = await mixedToolbar(0, 6);
  const uniformLarge = await mixedToolbar(6, 12);
  const mixedBoth = await mixedToolbar(0, 12);
  // 片方だけの選択では、その範囲に効いている値が出ること。
  const uniformSelectionShowsItsOwnSize = uniformSmall.size === "12"
    && uniformSmall.font === "Serif (環境標準)"
    && uniformLarge.size === "24";
  const mixedSelectionBlanksSizeAndFont = mixedBoth.size === "" && mixedBoth.font === "";
  // 混在用の選択肢は一覧に出さないこと(判定は後段の removedFeaturesStayGone にまとめる)。
  const mixedFontOptionStaysHidden = await page.evaluate(() => {
    const options = [...document.querySelectorAll("#format-font-list .font-option")];
    // v180 から混在は値(ボタンの空欄)だけで表し、一覧に空の項目を置かない。
    const blank = options.filter((option) => !option.textContent);
    return options.length > 0 && blank.length === 0;
  });
  // 見出しと本文をまたぐ選択でも空欄になること。
  const crossBlockMixedBlanksToolbar = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll("#blocks .block")];
    const heading = rows.find((row) => row.classList.contains("type-heading1"))?.querySelector(".block-content");
    const paragraph = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("mixedAmixedB"));
    if (!heading?.firstChild || !paragraph) return false;
    const range = document.createRange();
    range.setStart(heading.firstChild, 0);
    range.setEnd(paragraph.lastChild, 1);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return document.querySelector("#format-size").value === ""
      && document.querySelector("#format-font").textContent === "";
  });

  // タイトルを含むページ全体の選択でも空欄になること。この場合は共通の祖先が
  // 本文の外側になるため、判定の範囲を本文だけに絞ると取りこぼす。
  const pageWideSelectionBlanksSize = await page.evaluate(async () => {
    const title = document.querySelector("#doc-title");
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("mixedAmixedB"));
    if (!title?.firstChild || !editable?.lastChild) return false;
    const range = document.createRange();
    range.setStart(title.firstChild, 0);
    range.setEnd(editable.lastChild, 1);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return document.querySelector("#format-size").value === "";
  });

  // マウスのドラッグで選んだ範囲にも、ツールバーの操作が効くこと。
  // ドラッグ中はブロックをまたげるよう contenteditable を外しているため、
  // 書式を当てる前に編集可能へ戻さないと execCommand が空振りする。
  // キー入力なしのマウス操作だけで確かめる（キー入力は別経路で復帰してしまう）。
  // ブロックのつまみ(⋮⋮)が、本文の行頭を覆わないこと。字幅はフォントで違い、
  // Linux では「⋮⋮」がボタン(16px)からはみ出して行頭のクリック・ドラッグを奪っていた。
  // どの環境でも確かめられるよう、ここだけ字を大きくして字幅を広げて見る。
  const gripLeavesTextStartClickable = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("mixedAmixedB"));
    const text = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) return false;
    const style = document.createElement("style");
    style.textContent = ".handle .drag-grip { font-size: 40px; }";
    document.head.append(style);
    editable.scrollIntoView({ block: "center" });
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 0);
    const rect = range.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left, rect.top + rect.height / 2);
    style.remove();
    return Boolean(hit && editable.contains(hit));
  });

  const dragSelectMixed = async (toEnd) => {
    const points = await page.evaluate((full) => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("mixedAmixedB"));
      // 前の操作で文字が大きくなると、行が画面の外へ押し出されることがある。
      // 画面外の座標ではマウスが本文に届かないので、先に画面の中へ出す。
      editable.scrollIntoView({ block: "center" });
      const texts = [];
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
      const at = (node, offset) => {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset);
        const rect = range.getBoundingClientRect();
        return { x: rect.left, y: rect.top + rect.height / 2 };
      };
      const last = texts[texts.length - 1];
      return {
        from: at(texts[0], 0),
        to: full ? at(last, last.nodeValue.length) : at(texts[0], texts[0].nodeValue.length),
      };
    }, toEnd);
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    return points;
  };
  const dragPoints = await dragSelectMixed(false);
  await page.locator("#format-bold").click();
  await page.waitForTimeout(120);
  const boldWorksAfterMouseDragSelection = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("mixedAmixedB"));
    return editable.querySelector("b, strong")?.textContent === "mixedA";
  });
  await page.mouse.click(dragPoints.to.x + 60, dragPoints.to.y);
  await page.waitForTimeout(120);
  await dragSelectMixed(false);
  await page.locator("#format-size").click();
  await page.waitForTimeout(120);
  await page.locator("#format-size-menu .size-option[data-size='48']").click();
  await page.waitForTimeout(150);
  const sizeMenuWorksAfterMouseDragSelection = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("mixedAmixedB"));
    return [...editable.querySelectorAll("span")].some((node) => node.style.fontSize === "48px");
  });
  await page.mouse.click(dragPoints.to.x + 60, dragPoints.to.y);
  await page.waitForTimeout(120);
  await dragSelectMixed(false);
  await pickFont(page, "Monospace (環境標準)");
  await page.waitForTimeout(150);
  const fontSelectWorksAfterMouseDragSelection = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("mixedAmixedB"));
    return [...editable.querySelectorAll("span")]
      .some((node) => node.style.fontFamily.includes("ui-monospace"));
  });

  // 選択のしかたを変えても、ツールバーからフォント・サイズを当てられること。
  // トリプルクリックの行選択は範囲の終わりが次のブロックまで伸び、ブロックを
  // またぐ選択は execCommand が1つの編集領域にしか効かないため、別扱いが必要。
  await insertBlock(page);
  await page.keyboard.type("selkind alpha");
  await page.keyboard.press("Enter");
  await page.keyboard.type("selkind bravo");
  await page.waitForTimeout(150);
  const selkindRows = () => page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.textContent.includes("selkind"))
      .map((item) => item.innerHTML)
  ));
  const selkindPoint = (needle, offset) => page.evaluate(([text, at]) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes(text));
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    const index = at === -1 ? node.nodeValue.length : at;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }, [needle, offset]);

  // トリプルクリックで行を選び、＋ でサイズを上げる（マウス操作だけ）。
  await page.locator("#blocks .block-content", { hasText: "selkind alpha" })
    .click({ clickCount: 3, position: { x: 20, y: 8 } });
  await page.waitForTimeout(150);
  await page.locator("#format-size-increment").click();
  await page.waitForTimeout(150);
  const tripleClickSelectionAcceptsSize = (await selkindRows())[0]?.includes("font-size: 16px") === true;

  // ブロックをまたぐドラッグ選択に、サイズ一覧から当てる（マウス操作だけ）。
  const acrossEnd = await selkindPoint("selkind bravo", -1);
  await page.mouse.click(acrossEnd.x + 60, acrossEnd.y);
  await page.waitForTimeout(120);
  const acrossStart = await selkindPoint("selkind alpha", 0);
  await page.mouse.move(acrossStart.x, acrossStart.y);
  await page.mouse.down();
  await page.mouse.move(acrossEnd.x, acrossEnd.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.locator("#format-size").click();
  await page.waitForTimeout(120);
  await page.locator("#format-size-menu .size-option[data-size='30']").click();
  await page.waitForTimeout(200);
  const crossBlockSizeRows = await selkindRows();
  const crossBlockSelectionAcceptsSize = crossBlockSizeRows.length === 2
    && crossBlockSizeRows.every((html) => html.includes("font-size: 30px"));

  // ブロックをまたぐ選択にフォントも当てられること。
  // サイズを変えて行の高さが動いているため、座標は取り直す。
  const acrossEnd2 = await selkindPoint("selkind bravo", -1);
  await page.mouse.click(acrossEnd2.x + 60, acrossEnd2.y);
  await page.waitForTimeout(120);
  const acrossStart2 = await selkindPoint("selkind alpha", 0);
  await page.mouse.move(acrossStart2.x, acrossStart2.y);
  await page.mouse.down();
  await page.mouse.move(acrossEnd2.x, acrossEnd2.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await pickFont(page, "Monospace (環境標準)");
  await page.waitForTimeout(200);
  const crossBlockFontRows = await selkindRows();
  const crossBlockSelectionAcceptsFont = crossBlockFontRows.length === 2
    && crossBlockFontRows.every((html) => html.includes("ui-monospace"));

  // 太字などは「トグル」ではなく、選択範囲全体への適用か解除であること。
  // execCommand は選択の先頭の状態しか見ないため、混在した範囲では
  // そのまま流すと一部だけ反転してしまう。
  await insertBlock(page);
  const boldRuleCase = async (markup, presses = 1, button = "#format-bold") => {
    await page.evaluate((html) => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .filter((item) => item.isContentEditable).pop();
      editable.innerHTML = html;
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    }, markup);
    await page.waitForTimeout(80);
    for (let i = 0; i < presses; i += 1) {
      await page.locator(button).click();
      await page.waitForTimeout(120);
    }
    return page.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .filter((item) => item.isContentEditable).pop();
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
      const marks = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const weight = Number.parseInt(getComputedStyle(node.parentElement).fontWeight, 10);
        const struck = getComputedStyle(node.parentElement).textDecorationLine.includes("line-through");
        marks.push({ text: node.nodeValue, bold: weight >= 600, struck });
      }
      return { marks, selected: getSelection()?.toString() ?? "", text: editable.textContent };
    });
  };
  const plainToBold = await boldRuleCase("AAABBBCCC");
  const mixedHeadBold = await boldRuleCase("<b>AAA</b>BBBCCC");
  const mixedMiddleBold = await boldRuleCase("AAA<b>BBB</b>CCC");
  const allBoldToPlain = await boldRuleCase("<b>AAABBBCCC</b>");
  const mixedTwicePlain = await boldRuleCase("<b>AAA</b>BBBCCC", 2);
  const mixedStrike = await boldRuleCase("<s>AAA</s>BBBCCC", 1, "#format-strike");
  const allBold = (result) => result.marks.length > 0 && result.marks.every((mark) => mark.bold);
  const noneBold = (result) => result.marks.length > 0 && result.marks.every((mark) => !mark.bold);
  // 一部だけ付いている範囲は、解除ではなく全体への適用になること。
  const boldAppliesToWholeSelection = allBold(plainToBold)
    && allBold(mixedHeadBold)
    && allBold(mixedMiddleBold);
  // 全体に付いている範囲だけが解除されること。
  const boldRemovesOnlyWhenWholeSelectionHasIt = noneBold(allBoldToPlain) && noneBold(mixedTwicePlain);
  // 取り消し線も同じ規則であること（execCommand の効き方が太字と違う）。
  const strikeAppliesToWholeSelection = mixedStrike.marks.length > 0
    && mixedStrike.marks.every((mark) => mark.struck);
  // 書式を当てても選択範囲が変わらないこと。
  const boldKeepsSelection = [plainToBold, mixedHeadBold, allBoldToPlain, mixedStrike]
    .every((result) => result.selected === result.text);
  // 一部だけを選んだ場合も、その範囲のまま残ること。
  const partialBoldKeepsSelection = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.isContentEditable).pop();
    editable.innerHTML = "AAABBBCCC";
    editable.focus();
    const text = editable.firstChild;
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 6);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  });
  await page.waitForTimeout(80);
  await page.locator("#format-bold").click();
  await page.waitForTimeout(150);
  const partialBoldResult = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.isContentEditable).pop();
    return {
      selected: getSelection()?.toString() ?? "",
      bolded: editable.querySelector("b, strong")?.textContent ?? null,
    };
  });
  const partialBoldKeepsItsRange = partialBoldKeepsSelection
    && partialBoldResult.selected === "BBB"
    && partialBoldResult.bolded === "BBB";

  // 選択の作り方 × 操作する道具の組み合わせを埋める。指摘の再発は
  // 「特定の選び方」「特定の道具」だけで起きていたため、両方を変えて確かめる。
  await insertBlock(page);
  await page.keyboard.type("combo target text");
  const comboEditable = () => page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("combo target"));
    return { html: editable.innerHTML, selected: getSelection()?.toString() ?? "" };
  });
  const comboReset = () => page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("combo target"));
    editable.innerHTML = "combo target text";
    editable.focus();
  });
  const comboPoint = (offset) => page.evaluate((at) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("combo target"));
    const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
    const index = at === -1 ? node.nodeValue.length : at;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }, offset);

  // ダブルクリックの単語選択にフォントを当てられること。
  await comboReset();
  await page.locator("#blocks .block-content", { hasText: "combo target" })
    .dblclick({ position: { x: 14, y: 8 } });
  await page.waitForTimeout(120);
  await pickFont(page, "Serif (環境標準)");
  await page.waitForTimeout(180);
  const doubleClickSelectionAcceptsFont = (await comboEditable()).html.includes("Hiragino Mincho ProN");

  // Ctrl+A の選択にサイズを当てられること（マウスだけで一覧から選ぶ）。
  await comboReset();
  await (await comboPoint(0)).x;
  const comboStart = await comboPoint(0);
  await page.mouse.click(comboStart.x + 4, comboStart.y);
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(120);
  await page.locator("#format-size").click();
  await page.waitForTimeout(120);
  await page.locator("#format-size-menu .size-option[data-size='18']").click();
  await page.waitForTimeout(180);
  const selectAllSelectionAcceptsSize = (await comboEditable()).html.includes("font-size: 18px");

  // Shift+End の選択に背景色を当てられること。
  await comboReset();
  const comboHead = await comboPoint(0);
  await page.mouse.click(comboHead.x + 4, comboHead.y);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.waitForTimeout(120);
  await page.locator("#format-background-trigger").click();
  await page.getByRole("menuitemradio", { name: "Yellow background color" }).click();
  await page.waitForTimeout(180);
  const keyboardSelectionAcceptsBackgroundColor = (await comboEditable()).html.includes("background-color");

  // マウスのドラッグ選択に文字色を当てられること（キー入力なし）。
  await comboReset();
  const dragFrom = await comboPoint(0);
  const dragTo = await comboPoint(5);
  await page.mouse.move(dragFrom.x, dragFrom.y);
  await page.mouse.down();
  await page.mouse.move(dragTo.x, dragTo.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.locator("#format-color-trigger").click();
  await page.getByRole("menuitemradio", { name: "Red text color" }).click();
  await page.waitForTimeout(180);
  const mouseDragSelectionAcceptsTextColor = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("combo target"));
    return [...editable.querySelectorAll("*")]
      .some((node) => getComputedStyle(node).color === "rgb(193, 63, 47)");
  });

  // サイズ・フォントを当てても選択範囲が変わらないこと（太字と同じ保証）。
  await comboReset();
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("combo target"));
    editable.focus();
    const node = editable.firstChild;
    const range = document.createRange();
    range.setStart(node, 6);
    range.setEnd(node, 12);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.waitForTimeout(80);
  await page.locator("#format-size-increment").click();
  await page.waitForTimeout(180);
  const sizeChangeKeepsSelection = (await comboEditable()).selected === "target";
  // フォントを当てても選択が残ることは fontPickerSuite の mousePickKeepsSelection が見る。

  // ブロックをまたぐ選択にも太字を当てられること。
  await insertBlock(page);
  await page.keyboard.type("comboacross one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("comboacross two");
  await page.waitForTimeout(150);
  const acrossPoint = (needle, offset) => page.evaluate(([text, at]) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes(text));
    const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
    const index = at === -1 ? node.nodeValue.length : at;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }, [needle, offset]);
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("comboacross one"));
    editable.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(150);
  const boldFrom = await acrossPoint("comboacross one", 0);
  const boldTo = await acrossPoint("comboacross two", -1);
  await page.mouse.move(boldFrom.x, boldFrom.y);
  await page.mouse.down();
  await page.mouse.move(boldTo.x, boldTo.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const acrossSelectionText = () => page.evaluate(() => (
    (getSelection()?.toString() ?? "").replace(/\s+/g, " ").trim()
  ));
  const acrossBoldCount = () => page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.textContent.includes("comboacross"))
      .filter((item) => Boolean(item.querySelector("b, strong"))).length
  ));
  // ブロックをまたいだドラッグは、2つのブロックの選択になる(v206)。
  const acrossSelectedBlocks = () => page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block.selected .block-content")].map((item) => item.textContent).join("|")
  ));
  const acrossSelectionBefore = await acrossSelectionText();
  const acrossBlocksBefore = await acrossSelectedBlocks();
  await page.locator("#format-bold").click();
  await page.waitForTimeout(250);
  const crossBlockSelectionAcceptsBold = (await acrossBoldCount()) === 2;
  // 書式を当てたあともブロックの選択が変わらないこと(もう一度押せば外せる)。
  const crossBlockBoldKeepsSelection = acrossBlocksBefore.includes("comboacross one")
    && acrossBlocksBefore.includes("comboacross two")
    && (await acrossSelectedBlocks()) === acrossBlocksBefore;
  // 選択が保たれているので、もう一度押すと全体から外れること。
  await page.locator("#format-bold").click();
  await page.waitForTimeout(250);
  const crossBlockBoldSecondPressRemoves = (await acrossBoldCount()) === 0
    && (await acrossSelectionText()) === acrossSelectionBefore;

  // 斜体も、一部だけ付いている範囲では全体への適用になること。
  await insertBlock(page);
  const italicRule = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.isContentEditable).pop();
    editable.innerHTML = "<i>ITA</i>PLAINTEXT";
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  });
  await page.waitForTimeout(80);
  await page.locator("#format-italic").click();
  await page.waitForTimeout(180);
  const italicAppliesToWholeSelection = italicRule && await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("PLAINTEXT"));
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    const marks = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      marks.push(getComputedStyle(node.parentElement).fontStyle === "italic");
    }
    return marks.length > 0 && marks.every(Boolean);
  });

  // 数値欄の ↑ ↓ と Esc、そしてキャレットを失っても空にならないこと。
  await insertBlock(page);
  await page.keyboard.type("sizefield sample");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("sizefield sample"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.waitForTimeout(80);
  const sizeBeforeArrow = await page.locator("#format-size").inputValue();
  await page.locator("#format-size").click();
  await page.locator("#format-size").press("ArrowUp");
  await page.waitForTimeout(180);
  const afterFieldArrowUp = await page.evaluate((before) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("sizefield sample"));
    const expected = (Number.parseInt(before, 10) + 1) + "px";
    return { before, expected, spanSizes: [...editable.querySelectorAll("span")].map((node) => node.style.fontSize).filter(Boolean) };
  }, sizeBeforeArrow);
  const sizeKeysEvidence = {
    checks: {
      shortcutStepsUp,
      shortcutStepsDown,
      fieldArrowUpSteps: afterFieldArrowUp.spanSizes.includes(afterFieldArrowUp.expected),
    },
    // 40 → Ctrl+Shift+. → 41、Ctrl+Shift+, を2回 → 39、数値欄の ↑ で 1 上がる。
    values: { afterShortcutUp, afterShortcutDownTwice, afterFieldArrowUp },
  };
  const sizeKeysStepByOne = Object.values(sizeKeysEvidence.checks).every((value) => value === true);
  // Esc は打ちかけた値を捨て、本文へ適用しないこと。
  const htmlBeforeEscape = await page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("sizefield sample")).innerHTML
  ));
  await page.locator("#format-size").click();
  await page.locator("#format-size").fill("99");
  await page.locator("#format-size").press("Escape");
  await page.waitForTimeout(180);
  const sizeFieldEscapeDiscardsInput = await page.evaluate((before) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("sizefield sample"));
    return editable.innerHTML === before
      && document.querySelector("#format-size").value !== "99";
  }, htmlBeforeEscape);
  // 本文からキャレットが外れても、直前の値を残すこと（空欄は混在の意味に使う）。
  const sizeBeforeBlur = await page.locator("#format-size").inputValue();
  await clickNeutralArea(page);
  await page.waitForTimeout(120);
  const sizeFieldKeepsValueWithoutCaret = await page.locator("#format-size").inputValue() === sizeBeforeBlur
    && sizeBeforeBlur !== "";

  // ブロックをまたいだドラッグは、ブロックの選択になる(v206。ユーザー指示)。文字を打っても何も変わらず、
  // Delete / Backspace はブロックを消す(Undo で戻る)。
  const setupSpanBlocks = async () => {
    await insertBlock(page);
    await page.keyboard.type("spanhead one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("spanmid two");
    await page.keyboard.press("Enter");
    await page.keyboard.type("spantail three");
    await page.waitForTimeout(150);
  };
  const dragSpanBlocks = async () => {
    const points = await page.evaluate(() => {
      const find = (needle) => [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes(needle));
      find("spanhead").scrollIntoView({ block: "center" });
      const at = (editable, offset) => {
        const texts = [];
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
        const total = texts.reduce((sum, node) => sum + node.nodeValue.length, 0);
        const target = offset === -1 ? total : Math.min(offset, total);
        let node = texts[0];
        let index = 0;
        let seen = 0;
        for (const text of texts) {
          if (target <= seen + text.nodeValue.length) { node = text; index = target - seen; break; }
          seen += text.nodeValue.length;
          node = text;
          index = text.nodeValue.length;
        }
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index);
        const rect = range.getBoundingClientRect();
        return { x: rect.left, y: rect.top + rect.height / 2 };
      };
      return { from: at(find("spanhead"), 9), to: at(find("spantail"), 9) };
    });
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  const spanState = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => /spanhead|spanmid|spantail/.test(item.textContent));
    const selection = getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const host = range && (range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement)?.closest?.(".block-content");
    let caret = null;
    if (host) {
      const probe = document.createRange();
      probe.selectNodeContents(host);
      probe.setEnd(range.startContainer, range.startOffset);
      caret = { offset: probe.toString().length, collapsed: selection.isCollapsed };
    }
    return { count: rows.length, texts: rows.map((item) => item.textContent), htmls: rows.map((item) => item.innerHTML), caret };
  });

  const spanSelected = () => page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block.selected .block-content")].map((item) => item.textContent).join("|")
  ));
  const spanOriginal = "spanhead one|spanmid two|spantail three";
  // 文字を打っても、本文は変わらず、ブロックの選択も残ること。
  await setupSpanBlocks();
  await dragSpanBlocks();
  const crossBlockDragSelectsBlocks = (await spanSelected()) === spanOriginal
    && (await page.evaluate(() => getSelection()?.toString() ?? "")) === "";
  await page.keyboard.type("X");
  await page.waitForTimeout(250);
  const crossBlockTypingIsIgnored = (await spanState()).texts.join("|") === spanOriginal;
  await page.keyboard.type("Y");
  await page.waitForTimeout(200);
  const crossBlockTypingKeepsBlockSelection = (await spanState()).texts.join("|") === spanOriginal
    && (await spanSelected()) === spanOriginal;

  // Backspace は選んだブロックを消すこと。Undo で書式ごと戻ること。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("spanhead"));
    editable.innerHTML = "<b>spanhead</b> one";
    editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await page.waitForTimeout(150);
  await dragSpanBlocks();
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(250);
  const crossBlockBackspaceDeletesBlocks = (await spanState()).count === 0;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  const afterSpanUndo = await spanState();
  const crossBlockUndoRestoresBlocks = afterSpanUndo.count === 3
    && afterSpanUndo.htmls[0] === "<b>spanhead</b> one";

  // Delete も同じ結果になること。
  await dragSpanBlocks();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(250);
  const crossBlockDeleteDeletesBlocks = (await spanState()).count === 0;

  // 表など繋げられない種類を含む選択では、何も壊さないこと。
  await insertBlock(page, "table");
  await page.waitForTimeout(200);
  const beforeTableSpan = await page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block")].length
  ));
  const tableSpanPoints = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#blocks .block")];
    const tableRow = rows.filter((row) => row.classList.contains("type-table")).pop();
    const before = rows[rows.indexOf(tableRow) - 1];
    if (!tableRow || !before) return null;
    tableRow.scrollIntoView({ block: "center" });
    const a = before.getBoundingClientRect();
    const b = tableRow.getBoundingClientRect();
    return { from: { x: a.left + 60, y: a.top + a.height / 2 }, to: { x: b.left + 90, y: b.top + b.height / 2 } };
  });
  let crossBlockTypingLeavesUnmergeableBlocks = true;
  if (tableSpanPoints) {
    await page.mouse.move(tableSpanPoints.from.x, tableSpanPoints.from.y);
    await page.mouse.down();
    await page.mouse.move(tableSpanPoints.to.x, tableSpanPoints.to.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    await page.keyboard.type("Q");
    await page.waitForTimeout(250);
    crossBlockTypingLeavesUnmergeableBlocks = await page.evaluate((before) => (
      [...document.querySelectorAll("#blocks .block")].length === before
        && Boolean(document.querySelector("#blocks .block.type-table"))
    ), beforeTableSpan);
  }

  // 日本語入力（IME）でも、ブロックの選択のあいだは何も入らないこと。
  await setupSpanBlocks();
  await dragSpanBlocks();
  const ime = await page.context().newCDPSession(page);
  for (let pass = 0; pass < 5; pass += 1) {
    const rawKey = pass === 0;
    const keyEvent = {
      windowsVirtualKeyCode: rawKey ? 79 : 229,
      nativeVirtualKeyCode: rawKey ? 79 : 229,
      key: rawKey ? "o" : "Process",
      code: "KeyO",
    };
    await ime.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...keyEvent });
    await ime.send("Input.imeSetComposition", { text: "お", selectionStart: 1, selectionEnd: 1 });
    await ime.send("Input.insertText", { text: "お" });
    await ime.send("Input.dispatchKeyEvent", { type: "keyUp", ...keyEvent });
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(200);
  const afterImeSpan = await spanState();
  const crossBlockImeInputIsIgnored = afterImeSpan.texts.join("|") === spanOriginal;
  await ime.detach().catch(() => {});
  // 後片付け(以後の検査が spanhead を数えないように)。
  await dragSpanBlocks();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);

  // マウスでドラッグ選択したあとも、編集領域が生きていること。
  // ドラッグ中はブロックをまたげるよう contenteditable を外している。1つのブロックに
  // 収まった選択で戻し忘れると、編集領域がひとつも無い状態のまま入力を待つことになり、
  // 日本語入力の最初の1文字が変換されずに英字で入ってしまう。
  await insertBlock(page);
  await page.keyboard.type("editstate alpha bravo");
  await page.waitForTimeout(150);
  const editStatePoint = (offset) => page.evaluate((off) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("editstate"));
    editable.scrollIntoView({ block: "center" });
    const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
    const index = off === -1 ? node.nodeValue.length : off;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }, offset);
  const editStateSnapshot = () => page.evaluate(() => ({
    activeIsEditable: Boolean(document.activeElement?.isContentEditable),
    activeInBlock: Boolean(document.activeElement?.closest?.("#blocks .block-content")),
    editableCount: document.querySelectorAll("#blocks .block-content[contenteditable='true']").length,
    selected: getSelection()?.toString() ?? "",
  }));
  const dragStart = await editStatePoint(10);
  const dragEnd = await editStatePoint(15);
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterDragState = await editStateSnapshot();
  // キーボードで選んだときと同じ状態になっていること（比較の基準）。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("editstate"));
    editable.focus();
    const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.setStart(node, 10);
    range.setEnd(node, 15);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.waitForTimeout(120);
  const afterKeyboardState = await editStateSnapshot();
  const mouseDragKeepsEditableTarget = afterDragState.activeIsEditable
    && afterDragState.activeInBlock
    && afterDragState.editableCount === afterKeyboardState.editableCount
    && afterDragState.editableCount > 0
    && afterDragState.selected === "alpha";

  // ブロックをまたぐマウス選択のあとは、ブロックの選択だけが残ること(v206)。入れ物(#blocks)を編集領域のまま
  // 残すと、そこへ打った文字や日本語入力が入ってしまう。
  await setupSpanBlocks();
  await dragSpanBlocks();
  const crossDragHostState = await page.evaluate(() => ({
    hostEditable: document.querySelector("#blocks").hasAttribute("contenteditable"),
    activeInBlocks: Boolean(document.activeElement?.closest?.("#blocks")),
  }));
  const crossBlockDragLeavesNoEditableHost = !crossDragHostState.hostEditable
    && !crossDragHostState.activeInBlocks
    && (await spanSelected()) === spanOriginal;
  await page.keyboard.type("Z");
  await page.waitForTimeout(250);
  const crossBlockTypingLeavesBlocksIntact = !(await page.evaluate(() => document.querySelector("#blocks").hasAttribute("contenteditable")))
    && (await spanState()).texts.join("|") === spanOriginal;

  // 書式を当てたあとも、ブロックの選択のままであること(入れ物を編集領域にしない)。
  await page.locator("#format-bold").click();
  await page.waitForTimeout(250);
  const crossBlockBoldKeepsBlockSelection = !(await page.evaluate(() => document.querySelector("#blocks").hasAttribute("contenteditable")))
    && (await spanSelected()) === spanOriginal
    && (await spanState()).htmls.every((html) => html.startsWith("<b>"));
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);

  // 書体の3枠は OS・環境の標準（v122 で同梱フォントを撤去）。何もインストール
  // されていなくても選べ、フォントを1つも埋め込まないのが既定。
  const osFontListing = await page.evaluate(async () => {
    await document.fonts.ready;
    const labels = [...document.querySelectorAll("#format-font-list .font-option")].map((option) => option.textContent);
    return {
      inPicker: labels.includes("Sans-serif (環境標準)")
        && labels.includes("Serif (環境標準)")
        && labels.includes("Monospace (環境標準)"),
      // 撤去した3書体は、アプリが読み込む @font-face としてはもう存在しない。
      bundledFaces: [...document.fonts]
        .filter((item) => /Noto Sans JP|Noto Serif JP|M PLUS 1 Code/.test(item.family)).length,
      stylesheetLinks: [...document.querySelectorAll('link[rel="stylesheet"]')].map((node) => node.getAttribute("href")),
    };
  });
  const osFontStacksAppearInPicker = osFontListing.inPicker;
  // 判定は後段の removedFeaturesStayGone にまとめる。
  const bundledFontsAreGone = osFontListing.bundledFaces === 0
    && osFontListing.stylesheetLinks.every((href) => !String(href).includes("bundled-fonts"));
  // 何も選ばなければ、添付一覧にフォントは現れない（既定で埋め込まない）。
  const noFontEmbeddedByDefault = await page.evaluate(() => (
    [...document.querySelectorAll("#attachment-summary > *")]
      .every((item) => !/\.woff2?$|\.ttf$|\.otf$/i.test(item.textContent))
  ));
  // 3枠の書体を本文へ適用しても、埋め込みは起きない（OS標準を指すだけ）。
  await insertBlock(page);
  await page.keyboard.type("OS標準フォント sample iWm");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("OS標準フォント"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.waitForTimeout(80);
  await pickFont(page, "Monospace (環境標準)");
  await page.waitForTimeout(400);
  const osMonospaceAppliesToText = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("OS標準フォント"));
    const span = [...editable.querySelectorAll("span")]
      .find((node) => node.style.fontFamily.includes("ui-monospace"));
    // 等幅スタックが本文に効き、埋め込みは増えない。
    return Boolean(span)
      && getComputedStyle(span).fontFamily.includes("ui-monospace")
      && [...document.querySelectorAll("#attachment-summary > *")]
        .every((item) => !/\.woff2?$|\.ttf$|\.otf$/i.test(item.textContent));
  });
  // キャレットだけの状態で選び、そのまま入力しても書体が残ること。
  // 引用符を含むスタック（"Courier New" など）でも指定が捨てられないことを見る
  // （かつて "M PLUS 1 Code" の先頭が数字で、引用符の無い指定が丸ごと無効になった）。
  await insertBlock(page);
  await page.keyboard.type("caretMono ");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("caretMono"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.waitForTimeout(100);
  await pickFont(page, "Monospace (環境標準)");
  await page.waitForTimeout(400);
  await page.keyboard.type("あいう");
  await page.waitForTimeout(300);
  const osFontCaretTypingKeepsFont = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("caretMono"));
    const span = [...editable.querySelectorAll("span")].find((node) => node.textContent === "あいう");
    return Boolean(span)
      && span.style.fontFamily.includes("ui-monospace")
      && getComputedStyle(span).fontFamily.includes("ui-monospace")
      && document.querySelector("#format-font").textContent === "Monospace (環境標準)";
  });
  // 再描画（サニタイズを通る経路）でも指定が残ること。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("caretMono"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(250);
  const osFontSurvivesRerender = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("caretMono"));
    return [...editable.querySelectorAll("span")]
      .some((node) => node.style.fontFamily.includes("ui-monospace"));
  });
  const caretMonoBlock = page.locator("#blocks .block", { hasText: "caretMono" });
  await caretMonoBlock.locator(".drag-grip").click();
  // v125: ハンドルのクリックはブロックのメニューも開く。ブロックへのキー操作は閉じてから。
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(150);

  const osFontBlock = page.locator("#blocks .block", { hasText: "OS標準フォント" });
  await osFontBlock.locator(".drag-grip").click();
  // v125: ハンドルのクリックはブロックのメニューも開く。ブロックへのキー操作は閉じてから。
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(150);

  // ブロックを選択している状態の Ctrl+C / Ctrl+V で複製が作れること。
  await insertBlock(page);
  await page.keyboard.type("dupblock source");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("dupblock source"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#format-bold").click();
  await page.waitForTimeout(200);
  const dupRows = () => page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block")]
      .filter((row) => row.textContent.includes("dupblock source"))
      .map((row) => ({
        html: row.querySelector(".block-content")?.innerHTML ?? null,
        selected: row.classList.contains("selected"),
      }))
  ));
  await page.locator("#blocks .block", { hasText: "dupblock source" }).first().locator(".drag-grip").click();
  // v125: ハンドルのクリックはブロックのメニューも開く。ブロックへのキー操作は閉じてから。
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+c");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(300);
  const afterFirstPaste = await dupRows();
  // 複製が1つできて、装飾ごと複製されること。
  const blockPasteKeepsFormatting = afterFirstPaste.length === 2
    && afterFirstPaste.every((row) => row.html === "<b>dupblock source</b>");
  // 続けて貼れるよう、作った複製が選択状態になること。
  const blockPasteSelectsCopy = afterFirstPaste[1]?.selected === true
    && afterFirstPaste[0]?.selected === false;
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(300);
  const blockPasteRepeats = (await dupRows()).length === 3;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  const blockPasteUndoWorks = (await dupRows()).length === 2;

  // 本文のテキストを選んでいるときは、従来どおりの文字のコピー・貼り付けであること。
  const blockCountBeforeTextCopy = await page.evaluate(() => (
    document.querySelectorAll("#blocks .block").length
  ));
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("dupblock source"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(300);
  const textCopyPasteUnaffected = await page.evaluate((before) => (
    document.querySelectorAll("#blocks .block").length === before
  ), blockCountBeforeTextCopy);

  // 子ブロックを持つブロックは、まとめて複製されること（削除と同じ範囲）。
  await insertBlock(page, "toggle list");
  await page.keyboard.type("dupparent");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("dupchild");
  await page.waitForTimeout(250);
  await page.locator("#blocks .block", { hasText: "dupparent" }).first().locator(".drag-grip").click();
  // v125: ハンドルのクリックはブロックのメニューも開く。ブロックへのキー操作は閉じてから。
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+c");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+v");
  await page.waitForTimeout(350);
  const blockCopyIncludesChildren = await page.evaluate(() => {
    const texts = [...document.querySelectorAll("#blocks .block")]
      .filter((row) => /dupparent|dupchild/.test(row.textContent))
      .map((row) => row.querySelector(".block-content")?.textContent ?? "");
    return texts.join("|") === "dupparent|dupchild|dupparent|dupchild";
  });
  // 後続のテストのために片付ける。
  for (const label of ["dupparent", "dupparent", "dupblock source", "dupblock source"]) {
    const row = page.locator("#blocks .block", { hasText: label }).first();
    if (await row.count()) {
      await row.locator(".drag-grip").click();
      // v125: ハンドルのクリックでメニューが開くので、閉じてから削除する。
      await page.keyboard.press("Escape");
      await page.keyboard.press("Delete");
      await page.waitForTimeout(150);
    }
  }

  // 空のブロックで左キーを押したら、前のブロックの末尾へ移ること。
  await insertBlock(page);
  await page.keyboard.type("leftjump source");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const caretWhere = () => page.evaluate(() => {
    const selection = getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const host = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)
      ?.closest?.(".block-content");
    if (!host) return null;
    const probe = document.createRange();
    probe.selectNodeContents(host);
    probe.setEnd(range.startContainer, range.startOffset);
    return { text: host.textContent, offset: probe.toString().length };
  });
  // 左キーの5つの場面は1件の判定にまとめ、場面ごとの結果とキャレットの位置を証拠(arrowLeftEvidence)に残す。
  const emptyBlockBefore = await caretWhere();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const afterLeftJump = await caretWhere();
  const leftFromEmptyBlockMovesToPreviousEnd = emptyBlockBefore?.text === ""
    && afterLeftJump?.text === "leftjump source"
    && afterLeftJump?.offset === "leftjump source".length;
  // さらに左では文字の中を進み、ブロックを飛び越えないこと。
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(150);
  const afterSecondLeft = await caretWhere();
  const leftInsideTextStaysInBlock = afterSecondLeft?.text === "leftjump source"
    && afterSecondLeft?.offset === "leftjump source".length - 1;
  // 文字のあるブロックの先頭からも、前のブロックの末尾へ移ること。
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const afterLeftFromHead = await caretWhere();
  const leftFromTextHeadMovesUp = Boolean(afterLeftFromHead) && !afterLeftFromHead.text.includes("leftjump source");
  // Shift+左 は選択を伸ばす動作のままで、横取りしないこと。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("leftjump source"));
    editable.focus();
    const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 0);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Shift+ArrowLeft");
  await page.waitForTimeout(150);
  // 起点(anchor)はこのブロックのまま(キャレットを前のブロックへ移していない)。v254 からは選択が前のブロックへ伸びる
  // (Issue #100 b。キーボードでブロックをまたいで選べる)ので、選択の頭ではなく起点で見る。
  const shiftLeftAnchor = await page.evaluate(() => {
    const selection = getSelection();
    const anchor = selection?.anchorNode;
    const host = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest?.(".block-content");
    return { text: host?.textContent ?? null, anchorOffset: selection?.anchorOffset ?? null };
  });
  const shiftLeftKeepsBlock = Boolean(shiftLeftAnchor.text?.includes("leftjump source")) && shiftLeftAnchor.anchorOffset === 0;
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  // 先頭ブロックの先頭では、何も起きないこと。
  const firstBlockCarets = {};
  const leftAtFirstBlockStays = await (async () => {
    await page.evaluate(() => {
      const first = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.isContentEditable);
      first.focus();
      const range = document.createRange();
      range.selectNodeContents(first);
      range.collapse(true);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    const before = await caretWhere();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(150);
    const after = await caretWhere();
    Object.assign(firstBlockCarets, { before, after });
    return Boolean(before) && after?.text === before.text && after?.offset === before.offset;
  })();
  const arrowLeftEvidence = {
    checks: {
      fromEmptyBlockMovesToPreviousEnd: leftFromEmptyBlockMovesToPreviousEnd,
      insideTextStaysInBlock: leftInsideTextStaysInBlock,
      fromTextHeadMovesUp: leftFromTextHeadMovesUp,
      shiftKeepsBlock: shiftLeftKeepsBlock,
      atFirstBlockStays: leftAtFirstBlockStays,
    },
    carets: { emptyBlockBefore, afterLeftJump, afterSecondLeft, afterLeftFromHead, shiftLeftAnchor, firstBlock: firstBlockCarets },
  };
  // ブロックの端でだけ前のブロックへ移り、文字の中・Shift・先頭のブロックでは移らないこと。
  const arrowLeftCrossesBlocksOnlyAtEdges = Object.values(arrowLeftEvidence.checks).every((value) => value === true);

  // 逆向きも同じであること: ブロックの末尾で右キーを押したら次のブロックの先頭へ。
  const putCaretIn = (needle, atEnd) => page.evaluate(([text, end]) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => (text === "" ? !item.textContent && item.isContentEditable : item.textContent.includes(text)));
    if (!editable) return false;
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(!end);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }, [needle, atEnd]);

  await insertBlock(page);
  await page.keyboard.type("rightjump source");
  await insertBlock(page);
  await page.keyboard.type("rightjump target");
  // source と target の間へ空ブロックを1つ挟む。
  await page.locator("#blocks .block", { hasText: "rightjump source" }).first().hover();
  await page.locator("#blocks .block", { hasText: "rightjump source" }).first().locator(".insert-block").click();
  await page.waitForTimeout(250);
  // 末尾で右キー → 直後の空ブロックへ。
  await putCaretIn("rightjump source", true);
  await page.waitForTimeout(120);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  // 右キーの5つの場面も1件の判定にまとめ、場面ごとの結果とキャレットの位置を証拠(arrowRightEvidence)に残す。
  const afterRightIntoEmpty = await caretWhere();
  const rightFromTextEndMovesDown = afterRightIntoEmpty?.text === ""
    && afterRightIntoEmpty?.offset === 0;
  // 空のブロックで右キー → 次のブロックの先頭へ。
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const afterRightFromEmpty = await caretWhere();
  const rightFromEmptyBlockMovesToNextStart = afterRightFromEmpty?.text === "rightjump target"
    && afterRightFromEmpty?.offset === 0;
  // さらに右では文字の中を進み、ブロックを飛び越えないこと。
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  const afterSecondRight = await caretWhere();
  const rightInsideTextStaysInBlock = afterSecondRight?.text === "rightjump target"
    && afterSecondRight?.offset === 1;
  // Shift+右 は選択を伸ばす動作のままで、横取りしないこと。
  await putCaretIn("rightjump source", true);
  await page.waitForTimeout(120);
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(150);
  // 選択の頭が残っているブロック(caretWhere は選択の頭を読む)。
  const afterShiftRight = await caretWhere();
  const shiftRightKeepsBlock = Boolean(afterShiftRight?.text.includes("rightjump source"));
  // 最後のブロックの末尾では、何も起きないこと。
  const lastBlockCarets = {};
  const rightAtLastBlockStays = await (async () => {
    const fresh = await context.newPage();
    try {
      await fresh.goto(`http://127.0.0.1:${PORT}/`);
      await fresh.waitForSelector("#blocks .block-content");
      const read = () => fresh.evaluate(() => {
        const selection = getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const host = range && (range.startContainer.nodeType === 1
          ? range.startContainer
          : range.startContainer.parentElement)?.closest?.(".block-content");
        if (!host) return null;
        const probe = document.createRange();
        probe.selectNodeContents(host);
        probe.setEnd(range.startContainer, range.startOffset);
        return { text: host.textContent, offset: probe.toString().length };
      });
      await fresh.locator("#blocks .block-content").last().click();
      await fresh.keyboard.press("End");
      await fresh.waitForTimeout(120);
      const before = await read();
      if (!before) return false;
      await fresh.keyboard.press("ArrowRight");
      await fresh.waitForTimeout(150);
      const after = await read();
      Object.assign(lastBlockCarets, { before, after });
      return after?.text === before.text && after?.offset === before.offset;
    } finally {
      await fresh.close();
    }
  })();
  const arrowRightEvidence = {
    checks: {
      fromTextEndMovesDown: rightFromTextEndMovesDown,
      fromEmptyBlockMovesToNextStart: rightFromEmptyBlockMovesToNextStart,
      insideTextStaysInBlock: rightInsideTextStaysInBlock,
      shiftKeepsBlock: shiftRightKeepsBlock,
      atLastBlockStays: rightAtLastBlockStays,
    },
    carets: { afterRightIntoEmpty, afterRightFromEmpty, afterSecondRight, afterShiftRight, lastBlock: lastBlockCarets },
  };
  // ブロックの端でだけ次のブロックへ移り、文字の中・Shift・最後のブロックでは移らないこと。
  const arrowRightCrossesBlocksOnlyAtEdges = Object.values(arrowRightEvidence.checks).every((value) => value === true);

  // 余白からのドラッグで矩形選択し、重なったブロックをまとめて選択できること。
  await insertBlock(page);
  await page.keyboard.type("marquee alpha");
  await insertBlock(page);
  await page.keyboard.type("marquee bravo");
  await insertBlock(page);
  await page.keyboard.type("marquee charlie");
  await page.waitForTimeout(250);
  // scroll: 始めのブロックだけ画面の中ほどへ。終わりのブロックは動かさずに測る(2つ目でまたスクロールすると、
  // 先に測った始めの位置がずれる。v201 で題名の下の余白が変わり、実際にずれて失敗した)。
  const marqueeBox = (needle, scroll = true) => page.evaluate(({ text, scroll }) => {
    const row = [...document.querySelectorAll("#blocks .block")]
      .find((item) => item.textContent.includes(text));
    if (scroll) row.scrollIntoView({ block: "center" });
    const rect = row.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }, { text: needle, scroll });
  const marqueeSelection = () => page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block.selected")]
      .map((row) => row.querySelector(".block-content")?.textContent ?? "")
  ));
  const dragMarquee = async (fromNeedle, toNeedle) => {
    const from = await marqueeBox(fromNeedle);
    const to = await marqueeBox(toNeedle, false);
    // 本文の左の余白から始める。本文の上から始めると文字の範囲選択になる。
    await page.mouse.move(from.left - 30, from.top + 4);
    await page.mouse.down();
    await page.mouse.move(from.left - 20, from.top + 8, { steps: 3 });
    const shown = !(await page.evaluate(() => document.querySelector("#block-marquee").hidden));
    await page.mouse.move(from.left + 120, to.bottom - 4, { steps: 10 });
    const during = await marqueeSelection();
    await page.mouse.up();
    await page.waitForTimeout(200);
    return { shown, during, after: await marqueeSelection() };
  };
  const marqueeTwo = await dragMarquee("marquee alpha", "marquee bravo");
  const marqueeShowsRectangleWhileDragging = marqueeTwo.shown
    && await page.evaluate(() => document.querySelector("#block-marquee").hidden);
  const marqueeSelectsCoveredBlocks = marqueeTwo.after.includes("marquee alpha")
    && marqueeTwo.after.includes("marquee bravo")
    && !marqueeTwo.after.includes("marquee charlie");
  const marqueeUpdatesWhileDragging = marqueeTwo.during.includes("marquee alpha")
    && marqueeTwo.during.includes("marquee bravo");
  // 選択したまま Delete でまとめて消せること。
  const blocksBeforeMarqueeDelete = await page.evaluate(() => (
    document.querySelectorAll("#blocks .block").length
  ));
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  const marqueeDeleteRemovesAll = await page.evaluate((before) => {
    const texts = [...document.querySelectorAll("#blocks .block-content")].map((n) => n.textContent);
    return document.querySelectorAll("#blocks .block").length === before - 2
      && !texts.some((text) => text.includes("marquee alpha"))
      && !texts.some((text) => text.includes("marquee bravo"))
      && texts.some((text) => text.includes("marquee charlie"));
  }, blocksBeforeMarqueeDelete);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  const marqueeDeleteUndoWorks = await page.evaluate((before) => (
    document.querySelectorAll("#blocks .block").length === before
  ), blocksBeforeMarqueeDelete);
  // 矩形選択した3つをまとめてコピーして貼れることは blockClipboardSuite の blockCopyPasteKeepsStructure が見る。
  // Escape で選択を解除できること。
  await dragMarquee("marquee alpha", "marquee bravo");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const marqueeEscapeClearsSelection = (await marqueeSelection()).length === 0;
  // 余白をただクリックした場合は、従来どおり末尾へフォーカスするだけであること。
  const plainBlank = await marqueeBox("marquee alpha");
  await page.mouse.click(plainBlank.left - 30, plainBlank.top + 4);
  await page.waitForTimeout(200);
  const blankClickStillFocusesWithoutSelecting = await page.evaluate(() => (
    document.querySelectorAll("#blocks .block.selected").length === 0
      && Boolean(document.activeElement?.closest?.("#blocks .block-content"))
  ));
  // 本文の上からのドラッグは、従来どおり文字の範囲選択であること。
  const textBox = await marqueeBox("marquee alpha");
  await page.mouse.move(textBox.left + 60, textBox.top + 10);
  await page.mouse.down();
  await page.mouse.move(textBox.left + 150, textBox.top + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const textDragStillSelectsText = await page.evaluate(() => (
    Boolean(getSelection()?.toString())
      && document.querySelectorAll("#blocks .block.selected").length === 0
  ));
  // 後続のテストのために片付ける。
  for (const name of ["marquee alpha", "marquee bravo", "marquee charlie"]) {
    const row = page.locator("#blocks .block", { hasText: name }).first();
    if (await row.count()) {
      await row.locator(".drag-grip").click();
      // v125: ハンドルのクリックでメニューが開くので、閉じてから削除する。
      await page.keyboard.press("Escape");
      await page.keyboard.press("Delete");
      await page.waitForTimeout(150);
    }
  }

  // 文字が残っているブロックの先頭で Backspace を押したら、前のブロックへ繋げて戻ること。
  // 何もしないと行き止まりになり、前のブロックへ戻れない。
  const mergeRows = () => page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block")]
      .filter((row) => /mergehead|mergetail/.test(row.textContent))
      .map((row) => row.querySelector(".block-content")?.innerHTML ?? "")
  ));
  const mergeCaret = () => page.evaluate(() => {
    const selection = getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const host = range && (range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement)?.closest?.(".block-content");
    if (!host) return null;
    const probe = document.createRange();
    probe.selectNodeContents(host);
    probe.setEnd(range.startContainer, range.startOffset);
    return { text: host.textContent, offset: probe.toString().length };
  });
  await insertBlock(page);
  await page.keyboard.type("mergehead");
  await insertBlock(page);
  await page.keyboard.type("mergetail");
  // 後ろのブロックだけ太字にして、書式ごと繋がることを見る。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent === "mergetail");
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#format-bold").click();
  await page.waitForTimeout(250);
  await page.keyboard.press("Home");
  await page.waitForTimeout(150);
  const blocksBeforeMerge = await page.evaluate(() => document.querySelectorAll("#blocks .block").length);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(350);
  const mergedRows = await mergeRows();
  const mergedCaret = await mergeCaret();
  const backspaceMergesIntoPreviousBlock = mergedRows.length === 1
    && mergedRows[0] === "mergehead<b>mergetail</b>"
    && await page.evaluate((before) => (
      document.querySelectorAll("#blocks .block").length === before - 1
    ), blocksBeforeMerge);
  // 繋ぎ目にキャレットが来ること（前のブロックの末尾）。
  const backspaceMergePlacesCaretAtJoin = mergedCaret?.text === "mergeheadmergetail"
    && mergedCaret?.offset === "mergehead".length;
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  const backspaceMergeUndoWorks = (await mergeRows()).length === 2;
  // 文字の途中では、従来どおり1文字だけ消えること。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent === "mergehead");
    editable.focus();
    const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.setStart(node, 4);
    range.setEnd(node, 4);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(250);
  const backspaceInsideTextDeletesOneChar = await page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "merehead")
  ));
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  // 子ブロックを持つブロックは繋げないこと（繋ぎ先が一意に決まらない）。
  await insertBlock(page, "toggle list");
  await page.keyboard.type("mergeparent");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("mergechild");
  await page.waitForTimeout(250);
  const blocksBeforeParentMerge = await page.evaluate(() => document.querySelectorAll("#blocks .block").length);
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent === "mergeparent");
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);
  const backspaceKeepsBlocksWithChildren = await page.evaluate((before) => (
    document.querySelectorAll("#blocks .block").length === before
  ), blocksBeforeParentMerge);
  // 後続のテストのために片付ける。
  for (const label of ["mergeparent", "mergehead"]) {
    const row = page.locator("#blocks .block", { hasText: label }).first();
    if (await row.count()) {
      await row.locator(".drag-grip").click();
      // v125: ハンドルのクリックでメニューが開くので、閉じてから削除する。
      await page.keyboard.press("Escape");
      await page.keyboard.press("Delete");
      await page.waitForTimeout(150);
    }
  }


  // 背景色は Google ドキュメントと同じマーカーのアイコンであること。
  const highlightUsesMarkerIcon = await page.evaluate(() => {
    const glyph = document.querySelector("#format-background-trigger .background-glyph");
    return Boolean(glyph?.querySelector("svg.glyph-icon")) && !glyph.textContent.trim();
  });

  // キャレットだけの状態でフォントを選び、そのまま入力すると、その書体が付くこと。
  await insertBlock(page);
  await pickFont(page, "Serif (環境標準)");
  const pendingFontShownBeforeTyping = await page.evaluate(() => (
    document.querySelector("#format-font").textContent === "Serif (環境標準)"
  ));
  await page.keyboard.type("caret font sample");
  const caretFontAppliesToTypedText = await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("caret font sample"));
    const styled = [...editable.querySelectorAll("span, font")]
      .find((node) => node.style.fontFamily || node.getAttribute("face"));
    const family = styled ? styled.style.fontFamily || styled.getAttribute("face") : "";
    return { family, keptSelect: document.querySelector("#format-font").textContent };
  });
  const caretFontReachesTypedText = caretFontAppliesToTypedText.family.includes("Hiragino Mincho ProN");
  // 目印の書体名が本文へ漏れていないこと。
  const noSentinelFontLeaks = await page.evaluate(() => (
    !document.querySelector("#blocks").innerHTML.includes("doc-editor-font")
  ));
  const caretFontKeepsSelectLabel = caretFontAppliesToTypedText.keptSelect === "Serif (環境標準)";

  // 選択していないテキストの書式が、キャレット位置でのフォント変更に巻き込まれないこと。
  await insertBlock(page);
  await page.keyboard.type("keep me");
  const selectKeepMe = (collapseToEnd) => page.evaluate((collapse) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("keep me"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    if (collapse) range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, collapseToEnd);
  await selectKeepMe(false);
  await pickFont(page, "Monospace (環境標準)");
  // selectionchange 経由の同期は非同期なので落ち着くまで待つ
  await page.waitForTimeout(80);
  // キャレットを末尾へ置いて別のフォントを選び、続けて入力する
  await selectKeepMe(true);
  await pickFont(page, "Serif (環境標準)");
  await page.waitForTimeout(80);
  await page.keyboard.type("NEW");
  const caretFontLeavesEarlierTextAlone = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("keep me"));
    const kept = [...editable.querySelectorAll("span")]
      .find((node) => node.textContent === "keep me");
    const added = [...editable.querySelectorAll("span")]
      .find((node) => node.textContent === "NEW");
    return Boolean(
      kept && added &&
      kept.style.fontFamily.includes("ui-monospace") &&
      added.style.fontFamily.includes("Hiragino Mincho ProN") &&
      editable.textContent === "keep meNEW"
    );
  });

  // Enter で新しいブロックへ移ったとき、直前の書式は引き継がないこと(Notion と同じ。v176 ユーザー指示。
  // 以前は引き継いでいた)。
  await insertBlock(page);
  await page.keyboard.type("styled source");
  const selectStyledSource = (collapse) => page.evaluate((toEnd) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("styled source"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    if (toEnd) range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, collapse);
  await selectStyledSource(false);
  await pickFont(page, "Serif (環境標準)");
  await selectStyledSource(false);
  await setFontSize(page, 24);
  await selectStyledSource(true);
  await page.keyboard.press("Enter");
  await page.keyboard.type("carried line");
  const newBlockStartsWithoutFontFormat = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("carried line"));
    const source = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("styled source"));
    // 元のブロックの書式は残り、新しいブロックは書式なしで始まる。
    const sourceSpans = [...(source?.querySelectorAll("span") || [])];
    return Boolean(editable) && editable.innerHTML === "carried line"
      && sourceSpans.some((node) => node.style.fontSize === "24px");
  });
  // 太字・文字色・背景色も新しいブロックへ引き継がないこと。
  await insertBlock(page);
  await page.keyboard.type("rich source");
  const selectRich = (collapse) => page.evaluate((toEnd) => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("rich source"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    if (toEnd) range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, collapse);
  await selectRich(false);
  await page.locator("#format-bold").click();
  await selectRich(false);
  await page.locator("#format-color-trigger").click();
  await page.locator("#format-color-options .color-swatch").nth(1).click();
  await selectRich(false);
  await page.locator("#format-background-trigger").click();
  await page.locator("#format-background-options .color-swatch").nth(2).click();
  await page.waitForTimeout(80);
  await selectRich(true);
  await page.keyboard.press("Enter");
  await page.keyboard.type("rich carried");
  const newBlockStartsWithoutRichFormat = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("rich carried"));
    return Boolean(editable) && editable.innerHTML === "rich carried";
  });

  // 空のリスト項目で Enter を押して段落へ戻る場合も、書式を引き継がないこと。
  // 太字のテキストから Enter で引き継いだブロックを、チェックボックスへ変えてから Enter
  await insertBlock(page);
  await page.keyboard.type("bold origin");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("bold origin"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#format-bold").click();
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("bold origin"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("To-do");
  await page.locator("#palette-results").getByText("To-do", { exact: true }).click();
  await page.waitForTimeout(80);
  await page.keyboard.press("Enter");
  await page.keyboard.type("demoted carried");
  const demotedBlockStartsWithoutFormat = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("demoted carried"));
    const row = editable?.closest(".block");
    return Boolean(editable
      && row?.classList.contains("type-paragraph")
      && editable.innerHTML === "demoted carried");
  });

  // Shift+Enter でブロック内改行しても書式が続くこと。
  await insertBlock(page);
  await page.keyboard.type("break source");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("break source"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#format-bold").click();
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("break source"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("after break");
  const shiftEnterKeepsFormat = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("after break"));
    const bold = editable?.querySelector("b, strong");
    return Boolean(bold && bold.textContent.includes("break source") && bold.textContent.includes("after break"));
  });

  // 書式のないブロックからの Enter では、余計な装飾要素を残さないこと。
  await insertBlock(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("plain carried");
  const plainBlockStaysPlain = await page.evaluate(() => {
    const editable = [...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent.includes("plain carried"));
    return editable.innerHTML === "plain carried";
  });

  // 文字サイズの表示が、キャレット位置の実際のサイズになること。
  const sizeSelectShowsCurrentSize = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll("#blocks .block")];
    const label = () => document.querySelector("#format-size").value;
    // 書式の表示の見直しは selectionchange の次のフレーム(Issue #204)なので、1フレーム待ってから読む。
    const check = async (row) => {
      const editable = row.querySelector(".block-content");
      if (!editable?.isContentEditable) return null;
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return { shown: label(), computed: String(parseInt(getComputedStyle(editable).fontSize, 10)) };
    };
    const heading = rows.find((row) => row.classList.contains("type-heading1"));
    const paragraph = rows.find((row) => row.classList.contains("type-paragraph"));
    const a = heading ? await check(heading) : null;
    const b = paragraph ? await check(paragraph) : null;
    return Boolean(a && b && a.shown === a.computed && b.shown === b.computed && a.shown !== b.shown);
  });

  // OSにインストールされたフォントが選択肢に出ること。一覧を出すだけでは埋め込まないこと。
  await page.waitForFunction(
    () => [...document.querySelectorAll("#format-font-list [role=group]")].some((node) => node.getAttribute("aria-label").startsWith("PC のフォント")),
    null,
    { timeout: 10000 }
  ).catch(() => {});
  const installedFontsListing = await page.evaluate(async () => {
    // OS が返すファミリー数。件数を固定値で見ると、フォントの少ない環境(Linux)で落ちる。
    const osFamilies = typeof window.queryLocalFonts === "function"
      ? new Set((await window.queryLocalFonts()).map((font) => font.family)).size
      : -1;
    const group = [...document.querySelectorAll("#format-font-list [role=group]")]
      .find((node) => node.getAttribute("aria-label").startsWith("PC のフォント"));
    const options = group ? [...group.querySelectorAll(".font-option")] : [];
    const names = options.map((option) => option.textContent);
    // 本文へ適用して確かめるフォント。Windows/mac は Arial、Arial の無い環境(Linux)では
    // 一覧にある英数字名のフォントを使う。名前を添付名・font-family の照合に使うため。
    const target = names.includes("Arial") ? "Arial"
      : names.find((name) => /^[A-Za-z][A-Za-z0-9 ]*$/.test(name)) || names[0] || "";
    return { count: options.length, osFamilies, target };
  });
  const installedFontTarget = installedFontsListing.target;
  const installedFontsAppearInPicker = !localFontsPermitted
    || (installedFontsListing.count > 0
      && installedFontsListing.count === installedFontsListing.osFamilies
      && Boolean(installedFontTarget));
  const listingInstalledFontsEmbedsNothing = await page.evaluate(() => (
    [...document.querySelectorAll("#attachment-summary > *")]
      .every((item) => !/.(ttf|ttc|otf|woff2?)/i.test(item.textContent))
  ));

  // 本文へ適用した時点で、そのOSフォントだけが埋め込まれること。
  await insertBlock(page);
  await page.keyboard.type("Installed font sample");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Installed font sample"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  if (localFontsPermitted && installedFontTarget) {
    await pickFont(page, installedFontTarget);
    await page.waitForFunction(
      (family) => [...document.querySelectorAll("#attachment-summary > *")]
        .some((item) => item.textContent.toLowerCase().includes(family.toLowerCase())),
      installedFontTarget,
      { timeout: 20000 }
    ).catch(() => {});
  }
  const applyingInstalledFontEmbedsIt = !localFontsPermitted || (Boolean(installedFontTarget) && await page.evaluate((family) => (
    [...document.querySelectorAll("#attachment-summary > *")]
      .some((item) => item.textContent.toLowerCase().includes(family.toLowerCase()))
  ), installedFontTarget));
  const installedFontAppliesToText = !localFontsPermitted || (Boolean(installedFontTarget) && await page.evaluate((family) => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Installed font sample"));
    return [...editable.querySelectorAll("span")].some((node) => node.style.fontFamily.includes(family));
  }, installedFontTarget));
  // 使わなくなったので削除する。保存時に埋め込みも落ちることは後段で確認する。
  const installedFontBlock = page.locator(".block", { hasText: "Installed font sample" });
  await installedFontBlock.locator(".drag-grip").click();
  // v125: ハンドルのクリックはメニューも開く。閉じてから削除する。
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");

  // 記号からの見出しへの変換そのものは markdownSpaceSuite(markdownHeadingFiresOnSpace・
  // markdownAllPrefixesFireOnSpace)が見る。ここは下の見出しのつまみ・目次の確かめが使う見出しを作る。
  for (const [marks, text] of [
    ["#", "H1 shortcut"],
    ["###", "H3 shortcut"],
    ["####", "H4 shortcut"],
    ["#####", "H5 shortcut"],
  ]) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${marks} ${text}`);
  }
  const headingHandleOnFirstLine = await page.evaluate(() => {
    const block = [...document.querySelectorAll(".block.type-heading1")].find((row) => row.innerText.includes("H1 shortcut"));
    const content = block?.querySelector(".block-content");
    const grip = block?.querySelector(".drag-grip");
    if (!content || !grip) return false;
    const textNode = content.firstChild;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, content.textContent.length);
    const firstLineRect = range.getBoundingClientRect();
    const gripRect = grip.getBoundingClientRect();
    const firstLineCenter = firstLineRect.top + firstLineRect.height / 2;
    const gripCenter = gripRect.top + gripRect.height / 2;
    return Math.abs(firstLineCenter - gripCenter) < 1.25;
  });

  await page.keyboard.press("Enter");
  await page.keyboard.type("/toc");
  await page.keyboard.press("Enter");
  const tocBlockCreated = await page.evaluate(() => {
    const toc = document.querySelector(".block.type-toc .toc-block");
    return Boolean(toc && toc.innerText.includes("H1 shortcut") && toc.innerText.includes("H3 shortcut"));
  });
  await insertBlock(page);

  await page.keyboard.press("Enter");
  await page.keyboard.type("---");
  const dividerCreated = await page.evaluate(() => Boolean(document.querySelector(".block.type-divider hr")));

  await page.keyboard.press("Enter");
  await page.keyboard.type("/table");
  await page.keyboard.press("Enter");
  const slashTableCreated = await page.evaluate(() => {
    const table = document.querySelector(".block.type-table .editor-table");
    return Boolean(table && table.querySelectorAll("td").length === 9);
  });
  await page.keyboard.type("Table cell");
  const tableCellEdited = await page.evaluate(() => document.querySelector(".block.type-table .editor-table td")?.textContent === "Table cell");
  await page.keyboard.press("Backspace");
  const tableCellBackspaceKeepsText = await page.evaluate(() => {
    const block = document.querySelector(".block.type-table");
    return Boolean(block) && block.querySelector(".editor-table td")?.textContent === "Table cel";
  });
  await page.keyboard.type("l");
  // text が空のテーブルブロックを作る。コマンドパレットは現在のブロックの型だけを変える。
  await insertBlock(page);
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Table");
  await page.locator("#palette-results").getByText("Table", { exact: true }).click();
  const emptyTableBeforeBackspace = await page.evaluate(() => {
    const tables = [...document.querySelectorAll(".block.type-table")];
    const cell = tables[tables.length - 1].querySelector("td");
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return { tables: tables.length, count: document.querySelectorAll("#blocks .block").length };
  });
  await page.keyboard.press("Backspace");
  const tableCellBackspaceKeepsBlock = await page.evaluate(({ tables, count }) => (
    document.querySelectorAll(".block.type-table").length === tables &&
    document.querySelectorAll("#blocks .block").length === count
  ), emptyTableBeforeBackspace);
  await page.keyboard.press("Control+z");

  await insertBlock(page);
  await page.keyboard.type("/tabl");
  await page.keyboard.press("Enter");
  const slashNearestTable = await page.evaluate(() => {
    const tables = document.querySelectorAll(".block.type-table .editor-table");
    return tables.length >= 2 && tables[tables.length - 1].querySelectorAll("td").length === 9;
  });

  await insertBlock(page);
  await page.keyboard.type("/tod");
  await page.keyboard.press("Enter");
  const slashNearestTodo = await page.evaluate(() => [...document.querySelectorAll(".block")].some((row) => (
    row.classList.contains("type-todo") && row.innerText.trim() === ""
  )));

  await insertBlock(page);
  await page.keyboard.type("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const slashTabSelectionState = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".block")];
    return {
      lastClass: rows.at(-1)?.className,
      all: rows.map((row) => ({ className: row.className, text: row.innerText })),
    };
  });
  const slashTabSelection = slashTabSelectionState.all.some((row) => row.className.includes("type-heading1") && row.text.trim() === "");

  await insertBlock(page);
  await page.keyboard.type("/");
  const slashMenuOpenState = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    const active = menu?.querySelector(".menu-item.active");
    return {
      hidden: menu?.hidden,
      activeType: active?.dataset.type,
      ariaSelected: active?.getAttribute("aria-selected"),
      scrollTop: menu?.scrollTop,
    };
  });
  const slashMenuOpensWithFirstOptionActive = slashMenuOpenState.hidden === false && slashMenuOpenState.activeType === "paragraph" && slashMenuOpenState.ariaSelected === "true";
  await page.locator("#slash-menu").evaluate((menu) => { menu.scrollTop = menu.scrollHeight; });
  await page.locator("#doc-title").click();
  const slashMenuClosesOnOutsideClick = await page.evaluate(() => document.querySelector("#slash-menu")?.hidden === true);

  await insertBlock(page);
  await page.keyboard.type("/");
  const slashMenuReopenState = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    return {
      hidden: menu?.hidden,
      scrollTop: menu?.scrollTop,
      activeType: menu?.querySelector(".menu-item.active")?.dataset.type,
    };
  });
  const slashMenuReopensAtTop = slashMenuReopenState.hidden === false && slashMenuReopenState.scrollTop === 0 && slashMenuReopenState.activeType === "paragraph";
  await page.locator("#slash-menu").evaluate((menu) => { menu.scrollTop = menu.scrollHeight; });
  await page.keyboard.type("head");
  const slashQueryResetsScrollAndSelection = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    const active = menu?.querySelector(".menu-item.active");
    return Boolean(menu && menu.scrollTop === 0 && active?.dataset.type === "heading1");
  });
  await page.keyboard.press("Escape");

  await insertBlock(page);
  await page.keyboard.type("/");
  for (let index = 0; index < 12; index++) await page.keyboard.press("ArrowDown");
  const slashKeyboardSelectionState = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    const active = menu?.querySelector(".menu-item.active");
    if (!menu || !active) return null;
    const menuRect = menu.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    return {
      scrollTop: menu.scrollTop,
      activeType: active.dataset.type,
      menuTop: menuRect.top,
      menuBottom: menuRect.bottom,
      activeTop: activeRect.top,
      activeBottom: activeRect.bottom,
    };
  });
  const slashKeyboardSelectionStaysVisible = Boolean(
    slashKeyboardSelectionState &&
    slashKeyboardSelectionState.scrollTop > 0 &&
    slashKeyboardSelectionState.activeTop >= slashKeyboardSelectionState.menuTop &&
    slashKeyboardSelectionState.activeBottom <= slashKeyboardSelectionState.menuBottom
  );
  await page.keyboard.press("Escape");

  await insertBlock(page);
  await page.keyboard.type("/zzzz");
  const slashNoMatchState = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    return Boolean(!menu?.hidden && !menu.querySelector(".menu-item") && menu.querySelector(".menu-empty")?.textContent === "No matching blocks");
  });
  const slashNoMatchBlockCount = await page.locator(".block").count();
  await page.keyboard.press("Enter");
  const slashNoMatchEnterDoesNothing = await page.evaluate((count) => (
    document.querySelectorAll(".block").length === count &&
    !document.querySelector("#slash-menu")?.hidden &&
    document.activeElement?.textContent.includes("/zzzz")
  ), slashNoMatchBlockCount);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Enter");
  await page.setViewportSize({ width: 375, height: 620 });
  await page.waitForTimeout(50);
  await page.keyboard.type("/");
  const slashMenuStaysInsideNarrowViewport = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    if (!menu || menu.hidden) return false;
    const rect = menu.getBoundingClientRect();
    return rect.left >= 11 && rect.right <= window.innerWidth - 11 && rect.top >= 11 && rect.bottom <= window.innerHeight - 11;
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(50);
  const slashMenuResizeState = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    return { hidden: menu?.hidden, activeType: menu?.querySelector(".menu-item.active")?.dataset.type, scrollTop: menu?.scrollTop };
  });
  const slashMenuClosesOnResize = slashMenuResizeState.hidden === true;
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  const slashPositionBeforePageScroll = await page.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    return { hidden: menu?.hidden, top: menu?.getBoundingClientRect().top };
  });
  await page.mouse.move(1200, 100);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(50);
  const slashMenuHandlesPageScroll = await page.evaluate((before) => {
    const menu = document.querySelector("#slash-menu");
    if (!menu || before.hidden) return false;
    if (menu.hidden) return true;
    const rect = menu.getBoundingClientRect();
    return rect.top >= 11 && rect.bottom <= window.innerHeight - 11 && rect.top !== before.top;
  }, slashPositionBeforePageScroll);

  // ＋ボタンは空の段落を1つ足して、そこへカーソルを置くだけ(v206。ユーザー指示「＋ボタン押したら…ブロックの種類選択に
  // なるのは不要。TEXT のブロックが作られるだけでよい」)。種類はその段落で「/」を打って選ぶ。
  await page.keyboard.press("Escape");
  const plusAnchor = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll("#blocks .block")];
    return { id: blocks.at(-1)?.dataset.id, count: blocks.length };
  });
  await page.locator('#blocks .block[data-id="' + plusAnchor.id + '"] .insert-block').click();
  await page.waitForTimeout(150);
  const plusState = await page.evaluate(({ id, count }) => {
    const blocks = [...document.querySelectorAll("#blocks .block")];
    const index = blocks.findIndex((row) => row.dataset.id === id);
    const next = blocks[index + 1];
    return {
      menuHidden: document.querySelector("#slash-menu")?.hidden,
      added: blocks.length === count + 1,
      nextIsParagraph: Boolean(next?.classList.contains("type-paragraph")),
      nextFocused: Boolean(next?.contains(document.activeElement)),
    };
  }, plusAnchor);
  const plusAddsParagraphWithoutMenu = plusState.menuHidden === true
    && plusState.added && plusState.nextIsParagraph && plusState.nextFocused;
  // そのまま打った文字は本文になり、メニューは開かないこと。
  await page.keyboard.type("table");
  await page.waitForTimeout(150);
  const plusTyped = await page.evaluate(() => {
    const last = [...document.querySelectorAll("#blocks .block")].at(-1);
    return {
      menuHidden: document.querySelector("#slash-menu")?.hidden,
      isParagraph: Boolean(last?.classList.contains("type-paragraph")),
      text: last?.querySelector(".block-content")?.textContent,
    };
  });
  const plusParagraphTakesPlainText = plusTyped.menuHidden === true && plusTyped.isParagraph && plusTyped.text === "table";
  // 足した段落で「/」を打てば、ふつうに種類を選べること。
  await page.locator("#blocks .block").last().locator(".insert-block").click();
  await page.waitForTimeout(150);
  await page.keyboard.type("/heading1");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const plusSlashState = await page.evaluate(() => {
    const last = [...document.querySelectorAll("#blocks .block")].at(-1);
    return {
      isHeading: Boolean(last?.classList.contains("type-heading1")),
      text: last?.querySelector(".block-content")?.textContent,
      focused: Boolean(last?.contains(document.activeElement)),
    };
  });
  const plusParagraphAcceptsSlashCommand = plusSlashState.isHeading && plusSlashState.text === "" && plusSlashState.focused;

  // IME の変換中はスラッシュメニューを開かず、確定（compositionend）で開くこと。
  // 実際の IME は起こせないので、isComposing 付きの input イベントで代用する。
  await insertBlock(page);
  const imeSlashState = await page.evaluate(() => {
    const editable = document.activeElement?.closest?.("#blocks .block-content");
    if (!editable) return null;
    editable.textContent = "/ta";
    // 実際の IME と同じく、キャレットは打った文字の後ろ(textContent の置き換えでは先頭へ戻る)。
    // スラッシュメニューはキャレットで終わる「/…」だけを追う(v213)。
    const caret = document.createRange();
    caret.selectNodeContents(editable);
    caret.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(caret);
    editable.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, inputType: "insertCompositionText", data: "/ta" }));
    const duringHidden = document.querySelector("#slash-menu")?.hidden;
    editable.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "/ta" }));
    const menu = document.querySelector("#slash-menu");
    return {
      duringHidden,
      afterHidden: menu?.hidden,
      activeType: menu?.querySelector(".menu-item.active")?.dataset.type,
    };
  });
  const slashMenuWaitsForImeCommit = Boolean(imeSlashState && imeSlashState.duringHidden === true &&
    imeSlashState.afterHidden === false && imeSlashState.activeType === "table");
  await page.keyboard.press("Escape");
  // 代用イベントで入れた /ta を片付けて、次のテストへ文字を残さない。
  await page.evaluate(() => {
    const editable = document.activeElement?.closest?.("#blocks .block-content");
    if (!editable) return;
    editable.textContent = "";
    editable.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  });

  await insertBlock(page);
  await page.keyboard.type("Inline `aaa` sample");
  // チップ方式: キャレットが離れた well-formed 範囲はウィジェット1個になり、
  // ソースの真実は data-code。表示にバッククォートは出ない。
  const inlineCodeCreatedFromBackticks = await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "aaa");
    return Boolean(code && code.contentEditable === "false"
      && code.closest(".block-content")?.innerText.replaceAll("​", "") === "Inline aaa sample");
  });
  const inlineCodeDelimitersHiddenWhenInactive = await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "aaa");
    return Boolean(code) && !code.textContent.includes("`");
  });
  // クリックすると素のテキスト(`aaa`)に見せ替わり、その場で編集できる。
  // locator は要素待ちでクラッシュするので、壊れたビルドでも赤で済むよう evaluate で取る。
  const inlineBox = await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "aaa");
    if (!code) return null;
    const rect = code.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (inlineBox) await page.mouse.click(inlineBox.x + inlineBox.width / 2, inlineBox.y + inlineBox.height / 2);
  await page.waitForTimeout(120);
  const inlineCodeDelimitersVisibleWhenEditing = await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("`aaa`"));
    return Boolean(editable) && !editable.querySelector("code.inline-code");
  });
  // ソース先頭(開き ` の直後)へ立てて挿入できる。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("`aaa`"));
    const text = editable ? [...editable.childNodes].find((item) => item.nodeType === Node.TEXT_NODE && item.nodeValue.includes("`aaa`")) : null;
    if (!text) return;
    editable.focus();
    const range = document.createRange();
    range.setStart(text, text.nodeValue.indexOf("`aaa`") + 1);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type("X");
  // 判定は、ソースの外の先頭(開き ` の手前)に打てること(← 連打の後で見る)と合わせて inlineCodeCanInsertAtStart にまとめる。
  const inlineCodeCanInsertAtInnerStart = await page.evaluate(() => (
    [...document.querySelectorAll(".block-content")].some((item) => item.textContent.includes("`Xaaa`"))
  ));
  // 閉じ ` の手前でも挿入できる。
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("`Xaaa`"));
    const text = editable ? [...editable.childNodes].find((item) => item.nodeType === Node.TEXT_NODE && item.nodeValue.includes("`Xaaa`")) : null;
    if (!text) return;
    editable.focus();
    const range = document.createRange();
    range.setStart(text, text.nodeValue.indexOf("`Xaaa`") + 5);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type("Z");
  const inlineCodeCanBeEdited = await page.evaluate(() => (
    [...document.querySelectorAll(".block-content")].some((item) => item.textContent.includes("`XaaaZ`"))
  ));
  // ソースの外(範囲より右)へ出るとウィジェットへ戻る。
  for (let index = 0; index < 2; index++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const inlineCodeArrowRightMovesOutside = await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "XaaaZ");
    const selection = getSelection();
    return Boolean(code) && !code.contains(selection.anchorNode);
  });
  // ← 連打: 進入の1手でソース末尾の1つ内側(6)に立ち、以後は1手1位置で 0 まで。
  // "`XaaaZ`" は7文字。
  const codeWalkState = () => page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Inline") && item.textContent.includes("sample"));
    const selection = getSelection();
    if (!editable || !selection?.rangeCount || !editable.contains(selection.anchorNode)) return null;
    if (editable.querySelector("code.inline-code")) return "widget";
    const sourceStart = editable.textContent.indexOf("`");
    const prefix = document.createRange();
    prefix.selectNodeContents(editable);
    prefix.setEnd(selection.anchorNode, selection.anchorOffset);
    return prefix.toString().length - sourceStart;
  });
  const inlineCodeLeftCursorSequence = [];
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(80);
    inlineCodeLeftCursorSequence.push(await codeWalkState());
  }
  const inlineCodeLeftMovesOncePerPosition = JSON.stringify(inlineCodeLeftCursorSequence.slice(1))
    === JSON.stringify([6, 5, 4, 3, 2, 1, 0]);
  // ソースの先頭(0。開き ` の手前=ソースの外の先頭)でも文字を打てる(旧ジャンプ実装では打てなかった。
  // もとは mathSuite の inlineCodeCaretReachesBothEnds が見ていた)。打った字は消して、→ 連打を 0 から始める。
  await page.keyboard.type("W");
  await page.waitForTimeout(150);
  const inlineCodeTextAfterOuterStartInsert = await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Inline") && item.textContent.includes("sample"));
    return editable ? editable.textContent.replaceAll("​", "") : null;
  });
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  const inlineCodeInsertAtStartEvidence = {
    innerStart: inlineCodeCanInsertAtInnerStart,
    outerStartText: inlineCodeTextAfterOuterStartInsert,
  };
  const inlineCodeCanInsertAtStart = inlineCodeCanInsertAtInnerStart
    && Boolean(inlineCodeTextAfterOuterStartInsert?.includes("Inline W`XaaaZ` sample"));
  // → 連打: 1手1位置で末尾(7)まで立てて、次の1手で外に出てウィジェットへ戻る。
  const inlineCodeRightCursorSequence = [];
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(80);
    inlineCodeRightCursorSequence.push(await codeWalkState());
  }
  const inlineCodeRightMovesOncePerPosition = JSON.stringify(inlineCodeRightCursorSequence)
    === JSON.stringify([1, 2, 3, 4, 5, 6, 7, "widget"]);
  // ウィジェット直後(要素境界)にも普通に文字を打てる。
  await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "XaaaZ");
    if (!code) return;
    const editable = code.closest(".block-content");
    editable.focus();
    const range = document.createRange();
    range.setStartAfter(code);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type("!");
  await page.waitForTimeout(120);
  const inlineCodeArrowRightExits = await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "XaaaZ");
    return code?.nextSibling?.nodeType === Node.TEXT_NODE && code.nextSibling.nodeValue.startsWith("!");
  });
  // ウィジェットの左隣からの Delete は、普通のテキストとして開き ` を1文字消す
  // (構文が壊れて素のテキストへ戻り、キャレットが離れてもテキストのまま)。
  await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "XaaaZ");
    if (!code) return;
    const editable = code.closest(".block-content");
    editable.focus();
    const range = document.createRange();
    range.setStartBefore(code);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Delete");
  await page.waitForTimeout(150);
  const inlineCodeOpeningDelimiterCanBeDeleted = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("XaaaZ`!"));
    return Boolean(row && !row.querySelector("code.inline-code")
      && row.textContent.replaceAll("​", "") === "Inline XaaaZ`! sample");
  });
  // 残った ` も普通に消せる(以後ただのテキスト)。
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("XaaaZ`"));
    const text = row ? [...row.childNodes].find((item) => item.nodeType === Node.TEXT_NODE && item.nodeValue.includes("XaaaZ`")) : null;
    if (!text) return;
    row.focus();
    const range = document.createRange();
    range.setStart(text, text.nodeValue.indexOf("`") + 1);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  const inlineCodeRemainingDelimiterCanBeDeleted = await page.evaluate(() => (
    [...document.querySelectorAll(".block-content")].some((item) => (
      item.textContent.replaceAll("​", "") === "Inline XaaaZ! sample" && !item.querySelector("code.inline-code")
    ))
  ));

  await insertBlock(page);
  await page.keyboard.type("Delete `edge` sample");
  // ウィジェット右隣からの Backspace は閉じ ` を1文字消す。
  await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "edge");
    if (!code) return;
    const editable = code.closest(".block-content");
    editable.focus();
    const range = document.createRange();
    range.setStartAfter(code);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(150);
  const inlineCodeClosingDelimiterCanBeDeleted = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.replaceAll("​", "") === "Delete `edge sample");
    return Boolean(row && !row.querySelector("code.inline-code"));
  });

  await insertBlock(page);
  await page.keyboard.type("Export `persisted` code");
  await page.keyboard.press("Home");
  await page.waitForTimeout(150);
  const inlineCodeKeptForExport = await page.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.dataset.code === "persisted");
    return Boolean(code && code.closest(".block-content")?.innerText.replaceAll("​", "") === "Export persisted code");
  });
  await insertBlock(page);
  await page.keyboard.type("Format tools sample");
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Format tools sample"));
    const text = content.firstChild;
    const selection = getSelection();
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    selection.removeAllRanges();
    selection.addRange(range);
    content.focus();
  });
  await page.locator("#format-bold").click();
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Format tools sample"));
    const selection = getSelection();
    const range = document.createRange();
    range.setStart(content.firstChild.nextSibling || content.firstChild, 0);
    range.setEnd(content.lastChild, content.lastChild.textContent.length);
    selection.removeAllRanges();
    selection.addRange(range);
    content.focus();
  });
  await page.locator("#format-italic").click();
  await page.locator("#format-strike").click();
  // 「Unsaved」の表示を撤去したままであること(判定は後段の removedFeaturesStayGone にまとめる)。
  const unsavedStatusRemoved = await page.evaluate(() => {
    const status = document.querySelector("#status");
    return Boolean(status?.classList.contains("sr-only") && !document.body.innerText.includes("Unsaved"));
  });
  const backgroundColorStartsUnset = await page.evaluate(() => {
    const trigger = document.querySelector("#format-background-trigger");
    const indicator = document.querySelector("#format-background-indicator");
    const glyph = trigger?.querySelector(".background-glyph");
    const selectedSwatch = document.querySelector("#format-background-menu [aria-checked='true']");
    return trigger?.getAttribute("aria-label") === "Background color: None"
      && indicator?.classList.contains("is-none")
      && getComputedStyle(glyph).backgroundColor === "rgba(0, 0, 0, 0)"
      && !selectedSwatch;
  });
  await page.locator("#format-color-trigger").click();
  const standardTextColorPaletteAvailable = await page.locator("#format-color-menu [role='menuitemradio']").evaluateAll((items) => {
    const firstColors = items.slice(0, 4).map((item) => item.getAttribute("aria-label"));
    return items.length === 10 && firstColors.join("|") === "Black text color|Red text color|Blue text color|Green text color";
  });
  await page.getByRole("menuitemradio", { name: "Red text color" }).click();
  const standardTextColorApplied = await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Format tools sample"));
    const colored = content ? [...content.querySelectorAll("*")].some((item) => getComputedStyle(item).color === "rgb(193, 63, 47)") : false;
    return colored && document.querySelector("#format-color-menu")?.hidden;
  });
  await page.locator("#format-background-trigger").click();
  const standardBackgroundColorPaletteAvailable = await page.locator("#format-background-menu [role='menuitemradio']").evaluateAll((items) => {
    const firstColors = items.slice(0, 5).map((item) => item.getAttribute("aria-label"));
    return items.length === 10 && firstColors.join("|") === "White background color|Gray background color|Red background color|Blue background color|Green background color";
  });
  await page.getByRole("menuitemradio", { name: "Yellow background color" }).click();
  const standardBackgroundColorApplied = await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Format tools sample"));
    const highlighted = content ? [...content.querySelectorAll("*")].some((item) => getComputedStyle(item).backgroundColor === "rgb(255, 241, 168)") : false;
    return highlighted && document.querySelector("#format-background-menu")?.hidden;
  });
  const inlineFormatToolbarWorks = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("Format tools sample"));
    const html = row?.querySelector(".block-content")?.innerHTML || "";
    return /<(b|strong)>/.test(html) && /<(i|em)>/.test(html) && /<(s|strike|del)>/.test(html) && html.includes("color") && html.includes("background");
  });

  await insertBlock(page);
  await page.keyboard.type("Custom sync ");
  await page.locator("#format-color-trigger").click();
  await page.locator("#format-color").evaluate((input) => {
    input.value = "#d6b400";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.keyboard.type("yellow");
  await clickNeutralArea(page);
  const customTextColorAppliesOnInput = await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("yellow")) break;
    }
    return Boolean(node
      && getComputedStyle(node.parentElement).color === "rgb(214, 180, 0)"
      && document.querySelector("#format-color-menu")?.hidden);
  });
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("yellow")) break;
    }
    content.focus();
    const range = document.createRange();
    range.setStart(node, node.nodeValue.indexOf("yellow") + 2);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await nextFrames(page);
  const customTextColorToolbarFollowsCaret = await page.evaluate(() => {
    const trigger = document.querySelector("#format-color-trigger");
    const indicator = document.querySelector("#format-color-indicator");
    return trigger?.getAttribute("aria-label") === "Text color: Custom"
      && getComputedStyle(indicator).backgroundColor === "rgb(214, 180, 0)";
  });
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("Custom sync")) break;
    }
    content.focus();
    const range = document.createRange();
    range.setStart(node, 2);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await nextFrames(page);
  const textColorToolbarReturnsToPlainCaret = await page.evaluate(() => {
    const trigger = document.querySelector("#format-color-trigger");
    const indicator = document.querySelector("#format-color-indicator");
    const selected = document.querySelector("#format-color-menu [aria-checked='true']");
    return trigger?.getAttribute("aria-label") === "Text color: Black"
      && getComputedStyle(indicator).backgroundColor === "rgb(32, 33, 36)"
      && selected?.getAttribute("aria-label") === "Black text color";
  });

  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("Custom sync")) break;
    }
    content.focus();
    const range = document.createRange();
    range.setStart(node, node.nodeValue.indexOf("Custom"));
    range.setEnd(node, node.nodeValue.indexOf("Custom") + "Custom".length);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#format-background-trigger").click();
  await page.locator("#format-background").evaluate((input) => {
    input.value = "#b8f0c8";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickNeutralArea(page);
  const customBackgroundColorAppliesOnInput = await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("Custom")) break;
    }
    return Boolean(node && getComputedStyle(node.parentElement).backgroundColor === "rgb(184, 240, 200)");
  });
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("Custom")) break;
    }
    content.focus();
    const range = document.createRange();
    range.setStart(node, node.nodeValue.indexOf("Custom") + 2);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await nextFrames(page);
  const customBackgroundToolbarFollowsCaret = await page.evaluate(() => {
    const trigger = document.querySelector("#format-background-trigger");
    const indicator = document.querySelector("#format-background-indicator");
    return trigger?.getAttribute("aria-label") === "Background color: Custom"
      && getComputedStyle(indicator).backgroundColor === "rgb(184, 240, 200)";
  });
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("sync")) break;
    }
    content.focus();
    const range = document.createRange();
    range.setStart(node, node.nodeValue.indexOf("sync") + 2);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await nextFrames(page);
  const backgroundToolbarReturnsToUnsetCaret = await page.evaluate(() => {
    const trigger = document.querySelector("#format-background-trigger");
    const indicator = document.querySelector("#format-background-indicator");
    return trigger?.getAttribute("aria-label") === "Background color: None"
      && indicator?.classList.contains("is-none")
      && !document.querySelector("#format-background-menu [aria-checked='true']");
  });

  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("Custom")) break;
    }
    content.focus();
    const range = document.createRange();
    range.setStart(node, node.nodeValue.indexOf("Custom") + "Custom".length);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#format-background-trigger").click();
  await page.getByRole("menuitemradio", { name: "Blue background color" }).click();
  const backgroundToolbarShowsNewPendingColor = await page.evaluate(() => {
    const trigger = document.querySelector("#format-background-trigger");
    const indicator = document.querySelector("#format-background-indicator");
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Custom sync yellow"));
    const existingGreen = [...content.querySelectorAll("*")].some((item) => item.textContent.includes("Custom")
      && getComputedStyle(item).backgroundColor === "rgb(184, 240, 200)");
    return trigger?.getAttribute("aria-label") === "Background color: Blue"
      && getComputedStyle(indicator).backgroundColor === "rgb(223, 238, 253)"
      && existingGreen;
  });
  await page.keyboard.type("B");
  const pendingBackgroundColorAppliesToTyping = await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("CustomB sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("B")) break;
    }
    return Boolean(node && getComputedStyle(node.parentElement).backgroundColor === "rgb(223, 238, 253)");
  });
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("CustomB sync yellow"));
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("Custom")) break;
    }
    content.focus();
    const range = document.createRange();
    range.setStart(node, node.nodeValue.indexOf("Custom") + 2);
    range.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await nextFrames(page);
  const backgroundToolbarReturnsToExistingColorAfterMove = await page.evaluate(() => {
    const trigger = document.querySelector("#format-background-trigger");
    const indicator = document.querySelector("#format-background-indicator");
    return trigger?.getAttribute("aria-label") === "Background color: Custom"
      && getComputedStyle(indicator).backgroundColor === "rgb(184, 240, 200)";
  });

  await insertBlock(page);
  await page.keyboard.type("Backspace sync target");
  await page.keyboard.press("Enter");
  await page.locator("#format-background-trigger").click();
  await page.locator("#format-background").evaluate((input) => {
    input.value = "#f3c4dd";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.keyboard.press("Backspace");
  await nextFrames(page);
  const backgroundToolbarSyncsAfterBlockBackspace = await page.evaluate(() => {
    const active = document.activeElement?.closest?.(".block-content");
    const trigger = document.querySelector("#format-background-trigger");
    const indicator = document.querySelector("#format-background-indicator");
    return active?.textContent === "Backspace sync target"
      && trigger?.getAttribute("aria-label") === "Background color: None"
      && indicator?.classList.contains("is-none")
      && !document.querySelector("#format-background-menu [aria-checked='true']");
  });

  await insertBlock(page);
  await page.keyboard.type("Colored backspace target");
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent === "Colored backspace target");
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator("#format-background-trigger").click();
  await page.locator("#format-background").evaluate((input) => {
    input.value = "#b8f0c8";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent === "Colored backspace target");
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  await nextFrames(page);
  const backgroundToolbarUsesPreviousInlineStyleAfterBackspace = await page.evaluate(() => {
    const active = document.activeElement?.closest?.(".block-content");
    const trigger = document.querySelector("#format-background-trigger");
    const indicator = document.querySelector("#format-background-indicator");
    return active?.textContent === "Colored backspace target"
      && trigger?.getAttribute("aria-label") === "Background color: Custom"
      && getComputedStyle(indicator).backgroundColor === "rgb(184, 240, 200)";
  });
  await page.keyboard.type("X");
  const backspaceDestinationTypingMatchesBackgroundToolbar = await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent === "Colored backspace targetX");
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("targetX")) break;
    }
    return Boolean(node && getComputedStyle(node.parentElement).backgroundColor === "rgb(184, 240, 200)");
  });
  // ここまでの文字色・背景色のキャレット追従は、同じ文書で続けて見ている12場面を3件の判定にまとめ、
  // 場面ごとの結果を証拠(…Evidence)に残す(赤になったら証拠のどれが false かで壊れた場面が分かる)。
  const textColorToolbarEvidence = {
    customTextColorAppliesOnInput,
    customTextColorToolbarFollowsCaret,
    textColorToolbarReturnsToPlainCaret,
  };
  const textColorToolbarFollowsCaret = Object.values(textColorToolbarEvidence).every((value) => value === true);
  const backgroundToolbarEvidence = {
    customBackgroundColorAppliesOnInput,
    customBackgroundToolbarFollowsCaret,
    backgroundToolbarReturnsToUnsetCaret,
    backgroundToolbarShowsNewPendingColor,
    pendingBackgroundColorAppliesToTyping,
    backgroundToolbarReturnsToExistingColorAfterMove,
  };
  const backgroundToolbarFollowsCaret = Object.values(backgroundToolbarEvidence).every((value) => value === true);
  const backgroundAfterBackspaceEvidence = {
    backgroundToolbarSyncsAfterBlockBackspace,
    backgroundToolbarUsesPreviousInlineStyleAfterBackspace,
    backspaceDestinationTypingMatchesBackgroundToolbar,
  };
  const backgroundToolbarFollowsBackspace = Object.values(backgroundAfterBackspaceEvidence).every((value) => value === true);

  await page.setViewportSize({ width: 320, height: 720 });
  await page.locator("#format-background-trigger").click();
  const colorPaletteFitsNarrowViewport = await page.evaluate(() => {
    const menu = document.querySelector("#format-background-menu");
    const rect = menu?.getBoundingClientRect();
    return Boolean(menu && !menu.hidden && rect.left >= 9 && rect.right <= window.innerWidth - 9 && rect.top >= 9 && rect.bottom <= window.innerHeight - 9);
  });
  await page.keyboard.press("Escape");
  const colorPaletteClosesOnEscape = await page.locator("#format-background-menu").evaluate((menu) => menu.hidden);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("#format-background-trigger").click();
  // 固定座標で押すと、左にページ目次が出て画面が右へずれたとき(v131)パレットの中を押してしまう。
  // 「何もない場所」を要素の位置から求めて押す。
  await clickNeutralArea(page);
  const colorPaletteClosesOnOutsideClick = await page.locator("#format-background-menu").evaluate((menu) => menu.hidden);

  await insertBlock(page);
  await page.keyboard.type("Reset format sample");
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Reset format sample"));
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    selection.removeAllRanges();
    selection.addRange(range);
    content.focus();
  });
  await page.locator("#format-bold").click();
  await page.locator("#format-italic").click();
  await page.locator("#format-strike").click();
  await page.locator("#format-color-trigger").click();
  await page.getByRole("menuitemradio", { name: "Green text color" }).click();
  await page.locator("#format-background-trigger").click();
  await page.getByRole("menuitemradio", { name: "Blue background color" }).click();
  // 解除の前に書式が付いていたこと(前提)は、下の inlineFormatResetWorks へ AND で畳み、HTML を証拠に残す。
  const inlineResetHtmlBefore = await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Reset format sample"));
    return content?.innerHTML || "";
  });
  const inlineResetHadFormatting = /<(b|strong)>/.test(inlineResetHtmlBefore) && /<(i|em)>/.test(inlineResetHtmlBefore)
    && /<(s|strike|del)>/.test(inlineResetHtmlBefore) && inlineResetHtmlBefore.includes("color") && inlineResetHtmlBefore.includes("background");
  await page.evaluate(() => {
    const content = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Reset format sample"));
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(content);
    selection.removeAllRanges();
    selection.addRange(range);
    content.focus();
  });
  await page.locator("#format-reset").click();
  const inlineResetAfter = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("Reset format sample"));
    const content = row?.querySelector(".block-content");
    const html = content?.innerHTML || "";
    return {
      html,
      cleared: Boolean(row?.classList.contains("type-paragraph") &&
        content?.textContent === "Reset format sample" &&
        !/<(b|strong|i|em|s|strike|del|span)/.test(html) &&
        !html.includes("color") &&
        !html.includes("background")),
    };
  });
  const inlineFormatResetEvidence = { hadFormatting: inlineResetHadFormatting, htmlBefore: inlineResetHtmlBefore, ...inlineResetAfter };
  const inlineFormatResetWorks = inlineResetHadFormatting && inlineResetAfter.cleared;

  await insertBlock(page);
  await page.keyboard.type("/toggle heading 1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Toggle H1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Nested under toggle");
  const toggleHeadingCreated = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block.type-toggleHeading1")].find((item) => item.innerText.includes("Toggle H1"));
    return Boolean(row?.classList.contains("type-toggleHeading1") && row.querySelector(".toggle-caret"));
  });
  const toggleCreatesNestedBlock = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("Nested under toggle"));
    return row?.dataset.indent === "1";
  });
  await page.locator(".block", { hasText: "Toggle H1" }).locator(".toggle-caret").click();
  const toggleCollapseHidesNestedBlock = await page.evaluate(() => ![...document.querySelectorAll(".block")].some((item) => item.innerText.includes("Nested under toggle")));
  await page.locator(".block", { hasText: "Toggle H1" }).locator(".toggle-caret").click();
  const toggleReopenShowsNestedBlock = await page.evaluate(() => [...document.querySelectorAll(".block")].some((item) => item.innerText.includes("Nested under toggle")));
  const toggleHeadingHandleOnFirstLine = await page.evaluate(() => {
    const block = [...document.querySelectorAll(".block.type-toggleHeading1")].find((row) => row.innerText.includes("Toggle H1"));
    const content = block?.querySelector(".block-content");
    const grip = block?.querySelector(".drag-grip");
    if (!content || !grip) return false;
    const range = document.createRange();
    range.setStart(content.firstChild, 0);
    range.setEnd(content.firstChild, content.textContent.length);
    const lineRect = range.getBoundingClientRect();
    const gripRect = grip.getBoundingClientRect();
    return Math.abs((lineRect.top + lineRect.height / 2) - (gripRect.top + gripRect.height / 2)) < 1.25;
  });
  const tocItemsLeftAlignedAndIndented = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".toc-item")];
    const level1 = items.find((item) => item.classList.contains("level-1"));
    const level2 = items.find((item) => item.classList.contains("level-2"));
    const level3 = items.find((item) => item.classList.contains("level-3"));
    if (!level1 || !level2 || !level3) return false;
    const style1 = getComputedStyle(level1);
    const style2 = getComputedStyle(level2);
    const style3 = getComputedStyle(level3);
    return style1.textAlign === "left" &&
      Number.parseFloat(style1.paddingLeft) < Number.parseFloat(style2.paddingLeft) &&
      Number.parseFloat(style2.paddingLeft) < Number.parseFloat(style3.paddingLeft);
  });
  const tocPanelHasDistinctSurface = await page.evaluate(() => {
    const panel = document.querySelector(".type-toc .block-content");
    const title = panel?.querySelector(".toc-title");
    if (!panel || title?.textContent !== "Table of contents") return false;
    const panelStyle = getComputedStyle(panel);
    const bodyStyle = getComputedStyle(document.body);
    return panelStyle.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      panelStyle.backgroundColor !== bodyStyle.backgroundColor &&
      Number.parseFloat(panelStyle.borderLeftWidth) >= 2 &&
      panelStyle.borderLeftStyle !== "none";
  });

  await insertBlock(page);
  await page.keyboard.type("/toggle");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Toggle list item");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Toggle list sibling");
  const toggleListCreated = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("Toggle list item"));
    return Boolean(row?.classList.contains("type-toggle") && row.querySelector(".toggle-caret"));
  });
  const toggleListEnterKeepsIndent = await page.evaluate(() => {
    const first = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("Toggle list item"));
    const second = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("Toggle list sibling"));
    return first?.dataset.indent === second?.dataset.indent && second?.classList.contains("type-toggle");
  });

  const bulletOne = page.locator(".block", { hasText: "Bullet one" });
  const bulletTwoGrip = page.locator(".block", { hasText: "Bullet two" }).locator(".drag-grip");
  await bulletOne.scrollIntoViewIfNeeded();
  await bulletTwoGrip.scrollIntoViewIfNeeded();
  const sourceHandle = await bulletTwoGrip.boundingBox();
  const targetBlock = await bulletOne.boundingBox();
  if (sourceHandle && targetBlock) {
    await page.mouse.move(sourceHandle.x + sourceHandle.width / 2, sourceHandle.y + sourceHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBlock.x + targetBlock.width / 2, targetBlock.y + 2, { steps: 12 });
    await page.mouse.up();
  }
  const dragMoved = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".block")].map((row) => row.innerText);
    return rows.findIndex((text) => text.includes("Bullet two")) < rows.findIndex((text) => text.includes("Bullet one"));
  });
  const verticalDragDoesNotCreateColumns = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".block")].filter((row) => row.innerText.includes("Bullet one") || row.innerText.includes("Bullet two"));
    return rows.length === 2 && rows.every((row) => !row.dataset.columnGroup);
  });
  const moveArrowButtonsRemoved = await page.evaluate(() => (
    document.querySelectorAll('.handle button[aria-label="Move up"], .handle button[aria-label="Move down"]').length === 0
  ));
  // 撤去した機能が戻っていないこと(同梱フォント・ハンドルの ↑↓・「Unsaved」の表示・書体一覧の混在用の空の項目)。
  // 前段で場面ごとに見たものを1件の判定にまとめ、場面ごとの結果を証拠(removedFeaturesEvidence)に残す。
  const removedFeaturesEvidence = {
    bundledFontsAreGone,
    bundledFontListing: { bundledFaces: osFontListing.bundledFaces, stylesheetLinks: osFontListing.stylesheetLinks },
    moveArrowButtonsRemoved,
    unsavedStatusRemoved,
    mixedFontOptionStaysHidden,
  };
  const removedFeaturesStayGone = bundledFontsAreGone && moveArrowButtonsRemoved && unsavedStatusRemoved && mixedFontOptionStaysHidden;
  await page.locator(".block.type-heading5", { hasText: "H5 shortcut" }).locator(".drag-grip").click();
  const gripClickSelectsBlock = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("H5 shortcut"));
    return Boolean(row?.classList.contains("selected"));
  });
  // v125 からハンドルのクリックはブロックのメニューも開く(選択は従来どおり)。
  // キーボードはメニューの検索欄にあるので、ブロックへの Delete は閉じてから。
  const gripClickOpensBlockMenu = await page.evaluate(() => !document.querySelector("#block-menu").hidden);
  await page.keyboard.press("Escape");
  const blockMenuEscapeKeepsSelection = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".block")].find((item) => item.innerText.includes("H5 shortcut"));
    return document.querySelector("#block-menu").hidden
      && Boolean(row?.classList.contains("selected"))
      && document.activeElement?.classList.contains("drag-grip");
  });
  await page.keyboard.press("Delete");
  const deleteRemovesSelectedBlock = await page.evaluate(() => ![...document.querySelectorAll(".block")].some((row) => row.innerText.includes("H5 shortcut")));
  await page.keyboard.press("Control+Z");
  const undoRestoresDeletedBlock = await page.evaluate(() => [...document.querySelectorAll(".block")].some((row) => row.innerText.includes("H5 shortcut")));
  await page.keyboard.press("Control+Y");
  const redoDeletesBlockAgain = await page.evaluate(() => ![...document.querySelectorAll(".block")].some((row) => row.innerText.includes("H5 shortcut")));

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.mouse.click(1210, 700);
  await page.keyboard.type(" end click");
  const blankClickFocusedEnd = await page.evaluate(() => [...document.querySelectorAll(".block")].at(-1)?.innerText.includes("end click"));

  await insertBlock(page);
  await page.keyboard.type("First selectable block");
  await insertBlock(page);
  await page.keyboard.type("Second selectable block");
  const crossBlockSelectionPoints = await page.evaluate(() => {
    const first = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("First selectable block"));
    const second = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("Second selectable block"));
    if (!first || !second) return null;
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();
    return {
      start: { x: firstRect.left + 8, y: firstRect.top + firstRect.height / 2 },
      end: { x: secondRect.right - 8, y: secondRect.top + secondRect.height / 2 },
    };
  });
  if (crossBlockSelectionPoints) {
    await page.mouse.move(crossBlockSelectionPoints.start.x, crossBlockSelectionPoints.start.y);
    await page.mouse.down();
    await page.mouse.move(crossBlockSelectionPoints.end.x, crossBlockSelectionPoints.end.y, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  // ブロックをまたぐドラッグは、2つのブロックの選択になる(v206)。
  const crossBlockMouseSelectionWorks = await page.evaluate(() => {
    const selected = [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.innerText).join("|");
    return selected.includes("First selectable block") && selected.includes("Second selectable block");
  });

  // ダブルクリックで単語、トリプルクリックで行(ブロック)を選べること。
  const wordTarget = page.locator(".block-content", { hasText: "Second selectable block" });
  await wordTarget.dblclick({ position: { x: 24, y: 12 } });
  const doubleClickSelectsWord = await page.evaluate(() => {
    const selected = getSelection().toString().trim();
    return selected === "Second" && !getSelection().isCollapsed;
  });
  await wordTarget.click({ clickCount: 3, position: { x: 24, y: 12 } });
  const tripleClickSelectsBlock = await page.evaluate(() => (
    getSelection().toString().trim() === "Second selectable block"
  ));
  // トリプルクリックの直後に同じ場所をクリックしたら、選択が解除されること。
  await wordTarget.click({ clickCount: 4, position: { x: 24, y: 12 } });
  await page.waitForTimeout(60);
  const clickAfterTripleClickClearsSelection = await page.evaluate(() => (
    getSelection().isCollapsed && getSelection().toString() === ""
  ));

  // ダブルクリックで選んだ単語を、続けて入力して置き換えられること。
  await wordTarget.dblclick({ position: { x: 24, y: 12 } });
  await page.keyboard.type("Replaced");
  const doubleClickSelectionCanBeTyped = await page.evaluate(() => (
    [...document.querySelectorAll(".block-content")].some((item) => item.textContent.startsWith("Replaced"))
  ));

  // 最後のブロックで、選択されているテキストの上を単独クリックしても解除されること。
  // 文書の末尾は表のことがある。セルの Enter はブロックを作らなくなったので、
  // ＋ボタンで最終ブロックの直下に段落を作ってから打つ。
  await page.locator("#blocks .block").last().locator(".insert-block").click();
  await page.keyboard.type("Last block selection target");
  const lastBlockContent = page.locator("#blocks .block-content").last();
  await lastBlockContent.click({ clickCount: 3, position: { x: 20, y: 12 } });
  // トリプルクリックで選べていたこと(前提)は、下の clickOnSelectionInLastBlockClears へ AND で畳む。
  const lastBlockSelectedText = await page.evaluate(() => getSelection().toString());
  // クリック回数をリセットしてから、選択範囲の上をクリックする。
  await page.waitForTimeout(600);
  await lastBlockContent.click({ position: { x: 40, y: 12 } });
  const lastBlockSelectionAfterClick = await page.evaluate(() => ({
    collapsed: getSelection().isCollapsed,
    text: getSelection().toString(),
  }));
  const clickOnSelectionInLastBlockEvidence = { selectedBeforeClick: lastBlockSelectedText, afterClick: lastBlockSelectionAfterClick };
  const clickOnSelectionInLastBlockClears = lastBlockSelectedText.includes("Last block selection target")
    && lastBlockSelectionAfterClick.collapsed && lastBlockSelectionAfterClick.text === "";

  // 複数クリックのあとも、ブロックは編集可能なまま保たれること。
  const multiClickKeepsBlocksEditable = await page.evaluate(() => (
    [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.dataset.restoreEditable).length === 0
  ));

  for (const text of ["Column exit target", "Column A", "Column B", "Column C", "Column D"]) {
    await insertBlock(page);
    await page.keyboard.type(text);
  }
  await dragBlock(page, "Column B", "Column A", "right");
  const twoColumnLayoutCreated = await page.evaluate(() => {
    const a = [...document.querySelectorAll(".block")].find((row) => row.innerText.includes("Column A"));
    const b = [...document.querySelectorAll(".block")].find((row) => row.innerText.includes("Column B"));
    const layout = a?.closest(".column-layout");
    if (!a || !b || !layout || layout !== b.closest(".column-layout")) return false;
    const columns = [...layout.querySelectorAll(":scope > .column")];
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    return columns.length === 2 && a.dataset.columnIndex === "0" && b.dataset.columnIndex === "1" && bRect.left > aRect.left;
  });
  await page.keyboard.press("Control+Z");
  const columnCreationUndoWorks = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".block")].filter((row) => row.innerText.includes("Column A") || row.innerText.includes("Column B"));
    return rows.length === 2 && rows.every((row) => !row.dataset.columnGroup);
  });
  await page.keyboard.press("Control+Y");
  const columnCreationRedoWorks = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".block")].filter((row) => row.innerText.includes("Column A") || row.innerText.includes("Column B"));
    return rows.length === 2 && rows.every((row) => row.dataset.columnGroup) && rows[0].dataset.columnGroup === rows[1].dataset.columnGroup;
  });
  const columnAContent = page.locator(".block", { hasText: "Column A" }).locator(".block-content");
  await columnAContent.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Column A child");
  const enterKeepsBlockInColumn = await page.evaluate(() => {
    const a = [...document.querySelectorAll(".block")].find((row) => row.innerText.trim() === "Column A");
    const child = [...document.querySelectorAll(".block")].find((row) => row.innerText.includes("Column A child"));
    return Boolean(a?.dataset.columnGroup && child?.dataset.columnGroup === a.dataset.columnGroup && child?.dataset.columnIndex === a.dataset.columnIndex);
  });
  await dragBlock(page, "Column C", "Column B", "right");
  const threeColumnLayoutCreated = await page.evaluate(() => {
    const layout = [...document.querySelectorAll(".column-layout")].find((item) => item.innerText.includes("Column A"));
    const columns = layout ? [...layout.querySelectorAll(":scope > .column")] : [];
    const lefts = columns.map((column) => Math.round(column.getBoundingClientRect().left));
    return columns.length === 3 && new Set(lefts).size === 3;
  });
  // 列の数の上限(fmt.MAX_COLUMNS)は columnLimitSuite で確かめる(v262。#142)。ここでは D を C の列の下へ入れる
  // (以前は右端へのドラッグが 4 列目を作らずに C の列へ入ることを見ていた。後の手順は D が C の列にいる前提)。
  await dragBlock(page, "Column D", "Column C", "after");
  const firstColumnBeforeResize = await page.locator(".column-layout", { hasText: "Column A" }).locator(":scope > .column").first().boundingBox();
  const firstResizer = page.locator(".column-layout", { hasText: "Column A" }).locator(":scope > .column-resizer").first();
  const firstResizerRect = await firstResizer.boundingBox();
  if (firstResizerRect) {
    await page.mouse.move(firstResizerRect.x + firstResizerRect.width / 2, firstResizerRect.y + 20);
    await page.mouse.down();
    await page.mouse.move(firstResizerRect.x + firstResizerRect.width / 2 + 36, firstResizerRect.y + 20, { steps: 10 });
    await page.mouse.up();
  }
  const firstColumnAfterResize = await page.locator(".column-layout", { hasText: "Column A" }).locator(":scope > .column").first().boundingBox();
  const columnWidthsCanBeResized = Boolean(
    firstColumnBeforeResize && firstColumnAfterResize && firstColumnAfterResize.width > firstColumnBeforeResize.width + 20
  );
  await firstResizer.focus();
  await page.keyboard.press("ArrowLeft");
  const firstColumnAfterKeyboardResize = await page.locator(".column-layout", { hasText: "Column A" }).locator(":scope > .column").first().boundingBox();
  const columnWidthsCanBeResizedWithKeyboard = Boolean(
    firstColumnAfterResize && firstColumnAfterKeyboardResize && firstColumnAfterKeyboardResize.width < firstColumnAfterResize.width - 4
  );
  await page.keyboard.press("Control+Z");
  const firstColumnAfterResizeUndo = await page.locator(".column-layout", { hasText: "Column A" }).locator(":scope > .column").first().boundingBox();
  const columnResizeUndoWorks = Boolean(
    firstColumnAfterResize && firstColumnAfterResizeUndo && Math.abs(firstColumnAfterResizeUndo.width - firstColumnAfterResize.width) < 2
  );
  await page.keyboard.press("Control+Y");
  const firstColumnAfterResizeRedo = await page.locator(".column-layout", { hasText: "Column A" }).locator(":scope > .column").first().boundingBox();
  const columnResizeRedoWorks = Boolean(
    firstColumnAfterKeyboardResize && firstColumnAfterResizeRedo && Math.abs(firstColumnAfterResizeRedo.width - firstColumnAfterKeyboardResize.width) < 2
  );
  await dragBlock(page, "Column B", "Column exit target", "after");
  const emptyColumnIsRemoved = await page.evaluate(() => {
    const layout = [...document.querySelectorAll(".column-layout")].find((item) => item.innerText.includes("Column A"));
    const b = [...document.querySelectorAll(".block")].find((row) => row.innerText.includes("Column B"));
    return Boolean(layout && layout.querySelectorAll(":scope > .column").length === 2 && !b?.dataset.columnGroup);
  });
  await dragBlock(page, "Column C", "Column B", "after");
  await dragBlock(page, "Column D", "Column C", "after");
  const columnLayoutUnwrapsWhenOneColumnRemains = await page.evaluate(() => {
    const a = [...document.querySelectorAll(".block")].find((row) => row.innerText.trim() === "Column A");
    const child = [...document.querySelectorAll(".block")].find((row) => row.innerText.includes("Column A child"));
    return Boolean(a && child && !a.dataset.columnGroup && !child.dataset.columnGroup && !a.closest(".column-layout"));
  });
  await page.keyboard.press("Control+Z");
  const columnUndoRestoresLayoutAfterUnwrap = await page.evaluate(() => {
    const layout = [...document.querySelectorAll(".column-layout")].find((item) => item.innerText.includes("Column A"));
    return Boolean(layout && layout.querySelectorAll(":scope > .column").length === 2);
  });
  await page.setViewportSize({ width: 650, height: 720 });
  const columnsStackOnNarrowScreens = await page.evaluate(() => {
    const layout = [...document.querySelectorAll(".column-layout")].find((item) => item.innerText.includes("Column A"));
    const columns = layout ? [...layout.querySelectorAll(":scope > .column")] : [];
    if (columns.length !== 2 || getComputedStyle(layout).display !== "block") return false;
    return columns[1].getBoundingClientRect().top > columns[0].getBoundingClientRect().bottom;
  });
  await page.setViewportSize({ width: 1280, height: 720 });

  const dropTarget = page.locator('.block-content[contenteditable="true"]').first();
  await dropTarget.scrollIntoViewIfNeeded();
  const dropRect = await dropTarget.boundingBox();
  const imageDataTransfer = await page.evaluateHandle(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    context.fillStyle = "#dfeefd";
    context.fillRect(0, 0, 320, 180);
    context.fillStyle = "#0b6bcb";
    context.fillRect(24, 24, 272, 92);
    context.fillStyle = "#16835f";
    context.fillRect(24, 128, 160, 28);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "dropped-image.png", { type: "image/png" }));
    return transfer;
  });
  const dropPoint = {
    clientX: dropRect.x + dropRect.width / 2,
    clientY: dropRect.y + dropRect.height - 2,
    dataTransfer: imageDataTransfer,
  };
  await dropTarget.dispatchEvent("dragenter", dropPoint);
  await dropTarget.dispatchEvent("dragover", dropPoint);
  const fileDropAffordanceVisible = await page.evaluate(() => Boolean(
    document.querySelector(".main.file-drop-active") && document.querySelector(".block.drop-before, .block.drop-after")
  ));
  await dropTarget.dispatchEvent("drop", dropPoint);
  const droppedImage = page.locator('img.attachment-image[alt="dropped-image.png"]');
  await droppedImage.waitFor({ state: "visible" });
  const imageDropCreatesPreview = await droppedImage.evaluate((image) => image.complete && image.naturalWidth === 320 && image.naturalHeight === 180);
  const droppedImageCard = page.locator(".image-attachment-card", { hasText: "dropped-image.png" });
  const imageCaption = droppedImageCard.locator(".image-attachment-caption");
  const imageDetailsHiddenWhenNotSelected = !(await imageCaption.isVisible());
  const imageResizeDisabledWhenNotSelected = await droppedImageCard.locator(".image-resize-handle.is-right").evaluate((handle) => getComputedStyle(handle).pointerEvents === "none");
  await droppedImage.click();
  await imageCaption.waitFor({ state: "visible" });
  const droppedImageMetadataShown = await imageCaption.locator(".attachment-meta").evaluate((meta) => meta.textContent.includes("image/png"));
  const imageControlsShownWhenSelected = await imageCaption.getByRole("button", { name: "Align center", exact: true }).isVisible();
  const inlineImageRectBeforePreview = await droppedImage.boundingBox();
  await droppedImage.dblclick();
  const imageLightbox = page.locator("#image-lightbox");
  const imageLightboxImage = page.locator("#image-lightbox-image");
  await imageLightbox.waitFor({ state: "visible" });
  await imageLightboxImage.waitFor({ state: "visible" });
  const imageLightboxOpensOnDoubleClick = await page.evaluate(() => (
    !document.querySelector("#image-lightbox").hidden &&
    document.body.classList.contains("image-lightbox-open") &&
    document.querySelector(".app").inert
  ));
  const imageLightboxFitsAndEnlarges = await imageLightboxImage.evaluate((image, inlineRect) => {
    const rect = image.getBoundingClientRect();
    const ratioMatches = Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight) < .02;
    const centered = Math.abs((rect.left + rect.right) / 2 - innerWidth / 2) < 2 && Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2) < 2;
    return ratioMatches && centered && rect.width > inlineRect.width && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  }, inlineImageRectBeforePreview);
  const imageLightboxCloseButtonVisible = await page.locator("#image-lightbox-close").isVisible();
  await page.screenshot({ path: join(OUT, "attachment-lightbox-desktop.png") });
  await page.keyboard.press("Escape");
  const imageLightboxEscapeCloses = !(await imageLightbox.isVisible());
  const imageLightboxReturnsFocus = await page.evaluate(() => document.activeElement?.classList.contains("image-attachment-stage"));
  // 背景を押して閉じるのは zoomViewerSuite の zoomImageBackdropCloses が見る。
  await droppedImage.dblclick();
  await imageLightbox.waitFor({ state: "visible" });
  await page.locator("#image-lightbox-close").click();
  const imageLightboxButtonCloses = !(await imageLightbox.isVisible());
  const rightResizeHandle = droppedImageCard.locator(".image-resize-handle.is-right");
  const resizeHandleRect = await rightResizeHandle.boundingBox();
  const imageStageBeforeResize = await droppedImageCard.locator(".image-attachment-stage").boundingBox();
  await page.mouse.move(resizeHandleRect.x + resizeHandleRect.width / 2, resizeHandleRect.y + resizeHandleRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeHandleRect.x - 150, resizeHandleRect.y + resizeHandleRect.height / 2, { steps: 12 });
  await page.mouse.up();
  const resizedImageWidth = Number(await droppedImageCard.getAttribute("data-width"));
  const imageStageAfterResize = await droppedImageCard.locator(".image-attachment-stage").boundingBox();
  const resizedImageRect = await droppedImage.boundingBox();
  const imageRightEdgeResizeWorks = resizedImageWidth >= 20 && resizedImageWidth < 100 && imageStageAfterResize.width < imageStageBeforeResize.width;
  const imageResizePreservesAspectRatio = Math.abs(resizedImageRect.width / resizedImageRect.height - 320 / 180) < .02;
  await page.keyboard.press("Control+Z");
  const imageResizeUndoWorks = Number(await droppedImageCard.getAttribute("data-width")) === 100;
  await page.keyboard.press("Control+Y");
  const imageResizeRedoWorks = Math.abs(Number(await droppedImageCard.getAttribute("data-width")) - resizedImageWidth) < .2;
  await droppedImage.click();
  await imageCaption.waitFor({ state: "visible" });

  async function imageAlignmentMatches(value) {
    await droppedImageCard.getByRole("button", { name: "Align " + value, exact: true }).click();
    return droppedImageCard.evaluate((card, expected) => {
      const stage = card.querySelector(".image-attachment-stage");
      const cardRect = card.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      if (card.dataset.align !== expected) return false;
      if (expected === "left") return Math.abs(stageRect.left - cardRect.left) < 2;
      if (expected === "right") return Math.abs(stageRect.right - cardRect.right) < 2;
      return Math.abs((stageRect.left + stageRect.right) / 2 - (cardRect.left + cardRect.right) / 2) < 2;
    }, value);
  }
  const imageAlignsLeft = await imageAlignmentMatches("left");
  const imageAlignsRight = await imageAlignmentMatches("right");
  const imageAlignsCenter = await imageAlignmentMatches("center");
  // 文字ではなく、ワープロで一般的な行揃えアイコンであること。
  const imageAlignButtonsUseIcons = await droppedImageCard.evaluate((card) => {
    const buttons = [...card.querySelectorAll(".image-align-button")];
    if (buttons.length !== 3) return false;
    const labels = buttons.map((button) => button.getAttribute("aria-label")).join("|");
    return labels === "Align left|Align center|Align right"
      && buttons.every((button) => !button.textContent.trim())
      && buttons.every((button) => button.querySelectorAll("svg.align-icon rect").length === 4)
      // 短い線の位置で向きが分かること（左寄せは左端、右寄せは右端）。
      && buttons[0].querySelectorAll("svg rect")[1].getAttribute("x") === "3"
      && buttons[2].querySelectorAll("svg rect")[1].getAttribute("x") === "9";
  });
  await page.locator(".block", { has: droppedImage }).screenshot({ path: join(OUT, "attachment-preview-selected-desktop.png") });

  await dropTarget.click();
  const imageDetailsHideAfterSelectionMoves = !(await imageCaption.isVisible());
  await dropTarget.evaluate(async (target) => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fde8e5";
    context.fillRect(0, 0, 40, 40);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "pasted-image.png", { type: "image/png" }));
    target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  });
  const pastedImage = page.locator('img.attachment-image[alt="pasted-image.png"]');
  await pastedImage.waitFor({ state: "visible" });
  const imagePasteCreatesPreview = await pastedImage.evaluate((image) => image.complete && image.naturalWidth === 40);

  const chooserPromise = page.waitForEvent("filechooser");
  await openMenu(page, "files");
  await page.locator("#attach-files").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(FIXTURE);
  const pickedAttachment = page.locator(".attachment-file-card", { hasText: "fixture.txt" });
  await pickedAttachment.waitFor({ state: "visible" });
  const attachmentPickerWorks = await pickedAttachment.isVisible();
  const editorDownloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await pickedAttachment.locator(".attachment-download").click();
  const editorDownload = await editorDownloadPromise;
  const editorAttachmentDownloadWorks = editorDownload.suggestedFilename() === "fixture.txt";
  const imagePreviewBlock = page.locator(".block", { has: droppedImage });
  await imagePreviewBlock.screenshot({ path: join(OUT, "attachment-preview-desktop.png") });
  await page.setViewportSize({ width: 390, height: 720 });
  await imagePreviewBlock.scrollIntoViewIfNeeded();
  const attachToolbarAvailableOnMobile = await page.locator("#attach-files-toolbar").isVisible();
  const mobileImageFitsViewport = await imagePreviewBlock.evaluate((block) => {
    const image = block.querySelector(".attachment-image");
    const rect = image.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= document.documentElement.clientWidth && rect.width > 0;
  });
  await imagePreviewBlock.screenshot({ path: join(OUT, "attachment-preview-mobile.png") });
  await droppedImage.click();
  await imageCaption.waitFor({ state: "visible" });
  const selectedImageControlsFitMobile = await imageCaption.evaluate((caption) => {
    const rect = caption.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= document.documentElement.clientWidth && rect.width > 0;
  });
  await imagePreviewBlock.screenshot({ path: join(OUT, "attachment-preview-selected-mobile.png") });
  await droppedImage.dblclick();
  await imageLightbox.waitFor({ state: "visible" });
  const mobileImageLightboxFits = await imageLightboxImage.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && rect.width > 0;
  });
  await page.screenshot({ path: join(OUT, "attachment-lightbox-mobile.png") });
  await page.keyboard.press("Escape");
  await page.locator("#doc-title").focus();
  await page.setViewportSize({ width: 1280, height: 720 });

  // フォントをサブセット化せず、ファイルまるごと埋め込めること。
  const fontChooserPromise = page.waitForEvent("filechooser");
  await openMenu(page, "files");
  await page.locator("#embed-font").click();
  const fontChooser = await fontChooserPromise;
  await fontChooser.setFiles(FONT_FIXTURE);
  await page.waitForFunction(
    (family) => document.fonts && [...document.fonts].some((face) => face.family === family),
    FONT_FAMILY,
    { timeout: 5000 }
  ).catch(() => {});
  // 読み込めて一覧に出ること(前提)は、下の embeddedFontApplies へ AND で畳み、場面ごとの結果を証拠に残す。
  const embeddedFontLoads = await page.evaluate(
    (family) => [...document.fonts].some((face) => face.family === family && face.status === "loaded"),
    FONT_FAMILY
  );
  const embeddedFontAppearsInPicker = await page.evaluate(
    (family) => [...document.querySelectorAll("#format-font-list .font-option")].some((option) => option.textContent === family),
    FONT_FAMILY
  );

  // 埋め込みフォントを本文へ適用する。保存時に残る条件はこれ。
  await insertBlock(page);
  await page.keyboard.type("Embedded font sample");
  await page.evaluate(() => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Embedded font sample"));
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await pickFont(page, FONT_FAMILY);
  const embeddedFontAppliesToText = await page.evaluate((family) => {
    const editable = [...document.querySelectorAll(".block-content")]
      .find((item) => item.textContent.includes("Embedded font sample"));
    return [...editable.querySelectorAll("span")].some((node) => node.style.fontFamily.includes(family));
  }, FONT_FAMILY);
  const embeddedFontEvidence = { loads: embeddedFontLoads, appearsInPicker: embeddedFontAppearsInPicker, appliesToText: embeddedFontAppliesToText };
  const embeddedFontApplies = embeddedFontLoads && embeddedFontAppearsInPicker && embeddedFontAppliesToText;

  // 本文で使わないフォントも埋め込み、保存時に捨てられることを確かめる。
  const unusedFontChooserPromise = page.waitForEvent("filechooser");
  await openMenu(page, "files");
  await page.locator("#embed-font").click();
  const unusedFontChooser = await unusedFontChooserPromise;
  await unusedFontChooser.setFiles(UNUSED_FONT_FIXTURE);
  await page.waitForFunction(
    (family) => [...document.querySelectorAll("#format-font-list .font-option")].some((option) => option.textContent === family),
    UNUSED_FONT_FAMILY,
    { timeout: 5000 }
  ).catch(() => {});
  const unusedFontEmbeddedBeforeSave = await page.evaluate(
    (family) => [...document.querySelectorAll("#format-font-list .font-option")].some((option) => option.textContent === family),
    UNUSED_FONT_FAMILY
  );

  const ctrlSPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.locator("#doc-title").click();
  await page.keyboard.press("Control+S");
  const ctrlSDownload = await ctrlSPromise;
  await ctrlSDownload.saveAs(join(DOWNLOADS, ctrlSDownload.suggestedFilename()));

  const exportedPath = join(DOWNLOADS, ctrlSDownload.suggestedFilename());
  const exportedHtml = await readFile(exportedPath, "utf8");

  // 埋め込みフォントが、サブセットではなく元ファイルそのままで保存HTMLに入っていること。
  const fontSource = await readFile(FONT_FIXTURE);
  const exportedFontRecord = await page.evaluate(({ html, family }) => {
    const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
    const font = (parsed.fonts || []).find((item) => item.family === family);
    if (!font) return null;
    const attachment = parsed.attachments.find((item) => item.id === font.attachmentId);
    return attachment ? { family: font.family, size: attachment.size, sha256: attachment.sha256 } : null;
  }, { html: exportedHtml, family: FONT_FAMILY });

  // 埋め込まれるのは「ユーザーが自分で添付して本文に使った書体」だけ。既定の本文は
  // OS 標準なので、同梱書体のチャンクは1つも入らない（v122 の撤去の核心。これが
  // 保存HTMLが軽くなる理由そのもの）。
  const exportEmbedsOnlyChosenFonts = await page.evaluate((html) => {
    const fonts = window.SingleHtmlFormat.parsePortableHtml(html).fonts || [];
    const bundled = fonts.filter((font) => /Noto Sans JP|Noto Serif JP|M PLUS 1 Code/.test(font.family));
    const chunked = fonts.filter((font) => Boolean(font.unicodeRange));
    return bundled.length === 0 && chunked.length === 0;
  }, exportedHtml);

  // P7: エディタと保存HTMLが同じフォントスタックを使うこと（同じ環境で開けば
  // 見た目が一致する、の実体）。本文と等幅の両方を computed 値で突き合わせる。
  // 等幅は「コードブロックの本文」同士で比べる。エディタは .block.type-code の
  // セレクタに当てており、素の <pre> には効かない（書き出し側は全体の pre に当てる）
  // ため、同じ役割の要素で突き合わせないと非対称な比較になる。
  const editorFontStacks = await page.evaluate(() => {
    const body = getComputedStyle(document.body).fontFamily;
    const probe = document.createElement("div");
    probe.className = "block type-code";
    const inner = document.createElement("div");
    inner.className = "block-content";
    probe.append(inner);
    document.querySelector("#blocks").append(probe);
    const mono = getComputedStyle(inner).fontFamily;
    probe.remove();
    return { body, mono };
  });
  const exportedFontStacks = await (async () => {
    const viewer = await context.newPage();
    try {
      await viewer.setContent(exportedHtml, { waitUntil: "domcontentloaded" });
      return await viewer.evaluate(() => {
        const body = getComputedStyle(document.body).fontFamily;
        const probe = document.createElement("pre");
        document.body.append(probe);
        const mono = getComputedStyle(probe).fontFamily;
        probe.remove();
        return { body, mono };
      });
    } finally {
      await viewer.close();
    }
  })();
  const editorAndExportShareFontStack = editorFontStacks.body === exportedFontStacks.body
    && editorFontStacks.mono === exportedFontStacks.mono
    && editorFontStacks.body.includes("system-ui")
    && editorFontStacks.mono.includes("ui-monospace");
  // 旧文書の互換: v122 以前の保存HTML（同梱書体をチャンクで埋め込んだもの）を開いても
  // 埋め込みデータは落ちない＝「今までどおり同じ見た目で開ける」。書体名が同梱のもの
  // でも、パーサが特別扱いせずそのまま保持することを確かめる。
  const legacyBundledDocSurvives = await page.evaluate(() => {
    const doc = {
      title: "legacy-bundled",
      blocks: [{ id: "b1", type: "paragraph", text: "旧文書の本文", html: "旧文書の本文" }],
      fonts: [
        { id: "f1", family: "Noto Sans JP", attachmentId: "a1", weight: "400", unicodeRange: "U+3000-30FF" },
      ],
      attachments: [
        { id: "a1", name: "noto-sans-jp-400.woff2", type: "font/woff2", size: 3, sha256: "x", chunks: ["AAA="] },
      ],
    };
    const html = window.SingleHtmlFormat.buildPortableHtml(doc);
    const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
    const font = (parsed.fonts || []).find((item) => item.family === "Noto Sans JP");
    return Boolean(font)
      && font.unicodeRange === "U+3000-30FF"
      && Boolean((parsed.attachments || []).find((item) => item.id === font.attachmentId));
  });
  // 書体が保存HTMLに入っていることは、下の exportedFontMatchesSourceFile(書体名で探して大きさとハッシュを比べる)に含まれる。
  const exportedFontList = await page.evaluate(
    (html) => (window.SingleHtmlFormat.parsePortableHtml(html).fonts || []).map((font) => font.family),
    exportedHtml
  );
  // 使わない書体は、保存前には埋め込まれていて(前提)、保存で書体の一覧・添付のデータ・ツールバーの一覧の
  // どれからも落ちること。1件の判定にまとめ、場面ごとの結果を証拠(saveDropsUnusedFontEvidence)に残す。
  const unusedFontDataInExport = await page.evaluate(
    (html) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      return parsed.attachments.filter((item) => /OUTLOOK/i.test(item.name || "")).map((item) => item.name);
    },
    exportedHtml
  );
  const unusedFontInPickerAfterSave = await page.evaluate(
    (family) => [...document.querySelectorAll("#format-font-list .font-option")].some((option) => option.textContent === family),
    UNUSED_FONT_FAMILY
  );
  const saveDropsUnusedFontEvidence = {
    checks: {
      embeddedBeforeSave: unusedFontEmbeddedBeforeSave,
      fontListKeepsUsedDropsUnused: exportedFontList.includes(FONT_FAMILY) && !exportedFontList.includes(UNUSED_FONT_FAMILY),
      dataDropped: unusedFontDataInExport.length === 0,
      leavesPickerAfterSave: !unusedFontInPickerAfterSave,
    },
    exportedFontList,
    unusedFontDataInExport,
  };
  const saveDropsUnusedFont = Object.values(saveDropsUnusedFontEvidence.checks).every((value) => value === true);
  const exportedFontMatchesSourceFile = Boolean(
    exportedFontRecord &&
    exportedFontRecord.size === fontSource.length &&
    exportedFontRecord.sha256 === sha256(fontSource)
  );

  // インラインコード・番号付きリスト・段組み・画像が保存HTMLに入っていることは、文字列を探すのではなく、
  // 保存HTMLを開いた画面で見る(exportedInlineCodeRenders・exportedNumberedListRenders・
  // exportedColumnsRenderSideBySide・exportedImageLayoutPersists)。
  const exportedInlineCodeDataCanBeParsed = await page.evaluate((html) => {
    const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
    const block = parsed.pages.flatMap((page) => page.blocks || []).find((item) => item.text === "Export `persisted` code");
    return Boolean(block?.html?.includes('data-code="persisted"') && block.text === "Export `persisted` code");
  }, exportedHtml);
  const exportedContainsInlineFormatting = exportedHtml.includes("Format tools sample") &&
    exportedHtml.includes("color: rgb(193, 63, 47)") &&
    exportedHtml.includes("background-color: rgb(255, 241, 168)");
  const exportedNumberedDataCanBeParsed = await page.evaluate((html) => {
    const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
    const expected = new Map([
      ["Number parent one", 0],
      ["Number child one", 1],
      ["Number child two", 1],
      ["Number grandchild", 2],
      ["Number parent two", 0],
    ]);
    return [...expected].every(([text, indent]) => {
      const block = parsed.pages.flatMap((page) => page.blocks || []).find((item) => item.text === text);
      return block?.type === "numbered" && (block.indent || 0) === indent;
    });
  }, exportedHtml);
  const exportedContainsToggle = exportedHtml.includes('<details class="toggle"') && exportedHtml.includes("Toggle H1") && exportedHtml.includes("Toggle list item");
  const exportedContainsToc = exportedHtml.includes('<nav class="toc">') && exportedHtml.includes("H1 shortcut");
  const exportedImageDataCanBeParsed = await page.evaluate(({ html, expectedWidth }) => {
    const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
    const attachment = parsed.attachments.find((item) => item.name === "dropped-image.png");
    const block = parsed.pages.flatMap((page) => page.blocks || []).find((item) => item.attachmentId === attachment?.id);
    return Boolean(
      attachment?.mime === "image/png" &&
      block?.imageAlign === "center" &&
      Math.abs(Number(block.imageWidth) - expectedWidth) < .2
    );
  }, { html: exportedHtml, expectedWidth: resizedImageWidth });
  const exportedColumnDataCanBeParsed = await page.evaluate((html) => {
    const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
    const a = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.text === "Column A");
    const d = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.text === "Column D");
    return Boolean(a?.columnGroup && d?.columnGroup === a.columnGroup && a.columnIndex !== d.columnIndex);
  }, exportedHtml);

  const viewer = await context.newPage();
  await viewer.goto(`file:///${exportedPath.replaceAll("\\", "/")}`, { waitUntil: "domcontentloaded" });
  const exportedColumnsRenderSideBySide = await viewer.evaluate(() => {
    const layout = [...document.querySelectorAll(".doc-columns")].find((item) => item.innerText.includes("Column A"));
    const columns = layout ? [...layout.querySelectorAll(":scope > .doc-column")] : [];
    // Column D も同じ段組みに出ること(文字列の検査 exportedContainsColumns から畳んだ条件)。
    return columns.length === 2 && columns[1].getBoundingClientRect().left > columns[0].getBoundingClientRect().left
      && layout.innerText.includes("Column D");
  });
  const exportedInlineCodeRenders = await viewer.evaluate(() => {
    const code = [...document.querySelectorAll("code.inline-code")].find((item) => item.textContent === "persisted");
    return Boolean(code && getComputedStyle(code).fontFamily.toLowerCase().includes("mono"));
  });
  const exportedNumberedListRenders = await viewer.evaluate(() => {
    const items = [...document.querySelectorAll(".numbered-item")];
    const expected = new Map([
      ["Number parent one", "1."],
      ["Number child one", "1.1"],
      ["Number child two", "1.2"],
      ["Number grandchild", "1.2.1"],
      ["Number parent two", "2."],
    ]);
    return [...expected].every(([text, marker]) => {
      const item = items.find((node) => node.innerText.includes(text));
      return item?.querySelector(".numbered-marker")?.textContent === marker && getComputedStyle(item).display === "grid";
    });
  });
  const viewerImage = viewer.locator('img[data-attachment-image][alt="dropped-image.png"]');
  await viewerImage.waitFor({ state: "visible" });
  const exportedImageRenders = await viewerImage.evaluate((image) => image.complete && image.naturalWidth === 320 && image.naturalHeight === 180);
  const exportedImageLayoutPersists = await viewerImage.evaluate((image, expectedWidth) => {
    const figure = image.closest(".image-attachment");
    const figureRect = figure.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const actualWidth = imageRect.width / figureRect.width * 100;
    const centered = Math.abs((imageRect.left + imageRect.right) / 2 - (figureRect.left + figureRect.right) / 2) < 2;
    return figure.dataset.align === "center" && centered && Math.abs(actualWidth - expectedWidth) < .5;
  }, resizedImageWidth);
  const attachmentDownload = viewer.waitForEvent("download", { timeout: 5000 });
  await viewer.locator(".attachment [data-download]").first().click();
  const attachment = await attachmentDownload;
  await attachment.saveAs(join(DOWNLOADS, attachment.suggestedFilename()));

  const imageBlock = page.locator(".block", { has: page.locator('img.attachment-image[alt="dropped-image.png"]') });
  await imageBlock.locator(".drag-grip").click();
  // v125: ハンドルのクリックはブロックのメニューも開く。ブロックへのキー操作は閉じてから。
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  const deletingImageRemovesAttachmentData = await page.evaluate(() => (
    !document.querySelector('img.attachment-image[alt="dropped-image.png"]') &&
    ![...document.querySelectorAll("#attachment-summary > *")].some((item) => item.textContent.includes("dropped-image.png"))
  ));
  await page.keyboard.press("Control+Z");
  const restoredImage = page.locator('img.attachment-image[alt="dropped-image.png"]');
  await restoredImage.waitFor({ state: "visible" });
  const undoRestoresImageAttachment = await restoredImage.evaluate((image) => image.complete && image.naturalWidth === 320);

  // 未保存の変更があるとき、Open は確認ダイアログを出し、キャンセルすると何も起きないこと。
  const titleBeforeCancelledOpen = await page.evaluate(() => document.querySelector("#doc-title")?.textContent);
  const dialogCountBeforeOpen = dialogMessages.length;
  dialogAction = "dismiss";
  await openMenu(page, "file");
  await page.locator("#menu-open-document").click();
  await page.waitForTimeout(300);
  const openAsksBeforeDiscardingChanges = dialogMessages.length === dialogCountBeforeOpen + 1;
  const openCancelKeepsDocument = await page.evaluate(
    (before) => document.querySelector("#doc-title")?.textContent === before,
    titleBeforeCancelledOpen
  );
  dialogAction = "accept";

  // File > Open で保存済みの単一HTMLをエディタへ読み込み直せること。
  const openChooserPromise = page.waitForEvent("filechooser");
  await openMenu(page, "file");
  await page.locator("#menu-open-document").click();
  const openChooser = await openChooserPromise;
  await openChooser.setFiles(exportedPath);
  await page.waitForFunction(
    () => document.querySelector("#doc-title")?.textContent === "PWA Smoke Test",
    null,
    { timeout: 5000 }
  ).catch(() => {});
  const openLoadsSavedDocument = await page.evaluate(() => (
    document.querySelector("#doc-title")?.textContent === "PWA Smoke Test" &&
    document.querySelectorAll("#blocks .block").length > 1
  ));
  const openRestoresAttachments = await page.evaluate(() => (
    [...document.querySelectorAll("#attachment-summary > *")].some((item) => item.textContent.includes("fixture.txt"))
  ));
  // 開き直したあとも、埋め込みフォントが選べる状態で復元されること(一覧に出て、書体も読み込まれる)。
  const openRestoresEmbeddedFontEvidence = await page.evaluate(
    (family) => ({
      inPicker: [...document.querySelectorAll("#format-font-list .font-option")].some((option) => option.textContent === family),
      fontFaceReloaded: [...document.fonts].some((face) => face.family === family),
    }),
    FONT_FAMILY
  );
  const openRestoresEmbeddedFont = openRestoresEmbeddedFontEvidence.inPicker && openRestoresEmbeddedFontEvidence.fontFaceReloaded;

  const registrations = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((items) => items.length));
  const finalFiles = await downloadedFiles();
  const report = {
    appTitle: await page.title(),
    secondSelectMode,
    firstCtrlASelectedBlock: firstSelect === "ここに本文を書きます。/ を入力するとブロックを追加できます。",
    secondCtrlASelectedPage: secondSelect.includes("PWA Smoke Test") && secondSelect.includes("ここに本文を書きます。"),
    bulletContinuation,
    bulletMarkerOnFirstLine,
    dragHandleOnFirstLine,
    arrowUpMovesBlock,
    arrowDownMovesBlock,
    todoContinuation,
    todoCheckboxOnFirstLine,
    markdownBulletAcceptsText,
    emptyBulletBackspaceReturnsParagraph,
    emptyTodoBackspaceReturnsParagraph,
    hierarchicalNumberedMarkers,
    numberedIndentLevelsPersist,
    numberedMarkerOnFirstLine,
    imeCompositionEnterKeepsNumberedBlock,
    emptyNumberedBackspaceReturnsParagraph,
    emptyNumberedEnterReturnsParagraph,
    numberedShortcutEnterReturnsParagraph,
    bulletShortcutEnterReturnsParagraph,
    staleModelBackspaceRemovesBlock,
    insertButtonIsLeftOfGrip,
    insertButtonAddsBlockBelow,
    insertButtonUndoWorks,
    fontSizeApplies,
    defaultFontOptionShowsFontName,
    defaultFontOptionFitsSelect,
    sizeSelectShowsCurrentSize,
    sizeMenuOffersGoogleLadder,
    sizeMenuAppliesWithoutLosingSelection,
    sizeStepperButtonsStepByOne,
    sizeStepperButtonsEvidence,
    sizeKeysStepByOne,
    sizeKeysEvidence,
    boldWorksAfterSizeChange,
    italicWorksAfterFontChange,
    uniformSelectionShowsItsOwnSize,
    mixedSelectionBlanksSizeAndFont,
    crossBlockMixedBlanksToolbar,
    pageWideSelectionBlanksSize,
    boldWorksAfterMouseDragSelection,
    sizeMenuWorksAfterMouseDragSelection,
    gripLeavesTextStartClickable,
    fontSelectWorksAfterMouseDragSelection,
    tripleClickSelectionAcceptsSize,
    crossBlockSelectionAcceptsSize,
    crossBlockSelectionAcceptsFont,
    boldAppliesToWholeSelection,
    boldRemovesOnlyWhenWholeSelectionHasIt,
    strikeAppliesToWholeSelection,
    boldKeepsSelection,
    partialBoldKeepsItsRange,
    doubleClickSelectionAcceptsFont,
    selectAllSelectionAcceptsSize,
    keyboardSelectionAcceptsBackgroundColor,
    mouseDragSelectionAcceptsTextColor,
    sizeChangeKeepsSelection,
    crossBlockSelectionAcceptsBold,
    crossBlockBoldKeepsSelection,
    crossBlockBoldSecondPressRemoves,
    crossBlockDragSelectsBlocks,
    crossBlockTypingIsIgnored,
    crossBlockTypingKeepsBlockSelection,
    crossBlockBackspaceDeletesBlocks,
    crossBlockUndoRestoresBlocks,
    crossBlockDeleteDeletesBlocks,
    crossBlockTypingLeavesUnmergeableBlocks,
    crossBlockImeInputIsIgnored,
    mouseDragKeepsEditableTarget,
    crossBlockDragLeavesNoEditableHost,
    crossBlockTypingLeavesBlocksIntact,
    crossBlockBoldKeepsBlockSelection,
    osFontStacksAppearInPicker,
    noFontEmbeddedByDefault,
    editorAndExportShareFontStack,
    exportEmbedsOnlyChosenFonts,
    legacyBundledDocSurvives,
    osMonospaceAppliesToText,
    osFontCaretTypingKeepsFont,
    osFontSurvivesRerender,
    blockPasteKeepsFormatting,
    blockPasteSelectsCopy,
    blockPasteRepeats,
    blockPasteUndoWorks,
    textCopyPasteUnaffected,
    blockCopyIncludesChildren,
    arrowLeftCrossesBlocksOnlyAtEdges,
    arrowLeftEvidence,
    arrowRightCrossesBlocksOnlyAtEdges,
    arrowRightEvidence,
    backspaceMergesIntoPreviousBlock,
    backspaceMergePlacesCaretAtJoin,
    backspaceMergeUndoWorks,
    backspaceInsideTextDeletesOneChar,
    backspaceKeepsBlocksWithChildren,
    marqueeShowsRectangleWhileDragging,
    marqueeUpdatesWhileDragging,
    marqueeSelectsCoveredBlocks,
    marqueeDeleteRemovesAll,
    marqueeDeleteUndoWorks,
    marqueeEscapeClearsSelection,
    blankClickStillFocusesWithoutSelecting,
    textDragStillSelectsText,
    italicAppliesToWholeSelection,
    sizeFieldEscapeDiscardsInput,
    sizeFieldKeepsValueWithoutCaret,
    highlightUsesMarkerIcon,
    pendingFontShownBeforeTyping,
    caretFontReachesTypedText,
    noSentinelFontLeaks,
    caretFontKeepsSelectLabel,
    caretFontLeavesEarlierTextAlone,
    newBlockStartsWithoutFontFormat,
    newBlockStartsWithoutRichFormat,
    demotedBlockStartsWithoutFormat,
    shiftEnterKeepsFormat,
    plainBlockStaysPlain,
    installedFontsAppearInPicker,
    listingInstalledFontsEmbedsNothing,
    applyingInstalledFontEmbedsIt,
    installedFontAppliesToText,
    defaultFontOption,
    fontStylesSurviveRerender,
    fontResetClearsStyles,
    embeddedFontApplies,
    embeddedFontEvidence,
    saveDropsUnusedFont,
    saveDropsUnusedFontEvidence,
    exportedFontMatchesSourceFile,
    openRestoresEmbeddedFont,
    openRestoresEmbeddedFontEvidence,
    headingHandleOnFirstLine,
    tocBlockCreated,
    dividerCreated,
    slashTableCreated,
    slashNearestTable,
    tableCellEdited,
    tableCellBackspaceKeepsBlock,
    tableCellBackspaceKeepsText,
    slashNearestTodo,
    slashTabSelection,
    slashMenuOpensWithFirstOptionActive,
    slashMenuClosesOnOutsideClick,
    slashMenuReopensAtTop,
    slashQueryResetsScrollAndSelection,
    slashKeyboardSelectionStaysVisible,
    slashNoMatchState,
    slashNoMatchEnterDoesNothing,
    slashMenuStaysInsideNarrowViewport,
    slashMenuClosesOnResize,
    slashMenuHandlesPageScroll,
    plusAddsParagraphWithoutMenu,
    plusParagraphTakesPlainText,
    plusParagraphAcceptsSlashCommand,
    slashMenuWaitsForImeCommit,
    inlineCodeCreatedFromBackticks,
    inlineCodeDelimitersHiddenWhenInactive,
    inlineCodeDelimitersVisibleWhenEditing,
    inlineCodeCanInsertAtStart,
    inlineCodeInsertAtStartEvidence,
    inlineCodeCanBeEdited,
    inlineCodeArrowRightExits: inlineCodeArrowRightMovesOutside && inlineCodeArrowRightExits,
    inlineCodeLeftCursorSequence,
    inlineCodeLeftMovesOncePerPosition,
    inlineCodeRightCursorSequence,
    inlineCodeRightMovesOncePerPosition,
    inlineCodeOpeningDelimiterCanBeDeleted,
    inlineCodeRemainingDelimiterCanBeDeleted,
    inlineCodeClosingDelimiterCanBeDeleted,
    inlineCodeKeptForExport,
    backgroundColorStartsUnset,
    standardTextColorPaletteAvailable,
    standardTextColorApplied,
    standardBackgroundColorPaletteAvailable,
    standardBackgroundColorApplied,
    colorPaletteFitsNarrowViewport,
    colorPaletteClosesOnEscape,
    colorPaletteClosesOnOutsideClick,
    inlineFormatToolbarWorks,
    textColorToolbarFollowsCaret,
    textColorToolbarEvidence,
    backgroundToolbarFollowsCaret,
    backgroundToolbarEvidence,
    backgroundToolbarFollowsBackspace,
    backgroundAfterBackspaceEvidence,
    inlineFormatResetWorks,
    inlineFormatResetEvidence,
    toggleHeadingCreated,
    toggleCreatesNestedBlock,
    toggleCollapseHidesNestedBlock,
    toggleReopenShowsNestedBlock,
    toggleHeadingHandleOnFirstLine,
    tocItemsLeftAlignedAndIndented,
    tocPanelHasDistinctSurface,
    toggleListCreated,
    toggleListEnterKeepsIndent,
    dragMoved,
    verticalDragDoesNotCreateColumns,
    removedFeaturesStayGone,
    removedFeaturesEvidence,
    gripClickSelectsBlock,
    gripClickOpensBlockMenu,
    blockMenuEscapeKeepsSelection,
    deleteRemovesSelectedBlock,
    undoRestoresDeletedBlock,
    redoDeletesBlockAgain,
    blankClickFocusedEnd,
    crossBlockMouseSelectionWorks,
    doubleClickSelectsWord,
    tripleClickSelectsBlock,
    doubleClickSelectionCanBeTyped,
    clickAfterTripleClickClearsSelection,
    clickOnSelectionInLastBlockClears,
    clickOnSelectionInLastBlockEvidence,
    multiClickKeepsBlocksEditable,
    twoColumnLayoutCreated,
    columnCreationUndoWorks,
    columnCreationRedoWorks,
    enterKeepsBlockInColumn,
    threeColumnLayoutCreated,
    columnWidthsCanBeResized,
    columnWidthsCanBeResizedWithKeyboard,
    columnResizeUndoWorks,
    columnResizeRedoWorks,
    emptyColumnIsRemoved,
    columnLayoutUnwrapsWhenOneColumnRemains,
    columnUndoRestoresLayoutAfterUnwrap,
    columnsStackOnNarrowScreens,
    fileDropAffordanceVisible,
    imageDropCreatesPreview,
    imageDetailsHiddenWhenNotSelected,
    imageResizeDisabledWhenNotSelected,
    droppedImageMetadataShown,
    imageControlsShownWhenSelected,
    imageDetailsHideAfterSelectionMoves,
    imageLightboxOpensOnDoubleClick,
    imageLightboxFitsAndEnlarges,
    imageLightboxCloseButtonVisible,
    imageLightboxEscapeCloses,
    imageLightboxReturnsFocus,
    imageLightboxButtonCloses,
    imageRightEdgeResizeWorks,
    imageResizePreservesAspectRatio,
    imageResizeUndoWorks,
    imageResizeRedoWorks,
    imageAlignsLeft,
    imageAlignsCenter,
    imageAlignsRight,
    imageAlignButtonsUseIcons,
    imagePasteCreatesPreview,
    attachmentPickerWorks,
    editorAttachmentDownloadWorks,
    attachToolbarAvailableOnMobile,
    mobileImageFitsViewport,
    selectedImageControlsFitMobile,
    mobileImageLightboxFits,
    deletingImageRemovesAttachmentData,
    undoRestoresImageAttachment,
    exportedName: ctrlSDownload.suggestedFilename(),
    ctrlSCaptured: ctrlSDownload.suggestedFilename().endsWith(".html"),
    openAsksBeforeDiscardingChanges,
    openCancelKeepsDocument,
    openLoadsSavedDocument,
    openRestoresAttachments,
    exportedContainsManifest: exportedHtml.includes("application/vnd.single-html-doc.manifest+json"),
    exportedContainsAttachmentStore: exportedHtml.includes("application/vnd.single-html-doc.attachments+json"),
    exportedInlineCodeDataCanBeParsed,
    exportedInlineCodeRenders,
    exportedContainsInlineFormatting,
    exportedNumberedDataCanBeParsed,
    exportedNumberedListRenders,
    exportedContainsToggle,
    exportedContainsToc,
    exportedImageDataCanBeParsed,
    exportedImageRenders,
    exportedImageLayoutPersists,
    exportedColumnDataCanBeParsed,
    exportedColumnsRenderSideBySide,
    viewerTitle: await viewer.title(),
    serviceWorkerRegistrations: registrations,
    downloads: finalFiles,
  };
  report.exportedHtmlHasDocumentTitle = exportedHtml.includes("PWA Smoke Test");
  report.attachedFixtureSurvivesRoundTrip = finalFiles.some((file) => file.name === "fixture.txt");
  return report;
}
