// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 本文の編集キーの不具合の直し その2(v213 の確認で見つかった3件) ----
// A) 行頭の Markdown 変換が、入力のたびに本文全体の先頭を見ていた。いま打った文字で目印が完成し、キャレットが目印の
//    直後にあるときだけ変換する。見出しの中では変換しない(「## 1. Overview」が番号リスト「Overview」に化けていた)。
//    Undo で戻した「1. 」の続きを打つ・コードから段落へ変えた「# comment」に打つ、で後から変換されていた。
// B) スラッシュメニューが本文の末尾の「/…」を見ていたため、キャレットが別の所にあっても開き、Enter(分割)を飲み込む・
//    ブロックの種類を変えるなどしていた。「/…」がキャレットで終わっているときだけ開く。
//    (末尾で打った「/…」で今までどおり開くのは smallFix3Suite の slashMenuClosesWhenCaretClickedAway(openedByTyping)が見る。)
// C) チェック済みの todo の先頭で Enter: 上に足した空の行がチェック済みのまま、文字が未チェックの行へ移っていた。
export default async function editKeysFix2Suite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const openLiteral = async (blocks) => {
      const literal = { title: "EditKeys2", fonts: [], attachments: [], pages: [{ id: "EK2", title: "EditKeys2", blocks }] };
      const source = join(OUT, "edit-keys2-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "EditKeys2", null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 保存HTMLから読んだ文書モデル(ブロックの id / type / text / checked)
    const savedBlocks = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "edit-keys2-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      await fresh.waitForTimeout(150);
      return fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages[0].blocks.map((block) => ({ type: block.type, text: block.text, checked: Boolean(block.checked) }));
      }, html);
    };
    const domBlocks = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => ({
      type: [...row.classList].find((name) => name.startsWith("type-"))?.slice(5),
      text: (row.querySelector(".block-content")?.textContent ?? "").replaceAll("​", "").replaceAll(" ", " "),
    })));
    // ブロックの本文の文字位置 offset(文字ノードの中)にキャレットを置く。
    const caretAt = async (blockId, offset) => {
      await fresh.locator('#blocks .block-content[data-id="' + blockId + '"]').click();
      await fresh.evaluate(([id, at]) => {
        const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
        editable.focus();
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        let rest = at === "end" ? Infinity : at;
        let node = walker.nextNode();
        let last = node;
        while (node && rest > node.nodeValue.length) {
          rest -= node.nodeValue.length;
          last = node;
          node = walker.nextNode();
        }
        const target = node || last;
        const range = document.createRange();
        range.setStart(target, node ? rest : target.nodeValue.length);
        range.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }, [blockId, offset]);
      await fresh.waitForTimeout(50);
    };
    const slashHidden = () => fresh.evaluate(() => document.querySelector("#slash-menu").hidden);

    // ---- A) 行頭の Markdown 変換 ----
    await openLiteral([
      { id: "a1", type: "paragraph", text: "" },
      { id: "a2", type: "paragraph", text: "" },
      { id: "a3", type: "code", text: "# comment line" },
      { id: "a4", type: "paragraph", text: "#x abc" },
    ]);
    // A-1) 「## 1. Overview」: 見出しになった後の「1. 」は見出しの文字のまま。
    await fresh.locator('#blocks .block-content[data-id="a1"]').click();
    await fresh.keyboard.type("## 1. Overview");
    await fresh.waitForTimeout(200);
    const typedHeading = await domBlocks();
    // A-2) 「1. 」で番号リスト → Undo で段落「1. 」へ → 続きを打っても段落のまま。
    await fresh.locator('#blocks .block-content[data-id="a2"]').click();
    await fresh.keyboard.type("1. ");
    await fresh.waitForTimeout(200);
    const numberedBefore = (await domBlocks())[1];
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const afterUndo = (await domBlocks())[1];
    await caretAt("a2", "end");
    await fresh.keyboard.type("Intro");
    await fresh.waitForTimeout(200);
    const afterUndoTyped = (await domBlocks())[1];
    // A-3) コードの「# comment line」を段落へ変える → 末尾に1文字打っても見出しに化けない(「# 」が消えない)。
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(80);
    await fresh.locator('#blocks .block[data-id="a3"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#block-menu .menu-item[data-action="paragraph"]').click();
    await fresh.waitForTimeout(250);
    const convertedToParagraph = (await domBlocks())[2];
    await caretAt("a3", "end");
    await fresh.keyboard.type("!");
    await fresh.waitForTimeout(200);
    const convertedTyped = (await domBlocks())[2];
    // A-4) 削除で「# 」の形になっても変換しない(打っていない)。「#x abc」の x を消す。
    await caretAt("a4", 2);
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(200);
    const afterDelete = (await domBlocks())[3];
    // 打った区切りのスペースでは今までどおり変換する(既存の本文の頭)のは、listShortcutSuite の
    // markerConversionKeepsBold・markerConversionKeepsColor(既存の本文の頭で「-」+ Space)が見る。
    const modelA = await savedBlocks();
    result.markdownHeadingKeepsNumberPrefix = typedHeading[0].type === "heading2" && typedHeading[0].text === "1. Overview"
      && modelA[0].type === "heading2" && modelA[0].text === "1. Overview";
    result.markdownUndoneConversionStaysLiteral = numberedBefore.type === "numbered"
      && afterUndo.type === "paragraph" && afterUndo.text === "1. "
      && afterUndoTyped.type === "paragraph" && afterUndoTyped.text === "1. Intro"
      && modelA[1].type === "paragraph" && modelA[1].text === "1. Intro";
    result.markdownConvertedCodeStaysLiteral = convertedToParagraph.type === "paragraph"
      && convertedTyped.type === "paragraph" && convertedTyped.text === "# comment line!"
      && modelA[2].type === "paragraph" && modelA[2].text === "# comment line!";
    result.markdownDeleteDoesNotConvert = afterDelete.type === "paragraph" && afterDelete.text === "# abc"
      && modelA[3].type === "paragraph" && modelA[3].text === "# abc";

    // ---- B) スラッシュメニューはキャレットで終わる「/…」だけ ----
    await openLiteral([
      { id: "b1", type: "paragraph", text: "Files live in /tmp" },
      { id: "b2", type: "paragraph", text: "Quote the /code" },
    ]);
    await caretAt("b1", "Files".length);
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(200);
    const hiddenMidB1 = await slashHidden();
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    await caretAt("b2", "Quote".length);
    await fresh.keyboard.type("Y");
    await fresh.waitForTimeout(200);
    const hiddenMidB2 = await slashHidden();
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const modelB = await savedBlocks();
    result.slashMenuIgnoresSlashAwayFromCaret = hiddenMidB1 && hiddenMidB2
      && JSON.stringify(modelB.slice(0, 4).map((block) => block.type + ":" + block.text)) === JSON.stringify([
        "paragraph:FilesX", "paragraph: live in /tmp", "paragraph:QuoteY", "paragraph: the /code",
      ]);

    // ---- C) チェック済みの todo の先頭で Enter ----
    await openLiteral([
      { id: "c1", type: "todo", text: "Done task", checked: true },
      { id: "c2", type: "paragraph", text: "after" },
    ]);
    await caretAt("c1", 0);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const domC = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.type-todo")].map((row) => ({
      text: (row.querySelector(".block-content")?.textContent ?? "").replaceAll("​", ""),
      checked: Boolean(row.querySelector('input[type="checkbox"]')?.checked),
    })));
    const modelC = await savedBlocks();
    result.todoEnterAtStartKeepsCheckOnText = JSON.stringify(domC) === JSON.stringify([
      { text: "", checked: false }, { text: "Done task", checked: true },
    ]) && JSON.stringify(modelC.slice(0, 2)) === JSON.stringify([
      { type: "todo", text: "", checked: false }, { type: "todo", text: "Done task", checked: true },
    ]);

    return result;
  } finally {
    await fresh.close();
  }
}
