// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 保存HTMLの複数ページ(Step 4) ----
// 保存HTMLでもエディタと同じく1ページずつ表示し、目次・ページリンク・戻る/進むで切り替える。
// **実際に保存したファイルを file:// で開いて**確かめる。スクリプトが動かない環境では全ページが縦に並ぶ
// (段階的な強化)。1ページの文書の出力には何も足さない。
export default async function portablePagesSuite({ context, browser }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const viewer = await context.newPage();
  const viewerErrors = [];
  viewer.on("pageerror", (error) => viewerErrors.push(String(error)));
  const noScriptContext = await browser.newContext({ javaScriptEnabled: false });
  const result = {};
  // 目次の1項目の形(エディタと保存HTMLで同じ物差しで測る)。
  const treeShape = ({ itemSelector, rootSelector }) => [...document.querySelectorAll(itemSelector)].map((item) => {
    let depth = 0;
    for (let node = item.parentElement; node && !node.matches(rootSelector); node = node.parentElement) {
      if (node.tagName === "UL") depth += 1;
    }
    return {
      id: item.dataset.pageId,
      title: item.textContent,
      depth,
      repeated: item.classList.contains("is-repeated"),
      unclassified: Boolean(item.closest(".is-unclassified")),
    };
  });
  const viewerState = () => viewer.evaluate(() => ({
    shown: [...document.querySelectorAll("section.doc-page")].filter((section) => getComputedStyle(section).display !== "none")
      .map((section) => section.dataset.pageId),
    current: [...document.querySelectorAll(".doc-page-tree-item.is-current")].map((item) => item.dataset.pageId),
    back: !document.querySelector("#doc-page-back").disabled,
    forward: !document.querySelector("#doc-page-forward").disabled,
  }));
  const clickViewerTree = async (title) => {
    await viewer.locator(".doc-page-tree-item", { hasText: title }).first().click();
    await viewer.waitForTimeout(100);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    // 文書: 先頭 PR → PA, PB。PA → PC、PB → PC(親が2つ)。PC → PA(循環)。PO はどこからもリンクされない(未分類)。
    const link = (id, pageId) => ({ id, type: "page", text: "", pageId });
    const para = (id, text) => ({ id, type: "paragraph", text });
    const literal = {
      title: "Portable Root",
      pages: [
        { id: "PR", title: "Portable Root", blocks: [para("pr1", "ROOT text"), link("pr2", "PA"), link("pr3", "PB"), link("pr4", "PX")] },
        { id: "PA", title: "Portable A", blocks: [para("pa1", "A text"), link("pa2", "PC")] },
        { id: "PB", title: "Portable B", blocks: [para("pb1", "B text"), link("pb2", "PC")] },
        { id: "PC", title: "Portable C", blocks: [para("pc1", "C text"), link("pc2", "PA")] },
        { id: "PO", title: "Portable Orphan", blocks: [para("po1", "ORPHAN text")] },
        // 題名はユーザーの入力で、保存HTMLは他人が開く。HTML として解釈されず、文字として出ること。
        { id: "PX", title: "<img src=x onerror=\"window.__portableXss=1\">", blocks: [para("px1", "XSS text")] },
      ],
      fonts: [],
      attachments: [],
    };
    // エディタで開き(ファイル経由)、そのエディタから保存したファイルを使う。
    const sourcePath = join(OUT, "portable-source.html");
    await writeFile(sourcePath, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(sourcePath);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Portable Root", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    const editorTree = await fresh.evaluate(treeShape, { itemSelector: "#page-tree-body .page-tree-item", rootSelector: "#page-tree-body" });
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "portable-pages.html");
    await (await download).saveAs(savedPath);
    const fileUrl = "file:///" + savedPath.replaceAll("\\", "/");
    await viewer.setViewportSize({ width: 1280, height: 720 });
    await viewer.goto(fileUrl, { waitUntil: "load" });
    await viewer.waitForTimeout(200);
    const historyLengthAtOpen = await viewer.evaluate(() => history.length);

    // 1) 目次の構造が、同じ文書でエディタと保存HTMLとで一致する(導出のコードが1つだから)。
    const portableTree = await viewer.evaluate(treeShape, { itemSelector: ".doc-page-tree-item", rootSelector: "#doc-page-tree" });
    result.portableTreeMatchesEditor = editorTree.length >= 5
      && JSON.stringify(portableTree) === JSON.stringify(editorTree);

    // 2) 最初は先頭ページだけが見え、目次で先頭ページが強調されている。
    const opened = await viewerState();
    result.portableShowsFirstPageOnly = opened.shown.join(",") === "PR"
      && opened.current.length >= 1 && opened.current.every((id) => id === "PR")
      && !opened.back && !opened.forward
      && await viewer.evaluate(() => getComputedStyle(document.querySelector("#doc-page-tree")).display !== "none");

    // 3) 目次のクリックとページブロックのクリックで切り替わる。
    await clickViewerTree("Portable B");
    const afterTree = await viewerState();
    await viewer.locator("section.doc-page.is-current p.page-link a").first().click();
    await viewer.waitForTimeout(100);
    const afterLink = await viewerState();
    // 切り替えは URL を書き換えない(# を付けない = ブラウザの履歴に積まない。エディタの v136 の判断と同じ)。
    const urlUntouched = await viewer.evaluate((length) => location.hash === "" && history.length === length, historyLengthAtOpen);
    result.portableTreeAndLinkSwitchPages = afterTree.shown.join(",") === "PB" && afterTree.current.every((id) => id === "PB")
      && afterLink.shown.join(",") === "PC" && afterLink.current.length >= 1 && afterLink.current.every((id) => id === "PC")
      && urlUntouched;

    // 4) 戻る/進む(エディタと同じ履歴の関数)。PR → PB → PC で、戻る×2 で PR、進むで PB。
    await viewer.locator("#doc-page-back").click();
    const back1 = await viewerState();
    await viewer.locator("#doc-page-back").click();
    const back2 = await viewerState();
    await viewer.locator("#doc-page-forward").click();
    const forward1 = await viewerState();
    result.portableBackForward = back1.shown.join(",") === "PB"
      && back2.shown.join(",") === "PR" && !back2.back && back2.forward
      && forward1.shown.join(",") === "PB" && forward1.back && forward1.forward;
    result.portableRuntimeHasNoErrors = viewerErrors.length === 0;

    // 4b) 題名はエスケープして出す(目次・見出し・ページリンク)。スクリプトとして実行されず、文字として見える。
    await clickViewerTree("<img");
    const escaped = await viewer.evaluate(() => ({
      images: document.querySelectorAll("img").length,
      ran: window.__portableXss === 1,
      heading: document.querySelector("section.doc-page.is-current h1")?.textContent || "",
      treeText: [...document.querySelectorAll(".doc-page-tree-item")].map((item) => item.textContent).join("|"),
      linkText: [...document.querySelectorAll("p.page-link a")].map((item) => item.textContent).join("|"),
    }));
    const rawTitle = "<img src=x onerror=\"window.__portableXss=1\">";
    result.portableEscapesPageTitles = escaped.images === 0 && !escaped.ran
      && escaped.heading === rawTitle && escaped.treeText.includes(rawTitle) && escaped.linkText.includes(rawTitle);

    // 4c) 印刷は全ページ(スクリプトで1ページずつ表示していても)。目次とバーは印刷しない。
    await viewer.emulateMedia({ media: "print" });
    const printed = await viewer.evaluate(() => ({
      shown: [...document.querySelectorAll("section.doc-page")].filter((section) => getComputedStyle(section).display !== "none")
        .map((section) => section.dataset.pageId),
      treeHidden: getComputedStyle(document.querySelector("#doc-page-tree")).display === "none",
      barHidden: getComputedStyle(document.querySelector("#doc-page-bar")).display === "none",
    }));
    await viewer.emulateMedia({ media: "screen" });
    // ページは読む順(ページ一覧の並び: PR → PA → PC、PB、PX、どこからも辿れない PO)に並ぶ(v253。Issue #105。以前は作った順)。
    result.portablePrintsEveryPage = printed.shown.join(",") === "PR,PA,PC,PB,PX,PO" && printed.treeHidden && printed.barHidden;

    // 5) 狭い画面: 目次はオーバーレイで既定は閉じ、☰ で開き、ページを選ぶと閉じる(エディタと同じ)。
    await viewer.setViewportSize({ width: 375, height: 700 });
    await viewer.waitForTimeout(250);
    const overlayOpen = () => viewer.evaluate(() => document.querySelector("#doc-page-tree").getBoundingClientRect().right > 10);
    const closedAtStart = !(await overlayOpen());
    await viewer.locator("#doc-page-tree-toggle").click();
    await viewer.waitForTimeout(300);
    const openedByToggle = await overlayOpen();
    await clickViewerTree("Portable A");
    await viewer.waitForTimeout(300);
    const narrowAfterPick = await viewerState();
    const closedAfterPick = !(await overlayOpen());
    await viewer.setViewportSize({ width: 1280, height: 720 });
    result.portableNarrowTreeIsOverlay = closedAtStart && openedByToggle && closedAfterPick
      && narrowAfterPick.shown.join(",") === "PA";

    // 6) スクリプトが動かない環境では、全ページが縦に並んで読める(目次とバーは出さない)。
    const plain = await noScriptContext.newPage();
    await plain.goto(fileUrl, { waitUntil: "load" });
    const plainState = await plain.evaluate(() => ({
      shown: [...document.querySelectorAll("section.doc-page")].filter((section) => getComputedStyle(section).display !== "none")
        .map((section) => section.dataset.pageId),
      treeShown: getComputedStyle(document.querySelector("#doc-page-tree")).display !== "none",
      barHidden: getComputedStyle(document.querySelector("#doc-page-bar")).display === "none",
      text: document.querySelector("main").innerText,
    }));
    // 目次のリンクで、縦に並んだそのページへ飛べる(スクリプト無しの段階的な強化)。
    await plain.locator(".doc-page-tree-item", { hasText: "Portable C" }).first().click();
    await plain.waitForTimeout(150);
    const plainJump = await plain.evaluate(() => ({
      hash: location.hash,
      top: Math.round(document.querySelector("#page-PC").getBoundingClientRect().top),
      scrolled: scrollY > 0,
      viewport: innerHeight,
    }));
    await plain.close();
    result.portableWorksWithoutScript = plainState.shown.join(",") === "PR,PA,PC,PB,PX,PO"
      && plainState.treeShown && plainState.barHidden
      && ["ROOT text", "A text", "B text", "C text", "ORPHAN text"].every((text) => plainState.text.includes(text))
      // 後ろのページが短いと先頭まで送れないので、「スクロールして、そのページが画面の中にある」で見る。
      && plainJump.hash === "#page-PC" && plainJump.scrolled && plainJump.top >= -2 && plainJump.top < plainJump.viewport;

    // 7) 1ページの文書の出力には何も足さない(目次・バー・ページ用の CSS とランタイム・<section> が無い)。
    //    バイト単位の同一性は、v141 の document-format.js と並べて出力を比べて確かめた(報告に記載)。
    const single = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({
        pages: [{ id: "S1", title: "Single", blocks: [{ id: "s1", type: "paragraph", text: "single body" }] }],
        fonts: [],
        attachments: [],
      });
      const view = new DOMParser().parseFromString(html, "text/html");
      return {
        noPageMarkup: !["doc-page", "doc-pages-ready", "doc-app", "createPageHistory"].some((token) => html.includes(token)),
        scripts: view.querySelectorAll("script:not([type])").length,
        heading: view.querySelector("body > main > h1")?.textContent,
      };
    });
    result.portableSinglePageUnchanged = single.noPageMarkup && single.scripts === 1 && single.heading === "Single";
    // 8) 1ページの文書の出力は **Step 4 より前(v141 = 39ca77b)と1バイトも違わない**。同じ文書を v141 の
    //    document-format.js で書き出したときの SHA-256 を固定値として持つ(日時は固定して比べる)。
    //    1ページの出力を意図して変えたときは、この値を更新すること(変わったことがテストで見える)。
    //    v162: グラフのコードの CSS を <details> に合わせて直した(v161 でクラスが <details> へ移ったのに CSS が
    //    pre.doc-chart-source のままだった)ので、意図して更新した(PdM 了承)。以前の値は 8f12229…546b(v141 と同一)。
    //    v166: データラベルの見た目を保存HTMLの CSS のクラスへ(.chart-value・.chart-value-inside。PdM 指示)。CSS は全文書に
    //    入るので、意図して更新した。以前の値は 48b5ad45…0c317(v162〜v165)。
    //    v173: 記号(• ▸ ▾)の字形の余白を開いたときに測ってそろえる(CSS の --bullet-ink-fix と portableRuntime の
    //    alignMarkerInk)。CSS と実行用スクリプトは全文書に入るので、意図して更新した。以前の値は 902611c6…6d4d(v166〜v172)。
    //    v174: 記号(▸ ▾ • ☐ ☑ 📄)を図形(SVG・CSS の円と mask)にし、v173 の計測を外した。CSS と実行用スクリプトが
    //    全文書に入るので、意図して更新した。以前の値は 251bc5a3…283a(v173)。
    //    v176: 本文のタブ文字の幅(p,li,h2〜h6 の tab-size:4em)を足した。CSS は全文書に入るので、意図して更新した。
    //    以前の値は bb5ceb03…c5c(v174)。
    //    v178: 保存形式を 0.8.2 に上げた(ページのロック)。manifest の formatVersion が変わるので、意図して更新した。
    //    以前の値は e761fcad…80f1(v176)。
    //    v182: 印刷・PDF の @media print を足し、表の見出しの行の意匠の指定を thead に変えた。トグルの中身の字下げも足した。
    //    CSS は全文書に入るので、意図して更新した。以前の値は a825997c…6289(v178)。
    //    v185: 区切り線(hr)の色を濃くした(#d7dce2 → #b4b9c1。ユーザー指示)。CSS は全文書に入るので、意図して更新した。
    //    以前の値は 0bb3a317…deed(v182〜v184)。
    //    v190: エディタと保存HTMLの見た目をそろえた(本文の幅・行の高さ・見出し・ブロックの間隔・題名の位置など。P7)。
    //    CSS は全文書に入るので、意図して更新した。以前の値は 3f103de6…453b(v185〜v188)。
    //    (v189 で作った値 ad2869c3…360c は、マージの際に版数を v190 へ上げて CSS のコメントの版数が変わったので更新した。)
    //    v191: 図表の題名(.doc-caption)の CSS と形式 0.8.3。意図して更新した。以前の値は 6ee81a32…3187(v190)。
    //    v192: 保存形式を 0.8.4 に上げ(改ページのブロック)、印刷の CSS に .page-break を足した。manifest と CSS が全文書に入るので、
    //    意図して更新した。以前の値は 53579815…23b5(v191)。
    //    v194: 保存形式を 0.8.5 に上げ(Mermaid の図のブロック)、図の CSS(.doc-mermaid-canvas svg)を足した。manifest と CSS が
    //    全文書に入るので、意図して更新した。以前の値は 94bceb64…017d(v192〜v193)。
    //    v197: 印刷で、図・数式・表の直前の段落を図と同じ紙に残す(p:has(+ …){break-after:avoid})。CSS は全文書に入るので、
    //    意図して更新した。以前の値は 0b6625a7…c6f2(v196)。
    //    v198: 保存形式を 0.8.6 に上げ(本文の図表の参照)、参照のリンクの CSS(.figure-ref)を足した(並行した PR #30。v196 として作られ、
    //    v197 の印刷の変更の後に入れた)。manifest と CSS が全文書に入るので、意図して更新した。以前の値は 82e4d100…fb1a(v197)。
    //    v200: 本文のリンク(.doc-link の CSS)と形式 0.8.7。CSS と manifest が全文書に入るので、意図して更新した。以前の値は 4d5f2146…15de(v198)。
    //    v201: 題名から上を薄い灰色に(影で塗り、下に細い線。ユーザー指示)。CSS は全文書に入るので、意図して更新した。
    //    以前の値は ab4a667e…27aa(v200)。
    //    v205: いま読んでいる所の見出し(見出し1〜3がある文書に CSS とスクリプトを足す。この文書は見出し1を持つ)。
    //    意図して更新した。以前の値は faee3d8e…426b(v201)。
    //    v213: manifest の JSON の "<" を \u003c にした(本文の </SCRIPT> で保存したファイルが開けなくなっていた)。この文書は
    //    本文に <b> を持つので manifest が変わる。意図して更新した。以前の値は 4be62597…7bf5(v205〜v212)。
    //    v213: 目次ブロックの項目(a)の中身を span に包んだ(a は flex で、文字と `コード`・$$数式$$ の間の空白が消えていた)。
    //    この文書は目次ブロックを持つので変わる。意図して更新した。以前の値は 337c24b0…78c9(v213 の manifest の直し)。
    //    v218: 保存形式を 0.8.8 に上げ(見出しに番号の設定・見出しへの参照)、見出しの道筋のスクリプトが番号(span.heading-number)を
    //    名前の前に空白を挟んで載せるようにした。この文書は番号が切なので本文・CSS は変わらないが、manifest の formatVersion と
    //    見出しの道筋のスクリプトが変わるので、意図して更新した。以前の値は 536388b4…a2a9(v213〜v216)。
    //    v224: 見出しの道筋の帯の縮む割合を 親 4 : 今の見出し 1 にした(長い見出しが帯からはみ出していた)。この文書は見出し1を持ち
    //    帯の CSS が入るので、意図して更新した。以前の値は 25103d0b…3b4e(v218〜v221)。
    //    v226: 保存形式を 0.8.9 に上げ、manifest を <head> の先頭へ移し、その上にファイルの構成の注釈を置いた(AI が先頭だけ読めば
    //    済むように)。全文書の並びが変わるので、意図して更新した。以前の値は a9a7543b…c288(v224〜v225)。
    //    v227: 保存HTMLのランタイムに画像の添付を見せる URL の関数(imageDisplayUrl)を埋め込み、hydrateImage がそれを使うようにした
    //    (SVG の画像を新しいタブで開くと中のスクリプトが動いた)。出力の差はランタイムのこの2か所だけ(前後の出力を比べて確かめた)。
    //    以前の値は ff8bf0cb…c01e(v226)。
    //    v229: 保存形式を 0.8.10 に上げ(表のデータベース)、保存HTMLの CSS にデータベースの札などを足した。この文書の表はデータベースでは
    //    ないので表の HTML は変わらないが、manifest の formatVersion と CSS が変わるので、意図して更新した。以前の値は 496fd9fa…eac1(v227〜v228)。
    //    v231: 保存HTMLの CSS に、広い表を横にスクロールする箱(.doc-table-scroll)と印刷の決まりを足した。この文書の表は列幅が無いので
    //    表の HTML は変わらないが、CSS が変わるので、意図して更新した。以前の値は 7d566398…b6a0(v229〜v230)。
    //    v232: 保存形式を 0.8.11 に上げ(表の配置・数の見せ方・絞り込み・式の新しい書き方)、保存HTMLの CSS に絞り込みの一言(.doc-table-filter-note)を
    //    足した。この文書の表は書式も絞り込みも無いので表の HTML は変わらないが、manifest と CSS が変わるので、意図して更新した。以前の値は 998b16ea…3580(v231)。
    //    v235: 保存形式を 0.8.12 に上げ(表を見せる高さ)、保存HTMLの CSS に見せる高さの箱(.doc-table-view)を足した。CSS と manifest は
    //    全文書に入るので、意図して更新した。以前の値は a2b5b9b0…099a(v232)。
    //    v238: 保存形式を 0.8.13 に上げた(表の行の高さ)。この文書の表は行の高さが無いので表の HTML は変わらないが、manifest の formatVersion が
    //    変わるので、意図して更新した。以前の値は acca1860…b252(v236)。
    //    v240: 保存形式を 0.8.14 に上げ(提案 suggestions)、先頭の注釈に提案の書き方の1行(3.)を足した。この文書に提案は無いので本文と
    //    manifest の中身は変わらないが、formatVersion と注釈が変わるので、意図して更新した。以前の値は 6f151fbb…f8b5(v238〜v239)。
    //    v252: 保存HTMLの CSS の本文と題名に overflow-wrap:anywhere を足した(Issue #114。空白の無い長い語が右で切れていた)。CSS は全文書に
    //    入るので、意図して更新した。以前の値は 10d52c0e…a11b(v240〜v251)。
    //    v255: 保存HTMLの CSS にトグルのすぐ下の入れ子の字下げ(details.toggle>.indent)を足した(Issue #132)。CSS は全文書に入るので、
    //    意図して更新した。以前の値は a3d963e1…3000(v252〜v254)。
    //    v257: 保存HTMLの CSS の表のセルに white-space:pre-wrap を足した(Issue #136。セルの中の改行が消えていた)。CSS は全文書に
    //    入るので、意図して更新した。以前の値は fc60b454…08b3(v255〜v256)。
    //    v266: 先頭の注釈の 3. を短くし、案内(docs/format/。GitHub Pages)へのリンクの1行を足した(書き方の決まりはファイルに書かない)。
    //    本文と manifest は変わらないが、注釈が変わるので、意図して更新した。以前の値は 9c62eedb…7dfb。
    //    v269: 保存形式を 0.8.15 に上げた(表のセルのリンクをどのセルにも)。この文書の表にリンクは無いので表の HTML は変わらないが、
    //    manifest の formatVersion と注釈の版が変わるので、意図して更新した。以前の値は 412a4262…ccd5(v266〜v268)。
    //    v273: 保存形式を 0.8.16 に上げ(動画の添付・attachmentView)、保存HTMLの CSS に動画と「再生できませんでした」の欄を足した。
    //    この文書に動画は無いが、manifest の formatVersion・注釈・CSS が変わるので、意図して更新した。以前の値は c9b42315…e139。
    //    v274: 保存形式を 0.8.17 に上げた(文の下線 <u>。Issue #172)。この文書に下線は無いが、manifest の formatVersion と注釈の版が
    //    変わるので、意図して更新した。以前の値は 6c8d4760…3d1e(v273)。
    //    v275: 保存形式を 0.8.18 に上げ(文中のページへのリンク。Issue #174)、保存HTMLの CSS にページへのリンクの印(.figure-ref.is-page)を足した。
    //    この文書にページへのリンクは無いが、manifest の formatVersion・注釈・CSS が変わるので、意図して更新した。以前の値は 41e202bd…08dd(v274)。
    //    v277: 保存形式を 0.8.19 に上げた(PDF をその場で見る・attachmentView: "read")。PDF の CSS は PDF のある文書にだけ足すので、
    //    この文書では manifest の formatVersion と注釈の版だけが変わる。意図して更新した。以前の値は a0bf7de5…cb33(v276)。
    //    v282: 保存HTMLのランタイムが、添付の処理(base64 の読み書き・ハッシュ・確かめ)をエディタの関数そのまま埋め込むようになった
    //    (#219・#222)。ランタイムは全文書に入るので、意図して更新した。以前の値は 918eb2c9…d335(v277〜v280)。
    //    v283: 保存形式を 0.8.20 に上げた(絞り込みの条件・ブロックへのリンク・呼び出しとブロックの色・番号の形と音声)。この文書はどれも
    //    使わないので、変わるのは manifest の formatVersion と注釈の版だけ。意図して更新した。以前の値は 8e01118d…3576(v282)。
    //    v284: 保存形式を 0.8.21 に上げた(文書の書体・小さい文字・ページのアイコンとカバー・データベースの列の種類・グループ分け・コードの言語と色分け)。この文書はどれも
    //    使わないが、manifest の formatVersion・注釈の版と、データベースの札・印の CSS(全文書に入る)が変わる。意図して更新した。以前の値は d1bd4943…0342(v283)。
    //    v286: 保存HTMLの CSS を document-style.js が作るようにした(#201。色は :root の --doc-… から、表の線・見出しの地などはエディタの値)。
    //    CSS は全文書に入るので、意図して更新した。以前の値は 77cdeffe…5579(v284〜v285)。
    //    v290: 先頭の注釈に本体のライセンスの表記(GPL-3.0-or-later。Issue #234)を足した。全文書の注釈に入るので、意図して更新した。以前の値は f2afd6ca…8843(v286〜v289)。
    //    v293: 形式の版を 1.0 にし、保存HTMLに作ったアプリの版(generator。manifest・meta・注釈)を足した。全文書に入るので、意図して更新した。以前の値は b2996e5f…7882(v290〜v292)。
    const SINGLE_PAGE_SHA256_BEFORE_STEP4 = "34df963da5f2d3d8d599957eb3fc43f571c82756e1b9eec69fd400901ef8b668";
    const singleDigest = await fresh.evaluate(async () => {
      const original = Date.prototype.toISOString;
      Date.prototype.toISOString = () => "2026-01-01T00:00:00.000Z";
      try {
        const html = window.SingleHtmlFormat.buildPortableHtml({
          pages: [{ id: "golden", title: "Golden Single", blocks: [
            { id: "g1", type: "heading1", text: "Heading" },
            { id: "g2", type: "toc", text: "" },
            { id: "g3", type: "paragraph", text: "Body <b>text</b> & more" },
            { id: "g4", type: "bullet", text: "item" },
            { id: "g5", type: "code", text: "x = 1" },
            { id: "g6", type: "table", text: "", rows: [[{ text: "a" }, { text: "b" }], [{ text: "1" }, { text: "2" }]] },
          ] }],
          fonts: [],
          attachments: [],
        });
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      } finally {
        Date.prototype.toISOString = original;
      }
    });
    result.portableSinglePageMatchesStep3Output = singleDigest === SINGLE_PAGE_SHA256_BEFORE_STEP4;
    // 証拠(版を上げて値が変わったとき、新しい値をここから読む)
    result.portableSingleDigest = singleDigest;

    // 9) 添付の ID は HTML の属性に書き出す値。画像以外の添付のダウンロードボタンでもエスケープする
    //    (画像の分岐と同じ)。開いた文書の ID は信用せず正規化し、保存し直した HTML に属性の外へ出る文字が無い。
    const hostileId = 'att"><img src=x onerror="window.__attachmentXss=1">';
    const hostile = await fresh.evaluate(async (badId) => {
      const file = new File([new Uint8Array([5, 4, 3])], "hostile.bin", { type: "application/octet-stream" });
      const attachment = await window.SingleHtmlFormat.fileToAttachment(file, badId);
      const doc = {
        pages: [{ id: "HA", title: "Hostile Attachment", blocks: [
          { id: "ha1", type: "paragraph", text: "HOSTILE body" },
          { id: "ha2", type: "attachment", text: "", attachmentId: badId },
        ] }],
        fonts: [],
        attachments: [attachment],
      };
      const html = window.SingleHtmlFormat.buildPortableHtml(doc);
      const view = new DOMParser().parseFromString(html, "text/html");
      const buttons = [...view.querySelectorAll("[data-download]")];
      return {
        html,
        // 書き出し: 属性の中に閉じ込められ、要素が増えない(ボタンの値は元の ID のまま)。
        escapedInExport: buttons.length === 1 && buttons[0].dataset.download === badId && view.querySelectorAll("img").length === 0,
      };
    }, hostileId);
    result.attachmentIdEscapedInExport = hostile.escapedInExport;
    const hostilePath = join(OUT, "hostile-attachment.html");
    await writeFile(hostilePath, hostile.html, "utf8");
    const hostileChooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await hostileChooser).setFiles(hostilePath);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Hostile Attachment", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    const cardShown = await fresh.locator(".attachment-file-card", { hasText: "hostile.bin" }).count();
    const resaveDownload = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const resavedPath = join(DOWNLOADS, "hostile-resaved.html");
    await (await resaveDownload).saveAs(resavedPath);
    const resaved = await fresh.evaluate((html) => {
      const view = new DOMParser().parseFromString(html, "text/html");
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const ids = [...view.querySelectorAll("[data-download]")].map((button) => button.getAttribute("data-download"));
      const attachmentIds = parsed.attachments.map((attachment) => attachment.id);
      const referenced = parsed.pages.flatMap((page) => page.blocks).filter((block) => block.type === "attachment").map((block) => block.attachmentId);
      return {
        safeIds: ids.length === 1 && ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id)),
        noInjectedElements: view.querySelectorAll("img").length === 0 && !html.includes("onerror=\"window.__attachmentXss"),
        // 付け替えた ID で、ブロックと添付がつながったまま(添付が消えていない)。
        stillLinked: attachmentIds.length === 1 && referenced.length === 1 && referenced[0] === attachmentIds[0] && ids[0] === attachmentIds[0],
      };
    }, await readFile(resavedPath, "utf8"));
    result.openedAttachmentIdsAreNormalized = cardShown === 1 && resaved.safeIds && resaved.noInjectedElements && resaved.stillLinked
      && await fresh.evaluate(() => window.__attachmentXss === undefined);
    return result;
  } finally {
    await noScriptContext.close();
    await viewer.close();
    await fresh.close();
  }
}
