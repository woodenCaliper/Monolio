// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 本文の編集の小さな不具合の直し(v213 の確認で見つかったもの) ----
// A) 空のリスト項目で Enter(段落へ戻す)が Undo の1手になっていなかった(Ctrl+Z 1回目で1つ前の Enter まで戻った)。
// B) 「***」で作った区切り線が Undo 2回(1回目は下の空の段落だけが消えた)。1回で「***」へ戻る。
// C) 字下げ0のブロックを選んで Shift+Tab: 何も変わらないのに「編集済み」になり、Undo の空の1手を積んでいた。
// D) 行末まで選んで(Shift+End) Enter: 選んだ文字が消えず、下に空のブロックが増えるだけだった。選んだ文字を消して分割する。
// E) 「/参照」がコード・グラフ・数式・Mermaid でも出て、入れた印は保存で平文になった。本文のブロックでだけ出す。
// F) すべて置換: 一致が図表の参照の印の中だけ(置換しない)でも「1 件を 1 ページで置換しました」と出て、「編集済み」と
//    Undo の1手が残った。実際に変わった件数だけ数え、変わらなければ置換しなかったと知らせる。印に掛かる一致は飛ばす。
export default async function lowFixEditSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const cells = (...values) => values.map((text) => ({ text }));
    const openLiteral = async (blocks) => {
      const literal = { title: "LowFix", fonts: [], attachments: [], pages: [{ id: "LF1", title: "LowFix", blocks }] };
      const source = join(OUT, "low-fix-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "LowFix", null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 保存HTMLから読んだ文書モデル(保存すると「編集済み」が消える)。
    const savedBlocks = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "low-fix-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      await fresh.waitForTimeout(150);
      return fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages[0].blocks.map((block) => ({ id: block.id, type: block.type, text: block.text, html: block.html || "" }));
      }, html);
    };
    const domBlocks = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => {
      const type = [...row.classList].find((name) => name.startsWith("type-"))?.slice(5);
      const text = (row.querySelector(".block-content")?.textContent ?? "").replaceAll("​", "");
      return type + ":" + text;
    }));
    const isDirty = () => fresh.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    const press = async (key, ms = 200) => {
      await fresh.keyboard.press(key);
      await fresh.waitForTimeout(ms);
    };
    // 文字 needle の直後(where = "end")か先頭(where = "start")にキャレットを置く。
    const caretAtText = async (needle, where = "end") => {
      await fresh.evaluate(([text, place]) => {
        const editable = [...document.querySelectorAll("#blocks .block-content")].find((item) => item.textContent.includes(text));
        editable.focus();
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = node.nodeValue.indexOf(text);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, place === "start" ? at : at + text.length);
          range.collapse(true);
          getSelection().removeAllRanges();
          getSelection().addRange(range);
          return;
        }
      }, [needle, where]);
      await fresh.waitForTimeout(50);
    };

    // ---- A) 空のリスト項目の Enter は Undo の1手 ----
    await openLiteral([{ id: "a1", type: "paragraph", text: "first" }]);
    await caretAtText("first");
    await press("Enter");
    await fresh.keyboard.type("- one");
    await press("Enter");
    await press("Enter");
    const afterEmptyEnter = await domBlocks();
    await press("Control+z");
    const undoOnce = await domBlocks();
    await press("Control+z");
    const undoTwice = await domBlocks();
    result.emptyListEnterIsOneUndoStep = JSON.stringify(afterEmptyEnter) === JSON.stringify(["paragraph:first", "bullet:one", "paragraph:"])
      && JSON.stringify(undoOnce) === JSON.stringify(["paragraph:first", "bullet:one", "bullet:"])
      && JSON.stringify(undoTwice) === JSON.stringify(["paragraph:first", "bullet:one"]);

    // ---- B) 「***」の区切り線は Undo 1回で「***」へ戻る(Redo 1回で区切り線と下の段落がそろって戻る) ----
    await openLiteral([{ id: "b1", type: "paragraph", text: "start" }, { id: "b2", type: "paragraph", text: "next" }]);
    await caretAtText("start");
    await press("Enter");
    await fresh.keyboard.type("***");
    await fresh.waitForTimeout(200);
    const afterDivider = await domBlocks();
    await press("Control+z");
    const dividerUndo = await domBlocks();
    await press("Control+y");
    const dividerRedo = await domBlocks();
    const withDivider = ["paragraph:start", "divider:", "paragraph:", "paragraph:next"];
    result.dividerShortcutIsOneUndoStep = JSON.stringify(afterDivider) === JSON.stringify(withDivider)
      && JSON.stringify(dividerUndo) === JSON.stringify(["paragraph:start", "paragraph:***", "paragraph:next"])
      && JSON.stringify(dividerRedo) === JSON.stringify(withDivider);

    // ---- C) 字下げ0のブロックを選んで Shift+Tab は何もしない(編集済みにならず、Undo の空の1手も積まない) ----
    await openLiteral([
      { id: "c1", type: "paragraph", text: "alpha" },
      { id: "c2", type: "paragraph", text: "bravo" },
      { id: "c3", type: "paragraph", text: "charlie" },
    ]);
    // 先に1手編集して保存しておく(Shift+Tab のあとの Undo 1回が、この編集を戻すことを確かめる)。
    await caretAtText("alpha");
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(200);
    await savedBlocks();
    const box = (needle) => fresh.evaluate((text) => {
      const row = [...document.querySelectorAll("#blocks .block")].find((item) => item.textContent.includes(text));
      const rect = row.getBoundingClientRect();
      return { left: rect.left, top: rect.top, bottom: rect.bottom };
    }, needle);
    const from = await box("bravo");
    const to = await box("charlie");
    await fresh.mouse.move(from.left - 30, from.top + 4);
    await fresh.mouse.down();
    await fresh.mouse.move(from.left - 20, from.top + 8, { steps: 3 });
    await fresh.mouse.move(from.left + 120, to.bottom - 4, { steps: 10 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const selectedRows = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id));
    await press("Shift+Tab", 250);
    const dirtyAfterShiftTab = await isDirty();
    const blocksAfterShiftTab = await domBlocks();
    await press("Control+z", 250);
    const afterUndoC = await domBlocks();
    result.shiftTabAtIndentZeroIsNoop = JSON.stringify(selectedRows) === JSON.stringify(["c2", "c3"])
      && dirtyAfterShiftTab === false
      && JSON.stringify(blocksAfterShiftTab) === JSON.stringify(["paragraph:alphaX", "paragraph:bravo", "paragraph:charlie"])
      // Undo 1回で、その前の「X」の入力が戻る(空の1手が挟まっていない)。
      && JSON.stringify(afterUndoC) === JSON.stringify(["paragraph:alpha", "paragraph:bravo", "paragraph:charlie"]);

    // ---- D) 行末まで選んで Enter: 選んだ文字を消して分割する(Undo 1回で元へ) ----
    await openLiteral([
      { id: "d1", type: "paragraph", text: "hello world" },
      { id: "d2", type: "heading2", text: "Title text" },
      { id: "d3", type: "paragraph", text: "end" },
    ]);
    await caretAtText("hello");
    await press("Shift+End", 100);
    const selectedText = await fresh.evaluate(() => getSelection().toString());
    await press("Enter", 250);
    const afterSplit = await domBlocks();
    const caretInNewBlock = await fresh.evaluate(() => {
      const editable = document.activeElement?.closest?.(".block-content");
      const rows = [...document.querySelectorAll("#blocks .block")];
      return Boolean(editable) && rows.indexOf(editable.closest(".block")) === 1;
    });
    await press("Control+z", 250);
    const afterSplitUndo = await domBlocks();
    // 見出しを丸ごと選んで Enter: 見出しは空になり、下は(末尾の Enter と同じく)段落。
    await caretAtText("Title", "start");
    await press("Shift+End", 100);
    await press("Enter", 250);
    const afterHeadingSplit = await domBlocks();
    const modelD = await savedBlocks();
    result.enterWithSelectionToEndDeletesSelection = selectedText === " world"
      && JSON.stringify(afterSplit) === JSON.stringify(["paragraph:hello", "paragraph:", "heading2:Title text", "paragraph:end"])
      && caretInNewBlock
      && JSON.stringify(afterSplitUndo) === JSON.stringify(["paragraph:hello world", "heading2:Title text", "paragraph:end"]);
    result.enterWithWholeHeadingSelectedEmptiesIt = JSON.stringify(afterHeadingSplit)
      === JSON.stringify(["paragraph:hello world", "heading2:", "paragraph:", "paragraph:end"])
      && JSON.stringify(modelD.map((block) => block.type + ":" + block.text)) === JSON.stringify(afterHeadingSplit);

    // ---- E) 「/参照」は本文のブロックでだけ出す ----
    await openLiteral([
      { id: "t1", type: "table", text: "", caption: "条件", rows: [cells("a", "b"), cells("1", "2")] },
      { id: "e1", type: "code", text: "x = 1" },
      { id: "e2", type: "math", text: "a+b" },
      { id: "e3", type: "paragraph", text: "end" },
    ]);
    const slashTypesAfterTyping = async (blockId) => {
      // 数式は絵が手前にあってクリックが届かないので、編集領域へ直接キャレットを置く(本文の末尾)。
      await fresh.evaluate((id) => {
        const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
        editable.focus();
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }, blockId);
      await fresh.waitForTimeout(100);
      await fresh.keyboard.type(" /参照");
      await fresh.waitForTimeout(300);
      const types = await fresh.evaluate(() => (document.querySelector("#slash-menu").hidden
        ? []
        : [...document.querySelectorAll("#slash-menu .menu-item")].map((item) => item.dataset.type)));
      await press("Escape", 150);
      return types;
    };
    const inCode = await slashTypesAfterTyping("e1");
    const inMath = await slashTypesAfterTyping("e2");
    const inParagraph = await slashTypesAfterTyping("e3");
    result.figureRefNotOfferedInSourceBlocks = !inCode.includes("figure-ref") && !inMath.includes("figure-ref")
      && inParagraph.includes("figure-ref");

    // ---- F) すべて置換は実際に変わった件数だけ数える ----
    await openLiteral([
      { id: "t1", type: "table", text: "", caption: "条件", rows: [cells("a", "b"), cells("1", "2")] },
      { id: "f1", type: "paragraph", text: "参照表1です", html: '参照<span class="figure-ref" data-ref="t1">表1</span>です' },
      { id: "f2", type: "paragraph", text: "end" },
    ]);
    const f1Html = () => fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="f1"]');
      const chip = editable.querySelector(".figure-ref");
      return editable.textContent + "|" + (chip ? chip.dataset.ref + ":" + chip.textContent : "no-chip");
    });
    const replaceAll = async (query, replacement) => {
      await fresh.locator("#search-input").fill(query);
      await fresh.locator("#search-replace-input").fill(replacement);
      await fresh.waitForTimeout(250);
      await fresh.locator("#search-replace-all").click();
      await fresh.waitForTimeout(300);
      return fresh.locator("#search-page").textContent();
    };
    await fresh.locator('#blocks .block-content[data-id="f2"]').click();
    await press("Control+h");
    // 印の中だけの一致
    const noticeInside = await replaceAll("表1", "ZZ");
    const textInside = await f1Html();
    const dirtyInside = await isDirty();
    // 印に掛かる一致(印の外へはみ出す分だけ置き換えない)
    const noticeAcross = await replaceAll("1で", "XYZ");
    const textAcross = await f1Html();
    const dirtyAcross = await isDirty();
    // 同じ文字への置換も変化なし
    const noticeSame = await replaceAll("end", "end");
    const dirtySame = await isDirty();
    // 置換(1件ずつ)でも、印の中の一致は変えず「編集済み」にしない
    await fresh.locator("#search-input").fill("表1");
    await fresh.locator("#search-replace-input").fill("ZZ");
    await fresh.waitForTimeout(250);
    await fresh.locator("#search-replace-input").press("Enter");
    await fresh.waitForTimeout(300);
    const textSingle = await f1Html();
    const dirtySingle = await isDirty();
    // 印の外の一致はこれまでどおり置き換わり、件数も正しい(印はそのまま)
    const noticeReal = await replaceAll("参照", "見よ");
    const textReal = await f1Html();
    // 本物の置換のあとに、変わらない置換をもう一度。
    await replaceAll("表1", "ZZ");
    await press("Escape", 150);
    const unchanged = "参照表1です|t1:表1";
    result.replaceAllCountsOnlyRealChanges = noticeInside === "置換した箇所はありません" && textInside === unchanged && dirtyInside === false
      && noticeAcross === "置換した箇所はありません" && textAcross === unchanged && dirtyAcross === false
      && noticeSame === "置換した箇所はありません" && dirtySame === false
      && textSingle === unchanged && dirtySingle === false
      && noticeReal === "1 件を 1 ページで置換しました" && textReal === "見よ表1です|t1:表1";
    // 変わらなかった置換は Undo の手を残さない: Undo 1回で、その前の本物の置換が戻る(空の1手が挟まっていない)。
    await fresh.locator('#blocks .block-content[data-id="f2"]').click();
    await press("Control+z", 250);
    result.replaceAllNoopLeavesNoUndoStep = (await f1Html()) === unchanged;

    return result;
  } finally {
    await fresh.close();
  }
}
