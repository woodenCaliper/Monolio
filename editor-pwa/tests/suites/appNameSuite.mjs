// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PORT } from "../lib.mjs";

// ---- アプリ名 Monolio(v222。ユーザー確定。読み: モノリオ。旧名 Pagelith は v171〜v221、その前は Doc Editor) ----
// 目に触れる名前(画面の題名・PWA の manifest・デスクトップ版の productName とウィンドウの題名・package.json の name)は Monolio。
// 互換のための内部の識別子(保存ファイルの形式名・Tauri の identifier・Service Worker のキャッシュ名の接頭辞・
// 保存HTMLの Mermaid の図の id の接頭辞・localStorage のキー)は旧名のまま変えない。
export default async function appNameSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const page = await fresh.evaluate(async () => ({
      title: document.title,
      manifest: await fetch("./manifest.webmanifest").then((response) => response.json()),
      format: window.SingleHtmlFormat.FORMAT,
    }));
    const json = async (path) => JSON.parse(await readFile(resolve(path), "utf8"));
    const text = (path) => readFile(resolve(path), "utf8");
    const tauri = await json("src-tauri/tauri.conf.json");
    const pkg = await json("package.json");
    const lock = await json("package-lock.json");
    const mainRs = await text("src-tauri/src/main.rs");
    const worker = await text("editor-pwa/service-worker.js");
    const cargo = await text("src-tauri/Cargo.toml");
    const cargoLock = await text("src-tauri/Cargo.lock");
    const app = await text("editor-pwa/app.js");
    const format = await text("editor-pwa/document-format.js");
    result.appNameIsMonolio = page.title === "Monolio" && page.manifest.name === "Monolio" && page.manifest.short_name === "Monolio"
      && /^Monolio:/.test(page.manifest.description)
      && tauri.productName === "Monolio" && tauri.app.windows[0].title === "Monolio"
      && pkg.name === "monolio" && lock.name === "monolio" && lock.packages[""].name === "monolio"
      && mainRs.includes('.title("Monolio")') && !/Doc Editor|Pagelith/.test(mainRs)
      // Cargo のパッケージ名は monolio、実行ファイルは Monolio.exe([[bin]] の name)。v171 と同じくユーザー指示で揃えた(v222)。
      && /^name = "monolio"\r?$/m.test(cargo) && /\[\[bin\]\]\s*\r?\nname = "Monolio"/.test(cargo)
      && /^name = "monolio"\r?$/m.test(cargoLock) && !/name = "(doc-editor-desktop|pagelith|Pagelith)"/.test(cargo + cargoLock)
      // 開けなかったときの知らせもアプリ名で言う
      && app.includes("開けませんでした: Monolio の文書ではありません") && !app.includes("Pagelith の文書ではありません");
    // 変えない: 保存ファイルの形式名(既存のファイルが開けなくなる)・Tauri の identifier(別アプリとして入り、設定・保存場所と切れる)・
    // キャッシュ名の接頭辞(版数の表示と古いキャッシュの掃除が見分けに使う)・Mermaid の図の id の接頭辞(保存HTMLに入っていて、
    // 読み込むときにこの接頭辞で確かめる)・localStorage のキー(変えると利用者の好みが忘れられる)。
    result.appRenameKeepsInternalIds = page.format === "SingleHtmlTechnicalDocument" && tauri.identifier === "com.doceditor.desktop"
      && /const CACHE = "doc-editor-pwa-v\d+";/.test(worker)
      && format.includes('const MERMAID_SVG_ID_PREFIX = "pagelith-mermaid-";')
      && app.includes('const HEADING_PATH_KEY = "pagelith-heading-path";')
      && app.includes('const PAGE_TREE_WIDTH_KEY = "pagelith-page-tree-width";');
    return result;
  } finally {
    await fresh.close();
  }
}
