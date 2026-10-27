// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の数の読み方・目盛りの文字・全角の式・フィルの丸め(v213) ----
// 1. セルの数を Number() で読んでいたので、「0x10」「0b11」「0o7」が 16・3・7 として計算に入り、フィルでも数列になった。
//    ふつうの10進の数(符号・小数点・指数・桁区切りのカンマ)だけを数にする。
// 2. 目盛りの指数を仮数1桁(toExponential(1))で書いていたので、12500・17500 が「1.3e+4」「1.8e+4」と、実際と違う値で出た。
//    小数も3桁で丸めていたので 0.0011・0.0012 が同じ「0.001」になった。値を正しく表す最短の桁で書く。
// 3. 全角で打った式(「＝１＋２」「=A１+1」)が、文字のまま・#ERR になった。計算のときに全角の英数字・記号を半角へ揃える
//    (保存する文字はそのまま。行の挿入などで参照が動くときだけ半角で書き直す)。
// 4. フィルで続けた数を 1e-10 の位で丸めていたので、1e-12, 2e-12 を続けると 0 になった(式の結果の丸めと揃える)。
export default async function lowFixNumberSuite({ context }) {
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  let fileIndex = 0;

  const openLiteral = async (blocks) => {
    const title = "Low Fix " + (fileIndex += 1);
    const literal = { title, fonts: [], attachments: [], pages: [{ id: "LF" + fileIndex, title, blocks }] };
    const path = join(OUT, "low-fix-number-" + fileIndex + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((text) => document.querySelector("#doc-title")?.textContent === text, title, { timeout: 8000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const save = async () => {
    await fresh.evaluate(() => document.activeElement?.blur?.());
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "low-fix-number-saved-" + (fileIndex += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return { html, model: await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html) };
  };
  const sel = (id, r, c) => '#blocks .block[data-id="' + id + '"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
  const grid = (id) => fresh.evaluate((blockId) => [...document.querySelectorAll('#blocks .block[data-id="' + blockId + '"] .editor-table tr')]
    .map((tr) => [...tr.querySelectorAll("td, th")].map((td) => td.textContent)), id);
  // 式のセルは生の式(title)、それ以外は表示の文字。
  const raw = (id, r, c) => fresh.evaluate((selector) => {
    const td = document.querySelector(selector);
    if (!td) return null;
    return td.classList.contains("formula-cell") && td.title ? td.title : td.textContent;
  }, sel(id, r, c));
  const isFormulaCell = (id, r, c) => fresh.evaluate((selector) => Boolean(document.querySelector(selector)?.classList.contains("formula-cell")), sel(id, r, c));
  const ticks = (id) => fresh.evaluate((blockId) => [...document.querySelectorAll('.block[data-id="' + blockId + '"] text.chart-tick[text-anchor="end"]')]
    .map((text) => text.textContent), id);
  const dragCells = async (id, from, to) => {
    const a = await fresh.locator(sel(id, from[0], from[1])).boundingBox();
    const b = await fresh.locator(sel(id, to[0], to[1])).boundingBox();
    await fresh.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
  };
  const dragFillTo = async (id, r, c) => {
    const handle = await fresh.locator("#blocks .block .table-fill-handle").first().boundingBox();
    const cell = await fresh.locator(sel(id, r, c)).boundingBox();
    await fresh.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
  };

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // ---- 1. 0x10 / 0b11 / 0o7 は文字(計算では 0)。ふつうの10進の数は今までどおり数 ----
    await openLiteral([
      { id: "n1", type: "table", rows: [
        cells("0x10", "=A1*1", "=SUM(A1:A3)"),
        cells("0b11", "=A2*1", ""),
        cells("0o7", "=A3*1", ""),
        cells("1e3", "=A4*1", ""),
        cells("-1,000", "=A5*1", ""),
        cells(".5", "=A6*1", "=SUM(A4:A6)"),
      ] },
    ]);
    const numbers = await grid("n1");
    result.lowFixHexLiteralIsText = numbers[0][1] === "0" && numbers[1][1] === "0" && numbers[2][1] === "0" && numbers[0][2] === "0";
    result.lowFixDecimalStillNumber = numbers[3][1] === "1000" && numbers[4][1] === "-1000" && numbers[5][1] === "0.5" && numbers[5][2] === "0.5";
    result.lowFixHexEvidence = numbers;

    // ---- 1'. フィル: 0x10, 0x20 は数列(48, 64)にならない。4. 1e-12, 2e-12 は 3e-12, 4e-12 と続く(0 にならない)。
    // 3'. 全角の式のフィルも参照が動く(＝Ａ１＋０ → =A3+0) ----
    await openLiteral([
      { id: "f1", type: "table", rows: [cells("1e-12", "0x10", "＝Ａ１＋０"), cells("2e-12", "0x20", "＝Ａ２＋０"), cells("", "", ""), cells("", "", "")] },
    ]);
    await dragCells("f1", [0, 0], [1, 2]);
    await dragFillTo("f1", 3, 2);
    const filled = await grid("f1");
    result.lowFixFillTinyNumbersKept = filled[2][0] === "3e-12" && filled[3][0] === "4e-12";
    result.lowFixFillHexNotNumberSeries = filled[2][1] !== "48" && filled[3][1] !== "64";
    const filledFormula = await raw("f1", 2, 2);
    result.lowFixFillFullWidthFormulaShifts = filledFormula === "=A3+0" && filled[2][2] === "3e-12" && filled[3][2] === "4e-12";
    result.lowFixFillEvidence = { filled, filledFormula };

    // ---- 2. 目盛りの文字は実際の値(12500 → 1.25e+4。0.0011 と 0.0012 は別の文字) ----
    await openLiteral([
      { id: "c1", type: "table", rows: [cells("1", "10000"), cells("2", "17500"), cells("3", "22500")] },
      { id: "g1", type: "chart", text: "plot(A1:A3, B1:B3)" },
      { id: "c2", type: "table", rows: [cells("1", "0.0012"), cells("2", "0.0015")] },
      { id: "g2", type: "chart", text: "plot(A1:A2, B1:B2)" },
    ]);
    const bigTicks = await ticks("g1");
    const smallTicks = await ticks("g2");
    // 目盛りは等間隔なので、文字を数に戻した差がすべて同じ(丸めた文字なら差がばらつく)。
    const evenlySpaced = (labels) => {
      const values = labels.map(Number);
      if (values.length < 3 || values.some((value) => !Number.isFinite(value))) return false;
      const step = values[1] - values[0];
      return values.every((value, index) => index === 0 || Math.abs(value - values[index - 1] - step) <= Math.abs(step) * 1e-9);
    };
    result.lowFixTickExponentExact = ["1.25e+4", "1.75e+4", "2.25e+4"].every((label) => bigTicks.includes(label))
      && bigTicks.includes("1.0e+4") && evenlySpaced(bigTicks);
    result.lowFixTickDecimalExact = new Set(smallTicks).size === smallTicks.length && evenlySpaced(smallTicks);
    result.lowFixTickEvidence = { bigTicks, smallTicks };

    // ---- 3. 全角の式 ----
    await openLiteral([
      { id: "w1", type: "table", rows: [
        cells("1", "＝１＋２", "=A１+1", "＝ SUM（A1:A2）"),
        cells("2", "＝Ａ１＊２", "", ""),
        cells("＝以下同様", "＝Ａ１を参照", "＝A１*2", "＝A１／０"),
      ] },
    ]);
    const wide = await grid("w1");
    result.lowFixFullWidthFormulaEvaluates = wide[0][1] === "3" && wide[0][2] === "2" && wide[0][3] === "3" && wide[1][1] === "2"
      && wide[2][2] === "2" && await isFormulaCell("w1", 0, 1) && await isFormulaCell("w1", 1, 1) && await isFormulaCell("w1", 2, 2);
    // 全角の「＝」で始まっても、式として読めない文(「＝以下同様」)は文字のまま(#ERR にしない)。読めた式の計算のエラー
    // (0 除算)はエラーとして出す。
    result.lowFixFullWidthTextStaysText = wide[2][0] === "＝以下同様" && wide[2][1] === "＝Ａ１を参照"
      && !(await isFormulaCell("w1", 2, 0)) && !(await isFormulaCell("w1", 2, 1));
    result.lowFixFullWidthRuntimeErrorShown = wide[2][3] === "#ERR" && await isFormulaCell("w1", 2, 3);
    // 保存する文字は書き換えない。保存HTMLの表にも計算結果と式の印(doc-formula)が焼き込まれる。
    const savedWide = await save();
    const savedRows = savedWide.model.pages[0].blocks.find((block) => block.id === "w1")?.rows ?? [];
    const savedTable = /<table[\s\S]*?<\/table>/.exec(savedWide.html)?.[0] ?? "";
    result.lowFixFullWidthStoredTextKept = savedRows[0]?.[1]?.text === "＝１＋２" && savedRows[0]?.[2]?.text === "=A１+1"
      && savedRows[1]?.[1]?.text === "＝Ａ１＊２" && savedRows[2]?.[0]?.text === "＝以下同様";
    result.lowFixFullWidthSavedHtmlMarked = /<td class="doc-formula" title="＝１＋２">3<\/td>/.test(savedTable);
    result.lowFixFullWidthTextSavedAsText = /<td>＝以下同様<\/td>/.test(savedTable) && /<td>＝Ａ１を参照<\/td>/.test(savedTable);
    // 行を上に挿入すると、全角の参照も追随する(半角で書き直す)。参照の無い式は元の文字のまま。
    await fresh.locator(sel("w1", 0, 0)).click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#table-toolbar .table-tool[data-tool="row-before"]').click();
    await fresh.waitForTimeout(300);
    const moved = await grid("w1");
    const movedRaw = { b2: await raw("w1", 1, 1), c2: await raw("w1", 1, 2), d2: await raw("w1", 1, 3), b3: await raw("w1", 2, 1),
      b4: await raw("w1", 3, 1), c4: await raw("w1", 3, 2) };
    result.lowFixFullWidthRefsFollowRowInsert = moved[1][1] === "3" && moved[1][2] === "2" && moved[1][3] === "3" && moved[2][1] === "2"
      && movedRaw.b2 === "＝１＋２" && movedRaw.c2 === "=A2+1" && movedRaw.d2 === "= SUM(A2:A3)" && movedRaw.b3 === "=A2*2"
      && movedRaw.c4 === "=A2*2" && moved[3][2] === "2";
    // 文字のままの「＝Ａ１を参照」は、行を挿入しても書き換えない。
    result.lowFixFullWidthTextNotRewritten = movedRaw.b4 === "＝Ａ１を参照" && moved[3][0] === "＝以下同様";
    result.lowFixFullWidthEvidence = { wide, savedRows: savedRows.map((row) => row.map((cell) => cell.text)), moved, movedRaw };
    // クリックで参照を入れる(ポイントモード)も、全角の「＝」「＋」の直後で効く。
    await fresh.locator(sel("w1", 2, 2)).click();
    await fresh.waitForTimeout(200);
    await fresh.evaluate((selector) => {
      const td = document.querySelector(selector);
      td.textContent = "＝";
      td.dispatchEvent(new Event("input", { bubbles: true }));
      const range = document.createRange();
      range.setStart(td.firstChild, 1);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, sel("w1", 2, 2));
    await fresh.locator(sel("w1", 1, 0)).click();
    await fresh.waitForTimeout(200);
    const pointed = await fresh.evaluate((selector) => document.querySelector(selector)?.textContent, sel("w1", 2, 2));
    result.lowFixFullWidthClickInsertsRef = pointed === "＝A2";
    result.lowFixFullWidthClickEvidence = pointed;
  } finally {
    await fresh.close();
  }
  return result;
}
