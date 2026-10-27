// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- Markdown の書き出しと読み込み(Issue #192) ----
// File → 「Markdown に書き出す」: 全ページを1つの .md に(各ページは「# 題名」、中の見出しは1段下げる。表の式は計算した値、
// トグルは <details>、呼び出しは「> 絵文字 文」、数式は $…$ / $$…$$、Mermaid は ```mermaid、画像・添付は名前だけ、グラフは注記)。
// File → 「Markdown を読み込む…」: .md を今の文書の新しいページに(「# 」で始まるファイルは「# 」ごとのページ)。ブロックに分けるのは
// 外から貼った HTML と同じ変換(blocksFromPastedHtml)。デスクトップ版は添付の保存と同じ save_attachment で書き出す。
export default async function markdownSuite({ browser }) {
  const context = await browser.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1200, height: 860 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  let counter = 0;
  const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const openFile = async (path, title) => {
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    if (title) await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 8000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const openDoc = async (pages) => {
    const path = join(OUT, "markdown-doc-" + (counter += 1) + ".html");
    const literal = { pages, fonts: [], attachments: [] };
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    await openFile(path, pages[0].title);
  };
  // 書き出した .md の文字(ブラウザ版はダウンロード)
  const exportMarkdown = async () => {
    const download = fresh.waitForEvent("download");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-export-markdown").click();
    const file = await download;
    const path = join(DOWNLOADS, "markdown-export-" + (counter += 1) + ".md");
    await file.saveAs(path);
    return { name: file.suggestedFilename(), text: await readFile(path, "utf8"), path };
  };
  const importMarkdown = async (path) => {
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-import-markdown").click();
    await (await chooser).setFiles(path);
    await fresh.waitForTimeout(600);
  };
  // 保存した文書(Ctrl+S のダウンロードを開き直した形)
  const savedDoc = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "markdown-saved-" + (counter += 1) + ".html");
    await (await download).saveAs(path);
    return fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), await readFile(path, "utf8"));
  };
  const rows = (page) => page.blocks.map((b) => b.type + "@" + (b.indent || 0)
    + (b.checked !== undefined ? (b.checked ? "[x]" : "[ ]") : "") + (b.open !== undefined ? (b.open ? "(open)" : "(closed)") : "")
    + (b.icon ? "{" + b.icon + "}" : "")
    + " " + (b.type === "table" ? JSON.stringify(b.rows.map((r) => r.map((c) => c.text))) : (b.text || "")));

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 機能見本を書き出す: 形の要所(題名と見出しの段・書式・リスト・ToDo・トグル・呼び出し・表の式の値・数式・Mermaid・改ページ・
    //    目次・ページへのリンク・画像は名前だけ・ゴミ箱のページは書かない)
    const samplePath = resolve("docs/sample/monolio-features.html");
    await openFile(samplePath, "Monolio 機能見本");
    const sample = await exportMarkdown();
    const md = sample.text;
    const has = (text) => md.includes(text);
    result.markdownExportFileName = sample.name === "Monolio 機能見本.md";
    result.markdownExportShape = md.startsWith("# Monolio 機能見本\n") && has("\n## 文字の書式\n") && has("\n#### 見出し3\n") && has("\n###### 見出し5\n")
      && has("**太字**") && has("*斜体*") && has("<u>下線</u>") && has("~~取り消し線~~") && has("`npm run pwa:test`") && has("$E = mc^2$")
      && has("[Monolio のリポジトリ](https://github.com/woodenCaliper/Monolio)");
    result.markdownExportBlocks = has("- [x] 完了した作業\n- [ ] 未完了の作業") && has("\n1. 番号付きリスト\n   1. 階層番号(1.1)\n   2. 階層番号(1.2)\n2. 番号付きリスト(2)\n")
      && has("<details open>\n<summary>トグル(クリックで開閉)</summary>") && has("\n> 💡 呼び出し(コールアウト)") && has("\n```mermaid\nflowchart LR\n")
      && has("\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n") && has("\n<!-- pagebreak -->\n") && has("\n<!-- toc -->\n") && has("\n---\n");
    // 表は GFM の表。式は計算した値(画面と同じ。「計」の行は SUM の結果)、数の見せ方(桁区切り・%)もそのまま
    result.markdownExportTableValues = has("| 月 | 製品A | 製品B | 合計 |\n| --- | --- | --- | --- |\n| 1月 | 120 | 80 | 200 |") && has("| 計 | 600 | 445 | 1045 |")
      && has("| 佐藤 | 出席 | 72 | 合格 | 72.0% | 1,250,000 |") && !/=SUM|=IF|=COUNTIF/i.test(md) && has("*表1: 月別の売上");
    // ページは「# 題名」で並べ、ページのブロックは「#錨」へのリンク。画像・添付は名前だけ、グラフは注記。ゴミ箱のページは書かない
    result.markdownExportPagesAndFiles = has("\n# 図(Mermaid)の全種類\n") && has("\n# 仕様の詳細\n") && has("\n[仕様の詳細](#仕様の詳細)\n")
      && has("\n![system.png](system.png)\n") && has("\n[measurement.csv](measurement.csv)\n") && has("*(グラフ「月別の売上(縦棒)」。")
      && !has("\n# 古いメモ") && !has("data:image");
    result.markdownExportStatus = /Markdown に書き出しました/.test(await fresh.locator("#status").textContent());
    result.markdownExportEvidence = md.slice(0, 1500);

    // 2) 書き出した .md を読み込み直す(往復): 5ページが同じ題名で入り、ページの中のブロックの並び(種類と主な文字)が元と同じ
    const original = await fresh.evaluate((text) => {
      const fmt = window.SingleHtmlFormat;
      return fmt.pagesInReadingOrder(fmt.parsePortableHtml(text)).map((page) => ({ id: page.id, title: page.title, blocks: page.blocks }));
    }, await readFile(samplePath, "utf8"));
    await importMarkdown(sample.path);
    const imported = (await savedDoc()).pages.slice(-original.length);
    const signature = (blocks, titleOf) => {
      // 段組みは列ごとに並べ、題名(表は上・図は下)は段落、グラフ・添付は段落(注記・名前)になる
      const ordered = [];
      for (let i = 0; i < blocks.length;) {
        if (!blocks[i].columnGroup) { ordered.push(blocks[i]); i += 1; continue; }
        let end = i;
        while (end < blocks.length && blocks[end].columnGroup === blocks[i].columnGroup) end += 1;
        const group = blocks.slice(i, end);
        [...new Set(group.map((b) => b.columnIndex || 0))].sort((a, b) => a - b).forEach((col) => ordered.push(...group.filter((b) => (b.columnIndex || 0) === col)));
        i = end;
      }
      const out = [];
      ordered.forEach((b) => {
        const heading = /^(?:heading|toggleHeading)([1-5])$/.exec(b.type);
        const caption = typeof b.caption === "string" && b.caption.trim();
        if (heading) out.push("h" + heading[1] + " " + b.text);
        // 文字(text)が空で書式つきの本文(html)だけを持つ段落もある(見本の「通常の文字、太字…」)
        else if (b.type === "paragraph") { if ((b.text || "").trim() || (b.html || "").trim()) out.push("p"); }
        else if (b.type === "chart") out.push("p");
        else if (b.type === "attachment") out.push("p", ...(caption ? ["p"] : []));
        else if (b.type === "table") out.push(...(caption ? ["p"] : []), "table " + b.rows.length + "x" + Math.max(...b.rows.map((r) => r.length)));
        else if (["bullet", "numbered"].includes(b.type)) out.push(b.type + " " + b.text);
        else if (b.type === "todo") out.push("todo" + (b.checked ? "[x] " : "[ ] ") + b.text);
        else if (b.type === "toggle") out.push("toggle" + (b.open === false ? "(closed) " : "(open) ") + b.text);
        else if (b.type === "quote") { if ((b.text || "").trim()) out.push("quote " + b.text); }
        else if (b.type === "callout") out.push("callout{" + (b.icon || "💡") + "} " + b.text);
        else if (["code", "mermaid", "math"].includes(b.type)) out.push(b.type + " " + String(b.text).trim(), ...(b.type === "mermaid" && caption ? ["p"] : []));
        else if (b.type === "page") out.push("page " + titleOf(b.pageId));
        else out.push(b.type);
      });
      return out;
    };
    const titleIn = (pages) => (id) => pages.find((page) => page.id === id)?.title ?? "?";
    const originalTitles = original.map((page) => page.title);
    const importedTitles = imported.map((page) => page.title);
    const originalSigs = original.map((page) => signature(page.blocks, titleIn(original)));
    const importedSigs = imported.map((page) => signature(page.blocks, titleIn(imported)));
    result.markdownRoundTripPages = same(importedTitles, originalTitles);
    result.markdownRoundTripBlocks = originalSigs.map((sig, index) => same(sig, importedSigs[index]));
    result.markdownRoundTripEvidence = originalSigs.map((sig, index) => ({ title: originalTitles[index], diff: sig.map((line, at) => (line === importedSigs[index]?.[at] ? null : [at, line, importedSigs[index]?.[at]])).filter(Boolean).slice(0, 6), lengths: [sig.length, importedSigs[index]?.length] }));
    // 文の書式・文中の数式・呼び出しの絵文字は中身ごと戻る
    const firstImported = imported[0].blocks;
    const formatted = firstImported.find((b) => (b.text || "").startsWith("通常の文字"));
    const mathLine = firstImported.find((b) => (b.text || "").startsWith("インラインコード"));
    const warning = firstImported.find((b) => b.type === "callout" && b.icon === "⚠️");
    result.markdownRoundTripInline = /<b>太字<\/b>/.test(formatted?.html || "") && /<i>斜体<\/i>/.test(formatted?.html || "") && /<u>下線<\/u>/.test(formatted?.html || "")
      && /<s>取り消し線<\/s>/.test(formatted?.html || "") && /inline-math/.test(mathLine?.html || "") && (mathLine?.text || "").includes("$$E = mc^2$$")
      && /inline-code/.test(mathLine?.html || "") && Boolean(warning);
    result.markdownRoundTripInlineEvidence = { formatted: formatted?.html, math: mathLine?.text, warning };

    // 3) 記号の打ち消し: 段落の文字が Markdown の記号として読まれず、読み込み直すと同じ文字に戻る
    const tricky = ["# not heading", "1. not list", "- not bullet", "> not quote", "a*b*c and snake_case and __init__ and _x_", "price $5 and $6",
      "[x] brackets <tag> & &amp; and \\ back", "~~not strike~~ and 10~20", "---", "line one\nline two", "+ plus", "===", "    four spaces"];
    await openDoc([{ id: "T1", title: "Tricky", blocks: tricky.map((text, index) => P("t" + index, text)) }]);
    const trickyMd = (await exportMarkdown()).text;
    const trickyPath = join(OUT, "markdown-tricky.md");
    await writeFile(trickyPath, trickyMd, "utf8");
    await fresh.locator('#blocks .block-content[data-id="t12"]').click();
    await importMarkdown(trickyPath);
    const trickyBack = (await savedDoc()).pages.at(-1).blocks.filter((b) => b.type === "paragraph").map((b) => b.text);
    // 行頭の空白は、段落の頭の空白として残らない(Markdown の段落と同じ)。コードのブロックにはならない
    result.markdownEscapesRoundTrip = same(trickyBack, [...tricky.slice(0, -1), "four spaces"]);
    result.markdownEscapesEvidence = { md: trickyMd, back: trickyBack };

    // 3b) コードの言語(Issue #163)はフェンスの後ろに書き、読み込むと同じ言語のコードに戻る(#192 と #163 をつないだ。v284)
    await openDoc([{ id: "C1", title: "Code", blocks: [
      { id: "c1", type: "code", text: "def f(x):\n    return x", language: "python" },
      { id: "c2", type: "code", text: "plain text" },
      P("c3", "after"),
    ] }]);
    const codeMd = (await exportMarkdown()).text;
    const codePath = join(OUT, "markdown-code.md");
    await writeFile(codePath, codeMd, "utf8");
    await fresh.locator('#blocks .block-content[data-id="c3"]').click();
    await importMarkdown(codePath);
    const codeBack = (await savedDoc()).pages.at(-1).blocks.filter((b) => b.type === "code").map((b) => (b.language || "") + ":" + b.text);
    result.markdownCodeLanguageRoundTrip = codeMd.includes("```python\ndef f(x):") && same(codeBack, ["python:def f(x):\n    return x", ":plain text"]);
    result.markdownCodeLanguageEvidence = { md: codeMd.slice(0, 200), back: codeBack };

    // 4) ほかで書いた Markdown(GitHub の形)を読み込む: 「# 」で始まらないファイルは1ページ(題名はファイル名)。
    //    今のページのカーソルの所の空の段落が、読み込んだページへのリンクになる。Undo 1回で読み込む前へ
    const external = [
      "---", "title: 外部", "---", "",
      "Intro line one", "continues here.", "日本語の行が", "つながる。", "",
      "Setext Title", "============", "",
      "## Section", "",
      "**bold** and *it* and __b2__ and _i2_ and ~~del~~ and `code` and $x^2$ and <u>under</u>.", "", "Hard\\", "break and https://example.com/a.", "",
      "1. one", "2. two", "   - nested", "3. three", "",
      "- [ ] task", "- [x] done", "",
      "- item", "", "  > 💡 tip", "",
      "> quote line", "> continues", "",
      "> [!WARNING]", "> careful", "",
      "| A | B |", "|:--|--:|", "| 1 | 2 |", "| x \\| y | z |", "",
      "```js", "const a = 1;", "```", "",
      "```mermaid", "graph TD; A-->B", "```", "",
      "$$", "a + b", "$$", "",
      "***", "",
      "<details>", "<summary>More</summary>", "", "hidden text", "", "</details>", "",
      "![alt text](pic.png)", "",
      "    indented code", "",
      "<script>window.__pwned = 1</script> <img src=x onerror=\"window.__pwned = 2\"> [bad](javascript:alert(1))",
    ].join("\n");
    const externalPath = join(OUT, "external.md");
    await writeFile(externalPath, external, "utf8");
    await openDoc([{ id: "E1", title: "Host", blocks: [P("a", "before"), P("b", ""), P("z", "after")] }]);
    await fresh.locator('#blocks .block-content[data-id="b"]').click();
    await importMarkdown(externalPath);
    const afterImport = await savedDoc();
    const ext = afterImport.pages.at(-1);
    const extRows = rows(ext);
    result.markdownImportExternal = ext.title === "external" && same(extRows, [
      "code@0 title: 外部",
      "paragraph@0 Intro line one continues here. 日本語の行がつながる。",
      "heading1@0 Setext Title",
      "heading2@0 Section",
      "paragraph@0 bold and it and b2 and i2 and del and `code` and $$x^2$$ and under.",
      "paragraph@0 Hard\nbreak and https://example.com/a.",
      "numbered@0 one", "numbered@0 two", "bullet@1 nested", "numbered@0 three",
      "todo@0[ ] task", "todo@0[x] done",
      // リストの項目の中の呼び出しは、項目の子(1段下)
      "bullet@0 item", "callout@1{💡} tip",
      "quote@0 quote line continues",
      "callout@0{⚠️} careful",
      'table@0 [["A","B"],["1","2"],["x | y","z"]]',
      "code@0 const a = 1;",
      "mermaid@0 graph TD; A-->B",
      "math@0 a + b",
      "divider@0 ",
      "toggle@0(closed) More", "paragraph@1 hidden text",
      "paragraph@0 (画像: alt text)",
      "code@0 indented code",
      'paragraph@0 <script>window.__pwned = 1</script> <img src=x onerror="window.__pwned = 2"> bad',
    ]);
    result.markdownImportExternalEvidence = { title: ext.title, rows: extRows };
    const inlineHtml = ext.blocks.find((b) => (b.text || "").startsWith("bold"))?.html || "";
    const linkHtml = ext.blocks.find((b) => (b.text || "").startsWith("Hard"))?.html || "";
    result.markdownImportInlineFormats = ["<b>bold</b>", "<i>it</i>", "<b>b2</b>", "<i>i2</i>", "<s>del</s>", "<u>under</u>", "inline-code", "inline-math"].every((part) => inlineHtml.includes(part))
      && linkHtml.includes('href="https://example.com/a."') === false && linkHtml.includes('href="https://example.com/a"') && linkHtml.includes("<br>");
    result.markdownImportInlineEvidence = { inlineHtml, linkHtml };
    // 生の HTML・危ないリンクは文字のまま(何も実行しない)
    result.markdownImportRunsNothing = (await fresh.evaluate(() => window.__pwned || 0)) === 0 && !/javascript:/i.test(JSON.stringify(ext.blocks.map((b) => b.html || "")));
    // 空の段落がページへのリンクになり、読み込んだページへ移っている
    const host = afterImport.pages[0];
    result.markdownImportLinksFromCaret = same(rows(host), ["paragraph@0 before", "page@0 ", "paragraph@0 after"]) && host.blocks[1].pageId === ext.id
      && (await fresh.locator("#doc-title").textContent()) === "external";
    result.markdownImportLinksEvidence = rows(host);
    // Undo 1回で読み込む前(1ページ・空の段落)へ
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(400);
    const undone = await savedDoc();
    result.markdownImportUndoIsOneStep = undone.pages.length === 1 && same(rows(undone.pages[0]), ["paragraph@0 before", "paragraph@0 ", "paragraph@0 after"]);
    result.markdownImportUndoEvidence = { pages: undone.pages.map((page) => page.title), rows: rows(undone.pages[0]) };

    // 5) 1つのファイルに「# 」が2つ: 2ページに分け、中の見出しは1段上げる。ページのリンク(#錨)はページのブロックに戻る
    const twoPath = join(OUT, "two-pages.md");
    await writeFile(twoPath, "# 親\n\n## 節\n\n[子](#子)\n\n# 子\n\n### 小節\n\n本文\n", "utf8");
    await openDoc([{ id: "H1", title: "Host2", blocks: [P("a", "x")] }]);
    await fresh.locator('#blocks .block-content[data-id="a"]').click();
    await importMarkdown(twoPath);
    const two = await savedDoc();
    const [parent, child] = two.pages.slice(-2);
    result.markdownImportSplitsPages = two.pages.length === 3 && parent.title === "親" && child.title === "子"
      && same(rows(parent), ["heading1@0 節", "page@0 "]) && parent.blocks[1].pageId === child.id && same(rows(child), ["heading2@0 小節", "paragraph@0 本文"])
      // 子は親のページからリンクされるので、今のページには親へのリンクだけを置く
      && same(rows(two.pages[0]), ["paragraph@0 x", "page@0 "]) && two.pages[0].blocks[1].pageId === parent.id;
    result.markdownImportSplitsEvidence = two.pages.map((page) => ({ title: page.title, rows: rows(page) }));

    // 6) ロックしたページでは読み込まない(ファイルを選ぶ画面も出さない)
    await openDoc([{ id: "L1", title: "Locked", locked: true, blocks: [P("a", "x")] }]);
    let chooserShown = false;
    const watch = fresh.waitForEvent("filechooser", { timeout: 800 }).then(() => { chooserShown = true; }).catch(() => {});
    await openMenu(fresh, "file");
    await fresh.locator("#menu-import-markdown").click();
    await watch;
    result.markdownImportRefusedOnLockedPage = !chooserShown && /ロック/.test(await fresh.locator("#status").textContent());

    // 7) 外から貼った HTML(同じ変換を使う): <aside> の頭の絵文字は呼び出しの絵文字に、```mermaid・```math の <pre> は図・数式に、
    //    文中の数式(data-tex の印)は数式のまま
    await openDoc([{ id: "C1", title: "PasteHost", blocks: [P("a", "before"), P("b", ""), P("z", "after")] }]);
    await fresh.locator('#blocks .block-content[data-id="b"]').click();
    await fresh.evaluate((value) => {
      window.addEventListener("copy", (event) => {
        Object.entries(value).forEach(([type, text]) => event.clipboardData.setData(type, text));
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { once: true, capture: true });
    }, { "text/plain": "x\ny", "text/html": '<aside>💡 Tip text</aside><pre><code class="language-mermaid">graph TD; A-->B</code></pre><pre><code class="language-math">a^2</code></pre><p>math <span class="inline-math" data-tex="x^2">x2</span> end</p>' });
    await fresh.keyboard.press("Control+c");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const pasted = rows((await savedDoc()).pages[0]);
    result.markdownPasteHtmlSharesConverter = same(pasted, ["paragraph@0 before", "callout@0{💡} Tip text", "mermaid@0 graph TD; A-->B", "math@0 a^2", "paragraph@0 math $$x^2$$ end", "paragraph@0 after"]);
    result.markdownPasteHtmlEvidence = pasted;

    result.markdownNoPageErrors = pageErrors.length === 0;
    result.markdownPageErrorsEvidence = { errors: pageErrors };
  } finally {
    await context.close();
  }

  // 8) デスクトップ版: 書き出しは「名前を付けて保存」の画面(save_attachment。添付の保存と同じコマンド)。ブラウザのダウンロードは使わない
  const desktopContext = await browser.newContext({ acceptDownloads: true });
  try {
    const desk = await desktopContext.newPage();
    let browserDownloads = 0;
    desk.on("download", () => { browserDownloads += 1; });
    await desk.addInitScript(() => {
      window.__desktopCalls = [];
      window.__TAURI__ = {
        core: {
          invoke: async (command, args, options) => {
            window.__desktopCalls.push({ command, text: args instanceof Uint8Array ? new TextDecoder().decode(args) : null, header: options?.headers?.["x-file-name"] ?? null });
            return command === "save_attachment" ? "C:\\saved\\Untitled.md" : null;
          },
        },
      };
    });
    await desk.goto(`http://127.0.0.1:${PORT}/`);
    await desk.waitForSelector("#blocks .block-content");
    await openMenu(desk, "file");
    await desk.locator("#menu-export-markdown").click();
    await desk.waitForTimeout(400);
    const calls = await desk.evaluate(() => window.__desktopCalls.filter((call) => call.command === "save_attachment"));
    result.markdownDesktopUsesSaveDialog = calls.length === 1 && decodeURIComponent(calls[0].header || "") === "Untitled.md"
      && (calls[0].text || "").startsWith("# Untitled\n") && (calls[0].text || "").includes("\n- [ ] 単一HTMLとして保存する") && browserDownloads === 0
      && /C:\\saved\\Untitled\.md/.test(await desk.locator("#status").textContent());
    result.markdownDesktopEvidence = { calls, browserDownloads };
  } finally {
    await desktopContext.close();
  }
  return result;
}
