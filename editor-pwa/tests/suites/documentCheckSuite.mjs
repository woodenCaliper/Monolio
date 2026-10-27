// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 文書チェック(Issue #236) ----
// File メニュー・コマンドパレットの「文書をチェック」で、全ページ(見ていないページ・閉じたトグルの中も)から次を集めて右のパネルに出す:
//   参照の印の行き先なし(消した・ゴミ箱・題名を外した)・ブロックへのリンク・ページへのリンク(ページのブロック・表のリンクのセル)、
//   表の式のエラー(#ERR・#CYCLE・#REF。セルに出るのと同じ判定)、グラフの定義・データの誤り、図(Mermaid)の文法の誤り
//   (前に描けた図が残っていても、いまのコードが誤りなら出す)、数式(ブロック・文中)の変換の失敗。
// 次を見る: 正常な文書は「問題なし」(問題なし・問題あり・確かめられなかったの区別)、項目を選ぶとその場所へ移る(別のページ・
// 閉じたトグルの中・表のセル)、直して再チェックすると消える、チェックで文書が変わらない(画面の値と保存の結果が前後で同じ)、
// 判定は既存の1か所を使う(表の式のエラーはセルの表示と同じ窓口)、配る場所の全部に新しいファイルが入っている。1280px と 800px。
const cells = (...values) => values.map((text) => ({ text }));

const HEALTHY = { fonts: [], attachments: [], pages: [
  { id: "H1", title: "正常な文書", blocks: [
    { id: "hh", type: "heading1", text: "測定" },
    { id: "hp", type: "paragraph", text: "表1 を見る", html: '<span class="figure-ref" data-ref="ht">表1</span> を見る。$$x$$', },
    { id: "ht", type: "table", text: "", caption: "測定値", rows: [cells("項目", "値"), cells("a", "2"), cells("b", "3"), cells("合計", "=SUM(B2:B3)")] },
    { id: "hc", type: "chart", text: "bar(A2:A3, B2:B3)" },
    { id: "hm", type: "math", text: "E = mc^2" },
    { id: "hd", type: "mermaid", text: "flowchart LR\n  A[開始] --> B[終了]" },
    { id: "hl", type: "page", pageId: "H2", text: "" },
  ] },
  { id: "H2", title: "付録", blocks: [{ id: "h2p", type: "paragraph", text: "付録の本文" }] },
] };

const BROKEN = { fonts: [], attachments: [], pages: [
  { id: "P1", title: "表紙", blocks: [
    { id: "p1h", type: "heading1", text: "はじめに" },
    { id: "p1p", type: "paragraph", text: "問題は別のページにあります" },
    { id: "p1l", type: "page", pageId: "P2", text: "" },
  ] },
  { id: "P2", title: "問題のあるページ", blocks: [
    { id: "rh", type: "heading1", text: "参照" },
    { id: "r1", type: "paragraph", text: "参照先なし", html: '<span class="figure-ref" data-ref="gone1">表9</span> を見る' },
    { id: "r2", type: "paragraph", text: "x", html: '<span class="figure-ref" data-ref="gone2" data-ref-kind="block">x</span>' },
    { id: "r3", type: "paragraph", text: "y", html: '<span class="figure-ref" data-ref="T1">ゴミ箱のページ</span>' },
    { id: "r6", type: "paragraph", text: "題名なしの表を見る", html: '<span class="figure-ref" data-ref="nt">表</span>' },
    { id: "nt", type: "table", text: "", rows: [cells("x", "1")] },
    { id: "tg", type: "toggle", text: "閉じたトグル", open: false },
    { id: "r4", type: "paragraph", indent: 1, text: "中の参照", html: '中の参照 <span class="figure-ref" data-ref="gone3">図9</span>' },
    { id: "pg", type: "page", pageId: "P404", text: "" },
    { id: "ab", type: "attachment", attachmentId: "att-missing", text: "" },
    { id: "th", type: "heading1", text: "計算" },
    { id: "tb", type: "table", text: "", caption: "壊れた表", rows: [
      cells("名前", "値", "式"),
      [{ text: "a" }, { text: "1" }, { text: "=B2+" }],
      [{ text: "b" }, { text: "=B3" }, { text: "=#REF+1" }],
      [{ text: "c", link: "#page-P404" }, { text: "=1/0" }, { text: "x", link: "#block-nothere" }],
    ] },
    { id: "gh", type: "heading1", text: "図" },
    { id: "cb", type: "chart", text: "bar(A2:A4, B2:B4)\nwhatever()" },
    { id: "cm", type: "chart", text: 'table(id="nosuch")\nbar(A1:A2, B1:B2)' },
    { id: "mb", type: "math", text: "\\frac{1}{" },
    { id: "im", type: "paragraph", text: "文中", html: '文中 <span class="inline-math" data-tex="\\frac{a"></span>' },
    { id: "dm", type: "mermaid", text: "graph TD\n  A[開始 --> B", mermaidSvg: "" },
  ] },
], trash: [{ id: "tr1", deletedAt: "2026-10-01T00:00:00.000Z", page: { id: "T1", title: "消したページ", blocks: [{ id: "t1p", type: "paragraph", text: "消した" }] } }] };

export default async function documentCheckSuite({ browser, context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error)));
  const result = {};
  const evidence = {};
  let fileIndex = 0;

  const openDoc = async (literal, name, title) => {
    const source = join(OUT, name);
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction((want) => document.querySelector("#doc-title")?.textContent === want, title, { timeout: 8000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  // File メニューの「文書をチェック…」を押して、調べ終わる(調べている途中の見出しが消える)まで待つ。
  const runCheck = async () => {
    await openMenu(fresh, "file");
    await fresh.locator("#menu-check-document").click();
    await fresh.waitForFunction(() => {
      const summary = document.querySelector("#check-pane .ck-summary");
      return summary && !summary.classList.contains("ck-checking");
    }, null, { timeout: 30000 }).catch(() => {});
  };
  const paneState = () => fresh.evaluate(() => {
    const pane = document.querySelector("#check-pane");
    if (!pane) return null;
    const box = pane.getBoundingClientRect();
    return {
      shown: !pane.hidden && box.width > 0,
      status: [...pane.querySelector(".ck-summary")?.classList || []].find((name) => name.startsWith("ck-") && name !== "ck-summary") || "",
      title: pane.querySelector(".ck-summary-title")?.textContent || "",
      stale: !pane.querySelector(".ck-stale")?.hidden,
      note: pane.querySelector(".ck-note")?.textContent || "",
      right: Math.round(box.right), top: Math.round(box.top), width: Math.round(box.width),
      toolbarBottom: Math.round(document.querySelector(".toolbar").getBoundingClientRect().bottom),
      items: [...pane.querySelectorAll(".ck-group-issues .ck-item")].map((item) => ({
        category: item.dataset.category, title: item.querySelector(".ck-title")?.textContent || "",
        where: item.querySelector(".ck-where")?.textContent || "", hint: item.querySelector(".ck-hint")?.textContent || "",
        page: item.closest(".ck-page")?.querySelector(".ck-page-title")?.firstChild?.textContent || "",
      })),
      unchecked: pane.querySelectorAll(".ck-group-unchecked .ck-item").length,
    };
  });
  const save = async () => {
    await fresh.evaluate(() => document.activeElement?.blur?.());
    const download = fresh.waitForEvent("download");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-save-as").click();
    const path = join(DOWNLOADS, "document-check-saved-" + (fileIndex += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return fresh.evaluate((text) => {
      const model = window.SingleHtmlFormat.parsePortableHtml(text);
      return JSON.stringify({ pages: model.pages, trash: model.trash, attachments: model.attachments });
    }, html);
  };
  const documentCopy = () => fresh.evaluate(() => JSON.stringify(window.__docEditorPages.documentCopy()));
  const currentTitle = () => fresh.evaluate(() => document.querySelector("#doc-title").textContent);
  const clickItem = async (match) => {
    const index = (await paneState()).items.findIndex(match);
    if (index < 0) return false;
    await fresh.locator("#check-pane .ck-group-issues .ck-item").nth(index).click();
    await fresh.waitForTimeout(400);
    return true;
  };

  try {
    await fresh.setViewportSize({ width: 1280, height: 800 });
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 0) 新しいファイル(document-check.js)は配る場所の全部に入っていて、app.js より前に読む。
    const text = (path) => readFile(resolve(path), "utf8");
    const [indexHtml, worker, stage, tableJs, checkJs] = await Promise.all([
      text("editor-pwa/index.html"), text("editor-pwa/service-worker.js"), text("src-tauri/stage-frontend.mjs"),
      text("editor-pwa/table-formula.js"), text("editor-pwa/document-check.js"),
    ]);
    const scripts = [...indexHtml.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    result.checkFileIsShipped = worker.includes('"./document-check.js"') && stage.includes('"document-check.js"')
      && scripts.indexOf("chart.js") < scripts.indexOf("document-check.js") && scripts.indexOf("document-check.js") < scripts.indexOf("app.js");
    // 判定を2か所に作らない: 表の式のエラーの語彙(#CYCLE など)を決めるのは table-formula.js の formulaErrorOf だけで、
    // セルの表示(tableCellResult)も文書チェックもそこを通る。文書チェックは参照の行き先・数式の変換を自分で作らない。
    result.checkReusesExistingJudgement = /function formulaErrorOf\(/.test(tableJs) && (tableJs.match(/"#CYCLE"/g) || []).length === 1
      && /formulaErrorOf\(outcome\)/.test(tableJs.slice(tableJs.indexOf("function tableCellResult(")))
      && checkJs.includes("tableFormula.tableCellError(") && checkJs.includes("fmt.resolveReference(") && checkJs.includes("fmt.texToMathML(")
      && checkJs.includes("chartTools.buildChart(") && !/#CYCLE|#REF"|参照先なし"/.test(checkJs.replace(/\/\/.*$/gm, "").replace(/"[^"\n]*(#REF|#CYCLE)[^"\n]*"/g, ""));

    // 1) 入口: File メニューの項目と、コマンドパレットの「文書をチェック」
    await openMenu(fresh, "file");
    result.checkMenuItem = (await fresh.locator("#menu-check-document").textContent())?.includes("文書をチェック") === true;
    await fresh.keyboard.press("Escape");
    await fresh.locator("#menubar").click({ position: { x: 400, y: 5 } }).catch(() => {});
    await fresh.keyboard.press("Control+k");
    await fresh.locator("#palette-input").fill("チェック");
    await fresh.waitForTimeout(150);
    result.checkPaletteCommand = await fresh.evaluate(() => [...document.querySelectorAll("#palette-results .menu-title, #palette-results button")].some((el) => /文書をチェック/.test(el.textContent)));
    await fresh.keyboard.press("Escape");

    // 2) 正常な文書は「問題なし」。調べたものの数と、「正しさの保証ではない」ことを書く
    await openDoc(HEALTHY, "document-check-healthy.html", "正常な文書");
    await runCheck();
    const healthy = await paneState();
    evidence.healthy = healthy;
    result.checkHealthyIsOk = healthy?.shown === true && healthy.status === "ck-ok" && healthy.title === "見つかった問題はありません"
      && healthy.items.length === 0 && healthy.unchecked === 0;
    result.checkOkIsNotAGuarantee = /正しさは確かめていません/.test(healthy?.note || "") && /外部のリンク/.test(healthy?.note || "");
    // パネルの上端は道具の帯の下(提案のパネルと同じ置き場)
    result.checkPaneBelowToolbar = healthy && healthy.top >= healthy.toolbarBottom - 1 && healthy.right <= 1280;

    // 3) 問題のある文書: 見ていないページ・閉じたトグルの中も含めて全部出る。チェックの前後で文書は変わらない
    await openDoc(BROKEN, "document-check-broken.html", "表紙");
    result.checkClosedOnOtherDocument = (await paneState())?.shown === false;
    // 保存は描いた絵(グラフ・図)を新しくするので、先に保存してから画面の値を控える(チェックの前後だけを比べる)。
    const savedBefore = await save();
    const memoryBefore = await documentCopy();
    await runCheck();
    const broken = await paneState();
    evidence.broken = broken;
    const has = (category, pattern, wherePattern = null) => broken.items.some((item) => item.category === category && pattern.test(item.title + " " + item.hint)
      && (!wherePattern || wherePattern.test(item.where)) && item.page === "問題のあるページ");
    result.checkBrokenIsIssues = broken?.status === "ck-issues" && /問題が \d+ 件あります/.test(broken.title);
    result.checkFindsMissingReference = has("reference", /参照先が見つかりません.*消しました/, /参照 › 段落/);
    result.checkFindsMissingBlockLink = has("reference", /リンクしているブロックが見つかりません/);
    result.checkFindsTrashReference = has("reference", /ゴミ箱/);
    result.checkFindsUncaptionedTarget = has("reference", /題名を外した/);
    result.checkFindsInsideClosedToggle = has("reference", /参照先が見つかりません/, /段落「中の参照/);
    result.checkFindsMissingPageBlock = has("reference", /リンクしているページが見つかりません/);
    result.checkFindsMissingAttachment = has("attachment", /添付のファイルが文書にありません/);
    result.checkFindsBrokenCellLinks = has("reference", /セル A4 のリンクのページ/) && has("reference", /セル C4 のリンクのブロック/);
    result.checkFindsFormulaErrors = has("table", /セル C2 の式が #ERR/, /計算 › 表1/) && has("table", /セル B3 の式が #CYCLE.*循環/)
      && has("table", /セル C3 の式が #REF/) && has("table", /セル B4 の式が #ERR.*0 で割って/);
    result.checkFindsChartError = has("chart", /使えないコマンド/) && has("chart", /データの表が見つかりません/);
    result.checkFindsMathErrors = has("math", /数式を変換できません: \\frac\{1\}\{/) && has("math", /数式を変換できません: \\frac\{a/);
    result.checkFindsMermaidError = has("diagram", /図を描けません/);
    // 正常なもの(表紙のページ・ページのブロック P1→P2)は出さない
    result.checkHealthyPartsNotListed = !broken.items.some((item) => item.page === "表紙");
    const memoryAfter = await documentCopy();
    const savedAfter = await save();
    result.checkDoesNotChangeDocument = memoryBefore === memoryAfter && savedBefore === savedAfter;
    evidence.unchanged = { memory: memoryBefore === memoryAfter, saved: savedBefore === savedAfter };

    // 4) 項目を選ぶと、その場所へ移る: 別のページへ切り替え、閉じたトグルを開いてその行を光らせる。表のセルはそのセルを光らせる
    result.checkStartsOnOtherPage = (await currentTitle()) === "表紙";
    await clickItem((item) => /参照先が見つかりません/.test(item.title) && /中の参照/.test(item.where));
    const jumped = await fresh.evaluate(() => {
      const row = document.querySelector('#blocks .block[data-id="r4"]');
      const box = row?.getBoundingClientRect();
      return {
        title: document.querySelector("#doc-title").textContent, flashed: row?.classList.contains("ref-flash") === true,
        visible: Boolean(box) && box.top >= 0 && box.bottom <= innerHeight,
        selected: document.querySelector("#check-pane .ck-item[aria-current='true'] .ck-where")?.textContent || "",
        stale: !document.querySelector("#check-pane .ck-stale")?.hidden,
      };
    });
    evidence.jumped = jumped;
    result.checkJumpOpensPageAndToggle = jumped.title === "問題のあるページ" && jumped.flashed && jumped.visible && /中の参照/.test(jumped.selected);
    // 移るときにトグルを開いたのは「チェックのあとで変わった」に数えない
    result.checkJumpIsNotAnEdit = jumped.stale === false;
    await clickItem((item) => /セル B4 の式/.test(item.title));
    result.checkJumpFlashesCell = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="tb"] .editor-table [data-row="3"][data-cell="1"]')?.classList.contains("ck-cell-flash") === true);
    await fresh.screenshot({ path: join(OUT, "document-check-1280.png") });

    // 5) 直すと「チェックのあとで変わりました」が出て、再チェックで消える(0 で割る式を直す)
    await fresh.evaluate(() => {
      const td = document.querySelector('#blocks .block[data-id="tb"] .editor-table [data-row="3"][data-cell="1"]');
      if (!td) return;
      td.focus();
      td.textContent = "=1/2";
      td.dispatchEvent(new Event("input", { bubbles: true }));
      td.blur();
    });
    await fresh.waitForTimeout(300);
    result.checkMarksStaleAfterEdit = (await paneState()).stale === true;
    const countBefore = broken.items.length;
    await fresh.locator("#check-pane .ck-recheck").click();
    await fresh.waitForFunction(() => !document.querySelector("#check-pane .ck-summary")?.classList.contains("ck-checking"), null, { timeout: 30000 }).catch(() => {});
    const rechecked = await paneState();
    evidence.recheckedCount = [countBefore, rechecked.items.length];
    result.checkRecheckClearsFixed = rechecked.stale === false && rechecked.items.length === countBefore - 1
      && !rechecked.items.some((item) => /セル B4 の式/.test(item.title));

    // 6) 狭い画面(800px)でもパネルが画面に収まり、項目を選べる
    await fresh.setViewportSize({ width: 800, height: 800 });
    await fresh.waitForTimeout(300);
    const narrow = await paneState();
    evidence.narrow = { right: narrow.right, top: narrow.top, toolbarBottom: narrow.toolbarBottom, width: narrow.width };
    result.checkPaneFitsNarrow = narrow.shown && narrow.right <= 800 && narrow.top >= narrow.toolbarBottom - 1;
    await fresh.screenshot({ path: join(OUT, "document-check-800.png") });
    await fresh.setViewportSize({ width: 1280, height: 800 });

    // 7) 閉じる・提案のパネルとは同時に開かない(× で閉じる)
    await fresh.locator("#check-pane .sg-pane-close").click();
    result.checkPaneCloses = (await paneState()).shown === false;
    result.checkNoPageErrors = pageErrors.length === 0;
    evidence.pageErrors = pageErrors.slice(0, 5);
  } finally {
    await fresh.close();
  }

  // 8) 描くのを待っている間は「確かめています」(確定したエラーと区別する)。Mermaid を読み込めないときは「確かめられなかった項目」
  //    (問題としては数えない)。読み込みを止め・遅らせるため、SW を使わない別の文脈で開く。
  const isolated = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
  // 開く・保存のダイアログはテストの文脈と同じく input の形にする(test.mjs と同じ初期化)。
  await isolated.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const probe = await isolated.newPage();
  let mermaidMode = "abort";
  await isolated.route("**/vendor/mermaid/mermaid.min.js", async (route) => {
    if (mermaidMode === "abort") return route.abort();
    await new Promise((done) => setTimeout(done, 1500));
    return route.continue();
  });
  try {
    await probe.setViewportSize({ width: 1280, height: 800 });
    await probe.goto("http://127.0.0.1:" + PORT + "/");
    await probe.waitForSelector("#blocks .block-content");
    const source = join(OUT, "document-check-diagram.html");
    await writeFile(source, await probe.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), HEALTHY), "utf8");
    const chooser = probe.waitForEvent("filechooser");
    await probe.locator("#menu-file-button").click();
    await probe.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await probe.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "正常な文書", null, { timeout: 8000 }).catch(() => {});
    await probe.waitForTimeout(500);
    const runProbe = async () => {
      await probe.locator("#menu-file-button").click();
      await probe.locator("#menu-check-document").click();
    };
    const summary = () => probe.evaluate(() => ({
      status: [...document.querySelector("#check-pane .ck-summary")?.classList || []].join(" "),
      title: document.querySelector("#check-pane .ck-summary-title")?.textContent || "",
      issues: document.querySelectorAll("#check-pane .ck-group-issues .ck-item").length,
      unchecked: [...document.querySelectorAll("#check-pane .ck-group-unchecked .ck-item .ck-title")].map((el) => el.textContent),
    }));
    const settled = () => probe.waitForFunction(() => !document.querySelector("#check-pane .ck-summary")?.classList.contains("ck-checking"), null, { timeout: 30000 }).catch(() => {});
    await runProbe();
    await settled();
    const incomplete = await summary();
    evidence.incomplete = incomplete;
    result.checkUncheckedWhenDiagramCannotLoad = /ck-incomplete/.test(incomplete.status) && incomplete.title === "確かめられなかった項目があります"
      && incomplete.issues === 0 && incomplete.unchecked.length === 1 && /図を確かめられませんでした/.test(incomplete.unchecked[0]);
    mermaidMode = "slow";
    await runProbe();
    await probe.waitForTimeout(400);
    const waiting = await summary();
    await settled();
    const done = await summary();
    evidence.waiting = { waiting, done };
    result.checkShowsWaitingForDiagram = /ck-checking/.test(waiting.status) && /図を描いて確かめています\(1 件\)/.test(waiting.title)
      && waiting.issues === 0 && /ck-ok/.test(done.status) && done.unchecked.length === 0;
  } finally {
    await isolated.close();
  }
  result.checkEvidence = JSON.stringify(evidence);
  return result;
}
