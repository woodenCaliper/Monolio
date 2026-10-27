// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 行の多い表でセルを押したときの速さ(v261。Issue #146) ----
// セルを押すたびに、表の行番号・列番号・行の高さのつまみ・列の幅のつまみを作り直す(renderTableRangeHandles)。以前は
//  1) 1 行ずつ「位置を測る → 印を足す」を繰り返していたので、測るたびにブラウザが表全体の配置を計算し直した
//  2) 行ごと・列ごとに、表の全セルの中からその行・列のセルを探していた
// ので、手間が行数の 2 乗になり、800 行で約 5 秒・1400 行で約 20 秒、画面が固まった。いまは先に全部を測ってから
// 印をまとめて足し、行・列ごとのセルは 1 回で引く。
// 速さは機械で揺れるので、秒ではなく「DOM を書き換えた直後に位置を測った回数」(配置の計算のやり直しの回数)で確かめる。
// 秒の上限は、2 乗に戻ったときだけ赤になる緩い値にする。
const ROWS = 1000;
const COLS = 7;

export default async function bigTableSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const rows = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => ({ text: r === 0 ? "列" + c : "行" + r + "の" + c })));
    const literal = { title: "BigTable", fonts: [], attachments: [], pages: [{ id: "BT1", title: "BigTable", blocks: [
      { id: "bt-p", type: "paragraph", text: "表の前の段落" },
      { id: "bt-t", type: "table", tableHeader: true, rows },
    ] }] };
    const source = join(OUT, "big-table.html");
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction(() => document.querySelectorAll("#blocks .editor-table tr").length > 900, null, { timeout: 30000 });
    await fresh.waitForTimeout(400);

    // DOM を書き換えたあとに位置を測った回数を数える(書き換え → 測る、のたびに配置の計算がやり直しになる)
    await fresh.evaluate(() => {
      const probe = { reads: 0, readsAfterWrite: 0, dirty: false };
      window.__bigTableProbe = probe;
      const mark = (proto, name) => {
        const original = proto[name];
        proto[name] = function (...args) { probe.dirty = true; return original.apply(this, args); };
      };
      mark(Element.prototype, "append");
      mark(Element.prototype, "prepend");
      mark(Element.prototype, "remove");
      mark(Node.prototype, "appendChild");
      mark(Node.prototype, "insertBefore");
      mark(Node.prototype, "removeChild");
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        probe.reads += 1;
        if (probe.dirty) { probe.readsAfterWrite += 1; probe.dirty = false; }
        return rect.call(this);
      };
    });
    const clickCell = async (r, c) => {
      await fresh.evaluate(() => { Object.assign(window.__bigTableProbe, { reads: 0, readsAfterWrite: 0, dirty: false }); });
      const td = fresh.locator('#blocks .editor-table [data-row="' + r + '"][data-cell="' + c + '"]');
      await td.scrollIntoViewIfNeeded();
      const started = Date.now();
      await td.click();
      await fresh.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0))));
      const ms = Date.now() - started;
      const probe = await fresh.evaluate(() => ({ ...window.__bigTableProbe }));
      return { ms, ...probe };
    };
    const first = await clickCell(3, 1);
    const second = await clickCell(500, 4);

    // 印の数と位置: 行番号は全行(高さを決めていない表は全部が見えている範囲)、列番号は全列。行番号の印は、その行のセルの縦の真ん中
    const marks = await fresh.evaluate(() => {
      const row = document.querySelector('#blocks .block[data-id="bt-t"]');
      const rowRect = row.getBoundingClientRect();
      const labels = [...row.querySelectorAll(".table-axis-label.row")];
      const at = (r) => {
        const label = labels.find((node) => node.textContent === String(r + 1));
        const cell = row.querySelector('.editor-table [data-row="' + r + '"][data-cell="0"]').getBoundingClientRect();
        return label ? Math.abs(parseFloat(label.style.top) - (cell.top - rowRect.top + cell.height / 2)) : null;
      };
      return {
        rowLabels: labels.length,
        columnLabels: row.querySelectorAll(".table-axis-label.column").length,
        rowResizers: row.querySelectorAll(".table-row-resizer").length,
        columnResizers: row.querySelectorAll(".table-col-resizer").length,
        currentRow: row.querySelector(".table-axis-label.row.is-current")?.textContent,
        currentColumn: row.querySelector(".table-axis-label.column.is-current")?.textContent,
        offsets: [at(0), at(499), at(998)],
      };
    });
    result.bigTableClickDoesNotRelayoutPerRow = first.readsAfterWrite <= 10 && second.readsAfterWrite <= 10;
    result.bigTableClickIsFast = first.ms < 3000 && second.ms < 3000;
    result.bigTableMarksStillComplete = marks.rowLabels === ROWS && marks.columnLabels === COLS && marks.rowResizers === ROWS
      && marks.columnResizers === COLS && marks.currentRow === "501" && marks.currentColumn === "E"
      && marks.offsets.every((d) => d !== null && d < 1);
    result.bigTableEvidence = { first, second, marks };
  } finally {
    await fresh.close();
  }
  return result;
}
