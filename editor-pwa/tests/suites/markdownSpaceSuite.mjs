// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT, insertBlock } from "../lib.mjs";

// ---- Markdown ショートカットの発火タイミング(スペース押下時) ----
// 「# 」と打った時点で見出しになり、空のブロックにキャレットが残る(Notion 追従)。
// 規則は記号ごとに特別扱いせず、区切りのスペースを持つ全ルールで同じ。
export default async function markdownSpaceSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    // いま編集中のブロックの種別と本文。ZWSP は表示用なので落として見る。
    const state = () => fresh.evaluate(() => {
      const content = document.activeElement?.closest?.(".block-content");
      const row = content?.closest(".block");
      return {
        type: [...(row?.classList ?? [])].find((name) => name.startsWith("type-")) ?? null,
        text: (content?.textContent ?? "").replaceAll("​", ""),
      };
    });

    // 記号+スペースだけで変換され、本文が空のまま続きを打てる(ユーザー原文の
    // 「# の時点で見出しになってほしい」)。
    await insertBlock(fresh);
    await fresh.keyboard.type("#");
    await fresh.keyboard.press("Space");
    await fresh.waitForTimeout(200);
    const headingAtSpace = await state();
    await fresh.keyboard.type("aiueo");
    await fresh.waitForTimeout(150);
    const headingAfterText = await state();
    result.markdownHeadingFiresOnSpace = headingAtSpace.type === "type-heading1"
      && headingAtSpace.text === ""
      && headingAfterText.type === "type-heading1"
      && headingAfterText.text === "aiueo";

    // 記号ごとの特別扱いをしない: スペースを区切りに持つ全ルールが同じ時点で発火。
    const prefixes = [
      ["##", "type-heading2"],
      ["###", "type-heading3"],
      ["####", "type-heading4"],
      ["#####", "type-heading5"],
      ["-", "type-bullet"],
      ["*", "type-bullet"],
      ["1.", "type-numbered"],
      [">", "type-quote"],
      ["[]", "type-todo"],
    ];
    const fired = [];
    for (const [prefix, expected] of prefixes) {
      await insertBlock(fresh);
      await fresh.keyboard.type(prefix);
      await fresh.keyboard.press("Space");
      await fresh.waitForTimeout(180);
      const now = await state();
      fired.push(now.type === expected && now.text === "");
    }
    result.markdownAllPrefixesFireOnSpace = fired.every(Boolean);

    // プレフィックスが崩れていれば発火しない(記号の直後にスペースが要る)。
    await insertBlock(fresh);
    await fresh.keyboard.type("#x");
    await fresh.keyboard.press("Space");
    await fresh.waitForTimeout(180);
    const broken = await state();
    result.markdownBrokenPrefixStaysParagraph = broken.type === "type-paragraph"
      && broken.text.startsWith("#x");

    // 変換は Undo 1手で「記号+スペースのテキスト」へ戻る。
    await insertBlock(fresh);
    await fresh.keyboard.type("#");
    await fresh.keyboard.press("Space");
    await fresh.waitForTimeout(200);
    const beforeUndo = await state();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const undone = await state();
    // 変換されたことまで見る(変換自体が起きなければ「戻った」も意味がない)。
    result.markdownSpaceConversionUndoes = beforeUndo.type === "type-heading1"
      && undone.type === "type-paragraph"
      && undone.text.replace(/ /g, " ") === "# ";

    // IME 変換中のスペース(候補送り)では発火せず、確定(compositionend)で変換される。
    await insertBlock(fresh);
    const duringIme = await fresh.evaluate(() => {
      const content = document.activeElement?.closest?.(".block-content");
      content.textContent = "# ";
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      content.dispatchEvent(new InputEvent("input", {
        inputType: "insertCompositionText", data: " ", bubbles: true, isComposing: true,
      }));
      const row = content.closest(".block");
      return [...row.classList].find((name) => name.startsWith("type-")) ?? null;
    });
    await fresh.waitForTimeout(150);
    const afterCompositionEnd = await fresh.evaluate(() => {
      const content = document.activeElement?.closest?.(".block-content")
        || [...document.querySelectorAll("#blocks .block-content")].pop();
      content.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "# " }));
      return null;
    });
    await fresh.waitForTimeout(250);
    const imeSettled = await state();
    result.markdownShortcutSkipsDuringIme = duringIme === "type-paragraph"
      && afterCompositionEnd === null
      && imeSettled.type === "type-heading1";

    // コード・数式の中身はソースなので変換しない(シェル/Python のコメント「# x」や
    // YAML の「---」でブロックごと化けていた実バグ New-26 の再発防止)。
    await insertBlock(fresh);
    await fresh.keyboard.type("```");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("# x");
    await fresh.waitForTimeout(200);
    const codeAfterHash = await state();
    await fresh.evaluate(() => {
      const content = document.activeElement?.closest?.(".block-content");
      content.textContent = "---";
      content.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: "-", bubbles: true }));
    });
    await fresh.waitForTimeout(200);
    const codeAfterDashes = await state();
    result.markdownShortcutSkipsCodeSource = codeAfterHash.type === "type-code"
      && codeAfterHash.text === "# x"
      && codeAfterDashes.type === "type-code";

    // ``` は区切りのスペースを持たない別トリガーなので、3文字目で変換のまま。
    await insertBlock(fresh);
    await fresh.keyboard.type("```");
    await fresh.waitForTimeout(250);
    const fence = await state();
    result.markdownFenceStillFiresWithoutSpace = fence.type === "type-code";

    // 表のセルは「本文」ではない。セルに "# " と打っても、そのセルで IME を確定
    // (compositionend はブロック層へバブルする)しても、表は表のまま中身も残る。
    // ブロック層の入力処理は表セル由来のイベントに一切関与しない(New-27。
    // compositionend だけガードが抜けていて表が丸ごと見出しに化け、消えていた)。
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(400);
    const firstCell = '#blocks .block.type-table .editor-table [data-row="0"][data-cell="0"]';
    await fresh.locator(firstCell).click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("# ");
    await fresh.waitForTimeout(250);
    const tableAfterTyping = await fresh.evaluate(() => {
      const row = [...document.querySelectorAll("#blocks .block")].find((b) => b.querySelector(".editor-table"));
      return {
        type: [...(row?.classList ?? [])].find((n) => n.startsWith("type-")) ?? null,
        hasTable: Boolean(row?.querySelector(".editor-table")),
      };
    });
    await fresh.evaluate((selector) => {
      const td = document.querySelector(selector);
      td.focus();
      td.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "あ" }));
    }, firstCell);
    await fresh.waitForTimeout(350);
    const tableAfterCompositionEnd = await fresh.evaluate((selector) => {
      const row = [...document.querySelectorAll("#blocks .block")].find((b) => b.querySelector(".editor-table"));
      return {
        type: [...(row?.classList ?? [])].find((n) => n.startsWith("type-")) ?? null,
        hasTable: Boolean(row?.querySelector(".editor-table")),
        cellText: document.querySelector(selector)?.textContent ?? null,
      };
    }, firstCell);
    result.markdownShortcutSkipsTableCells = tableAfterTyping.type === "type-table"
      && tableAfterTyping.hasTable
      && tableAfterCompositionEnd.type === "type-table"
      && tableAfterCompositionEnd.hasTable
      && tableAfterCompositionEnd.cellText === "# ";

    // 根の不変条件: 表ブロックの block.text は、どの経路から同期されても
    // セル文字の寄せ集めで上書きされない(値の持ち主はセル)。呼び出し元ごとに
    // ガードを足す設計では守れなかったので、syncEditableBlock 自身で守る(New-27)。
    // 保存HTMLの manifest からモデルを直接読んで確かめる。
    await fresh.evaluate(() => {
      const content = [...document.querySelectorAll("#blocks .block")]
        .find((b) => b.querySelector(".editor-table"))?.querySelector(".block-content");
      // blur 経路(syncEditableBlock を呼ぶ最も普通の入口)をセル由来で起こす。
      content?.dispatchEvent(new FocusEvent("blur"));
    });
    await fresh.waitForTimeout(250);
    const savePromise = fresh.waitForEvent("download", { timeout: 8000 });
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+S");
    const savedDoc = await savePromise;
    const savedDocPath = join(DOWNLOADS, "table-blocktext-probe.html");
    await savedDoc.saveAs(savedDocPath);
    const savedDocHtml = await readFile(savedDocPath, "utf8");
    result.tableBlockTextNeverTakesCellText = await fresh.evaluate((html) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const table = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.type === "table");
      if (!table) return false;
      // 本文は空のまま、セルの値は生きている。
      return (table.text ?? "") === "" && table.rows?.[0]?.[0]?.text === "# ";
    }, savedDocHtml);

    return result;
  } finally {
    await fresh.close();
  }
}
