// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の行・列の入れ替え(v230) ----
// ユーザー指示「表とデータベースの行の入れ替え、列の入れ替え機能」→ 行の左・列の上の取っ手をドラッグして動かす(案に OK)。
// 1つのセルへの式の参照はセルについていく。範囲は「中で動かしたらそのまま、外へ出したら抜ける、真ん中へ入れたら入る」。
// その表を読むグラフの範囲も同じ。列幅・データベースの列の種類も一緒に動く。Ctrl+Z 1回で戻る。見出しの行・列と結合は分けない。
export default async function tableMoveSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1100, height: 800 });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const c = (text, extra = {}) => ({ text, colSpan: 1, rowSpan: 1, ...extra });
  const grid = (lines) => lines.map((line) => line.map((text) => c(text)));
  let opened = 0;
  const openBlocks = async (title, blocks) => {
    const path = join(OUT, "table-move-" + (opened += 1) + ".html");
    const literal = { pages: [{ id: "M" + opened, title, blocks }], fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const cell = (r, k) => fresh.locator('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
  const texts = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table tr')]
    .map((tr) => [...tr.children].map((td) => td.textContent).join(",")).join("/"));
  const formula = (r, k) => fresh.evaluate(([row, col]) => {
    const td = document.querySelector('#blocks .block[data-id="t"] .editor-table [data-row="' + row + '"][data-cell="' + col + '"]');
    return td?.title || null;
  }, [r, k]);
  // 取っ手を (r, k) のセルの行(列)のものから、target のセルの下端(右端)近く/上端(左端)近くまでドラッグする。
  const dragLine = async (axis, r, k, target, edge = "after", { release = true } = {}) => {
    await cell(r, k).click();
    await fresh.waitForTimeout(150);
    const handle = await fresh.locator('#blocks .block[data-id="t"] .table-range-handle.' + (axis === "row" ? "row" : "column")).boundingBox();
    const box = await cell(target[0], target[1]).boundingBox();
    await fresh.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await fresh.mouse.down();
    if (axis === "row") await fresh.mouse.move(handle.x + 3, edge === "after" ? box.y + box.height - 2 : box.y + 2, { steps: 10 });
    else await fresh.mouse.move(edge === "after" ? box.x + box.width - 2 : box.x + 2, handle.y + 3, { steps: 10 });
    await fresh.waitForTimeout(120);
    if (release) {
      await fresh.mouse.up();
      await fresh.waitForTimeout(250);
    }
  };
  let saved = 0;
  const savedChartText = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "table-move-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const doc = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), await readFile(path, "utf8"));
    return doc.pages[0].blocks.find((block) => block.id === "ch")?.text ?? null;
  };
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
  };
  const base = [["品目", "数", "単価"], ["りんご", "3", "100"], ["みかん", "5", "80"], ["ぶどう", "2", "300"], ["合計", "=SUM(B2:B4)", "=B3*C3"]];
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 行を範囲の中で動かす: 1つのセルの参照はついていき、合計の範囲はそのまま。移動先の線が出る。Ctrl+Z 1回で戻る。
    await openBlocks("行の入れ替え", [
      { id: "t", type: "table", tableHeader: true, rows: grid(base) },
      { id: "ch", type: "chart", text: 'table(id="t")\nbar(A2:A4, B2:B4)' },
    ]);
    await dragLine("row", 2, 0, [3, 0], "after", { release: false });
    const indicator = await fresh.evaluate(() => ({
      line: Boolean(document.querySelector('#blocks .block[data-id="t"] .table-move-indicator.row')),
      moving: document.querySelectorAll('#blocks .block[data-id="t"] .table-line-moving').length,
    }));
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    result.tableMoveShowsDropLine = indicator.line && indicator.moving === 3
      && !(await fresh.evaluate(() => document.querySelector(".table-move-indicator")));
    result.tableMoveRowWithinRange = (await texts()) === "品目,数,単価/りんご,3,100/ぶどう,2,300/みかん,5,80/合計,10,400"
      && (await formula(4, 1)) === "=SUM(B2:B4)" && (await formula(4, 2)) === "=B4*C4";
    result.tableMoveChartRangeStaysWithinRange = (await savedChartText()) === 'table(id="t")\nbar(A2:A4, B2:B4)';
    await undo();
    result.tableMoveUndoInOneStep = (await texts()) === "品目,数,単価/りんご,3,100/みかん,5,80/ぶどう,2,300/合計,10,400"
      && (await formula(4, 2)) === "=B3*C3";

    // 2) 行を範囲の外(末尾)へ出す: その行だけ合計から抜ける。
    await dragLine("row", 2, 0, [4, 0], "after");
    result.tableMoveRowOutOfRange = (await texts()) === "品目,数,単価/りんご,3,100/ぶどう,2,300/合計,5,400/みかん,5,80"
      && (await formula(3, 1)) === "=SUM(B2:B3)" && (await formula(3, 2)) === "=B5*C5";
    // その表を読むグラフの範囲も、同じ決まりで動く。
    result.tableMoveChartRangeFollows = (await savedChartText()) === 'table(id="t")\nbar(A2:A3, B2:B3)';

    // 3) 押すだけ(動かさない)なら、今までどおり行を選ぶ。
    await cell(1, 1).click();
    await fresh.waitForTimeout(120);
    await fresh.locator('#blocks .block[data-id="t"] .table-range-handle.row').click();
    await fresh.waitForTimeout(150);
    result.tableMoveClickStillSelects = (await fresh.evaluate(() => document.querySelectorAll('#blocks .block[data-id="t"] .cell-selected').length)) === 3
      && (await texts()).startsWith("品目,数,単価/りんご");

    // 4) Esc でやめると何も動かない。
    await dragLine("row", 1, 0, [3, 0], "after", { release: false });
    await fresh.keyboard.press("Escape");
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    result.tableMoveEscapeCancels = (await texts()) === "品目,数,単価/りんご,3,100/ぶどう,2,300/合計,5,400/みかん,5,80";

    // 5) ヘッダー行は動かせず、ヘッダー行の上にも置けない(知らせる)。
    await dragLine("row", 3, 0, [0, 0], "before");
    const headerText = await fresh.evaluate(() => document.querySelector("#notice")?.textContent || "");
    result.tableMoveKeepsHeaderRow = (await texts()).startsWith("品目,数,単価/") && headerText.includes("ヘッダー行は動かせません");

    // 6) 列を動かす: 式の列の参照がついていく。データベースの列の種類と列幅も一緒に動く。
    await openBlocks("列の入れ替え", [{
      id: "t", type: "table", tableHeader: true, tableColumnWidths: [120, 160, 200],
      database: { headerBefore: true, columns: [{ type: "text" }, { type: "number" }, { type: "select" }] },
      rows: grid([["品目", "数", "状態"], ["りんご", "3", "済"], ["みかん", "5", "未"], ["計", "=SUM(B2:B3)", ""]]),
    }]);
    await dragLine("col", 1, 2, [1, 0], "before");
    const columns = await fresh.evaluate(() => ({
      head: [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table [data-row="0"]')].map((n) => n.textContent + ":" + n.dataset.dbType).join(","),
      widths: [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table col')].map((n) => n.style.width).join(","),
    }));
    result.tableMoveColumnCarriesTypesAndWidths = columns.head === "状態:select,品目:text,数:number" && columns.widths === "200px,120px,160px";
    result.tableMoveColumnRefsFollow = (await formula(3, 2)) === "=SUM(C2:C3)";
    // データベースの1行目(列の名前)は動かせない。
    await dragLine("row", 0, 1, [2, 1], "after");
    result.tableMoveKeepsDatabaseNamesRow = (await texts()).startsWith("状態,品目,数/");

    // 7) 縦に結合したセルのある行は動かさず、結合の途中へも置かない。
    const merged = grid([["A", "B"], ["結合", "1"], ["", "2"], ["x", "3"]]);
    merged[1][0] = c("結合", { rowSpan: 2 });
    merged[2][0] = c("", { covered: true });
    await openBlocks("結合", [{ id: "t", type: "table", rows: merged }]);
    const beforeMerge = await texts();
    await dragLine("row", 3, 1, [1, 1], "after");
    result.tableMoveRespectsMerges = (await texts()) === beforeMerge
      && (await fresh.evaluate(() => document.querySelector("#notice")?.textContent || "")).includes("結合");
    // 8) 長い表: 行を画面の下端まで引いてとどまると自動でスクロールし、画面の外だった位置へ置ける(ほかのドラッグと同じ)。
    //    窓の外で離した(離したイベントを取りこぼした)ときは、動かさずに終える。
    const longRows = [["番号", "値"], ...Array.from({ length: 50 }, (_, index) => ["行" + (index + 1), String(index + 1)])];
    await openBlocks("長い表", [{ id: "t", type: "table", tableHeader: true, rows: grid(longRows) }]);
    await fresh.evaluate(() => window.scrollTo(0, 0));
    await fresh.waitForTimeout(200);
    const visibleAtStart = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table tr')]
      .filter((tr) => tr.getBoundingClientRect().bottom < window.innerHeight).length);
    await cell(2, 0).click();
    await fresh.waitForTimeout(150);
    const longHandle = await fresh.locator('#blocks .block[data-id="t"] .table-range-handle.row').boundingBox();
    const viewport = await fresh.evaluate(() => window.innerHeight);
    await fresh.mouse.move(longHandle.x + longHandle.width / 2, longHandle.y + longHandle.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(longHandle.x + 3, longHandle.y + 60, { steps: 4 });
    await fresh.mouse.move(longHandle.x + 3, viewport - 20, { steps: 6 });
    await fresh.waitForTimeout(1200);
    const scrolled = await fresh.evaluate(() => Math.round(window.scrollY));
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    const movedTo = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table tr')]
      .findIndex((tr) => tr.firstElementChild?.textContent === "行2"));
    const afterUp = await fresh.evaluate(() => Math.round(window.scrollY));
    await fresh.waitForTimeout(300);
    const stillAfterUp = await fresh.evaluate(() => Math.round(window.scrollY));
    result.tableMoveAutoScrollsAtEdge = scrolled > 150 && movedTo >= visibleAtStart && afterUp === stillAfterUp;
    result.tableMoveAutoScrollEvidence = JSON.stringify({ visibleAtStart, scrolled, movedTo, afterUp, stillAfterUp });
    // 窓の外で離したことにする(ボタンの押されていない動き)と、動かさずに終える。
    await fresh.evaluate(() => window.scrollTo(0, 0));
    await cell(3, 0).click();
    await fresh.waitForTimeout(150);
    const before = await texts();
    const lostHandle = await fresh.locator('#blocks .block[data-id="t"] .table-range-handle.row').boundingBox();
    await fresh.evaluate(() => document.addEventListener("pointerdown", (event) => { window.__tableMovePointerId = event.pointerId; }, { capture: true, once: true }));
    await fresh.mouse.move(lostHandle.x + lostHandle.width / 2, lostHandle.y + lostHandle.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(lostHandle.x + 3, lostHandle.y + 80, { steps: 4 });
    // 同じポインタの、ボタンの押されていない動き(= 離したのを取りこぼした)。
    // 位置は元の行から十分に離す(元の行のそばだと、取りこぼしの扱いが無くても「動かさない」結果になり、確かめにならない)。
    await fresh.evaluate((y) => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 30, clientY: y, buttons: 0, pointerId: window.__tableMovePointerId, pointerType: "mouse" })), lostHandle.y + 260);
    await fresh.waitForTimeout(150);
    const lost = await fresh.evaluate(() => Boolean(document.querySelector(".table-move-indicator")));
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    result.tableMoveLostReleaseCancels = !lost && (await texts()) === before;

    result.tableMoveNoPageErrors = pageErrors.length === 0;
    result.tableMovePageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
