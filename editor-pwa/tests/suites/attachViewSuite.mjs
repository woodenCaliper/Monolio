// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 添付の見え方を作り直さない・同じ中身を2つ持たない・base64 を速く(Issue #216 #218 #221 #222) ----
// #216 ブロックを選ぶ(選択の印の付け外し)たびに添付の行を作り直していた(行の鍵に選択が入っていた)。動画は頭に戻り、
//      中で読む PDF は1ページ目から読み直しになった。段組みの中では、隣のブロックで Enter しても段組みごと作り直していた。
// #218 ページを切り替える(丸ごとの描き直し)たびに、添付のプレビューの URL を全部捨てて base64 から作り直していた。
//      画像の拡大表示も、プレビューの URL を使わずに毎回デコードしていた(#222 の後半)。
// #221 同じファイルを2回添付すると、中身が2つ入っていた。
// #222 添付を base64 にする処理(chunkBase64)が1バイトずつ文字列をつないでいた(遅い。imageDisplayUrl は 32KB ずつ)。

// 試しの PDF(文字だけ。ページごとに1行)。pdfSuite と同じ作り
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

export default async function attachViewSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 860 });
  const result = {};
  const errors = [];
  fresh.on("pageerror", (error) => errors.push(error.message));
  // PDF ビューアの無い環境(クラウドの chromium)でも、枠(iframe)を作る経路を通す(pdfSuite と同じ)。
  const realViewer = await fresh.evaluate(() => navigator.pdfViewerEnabled);
  if (realViewer === false) await fresh.addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { get: () => true, configurable: true }));
  let opened = 0;
  const open = async (literal) => {
    const path = join(OUT, "attach-view-" + (opened += 1) + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    const lastId = literal.pages[0].blocks.at(-1).id;
    await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), lastId, { timeout: 60000 });
    await fresh.waitForTimeout(600);
  };
  let saved = 0;
  const savedManifest = async () => {
    await fresh.evaluate(() => { window.showSaveFilePicker = undefined; });
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "attach-view-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return fresh.evaluate((text) => JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent), html);
  };
  const clickGrip = async (blockId) => {
    const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await row.scrollIntoViewIfNeeded();
    await row.hover();
    await row.locator(".drag-grip").first().click();
    await fresh.waitForTimeout(300);
  };
  // 行の中の動画・PDF の枠に印を付け、作り直されたか(同じ要素か)・読み直したか(load の回数)を後で見る。
  const markMedia = (blockId, tag) => fresh.evaluate(([id, name]) => {
    const element = document.querySelector('#blocks .block[data-id="' + id + '"] ' + name);
    if (!element) return false;
    element.__testMark = id;
    // 行そのもの(選ぶだけなら、行も作り直さない。印だけを付け外しする)
    element.closest(".block").__testRow = id;
    element.__loads = 0;
    element.addEventListener("load", () => { element.__loads += 1; });
    return true;
  }, [blockId, tag]);
  const mediaState = (blockId, tag) => fresh.evaluate(([id, name]) => {
    const element = document.querySelector('#blocks .block[data-id="' + id + '"] ' + name);
    return {
      found: Boolean(element),
      same: element?.__testMark === id,
      sameRow: document.querySelector('#blocks .block[data-id="' + id + '"]')?.__testRow === id,
      loads: element?.__loads ?? null,
      time: element?.currentTime ?? null,
      paused: element?.paused ?? null,
      selected: Boolean(element?.closest(".block")?.classList.contains("selected")),
    };
  }, [blockId, tag]);
  const playVideo = (blockId) => fresh.evaluate(async (id) => {
    const element = document.querySelector('#blocks .block[data-id="' + id + '"] video');
    if (!element) return null;
    if (element.readyState < 1) await new Promise((resolve) => { element.addEventListener("loadedmetadata", resolve, { once: true }); setTimeout(resolve, 3000); });
    element.muted = true;
    await element.play().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 700));
    return element.currentTime;
  }, blockId);
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // ---- 試しの添付(動画 webm・PDF 2 ページ・PNG)をページの中で作る ----
    const fixtures = await fresh.evaluate(async (pdfBase64) => {
      const fmt = window.SingleHtmlFormat;
      let videoBytes = null;
      for (let attempt = 0; attempt < 4 && !(videoBytes?.length > 2000); attempt += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = 160; canvas.height = 90;
        const g = canvas.getContext("2d");
        const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm" });
        const chunks = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        const done = new Promise((resolve) => { recorder.onstop = resolve; });
        recorder.start();
        const start = performance.now();
        await new Promise((resolve) => {
          const draw = () => {
            const t = (performance.now() - start) / 1000;
            g.fillStyle = "#1f3b57"; g.fillRect(0, 0, 160, 90);
            g.fillStyle = "#f0b429"; g.fillRect(10 + t * 20, 30, 24, 24);
            if (t < 6) requestAnimationFrame(draw); else resolve();
          };
          draw();
        });
        recorder.stop();
        await done;
        videoBytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      }
      const canvas = document.createElement("canvas");
      canvas.width = 60; canvas.height = 30;
      canvas.getContext("2d").fillRect(0, 0, 60, 30);
      const png = new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))).arrayBuffer());
      const pdf = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
      return {
        video: await fmt.fileToAttachment(new File([videoBytes], "様子.webm", { type: "video/webm" }), "av"),
        pdf: await fmt.fileToAttachment(new File([pdf], "成績書.pdf", { type: "application/pdf" }), "ap"),
        png: await fmt.fileToAttachment(new File([png], "図.png", { type: "image/png" }), "ai"),
      };
    }, makePdf(["Page one", "Page two"]).toString("base64"));
    result.attachViewFixturesMade = fixtures.video.size > 2000 && fixtures.pdf.size > 300 && fixtures.png.size > 50;

    const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
    await open({
      title: "添付の見え方", fonts: [], attachments: [fixtures.video, fixtures.pdf, fixtures.png],
      pages: [
        { id: "P1", title: "添付のページ", blocks: [
          P("p0", "先頭"),
          { id: "vid", type: "attachment", text: "", attachmentId: "av" },
          { id: "pdfr", type: "attachment", text: "", attachmentId: "ap", attachmentView: "read" },
          { id: "img", type: "attachment", text: "", attachmentId: "ai" },
          P("cgText", "段組みの文", { columnGroup: "cg", columnIndex: 0, columnWidth: 1 }),
          { id: "cgVid", type: "attachment", text: "", attachmentId: "av", columnGroup: "cg", columnIndex: 1, columnWidth: 1 },
          P("cg2Text", "段組みの文2", { columnGroup: "cg2", columnIndex: 0, columnWidth: 1 }),
          { id: "cg2Pdf", type: "attachment", text: "", attachmentId: "ap", attachmentView: "read", columnGroup: "cg2", columnIndex: 1, columnWidth: 1 },
          P("last", "最後"),
        ] },
        { id: "P2", title: "別のページ", blocks: [P("q0", "別のページの文")] },
      ],
    });
    // PDF の枠が読み終わるのを待ってから印を付ける(最初の load を数えないため)。
    await fresh.waitForTimeout(1200);

    // ---- #216 1) 動画のブロックをつまみで選んでも、同じ <video> のまま再生が続く(頭に戻らない) ----
    await markMedia("vid", "video");
    const playedAt = await playVideo("vid");
    await clickGrip("vid");
    const afterSelect = await mediaState("vid", "video");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    await fresh.locator('#blocks .block[data-id="p0"] .block-content').click();
    await fresh.waitForTimeout(300);
    const afterUnselect = await mediaState("vid", "video");
    result.attachSelectKeepsVideo = afterSelect.found && afterSelect.same && afterSelect.selected && afterSelect.paused === false
      && afterSelect.time >= playedAt && afterUnselect.same && !afterUnselect.selected && afterUnselect.paused === false;
    result.attachSelectKeepsRow = afterSelect.sameRow && afterUnselect.sameRow;
    result.attachSelectVideoEvidence = { playedAt, afterSelect, afterUnselect };

    // ---- #216 2) 中で読む PDF のブロックを選んでも、枠を作り直さない(読み直さない) ----
    await markMedia("pdfr", "iframe.attachment-pdf-frame");
    await clickGrip("pdfr");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    await fresh.locator('#blocks .block[data-id="p0"] .block-content').click();
    await fresh.waitForTimeout(800);
    const pdfAfterSelect = await mediaState("pdfr", "iframe.attachment-pdf-frame");
    result.attachSelectKeepsPdf = pdfAfterSelect.found && pdfAfterSelect.same && pdfAfterSelect.sameRow && pdfAfterSelect.loads === 0;
    result.attachSelectPdfEvidence = pdfAfterSelect;

    // ---- #216 3) 段組みの中で、隣の文で打って Enter しても、動画・PDF は同じ要素のまま(再生が続く・読み直さない) ----
    await markMedia("cgVid", "video");
    const cgPlayedAt = await playVideo("cgVid");
    await markMedia("cg2Pdf", "iframe.attachment-pdf-frame");
    await fresh.locator('#blocks .block[data-id="cgText"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("を足す");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("新しい行");
    await fresh.locator('#blocks .block[data-id="cg2Text"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("も足す");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(800);
    const cgVideo = await mediaState("cgVid", "video");
    const cgPdf = await mediaState("cg2Pdf", "iframe.attachment-pdf-frame");
    const cgRebuilt = await fresh.evaluate(() => document.querySelectorAll('#blocks .column-layout .block[data-id="cgText"]').length === 1
      && [...document.querySelectorAll("#blocks .column-layout .block")].some((row) => row.textContent.includes("新しい行")));
    result.attachColumnKeepsMedia = cgRebuilt && cgVideo.found && cgVideo.same && cgVideo.paused === false && cgVideo.time >= cgPlayedAt
      && cgPdf.found && cgPdf.same && cgPdf.loads === 0;
    result.attachColumnEvidence = { cgPlayedAt, cgVideo, cgPdf, cgRebuilt };
    // 段組みで作り直した後も、中で読む PDF の高さのつまみは今の枠を動かす(作り直しの前の枠を掴んだままにしない)。
    const pdfRow = fresh.locator('#blocks .block[data-id="cg2Pdf"]');
    await pdfRow.scrollIntoViewIfNeeded();
    const frameHeight = () => pdfRow.evaluate((row) => Math.round(row.querySelector("iframe.attachment-pdf-frame")?.getBoundingClientRect().height || 0));
    const gripMoves = { before: await frameHeight(), during: null };
    const gripBox = await pdfRow.locator(".pdf-height-grip").boundingBox();
    if (gripBox) {
      await fresh.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2 + 60, { steps: 4 });
      gripMoves.during = await frameHeight();
      await fresh.mouse.up();
      await fresh.waitForTimeout(300);
    }
    result.attachColumnPdfGripMovesFrame = gripMoves.during >= gripMoves.before + 50;
    result.attachColumnPdfGripEvidence = gripMoves;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);

    // ---- #216 3b) 状態を保って動かす道具(Element.moveBefore)の無いブラウザでも、動画は同じ要素のまま続く(PDF は読み直す。証拠だけ) ----
    await fresh.evaluate(() => {
      window.__testMoveBefore = Object.getOwnPropertyDescriptor(Element.prototype, "moveBefore");
      delete Element.prototype.moveBefore;
      const element = document.querySelector('#blocks .block[data-id="cgVid"] video');
      if (element) element.currentTime = 0;
    });
    await markMedia("cgVid", "video");
    await markMedia("cg2Pdf", "iframe.attachment-pdf-frame");
    const plainPlayedAt = await playVideo("cgVid");
    await fresh.locator('#blocks .block[data-id="cgText"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.locator('#blocks .block[data-id="cg2Text"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(800);
    const plainVideo = await mediaState("cgVid", "video");
    const plainPdf = await mediaState("cg2Pdf", "iframe.attachment-pdf-frame");
    await fresh.evaluate(() => {
      if (window.__testMoveBefore) Object.defineProperty(Element.prototype, "moveBefore", window.__testMoveBefore);
    });
    result.attachColumnKeepsVideoWithoutMoveBefore = plainVideo.found && plainVideo.same && plainVideo.paused === false && plainVideo.time >= plainPlayedAt;
    result.attachColumnWithoutMoveBeforeEvidence = { hadMoveBefore: await fresh.evaluate(() => Boolean(window.__testMoveBefore)), plainPlayedAt, plainVideo, plainPdf };
    await fresh.keyboard.press("Control+z");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);

    // ---- #218 ページを行き来しても、添付のプレビューを作り直さない(base64 のデコード・blob の作り直しをしない) ----
    await fresh.locator('#blocks .block[data-id="p0"] .block-content').click();
    const srcsOf = () => fresh.evaluate(() => Object.fromEntries(["vid", "pdfr", "img"].map((id) => {
      const element = document.querySelector('#blocks .block[data-id="' + id + '"] video, #blocks .block[data-id="' + id + '"] iframe, #blocks .block[data-id="' + id + '"] img.attachment-image');
      return [id, (element?.getAttribute("src") || "").split("#")[0]];
    })));
    const srcBefore = await srcsOf();
    await fresh.evaluate(() => {
      window.__testBlobs = 0;
      window.__testJoins = 0;
      const create = URL.createObjectURL;
      URL.createObjectURL = function (...args) { window.__testBlobs += 1; return create.apply(this, args); };
      const fmt = window.SingleHtmlFormat;
      const join = fmt.joinChunks;
      try { fmt.joinChunks = function (...args) { window.__testJoins += 1; return join.apply(this, args); }; } catch { /* 凍結なら数えない */ }
    });
    const goTo = async (title) => {
      await fresh.locator("#page-tree-body .page-tree-item", { hasText: title }).first().click();
      await fresh.waitForTimeout(500);
    };
    await goTo("別のページ");
    const onOther = await fresh.evaluate(() => Boolean(document.querySelector('#blocks .block[data-id="q0"]')));
    await goTo("添付のページ");
    const srcAfter = await srcsOf();
    const counts = await fresh.evaluate(() => ({ blobs: window.__testBlobs, joins: window.__testJoins }));
    result.attachPageSwitchKeepsPreviews = onOther && Boolean(srcBefore.vid && srcBefore.pdfr && srcBefore.img)
      && srcAfter.vid === srcBefore.vid && srcAfter.pdfr === srcBefore.pdfr && srcAfter.img === srcBefore.img
      && counts.blobs === 0 && counts.joins === 0;
    result.attachPageSwitchEvidence = { srcBefore, srcAfter, counts, onOther };

    // ---- #222(後半) 画像の拡大表示は、プレビューの URL をそのまま使う(デコードし直さない)。閉じてもプレビューは見えたまま ----
    await fresh.evaluate(() => { window.__testBlobs = 0; window.__testJoins = 0; });
    await fresh.locator('#blocks .block[data-id="img"] .image-attachment-stage').dblclick();
    await fresh.waitForTimeout(400);
    const lightbox = await fresh.evaluate(() => ({
      shown: !document.querySelector("#image-lightbox").hidden,
      src: document.querySelector("#image-lightbox-image").getAttribute("src") || "",
      blobs: window.__testBlobs, joins: window.__testJoins,
    }));
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(300);
    const stillShown = await fresh.evaluate(async () => {
      const image = document.querySelector('#blocks .block[data-id="img"] img.attachment-image');
      try {
        return (await (await fetch(image.src)).blob()).size > 0;
      } catch {
        return false;
      }
    });
    result.attachLightboxReusesPreview = lightbox.shown && lightbox.src === srcAfter.img && lightbox.blobs === 0 && lightbox.joins === 0 && stillShown;
    result.attachLightboxEvidence = { ...lightbox, rowSrc: srcAfter.img, stillShown };

    // ---- #218 文書を差し替えたら、前の文書の URL は使わない(同じ id でも中身が別) ----
    const pngB = await fresh.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 20; canvas.height = 40;
      const g = canvas.getContext("2d");
      g.fillStyle = "#c00"; g.fillRect(0, 0, 20, 40);
      const png = new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))).arrayBuffer());
      return window.SingleHtmlFormat.fileToAttachment(new File([png], "別の図.png", { type: "image/png" }), "ai");
    });
    await open({ title: "差し替え", fonts: [], attachments: [pngB], pages: [{ id: "R1", title: "差し替え", blocks: [
      { id: "img", type: "attachment", text: "", attachmentId: "ai" }, P("rlast", "最後"),
    ] }] });
    const replaced = await fresh.evaluate(async () => {
      const image = document.querySelector('#blocks .block[data-id="img"] img.attachment-image');
      if (!image) return null;
      if (!image.complete) await new Promise((resolve) => { image.addEventListener("load", resolve, { once: true }); setTimeout(resolve, 2000); });
      return { src: image.getAttribute("src"), width: image.naturalWidth, height: image.naturalHeight };
    });
    result.attachReplaceDocumentDropsOldPreview = Boolean(replaced) && replaced.src !== srcAfter.img && replaced.width === 20 && replaced.height === 40;
    result.attachReplaceDocumentEvidence = replaced;

    // ---- #221 同じファイルを2回添付しても、中身は1つ(2つのブロックが同じ添付を指す)。片方を消しても残り、両方消すと無くなる ----
    await open({ title: "重ね", fonts: [], attachments: [], pages: [{ id: "D1", title: "重ね", blocks: [P("d0", "先頭"), P("dlast", "最後")] }] });
    const dupBytes = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 31 + 7) % 256));
    await fresh.locator('#blocks .block[data-id="d0"] .block-content').click();
    await fresh.locator("#attach-input").setInputFiles({ name: "data.bin", mimeType: "application/octet-stream", buffer: dupBytes });
    await fresh.waitForTimeout(600);
    await fresh.locator('#blocks .block[data-id="dlast"] .block-content').click();
    // 2回目は、同じファイルを一度に2つ選んだ形(1回の添付の中でも重ねない)
    await fresh.locator("#attach-input").setInputFiles([
      { name: "data.bin", mimeType: "application/octet-stream", buffer: dupBytes },
      { name: "data.bin", mimeType: "application/octet-stream", buffer: dupBytes },
    ]);
    await fresh.waitForTimeout(600);
    // 中身が同じでも名前が違うファイルは別の添付(名前は添付が持つので、まとめると名前が変わってしまう)
    await fresh.locator("#attach-input").setInputFiles({ name: "copy.bin", mimeType: "application/octet-stream", buffer: dupBytes });
    await fresh.waitForTimeout(600);
    const dupManifest = await savedManifest();
    const dupBlocks = dupManifest.pages[0].blocks.filter((block) => block.type === "attachment");
    const dataIds = dupManifest.attachments.filter((item) => item.name === "data.bin").map((item) => item.id);
    const copyIds = dupManifest.attachments.filter((item) => item.name === "copy.bin").map((item) => item.id);
    const shown = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .attachment-card .attachment-name, #blocks .attachment-card")].length);
    result.attachSameFileOnce = dupBlocks.length === 4 && dataIds.length === 1 && copyIds.length === 1
      && dupBlocks.filter((block) => block.attachmentId === dataIds[0]).length === 3
      && dupBlocks.filter((block) => block.attachmentId === copyIds[0]).length === 1 && dupManifest.attachments.length === 2;
    result.attachSameFileEvidence = { attachments: dupManifest.attachments.map((item) => [item.id, item.name, item.size]), blocks: dupBlocks.map((block) => block.attachmentId), shown };
    // 片方ずつ消す(つまみで選んで Delete)
    const dataBlockIds = dupBlocks.filter((block) => block.attachmentId === dataIds[0]).map((block) => block.id);
    const removeBlock = async (blockId) => {
      await clickGrip(blockId);
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(150);
      await fresh.evaluate((id) => {
        // Escape でメニューを閉じても選択は残る(残っていなければ選び直す)。
        if (!document.querySelector('#blocks .block.selected[data-id="' + id + '"]')) throw new Error("not selected: " + id);
      }, blockId);
      await fresh.keyboard.press("Delete");
      await fresh.waitForTimeout(300);
    };
    if (dataBlockIds.length === 3) {
      await removeBlock(dataBlockIds[0]);
      await removeBlock(dataBlockIds[1]);
      const oneLeft = await savedManifest();
      await removeBlock(dataBlockIds[2]);
      const noneLeft = await savedManifest();
      result.attachSharedRemovedOnlyWhenUnused = oneLeft.attachments.some((item) => item.id === dataIds[0])
        && !noneLeft.attachments.some((item) => item.id === dataIds[0]) && noneLeft.attachments.some((item) => item.id === copyIds[0]);
      result.attachSharedRemovedEvidence = { oneLeft: oneLeft.attachments.map((item) => item.name), noneLeft: noneLeft.attachments.map((item) => item.name) };
    } else {
      // まとめられていない(前の作り)ときは、消し方の確かめに入れない
      result.attachSharedRemovedOnlyWhenUnused = false;
    }

    // ---- #222 base64 にする処理: 以前の1バイトずつの作りと同じ結果。まとめて変換する(1バイトずつ文字にしない) ----
    result.attachBase64SameAsBefore = await fresh.evaluate(async () => {
      const fmt = window.SingleHtmlFormat;
      const CHUNK = 64 * 1024;
      // 以前の chunkBase64(1バイトずつ)
      const oldChunks = (bytes) => {
        const chunks = [];
        for (let offset = 0; offset < bytes.length; offset += CHUNK) {
          let binary = "";
          for (const byte of bytes.slice(offset, offset + CHUNK)) binary += String.fromCharCode(byte);
          chunks.push(btoa(binary));
        }
        return chunks;
      };
      const random = (length) => {
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i += 65536) crypto.getRandomValues(bytes.subarray(i, Math.min(length, i + 65536)));
        return bytes;
      };
      const lengths = [0, 1, 2, 3, 4, 0x7FFF, 0x8000, 0x8001, CHUNK - 1, CHUNK, CHUNK + 1, CHUNK * 3 + 5];
      const check = async () => {
        for (const length of lengths) {
          const bytes = random(length);
          const attachment = await fmt.fileToAttachment(new File([bytes], "r.bin"), "r");
          const expected = oldChunks(bytes);
          if (attachment.chunks.length !== expected.length || attachment.chunks.some((chunk, i) => chunk !== expected[i])) return false;
          // 戻すと同じバイト列
          const back = fmt.joinChunks(attachment);
          if (back.length !== length || back.some((byte, i) => byte !== bytes[i])) return false;
        }
        // SVG の画像の data: URL(imageDisplayUrl)も同じ変換
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text>' + "あ".repeat(20000) + "</text></svg>");
        let binary = "";
        for (const byte of svg) binary += String.fromCharCode(byte);
        return fmt.imageDisplayUrl(svg, "image/svg+xml").url === "data:image/svg+xml;base64," + btoa(binary);
      };
      const native = await check();
      // Uint8Array.prototype.toBase64 の無いブラウザの道(まとめて文字にする)も同じ結果
      const descriptor = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
      if (descriptor) delete Uint8Array.prototype.toBase64;
      let fallback;
      try {
        fallback = await check();
      } finally {
        if (descriptor) Object.defineProperty(Uint8Array.prototype, "toBase64", descriptor);
      }
      return [native, fallback];
    });
    const speed = await fresh.evaluate(async () => {
      const fmt = window.SingleHtmlFormat;
      const bytes = new Uint8Array(8 * 1024 * 1024);
      for (let i = 0; i < bytes.length; i += 65536) crypto.getRandomValues(bytes.subarray(i, i + 65536));
      // 1バイトずつ文字にしていないか(String.fromCharCode の呼び出しの数で見る。速さの値は機械で変わるので証拠だけ)
      const original = String.fromCharCode;
      let calls = 0;
      String.fromCharCode = function (...args) { calls += 1; return original.apply(this, args); };
      let ms;
      try {
        const start = performance.now();
        await fmt.fileToAttachment(new File([bytes], "big.bin"), "big");
        ms = Math.round(performance.now() - start);
      } finally {
        String.fromCharCode = original;
      }
      // 以前の作り(比べるための証拠)
      const startOld = performance.now();
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        let binary = "";
        for (const byte of bytes.slice(offset, offset + 65536)) binary += original(byte);
        btoa(binary);
      }
      const oldMs = Math.round(performance.now() - startOld);
      // toBase64 の無いブラウザの道(32KB ずつまとめて文字にする)
      const descriptor = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");
      if (descriptor) delete Uint8Array.prototype.toBase64;
      let fallbackMs;
      let fallbackCalls = 0;
      const small = bytes.subarray(0, 1 << 20);
      try {
        const startFallback = performance.now();
        await fmt.fileToAttachment(new File([bytes], "big.bin"), "big");
        fallbackMs = Math.round(performance.now() - startFallback);
        String.fromCharCode = function (...args) { fallbackCalls += 1; return original.apply(this, args); };
        await fmt.fileToAttachment(new File([small], "small.bin"), "small");
      } finally {
        String.fromCharCode = original;
        if (descriptor) Object.defineProperty(Uint8Array.prototype, "toBase64", descriptor);
      }
      return { calls, bytes: bytes.length, ms, fallbackMs, fallbackCalls, smallBytes: small.length, oldMs };
    });
    result.attachBase64NotPerByte = speed.calls < speed.bytes / 1000 && speed.fallbackCalls < speed.smallBytes / 1000;
    result.attachBase64SpeedEvidence = speed;

    // 保存HTMLのランタイムにも同じ変換(bytesToBase64)が入っていて、SVG の画像が出る
    const svgDoc = await fresh.evaluate(async () => {
      const fmt = window.SingleHtmlFormat;
      const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="12"><rect width="30" height="12" fill="#c00"/></svg>');
      const attachment = await fmt.fileToAttachment(new File([svg], "図.svg", { type: "image/svg+xml" }), "asvg");
      let binary = "";
      for (const byte of svg) binary += String.fromCharCode(byte);
      return {
        html: fmt.buildPortableHtml({ title: "SVG", fonts: [], attachments: [attachment], pages: [{ id: "S1", title: "SVG", blocks: [{ id: "s1", type: "attachment", text: "", attachmentId: "asvg" }] }] }),
        expected: "data:image/svg+xml;base64," + btoa(binary),
      };
    });
    const svgPath = join(OUT, "attach-view-svg.html");
    await writeFile(svgPath, svgDoc.html, "utf8");
    const viewer = await context.newPage();
    const viewerErrors = [];
    viewer.on("pageerror", (error) => viewerErrors.push(error.message));
    await viewer.goto("file:///" + svgPath.replace(/\\/g, "/"));
    await viewer.waitForFunction(() => document.querySelector("img[data-attachment-image]")?.getAttribute("src"), null, { timeout: 5000 }).catch(() => {});
    const savedSvg = await viewer.evaluate(() => document.querySelector("img[data-attachment-image]")?.getAttribute("src") || "");
    await viewer.close();
    result.attachSavedSvgUsesSameBase64 = savedSvg === svgDoc.expected && viewerErrors.length === 0;
    result.attachSavedSvgEvidence = { head: savedSvg.slice(0, 40), viewerErrors };

    result.attachViewNoPageErrors = errors.length === 0;
    result.attachViewErrors = errors.slice(0, 3).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
