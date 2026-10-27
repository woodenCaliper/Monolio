// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 行末 Delete でのブロック結合 / 箇条書きマーカー + ----
// Backspace(行頭)の対称操作。種別は残る側(手前)を維持し、特殊ブロックは繋げない。
export default async function forwardDeleteSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const rows = () => fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block")].map((row) => ({
        type: [...row.classList].find((name) => name.startsWith("type-")) || "",
        text: row.querySelector(".block-content")?.textContent ?? "",
        html: row.querySelector(".block-content")?.innerHTML ?? "",
      }))
    ));
    const caret = () => fresh.evaluate(() => {
      const selection = getSelection();
      if (!selection.rangeCount) return null;
      const host = selection.anchorNode?.parentElement?.closest?.(".block-content");
      if (!host) return null;
      const probe = document.createRange();
      probe.selectNodeContents(host);
      probe.setEnd(selection.anchorNode, selection.anchorOffset);
      return { text: host.textContent, offset: probe.toString().length };
    });
    const caretToEndOf = async (needle) => {
      await fresh.evaluate((text) => {
        const editable = [...document.querySelectorAll("#blocks .block-content")]
          .find((item) => item.isContentEditable && item.textContent === text);
        // 赤確認では対象が消えていることがある。落とさず、後段の判定で赤にする。
        if (!editable) return;
        editable.focus();
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }, needle);
      await fresh.waitForTimeout(120);
    };

    // 機能1: `+ ` でも箇条書きになる(スペース押下の時点で発火、v121 の規則)。
    await insertBlock(fresh);
    await fresh.keyboard.type("+");
    await fresh.keyboard.press("Space");
    await fresh.waitForTimeout(250);
    const afterPlus = await fresh.evaluate(() => {
      const row = document.activeElement?.closest?.(".block");
      return {
        type: [...(row?.classList || [])].find((name) => name.startsWith("type-")) || "",
        text: row?.querySelector(".block-content")?.textContent ?? "",
      };
    });
    await fresh.keyboard.type("plus item");
    await fresh.waitForTimeout(150);
    const plusTyped = await fresh.evaluate(() => (
      document.activeElement?.textContent ?? ""
    ));
    result.plusMakesBulletOnSpace = afterPlus.type === "type-bullet"
      && afterPlus.text.replaceAll("\u200b", "").trim() === ""
      && plusTyped === "plus item";

    // 機能2: 行末 Delete で次のブロックが繋がる。書式も持ってくる。種別は手前を維持。
    await insertBlock(fresh);
    await fresh.keyboard.type("delhead");
    await insertBlock(fresh);
    await fresh.keyboard.type("deltail");
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent === "deltail");
      if (!editable) return;
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.locator("#format-bold").click();
    await fresh.waitForTimeout(250);
    const beforeCount = (await rows()).length;
    await caretToEndOf("delhead");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(350);
    const merged = (await rows()).find((row) => row.text.includes("delhead"));
    const mergedCaret = await caret();
    result.deleteMergesNextBlock = Boolean(merged)
      && merged.text === "delheaddeltail"
      && merged.html.includes("<b>deltail</b>")
      && (await rows()).length === beforeCount - 1;
    result.deleteMergeKeepsCaretAtJoin = mergedCaret?.text === "delheaddeltail"
      && mergedCaret?.offset === "delhead".length;
    // Undo 1手で戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await rows();
    result.deleteMergeUndoIsOneStep = undone.some((row) => row.text === "delhead")
      && undone.some((row) => row.text === "deltail");

    // 種別は「残る側=手前」を維持する(見出しの末尾で Delete すると段落が見出しへ入る)。
    await insertBlock(fresh);
    await fresh.keyboard.type("# ");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("delheading");
    await insertBlock(fresh);
    await fresh.keyboard.type("delplain");
    await caretToEndOf("delheading");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(350);
    const headingMerged = (await rows()).find((row) => row.text.includes("delheading"));
    result.deleteMergeKeepsCurrentType = Boolean(headingMerged)
      && headingMerged.type === "type-heading1"
      && headingMerged.text === "delheadingdelplain";

    // 文字の途中の Delete は、従来どおり1文字だけ消える。
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent === "delheadingdelplain");
      if (!editable) return;
      editable.focus();
      const node = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT).nextNode();
      if (!node) return;
      const range = document.createRange();
      range.setStart(node, 3);
      range.setEnd(node, 3);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(250);
    result.deleteInsideTextRemovesOneChar = (await rows()).some((row) => row.text === "deleadingdelplain");

    // 特殊ブロック(表)は繋げない。Backspace 側と同じく何も起きない。
    await insertBlock(fresh);
    await fresh.keyboard.type("beforetable");
    await insertBlock(fresh, "table");
    await fresh.waitForTimeout(300);
    const beforeTableCount = (await rows()).length;
    await caretToEndOf("beforetable");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const afterTableDelete = await rows();
    result.deleteDoesNotMergeSpecialBlock = afterTableDelete.length === beforeTableCount
      && afterTableDelete.some((row) => row.text === "beforetable")
      && afterTableDelete.some((row) => row.type === "type-table");

    // 次のブロックが子を持つ場合は触らない(消える側の子の行き先が決まらない)。
    await insertBlock(fresh);
    await fresh.keyboard.type("beforeparent");
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.type("delparent");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("delchild");
    await fresh.waitForTimeout(250);
    const beforeParentCount = (await rows()).length;
    await caretToEndOf("beforeparent");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    result.deleteKeepsBlocksWithChildren = (await rows()).length === beforeParentCount;

    // TL指定の落とし穴(b): **自分が子を持つ**場合も不発。このとき「次の可視ブロック」は
    // 自分の子なので、繋げると階層が壊れる。
    const beforeSelfParentCount = (await rows()).length;
    await caretToEndOf("delparent");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const afterSelfParent = await rows();
    result.deleteKeepsOwnChildren = afterSelfParent.length === beforeSelfParentCount
      && afterSelfParent.some((row) => row.text === "delparent")
      && afterSelfParent.some((row) => row.text === "delchild");

    // 相手がコードブロックでも繋げない(構造ブロックは中身が寄せ集めテキストにならない)。
    await insertBlock(fresh);
    await fresh.keyboard.type("beforecode");
    await insertBlock(fresh, "code");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("const x = 1;");
    await fresh.waitForTimeout(200);
    const beforeCodeCount = (await rows()).length;
    await caretToEndOf("beforecode");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const afterCodeDelete = await rows();
    result.deleteDoesNotMergeCodeBlock = afterCodeDelete.length === beforeCodeCount
      && afterCodeDelete.some((row) => row.text === "beforecode")
      && afterCodeDelete.some((row) => row.type === "type-code" && row.text.includes("const x = 1;"));

    // 文書末尾の Delete は何も起きない(次のブロックが無い)。
    const lastBlockCount = (await rows()).length;
    await fresh.evaluate(() => {
      const editables = [...document.querySelectorAll("#blocks .block-content")].filter((e) => e.isContentEditable);
      const last = editables[editables.length - 1];
      last.focus();
      const range = document.createRange();
      range.selectNodeContents(last);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(250);
    result.deleteAtDocumentEndDoesNothing = (await rows()).length === lastBlockCount;

    // 表のセルの中の Delete が、ブロック層へ漏れてブロックを消さないこと(New-27 の教訓)。
    await insertBlock(fresh);
    await fresh.keyboard.type("beforecelldelete");
    await insertBlock(fresh, "table");
    await fresh.waitForTimeout(300);
    const beforeCellDelete = (await rows()).length;
    await fresh.evaluate(() => {
      const td = document.querySelector("#blocks .block.type-table .editor-table [data-row=\"0\"][data-cell=\"0\"]");
      if (!td) return;
      td.focus();
      td.textContent = "cell";
      td.dispatchEvent(new Event("input", { bubbles: true }));
      const range = document.createRange();
      range.selectNodeContents(td);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const afterCellDelete = await rows();
    const cellTextAfterDelete = await fresh.evaluate(() => {
      const td = document.querySelector('#blocks .block.type-table .editor-table [data-row="0"][data-cell="0"]');
      return td ? td.textContent : null;
    });
    result.deleteInsideTableCellStaysInCell = afterCellDelete.length === beforeCellDelete
      && afterCellDelete.some((row) => row.type === "type-table")
      && afterCellDelete.some((row) => row.text === "beforecelldelete")
      && cellTextAfterDelete === "cell";

    // **対称性そのものを固定する**(TL推奨): 同じ2ブロックを Backspace で繋いだ結果と
    // Delete で繋いだ結果が一致すること。片方だけ直してずれる事故を防ぐ。
    // 同じ2ブロックを Backspace と Delete で結合し、結果が一致することを見る。
    // ケースごとに新しいページを開く(同じページを使い回すと、前のケースの後片付けが
    // 次の入力の先頭文字を食べることがあり、製品ではなく手順のせいで赤くなる)。
    const mergeViaKey = async (key) => {
      const scratch = await context.newPage();
      try {
        await scratch.goto("http://127.0.0.1:" + PORT + "/");
        await scratch.waitForSelector("#blocks .block-content");
        await scratch.evaluate(() => {
          const editables = [...document.querySelectorAll("#blocks .block-content")].filter((e) => e.isContentEditable);
          const last = editables[editables.length - 1];
          last.focus();
          const range = document.createRange();
          range.selectNodeContents(last);
          range.collapse(false);
          const selection = getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        });
        await scratch.keyboard.press("Enter");
        await scratch.keyboard.type("symhead");
        await scratch.keyboard.press("Enter");
        await scratch.keyboard.type("symtail");
        await scratch.waitForTimeout(250);
        // 後ろのブロックだけ太字にして、書式ごと繋がることも一致の対象にする。
        await scratch.evaluate(() => {
          const editable = [...document.querySelectorAll("#blocks .block-content")]
            .find((item) => item.textContent === "symtail");
          editable.focus();
          const range = document.createRange();
          range.selectNodeContents(editable);
          const selection = getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        });
        await scratch.locator("#format-bold").click();
        await scratch.waitForTimeout(250);
        // 入力が意図どおり入っているかを先に確かめる(ここが崩れていたら比較の意味がない)。
        const ready = await scratch.evaluate(() => (
          [...document.querySelectorAll("#blocks .block-content")].map((e) => e.textContent)
        ));
        if (!ready.includes("symhead") || !ready.includes("symtail")) {
          return { setup: "broken", ready };
        }
        // キャレットを置く: Backspace は後ろのブロックの先頭、Delete は前のブロックの末尾。
        await scratch.evaluate((atStart) => {
          const target = atStart ? "symtail" : "symhead";
          const editable = [...document.querySelectorAll("#blocks .block-content")]
            .find((item) => item.textContent === target);
          editable.focus();
          const range = document.createRange();
          range.selectNodeContents(editable);
          range.collapse(atStart);
          const selection = getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }, key === "Backspace");
        await scratch.waitForTimeout(150);
        await scratch.keyboard.press(key);
        await scratch.waitForTimeout(400);
        return scratch.evaluate(() => {
          const row = [...document.querySelectorAll("#blocks .block")]
            .find((item) => item.textContent.includes("symhead"));
          const selection = getSelection();
          let offset = null;
          if (selection.rangeCount) {
            const host = selection.anchorNode?.parentElement?.closest?.(".block-content");
            if (host) {
              const probe = document.createRange();
              probe.selectNodeContents(host);
              probe.setEnd(selection.anchorNode, selection.anchorOffset);
              offset = probe.toString().length;
            }
          }
          return {
            setup: "ok",
            type: [...(row?.classList || [])].find((name) => name.startsWith("type-")) || "",
            text: row?.querySelector(".block-content")?.textContent ?? "",
            html: row?.querySelector(".block-content")?.innerHTML ?? "",
            offset,
          };
        });
      } finally {
        await scratch.close();
      }
    };
    const viaBackspace = await mergeViaKey("Backspace");
    const viaDelete = await mergeViaKey("Delete");
    result.backspaceAndDeleteMergeAgree = viaBackspace.setup === "ok" && viaDelete.setup === "ok"
      && viaBackspace.text === "symheadsymtail"
      && viaBackspace.type === viaDelete.type
      && viaBackspace.text === viaDelete.text
      && viaBackspace.html === viaDelete.html
      && viaBackspace.offset === viaDelete.offset;

    return result;
  } finally {
    await fresh.close();
  }
}
