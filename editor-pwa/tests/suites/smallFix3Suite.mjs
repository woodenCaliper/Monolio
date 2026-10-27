// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- ブロックの移動とスラッシュメニューの小さな不具合の直し(v221。v213 で既知の制限として残していたもの) ----
// A) メニューの「上へ移動」: トグル(子を持つブロック)の直後のブロックが、トグルの最後の子の前へ入って子になっていた。
//    「下へ移動」(相手の子ごとを越える)と対称に、前の兄弟の子ごとの前へ、同じ字下げで動く。下へ→上へで元に戻る。
// B) 開いた親の題名の「後ろへ」のドロップ: 線は題名のすぐ下に出るのに、行き先は子ごとの後ろだった。線を行き先
//    (子ごとの最後の行の下・相手の字下げ)に出す。子にしたいときの「最初の子の前へ」はそのまま。まとめて動かす
//    (複数選択のつまみ)も同じ行き先にする(以前は題名と子のあいだに入り、子が動かしたブロックの子へ付け替わった)。
// C) スラッシュメニューを開いたあと、クリックや矢印でキャレットを「/…」の外へ動かしても、Enter をメニューが取っていた。
//    キャレットが「/…」の末尾を離れたら閉じる(Enter はふつうに分割する)。
// D) コード類(コード・グラフ・数式・Mermaid)で、合う候補の無い「/zzz」を打つと空のメニューが開いたままで、
//    Enter(改行)を飲み込んでいた。コード類では候補が無くなったら閉じる(本文のブロックは従来どおり開いたまま)。
export default async function smallFix3Suite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1200, height: 800 });
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const openLiteral = async (blocks) => {
      const literal = { title: "SmallFix3", fonts: [], attachments: [], pages: [{ id: "SF3", title: "SmallFix3", blocks }] };
      const source = join(OUT, "small-fix3-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((n) => document.querySelector("#blocks .block-content[data-id]")
        && [...document.querySelectorAll("#blocks .block")].length === n, blocks.length, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 保存HTMLから読んだ文書モデルを「本文@字下げ」の列にする
    const savedModel = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "small-fix3-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      await fresh.waitForTimeout(150);
      return fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages[0].blocks.map((block) => block.text + "@" + (block.indent || 0));
      }, html);
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const press = async (key, ms = 150) => {
      await fresh.keyboard.press(key);
      await fresh.waitForTimeout(ms);
    };
    const menuMove = async (blockId, action) => {
      await fresh.locator('#blocks .block[data-id="' + blockId + '"] .drag-grip').click();
      await fresh.waitForTimeout(200);
      await fresh.locator('#block-menu .menu-item[data-action="' + action + '"]').click();
      await fresh.waitForTimeout(250);
    };

    // ---- A) 上へ移動は前の兄弟の子ごとを越える ----
    const toggleDoc = (open) => [
      { id: "A", type: "paragraph", text: "Apple" },
      { id: "T", type: "toggle", text: "Toggle head", open },
      { id: "t1", type: "paragraph", text: "child one", indent: 1 },
      { id: "t2", type: "paragraph", text: "child two", indent: 1 },
      { id: "X", type: "paragraph", text: "Xray" },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ];
    const original = ["Apple@0", "Toggle head@0", "child one@1", "child two@1", "Xray@0", "Zulu@0"];
    await openLiteral(toggleDoc(true));
    await menuMove("X", "moveup");
    const upModel = await savedModel();
    await menuMove("X", "movedown");
    const upDownModel = await savedModel();
    result.moveUpPassesPreviousSubtree = same(upModel, ["Apple@0", "Xray@0", "Toggle head@0", "child one@1", "child two@1", "Zulu@0"]);
    result.moveUpThenDownRestores = same(upDownModel, original);
    // 閉じたトグルでも、見えない中身の中へ入らない(以前は隠れた子になり、ブロックが見えなくなった)
    await openLiteral(toggleDoc(false));
    await menuMove("X", "moveup");
    const upClosedModel = await savedModel();
    const upClosedVisible = await fresh.evaluate(() => Boolean(document.querySelector('#blocks .block[data-id="X"]')?.offsetParent));
    result.moveUpPassesClosedToggle = same(upClosedModel, ["Apple@0", "Xray@0", "Toggle head@0", "child one@1", "child two@1", "Zulu@0"])
      && upClosedVisible;
    // 子の中でも同じ: 前の兄弟(子を持つ)の子ごとの前へ、同じ字下げで。孫の前へは入らない
    await openLiteral([
      { id: "T", type: "toggle", text: "Toggle head", open: true },
      { id: "t1", type: "bullet", text: "child one", indent: 1 },
      { id: "g1", type: "bullet", text: "grandchild", indent: 2 },
      { id: "t2", type: "paragraph", text: "child two", indent: 1 },
    ]);
    await menuMove("t2", "moveup");
    const nestedModel = await savedModel();
    result.moveUpNestedPassesSiblingSubtree = same(nestedModel, ["Toggle head@0", "child two@1", "child one@1", "grandchild@2"]);
    // 最初の子の上へ: これまでどおり親の前へ(親の字下げ)
    await openLiteral(toggleDoc(true));
    await menuMove("t1", "moveup");
    const firstChildModel = await savedModel();
    result.moveUpFirstChildLeavesParent = same(firstChildModel, ["Apple@0", "child one@0", "Toggle head@0", "child two@1", "Xray@0", "Zulu@0"]);
    result.moveUpEvidence = { upModel, upDownModel, upClosedModel, upClosedVisible, nestedModel, firstChildModel };

    // ---- B) 後ろへのドロップの線は、行き先(子ごとの後ろ・相手の字下げ)に出す ----
    const rowBox = (blockId) => fresh.locator('#blocks .block[data-id="' + blockId + '"]').boundingBox();
    const indicator = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.drop-before, #blocks .block.drop-after")]
      .map((row) => {
        const after = row.classList.contains("drop-after");
        const style = getComputedStyle(row, after ? "::after" : "::before");
        const rect = row.getBoundingClientRect();
        return { id: row.dataset.id, mode: after ? "after" : "before", x: Math.round(rect.left + parseFloat(style.left)) };
      }));
    // つまみ(⋮⋮)を掴んで、targetId の行の上端/下端の近くまで動かし、線を読んでから離す。
    const dragAndRead = async (blockId, targetId, placement) => {
      await fresh.locator('#blocks .block[data-id="' + blockId + '"] .block-content').hover();
      await fresh.waitForTimeout(100);
      const grip = await fresh.locator('#blocks .block[data-id="' + blockId + '"] .drag-grip').boundingBox();
      const goal = await rowBox(targetId);
      const x = grip.x + grip.width / 2;
      const y = grip.y + grip.height / 2;
      await fresh.mouse.move(x, y);
      await fresh.mouse.down();
      await fresh.mouse.move(x, y + 12, { steps: 3 });
      await fresh.mouse.move(goal.x + goal.width / 2, placement === "after" ? goal.y + goal.height - 3 : goal.y + 3, { steps: 10 });
      await fresh.waitForTimeout(100);
      const line = await indicator();
      await fresh.mouse.up();
      await fresh.waitForTimeout(300);
      return line;
    };
    const dragDoc = [
      { id: "A", type: "paragraph", text: "Apple" },
      { id: "B", type: "paragraph", text: "Bravo" },
      { id: "T", type: "toggle", text: "Toggle head", open: true },
      { id: "t1", type: "paragraph", text: "child one", indent: 1 },
      { id: "t2", type: "paragraph", text: "child two", indent: 1 },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ];
    await openLiteral(dragDoc);
    const titleBox = await rowBox("T");
    const titleLineX = Math.round(titleBox.x + 34);
    const afterLine = await dragAndRead("A", "T", "after");
    const afterModel = await savedModel();
    result.dropAfterLineMatchesDestination = afterLine.length === 1 && afterLine[0].id === "t2" && afterLine[0].mode === "after"
      && Math.abs(afterLine[0].x - titleLineX) <= 1
      && same(afterModel, ["Bravo@0", "Toggle head@0", "child one@1", "child two@1", "Apple@0", "Zulu@0"]);
    // 最初の子の前へ落とせば、これまでどおり子になる(線もその子の上)
    await openLiteral(dragDoc);
    const beforeLine = await dragAndRead("Z", "t1", "before");
    const beforeModel = await savedModel();
    result.dropBeforeFirstChildStillNests = beforeLine.length === 1 && beforeLine[0].id === "t1" && beforeLine[0].mode === "before"
      && same(beforeModel, ["Apple@0", "Bravo@0", "Toggle head@0", "Zulu@1", "child one@1", "child two@1"]);
    // 子の無いブロックの後ろは、これまでどおりその行の下
    await openLiteral(dragDoc);
    const plainLine = await dragAndRead("Z", "A", "after");
    result.dropAfterLeafLineUnchanged = plainLine.length === 1 && plainLine[0].id === "A" && plainLine[0].mode === "after";
    // まとめて動かす(A・B を選んで A のつまみ)でも、線と行き先は子ごとの後ろ
    await openLiteral(dragDoc);
    const aBox = await fresh.locator('#blocks .block-content[data-id="A"]').boundingBox();
    const bBox = await fresh.locator('#blocks .block-content[data-id="B"]').boundingBox();
    await fresh.mouse.move(aBox.x + 10, aBox.y + aBox.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(bBox.x + 30, bBox.y + bBox.height / 2, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
    const picked = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id).join(","));
    const groupLine = await dragAndRead("A", "T", "after");
    const groupModel = await savedModel();
    result.groupDropAfterGoesAfterSubtree = picked === "A,B" && groupLine.length === 1 && groupLine[0].id === "t2"
      && Math.abs(groupLine[0].x - titleLineX) <= 1
      && same(groupModel, ["Toggle head@0", "child one@1", "child two@1", "Apple@0", "Bravo@0", "Zulu@0"]);
    result.dropLineEvidence = { titleLineX, afterLine, afterModel, beforeLine, beforeModel, plainLine, picked, groupLine, groupModel };

    // ---- C) キャレットが「/…」を離れたらスラッシュメニューを閉じる ----
    const menuHidden = () => fresh.evaluate(() => document.querySelector("#slash-menu").hidden);
    const texts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block .block-content")]
      .map((item) => item.textContent.replaceAll("​", "")));
    await openLiteral([{ id: "P", type: "paragraph", text: "hello world" }, { id: "Q", type: "paragraph", text: "end" }]);
    await fresh.locator('#blocks .block-content[data-id="P"]').click();
    await press("End");
    await fresh.keyboard.type(" /");
    await fresh.waitForTimeout(200);
    const openedByTyping = !(await menuHidden());
    // 同じブロックの先頭をクリック
    const pBox = await fresh.locator('#blocks .block-content[data-id="P"]').boundingBox();
    await fresh.mouse.click(pBox.x + 1, pBox.y + pBox.height / 2);
    await fresh.waitForTimeout(200);
    const closedByClick = await menuHidden();
    await press("Enter", 250);
    const clickEnterTexts = await texts();
    result.slashMenuClosesWhenCaretClickedAway = openedByTyping && closedByClick
      && same(clickEnterTexts, ["", "hello world /", "end"]);
    // 矢印で「/」の前へ
    await openLiteral([{ id: "P", type: "paragraph", text: "hello world" }, { id: "Q", type: "paragraph", text: "end" }]);
    await fresh.locator('#blocks .block-content[data-id="P"]').click();
    await press("End");
    await fresh.keyboard.type(" /he");
    await fresh.waitForTimeout(200);
    const openedAgain = !(await menuHidden());
    for (let i = 0; i < 3; i += 1) await press("ArrowLeft", 60);
    const closedByArrow = await menuHidden();
    await press("Enter", 250);
    const arrowEnterTexts = await texts();
    result.slashMenuClosesWhenCaretArrowedAway = openedAgain && closedByArrow && same(arrowEnterTexts, ["hello world ", "/he", "end"]);
    // 末尾で打ち続けている間は開いたまま(Enter で選べる)
    await openLiteral([{ id: "P", type: "paragraph", text: "" }, { id: "Q", type: "paragraph", text: "end" }]);
    await fresh.locator('#blocks .block-content[data-id="P"]').click();
    await fresh.keyboard.type("/head");
    await fresh.waitForTimeout(250);
    const stillOpen = !(await menuHidden());
    await press("Enter", 300);
    const chosenType = await fresh.evaluate(() => [...document.querySelector('#blocks .block').classList].find((name) => name.startsWith("type-")));
    result.slashMenuStillWorksAtQueryEnd = stillOpen && chosenType === "type-heading1";
    result.slashCaretEvidence = { openedByTyping, closedByClick, clickEnterTexts, openedAgain, closedByArrow, arrowEnterTexts, stillOpen, chosenType };

    // ---- D) コード類では候補の無い「/…」でメニューを閉じ、Enter を飲み込まない ----
    await openLiteral([
      { id: "C", type: "code", text: "x = 1" },
      { id: "M", type: "math", text: "a+b" },
      { id: "Q", type: "paragraph", text: "end" },
    ]);
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
    await caretAtEnd("C");
    await fresh.keyboard.type(" /");
    await fresh.waitForTimeout(200);
    const codeSlashOpens = !(await menuHidden());
    await fresh.keyboard.type("zzz");
    await fresh.waitForTimeout(200);
    const codeNoMatchClosed = await menuHidden();
    await press("Enter", 200);
    await fresh.keyboard.type("y");
    await fresh.waitForTimeout(200);
    const codeText = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="C"]').textContent);
    await caretAtEnd("M");
    await fresh.keyboard.type(" /zzz");
    await fresh.waitForTimeout(200);
    const mathNoMatchClosed = await menuHidden();
    await press("Escape");
    // 本文のブロックは従来どおり「合う候補なし」を出したまま(core の slashNoMatchEnterDoesNothing と同じ)
    await caretAtEnd("Q");
    await fresh.keyboard.type(" /zzz");
    await fresh.waitForTimeout(200);
    const paragraphNoMatchOpen = !(await menuHidden());
    await press("Escape");
    result.codeSlashNoMatchDoesNotSwallowEnter = codeSlashOpens && codeNoMatchClosed && codeText === "x = 1 /zzz\ny"
      && mathNoMatchClosed && paragraphNoMatchOpen;
    result.codeSlashEvidence = { codeSlashOpens, codeNoMatchClosed, codeText, mathNoMatchClosed, paragraphNoMatchOpen };

    return result;
  } finally {
    await fresh.close();
  }
}
