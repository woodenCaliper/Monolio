// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT } from "../lib.mjs";

// ---- PDF の添付をその場で見る(v277。形式 0.8.19) ----
// ユーザー「PDF をダウンロードせずに、その場で開いて閲覧できる機能がほしい」「動画みたいに…選べるようにしてほしい」「両方できるようにしたい」。
// 見せ方は3つ: 1ページ目の見本(既定。押すと画面いっぱいに開く)・中で読む(attachmentView: "read")・ファイル("file")。
// 見本と中で読むは PDF ビューアの上の黒い帯を出さない(ユーザー「上の黒い道具の帯」がいや)。PDF をその場に出せない環境では、
// 一言を出してファイルとして見せる(動画の「再生できませんでした」と同じ考え)。

// 試しの PDF(文字だけ。ページごとに1行)。xref の位置まで正しく書く
function makePdf(texts) {
  const objects = [];
  const pageIds = texts.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [" + pageIds.map((id) => id + " 0 R").join(" ") + "] /Count " + texts.length + " >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  texts.forEach((text, i) => {
    const stream = "BT /F1 28 Tf 72 720 Td (" + text + ") Tj ET";
    objects[4 + i * 2] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents " + (5 + i * 2) + " 0 R >>";
    objects[5 + i * 2] = "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream";
  });
  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += id + " 0 obj\n" + objects[id] + "\nendobj\n";
  }
  const xref = out.length;
  out += "xref\n0 " + objects.length + "\n0000000000 65535 f \n" + offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("");
  out += "trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  return Buffer.from(out, "latin1");
}

const PDF_VIEWER_FRAME = /^chrome-extension:\/\/mhjfbmdgcfjbbpaeojofohoefgiehjai\//;

export default async function pdfSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 860 });
  const result = {};
  const errors = [];
  fresh.on("pageerror", (error) => errors.push(error.message));
  // この環境に PDF ビューアがあるか(クラウドの chromium には無いことがある)。無ければ、画面の作りの確かめのために「ある」ことにし、
  // ビューアが実際に描くかの確かめ(pdfViewerRendersInFrame)は証拠だけにする。
  const realViewer = await fresh.evaluate(() => navigator.pdfViewerEnabled);
  if (realViewer === false) await fresh.addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { get: () => true, configurable: true }));
  let saved = 0;
  const saveHtml = async () => {
    await fresh.evaluate(() => { window.showSaveFilePicker = undefined; });
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "pdf-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return { path, html: await readFile(path, "utf8") };
  };
  const manifestOf = (html) => fresh.evaluate((text) => JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent), html);
  const openMenu = async (blockId, query) => {
    const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await row.hover();
    await row.locator(".drag-grip").click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type(query);
    await fresh.waitForTimeout(200);
    return fresh.evaluate(() => [...document.querySelectorAll("#block-menu button, #block-menu [role=menuitem]")].map((node) => node.textContent));
  };
  const chooseMenu = async (text) => {
    await fresh.locator("#block-menu button, #block-menu [role=menuitem]").filter({ hasText: text }).first().click();
    await fresh.waitForTimeout(300);
  };
  const cardState = (id) => fresh.evaluate((blockId) => {
    const row = document.querySelector('#blocks .block[data-id="' + blockId + '"]');
    const card = row?.querySelector(".attachment-card");
    const frame = card?.querySelector("iframe.attachment-pdf-frame");
    const stage = card?.querySelector(".image-attachment-stage");
    return {
      view: card?.dataset.pdfView || (card?.classList.contains("attachment-file-card") ? "file" : null),
      src: frame?.getAttribute("src") || "",
      pointer: frame ? getComputedStyle(frame).pointerEvents : null,
      frameHeight: frame ? Math.round(frame.getBoundingClientRect().height) : 0,
      stageWidth: stage ? Math.round(stage.getBoundingClientRect().width) : 0,
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : 0,
      width: card?.dataset.width || null,
      hint: Boolean(card?.querySelector(".attachment-pdf-hint")),
      note: card?.querySelector(".attachment-unplayable-note")?.textContent || "",
      download: Boolean(card?.querySelector(".attachment-download")),
    };
  }, id);
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const pdf = makePdf(["Test report page 1", "Page 2"]);

    // 1) 添付すると「1ページ目の見本」(既定)。PDF の blob(application/pdf)を、上の帯なし(#toolbar=0)で小さく(35%)出す
    await fresh.locator(".block-content").nth(1).click();
    await fresh.keyboard.press("End");
    await fresh.locator("#attach-input").setInputFiles({ name: "試験成績書.pdf", mimeType: "application/pdf", buffer: pdf });
    await fresh.waitForTimeout(1500);
    const blockId = await fresh.evaluate(() => document.querySelector(".pdf-attachment-card")?.closest(".block")?.dataset.id);
    const preview = await cardState(blockId);
    const blobType = await fresh.evaluate(async (src) => (src ? (await (await fetch(src.split("#")[0])).blob()).type : ""), preview.src);
    result.pdfPreviewByDefault = Boolean(blockId) && preview.view === "preview" && preview.src.startsWith("blob:") && preview.src.includes("#toolbar=0")
      && preview.src.includes("navpanes=0") && blobType === "application/pdf" && preview.pointer === "none" && preview.width === "35" && preview.hint
      && Math.abs(preview.stageWidth / preview.cardWidth - 0.35) < 0.03 && preview.frameHeight > preview.stageWidth * 1.3;
    result.pdfPreviewEvidence = { ...preview, blobType };
    result.pdfViewerRendersInFrame = realViewer === false
      ? "skipped: この環境に PDF ビューアが無い(navigator.pdfViewerEnabled が false)"
      : fresh.frames().some((frame) => PDF_VIEWER_FRAME.test(frame.url()));

    // 2) 見本を押すと画面いっぱいに開く(上の帯あり = #navpanes=0 だけ)。倍率の道具は出さない。Esc で閉じる
    await fresh.locator('#blocks .block[data-id="' + blockId + '"] .image-attachment-stage').click();
    await fresh.waitForTimeout(500);
    const opened = await fresh.evaluate(() => {
      const box = document.querySelector("#image-lightbox");
      const frame = document.querySelector("#image-lightbox-pdf");
      return {
        shown: !box.hidden, pdf: box.classList.contains("is-pdf"), src: frame.getAttribute("src") || "", frameShown: !frame.hidden && frame.getBoundingClientRect().height > 300,
        bar: getComputedStyle(document.querySelector("#image-lightbox-bar")).display, title: document.querySelector("#image-lightbox-title").textContent,
        image: !document.querySelector("#image-lightbox-image").hidden,
      };
    });
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const closed = await fresh.evaluate(() => ({ hidden: document.querySelector("#image-lightbox").hidden, src: document.querySelector("#image-lightbox-pdf").getAttribute("src"), pdf: document.querySelector("#image-lightbox").classList.contains("is-pdf") }));
    result.pdfOpensLarge = opened.shown && opened.pdf && opened.src.startsWith("blob:") && opened.src.endsWith("#navpanes=0") && opened.frameShown
      && opened.bar === "none" && opened.title === "試験成績書.pdf" && !opened.image && closed.hidden && closed.src === null && !closed.pdf;
    result.pdfOpenEvidence = { opened, closed };

    // 3) 幅のバー(動画と同じく、マウスを乗せると出る。見本は押すと開くのでブロックを選べないため)
    await fresh.locator(".block-content").first().click();
    const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await row.locator(".image-attachment-stage").hover();
    await fresh.waitForTimeout(200);
    const bar = row.locator(".image-resize-handle.is-right");
    const barOpacity = await bar.evaluate((handle) => getComputedStyle(handle).opacity);
    const barBox = await bar.boundingBox();
    await fresh.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(barBox.x + barBox.width / 2 + 120, barBox.y + barBox.height / 2, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const widened = await cardState(blockId);
    const lightboxAfterDrag = await fresh.evaluate(() => document.querySelector("#image-lightbox").hidden);
    result.pdfResizeOnHover = barOpacity === "1" && widened.stageWidth > preview.stageWidth + 80 && Number(widened.width) > 35 && lightboxAfterDrag;
    result.pdfResizeEvidence = { barOpacity, before: preview.stageWidth, after: widened.stageWidth, width: widened.width, lightboxAfterDrag };

    // 4) つまみのメニューで「中で読む」(上の帯なし・低い枠・中を操作できる)→ 保存に attachmentView: "read"
    const menuPreview = await openMenu(blockId, "表示");
    const menuPreview2 = await fresh.evaluate(() => [...document.querySelectorAll("#block-menu button, #block-menu [role=menuitem]")].map((node) => node.textContent));
    await fresh.keyboard.press("Escape");
    const menuRead = await openMenu(blockId, "読む");
    await chooseMenu("中で読む");
    const read = await cardState(blockId);
    const readSaved = await saveHtml();
    const readBlock = (await manifestOf(readSaved.html)).pages[0].blocks.find((block) => block.id === blockId);
    const menuAfterRead = await openMenu(blockId, "見本");
    await fresh.keyboard.press("Escape");
    result.pdfReadInPlace = menuPreview.concat(menuPreview2).some((text) => text.includes("ファイルとして表示")) && menuRead.some((text) => text.includes("中で読む"))
      && read.view === "read" && read.src.includes("#toolbar=0") && read.src.includes("view=FitH") && read.pointer === "auto" && !read.hint
      && read.frameHeight >= 280 && read.frameHeight <= 320 && readBlock?.attachmentView === "read" && menuAfterRead.some((text) => text.includes("1ページ目の見本にする"));
    result.pdfReadEvidence = { read, attachmentView: readBlock?.attachmentView, menuRead, menuAfterRead };

    // 4b) 中で読むの高さ: 表と同じ下の端のつまみ。ドラッグで高さ(表と同じ viewHeight)、ダブルクリックで既定の 300px
    //     (v277。ユーザー「表やブロックの高さで表示する範囲を決められたと思いますが、これもそうなっていますか」)。
    //     PDF の上では :hover が付かない(PDF ビューアは別の文書)。つまみと幅のバーは、枠のすぐ外(下の端・右の端)に来たら出る
    await fresh.locator(".block-content").first().click();
    const readRow = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    const readFrame = await readRow.locator("iframe.attachment-pdf-frame").boundingBox();
    await fresh.mouse.move(readFrame.x + readFrame.width / 2, readFrame.y + readFrame.height / 2);
    await fresh.waitForTimeout(250);
    const overPdf = await readRow.evaluate((row) => getComputedStyle(row.querySelector(".pdf-height-grip")).opacity);
    await fresh.mouse.move(readFrame.x + readFrame.width / 2, readFrame.y + readFrame.height + 5);
    await fresh.waitForTimeout(250);
    const heightGrip = readRow.locator(".pdf-height-grip");
    const gripOpacity = await heightGrip.evaluate((node) => getComputedStyle(node).opacity);
    // 幅のバーは、PDF の右の端のすぐ外に来たときに出る(PDF の上からそのまま右へ動かしたところ)
    await fresh.mouse.move(readFrame.x + readFrame.width + 4, readFrame.y + readFrame.height / 2);
    await fresh.waitForTimeout(250);
    const readBarOpacity = await readRow.evaluate((row) => getComputedStyle(row.querySelector(".image-resize-handle.is-right")).opacity);
    const readBarSpot = await readRow.evaluate((row, [x, y]) => { const hit = document.elementFromPoint(x, y); return { selected: row.classList.contains("selected"), hit: hit?.className || hit?.tagName, stageHover: row.querySelector(".image-attachment-stage").matches(":hover") }; }, [readFrame.x + readFrame.width + 4, readFrame.y + readFrame.height / 2]);
    await fresh.mouse.move(readFrame.x + readFrame.width / 2, readFrame.y + readFrame.height + 5);
    await fresh.waitForTimeout(250);
    const gripBox = await heightGrip.boundingBox();
    await fresh.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2 + 150, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    const taller = await cardState(blockId);
    const tallSaved = await saveHtml();
    const tallBlock = (await manifestOf(tallSaved.html)).pages[0].blocks.find((block) => block.id === blockId);
    const tallFrame = await readRow.locator("iframe.attachment-pdf-frame").boundingBox();
    await fresh.mouse.move(tallFrame.x + tallFrame.width / 2, tallFrame.y + tallFrame.height + 5);
    await fresh.waitForTimeout(250);
    await readRow.locator(".pdf-height-grip").dblclick();
    await fresh.waitForTimeout(300);
    const reset = await cardState(blockId);
    const resetBlock = (await manifestOf((await saveHtml()).html)).pages[0].blocks.find((block) => block.id === blockId);
    result.pdfReadHeightAdjustable = gripOpacity === "1" && readBarOpacity === "1" && taller.frameHeight >= 440 && taller.frameHeight <= 460 && tallBlock?.viewHeight === taller.frameHeight
      && tallSaved.html.includes("--pdf-height:" + taller.frameHeight + "px") && reset.frameHeight === 300 && resetBlock && !("viewHeight" in resetBlock);
    result.pdfReadHeightEvidence = { overPdf, gripOpacity, readBarOpacity, readBarSpot, taller: taller.frameHeight, viewHeight: tallBlock?.viewHeight, reset: reset.frameHeight, resetHasViewHeight: Boolean(resetBlock && "viewHeight" in resetBlock) };

    // 5) 「ファイルとして表示」→ ファイルのカード(一言は出ない)。Undo で中で読むに戻る。もう一度 Undo で見本
    await openMenu(blockId, "ファイル");
    await chooseMenu("ファイルとして表示");
    const asFile = await cardState(blockId);
    await fresh.locator(".block-content").first().click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undoOnce = await cardState(blockId);
    result.pdfShowAsFileAndUndo = asFile.view === "file" && !asFile.src && !asFile.note && asFile.download && undoOnce.view === "read";
    result.pdfFileEvidence = { asFile, undoOnce };

    // 6) 保存した HTML をブラウザで開いても、見本(押すと開く・Esc で閉じる)・中で読む・ファイルが同じように見える。印刷用の囲みもある
    await fresh.locator(".block-content").nth(1).click();
    await fresh.locator("#attach-input").setInputFiles({ name: "図面.pdf", mimeType: "application/pdf", buffer: makePdf(["Drawing"]) });
    await fresh.waitForTimeout(1200);
    await fresh.locator(".block-content").nth(1).click();
    await fresh.locator("#attach-input").setInputFiles({ name: "仕様書.pdf", mimeType: "application/pdf", buffer: makePdf(["Spec"]) });
    await fresh.waitForTimeout(1200);
    const fileId = await fresh.evaluate(() => [...document.querySelectorAll(".pdf-attachment-card")].find((card) => card.textContent.includes("仕様書.pdf"))?.closest(".block")?.dataset.id);
    await openMenu(fileId, "ファイル");
    await chooseMenu("ファイルとして表示");
    const allSaved = await saveHtml();
    const viewer = await context.newPage();
    if (realViewer === false) await viewer.addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { get: () => true, configurable: true }));
    const viewerErrors = [];
    viewer.on("pageerror", (error) => viewerErrors.push(error.message));
    await viewer.goto("file:///" + allSaved.path.replace(/\\/g, "/"));
    await viewer.waitForTimeout(1500);
    const inSaved = await viewer.evaluate(() => {
      const figures = [...document.querySelectorAll("figure.pdf-attachment")];
      const of = (name) => figures.find((figure) => figure.textContent.includes(name));
      const frameOf = (figure) => figure?.querySelector(".pdf-frame iframe");
      return {
        readView: of("試験成績書.pdf")?.dataset.pdfView, readSrc: frameOf(of("試験成績書.pdf"))?.getAttribute("src") || "",
        previewView: of("図面.pdf")?.dataset.pdfView, previewSrc: frameOf(of("図面.pdf"))?.getAttribute("src") || "",
        previewWidth: of("図面.pdf")?.style.getPropertyValue("--image-width"),
        fallback: Boolean(of("図面.pdf")?.querySelector(".pdf-fallback")), hint: Boolean(of("図面.pdf")?.querySelector(".pdf-open-hint")),
        fileCard: [...document.querySelectorAll("section.attachment strong")].some((node) => node.textContent === "仕様書.pdf"),
        downloads: document.querySelectorAll("[data-download]").length,
      };
    });
    await viewer.locator("figure.pdf-attachment", { hasText: "図面.pdf" }).locator(".pdf-frame").click();
    await viewer.waitForTimeout(400);
    const savedOpen = await viewer.evaluate(() => ({ overlay: Boolean(document.querySelector(".doc-pdf-view")), src: document.querySelector(".doc-pdf-view iframe")?.getAttribute("src") || "", title: document.querySelector(".doc-pdf-title")?.textContent }));
    await viewer.keyboard.press("Escape");
    await viewer.waitForTimeout(200);
    const savedClosed = await viewer.evaluate(() => !document.querySelector(".doc-pdf-view"));
    await viewer.emulateMedia({ media: "print" });
    const printFallback = await viewer.evaluate(() => {
      const figure = [...document.querySelectorAll("figure.pdf-attachment")].find((node) => node.textContent.includes("図面.pdf"));
      return { fallback: getComputedStyle(figure.querySelector(".pdf-fallback")).display, frame: getComputedStyle(figure.querySelector("iframe")).display };
    });
    await viewer.close();
    result.pdfWorksInSavedHtml = inSaved.readView === "read" && inSaved.readSrc.startsWith("blob:") && inSaved.readSrc.includes("view=FitH")
      && inSaved.previewView === "preview" && inSaved.previewSrc.includes("view=Fit") && inSaved.previewWidth === "35%" && inSaved.fallback && inSaved.hint
      && inSaved.fileCard && inSaved.downloads === 3 && savedOpen.overlay && savedOpen.src.endsWith("#navpanes=0") && savedOpen.title === "図面.pdf" && savedClosed
      && printFallback.fallback !== "none" && printFallback.frame === "none" && viewerErrors.length === 0;
    result.pdfSavedEvidence = { inSaved, savedOpen, savedClosed, printFallback, viewerErrors };

    // 7) PDF をその場に出せない環境(navigator.pdfViewerEnabled が false。スマートフォンのブラウザなど)では、一言を出してファイルとして見せる。
    //    文書の中身は変えない。保存HTMLでも同じ
    const phone = await context.newPage();
    await phone.addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { get: () => false, configurable: true }));
    await phone.goto("file:///" + allSaved.path.replace(/\\/g, "/"));
    await phone.waitForTimeout(1200);
    const phoneSaved = await phone.evaluate(() => ({ notes: [...document.querySelectorAll(".video-unplayable")].map((node) => node.textContent), frames: document.querySelectorAll(".pdf-frame iframe").length, unplayable: document.querySelectorAll("figure.pdf-attachment.is-unplayable").length }));
    await phone.goto("http://127.0.0.1:" + PORT + "/");
    await phone.waitForSelector("#blocks .block-content");
    await phone.evaluate(() => { window.showOpenFilePicker = undefined; });
    await phone.locator("#open-input").setInputFiles(allSaved.path);
    await phone.waitForTimeout(1500);
    const phoneEditor = await phone.evaluate(() => [...document.querySelectorAll(".attachment-card")].map((card) => ({ file: card.classList.contains("attachment-file-card"), note: card.querySelector(".attachment-unplayable-note")?.textContent || "", frame: Boolean(card.querySelector("iframe")) })));
    await phone.close();
    const unavailable = "この環境では PDF をその場で表示できません";
    result.pdfUnavailableShowsNote = phoneSaved.notes.length === 2 && phoneSaved.notes.every((text) => text.includes(unavailable)) && phoneSaved.frames === 0 && phoneSaved.unplayable === 2
      && phoneEditor.length === 3 && phoneEditor.every((card) => card.file && !card.frame) && phoneEditor.filter((card) => card.note.includes(unavailable)).length === 2;
    result.pdfUnavailableEvidence = { phoneSaved, phoneEditor };

    // 8) 図の題名(見本・中で読むは図。ファイルは図にしない)。開くとき attachmentView は "file"・"read" だけを受ける
    const captionMenu = await openMenu(blockId, "題名");
    await fresh.keyboard.press("Escape");
    result.pdfIsFigureAndSanitized = captionMenu.some((text) => text.includes("題名を付ける")) && await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const html = fmt.buildPortableHtml({ pages: [{ id: "P", title: "p", blocks: [
        { id: "b1", type: "paragraph", text: "x", attachmentView: "read" },
        { id: "b2", type: "attachment", attachmentId: "none", attachmentView: "read" },
        { id: "b3", type: "attachment", attachmentId: "none", attachmentView: "bogus" },
        { id: "b4", type: "attachment", attachmentId: "none", viewHeight: 500 },
        { id: "b5", type: "paragraph", text: "y", viewHeight: 500 },
      ] }], fonts: [], attachments: [] });
      const blocks = fmt.parsePortableHtml(html).pages[0].blocks;
      const pdf = { id: "x", name: "a.pdf", mime: "application/pdf" };
      const unknownPdf = { id: "y", name: "b.PDF", mime: "application/octet-stream" };
      return !("attachmentView" in blocks[0]) && blocks[1].attachmentView === "read" && !("attachmentView" in blocks[2])
        && blocks[3].viewHeight === 500 && !("viewHeight" in blocks[4]) && fmt.pdfReadHeight({}) === 300 && fmt.pdfReadHeight({ viewHeight: 50 }) === 300 && fmt.pdfReadHeight({ viewHeight: 420 }) === 420
        && fmt.attachmentView({}, pdf) === "pdf" && fmt.attachmentView({ attachmentView: "read" }, pdf) === "pdf-read" && fmt.attachmentView({ attachmentView: "file" }, pdf) === "file"
        && fmt.attachmentView({}, unknownPdf) === "pdf" && fmt.attachmentView({ attachmentView: "read" }, { name: "c.txt", mime: "text/plain" }) === "file"
        && fmt.attachmentWidth({}, "pdf") === 35 && fmt.attachmentWidth({}, "pdf-read") === 100 && fmt.attachmentWidth({ imageWidth: 50 }, "pdf") === 50;
    });
    result.pdfNoPageErrors = errors.length === 0;
    result.pdfErrors = errors.slice(0, 3).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
