// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// テストの入口。中身は tests/ に分けてある:
//   tests/lib.mjs        … 定数と補助関数
//   tests/core.mjs       … 通しのスモークテスト(coreSuite。1つのページで文書を育てながら確かめる)
//   tests/suites/*.mjs   … 機能ごとのスイート(それぞれ新しいページで始める。互いに独立)
// スイートを足すときは tests/suites/ にファイルを置き、下の SUITES に加える。
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromePath, DOWNLOADS, FALLBACK_FONT_SOURCES, FIXTURE, FONT_FIXTURE, OUT, PORT, UNUSED_FONT_FIXTURE, waitForServer } from "./tests/lib.mjs";
import { buildReport } from "./tests/report.mjs";
import coreSuite from "./tests/core.mjs";
import tableSuite from "./tests/suites/tableSuite.mjs";
import bugFixSuite from "./tests/suites/bugFixSuite.mjs";
import searchSuite from "./tests/suites/searchSuite.mjs";
import cellArrowSuite from "./tests/suites/cellArrowSuite.mjs";
import chartPaneSuite from "./tests/suites/chartPaneSuite.mjs";
import fillSuite from "./tests/suites/fillSuite.mjs";
import wholeRefSuite from "./tests/suites/wholeRefSuite.mjs";
import wholeRefAxisSuite from "./tests/suites/wholeRefAxisSuite.mjs";
import wholeRefPointSuite from "./tests/suites/wholeRefPointSuite.mjs";
import headerRefSuite from "./tests/suites/headerRefSuite.mjs";
import colWidthSuite from "./tests/suites/colWidthSuite.mjs";
import headerMergeSuite from "./tests/suites/headerMergeSuite.mjs";
import mergedLogicalSuite from "./tests/suites/mergedLogicalSuite.mjs";
import mergedMirrorSuite from "./tests/suites/mergedMirrorSuite.mjs";
import escCancelSuite from "./tests/suites/escCancelSuite.mjs";
import markdownSpaceSuite from "./tests/suites/markdownSpaceSuite.mjs";
import blockMenuSuite from "./tests/suites/blockMenuSuite.mjs";
import pagesSuite from "./tests/suites/pagesSuite.mjs";
import pageNavSuite from "./tests/suites/pageNavSuite.mjs";
import portablePagesSuite from "./tests/suites/portablePagesSuite.mjs";
import searchScopeSuite from "./tests/suites/searchScopeSuite.mjs";
import blockClipboardSuite from "./tests/suites/blockClipboardSuite.mjs";
import foreignPasteSuite from "./tests/suites/foreignPasteSuite.mjs";
import zoomViewerSuite from "./tests/suites/zoomViewerSuite.mjs";
import underlineSuite from "./tests/suites/underlineSuite.mjs";
import pageMentionSuite from "./tests/suites/pageMentionSuite.mjs";
import blockLinkSuite from "./tests/suites/blockLinkSuite.mjs";
import documentCheckSuite from "./tests/suites/documentCheckSuite.mjs";
import licenseSuite from "./tests/suites/licenseSuite.mjs";
import emojiDateSuite from "./tests/suites/emojiDateSuite.mjs";
import edgeScrollSuite from "./tests/suites/edgeScrollSuite.mjs";
import listShortcutSuite from "./tests/suites/listShortcutSuite.mjs";
import chartSelectSuite from "./tests/suites/chartSelectSuite.mjs";
import chartLayoutSuite from "./tests/suites/chartLayoutSuite.mjs";
import importIdSuite from "./tests/suites/importIdSuite.mjs";
import importSanitizeSuite from "./tests/suites/importSanitizeSuite.mjs";
import cspSuite from "./tests/suites/cspSuite.mjs";
import chartRangePickSuite from "./tests/suites/chartRangePickSuite.mjs";
import chartSourceSuite from "./tests/suites/chartSourceSuite.mjs";
import chartStyleSuite from "./tests/suites/chartStyleSuite.mjs";
import chartTrendSuite from "./tests/suites/chartTrendSuite.mjs";
import desktopAttachmentSuite from "./tests/suites/desktopAttachmentSuite.mjs";
import desktopLinkSuite from "./tests/suites/desktopLinkSuite.mjs";
import pageBreakSuite from "./tests/suites/pageBreakSuite.mjs";
import linkSuite from "./tests/suites/linkSuite.mjs";
import mermaidSuite from "./tests/suites/mermaidSuite.mjs";
import headingPathSuite from "./tests/suites/headingPathSuite.mjs";
import pageTreeWidthSuite from "./tests/suites/pageTreeWidthSuite.mjs";
import chartAxisSuite from "./tests/suites/chartAxisSuite.mjs";
import chartBarhSuite from "./tests/suites/chartBarhSuite.mjs";
import chartPieSuite from "./tests/suites/chartPieSuite.mjs";
import appNameSuite from "./tests/suites/appNameSuite.mjs";
import versionSuite from "./tests/suites/versionSuite.mjs";
import documentStyleSuite from "./tests/suites/documentStyleSuite.mjs";
import hoverStateSuite from "./tests/suites/hoverStateSuite.mjs";
import appSplitSuite from "./tests/suites/appSplitSuite.mjs";
import listAlignSuite from "./tests/suites/listAlignSuite.mjs";
import forwardDeleteSuite from "./tests/suites/forwardDeleteSuite.mjs";
import mathSuite from "./tests/suites/mathSuite.mjs";
import iconSuite from "./tests/suites/iconSuite.mjs";
import editKeysSuite from "./tests/suites/editKeysSuite.mjs";
import fontDeleteSuite from "./tests/suites/fontDeleteSuite.mjs";
import pageLockSuite from "./tests/suites/pageLockSuite.mjs";
import noticeSuite from "./tests/suites/noticeSuite.mjs";
import fontPickerSuite from "./tests/suites/fontPickerSuite.mjs";
import printSuite from "./tests/suites/printSuite.mjs";
import layoutParitySuite from "./tests/suites/layoutParitySuite.mjs";
import captionSuite from "./tests/suites/captionSuite.mjs";
import figureRefSuite from "./tests/suites/figureRefSuite.mjs";
import saveEscapeSuite from "./tests/suites/saveEscapeSuite.mjs";
import chartNumberFixSuite from "./tests/suites/chartNumberFixSuite.mjs";
import pageCrumbSuite from "./tests/suites/pageCrumbSuite.mjs";
import blockSelectSuite from "./tests/suites/blockSelectSuite.mjs";
import editFixSuite from "./tests/suites/editFixSuite.mjs";
import blockTreeFixSuite from "./tests/suites/blockTreeFixSuite.mjs";
import toggleColumnsSuite from "./tests/suites/toggleColumnsSuite.mjs";
import columnLimitSuite from "./tests/suites/columnLimitSuite.mjs";
import bigTableSuite from "./tests/suites/bigTableSuite.mjs";
import bigTableOpsSuite from "./tests/suites/bigTableOpsSuite.mjs";
import htmlPasteSuite from "./tests/suites/htmlPasteSuite.mjs";
import chartStaleSvgSuite from "./tests/suites/chartStaleSvgSuite.mjs";
import lockTableFixSuite from "./tests/suites/lockTableFixSuite.mjs";
import cellRangeClipboardSuite from "./tests/suites/cellRangeClipboardSuite.mjs";
import appFix2Suite from "./tests/suites/appFix2Suite.mjs";
import editKeysFix2Suite from "./tests/suites/editKeysFix2Suite.mjs";
import groupDragSuite from "./tests/suites/groupDragSuite.mjs";
import tableToolbarShiftSuite from "./tests/suites/tableToolbarShiftSuite.mjs";
import formatWarnSuite from "./tests/suites/formatWarnSuite.mjs";
import tableDbSuite from "./tests/suites/tableDbSuite.mjs";
import tableMoveSuite from "./tests/suites/tableMoveSuite.mjs";
import tableWideSuite from "./tests/suites/tableWideSuite.mjs";
import tableExcelSuite from "./tests/suites/tableExcelSuite.mjs";
import tableHeightSuite from "./tests/suites/tableHeightSuite.mjs";
import tableFocusSuite from "./tests/suites/tableFocusSuite.mjs";
import tableRowHeightSuite from "./tests/suites/tableRowHeightSuite.mjs";
import tableKeepCellSuite from "./tests/suites/tableKeepCellSuite.mjs";
import suggestSuite from "./tests/suites/suggestSuite.mjs";
import suggestReviewSuite from "./tests/suites/suggestReviewSuite.mjs";
import fileWatchSuite from "./tests/suites/fileWatchSuite.mjs";
import saveFlowSuite from "./tests/suites/saveFlowSuite.mjs";
import aiGuideSuite from "./tests/suites/aiGuideSuite.mjs";
import tableCutSortSuite from "./tests/suites/tableCutSortSuite.mjs";
import dataLossFixSuite from "./tests/suites/dataLossFixSuite.mjs";
import tableCalcFixSuite from "./tests/suites/tableCalcFixSuite.mjs";
import tableRowsIdentitySuite from "./tests/suites/tableRowsIdentitySuite.mjs";
import keysFixSuite from "./tests/suites/keysFixSuite.mjs";
import pasteFixSuite from "./tests/suites/pasteFixSuite.mjs";
import miscFixSuite from "./tests/suites/miscFixSuite.mjs";
import visualFixSuite from "./tests/suites/visualFixSuite.mjs";
import readingOrderSuite from "./tests/suites/readingOrderSuite.mjs";
import selectionAcrossSuite from "./tests/suites/selectionAcrossSuite.mjs";
import selectionWalkSuite from "./tests/suites/selectionWalkSuite.mjs";
import contentWidthSuite from "./tests/suites/contentWidthSuite.mjs";
import dbPageLinkSuite from "./tests/suites/dbPageLinkSuite.mjs";
import cellLinkSuite from "./tests/suites/cellLinkSuite.mjs";
import lowFixEditSuite from "./tests/suites/lowFixEditSuite.mjs";
import smallFix3Suite from "./tests/suites/smallFix3Suite.mjs";
import undoMemorySuite from "./tests/suites/undoMemorySuite.mjs";
import typingPerfSuite from "./tests/suites/typingPerfSuite.mjs";
import partialRenderSuite from "./tests/suites/partialRenderSuite.mjs";
import renderShareSuite from "./tests/suites/renderShareSuite.mjs";
import redrawCountSuite from "./tests/suites/redrawCountSuite.mjs";
import aiReadableSuite from "./tests/suites/aiReadableSuite.mjs";
import lowFixUiSuite from "./tests/suites/lowFixUiSuite.mjs";
import lowFixNumberSuite from "./tests/suites/lowFixNumberSuite.mjs";
import filesFixSuite from "./tests/suites/filesFixSuite.mjs";
import imeFixSuite from "./tests/suites/imeFixSuite.mjs";
import tablePerfSuite from "./tests/suites/tablePerfSuite.mjs";
import headingNumberSuite from "./tests/suites/headingNumberSuite.mjs";
import videoSuite from "./tests/suites/videoSuite.mjs";
import serviceWorkerSuite from "./tests/suites/serviceWorkerSuite.mjs";
import layerOrderSuite from "./tests/suites/layerOrderSuite.mjs";
import ruleUnifySuite from "./tests/suites/ruleUnifySuite.mjs";
import pdfSuite from "./tests/suites/pdfSuite.mjs";
import searchUndoFontSuite from "./tests/suites/searchUndoFontSuite.mjs";
import attachViewSuite from "./tests/suites/attachViewSuite.mjs";
import attachHashSuite from "./tests/suites/attachHashSuite.mjs";
import filterConditionSuite from "./tests/suites/filterConditionSuite.mjs";
import dbMoreSuite from "./tests/suites/dbMoreSuite.mjs";
import calloutColorSuite from "./tests/suites/calloutColorSuite.mjs";
import countListAudioSuite from "./tests/suites/countListAudioSuite.mjs";
import moveTrashSuite from "./tests/suites/moveTrashSuite.mjs";
import markdownSuite from "./tests/suites/markdownSuite.mjs";
import appearanceSuite from "./tests/suites/appearanceSuite.mjs";
import codeHighlightSuite from "./tests/suites/codeHighlightSuite.mjs";

// フルスイートが既定。`--only=名前,名前` でスイート単位に絞れる(赤確認のサブセット
// ラン用。AI使用量削減の運用)。名前は前方一致(例: --only=escCancel)。絞ったランの
// report は ok:"filtered" になり、**安定点の根拠には使えない**(復元後の最終確認は
// 必ずフィルタ無しのフルで1回行う)。通しのスモークテストも coreSuite という1つのスイートで、
// 絞ったランでは名前を挙げたときだけ走る。
const SUITE_ONLY = new Set(
  (process.argv.find((arg) => arg.startsWith("--only="))?.slice(7) ?? "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean),
);
// 分割ラン(test-parallel.mjs)が使う: 生の結果(results・crashedSuites・suiteSeconds)をこのファイルへ書く。
const SHARD_OUT = process.argv.find((arg) => arg.startsWith("--shard-out="))?.slice(12) || "";
const suiteWanted = (name) => !SUITE_ONLY.size || [...SUITE_ONLY].some((token) => name.startsWith(token));
// 分割ラン(test-parallel.mjs)の待ち行列(#230): --queue のときは、走らせるスイートを親のプロセスに1つずつ聞く(手の空いた組が次を取る)。
// 組を先に決めないので、所要時間の目安がずれていても組の長さがそろう。やり取りは標準出力の1行(QUEUE_ASK)と、標準入力の1行(スイートの名前。
// 空の行で終わり)。IPC は使わない(IPC のある子プロセスで、Playwright のブラウザとのパイプの読み取りが落ちたことがあった)。
const QUEUE = process.argv.includes("--queue");
const QUEUE_ASK = "@@monolio-queue-next@@";

// 実行する順。coreSuite は通しのスモーク、残りは機能ごとの独立したスイート。
const SUITES = [
  coreSuite,
  tableSuite,
  bugFixSuite,
  searchSuite,
  cellArrowSuite,
  chartPaneSuite,
  fillSuite,
  wholeRefSuite,
  wholeRefAxisSuite,
  wholeRefPointSuite,
  headerRefSuite,
  colWidthSuite,
  headerMergeSuite,
  mergedLogicalSuite,
  mergedMirrorSuite,
  escCancelSuite,
  markdownSpaceSuite,
  blockMenuSuite,
  pagesSuite,
  pageNavSuite,
  portablePagesSuite,
  searchScopeSuite,
  blockClipboardSuite,
  foreignPasteSuite,
  zoomViewerSuite,
  underlineSuite,
  pageMentionSuite,
  blockLinkSuite,
  documentCheckSuite,
  licenseSuite,
  emojiDateSuite,
  edgeScrollSuite,
  listShortcutSuite,
  chartSelectSuite,
  chartLayoutSuite,
  importIdSuite,
  importSanitizeSuite,
  cspSuite,
  chartRangePickSuite,
  chartSourceSuite,
  chartStyleSuite,
  chartAxisSuite,
  chartBarhSuite,
  chartPieSuite,
  appNameSuite,
  versionSuite,
  documentStyleSuite,
  hoverStateSuite,
  appSplitSuite,
  listAlignSuite,
  forwardDeleteSuite,
  mathSuite,
  iconSuite,
  editKeysSuite,
  fontDeleteSuite,
  pageLockSuite,
  noticeSuite,
  fontPickerSuite,
  printSuite,
  layoutParitySuite,
  captionSuite,
  figureRefSuite,
  saveEscapeSuite,
  chartNumberFixSuite,
  chartTrendSuite,
  desktopAttachmentSuite,
  desktopLinkSuite,
  pageBreakSuite,
  mermaidSuite,
  headingPathSuite,
  pageTreeWidthSuite,
  linkSuite,
  pageCrumbSuite,
  blockSelectSuite,
  editFixSuite,
  chartStaleSvgSuite,
  lockTableFixSuite,
  cellRangeClipboardSuite,
  appFix2Suite,
  editKeysFix2Suite,
  blockTreeFixSuite,
  toggleColumnsSuite,
  columnLimitSuite,
  bigTableSuite,
  bigTableOpsSuite,
  htmlPasteSuite,
  groupDragSuite,
  tableToolbarShiftSuite,
  lowFixEditSuite,
  lowFixUiSuite,
  lowFixNumberSuite,
  smallFix3Suite,
  undoMemorySuite,
  filesFixSuite,
  imeFixSuite,
  typingPerfSuite,
  tablePerfSuite,
  headingNumberSuite,
  partialRenderSuite,
  renderShareSuite,
  redrawCountSuite,
  aiReadableSuite,
  formatWarnSuite,
  tableDbSuite,
  tableMoveSuite,
  tableWideSuite,
  tableExcelSuite,
  tableHeightSuite,
  tableFocusSuite,
  tableRowHeightSuite,
  tableKeepCellSuite,
  suggestSuite,
  suggestReviewSuite,
  fileWatchSuite,
  saveFlowSuite,
  aiGuideSuite,
  tableCutSortSuite,
  dataLossFixSuite,
  tableCalcFixSuite,
  tableRowsIdentitySuite,
  keysFixSuite,
  pasteFixSuite,
  miscFixSuite,
  visualFixSuite,
  readingOrderSuite,
  selectionAcrossSuite,
  selectionWalkSuite,
  contentWidthSuite,
  dbPageLinkSuite,
  cellLinkSuite,
  videoSuite,
  ruleUnifySuite,
  serviceWorkerSuite,
  layerOrderSuite,
  pdfSuite,
  searchUndoFontSuite,
  attachViewSuite,
  attachHashSuite,
  filterConditionSuite,
  dbMoreSuite,
  calloutColorSuite,
  countListAudioSuite,
  moveTrashSuite,
  markdownSuite,
  appearanceSuite,
  codeHighlightSuite,
];

// stdout は report の JSON だけにしておくため stderr へ。
console.error(`browser: ${chromePath ?? "playwright-core の chromium"}`);

await rm(OUT, { recursive: true, force: true });
await mkdir(DOWNLOADS, { recursive: true });
await writeFile(FIXTURE, "attached from pwa editor\n", "utf8");
{
  // 2つの試験用フォントは中身が別のファイルにする(同じ中身だと区別の検査が甘くなる)。
  const sources = FALLBACK_FONT_SOURCES.map((path) => resolve(path)).filter((path) => existsSync(path));
  for (const target of [FONT_FIXTURE, UNUSED_FONT_FIXTURE]) {
    if (existsSync(target)) continue;
    const source = sources.shift();
    if (!source) throw new Error(`font fixture not found: ${target}`);
    await mkdir(join(OUT, "fonts"), { recursive: true });
    await copyFile(source, target);
  }
}

const server = spawn(process.execPath, ["editor-pwa/server.mjs"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "inherit"],
});

try {
  await waitForServer(server);
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu", "--disable-gpu-compositing", "--in-process-gpu", "--disable-dev-shm-usage", "--no-first-run"],
  });
  const context = await browser.newContext({ acceptDownloads: true });
  // OSフォント一覧の読み込みには権限が必要なので、テストでは先に許可しておく。
  let localFontsPermitted = true;
  try {
    await context.grantPermissions(["local-fonts"], { origin: `http://127.0.0.1:${PORT}` });
  } catch {
    localFontsPermitted = false;
  }
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });

  // スイートの途中で例外が出ても、そのスイートを「落ちた」と記録して次へ進む。
  // 以前は1か所の例外で全体が止まり、report も書かれなかった(どこまで通ったか分からない)。
  const results = {};
  // 名前 → エラー。配列にしないのは、空の配列が「真偽値の配列」として不合格に数えられるため。
  const crashedSuites = {};
  // スイートごとの所要時間(秒。証拠。並列ランの組分けに使う)。
  const suiteSeconds = {};
  async function runSuite(suite) {
    const started = Date.now();
    try {
      results[suite.name] = await suite({ browser, context, localFontsPermitted });
    } catch (error) {
      crashedSuites[suite.name] = String(error?.stack || error);
      console.error(`suite crashed: ${suite.name}\n${error?.stack || error}`);
    }
    suiteSeconds[suite.name] = Math.round((Date.now() - started) / 100) / 10;
  }
  if (QUEUE) {
    const suiteByName = new Map(SUITES.map((suite) => [suite.name, suite]));
    const { createInterface } = await import("node:readline");
    const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
    const nextName = async () => {
      process.stdout.write(QUEUE_ASK + "\n");
      const line = await lines.next();
      return line.done ? null : line.value.trim() || null;
    };
    for (let name = await nextName(); name; name = await nextName()) {
      const suite = suiteByName.get(name);
      if (suite) await runSuite(suite);
      else crashedSuites[name] = "test.mjs の SUITES に無い";
    }
  } else {
    for (const suite of SUITES) {
      if (suiteWanted(suite.name)) await runSuite(suite);
    }
  }

  // 分割ラン(test-parallel.mjs)のときは、生の結果も書き出す(実行役がまとめて report を作る)。
  if (SHARD_OUT) await writeFile(SHARD_OUT, JSON.stringify({ results, crashedSuites, suiteSeconds }));
  const report = buildReport(SUITES.map((suite) => suite.name), results, crashedSuites, { filtered: SUITE_ONLY.size > 0 || QUEUE, extra: { suiteSeconds } });
  await writeFile(join(OUT, "test-report.json"), JSON.stringify(report, null, 2));
  // 待ち行列のときは標準出力をやり取りに使うので、report を出さない(親が生の結果からまとめる)
  if (!QUEUE) console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (report.ok !== true && !SUITE_ONLY.size && !QUEUE) process.exitCode = 1;
} finally {
  server.kill();
  // 待ち行列のときは標準入力を閉じる(開いたままだとプロセスが終わらない)
  if (QUEUE) process.stdin.destroy();
}
