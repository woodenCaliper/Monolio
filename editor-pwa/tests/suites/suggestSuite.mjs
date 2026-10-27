// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- 提案(v240。形式 0.8.14) ----
// ユーザー「AIと人間がシームレスにつながって共同作業できるものにしたい」「提案のサイズを…フレキシブルに」「広い範囲で提案されているが、この一部分だけ承認したい」→ 文書に提案(suggestions)を持たせ、本文に差分を重ね、右のパネルの木(提案 → ブロック → 列 → 1か所)の
// どの段でも選んで採用・戻すを決める。本文の上でも、語句・セル・ブロックにマウスを乗せて、表は範囲を選んで決められる。
export default async function suggestSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1440, height: 900 });
  const result = {};
  const errors = [];
  fresh.on("pageerror", (error) => errors.push(error.message));
  let saved = 0;
  let lastSaved = null;
  const openPath = async (path, title) => {
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((value) => document.querySelector("#doc-title")?.textContent === value, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const savedManifest = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "suggest-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    lastSaved = path;
    const html = await readFile(path, "utf8");
    return fresh.evaluate((text) => JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent), html);
  };
  const volts = ["12V", "24V", "5V", "48V"];
  const amps = ["0.5A", "1.2A", "0.1A", "2A"];
  const unitV = (v) => v.replace(/^([\d.]+)V$/, (m, n) => (n.includes(".") ? n : n + ".0") + " V");
  const unitA = (a) => a.replace(/^([\d.]+)A$/, (m, n) => Number(n).toFixed(2) + " A");
  const literal = () => ({ pages: [{ id: "SG", title: "提案の試験", blocks: [
    { id: "p1", type: "paragraph", text: "試験は室温 25℃ で行い、各条件で 3 回測定した。" },
    { id: "p2", type: "paragraph", text: "結果は手書きで記録する。" },
    { id: "t1", type: "table", caption: "試験条件", tableHeader: true, rows: [[{ text: "条件" }, { text: "電圧" }, { text: "電流" }], ...["A", "B", "C", "D"].map((c, i) => [{ text: c }, { text: volts[i] }, { text: amps[i] }])] },
    { id: "p3", type: "paragraph", text: "装置の電源を入れてから測定を始める。" },
  ] }], fonts: [], attachments: [],
  // AI が書いた想定(id も before も書かない)
  suggestions: [
    { author: { name: "Claude", kind: "ai" }, title: "試験の条件を規格に合わせる", reason: "規格に合わせました。", changes: [
      { op: "setText", block: "p1", text: "試験は室温 23±2℃ で行い、各条件で 5 回測定して平均をとった。" },
      { op: "deleteBlock", block: "p2" },
      { op: "insertBlock", after: "t1", item: { type: "paragraph", text: "測定の前に、装置を暖めておく。" } },
    ] },
    { author: { name: "Claude", kind: "ai" }, title: "単位の書き方をそろえる", reason: "単位をそろえました。", changes: [
      ...volts.map((v, i) => ({ op: "setCell", block: "t1", row: i + 1, col: 1, text: unitV(v) })),
      ...amps.map((a, i) => ({ op: "setCell", block: "t1", row: i + 1, col: 2, text: unitA(a) })),
    ] },
  ] });
  const view = () => fresh.evaluate(() => ({
    toggle: document.querySelector("#suggest-toggle")?.hidden ? null : document.querySelector("#suggest-toggle")?.textContent,
    paneOpen: Boolean(document.querySelector("#suggest-pane") && !document.querySelector("#suggest-pane").hidden),
    p1Text: document.querySelector('.block[data-id="p1"] .block-content')?.textContent,
    p1Diff: document.querySelectorAll('.block[data-id="p1"] .sg-del, .block[data-id="p1"] .sg-ins').length,
    p1Editable: document.querySelector('.block[data-id="p1"] .block-content')?.isContentEditable,
    p2Del: Boolean(document.querySelector('.block[data-id="p2"].sg-block-del')),
    ghost: document.querySelector(".block.sg-block-ins .block-content")?.textContent || null,
    cells: document.querySelectorAll(".editor-table .sg-cell").length,
    offCells: document.querySelectorAll(".editor-table .sg-cell.sg-off").length,
    table: [...document.querySelectorAll('.block[data-id="t1"] .editor-table tr')].slice(1).map((tr) => [...tr.children].slice(1).map((td) => (td.classList.contains("sg-cell") ? "?" : "") + td.textContent).join("|")).join(" / "),
  }));
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await openLiteral(literal(), "suggest-open.html");

    // 1) 開くと本文に差分(段落は 25℃→23±2℃・3→5・足す語句の3か所 = 消す印2 + 足す印3)、右に提案のパネル。提案中の段落は打てない
    const opened = await view();
    result.suggestOpenShowsDiffAndPane = opened.paneOpen && opened.toggle === "提案 13" && opened.p1Diff === 5 && opened.p1Editable === false
      && opened.p2Del && opened.ghost === "測定の前に、装置を暖めておく。" && opened.cells === 8;
    // 語句は数・単位の途中で切らない(25℃ → 23±2℃ がひと固まり)
    result.suggestPhrasesKeepNumbersWhole = await fresh.evaluate(() => [...document.querySelectorAll("#suggest-pane .sg-node .sg-label")].some((node) => node.textContent === "25℃ → 23±2℃"));
    result.suggestOpenEvidence = opened;

    // 2) 列 C(電流)のチェックだけ外して「選んだ 4 か所を採用」→ 列 B だけ入る。列 C は提案のまま残る
    const unitSection = fresh.locator("#suggest-pane .sg-section").nth(1);
    await unitSection.locator(".sg-node", { hasText: "列 C" }).locator(".sg-box").click();
    await fresh.waitForTimeout(200);
    const unchecked = await view();
    await unitSection.locator(".sg-actions .sg-btn.ok").click();
    await fresh.waitForTimeout(300);
    const afterColumn = await view();
    result.suggestUncheckedColumnStaysPending = unchecked.offCells === 4
      && afterColumn.table === "12.0 V|?0.5A0.50 A / 24.0 V|?1.2A1.20 A / 5.0 V|?0.1A0.10 A / 48.0 V|?2A2.00 A" && afterColumn.toggle === "提案 9";
    result.suggestColumnEvidence = { unchecked: unchecked.offCells, table: afterColumn.table, toggle: afterColumn.toggle };

    // 3) 本文の表で範囲を選ぶと、その範囲の提案だけ決める帯が出る(列 C の 2〜3 行目を採用)
    const cell = (row, col) => fresh.locator('.block[data-id="t1"] .editor-table [data-row="' + row + '"][data-cell="' + col + '"]');
    await cell(1, 0).click();
    await cell(2, 2).click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(250);
    const bar = await fresh.evaluate(() => document.querySelector(".sg-range-bar")?.textContent || null);
    await fresh.locator(".sg-range-bar .sg-btn.ok").click().catch(() => {});
    await fresh.waitForTimeout(300);
    const afterRange = await view();
    result.suggestRangeBarDecidesSelectedCells = Boolean(bar?.includes("2 か所"))
      && afterRange.table.startsWith("12.0 V|0.50 A / 24.0 V|1.20 A / 5.0 V|?0.1A0.10 A");
    result.suggestRangeEvidence = { bar, table: afterRange.table };

    // 4) 段落の語句を、マウスを乗せて出る帯で1つ採用・1つ戻す(段落の結果は partial になる)
    await fresh.locator('.block[data-id="p1"] .sg-ins').first().hover();
    await fresh.waitForTimeout(150);
    await fresh.locator(".sg-popup .sg-btn.ok").click();
    await fresh.waitForTimeout(300);
    const afterPhrase = await view();
    await fresh.locator('.block[data-id="p1"] .sg-ins').last().hover();
    await fresh.waitForTimeout(150);
    await fresh.locator(".sg-popup .sg-btn.ng").click();
    await fresh.waitForTimeout(300);
    result.suggestPhraseDecidedFromPopup = afterPhrase.p1Text.startsWith("試験は室温 23±2℃ で行い") && afterPhrase.p1Diff === 3;
    const afterReject = await view();

    // 5) Undo で、最後の決め(語句を戻す)が戻る
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await view();
    result.suggestUndoRestoresDecision = afterReject.p1Diff === 2 && undone.p1Diff === 3;
    result.suggestPhraseEvidence = { afterPhrase: afterPhrase.p1Diff, afterReject: afterReject.p1Diff, undone: undone.p1Diff };
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);

    // 6) 「すべて採用」で残りが全部入る(消すブロック・足すブロック・残りのセル・語句)。決め終わるとパネルが閉じる
    await fresh.locator("#suggest-pane .sg-actions .sg-btn.ok", { hasText: "すべて採用" }).click().catch(async () => {
      await fresh.locator("#suggest-pane .sg-section .sg-actions .sg-btn.ok").first().click();
    });
    await fresh.waitForTimeout(300);
    const allDone = await fresh.evaluate(() => ({
      toggleHidden: document.querySelector("#suggest-toggle")?.hidden,
      paneHidden: document.querySelector("#suggest-pane")?.hidden,
      rows: [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.id),
      p1: document.querySelector('.block[data-id="p1"] .block-content')?.textContent,
      p1Editable: document.querySelector('.block[data-id="p1"] .block-content')?.isContentEditable,
    }));
    result.suggestAcceptAllApplies = allDone.toggleHidden && allDone.paneHidden && !allDone.rows.includes("p2")
      && allDone.rows.indexOf("t1") + 1 === allDone.rows.indexOf(allDone.rows.find((id) => !["p1", "t1", "p3"].includes(id)))
      && allDone.p1 === "試験は室温 23±2℃ で行い、各条件で 5 回測定した。" && allDone.p1Editable === true;
    result.suggestAcceptAllEvidence = allDone;

    // 7) 保存すると、決めた結果が提案に残る(提案した側が読める)。前の値(before)は開いた時点の値で埋まる
    const manifest = await savedManifest();
    const textChange = manifest.suggestions?.[0]?.changes?.find((change) => change.op === "setText");
    const cellChanges = manifest.suggestions?.[1]?.changes || [];
    result.suggestSavedWithResults = manifest.formatVersion === FORMAT_VERSION && manifest.suggestions?.length === 2
      && manifest.suggestions.every((suggestion) => suggestion.status === "done")
      && textChange?.result === "partial" && JSON.stringify(textChange.hunkResults) === JSON.stringify(["accepted", "accepted", "rejected"])
      && textChange.before === "試験は室温 25℃ で行い、各条件で 3 回測定した。"
      && cellChanges.length === 8 && cellChanges.every((change) => change.result === "accepted" && typeof change.before === "string");
    result.suggestSavedEvidence = { text: textChange, cells: cellChanges.slice(0, 2) };

    // 7b) 保存したファイルを開き直すと、決め終わった提案は出ない(本文は採用した後のまま)。保存し直しても結果は残る
    const resultFile = lastSaved;
    await openPath(resultFile, "提案の試験");
    const reopened = await view();
    const resaved = await savedManifest();
    result.suggestReopenKeepsDecisions = reopened.toggle === null && !reopened.paneOpen && reopened.p1Diff === 0 && reopened.cells === 0
      && reopened.p1Text === "試験は室温 23±2℃ で行い、各条件で 5 回測定した。" && reopened.p1Editable === true
      && JSON.stringify(resaved.suggestions?.map((suggestion) => suggestion.changes.map((change) => change.result))) === JSON.stringify(manifest.suggestions.map((suggestion) => suggestion.changes.map((change) => change.result)));

    // 7c) 提案の無い文書の manifest には suggestions を書かない(0.8.13 と同じ形)。前の版の形式のファイルもそのまま開ける
    const plain = literal();
    delete plain.suggestions;
    await openLiteral(plain, "suggest-plain.html");
    const plainManifest = await savedManifest();
    result.suggestPlainManifestHasNoSuggestions = !("suggestions" in plainManifest) && plainManifest.pages[0].blocks.length === 4
      && await fresh.evaluate(() => document.querySelector("#suggest-toggle")?.hidden !== false);

    // 7d) 「すべて戻す」: 中身は何も変わらず、結果は rejected で残る
    await openLiteral(literal(), "suggest-reject.html");
    await fresh.locator("#suggest-pane .sg-actions .sg-btn.ng", { hasText: "すべて戻す" }).click();
    await fresh.waitForTimeout(300);
    const rejected = await view();
    const rejectedManifest = await savedManifest();
    result.suggestRejectAllKeepsContent = rejected.toggle === null && rejected.p1Text === "試験は室温 25℃ で行い、各条件で 3 回測定した。"
      && !rejected.ghost && !rejected.p2Del && rejected.table === "12V|0.5A / 24V|1.2A / 5V|0.1A / 48V|2A"
      && rejectedManifest.pages[0].blocks.map((block) => block.id).join(",") === "p1,p2,t1,p3"
      && rejectedManifest.suggestions.every((suggestion) => suggestion.status === "done" && suggestion.changes.every((change) => change.result === "rejected"));
    result.suggestRejectEvidence = { table: rejected.table, ghost: rejected.ghost, toggle: rejected.toggle };

    // 8) 書いた後に元が変わった提案(before と今の値が違う)は「古い」: 採用できず、戻すだけ
    const stale = literal();
    stale.suggestions = [{ author: { name: "佐藤", kind: "human" }, title: "古い提案", changes: [
      { op: "setCell", block: "t1", row: 1, col: 1, before: "11V", text: "11.0 V" },
      { op: "setText", block: "p3", before: "別の文", text: "装置の電源を入れてから、1 分待って測定を始める。" },
    ] }];
    await openLiteral(stale, "suggest-stale.html");
    const staleView = await fresh.evaluate(() => ({
      counts: [...document.querySelectorAll("#suggest-pane .sg-count")].map((node) => node.textContent),
      accept: document.querySelector("#suggest-pane .sg-section .sg-btn.ok")?.disabled,
      cellMarked: document.querySelectorAll(".editor-table .sg-cell").length,
      p3Editable: document.querySelector('.block[data-id="p3"] .block-content')?.isContentEditable,
    }));
    result.suggestStaleCannotBeAccepted = staleView.accept === true && staleView.cellMarked === 0 && staleView.p3Editable === true
      && staleView.counts.filter((text) => text === "古い").length === 2;
    result.suggestStaleEvidence = staleView;

    // 9) 細工した提案(足すブロックの書式に仕込んだスクリプト・図の絵)は、描くときに無害化され、何も動かない
    const hostile = literal();
    hostile.suggestions = [{ author: { name: "x", kind: "tool" }, changes: [
      { op: "insertBlock", after: "p1", item: { type: "paragraph", text: "x", html: 'x<img src="x" onerror="window.__sgXss=1"><b onclick="window.__sgXss=2">b</b>' } },
      { op: "insertBlock", after: "p3", item: { type: "mermaid", text: "graph TD; A-->B", mermaidSvg: "<svg onload=\"window.__sgXss=3\"><script>window.__sgXss=4</script></svg>" } },
      { op: "nonsense", block: "p1" },
      { op: "setCell", block: "t1", row: -1, col: 0, text: "bad" },
    ] }];
    await openLiteral(hostile, "suggest-hostile.html");
    await fresh.waitForTimeout(300);
    result.suggestHostileContentIsInert = await fresh.evaluate(() => window.__sgXss === undefined
      && !document.querySelector(".block.sg-block-ins img, .block.sg-block-ins [onclick], .block.sg-block-ins [onload], .block.sg-block-ins script")
      && document.querySelectorAll(".block.sg-block-ins").length === 2
      && document.querySelector("#suggest-toggle")?.textContent === "提案 2");
    // 足すブロックに書いてあった図の絵(mermaidSvg)は受けない: 保存した提案にも残らない(図はコードから描く。§4.31 の写しを増やさない)
    const hostileManifest = await savedManifest();
    result.suggestInsertItemHasNoPictures = hostileManifest.suggestions?.[0]?.changes?.filter((change) => change.op === "insertBlock").length === 2
      && hostileManifest.suggestions[0].changes.every((change) => !change.item || (!("mermaidSvg" in change.item) && !("chartSvg" in change.item)));

    // 10) 式のセルへの提案: 隣のセルを打って式が計算し直されても、提案の差分(前の式と提案の式)が見えたまま
    await openLiteral({ pages: [{ id: "SF", title: "式の提案", blocks: [
      { id: "tf", type: "table", rows: [[{ text: "x" }, { text: "y" }], [{ text: "2" }, { text: "=A2*2" }]] },
    ] }], fonts: [], attachments: [], suggestions: [{ author: { name: "a", kind: "ai" }, changes: [{ op: "setCell", block: "tf", row: 1, col: 1, text: "=A2*3" }] }] }, "suggest-formula.html");
    const formulaCell = () => fresh.evaluate(() => {
      const td = document.querySelector('.block[data-id="tf"] .editor-table [data-row="1"][data-cell="1"]');
      return { old: td?.querySelector(".sg-old")?.textContent ?? null, now: td?.querySelector(".sg-new")?.textContent ?? null, text: td?.textContent };
    });
    const formulaBefore = await formulaCell();
    await fresh.locator('.block[data-id="tf"] .editor-table [data-row="1"][data-cell="0"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("5");
    await fresh.waitForTimeout(400);
    const formulaAfter = await formulaCell();
    result.suggestFormulaCellKeepsDiff = formulaBefore.old === "=A2*2" && formulaBefore.now === "=A2*3"
      && formulaAfter.old === "=A2*2" && formulaAfter.now === "=A2*3";
    result.suggestFormulaEvidence = { formulaBefore, formulaAfter };
    result.suggestNoPageErrors = errors.length === 0;
    // 証拠は文字で(空の配列は「真偽の配列」として不合格に数えられる)
    result.suggestErrors = errors.slice(0, 3).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
