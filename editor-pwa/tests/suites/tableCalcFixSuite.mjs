// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の計算の不具合(v248。探索的なデバッグで見つけたもの。ユーザー指示「あなたの側で、順番に直していってほしい」) ----
// 1) Issue #81: 範囲にエラーのセルが1つあると、COUNT・COUNTA・COUNTIF・SUMIF までエラーになった(Excel は飛ばす・COUNTA は数える)。
// 2) Issue #82: 式の中の #REF を IFERROR・IF で受け止められなかった(式を読む前に #REF にしていた)。
// 3) Issue #83: 100万を超える小数の結果に誤差が見えた(1234567.2000000002)。フィルではセルの中身に入った。
// 4) Issue #84: 0.1+0.2=0.3 が FALSE。COUNTIF も同じ(Excel は有効数字15桁で比べる)。
// 5) Issue #85: 逆向きの範囲(A$3:A1)の $ が、行の挿入のあと反対の端へ移った。
// 6) Issue #86: =.5・=1E3・空の引数(=SUM(A1,,A2))が #ERR。1E3 は行の挿入で E3 と読まれて書き換わらないこと。
export default async function tableCalcFixSuite({ browser }) {
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
  let opened = 0;
  const cells = (line) => line.map((text) => (typeof text === "object" ? { colSpan: 1, rowSpan: 1, ...text } : { text, colSpan: 1, rowSpan: 1 }));
  const openTable = async (rows) => {
    const title = "Calc" + (opened += 1);
    const path = join(OUT, "table-calc-fix-" + opened + ".html");
    const literal = { pages: [{ id: "C" + opened, title, blocks: [{ id: "t", type: "table", rows: rows.map(cells) }] }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const shown = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table tr')]
    .map((tr) => [...tr.children].map((td) => td.textContent).join("|")).join("\n"));
  const raws = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table tr')]
    .map((tr) => [...tr.children].map((td) => (td.classList.contains("formula-cell") && td.title ? td.title : td.textContent)).join("|")).join("\n"));
  const tool = async (r, c, key) => {
    await fresh.locator('#blocks .block[data-id="t"] [data-row="' + r + '"][data-cell="' + c + '"]').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#table-toolbar [data-tool="' + key + '"]').click();
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) #81 範囲にエラーのセル
    await openTable([
      ["1", "=COUNT(A1:A4)", "=COUNTA(A1:A4)", '=COUNTIF(A1:A4,">0")', '=SUMIF(A1:A4,">0")', "=SUM(A1:A4)", "=AND(A1:A4)"],
      ["=1/0", "", "", "", "", "", ""],
      ["2", "", "", "", "", "", ""],
      ["3", "", "", "", "", "", ""],
    ]);
    const errorRange = (await shown()).split("\n")[0];
    result.tableCountSkipsErrorCells = errorRange === "1|3|4|3|6|#ERR|#ERR";
    result.tableCountEvidence = errorRange;

    // 2) #82 #REF を IFERROR・IF で受け止める(2行目を消して参照切れを作る)
    await openTable([
      ["1", "=IFERROR(A2/A3,0)", '=IFERROR(A2,"消えた")', "=IF(TRUE,1,A2)", "=A2", '="#REF"'],
      ["2", "", "", "", "", ""],
      ["4", "", "", "", "", ""],
    ]);
    await tool(1, 0, "row-delete");
    const refRaw = (await raws()).split("\n")[0];
    const refShown = (await shown()).split("\n")[0];
    result.tableIfErrorCatchesRef = refRaw === '1|=IFERROR(#REF/A2,0)|=IFERROR(#REF,"消えた")|=IF(TRUE,1,#REF)|=#REF|="#REF"'
      && refShown === "1|0|消えた|1|#REF|#REF";
    result.tableIfErrorRefEvidence = JSON.stringify({ refRaw, refShown });

    // 3) #83 大きい数の小数の誤差(画面・桁区切り・保存HTML と共有の書式・フィルの値)
    await openTable([
      ["1234567", "=A1+0.1+0.1", { text: "=A1+0.1+0.1", numberFormat: { comma: true } }, "=10000000+0.1+0.2", "=A1*1.1"],
    ]);
    const bigShown = await shown();
    const fillText = await fresh.evaluate(() => window.SingleHtmlFormat.formatNumberValue(1000000.1 + 0.1 * 4));
    result.tableLargeDecimalHasNoNoise = bigShown === "1234567|1234567.2|1,234,567.2|10000000.3|1358023.7" && fillText === "1000000.5";
    result.tableLargeDecimalEvidence = JSON.stringify({ bigShown, fillText });

    // 4) #84 0.1+0.2=0.3
    await openTable([
      ["0.1", "=A1+A2=0.3", '=IF(A1+A2=0.3,"ok","ng")'],
      ["0.2", "=A1+A2", "=COUNTIF(B2:B3,0.3)"],
      ["", "0.3", ""],
    ]);
    const compareShown = await shown();
    result.tableCompareUses15Digits = compareShown === "0.1|TRUE|ok\n0.2|0.3|2\n|0.3|";
    result.tableCompareEvidence = compareShown;

    // 5) #85 逆向きの範囲の $
    await openTable([["1", "=SUM(A$3:A1)"], ["2", ""], ["3", ""], ["4", ""], ["5", ""]]);
    await tool(0, 0, "row-before");
    const reversedRaw = await raws();
    result.tableReversedRangeKeepsAbsolute = reversedRaw.split("\n")[1] === "1|=SUM(A2:A$4)" && (await shown()).split("\n")[1] === "1|6";
    result.tableReversedRangeEvidence = reversedRaw;

    // 6) #86 =.5・=1E3・空の引数。1E3 は行の挿入で書き換わらない
    await openTable([
      ["1", "=.5", "=1E3+A1", "=2.5e-1", "=SUM(A1,,A2)", "=IF(A1>5,,7)", "=IF(A1<5,,7)"],
      ["2", "", "", "", "", "", ""],
    ]);
    const numberShown = (await shown()).split("\n")[0];
    await tool(0, 0, "row-before");
    const afterInsert = (await raws()).split("\n")[1];
    result.tableNumberFormsAndEmptyArgs = numberShown === "1|0.5|1001|0.25|3|7|0";
    result.tableExponentNotRewrittenAsRef = afterInsert === "1|=.5|=1E3+A2|=2.5e-1|=SUM(A2,,A3)|=IF(A2>5,,7)|=IF(A2<5,,7)";
    result.tableNumberFormsEvidence = JSON.stringify({ numberShown, afterInsert });

    result.tableCalcFixNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.tableCalcFixPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
