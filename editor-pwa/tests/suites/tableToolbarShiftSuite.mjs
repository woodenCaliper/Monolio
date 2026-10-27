// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表のセルを押しても文書がずれない(v216) ----
// 表の道具を上のツールバーに出していたころ、狭い画面(幅 1250px くらいまで)ではツールバーが1行増え、セルを押すたびに
// 文書全体が 30px 下へずれた(ユーザー「セルを押すたびに文書全体が大きく動くのが気になる」)。ずれのせいで、
// トリプルクリックの2回目以降が別のセルや表の外に当たり、表全体が選ばれて ← → も効かなかった。
// 道具は画面の一番下の帯に移した(ユーザー選択)。狭い画面で確かめる。
export default async function tableToolbarShiftSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1100, height: 800 });
  const result = {};
  const literal = { pages: [{ id: "TS", title: "表とずれ", blocks: [
    { id: "p0", type: "paragraph", text: "表の前の段落" },
    { id: "t", type: "table", rows: [[{ text: "左上のセル" }, { text: "右上のセル" }], [{ text: "左下のセル" }, { text: "右下のセル" }]] },
    { id: "p1", type: "paragraph", text: "表の後の段落" },
  ] }], fonts: [], attachments: [] };
  const open = async () => {
    const path = join(OUT, "table-shift.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelectorAll("#blocks .editor-table [data-cell]").length === 4, null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(250);
  };
  const layout = () => fresh.evaluate(() => ({
    toolbar: Math.round(document.querySelector(".toolbar").getBoundingClientRect().height),
    table: Math.round(document.querySelector("#blocks .editor-table").getBoundingClientRect().top),
  }));
  const selection = () => fresh.evaluate(() => {
    const selected = getSelection();
    const active = document.activeElement;
    return { text: selected.toString(), cell: active?.dataset?.cell !== undefined ? active.dataset.row + "," + active.dataset.cell : active?.tagName };
  });
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await open();
    // 1) セルを押しても、ツールバーの高さも表の位置も変わらない。表の外へ出ても戻らない(動かない)。
    const before = await layout();
    const cell = fresh.locator('#blocks .editor-table [data-row="0"][data-cell="0"]');
    const box = await cell.boundingBox();
    await fresh.mouse.click(box.x + 20, box.y + box.height / 2);
    await fresh.waitForTimeout(200);
    const inCell = await layout();
    const barShown = await fresh.evaluate(() => !document.querySelector("#table-toolbar").hidden);
    await fresh.locator("#blocks .block-content", { hasText: "表の前の段落" }).click();
    await fresh.waitForTimeout(200);
    const outside = await layout();
    result.tableCellClickKeepsLayout = barShown && inCell.toolbar === before.toolbar && inCell.table === before.table
      && outside.table === before.table;
    // 2) トリプルクリックで、押したセルの中身だけが選ばれる。→ で選択の末へ移って選択が解ける。
    await open();
    const target = await fresh.locator('#blocks .editor-table [data-row="0"][data-cell="0"]').boundingBox();
    await fresh.mouse.click(target.x + 20, target.y + target.height / 2, { clickCount: 3 });
    await fresh.waitForTimeout(150);
    const tripled = await selection();
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(100);
    const afterArrow = await fresh.evaluate(() => {
      const selected = getSelection();
      return { collapsed: selected.isCollapsed, offset: selected.focusOffset, cell: document.activeElement?.dataset?.cell };
    });
    result.tableCellTripleClickSelectsCell = tripled.text === "左上のセル" && tripled.cell === "0,0"
      && afterArrow.collapsed && afterArrow.cell === "0" && afterArrow.offset === "左上のセル".length;
    result.tableToolbarShiftEvidence = { before, inCell, outside, tripled, afterArrow };
  } finally {
    await fresh.close();
  }
  return result;
}
