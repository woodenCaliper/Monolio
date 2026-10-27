// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表の絞り込みの条件と、列どうしの AND・OR(Issue #180) ----
// 要望「Notion は『数が 10 以上』『文字に〜を含む』などの条件を、複数の列で AND・OR に組める」。
// 列ごとに条件(数: = ≠ > ≥ < ≤ 範囲 / 文字: 含む・含まない・で始まる・で終わる / 日付: この日・より前・より後 / 空・空でない /
// チェックのあり・なし)を付け、列どうしを AND(既定)か OR で組む。隠す値の一覧(v232)はそのまま使え、古い文書の tableFilter は
// そのまま開く。判定は fmt.tableRowFilter の1つで、保存HTMLも同じ行を隠す。隠した行も計算には入る(Issue #109)。
export default async function filterConditionSuite({ browser }) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1200, height: 860 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const c = (text, extra = {}) => ({ text, colSpan: 1, rowSpan: 1, ...extra });
  const grid = (lines) => lines.map((line) => line.map((text) => c(text)));
  let opened = 0;
  // 文書を書き出して開く。build は fmt で作った保存HTMLを書き換える関数(細工した値を入れるため)。
  const openBlocks = async (blocks, build = (html) => html) => {
    const title = "Filter" + (opened += 1);
    const path = join(OUT, "filter-condition-" + opened + ".html");
    const literal = { pages: [{ id: "F" + opened, title, blocks }], fonts: [], attachments: [] };
    const html = build(await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal));
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const sel = (id, r, k) => '#blocks .block[data-id="' + id + '"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]';
  const click = async (id, r, k) => {
    await fresh.locator(sel(id, r, k)).click();
    await fresh.waitForTimeout(150);
  };
  // 見えている行(隠した行は [隠])を「|」と「/」でつないだ文字。
  const texts = (id) => fresh.evaluate((bid) => [...document.querySelectorAll('#blocks .block[data-id="' + bid + '"] .editor-table tr')]
    .map((tr) => (tr.hidden ? "[隠]" : "") + [...tr.children].map((td) => td.textContent).join("|")).join("/"), id);
  const noteOf = (id) => fresh.evaluate((bid) => document.querySelector('#blocks .block[data-id="' + bid + '"] > .block-content')?.dataset.filterNote || "", id);
  const blockOf = (id) => fresh.evaluate((bid) => window.__docEditorTables.filter(bid), id);
  const openFilter = async (id, r, k) => {
    await click(id, r, k);
    await fresh.locator('#table-toolbar [data-tool="filter"]').click();
    await fresh.waitForTimeout(150);
  };
  const opsOf = () => fresh.evaluate(() => [...document.querySelectorAll(".table-filter-op option")].map((option) => option.value || "-").join(","));
  const setCondition = async (op, value = null, value2 = null) => {
    await fresh.locator(".table-filter-op").selectOption(op);
    if (value !== null) await fresh.locator('.table-filter-input[data-key="value"]').fill(value);
    if (value2 !== null) await fresh.locator('.table-filter-input[data-key="value2"]').fill(value2);
  };
  const apply = async () => {
    await fresh.locator('.table-filter-actions [data-key="apply"]').click();
    await fresh.waitForTimeout(250);
  };
  const menuOpen = () => fresh.evaluate(() => Boolean(document.querySelector(".table-filter-panel")));
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
  };
  let saved = 0;
  const saveAndRead = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "filter-condition-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    const doc = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html);
    return { html, path, doc };
  };
  const viewSaved = async (path) => {
    const view = await context.newPage();
    try {
      await view.goto("file:///" + path.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      return await view.evaluate(() => [...document.querySelectorAll("table.doc-table")].map((table) => {
        let next = table.closest(".doc-table-scroll") || table;
        next = next.nextElementSibling;
        return {
          rows: [...table.rows].map((tr) => (tr.hidden || getComputedStyle(tr).display === "none" ? "[隠]" : "") + [...tr.cells].map((td) => td.textContent).join("|")).join("/"),
          note: next?.className === "doc-table-filter-note" ? next.textContent : "",
        };
      }));
    } finally {
      await view.close();
    }
  };

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 判定の部品(fmt): 条件ごとに合う・合わないを、セルの文字で確かめる。日付の読み方。形の整え(古い形はそのまま、
    //    条件だけの列は hide を書かない、読めない条件・値の無い条件は外す、組み合わせは "or" だけ)。
    const unit = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const run = (condition, values) => {
        const test = fmt.tableFilterConditionTest(condition);
        return test ? values.map((value) => (test(value) ? "1" : "0")).join("") : "null";
      };
      const values = ["5", "10", "10.0", "20", "", "abc", "2026-10-24"];
      return {
        eq: run({ op: "eq", value: "10" }, values),
        ne: run({ op: "ne", value: "10" }, values),
        gt: run({ op: "gt", value: "10" }, values),
        ge: run({ op: "ge", value: "10" }, values),
        lt: run({ op: "lt", value: "10" }, values),
        le: run({ op: "le", value: "10" }, values),
        between: run({ op: "between", value: "20", value2: "6" }, values),
        contains: run({ op: "contains", value: "B" }, ["abc", "ABD", "xyz", ""]),
        notContains: run({ op: "notContains", value: "B" }, ["abc", "ABD", "xyz", ""]),
        startsWith: run({ op: "startsWith", value: "ab" }, ["abc", "xab", "AB"]),
        endsWith: run({ op: "endsWith", value: "ab" }, ["abc", "xab", "AB"]),
        textEq: run({ op: "eq", value: "Tokyo" }, ["tokyo", "TOKYO", "Kyoto"]),
        empty: run({ op: "empty" }, ["", "a"]),
        notEmpty: run({ op: "notEmpty" }, ["", "a"]),
        checked: run({ op: "checked" }, ["✓", "", "0", "yes"]),
        unchecked: run({ op: "unchecked" }, ["✓", "", "0", "yes"]),
        dateOn: run({ op: "eq", value: "2026-10-24" }, ["2026/10/24", "2026年10月24日", "2026-10-24 10:00", "2026-10-25", "x"]),
        dateBefore: run({ op: "lt", value: "2026-10-24" }, ["2026-10-23", "2026-10-24", "2026-10-25", ""]),
        dateAfter: run({ op: "gt", value: "2026-10-24" }, ["2026-10-23", "2026-10-24", "2026-10-25", ""]),
        dateBetween: run({ op: "between", value: "2026-01-01", value2: "2026-12-31" }, ["2025-12-31", "2026-06-01", "2027-01-01"]),
        parseDate: [String(fmt.parseTableDateText("2026-02-29")), fmt.parseTableDateText("2024-02-29") !== null, fmt.parseTableDateText("２０２６－１０－２４") === fmt.parseTableDateText("2026-10-24")].join(","),
        oldShape: JSON.stringify(fmt.normalizeTableFilter([{ column: 1, hide: ["B", " B "] }], 3)),
        conditionOnly: JSON.stringify(fmt.normalizeTableFilter([{ column: 2, hide: [], condition: { op: "ge", value: " 3 ", extra: 1 } }], 3)),
        both: JSON.stringify(fmt.normalizeTableFilter([{ column: 0, hide: ["x"], condition: { op: "empty", value: "zz" } }], 3)),
        dropped: JSON.stringify(fmt.normalizeTableFilter([
          { column: 0, condition: { op: "evil", value: "1" } },
          { column: 1, condition: { op: "gt", value: "" } },
          { column: 2, condition: { op: "between", value: "1" } },
          { column: 1, condition: { op: "contains", value: { x: 1 } } },
          { column: 5, condition: { op: "empty" } },
        ], 3)),
        join: [fmt.normalizeTableFilterJoin("or"), fmt.normalizeTableFilterJoin("OR"), fmt.normalizeTableFilterJoin(undefined)].join(","),
      };
    });
    result.filterConditionCompareOps = unit.eq === "0110000" && unit.ne === "1001111" && unit.gt === "0001000" && unit.ge === "0111000"
      && unit.lt === "1000000" && unit.le === "1110000" && unit.between === "0111000";
    result.filterConditionTextOps = unit.contains === "1100" && unit.notContains === "0011" && unit.startsWith === "101" && unit.endsWith === "011"
      && unit.textEq === "110" && unit.empty === "10" && unit.notEmpty === "01" && unit.checked === "1001" && unit.unchecked === "0110";
    result.filterConditionDateOps = unit.dateOn === "11100" && unit.dateBefore === "1000" && unit.dateAfter === "0010" && unit.dateBetween === "010"
      && unit.parseDate === "null,true,true";
    result.filterConditionNormalize = unit.oldShape === '[{"column":1,"hide":["B"]}]'
      && unit.conditionOnly === '[{"column":2,"condition":{"op":"ge","value":"3"}}]'
      && unit.both === '[{"column":0,"hide":["x"],"condition":{"op":"empty"}}]'
      && unit.dropped === "[]" && unit.join === "or,and,and";
    result.filterConditionUnitEvidence = JSON.stringify(unit);

    // 2) ふつうの表の数の列: 条件の一覧は数のもの。「≥ 3」で 1・2 の行が隠れ、「絞り込み中」の一言も合う。隠した行も合計に入る
    //    (隠すのと消すのは別物)。Ctrl+Z 1回で戻る。
    await openBlocks([{ id: "t", type: "table", tableHeader: true, rows: grid([
      ["名", "地域", "点"], ["a", "東京", "1"], ["b", "大阪", "2"], ["c", "東京", "3"], ["d", "京都", "4"], ["e", "大阪", "5"], ["計", "", "=SUM(C2:C6)"],
    ]) }]);
    await openFilter("t", 3, 2);
    const numberOps = await opsOf();
    const kind = await fresh.evaluate(() => document.querySelector(".table-filter-panel")?.dataset.kind);
    await setCondition("ge", "3");
    // 条件の欄が出て高くなっても、メニューは画面の中に収まり、中でスクロールしない(1つ目の画面撮りで、上が切れていた)。
    const menuFits = await fresh.evaluate(() => {
      const menu = document.querySelector(".table-tool-menu");
      const rect = menu.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && menu.scrollHeight <= menu.clientHeight + 1;
    });
    await apply();
    const geRows = await texts("t");
    const geNote = await noteOf("t");
    const geModel = await blockOf("t");
    await undo();
    const geUndo = await texts("t");
    result.filterConditionNumberColumn = kind === "number" && numberOps === "-,eq,ne,gt,ge,lt,le,between,empty,notEmpty"
      && geRows === "名|地域|点/[隠]a|東京|1/[隠]b|大阪|2/c|東京|3/d|京都|4/e|大阪|5/計||15"
      && geNote === "絞り込み中: 6 行のうち 4 行を表示"
      && JSON.stringify(geModel?.tableFilter) === '[{"column":2,"condition":{"op":"ge","value":"3"}}]';
    result.filterConditionHiddenRowsStillCount = geRows.endsWith("計||15");
    result.filterConditionMenuFitsScreen = menuFits;
    result.filterConditionUndoOneStep = geUndo === "名|地域|点/a|東京|1/b|大阪|2/c|東京|3/d|京都|4/e|大阪|5/計||15";
    result.filterConditionNumberEvidence = JSON.stringify({ kind, numberOps, geRows, geNote, geModel, geUndo });

    // 3) 2つの列: 文字の列に「東を含む」(文字の一覧)+ 数の列に「≥ 3」。AND は両方に合う行だけ。OR に切り替えると、どちらかに合う行
    //    (b は「大阪・2」でどちらにも合わないので隠れたまま。「計」は地域が空でも 15 ≥ 3 で見える)。
    //    組み合わせの選び方は、ほかの列に絞り込みがあるときだけ出る。保存HTMLも同じ行を隠し、同じ一言。形は condition と tableFilterJoin。
    await openFilter("t", 3, 2);
    const joinBeforeOther = await fresh.evaluate(() => Boolean(document.querySelector(".table-filter-join")));
    await setCondition("ge", "3");
    await apply();
    await openFilter("t", 3, 1);
    const textOps = await opsOf();
    const joinShown = await fresh.evaluate(() => ({
      join: [...document.querySelectorAll(".table-filter-join input")].map((input) => input.value + (input.checked ? "*" : "")).join(","),
      others: document.querySelector(".table-filter-others")?.textContent || "",
    }));
    await setCondition("contains", "東");
    await apply();
    const andRows = await texts("t");
    const andNote = await noteOf("t");
    await openFilter("t", 3, 1);
    await fresh.locator('.table-filter-join input[value="or"]').check();
    await apply();
    const orRows = await texts("t");
    const orNote = await noteOf("t");
    const orModel = await blockOf("t");
    const orSaved = await saveAndRead();
    const orView = await viewSaved(orSaved.path);
    const savedBlock = orSaved.doc.pages[0].blocks[0];
    result.filterConditionAndAcrossColumns = !joinBeforeOther && textOps === "-,contains,notContains,startsWith,endsWith,eq,ne,empty,notEmpty"
      && joinShown.join === "and*,or" && joinShown.others.includes("C列(≥ 3)")
      && andRows === "名|地域|点/[隠]a|東京|1/[隠]b|大阪|2/c|東京|3/[隠]d|京都|4/[隠]e|大阪|5/[隠]計||15"
      && andNote === "絞り込み中: 6 行のうち 1 行を表示";
    result.filterConditionOrAcrossColumns = orRows === "名|地域|点/a|東京|1/[隠]b|大阪|2/c|東京|3/d|京都|4/e|大阪|5/計||15"
      && orNote === "絞り込み中: 6 行のうち 5 行を表示" && orModel?.tableFilterJoin === "or";
    result.filterConditionSavedHtmlSameRows = orView[0]?.rows === orRows && orView[0]?.note === orNote
      && JSON.stringify(savedBlock.tableFilter) === '[{"column":1,"condition":{"op":"contains","value":"東"}},{"column":2,"condition":{"op":"ge","value":"3"}}]'
      && savedBlock.tableFilterJoin === "or";
    result.filterConditionJoinEvidence = JSON.stringify({ joinBeforeOther, textOps, joinShown, andRows, andNote, orRows, orNote, orModel, view: orView[0], savedFilter: savedBlock.tableFilter, savedJoin: savedBlock.tableFilterJoin });

    // 4) 値の一覧と条件を同じ列で: 「大阪」を外し、かつ「空でない」。この列を解除で、その列だけ外れる。すべて解除で組み合わせも消える。
    await openFilter("t", 3, 1);
    await fresh.locator('.table-filter-join input[value="and"]').check();
    await setCondition("notEmpty");
    await fresh.locator('.table-filter-option input[data-value="大阪"]').click();
    await apply();
    const mixedModel = await blockOf("t");
    const mixedRows = await texts("t");
    await openFilter("t", 3, 1);
    const reopened = await fresh.evaluate(() => ({
      op: document.querySelector(".table-filter-op")?.value,
      hidden: [...document.querySelectorAll(".table-filter-option input[data-value]")].filter((box) => !box.checked).map((box) => box.dataset.value).join(","),
    }));
    await fresh.locator('.table-filter-actions [data-key="clear-column"]').click();
    await fresh.waitForTimeout(250);
    const afterClearColumn = await blockOf("t");
    await openFilter("t", 3, 2);
    await fresh.locator('.table-filter-actions [data-key="clear-all"]').click();
    await fresh.waitForTimeout(250);
    const afterClearAll = await blockOf("t");
    const clearedRows = await texts("t");
    result.filterConditionWithValueList = JSON.stringify(mixedModel?.tableFilter?.[0]) === '{"column":1,"hide":["大阪"],"condition":{"op":"notEmpty"}}'
      && mixedRows === "名|地域|点/[隠]a|東京|1/[隠]b|大阪|2/c|東京|3/d|京都|4/[隠]e|大阪|5/[隠]計||15"
      && reopened.op === "notEmpty" && reopened.hidden === "大阪";
    result.filterConditionClearColumnAndAll = JSON.stringify(afterClearColumn?.tableFilter) === '[{"column":2,"condition":{"op":"ge","value":"3"}}]'
      && !afterClearAll?.tableFilter && !afterClearAll?.tableFilterJoin && !clearedRows.includes("[隠]");
    result.filterConditionClearEvidence = JSON.stringify({ mixedModel, mixedRows, reopened, afterClearColumn, afterClearAll, clearedRows });

    // 5) 値の足りない条件は決めない: 範囲で上限が空 → メニューは開いたまま、欄に印。大小の条件に数でない値 → 同じ。Enter で決まる。
    //    欄の中の Ctrl+Z は欄の文字のもので、文書は戻さない。
    await openFilter("t", 3, 2);
    await setCondition("between", "2", "");
    await apply();
    const missing = await fresh.evaluate(() => ({
      open: Boolean(document.querySelector(".table-filter-panel")),
      error: document.querySelector(".table-filter-error")?.textContent || "",
      invalid: document.querySelector('.table-filter-input[data-key="value2"]')?.getAttribute("aria-invalid"),
    }));
    await setCondition("gt", "abc");
    await apply();
    const notNumber = await fresh.evaluate(() => document.querySelector(".table-filter-error")?.textContent || "");
    const unchanged = await blockOf("t");
    await fresh.locator('.table-filter-input[data-key="value"]').fill("");
    await fresh.locator('.table-filter-input[data-key="value"]').type("4");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(150);
    const afterInputUndo = { model: await blockOf("t"), open: await menuOpen() };
    await fresh.locator('.table-filter-input[data-key="value"]').fill("4");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const enterApplied = { model: await blockOf("t"), open: await menuOpen(), rows: await texts("t") };
    result.filterConditionNeedsValue = missing.open && missing.error === "値を入れてください" && missing.invalid === "true"
      && notNumber === "数か日付を入れてください" && !unchanged?.tableFilter;
    result.filterConditionInputKeysStayInMenu = afterInputUndo.open && !afterInputUndo.model?.tableFilter;
    result.filterConditionEnterApplies = !enterApplied.open && JSON.stringify(enterApplied.model?.tableFilter) === '[{"column":2,"condition":{"op":"gt","value":"4"}}]'
      && enterApplied.rows === "名|地域|点/[隠]a|東京|1/[隠]b|大阪|2/[隠]c|東京|3/[隠]d|京都|4/e|大阪|5/計||15";
    result.filterConditionValidationEvidence = JSON.stringify({ missing, notNumber, unchanged, afterInputUndo, enterApplied });

    // 6) データベース: 列の種類で条件の一覧が変わる(日付・チェック・選択肢は文字の一覧)。日付の「より前」で隠し、保存HTMLも同じ。
    await openBlocks([{
      id: "d", type: "table", tableHeader: true,
      database: { headerBefore: true, columns: [{ type: "text" }, { type: "date" }, { type: "check" }, { type: "select" }] },
      rows: grid([["要求", "期限", "済", "状態"], ["x", "2026-10-01", "✓", "完了"], ["y", "2026-11-15", "", "対応中"], ["z", "2026/12/01", "", "未対応"]]),
    }]);
    await openFilter("d", 1, 1);
    const dateOps = await opsOf();
    const dateInputType = await fresh.evaluate(() => {
      document.querySelector(".table-filter-op").value = "lt";
      document.querySelector(".table-filter-op").dispatchEvent(new Event("change"));
      return document.querySelector('.table-filter-input[data-key="value"]').type;
    });
    await fresh.locator('.table-filter-input[data-key="value"]').fill("2026-11-30");
    await apply();
    const dateRows = await texts("d");
    // チェックのセルは押すと切り替わるので、日付のセルから矢印で移ってから開く。
    const filterFromKeys = async (steps) => {
      await click("d", 1, 1);
      await fresh.keyboard.press("End");
      for (let i = 0; i < steps; i += 1) await fresh.keyboard.press("ArrowRight");
      await fresh.waitForTimeout(150);
      await fresh.locator('#table-toolbar [data-tool="filter"]').click();
      await fresh.waitForTimeout(150);
      const ops = await opsOf();
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(100);
      return ops;
    };
    const checkOps = await filterFromKeys(1);
    const selectOps = await filterFromKeys(2);
    const dbSaved = await saveAndRead();
    const dbView = await viewSaved(dbSaved.path);
    result.filterConditionDbColumnTypes = dateOps === "-,eq,lt,gt,le,ge,between,empty,notEmpty" && dateInputType === "date"
      && checkOps === "-,checked,unchecked" && selectOps === "-,contains,notContains,startsWith,endsWith,eq,ne,empty,notEmpty";
    result.filterConditionDateBefore = dateRows.includes("[隠]z") && !dateRows.includes("[隠]x") && !dateRows.includes("[隠]y")
      && dbView[0]?.note === "絞り込み中: 3 行のうち 2 行を表示" && dbView[0]?.rows.includes("[隠]z");
    result.filterConditionDbEvidence = JSON.stringify({ dateOps, dateInputType, dateRows, checkOps, selectOps, view: dbView[0] });

    // 7) 古い文書(v232 の形)はそのまま開き、同じ行を隠す。細工した値(知らない条件・値が物・組み合わせが "xor"・絞り込みの無い "or")は
    //    開くときに外す。
    await openBlocks([
      { id: "o", type: "table", tableHeader: true, tableFilter: [{ column: 1, hide: ["B"] }], rows: grid([["名", "区分"], ["a", "A"], ["b", "B"]]) },
      { id: "h", type: "table", tableHeader: true, tableFilterJoin: "xor", tableFilter: [{ column: 0, condition: { op: "evil", value: "1" } }, { column: 1, condition: { op: "contains", value: { toString: 1 } }, hide: ["q"] }], rows: grid([["名", "区分"], ["a", "q"], ["b", "r"]]) },
      { id: "j", type: "table", tableFilterJoin: "or", rows: grid([["1", "2"]]) },
      { id: "p", type: "paragraph", text: "x", tableFilterJoin: "or", tableFilter: [{ column: 0, hide: ["x"] }] },
    ]);
    const opened7 = await fresh.evaluate(() => {
      const pick = (id) => {
        const state = window.__docEditorTables.filter(id);
        return state ? { f: state.tableFilter, j: state.tableFilterJoin } : null;
      };
      return { o: pick("o"), h: pick("h"), j: pick("j"), p: pick("p") };
    });
    const oldRows = await texts("o");
    const hostileRows = await texts("h");
    result.filterConditionOldDocumentOpens = JSON.stringify(opened7.o) === '{"f":[{"column":1,"hide":["B"]}],"j":null}' && oldRows === "名|区分/a|A/[隠]b|B";
    result.filterConditionImportSanitized = JSON.stringify(opened7.h) === '{"f":[{"column":1,"hide":["q"]}],"j":null}'
      && JSON.stringify(opened7.j) === '{"f":null,"j":null}' && JSON.stringify(opened7.p) === '{"f":null,"j":null}'
      && hostileRows === "名|区分/[隠]a|q/b|r";
    result.filterConditionImportEvidence = JSON.stringify({ opened7, oldRows, hostileRows });

    result.filterConditionNoPageErrors = pageErrors.length === 0;
    result.filterConditionPageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await context.close();
  }
}
