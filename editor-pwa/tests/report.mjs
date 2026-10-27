// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// report の組み立てと ok の判定(test.mjs と並列の実行役 test-parallel.mjs で共用。2026-10-12 に test.mjs から移した。中身は移す前と同じ)。
// results: スイート名 → そのスイートの観点({ 名前: 値 })。report には SUITES の順に重ねる(同じ名前は後のスイートが勝つ。移す前と同じ)。
export function buildReport(suiteNames, results, crashedSuites, { filtered = false, extra = {} } = {}) {
  const report = {};
  for (const name of suiteNames) Object.assign(report, results[name]);
  Object.assign(report, {
    // 落ちたスイートの記録(証拠)と、その判定。落ちたスイートの項目は report に出ないので、
    // ここで不合格にしないと見逃す。
    crashedSuites,
    noSuiteCrashed: Object.keys(crashedSuites).length === 0,
    ...extra,
    ok: false,
  });
  // ---- ok は report の全項目から自動で畳む ----
  // P13「テストを書いた」は「守られている」ではない。以前の ok は 650 行を超える
  // 手書きの && で、report に観点を足しても ok へ繋ぎ忘れると誰も気づかなかった
  // (v124 時点で 3 項目が実際に外れていた)。そこで既定を「判定する」にして、
  // 判定しないものだけを理由つきで下に並べる(既定が安全側)。
  //
  // 判定は値の形で決める(名前では決めない):
  //   真偽値       … true なら合格、false なら不合格
  //   真偽値の配列 … 空なら不合格(空配列の every(Boolean) は true で、静かに死ぬ)、
  //                  1つでも false なら不合格
  //   それ以外     … 「証拠」。ok には効かせず report に残す(寸法・文字列・件数など)
  //                  真偽で判定したい観点は、必ず真偽値として report に入れること。
  // 判定から外す項目と、その理由。ここに足すときは「なぜ真偽で見ないか」を書く。
  const OK_EXEMPT = new Map([
    ["ok", "判定結果そのもの。report の並び順を保つために宣言だけ先にしてある置き場"],
    ["inlineCodeLeftCursorSequence", "真偽ではなくキャレット位置の列(0 が正当な値)。判定は inlineCodeLeftMovesOncePerPosition が期待列との完全一致で行う"],
    ["inlineCodeRightCursorSequence", "真偽ではなくキャレット位置の列(0 が正当な値)。判定は inlineCodeRightMovesOncePerPosition が期待列との完全一致で行う"],
  ]);
  const okJudged = [];
  const okEvidenceOnly = [];
  const okFailures = [];
  for (const [key, value] of Object.entries(report)) {
    if (OK_EXEMPT.has(key)) continue;
    const isBoolean = typeof value === "boolean";
    const isBooleanList = Array.isArray(value) && value.every((item) => typeof item === "boolean");
    if (!isBoolean && !isBooleanList) {
      okEvidenceOnly.push(key);
      continue;
    }
    okJudged.push(key);
    if (!(isBoolean ? value : value.length > 0 && value.every(Boolean))) okFailures.push(key);
  }
  // 何件を判定し、何を証拠として外したかを report に残す(取りこぼしの監査用)。
  report.okJudgedCount = okJudged.length;
  report.okEvidenceOnly = okEvidenceOnly;
  report.okFailures = okFailures;
  report.ok = okFailures.length === 0;
  // 絞ったラン(--only)はスキップしたスイートのキーが欠けるため ok を評価しない。
  // "filtered" の report を全緑の根拠にしてはいけない(最終確認はフルで)。
  if (filtered) report.ok = "filtered";
  return report;
}
