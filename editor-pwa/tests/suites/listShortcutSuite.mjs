// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, insertBlock, openMenu } from "../lib.mjs";

// ---- 既存の文の行頭で Markdown の目印を打って変換する(v154) ----
// ユーザー原文「すでに文字ある状態で、それを箇条書きブロックに仕様としたとき、文の頭に - をつければ箇条書きに
// なるはずだけど、なる場合とならない場合がある」。原因は本文の末尾の見えない改行(\n。<br> 由来)で、規則が
// (.*)$ だったため一致しなかった。判定は最初の行の先頭だけ・本文は2行目以降も引き継ぐ・書式は残す・
// 見えない末尾の改行はモデルに残さない。
export default async function listShortcutSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  const para = (id, text, html) => ({ id, type: "paragraph", text, ...(html ? { html } : {}) });
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
  const saveAndParse = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, name);
    await (await download).saveAs(path);
    return fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), await readFile(path, "utf8"));
  };
  // ブロックの本文の先頭(文字位置 0)にキャレットを置く。クリック位置や Home の行の解釈に左右されないよう直接置く。
  const caretToStart = async (id) => {
    await fresh.locator('.block[data-id="' + id + '"] .block-content').click();
    await fresh.evaluate((blockId) => {
      const content = document.querySelector('.block[data-id="' + blockId + '"] .block-content');
      content.focus();
      const range = document.createRange();
      range.setStart(content, 0);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, id);
  };
  const typeMarker = async (id, marker) => {
    await caretToStart(id);
    await fresh.keyboard.type(marker);
    await fresh.keyboard.press("Space");
    await fresh.waitForTimeout(200);
  };
  const rowState = (id) => fresh.evaluate((blockId) => {
    const row = document.querySelector('.block[data-id="' + blockId + '"]');
    const content = row?.querySelector(".block-content");
    return {
      type: [...(row?.classList ?? [])].find((name) => name.startsWith("type-")) ?? null,
      html: content?.innerHTML ?? "",
      text: (content?.innerText ?? "").replaceAll("​", ""),
    };
  }, id);
  const modelOf = (parsed, id) => parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.id === id) || null;

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const literal = {
      pages: [{
        id: "LS1",
        title: "List Shortcut",
        blocks: [
          // 見えない末尾の改行(<br> 由来)を持つ既存の本文。ユーザーの「ならない場合」の実体。
          para("t1", "abc\n", "abc<br>"),
          para("t2", "line1\nline2", "line1<br>line2"),
          para("t3", "bold rest", "<b>bold</b> rest"),
          para("t4", "red text", '<span style="color: rgb(220, 38, 38);">red</span> text'),
          para("t5", "\nabc", "<br>abc"),
          para("t6", "p\n", "p<br>"),
          para("t7", "n\n", "n<br>"),
          para("t8", "q\n", "q<br>"),
          para("t9", "h\n", "h<br>"),
          para("t10", "done"),
          // 目印が書式の中にある(太字の中で「-」の後にスペースを打つ)。
          para("t11", "-bold rest", "<b>-bold</b> rest"),
          // 見えない改行だけの段落(見た目は空)で「---」を打つ → 区切り線。
          para("t12", "\n", "<br>"),
          para("t13", "s"),
          para("t14", "other"),
          para("t15", "s2"),
          para("t16", "dd"),
          para("t17", "zen"),
          para("t18", "nb"),
          // 「```」の後ろ: 既存の本文なら残す/言語名なら捨てる/言語名としてありえない形は残す(v157)。
          para("f1", "abc"),
          para("f2", "l1\nl2", "l1<br>l2"),
          para("f3", "abc"),
          para("f4", ""),
          para("f5", ""),
          para("f6", "xyz"),
          // ソース(コード・数式・グラフ)の末尾の改行は中身。
          { id: "c1", type: "code", text: "x = 1\n" },
          { id: "m1", type: "math", text: "x^2\n" },
          { id: "g1", type: "chart", text: "type: bar\nlabels: [a]\nvalues: [1]\n" },
        ],
      }],
      fonts: [],
      attachments: [],
    };
    await openLiteral(literal, "list-shortcut.html");

    await typeMarker("t1", "-");
    const trailing = await rowState("t1");
    await typeMarker("t2", "-");
    const multi = await rowState("t2");
    await typeMarker("t3", "-");
    const bold = await rowState("t3");
    await typeMarker("t4", "-");
    const color = await rowState("t4");
    // 「-」の次の行に本文があるだけ(区切りが改行)は変換しない。t5 の先頭で「-」だけを打ってから、
    // 同じ本文を持つ状態で入力を1回起こす(スペースは打たない)。
    await caretToStart("t5");
    await fresh.keyboard.type("-");
    await fresh.waitForTimeout(200);
    const newlineGap = await rowState("t5");
    await typeMarker("t6", "+");
    const plus = await rowState("t6");
    await typeMarker("t7", "1.");
    const numbered = await rowState("t7");
    await typeMarker("t8", ">");
    const quote = await rowState("t8");
    await typeMarker("t9", "#");
    const heading = await rowState("t9");

    // Shift+Enter で行を足してから消した跡(見えない末尾の改行)があっても変換できる。
    await fresh.locator('.block[data-id="t10"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Shift+Enter");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(150);
    await typeMarker("t10", "-");
    const afterShiftEnter = await rowState("t10");

    // 書式の中の目印: 太字の文字ノードの「-」の直後にキャレットを置いてスペース。目印だけが消え、太字は残る。
    await fresh.locator('.block[data-id="t11"] .block-content').click();
    await fresh.evaluate(() => {
      const bold = document.querySelector('.block[data-id="t11"] .block-content b');
      const range = document.createRange();
      range.setStart(bold.firstChild, 1);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await fresh.keyboard.press("Space");
    await fresh.waitForTimeout(200);
    const markerInBold = await rowState("t11");

    // 見た目が空の段落(見えない改行だけ)で「---」→ 区切り線。
    await caretToStart("t12");
    await fresh.keyboard.type("---");
    await fresh.waitForTimeout(250);
    const dividerRow = await fresh.evaluate(() => [...document.querySelector('.block[data-id="t12"]')?.classList ?? []]
      .find((name) => name.startsWith("type-")) ?? null);

    // 段落の末尾で Shift+Enter → 別のブロックへ移って(同期)戻り、末尾に打つ → 新しい行に入る。
    // (見えない末尾の改行の正規化が、見えている空行を消していない)
    await fresh.locator('.block[data-id="t13"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Shift+Enter");
    await fresh.waitForTimeout(120);
    await fresh.locator('.block[data-id="t14"] .block-content').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('.block[data-id="t13"] .block-content').click();
    // ブロックの末尾へ(v176 から Ctrl+End は文書の末尾へ移るので、キャレットを直接置く)。
    await fresh.evaluate(() => {
      const editable = document.querySelector('.block[data-id="t13"] .block-content');
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await fresh.keyboard.type("z");
    await fresh.waitForTimeout(150);
    const shiftEnterTyped = await rowState("t13");

    // 段落の末尾で Shift+Enter → そのまま打つ。本文は「元の文字+改行+打った文字」で、画面でも新しい行にある。
    await fresh.locator('.block[data-id="t15"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Shift+Enter");
    await fresh.keyboard.type("z");
    await fresh.waitForTimeout(150);
    const typedAfterShiftEnter = await fresh.evaluate(() => {
      const content = document.querySelector('.block[data-id="t15"] .block-content');
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      const topOf = (predicate) => {
        walker.currentNode = content;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = [...node.nodeValue].findIndex(predicate);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          return range.getBoundingClientRect().top;
        }
        return null;
      };
      return { raw: content.textContent.replaceAll("​", ""), sTop: topOf((ch) => ch === "s"), zTop: topOf((ch) => ch === "z") };
    });

    // 段落の末尾で Shift+Enter を2回 → 別のブロックへ(blur・同期)。見えている空行ぶんの改行は残る(本文が \n\n で終わる)。
    await fresh.locator('.block[data-id="t16"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Shift+Enter");
    await fresh.keyboard.press("Shift+Enter");
    await fresh.waitForTimeout(120);
    await fresh.locator('.block[data-id="t14"] .block-content').click();
    await fresh.waitForTimeout(150);
    const doubleShiftEnterRaw = await fresh.evaluate(() => document.querySelector('.block[data-id="t16"] .block-content').textContent.replaceAll("​", ""));

    // 区切りは Markdown の仕様どおり: 「-」+全角スペースでは変換しない/「-」+NBSP では変換する。
    await caretToStart("t17");
    await fresh.keyboard.type("-");
    await fresh.keyboard.insertText("　");
    await fresh.waitForTimeout(200);
    const ideographicGap = await rowState("t17");
    await caretToStart("t18");
    await fresh.keyboard.type("-");
    await fresh.keyboard.insertText(" ");
    await fresh.waitForTimeout(200);
    const nbspGap = await rowState("t18");

    // 「```」: 既存の文の頭に打つ → 後ろは既存の本文なのでコードの中身に残す(複数行も)。
    await caretToStart("f1");
    await fresh.keyboard.type("```");
    await fresh.waitForTimeout(250);
    const fenceAtHead = await rowState("f1");
    await caretToStart("f2");
    await fresh.keyboard.type("```");
    await fresh.waitForTimeout(250);
    const fenceMultiline = await rowState("f2");
    // 既存の文の頭に「```js」を貼る → 貼った js は言語名として捨て、後ろの既存の本文は残す。
    await caretToStart("f3");
    await fresh.keyboard.insertText("```js");
    await fresh.waitForTimeout(250);
    const fencePastedLanguageAtHead = await rowState("f3");
    // 空の段落に「```js」を貼る(キャレットが末尾) → 言語名として捨てる(New-20)。
    await fresh.locator('.block[data-id="f4"] .block-content').click();
    await fresh.keyboard.insertText("```js");
    await fresh.waitForTimeout(250);
    const fenceLanguageAtEnd = await rowState("f4");
    // 空白を含む(言語名としてありえない) → キャレットが末尾でも残す。
    await fresh.locator('.block[data-id="f5"] .block-content').click();
    await fresh.keyboard.insertText("```my code");
    await fresh.waitForTimeout(250);
    const fenceNotALanguage = await rowState("f5");
    // 変換は Undo 1手で「```+本文」の段落に戻る。
    await caretToStart("f6");
    await fresh.keyboard.type("```");
    await fresh.waitForTimeout(250);
    const fenceBeforeUndo = await rowState("f6");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const fenceAfterUndo = await rowState("f6");

    // ソースのブロックにフォーカスして離れても(同期)、末尾の改行が残る。
    for (const id of ["c1", "m1", "g1"]) {
      await fresh.evaluate((blockId) => {
        const content = document.querySelector('.block[data-id="' + blockId + '"] .block-content');
        content?.focus();
        content?.dispatchEvent(new FocusEvent("blur"));
      }, id);
    }
    await fresh.waitForTimeout(200);

    const parsed = await saveAndParse("list-shortcut-saved.html");
    const m = (id) => modelOf(parsed, id) || {};

    result.markerOnTextWithTrailingNewlineConverts = trailing.type === "type-bullet"
      && m("t1").type === "bullet" && m("t1").text === "abc";
    result.markerOnMultilineKeepsSecondLine = multi.type === "type-bullet"
      && m("t2").type === "bullet" && m("t2").text === "line1\nline2";
    result.markerConversionKeepsBold = bold.type === "type-bullet"
      && /<b>bold<\/b>/.test(bold.html) && !bold.html.includes("-")
      && m("t3").text === "bold rest" && /<b>bold<\/b>/.test(m("t3").html || "");
    result.markerConversionKeepsColor = color.type === "type-bullet"
      && /color/.test(color.html) && color.text.startsWith("red")
      && m("t4").text === "red text" && /color/.test(m("t4").html || "");
    result.markerFollowedByNewlineDoesNotConvert = newlineGap.type === "type-paragraph"
      && m("t5").type === "paragraph" && m("t5").text === "-\nabc";
    result.otherMarkersOnTextWithTrailingNewlineConvert = plus.type === "type-bullet" && m("t6").text === "p"
      && numbered.type === "type-numbered" && m("t7").text === "n"
      && quote.type === "type-quote" && m("t8").text === "q"
      && heading.type === "type-heading1" && m("t9").text === "h";
    result.markerAfterShiftEnterAndBackspaceConverts = afterShiftEnter.type === "type-bullet"
      && m("t10").type === "bullet" && m("t10").text === "done";
    result.markerInsideBoldKeepsBold = markerInBold.type === "type-bullet"
      && /<b>bold<\/b>/.test(markerInBold.html) && !markerInBold.text.includes("-")
      && m("t11").text === "bold rest" && /<b>bold<\/b>/.test(m("t11").html || "");
    result.dividerOnInvisibleNewlineConverts = dividerRow === "type-divider" && m("t12").type === "divider";
    result.shiftEnterAtEndKeepsNewLine = shiftEnterTyped.text === "s\nz" && m("t13").text === "s\nz";
    result.shiftEnterThenTypeGoesToNewLine = typedAfterShiftEnter.raw === "s2\nz"
      && typedAfterShiftEnter.zTop !== null && typedAfterShiftEnter.sTop !== null
      && typedAfterShiftEnter.zTop > typedAfterShiftEnter.sTop + 5 && m("t15").text === "s2\nz";
    result.doubleShiftEnterKeepsBlankLine = doubleShiftEnterRaw === "dd\n\n\n" && m("t16").text === "dd\n\n";
    result.markerWithIdeographicSpaceDoesNotConvert = ideographicGap.type === "type-paragraph"
      && m("t17").type === "paragraph" && m("t17").text === "-　zen";
    result.markerWithNbspConverts = nbspGap.type === "type-bullet" && m("t18").type === "bullet" && m("t18").text === "nb";
    result.fenceAtHeadOfTextKeepsBody = fenceAtHead.type === "type-code" && m("f1").type === "code" && m("f1").text === "abc";
    result.fenceAtHeadOfMultilineKeepsAllLines = fenceMultiline.type === "type-code" && m("f2").text === "l1\nl2";
    result.fencePastedLanguageAtHeadKeepsBody = fencePastedLanguageAtHead.type === "type-code" && m("f3").text === "abc";
    result.fenceLanguageAtEndIsDropped = fenceLanguageAtEnd.type === "type-code" && m("f4").type === "code" && m("f4").text === "";
    result.fenceNonLanguageTextIsKept = fenceNotALanguage.type === "type-code" && m("f5").text === "my code";
    result.fenceConversionUndoesInOneStep = fenceBeforeUndo.type === "type-code" && fenceAfterUndo.type === "type-paragraph"
      && fenceAfterUndo.text === "```xyz";
    result.sourceTrailingNewlineSurvivesSync = m("c1").text === "x = 1\n" && m("m1").text === "x^2\n"
      && m("g1").text === "type: bar\nlabels: [a]\nvalues: [1]\n";

    // 出どころ: 末尾に改行の付いた1行を貼り付けても、本文(DOM)に見えない改行を足さない。
    // DOM を見るので、モデル側の正規化(serializeBlockText)とは独立に貼り付けの修正だけを確かめられる。
    await insertBlock(fresh);
    await fresh.evaluate(() => {
      const content = document.activeElement?.closest?.(".block-content");
      const data = new DataTransfer();
      data.setData("text/plain", "pasted\n");
      content.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await fresh.waitForTimeout(200);
    const pasted = await fresh.evaluate(() => {
      const content = document.activeElement?.closest?.(".block-content");
      return { brCount: content?.querySelectorAll("br").length ?? -1, raw: (content?.textContent ?? "").replaceAll("​", "") };
    });
    result.pastedTrailingNewlineIsDropped = pasted.raw === "pasted" && pasted.brCount === 0;
    return result;
  } finally {
    await fresh.close();
  }
}
