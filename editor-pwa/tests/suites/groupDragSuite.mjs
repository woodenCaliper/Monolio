// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 選んだ複数のブロックを、つまみ(⋮⋮)でまとめて動かす(v210) ----
// ユーザー報告「複数ブロックを選択している状態で、さいころアイコンでドラッグしても1つのブロックしか移動できない。
// 選択しているブロックごと移動させたい」。選んだブロックの1つのつまみを掴むと、選んだブロック(子も)をまとめて動かす。
// 選んでいないブロックのつまみは従来どおりそのブロックだけ。動かした後も選んだまま。Undo は1回で戻る。
export default async function groupDragSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1200, height: 800 });
  const result = {};
  const p = (id, text, indent = 0) => ({ id, type: "paragraph", text: "ブロック" + text, ...(indent ? { indent } : {}) });
  const literal = { pages: [{ id: "GD", title: "まとめて動かす", blocks: [
    p("a", "A"), p("b", "B"), p("c", "C"), p("c1", "C1", 1), p("d", "D"), p("e", "E"), p("f", "F"),
  ] }], fonts: [], attachments: [] };
  const open = async () => {
    const path = join(OUT, "group-drag.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelectorAll("#blocks .block").length === 7, null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(250);
  };
  // 並び(字下げは「>」で示す)と、選んでいるブロック。
  const state = () => fresh.evaluate(() => ({
    order: [...document.querySelectorAll("#blocks .block")].map((row) => ">".repeat(Number(getComputedStyle(row).getPropertyValue("--indent") || 0))
      + row.querySelector(".block-content").textContent.replace("ブロック", "")).join(" "),
    selected: [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.querySelector(".block-content").textContent.replace("ブロック", "")).join(" "),
  }));
  const box = (text) => fresh.locator("#blocks .block-content", { hasText: new RegExp("^ブロック" + text + "$") }).boundingBox();
  // from から to まで、文字の上でまたいでドラッグして選ぶ(ブロックの選択になる。v206)。
  const selectAcross = async (from, to) => {
    const start = await box(from);
    const end = await box(to);
    await fresh.mouse.move(start.x + 10, start.y + start.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(end.x + 30, end.y + end.height / 2, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
  };
  // text のブロックのつまみを掴み、target のブロックの上/下の端へ落とす。
  const dragGrip = async (text, target, placement) => {
    const content = await box(text);
    await fresh.mouse.move(content.x + 20, content.y + content.height / 2);
    await fresh.waitForTimeout(100);
    const grip = await fresh.locator("#blocks .block", { has: fresh.locator(".block-content", { hasText: new RegExp("^ブロック" + text + "$") }) })
      .locator(".drag-grip").first().boundingBox();
    const goal = await box(target);
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await fresh.mouse.move(x, y);
    await fresh.mouse.down();
    await fresh.mouse.move(x, y + 12, { steps: 3 });
    await fresh.mouse.move(goal.x + 80, placement === "after" ? goal.y + goal.height - 3 : goal.y + 3, { steps: 10 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await open();

    // 1) B〜D を選んで、C のつまみで F の下へ。B・C(と子の C1)・D がまとめて動き、選んだまま。
    await selectAcross("B", "D");
    const picked = await state();
    await dragGrip("C", "F", "after");
    const down = await state();
    result.groupDragMovesAllSelected = picked.selected === "B C C1 D" && down.order === "A E F B C >C1 D";
    result.groupDragKeepsSelection = down.selected === "B C C1 D";
    // 2) Undo 1回で元へ戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const undone = await state();
    result.groupDragUndoesInOneStep = undone.order === "A B C >C1 D E F";
    // 3) 上へも動かせる(D〜E を選んで、E のつまみで A の上へ)。
    await selectAcross("D", "E");
    await dragGrip("E", "A", "before");
    const up = await state();
    result.groupDragMovesUp = up.order === "D E A B C >C1 F";
    // 4) 選んだブロックの上に落としても何も変わらない。
    await open();
    await selectAcross("B", "D");
    await dragGrip("B", "C", "after");
    const onSelf = await state();
    result.groupDragOntoSelectionIsNoop = onSelf.order === "A B C >C1 D E F";
    // 5) 選んでいないブロックのつまみは、そのブロックだけ(従来どおり)。
    await open();
    await selectAcross("B", "D");
    await dragGrip("F", "A", "before");
    const single = await state();
    result.ungroupedGripMovesOnlyItself = single.order === "F A B C >C1 D E";
    result.groupDragEvidence = { picked, down, undone, up, onSelf, single };
  } finally {
    await fresh.close();
  }
  return result;
}
