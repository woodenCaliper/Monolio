// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, dragBlock, openMenu } from "../lib.mjs";

// ---- ブロックの選択まわり(v206) ----
// ユーザー原文「ページのブロックを選んでtabでインデントできるようにしてほしい」→ ページのブロックを選んで Tab で、
// すぐ上のページの子へ(Shift+Tab で親のページへ戻す)。
// 「ブロックをまたいだらそれは複数ブロックの選択になって…操作はブロックに対して行えるように」+ ユーザー決定
// 「書式はブロック全体に、入力は無効」→ ブロックを選んだときの書式は、選んだブロックの文字全部に当たる。
// 「空白ブロックに type / for command という文字が書かれているが…カーソルがあるときだけでよい」→ 案内はカーソルのある空ブロックだけ。
export default async function blockSelectSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
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
  // 左の目次を「字下げ + 名前」の並びで読む。
  const tree = () => fresh.evaluate(() => {
    const walk = (list, depth) => [...list.children].flatMap((item) => [
      " ".repeat(depth) + item.querySelector(".page-tree-item")?.textContent,
      ...(item.querySelector(":scope > ul") ? walk(item.querySelector(":scope > ul"), depth + 1) : []),
    ]);
    return walk(document.querySelector("#page-tree-body > ul"), 0).join("/");
  });
  // つまみを押してブロックを選ぶ(開いたメニューは Esc で閉じる。選択は残る)。
  const selectByGrip = async (blockId) => {
    const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await row.hover();
    await row.locator(".drag-grip").click();
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(100);
  };
  const selected = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id).join(","));
  const html = (blockId) => fresh.evaluate((id) => document.querySelector('#blocks .block-content[data-id="' + id + '"]')?.innerHTML ?? null, blockId);
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) ページのブロックを選んで Tab → すぐ上のページの子になる。Undo で戻る。
    await openLiteral({ pages: [
      { id: "R", title: "根", blocks: [{ id: "a", type: "page", pageId: "A" }, { id: "b", type: "page", pageId: "B" }, { id: "t", type: "paragraph", text: "本文" }] },
      { id: "A", title: "ページA", blocks: [{ id: "a1", type: "paragraph", text: "Aの本文" }] },
      { id: "B", title: "ページB", blocks: [{ id: "b1", type: "paragraph", text: "Bの本文" }] },
    ], fonts: [], attachments: [] }, "block-select-pages.html");
    const treeBefore = await tree();
    await selectByGrip("b");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(300);
    const treeNested = await tree();
    const rootRows = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.id).join(","));
    result.pageTabNestsUnderPageAbove = treeBefore === "根/ ページA/ ページB"
      && treeNested === "根/ ページA/  ページB"
      && rootRows === "a,t";
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.pageTabUndoRestores = (await tree()) === treeBefore;

    // 2) 子にしたページのブロックで Shift+Tab → 親のページへ戻る(元のページのすぐ下)。
    await selectByGrip("b");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(300);
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "ページA" }).click();
    await fresh.waitForTimeout(300);
    await selectByGrip("b");
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(300);
    result.pageShiftTabMovesToParent = (await tree()) === treeBefore
      && (await fresh.evaluate(() => document.querySelector("#doc-title")?.textContent)) === "ページA";

    // 3) つまみで選んだブロック(文字の選択は無い)にも、書式がブロックの文字全部に当たる。
    await openLiteral({ pages: [{ id: "F", title: "書式", blocks: [
      { id: "p", type: "paragraph", text: "一つ目の段落" },
      { id: "q", type: "paragraph", text: "二つ目の段落" },
      { id: "e", type: "paragraph", text: "" },
    ] }], fonts: [], attachments: [] }, "block-select-format.html");
    await selectByGrip("p");
    await fresh.keyboard.press("Control+b");
    await fresh.waitForTimeout(200);
    result.blockSelectionCtrlBBoldsWholeBlock = /^<b>一つ目の段落<\/b>$/.test(await html("p"))
      && (await html("q")) === "二つ目の段落"
      && (await selected()) === "p";
    // ツールバーの文字色も、選んだまま当てられる(ツールバーを押してもブロックの選択は外れない)。
    await fresh.locator("#format-color-trigger").click();
    await fresh.getByRole("menuitemradio", { name: "Red text color" }).click();
    await fresh.waitForTimeout(200);
    result.blockSelectionToolbarColorAppliesToBlock = await fresh.evaluate(() => {
      const host = document.querySelector('#blocks .block-content[data-id="p"]');
      return [...host.querySelectorAll("*")].some((node) => getComputedStyle(node).color === "rgb(193, 63, 47)")
        && host.textContent === "一つ目の段落";
    }) && (await selected()) === "p";
    // 書式クリアも、ブロックの文字全部から外れる(前の段に頼らないよう、太字と色を付け直してから選ぶ)。
    await fresh.evaluate(() => {
      const host = document.querySelector('#blocks .block-content[data-id="p"]');
      host.innerHTML = '<b>一つ目</b><span style="color: rgb(193, 63, 47);">の段落</span>';
      host.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await fresh.waitForTimeout(150);
    await selectByGrip("p");
    await fresh.locator("#format-reset").click();
    await fresh.waitForTimeout(200);
    result.blockSelectionResetClearsWholeBlock = (await html("p")) === "一つ目の段落" && (await selected()) === "p";
    // 選んだまま文字を打っても、本文は変わらない(入力は無効)。
    await fresh.keyboard.type("xyz");
    await fresh.waitForTimeout(150);
    result.blockSelectionIgnoresTyping = (await html("p")) === "一つ目の段落" && (await html("q")) === "二つ目の段落";

    // 4) トリプルクリック(行の選択)は、ブロックの選択にしない。
    await fresh.locator('#blocks .block-content[data-id="q"]').click({ clickCount: 3, position: { x: 20, y: 8 } });
    await fresh.waitForTimeout(200);
    result.tripleClickStaysTextSelection = (await selected()) === ""
      && (await fresh.evaluate(() => getSelection().toString().trim())) === "二つ目の段落";

    // 5) 空のブロックの案内は、カーソルのあるブロックだけに見える。見えないときも高さは変わらない。
    const placeholder = () => fresh.evaluate(() => {
      const host = document.querySelector('#blocks .block-content[data-id="e"]');
      const before = getComputedStyle(host, "::before");
      return { visible: before.content.includes("Type / for commands") && before.color !== "rgba(0, 0, 0, 0)", height: host.getBoundingClientRect().height };
    });
    const idle = await placeholder();
    await fresh.locator('#blocks .block-content[data-id="e"]').click();
    await fresh.waitForTimeout(150);
    const focused = await placeholder();
    result.placeholderOnlyOnFocusedEmptyBlock = idle.visible === false && focused.visible === true
      && idle.height === focused.height;

    // 6) つまみを押した(メニューが開いた)ままの Delete / Ctrl+C / Ctrl+X は、選んだブロックへの操作になる(v208。ユーザー指示)。
    await openLiteral({ pages: [{ id: "G", title: "つまみ", blocks: [
      { id: "g1", type: "paragraph", text: "つまみ一" },
      { id: "g2", type: "paragraph", text: "つまみ二" },
      { id: "g3", type: "paragraph", text: "つまみ三" },
    ] }], fonts: [], attachments: [] }, "block-select-grip.html");
    await fresh.evaluate(() => {
      window.__gripCopied = null;
      window.addEventListener("copy", (event) => { window.__gripCopied = event.clipboardData.getData("application/x-doc-editor-blocks+json"); });
    });
    const gripTexts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((item) => item.textContent).join("|"));
    const menuOpen = () => fresh.evaluate(() => !document.querySelector("#block-menu").hidden);
    const openGrip = async (blockId) => {
      const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
      await row.hover();
      await row.locator(".drag-grip").click();
      await fresh.waitForTimeout(150);
    };
    await openGrip("g2");
    const gripMenuOpened = await menuOpen();
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(200);
    result.gripMenuDeleteRemovesBlock = gripMenuOpened && (await gripTexts()) === "つまみ一|つまみ三" && !(await menuOpen());
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    await openGrip("g1");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(200);
    result.gripMenuCtrlCCopiesBlock = String(await fresh.evaluate(() => window.__gripCopied)).includes("つまみ一")
      && !(await menuOpen()) && (await selected()) === "g1";
    await openGrip("g3");
    await fresh.keyboard.press("Control+x");
    await fresh.waitForTimeout(200);
    result.gripMenuCtrlXCutsBlock = (await gripTexts()) === "つまみ一|つまみ二" && !(await menuOpen());
    // 検索欄に打った文字の Backspace は検索欄のもの。消し切ったあとの Backspace でもブロックは消えない。
    await openGrip("g1");
    await fresh.keyboard.type("見");
    await fresh.keyboard.press("Backspace");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(200);
    result.gripMenuSearchBackspaceKeepsBlock = (await gripTexts()) === "つまみ一|つまみ二" && (await menuOpen());
    await fresh.keyboard.press("Escape");

    // 7) Tab / Shift+Tab の字下げは、そのブロックだけ(v211。ユーザー決定「そのブロックだけ」。下にぶら下がる子は動かさない)。
    //    閉じたトグルは、見えない中身がこぼれないよう子ごと。
    const indentLiteral = { pages: [{ id: "I", title: "字下げ", blocks: [
      { id: "h", type: "heading2", text: "見出し" },
      { id: "p0", type: "paragraph", text: "親の段落" },
      { id: "k1", type: "paragraph", text: "子の一", indent: 1 },
      { id: "k2", type: "paragraph", text: "子の二", indent: 1 },
      { id: "t0", type: "toggle", text: "閉じたトグル", open: false },
      { id: "t1", type: "paragraph", text: "トグルの中", indent: 1 },
    ] }], fonts: [], attachments: [] };
    await openLiteral(indentLiteral, "block-select-indent.html");
    // 字下げは保存した文書で見る(閉じたトグルの中身は画面に出ないため)。
    const savedBlocks = async (name) => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, name);
      await (await download).saveAs(path);
      const doc = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), await readFile(path, "utf8"));
      return doc.pages[0].blocks;
    };
    const savedIndents = async (name) => Object.fromEntries((await savedBlocks(name)).map((block) => [block.id, block.indent || 0]));
    await fresh.locator('#blocks .block-content[data-id="p0"]').click();
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const caretTab = await savedIndents("indent-caret.html");
    result.tabIndentsOnlyThatBlock = caretTab.p0 === 1 && caretTab.k1 === 1 && caretTab.k2 === 1;
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(200);
    const caretBack = await savedIndents("indent-caret-back.html");
    result.shiftTabOutdentsOnlyThatBlock = caretBack.p0 === 0 && caretBack.k1 === 1 && caretBack.k2 === 1;
    await selectByGrip("p0");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const gripTab = await savedIndents("indent-grip.html");
    result.selectedBlockTabIndentsOnlyThatBlock = gripTab.p0 === 1 && gripTab.k1 === 1 && gripTab.k2 === 1;
    await selectByGrip("t0");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const toggleTab = await savedIndents("indent-toggle.html");
    result.closedToggleTabCarriesChildren = toggleTab.t0 === 1 && toggleTab.t1 === 2;

    // 7b) 字下げの上限は文書全体で1つ(20 段。Issue #139。ユーザー決定「20で統一」)。以前は Tab が 6 段まで・開くときが 20 段まで・
    //     貼り付けとドラッグは上限なしで、7 段以上のブロックでは、選んで Tab で 6 へ戻り、選んで Shift+Tab で一度に 6 まで戻り、
    //     文字の先頭の Tab では 6 を超えて増えた。いまは選んで押しても文字の先頭で押しても 1 段ずつ、20 段で止まる。
    //     閉じたトグルは中身ごと動き、中身が上限を超えるなら動かさない(中身だけ止まると外へこぼれる)。
    await openLiteral({ pages: [{ id: "J", title: "深い字下げ", blocks: [
      { id: "j0", type: "paragraph", text: "根" },
      { id: "j9", type: "paragraph", text: "九段", indent: 9 },
      { id: "j7", type: "paragraph", text: "七段", indent: 7 },
      { id: "j20", type: "paragraph", text: "二十段", indent: 20 },
      { id: "jt", type: "toggle", text: "五段の閉じたトグル", indent: 5, open: false },
      { id: "jc", type: "paragraph", text: "トグルの中", indent: 6 },
      { id: "js", type: "paragraph", text: "区切り" },
      { id: "ju", type: "toggle", text: "十九段の閉じたトグル", indent: 19, open: false },
      { id: "jv", type: "paragraph", text: "トグルの中(二十段)", indent: 20 },
    ] }], fonts: [], attachments: [] }, "block-select-deep-indent.html");
    await selectByGrip("j9");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const deepGripTab = await savedIndents("deep-grip-tab.html");
    await selectByGrip("j9");
    await fresh.keyboard.press("Shift+Tab");
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(200);
    const deepGripBack = await savedIndents("deep-grip-back.html");
    await selectByGrip("j20");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const deepGripLimit = await savedIndents("deep-grip-limit.html");
    result.deepIndentSelectedTabStepsOne = deepGripTab.j9 === 10 && deepGripBack.j9 === 8 && deepGripLimit.j20 === 20;
    const caretTabAt = async (blockId, key) => {
      await fresh.locator('#blocks .block-content[data-id="' + blockId + '"]').click();
      await fresh.keyboard.press("Home");
      await fresh.keyboard.press(key);
      await fresh.waitForTimeout(200);
    };
    await caretTabAt("j7", "Tab");
    await caretTabAt("j20", "Tab");
    const deepCaretTab = await savedIndents("deep-caret-tab.html");
    await caretTabAt("j7", "Shift+Tab");
    await caretTabAt("j20", "Shift+Tab");
    const deepCaretBack = await savedIndents("deep-caret-back.html");
    result.deepIndentCaretTabStopsAtLimit = deepCaretTab.j7 === 8 && deepCaretTab.j20 === 20 && deepCaretBack.j7 === 7 && deepCaretBack.j20 === 19;
    await selectByGrip("jt");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    await selectByGrip("ju");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const deepToggle = await savedIndents("deep-toggle-tab.html");
    result.deepClosedToggleTabCarriesChildren = deepToggle.jt === 6 && deepToggle.jc === 7 && deepToggle.ju === 19 && deepToggle.jv === 20;
    // 貼り付けでも上限(20 段)を超えない。超えたまま保存すると、開き直したときに 20 段へ切り詰められて形が変わっていた。
    await openLiteral({ pages: [{ id: "K", title: "深い貼り付け", blocks: [
      { id: "q0", type: "paragraph", text: "写す親" },
      { id: "q1", type: "paragraph", text: "写す子", indent: 1 },
      { id: "q2", type: "paragraph", text: "写す孫", indent: 2 },
      { id: "z20", type: "paragraph", text: "二十段の下へ", indent: 20 },
    ] }], fonts: [], attachments: [] }, "block-select-deep-paste.html");
    await selectByGrip("q0");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(200);
    await fresh.locator('#blocks .block-content[data-id="z20"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const pasted = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => Number(row.dataset.indent)));
    result.deepPasteStaysWithinLimit = pasted.length > 4 && pasted.every((indent) => indent <= 20) && pasted.slice(4).includes(20);
    // ドラッグでも上限を超えない(以前は子ごと 20 段のブロックの下へ落とすと、子が 21・22 段になった)。
    await openLiteral({ pages: [{ id: "K2", title: "深いドラッグ", blocks: [
      { id: "r0", type: "paragraph", text: "動かす親" },
      { id: "r1", type: "paragraph", text: "動かす子", indent: 1 },
      { id: "r2", type: "paragraph", text: "動かす孫", indent: 2 },
      { id: "ys", type: "paragraph", text: "区切り" },
      { id: "y20", type: "paragraph", text: "二十段の先", indent: 20 },
    ] }], fonts: [], attachments: [] }, "block-select-deep-drag.html");
    await dragBlock(fresh, "動かす親", "二十段の先", "after");
    await fresh.waitForTimeout(300);
    // 字下げは画面のブロックで見る(保存して開き直すと、開くときに 20 段へ切り詰められて隠れる)。
    const draggedDeep = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.id + ":" + row.dataset.indent));
    result.deepDragStaysWithinLimit = draggedDeep.join(",") === "ys:0,y20:20,r0:20,r1:20,r2:20";
    result.deepDragEvidence = draggedDeep.join(",");
    // 番号付きリストの番号も 7 段目以降を数える(以前は 7 段目以降を 6 段目と同じ段として数え、「1.1.1.1.1.1.2」になった)。
    result.deepNumberedMarkers = await fresh.evaluate(() => {
      const blocks = Array.from({ length: 9 }, (_, i) => ({ id: "n" + i, type: "numbered", text: "n", indent: i }));
      const markers = window.SingleHtmlFormat.numberedListMarkers(blocks);
      return markers.get("n7") === "1.1.1.1.1.1.1.1" && markers.get("n8") === "1.1.1.1.1.1.1.1.1"
        && window.SingleHtmlFormat.MAX_INDENT === 20 && window.SingleHtmlFormat.clampIndent(25) === 20 && window.SingleHtmlFormat.clampIndent(-1) === 0;
    });

    // 8) 自分の子の下へドラッグしたら、そのブロックだけが移る(子はその場に残る。v211。以前は黙って何もしなかった)。
    await openLiteral(indentLiteral, "block-select-drag-child.html");
    await dragBlock(fresh, "親の段落", "子の一", "after");
    await fresh.waitForTimeout(300);
    const dragged = await savedBlocks("drag-child.html");
    result.dragIntoOwnChildMovesOnlyThatBlock = dragged.map((block) => block.id + ":" + (block.indent || 0)).slice(0, 4).join(",") === "h:0,k1:1,p0:1,k2:1";
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await savedBlocks("drag-child-undo.html");
    result.dragIntoOwnChildUndoRestores = undone.map((block) => block.id + ":" + (block.indent || 0)).slice(0, 4).join(",") === "h:0,p0:0,k1:1,k2:1";

    // 9) 最後のブロックの文字から、下の余白までドラッグして離しても、選んだ範囲が残る(v212)。
    // 離した場所が本文の外だと click が余白(.doc)へ届き、余白クリックとして最後のブロックの末尾へ
    // キャレットを置いて、選択を消していた(端の自動スクロールで本文の外へ出たときも同じ)。
    await openLiteral({ pages: [{ id: "D", title: "余白", blocks: [
      { id: "d1", type: "paragraph", text: "first block" },
      { id: "d2", type: "paragraph", text: "last block text" },
    ] }], fonts: [], attachments: [] }, "block-select-drag-blank.html");
    const lastStart = await fresh.evaluate(() => {
      const node = document.querySelector('#blocks .block-content[data-id="d2"]').firstChild;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + rect.height / 2, bottom: document.querySelector('#blocks .block[data-id="d2"]').getBoundingClientRect().bottom };
    });
    await fresh.mouse.move(lastStart.x, lastStart.y);
    await fresh.mouse.down();
    await fresh.mouse.move(lastStart.x + 40, lastStart.bottom + 80, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    // ブラウザは最後の行の、ポインタの横位置までを選ぶ(「last bl」など)。先頭からの範囲が残っていればよい。
    const blankDragSelection = await fresh.evaluate(() => getSelection().toString());
    result.dragReleasedInBlankKeepsSelection = blankDragSelection.length >= 3
      && "last block text".startsWith(blankDragSelection)
      && (await selected()) === "";

    // 10) 行の右の余白を押したら、その行の末尾へ(v215。以前は文書の最後のブロック=表の末へ飛んでいた)。最後の行より下は文書の末尾へ。
    await openLiteral({ pages: [{ id: "S", title: "余白", blocks: [
      { id: "s1", type: "paragraph", text: "表の上の段落" },
      { id: "s2", type: "todo", text: "やること" },
      { id: "s3", type: "table", rows: [[{ text: "a" }, { text: "b" }], [{ text: "c" }, { text: "d" }]] },
    ] }], fonts: [], attachments: [] }, "block-select-side.html");
    const caretAt = () => fresh.evaluate(() => {
      const selection = getSelection();
      const node = selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      const cell = element?.closest?.("[data-row][data-cell]");
      return (element?.closest?.(".block")?.dataset.id || "") + (cell ? "@" + cell.dataset.row + "," + cell.dataset.cell : "");
    });
    const sideOf = async (blockId, yRatio = 0.5) => {
      const box = await fresh.locator('#blocks .block[data-id="' + blockId + '"]').boundingBox();
      await fresh.mouse.click(box.x + box.width + 40, box.y + box.height * yRatio);
      await fresh.waitForTimeout(200);
      return caretAt();
    };
    const besideParagraph = await sideOf("s1");
    const besideTodo = await sideOf("s2");
    result.sideClickFocusesThatRow = besideParagraph === "s1" && besideTodo === "s2";
    const tableFirstRow = await fresh.locator('#blocks .block[data-id="s3"] [data-row="0"][data-cell="1"]').boundingBox();
    const tableBox = await fresh.locator('#blocks .block[data-id="s3"]').boundingBox();
    await fresh.mouse.click(tableBox.x + tableBox.width + 40, tableFirstRow.y + tableFirstRow.height / 2);
    await fresh.waitForTimeout(200);
    result.sideClickOnTableRowFocusesThatTableRow = (await caretAt()) === "s3@0,1";
    await fresh.mouse.click(tableBox.x + 60, tableBox.y + tableBox.height + 120);
    await fresh.waitForTimeout(200);
    result.clickBelowLastRowStillGoesToEnd = (await caretAt()) === "s3@1,1";
    return result;
  } finally {
    await fresh.close();
  }
}
