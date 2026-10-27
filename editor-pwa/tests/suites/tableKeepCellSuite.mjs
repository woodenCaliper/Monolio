// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の構造を変えても、今のセルから動かない(v239) ----
// ユーザー指示「右に列を挿入したときに、選択セルが勝手に移動するのをやめてほしい。ユーザーが意図しているのは列の追加であって、
// その列に移動することではない」「ほかの機能も気を付けてほしい」。行・列の挿入、ヘッダー行・列の切り替えで、
// カーソルは同じセル(中身)に残る。今いた行・列を消したときは同じ番号の位置。Tab で最後のセルから行を足したときだけ新しい行へ移る。
export default async function tableKeepCellSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1100, height: 800 });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const names = ["a", "b", "c", "d"];
  const rows = [1, 2, 3, 4].map((r) => names.map((n) => ({ text: n + r, colSpan: 1, rowSpan: 1 })));
  let opened = 0;
  const open = async (extra = {}) => {
    const path = join(OUT, "table-keep-" + (opened += 1) + ".html");
    const title = "Keep" + opened;
    const literal = { pages: [{ id: "K" + opened, title, blocks: [{ id: "t", type: "table", rows, ...extra }] }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(250);
  };
  const cell = (r, k) => fresh.locator('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
  // 今のセル(フォーカスのあるセル)の中身。
  const activeText = () => fresh.evaluate(() => {
    const node = document.activeElement;
    return node?.closest?.(".editor-table") ? node.textContent : null;
  });
  // B2(b2)から道具を押して、今のセルの中身を見る。
  const afterTool = async (tool) => {
    await cell(1, 1).click();
    await fresh.waitForTimeout(120);
    await fresh.locator('#table-toolbar [data-tool="' + tool + '"]').click();
    await fresh.waitForTimeout(250);
    const text = await activeText();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    return text;
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await open();
    const seen = {};
    for (const tool of ["col-after", "col-before", "row-after", "row-before", "header", "header-col", "col-delete", "row-delete"]) {
      seen[tool] = await afterTool(tool);
    }
    result.tableInsertKeepsActiveCell = seen["col-after"] === "b2" && seen["col-before"] === "b2" && seen["row-after"] === "b2" && seen["row-before"] === "b2";
    result.tableHeaderToggleKeepsActiveCell = seen.header === "b2" && seen["header-col"] === "b2";
    result.tableDeleteMovesToSamePosition = seen["col-delete"] === "c2" && seen["row-delete"] === "b3";
    // Tab で最後のセルから行を足したときは、新しい行の先頭へ(Notion・Word と同じ。こちらは移るのが目的)。
    await cell(3, 3).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(250);
    const tabRow = await fresh.evaluate(() => document.activeElement?.dataset?.row + ":" + document.activeElement?.dataset?.cell);
    result.tableTabAtEndStillMovesToNewRow = tabRow === "4:0";
    result.tableKeepCellEvidence = JSON.stringify({ seen, tabRow });
    result.tableKeepCellNoPageErrors = pageErrors.length === 0;
    return result;
  } finally {
    await fresh.close();
  }
}
