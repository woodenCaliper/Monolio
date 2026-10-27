// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { PORT, insertBlock } from "../lib.mjs";

// ---- 画面の知らせ(v179) ----
// #status は読み上げ専用で画面に出ない。注意(warn)は画面の下の #notice にも少しの間出す。
// 成功などの知らせ(ok・無印)は出さない。クリックで消え、時間が来ても消える。
export default async function noticeSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const notice = () => fresh.evaluate(() => {
      const el = document.querySelector("#notice");
      const rect = el?.getBoundingClientRect();
      return {
        shown: Boolean(el && !el.hidden && rect.width > 0 && rect.height > 0),
        text: el?.textContent || "",
        inView: Boolean(rect && rect.bottom <= innerHeight && rect.top >= 0),
        ariaHidden: el?.getAttribute("aria-hidden"),
      };
    });
    result.noticeHiddenAtStart = !(await notice()).shown;

    // 実際の注意: 結合していないマスで「結合を解除」
    await fresh.locator("#blocks .block-content").first().click();
    await insertBlock(fresh, "table");
    const cell = fresh.locator('#blocks .block.type-table .editor-table [data-row="1"][data-cell="0"]');
    await cell.click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#table-toolbar .table-tool[data-tool="split"]').click();
    await fresh.waitForTimeout(150);
    const warned = await notice();
    const statusText = await fresh.locator("#status").textContent();
    result.warnShowsNotice = warned.shown && warned.inView;
    result.noticeMatchesStatus = warned.text === statusText && warned.text.length > 0;
    // 読み上げは #status が受け持つ(二重に読まれないように)
    result.noticeNotAnnouncedTwice = warned.ariaHidden === "true";
    result.noticeEvidence = warned;

    // クリックで消える
    if (warned.shown) await fresh.locator("#notice").click();
    await fresh.waitForTimeout(100);
    result.noticeClickDismisses = warned.shown && !(await notice()).shown;

    // 成功の知らせは画面に出さない(ブロックの選択などは頻繁で、出すとうるさい)
    await fresh.evaluate(() => document.querySelector("#doc-title").focus());
    await fresh.keyboard.type("x");
    await fresh.waitForTimeout(150);
    result.okStaysQuiet = !(await notice()).shown;

    // 時間が来ると消える(4秒)
    await cell.click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#table-toolbar .table-tool[data-tool="split"]').click();
    await fresh.waitForTimeout(150);
    const again = (await notice()).shown;
    await fresh.waitForTimeout(4300);
    result.noticeAutoHides = again && !(await notice()).shown;

    // 注意は画面に出るので日本語で書く(v181)。setStatus(…, "warn") の文字列をソースから拾い、
    // 英字を含むものは日本語も含むこと。エラーの中身をそのまま出す所は、
    // 日本語の前置きを付ける(この検査では、文字列のない呼び出しを「前置きなし」として数える)。
    const source = await readFile("editor-pwa/app.js", "utf8");
    const calls = [...source.matchAll(/setStatus\(((?:[^;]|\n)*?),\s*"warn"\)/g)].map((match) => match[1]);
    const japanese = /[ぁ-んァ-ヶー一-龠]/;
    // openErrorText(…) は日本語の前置きを付ける関数(開けなかったとき用)
    const englishOnly = calls.filter((args) => !args.trim().startsWith("openErrorText(")).filter((args) => {
      const literals = [...args.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
      if (!literals.length) return true;
      return literals.some((text) => /[A-Za-z]{3,}/.test(text) && !japanese.test(text)) && !literals.some((text) => japanese.test(text));
    });
    // Monolio の文書でない HTML を開いたときは、分かる言葉で知らせる
    await fresh.locator("#open-input").setInputFiles({ name: "plain.html", mimeType: "text/html", buffer: Buffer.from("<!doctype html><html><body><p>plain</p></body></html>") });
    await fresh.waitForTimeout(400);
    const openNotice = await notice();
    result.openNonDocumentExplains = openNotice.shown && openNotice.text === "開けませんでした: Monolio の文書ではありません";
    result.openNonDocumentEvidence = openNotice.text;
    result.warnMessagesAreJapanese = calls.length >= 20 && englishOnly.length === 0;
    result.warnMessagesEvidence = englishOnly.join(" | ");
  } finally {
    await fresh.close();
  }
  return result;
}
