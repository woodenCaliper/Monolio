// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PORT } from "../lib.mjs";

// ---- AI 向けの案内(docs/format/index.md。保存ファイルの注釈のリンク先)の例が、そのまま動くこと ----
// ユーザー「AI 向けのドキュメントを用意してほしい。MONOLIO の操作方法のようなもの」→「リンクのようなものを一つ書いておいて、それを読んでもらう形」。
// 案内の書き戻しの例(```js)を、ファイル名だけ差し替えて
// そのまま実行し、提案の例(```json の "suggestions")を足した文書を Monolio で開いて、提案が出ることを見る。保存の形が変わって
// 手引きが古くなったら、ここが赤になる(手引きも直すこと)。
export default async function aiGuideSuite({ context }) {
  const result = {};
  // 改行は LF にそろえて読む(Windows の作業フォルダでは CRLF で取り出され、下の ```json\n などの読み取りが外れていた)。
  const guide = (await readFile(fileURLToPath(new URL("../../../docs/format/index.md", import.meta.url)), "utf8")).replace(/\r\n/g, "\n");
  const work = await mkdtemp(join(tmpdir(), "monolio-guide-"));
  const file = join(work, "文書.html").replace(/\\/g, "/");
  const fresh = await context.newPage();
  const errors = [];
  fresh.on("pageerror", (error) => errors.push(error.message));
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1440, height: 900 });
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await writeFile(file, await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "G", title: "手引きの確かめ", blocks: [
      { id: "p1", type: "paragraph", text: "The test was run at 25℃, measuring each case three times." },
      { id: "t1", type: "table", tableHeader: true, rows: [[{ text: "条件" }, { text: "電圧" }, { text: "合計" }], [{ text: "A" }, { text: "12" }, { text: "=B2*2" }]] },
      { id: "p2", type: "paragraph", text: "Results are written down by hand." },
    ] }], fonts: [], attachments: [] })), "utf8");

    // 1) 書き戻しの例(5 章)
    const snippet = guide.match(/```js\n([\s\S]*?)```/)?.[1] || "";
    const runnable = snippet.replace('const file = "document.html";', "const file = " + JSON.stringify(file) + ";");
    await writeFile(join(work, "snippet.mjs"), runnable, "utf8");
    let snippetError = "";
    try {
      execFileSync(process.execPath, [join(work, "snippet.mjs")], { cwd: work, stdio: "pipe" });
    } catch (error) {
      snippetError = String(error.stderr || error.message).slice(0, 300);
    }
    const manifestOf = (html) => {
      const marker = 'id="document-manifest">';
      const start = html.indexOf(marker) + marker.length;
      return { start, end: html.indexOf("</script>", start), doc: JSON.parse(html.slice(start, html.indexOf("</script>", start))) };
    };
    const afterSnippet = manifestOf(await readFile(file, "utf8"));
    result.aiGuideSnippetAddsSuggestion = runnable !== snippet && !snippetError && afterSnippet.doc.suggestions?.length === 1
      && afterSnippet.doc.suggestions[0].changes[0].op === "setCell";
    result.aiGuideSnippetEvidence = snippetError || JSON.stringify(afterSnippet.doc.suggestions?.[0]?.title ?? null);

    // 2) 提案の例(3 章)を足す(本文の JSON の一部なので { } で包んで読む)
    const fragment = guide.match(/```json\n("suggestions": \[[\s\S]*?\])\n```/)?.[1] || "";
    const example = JSON.parse("{" + fragment + "}").suggestions;
    const html = await readFile(file, "utf8");
    const { start, end, doc } = manifestOf(html);
    doc.suggestions = [...(doc.suggestions || []), ...example];
    await writeFile(file, html.slice(0, start) + JSON.stringify(doc, null, 2).replace(/</g, "\\u003c") + html.slice(end), "utf8");

    // 3) Monolio で開く
    const text = await readFile(file, "utf8");
    await fresh.evaluate((value) => {
      window.showOpenFilePicker = async () => [{ kind: "file", name: "文書.html", getFile: async () => new File([value], "文書.html", { type: "text/html" }) }];
    }, text);
    await fresh.locator("#menu-file-button").click();
    await fresh.locator("#menu-open-document").click();
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "手引きの確かめ", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    const view = await fresh.evaluate(() => ({
      sections: [...document.querySelectorAll("#suggest-pane .sg-title")].map((node) => node.textContent),
      toggle: document.querySelector("#suggest-toggle")?.textContent,
      ghost: [...document.querySelectorAll(".block.sg-block-ins .block-content")].map((node) => node.textContent),
      deleted: Boolean(document.querySelector('.block[data-id="p2"].sg-block-del')),
      p1Diff: document.querySelectorAll('.block[data-id="p1"] .sg-ins').length,
      stale: [...document.querySelectorAll("#suggest-pane .sg-count")].some((node) => /古い|合わない/.test(node.textContent)),
    }));
    result.aiGuideExampleOpensAsSuggestions = example.length === 1 && example[0].changes.length === 4
      && view.sections.join(",") === "Show voltages with one decimal place,Align the test conditions with the standard" && view.toggle === "提案 6"
      && view.ghost.join(",") === "Warm up the unit before measuring." && view.deleted && view.p1Diff === 2 && !view.stale;
    result.aiGuideEvidence = view;
    // 4) 保存ファイルの先頭の注釈は、構成の事実とこの案内へのリンク(読み方・直し方の決まりはファイルに書かない)
    const head = text.slice(0, text.indexOf("-->") + 3);
    result.aiGuideLinkInFile = head.includes("Format and editing guide: https://woodencaliper.github.io/Monolio/format/")
      && head.includes("Monolio reads only the JSON") && !head.includes("To propose edits");
    result.aiGuideHeadEvidence = head.length + " chars";
    result.aiGuideNoPageErrors = errors.length === 0;
    result.aiGuideErrors = errors.slice(0, 3).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
