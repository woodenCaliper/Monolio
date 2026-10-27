// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, dragBlock, openMenu } from "../lib.mjs";

// ---- ブロックの親子と段組みの列を崩す編集の直し(v213 の確認で見つかった2件) ----
// A) 子を持つブロックの直下へ親と同じ字下げで入れると、子が新しいブロックの子へ付け替わっていた(P16)。
//    - 開いたトグル・子のある箇条書きの末尾で Enter / ＋: 新しいブロックを**最初の子**にする(Notion と同じ)。
//      トグルの中は段落、箇条書きは種類を継ぐ。閉じたトグル(見出しも。子が無くても)では子ごとの後ろへ、親と同じ字下げで
//    - メニューの「下へ移動」・「後ろへ」のドロップ: 相手の部分木(子ごと)の後ろへ。トグルの題名と子のあいだに入らない
// B) 行頭 Backspace・行末 Delete が段組みの**別の列**へまたいでいた(組だけを比べていた)。右の列の先頭が左の列の最後へ
//    繋がり、1列1ブロックだと段組みごと崩れ、別の列の区切り線も消えた。列の端は文書の端と同じく何もしない。
export default async function blockTreeFixSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const openLiteral = async (blocks) => {
      const literal = { title: "BlockTree", fonts: [], attachments: [], pages: [{ id: "BT1", title: "BlockTree", blocks }] };
      const source = join(OUT, "block-tree-fix-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((n) => document.querySelector("#blocks .block-content[data-id]")
        && [...document.querySelectorAll("#blocks .block")].length === n, blocks.length, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 保存HTMLから読んだ文書モデルを「本文@字下げ#組:列」の列にする(種類が要るときは type も)
    const savedModel = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "block-tree-fix-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      await fresh.waitForTimeout(150);
      return fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages[0].blocks.map((block) => block.type + ":" + block.text + "@" + (block.indent || 0)
          + (block.columnGroup ? "#" + block.columnGroup + ":" + (block.columnIndex || 0) : ""));
      }, html);
    };
    // 画面に見えているブロックの本文(閉じたトグルの中は display:none なので入らない)
    const visibleTexts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .filter((row) => row.offsetParent)
      .map((row) => row.querySelector(".block-content")?.textContent ?? ""));
    const caretAt = async (blockId, where) => {
      await fresh.locator('#blocks .block-content[data-id="' + blockId + '"]').click();
      await fresh.keyboard.press(where === "start" ? "Home" : "End");
      await fresh.waitForTimeout(50);
    };
    const toggleCaret = async (blockId) => {
      await fresh.locator('#blocks .block[data-id="' + blockId + '"] .toggle-caret').click();
      await fresh.waitForTimeout(250);
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // A-1) 開いたトグル(子あり)の題名の末尾で Enter → 新しい段落が最初の子。閉じれば子ごと隠れる
    const toggleDoc = [
      { id: "T", type: "toggle", text: "Toggle head", open: true },
      { id: "t1", type: "paragraph", text: "child one", indent: 1 },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ];
    await openLiteral(toggleDoc);
    await caretAt("T", "end");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("new");
    await fresh.waitForTimeout(200);
    const openToggleModel = await savedModel();
    await toggleCaret("T");
    const openToggleVisible = await visibleTexts();
    result.enterOnOpenToggleMakesFirstChild = same(openToggleModel,
      ["toggle:Toggle head@0", "paragraph:new@1", "paragraph:child one@1", "paragraph:Zulu@0"])
      && same(openToggleVisible, ["Toggle head", "Zulu"]);
    result.enterOnOpenToggleEvidence = { openToggleModel, openToggleVisible };

    // A-2) 閉じたトグル(子あり)の末尾で Enter → 子ごとの後ろに、同じ字下げのトグル。子は隠れたまま
    await openLiteral([{ ...toggleDoc[0], open: false }, toggleDoc[1], toggleDoc[2]]);
    await caretAt("T", "end");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("after");
    await fresh.waitForTimeout(200);
    const closedToggleModel = await savedModel();
    const closedToggleVisible = await visibleTexts();
    result.enterOnClosedToggleGoesAfterChildren = same(closedToggleModel,
      ["toggle:Toggle head@0", "paragraph:child one@1", "toggle:after@0", "paragraph:Zulu@0"])
      && same(closedToggleVisible, ["Toggle head", "after", "Zulu"]);
    // 閉じたトグル見出し(子なし)でも同じ。以前は字下げ+1で閉じた中へ入り、打った文字が見えなかった
    await openLiteral([
      { id: "H", type: "toggleHeading2", text: "Closed TH", open: false },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ]);
    await caretAt("H", "end");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("typed");
    await fresh.waitForTimeout(200);
    const closedHeadingModel = await savedModel();
    const closedHeadingVisible = await visibleTexts();
    result.enterOnClosedToggleHeadingStaysVisible = same(closedHeadingModel,
      ["toggleHeading2:Closed TH@0", "paragraph:typed@0", "paragraph:Zulu@0"])
      && same(closedHeadingVisible, ["Closed TH", "typed", "Zulu"]);
    result.enterOnClosedToggleEvidence = { closedToggleModel, closedToggleVisible, closedHeadingModel, closedHeadingVisible };

    // A-3) 子のある箇条書きの末尾で Enter → 箇条書きの最初の子。＋でも段落が最初の子
    const bulletDoc = [
      { id: "B", type: "bullet", text: "parent bullet" },
      { id: "b1", type: "bullet", text: "sub bullet", indent: 1 },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ];
    await openLiteral(bulletDoc);
    await caretAt("B", "end");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("first");
    await fresh.waitForTimeout(200);
    const bulletModel = await savedModel();
    result.enterOnBulletWithChildrenMakesFirstChild = same(bulletModel,
      ["bullet:parent bullet@0", "bullet:first@1", "bullet:sub bullet@1", "paragraph:Zulu@0"]);
    await openLiteral(bulletDoc);
    await fresh.locator('#blocks .block[data-id="B"]').hover();
    await fresh.locator('#blocks .block[data-id="B"] .insert-block').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("plus");
    await fresh.waitForTimeout(200);
    const plusModel = await savedModel();
    result.plusOnParentMakesFirstChild = same(plusModel,
      ["bullet:parent bullet@0", "paragraph:plus@1", "bullet:sub bullet@1", "paragraph:Zulu@0"]);
    result.enterOnBulletEvidence = { bulletModel, plusModel };

    // A-4) トグルの直前のブロックを「下へ移動」→ トグルの子ごとの後ろへ(題名と子のあいだに入らない)
    await openLiteral([
      { id: "A", type: "paragraph", text: "Apple" },
      { id: "T", type: "toggle", text: "Toggle head", open: true },
      { id: "t1", type: "paragraph", text: "child one", indent: 1 },
      { id: "t2", type: "paragraph", text: "child two", indent: 1 },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ]);
    await fresh.locator('#blocks .block[data-id="A"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#block-menu .menu-item[data-action="movedown"]').click();
    await fresh.waitForTimeout(250);
    const moveDownModel = await savedModel();
    result.moveDownPassesWholeSubtree = same(moveDownModel,
      ["toggle:Toggle head@0", "paragraph:child one@1", "paragraph:child two@1", "paragraph:Apple@0", "paragraph:Zulu@0"]);
    result.moveDownEvidence = moveDownModel;

    // A-5) トグルの題名の「後ろへ」ドロップ → トグルの子ごとの後ろへ。閉じれば子だけが隠れる
    await openLiteral([
      { id: "A", type: "paragraph", text: "Apple" },
      { id: "T", type: "toggle", text: "Toggle head", open: true },
      { id: "t1", type: "paragraph", text: "child one", indent: 1 },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ]);
    await dragBlock(fresh, "Zulu", "Toggle head", "after");
    await fresh.waitForTimeout(300);
    const dropModel = await savedModel();
    await toggleCaret("T");
    const dropVisible = await visibleTexts();
    result.dropAfterToggleTitleGoesAfterChildren = same(dropModel,
      ["paragraph:Apple@0", "toggle:Toggle head@0", "paragraph:child one@1", "paragraph:Zulu@0"])
      && same(dropVisible, ["Apple", "Toggle head", "Zulu"]);
    result.dropAfterToggleEvidence = { dropModel, dropVisible };

    // B) 段組みの列の境界では、Backspace / Delete は何もしない(同じ列の中では今までどおり繋がる)
    const columnDoc = [
      { id: "P0", type: "paragraph", text: "top" },
      { id: "L1", type: "paragraph", text: "left one", columnGroup: "g1", columnIndex: 0 },
      { id: "L2", type: "paragraph", text: "left two", columnGroup: "g1", columnIndex: 0 },
      { id: "R1", type: "paragraph", text: "right one", columnGroup: "g1", columnIndex: 1 },
      { id: "R2", type: "paragraph", text: "right two", columnGroup: "g1", columnIndex: 1 },
      { id: "P9", type: "paragraph", text: "bottom" },
    ];
    const columnStart = ["paragraph:top@0", "paragraph:left one@0#g1:0", "paragraph:left two@0#g1:0",
      "paragraph:right one@0#g1:1", "paragraph:right two@0#g1:1", "paragraph:bottom@0"];
    await openLiteral(columnDoc);
    await caretAt("R1", "start");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(200);
    const backspaceModel = await savedModel();
    await openLiteral(columnDoc);
    await caretAt("L2", "end");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(200);
    const deleteModel = await savedModel();
    result.backspaceDeleteStopAtColumnBoundary = same(backspaceModel, columnStart) && same(deleteModel, columnStart);
    // 同じ列の中の結合は今までどおり
    await openLiteral(columnDoc);
    await caretAt("R2", "start");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(200);
    const sameColumnModel = await savedModel();
    result.mergeWithinSameColumnStillWorks = same(sameColumnModel, ["paragraph:top@0", "paragraph:left one@0#g1:0",
      "paragraph:left two@0#g1:0", "paragraph:right oneright two@0#g1:1", "paragraph:bottom@0"]);

    // 1列1ブロックでも段組みが崩れない
    await openLiteral([
      { id: "L1", type: "paragraph", text: "left one", columnGroup: "g1", columnIndex: 0 },
      { id: "R1", type: "paragraph", text: "right one", columnGroup: "g1", columnIndex: 1 },
      { id: "P9", type: "paragraph", text: "bottom" },
    ]);
    await caretAt("R1", "start");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(200);
    const singleModel = await savedModel();
    result.singleBlockColumnsSurviveBackspace = same(singleModel,
      ["paragraph:left one@0#g1:0", "paragraph:right one@0#g1:1", "paragraph:bottom@0"]);

    // 別の列の区切り線は消さない(Backspace: 左の列の最後の区切り線 / Delete: 右の列の最初の区切り線)
    await openLiteral([
      { id: "L1", type: "paragraph", text: "left one", columnGroup: "g1", columnIndex: 0 },
      { id: "D", type: "divider", text: "", columnGroup: "g1", columnIndex: 0 },
      { id: "R1", type: "paragraph", text: "right one", columnGroup: "g1", columnIndex: 1 },
    ]);
    await caretAt("R1", "start");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(200);
    const dividerBackModel = await savedModel();
    await openLiteral([
      { id: "L1", type: "paragraph", text: "left one", columnGroup: "g1", columnIndex: 0 },
      { id: "D", type: "divider", text: "", columnGroup: "g1", columnIndex: 1 },
      { id: "R1", type: "paragraph", text: "right one", columnGroup: "g1", columnIndex: 1 },
    ]);
    await caretAt("L1", "end");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(200);
    const dividerForwardModel = await savedModel();
    result.dividerInOtherColumnIsKept = same(dividerBackModel,
      ["paragraph:left one@0#g1:0", "divider:@0#g1:0", "paragraph:right one@0#g1:1"])
      && same(dividerForwardModel, ["paragraph:left one@0#g1:0", "divider:@0#g1:1", "paragraph:right one@0#g1:1"]);
    result.columnBoundaryEvidence = { backspaceModel, deleteModel, sameColumnModel, singleModel, dividerBackModel, dividerForwardModel };
  } finally {
    await fresh.close();
  }
  return result;
}
