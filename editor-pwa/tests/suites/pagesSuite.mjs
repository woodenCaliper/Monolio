// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FONT_FAMILY, FONT_FIXTURE, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 複数ページの器(Step1) ----
// Step1 は**振る舞い不変**で、ページは常に1つ。したがって画面の見た目では何も確かめられない。
// ここで守るのは「ページを跨いでも落とさない」側の性質だけ:
//   ・旧形式(blocks[])のファイルが開けること(互換を落とすと過去の保存物が読めなくなる)
//   ・保存と読み込みで**全ページ**が往復すること
//   ・添付の掃除が**全ページ**を見ること(ここを現在ページだけにすると他ページの添付が消える)
//   ・目次ブロックは**そのページ**の見出しだけを並べること(全ページを見ると他ページが混ざる)
// 2ページの文書は、保存ファイルを開く経路でしか作れない(ページ追加のUIは Step2)。
export default async function pagesSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 旧形式(0.7.0 相当: manifest.blocks)の読み込み互換。
    const legacy = await fresh.evaluate(() => {
      const manifest = {
        format: "SingleHtmlTechnicalDocument",
        formatVersion: "0.7.0",
        title: "Legacy Doc",
        blocks: [
          { id: "l1", type: "heading1", text: "LEGACY head" },
          { id: "l2", type: "paragraph", text: "LEGACY body" },
        ],
        fonts: [],
        attachments: [],
      };
      const close = "<" + "/script>";
      const html = "<!doctype html><html><head><title>Legacy Doc</title>"
        + '<script type="application/vnd.single-html-doc+json" id="document-manifest">'
        + JSON.stringify(manifest) + close
        + '<script type="application/vnd.single-html-doc.attachments+json" id="document-attachments">'
        + JSON.stringify({ attachments: [] }) + close
        + "</head><body><main></main></body></html>";
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      return {
        // 文書の題名は持たない(返さない)。返すと、どこからも編集されない3つ目の題名になる。
        hasNoDocumentTitle: !("title" in parsed),
        // 題名の二重持ち(doc.title と pages[0].title)は、旧形式を読んでも同じ値になる。
        firstPageTitle: parsed.pages[0]?.title,
        pageCount: parsed.pages.length,
        texts: parsed.pages.flatMap((page) => page.blocks.map((block) => block.text)),
        // 開くページは UI 状態で、文書(解析結果)には持たない。
        hasNoUiState: !("currentPageId" in parsed),
      };
    });
    // 1b) 0.8.0(Step 1 の版)のファイル: 本当の題名は manifest.title にだけあり、先頭ページは "Untitled"。
    //     そのときだけ manifest.title を先頭ページの題名として採る。ほかの場合は採らない
    //     (0.8.1 の manifest.title は導出値。0.8.0 でも先頭ページに題名があればそれが正)。
    const step1Titles = await fresh.evaluate(() => {
      const close = "<" + "/script>";
      const htmlOf = (manifest) => "<!doctype html><html><head><title>" + manifest.title + "</title>"
        + '<script type="application/vnd.single-html-doc+json" id="document-manifest">'
        + JSON.stringify(manifest) + close
        + '<script type="application/vnd.single-html-doc.attachments+json" id="document-attachments">'
        + JSON.stringify({ attachments: [] }) + close
        + "</head><body><main></main></body></html>";
      const firstTitle = (formatVersion, title, firstPageTitle) => window.SingleHtmlFormat.parsePortableHtml(htmlOf({
        format: "SingleHtmlTechnicalDocument",
        formatVersion,
        title,
        pages: [
          { id: "s1", title: firstPageTitle, blocks: [{ id: "s1p", type: "paragraph", text: "x" }] },
          { id: "s2", title: "Second", blocks: [] },
        ],
        fonts: [],
        attachments: [],
      })).pages.map((page) => page.title).join(",");
      return {
        rescued: firstTitle("0.8.0", "本当の題名", "Untitled"),
        rescuedFromEmpty: firstTitle("0.8.0", "本当の題名", ""),
        keepsOwnTitle: firstTitle("0.8.0", "古い題名", "ページの題名"),
        newerIgnoresManifest: firstTitle("0.8.1", "導出値", "Untitled"),
      };
    });
    result.step1FileKeepsTitle = step1Titles.rescued === "本当の題名,Second"
      && step1Titles.rescuedFromEmpty === "本当の題名,Second";
    result.step1TitleRescueOnlyWhenUntitled = step1Titles.keepsOwnTitle === "ページの題名,Second"
      && step1Titles.newerIgnoresManifest === "Untitled,Second";

    result.legacyBlocksDocumentOpensAsOnePage = legacy.hasNoDocumentTitle
      && legacy.firstPageTitle === "Legacy Doc"
      && legacy.pageCount === 1
      && legacy.texts.join("|") === "LEGACY head|LEGACY body"
      && legacy.hasNoUiState;

    // 2) 新形式の往復。2ページが両方とも保存され、読み戻せること。
    const roundTrip = await fresh.evaluate(() => {
      const doc = {
        title: "Two Pages",
        pages: [
          // 先頭ページの題名は文書の題名そのもの(v131 からの不変条件)。
          { id: "page-1", title: "Two Pages", blocks: [{ id: "a1", type: "paragraph", text: "PAGE1 body" }] },
          { id: "page-2", title: "Second", blocks: [{ id: "b1", type: "paragraph", text: "PAGE2 body" }] },
        ],
        fonts: [],
        attachments: [],
      };
      const html = window.SingleHtmlFormat.buildPortableHtml(doc);
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const manifest = JSON.parse(new DOMParser().parseFromString(html, "text/html")
        .querySelector("#document-manifest").textContent);
      return {
        formatVersion: manifest.formatVersion,
        manifestHasPages: Array.isArray(manifest.pages) && manifest.pages.length === 2,
        pageIds: parsed.pages.map((page) => page.id).join(","),
        pageTitles: parsed.pages.map((page) => page.title).join(","),
        texts: parsed.pages.flatMap((page) => page.blocks.map((block) => block.text)).join("|"),
        // 題名は各ページが独立して持ち、文書の題名という別の値は無い。保存ファイルの <title> と
        // 先頭の <h1> は先頭ページの題名から導く(文書側に余計な title があっても使わない)。
        documentTitleComesFromFirstPage: (() => {
          const html = window.SingleHtmlFormat.buildPortableHtml({
            title: "Stale Document Title",
            pages: [{ id: "x1", title: "Alpha", blocks: [] }, { id: "x2", title: "Beta", blocks: [] }],
            fonts: [],
            attachments: [],
          });
          const view = new DOMParser().parseFromString(html, "text/html");
          const back = window.SingleHtmlFormat.parsePortableHtml(html);
          return view.title === "Alpha"
            && view.querySelector("main h1")?.textContent === "Alpha"
            && back.pages.map((page) => page.title).join(",") === "Alpha,Beta"
            && !("title" in back);
        })(),
        // 描画される本文に両ページが出ていること。**html 文字列で見てはいけない**:
        // マニフェスト(JSON)にも同じ文字列が載っているため、本文が欠けても一致してしまう
        // (赤確認Bで実際に素通りした)。
        bodyHasBoth: (() => {
          const view = new DOMParser().parseFromString(html, "text/html");
          const text = view.querySelector("main")?.textContent || "";
          return text.includes("PAGE1 body") && text.includes("PAGE2 body");
        })(),
      };
    });
    result.pagesRoundTripKeepsEveryPage = roundTrip.pageIds === "page-1,page-2"
      && roundTrip.pageTitles === "Two Pages,Second"
      && roundTrip.texts === "PAGE1 body|PAGE2 body"
      && roundTrip.manifestHasPages;
    result.exportedBodyKeepsEveryPage = roundTrip.bodyHasBoth;
    // 0.8.0: pages[] になった。0.8.1: manifest.title が「先頭ページの題名から導いた値」になった(意味が変わったので上げた)。
    // 0.8.2: ページのロック(pages[].locked。v178)。0.8.3: 図表の題名(blocks[].caption。v191)。
    // 0.8.4: 改ページのブロック(type "pagebreak"。v192)。0.8.5: Mermaid の図のブロック(type "mermaid"。v194)。0.8.6: 本文の図表の参照の印(v198)。0.8.7: 本文のリンク(v200)。0.8.8: 見出しに番号の設定・見出しへの参照(v218)。 0.8.10: 表のデータベース(v229)。
    // 版の数字を直に書くのはここ1か所だけ(版を上げたら、ここを意図して書き換える)。ほかのテストは lib.mjs の FORMAT_VERSION と比べる。
    // 0.8.21: データベースの列の種類を増やした・表のグループ分け(Issue #178・#179)。
    result.formatVersionBumpedForPages = roundTrip.formatVersion === "1.0";
    result.documentTitleComesFromFirstPage = roundTrip.documentTitleComesFromFirstPage;

    // 3) 目次ブロックは自分のページの見出しだけを並べる。
    const toc = await fresh.evaluate(() => {
      const doc = {
        title: "Toc Scope",
        pages: [
          {
            id: "page-1",
            title: "First",
            blocks: [
              { id: "t1", type: "toc", text: "" },
              { id: "h1", type: "heading1", text: "TOCPAGE1 head" },
            ],
          },
          { id: "page-2", title: "Second", blocks: [{ id: "h2", type: "heading1", text: "TOCPAGE2 head" }] },
        ],
        fonts: [],
        attachments: [],
      };
      const html = window.SingleHtmlFormat.buildPortableHtml(doc);
      const view = new DOMParser().parseFromString(html, "text/html");
      const nav = view.querySelector("main nav.toc");
      return {
        navText: nav ? nav.textContent : "",
        bodyHasPage2: html.includes("TOCPAGE2 head"),
      };
    });
    result.tocBlockListsOnlyItsOwnPage = toc.navText.includes("TOCPAGE1 head")
      && !toc.navText.includes("TOCPAGE2 head")
      && toc.bodyHasPage2;

    // 4) **添付の掃除が全ページを見ていること**(Step1 で最もデータ損失に近い箇所)。
    // 2ページの文書を保存ファイル経由で開き、**ページ2だけが使っている添付**がある状態で、
    // ページ1のブロックを消す(削除のたびに removeUnusedAttachments が走る)。
    // 現在ページだけを見ていると、この添付は「どこからも使われていない」と判定されて消える。
    const twoPageHtml = await fresh.evaluate(async () => {
      const file = new File([new Uint8Array([1, 2, 3, 4])], "page2-only.bin", { type: "application/octet-stream" });
      const attachment = await window.SingleHtmlFormat.fileToAttachment(file, "att-page2");
      return window.SingleHtmlFormat.buildPortableHtml({
        title: "Attachment Across Pages",
        pages: [
          { id: "page-1", title: "Attachment Across Pages", blocks: [
            { id: "p1a", type: "paragraph", text: "PAGE1 first" },
            { id: "p1b", type: "paragraph", text: "PAGE1 second" },
          ] },
          { id: "page-2", title: "Second", blocks: [
            { id: "p2a", type: "attachment", text: "", attachmentId: "att-page2" },
          ] },
        ],
        fonts: [],
        attachments: [attachment],
      });
    });
    const twoPagePath = join(OUT, "two-pages.html");
    await writeFile(twoPagePath, twoPageHtml, "utf8");
    const chooserPromise = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooserPromise).setFiles(twoPagePath);
    await fresh.waitForFunction(
      () => document.querySelector("#doc-title")?.textContent === "Attachment Across Pages",
      null,
      { timeout: 5000 },
    ).catch(() => {});
    await fresh.waitForTimeout(300);
    const attachmentListed = () => fresh.evaluate(() => (
      [...document.querySelectorAll("#attachment-summary > *")].some((item) => item.textContent.includes("page2-only.bin"))
    ));
    const openedTwoPages = await fresh.evaluate(() => ({
      title: document.querySelector("#doc-title")?.textContent,
      // 表示されるのは現在ページ(=1ページ目)だけ。
      shownTexts: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent).join("|"),
    }));
    result.openedFileKeepsPagesAndShowsFirst = openedTwoPages.title === "Attachment Across Pages"
      && openedTwoPages.shownTexts.includes("PAGE1 first")
      && !openedTwoPages.shownTexts.includes("page2-only.bin");
    const listedBeforeDelete = await attachmentListed();
    // ページ1のブロックを1つ消す(ハンドルで選び、メニューを閉じてから Delete)。
    const victimId = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .find((row) => (row.querySelector(".block-content")?.textContent || "") === "PAGE1 second")?.dataset.id);
    await fresh.locator(`#blocks .block[data-id="${victimId}"] .drag-grip`).click();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const deleted = await fresh.evaluate(() => ![...document.querySelectorAll("#blocks .block-content")]
      .some((node) => node.textContent === "PAGE1 second"));
    const listedAfterDelete = await attachmentListed();
    result.attachmentOfOtherPageSurvivesCleanup = listedBeforeDelete && deleted && listedAfterDelete;

    // 5) **埋め込みフォントの掃除も全ページを見ていること**。
    // 保存のたびに pruneUnusedFonts が走り、本文から指定されていない書体を削除する。
    // 現在ページだけを見ていると、ページ2でしか使っていない書体が「未使用」と判定されて
    // 消え、保存ファイルからも失われる(添付と同じ重さのデータ損失)。
    const fontBase64 = (await readFile(FONT_FIXTURE)).toString("base64");
    const fontDocHtml = await fresh.evaluate(async ({ base64, family }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const file = new File([bytes], family + ".TTF", { type: "font/ttf" });
      const attachment = await window.SingleHtmlFormat.fileToAttachment(file, "att-font");
      return window.SingleHtmlFormat.buildPortableHtml({
        title: "Font Across Pages",
        pages: [
          { id: "page-1", title: "Font Across Pages", blocks: [{ id: "f1a", type: "paragraph", text: "FONTPAGE1" }] },
          { id: "page-2", title: "Second", blocks: [{
            id: "f2a",
            type: "paragraph",
            text: "FONTPAGE2",
            html: '<span style="font-family: ' + family + '">FONTPAGE2</span>',
          }] },
        ],
        fonts: [{ id: "font-1", family, attachmentId: "att-font" }],
        attachments: [attachment],
      });
    }, { base64: fontBase64, family: FONT_FAMILY });
    const fontDocPath = join(OUT, "font-across-pages.html");
    await writeFile(fontDocPath, fontDocHtml, "utf8");
    const fontChooserPromise = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await fontChooserPromise).setFiles(fontDocPath);
    await fresh.waitForFunction(
      () => document.querySelector("#doc-title")?.textContent === "Font Across Pages",
      null,
      { timeout: 5000 },
    ).catch(() => {});
    await fresh.waitForTimeout(300);
    // 保存し直す(ここで pruneUnusedFonts が走る)。
    const fontDownloadPromise = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const fontDownload = await fontDownloadPromise;
    const resavedPath = join(DOWNLOADS, "font-across-pages-resaved.html");
    await fontDownload.saveAs(resavedPath);
    const resavedHtml = await readFile(resavedPath, "utf8");
    const manifestText = resavedHtml.slice(
      resavedHtml.indexOf('id="document-manifest">') + 'id="document-manifest">'.length,
    );
    const resavedManifest = JSON.parse(manifestText.slice(0, manifestText.indexOf("</" + "script>")));
    result.fontUsedOnlyByOtherPageSurvivesSave = resavedManifest.fonts.some((font) => font.family === FONT_FAMILY)
      && resavedManifest.pages.length === 2
      && resavedHtml.includes("att-font");

    return result;
  } finally {
    await fresh.close();
  }
}
