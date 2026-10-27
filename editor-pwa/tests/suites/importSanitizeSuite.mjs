// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT, PORT, openMenu, waitForServer } from "../lib.mjs";

// ---- 細工した文書を開いても乗っ取られない(無害化の回帰) ----
// ユーザー原文「このアプリはハッキングのベースにされたりするか」「HTML に何か仕込んで、エディタで開くとハックされる、といったもの」。
// 保存HTMLは manifest(JSON)に本文モデルをそのまま持つ(buildPortableHtml は block.html・chartSvg・mermaidSvg を
// 生のまま載せる)。攻撃者はこの manifest を手書きできるので、ここに危険な値を入れたファイルを**開く**経路で、
//   - ファイル内のスクリプト・img の onerror などが一切動かない(parsePortableHtml は DOMParser で読むだけ)
//   - 本文(block.html)は描画時に sanitizeInlineHtml を通り、script・on〜・javascript: リンク・img が残らない
//   - グラフ/図の SVG(chartSvg・mermaidSvg)は許可リストから作り直され、script・on〜・foreignObject が残らない
// ことを押さえる。ここが崩れると、CSP 無効・withGlobalTauri のデスクトップ版では PC 全体へ届きうる(HANDOVER の
// セキュリティ方針。被害の上限は Rust 側の write_document の許可リストでも別に抑えている)。
export default async function importSanitizeSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  // 開いた瞬間に動くはずのスクリプト/ハンドラが1つでも動いたら真になる番兵。
  await fresh.addInitScript(() => { window.__pwned = false; });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};

  // block.html(本文の装飾つきHTML)に、許すタグ(b/strong/span など)に混ぜて危険物を仕込む。
  const hostileInline =
    '<script>window.__pwned=true<\/script>'
    + '<img src=x onerror="window.__pwned=true">'
    + '<b onclick="window.__pwned=true" onmouseover="window.__pwned=true">太字</b>'
    + '<a href="javascript:window.__pwned=true">危ないリンク</a>'
    + '<a href="HTTPS://ok.example/safe">安全なリンク</a>'
    + '<svg onload="window.__pwned=true"><script>window.__pwned=true<\/script></svg>'
    + '<iframe src="javascript:window.__pwned=true"></iframe>'
    + '<span style="color:#c00">色つき</span>';
  // グラフの SVG。sanitizeChartSvg は許した要素・属性だけで作り直す。危険物は、Mermaid の実出力と同じく**整形式の XML**で
  // 仕込む(image/svg+xml として厳密に読まれるので、壊れた XML は図ごと捨てられてしまい、作り直しの検査にならない)。
  // 描画が作る要素・属性(class="chart-svg"・<line>・<text>)は残ることも見る(無害化=全消しではない。旧 bugFixSuite の Open-A)。
  const hostileChartSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" class="chart-svg" onload="window.__pwned=true" width="100" height="40">'
    + '<line x1="0" y1="0" x2="5" y2="5"></line>'
    + '<script>window.__pwned=true<\/script>'
    + '<rect width="10" height="10" onclick="window.__pwned=true"></rect>'
    + '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__pwned=true" /></div></foreignObject>'
    + '<a href="javascript:window.__pwned=true"><text x="0" y="20">x</text></a>'
    + '<text x="0" y="35">chart</text>'
    + '</svg>';
  // Mermaid の図の SVG。sanitizeMermaidSvg も許可リストから作り直す(script・foreignObject・image・on〜 を捨てる)。
  const hostileMermaidSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" id="pagelith-mermaid-evil" onload="window.__pwned=true" width="120" height="80">'
    + '<script>window.__pwned=true<\/script>'
    + '<style>#pagelith-mermaid-evil{background:url("javascript:window.__pwned=true")}@import url("http://evil.example/x.css");</style>'
    + '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__pwned=true" /></div></foreignObject>'
    + '<g onclick="window.__pwned=true"><text x="0" y="20">node</text></g>'
    + '</svg>';

  const literal = {
    pages: [
      {
        id: "p1",
        title: "Hostile Doc",
        blocks: [
          { id: "b-inline", type: "paragraph", text: "x", html: hostileInline },
          { id: "b-chart", type: "chart", text: 'line(A1:A2)', chartSvg: hostileChartSvg },
          { id: "b-mermaid", type: "mermaid", text: "graph TD;A-->B", mermaidSvg: hostileMermaidSvg },
          { id: "b-tail", type: "paragraph", text: "TAIL-MARKER" },
        ],
      },
    ],
    fonts: [],
    attachments: [],
  };

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // ---- (A) 細工ファイルを「開く」経路 ----
    const path = join(OUT, "import-sanitize.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Hostile Doc", null, { timeout: 5000 }).catch(() => {});
    // img の onerror などは非同期で遅れて動きうるので、動く猶予を与えてから番兵を見る。
    await fresh.waitForTimeout(400);

    const opened = await fresh.evaluate(() => {
      const blocks = document.querySelector("#blocks");
      const all = [...blocks.querySelectorAll("*")];
      const hasOnAttr = all.some((el) => [...el.attributes].some((attr) => /^on/i.test(attr.name)));
      return {
        pwned: window.__pwned === true,
        reachedTail: !!document.body.textContent.includes("TAIL-MARKER"),
        scripts: blocks.querySelectorAll("script").length,
        hasOnAttr,
        jsLinks: blocks.querySelectorAll('a[href^="javascript" i]').length,
        iframes: blocks.querySelectorAll("iframe").length,
        imgs: blocks.querySelectorAll("img").length,
        foreignObjects: blocks.querySelectorAll("foreignObject").length,
        safeLinkText: !!blocks.textContent.includes("安全なリンク"),
      };
    });
    // 何も実行されず、ファイルは正常に開けている。
    result.openedHostileFileRunsNothing = opened.pwned === false && opened.reachedTail === true;
    // 本文・グラフ・図のどこにも危険な要素が残らない。
    result.openedHostileFileIsClean = opened.scripts === 0 && opened.hasOnAttr === false
      && opened.jsLinks === 0 && opened.iframes === 0 && opened.imgs === 0 && opened.foreignObjects === 0;
    // 安全なリンクの文字は保たれる(無害化=全消しではない)。
    result.openedHostileFileKeepsText = opened.safeLinkText === true;

    // ---- (B) 書き出し経路の無害化(saved HTML 本体) ----
    // buildPortableHtml が描く本文(main)に、危険な要素が出ないこと。SVG 系の無害化はここで直接効く。
    const saved = await fresh.evaluate(({ inline, chartSvg, mermaidSvg }) => {
      const html = window.SingleHtmlFormat.buildPortableHtml({
        pages: [{ id: "S", title: "Saved", blocks: [
          { id: "i", type: "paragraph", text: "x", html: inline },
          { id: "c", type: "chart", text: "line(A1:A2)", chartSvg },
          { id: "m", type: "mermaid", text: "graph TD;A-->B", mermaidSvg },
        ] }], fonts: [], attachments: [],
      });
      const view = new DOMParser().parseFromString(html, "text/html");
      const main = view.querySelector("main");
      const all = [...main.querySelectorAll("*")];
      // 書き出したHTMLを開き直したモデルの chartSvg(読み込み側の無害化の経路)。画面はグラフをコードから描き直すので、
      // 上の (A) の画面の検査では chartSvg そのものは見えない。
      const reopenedChartSvg = window.SingleHtmlFormat.parsePortableHtml(html).pages
        .flatMap((page) => page.blocks || []).find((block) => block.type === "chart")?.chartSvg ?? null;
      return {
        chartSvgHtml: main.querySelector(".doc-chart-canvas svg")?.outerHTML ?? "",
        reopenedChartSvg,
        scripts: main.querySelectorAll("script").length,
        hasOnAttr: all.some((el) => [...el.attributes].some((attr) => /^on/i.test(attr.name))),
        jsLinks: main.querySelectorAll('a[href^="javascript" i]').length,
        iframes: main.querySelectorAll("iframe").length,
        imgs: main.querySelectorAll("img").length,
        foreignObjects: main.querySelectorAll("foreignObject").length,
        importInStyle: [...main.querySelectorAll("style")].some((node) => /@import/i.test(node.textContent || "")),
        chartSvgKept: !!main.querySelector(".doc-chart-canvas svg"),
        mermaidSvgKept: !!main.querySelector(".doc-mermaid-canvas svg"),
      };
    }, { inline: hostileInline, chartSvg: hostileChartSvg, mermaidSvg: hostileMermaidSvg });
    result.savedHtmlHasNoScriptOrHandlers = saved.scripts === 0 && saved.hasOnAttr === false
      && saved.jsLinks === 0 && saved.iframes === 0 && saved.imgs === 0
      && saved.foreignObjects === 0 && saved.importInStyle === false;
    // 無害化しても図そのものは残る(中身だけ作り直す)。
    result.savedHtmlKeepsFigures = saved.chartSvgKept === true && saved.mermaidSvgKept === true;
    // グラフの SVG: 描画が作る class・<line>・<text> は書き出しに残り、開き直したモデルの chartSvg にも危険物が無く、絵は残る。
    const chartSvgClean = (value) => typeof value === "string" && !/script|onload|onclick|onerror|__pwned|foreignObject|javascript:/i.test(value);
    const chartSvgDrawn = (value) => typeof value === "string" && value.includes("<line") && value.includes("<text")
      && value.includes('class="chart-svg"');
    result.savedChartSvgKeepsDrawingAndReopensClean = chartSvgClean(saved.chartSvgHtml) && chartSvgDrawn(saved.chartSvgHtml)
      && chartSvgClean(saved.reopenedChartSvg) && chartSvgDrawn(saved.reopenedChartSvg);
    result.savedChartSvgEvidence = { saved: saved.chartSvgHtml.slice(0, 300), reopened: String(saved.reopenedChartSvg).slice(0, 300) };

    // 開いている間に、仕込んだスクリプトのせいで例外(= 実行の痕跡)が出ていない。
    result.openPathHadNoInjectedErrors = !pageErrors.some((message) => /__pwned|is not defined|unexpected/i.test(message));

    // ---- (C) 2026-10 の点検で見つけたもの(v227)。ユーザー「ほかに脆弱性は本当にないのか」→「直して」 ----
    //   - SVG の画像の添付: 画面の画像を「新しいタブで開く」と、SVG の中のスクリプトがアプリと同じオリジンで動いた
    //     (表示用の blob の種類が image/svg+xml だったため。CSP も効かなかった)。SVG は data: URL(開いても別のオリジン)で表示する
    //   - 行の種類(type)を細工すると、画面全体を覆う枠(image-lightbox)などのクラスを足せた(偽の表示を出せた)
    //   - 図表の参照を含む本文 HTML を、無害化する前に生きた要素で読んでいた(画像を読みに行った。CSP 頼みの一枚壁)
    //   - 字下げがマイナスだと保存HTMLでその後ろが消え、極端な値だと画面からはみ出した
    //   - 画像の題名の $` $' が置き換えの記号として働き、保存HTMLの画像が2つになって本文が図の中に入り込んだ
    //   - グラフの SVG の塗り(fill・stroke)の url(…) が無害化を通り抜け、保存HTMLを開くと外へ読みに行けた
    const requested = [];
    const onRequest = (request) => requested.push(new URL(request.url()).pathname);
    fresh.on("request", onRequest);
    const appOrigin = new URL(fresh.url()).origin;
    const atts = await fresh.evaluate(async () => {
      const F = window.SingleHtmlFormat;
      const svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" onload="document.title=\'SVG_PWNED\'">'
        + '<rect width="24" height="24" fill="#c00"/></svg>';
      const svg = await F.fileToAttachment(new File([svgText], "evil.svg", { type: "image/svg+xml" }), "att-svg");
      const canvas = Object.assign(document.createElement("canvas"), { width: 8, height: 8 });
      canvas.getContext("2d").fillRect(0, 0, 8, 8);
      const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const png = await F.fileToAttachment(new File([pngBlob], "ok.png", { type: "image/png" }), "att-png");
      return { svg, png };
    });
    const literal2 = {
      pages: [{ id: "H2", title: "Hostile Two", blocks: [
        { id: "t-type", type: "paragraph image-lightbox app-notice", text: "FAKE-OVERLAY" },
        { id: "t-ref", type: "paragraph", text: "x", html: '<span class="figure-ref" data-ref="nope"></span><img src="/__rawhtml-probe.png">' },
        { id: "t-neg", type: "paragraph", text: "NEG-INDENT", indent: -1 },
        { id: "t-huge", type: "paragraph", text: "HUGE-INDENT", indent: 9999 },
        { id: "t-tail", type: "paragraph", text: "TAIL-TWO" },
        { id: "t-svg", type: "attachment", attachmentId: atts.svg.id, caption: "x$`y$'z$&w" },
        { id: "t-png", type: "attachment", attachmentId: atts.png.id },
      ] }],
      fonts: [],
      attachments: [atts.svg, atts.png],
    };
    const html2 = await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal2);
    const path2 = join(OUT, "import-sanitize-2.html");
    await writeFile(path2, html2, "utf8");
    const chooser2 = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser2).setFiles(path2);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Hostile Two", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForFunction(() => [...document.querySelectorAll('#blocks .block[data-id="t-svg"] img, #blocks .block[data-id="t-png"] img')]
      .filter((img) => img.complete && img.naturalWidth > 0).length === 2, null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    const editor2 = await fresh.evaluate(() => {
      const row = (id) => document.querySelector(`#blocks .block[data-id="${id}"]`);
      const img = (id) => row(id)?.querySelector("img");
      return {
        typeRowShown: Boolean(row("t-type")) && row("t-type").textContent.includes("FAKE-OVERLAY"),
        injectedClasses: document.querySelectorAll("#blocks .image-lightbox, #blocks .app-notice").length,
        negIndent: row("t-neg")?.style.getPropertyValue("--indent") ?? null,
        hugeIndent: row("t-huge")?.style.getPropertyValue("--indent") ?? null,
        svgSrc: img("t-svg")?.src || "",
        svgShown: (img("t-svg")?.naturalWidth || 0) > 0,
        pngSrc: img("t-png")?.src || "",
        pngShown: (img("t-png")?.naturalWidth || 0) > 0,
      };
    });
    fresh.off("request", onRequest);
    // 行の種類から、画面の枠のクラスを足せない(行そのものと文字は残る)。
    result.hostileTypeAddsNoClasses = editor2.typeRowShown && editor2.injectedClasses === 0;
    // 図表の参照を含む本文 HTML を、生きた要素で読まない(中の画像を読みに行かない)。
    result.figureRefHtmlNotLoadedLive = !requested.includes("/__rawhtml-probe.png");
    // 字下げは開くときに 0〜20 の整数へ直る(マイナスは 0)。
    const indentValue = (value) => (value === "" || value === null ? 0 : Number(value));
    result.importedIndentNormalized = indentValue(editor2.negIndent) === 0 && indentValue(editor2.hugeIndent) <= 20
      && indentValue(editor2.hugeIndent) >= 1;
    // SVG・PNG の画像は今までどおり見える。
    result.imageAttachmentsStillShown = editor2.svgShown && editor2.pngShown;
    // 画面の SVG の画像を新しいタブで開いても、中のスクリプトがアプリのオリジンで動かない。
    const openInTab = async (src, tabContext = fresh.context()) => {
      if (!src) return { ranInAppOrigin: false, opened: false };
      const tab = await tabContext.newPage();
      try {
        await tab.goto(src, { timeout: 5000 }).catch(() => {});
        await tab.waitForTimeout(300);
        const state = await tab.evaluate(() => ({ title: document.title, origin: location.origin })).catch(() => ({ title: "", origin: "" }));
        return { ranInAppOrigin: state.title === "SVG_PWNED" && state.origin === appOrigin, opened: true, state: state.title + "@" + state.origin };
      } finally {
        await tab.close();
      }
    };
    const editorTab = await openInTab(editor2.svgSrc);
    result.editorSvgImageCannotRunInAppOrigin = !editorTab.ranInAppOrigin;
    result.svgImageEvidence = "editor=" + editor2.svgSrc.slice(0, 22) + " png=" + editor2.pngSrc.slice(0, 22) + " tab=" + editorTab.state;

    // 保存HTML: 開き直したモデル(取り込みの直しを通る)から書き出す。字下げの細工で本文が消えず、題名の $ で崩れない。
    const saved2 = await fresh.evaluate((html) => {
      const F = window.SingleHtmlFormat;
      const reopened = F.parsePortableHtml(html);
      const out = F.buildPortableHtml({ ...reopened, attachments: reopened.attachments });
      const main = new DOMParser().parseFromString(out, "text/html").querySelector("main");
      const caption = [...main.querySelectorAll(".doc-caption")].map((node) => node.textContent).join("|");
      return {
        out,
        text: main.textContent,
        figures: main.querySelectorAll("figure").length,
        imgs: main.querySelectorAll("img").length,
        buttons: main.querySelectorAll("button[data-download]").length,
        caption,
      };
    }, html2);
    result.savedHtmlKeepsBlocksAfterBadIndent = ["NEG-INDENT", "HUGE-INDENT", "TAIL-TWO"].every((text) => saved2.text.includes(text));
    result.savedImageCaptionDollarKeepsMarkup = saved2.figures === 2 && saved2.imgs === 2 && saved2.buttons === 2
      && saved2.caption.includes("x$`y$'z$&w");

    // 保存HTMLを(アプリと同じオリジンの URL で)開いたとき、SVG の画像は blob ではなく data: URL で見せ、
    // 新しいタブで開いてもそのオリジンでスクリプトが動かない。PNG は今までどおり blob。
    // アプリの Service Worker が同じオリジンの読み込みを横取りするので、保存HTMLは Service Worker を止めた別の環境で開く。
    const savedContext = await fresh.context().browser().newContext({ serviceWorkers: "block" });
    const viewer = await savedContext.newPage();
    try {
      await viewer.route("**/__saved-probe.html", (route) => route.fulfill({ contentType: "text/html", body: saved2.out }));
      await viewer.goto("http://127.0.0.1:" + PORT + "/__saved-probe.html");
      await viewer.waitForFunction(() => [...document.querySelectorAll("img[data-attachment-image]")]
        .filter((img) => img.complete && img.naturalWidth > 0).length === 2, null, { timeout: 5000 }).catch(() => {});
      // 画像は文書の順(SVG → PNG)。
      const [svgImg, pngImg] = await viewer.evaluate(() => [...document.querySelectorAll("img[data-attachment-image]")]
        .map((img) => ({ src: img.src, shown: img.naturalWidth > 0 })));
      const savedTab = await openInTab(svgImg?.src, savedContext);
      result.savedHtmlImagesShown = Boolean(svgImg?.shown && pngImg?.shown);
      result.savedSvgImageCannotRunInOrigin = !savedTab.ranInAppOrigin;
      result.savedSvgImageEvidence = "svg=" + String(svgImg?.src).slice(0, 22) + " png=" + String(pngImg?.src).slice(0, 22);
    } finally {
      await savedContext.close();
    }

    // グラフの SVG の塗りに url(…) を残さない(保存HTMLから外へ読みに行かせない)。描画が作る色はそのまま。
    result.chartSvgDropsUrlPaint = await fresh.evaluate(() => {
      const out = window.SingleHtmlFormat.sanitizeChartSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
        + '<rect width="5" height="5" fill="url(https://evil.example/x.svg#p)" stroke="URL ( https://evil.example/s#q )"/>'
        + '<rect width="5" height="5" fill="#1f77b4" stroke="none"/></svg>');
      return !/url\s*\(/i.test(out) && out.includes('fill="#1f77b4"') && out.includes('stroke="none"');
    });

    // ---- (D) 壊れた値・壊れた %(#67 の残り。v244) ----
    // ブロックの type・text が文字列でないファイルは開けたが、まだ描いていないページへ移ると描画が例外で止まった。
    const brokenDoc = {
      pages: [
        { id: "bp1", title: "BROKEN-1", blocks: [{ id: "bx0", type: "paragraph", text: "first" }] },
        { id: "bp2", title: "BROKEN-2", blocks: [
          { id: "bx1", type: 5, text: "TYPE-NUM" },
          { id: "bx2", text: "TYPE-MISSING" },
          { id: "bx3", type: "paragraph", text: 12345 },
          { id: "bx4", type: "paragraph", text: { a: 1 } },
          { id: "bx5", type: "paragraph", text: "TAIL-OK" },
        ] },
      ],
      fonts: [],
      attachments: [],
    };
    const brokenHtml = await fresh.evaluate((doc) => {
      // buildPortableHtml は壊れた値を書き出しの途中で使うので、正しい文書を書き出してから manifest だけ差し替える。
      const F = window.SingleHtmlFormat;
      const good = JSON.parse(JSON.stringify(doc));
      good.pages[1].blocks.forEach((block) => { block.type = "paragraph"; block.text = "x"; });
      const parsed = new DOMParser().parseFromString(F.buildPortableHtml(good), "text/html");
      const node = parsed.querySelector("#document-manifest");
      const manifest = JSON.parse(node.textContent);
      manifest.pages[1].blocks = doc.pages[1].blocks;
      node.textContent = JSON.stringify(manifest);
      return "<!doctype html>\n" + parsed.documentElement.outerHTML;
    }, brokenDoc);
    const brokenPath = join(OUT, "import-broken-values.html");
    await writeFile(brokenPath, brokenHtml, "utf8");
    const errorsBeforeBroken = pageErrors.length;
    const chooser3 = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser3).setFiles(brokenPath);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "BROKEN-1", null, { timeout: 5000 }).catch(() => {});
    await fresh.locator(".page-tree-item", { hasText: "BROKEN-2" }).first().click({ timeout: 3000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    const brokenShown = await fresh.evaluate(() => ({
      title: document.querySelector("#doc-title")?.textContent,
      texts: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent).join("|"),
    }));
    const brokenErrors = pageErrors.slice(errorsBeforeBroken);
    const brokenModel = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html).pages[1].blocks
      .map((block) => typeof block.type + ":" + block.type + "=" + JSON.stringify(block.text)).join("|"), brokenHtml);
    result.brokenValuesPageRenders = brokenShown.title === "BROKEN-2" && brokenErrors.length === 0
      && brokenShown.texts === "TYPE-NUM|TYPE-MISSING|12345||TAIL-OK";
    result.brokenValuesNormalized = brokenModel === 'string:paragraph="TYPE-NUM"|string:paragraph="TYPE-MISSING"|string:paragraph="12345"|string:paragraph=""|string:paragraph="TAIL-OK"';
    result.brokenValuesEvidence = brokenShown.title + " / " + brokenShown.texts + " / " + brokenModel + " / errors=" + brokenErrors.slice(0, 2).join(" | ");

    // 保存HTMLを #%(壊れた %)付きで開いても、ページの切り替えが動く(decodeURIComponent が投げて全ページが縦に並んだ)。
    const pagedHtml = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      pages: [
        { id: "hp1", title: "HASH-1", blocks: [{ id: "hx1", type: "paragraph", text: "one" }] },
        { id: "hp2", title: "HASH-2", blocks: [{ id: "hx2", type: "paragraph", text: "two" }] },
      ],
      fonts: [],
      attachments: [],
    }));
    const hashContext = await fresh.context().browser().newContext({ serviceWorkers: "block" });
    try {
      const hashViewer = await hashContext.newPage();
      const hashErrors = [];
      hashViewer.on("pageerror", (error) => hashErrors.push(String(error.message || error)));
      await hashViewer.route("**/__hash-probe.html", (route) => route.fulfill({ contentType: "text/html", body: pagedHtml }));
      await hashViewer.goto("http://127.0.0.1:" + PORT + "/__hash-probe.html#%");
      await hashViewer.waitForTimeout(300);
      const hashState = await hashViewer.evaluate(() => ({
        ready: document.documentElement.classList.contains("doc-pages-ready"),
        visible: [...document.querySelectorAll("section.doc-page")].filter((page) => page.offsetParent).map((page) => page.id).join(","),
      }));
      result.savedHtmlBadHashKeepsPaging = hashState.ready && hashState.visible === "page-hp1" && hashErrors.length === 0;
      result.savedHtmlBadHashEvidence = JSON.stringify(hashState) + " errors=" + hashErrors.slice(0, 2).join(" | ");
    } finally {
      await hashContext.close();
    }

    // 開発用サーバー: 壊れた %(/%)で落ちず、隣の editor-pwa-… フォルダを読ませない。
    // サーバーは ROOT を作業フォルダからの "editor-pwa" で決めるので、仮のフォルダに editor-pwa と隣のフォルダを作って立てる。
    const serverRoot = await mkdtemp(join(tmpdir(), "monolio-server-"));
    await mkdir(join(serverRoot, "editor-pwa"));
    await mkdir(join(serverRoot, "editor-pwa-secret"));
    await writeFile(join(serverRoot, "editor-pwa", "index.html"), "INDEX-OK", "utf8");
    await writeFile(join(serverRoot, "editor-pwa-secret", "s.txt"), "SIBLING-SECRET", "utf8");
    const freePort = await new Promise((resolve) => {
      const probe = createNetServer();
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
    const devServer = spawn(process.execPath, [fileURLToPath(new URL("../../server.mjs", import.meta.url))],
      { cwd: serverRoot, env: { ...process.env, PORT: String(freePort) }, stdio: ["ignore", "pipe", "pipe"] });
    try {
      await waitForServer(devServer);
      const get = (path) => new Promise((resolve) => {
        httpGet({ host: "127.0.0.1", port: freePort, path }, (response) => {
          let body = "";
          response.on("data", (chunk) => { body += chunk; });
          response.on("end", () => resolve(response.statusCode + ":" + body.slice(0, 20)));
        }).on("error", (error) => resolve("error:" + error.code));
      });
      const sibling = await get("/..%2Feditor-pwa-secret/s.txt");
      const badPercent = await get("/%");
      const afterBad = await get("/index.html");
      result.devServerRejectsSiblingFolder = !sibling.includes("SIBLING-SECRET") && sibling.startsWith("403");
      result.devServerSurvivesBadPercent = badPercent.startsWith("403") && afterBad === "200:INDEX-OK";
      result.devServerEvidence = [sibling, badPercent, afterBad].join(" / ");
    } finally {
      // Windows では、止めたサーバーが終わるまで、その作業フォルダを消せない(EBUSY で落ちた)。終わるのを待ってから消す。
      const exited = devServer.exitCode !== null || devServer.signalCode !== null ? Promise.resolve() : new Promise((resolve) => devServer.once("exit", resolve));
      devServer.kill();
      await exited;
      await rm(serverRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
    return result;
  } finally {
    await fresh.close();
  }
}
