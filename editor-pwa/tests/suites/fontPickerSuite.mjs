// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { FONT_FAMILY, FONT_FIXTURE, PORT, insertBlock, openMenu } from "../lib.mjs";

// ---- フォント選択の独自メニュー(v180。Issue #4) ----
// <select> をやめ、ボタン + メニュー(検索欄 + 一覧)にした。書体名はその書体で見せる・名前で絞り込める・
// 埋め込みフォントをその場で削除できる・選んでも本文の選択が外れない・キーボードで操作できる。
export default async function fontPickerSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const menuOpen = () => fresh.evaluate(() => !document.querySelector("#format-font-menu").hidden);
    const optionNames = () => fresh.evaluate(() => [...document.querySelectorAll("#format-font-list .font-option")].map((node) => node.textContent));
    // 本文の1語を選ぶ
    const selectWord = (text) => fresh.evaluate((word) => {
      const editable = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes(word));
      // 書体を当てると文字のノードが分かれるので、その語を含むノードを探す
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      while (textNode && !textNode.nodeValue.includes(word)) textNode = walker.nextNode();
      const start = textNode.nodeValue.indexOf(word);
      editable.focus();
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + word.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    }, text);
    const selectionState = () => fresh.evaluate(() => ({
      text: getSelection().toString(),
      inBody: Boolean(document.activeElement?.closest?.("#blocks .block-content")),
    }));
    const familyOf = (word) => fresh.evaluate((text) => {
      const editable = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes(text));
      return [...editable.querySelectorAll("span")].find((node) => node.textContent === text)?.style.fontFamily || "";
    }, word);

    // 長い文書の末尾で作業する(開いたときに文書がスクロールしないことを見るため)
    await fresh.locator("#blocks .block-content").first().click();
    await insertBlock(fresh);
    for (let index = 0; index < 30; index += 1) {
      await fresh.keyboard.type("filler line " + index);
      await fresh.keyboard.press("Enter");
    }
    await fresh.keyboard.type("alpha bravo charlie delta");
    await fresh.waitForTimeout(100);

    // 書体名はその書体で見せる
    result.fontNamesShownInOwnFont = await fresh.evaluate(() => {
      const option = [...document.querySelectorAll("#format-font-list .font-option")].find((node) => node.textContent === "Monospace (環境標準)");
      return Boolean(option && getComputedStyle(option.querySelector(".font-option-name")).fontFamily.includes("monospace"));
    });

    // マウスで選ぶ: 選択は外れず、書体が付く。開いても文書はスクロールしない
    await selectWord("bravo");
    const scrollBefore = await fresh.evaluate(() => scrollY);
    await fresh.locator("#format-font").click();
    await fresh.waitForTimeout(100);
    const scrollAfterOpen = await fresh.evaluate(() => scrollY);
    result.fontMenuOpens = await menuOpen()
      && (await fresh.locator("#format-font").getAttribute("aria-expanded")) === "true";
    result.fontMenuKeepsPageScroll = scrollBefore > 0 && scrollAfterOpen === scrollBefore;
    // メニューはボタンの真下に出る(ツールバーの backdrop-filter で、左の目次の幅だけ右へずれていた。サイズの一覧も同じ)
    const alignment = async (trigger, menu) => fresh.evaluate(([t, m]) => {
      const a = document.querySelector(t).getBoundingClientRect();
      const b = document.querySelector(m).getBoundingClientRect();
      return { dx: Math.round(b.left - a.left), gap: Math.round(b.top - a.bottom), treeWidth: Math.round(document.querySelector("#page-tree")?.getBoundingClientRect().width || 0) };
    }, [trigger, menu]);
    const fontAlign = await alignment("#format-font", "#format-font-menu");
    result.fontMenuScrollEvidence = { scrollBefore, scrollAfterOpen };
    await fresh.locator("#format-font-list .font-option").filter({ has: fresh.getByText("Serif (環境標準)", { exact: true }) }).click();
    await fresh.waitForTimeout(150);
    const afterMouse = await selectionState();
    result.mousePickAppliesFont = (await familyOf("bravo")).includes("serif");
    result.mousePickKeepsSelection = afterMouse.text === "bravo" && afterMouse.inBody && !(await menuOpen());
    result.triggerShowsChosenFont = (await fresh.locator("#format-font").textContent()) === "Serif (環境標準)";
    await fresh.locator("#format-size").click();
    await fresh.waitForTimeout(150);
    const sizeAlign = await alignment("#format-size", "#format-size-menu");
    await fresh.keyboard.press("Escape");
    result.popoversAlignUnderTrigger = fontAlign.treeWidth > 0 && Math.abs(fontAlign.dx) <= 1 && fontAlign.gap >= 0 && fontAlign.gap <= 12
      && Math.abs(sizeAlign.dx) <= 1 && sizeAlign.gap >= 0 && sizeAlign.gap <= 12;
    result.popoverAlignEvidence = { fontAlign, sizeAlign };

    // 検索で絞り込む
    await selectWord("charlie");
    await fresh.locator("#format-font").click();
    await fresh.keyboard.type("mono");
    await fresh.waitForTimeout(100);
    const filtered = await optionNames();
    result.fontSearchFilters = filtered.includes("Monospace (環境標準)")
      && !filtered.includes("Serif (環境標準)") && !filtered.includes("Sans-serif (環境標準)");
    // 絞り込んだ先頭が選ばれた状態。Enter で当たる
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(150);
    const afterEnter = await selectionState();
    result.searchEnterAppliesFont = (await familyOf("charlie")).includes("monospace");
    result.searchEnterKeepsSelection = afterEnter.text === "charlie" && afterEnter.inBody && !(await menuOpen());

    // 何も合わないときは「見つかりません」
    await fresh.locator("#format-font").click();
    await fresh.keyboard.type("zzzz-no-such-font");
    await fresh.waitForTimeout(100);
    result.fontSearchShowsEmpty = await fresh.evaluate(() => Boolean(document.querySelector("#format-font-list .font-empty")));
    // Esc で閉じ、本文の選択へ戻る(何も当てない)
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(100);
    const afterEscape = await selectionState();
    result.escapeClosesAndRestoresSelection = !(await menuOpen()) && afterEscape.text === "charlie" && afterEscape.inBody
      && (await familyOf("charlie")).includes("monospace");

    // キーボードだけで: ボタンにフォーカスして ↓ で開き、↑↓ で動かして Enter
    await selectWord("delta");
    await fresh.locator("#format-font").focus();
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(100);
    const keyboardOpen = await fresh.evaluate(() => ({
      open: !document.querySelector("#format-font-menu").hidden,
      searchFocused: document.activeElement?.id === "format-font-search",
      active: document.querySelector("#format-font-list .font-option.is-active")?.textContent,
      descendant: document.querySelector("#format-font-search").getAttribute("aria-activedescendant")
        === document.querySelector("#format-font-list .font-option.is-active")?.id,
    }));
    result.keyboardOpensMenu = keyboardOpen.open && keyboardOpen.searchFocused && keyboardOpen.descendant;
    // いまは標準(Sans-serif)。↓↓ で Monospace
    await fresh.keyboard.press("ArrowDown");
    await fresh.keyboard.press("ArrowDown");
    const movedTo = await fresh.evaluate(() => document.querySelector("#format-font-list .font-option.is-active")?.textContent);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(150);
    result.arrowKeysMoveAndEnterApplies = keyboardOpen.active === "Sans-serif (環境標準)" && movedTo === "Monospace (環境標準)"
      && (await familyOf("delta")).includes("monospace");
    result.keyboardEvidence = { keyboardOpen, movedTo };

    // ボタンで文字を打つと、その文字で絞り込んで開く
    await selectWord("alpha");
    await fresh.locator("#format-font").focus();
    await fresh.keyboard.press("m");
    await fresh.waitForTimeout(100);
    result.typingOnTriggerFilters = await menuOpen()
      && (await fresh.locator("#format-font-search").inputValue()) === "m";
    // 外を押すと閉じる
    await fresh.locator("#blocks .block-content", { hasText: "alpha bravo" }).click({ position: { x: 4, y: 6 } });
    await fresh.waitForTimeout(100);
    result.outsideClickCloses = !(await menuOpen())
      && (await fresh.locator("#format-font").getAttribute("aria-expanded")) === "false";

    // 埋め込みフォント: 一覧の区分けに出て、その場で削除できる
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "files");
    await fresh.locator("#embed-font").click();
    await (await chooser).setFiles(FONT_FIXTURE);
    await fresh.waitForFunction((family) => [...document.querySelectorAll("#format-font-list .font-option")].some((node) => node.textContent === family), FONT_FAMILY, { timeout: 5000 }).catch(() => {});
    await fresh.keyboard.press("Escape");
    await selectWord("alpha");
    await fresh.locator("#format-font").click();
    const embeddedRow = fresh.locator("#format-font-list .font-option").filter({ has: fresh.getByText(FONT_FAMILY, { exact: true }) });
    result.embeddedFontGrouped = await fresh.evaluate((family) => {
      const group = [...document.querySelectorAll("#format-font-list [role=group]")].find((node) => node.getAttribute("aria-label") === "文書に埋め込み済み");
      return Boolean(group && [...group.querySelectorAll(".font-option")].some((node) => node.textContent === family && node.querySelector(".font-option-remove")));
    }, FONT_FAMILY);
    await embeddedRow.click();
    await fresh.waitForTimeout(150);
    result.menuEmbeddedFontApplies = (await familyOf("alpha")).includes(FONT_FAMILY);
    await fresh.locator("#format-font").click();
    await embeddedRow.locator(".font-option-remove").click();
    await fresh.waitForTimeout(200);
    result.removeFromMenuDeletesFont = !(await optionNames()).includes(FONT_FAMILY)
      && !(await familyOf("alpha")).includes(FONT_FAMILY)
      && await fresh.evaluate((family) => ![...document.fonts].some((face) => face.family === family), FONT_FAMILY);
  } finally {
    await fresh.close();
  }
  return result;
}
