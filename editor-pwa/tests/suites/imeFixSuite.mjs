// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 日本語入力(IME)まわりの不具合の直し(v221) ----
// IME は CDP の Input.imeSetComposition(変換中の文字)/ Input.insertText(確定)で真似る。変換中に押すキーは2型:
// 「Win型」= key "Process"・keyCode 229、「Mac型」= key は実キーのまま keyCode 229(isComposing も立つ)。
// A) つまみのメニューの検索欄に日本語を打つと「みみだみだし見出し見出し」と重なった(欄を1文字ごとに作り直していた)。
// B) 文字サイズ(Ctrl+Shift+.)・書体を選んだ直後に日本語を打つと1文字目が重なった(「abcに日本」。変換中に <font> を差し替えていた)。
// C) 変換中に1.5秒以上迷うと、Undo で変換の途中(「helloかんじ」)や選ばなかった候補が出た(本文・題名・表のセル・図表の題名)。
//    Esc で変換を取り消すと「変更あり」になり、何も起きない Undo の1手が残った。
// D) Mac型の確定の Enter / 取り消しの Esc を文書全体のキーの振り分けが拾っていた(スラッシュメニューの先頭が選ばれる、
//    置換の欄で置換が走る、検索バーが閉じる)。
// E) 表のセルの全角の数字(「１２」)が数にならず、=A2*2 が 0、SUM が素通りしていた。
// F) スラッシュメニューが全角の英数字(「/ｔａｂｌｅ」「/見出し２」「/ＴｏＤｏ」)で何も出さなかった。
// G) 「/参照」で一覧を出したまま打った文字が、ブロックの先頭に入っていた(キャレットが頭へ飛んでいた。IME でなくても)。
// H) 「結果は /参照」で選ぶと「結果は 表1 に示す」と空白が2つ残った。日本語の文の中では空白を作らない(英語の文は従来どおり)。
// I) コマンドパレット(Ctrl+K)が日本語の名前(「表」「保存」)で何も見つけなかった。
// J) 全角の空白だけのリスト項目で Backspace を押すと、全部消えて段落に戻っていた(1文字だけ消す)。
export default async function imeFixSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1200, height: 800 });
  const result = {};
  let opened = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const cdp = await context.newCDPSession(fresh);

    const cells = (...values) => values.map((text) => ({ text }));
    const openLiteral = async (blocks, title = "IME") => {
      const literal = { title, fonts: [], attachments: [], pages: [{ id: "IME1", title, blocks }] };
      const source = join(OUT, "ime-fix-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((n) => [...document.querySelectorAll("#blocks .block")].length === n, blocks.length, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    const compose = async (text) => {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
      await fresh.waitForTimeout(50);
    };
    const commit = async (text) => {
      await cdp.send("Input.insertText", { text });
      await fresh.waitForTimeout(120);
    };
    const cancelComposition = async () => {
      await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
      await fresh.waitForTimeout(150);
    };
    // 変換中に押すキー(mac = 実キー + keyCode 229 / win = "Process")
    const imeKey = async (key, style) => {
      const codes = { Enter: "Enter", Escape: "Escape" };
      const event = { windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229, key: style === "mac" ? key : "Process", code: codes[key] || key };
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
      await fresh.waitForTimeout(80);
    };
    const imeType = async (reading, word, style = "win") => {
      for (let i = 1; i <= reading.length; i += 1) await compose(reading.slice(0, i));
      if (word !== reading) await compose(word);
      await imeKey("Enter", style);
      await commit(word);
    };
    const press = async (key, ms = 150) => {
      await fresh.keyboard.press(key);
      await fresh.waitForTimeout(ms);
    };
    const caretAtEnd = async (blockId) => {
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
    };
    const blockText = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block-content[data-id="' + blockId + '"]')?.textContent, id);
    const blockType = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block[data-id="' + blockId + '"]')?.className.match(/type-([\w-]+)/)?.[1], id);
    const slashTypes = () => fresh.evaluate(() => [...document.querySelectorAll("#slash-menu .menu-item")].map((item) => item.dataset.type));
    const slashOpen = () => fresh.evaluate(() => !document.querySelector("#slash-menu").hidden);

    // ---- A) つまみのメニューの検索欄 ----
    {
      const evidence = {};
      let ok = true;
      for (const style of ["win", "mac"]) {
        await openLiteral([{ id: "a1", type: "paragraph", text: "abc" }, { id: "a2", type: "paragraph", text: "end" }]);
        await fresh.locator('#blocks .block[data-id="a1"] .drag-grip').click();
        await fresh.waitForTimeout(200);
        const values = [];
        for (const text of ["み", "みだ", "みだし", "見出し"]) {
          await compose(text);
          values.push(await fresh.evaluate(() => document.querySelector(".block-menu-search")?.value));
        }
        await imeKey("Enter", style);
        const typeAfterEnter = await blockType("a1");
        await commit("見出し");
        const state = await fresh.evaluate(() => ({
          value: document.querySelector(".block-menu-search")?.value,
          focused: document.activeElement?.classList.contains("block-menu-search"),
          first: document.querySelector("#block-menu .menu-item")?.dataset.action,
        }));
        evidence[style] = { values, typeAfterEnter, ...state };
        ok = ok && JSON.stringify(values) === JSON.stringify(["み", "みだ", "みだし", "見出し"])
          && typeAfterEnter === "paragraph" && state.value === "見出し" && state.focused && state.first === "heading1";
        await press("Escape");
      }
      result.blockMenuSearchImeNotDuplicated = ok;
      result.blockMenuSearchImeEvidence = evidence;
    }

    // ---- B) 書式を選んだ直後の日本語 ----
    {
      await openLiteral([{ id: "b1", type: "paragraph", text: "abc" }, { id: "b2", type: "paragraph", text: "def" }, { id: "b3", type: "paragraph", text: "end" }]);
      const html = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block-content[data-id="' + blockId + '"]').innerHTML, id);
      await caretAtEnd("b1");
      await press("Control+Shift+Period");
      await press("Control+Shift+Period");
      await imeType("にほん", "日本");
      const sizeText = await blockText("b1");
      const sizeHtml = await html("b1");
      await caretAtEnd("b2");
      await fresh.locator("#format-font").click();
      await fresh.waitForTimeout(100);
      await fresh.locator("#format-font-list .font-option").nth(2).click();
      await fresh.waitForTimeout(150);
      await imeType("にほん", "日本");
      const fontText = await blockText("b2");
      const fontHtml = await html("b2");
      result.pendingFontImeNotDuplicated = sizeText === "abc日本" && /font-size:\s*17px/.test(sizeHtml) && !sizeHtml.includes("<font")
        && fontText === "def日本" && /font-family/.test(fontHtml) && !fontHtml.includes("<font");
      result.pendingFontImeEvidence = { sizeText, sizeHtml, fontText, fontHtml };
    }

    // ---- C) 変換1回 = Undo 1手(迷っても途中が出ない)・取り消しは何も残さない ----
    {
      const slowIme = async () => {
        await fresh.waitForTimeout(1600);
        await compose("か");
        await compose("かんじ");
        await fresh.waitForTimeout(1600);
        await compose("感じ");
        await fresh.waitForTimeout(1600);
        await compose("漢字");
        await imeKey("Enter", "win");
        await commit("漢字");
      };
      await openLiteral([
        { id: "c1", type: "paragraph", text: "hello" },
        { id: "ct", type: "table", text: "", caption: "cap", rows: [cells("a", "b"), cells("1", "2")] },
        { id: "c2", type: "paragraph", text: "end" },
      ], "T");
      const evidence = {};
      // 本文
      await caretAtEnd("c1");
      await slowIme();
      evidence.body = [await blockText("c1")];
      await press("Control+z");
      evidence.body.push(await blockText("c1"));
      // 表のセル
      const firstCell = () => fresh.evaluate(() => document.querySelector('#blocks .block[data-id="ct"] .editor-table th, #blocks .block[data-id="ct"] .editor-table td').textContent);
      await fresh.locator('#blocks .block[data-id="ct"] .editor-table th, #blocks .block[data-id="ct"] .editor-table td').first().click();
      await press("End", 100);
      await slowIme();
      evidence.cell = [await firstCell()];
      await press("Control+z");
      evidence.cell.push(await firstCell());
      // 題名
      await fresh.locator("#doc-title").click();
      await press("End", 100);
      await slowIme();
      evidence.title = [await fresh.locator("#doc-title").textContent()];
      await press("Control+z");
      evidence.title.push(await fresh.locator("#doc-title").textContent());
      // 図表の題名の欄
      const caption = fresh.locator('#blocks .block[data-id="ct"] input.block-caption-input');
      await caption.click();
      await press("End", 100);
      await slowIme();
      evidence.caption = [await caption.inputValue()];
      await caretAtEnd("c2");
      await press("Control+z");
      evidence.caption.push(await caption.inputValue());
      result.imeCommitIsOneUndoStep = JSON.stringify(evidence) === JSON.stringify({
        body: ["hello漢字", "hello"], cell: ["a漢字", "a"], title: ["T漢字", "T"], caption: ["cap漢字", "cap"],
      });
      result.imeCommitUndoEvidence = evidence;

      // 取り消し: 開いたばかりの文書で変換して Esc → 「変更あり」にならない。打った1文字 + 取り消しのあとの Undo 1回で、打った文字が消える
      await openLiteral([{ id: "c3", type: "paragraph", text: "abc" }, { id: "c4", type: "paragraph", text: "end" }]);
      const statusBefore = await fresh.evaluate(() => document.querySelector("#status")?.textContent);
      await caretAtEnd("c3");
      await compose("に");
      await compose("にほん");
      await imeKey("Escape", "win");
      await cancelComposition();
      await fresh.waitForTimeout(100);
      const statusAfterCancel = await fresh.evaluate(() => document.querySelector("#status")?.textContent);
      const textAfterCancel = await blockText("c3");
      await fresh.keyboard.type("x");
      await fresh.waitForTimeout(1600);
      await compose("に");
      await compose("にほん");
      await imeKey("Escape", "win");
      await cancelComposition();
      await fresh.waitForTimeout(100);
      const textBeforeUndo = await blockText("c3");
      await press("Control+z");
      const textAfterUndo = await blockText("c3");
      result.imeCancelLeavesNoStep = statusAfterCancel === statusBefore && textAfterCancel === "abc"
        && textBeforeUndo === "abcx" && textAfterUndo === "abc";
      result.imeCancelEvidence = { statusBefore, statusAfterCancel, textAfterCancel, textBeforeUndo, textAfterUndo };
    }

    // ---- D) 変換の確定・取り消しのキー(Mac型)を文書全体の振り分けが拾わない ----
    {
      await openLiteral([{ id: "d1", type: "paragraph", text: "abc abc abc" }, { id: "d2", type: "paragraph", text: "" }, { id: "d3", type: "paragraph", text: "end" }]);
      // スラッシュメニュー: 「/ひょう」→ 確定の Enter で先頭の候補を選ばない
      await caretAtEnd("d2");
      await fresh.keyboard.type("/");
      await fresh.waitForTimeout(150);
      for (const text of ["ひ", "ひょ", "ひょう", "表"]) await compose(text);
      await imeKey("Enter", "mac");
      const slashAfterEnter = { text: await blockText("d2"), type: await blockType("d2"), open: await slashOpen() };
      await commit("表");
      const slashAfterCommit = { text: await blockText("d2"), type: await blockType("d2"), open: await slashOpen() };
      await press("Escape");
      // 置換の欄: 確定の Enter で置換しない
      await caretAtEnd("d3");
      await press("Control+h", 200);
      await fresh.keyboard.type("abc");
      await fresh.waitForTimeout(150);
      await fresh.focus("#search-replace-input");
      await compose("に");
      await compose("日本");
      await imeKey("Enter", "mac");
      await commit("日本");
      const replaceText = await blockText("d1");
      const replaceValue = await fresh.inputValue("#search-replace-input");
      // 検索の欄: 取り消しの Esc で検索バーを閉じない
      await fresh.focus("#search-input");
      await compose("に");
      await imeKey("Escape", "mac");
      await cancelComposition();
      const barOpen = await fresh.evaluate(() => !document.querySelector("#search-bar").hidden);
      await press("Escape");
      result.imeKeysNotCapturedByGlobalHandlers = slashAfterEnter.text === "/表" && slashAfterEnter.type === "paragraph"
        && slashAfterCommit.text === "/表" && slashAfterCommit.type === "paragraph"
        && replaceText === "abc abc abc" && replaceValue === "日本" && barOpen;
      result.imeKeysEvidence = { slashAfterEnter, slashAfterCommit, replaceText, replaceValue, barOpen };
    }

    // ---- E) 表の全角の数字 ----
    {
      await openLiteral([
        { id: "e0", type: "paragraph", text: "nums" },
        { id: "et", type: "table", text: "", rows: [
          cells("a", "b", "c", "d"),
          cells("１２", "=A2*2", "=SUM(A2:A4)", "＝Ａ３＋１"),
          cells("－１．５", "x", "", ""),
          cells("１，０００", "", "", ""),
        ] },
      ]);
      const shown = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="et"] .editor-table th, #blocks .block[data-id="et"] .editor-table td')].map((cell) => cell.textContent));
      result.fullWidthDigitsAreNumbers = shown[4] === "１２" && shown[5] === "24" && shown[6] === "1010.5" && shown[7] === "-0.5"
        && shown[8] === "－１．５" && shown[12] === "１，０００";
      result.fullWidthDigitsEvidence = shown;
    }

    // ---- F) スラッシュメニューの全角の英数字 ----
    {
      const firsts = {};
      for (const query of ["ｔａｂｌｅ", "見出し２", "ＴｏＤｏ"]) {
        await openLiteral([{ id: "f1", type: "paragraph", text: "" }, { id: "f2", type: "paragraph", text: "end" }]);
        await caretAtEnd("f1");
        await fresh.keyboard.type("/");
        await commit(query);
        await fresh.waitForTimeout(100);
        firsts[query] = (await slashTypes())[0] || null;
        await press("Escape");
      }
      result.slashMatchesFullWidthAscii = firsts["ｔａｂｌｅ"] === "table" && firsts["見出し２"] === "heading2" && firsts["ＴｏＤｏ"] === "todo";
      result.slashFullWidthEvidence = firsts;
    }

    // ---- G) / H) 「/参照」 ----
    {
      const refDoc = (text) => [
        { id: "g1", type: "paragraph", text },
        { id: "gt", type: "table", text: "", caption: "条件", rows: [cells("a", "b"), cells("1", "2")] },
      ];
      // G) 一覧を出したまま打った文字は、打っていた位置(末尾)へ(IME でも)
      await openLiteral(refDoc("結果は"));
      await caretAtEnd("g1");
      await fresh.keyboard.type(" /ref");
      await press("Enter", 200);
      await fresh.keyboard.type("xy");
      await fresh.waitForTimeout(100);
      const typedHalf = await blockText("g1");
      await openLiteral(refDoc("結果は"));
      await caretAtEnd("g1");
      await fresh.keyboard.type(" /ref");
      await press("Enter", 200);
      await imeType("そくてい", "測定");
      const typedIme = await blockText("g1");
      result.refPickKeepsCaretAtEnd = typedHalf === "結果は xy" && typedIme === "結果は 測定";
      result.refPickCaretEvidence = { typedHalf, typedIme };

      // H) 日本語の文の中では空白を作らない / 英語の文は従来どおり
      await openLiteral(refDoc("結果は"));
      await caretAtEnd("g1");
      await fresh.keyboard.type(" /ref");
      await press("Enter", 200);
      await press("Enter", 200);
      await imeType("にしめす", "に示す");
      const japanese = await blockText("g1");
      const chipCount = await fresh.evaluate(() => document.querySelectorAll('#blocks .block-content[data-id="g1"] .figure-ref').length);
      await openLiteral(refDoc("See"));
      await caretAtEnd("g1");
      await fresh.keyboard.type(" /ref");
      await press("Enter", 200);
      await press("Enter", 200);
      await fresh.keyboard.type("below");
      await fresh.waitForTimeout(100);
      const english = await blockText("g1");
      result.figureRefNoDoubleSpaces = japanese === "結果は表1に示す" && chipCount === 1 && english === "See 表1 below";
      result.figureRefSpacesEvidence = { japanese, chipCount, english };
    }

    // ---- I) コマンドパレットの日本語 ----
    {
      await openLiteral([{ id: "i1", type: "paragraph", text: "hello" }]);
      await caretAtEnd("i1");
      const titles = () => fresh.evaluate(() => [...document.querySelectorAll("#palette-results .menu-item .menu-title")].map((item) => item.textContent));
      const found = {};
      for (const [reading, word] of [["ひょう", "表"], ["ほぞん", "保存"]]) {
        await press("Control+k", 200);
        await imeType(reading, word);
        found[word] = await titles();
        await press("Escape");
      }
      result.paletteFindsJapaneseNames = found["表"].includes("Table") && found["保存"].includes("Save");
      result.paletteJapaneseEvidence = found;
    }

    // ---- J) 全角の空白だけのリスト項目の Backspace ----
    {
      await openLiteral([{ id: "j1", type: "bullet", text: "　　" }, { id: "j2", type: "paragraph", text: "end" }]);
      await caretAtEnd("j1");
      await press("Backspace");
      const afterOne = { type: await blockType("j1"), text: await blockText("j1") };
      await press("Backspace");
      const afterTwo = { type: await blockType("j1"), text: await blockText("j1") };
      await press("Backspace");
      const afterThree = { type: await blockType("j1"), text: await blockText("j1") };
      result.listFullWidthSpaceBackspaceDeletesOne = afterOne.type === "bullet" && afterOne.text === "　"
        && afterTwo.type === "bullet" && afterTwo.text === "" && afterThree.type === "paragraph";
      result.listFullWidthSpaceEvidence = { afterOne, afterTwo, afterThree };
    }

    return result;
  } finally {
    await fresh.close();
  }
}
