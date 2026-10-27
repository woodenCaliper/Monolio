// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- コードの言語と色分け(Issue #163。保存形式 0.8.21) ----
// コードのブロックに言語(language)を持たせ、字句(キーワード・文字列・注釈・数など)に色を付ける。既定は書式なし(Plain text)。
// エディタは CSS Custom Highlight API で塗り、本文の DOM は素の文字のまま(キャレット・IME・Undo・コピー・検索は今までどおり)。
// 保存HTMLは <span class="tok-…"> の印を書く(スクリプトなしで同じ色。P7)。言語はコードの箱の右上のボタン(Notion と同じく行に乗ったときに出る)で選ぶ。
// Notion のコードの言語・HTML の class="language-…"・「```js」も言語になる。
// 色が本当に画面に出ているかは、文字の位置の画素を見て確かめる(Range が登録されているだけでは塗られない場合を見逃さないため)。
const NOTION_FIXTURE = fileURLToPath(new URL("../fixtures/notion-clipboard.json", import.meta.url));

export default async function codeHighlightSuite({ browser }) {
  // コピーの結果(素の文字)を読むため、クリップボードを許した別の文脈で動かす。
  const context = await browser.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  const cdp = await context.newCDPSession(fresh);
  await cdp.send("Performance.enable");
  const taskSeconds = async () => (await cdp.send("Performance.getMetrics")).metrics.find((item) => item.name === "TaskDuration")?.value ?? 0;
  const result = {};
  const fixture = JSON.parse(await readFile(NOTION_FIXTURE, "utf8"));
  const doc = (title, blocks) => ({ pages: [{ id: "P", title, blocks }], fonts: [], attachments: [] });
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((value) => window.SingleHtmlFormat.buildPortableHtml(value), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    const lastId = literal.pages[0].blocks.at(-1).id;
    await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), lastId, { timeout: 30000 });
    await fresh.waitForTimeout(300);
  };
  const saveHtml = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, name);
    await (await download).saveAs(path);
    return { path, html: await readFile(path, "utf8") };
  };
  const contentOf = (id) => '#blocks .block-content[data-id="' + id + '"]';
  const rowOf = (id) => '#blocks .block[data-id="' + id + '"]';
  // 開いている文書のブロック(保存せずにメモリ上の値。開き直しの無害化で不具合が隠れないように)。
  const liveBlock = (id) => fresh.evaluate((blockId) => {
    const copy = window.__docEditorPages.documentCopy();
    return copy.pages.flatMap((page) => page.blocks).find((block) => block.id === blockId) || null;
  }, id);
  // エディタの塗り: 本文の中の Range を「始め:終わり:種類」で並べたものと、同じ文字から fmt.codeTokens で作ったものを比べる。
  const paintOf = (id, language) => fresh.evaluate(({ blockId, lang }) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    const offsetOf = (node, offset) => {
      const probe = document.createRange();
      probe.selectNodeContents(editable);
      probe.setEnd(node, offset);
      return probe.toString().length;
    };
    const painted = [];
    const words = [];
    let minStart = Infinity;
    let maxEnd = -1;
    for (const [name, set] of CSS.highlights) {
      if (!name.startsWith("code-")) continue;
      for (const range of set) {
        if (!editable.contains(range.startContainer)) continue;
        const start = offsetOf(range.startContainer, range.startOffset);
        const end = offsetOf(range.endContainer, range.endOffset);
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, end);
        painted.push(start + ":" + end + ":" + name.slice(5));
        words.push([name.slice(5), range.toString()]);
      }
    }
    painted.sort();
    const text = editable.textContent;
    const tokens = window.SingleHtmlFormat.codeTokens(text, lang);
    // 塗るのは見える所(と上下)だけなので、塗った範囲の中の字句と比べ、見えている所が塗った範囲に入っているかも見る。
    const expected = [];
    for (let k = 0; k < tokens.length; k += 3) {
      if (tokens[k] >= minStart && tokens[k + 1] <= maxEnd) expected.push(tokens[k] + ":" + tokens[k + 1] + ":" + tokens[k + 2]);
    }
    expected.sort();
    const rect = editable.getBoundingClientRect();
    // 見えている所は、本文をスクロールする入れ物の箱の内側(上の帯の下)。
    let scroller = editable.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const clip = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const yTop = Math.max(rect.top, clip.top, 0) + 4;
    const yBottom = Math.min(rect.bottom, clip.bottom, innerHeight) - 4;
    let visible = null;
    if (yBottom > yTop) {
      // 上に重なる帯(ツールバーなど)の下から測る(本文に当たるまで下・上へずらす)。
      const at = (y, step) => {
        for (let k = 0; k < 40; k += 1) {
          const range = document.caretRangeFromPoint(rect.left + 16, y + step * k);
          if (range && editable.contains(range.startContainer)) return offsetOf(range.startContainer, range.startOffset);
        }
        return null;
      };
      visible = { start: at(yTop, 8), end: at(yBottom, -8) };
    }
    const covers = !visible || (visible.start !== null && visible.end !== null && minStart <= visible.start + 40 && maxEnd >= visible.end);
    return { painted, expected, words, text, total: tokens.length / 3, visible, minStart, maxEnd, covers,
      same: painted.length > 0 && JSON.stringify(painted) === JSON.stringify(expected) && covers,
      all: painted.length === tokens.length / 3,
      elementChildren: [...editable.querySelectorAll("*")].filter((node) => node.nodeName !== "BR").length };
  }, { blockId: id, lang: language });
  const hasWord = (paint, kind, word) => paint.words.some(([k, w]) => k === kind && w === word);
  // 文字の位置の画素の色。赤(キーワード)・青(文字列)などが画面に出ているか。
  const pixelStats = async (page, selector, needle) => {
    const rect = await page.evaluate(({ sel, word }) => {
      const host = document.querySelector(sel);
      if (!host) return null;
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.nodeValue.indexOf(word);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + word.length);
        range.startContainer.parentElement.scrollIntoView({ block: "center" });
        const box = range.getBoundingClientRect();
        return { x: box.left, y: box.top, width: Math.max(1, box.width), height: Math.max(1, box.height) };
      }
      return null;
    }, { sel: selector, word: needle });
    if (!rect) return null;
    const shot = await page.screenshot({ clip: rect });
    return page.evaluate(async (b64) => {
      const image = new Image();
      image.src = "data:image/png;base64," + b64;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let blue = 0;
      let dark = 0;
      for (let k = 0; k < data.length; k += 4) {
        const [r, g, b] = [data[k], data[k + 1], data[k + 2]];
        if (r > g + 70 && r > b + 60) red += 1;
        if (b > r + 50 && b > g + 20) blue += 1;
        if (r < 90 && g < 90 && b < 90 && Math.abs(r - b) < 25) dark += 1;
      }
      return { red, blue, dark };
    }, shot.toString("base64"));
  };
  const caretOffset = (id) => fresh.evaluate((blockId) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    const selection = getSelection();
    if (!selection.rangeCount || !editable.contains(selection.anchorNode)) return null;
    const probe = document.createRange();
    probe.selectNodeContents(editable);
    probe.setEnd(selection.anchorNode, selection.anchorOffset);
    return probe.toString().length;
  }, id);
  const placeCaretAt = (id, offset) => fresh.evaluate(({ blockId, at }) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    editable.focus();
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
    let total = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (at <= total + node.nodeValue.length) {
        getSelection().collapse(node, at - total);
        return true;
      }
      total += node.nodeValue.length;
    }
    return false;
  }, { blockId: id, at: offset });
  const frames = (count = 2) => fresh.evaluate((n) => new Promise((resolve) => {
    const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
    step(n);
  }), count);
  const editableText = (id) => fresh.evaluate((selector) => document.querySelector(selector)?.textContent ?? null, contentOf(id));

  const PY = "def greet(name):\n    # say hi\n    return 'hi ' + name * 42";
  const JS = "const answer = 42; // note\nfunction f() { return \"s\"; }";
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 字句の分け方(エディタと保存HTMLが共有する fmt.codeTokens)。言語ごとに代表の字句が正しい種類になる。
    const tokenChecks = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const cases = {
        javascript: ["const x = 1; // c\nlet s = `t`; f('a')", [["keyword", "const"], ["number", "1"], ["comment", "// c"], ["string", "`t`"], ["function", "f"], ["string", "'a'"]]],
        typescript: ["interface A { n: number }\nconst a = null as A;", [["keyword", "interface"], ["keyword", "number"], ["number", "null"], ["keyword", "as"]]],
        python: ["@deco\ndef f(x):\n    \"\"\"doc\"\"\"\n    return None  # c", [["meta", "@deco"], ["keyword", "def"], ["function", "f"], ["string", "\"\"\"doc\"\"\""], ["number", "None"], ["comment", "# c"]]],
        c: ["#include <stdio.h>\nint main(void) { return 0; /* c */ }", [["meta", "#include <stdio.h>"], ["keyword", "int"], ["function", "main"], ["number", "0"], ["comment", "/* c */"]]],
        cpp: ["class A { bool b = nullptr; };", [["keyword", "class"], ["keyword", "bool"], ["number", "nullptr"]]],
        csharp: ["public class A { string s = @\"x\"; }", [["keyword", "public"], ["keyword", "string"], ["string", "@\"x\""]]],
        java: ["@Override public void run() { int n = 10; }", [["meta", "@Override"], ["keyword", "void"], ["function", "run"], ["number", "10"]]],
        go: ["func main() { s := `raw`; return nil }", [["keyword", "func"], ["string", "`raw`"], ["number", "nil"]]],
        rust: ["fn main() { let c = 'c'; println!(\"x\"); }", [["keyword", "fn"], ["keyword", "let"], ["string", "'c'"], ["function", "println"], ["string", "\"x\""]]],
        json: ["{ \"name\": \"M\", \"n\": 1.5, \"ok\": true }", [["attr", "\"name\""], ["string", "\"M\""], ["number", "1.5"], ["number", "true"]]],
        html: ["<div class=\"a\">x &amp; y<!-- c --></div>", [["tag", "<div"], ["attr", "class"], ["string", "\"a\""], ["meta", "&amp;"], ["comment", "<!-- c -->"]]],
        xml: ["<?xml version=\"1.0\"?><a b='1'/>", [["meta", "<?xml version=\"1.0\"?>"], ["tag", "<a"], ["attr", "b"], ["string", "'1'"]]],
        css: [".box:hover { color: #fff; width: calc(100% - 2px); }", [["tag", ".box"], ["meta", ":hover"], ["attr", "color"], ["number", "#fff"], ["function", "calc"], ["number", "100%"]]],
        sql: ["SELECT COUNT(*) FROM t WHERE a = 'x' -- c", [["keyword", "SELECT"], ["function", "COUNT"], ["keyword", "FROM"], ["string", "'x'"], ["comment", "-- c"]]],
        bash: ["#!/bin/sh\nNAME=\"w\"\nif [ -n \"$NAME\" ]; then echo $NAME; fi # c", [["meta", "#!/bin/sh"], ["variable", "NAME"], ["string", "\"w\""], ["keyword", "if"], ["variable", "$NAME"], ["comment", "# c"]]],
        yaml: ["# c\nname: Monolio\nok: true\nref: *a", [["comment", "# c"], ["attr", "name"], ["number", "true"], ["variable", "*a"]]],
        markdown: ["# Title\n- item **b** `code`", [["heading", "# Title"], ["keyword", "-"], ["variable", "**b**"], ["string", "`code`"]]],
      };
      const out = {};
      for (const [lang, [text, expected]] of Object.entries(cases)) {
        const tokens = fmt.codeTokens(text, lang);
        const got = [];
        for (let k = 0; k < tokens.length; k += 3) got.push([tokens[k + 2], text.slice(tokens[k], tokens[k + 1])]);
        out[lang] = expected.every(([kind, word]) => got.some(([k, w]) => k === kind && w === word));
        if (!out[lang]) out[lang + "Got"] = JSON.stringify(got);
      }
      out.plainHasNoTokens = fmt.codeTokens("def x(): return 1", "").length === 0 && fmt.codeTokens("def x()", "kotlin").length === 0;
      out.languageCount = fmt.CODE_LANGUAGES.length;
      return out;
    });
    result.codeTokensPerLanguage = Object.entries(tokenChecks).filter(([key]) => !key.endsWith("Got") && key !== "languageCount").map(([, value]) => value === true);
    result.codeTokensEvidence = JSON.stringify(Object.fromEntries(Object.entries(tokenChecks).filter(([key, value]) => key.endsWith("Got") || value === false)));
    result.codeLanguageListHasCommonLanguages = tokenChecks.languageCount >= 17;
    // 名前から id(Notion の言語名・Markdown の別名・HTML の class)。知らない名前・Plain Text は書式なし。
    result.codeLanguageNamesMapped = await fresh.evaluate(() => {
      const id = window.SingleHtmlFormat.codeLanguageId;
      return id("Python") === "python" && id("C++") === "cpp" && id("C#") === "csharp" && id("Shell") === "bash" && id("js") === "javascript"
        && id("language-ts") === "typescript" && id("YML") === "yaml" && id("Plain Text") === "" && id("Kotlin") === "" && id(null) === "";
    });

    // 2) エディタ: 言語のあるコードは塗られ、本文の DOM は素の文字のまま。書式なしのコードは塗らない。
    await openLiteral(doc("コードの色", [
      { id: "c1", type: "code", text: PY, language: "python" },
      { id: "c2", type: "code", text: JS, language: "javascript" },
      { id: "c3", type: "code", text: "def plain(): return 1" },
      { id: "c4", type: "paragraph", text: "後ろの段落" },
    ]), "code-hl-basic.html");
    const pyPaint = await paintOf("c1", "python");
    const jsPaint = await paintOf("c2", "javascript");
    const plainPaint = await paintOf("c3", "");
    result.codeEditorPaintsTokens = pyPaint.same && pyPaint.all && jsPaint.same && jsPaint.all && hasWord(pyPaint, "keyword", "def") && hasWord(pyPaint, "string", "'hi '")
      && hasWord(pyPaint, "comment", "# say hi") && hasWord(pyPaint, "number", "42") && hasWord(jsPaint, "comment", "// note");
    result.codeEditorPaintEvidence = JSON.stringify({ py: pyPaint.words, js: jsPaint.words });
    result.codeEditorDomStaysPlain = pyPaint.elementChildren === 0 && jsPaint.elementChildren === 0 && pyPaint.text === PY;
    result.codePlainBlockUnpainted = plainPaint.painted.length === 0;
    // 色が画面に出ている(キーワードの def は赤い画素を含む。書式なしの def は含まない)。
    const editorDef = await pixelStats(fresh, contentOf("c1"), "def");
    const editorString = await pixelStats(fresh, contentOf("c2"), "\"s\"");
    const plainDef = await pixelStats(fresh, contentOf("c3"), "def");
    // (Windows の文字の縁取り(ClearType)で、色の無い文字の縁にも少し色の画素が出るので、書式なしの同じ文字と比べる)
    result.codeEditorPixelsColored = Boolean(editorDef && plainDef && editorDef.red >= 10 && editorDef.red > plainDef.red * 3
      && editorString && editorString.blue >= 10 && plainDef.dark > 3 && editorDef.dark < plainDef.dark);
    result.codeEditorPixelEvidence = JSON.stringify({ editorDef, editorString, plainDef });

    // 3) 言語のボタン: 本文の外にあり、ふだんは隠れ、行に乗ると出る。押すと一覧(絞り込みの欄に入力)。
    const buttonInfo = await fresh.evaluate((selector) => {
      const row = document.querySelector(selector);
      const button = row.querySelector(":scope > .code-lang-button");
      return { outside: Boolean(button) && !row.querySelector(".block-content .code-lang-button"), label: button?.textContent || "",
        hidden: button ? getComputedStyle(button).visibility : "" };
    }, rowOf("c1"));
    await fresh.locator(contentOf("c4")).click();
    await fresh.locator(contentOf("c1")).hover();
    await fresh.waitForTimeout(100);
    const shownOnHover = await fresh.evaluate((selector) => getComputedStyle(document.querySelector(selector + " > .code-lang-button")).visibility, rowOf("c1"));
    result.codeLanguageButtonOutsideContent = buttonInfo.outside && buttonInfo.label === "Python" && buttonInfo.hidden === "hidden" && shownOnHover === "visible";
    result.codeLanguageButtonEvidence = JSON.stringify({ ...buttonInfo, shownOnHover });
    // キャレットを 1 行目の「greet」の後ろ(9)に置いてから開き、「rus」で絞って Enter → Rust。キャレットは元の位置へ戻る。
    await placeCaretAt("c1", 9);
    await fresh.locator(contentOf("c1")).hover();
    await fresh.locator(rowOf("c1") + " > .code-lang-button").click();
    await fresh.waitForTimeout(150);
    const pickerOpen = await fresh.evaluate(() => {
      const picker = document.querySelector("#code-lang-picker");
      return { open: Boolean(picker && !picker.hidden), focused: document.activeElement?.classList.contains("code-lang-filter"),
        first: picker?.querySelector(".code-lang-choice")?.textContent || "", active: picker?.querySelector(".code-lang-choice.active")?.dataset.language,
        count: picker?.querySelectorAll(".code-lang-choice").length || 0 };
    });
    await fresh.keyboard.type("rus");
    await fresh.waitForTimeout(100);
    const filtered = await fresh.evaluate(() => [...document.querySelectorAll("#code-lang-picker .code-lang-choice")].map((node) => node.dataset.language));
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const afterPick = {
      block: await liveBlock("c1"),
      label: await fresh.evaluate((selector) => document.querySelector(selector + " > .code-lang-button")?.textContent, rowOf("c1")),
      pickerHidden: await fresh.evaluate(() => document.querySelector("#code-lang-picker")?.hidden),
      caret: await caretOffset("c1"),
    };
    result.codeLanguagePickerOpens = pickerOpen.open && pickerOpen.focused && pickerOpen.first.startsWith("Plain text") && pickerOpen.active === "python" && pickerOpen.count >= 18;
    result.codeLanguagePickerFilters = filtered[0] === "rust";
    result.codeLanguagePickChanges = afterPick.block?.language === "rust" && afterPick.label === "Rust" && afterPick.pickerHidden === true;
    result.codeLanguagePickRestoresCaret = afterPick.caret === 9;
    result.codeLanguagePickEvidence = JSON.stringify({ pickerOpen, filtered, afterPick });
    const rustPaint = await paintOf("c1", "rust");
    result.codeLanguagePickRepaints = rustPaint.same && !hasWord(rustPaint, "keyword", "def") && hasWord(rustPaint, "keyword", "return");
    // Undo 1手で Python に戻り、塗りも戻る。Redo で Rust。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const undone = await liveBlock("c1");
    const undonePaint = await paintOf("c1", "python");
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(250);
    const redone = await liveBlock("c1");
    result.codeLanguageUndoOneStep = undone?.language === "python" && undonePaint.same && hasWord(undonePaint, "keyword", "def") && redone?.language === "rust";
    // Esc で閉じるとキャレットは元へ。書式なし(Plain text)を選ぶと language を外す。
    await placeCaretAt("c1", 4);
    await fresh.locator(contentOf("c1")).hover();
    await fresh.locator(rowOf("c1") + " > .code-lang-button").click();
    await fresh.waitForTimeout(120);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(120);
    const afterEscape = { hidden: await fresh.evaluate(() => document.querySelector("#code-lang-picker")?.hidden), caret: await caretOffset("c1"), block: await liveBlock("c1") };
    await fresh.locator(contentOf("c1")).hover();
    await fresh.locator(rowOf("c1") + " > .code-lang-button").click();
    await fresh.waitForTimeout(120);
    await fresh.locator('#code-lang-picker .code-lang-choice[data-language=""]').click();
    await fresh.waitForTimeout(250);
    const plainBlock = await liveBlock("c1");
    const plainAfter = await paintOf("c1", "");
    result.codeLanguageEscapeKeepsCaret = afterEscape.hidden === true && afterEscape.caret === 4 && afterEscape.block?.language === "rust";
    result.codeLanguagePlainRemovesField = Boolean(plainBlock) && !("language" in plainBlock) && plainAfter.painted.length === 0
      && (await fresh.evaluate((selector) => document.querySelector(selector + " > .code-lang-button")?.textContent, rowOf("c1"))) === "Plain text";
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);

    // 4) 打鍵: 打った字句がすぐ(次のフレームで)塗られ、キャレットは打った後ろ。モデルの文字は DOM と同じ素の文字。
    await placeCaretAt("c2", JS.length);
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("let total = 7;");
    await frames(2);
    const typedPaint = await paintOf("c2", "javascript");
    const typedCaret = await caretOffset("c2");
    const typedBlock = await liveBlock("c2");
    const typedText = JS + "\nlet total = 7;";
    result.codeTypingRepaints = typedPaint.same && hasWord(typedPaint, "keyword", "let") && hasWord(typedPaint, "number", "7") && typedPaint.elementChildren === 0;
    result.codeCaretAfterTyping = typedCaret === typedText.length && typedBlock?.text === typedText && (await editableText("c2")) === typedText;
    result.codeTypingEvidence = JSON.stringify({ typedCaret, text: typedBlock?.text, words: typedPaint.words.slice(-4) });
    // 途中に打つ: 「const」の後ろに文字を足しても、後ろの字句の色は文字についたまま(塗り直した結果と同じ)。
    await placeCaretAt("c2", 5);
    await fresh.keyboard.type("X");
    await frames(2);
    const midPaint = await paintOf("c2", "javascript");
    result.codeTypingMiddleRepaints = midPaint.same && !hasWord(midPaint, "keyword", "constX") && (await caretOffset("c2")) === 6;
    // Undo: 打つ前の文字と塗りに戻る(Undo の後も塗りは今の文字と同じ)。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const undoTypingPaint = await paintOf("c2", "javascript");
    const undoTypingBlock = await liveBlock("c2");
    result.codeUndoTypingRepaints = undoTypingBlock?.text !== midPaint.text && undoTypingPaint.same && undoTypingPaint.text === undoTypingBlock?.text;

    // 5) 日本語入力: 変換中は塗り直さない・文字は崩れない。確定すると塗り直す(注釈の色が確定した文字まで伸びる)。
    // (上の手順で Rust になっているので、一覧で Python に戻してから)
    await fresh.locator(contentOf("c1")).hover();
    await fresh.locator(rowOf("c1") + " > .code-lang-button").click();
    await fresh.waitForTimeout(120);
    await fresh.locator('#code-lang-picker .code-lang-choice[data-language="python"]').click();
    await fresh.waitForTimeout(250);
    const imeBlockLanguage = (await liveBlock("c1"))?.language;
    await placeCaretAt("c1", PY.length);
    await fresh.keyboard.type("  # ");
    await frames(2);
    for (const step of ["に", "にほ", "にほん"]) {
      await cdp.send("Input.imeSetComposition", { text: step, selectionStart: step.length, selectionEnd: step.length });
      await fresh.waitForTimeout(40);
    }
    await frames(2);
    const duringIme = await fresh.evaluate((selector) => document.querySelector(selector).textContent, contentOf("c1"));
    await cdp.send("Input.insertText", { text: "日本" });
    await fresh.waitForTimeout(150);
    await frames(2);
    const imeText = PY + "  # 日本";
    const imePaint = await paintOf("c1", imeBlockLanguage || "");
    const imeBlock = await liveBlock("c1");
    result.codeImeCompositionCommits = duringIme.endsWith("# にほん") && imeBlock?.text === imeText && (await editableText("c1")) === imeText
      && (await caretOffset("c1")) === imeText.length;
    result.codeImeRepaintsAfterCommit = imeBlockLanguage === "python" && imePaint.same && hasWord(imePaint, "comment", "# 日本");
    result.codeImeEvidence = JSON.stringify({ imeBlockLanguage, duringIme, text: imeBlock?.text, words: imePaint.words.slice(-3) });

    // 6) コピーは素の文字(色の印は付かない)。
    await fresh.evaluate((selector) => {
      const editable = document.querySelector(selector);
      editable.focus();
      const range = document.createRange();
      const text = editable.firstChild;
      range.setStart(text, 0);
      range.setEnd(text, 16);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, contentOf("c1"));
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    const copied = await fresh.evaluate(() => navigator.clipboard.readText());
    result.codeCopyIsPlainText = copied === PY.slice(0, 16);
    result.codeCopyEvidence = JSON.stringify(copied);

    // 7) 検索・置換: コードの中の一致を見つけ、置換した後も塗りは今の文字と同じ。
    await fresh.locator(contentOf("c4")).click();
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(150);
    await fresh.locator("#search-input").fill("greet");
    await fresh.waitForTimeout(250);
    const searchCount = await fresh.evaluate(() => document.querySelector("#search-count")?.textContent || "");
    const searchPainted = await fresh.evaluate(() => {
      const set = CSS.highlights.get("doc-search-current");
      return set ? [...set].map((range) => range.toString()) : [];
    });
    await fresh.locator("#search-replace-input").fill("welcome");
    await fresh.locator("#search-replace-one").click();
    await fresh.waitForTimeout(300);
    await frames(2);
    const replacedBlock = await liveBlock("c1");
    const replacedPaint = await paintOf("c1", "python");
    result.codeSearchFindsInCode = searchCount.startsWith("1/") && searchPainted.includes("greet");
    result.codeReplaceRepaints = String(replacedBlock?.text || "").startsWith("def welcome(name):") && replacedPaint.same && hasWord(replacedPaint, "function", "welcome");
    result.codeSearchEvidence = JSON.stringify({ searchCount, searchPainted, text: replacedBlock?.text });
    await fresh.keyboard.press("Escape");
    await fresh.locator(contentOf("c4")).click();
    await fresh.keyboard.press("Escape");

    // 8) 保存HTML: 言語のあるコードは色の印つき、書式なしは今までどおり。開き直すと言語が戻る。色はエディタと同じ値。
    const saved = await saveHtml("code-hl-saved.html");
    const parsed = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), saved.html);
    const savedBlocks = parsed.pages[0].blocks;
    result.codeSavedKeepsLanguage = savedBlocks.find((block) => block.id === "c1")?.language === "python"
      && savedBlocks.find((block) => block.id === "c2")?.language === "javascript" && !("language" in savedBlocks.find((block) => block.id === "c3"));
    result.codeSavedHtmlHasSpans = /<pre data-language="python"><span class="tok-keyword">def<\/span>/.test(saved.html)
      && /<pre>def plain\(\): return 1<\/pre>/.test(saved.html) && /\.tok-keyword\{color:var\(--doc-tok-keyword\)\}/.test(saved.html) && /--doc-tok-keyword:#cf222e/.test(saved.html);
    const editorRules = await fresh.evaluate(() => document.querySelector("#code-highlight-style")?.textContent || "");
    const view = await context.newPage();
    await view.setViewportSize({ width: 1280, height: 900 });
    await view.goto(pathToFileURL(saved.path).href);
    await view.waitForSelector("pre");
    const savedColors = await view.evaluate(() => {
      const out = {};
      document.querySelectorAll("pre span[class^='tok-']").forEach((span) => { out[span.className.slice(4)] = getComputedStyle(span).color; });
      return out;
    });
    const hexToRgb = (hex) => "rgb(" + [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(", ") + ")";
    const editorColors = Object.fromEntries([...editorRules.matchAll(/::highlight\(code-(\w+)\)\{color:(#[0-9a-f]{6})\}/g)].map((match) => [match[1], hexToRgb(match[2])]));
    result.codeColorsMatchSaved = Object.keys(savedColors).length >= 4 && Object.entries(savedColors).every(([kind, color]) => editorColors[kind] === color);
    result.codeColorsEvidence = JSON.stringify({ savedColors, editorColors });
    const savedDef = await pixelStats(view, "pre[data-language='python']", "def");
    const savedPlain = await pixelStats(view, "pre:not([data-language])", "def");
    result.codeSavedPixelsColored = Boolean(savedDef && savedPlain && savedDef.red >= 10 && savedDef.red > savedPlain.red * 3 && savedDef.dark < savedPlain.dark);
    result.codeSavedPixelEvidence = JSON.stringify({ savedDef, savedPlain });
    // 位置は塗りで変わらない(エディタとの比べは layoutParitySuite。ここでは色の印で <pre> の高さが変わらないこと)。
    result.codeSavedSpansKeepHeight = await view.evaluate(() => {
      const pre = document.querySelector("pre[data-language='python']");
      const copy = document.createElement("pre");
      copy.textContent = pre.textContent;
      pre.after(copy);
      const same = Math.abs(copy.getBoundingClientRect().height - pre.getBoundingClientRect().height) < 0.5;
      copy.remove();
      return same;
    });
    await view.close();

    // 9) 開くときの無害化: 知らない言語の id は外す(書式なし)。古い版(0.8.20)の文書のコードは書式なしで開ける。
    await openLiteral(doc("無害化", [
      { id: "s1", type: "code", text: "x = 1", language: "<script>" },
      { id: "s2", type: "code", text: "x = 1", language: "kotlin" },
      { id: "s3", type: "paragraph", text: "段落", language: "python" },
    ]), "code-hl-sanitize.html");
    const sanitized = await Promise.all(["s1", "s2", "s3"].map((id) => liveBlock(id)));
    result.codeImportDropsUnknownLanguage = !("language" in sanitized[0]) && !("language" in sanitized[1]) && sanitized[2]?.language === "python"
      && (await fresh.evaluate((selector) => document.querySelector(selector + " > .code-lang-button")?.textContent, rowOf("s1"))) === "Plain text";
    const oldHtml = (await fresh.evaluate((value) => window.SingleHtmlFormat.buildPortableHtml(value), doc("古い版", [{ id: "o1", type: "code", text: "def old(): pass" }])))
      .replace(/"formatVersion":\s*"[^"]+"/, '"formatVersion": "0.8.20"');
    const oldPath = join(OUT, "code-hl-old.html");
    await writeFile(oldPath, oldHtml, "utf8");
    {
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(oldPath);
      await fresh.waitForFunction(() => document.querySelector('#blocks .block[data-id="o1"]'), null, { timeout: 10000 });
      await fresh.waitForTimeout(200);
    }
    const oldBlock = await liveBlock("o1");
    result.codeOldFormatOpensPlain = oldBlock?.type === "code" && oldBlock.text === "def old(): pass" && !("language" in oldBlock) && (await paintOf("o1", "")).painted.length === 0;

    // 10) 貼り付け: Notion のコードの言語(Python)・HTML の class="language-…"・保存HTMLの data-language。「```js」も言語になる。
    await openLiteral(doc("貼り付け", [{ id: "n1", type: "paragraph", text: "" }, { id: "n2", type: "paragraph", text: "" }, { id: "n3", type: "paragraph", text: "" }]), "code-hl-paste.html");
    const pasteInto = async (id, items) => {
      await fresh.locator(contentOf(id)).click();
      await fresh.evaluate(({ selector, data }) => {
        const transfer = new DataTransfer();
        Object.entries(data).forEach(([type, value]) => transfer.setData(type, value));
        document.querySelector(selector).dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
      }, { selector: contentOf(id), data: items });
      await fresh.waitForTimeout(350);
    };
    await pasteInto("n1", { "text/plain": fixture["text/plain"], "text/html": fixture["text/html"], "text/_notion-blocks-v3-production": fixture["text/_notion-blocks-v3-production"] });
    const afterNotion = await fresh.evaluate(() => window.__docEditorPages.documentCopy().pages.flatMap((page) => page.blocks).filter((block) => block.type === "code").map((block) => ({ id: block.id, text: block.text, language: block.language })));
    result.codeNotionPasteKeepsLanguage = afterNotion.some((block) => block.language === "python" && block.text.startsWith("def hello(name):"));
    result.codeNotionPasteEvidence = JSON.stringify(afterNotion);
    const notionCode = afterNotion.find((block) => block.language === "python");
    if (notionCode) {
      const notionPaint = await paintOf(notionCode.id, "python");
      result.codeNotionPastePainted = notionPaint.same && hasWord(notionPaint, "keyword", "def");
    } else {
      result.codeNotionPastePainted = false;
    }
    await pasteInto("n2", { "text/plain": "a\nconst x = 1;\nb", "text/html": "<p>a</p><pre><code class=\"language-js\">const x = 1;\n</code></pre><p>b</p>" });
    await pasteInto("n3", { "text/plain": "a\nSELECT 1\nb", "text/html": "<p>a</p><pre data-language=\"sql\">SELECT 1</pre><p>b</p>" });
    const htmlCodes = await fresh.evaluate(() => window.__docEditorPages.documentCopy().pages.flatMap((page) => page.blocks).filter((block) => block.type === "code").map((block) => [block.text, block.language || ""]));
    result.codeHtmlPasteKeepsLanguage = htmlCodes.some(([text, lang]) => text === "const x = 1;" && lang === "javascript")
      && htmlCodes.some(([text, lang]) => text === "SELECT 1" && lang === "sql");
    result.codeHtmlPasteEvidence = JSON.stringify(htmlCodes);
    await openLiteral(doc("フェンス", [{ id: "f1", type: "paragraph", text: "" }, { id: "f2", type: "paragraph", text: "" }]), "code-hl-fence.html");
    // (貼った「```python」と同じ: 1 回の入力で入る。listShortcutSuite と同じく insertText で)
    await fresh.locator(contentOf("f1")).click();
    await fresh.keyboard.insertText("```python");
    await fresh.waitForTimeout(250);
    const fenced = await liveBlock("f1");
    await fresh.locator(contentOf("f2")).click();
    await fresh.keyboard.insertText("```kotlin");
    await fresh.waitForTimeout(250);
    const fencedUnknown = await liveBlock("f2");
    result.codeFenceSetsLanguage = fenced?.type === "code" && fenced.language === "python" && fenced.text === ""
      && fencedUnknown?.type === "code" && !("language" in fencedUnknown) && fencedUnknown.text === "";
    result.codeFenceEvidence = JSON.stringify({ fenced, fencedUnknown });

    // 11) ロックしたページでは言語を変えられない(一覧が開かない)。
    await openLiteral({ pages: [{ id: "L", title: "ロック", locked: true, blocks: [{ id: "l1", type: "code", text: "x = 1", language: "python" }] }], fonts: [], attachments: [] }, "code-hl-locked.html");
    await fresh.locator(contentOf("l1")).hover();
    await fresh.locator(rowOf("l1") + " > .code-lang-button").click();
    await fresh.waitForTimeout(150);
    result.codeLanguageLockedUnchanged = !(await fresh.evaluate(() => Boolean(document.querySelector("#code-lang-picker:not([hidden])"))))
      && (await liveBlock("l1"))?.language === "python" && (await paintOf("l1", "python")).same;

    // 12) 長いコードの打鍵の速さ(2,000 行・約 9 万字)。同じ長さの書式なしのコードと比べ、1 打鍵の処理(イベント・フレーム・塗り直しの
    //     すべて。CDP の TaskDuration)が大きく増えない。塗るのは見える所だけ(全部を塗ると Range の見直しで約 4 倍になった)。
    //     長いコードは打鍵が止まってから塗り直す。止まった後は今の文字どおりに塗られ、スクロールした先も塗られる。
    const longText = Array.from({ length: 2000 }, (_, index) => "    total_" + index + " = compute(" + index + ", 'value') # note " + index).join("\n");
    // 2 行目の頭に1行足す(Enter まで)。
    const typedChars = "abc = 12 # x\n";
    const measureTyping = async (language, name) => {
      await openLiteral(doc("長いコード " + (language || "plain"), [{ id: "big", type: "code", text: longText, ...(language ? { language } : {}) }, { id: "after", type: "paragraph", text: "後" }]), name);
      await placeCaretAt("big", longText.indexOf("\n") + 1);
      await fresh.waitForTimeout(300);
      await frames(2);
      const before = await taskSeconds();
      for (const char of typedChars) await fresh.keyboard.type(char);
      const perKey = ((await taskSeconds()) - before) * 1000 / typedChars.length;
      await fresh.waitForTimeout(500);
      await frames(2);
      return perKey;
    };
    const plainPerKey = await measureTyping("", "code-hl-long-plain.html");
    const pythonPerKey = await measureTyping("python", "code-hl-long.html");
    const settledPaint = await paintOf("big", "python");
    result.codeLongTypingFast = pythonPerKey <= plainPerKey * 1.6 + 6;
    result.codeLongPaintsAfterPause = settledPaint.same && settledPaint.text.length === longText.length + typedChars.length
      && hasWord(settledPaint, "comment", "# x") && settledPaint.painted.length < settledPaint.total / 2;
    // 下へスクロールすると、見えてきた所が塗られる(最後の行の注釈)。
    await fresh.evaluate((selector) => document.querySelector(selector).closest(".block").nextElementSibling?.scrollIntoView({ block: "end" }), contentOf("big"));
    await fresh.waitForTimeout(200);
    await frames(3);
    const scrolledPaint = await paintOf("big", "python");
    result.codeLongPaintsOnScroll = scrolledPaint.same && hasWord(scrolledPaint, "comment", "# note 1999");
    result.codeLongTypingEvidence = JSON.stringify({ plainPerKey: Math.round(plainPerKey * 10) / 10, pythonPerKey: Math.round(pythonPerKey * 10) / 10,
      painted: settledPaint.painted.length, total: settledPaint.total, scrolled: { visible: scrolledPaint.visible, minStart: scrolledPaint.minStart, maxEnd: scrolledPaint.maxEnd } });

    result.codeHighlightNoPageErrors = pageErrors.length === 0;
    result.codeHighlightPageErrorEvidence = pageErrors.join(" | ");
    return result;
  } finally {
    await context.close();
  }
}
