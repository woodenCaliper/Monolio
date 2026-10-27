// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// Copies only the runtime assets of the PWA into src-tauri/frontend so the
// installer does not ship the test artifacts under editor-pwa/out.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { hasCspMeta, stripCspMeta } from "./strip-csp-meta.mjs";

const SOURCE = resolve("editor-pwa");
const TARGET = resolve("src-tauri/frontend");
const DESKTOP_SOURCE = resolve("src-tauri");
// v122 で同梱フォントを撤去したので、フォントの同梱は無い（表示は OS 標準）。
const ASSETS = [
  "index.html",
  "style.css",
  "app.js",
  // 数式の変換・表の計算・グラフ(Issue #207 で app.js・document-format.js から分けた)。index.html が読む。
  "tex-math.js",
  "table-formula.js",
  "chart.js",
  // 文書チェック(Issue #236)。index.html が app.js の前に読む。
  "document-check.js",
  "document-format.js",
  // 本文の見た目の正(Issue #201)。index.html の <head> で読む。
  "document-style.js",
  // 絵文字の候補の表(Issue #175)。「:」で初めて候補を出すときに app.js が読み込む。
  "emoji-data.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  // デスクトップ版では SW を使わない(v195。app.js が登録せず、残りは外す)が、右下のバージョン表示が
  // このファイルの版数文字列を読むので同梱する。
  "service-worker.js",
  // Mermaid の図(v194)。図のある文書を開いたときに app.js が読み込む。ライセンスの文も一緒に入れる。
  "vendor/mermaid/mermaid.min.js",
  "vendor/mermaid/LICENSE",
  // ライセンス(Issue #234)。本体の GPL-3.0-or-later の全文と、第三者の部品の表記。File メニューの「ライセンス情報…」が読む。
  "legal/LICENSE.txt",
  "legal/THIRD_PARTY_NOTICES.txt",
];
// デスクトップ版にだけ入る文書(Rust の部品の表記)。ブラウザ版(editor-pwa/)には無い。元は src-tauri/legal/。
const DESKTOP_ONLY = ["legal/DESKTOP_THIRD_PARTY_NOTICES.txt"];

await rm(TARGET, { recursive: true, force: true });
for (const asset of ASSETS) {
  const to = join(TARGET, asset);
  await mkdir(dirname(to), { recursive: true });
  await cp(join(SOURCE, asset), to, { recursive: true });
}
for (const asset of DESKTOP_ONLY) {
  const to = join(TARGET, asset);
  await mkdir(dirname(to), { recursive: true });
  await cp(join(DESKTOP_SOURCE, asset), to);
}
// ブラウザ版の CSP の meta は外す(exe の CSP は tauri.conf.json が正。理由は strip-csp-meta.mjs)。
// 外せなかったら同梱を止める(meta が残ると、exe で保存・開くが CSP で止まる)。
const stagedIndex = join(TARGET, "index.html");
const stripped = stripCspMeta(await readFile(stagedIndex, "utf8"));
if (hasCspMeta(stripped)) throw new Error("stage-frontend: CSP の meta を index.html から外せませんでした");
await writeFile(stagedIndex, stripped, "utf8");
console.log(`staged ${ASSETS.length + DESKTOP_ONLY.length} files into ${TARGET}`);
