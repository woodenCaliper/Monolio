// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PORT } from "../lib.mjs";

// ---- 本文の見た目の正は1つ(Issue #201) ----
// 保存HTMLの CSS は document-format.js の中の文字列として、エディタの style.css とは別に手で書かれ、「エディタと同じ」の
// コメントで合わせていた(#132・#136 はそのずれ。#201 の時点でも、表の線・表の見出しの地・引用の線・グラフの目盛線など
// 8 か所の色がずれていた)。いまは document-style.js の値(TOKENS)と同じ部品の規則(SHARED_CSS)を両方が使う。
// 二重化が戻らないように、次を見る:
//   - 保存HTMLの CSS に色を直に書かない(値は :root の --doc-… だけ)。値と同じ部品の規則は document-style.js から来る
//   - エディタも同じ :root と規則を style.css より前に入れ、style.css はパレットの色(白を除く)を直に書かない
//   - app.js と document-format.js の両方にある関数は、app.js 側が fmt の同じ名前へ渡すだけ(写しを持たない)
//   - 本文の書式の無害化はエディタと保存HTMLで同じ決まり(書体の目印・コードの中身・行き先の無い参照)
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const norm = (value) => value.toLowerCase().replace(/\s+/g, "");
const WHITE = new Set(["#fff", "#ffffff"]);

// CSS からコメント・url(…)・:root の値の宣言を除いた残り(規則の部分)。
function rulesOnly(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\("[^"]*"\)|url\('[^']*'\)|url\([^)]*\)/g, "url()")
    .replace(/@media\(max-width:\d+px\)\{:root\{[^}]*\}\}/g, "")
    .replace(/:root\{[^}]*\}/g, "");
}

// 関数の宣言の本体(次の同じ字下げの「}」まで)。
function functionBodies(source) {
  const bodies = new Map();
  const re = /^( *)(?:async )?function\*? ?([A-Za-z0-9_$]+)\(/gm;
  let match;
  while ((match = re.exec(source))) {
    const end = source.indexOf("\n" + match[1] + "}", match.index);
    bodies.set(match[2], source.slice(match.index, end < 0 ? undefined : end));
  }
  return bodies;
}

export default async function documentStyleSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  const evidence = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const text = (path) => readFile(resolve(path), "utf8");
    const [styleCss, appJs, formatJs, indexHtml, worker, stage] = await Promise.all([
      text("editor-pwa/style.css"), text("editor-pwa/app.js"), text("editor-pwa/document-format.js"),
      text("editor-pwa/index.html"), text("editor-pwa/service-worker.js"), text("src-tauri/stage-frontend.mjs"),
    ]);

    // 1) 保存HTMLの CSS: 部品を全部使ったときも、色は :root の --doc-… だけ(規則の中に色を直に書かない)。値の名前の書き損じ(undefined)も無い。
    const page = await fresh.evaluate(() => {
      const style = window.DocumentStyle;
      const all = style.portableCss({ multiPage: true, headingPath: true, headingNumbers: true, zoom: true, pdf: true, blockLink: true, blockColor: true, audio: true, date: true, pageHead: true, code: true, documentText: { fontStack: "serif", small: true } });
      const doc = { pages: [
        { id: "S1", title: "One", blocks: [{ id: "h", type: "heading1", text: "見出し" }, { id: "p", type: "paragraph", text: "x", html: 'x <span class="date-mention" data-date="2026-10-26">d</span>' }] },
        { id: "S2", title: "Two", blocks: [{ id: "q", type: "quote", text: "q" }] },
      ], fonts: [], attachments: [] };
      const html = window.SingleHtmlFormat.buildPortableHtml(doc);
      const savedCss = new DOMParser().parseFromString(html, "text/html").querySelector("head > style")?.textContent || "";
      const root = getComputedStyle(document.documentElement);
      const injected = document.getElementById("document-style");
      const sheetLink = document.querySelector('link[rel="stylesheet"][href$="style.css"]');
      return {
        all,
        savedCss,
        tokens: style.tokensCss(),
        shared: style.SHARED_CSS,
        colors: style.COLORS,
        sizes: style.SIZES,
        expectedSaved: style.portableCss({ multiPage: true, headingPath: true, date: true, documentText: { fontStack: "", small: false } }),
        injectedText: injected?.textContent || "",
        injectedBeforeSheet: Boolean(injected && sheetLink && (injected.compareDocumentPosition(sheetLink) & Node.DOCUMENT_POSITION_FOLLOWING)),
        rootAccent: root.getPropertyValue("--doc-accent").trim(),
        rootHeading1: root.getPropertyValue("--doc-heading1-size").trim(),
        // エディタの本文の値がトークンから来ていること(見出し1の大きさ・本文の線の色)
        editorHeading1: (() => {
          const probe = document.createElement("div");
          probe.className = "block type-heading1";
          probe.innerHTML = '<div class="block-content">h</div>';
          document.querySelector("#blocks").append(probe);
          const size = getComputedStyle(probe.querySelector(".block-content")).fontSize;
          probe.remove();
          return size;
        })(),
      };
    });
    const leftover = (css) => [...rulesOnly(css).matchAll(COLOR_LITERAL)].map((m) => m[0]);
    evidence.portableLiterals = leftover(page.all);
    evidence.savedLiterals = leftover(page.savedCss);
    result.portableCssUsesTokensOnly = evidence.portableLiterals.length === 0 && evidence.savedLiterals.length === 0
      && !/undefined/.test(page.all) && page.all.startsWith(page.tokens);
    // 保存HTMLの <style> は document-style.js が作ったものそのまま(同じ部品の規則も同じ文)。
    result.savedHtmlCssComesFromDocumentStyle = page.savedCss.trim() === page.expectedSaved.trim()
      && page.savedCss.includes(page.shared.base) && page.savedCss.includes(page.shared.date);

    // 2) エディタ: 同じ :root と同じ部品の規則を style.css より前に入れている。値は TOKENS のとおりに効いている。
    result.editorUsesSameTokens = page.injectedText.startsWith(page.tokens) && Object.values(page.shared).every((rule) => page.injectedText.includes(rule))
      && page.injectedBeforeSheet && page.rootAccent === page.colors.accent && page.rootHeading1 === page.sizes["heading1-size"]
      && page.editorHeading1 === page.sizes["heading1-size"];
    evidence.editor = { injectedBeforeSheet: page.injectedBeforeSheet, rootAccent: page.rootAccent, editorHeading1: page.editorHeading1 };

    // 3) style.css はパレットの色(白を除く)を直に書かない(書くと保存HTMLとずれる)。
    const palette = new Map(Object.entries(page.colors).map(([name, value]) => [norm(value), name]).filter(([value]) => !WHITE.has(value)));
    const styleRules = styleCss.replace(/\/\*[\s\S]*?\*\//g, "");
    evidence.styleCssPaletteLiterals = [...styleRules.matchAll(COLOR_LITERAL)].map((m) => m[0]).filter((value) => palette.has(norm(value)))
      .map((value) => value + " → var(--doc-" + palette.get(norm(value)) + ")");
    result.styleCssHasNoPaletteLiterals = evidence.styleCssPaletteLiterals.length === 0;
    // document-format.js は保存HTMLの CSS の文字列を持たない(本文の規則・色は document-style.js)。
    // (ブロックの色の表 COLOR_PALETTE は利用者が選ぶ値で、要素の style に入るデータなので対象外。見るのは CSS の宣言の形。)
    result.formatHasNoPortableCss = !/PORTABLE_[A-Z_]*_CSS|body\{margin:0;color:/.test(formatJs)
      && !/[{;](?:color|background|border(?:-[a-z]+)*|fill|stroke):#[0-9a-f]{3,8}/i.test(formatJs);

    // 4) 同じ名前の関数が app.js と document-format.js の両方にあるなら、app.js 側は fmt の同じ関数へ渡すだけ。
    const appBodies = functionBodies(appJs);
    const formatBodies = functionBodies(formatJs);
    evidence.duplicateFunctions = [...appBodies.keys()].filter((name) => formatBodies.has(name))
      .filter((name) => !appBodies.get(name).includes("fmt." + name + "("));
    result.noDuplicatedFunctions = evidence.duplicateFunctions.length === 0;

    // 5) 本文の書式の無害化は1つの決まり。保存HTMLとエディタで同じ結果の形になる:
    //    書体の目印(execCommand の途中の名前)は残さない(以前は保存HTMLだけ font-family に書いていた)、
    //    コードの中身は data-code が正(以前は保存HTMLだけ中の文字を読んでいた)、行き先の id が安全でない参照は文字だけ。
    const sanitized = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const html = 'a <font face="' + fmt.FONT_FAMILY_SENTINEL + '" color="#c1512f">b</font> <code class="inline-code" data-code="real">shown</code> <span class="figure-ref" data-ref="x&quot;y">表1</span>';
      const saved = fmt.buildPortableHtml({ pages: [{ id: "Z", title: "Z", blocks: [{ id: "z1", type: "paragraph", text: "a b real 表1", html }] }], fonts: [], attachments: [] });
      const view = new DOMParser().parseFromString(saved, "text/html");
      const para = view.querySelector("main p");
      return {
        exportSpanStyle: para?.querySelector("span")?.getAttribute("style") || "",
        exportCode: para?.querySelector("code")?.textContent,
        exportRef: Boolean(para?.querySelector(".figure-ref")),
        exportText: para?.textContent,
      };
    });
    evidence.sanitized = sanitized;
    result.sanitizerRulesShared = !sanitized.exportSpanStyle.includes("font-family") && sanitized.exportSpanStyle.includes("color")
      && sanitized.exportCode === "real" && !sanitized.exportRef && sanitized.exportText === "a b real 表1"
      && !/allowed = new Set\(\["B"/.test(appJs);

    // 6) 新しいファイル(document-style.js)が、PWA のキャッシュ・デスクトップ版の同梱・<head> の読み込みのどれにも入っている。
    result.documentStyleIsShipped = worker.includes('"./document-style.js"') && stage.includes('"document-style.js"')
      && /<script src="\.\/document-format\.js"><\/script>\s*<script src="\.\/document-style\.js"><\/script>\s*<link rel="stylesheet" href="\.\/style\.css">/.test(indexHtml);
    result.documentStyleEvidence = JSON.stringify(evidence);
    return result;
  } finally {
    await fresh.close();
  }
}
