// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT } from "../lib.mjs";

// ---- 保存HTMLの中の文書データ(manifest)の埋め込み(v213) ----
// 文書のデータは <script type="application/…+json"> に JSON で埋める。以前は小文字の "</script" しか置き換えて
// いなかったので、本文に "</SCRIPT>"(大文字)や "<!--<script>" を書くとスクリプトが途中で閉じ、
// 保存したファイルが開けなくなっていた(中身は manifest にしか無いので、実質失われる)。閉じた後ろの文字は
// HTML として読まれ、保存HTMLを開くとスクリプトが動いた。いまは JSON の "<" をすべて \u003c にする。
export default async function saveEscapeSuite({ context }) {
  const fresh = await context.newPage();
  const errors = [];
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const nasty = [
      "a </SCRIPT><img src=x onerror=\"window.__pagelithXss = 1\"> b",
      "x <!--<script> y",
      "c </Script > d",
      "e </script\tf",
    ];
    const roundTrip = await fresh.evaluate((texts) => {
      const fmt = window.SingleHtmlFormat;
      const doc = { fonts: [], pages: [{ id: "E1", title: texts[0], blocks: [
        ...texts.map((text, index) => ({ id: "p" + index, type: "paragraph", text })),
        { id: "c1", type: "code", text: texts[1] },
        { id: "t1", type: "table", text: "", caption: texts[2], rows: [[{ text: texts[3] }, { text: "b" }]] },
      ] }], attachments: [{ id: "a1", name: texts[0] + ".txt", type: "text/plain", chunks: ["eA=="] }] };
      const html = fmt.buildPortableHtml(doc);
      try {
        const back = fmt.parsePortableHtml(html);
        const blocks = back.pages[0].blocks;
        return {
          html,
          ok: blocks.slice(0, texts.length).every((block, index) => block.text === texts[index])
            && blocks.find((block) => block.id === "c1")?.text === texts[1]
            && blocks.find((block) => block.id === "t1")?.caption === texts[2]
            && blocks.find((block) => block.id === "t1")?.rows?.[0]?.[0]?.text === texts[3]
            && back.pages[0].title === texts[0]
            && back.attachments[0]?.name === texts[0] + ".txt",
        };
      } catch (error) {
        return { html, ok: false, error: String(error) };
      }
    }, nasty);
    result.savedFileReopensWithScriptLikeText = roundTrip.ok;
    result.saveEscapeEvidence = roundTrip.error || "";

    // 保存HTMLをブラウザで開いても、本文の文字がスクリプトとして動かず、読み込みのエラーも出ない
    const file = join(OUT, "save-escape.html");
    await writeFile(file, roundTrip.html, "utf8");
    const view = await context.newPage();
    view.on("pageerror", (error) => errors.push(error.message));
    await view.goto("file://" + file);
    await view.waitForTimeout(400);
    const viewState = await view.evaluate(() => ({
      xss: window.__pagelithXss === 1,
      img: document.querySelectorAll("img[onerror]").length,
      text: document.querySelector("main")?.textContent || "",
    }));
    await view.close();
    result.savedFileDoesNotRunBodyText = !viewState.xss && viewState.img === 0 && errors.length === 0
      && viewState.text.includes("</SCRIPT>");
    result.saveEscapeViewEvidence = { ...viewState, text: viewState.text.slice(0, 120), errors };
  } finally {
    await fresh.close();
  }
  return result;
}
