// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";
import { BLOCKS as PARITY_BLOCKS, NEEDLES as PARITY_NEEDLES, measure } from "./layoutParitySuite.mjs";

// ---- 文書の書体と小さい文字(Issue #190)・ページのアイコンとカバー画像(Issue #184)。形式 0.8.21 ----
// #190: View メニューの「文書の書体」(標準・明朝・等幅)と「小さい文字」。文書の設定(settings.fontStyle・smallText)で、文書に保存され、
//       エディタ・保存HTML・印刷が同じ見た目(P7)。文字に付けた書体(埋め込みフォントなど)はそのまま勝つ。コードは等幅のまま。
// #184: ページのアイコン(page.icon。絵文字)は題名の上・目次・ページのブロックに出る。カバー画像(page.cover。文書の画像の添付)は題名の帯の上に、
//       本文の欄の端から端までの帯で出る。題名の帯に乗せると「アイコンを追加」「カバーを追加」。カバーは変更・位置の調整・削除。どれも Undo 1手。
//       開くときは、絵文字でないアイコン・無い添付や画像でない添付を指すカバーを外す。
const TOLERANCE = 1.5;
const near = (a, b, tolerance = TOLERANCE) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tolerance;

export default async function appearanceSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  // 印刷の枠の中を記録する(printSuite と同じ置き換え)。
  await fresh.addInitScript(() => {
    window.print = () => {
      const host = window.top;
      const paragraph = document.querySelector("main p");
      host.__printCalls = host.__printCalls || [];
      host.__printCalls.push({
        inFrame: window !== window.top,
        font: paragraph ? getComputedStyle(paragraph).fontFamily : "",
        size: paragraph ? getComputedStyle(paragraph).fontSize : "",
        icon: document.querySelector(".doc-page-icon")?.textContent || "",
        coverLoaded: Boolean(document.querySelector(".doc-cover img")?.naturalWidth),
      });
    };
  });
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const evidence = {};
  result.appearanceEvidence = evidence;

  const openLiteral = async (literal, name, firstTitle) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, firstTitle, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const docCopy = () => fresh.evaluate(() => window.__docEditorPages.documentCopy());
  const pageOf = (doc, pageId) => doc.pages.find((page) => page.id === pageId);
  const viewMenu = async (id) => {
    await openMenu(fresh, "view");
    await fresh.locator("#" + id).click();
    await fresh.waitForTimeout(250);
  };
  const undo = async () => {
    await openMenu(fresh, "edit");
    await fresh.locator("#menu-undo").click();
    await fresh.waitForTimeout(300);
  };
  const save = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, name);
    await (await download).saveAs(path);
    return path;
  };
  const manifestOf = async (path) => {
    const html = await readFile(path, "utf8");
    return JSON.parse(/<script type="application\/vnd\.single-html-doc\.manifest\+json" id="document-manifest">\s*([\s\S]*?)<\/script>/.exec(html)[1]);
  };
  const viewSaved = async (path, width = 1280) => {
    const view = await context.newPage();
    view.on("pageerror", (error) => pageErrors.push("saved: " + error.message));
    await view.setViewportSize({ width, height: 900 });
    await view.goto(pathToFileURL(path).href);
    await view.waitForTimeout(700);
    return view;
  };
  const goToPage = async (name) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: name }).first().click();
    await fresh.waitForTimeout(300);
  };
  // 横長の画像(1200x600)を作る。ファイルとしても、添付としても使う。
  const pngBase64 = await (async () => {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    return fresh.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 600;
      const pen = canvas.getContext("2d");
      pen.fillStyle = "#2b6cb0";
      pen.fillRect(0, 0, 1200, 300);
      pen.fillStyle = "#f6ad55";
      pen.fillRect(0, 300, 1200, 300);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      bytes.forEach((byte) => { text += String.fromCharCode(byte); });
      return btoa(text);
    });
  })();
  const coverFile = join(OUT, "appearance-cover.png");
  await writeFile(coverFile, Buffer.from(pngBase64, "base64"));

  try {
    // ================= #190 文書の書体と小さい文字 =================
    const styleDoc = { title: "書体", fonts: [], attachments: [], pages: [{ id: "S1", title: "書体", blocks: [
      { id: "s1", type: "paragraph", text: "STYLE para EMBEDW tail", html: 'STYLE para <span style="font-family: &quot;MyEmbedFace&quot;">EMBEDW</span> tail' },
      { id: "s2", type: "heading1", text: "STYLE heading" },
      { id: "s3", type: "code", text: "CODE x = 1" },
    ] }] };
    await openLiteral(styleDoc, "appearance-style.html", "書体");
    const fontsNow = () => fresh.evaluate(() => {
      const content = (text) => [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.startsWith(text));
      const span = [...document.querySelectorAll("#blocks .block-content span")].find((node) => node.textContent === "EMBEDW");
      return {
        para: getComputedStyle(content("STYLE para")).fontFamily,
        paraSize: getComputedStyle(content("STYLE para")).fontSize,
        heading: getComputedStyle(content("STYLE heading")).fontFamily,
        headingSize: getComputedStyle(content("STYLE heading")).fontSize,
        code: getComputedStyle(content("CODE")).fontFamily,
        embed: span ? getComputedStyle(span).fontFamily : "",
        title: getComputedStyle(document.querySelector("#doc-title")).fontFamily,
        titleSize: getComputedStyle(document.querySelector("#doc-title")).fontSize,
        checked: [...document.querySelectorAll(".menu-font-style")].filter((node) => node.getAttribute("aria-checked") === "true").map((node) => node.dataset.fontStyle),
        small: document.querySelector("#menu-small-text")?.getAttribute("aria-checked"),
        fontButton: document.querySelector("#format-font")?.textContent || "",
      };
    });
    const before = await fontsNow();
    // 1) View → 明朝: 文書の設定に入り、題名と本文が明朝。コードは等幅のまま、文字に付けた書体はそのまま勝つ。
    await viewMenu("menu-font-serif");
    const serif = await fontsNow();
    const serifDoc = await docCopy();
    evidence.style = { before, serif, settings: serifDoc.settings };
    result.styleSerifFromViewMenu = JSON.stringify(serifDoc.settings) === JSON.stringify({ fontStyle: "serif" })
      && /Mincho/.test(serif.para) && /Mincho/.test(serif.heading) && /Mincho/.test(serif.title) && !/Mincho/.test(before.para)
      && /monospace/.test(serif.code) && /^"?MyEmbedFace"?/.test(serif.embed)
      && serif.checked.join() === "serif";
    // 2) Undo の1手で戻る
    await undo();
    const undone = await fontsNow();
    result.styleUndoOneStep = (await docCopy()).settings === undefined && undone.para === before.para && undone.checked.join() === "default";
    // 3) 等幅・小さい文字。小さい文字は本文 13.125px・見出し1 26.25px(0.875 倍)、題名は 42px のまま
    await viewMenu("menu-font-mono");
    await viewMenu("menu-small-text");
    const small = await fontsNow();
    const smallDoc = await docCopy();
    evidence.small = { small, settings: smallDoc.settings };
    result.smallTextScalesBodyNotTitle = JSON.stringify(smallDoc.settings) === JSON.stringify({ fontStyle: "mono", smallText: true })
      && small.paraSize === "13.125px" && small.headingSize === "26.25px" && small.titleSize === before.titleSize && before.paraSize === "15px"
      && /monospace/.test(small.para) && small.small === "true" && small.checked.join() === "mono";
    // 4) 保存: manifest に設定、保存HTMLも同じ書体と大きさ(本文・見出し)。題名は変わらない
    const styleSaved = await save("appearance-style-saved.html");
    const styleManifest = await manifestOf(styleSaved);
    const styleView = await viewSaved(styleSaved);
    const savedFonts = await styleView.evaluate(() => {
      const para = [...document.querySelectorAll("main p")].find((node) => node.textContent.startsWith("STYLE para"));
      return {
        para: getComputedStyle(para).fontFamily, paraSize: getComputedStyle(para).fontSize,
        heading: getComputedStyle(document.querySelector("main h2")).fontSize,
        title: getComputedStyle(document.querySelector("main h1")).fontSize,
        code: getComputedStyle(document.querySelector("main pre")).fontFamily,
        embed: getComputedStyle([...document.querySelectorAll("main span")].find((node) => node.textContent === "EMBEDW")).fontFamily,
      };
    });
    await styleView.close();
    evidence.styleSaved = { manifest: styleManifest.settings, savedFonts };
    result.styleSavedToFileAndHtml = JSON.stringify(styleManifest.settings) === JSON.stringify({ fontStyle: "mono", smallText: true })
      && savedFonts.para === small.para && savedFonts.paraSize === "13.125px" && savedFonts.heading === "26.25px" && savedFonts.title === small.titleSize
      && /^"?MyEmbedFace"?/.test(savedFonts.embed) && /monospace/.test(savedFonts.code);
    // 5) 印刷も同じ書体・大きさ
    await fresh.keyboard.press("Control+p");
    await fresh.waitForFunction(() => (window.__printCalls || []).length >= 1, null, { timeout: 5000 }).catch(() => {});
    const printed = (await fresh.evaluate(() => window.__printCalls || []))[0];
    evidence.printed = printed;
    result.stylePrinted = Boolean(printed?.inFrame && printed.font === small.para && printed.size === "13.125px");

    // 6) 開くとき: 知らない値は既定(設定ごと外す)。正しい値は残る
    await openLiteral({ ...styleDoc, title: "不正な設定", pages: [{ ...styleDoc.pages[0], title: "不正な設定" }], settings: { fontStyle: "comic", smallText: "yes", headingNumbers: 1, zoom: 3 } }, "appearance-bad-settings.html", "不正な設定");
    const badSettings = (await docCopy()).settings;
    const badFonts = await fontsNow();
    await openLiteral({ ...styleDoc, title: "明朝の文書", pages: [{ ...styleDoc.pages[0], title: "明朝の文書" }], settings: { fontStyle: "serif", headingNumbers: true } }, "appearance-serif-settings.html", "明朝の文書");
    const goodSettings = (await docCopy()).settings;
    const goodFonts = await fontsNow();
    evidence.openSettings = { badSettings, goodSettings };
    result.styleSettingsSanitizedOnOpen = badSettings === undefined && badFonts.para === before.para && badFonts.paraSize === "15px"
      && JSON.stringify(goodSettings) === JSON.stringify({ headingNumbers: true, fontStyle: "serif" }) && /Mincho/.test(goodFonts.para)
      && goodFonts.fontButton !== "Sans-serif (環境標準)";

    // 7) 小さい文字 + 明朝の文書は、エディタと保存HTMLで位置・大きさ・記号がそろう(layoutParity と同じ測り方。P7)
    const parityLiteral = { title: "Parity", fonts: [], attachments: [], settings: { fontStyle: "serif", smallText: true }, pages: [
      { id: "LP1", title: "Parity", blocks: PARITY_BLOCKS },
      { id: "LP2", title: "Second", blocks: [{ id: "s1", type: "paragraph", text: "second" }] },
    ] };
    const paritySource = join(OUT, "appearance-parity.html");
    await writeFile(paritySource, await fresh.evaluate(async (doc) => {
      const file = new File([new Uint8Array([1, 2, 3, 4])], "data.bin", { type: "application/octet-stream" });
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 200;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      doc.attachments = [await window.SingleHtmlFormat.fileToAttachment(file, "att1"), await window.SingleHtmlFormat.fileToAttachment(new File([blob], "pic.png", { type: "image/png" }), "img1")];
      return window.SingleHtmlFormat.buildPortableHtml(doc);
    }, parityLiteral), "utf8");
    {
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(paritySource);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Parity", null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(600);
    }
    await fresh.evaluate(() => window.scrollTo(0, 0));
    const editorSide = await fresh.evaluate(measure, PARITY_NEEDLES);
    const paritySaved = await save("appearance-parity-saved.html");
    const parityView = await viewSaved(paritySaved);
    const savedSide = await parityView.evaluate(measure, PARITY_NEEDLES);
    await parityView.close();
    const diffs = [];
    for (const needle of PARITY_NEEDLES) {
      const a = editorSide.text[needle];
      const b = savedSide.text[needle];
      if (!a || !b) { diffs.push(needle + " missing"); continue; }
      if (!near(a.dx, b.dx) || !near(a.dy, b.dy)) diffs.push(needle + " pos " + a.dx.toFixed(1) + "," + a.dy.toFixed(1) + "/" + b.dx.toFixed(1) + "," + b.dy.toFixed(1));
      for (const key of ["fontSize", "fontWeight", "lineHeight"]) if (a[key] !== b[key]) diffs.push(needle + " " + key + " " + a[key] + "/" + b[key]);
      if (Boolean(a.marker) !== Boolean(b.marker)) diffs.push(needle + " marker presence");
      else if (a.marker) for (const key of ["dx", "gap", "dcy"]) if (!near(a.marker[key], b.marker[key])) diffs.push(needle + " marker " + key + " " + a.marker[key].toFixed(1) + "/" + b.marker[key].toFixed(1));
    }
    for (const name of Object.keys(editorSide.box)) {
      const a = editorSide.box[name];
      const b = savedSide.box[name];
      if (!a || !b) { diffs.push(name + " box missing"); continue; }
      for (const key of ["dx", "dy", "w", "h"]) if (!near(a[key], b[key], 2)) diffs.push(name + " " + key + " " + a[key].toFixed(1) + "/" + b[key].toFixed(1));
    }
    evidence.parity = diffs;
    result.smallSerifEditorMatchesSavedHtml = diffs.length === 0 && editorSide.text["REF paragraph"] !== null
      && editorSide.text["BUL0"]?.fontSize === "13.125px" && editorSide.text["H1 heading"]?.fontSize === "26.25px";

    // 8) 既定の文書の保存HTMLは今までどおり(書体・小さい文字・題名の頭の CSS と要素を足さない)
    const plain = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "PL", title: "Plain", blocks: [{ id: "p", type: "paragraph", text: "x" }] }], fonts: [], attachments: [] }));
    result.defaultDocumentOutputUnchanged = !/doc-page-head|doc-cover|main\{font-family|main\{font-size|"settings"/.test(plain) && /<main>\n<h1>Plain<\/h1>/.test(plain);
    // 保存HTMLのページのブロック・目次: 行き先にアイコンがあれば、書類の形の代わりにその絵文字
    const linked = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({ fonts: [], attachments: [], pages: [
      { id: "L1", title: "親", blocks: [{ id: "l", type: "page", pageId: "L2" }] },
      { id: "L2", title: "子", icon: "🧪", blocks: [] },
    ] }));
    result.savedPageLinkAndTreeShowIcon = linked.includes('<span class="page-link-icon is-emoji" aria-hidden="true">🧪</span><span class="page-link-title">子</span>')
      && linked.includes('<span class="doc-page-tree-icon" aria-hidden="true">🧪</span>子</a>') && linked.includes('<div class="doc-page-icon" aria-hidden="true">🧪</div>');

    // ================= #184 ページのアイコンとカバー画像 =================
    const appearanceDoc = { title: "一枚目", fonts: [], attachments: [], pages: [
      { id: "A1", title: "一枚目", blocks: [{ id: "a1", type: "paragraph", text: "ONE body" }, { id: "a2", type: "page", pageId: "A2" }] },
      { id: "A2", title: "二枚目", blocks: [{ id: "b1", type: "paragraph", text: "TWO body" }] },
    ] };
    await openLiteral(appearanceDoc, "appearance-pages.html", "一枚目");
    await goToPage("二枚目");
    // 9) 道具は題名の帯に乗せたときだけ見える
    const toolOpacity = () => fresh.evaluate(() => getComputedStyle(document.querySelector("#page-head-tools")).opacity);
    await fresh.mouse.move(5, 700);
    await fresh.waitForTimeout(250);
    const hiddenOpacity = await toolOpacity();
    await fresh.locator("#doc-title").hover();
    await fresh.waitForTimeout(250);
    const shownOpacity = await toolOpacity();
    result.headToolsShowOnHover = hiddenOpacity === "0" && shownOpacity === "1";
    // 10) アイコンを追加 → 検索の欄で「rocket」→ Enter。題名の上・目次・ページのブロックに出る
    await fresh.locator("#page-add-icon").click();
    await fresh.waitForTimeout(200);
    const searchFocused = await fresh.evaluate(() => document.activeElement?.classList.contains("icon-picker-search"));
    await fresh.keyboard.type("rocket");
    await fresh.waitForFunction(() => document.querySelector("#callout-icon-picker .callout-icon-choice")?.textContent === "🚀", null, { timeout: 5000 }).catch(() => {});
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const afterIcon = await docCopy();
    const iconShown = await fresh.evaluate(() => ({
      row: !document.querySelector("#page-icon-row").hidden, text: document.querySelector("#page-icon").textContent,
      tree: [...document.querySelectorAll("#page-tree-body .page-tree-item")].map((node) => node.textContent),
      pickerHidden: document.querySelector("#callout-icon-picker").hidden,
      iconAbove: document.querySelector("#page-icon").getBoundingClientRect().bottom <= document.querySelector("#doc-title").getBoundingClientRect().top + 1,
      sameLeft: Math.abs(document.querySelector("#page-icon").getBoundingClientRect().left - document.querySelector("#doc-title").getBoundingClientRect().left) < 1,
    }));
    await goToPage("一枚目");
    const linkIcon = await fresh.evaluate(() => {
      const icon = document.querySelector("#blocks .page-link .page-link-icon");
      return { emoji: icon?.classList.contains("is-emoji"), text: icon?.textContent };
    });
    evidence.icon = { searchFocused, iconShown, linkIcon, page: pageOf(afterIcon, "A2") };
    result.iconAddedFromHeadTools = searchFocused && pageOf(afterIcon, "A2").icon === "🚀" && iconShown.row && iconShown.text === "🚀"
      && iconShown.pickerHidden && iconShown.iconAbove && iconShown.sameLeft;
    result.iconShownInTreeAndPageLink = iconShown.tree.includes("🚀二枚目") && iconShown.tree.includes("一枚目") && linkIcon.emoji === true && linkIcon.text === "🚀";
    // 11) Undo の1手で外れる。もう一度付けて、アイコンを押して「削除」
    await undo();
    const undoneIcon = await docCopy();
    await goToPage("二枚目");
    await fresh.locator("#doc-title").hover();
    await fresh.locator("#page-add-icon").click();
    await fresh.locator("#callout-icon-picker .callout-icon-choice", { hasText: "📊" }).click();
    await fresh.waitForTimeout(250);
    const pickedChart = pageOf(await docCopy(), "A2").icon;
    await fresh.locator("#page-icon").click();
    await fresh.locator("#callout-icon-picker .icon-picker-remove").click();
    await fresh.waitForTimeout(250);
    const removed = await docCopy();
    result.iconUndoAndRemove = pageOf(undoneIcon, "A2").icon === undefined && pickedChart === "📊" && pageOf(removed, "A2").icon === undefined
      && await fresh.evaluate(() => document.querySelector("#page-icon-row").hidden);

    // 12) カバーを追加 → 画像ファイルを選ぶ。添付になり、帯は本文の欄の端から端まで・高さ 200px・道具の帯のすぐ下
    await fresh.locator("#doc-title").hover();
    await fresh.locator("#page-add-cover").click();
    await fresh.waitForTimeout(200);
    const menuItems = await fresh.evaluate(() => [...document.querySelectorAll("#cover-menu .menu-item")].map((node) => node.dataset.action));
    const chooser = fresh.waitForEvent("filechooser");
    await fresh.locator('#cover-menu [data-action="cover-file"]').click();
    await (await chooser).setFiles(coverFile);
    await fresh.waitForFunction(() => !document.querySelector("#page-cover").hidden, null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForFunction(() => document.querySelector("#page-cover-image").naturalWidth > 0, null, { timeout: 5000 }).catch(() => {});
    const withCover = await docCopy();
    const coverBox = await fresh.evaluate(() => {
      const cover = document.querySelector("#page-cover").getBoundingClientRect();
      const main = document.querySelector(".main").getBoundingClientRect();
      const toolbar = document.querySelector(".toolbar").getBoundingClientRect();
      return { left: cover.left, right: cover.right, height: cover.height, top: cover.top, mainLeft: main.left, mainRight: main.right, toolbarBottom: toolbar.bottom,
        hasCoverClass: document.querySelector(".doc").classList.contains("has-cover"), addCoverHidden: document.querySelector("#page-add-cover").hidden };
    });
    const coverPage = pageOf(withCover, "A2");
    evidence.cover = { menuItems, coverBox, cover: coverPage.cover, attachments: withCover.attachments.map((item) => item.id + ":" + item.mime) };
    result.coverFromImageFile = menuItems.join() === "cover-file" && Boolean(coverPage.cover) && coverPage.cover.position === 50
      && withCover.attachments.some((item) => item.id === coverPage.cover.attachmentId && item.mime === "image/png")
      && near(coverBox.left, coverBox.mainLeft, 1) && near(coverBox.right, coverBox.mainRight, 1) && near(coverBox.height, 200, 1)
      && near(coverBox.top, coverBox.toolbarBottom, 1) && coverBox.hasCoverClass && coverBox.addCoverHidden;
    // 13) 位置を調整: 下へドラッグすると画像の上の方が見える(position が減る)。「位置を保存」で決まり、Undo 1手で戻る
    await fresh.locator("#page-cover").hover();
    await fresh.locator("#page-cover-reposition").click();
    const box = await fresh.locator("#page-cover").boundingBox();
    await fresh.mouse.move(box.x + box.width / 2, box.y + 60);
    await fresh.mouse.down();
    await fresh.mouse.move(box.x + box.width / 2, box.y + 100, { steps: 4 });
    await fresh.mouse.move(box.x + box.width / 2, box.y + 124, { steps: 4 });
    await fresh.mouse.up();
    const draftPosition = await fresh.evaluate(() => document.querySelector("#page-cover-image").style.objectPosition);
    const notYetSaved = pageOf(await docCopy(), "A2").cover.position;
    await fresh.locator("#page-cover-reposition").click();
    await fresh.waitForTimeout(250);
    const repositioned = pageOf(await docCopy(), "A2").cover.position;
    await undo();
    const repositionUndone = pageOf(await docCopy(), "A2").cover.position;
    evidence.reposition = { draftPosition, notYetSaved, repositioned, repositionUndone };
    result.coverRepositionByDrag = notYetSaved === 50 && repositioned < 40 && repositioned >= 0 && repositionUndone === 50;
    // 14) 別のページ(一枚目)は、文書にある画像を選ぶ(添付は増えない)
    await goToPage("一枚目");
    const attachmentCount = (await docCopy()).attachments.length;
    await fresh.locator("#doc-title").hover();
    await fresh.locator("#page-add-cover").click();
    await fresh.locator('#cover-menu [data-action="cover-attachment"]').first().click();
    await fresh.waitForTimeout(300);
    const shared = await docCopy();
    result.coverFromExistingAttachment = pageOf(shared, "A1").cover?.attachmentId === coverPage.cover.attachmentId && shared.attachments.length === attachmentCount;
    // 15) アイコンも付けて保存: manifest にアイコン・カバー、保存HTMLもエディタと同じ並び(カバー → 帯の上の余白 → アイコン → 題名 → 本文)
    await fresh.locator("#doc-title").hover();
    await fresh.locator("#page-add-icon").click();
    await fresh.locator("#callout-icon-picker .callout-icon-choice", { hasText: "🚀" }).click();
    await fresh.waitForTimeout(300);
    const headLayout = (side) => {
      const editor = Boolean(document.querySelector("#blocks"));
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect() || null;
      const cover = editor ? rect("#page-cover") : rect(".doc-cover img");
      const icon = editor ? rect("#page-icon") : rect(".doc-page-icon");
      const titleNode = document.querySelector(editor ? "#doc-title" : "main h1");
      const range = document.createRange();
      range.selectNodeContents(titleNode);
      const title = range.getBoundingClientRect();
      const body = [...document.querySelectorAll(editor ? "#blocks .block-content" : "main p")].find((node) => node.textContent.startsWith("ONE body"));
      const bodyRange = document.createRange();
      bodyRange.selectNodeContents(body);
      const text = bodyRange.getBoundingClientRect();
      const band = editor ? rect(".title-row") : rect(".doc-page-head");
      const image = editor ? document.querySelector("#page-cover-image") : document.querySelector(".doc-cover img");
      return { side, coverW: cover?.width, coverH: cover?.height, coverLeft: cover?.left, viewW: document.documentElement.clientWidth,
        iconFromCover: icon.top - cover.bottom, titleFromIcon: title.top - icon.top, bodyFromTitle: text.top - title.top,
        iconLeft: icon.left - title.left, bandBottomFromTitle: band.bottom - title.top, loaded: image?.naturalWidth > 0,
        objectPosition: getComputedStyle(image).objectPosition, iconText: (editor ? document.querySelector("#page-icon") : document.querySelector(".doc-page-icon")).textContent };
    };
    const editorHead = await fresh.evaluate(headLayout, "editor");
    const pagesSaved = await save("appearance-pages-saved.html");
    const pagesManifest = await manifestOf(pagesSaved);
    const savedView = await viewSaved(pagesSaved);
    const savedHead = await savedView.evaluate(headLayout, "saved");
    const savedExtras = await savedView.evaluate(() => ({
      tree: [...document.querySelectorAll(".doc-page-tree-item")].map((node) => node.textContent),
      link: document.querySelector("p.page-link .page-link-icon")?.textContent,
      viewW: document.querySelector(".doc-view")?.getBoundingClientRect().width,
      coverW: document.querySelector(".doc-cover img").getBoundingClientRect().width,
      coverLeft: document.querySelector(".doc-cover img").getBoundingClientRect().left,
      viewLeft: document.querySelector(".doc-view")?.getBoundingClientRect().left,
    }));
    await savedView.close();
    evidence.head1280 = { editorHead, savedHead, savedExtras, manifestPages: pagesManifest.pages.map(({ blocks, ...rest }) => rest) };
    const manifestA1 = pagesManifest.pages.find((page) => page.id === "A1");
    result.appearanceSavedInManifest = manifestA1.icon === "🚀" && manifestA1.cover?.attachmentId === coverPage.cover.attachmentId
      && pagesManifest.pages.find((page) => page.id === "A2").cover?.position === 50
      && pagesManifest.attachments.some((item) => item.id === coverPage.cover.attachmentId);
    const headMatches = (a, b, withBody) => near(a.iconFromCover, b.iconFromCover) && near(a.titleFromIcon, b.titleFromIcon) && near(a.iconLeft, b.iconLeft)
      && near(a.coverH, b.coverH) && a.loaded && b.loaded && a.objectPosition === b.objectPosition && a.iconText === b.iconText
      && (!withBody || (near(a.bodyFromTitle, b.bodyFromTitle) && near(a.bandBottomFromTitle, b.bandBottomFromTitle, 6)));
    result.savedHeadMatchesEditor1280 = headMatches(editorHead, savedHead, true)
      && near(savedExtras.coverW, savedExtras.viewW, 1) && near(savedExtras.coverLeft, savedExtras.viewLeft, 1)
      && savedExtras.tree.includes("🚀一枚目") && savedExtras.tree.includes("二枚目");
    // 狭い画面(800px)でも同じ並び(目次は重ねる形になり、カバーは画面の端から端まで)
    await fresh.setViewportSize({ width: 800, height: 900 });
    await fresh.waitForTimeout(300);
    const editorHead800 = await fresh.evaluate(headLayout, "editor");
    const savedView800 = await viewSaved(pagesSaved, 800);
    const savedHead800 = await savedView800.evaluate(headLayout, "saved");
    await savedView800.close();
    await fresh.setViewportSize({ width: 1280, height: 900 });
    evidence.head800 = { editorHead800, savedHead800 };
    result.savedHeadMatchesEditor800 = headMatches(editorHead800, savedHead800, false) && near(savedHead800.coverW, savedHead800.viewW, 1) && near(savedHead800.coverLeft, 0, 1);
    // 1ページの文書の保存HTMLでも、カバーは画面の端から端まで・一番上
    const single = await fresh.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const attachment = await window.SingleHtmlFormat.fileToAttachment(new File([bytes], "c.png", { type: "image/png" }), "cov");
      return window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "SP", title: "単独", icon: "📘", cover: { attachmentId: "cov", position: 20 }, blocks: [{ id: "p", type: "paragraph", text: "ONE body" }] }], fonts: [], attachments: [attachment] });
    }, pngBase64);
    const singlePath = join(OUT, "appearance-single.html");
    await writeFile(singlePath, single, "utf8");
    const singleView = await viewSaved(singlePath);
    const singleHead = await singleView.evaluate(headLayout, "single");
    const singleTop = await singleView.evaluate(() => document.querySelector(".doc-cover img").getBoundingClientRect().top);
    await singleView.close();
    evidence.single = { singleHead, singleTop };
    result.singlePageSavedCover = near(singleHead.coverW, singleHead.viewW, 1) && near(singleHead.coverLeft, 0, 1) && near(singleTop, 0, 1)
      && singleHead.loaded && singleHead.iconText === "📘" && near(singleHead.iconFromCover, editorHead.iconFromCover) && singleHead.objectPosition === "50% 20%";
    // 16) 印刷にもアイコンとカバーが出る
    await fresh.evaluate(() => { window.__printCalls = []; });
    await fresh.keyboard.press("Control+p");
    await fresh.waitForFunction(() => (window.__printCalls || []).length >= 1, null, { timeout: 5000 }).catch(() => {});
    const printedHead = (await fresh.evaluate(() => window.__printCalls || []))[0];
    evidence.printedHead = printedHead;
    result.appearancePrinted = printedHead?.icon === "🚀" && printedHead?.coverLoaded === true;

    // 17) ロック中のページでは変えられない(道具を出さない・アイコンを押しても一覧は開かない)
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(250);
    await fresh.locator("#doc-title").hover();
    const lockedUi = await fresh.evaluate(() => ({
      tools: getComputedStyle(document.querySelector("#page-head-tools")).display,
      coverTools: getComputedStyle(document.querySelector("#page-cover-tools")).display,
    }));
    await fresh.locator("#page-icon").click();
    await fresh.waitForTimeout(200);
    const pickerOpened = await fresh.evaluate(() => !document.querySelector("#callout-icon-picker").hidden);
    evidence.locked = { lockedUi, pickerOpened };
    result.lockedPageKeepsAppearance = lockedUi.tools === "none" && lockedUi.coverTools === "none" && !pickerOpened && pageOf(await docCopy(), "A1").icon === "🚀";
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(250);

    // 18) カバーを削除。どのページも使わなくなった画像は保存されない。ゴミ箱のページのカバーの画像は保存に残る
    await fresh.locator("#page-cover").hover();
    await fresh.locator("#page-cover-remove").click();
    await fresh.waitForTimeout(250);
    const afterRemove = await docCopy();
    const removeUi = await fresh.evaluate(() => ({ hidden: document.querySelector("#page-cover").hidden, cls: document.querySelector(".doc").classList.contains("has-cover") }));
    await fresh.evaluate(() => window.__docEditorPages.deletePage("A2"));
    await fresh.waitForTimeout(300);
    const trashSaved = await manifestOf(await save("appearance-trash-saved.html"));
    await fresh.evaluate(() => window.__docEditorPages.purgeFromTrash(window.__docEditorPages.documentCopy().trash[0].id));
    await fresh.waitForTimeout(300);
    const purgedSaved = await manifestOf(await save("appearance-purged-saved.html"));
    evidence.remove = { afterRemove: pageOf(afterRemove, "A1"), removeUi, trashAttachments: trashSaved.attachments.length, trashCover: trashSaved.trash?.[0]?.page?.cover, purged: purgedSaved.attachments.length };
    result.coverRemovedAndPruned = pageOf(afterRemove, "A1").cover === undefined && removeUi.hidden && !removeUi.cls
      && trashSaved.attachments.length === 1 && trashSaved.trash?.[0]?.page?.cover?.attachmentId === coverPage.cover.attachmentId
      && purgedSaved.attachments.length === 0;

    // 19) 開くとき: アイコンは絵文字だけ、カバーは文書にある画像の添付だけ(id の付け直しにもついていく)。縦の位置は 0〜100
    const sanitized = await fresh.evaluate(async (base64) => {
      const fmt = window.SingleHtmlFormat;
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const image = await fmt.fileToAttachment(new File([bytes], "c.png", { type: "image/png" }), 'img"bad');
      const binary = await fmt.fileToAttachment(new File([new Uint8Array([1, 2])], "d.bin", { type: "application/octet-stream" }), "bin1");
      const html = fmt.buildPortableHtml({ fonts: [], attachments: [image, binary], pages: [
        { id: "X1", title: "a", icon: "🚀", cover: { attachmentId: "missing", position: 10 }, blocks: [] },
        { id: "X2", title: "b", icon: "<b>x</b>", cover: { attachmentId: "bin1" }, blocks: [] },
        { id: "X3", title: "c", icon: "abc", blocks: [{ id: "u", type: "attachment", attachmentId: 'img"bad' }] },
      ] });
      // 書き出しは正しい形しか書かないので、manifest を直に細工して外から来た値を作る
      const manifestText = /id="document-manifest">\s*([\s\S]*?)<\/script>/.exec(html)[1];
      const manifest = JSON.parse(manifestText);
      manifest.pages[0].icon = "🚀";
      manifest.pages[0].cover = { attachmentId: "missing", position: 10 };
      manifest.pages[1].icon = "<b>x</b>";
      manifest.pages[1].cover = { attachmentId: "bin1" };
      manifest.pages[2].icon = "abc";
      manifest.pages[2].cover = { attachmentId: 'img"bad', position: 150 };
      manifest.pages.push({ id: "X4", title: "d", cover: "c.png", icon: 5, blocks: [] });
      const crafted = html.replace(manifestText, JSON.stringify(manifest));
      const doc = fmt.parsePortableHtml(crafted);
      const renamed = doc.attachments.find((item) => item.name === "c.png")?.id;
      return { pages: doc.pages.map(({ id, icon, cover }) => ({ id, icon, cover })), renamed };
    }, pngBase64);
    evidence.sanitized = sanitized;
    const [x1, x2, x3, x4] = sanitized.pages;
    result.appearanceSanitizedOnOpen = x1.icon === "🚀" && x1.cover === undefined && x2.icon === undefined && x2.cover === undefined
      && x3.icon === undefined && x3.cover?.attachmentId === sanitized.renamed && sanitized.renamed !== 'img"bad' && x3.cover?.position === 100
      && x4.icon === undefined && x4.cover === undefined;

    result.appearanceNoPageErrors = pageErrors.length === 0;
    evidence.pageErrors = pageErrors;
  } finally {
    await fresh.close();
  }
  return result;
}
