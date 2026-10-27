// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// テストの共通部分(定数・補助関数)。test.mjs と tests/core.mjs・tests/suites/*.mjs が使う。
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// パスはどれもリポジトリ直下からの相対で書いてある。どこから起動しても同じ場所を指すよう、
// 最初に作業ディレクトリをリポジトリ直下へ移す(editor-pwa/ で起動すると
// editor-pwa/editor-pwa/out へ書き出していた)。
process.chdir(fileURLToPath(new URL("../..", import.meta.url)));

// 出力先とポートは、分割ラン(test-parallel.mjs)が組ごとに別のものを渡す(同時に走っても書き出しがぶつからない)。
export const OUT = resolve(process.env.PAGELITH_TEST_OUT || "editor-pwa/out");
export const DOWNLOADS = join(OUT, "downloads");
export const FIXTURE = join(OUT, "fixture.txt");
// 埋め込みフォントの試験用ファイル。Windows ではシステムのフォントをそのまま使う。
// 無い環境(クラウドの Linux 等)では別のフォントを out/fonts へ同じファイル名で写して使う
// (書体名はファイル名から決まるので、検査の内容は変わらない。写すのは起動直前)。
export const fontFixture = (name) => existsSync(`C:/Windows/Fonts/${name}`) ? `C:/Windows/Fonts/${name}` : join(OUT, "fonts", name);
export const FONT_FIXTURE = fontFixture("MTEXTRA.TTF");
export const FONT_FAMILY = "MTEXTRA";
export const UNUSED_FONT_FIXTURE = fontFixture("OUTLOOK.TTF");
export const UNUSED_FONT_FAMILY = "OUTLOOK";
export const FALLBACK_FONT_SOURCES = [
  // M PLUS 1 Code の小さな切れ端(各 1KB。SIL OFL)。以前は node_modules/@fontsource から取っていたが、使うのはこの2つだけなので
  // テストの置き場へ移し、@fontsource(フォント約 6,100 ファイル・48MB。v122 でアプリへの同梱をやめた残り)は外した。
  "editor-pwa/tests/fixtures/fonts/m-plus-1-code-0-400-normal.woff2",
  "editor-pwa/tests/fixtures/fonts/m-plus-1-code-0-500-normal.woff2",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];
export const PORT = Number(process.env.PAGELITH_TEST_PORT || 4174);

// 今の保存形式の版(document-format.js の VERSION)。テストは版の数字を直に書かず、これ(ページの中では
// window.SingleHtmlFormat.VERSION)と比べる。版を上げるたびにテストを書き換えないため(版の上げ直しで十数か所を直していた)。
// 版の数字そのものは pagesSuite の formatVersionBumpedForPages の1か所だけで見る(版を上げたことを、そこで意図して書き換える)。
export const FORMAT_VERSION = /const VERSION = "([^"]+)"/.exec(readFileSync("editor-pwa/document-format.js", "utf8"))[1];
// 保存HTMLの manifest の formatVersion が今の版か(空白の有無によらない)。
export const hasFormatVersion = (html) => new RegExp('"formatVersion":\\s*"' + FORMAT_VERSION.replace(/\./g, "\\.") + '"').test(String(html));

// 保存形式が pages[] になった(0.8.0)。parsePortableHtml は旧形式(blocks[])を読んだときも
// 1ページに包んで返すので、解析結果の本文は常に pages[].blocks を辿る。
// ヘルパー関数にしないのは、同じ式を page.evaluate の中(ブラウザ側)でも使うため。
// テスト用ブラウザ: CHROME_PATH → Windows 既定の Chrome → Linux/mac の定番の場所 →
// Claude Code の web 版(クラウド)に入っている chromium(apt が塞がれていて `pwa:browser` が使えない) →
// どれも無ければ undefined(playwright-core が自前で入れた chromium。`npm run pwa:browser`)。
export const chromePath = [
  process.env.CHROME_PATH,
  process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : null,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/opt/pw-browsers/chromium",
].find((path) => path && existsSync(path));

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function downloadedFiles() {
  if (!existsSync(DOWNLOADS)) return [];
  const names = await readdir(DOWNLOADS);
  return Promise.all(names.map(async (name) => {
    const path = join(DOWNLOADS, name);
    const s = await stat(path);
    const bytes = await readFile(path);
    return { name, size: s.size, sha256: sha256(bytes) };
  }));
}

export function waitForServer(server) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 10000);
    server.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes("http://127.0.0.1")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

// メニューやポップオーバーを閉じるための、何もない場所のクリック。
// 旧ブランド表記の代わりにメニューバー右側の空白を使う。
// 画面の描き直しを待つ(2フレーム)。決め打ちの短い待ち(waitForTimeout(20) など)の代わりに使う。
// アプリは selectionchange からの書式の表示の見直しを1フレームに1回にまとめている(v279。#204)ので、20ms では
// 全テストが重いときに間に合わないことがあった(core の文字色・背景色のツールバーの確かめが時々赤になった)。
export async function nextFrames(page, count = 2) {
  await page.evaluate((n) => new Promise((done) => {
    const step = (left) => (left <= 0 ? done() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  }), count);
}

export async function clickNeutralArea(page) {
  const box = await page.locator("#menubar").boundingBox();
  await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2);
}

export async function openMenu(page, name) {
  await page.locator(`#menu-${name}-button`).click();
}

// 文字サイズは Google ドキュメントと同じ数値欄。打ち込んで Enter で確定する。
export const setFontSize = async (page, value) => {
  const field = page.locator("#format-size");
  await field.click();
  await field.fill(String(value));
  await field.press("Enter");
  await page.waitForTimeout(80);
};

// ブロックハンドルの ＋ で直下に空ブロックを追加する。Enter の型引き継ぎや
// 空リストの降格に左右されないので、テストの起点として決定的に使える。
export async function insertBlock(page, slashQuery = null) {
  // この Escape はポップオーバー掃除のため。v119 から表セルの中の Esc は
  // 「編集セッションのキャンセル」(打った文字が開始値へ戻る)なので、
  // セルにフォーカスが残っているときは先に blur で確定してから押す。
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active?.closest?.(".editor-table")) active.blur();
  });
  await page.keyboard.press("Escape");
  const anchorId = await page.evaluate(() => {
    const focused = document.activeElement?.closest?.("#blocks .block-content");
    if (focused?.isContentEditable) return focused.dataset.id;
    const editables = [...document.querySelectorAll("#blocks .block-content")]
      .filter((item) => item.isContentEditable);
    return editables[editables.length - 1]?.dataset.id ?? null;
  });
  if (!anchorId) throw new Error("no block to insert after");
  await page.locator(`#blocks .block[data-id="${anchorId}"] .insert-block`).click();
  if (slashQuery) {
    await page.keyboard.type("/" + slashQuery);
    await page.keyboard.press("Enter");
  }
  // ＋は空の段落を足して、そこへカーソルを置くだけ(v206)。種類は「/」で選ぶ。
}

export async function dragBlock(page, sourceText, targetText, placement) {
  const source = page.locator(".block", { hasText: sourceText }).locator(".drag-grip");
  const target = page.locator(".block", { hasText: targetText });
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceRect = await source.boundingBox();
  const targetRect = await target.boundingBox();
  if (!sourceRect || !targetRect) return false;
  const targetX = placement === "left"
    ? targetRect.x + 2
    : placement === "right"
      ? targetRect.x + targetRect.width - 2
      : targetRect.x + targetRect.width / 2;
  const targetY = placement === "before"
    ? targetRect.y + 2
    : placement === "after"
      ? targetRect.y + targetRect.height - 2
      : targetRect.y + targetRect.height / 2;
  await page.mouse.move(sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 16 });
  await page.mouse.up();
  return true;
}

// フォントを選ぶ(v180 から <select> ではなく独自のメニュー)。ボタンで開き、名前が一致する項目を押す。
export async function pickFont(page, label) {
  await page.locator("#format-font").click();
  await page.locator("#format-font-list .font-option").filter({ has: page.getByText(label, { exact: true }) }).first().click();
}
