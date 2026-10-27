// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 大きな表で、操作のたびに表全体を何度もなめない(Issue #203) ----
// 1500 行 × 6 列の表で、次の操作の手間を測る。速さは機械で揺れるので、なるべく「数」(作った要素・測った回数・描いた表の数)で
// 確かめ、秒は 2 乗に戻ったときだけ赤になる緩い上限にする。どれも、見える結果(隠れる行・選んだセル・印・Undo)が前と同じことも確かめる。
//   1) 絞り込み: 隠す決まりを表に当てる回数(以前は1行ごとに当て直し、そのたびに「縦の結合があるか」を全セルで調べ直していた)と、
//      OK を押してから描き終わるまで・絞り込んだ表のセルに1文字打つ時間。隠れる行・表の下の一言・↓の飛び方・保存HTMLは前と同じ
//   2) セル範囲のドラッグ: 終点が同じセルの中で動かしても、印(行番号・つまみ)を作り直さない。選んだセルは前と同じ
//   3) 行の入れ替えのドラッグ: 動かすたびの時間(以前は行ごとに全セルからその行のセルを探していた)
//   4) 全画面の表: 行の見出しは見えている行の分だけ作る。見出しの位置は行に合う
//   5) 全画面の見出しのメニューで5行を挿入・削除: 表を描くのは1回、Ctrl+Z 1回で戻る。描くときセルにリスナーを付けない
//      (セルのイベントは表に1組。以前はセル1つずつに 5〜8 個)。右クリックでセルのフォーカスが外れるので、カーソルは
//      1行だけ挿入したときと同じく最初の新しい行(以前は1行ずつ描き直したので最後の新しい行だった)
//   6) セルを移っても、表の道具の帯のボタンを作り直さない(押した状態は今のセルに合う)
//   7) 見せる高さを決めた表の「N行中 M行」: 描き直しのたびに全部の行の位置を測らない(数は前と同じ)
const ROWS = 1500;
const COLS = 6;
const KINDS = ["甲", "乙", "丙"];

function bigRows() {
  const rows = [Array.from({ length: COLS }, (_, c) => ({ text: "列" + "ABCDEF"[c] }))];
  for (let r = 1; r < ROWS; r += 1) {
    rows.push([
      { text: KINDS[(r - 1) % 3] },
      { text: String(r) },
      { text: "=B" + (r + 1) + "*2" },
      ...Array.from({ length: COLS - 3 }, (_, k) => ({ text: "x" + r + "-" + (k + 3) })),
    ]);
  }
  // (5, 1) は右寄せ(道具の帯の押した状態を確かめる)。
  rows[5][1].align = "right";
  return rows;
}

export default async function bigTableOpsSuite({ browser }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const evidence = {};
  const cellSelector = (r, c) => '#blocks .block[data-id="bt"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
  const frame = () => fresh.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
  const openLiteral = async (extra, name) => {
    const literal = { title: "BigOps", fonts: [], attachments: [], pages: [{ id: "BO", title: "BigOps", blocks: [
      { id: "bt-p", type: "paragraph", text: "表の前の段落" },
      { id: "bt", type: "table", tableHeader: true, rows: bigRows(), ...extra },
      { id: "bt-q", type: "paragraph", text: "表の後の段落" },
    ] }] };
    const source = join(OUT, name);
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction((rows) => document.querySelectorAll("#blocks .editor-table tr").length === rows, ROWS, { timeout: 60000 });
    await fresh.waitForTimeout(300);
  };
  const clickCell = async (r, c) => {
    const td = fresh.locator(cellSelector(r, c));
    await td.scrollIntoViewIfNeeded();
    await td.click();
    await frame();
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await openLiteral({}, "big-table-ops.html");

    // 数える仕掛け: 表を作った数・行(tr)の位置を測った数。
    await fresh.evaluate(() => {
      const probe = { tables: 0, trRects: 0, cellListeners: 0 };
      // セルに直接付けたリスナーの数(セルのイベントは表に1組だけ。Issue #203)。
      const listen = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (...args) {
        if (this.tagName === "TD" || this.tagName === "TH") probe.cellListeners += 1;
        return listen.apply(this, args);
      };
      window.__opsProbe = probe;
      const create = Document.prototype.createElement;
      Document.prototype.createElement = function (name, ...rest) {
        if (String(name).toLowerCase() === "table") probe.tables += 1;
        return create.call(this, name, ...rest);
      };
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        if (this.tagName === "TR") probe.trRects += 1;
        return rect.call(this);
      };
    });

    // ---- 6) 道具の帯はセルを移っても作り直さない ----
    await clickCell(3, 1);
    const toolbarBefore = await fresh.evaluate(() => [...document.querySelectorAll("#table-toolbar .table-tool")].map((node) => node.dataset.tool).join(","));
    await fresh.evaluate(() => {
      window.__toolbarAdded = 0;
      window.__toolbarObserver = new MutationObserver((records) => records.forEach((record) => { window.__toolbarAdded += record.addedNodes.length; }));
      window.__toolbarObserver.observe(document.querySelector("#table-toolbar"), { childList: true, subtree: true });
    });
    await clickCell(5, 1);
    const onRight = await fresh.evaluate(() => {
      const button = document.querySelector('#table-toolbar [data-tool="align-right"]');
      return { pressed: button?.getAttribute("aria-pressed"), on: button?.classList.contains("is-on"), left: document.querySelector('#table-toolbar [data-tool="align-left"]')?.getAttribute("aria-pressed") };
    });
    await clickCell(6, 2);
    const offRight = await fresh.evaluate(() => {
      const button = document.querySelector('#table-toolbar [data-tool="align-right"]');
      return { pressed: button?.getAttribute("aria-pressed"), on: button?.classList.contains("is-on") };
    });
    const toolbarAdded = await fresh.evaluate(() => {
      window.__toolbarObserver.disconnect();
      return window.__toolbarAdded;
    });
    const toolbarAfter = await fresh.evaluate(() => [...document.querySelectorAll("#table-toolbar .table-tool")].map((node) => node.dataset.tool).join(","));
    evidence.toolbar = { toolbarAdded, onRight, offRight, toolbarBefore };
    result.bigOpsToolbarNotRebuiltPerCell = toolbarAdded === 0;
    result.bigOpsToolbarStatesFollowCell = onRight.pressed === "true" && onRight.on === true && onRight.left === "false"
      && offRight.pressed === "false" && offRight.on === false && toolbarAfter === toolbarBefore && toolbarBefore.includes("filter");

    // ---- 2) セル範囲のドラッグ ----
    {
      // 画面の下の端(自動スクロールの帯)へは寄せない。
      const a = await fresh.locator(cellSelector(4, 1)).boundingBox();
      const b = await fresh.locator(cellSelector(7, 3)).boundingBox();
      await fresh.evaluate(() => {
        const probe = { added: 0, moves: 0, syncMs: 0, start: 0 };
        window.__dragProbe = probe;
        probe.observer = new MutationObserver((records) => records.forEach((record) => {
          record.addedNodes.forEach((node) => { if (node.classList?.contains("table-axis-label")) probe.added += 1; });
        }));
        probe.observer.observe(document.querySelector('#blocks .block[data-id="bt"]'), { childList: true });
        window.addEventListener("pointermove", () => { probe.start = performance.now(); }, true);
        window.addEventListener("pointermove", () => { probe.moves += 1; probe.syncMs += performance.now() - probe.start; });
      });
      await fresh.mouse.move(a.x + 10, a.y + a.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(b.x + 10, b.y + b.height / 2, { steps: 4 });
      await frame();
      await fresh.evaluate(() => Object.assign(window.__dragProbe, { added: 0, moves: 0, syncMs: 0 }));
      // 終点のセルの中だけで 20 回動かす(終点は変わらない)。
      for (let i = 0; i < 20; i += 1) await fresh.mouse.move(b.x + 10 + (i % 10) * 3, b.y + 4 + (i % 3) * 3);
      await frame();
      const sameEnd = await fresh.evaluate(() => ({ added: window.__dragProbe.added, moves: window.__dragProbe.moves, syncMs: Math.round(window.__dragProbe.syncMs) }));
      // 終点を変えながら 12 回(下へ1行ずつ、列は D と C を行き来。最後は (13, C))。
      await fresh.evaluate(() => Object.assign(window.__dragProbe, { added: 0, moves: 0, syncMs: 0 }));
      for (let i = 1; i <= 12; i += 1) {
        const box = await fresh.locator(cellSelector(7 + Math.ceil(i / 2), 3 + (i % 2))).boundingBox();
        await fresh.mouse.move(box.x + 10, box.y + box.height / 2);
      }
      await frame();
      const moving = await fresh.evaluate(() => ({ moves: window.__dragProbe.moves, syncMs: Math.round(window.__dragProbe.syncMs) }));
      await fresh.mouse.up();
      await frame();
      const selection = await fresh.evaluate(() => {
        window.__dragProbe.observer.disconnect();
        const row = document.querySelector('#blocks .block[data-id="bt"]');
        return {
          cells: [...row.querySelectorAll(".cell-selected")].map((node) => node.dataset.row + ":" + node.dataset.cell).sort().join(","),
          fill: Boolean(row.querySelector(".table-fill-handle")),
          rowLabels: row.querySelectorAll(".table-axis-label.row").length,
          current: row.querySelector(".table-axis-label.row.is-current")?.textContent ?? null,
        };
      });
      const expected = [];
      for (let r = 4; r <= 13; r += 1) for (let c = 1; c <= 3; c += 1) expected.push(r + ":" + c);
      evidence.rangeDrag = { sameEnd, moving, selection: { ...selection, cells: selection.cells.split(",").length } };
      result.bigOpsRangeDragSameEndIsNoop = sameEnd.added === 0 && sameEnd.moves >= 20;
      result.bigOpsRangeDragFast = moving.moves >= 12 && moving.syncMs / moving.moves < 60 && sameEnd.syncMs / Math.max(1, sameEnd.moves) < 30;
      result.bigOpsRangeDragSelectsSameCells = selection.cells === expected.sort().join(",") && selection.fill && selection.rowLabels === ROWS && selection.current === "5";
    }

    // ---- 3) 行の入れ替えのドラッグ(取っ手を押して動かす) ----
    {
      await clickCell(14, 1);
      const handle = await fresh.locator('#blocks .block[data-id="bt"] .table-range-handle.row').boundingBox();
      const target = await fresh.locator(cellSelector(18, 1)).boundingBox();
      await fresh.evaluate(() => Object.assign(window.__dragProbe, { moves: 0, syncMs: 0 }));
      await fresh.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await fresh.mouse.down();
      for (let i = 1; i <= 8; i += 1) await fresh.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + ((target.y + target.height - 2) - (handle.y + handle.height / 2)) * i / 8);
      const lineDrag = await fresh.evaluate(() => ({ moves: window.__dragProbe.moves, syncMs: Math.round(window.__dragProbe.syncMs), indicator: Boolean(document.querySelector(".table-move-indicator.row")) }));
      await fresh.mouse.up();
      await frame();
      const moved = await fresh.evaluate(() => {
        const text = (r) => document.querySelector('#blocks .block[data-id="bt"] .editor-table [data-row="' + r + '"][data-cell="1"]')?.textContent;
        return [text(14), text(17), text(18)];
      });
      evidence.lineDrag = { ...lineDrag, moved };
      result.bigOpsLineDragFast = lineDrag.moves >= 8 && lineDrag.syncMs / lineDrag.moves < 60;
      // 行 14(番号 14)を 18 行目の後ろへ: 14〜17 は 15〜18 の中身、18 に 14 が来る。
      result.bigOpsLineDragMovesRow = lineDrag.indicator && moved[0] === "15" && moved[1] === "18" && moved[2] === "14";
      await fresh.keyboard.press("Control+z");
      await frame();
    }

    // ---- 1) 絞り込み ----
    {
      await clickCell(2, 0);
      await fresh.locator('#table-toolbar [data-tool="filter"]').click();
      await fresh.locator('.table-filter-panel input[data-value="乙"]').uncheck();
      // 「隠す行を決める決まり」を表に当てた回数(1行だけ見る tableRowFilteredOut も、表ごとに作る tableRowFilter も1回と数える)。
      // 以前は1行ごとに当て直していた(1500 行の表で数千回)。
      await fresh.evaluate(() => {
        const fmt = window.SingleHtmlFormat;
        window.__filterRuns = 0;
        for (const name of ["tableRowFilteredOut", "tableRowFilter"]) {
          const original = fmt[name];
          if (typeof original !== "function") continue;
          fmt[name] = function (...args) {
            window.__filterRuns += 1;
            return original.apply(this, args);
          };
        }
      });
      const applyMs = await fresh.evaluate(async () => {
        const ok = document.querySelector('.table-filter-panel [data-key="apply"]');
        const started = performance.now();
        ok.click();
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        return Math.round(performance.now() - started);
      });
      const state = () => fresh.evaluate(() => {
        const row = document.querySelector('#blocks .block[data-id="bt"]');
        const trs = [...row.querySelectorAll(".editor-table tr")];
        const hidden = trs.map((tr, r) => (tr.hidden ? r : -1)).filter((r) => r >= 0);
        return {
          hidden: hidden.length,
          wrong: hidden.filter((r) => (r - 1) % 3 !== 1).length,
          note: row.querySelector(":scope > .block-content")?.dataset.filterNote ?? null,
        };
      });
      const filtered = await state();
      const applyFilterRuns = await fresh.evaluate(() => window.__filterRuns);
      // 絞り込んだ表のセルに打つ(入力 → 次のフレームの後)。
      await clickCell(4, 3);
      const keyTimes = await fresh.evaluate(async (selector) => {
        const td = document.querySelector(selector);
        td.focus();
        const times = [];
        for (let i = 0; i < 3; i += 1) {
          const t0 = performance.now();
          td.textContent = String(td.textContent) + String(i);
          td.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(i) }));
          await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
          times.push(performance.now() - t0);
        }
        return times;
      }, cellSelector(4, 3));
      const keyMs = Math.round([...keyTimes].sort((p, q) => p - q)[1]);
      const keyFilterRuns = await fresh.evaluate(() => window.__filterRuns) - applyFilterRuns;
      // ↓ で隠れた行を飛ばす(1 → 3 → 4 → 6 → 7 → 9 → 10)。
      await clickCell(1, 1);
      // キーの処理の時間(窓の capture で測り始め、直後の setTimeout まで。セルが伝わりを止めるので bubble では測れない。証拠)。
      await fresh.evaluate(() => {
        const probe = { times: [] };
        window.__keyProbe = probe;
        window.addEventListener("keydown", () => {
          const start = performance.now();
          setTimeout(() => probe.times.push(Math.round(performance.now() - start)), 0);
        }, true);
      });
      for (let i = 0; i < 6; i += 1) await fresh.keyboard.press("ArrowDown");
      await frame();
      const downTimes = await fresh.evaluate(() => window.__keyProbe.times);
      const afterDown = await fresh.evaluate(() => document.activeElement?.dataset?.row + ":" + document.activeElement?.dataset?.cell);
      const after = await state();
      evidence.filter = { applyMs, keyMs, applyFilterRuns, keyFilterRuns, filtered, after, afterDown, downTimes };
      result.bigOpsFilterAppliedOncePerTable = applyFilterRuns < 50 && keyFilterRuns < 50;
      result.bigOpsFilterApplyFast = applyMs < 1500;
      result.bigOpsFilteredKeystrokeFast = keyMs < 250;
      result.bigOpsFilterHidesSameRows = filtered.hidden === 500 && filtered.wrong === 0 && filtered.note === "絞り込み中: 1499 行のうち 999 行を表示"
        && after.hidden === 500 && after.wrong === 0;
      result.bigOpsFilterArrowSkipsHidden = afterDown === "10:1";
      // 絞り込みの押した状態も帯に出る(作り直さずに)。
      result.bigOpsToolbarFilterPressed = await fresh.evaluate(() => document.querySelector('#table-toolbar [data-tool="filter"]')?.getAttribute("aria-pressed") === "true");
      // 保存HTMLでも同じ行を隠す(書き出しとエディタで同じ決まり)。
      const saved = await fresh.evaluate(() => {
        const html = window.SingleHtmlFormat.buildPortableHtml({ title: "t", fonts: [], attachments: [], pages: [{ id: "S", title: "S", blocks: [{
          id: "s", type: "table", tableHeader: true,
          rows: [[{ text: "k" }], [{ text: "甲" }], [{ text: "乙" }], [{ text: "丙" }], [{ text: " 乙 " }]],
          tableFilter: [{ column: 0, hide: ["乙"] }],
        }] }] });
        const parsed = new DOMParser().parseFromString(html, "text/html");
        return [...parsed.querySelectorAll("table tr")].map((tr) => (tr.hasAttribute("hidden") ? "h" : "v") + tr.textContent).join(",");
      });
      evidence.filter.saved = saved;
      result.bigOpsSavedHtmlHidesSameRows = saved === "vk,v甲,h乙,v丙,h 乙 ";
      // 絞り込みを外す(後の確かめのため)。
      await clickCell(1, 0);
      await fresh.locator('#table-toolbar [data-tool="filter"]').click();
      await fresh.locator('.table-filter-panel [data-key="clear-all"]').click();
      await frame();
    }

    // ---- 4) 全画面の表: 行の見出しは見えている行の分だけ ----
    {
      await clickCell(1, 1);
      await fresh.locator('#table-toolbar [data-tool="focus"]').click();
      await fresh.waitForTimeout(300);
      const frameTimes = await fresh.evaluate(async () => {
        const times = [];
        for (let i = 1; i <= 6; i += 1) {
          window.scrollTo(0, i * 4000);
          const t0 = performance.now();
          await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
          times.push(performance.now() - t0);
        }
        return times;
      });
      const sheet = await fresh.evaluate(() => {
        const row = document.querySelector('#blocks .block[data-id="bt"]');
        const headers = [...row.querySelectorAll(".sheet-row-header")];
        const strip = row.querySelector(".sheet-row-strip").getBoundingClientRect();
        const trs = [...row.querySelectorAll(".editor-table tr")];
        // 画面の真ん中の行の見出しが、その行と同じ高さにある。
        const middle = trs.find((tr) => {
          const box = tr.getBoundingClientRect();
          return box.top <= window.innerHeight / 2 && box.bottom >= window.innerHeight / 2;
        });
        const r = trs.indexOf(middle);
        const header = row.querySelector('.sheet-row-header[data-row="' + r + '"]');
        const grip = row.querySelector('.sheet-row-resizer[data-row="' + r + '"]');
        const box = middle.getBoundingClientRect();
        const headerBox = header?.getBoundingClientRect();
        return {
          headers: headers.length,
          grips: row.querySelectorAll(".sheet-row-resizer").length,
          r,
          label: header?.textContent ?? null,
          topGap: headerBox ? Math.abs(headerBox.top - box.top) : null,
          heightGap: headerBox ? Math.abs(headerBox.height - box.height) : null,
          gripGap: grip ? Math.abs(grip.getBoundingClientRect().top - (box.bottom - 4)) : null,
          stripTop: Math.round(strip.top),
        };
      });
      const frameMs = Math.round([...frameTimes].sort((p, q) => p - q)[3]);
      evidence.sheet = { ...sheet, frameMs, frameTimes: frameTimes.map(Math.round) };
      result.bigOpsSheetHeadersOnlyVisibleRows = sheet.headers > 10 && sheet.headers < 300 && sheet.grips === sheet.headers;
      result.bigOpsSheetHeaderMatchesRow = sheet.r > 50 && sheet.label === String(sheet.r + 1) && sheet.topGap < 1.5 && sheet.heightGap < 1.5 && sheet.gripGap < 1.5;
      result.bigOpsSheetScrollFrameFast = frameMs < 200;

      // ---- 5) 見出しのメニューで5行を挿入・削除(描くのは1回、Ctrl+Z 1回で戻る) ----
      await fresh.evaluate(() => window.scrollTo(0, 0));
      await frame();
      await fresh.locator('.sheet-row-header[data-row="10"]').click();
      await fresh.locator('.sheet-row-header[data-row="14"]').click({ modifiers: ["Shift"] });
      await frame();
      await fresh.locator('.sheet-row-header[data-row="12"]').click({ button: "right" });
      await fresh.evaluate(() => { window.__opsProbe.tables = 0; window.__opsProbe.cellListeners = 0; });
      // 押してから処理が終わるまで(証拠。表を描くのはこの中)。
      const insertMs = await fresh.evaluate(() => {
        const started = performance.now();
        document.querySelector('.table-tool-menu [data-key="insert-before"]').click();
        return Math.round(performance.now() - started);
      });
      await frame();
      const inserted = await fresh.evaluate((ms) => {
        const text = (r) => document.querySelector('#blocks .block[data-id="bt"] .editor-table [data-row="' + r + '"][data-cell="1"]')?.textContent;
        return { ms, tables: window.__opsProbe.tables, cellListeners: window.__opsProbe.cellListeners, rows: document.querySelectorAll('#blocks .block[data-id="bt"] .editor-table tr').length, at: [text(9), text(10), text(14), text(15)], active: document.activeElement?.dataset?.row + ":" + document.activeElement?.dataset?.cell, formula: window.__docEditorTables.rows("bt")[15][2].text };
      }, insertMs);
      await fresh.keyboard.press("Control+z");
      await frame();
      const undone = await fresh.evaluate(() => {
        const rows = window.__docEditorTables.rows("bt");
        return { rows: rows.length, b10: rows[10][1].text, c10: rows[10][2].text };
      });
      await fresh.keyboard.press("Control+y");
      await frame();
      const redone = await fresh.evaluate(() => window.__docEditorTables.rows("bt").length);
      await fresh.keyboard.press("Control+z");
      await frame();
      // 削除(10〜14 行目)。
      await fresh.locator('.sheet-row-header[data-row="10"]').click();
      await fresh.locator('.sheet-row-header[data-row="14"]').click({ modifiers: ["Shift"] });
      await fresh.locator('.sheet-row-header[data-row="12"]').click({ button: "right" });
      await fresh.evaluate(() => { window.__opsProbe.tables = 0; window.__opsProbe.cellListeners = 0; });
      await fresh.locator('.table-tool-menu [data-key="delete"]').click();
      await frame();
      const deleted = await fresh.evaluate(() => {
        const rows = window.__docEditorTables.rows("bt");
        return { tables: window.__opsProbe.tables, rows: rows.length, b10: rows[10][1].text, c10: rows[10][2].text };
      });
      await fresh.keyboard.press("Control+z");
      await frame();
      const undoneDelete = await fresh.evaluate(() => {
        const rows = window.__docEditorTables.rows("bt");
        return { rows: rows.length, b10: rows[10][1].text, b14: rows[14][1].text };
      });
      evidence.sheetLines = { inserted, undone, redone, deleted, undoneDelete };
      result.bigOpsInsertLinesRendersOnce = inserted.tables === 1;
      result.bigOpsNoListenerPerCell = inserted.cellListeners === 0;
      result.bigOpsInsertLinesResult = inserted.rows === ROWS + 5 && inserted.at[0] === "9" && inserted.at[1] === "" && inserted.at[2] === "" && inserted.at[3] === "10"
        && inserted.formula === "=B16*2" && inserted.active === "10:0";
      result.bigOpsInsertLinesOneUndo = undone.rows === ROWS && undone.b10 === "10" && undone.c10 === "=B11*2" && redone === ROWS + 5;
      result.bigOpsDeleteLinesRendersOnce = deleted.tables === 1;
      result.bigOpsDeleteLinesResult = deleted.rows === ROWS - 5 && deleted.b10 === "15" && deleted.c10 === "=B11*2"
        && undoneDelete.rows === ROWS && undoneDelete.b10 === "10" && undoneDelete.b14 === "14";
      await fresh.keyboard.press("Escape");
      await fresh.keyboard.press("Escape");
      await frame();
    }

    // ---- 7) 見せる高さを決めた表の「N行中 M行」 ----
    {
      await openLiteral({ viewHeight: 300 }, "big-table-ops-height.html");
      await fresh.locator('#blocks .block-content[data-id="bt-q"]').click();
      await fresh.keyboard.type("a");
      await frame();
      await fresh.evaluate(() => { window.__opsProbe.trRects = 0; });
      // 本文の Undo は描き直す(restoreTableScroll → 数の書き直し)。表のセルは選んでいない(印を作らない)。
      await fresh.keyboard.press("Control+z");
      await frame();
      const height = await fresh.evaluate((rowCount) => {
        const row = document.querySelector('#blocks .block[data-id="bt"]');
        const content = row.querySelector(":scope > .block-content");
        const table = row.querySelector(".editor-table");
        const reads = window.__opsProbe.trRects;
        const top = table.getBoundingClientRect().top;
        const fits = [...table.rows].filter((tr) => !tr.hidden && tr.getBoundingClientRect().bottom - top <= content.clientHeight + 1).length;
        return { reads, text: row.querySelector(".table-height-count")?.textContent ?? null, expected: rowCount + "行中 " + fits + "行", fits };
      }, ROWS);
      evidence.heightCount = height;
      result.bigOpsHeightCountSame = height.text === height.expected && height.fits > 3 && height.fits < 30;
      result.bigOpsHeightCountFewReads = height.reads < 100;
    }
    result.bigOpsNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) evidence.pageErrors = pageErrors.slice(0, 5);
    result.bigOpsEvidence = JSON.stringify(evidence);
  } finally {
    await context.close();
  }
  return result;
}
