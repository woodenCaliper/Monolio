// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { insertBlock, OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- Mermaid の図(v194。形式 0.8.5) ----
// ユーザー「Mermaid は導入済みか」→「はい、図は SVG です」。/mermaid(/図)で入れる図のブロック。
// コードが正で、描いた SVG を mermaidSvg に持ち、保存HTMLにはその SVG を載せる(Mermaid を読まずに図が出る)。
// Mermaid 本体は図のある文書でだけ読み込む。SVG は文書から来る値なので、開くとき・保存するときに無害化する。
const MERMAID_WAIT = 30000;

export default async function mermaidSuite({ context }) {
  const result = {};
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  const canvasText = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.type-mermaid .mermaid-canvas")]
    .map((canvas) => [...canvas.querySelectorAll("svg text")].map((node) => node.textContent).join(" ")));
  const openDoc = async (file, title) => {
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(file);
    await fresh.waitForFunction((expected) => document.querySelector("#doc-title")?.textContent === expected, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const saveDoc = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    return readFile(await (await download).path(), "utf8");
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 図の無い文書では Mermaid を読み込まない(約4MB。読み込む <script> も置かない)
    await fresh.locator("#blocks .block-content").nth(1).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" mermaid intro");
    await fresh.waitForTimeout(600);
    const notLoaded = () => fresh.evaluate(() => !document.querySelector('script[src*="mermaid"]') && typeof window.mermaid === "undefined");
    result.mermaidNotLoadedWithoutDiagram = await notLoaded();
    const bodyChildrenBefore = await fresh.evaluate(() => document.body.children.length);

    // 2) /mermaid で入れると、見本の流れ図が SVG で描かれ、コードは開いている
    await insertBlock(fresh, "mermaid");
    await fresh.waitForFunction(() => document.querySelector("#blocks .block.type-mermaid .mermaid-canvas svg text"), null, { timeout: MERMAID_WAIT }).catch(() => {});
    const inserted = await fresh.evaluate(() => {
      const row = document.querySelector("#blocks .block.type-mermaid");
      if (!row?.querySelector(".mermaid-canvas svg")) return { open: false, source: "", texts: "", id: "", foreign: 1, loaded: false };
      const svg = row.querySelector(".mermaid-canvas svg");
      return {
        open: row.classList.contains("source-open"),
        source: row.querySelector(".block-content").textContent,
        texts: [...svg.querySelectorAll("text")].map((node) => node.textContent).join(" "),
        id: svg.id,
        foreign: svg.querySelectorAll("foreignObject").length,
        loaded: Boolean(document.querySelector("script[data-pagelith-mermaid]")) && typeof window.mermaid?.render === "function",
        toggle: row.querySelector(".mermaid-source-toggle")?.textContent,
        focused: document.activeElement === row.querySelector(".block-content"),
      };
    });
    result.mermaidInsertedFromSlash = inserted.open && inserted.source.startsWith("flowchart LR") && inserted.toggle === "コードを隠す"
      && ["開始", "条件", "処理", "終了"].every((word) => inserted.texts.includes(word)) && inserted.focused;
    result.mermaidRendersPureSvg = inserted.id.startsWith("pagelith-mermaid-") && inserted.foreign === 0;
    result.mermaidLoadedOnDemand = inserted.loaded;

    // 3) /図 でも入る(日本語の呼び名)
    await insertBlock(fresh, "図");
    await fresh.waitForFunction(() => document.querySelectorAll("#blocks .block.type-mermaid .mermaid-canvas svg").length === 2, null, { timeout: MERMAID_WAIT }).catch(() => {});
    result.mermaidInsertedFromJapaneseSlash = await fresh.evaluate(() => document.querySelectorAll("#blocks .block.type-mermaid").length === 2);

    // 4) コードを書き換えると(打ち終わってから)描き直す
    const replaceSource = async (index, text) => {
      await fresh.evaluate((at) => {
        const content = document.querySelectorAll("#blocks .block.type-mermaid .block-content")[at];
        if (!content) return;
        content.focus();
        getSelection().selectAllChildren(content);
      }, index);
      await fresh.keyboard.type(text);
    };
    await replaceSource(0, "flowchart TD\n  X[入力] --> Y[出力]");
    await fresh.waitForFunction(() => {
      const svg = document.querySelector("#blocks .block.type-mermaid .mermaid-canvas svg");
      return svg && svg.textContent.includes("入力") && svg.textContent.includes("出力");
    }, null, { timeout: MERMAID_WAIT }).catch(() => {});
    const edited = (await canvasText())[0] || "";
    result.mermaidRerendersOnEdit = edited.includes("入力") && edited.includes("出力") && !edited.includes("開始");

    // 5) 文法の誤り: Mermaid の文言を赤で出し、コードは開いたまま、前の図は薄く残す。画面(body)に何も漏らさない
    await replaceSource(0, "flowchart TD\n  X[入力] -->");
    await fresh.waitForSelector("#blocks .block.type-mermaid .mermaid-errors", { timeout: MERMAID_WAIT }).catch(() => {});
    const broken = await fresh.evaluate((before) => {
      const row = document.querySelector("#blocks .block.type-mermaid");
      if (!row) return { error: "", errorColor: "", keptSvg: false, dimmed: false, open: false, bar: "", strays: 1, bodyChildren: false, bodyText: 1 };
      const canvas = row.querySelector(".mermaid-canvas");
      const strays = [...document.querySelectorAll('[id^="dpagelith-mermaid"], [id^="ipagelith-mermaid"], .mermaid-sandbox')];
      const outside = [...document.querySelectorAll('[id^="pagelith-mermaid"]')].filter((node) => !node.closest("#blocks"));
      return {
        error: canvas.querySelector(".mermaid-errors")?.textContent || "",
        errorColor: getComputedStyle(canvas.querySelector(".mermaid-errors") || canvas).color,
        keptSvg: Boolean(canvas.querySelector("svg")) && canvas.classList.contains("has-error"),
        dimmed: Number(getComputedStyle(canvas.querySelector("svg") || canvas).opacity) < 1,
        open: row.classList.contains("source-open"),
        bar: row.querySelector(".mermaid-source-status")?.textContent || "",
        strays: strays.length + outside.length,
        bodyChildren: document.body.children.length === before,
        bodyText: [...document.body.children].filter((node) => !node.matches(".app, script, style, link, iframe, [hidden]") && /Syntax error|Parse error/i.test(node.textContent)).length,
      };
    }, bodyChildrenBefore);
    result.mermaidShowsSyntaxError = /Parse error|error/i.test(broken.error) && broken.errorColor === "rgb(180, 72, 47)" && broken.bar.includes("エラー");
    result.mermaidErrorKeepsLastGoodSvg = broken.keptSvg && broken.dimmed && broken.open;
    result.mermaidErrorLeaksNothing = broken.strays === 0 && broken.bodyChildren && broken.bodyText === 0;

    // 直して先へ(保存の確認に使う)
    await replaceSource(0, "flowchart TD\n  X[入力] --> Y[出力]");
    await fresh.waitForFunction(() => !document.querySelector("#blocks .block.type-mermaid .mermaid-errors"), null, { timeout: MERMAID_WAIT }).catch(() => {});

    // 6) 保存: 形式 0.8.5 から(今は 0.8.6)。保存HTMLに SVG とコード(畳んだ <details>)が入り、Mermaid は入らない。開き直してもコードと図が残る
    const saved = await saveDoc();
    const savedInfo = await fresh.evaluate((text) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
      const dom = new DOMParser().parseFromString(text, "text/html");
      const manifest = JSON.parse(dom.querySelector("#document-manifest").textContent);
      const blocks = parsed.pages[0].blocks.filter((block) => block.type === "mermaid");
      const figure = dom.querySelector(".doc-mermaid");
      return {
        version: manifest.formatVersion,
        count: blocks.length,
        source: blocks[0]?.text || "",
        svgOk: (blocks[0]?.mermaidSvg || "").startsWith('<svg xmlns="http://www.w3.org/2000/svg" id="pagelith-mermaid-'),
        figureSvgText: figure?.querySelector(".doc-mermaid-canvas svg")?.textContent || "",
        details: figure?.querySelector("details.doc-chart-source pre")?.textContent || "",
        detailsClosed: figure?.querySelector("details.doc-chart-source")?.open === false,
        noMermaidScript: !text.includes("mermaid.min.js") && !/<script[^>]*src=/i.test(text),
        noForeign: !/foreignObject/i.test(figure?.innerHTML || "x"),
      };
    }, saved);
    result.mermaidSavedAsFormat085 = savedInfo.version === FORMAT_VERSION;
    result.mermaidSavedHtmlHasSvgAndCode = savedInfo.count === 2 && savedInfo.svgOk && savedInfo.figureSvgText.includes("入力")
      && savedInfo.details === "flowchart TD\n  X[入力] --> Y[出力]" && savedInfo.detailsClosed && savedInfo.noMermaidScript && savedInfo.noForeign;
    const savedPath = join(OUT, "mermaid-saved.html");
    await writeFile(savedPath, saved, "utf8");
    const savedTitle = await fresh.evaluate(() => document.querySelector("#doc-title").textContent);
    await openDoc(savedPath, savedTitle);
    await fresh.waitForFunction(() => document.querySelectorAll("#blocks .block.type-mermaid .mermaid-canvas svg").length === 2, null, { timeout: MERMAID_WAIT }).catch(() => {});
    const reopened = await fresh.evaluate(() => ({
      sources: [...document.querySelectorAll("#blocks .block.type-mermaid .block-content")].map((node) => node.textContent),
      text: document.querySelector("#blocks .block.type-mermaid .mermaid-canvas svg")?.textContent || "",
      closed: [...document.querySelectorAll("#blocks .block.type-mermaid")].every((row) => !row.classList.contains("source-open")),
    }));
    result.mermaidSurvivesReopen = reopened.sources[0] === "flowchart TD\n  X[入力] --> Y[出力]" && reopened.sources[1]?.startsWith("flowchart LR")
      && reopened.text.includes("入力") && reopened.closed;

    // 7) 保存HTMLをそのまま開くと(Mermaid なしで)図が出て、印刷でも刷られる(コードは刷らない)
    const view = await context.newPage();
    try {
      await view.setContent(saved, { waitUntil: "load" });
      const screen = await view.evaluate(() => {
        const svg = document.querySelector(".doc-mermaid-canvas svg");
        const rect = svg?.getBoundingClientRect();
        return { width: rect?.width || 0, height: rect?.height || 0, mermaid: typeof window.mermaid, texts: svg?.textContent || "" };
      });
      await view.emulateMedia({ media: "print" });
      const print = await view.evaluate(() => ({
        height: document.querySelector(".doc-mermaid-canvas svg")?.getBoundingClientRect().height || 0,
        source: document.querySelector(".doc-mermaid") ? getComputedStyle(document.querySelector(".doc-mermaid .doc-chart-source")).display : "",
        breakInside: document.querySelector(".doc-mermaid") ? getComputedStyle(document.querySelector(".doc-mermaid")).breakInside : "",
      }));
      result.mermaidSavedHtmlShowsSvgWithoutMermaid = screen.width > 50 && screen.height > 50 && screen.mermaid === "undefined" && screen.texts.includes("入力");
      result.mermaidPrints = print.height > 50 && print.source === "none" && print.breakInside === "avoid";
    } finally {
      await view.close();
    }

    // 7b) ブロックのメニューで複製すると、同じコードの図をすぐ出す(描いた結果の控えを使う)。コピーの text/plain はコード
    //     (SVG の文字には <style> の CSS が混ざるため)
    await fresh.evaluate(() => {
      window.__mermaidCopied = null;
      window.addEventListener("copy", (event) => { window.__mermaidCopied = event.clipboardData.getData("text/plain"); });
    });
    const firstId = await fresh.evaluate(() => document.querySelector("#blocks .block.type-mermaid")?.dataset.id);
    await fresh.keyboard.press("Escape");
    await fresh.locator(`#blocks .block[data-id="${firstId}"] .drag-grip`).click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#block-menu .menu-item[data-action="duplicate"]').click();
    const duplicated = await fresh.evaluate(() => {
      const rows = [...document.querySelectorAll("#blocks .block.type-mermaid")];
      return { count: rows.length, svgText: rows[1]?.querySelector(".mermaid-canvas svg")?.textContent || "", busy: Boolean(rows[1]?.querySelector(".mermaid-placeholder")) };
    });
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    const copiedPlain = await fresh.evaluate(() => window.__mermaidCopied);
    result.mermaidDuplicateShowsDiagramAtOnce = duplicated.count === 3 && duplicated.svgText.includes("入力") && !duplicated.busy;
    result.mermaidCopiesSourceAsPlainText = copiedPlain === "flowchart TD\n  X[入力] --> Y[出力]";

    // 8) 細工した SVG(文書の manifest に直接書いたもの)は、開くときに無害化され、保存HTMLにも残らない
    const hostileSvg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="pagelith-mermaid-evil" class="palette-backdrop"'
      + ' style="position:fixed;inset:0;z-index:9999" onload="window.__mermaidXss=1" width="100%" viewBox="0 0 100 50">'
      + "<style>@import url(http://evil.example/x.css); body{display:none} #pagelith-mermaid-evil{position:fixed;inset:0;font-size:20px}"
      + " #pagelith-mermaid-evil ~ *{display:none} #pagelith-mermaid-evil .bad{fill:url(http://evil.example/a)} #pagelith-mermaid-evil .ok{fill:rgb(1, 2, 3)}</style>"
      + "<script>window.__mermaidXss=2</script>"
      + '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="window.__mermaidXss=3"/></div></foreignObject>'
      + '<a xlink:href="javascript:window.__mermaidXss=4"><text class="ok" x="1" y="10">LINKTEXT</text></a>'
      + '<image href="http://evil.example/i.png" width="5" height="5"/>'
      + '<use href="http://evil.example/s.svg#x"/><use xlink:href="#pagelith-mermaid-evil-node"/>'
      + '<g id="blocks"><rect onclick="window.__mermaidXss=5" width="1" height="1"/></g>'
      + '<rect id="pagelith-mermaid-evil-node" fill="url(#pagelith-mermaid-evil-grad)" stroke="url(http://evil.example/s)" style="fill:url(javascript:alert(1))" width="2" height="2"/>'
      + "<text x=\"1\" y=\"30\">A&nbsp;B</text>"
      + "</svg>";
    const hostileHtml = await fresh.evaluate((svg) => window.SingleHtmlFormat.buildPortableHtml({
      pages: [
        // 文法の誤りのコードにしておく(描き直しで上書きされず、開いた SVG がそのまま画面と保存に使われる)
        { id: "MH", title: "Mermaid Hostile", blocks: [{ id: "mh1", type: "mermaid", text: "flowchart LR\n  A -->", mermaidSvg: svg }] },
      ],
      fonts: [],
      attachments: [],
    }), hostileSvg);
    // buildPortableHtml は無害化してから載せる。0.8.9 から図の絵は本文(data-svg-for)にだけ持つので、細工は本文の絵の場所へ
    // 生のまま差し替える(開くときは本文から拾って無害化する)。古い形(manifest の mermaidSvg に細工)も別に確かめる。
    const rawHostileHtml = hostileHtml.replace(/(<div class="doc-chart-canvas doc-mermaid-canvas" data-svg-for="mh1">)<svg[\s\S]*?<\/svg><\/div>/, (match, open) => open + hostileSvg + "</div>");
    const rawHostileOldHtml = hostileHtml.replace(/"id": "mh1",/, () => '"id": "mh1",\n          "mermaidSvg": ' + JSON.stringify(hostileSvg).replaceAll("</", "<\\/") + ",");
    const checkSvg = (svg) => !/<script|foreignObject|\son\w+=|javascript:|http:\/\/evil|@import|position|z-index|display:\s*none|class="palette|id="blocks"|<image/i.test(svg)
      && svg.includes("LINKTEXT") && svg.includes('id="pagelith-mermaid-evil"') && svg.includes('href="#pagelith-mermaid-evil-node"')
      && svg.includes("pagelith-mermaid-evil .ok") && svg.includes("A B");
    const parsedHostile = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text).pages[0].blocks[0].mermaidSvg, rawHostileHtml);
    const parsedHostileOld = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text).pages[0].blocks[0].mermaidSvg, rawHostileOldHtml);
    result.mermaidHostileSvgSanitizedOnOpen = rawHostileHtml.includes("__mermaidXss") && checkSvg(parsedHostile)
      && rawHostileOldHtml.includes("__mermaidXss") && checkSvg(parsedHostileOld);
    const hostilePath = join(OUT, "mermaid-hostile.html");
    await writeFile(hostilePath, rawHostileHtml, "utf8");
    await openDoc(hostilePath, "Mermaid Hostile");
    await fresh.waitForSelector("#blocks .block.type-mermaid .mermaid-errors", { timeout: MERMAID_WAIT }).catch(() => {});
    const hostileScreen = await fresh.evaluate(() => ({
      xss: window.__mermaidXss,
      shown: document.querySelector("#blocks .block.type-mermaid .mermaid-canvas svg text")?.textContent || "",
      bodyVisible: getComputedStyle(document.body).display !== "none" && getComputedStyle(document.querySelector(".app") || document.body).display !== "none",
      blocksEl: document.getElementById("blocks")?.classList.contains("blocks") && !document.querySelector('svg [id="blocks"]'),
      position: getComputedStyle(document.querySelector("#blocks .mermaid-canvas svg") || document.body).position,
    }));
    const hostileSaved = await saveDoc();
    const hostileSavedSvg = /<div class="doc-chart-canvas doc-mermaid-canvas"[^>]*>([\s\S]*?)<\/div>/.exec(hostileSaved)?.[1] || "";
    const hostileManifestSvg = await fresh.evaluate((text) => JSON.parse(new DOMParser().parseFromString(text, "text/html")
      .querySelector("#document-manifest").textContent).pages[0].blocks[0].mermaidSvg, hostileSaved);
    result.mermaidHostileSvgInertInEditor = hostileScreen.xss === undefined && hostileScreen.shown === "LINKTEXT" && hostileScreen.bodyVisible
      && hostileScreen.blocksEl && hostileScreen.position === "static";
    // 0.8.9: manifest には絵を持たない(本文の1か所だけ)
    result.mermaidHostileSvgSanitizedOnSave = checkSvg(hostileSavedSvg) && hostileManifestSvg === undefined && !hostileSaved.includes("__mermaidXss");
    const viewHostile = await context.newPage();
    try {
      await viewHostile.setContent(hostileSaved, { waitUntil: "load" });
      await viewHostile.waitForTimeout(200);
      result.mermaidHostileSavedHtmlInert = await viewHostile.evaluate(() => window.__mermaidXss === undefined
        && getComputedStyle(document.body).display !== "none" && document.querySelectorAll(".doc-mermaid svg").length === 1);
    } finally {
      await viewHostile.close();
    }

    // 9) ロックしたページの図: コードは編集できない。描いても「中身が変わった」として戻されない
    const lockedHtml = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      pages: [{ id: "ML", title: "Mermaid Locked", locked: true, blocks: [
        { id: "ml1", type: "paragraph", text: "locked intro" },
        { id: "ml2", type: "mermaid", text: "flowchart LR\n  P[ロック] --> Q[図]" },
      ] }],
      fonts: [],
      attachments: [],
    }));
    const lockedPath = join(OUT, "mermaid-locked.html");
    await writeFile(lockedPath, lockedHtml, "utf8");
    await openDoc(lockedPath, "Mermaid Locked");
    await fresh.waitForFunction(() => document.querySelector("#blocks .block.type-mermaid .mermaid-canvas svg text"), null, { timeout: MERMAID_WAIT }).catch(() => {});
    await fresh.waitForTimeout(300);
    const lockedBefore = await fresh.evaluate(() => ({
      status: document.querySelector("#status")?.textContent || "",
      notice: document.querySelector("#notice")?.hidden === false ? document.querySelector("#notice").textContent : "",
      svg: document.querySelector("#blocks .block.type-mermaid .mermaid-canvas svg")?.textContent || "",
    }));
    await fresh.locator("#blocks .block.type-mermaid .mermaid-source-toggle").click();
    await fresh.locator("#blocks .block.type-mermaid .mermaid-canvas").click();
    await fresh.evaluate(() => document.querySelector("#blocks .block.type-mermaid .block-content").focus());
    await fresh.keyboard.type("zz");
    await fresh.waitForTimeout(500);
    const lockedAfter = await fresh.evaluate(() => {
      const row = document.querySelector("#blocks .block.type-mermaid");
      return {
        source: row.querySelector(".block-content").textContent,
        editable: row.querySelector(".block-content").isContentEditable,
        open: row.classList.contains("source-open"),
      };
    });
    result.mermaidLockedPageNotEditable = lockedAfter.source === "flowchart LR\n  P[ロック] --> Q[図]" && !lockedAfter.editable && lockedAfter.open;
    result.mermaidRenderDoesNotTripLock = lockedBefore.svg.includes("ロック") && !lockedBefore.status.includes("ロックされています")
      && !lockedBefore.notice.includes("ロックされています");

    // 10) 形式: 0.8.4 のファイル(図の無い旧い版)もそのまま開ける。0.8.5 の図は読み直しても種類・コード・SVG が残る
    result.mermaidOldFormatOpens = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "O1", title: "Old", blocks: [{ id: "o1", type: "paragraph", text: "old body" }] }], fonts: [], attachments: [] })
        .replace('"formatVersion": "' + window.SingleHtmlFormat.VERSION + '"', '"formatVersion": "0.8.4"');
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      return html.includes('"formatVersion": "0.8.4"') && parsed.pages[0].blocks[0].text === "old body";
    });

    // 12) v196: 種類ごとの描き方の違いで、無害化のあと絵の一部が消えていたもの(ユーザー「Mermaid で書ける全パターン」)。
    //   - ユーザージャーニーの区切りの名前: foreignObject を捨てた後の控えの <text> が区切りの塗りと同じ色で見えなかった
    //   - アーキテクチャ図のアイコン: 入れ子の <svg> で描かれ、まるごと捨てていた
    //   - 特性要因図の矢印: marker の id が「ishikawa-arrow-根の id」(根の id で始まらない)で、id も参照も捨てていた
    //   - サンキー図の流れ: 図の外の id(linearGradient-N)を指す塗りで、塗りが消えて流れが見えなかった
    //   - ユースケース図: 根の style が「max-width + CSS 変数」で、max-width まで捨てて図が横に広がった
    const kindsHtml = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      pages: [{ id: "MK", title: "Mermaid Kinds", blocks: [
        { id: "mk-journey", type: "mermaid", text: "journey\n  title 作業\n  section 準備区切り\n    暖機: 3: 作業者" },
        { id: "mk-arch", type: "mermaid", text: "architecture-beta\n  service pc(server)[制御PC]\n  service db(database)[データ]\n  pc:R --> L:db" },
        { id: "mk-ishikawa", type: "mermaid", text: "ishikawa-beta\n  寸法不良\n  人\n    熟練度" },
        { id: "mk-sankey", type: "mermaid", text: "sankey-beta\nA,B,20\nA,C,70" },
        { id: "mk-usecase", type: "mermaid", text: "usecase-beta\nactor op(\"作業者\")\nm(\"測定する\")\nop --> m" },
      ] }],
      fonts: [],
      attachments: [],
    }));
    const kindsPath = join(OUT, "mermaid-kinds.html");
    await writeFile(kindsPath, kindsHtml, "utf8");
    await openDoc(kindsPath, "Mermaid Kinds");
    await fresh.waitForFunction(() => {
      const canvases = [...document.querySelectorAll("#blocks .block.type-mermaid .mermaid-canvas")];
      return canvases.length === 5 && canvases.every((canvas) => canvas.querySelector("svg") || canvas.querySelector(".mermaid-errors"));
    }, null, { timeout: MERMAID_WAIT }).catch(() => {});
    const kinds = await fresh.evaluate(() => {
      const svgOf = (id) => document.querySelector(`#blocks .block[data-id="${id}"] .mermaid-canvas > svg`);
      const errors = document.querySelectorAll("#blocks .block.type-mermaid .mermaid-errors").length;
      const journey = svgOf("mk-journey");
      const sectionText = [...(journey?.querySelectorAll("text.journey-section") || [])].find((node) => node.textContent.includes("準備区切り"));
      const sectionRect = journey?.querySelector("rect.journey-section");
      const arch = svgOf("mk-arch");
      const ishikawa = svgOf("mk-ishikawa");
      const marker = ishikawa?.querySelector("marker[id]");
      const sankey = svgOf("mk-sankey");
      const links = [...(sankey?.querySelectorAll(".link path") || [])];
      const usecase = svgOf("mk-usecase");
      return {
        errors,
        journeySectionFill: sectionText ? getComputedStyle(sectionText).fill : "",
        journeyRectFill: sectionRect ? getComputedStyle(sectionRect).fill : "",
        archIcons: arch ? arch.querySelectorAll("svg svg path").length : 0,
        ishikawaMarker: Boolean(marker) && marker.id.includes(ishikawa.id) && !marker.id.startsWith(ishikawa.id)
          && Boolean(ishikawa.querySelector(`[marker-start="url(#${marker.id})"], [marker-end="url(#${marker.id})"]`)),
        sankeyLinks: links.length,
        sankeyLinksPainted: links.length > 0 && links.every((path) => /^#[0-9a-f]{3,8}$|^rgb/i.test(path.getAttribute("stroke") || "")),
        usecaseMaxWidth: usecase?.getAttribute("style") || "",
      };
    });
    result.mermaidKindsRenderWithoutErrors = kinds.errors === 0;
    result.mermaidJourneySectionLabelVisible = kinds.journeySectionFill === "rgb(51, 51, 51)" && kinds.journeyRectFill !== kinds.journeySectionFill;
    result.mermaidArchitectureKeepsIcons = kinds.archIcons > 0;
    result.mermaidKeepsIdsWithRootInside = kinds.ishikawaMarker;
    result.mermaidSankeyLinksPainted = kinds.sankeyLinks === 2 && kinds.sankeyLinksPainted;
    result.mermaidKeepsMaxWidthBesideCssVariables = /^max-width: \d+(?:\.\d+)?px;$/.test(kinds.usecaseMaxWidth);
    // 無害化そのもの: 入れ子の svg も on〜 は捨てる。根の style は max-width の数だけ(ほかの宣言は捨てる)。根の id を含まない id は捨てる
    result.mermaidNestedSvgSanitized = await fresh.evaluate(() => {
      const out = window.SingleHtmlFormat.sanitizeMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg" id="pagelith-mermaid-k1" style="position:fixed;max-width:120px;--x:1"'
        + ' viewBox="0 0 10 10"><svg onload="window.__mermaidXss=6" width="5" height="5"><path id="IconX" d="M0 0L1 1"/></svg>'
        + '<marker id="arrow-pagelith-mermaid-k1"/><path id="pagelith-mermaid-k0-x" marker-end="url(#arrow-pagelith-mermaid-k1)" d="M0 0"/></svg>');
      return out.includes('style="max-width: 120px;"') && !/position|--x|onload|IconX|pagelith-mermaid-k0/.test(out)
        && out.includes('<svg width="5" height="5"><path d="M0 0L1 1"></path></svg>')
        && out.includes('id="arrow-pagelith-mermaid-k1"') && out.includes('marker-end="url(#arrow-pagelith-mermaid-k1)"');
    });

    // 13) 同梱の Mermaid そのものが、文書のコードから仕込める攻撃を無害にすること(2026-10 の確認。HANDOVER §4.27)。
    //   公表済みの脆弱性(CVE-2026-41159 書体の指定からの CSS の入り込み・CVE-2026-41148 classDef からの CSS の入り込み・
    //   CVE-2026-71438 設定のプロトタイプ汚染)は 11.16.0 以前が対象で、同梱の 12.1.0(と v223 で上げた 12.2.0)では効かないことを実際に描いて確かめた。
    //   Mermaid を上げたときに修正が抜けたり、アプリの設定(securityLevel: "strict" など)を緩めたりしたら、ここが赤になる。
    //   アプリが初期化した window.mermaid(アプリと同じ設定)で描く。外側にはアプリの無害化と CSP もあるが、ここでは Mermaid 単体を見る。
    const attack = await fresh.evaluate(async () => {
      const api = window.mermaid;
      if (!api?.render) return { ready: false };
      let n = 0;
      const stylesOf = (svg) => [...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
      const render = async (code) => {
        const id = "pagelith-mermaid-attack" + (n++);
        const box = document.createElement("div");
        box.className = "mermaid-sandbox";
        document.body.append(box);
        try {
          const { svg } = await api.render(id, code, box);
          return { id, svg, styles: stylesOf(svg) };
        } catch (error) {
          return { id, error: String(error?.message || error) };
        } finally {
          box.remove();
          document.getElementById("d" + id)?.remove();
          document.getElementById("i" + id)?.remove();
        }
      };
      // 図の外へ効く規則があるか。Mermaid の CSS はどの規則も「#図の id」から始まる(図の中だけに効く)。そうでない規則
      // (body{…} など)と、#図の id の後ろが兄弟(~ +)の規則、@import・@font-face は「図の外へ入り込んだ」とみなす。
      const outsideRules = (css, rootId) => {
        if (!css) return false;
        const sheet = new CSSStyleSheet();
        try { sheet.replaceSync(css); } catch { return true; }
        const scoped = new RegExp("^#" + rootId + "(?![\\w-])(\\s*>\\s*|\\s+(?![~+])|$)");
        const bad = (rules) => [...rules].some((rule) => {
          if (rule instanceof CSSStyleRule) return rule.selectorText.split(",").some((s) => !scoped.test(s.trim()));
          if (rule instanceof CSSKeyframesRule) return false;
          if (rule.cssRules) return bad(rule.cssRules);
          return true;
        });
        return bad(sheet.cssRules);
      };
      const escapes = (r) => Boolean(r.styles) && outsideRules(r.styles, r.id);
      const benignFont = await render('%%{init: {"fontFamily": "PagelithProbeFont"}}%%\nflowchart TD\n  A --> B');
      const evilFont = await render('%%{init: {"fontFamily": "PagelithProbeFont;} body{background:red} a{"}}%%\nflowchart TD\n  A --> B');
      const evilAltFont = await render('%%{init: {"altFontFamily": "x;} body{background:red} a{"}}%%\nflowchart TD\n  A --> B');
      const evilThemeCss = await render('%%{init: {"themeCSS": "} body{background:red} #x ~ * {color:red} a{"}}%%\nflowchart TD\n  A --> B');
      const evilClassDef = await render("flowchart TD\n  A --> B\n  classDef evil fill:red;} body{background:red} a{color:red\n  class A evil");
      const evilStyle = await render("flowchart TD\n  A --> B\n  style A fill:red;} body{background:red} a{color:red");
      const proto = await render('%%{init: {"__proto__": {"pagelithPolluted": "yes"}, "constructor": {"prototype": {"pagelithPolluted2": "yes"}}}}%%\nflowchart TD\n  A --> B');
      const loosen = await render('%%{init: {"securityLevel": "loose", "flowchart": {"htmlLabels": true}}}%%\nflowchart TD\n  A["<img src=x onerror=window.__mermaidXss=13>"] --> B');
      const all = [evilFont, evilAltFont, evilThemeCss, evilClassDef, evilStyle, proto, loosen];
      return {
        ready: true,
        // 対照: 無害な書体の指定は効く(=指定そのものは読まれている。攻撃の値だけが落とされている)。
        benignFontApplied: Boolean(benignFont.styles?.includes("PagelithProbeFont")),
        evilFontDropped: !evilFont.error && !evilFont.styles.includes("PagelithProbeFont;") && !escapes(evilFont),
        noCssEscapes: all.every((r) => !escapes(r)),
        noPrototypePollution: ({}).pagelithPolluted === undefined && ({}).pagelithPolluted2 === undefined,
        // 文書の指定で緩められず(設定の値が strict のまま)、HTML の文字(<img onerror>)も出ない。
        stillStrict: Boolean(loosen.svg) && !/<img|onerror|foreignObject/i.test(loosen.svg) && window.__mermaidXss === undefined
          && api.mermaidAPI?.getConfig?.()?.securityLevel === "strict",
        securityLevelSeen: String(api.mermaidAPI?.getConfig?.()?.securityLevel),
        // 判定そのものの点検(空振りしていないこと)。12.1.0 はアプリの設定の themeCSS まで無害化するので、外へ漏れる CSS を
        // Mermaid に出させて赤を確かめることができない。代わりに、外へ効く規則を確かに「外」と判定することをここで見る。
        detectorWorks: outsideRules("#r .node rect{fill:red} body{outline:0}", "r") && outsideRules("#r ~ p{color:red}", "r")
          && outsideRules("#r + p{color:red}", "r") && outsideRules("#rx .a{color:red}", "r")
          && !outsideRules("#r{font-family:a} #r .node rect{fill:red} #r > g{stroke:red} @keyframes k{from{opacity:0}to{opacity:1}}", "r"),
        sanitizedClean: all.filter((r) => r.svg).every((r) => {
          const clean = window.SingleHtmlFormat.sanitizeMermaidSvg(r.svg);
          return !outsideRules(stylesOf(clean), r.id) && !/<img|onerror|foreignObject/i.test(clean);
        }),
        evidence: all.map((r) => (r.error ? "error: " + r.error.slice(0, 60) : "ok")).join(" | "),
      };
    });
    result.mermaidLibAttackProbeRan = attack.ready === true;
    result.mermaidAttackDetectorWorks = attack.detectorWorks === true;
    result.mermaidLibAppliesBenignDirective = attack.benignFontApplied === true;
    result.mermaidLibDropsFontFamilyInjection = attack.evilFontDropped === true;
    result.mermaidLibBlocksCssEscapes = attack.noCssEscapes === true;
    result.mermaidLibNoPrototypePollution = attack.noPrototypePollution === true;
    result.mermaidLibStaysStrict = attack.stillStrict === true;
    result.mermaidAttackSvgSanitizedClean = attack.sanitizedClean === true;
    result.mermaidAttackEvidence = (attack.evidence || "") + " | securityLevel=" + attack.securityLevelSeen;

    // 14) 同梱の Mermaid は elkjs(EPL-2.0。GPL と組み合わせられない)を外して作り直したもの(Issue #234。
    //   editor-pwa/vendor/mermaid/build/build-mermaid.mjs)。ELK の並べ方(layout: elk・elk.*・flowchart-elk)を指定した図も、
    //   エラーにならず、ふつうの並べ方(dagre)と同じ絵で描かれる。elkjs を入れ戻すと ELK で並べるので、dagre との一致が崩れて赤になる。
    //   flowchart-elk は Mermaid 11 から元々 dagre で描く(絵の属性に種類の名前が入るので、一致ではなくエラーが無いことだけを見る)。
    const elk = await fresh.evaluate(async () => {
      const api = window.mermaid;
      if (!api?.render) return { ready: false };
      let n = 0;
      const render = async (code) => {
        const id = "pagelith-mermaid-elk" + (n++);
        const box = document.createElement("div");
        box.className = "mermaid-sandbox";
        document.body.append(box);
        try {
          const { svg } = await api.render(id, code, box);
          return { svg: svg.split(id).join("ID"), texts: (svg.match(/甲|乙|丙/g) || []).length };
        } catch (error) {
          return { error: String(error?.message || error) };
        } finally {
          box.remove();
          document.getElementById("d" + id)?.remove();
          document.getElementById("i" + id)?.remove();
        }
      };
      const body = "flowchart LR\n  A[甲] --> B[乙]\n  A --> C[丙]\n  B --> C";
      const dagre = await render("---\nconfig:\n  layout: dagre\n---\n" + body);
      const asked = [
        await render("---\nconfig:\n  layout: elk\n---\n" + body),
        await render('%%{init: {"layout": "elk.stress"}}%%\n' + body),
        await render(body.replace("flowchart LR", "flowchart-elk LR")),
      ];
      return {
        ready: true,
        dagreOk: Boolean(dagre.svg) && dagre.texts >= 3,
        noErrors: asked.every((r) => !r.error && r.texts >= 3),
        sameAsDagre: asked.slice(0, 2).every((r) => r.svg === dagre.svg),
        evidence: asked.map((r, at) => (r.error ? "error: " + r.error.slice(0, 80) : at === 2 ? "flowchart-elk ok" : r.svg === dagre.svg ? "dagre" : "differs")).join(" | "),
      };
    });
    result.mermaidElkLayoutRendersWithoutError = elk.ready === true && elk.dagreOk && elk.noErrors;
    result.mermaidElkLayoutFallsBackToDagre = elk.sameAsDagre === true;
    result.mermaidElkLayoutEvidence = elk.evidence || "";

    result.mermaidNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.mermaidPageErrors = pageErrors.join(" | ");
    result.mermaidSuiteCompleted = true;
  } catch (error) {
    // 途中で落ちても、そこまでの項目は report に残す(落ちたこと自体も不合格として数える)。
    result.mermaidSuiteCompleted = false;
    result.mermaidSuiteError = String(error?.stack || error);
  } finally {
    await fresh.close();
  }

  // 11) 図の無い文書を開いた別のページでも、Mermaid は読み込まれない(開く経路)
  const plain = await context.newPage();
  try {
    await plain.goto(`http://127.0.0.1:${PORT}/`);
    await plain.waitForSelector("#blocks .block-content");
    const html = await plain.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      pages: [{ id: "NP", title: "No Mermaid", blocks: [{ id: "np1", type: "code", text: "flowchart LR\n A --> B" }, { id: "np2", type: "chart", text: "" }] }],
      fonts: [],
      attachments: [],
    }));
    const path = join(OUT, "mermaid-none.html");
    await writeFile(path, html, "utf8");
    const chooser = plain.waitForEvent("filechooser");
    await openMenu(plain, "file");
    await plain.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await plain.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "No Mermaid", null, { timeout: 5000 }).catch(() => {});
    await plain.waitForTimeout(800);
    result.mermaidNotLoadedForDocumentWithoutDiagram = await plain.evaluate(() => document.querySelector("#doc-title")?.textContent === "No Mermaid"
      && !document.querySelector('script[src*="mermaid"]') && typeof window.mermaid === "undefined");
  } finally {
    await plain.close();
  }
  return result;
}
