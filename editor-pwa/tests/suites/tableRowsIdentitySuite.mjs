// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の行の読み出しが、表を作り直さない(Issue #198) ----
// 以前の tableRows() は、呼ぶたびに全セルを新しいオブジェクトに作り直して block.rows を差し替えていた。そのため
// 手元に持った行・セルは、途中で別の処理(セルに入る・打つ・離れる・計算)が tableRows() を呼ぶと古くなり、
// そこへの書き込みが黙って消えた(cellOriginInRows の注記の実バグと同じ形)。いまは整えるのをその場で行い、
// block.rows・行・セルのオブジェクトはそのまま使い続ける。
// 確かめること:
//   1) ただ読むだけなら、block.rows・行・セルは同じオブジェクトのまま
//   2) 手元に持ったセルは、セルに入る・打つ・離れる(=途中で tableRows() が何度も走る)のあとも生きていて、書き込みが表に届く
//   3) 整える中身は前と同じ: 結合のミラーは本体の文字に付いていく(旧文書の空の covered も本体の写しになる)、
//      覆う相手のいない covered はただのセルに戻る、知らない鍵は落とし、鍵の並びも決まった順
export default async function tableRowsIdentitySuite({ browser }) {
  const context = await browser.newContext({ viewport: { width: 1300, height: 860 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const cellSelector = (r, c) => '#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
  const shown = (r, c) => fresh.evaluate((selector) => document.querySelector(selector)?.textContent ?? null, cellSelector(r, c));
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 3行3列。A1:B1 は結合(B1 は旧文書の形の空の covered)。A3 は覆う相手のいない covered(色つき)。
    // B3 は鍵の順がばらばらで、知らない鍵も持つ。C2 は A2+B2。
    const rows = [
      [{ text: "a", colSpan: 2, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1, covered: true }, { text: "x", colSpan: 1, rowSpan: 1 }],
      [{ text: "1", colSpan: 1, rowSpan: 1 }, { text: "2", colSpan: 1, rowSpan: 1 }, { text: "=A2+B2", colSpan: 1, rowSpan: 1 }],
      [
        { text: "orph", colSpan: 1, rowSpan: 1, covered: true, color: "#ff0000" },
        { numberFormat: { decimals: 1 }, junk: "drop me", rowSpan: 1, text: "5", colSpan: 1 },
        { text: "z", colSpan: 1, rowSpan: 1 },
      ],
    ];
    const path = join(OUT, "table-rows-identity.html");
    const literal = { pages: [{ id: "R", title: "Identity", blocks: [{ id: "t", type: "table", rows }] }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Identity", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);

    // 1) 読むだけなら同じオブジェクト。
    const plainRead = await fresh.evaluate(() => {
      const api = window.__docEditorTables;
      const first = api.rows("t");
      const second = api.rows("t");
      return {
        sameArray: first === second && first === api.stored("t"),
        sameRow: first[1] === second[1],
        sameCell: first[1][0] === second[1][0] && first[0][1] === second[0][1],
      };
    });
    result.tableRowsReadKeepsIdentity = plainRead.sameArray && plainRead.sameRow && plainRead.sameCell;
    result.tableRowsReadKeepsIdentityEvidence = JSON.stringify(plainRead);

    // 3) 開いたときの整え: 結合のミラー・覆う相手のいない covered・知らない鍵と鍵の並び。
    const opened = await fresh.evaluate(() => {
      const table = window.__docEditorTables.rows("t");
      return { mirror: JSON.stringify(table[0][1]), orphan: JSON.stringify(table[2][0]), messy: JSON.stringify(table[2][1]) };
    });
    result.tableRowsMirrorMigrated = opened.mirror === '{"text":"a","colSpan":1,"rowSpan":1,"covered":true}';
    result.tableRowsOrphanCoveredBecomesPlain = opened.orphan === '{"text":"orph","colSpan":1,"rowSpan":1}';
    result.tableRowsCellKeysCanonical = opened.messy === '{"text":"5","colSpan":1,"rowSpan":1,"numberFormat":{"decimals":1}}';
    result.tableRowsNormalizeEvidence = JSON.stringify(opened);

    // 2) 手元に持った行・セルが、セルに入る(focus で2回)・打つ(input)・離れる(blur の計算)のあとも生きている。
    await fresh.evaluate(() => {
      window.__heldRows = window.__docEditorTables.rows("t");
      window.__heldCell = window.__heldRows[1][0];
      window.__heldMirror = window.__heldRows[0][1];
    });
    await fresh.locator(cellSelector(1, 1)).click();
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("0");
    await fresh.waitForTimeout(100);
    await fresh.locator(cellSelector(0, 2)).click();
    await fresh.waitForTimeout(200);
    const held = await fresh.evaluate(() => {
      const api = window.__docEditorTables;
      // 持っていたセルへ書く(ほかの処理が途中で表を読み直していても、表に届くこと)。
      window.__heldCell.text = "40";
      const now = api.rows("t");
      return {
        sameArray: api.stored("t") === window.__heldRows,
        sameCell: now[1][0] === window.__heldCell,
        reached: now[1][0].text,
        typed: now[1][1].text,
      };
    });
    // 書いた値を読む式(C2 = A2+B2)も、描き直すと新しい値になる(セルを離れると式を描き直す)。
    await fresh.locator(cellSelector(2, 2)).click();
    await fresh.waitForTimeout(150);
    await fresh.locator(cellSelector(0, 2)).click();
    await fresh.waitForTimeout(200);
    const sum = await shown(1, 2);
    result.tableRowsHeldReferenceSurvivesEditing = held.sameArray && held.sameCell && held.reached === "40" && held.typed === "20" && sum === "60";
    result.tableRowsHeldReferenceEvidence = JSON.stringify({ ...held, sum });

    // 3) 結合のミラーは、本体を打って変えると付いていく(ミラーのセルのオブジェクトもそのまま)。
    await fresh.locator(cellSelector(0, 0)).click();
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("b");
    await fresh.waitForTimeout(100);
    await fresh.locator(cellSelector(2, 2)).click();
    await fresh.waitForTimeout(200);
    const mirror = await fresh.evaluate(() => {
      const table = window.__docEditorTables.rows("t");
      return { origin: table[0][0].text, mirror: JSON.stringify(table[0][1]), sameMirror: table[0][1] === window.__heldMirror };
    });
    result.tableRowsMirrorFollowsOrigin = mirror.origin === "ab" && mirror.mirror === '{"text":"ab","colSpan":1,"rowSpan":1,"covered":true}' && mirror.sameMirror;
    result.tableRowsMirrorEvidence = JSON.stringify(mirror);

    result.tableRowsIdentityNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.tableRowsIdentityPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
