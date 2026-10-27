// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { insertBlock, PORT } from "../lib.mjs";

// ---- 文書エディタの一般的なキー(v176 ユーザー指示) ----
// Tab: ブロックの先頭ならインデント、それ以外はタブ文字(文字の縦の位置をそろえる)。Word・Google ドキュメントと同じ。
// Ctrl+Home / Ctrl+End: 文書の先頭・末尾へ(ブラウザ既定では1つのブロックの端までしか動かない)。
export default async function editKeysSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const rowOf = (text) => fresh.evaluate((needle) => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.replaceAll("\t", "→").includes(needle));
      const row = editable?.closest(".block");
      return editable ? {
        text: editable.textContent,
        indent: Number(getComputedStyle(row).getPropertyValue("--indent") || 0),
      } : null;
    }, text);

    // 1) 先頭の Tab はインデント(文字は入らない)
    await fresh.locator("#blocks .block-content").nth(1).click();
    await insertBlock(fresh);
    await fresh.keyboard.type("tab start");
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(150);
    const atStart = await rowOf("tab start");
    result.tabAtBlockStartIndents = atStart?.indent === 1 && atStart.text === "tab start";
    // 先頭の Shift+Tab はインデントを戻す
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(150);
    result.shiftTabAtBlockStartOutdents = (await rowOf("tab start"))?.indent === 0;

    // 2) 途中の Tab はタブ文字(インデントは変わらない)
    await insertBlock(fresh);
    await fresh.keyboard.type("a");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("col-x");
    await insertBlock(fresh);
    await fresh.keyboard.type("abc");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("col-y");
    await fresh.waitForTimeout(150);
    const first = await rowOf("a→col-x");
    const second = await rowOf("abc→col-y");
    result.tabMidTextInsertsTab = first?.text === "a\tcol-x" && first.indent === 0
      && second?.text === "abc\tcol-y" && second.indent === 0;
    // 3) タブの後ろの文字は、前の文字の長さによらず同じ縦の位置にそろう(タブ位置)
    result.tabStopsAlignText = await fresh.evaluate(() => {
      const leftOf = (needle) => {
        const editable = [...document.querySelectorAll("#blocks .block-content")]
          .find((item) => item.textContent.includes(needle));
        const node = [...editable.childNodes].find((item) => item.nodeType === Node.TEXT_NODE && item.nodeValue.includes(needle))
          || document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
        const at = node.nodeValue.indexOf(needle);
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 1);
        return range.getBoundingClientRect().left;
      };
      const x = leftOf("col-x");
      const y = leftOf("col-y");
      return Math.abs(x - y) < 1;
    });
    // 4) タブは保存HTMLにもそのまま入り、同じ幅(tab-size)で見える
    result.tabSurvivesExport = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({
        title: "tabs",
        blocks: [{ id: "t1", type: "paragraph", text: "a\tcol" }],
        attachments: [],
      });
      const view = new DOMParser().parseFromString(html, "text/html");
      const style = [...view.querySelectorAll("style")].map((node) => node.textContent).join("\n");
      // エディタは計算後の値(px)で返るので、文字4つぶん(4em)かで見る。保存HTMLは CSS に 4em と書いてある。
      const editorStyle = getComputedStyle(document.querySelector("#blocks .block-content"));
      const editorIs4em = Math.abs(Number.parseFloat(editorStyle.tabSize) - 4 * Number.parseFloat(editorStyle.fontSize)) < 0.5;
      return [...view.querySelectorAll("main p")].some((node) => node.textContent === "a\tcol")
        && editorIs4em && style.includes("tab-size:4em");
    });

    // 5) Ctrl+Home / Ctrl+End: 文書の最初のブロックの先頭・最後のブロックの末尾へ
    const caret = () => fresh.evaluate(() => {
      const selection = getSelection();
      const editable = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode.closest(".block-content")
        : selection.anchorNode?.parentElement?.closest(".block-content");
      const all = [...document.querySelectorAll("#blocks .block-content[data-id]")].filter((el) => el.isContentEditable);
      if (!editable) return null;
      const before = document.createRange();
      before.selectNodeContents(editable);
      before.setEnd(selection.anchorNode, selection.anchorOffset);
      return {
        index: all.indexOf(editable),
        last: all.length - 1,
        offset: before.toString().length,
        length: editable.textContent.length,
        collapsed: selection.isCollapsed,
      };
    });
    await fresh.locator("#blocks .block-content", { hasText: "tab start" }).click();
    await fresh.keyboard.press("Control+End");
    await fresh.waitForTimeout(100);
    const atEnd = await caret();
    result.ctrlEndGoesToDocumentEnd = Boolean(atEnd) && atEnd.index === atEnd.last && atEnd.offset === atEnd.length && atEnd.collapsed;
    await fresh.keyboard.press("Control+Home");
    await fresh.waitForTimeout(100);
    const atHome = await caret();
    result.ctrlHomeGoesToDocumentStart = Boolean(atHome) && atHome.index === 0 && atHome.offset === 0 && atHome.collapsed;

    // 4) トリプルクリックで選んだ段落で → は選択の末へ、← は頭へ移って選択が解ける(v204 ユーザー報告)。
    // ブラウザは段落の末の改行まで選ぶので、最後でないブロックでは選択が次のブロックの頭へはみ出し、
    // フォーカスが body に落ちて ←/→ が何も起こさなかった。打った文字はそのブロックだけを置き換える。
    const target = fresh.locator("#blocks .block-content", { hasText: "tab start" });
    const following = await fresh.evaluate(() => {
      const items = [...document.querySelectorAll("#blocks .block-content")];
      const index = items.findIndex((item) => item.textContent === "tab start");
      return { isLast: index === items.length - 1, next: items[index + 1]?.textContent };
    });
    const tripleState = () => fresh.evaluate(() => {
      const selection = getSelection();
      const range = selection.rangeCount ? selection.getRangeAt(0) : null;
      const owner = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(".block-content");
      const offset = (node, at) => {
        const probe = document.createRange();
        probe.selectNodeContents(owner(node));
        probe.setEnd(node, at);
        return probe.toString().length;
      };
      return {
        collapsed: selection.isCollapsed,
        text: selection.toString(),
        sameBlock: Boolean(range) && owner(range.startContainer) === owner(range.endContainer),
        block: owner(range?.startContainer)?.textContent,
        start: range && owner(range.startContainer) ? offset(range.startContainer, range.startOffset) : null,
        focused: document.activeElement?.classList.contains("block-content") ? document.activeElement.textContent : document.activeElement?.tagName,
      };
    });
    await target.click({ clickCount: 3, position: { x: 20, y: 10 } });
    await fresh.waitForTimeout(150);
    const tripled = await tripleState();
    result.tripleClickStaysInBlock = !following.isLast && tripled.text === "tab start" && tripled.sameBlock && tripled.focused === "tab start";
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(100);
    const right = await tripleState();
    result.tripleClickArrowRightGoesToEnd = right.collapsed && right.block === "tab start" && right.start === "tab start".length;
    await target.click({ clickCount: 3, position: { x: 20, y: 10 } });
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(100);
    const left = await tripleState();
    result.tripleClickArrowLeftGoesToStart = left.collapsed && left.block === "tab start" && left.start === 0;
    result.tripleClickArrowEvidence = { following, tripled, right, left };
    await target.click({ clickCount: 3, position: { x: 20, y: 10 } });
    await fresh.waitForTimeout(150);
    await fresh.keyboard.type("z");
    await fresh.waitForTimeout(150);
    const typed = await fresh.evaluate((next) => {
      const items = [...document.querySelectorAll("#blocks .block-content")].map((item) => item.textContent);
      return { replaced: items.includes("z"), nextKept: items.includes(next) };
    }, following.next);
    result.tripleClickTypingReplacesBlockOnly = typed.replaced && typed.nextKept;

    // 5) ブロックをまたぐ選択(ドラッグ)でも、→ は選択の末、← は頭へ移って選択が解ける(v204)。
    // v206 からドラッグはブロックの選択になるので、→ は最後のブロックの末、← は最初のブロックの頭へ。
    await insertBlock(fresh);
    await fresh.keyboard.type("cross one");
    await insertBlock(fresh);
    await fresh.keyboard.type("cross two");
    await insertBlock(fresh);
    await fresh.keyboard.type("cross three");
    const boxOf = (text) => fresh.locator("#blocks .block-content", { hasText: text }).boundingBox();
    const dragAcross = async () => {
      const one = await boxOf("cross one");
      const two = await boxOf("cross two");
      await fresh.mouse.move(one.x + 18, one.y + one.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(two.x + 30, two.y + two.height / 2, { steps: 8 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(150);
    };
    await dragAcross();
    const dragged = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected .block-content")].map((item) => item.textContent).join("|"));
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(100);
    const dragRight = await tripleState();
    await dragAcross();
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(100);
    const dragLeft = await tripleState();
    result.crossBlockArrowRightGoesToEnd = dragged === "cross one|cross two"
      && dragRight.collapsed && dragRight.block === "cross two" && dragRight.focused === "cross two" && dragRight.start === "cross two".length;
    result.crossBlockArrowLeftGoesToStart = dragLeft.collapsed && dragLeft.block === "cross one" && dragLeft.focused === "cross one"
      && dragLeft.start === 0;
    // 端がブロックの境目にあるとき: 末が次のブロックの位置 0 なら、選んだ文字のある前のブロックの末へ。
    // 頭が前のブロックの末なら、次のブロックの頭へ。
    const setCross = (from, fromOffset, to, toOffset) => fresh.evaluate(([a, ao, b, bo]) => {
      const node = (text) => [...document.querySelectorAll("#blocks .block-content")].find((item) => item.textContent === text).firstChild;
      getSelection().setBaseAndExtent(node(a), ao, b === null ? null : node(b), bo);
    }, [from, fromOffset, to, toOffset]);
    await setCross("cross one", 2, "cross three", 0);
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(100);
    const edgeRight = await tripleState();
    await setCross("cross one", "cross one".length, "cross three", 3);
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(100);
    const edgeLeft = await tripleState();
    result.crossBlockArrowSkipsEmptyEdge = edgeRight.collapsed && edgeRight.block === "cross two" && edgeRight.start === "cross two".length
      && edgeLeft.collapsed && edgeLeft.block === "cross two" && edgeLeft.start === 0;
    result.crossBlockArrowEvidence = { dragged, dragRight, dragLeft, edgeRight, edgeLeft };
    return result;
  } finally {
    await fresh.close();
  }
}
