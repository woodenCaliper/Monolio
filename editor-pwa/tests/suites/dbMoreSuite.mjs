// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, hasFormatVersion } from "../lib.mjs";

// ---- データベースの列の種類を増やす(Issue #178)・表のグループ分け(Issue #179) ----
// #178: 複数選択・状態(未着手・進行中・完了の組)・URL・メール・電話(読めれば押せる。読めなくても打てる)・ファイル(この文書の添付へのリンク)・
//       作成日時・更新日時(行と一緒に動くセルの文字。行を足したとき・行のほかのセルを変えたときにエディタが書く)。種類ごとに、エディタの見せ方・
//       手伝い・保存HTML・絞り込みの条件・並べ替え・AI 用の写し(セルの文字そのもの)を確かめる。
// #179: 列の値ごとに行をまとめる(表の設定 tableGroupBy)。組の頭に名前と行の数、押すと畳む。見せ方だけ(行の順・式・保存の rows は変わらない。
//       隠すのと消すのは別物)。絞り込みで隠した行はどの組にも出ない。保存HTMLも同じ組(畳んだ組は畳んだまま。CSS だけで開け閉め)。
export default async function dbMoreSuite({ browser }) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1280, height: 900 } });
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
  const grid = (lines) => lines.map((line) => line.map((text) => (Array.isArray(text) ? c(text[0], { link: text[1] }) : c(text))));
  const db = (types) => ({ columns: types.map((type) => ({ type })) });
  let opened = 0;
  // 文書を書き出して開く。files は添付にするファイル([{ id, name, text }])。
  const openBlocks = async (blocks, files = []) => {
    const title = "DbMore" + (opened += 1);
    const path = join(OUT, "db-more-" + opened + ".html");
    const html = await fresh.evaluate(async ({ blocks: list, files: specs, title: name }) => {
      const fmt = window.SingleHtmlFormat;
      const attachments = [];
      for (const spec of specs) attachments.push(await fmt.fileToAttachment(new File([spec.text], spec.name, { type: "text/plain" }), spec.id));
      return fmt.buildPortableHtml({ pages: [{ id: "D" + name, title: name, blocks: list }], fonts: [], attachments });
    }, { blocks, files, title });
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 15000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const sel = (id, r, k) => '#blocks .block[data-id="' + id + '"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]';
  const click = async (id, r, k) => {
    await fresh.locator(sel(id, r, k)).click();
    await fresh.waitForTimeout(150);
  };
  const frame = () => fresh.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)))));
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
  };
  const rowsOf = (id) => fresh.evaluate((bid) => window.__docEditorTables.rows(bid).map((row) => row.map((cell) => cell.text)), id);
  const textOf = (id, r, k) => fresh.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel(id, r, k));
  // 見えている行(組の頭は「▼名前 数」、写しは「(写)」、隠した行は出さない)。
  const shownRows = (id) => fresh.evaluate((bid) => [...document.querySelectorAll('#blocks .block[data-id="' + bid + '"] .editor-table tr')]
    .filter((tr) => !tr.hidden)
    .map((tr) => (tr.classList.contains("table-group-row") ? "▼" + tr.querySelector(".table-group-name").textContent + " " + tr.querySelector(".table-group-count").textContent
      : (tr.classList.contains("table-group-copy") ? "(写)" : "") + tr.cells[0].textContent)).join("/"), id);
  const setClock = (time) => fresh.evaluate((ms) => window.__docEditorTables.setClock(ms), time);
  const clockText = (time) => fresh.evaluate((ms) => window.SingleHtmlFormat.dbTimeText(new Date(ms)), time);
  const setType = async (id, k, type) => {
    const box = await fresh.locator(sel(id, 0, k)).boundingBox();
    await fresh.mouse.click(box.x + 14, box.y + box.height / 2);
    await fresh.waitForTimeout(150);
    await fresh.locator('.db-column-menu [data-db-type="' + type + '"]').click();
    await fresh.waitForTimeout(250);
  };
  const tool = async (key) => {
    await fresh.locator('#table-toolbar [data-tool="' + key + '"]').click();
    await fresh.waitForTimeout(200);
  };
  const menuItem = async (key) => {
    await fresh.locator('.table-tool-menu [data-key="' + key + '"]').click();
    await fresh.waitForTimeout(300);
  };
  let saved = 0;
  const saveAndRead = async () => {
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(150);
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "db-more-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    const doc = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html);
    const manifest = JSON.parse(/<script[^>]*id="document-manifest"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1]);
    return { html, path, doc, manifest };
  };
  const viewSaved = async (path, run) => {
    const view = await context.newPage();
    try {
      await view.goto("file:///" + path.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      return await view.evaluate(run);
    } finally {
      await view.close();
    }
  };

  // 見本の表: 名前・タグ(複数選択)・状態・URL・メール・電話・資料(ファイル)・作成日時・更新日時。
  const TYPES = ["text", "multi", "status", "url", "email", "phone", "file", "created", "edited"];
  const sampleRows = () => grid([
    ["名前", "タグ", "状態", "URL", "メール", "電話", "資料", "作成", "更新"],
    ["設計", "設計, 重要", "進行中", "https://example.com/a", "sato@example.com", "03-1234-5678", ["仕様.txt", "#block-f1"], "2026-10-20 09:00", "2026-10-25 17:40"],
    ["発注", "購買", "未着手", "example.com/parts", "buyer@example", "090-0000-1111", "", "2026-10-21 10:15", "2026-10-21 10:15"],
    ["評価", "設計、試験", "完了", "", "", "+81 3 9999 0000", ["記録.txt", "#block-f2"], "2026-10-18 13:30", "2026-10-24 18:05"],
    ["報告", "", "未着手", "見ていない", "", "内線なし", "", "2026-10-22 08:45", "2026-10-22 08:45"],
    ["改修", "試験", "確認中", "", "", "", "", "2026-10-23 11:00", "2026-10-26 09:20"],
  ]);
  const FILES = [{ id: "att-1", name: "仕様.txt", text: "仕様の中身" }, { id: "att-2", name: "記録.txt", text: "記録の中身" }];
  const attachmentBlocks = [{ id: "f1", type: "attachment", attachmentId: "att-1" }, { id: "f2", type: "attachment", attachmentId: "att-2" }];
  const CLOCK = new Date(2026, 9, 26, 15, 30, 0).getTime();

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 部品(fmt): 名前の区切り・状態の組・URL/メール/電話の行き先・時刻の文字・条件 has/hasNot・組の並び。
    const unit = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const plan = (block, values, hidden = () => false) => {
        const result = fmt.tableGroupPlan(block, (r, k) => values[r][k], hidden);
        return result ? result.groups.map((group) => (group.collapsed ? "-" : "") + (group.key || "∅") + ":" + group.rows.join(",")).join(" ") : "null";
      };
      const has = fmt.tableFilterConditionTest({ op: "has", value: "設計" });
      const hasNot = fmt.tableFilterConditionTest({ op: "hasNot", value: "設計" });
      const values = [["名", "状"], ["a", "完了"], ["b", "未着手"], ["c", ""], ["d", "進行中"], ["e", "保留"], ["f", "Done"]];
      const block = (type, extra = {}) => ({ type: "table", rows: values.map((row) => row.map((text) => ({ text }))), database: { columns: [{ type: "text" }, { type }] }, tableGroupBy: { column: 1 }, ...extra });
      const multiValues = [["名", "タグ"], ["a", "x, y"], ["b", "y"], ["c", ""], ["d", "x"]];
      const multi = { type: "table", rows: multiValues.map((row) => row.map((text) => ({ text }))), database: { columns: [{ type: "text" }, { type: "multi" }] }, tableGroupBy: { column: 1, collapsed: ["y"] } };
      const checkValues = [["名", "済"], ["a", "✓"], ["b", ""], ["c", "✓"]];
      const check = { type: "table", rows: checkValues.map((row) => row.map((text) => ({ text }))), database: { columns: [{ type: "text" }, { type: "check" }] }, tableGroupBy: { column: 1 } };
      const plainValues = [["a", "x"], ["b", "y"], ["c", "x"]];
      const plain = { type: "table", rows: plainValues.map((row) => row.map((text) => ({ text }))), tableGroupBy: { column: 1 } };
      return {
        multiValues: JSON.stringify(fmt.dbMultiValues(" a, b、a ,, c ")),
        status: ["完了", "済", "In Progress", "作業中", "未着手", "保留", ""].map((name) => fmt.dbStatusGroup(name) ?? "-").join(","),
        urls: ["https://example.com/a?b=1", "example.com/parts", "見ていない", "javascript:alert(1)", "ftp://x.y"].map((value) => fmt.dbUrlHref(value) ?? "-").join(" "),
        emails: ["sato@example.com", "buyer@example", "a b@example.com"].map((value) => fmt.dbEmailHref(value) ?? "-").join(" "),
        phones: ["03-1234-5678", "+81 3 9999 0000", "０９０－１２３４", "内線なし", "12"].map((value) => fmt.dbPhoneHref(value) ?? "-").join(" "),
        time: fmt.dbTimeText(new Date(2026, 0, 2, 3, 4, 5)),
        has: ["設計", "設計, 重要", "重要、設計", "設計書", "", "設 計"].map((text) => (has(text) ? "1" : "0")).join("") + "/" + ["設計", "設計書", ""].map((text) => (hasNot(text) ? "1" : "0")).join(""),
        html: {
          multi: fmt.dbCellHtml("multi", "a, b", null),
          status: fmt.dbCellHtml("status", "進行中", null),
          url: fmt.dbCellHtml("url", "example.com", null),
          urlBad: fmt.dbCellHtml("url", "見ていない", null),
          email: fmt.dbCellHtml("email", "a@b.jp", null),
          phone: fmt.dbCellHtml("phone", "03-1234", null),
          time: fmt.dbCellHtml("created", "2026-10-26 15:30", null),
          file: fmt.dbCellHtml("file", "仕様.txt", { link: "#block-f1" }),
          fileMissing: fmt.dbCellHtml("file", "仕様.txt", {}),
        },
        statusPlan: plan(block("status"), values),
        selectPlan: plan(block("select"), values),
        hiddenPlan: plan(block("status"), values, (r) => r === 1 || r === 6),
        multiPlan: plan(multi, multiValues),
        checkPlan: plan(check, checkValues),
        plainPlan: plan(plain, plainValues),
        mergedPlan: plan(block("select", { rows: values.map((row, r) => row.map((text) => ({ text, ...(r === 1 ? { rowSpan: 2 } : {}) }))) }), values),
        normalize: JSON.stringify([
          fmt.normalizeTableGroupBy({ column: 1, collapsed: ["a", 3, "a", " b "] }, 2),
          fmt.normalizeTableGroupBy({ column: 2 }, 2),
          fmt.normalizeTableGroupBy({ column: "x" }, 2),
          fmt.normalizeTableGroupBy([1], 2),
        ]),
        typesKnown: ["multi", "status", "url", "email", "phone", "file", "created", "edited"].every((type) => fmt.DB_COLUMN_TYPES.includes(type)),
      };
    });
    result.dbMoreUnitValues = unit.multiValues === '["a","b","c"]'
      && unit.status === "done,done,doing,doing,todo,todo,-"
      && unit.urls === "https://example.com/a?b=1 https://example.com/parts - - -"
      && unit.emails === "mailto:sato@example.com - -"
      && unit.phones === "tel:0312345678 tel:+81399990000 tel:0901234 - -"
      && unit.time === "2026-01-02 03:04"
      && unit.has === "111000/011";
    result.dbMoreUnitCellHtml = unit.html.multi === '<span class="db-pill db-pill-' + (await fresh.evaluate(() => window.SingleHtmlFormat.dbSelectColor("a"))) + '">a</span> <span class="db-pill db-pill-' + (await fresh.evaluate(() => window.SingleHtmlFormat.dbSelectColor("b"))) + '">b</span>'
      && unit.html.status === '<span class="db-status db-status-doing">進行中</span>'
      && unit.html.url === '<a class="db-link db-url" href="https://example.com" target="_blank" rel="noopener noreferrer">example.com</a>'
      && unit.html.urlBad.startsWith('<span class="db-invalid"') && unit.html.urlBad.endsWith(">見ていない</span>")
      && unit.html.email === '<a class="db-link db-email" href="mailto:a@b.jp">a@b.jp</a>'
      && unit.html.phone === '<a class="db-link db-phone" href="tel:031234">03-1234</a>'
      && unit.html.time === '<span class="db-time">2026-10-26 15:30</span>'
      && unit.html.file === '<a class="db-link db-file" href="#block-f1">仕様.txt</a>'
      && unit.html.fileMissing === '<span class="db-file is-missing">仕様.txt</span>';
    // 組の並び: 状態は 未着手(保留も未着手の組)→進行中→完了(Done も完了の組)、空は最後。ほかは先に出た順。隠す行は入らない。
    // 複数選択は名前ごと(2つの名前の行は両方の組)。チェックは なし→あり。データベースでない表も値ごと。縦の結合がある表は組まない。
    result.dbMoreUnitGroupPlan = unit.statusPlan === "未着手:2 保留:5 進行中:4 完了:1 Done:6 ∅:3"
      && unit.selectPlan === "完了:1 未着手:2 進行中:4 保留:5 Done:6 ∅:3"
      && unit.hiddenPlan === "未着手:2 保留:5 進行中:4 ∅:3"
      && unit.multiPlan === "x:1,4 -y:1,2 ∅:3"
      && unit.checkPlan === "∅:2 ✓:1,3"
      && unit.plainPlan === "x:0,2 y:1"
      && unit.mergedPlan === "null"
      && unit.normalize === '[{"column":1,"collapsed":["a","b"]},null,null,null]'
      && unit.typesKnown;
    result.dbMoreUnitEvidence = JSON.stringify(unit);

    // 2) エディタの見せ方: 複数選択は名前ごとの札、状態は組の色の札、URL・メール・電話は押せるリンク(読めない形は文字のまま波線)、
    //    ファイルは添付へのリンク、作成・更新日時は薄い文字で打てない。
    await openBlocks([{ id: "t", type: "table", tableHeader: true, database: db(TYPES), rows: sampleRows() }, ...attachmentBlocks], FILES);
    const look = await fresh.evaluate(() => {
      const at = (r, k) => document.querySelector('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
      return {
        heads: [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table [data-row="0"]')].map((node) => node.dataset.dbType).join(","),
        pills: [...at(3, 1).querySelectorAll(".db-pill")].map((node) => node.textContent).join("|"),
        status: [1, 2, 3, 5].map((r) => at(r, 2).querySelector(".db-status")?.className.replace("db-status ", "")).join(","),
        urls: [1, 2, 4].map((r) => at(r, 3).querySelector("a")?.getAttribute("href") ?? (at(r, 3).querySelector(".db-invalid") ? "invalid" : "-")).join(" "),
        emails: [1, 2].map((r) => at(r, 4).querySelector("a")?.getAttribute("href") ?? (at(r, 4).querySelector(".db-invalid") ? "invalid" : "-")).join(" "),
        phones: [1, 3, 4].map((r) => at(r, 5).querySelector("a")?.getAttribute("href") ?? (at(r, 5).querySelector(".db-invalid") ? "invalid" : "-")).join(" "),
        file: at(1, 6).querySelector("a.db-file")?.getAttribute("href"),
        time: at(1, 7).querySelector(".db-time")?.textContent,
        timeEditable: at(1, 7).isContentEditable || at(1, 8).isContentEditable,
      };
    });
    result.dbMoreEditorShowsTypes = look.heads === TYPES.join(",") && look.pills === "設計|試験"
      && look.status === "db-status-doing,db-status-todo,db-status-done,db-status-doing"
      && look.urls === "https://example.com/a https://example.com/parts invalid"
      && look.emails === "mailto:sato@example.com invalid"
      && look.phones === "tel:0312345678 tel:+81399990000 invalid"
      && look.file === "#block-f1" && look.time === "2026-10-20 09:00" && look.timeEditable === false;
    result.dbMoreEditorEvidence = JSON.stringify(look);
    // 列の種類のメニューに新しい種類が並ぶ。
    {
      const box = await fresh.locator(sel("t", 0, 0)).boundingBox();
      await fresh.mouse.click(box.x + 14, box.y + box.height / 2);
      await fresh.waitForTimeout(150);
      const menu = await fresh.evaluate(() => [...document.querySelectorAll(".db-column-menu [data-db-type]")].map((node) => node.dataset.dbType).join(","));
      await fresh.keyboard.press("Escape");
      result.dbMoreTypeMenuListsNewTypes = menu === "text,number,date,select,multi,status,check,url,email,phone,link,file,created,edited";
    }

    // 3) 更新日時: 行のほかのセルを打つと、その行の更新日時だけが今の時刻になる(作成日時は変わらない)。Ctrl+Z で前の時刻に戻る。
    await setClock(CLOCK);
    const now = await clockText(CLOCK);
    await click("t", 2, 0);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("X");
    await frame();
    const afterType = await rowsOf("t");
    const shownStamp = await textOf("t", 2, 8);
    await undo();
    await frame();
    const afterUndo = await rowsOf("t");
    result.dbMoreEditedStampsOnEdit = afterType[2][0] === "発注X" && afterType[2][8] === now && afterType[2][7] === "2026-10-21 10:15"
      && afterType[1][8] === "2026-10-25 17:40" && afterType[3][8] === "2026-10-24 18:05" && shownStamp === now
      && afterUndo[2][0] === "発注" && afterUndo[2][8] === "2026-10-21 10:15";
    result.dbMoreEditedEvidence = JSON.stringify({ now, afterType: afterType[2], shownStamp, afterUndo: afterUndo[2] });
    // 手伝い(状態の札)で変えても、チェックの切り替えでも同じ(どの経路でも拾う)。
    await setClock(CLOCK + 60000);
    const later = await clockText(CLOCK + 60000);
    await click("t", 4, 2);
    const statusSections = await fresh.evaluate(() => [...document.querySelectorAll(".db-cell-helper .db-status-section")].map((section) => section.querySelector(".db-status-section-title").textContent + ":" + [...section.querySelectorAll(".db-status")].map((node) => node.textContent).join("|")).join(" "));
    await fresh.locator('.db-cell-helper .db-select-option:has(.db-status-done)').first().click();
    await frame();
    const afterStatus = await rowsOf("t");
    result.dbMoreStatusHelper = statusSections === "未着手:未着手 進行中:進行中|確認中 完了:完了"
      && afterStatus[4][2] === "完了" && afterStatus[4][8] === later && afterStatus[4][7] === "2026-10-22 08:45";
    result.dbMoreStatusHelperEvidence = JSON.stringify({ statusSections, row: afterStatus[4] });
    await undo();

    // 4) 作成日時: 足した行は、作成日時と更新日時が今の時刻になる。行の挿入で式の参照が書き換わる行・並べ替えで動いた行は、更新日時が変わらない。
    await openBlocks([{ id: "s", type: "table", tableHeader: true, database: db(["text", "number", "number", "created", "edited"]), rows: grid([
      ["名", "数", "倍", "作成", "更新"],
      ["b", "2", "=B2*2", "2026-01-01 00:00", "2026-01-01 00:00"],
      ["a", "5", "=B3*2", "2026-01-02 00:00", "2026-01-02 00:00"],
    ]) }]);
    await setClock(CLOCK);
    await click("s", 1, 0);
    await tool("row-before");
    await frame();
    const inserted = await rowsOf("s");
    await click("s", 2, 0);
    await tool("sort");
    await fresh.locator('.table-tool-menu [data-key="asc"]').click();
    await frame();
    const sortedRows = await rowsOf("s");
    result.dbMoreCreatedOnNewRow = inserted.length === 4 && inserted[1][3] === now && inserted[1][4] === now
      && inserted[2][2] === "=B3*2" && inserted[2][4] === "2026-01-01 00:00" && inserted[3][4] === "2026-01-02 00:00";
    result.dbMoreStructureIsNotEdit = sortedRows.slice(1).map((row) => row[0] + ":" + row[4]).join(",") === "a:2026-01-02 00:00,b:2026-01-01 00:00,:" + now;
    result.dbMoreCreatedEvidence = JSON.stringify({ inserted, sortedRows });
    // 列の種類を作成日時にすると、空のセルに今の時刻が入る(文字の入ったセルはそのまま)。Ctrl+Z 1回で戻る。
    await openBlocks([{ id: "u", type: "table", tableHeader: true, database: db(["text", "text"]), rows: grid([["名", "いつ"], ["a", ""], ["b", "前から"]]) }]);
    await setClock(CLOCK);
    await click("u", 1, 0);
    await setType("u", 1, "created");
    const filled = await rowsOf("u");
    await undo();
    const unfilled = await rowsOf("u");
    const typesBack = await fresh.evaluate(() => window.__docEditorTables.columnTypes("u").join(","));
    result.dbMoreTimeColumnFillsEmpty = filled[1][1] === now && filled[2][1] === "前から" && unfilled[1][1] === "" && typesBack === "text,text";

    // 5) 複数選択の手伝い: この列の名前が札で並び、押すと付け外し(1回ずつ Ctrl+Z で戻る)。
    await openBlocks([{ id: "t", type: "table", tableHeader: true, database: db(TYPES), rows: sampleRows() }, ...attachmentBlocks], FILES);
    await click("t", 2, 1);
    const names = await fresh.evaluate(() => [...document.querySelectorAll(".db-cell-helper-multi .db-select-option")].map((node) => (node.classList.contains("is-on") ? "*" : "") + node.textContent).join("|"));
    await fresh.locator('.db-cell-helper-multi .db-select-option:has-text("設計")').click();
    await fresh.waitForTimeout(150);
    const added = (await rowsOf("t"))[2][1];
    await fresh.locator('.db-cell-helper-multi .db-select-option:has-text("購買")').click();
    await fresh.waitForTimeout(150);
    const removed = (await rowsOf("t"))[2][1];
    await undo();
    const undoneOnce = (await rowsOf("t"))[2][1];
    result.dbMoreMultiHelper = names === "設計|重要|*購買|試験" && added === "購買, 設計" && removed === "設計" && undoneOnce === "購買, 設計";
    result.dbMoreMultiHelperEvidence = JSON.stringify({ names, added, removed, undoneOnce });
    await undo();

    // 6) ファイルの手伝い: この文書の添付を並べ、押すとその添付へのリンク(#block-…)と名前になる。Ctrl+クリックでその添付へ移る。
    await click("t", 2, 6);
    const fileOptions = await fresh.evaluate(() => [...document.querySelectorAll(".db-cell-helper-file .db-file-option")].map((node) => node.textContent).join("|"));
    await fresh.locator('.db-cell-helper-file .db-file-option[data-block-id="f2"]').click();
    await fresh.waitForTimeout(150);
    const fileCell = await fresh.evaluate(() => {
      const cell = window.__docEditorTables.rows("t")[2][6];
      return cell.text + "→" + cell.link;
    });
    await click("t", 1, 0);
    await fresh.locator(sel("t", 2, 6) + " a.db-file").click({ modifiers: ["Control"] });
    await fresh.waitForTimeout(300);
    const flashed = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="f2"]')?.classList.contains("ref-flash"));
    result.dbMoreFileHelper = fileOptions === "📎 仕様.txt|📎 記録.txt" && fileCell === "記録.txt→#block-f2" && flashed === true;
    result.dbMoreFileHelperEvidence = JSON.stringify({ fileOptions, fileCell, flashed });

    // 7) 絞り込みの条件は列の種類ごと(複数選択は名前で「含む」、状態は「である」、作成日時は日付の条件)。並べ替えは状態の組の順。
    const opsOf = async (r, k) => {
      await click("t", r, k);
      await tool("filter");
      const ops = await fresh.evaluate(() => [...document.querySelectorAll(".table-filter-op option")].map((option) => option.value || "-").join(","));
      const listed = await fresh.evaluate(() => [...document.querySelectorAll("#table-filter-names option")].map((option) => option.value).join("|"));
      return { ops, listed };
    };
    const multiOps = await opsOf(1, 1);
    await fresh.locator(".table-filter-op").selectOption("has");
    await fresh.locator('.table-filter-input[data-key="value"]').fill("設計");
    await fresh.locator('.table-filter-actions [data-key="apply"]').click();
    await fresh.waitForTimeout(250);
    const multiShown = await shownRows("t");
    await undo();
    const statusOps = await opsOf(1, 2);
    await fresh.keyboard.press("Escape");
    const timeOps = await opsOf(1, 7);
    await fresh.keyboard.press("Escape");
    result.dbMoreFilterOpsByType = multiOps.ops === "-,has,hasNot,empty,notEmpty" && multiOps.listed === "設計|重要|購買|試験"
      && statusOps.ops === "-,eq,ne,empty,notEmpty" && statusOps.listed === "未着手|進行中|完了|確認中"
      && timeOps.ops === "-,eq,lt,gt,le,ge,between,empty,notEmpty"
      && multiShown === "名前/設計/評価";
    result.dbMoreFilterEvidence = JSON.stringify({ multiOps, statusOps, timeOps, multiShown });
    await click("t", 1, 2);
    await tool("sort");
    await fresh.locator('.table-tool-menu [data-key="asc"]').click();
    await frame();
    const byStatus = (await rowsOf("t")).slice(1).map((row) => row[2]).join(",");
    await undo();
    result.dbMoreSortStatusByGroup = byStatus === "未着手,未着手,進行中,確認中,完了";

    // 8) グループ分け: 道具の帯の「グループ」で今の列でまとめる。組の頭に名前と行の数。行の保存の順・式は変わらない。Ctrl+Z 1回で戻る。
    await openBlocks([{ id: "g", type: "table", tableHeader: true, database: db(["text", "status", "number", "multi"]), rows: grid([
      ["名", "状態", "数", "タグ"],
      ["a", "完了", "1", "x, y"],
      ["b", "未着手", "2", "y"],
      ["c", "進行中", "4", ""],
      ["d", "未着手", "8", "x"],
      ["計", "", "=SUM(C2:C5)", ""],
    ]) }]);
    await click("g", 1, 1);
    await tool("group");
    const groupMenu = await fresh.evaluate(() => [...document.querySelectorAll(".table-tool-menu [data-key]")].map((node) => node.dataset.key).join(","));
    await menuItem("group-by");
    const grouped = await shownRows("g");
    const groupedStored = await rowsOf("g");
    const setting = await fresh.evaluate(() => window.__docEditorTables.groupBy("g"));
    const pressed = await fresh.evaluate(() => document.querySelector('#table-toolbar [data-tool="group"]')?.getAttribute("aria-pressed"));
    await undo();
    const ungrouped = await shownRows("g");
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(250);
    result.dbMoreGroupByTool = groupMenu === "group-by" && grouped === "名/▼未着手 2/b/d/▼進行中 1/c/▼完了 1/a/▼(空白) 1/計"
      && groupedStored.slice(1).map((row) => row[0]).join("") === "abcd計" && JSON.stringify(setting) === '{"column":1}' && pressed === "true"
      && ungrouped === "名/a/b/c/d/計" && (await shownRows("g")) === grouped;
    result.dbMoreGroupByToolEvidence = JSON.stringify({ groupMenu, grouped, ungrouped, setting, pressed });
    // 組の頭を押すと畳む(行は隠れるだけ。式は全行で計算したまま)。Ctrl+Z で開く。
    await fresh.locator('#blocks .block[data-id="g"] tr.table-group-row[data-group-key="未着手"] .table-group-toggle').click();
    await fresh.waitForTimeout(250);
    const collapsed = await shownRows("g");
    const sumWhileCollapsed = await textOf("g", 5, 2);
    const collapsedSetting = await fresh.evaluate(() => window.__docEditorTables.groupBy("g"));
    await undo();
    const reopened = await shownRows("g");
    result.dbMoreGroupCollapse = collapsed === "名/▼未着手 2/▼進行中 1/c/▼完了 1/a/▼(空白) 1/計" && sumWhileCollapsed === "15"
      && JSON.stringify(collapsedSetting) === '{"column":1,"collapsed":["未着手"]}' && reopened === grouped;
    result.dbMoreGroupCollapseEvidence = JSON.stringify({ collapsed, sumWhileCollapsed, collapsedSetting, reopened });
    // 上下のキーは見えている並び(組の順)で動く: b → d → c(進行中の組)。Tab の最後は行を足す。
    await click("g", 2, 0);
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(100);
    const down1 = await fresh.evaluate(() => window.__lastFocusedTableCell?.rowIndex);
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(100);
    const down2 = await fresh.evaluate(() => window.__lastFocusedTableCell?.rowIndex);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(100);
    const enter = await fresh.evaluate(() => window.__lastFocusedTableCell?.rowIndex);
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(100);
    const up = await fresh.evaluate(() => window.__lastFocusedTableCell?.rowIndex);
    result.dbMoreGroupKeysFollowDisplay = down1 === 4 && down2 === 3 && enter === 1 && up === 3;
    result.dbMoreGroupKeysEvidence = JSON.stringify({ down1, down2, enter, up });
    // 状態を変えても、打っている間は組が動かない。セルから離れると、新しい組へ移る(描き直す)。
    await click("g", 2, 1);
    await fresh.locator('.db-cell-helper .db-select-option:has(.db-status-done)').first().click();
    await fresh.waitForTimeout(150);
    const whileEditing = await shownRows("g");
    await click("g", 3, 0);
    await frame();
    await fresh.waitForTimeout(100);
    const afterLeave = await shownRows("g");
    const focusAfter = await fresh.evaluate(() => {
      const cell = document.activeElement;
      return cell?.dataset?.row + ":" + cell?.dataset?.cell;
    });
    result.dbMoreGroupMovesOnLeave = whileEditing === grouped && afterLeave === "名/▼未着手 1/d/▼進行中 1/c/▼完了 2/a/b/▼(空白) 1/計" && focusAfter === "3:0";
    result.dbMoreGroupMovesEvidence = JSON.stringify({ whileEditing, afterLeave, focusAfter });
    // 組の中で行を足すと、その組の値が入る(Notion と同じ)。
    await click("g", 4, 0);
    await tool("row-after");
    await frame();
    const addedRow = (await rowsOf("g"))[5];
    result.dbMoreGroupNewRowJoinsGroup = addedRow?.[1] === "未着手" && (await shownRows("g")).startsWith("名/▼未着手 2/d/");
    await undo();
    await undo();
    // 複数選択でまとめると、名前が2つの行は2つの組に出る(2つ目は写し。押すと本物の行へ移る)。
    await click("g", 1, 3);
    await tool("group");
    await menuItem("group-by");
    const byTag = await shownRows("g");
    await fresh.locator('#blocks .block[data-id="g"] tr.table-group-copy [data-copy-row="1"][data-copy-cell="0"]').click();
    await fresh.waitForTimeout(150);
    const copyFocus = await fresh.evaluate(() => document.activeElement?.dataset?.row + ":" + document.activeElement?.dataset?.cell);
    result.dbMoreGroupMultiCopies = byTag === "名/▼x 2/a/d/▼y 2/(写)a/b/▼(空白) 2/c/計" && copyFocus === "1:0";
    result.dbMoreGroupMultiEvidence = JSON.stringify({ byTag, copyFocus });
    // 絞り込みで隠した行は、どの組にも出ない(組の数にも入らない)。
    await click("g", 1, 2);
    await tool("filter");
    await fresh.locator(".table-filter-op").selectOption("lt");
    await fresh.locator('.table-filter-input[data-key="value"]').fill("5");
    await fresh.locator('.table-filter-actions [data-key="apply"]').click();
    await fresh.waitForTimeout(250);
    const filteredGroups = await shownRows("g");
    const filterNote = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="g"] > .block-content')?.dataset.filterNote || "");
    result.dbMoreGroupKeepsFilterHidden = filteredGroups === "名/▼x 1/a/▼y 2/(写)a/b/▼(空白) 1/c" && filterNote.includes("5 行のうち 3 行");
    result.dbMoreGroupFilterEvidence = JSON.stringify({ filteredGroups, filterNote });

    // 9) 保存HTML: 同じ組(組の頭・数・畳んだ組は畳んだまま)。行の rows は保存の順のまま。AI 用の写しに組(derived.groups)。
    await openBlocks([{ id: "g", type: "table", tableHeader: true, database: db(["text", "status", "number", "multi", "check"]), tableGroupBy: { column: 1, collapsed: ["完了"] }, rows: grid([
      ["名", "状態", "数", "タグ", "済"],
      ["a", "完了", "1", "x, y", "✓"],
      ["b", "未着手", "2", "y", ""],
      ["c", "進行中", "4", "", ""],
      ["d", "未着手", "8", "x", "✓"],
    ]) }]);
    const savedGrouped = await saveAndRead();
    const view = await viewSaved(savedGrouped.path, () => {
      const table = document.querySelector("table.doc-table");
      return {
        grouped: table.classList.contains("doc-grouped"),
        shown: [...table.rows].filter((tr) => !tr.hidden && getComputedStyle(tr).display !== "none")
          .map((tr) => (tr.classList.contains("doc-group-head") ? "▼" + tr.querySelector(".doc-group-name").textContent + " " + tr.querySelector(".doc-group-count").textContent : tr.cells[0].textContent)).join("/"),
        status: [...table.querySelectorAll("tr:not(.doc-group-head) .db-status")].map((node) => node.className.replace("db-status ", "")).join(","),
      };
    });
    // 保存HTMLの組の頭を押すと開く(スクリプトなし。CSS の :has)。
    const opened = await viewSaved(savedGrouped.path, async () => {
      document.querySelector('tbody.doc-group:last-of-type .doc-group-toggle').click();
      await new Promise((done) => setTimeout(done, 50));
      return [...document.querySelector("table.doc-table").rows].filter((tr) => getComputedStyle(tr).display !== "none" && !tr.hidden).map((tr) => tr.cells[0].textContent).join("/");
    });
    const savedBlock = savedGrouped.doc.pages[0].blocks.find((block) => block.id === "g");
    const derived = savedGrouped.manifest.pages[0].blocks.find((block) => block.id === "g").derived;
    result.dbMoreSavedHtmlGroups = view.grouped && view.shown === "名/▼未着手 2/b/d/▼進行中 1/c/▼完了 1"
      && opened.endsWith("完了1/a") && view.status === "db-status-todo,db-status-todo,db-status-doing,db-status-done"
      && savedBlock.rows.slice(1).map((row) => row[0].text).join("") === "abcd"
      && JSON.stringify(savedBlock.tableGroupBy) === '{"column":1,"collapsed":["完了"]}'
      && JSON.stringify(derived?.groups) === '[{"value":"未着手","rows":[2,4]},{"value":"進行中","rows":[3]},{"value":"完了","rows":[1],"collapsed":true}]'
      && hasFormatVersion(savedGrouped.html);
    result.dbMoreSavedHtmlEvidence = JSON.stringify({ view, opened, groupBy: savedBlock.tableGroupBy, derived });
    // 保存HTMLの列の種類の見せ方と、AI 用の写し(セルの文字そのもの・列の種類)。
    await openBlocks([{ id: "t", type: "table", tableHeader: true, database: db(TYPES), rows: sampleRows() }, ...attachmentBlocks], FILES);
    const savedTypes = await saveAndRead();
    const typeView = await viewSaved(savedTypes.path, () => {
      const table = document.querySelector("table.doc-table");
      const at = (r, k) => table.rows[r].cells[k];
      return {
        pills: [...at(1, 1).querySelectorAll(".db-pill")].map((node) => node.textContent).join("|"),
        url: at(2, 3).querySelector("a")?.getAttribute("href"),
        invalid: Boolean(at(4, 3).querySelector(".db-invalid")),
        email: at(1, 4).querySelector("a")?.getAttribute("href"),
        phone: at(3, 5).querySelector("a")?.getAttribute("href"),
        file: at(1, 6).querySelector("a.db-file")?.getAttribute("href"),
        fileTarget: Boolean(document.getElementById("block-f1")),
        time: at(1, 8).querySelector(".db-time")?.textContent,
      };
    });
    const manifestTable = savedTypes.manifest.pages[0].blocks.find((block) => block.id === "t");
    result.dbMoreSavedHtmlTypes = typeView.pills === "設計|重要" && typeView.url === "https://example.com/parts" && typeView.invalid
      && typeView.email === "mailto:sato@example.com" && typeView.phone === "tel:+81399990000" && typeView.file === "#block-f1"
      && typeView.fileTarget && typeView.time === "2026-10-25 17:40"
      && manifestTable.database.columns.map((column) => column.type).join(",") === TYPES.join(",")
      && manifestTable.rows[1][1].text === "設計, 重要" && manifestTable.rows[1][6].link === "#block-f1";
    result.dbMoreSavedTypesEvidence = JSON.stringify(typeView);
    // 開き直しても同じ(種類・グループ分け・リンク)。
    const reopenedDoc = savedTypes.doc.pages[0].blocks.find((block) => block.id === "t");
    result.dbMoreRoundTrip = reopenedDoc.database.columns.map((column) => column.type).join(",") === TYPES.join(",")
      && reopenedDoc.rows[3][6].link === "#block-f2";

    // 10) 開くときの無害化: グループ分けの列の数の外・形の違う値・表でないブロックの値は外す。畳んだ組の鍵は文字だけ。
    //     知らない列の種類は文字の列(古い版の Monolio が新しい種類を開いたときと同じ扱い)。
    await openBlocks([
      { id: "x1", type: "table", tableGroupBy: { column: 5 }, rows: grid([["a", "b"]]) },
      { id: "x2", type: "table", tableGroupBy: { column: 1, collapsed: ["k", 7, null, "k"] }, rows: grid([["a", "b"], ["c", "d"]]) },
      { id: "x3", type: "table", tableGroupBy: "1", rows: grid([["a", "b"]]) },
      { id: "x4", type: "paragraph", text: "段落", tableGroupBy: { column: 0 } },
      { id: "x5", type: "table", tableHeader: true, database: db(["text", "futureType"]), rows: grid([["a", "b"], ["1", "2"]]) },
    ]);
    const sanitized = await fresh.evaluate(() => {
      const copy = window.__docEditorPages.documentCopy().pages[0].blocks;
      const pick = (id) => JSON.stringify(copy.find((block) => block.id === id)?.tableGroupBy ?? null);
      return { x1: pick("x1"), x2: pick("x2"), x3: pick("x3"), x4: pick("x4"), x5: window.__docEditorTables.columnTypes("x5").join(",") };
    });
    result.dbMoreImportSanitized = sanitized.x1 === "null" && sanitized.x2 === '{"column":1,"collapsed":["k"]}' && sanitized.x3 === "null"
      && sanitized.x4 === "null" && sanitized.x5 === "text,text";
    result.dbMoreImportEvidence = JSON.stringify(sanitized);

    // 11) データベースでない表もまとめられる(表の機能。ユーザー指示「表はデータベースのすべてができる」)。
    await openBlocks([{ id: "p", type: "table", tableHeader: true, tableGroupBy: { column: 1 }, rows: grid([["名", "区分"], ["a", "x"], ["b", "y"], ["c", "x"]]) }]);
    result.dbMorePlainTableGroups = (await shownRows("p")) === "名/▼x 2/a/c/▼y 1/b";

    // 12) 1000 行のまとめた表: 開く・組の頭を押す・値を変えて離れる(組み直し)が、行数の2乗にならない(緩い上限。機械で揺れるため)。
    const ROWS = 1000;
    const bigRows = [["名", "状態", "数"], ...Array.from({ length: ROWS - 1 }, (_, r) => ["行" + (r + 1), ["未着手", "進行中", "完了"][r % 3], String(r)])];
    let started = Date.now();
    await openBlocks([{ id: "big", type: "table", tableHeader: true, database: db(["text", "status", "number"]), tableGroupBy: { column: 1 }, rows: grid(bigRows) }]);
    await fresh.waitForFunction(() => document.querySelectorAll('#blocks .block[data-id="big"] .editor-table tr').length > 900, null, { timeout: 30000 });
    const openMs = Date.now() - started;
    const bigShape = await shownRows("big").then((text) => text.split("/").filter((part) => part.startsWith("▼")).join(","));
    started = Date.now();
    await fresh.locator('#blocks .block[data-id="big"] tr.table-group-row[data-group-key="進行中"] .table-group-toggle').click();
    await fresh.waitForFunction(() => document.querySelector('#blocks .block[data-id="big"] tr.table-group-row[data-group-key="進行中"] .table-group-toggle')?.getAttribute("aria-expanded") === "false", null, { timeout: 30000 });
    await frame();
    const collapseMs = Date.now() - started;
    await click("big", 1, 1);
    await fresh.locator('.db-cell-helper .db-select-option:has(.db-status-done)').first().click();
    started = Date.now();
    await click("big", 3, 0);
    await fresh.waitForFunction(() => document.querySelector('#blocks .block[data-id="big"] tr.table-group-row[data-group-key="完了"] .table-group-count')?.textContent === "334", null, { timeout: 30000 }).catch(() => {});
    await frame();
    const regroupMs = Date.now() - started;
    const bigAfter = await shownRows("big").then((text) => text.split("/").filter((part) => part.startsWith("▼")).join(","));
    result.dbMoreBigGroupedTableIsFast = openMs < 8000 && collapseMs < 3000 && regroupMs < 3000;
    result.dbMoreBigGroupedTableShape = bigShape === "▼未着手 333,▼進行中 333,▼完了 333" && bigAfter === "▼未着手 332,▼進行中 333,▼完了 334";
    result.dbMoreBigEvidence = JSON.stringify({ openMs, collapseMs, regroupMs, bigShape, bigAfter });

    await setClock(null);
    result.dbMoreNoPageErrors = pageErrors.length === 0;
    result.dbMorePageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await context.close();
  }
}
