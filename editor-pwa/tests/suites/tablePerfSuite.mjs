// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT } from "../lib.mjs";

// ---- 表の計算の速さ(v221) ----
// 以前は式の参照を1つ読むたびに表全体を整え直し(tableRows)、セルの計算結果も覚えていなかったので、鎖になった式の
// 100×20 の表を開くのに 30 秒以上、セルに1文字打つたびに表全体の再計算とページの全グラフの描き直しが走っていた。
// いまは「表の計算の通し」の中で行を1回だけ整え、セルの結果を覚える(tableCalc / withTableCalcPass)。
// (a) 正しさ: 鎖・循環・前方参照・列まるごと・結合(別名・#MERGE)の値が、編集・行の挿入削除・Undo の後も期待どおり。
// (b) 速さの見張り: 100×20 の表を開く時間とセルに打つ1文字の時間、縦の鎖の 30×20 を開く時間(以前の 1/6 以下で通る、ゆるい上限)。
// (c) セルに打つと、その表を読むグラフだけを描き直す(ほかの表を読むグラフはそのまま)。
const COL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const cells = (...values) => values.map((value) => (value && typeof value === "object" ? value : { text: value }));

// 大きな式の表 R×C(各行: A〜E は値、途中の列は「左の列 + A」(行の中の鎖)、最後から2列目は行の SUM)。
// cumulative のとき最後の列は上の行からの累計(縦の鎖)、そうでなければ「左 + A」。a2 で A2 の値を差し替えられる。
function bigTableRows(R, C, cumulative) {
  const rows = [cells(...Array.from({ length: C }, (_, c) => "列" + COL[c]))];
  for (let r = 2; r <= R; r += 1) {
    const row = [];
    for (let c = 0; c < C; c += 1) {
      if (c < 5) row.push({ text: String((r * 7 + c * 3) % 97) });
      else if (cumulative && c === C - 1) row.push({ text: r === 2 ? `=${COL[c - 1]}${r}` : `=${COL[c]}${r - 1}+${COL[c - 1]}${r}` });
      else if (c === C - 2) row.push({ text: `=SUM(A${r}:${COL[c - 1]}${r})` });
      else row.push({ text: `=${COL[c - 1]}${r}+A${r}` });
    }
    rows.push(row);
  }
  return rows;
}

function bigTableDoc(R, C, cumulative) {
  return {
    title: "表の速さ", fonts: [], attachments: [],
    pages: [{ id: "P0", title: "表の速さ", blocks: [
      { id: "p1", type: "paragraph", text: "前" },
      { id: "big", type: "table", caption: "大きな表", tableHeader: true, rows: bigTableRows(R, C, cumulative) },
      { id: "last", type: "paragraph", text: "後" },
    ] }],
  };
}

// 最後の列の最後の行の期待値を、アプリと独立にここで計算する(a2 は A2 の値)。
function bigTableLastValue(R, C, cumulative, a2 = null) {
  const memo = new Map();
  const value = (r, c) => {
    const key = r + ":" + c;
    if (memo.has(key)) return memo.get(key);
    let v;
    if (c < 5) v = r === 2 && c === 0 && a2 !== null ? a2 : (r * 7 + c * 3) % 97;
    else if (cumulative && c === C - 1) v = r === 2 ? value(r, c - 1) : value(r - 1, c) + value(r, c - 1);
    else if (c === C - 2) { v = 0; for (let k = 0; k < c; k += 1) v += value(r, k); }
    else v = value(r, c - 1) + value(r, 0);
    memo.set(key, v);
    return v;
  };
  for (let r = 2; r <= R; r += 1) value(r, C - 1);
  return value(R, C - 1);
}

// 正しさの表(9行7列。1行目は見出し)。F6:F7 は縦の結合(写しの F7 は本体と同じ式)。
const CALC_ROWS = [
  cells("x", "acc", "fwd", "cyc", "dep", "m", "note"),
  cells("1", "=A2", "=B9*2", "=D3+1", "=D2+1", "", "=SUM(F:F)"),
  cells("2", "=B2+A3", "=C2+SUM(B:B)", "=D2+1", "=D5+1", "", "=SUM(F6:F8)"),
  cells("3", "=B3+A4", "=AVERAGE(B2:B9)", "=D4", "=E5*2", "", "=B9-C4"),
  cells("4", "=B4+A5", "", "=A2/0", "=A3+B3", "", ""),
  cells("5", "=B5+A6", "", "=#REF+1", "", { text: "=A6*10", colSpan: 1, rowSpan: 2 }, ""),
  cells("6", "=B6+A7", "", "", "", { text: "=A6*10", colSpan: 1, rowSpan: 1, covered: true }, ""),
  cells("7", "=B7+A8", "", "", "", "=F7+1", ""),
  cells("8", "=B8+A9", "", "", "", "=F6+F7", ""),
];
// 画面の値(結合で覆われた位置は null)。
const CALC_INITIAL = [
  ["x", "acc", "fwd", "cyc", "dep", "m", "note"],
  ["1", "1", "72", "#CYCLE", "#CYCLE", "", "#MERGE"],
  ["2", "3", "192", "#CYCLE", "#ERR", "", "101"],
  ["3", "6", "15", "#CYCLE", "10", "", "21"],
  ["4", "10", "", "#ERR", "5", "", ""],
  ["5", "15", "", "#REF", "", "50", ""],
  ["6", "21", "", "", "", null, ""],
  ["7", "28", "", "", "", "51", ""],
  ["8", "36", "", "", "", "#MERGE", ""],
];
// A2 を 10 にした後。
const CALC_EDITED = [
  ["x", "acc", "fwd", "cyc", "dep", "m", "note"],
  ["10", "10", "90", "#CYCLE", "#CYCLE", "", "#MERGE"],
  ["2", "12", "282", "#CYCLE", "#ERR", "", "101"],
  ["3", "15", "24", "#CYCLE", "28", "", "21"],
  ["4", "19", "", "#ERR", "14", "", ""],
  ["5", "24", "", "#REF", "", "50", ""],
  ["6", "30", "", "", "", null, ""],
  ["7", "37", "", "", "", "51", ""],
  ["8", "45", "", "", "", "#MERGE", ""],
];
// さらに 4 行目の下に空の行を挿入した後(式は参照を追随するので、値は同じで行がずれるだけ)。
const CALC_INSERTED = [...CALC_EDITED.slice(0, 4), ["", "", "", "", "", "", ""], ...CALC_EDITED.slice(4)];

export default async function tablePerfSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let fileNo = 0;
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const openLiteral = async (literal) => {
      const html = await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal);
      const path = join(OUT, "table-perf-" + (fileNo += 1) + ".html");
      await writeFile(path, html, "utf8");
      const started = Date.now();
      await fresh.locator("#open-input").setInputFiles(path);
      return started;
    };
    const cellSelector = (id, r, c) => '#blocks .block[data-id="' + id + '"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
    const grid = (id) => fresh.evaluate((blockId) => {
      const table = document.querySelector('#blocks .block[data-id="' + blockId + '"] .editor-table');
      if (!table) return null;
      const out = [];
      table.querySelectorAll("td, th").forEach((node) => {
        const r = Number(node.dataset.row);
        const c = Number(node.dataset.cell);
        out[r] = out[r] || [];
        out[r][c] = node.textContent;
      });
      const width = Math.max(...out.map((row) => row.length));
      return out.map((row) => Array.from({ length: width }, (_, c) => (row[c] === undefined ? null : row[c])));
    }, id);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const setCell = async (id, r, c, text) => {
      await fresh.evaluate(([selector, value]) => {
        const td = document.querySelector(selector);
        td.focus();
        td.textContent = value;
        td.dispatchEvent(new Event("input", { bubbles: true }));
        td.blur();
      }, [cellSelector(id, r, c), text]);
      await fresh.waitForTimeout(80);
    };
    const useTool = async (id, tool, r, c) => {
      await fresh.locator(cellSelector(id, r, c)).click();
      await fresh.waitForTimeout(150);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(250);
    };
    const undo = async () => {
      await fresh.locator('#blocks .block-content[data-id="calc-before"]').click();
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(250);
    };

    // ---- (a) 正しさ ----
    await openLiteral({
      title: "表の計算", fonts: [], attachments: [],
      pages: [{ id: "P0", title: "表の計算", blocks: [
        { id: "calc-before", type: "paragraph", text: "前" },
        { id: "calc", type: "table", caption: "計算", tableHeader: true, rows: CALC_ROWS },
        { id: "calc-after", type: "paragraph", text: "後" },
      ] }],
    });
    await fresh.waitForSelector(cellSelector("calc", 8, 5));
    await fresh.waitForTimeout(200);
    const initial = await grid("calc");
    result.tablePerfInitialValues = same(initial, CALC_INITIAL);
    if (!result.tablePerfInitialValues) result.tablePerfInitialGrid = JSON.stringify(initial);
    // ツールチップは式(#MERGE のときは「式 — 説明」)。表示と同じ計算結果から決める。
    const titles = await fresh.evaluate(([b3, f9]) => [document.querySelector(b3)?.title, document.querySelector(f9)?.title], [cellSelector("calc", 2, 1), cellSelector("calc", 8, 5)]);
    result.tablePerfFormulaTitles = titles[0] === "=B2+A3" && String(titles[1]).startsWith("=F6+F7 — ") && String(titles[1]).includes("同じ結合セルの別名");

    await setCell("calc", 1, 0, "10");
    const edited = await grid("calc");
    result.tablePerfValuesAfterEdit = same(edited, CALC_EDITED);
    if (!result.tablePerfValuesAfterEdit) result.tablePerfEditedGrid = JSON.stringify(edited);

    await useTool("calc", "row-after", 3, 0);
    await fresh.locator('#blocks .block-content[data-id="calc-before"]').click();
    await fresh.waitForTimeout(150);
    const inserted = await grid("calc");
    result.tablePerfValuesAfterInsertRow = same(inserted, CALC_INSERTED);
    if (!result.tablePerfValuesAfterInsertRow) result.tablePerfInsertedGrid = JSON.stringify(inserted);

    await useTool("calc", "row-delete", 4, 0);
    await fresh.locator('#blocks .block-content[data-id="calc-before"]').click();
    await fresh.waitForTimeout(150);
    result.tablePerfValuesAfterDeleteRow = same(await grid("calc"), CALC_EDITED);

    await undo();
    result.tablePerfValuesAfterUndoDelete = same(await grid("calc"), CALC_INSERTED);
    await undo();
    result.tablePerfValuesAfterUndoInsert = same(await grid("calc"), CALC_EDITED);
    await undo();
    result.tablePerfValuesAfterUndoEdit = same(await grid("calc"), CALC_INITIAL);

    // 保存HTMLに焼き込む値も同じ(書き出しも表の計算の通しで、表示とツールチップの計算は1回)。
    {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "table-perf-saved.html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      const saved = await fresh.evaluate((text) => {
        const parsed = new DOMParser().parseFromString(text, "text/html");
        const table = [...parsed.querySelectorAll("table")].find((node) => node.textContent.includes("acc"));
        if (!table) return null;
        return [...table.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("th, td")].map((cell) => ({ text: cell.textContent, title: cell.getAttribute("title") })));
      }, html);
      const expected = CALC_INITIAL.map((row) => row.filter((value) => value !== null));
      result.tablePerfSavedValues = Boolean(saved) && same(saved.map((row) => row.map((cell) => cell.text)), expected);
      result.tablePerfSavedMergeTitle = Boolean(saved) && String(saved[8]?.[5]?.title || "").includes("同じ結合セルの別名");
    }

    // ---- (c) セルに打つと、その表を読むグラフだけを描き直す ----
    await openLiteral({
      title: "グラフ", fonts: [], attachments: [],
      pages: [{ id: "P0", title: "グラフ", blocks: [
        { id: "g-before", type: "paragraph", text: "前" },
        { id: "t1", type: "table", caption: "表1", tableHeader: true, rows: [cells("x", "y", "2y"), cells("1", "4", "=B2*2"), cells("2", "5", "=B3*2"), cells("3", "6", "=B4*2")] },
        { id: "c1", type: "chart", caption: "図1", text: 'table(id="t1")\nbar(A2:A4, C2:C4)' },
        { id: "t2", type: "table", caption: "表2", tableHeader: true, rows: [cells("x", "y"), cells("1", "7"), cells("2", "8"), cells("3", "9")] },
        { id: "c2", type: "chart", caption: "図2", text: 'table(id="t2")\nbar(A2:A4, B2:B4)' },
        { id: "g-after", type: "paragraph", text: "後" },
      ] }],
    });
    await fresh.waitForSelector('#blocks .block[data-id="c2"] .chart-canvas svg');
    await fresh.waitForTimeout(200);
    const chartState = () => fresh.evaluate(() => {
      const one = document.querySelector('#blocks .block[data-id="c1"] .chart-canvas svg');
      const two = document.querySelector('#blocks .block[data-id="c2"] .chart-canvas svg');
      return { one: one?.outerHTML || "", twoSame: Boolean(two && two.dataset.tablePerfMark === "1"), twoExists: Boolean(two) };
    });
    await fresh.evaluate(() => {
      const two = document.querySelector('#blocks .block[data-id="c2"] .chart-canvas svg');
      if (two) two.dataset.tablePerfMark = "1";
    });
    const before = await chartState();
    await fresh.locator(cellSelector("t1", 1, 1)).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("0");
    // 離れずに(blur なしで)次のフレームを待つ。
    await fresh.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const during = await chartState();
    const formulaDuring = await fresh.locator(cellSelector("t1", 1, 2)).textContent();
    result.tablePerfTypingUpdatesFormulaNextFrame = formulaDuring === "80";
    result.tablePerfTypingRedrawsReadingChart = before.one !== "" && during.one !== before.one;
    result.tablePerfTypingKeepsOtherChart = during.twoExists && during.twoSame;
    await fresh.locator('#blocks .block-content[data-id="g-after"]').click();
    await fresh.waitForTimeout(150);

    // ---- (b) 速さの見張り ----
    // 100×20(行の中の鎖と行の SUM)。以前はこの環境で開くのに約 40 秒、1 打ごとに表全体の再計算で数十秒。
    // いまは開くのが 0.1〜0.5 秒、1 打は 50ms 前後。CI の揺れを見込んで、開くのは 3 秒、1 打は 300ms を上限にする。
    const R = 100;
    const C = 20;
    const lastSelector = cellSelector("big", R - 1, C - 1);
    {
      const expectedLast = String(bigTableLastValue(R, C, false));
      const started = await openLiteral(bigTableDoc(R, C, false));
      await fresh.waitForFunction(([selector, value]) => document.querySelector(selector)?.textContent === value, [lastSelector, expectedLast], { timeout: 240000, polling: 50 });
      const openMs = Date.now() - started;
      result.tablePerfBigOpenMs = openMs;
      result.tablePerfBigOpensFast = openMs < 3000;
    }
    // A2 は 2 行目の全部の式が読むセル。打つたびの時間(入力 → 次のフレームの後)の中央値。
    const keyTimes = await fresh.evaluate(async (selector) => {
      const td = document.querySelector(selector);
      td.focus();
      const times = [];
      for (let i = 0; i < 3; i += 1) {
        const t0 = performance.now();
        td.textContent = String(td.textContent) + String(i);
        td.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(i) }));
        await new Promise((resolve) => requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.onmessage = resolve;
          channel.port2.postMessage(0);
        }));
        times.push(performance.now() - t0);
      }
      return times;
    }, cellSelector("big", 1, 0));
    const keyMs = Math.round([...keyTimes].sort((a, b) => a - b)[1]);
    result.tablePerfBigKeyMs = keyMs;
    result.tablePerfBigKeystrokeFast = keyMs < 300;
    // 打った値(14 → 14012)が式に届いている。2 行目の最後の列で確かめる(離れた後)。
    // 遅かったころ(赤確認)は離れるだけで数十秒かかるので、待ちを長めにして結果を記録できるようにする。
    await fresh.locator('#blocks .block-content[data-id="last"]').click({ timeout: 240000 });
    await fresh.waitForTimeout(150);
    result.tablePerfBigValueAfterTyping = (await fresh.locator(cellSelector("big", 1, C - 1)).textContent())
      === String(bigTableLastValue(2, C, false, 14012));

    // 縦の鎖(最後の列が上の行からの累計)の 30×20。結果を覚えないと同じセルを何度も計算し直す形。
    // 以前はこの環境で約 18 秒(100×20 では 10 分を超えた)。いまは 0.1〜0.4 秒。上限 3 秒。
    {
      const RC = 30;
      const chainLast = cellSelector("big", RC - 1, C - 1);
      const expectedLast = String(bigTableLastValue(RC, C, true));
      const started = await openLiteral(bigTableDoc(RC, C, true));
      await fresh.waitForFunction(([selector, value]) => document.querySelector(selector)?.textContent === value, [chainLast, expectedLast], { timeout: 240000, polling: 50 });
      const openMs = Date.now() - started;
      result.tablePerfChainOpenMs = openMs;
      result.tablePerfChainOpensFast = openMs < 3000;
    }
    return result;
  } finally {
    await fresh.close();
  }
}
