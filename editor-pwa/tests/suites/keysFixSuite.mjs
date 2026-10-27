// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- キー操作と Undo の不具合(v249。探索的なデバッグで見つけたもの。ユーザー指示「あなたの側で、順番に直していってほしい」) ----
// 1) Issue #89: ブロックの頭で Tab を押すとキャレットが末尾へ飛び、もう一度 Tab を押すと字下げされずにタブ文字が入った。
// 2) Issue #90: 表のセルで変換中に Tab(Mac 型 IME)を押すと、変換中の文字が元のセルに、確定した文字が隣のセルに入った。
// 3) Issue #92: 行末で Shift+Enter した直後の空の行から、↓ / → / Delete で次のブロックへ進めなかった。
// 4) Issue #93: ページのブロック・目次ブロックの前後で矢印キーが止まった。
// 5) Issue #94: ↓↑ で1行のブロックを通るたびに2回押す必要があり、横の位置も保たれなかった。
// 6) Issue #118: 何も消えない Backspace / Delete が中身の同じ1手を積み、Redo が消えた。
// 7) Issue #119: 全画面の「下に2行を挿入」が、空の1手のあと・履歴が上限(100手)のとき、Ctrl+Z 1回で戻らなかった。
export default async function keysFixSuite({ browser }) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 860 } });
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
  const cells = (rows) => rows.map((line) => line.map((text) => ({ text, colSpan: 1, rowSpan: 1 })));
  const openDoc = async (pages) => {
    const title = pages[0].title;
    const path = join(OUT, "keys-fix-" + (opened += 1) + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), { pages, fonts: [], attachments: [] }), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const kb = fresh.keyboard;
  const press = async (key, times = 1) => {
    for (let i = 0; i < times; i += 1) {
      await kb.press(key);
      await fresh.waitForTimeout(80);
    }
  };
  // ブロックの文字の offset へキャレットを置く。
  const placeAt = async (id, offset) => {
    await fresh.locator('#blocks .block-content[data-id="' + id + '"]').first().click();
    await fresh.evaluate(({ id, offset }) => {
      const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
      editable.focus();
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
      let total = 0;
      let at = [editable, 0];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (offset <= total + node.nodeValue.length) {
          at = [node, offset - total];
          break;
        }
        total += node.nodeValue.length;
      }
      const range = document.createRange();
      range.setStart(...at);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, { id, offset });
    await fresh.waitForTimeout(60);
  };
  // キャレットのあるブロックと、その中の文字の位置。
  const where = () => fresh.evaluate(() => {
    const selection = getSelection();
    const editable = document.activeElement?.closest?.(".block-content");
    if (!editable || !selection.rangeCount) return "none";
    const range = selection.getRangeAt(0);
    const before = document.createRange();
    before.selectNodeContents(editable);
    before.setEnd(range.startContainer, range.startOffset);
    return editable.dataset.id + "@" + before.toString().length;
  });
  const blockTexts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content[data-id]")].map((node) => node.dataset.id + ":" + node.textContent));
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) #89 Tab の字下げのあとのキャレット
    await openDoc([{ id: "P1", title: "Tab", blocks: [{ id: "a", type: "bullet", text: "one" }, { id: "b", type: "bullet", text: "two" }, { id: "c", type: "bullet", text: "three" }] }]);
    await placeAt("c", 0);
    await press("Tab");
    const afterFirstTab = await where();
    await press("Tab");
    const afterSecondTab = await where();
    const indents = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.indent || row.style.getPropertyValue("--indent") || ""));
    const thirdText = await fresh.locator('#blocks .block-content[data-id="c"]').textContent();
    result.tabIndentKeepsCaret = afterFirstTab === "c@0" && afterSecondTab === "c@0" && thirdText === "three";
    result.tabIndentEvidence = JSON.stringify({ afterFirstTab, afterSecondTab, thirdText, indents });

    // 2) #90 表のセルで変換中の Tab(Mac 型)
    const cdp = await context.newCDPSession(fresh);
    await openDoc([{ id: "P1", title: "IME Tab", blocks: [{ id: "t", type: "table", rows: cells([["a", "b"], ["c", "d"]]) }] }]);
    await fresh.locator('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]').click();
    await press("End");
    await cdp.send("Input.imeSetComposition", { text: "さ", selectionStart: 1, selectionEnd: 1 });
    await fresh.waitForTimeout(60);
    const tabKey = { windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229, key: "Tab", code: "Tab" };
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...tabKey });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...tabKey });
    await fresh.waitForTimeout(80);
    await cdp.send("Input.imeSetComposition", { text: "三", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.insertText", { text: "三" });
    await fresh.waitForTimeout(200);
    const imeCells = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] tr')].map((tr) => [...tr.children].map((td) => td.textContent).join("|")).join("/"));
    result.tableTabDuringImeStaysInCell = imeCells === "a三|b/c|d";
    result.tableTabImeEvidence = imeCells;

    // 3) #92 Shift+Enter の直後の空の行から ↓ / → / Delete
    const shiftEnter = {};
    for (const key of ["ArrowDown", "ArrowRight", "Delete"]) {
      await openDoc([{ id: "P1", title: "Shift Enter " + key, blocks: [P("a", "abc"), P("b", "next")] }]);
      await placeAt("a", 3);
      await press("Shift+Enter");
      await press(key);
      shiftEnter[key] = { where: await where(), texts: (await blockTexts()).join(",") };
    }
    // Delete で繋ぐと、Shift+Enter で入れた改行1つを挟んで1つのブロックになる(改行は増えない)。
    result.shiftEnterEmptyLineMovesOn = shiftEnter.ArrowDown.where === "b@0" && shiftEnter.ArrowRight.where === "b@0"
      && shiftEnter.Delete.texts.split(",").length === 1;
    result.shiftEnterDeleteJoinsWithOneNewline = /^a:abc\nnext\n?$/.test(shiftEnter.Delete.texts) && shiftEnter.Delete.where === "a@4";
    // 開き直した文書の末尾の改行1つは画面に出ない(編集すると serializeBlockText が落とす)ので、見えているとおり「abcnext」と繋ぐ。
    await openDoc([{ id: "P1", title: "Shift Enter reopened", blocks: [P("a", "abc\n"), P("b", "next")] }]);
    await placeAt("a", 3);
    await press("Delete");
    const reopenedJoin = { where: await where(), texts: (await blockTexts()).join(",") };
    result.reopenedTrailingNewlineDeleteJoins = reopenedJoin.texts === "a:abcnext" && reopenedJoin.where === "a@3";
    shiftEnter.reopened = reopenedJoin;
    result.shiftEnterEvidence = JSON.stringify(shiftEnter);

    // 4) #93 ページのブロック・目次の前後の矢印キー
    const across = {};
    for (const [name, middle] of [["page", { id: "m", type: "page", text: "", pageId: "P2" }], ["toc", { id: "m", type: "toc", text: "" }]]) {
      await openDoc([{ id: "P1", title: "Across " + name, blocks: [P("a", "above"), middle, P("b", "below")] }, { id: "P2", title: "Sub", blocks: [P("s", "")] }]);
      await placeAt("a", 2);
      await press("ArrowDown");
      const down = await where();
      await placeAt("a", 5);
      await press("ArrowRight");
      const right = await where();
      await placeAt("b", 2);
      await press("ArrowUp");
      const up = await where();
      await placeAt("b", 0);
      await press("ArrowLeft");
      const left = await where();
      across[name] = { down, right, up, left };
    }
    result.arrowsSkipPageAndTocBlocks = ["page", "toc"].every((name) => across[name].down.startsWith("b@") && across[name].right === "b@0"
      && across[name].up.startsWith("a@") && across[name].left === "a@5");
    result.arrowsAcrossEvidence = JSON.stringify(across);

    // 5) #94 1行のブロックを ↓↑ で1回ずつ。横の位置も保つ
    await openDoc([{ id: "P1", title: "Arrow lines", blocks: [P("a", "alpha"), P("b", "bravo1"), P("c", "charl"), P("d", "delta1")] }]);
    await placeAt("a", 2);
    const downs = [];
    for (let i = 0; i < 3; i += 1) {
      await press("ArrowDown");
      downs.push(await where());
    }
    const ups = [];
    for (let i = 0; i < 3; i += 1) {
      await press("ArrowUp");
      ups.push(await where());
    }
    const blockOf = (list) => list.map((item) => item.split("@")[0]).join("");
    const offsetsNear = (list) => list.every((item) => Math.abs(Number(item.split("@")[1]) - 2) <= 1);
    result.arrowDownUpOnePressPerLine = blockOf(downs) === "bcd" && blockOf(ups) === "cba";
    result.arrowDownUpKeepsColumn = offsetsNear(downs) && offsetsNear(ups);
    result.arrowLinesEvidence = JSON.stringify({ downs, ups });

    // 6) #118 何も消えない Backspace / Delete のあとも Redo できる
    const noop = {};
    const noopCases = {
      firstStartBackspace: { at: ["a", 0], key: "Backspace" },
      lastEndDelete: { at: ["z", 5], key: "Delete" },
    };
    for (const [name, spec] of Object.entries(noopCases)) {
      await openDoc([{ id: "P1", title: "Noop " + name, blocks: [P("a", "alpha"), P("m", ""), P("z", "omega")] }]);
      await placeAt("m", 0);
      await kb.type("XYZ");
      await fresh.waitForTimeout(150);
      await press("Control+z");
      await placeAt(spec.at[0], spec.at[1]);
      await press(spec.key);
      await press("Control+y");
      await fresh.waitForTimeout(150);
      noop[name] = await fresh.locator('#blocks .block-content[data-id="m"]').textContent();
    }
    result.noopDeleteKeepsRedo = Object.values(noop).every((text) => text === "XYZ");
    result.noopDeleteEvidence = JSON.stringify(noop);

    // 7) #119 全画面の「下に2行を挿入」が Ctrl+Z 1回で戻る(空の1手のあと・履歴が上限のとき)
    const sheetInsert = async () => {
      await fresh.locator('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]').click();
      await fresh.locator('#table-toolbar [data-tool="focus"]').click();
      await fresh.waitForTimeout(250);
      await fresh.locator('.sheet-row-header[data-row="0"]').click();
      await fresh.locator('.sheet-row-header[data-row="1"]').click({ modifiers: ["Shift"] });
      await fresh.locator('.sheet-row-header[data-row="1"]').click({ button: "right" });
      await fresh.waitForTimeout(150);
      await fresh.locator('.table-tool-menu [data-key="insert-after"]').click();
      await fresh.waitForTimeout(200);
      const rowsAfterInsert = await fresh.locator('#blocks .block[data-id="t"] tr').count();
      await press("Control+z");
      await fresh.waitForTimeout(200);
      const rowsAfterUndo = await fresh.locator('#blocks .block[data-id="t"] tr').count();
      await press("Escape");
      await fresh.waitForTimeout(150);
      if (await fresh.locator(".table-focus-bar .table-focus-close").count()) await fresh.locator(".table-focus-bar .table-focus-close").click();
      await fresh.waitForTimeout(150);
      return { rowsAfterInsert, rowsAfterUndo };
    };
    const sheetDoc = [{ id: "P1", title: "Sheet undo", blocks: [P("a", "alpha"), P("b", "bravo"), { id: "t", type: "table", rows: cells([["x", "1"], ["y", "2"], ["z", "3"]]) }, P("c", "charlie")] }];
    await openDoc(sheetDoc);
    await placeAt("c", 7);
    await press("Delete");
    const afterNoop = await sheetInsert();
    await openDoc(sheetDoc.map((page) => ({ ...page, title: "Sheet undo limit" })));
    for (let i = 0; i < 110; i += 1) {
      await fresh.locator('#blocks .block-content[data-id="' + (i % 2 ? "a" : "b") + '"]').click();
      await kb.press("End");
      await kb.type(String(i % 10));
    }
    const atLimit = await sheetInsert();
    result.sheetInsertUndoOneStep = afterNoop.rowsAfterInsert === 5 && afterNoop.rowsAfterUndo === 3
      && atLimit.rowsAfterInsert === 5 && atLimit.rowsAfterUndo === 3;
    result.sheetInsertUndoEvidence = JSON.stringify({ afterNoop, atLimit });

    result.keysFixNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.keysFixPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
