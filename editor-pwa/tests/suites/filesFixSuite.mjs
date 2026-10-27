// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FIXTURE, FONT_FAMILY, FONT_FIXTURE, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 添付・印刷・埋め込みフォントの不具合の直し(v221) ----
// 1) 印刷・PDF で画像がすべて空白になり、埋め込みフォントも効かなかった(v214 で印刷の枠から実行されるスクリプトを外したため、
//    画像と書体を作るランタイムも無くなっていた)。エディタの側から枠へ画像と書体を入れる。
// 2) 大きなファイルの読み込み中にページを替える・新規作成すると、添付が替えた先のページ・新しい文書へ入っていた。
//    置き先は読み込みの前に決め、文書が替わったら入れない。
// 3) ロック中のページへの添付は、安全網でブロックが戻っても、添付の中身が見えないまま保存ファイルに残っていた。
//    ロック中のページには入れず、保存のときも、どこからも使われていない添付は入れない。
// 4) 入力欄(検索欄・題名など)で画像を貼ると、本文へ添付され、一緒に来た文字も入らなかった。
// 5) 子を持つブロック(開いた・閉じたトグル)へ添付すると、子を奪っていた。Enter・＋と同じ置き方にする。
// 6) 中身の壊れた添付(base64 でない・chunks が無い)を含む文書を開くと「開けませんでした」なのに文書だけ差し替わり、
//    保存も入力もできなくなった。読めない添付は外して「Missing attachment」と出し、開くことは続ける。
// 7) "Comma,Font.ttf"・"serif.ttf" の埋め込みフォントが効かず、保存で捨てられていた。
// 8) 画像の拡大表示の間の Ctrl+X で、後ろの画像のブロックが切り取られていた。
export default async function filesFixSuite({ browser }) {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    // 印刷は、刷る枠の中の画像と書体の様子を記録するだけにする(見えない枠にも入るよう初期化スクリプトで)。
    window.print = () => {
      const host = window.top;
      host.__filesPrint = {
        inFrame: window !== window.top,
        images: [...document.images].map((image) => ({ alt: image.alt, width: image.naturalWidth })),
        fonts: [...document.fonts].map((face) => face.family.replace(/^["']|["']$/g, "") + ":" + face.status),
      };
    };
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  let opened = 0;
  let saved = 0;
  const status = () => fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
  const openHtml = async (html, title = null) => {
    const source = join(OUT, "files-fix-" + (opened += 1) + ".html");
    await writeFile(source, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    if (title) await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const openLiteral = async (literal) => openHtml(await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), literal.pages[0].title);
  // 保存HTMLを読み直した文書(ページごとのブロックと、添付・フォントの名前)
  const savedDoc = async () => {
    const download = fresh.waitForEvent("download", { timeout: 8000 }).catch(() => null);
    await fresh.keyboard.press("Control+s");
    const done = await download;
    if (!done) return null;
    const path = join(DOWNLOADS, "files-fix-saved-" + (saved += 1) + ".html");
    await done.saveAs(path);
    const html = await readFile(path, "utf8");
    await fresh.waitForTimeout(150);
    return fresh.evaluate((text) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
      const names = new Map(parsed.attachments.map((attachment) => [attachment.id, attachment.name]));
      return {
        pages: parsed.pages.map((page) => ({
          title: page.title,
          blocks: page.blocks.map((block) => ({ type: block.type, text: block.text || "", indent: block.indent || 0, attachment: names.get(block.attachmentId) || "" })),
        })),
        attachments: parsed.attachments.map((attachment) => attachment.name),
        fonts: parsed.fonts.map((font) => font.family),
      };
    }, html);
  };
  // 画像(と文字)を貼る。target はセレクタ(省略時はフォーカスのある要素)
  const pasteImage = (name, selector = null, text = "") => fresh.evaluate(async ([fileName, sel, plain]) => {
    const canvas = document.createElement("canvas");
    canvas.width = 30;
    canvas.height = 30;
    canvas.getContext("2d").fillRect(0, 0, 30, 30);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], fileName, { type: "image/png" }));
    if (plain) transfer.setData("text/plain", plain);
    const target = sel ? document.querySelector(sel) : document.activeElement;
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer });
    target.dispatchEvent(event);
    return { prevented: event.defaultPrevented, target: target.id || target.className };
  }, [name, selector, text]);
  const imageCount = () => fresh.locator("#blocks img.attachment-image").count();
  const attachFixtureViaMenu = async () => {
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "files");
    await fresh.locator("#attach-files").click();
    await (await chooser).setFiles(FIXTURE);
    await fresh.waitForTimeout(500);
    await fresh.keyboard.press("Escape");
  };
  const embedFont = async (files) => {
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "files");
    await fresh.locator("#embed-font").click();
    await (await chooser).setFiles(files);
    await fresh.waitForTimeout(800);
    await fresh.keyboard.press("Escape");
  };
  // 文字を含むブロックの文字全部を選んで、書体の一覧から family を選ぶ
  const applyFont = async (needle, family) => {
    await fresh.locator("#blocks .block-content", { hasText: needle }).first().click();
    await fresh.evaluate((text) => {
      const editable = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes(text));
      const range = document.createRange();
      range.selectNodeContents(editable);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, needle);
    await fresh.locator("#format-font").click();
    // 一覧に無いとき(直す前の "Comma,Font" など)は落とさずに閉じ、下の判定で不合格にする
    const picked = await fresh.locator("#format-font-list .font-option").filter({ hasText: family }).first().click({ timeout: 3000 }).then(() => true, () => false);
    if (!picked) await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(300);
  };
  const twoPages = (lockB = false) => ({ title: "A", fonts: [], attachments: [], pages: [
    { id: "PA", title: "PageA", blocks: [{ id: "a1", type: "paragraph", text: "alpha" }, { id: "lnk", type: "page", pageId: "PB", text: "" }] },
    { id: "PB", title: "PageB", ...(lockB ? { locked: true } : {}), blocks: [{ id: "b1", type: "paragraph", text: "bravo" }] },
  ] });
  // 大きなファイルを alpha の下半分へ落とし、読み込みの途中で action(ページを替える・ロックする・新規作成)をする
  const dropBigThen = (action) => fresh.evaluate((kind) => {
    const target = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent === "alpha");
    const rect = target.getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(40 * 1024 * 1024).fill(3)], "big-on-A.bin", { type: "application/octet-stream" }));
    const options = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 10, clientY: rect.bottom - 2 };
    target.dispatchEvent(new DragEvent("dragover", options));
    target.dispatchEvent(new DragEvent("drop", options));
    setTimeout(() => {
      if (kind === "switch") [...document.querySelectorAll(".page-tree-item")].find((node) => node.textContent.includes("PageB")).click();
      else if (kind === "lock") document.querySelector("#page-lock-toggle").click();
      else document.querySelector("#menu-new-document").click();
    }, 20);
  }, action);
  const waitAttachSettled = () => fresh.waitForFunction(() => /attached|添付しました|取りやめ|ロックされています/.test(document.querySelector("#status")?.textContent || ""), null, { timeout: 60000 }).catch(() => {});
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // ---- 1) 印刷の枠に画像と埋め込みフォントが入る ----
    await fresh.locator("#blocks .block-content").first().click();
    await pasteImage("print-image.png");
    await fresh.locator('img.attachment-image[alt="print-image.png"]').waitFor({ state: "visible" });
    await embedFont(FONT_FIXTURE);
    await fresh.keyboard.press("Control+p");
    await fresh.waitForFunction(() => window.__filesPrint, null, { timeout: 10000 }).catch(() => {});
    const printed = await fresh.evaluate(() => window.__filesPrint || null);
    result.filesPrintShowsImages = Boolean(printed?.inFrame && printed.images.length === 1 && printed.images[0].width > 0);
    result.filesPrintLoadsEmbeddedFont = Boolean(printed?.fonts.includes(FONT_FAMILY + ":loaded"));
    result.filesPrintEvidence = printed;

    // ---- 2) 読み込み中にページを替えても、添付は始めたページへ ----
    await openLiteral(twoPages());
    await dropBigThen("switch");
    await waitAttachSettled();
    const switchedTitle = await fresh.evaluate(() => document.querySelector("#doc-title")?.textContent);
    const afterSwitch = await savedDoc();
    result.filesAttachDuringPageSwitchStaysOnOriginalPage = switchedTitle === "PageB"
      && afterSwitch?.pages[0].blocks.some((block) => block.attachment === "big-on-A.bin")
      && !afterSwitch?.pages[1].blocks.some((block) => block.type === "attachment");
    result.filesAttachDuringPageSwitchEvidence = { switchedTitle, pages: afterSwitch?.pages, status: await status() };

    // 読み込み中に新規作成したら、新しい文書には入れない
    await openLiteral(twoPages());
    await dropBigThen("new");
    await waitAttachSettled();
    const afterNew = await savedDoc();
    result.filesAttachDuringNewDocumentIsDropped = Boolean(afterNew)
      && afterNew.attachments.length === 0
      && afterNew.pages.every((page) => page.blocks.every((block) => block.type !== "attachment"));
    result.filesAttachDuringNewDocumentEvidence = { pages: afterNew?.pages, attachments: afterNew?.attachments, status: await status() };

    // ---- 3) 読み込み中にそのページをロックしたら、添付を入れない(見えない添付を残さない) ----
    // 以前は入れてから安全網(enforcePageLocks)がブロックだけを戻し、添付の中身が保存ファイルに残っていた。
    await openLiteral(twoPages());
    await dropBigThen("lock");
    await waitAttachSettled();
    const lockedNow = await fresh.evaluate(() => document.body.classList.contains("page-locked"));
    const lockedImages = await fresh.locator("#blocks .attachment-card").count();
    const afterLocked = await savedDoc();
    result.filesAttachWhilePageGetsLockedLeavesNoAttachment = lockedNow && lockedImages === 0
      && Boolean(afterLocked) && afterLocked.attachments.length === 0
      && afterLocked.pages[0].blocks.every((block) => block.type !== "attachment");
    result.filesAttachWhilePageGetsLockedEvidence = { lockedNow, lockedImages, attachments: afterLocked?.attachments, status: await status() };

    // どこからも使われていない添付は保存ファイルに入れない(開いたファイルにあった分も)
    const orphanHtml = await fresh.evaluate(async () => {
      const used = await window.SingleHtmlFormat.fileToAttachment(new File(["used"], "used.txt", { type: "text/plain" }), "att-used");
      const orphan = await window.SingleHtmlFormat.fileToAttachment(new File(["orphan"], "orphan.txt", { type: "text/plain" }), "att-orphan");
      return window.SingleHtmlFormat.buildPortableHtml({ title: "Orphan", fonts: [], attachments: [used, orphan], pages: [{ id: "PO", title: "Orphan", blocks: [
        { id: "o1", type: "paragraph", text: "orphan test" }, { id: "o2", type: "attachment", text: "", attachmentId: "att-used" },
      ] }] });
    });
    await openHtml(orphanHtml, "Orphan");
    const afterOrphan = await savedDoc();
    result.filesSavePrunesUnusedAttachments = JSON.stringify(afterOrphan?.attachments) === JSON.stringify(["used.txt"]);
    result.filesSavePrunesUnusedAttachmentsEvidence = afterOrphan?.attachments;

    // ---- 4) 入力欄への画像の貼り付けは、本文へ添付しない(文字は欄のもの) ----
    await openLiteral({ title: "Paste", fonts: [], attachments: [], pages: [{ id: "PP", title: "Paste", blocks: [{ id: "p1", type: "paragraph", text: "hello" }] }] });
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(300);
    const searchPaste = await pasteImage("in-search.png", null, "shot");
    await fresh.waitForTimeout(600);
    const searchImages = await imageCount();
    await fresh.keyboard.press("Escape");
    await fresh.locator("#doc-title").click();
    const titlePaste = await pasteImage("in-title.png", null, "shot");
    await fresh.waitForTimeout(600);
    const titleImages = await imageCount();
    const afterInputs = await savedDoc();
    result.filesImagePasteInSearchBoxIsNotAttached = searchPaste.target === "search-input" && !searchPaste.prevented && searchImages === 0;
    result.filesImagePasteInTitleIsNotAttached = searchPaste.target === "search-input" && titlePaste.target === "doc-title" && !titlePaste.prevented && titleImages === 0
      && Boolean(afterInputs) && afterInputs.attachments.length === 0;
    result.filesImagePasteInInputsEvidence = { searchPaste, searchImages, titlePaste, titleImages, attachments: afterInputs?.attachments };

    // ---- 5) 子を持つトグルへの添付は、子を奪わない ----
    const toggleOrder = async (open) => {
      await openLiteral({ title: "Tree", fonts: [], attachments: [], pages: [{ id: "PT", title: "Tree", blocks: [
        { id: "t1", type: "toggle", text: "parent", open },
        { id: "c1", type: "paragraph", text: "child1", indent: 1 },
        { id: "c2", type: "paragraph", text: "child2", indent: 1 },
        { id: "z", type: "paragraph", text: "after" },
      ] }] });
      await fresh.locator("#blocks .block-content", { hasText: "parent" }).first().click();
      await fresh.keyboard.press("End");
      await attachFixtureViaMenu();
      const after = await savedDoc();
      return after?.pages[0].blocks.map((block) => (block.attachment || block.text) + "@" + block.indent).join(" | ");
    };
    const openOrder = await toggleOrder(true);
    const closedOrder = await toggleOrder(false);
    result.filesAttachOnOpenToggleBecomesFirstChild = openOrder === "parent@0 | fixture.txt@1 | child1@1 | child2@1 | after@0";
    result.filesAttachOnClosedToggleGoesAfterSubtree = closedOrder === "parent@0 | child1@1 | child2@1 | fixture.txt@0 | after@0";
    result.filesAttachOnToggleEvidence = { openOrder, closedOrder };

    // ---- 6) 中身の壊れた添付を含む文書も開け、保存・入力ができる ----
    const brokenOpen = async (variant) => {
      const attachment = { id: "a1", name: "x.png", mime: "image/png", size: 3, sha256: "00", encoding: "base64-chunks", chunkSize: 3, chunks: ["!!!notbase64"] };
      if (variant === "nochunks") delete attachment.chunks;
      if (variant === "file-nochunks") {
        attachment.mime = "application/pdf";
        delete attachment.chunks;
      }
      const errorsBefore = pageErrors.length;
      await openLiteral({ title: "Broken " + variant, fonts: [], attachments: [attachment], pages: [{ id: "PX", title: "Broken " + variant, blocks: [
        { id: "x1", type: "paragraph", text: "hello before" },
        { id: "x2", type: "attachment", text: "", attachmentId: "a1" },
        { id: "x3", type: "paragraph", text: "hello after" },
      ] }] });
      const openedStatus = await status();
      const shown = await fresh.evaluate(() => document.querySelector("#blocks").textContent);
      // 開けずに画面が前の文書のままなら、打つ所が無い(落とさずに下の判定で不合格にする)
      const typed = await fresh.locator("#blocks .block-content", { hasText: "hello before" }).first().click({ timeout: 3000 }).then(() => true, () => false);
      if (typed) {
        await fresh.keyboard.press("End");
        await fresh.keyboard.type(" typed");
        await fresh.waitForTimeout(200);
      }
      const after = await savedDoc();
      return {
        ok: /^Opened /.test(openedStatus) && /読み込めない添付が 1 件/.test(openedStatus)
          && shown.includes("hello before") && shown.includes("Missing attachment")
          && Boolean(after) && after.pages[0].blocks.some((block) => block.text === "hello before typed")
          && pageErrors.length === errorsBefore,
        openedStatus,
        saved: after?.pages[0].blocks,
        errors: pageErrors.slice(errorsBefore),
      };
    };
    const badBase64 = await brokenOpen("badb64");
    const noChunks = await brokenOpen("nochunks");
    const fileNoChunks = await brokenOpen("file-nochunks");
    result.filesOpenWithBadBase64AttachmentStaysUsable = badBase64.ok;
    result.filesOpenWithChunklessAttachmentStaysUsable = noChunks.ok;
    result.filesOpenWithChunklessFileAttachmentCanSave = fileNoChunks.ok;
    result.filesBrokenAttachmentEvidence = { badBase64, noChunks, fileNoChunks };

    // ---- 7) "," や総称名のファイル名の埋め込みフォントも効き、保存で残る ----
    await openLiteral({ title: "Fonts", fonts: [], attachments: [], pages: [{ id: "PF", title: "Fonts", blocks: [
      { id: "f1", type: "paragraph", text: "comma sample" },
      { id: "f2", type: "paragraph", text: "serif sample" },
    ] }] });
    const fontBytes = await readFile(FONT_FIXTURE);
    await embedFont([
      { name: "Comma,Font.ttf", mimeType: "font/ttf", buffer: fontBytes },
      { name: "serif.ttf", mimeType: "font/ttf", buffer: fontBytes },
    ]);
    await applyFont("comma sample", "Comma Font");
    await applyFont("serif sample", "serif (埋め込み)");
    const fontFaces = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content [style]")].map((node) => getComputedStyle(node).fontFamily));
    const afterFonts = await savedDoc();
    result.filesFontNameWithCommaIsKept = Boolean(afterFonts?.fonts.includes("Comma Font")) && fontFaces.includes('"Comma Font"');
    result.filesFontNamedLikeGenericIsKept = Boolean(afterFonts?.fonts.includes("serif (埋め込み)")) && fontFaces.includes('"serif (埋め込み)"');
    result.filesFontNameEvidence = { fontFaces, fonts: afterFonts?.fonts };

    // ---- 8) 画像の拡大表示の間の Ctrl+X は、後ろの画像のブロックを切り取らない ----
    await openLiteral({ title: "Lightbox", fonts: [], attachments: [], pages: [{ id: "PL", title: "Lightbox", blocks: [{ id: "l1", type: "paragraph", text: "lightbox" }] }] });
    await fresh.locator("#blocks .block-content").first().click();
    await pasteImage("lightbox.png");
    await fresh.locator('img.attachment-image[alt="lightbox.png"]').waitFor({ state: "visible" });
    const stage = fresh.locator(".image-attachment-stage").first();
    await stage.click();
    await fresh.waitForTimeout(200);
    await stage.dblclick();
    await fresh.waitForTimeout(300);
    const lightboxOpen = await fresh.evaluate(() => !document.querySelector("#image-lightbox").hidden);
    await fresh.keyboard.press("Control+x");
    await fresh.waitForTimeout(300);
    const afterCut = { images: await imageCount(), open: await fresh.evaluate(() => !document.querySelector("#image-lightbox").hidden) };
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const closed = await fresh.evaluate(() => document.querySelector("#image-lightbox").hidden);
    result.filesLightboxCtrlXDoesNotCutImage = lightboxOpen && afterCut.images === 1 && afterCut.open && closed;
    result.filesLightboxEvidence = { lightboxOpen, afterCut, closed };
  } finally {
    await fresh.close();
    await context.close();
  }
  return result;
}
