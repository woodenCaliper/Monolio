// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT } from "../lib.mjs";

// ---- 動画の添付(v273。形式 0.8.16) ----
// ユーザー「再生できるようにしたい」「ダウンロードもできるようにしたい」「ただのファイルとして表示したいときもあるので、それもできるようにしたい」。
// 再生できる形式はブラウザで決まるので、種類では決め打ちせず再生を試す。だめなら「この環境では再生できませんでした」と出してファイルとして見せる
// (ユーザー「勝手にファイル表示に変わられると…区別がつかない」)。
export default async function videoSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 860 });
  const result = {};
  const errors = [];
  fresh.on("pageerror", (error) => errors.push(error.message));
  let saved = 0;
  const saveHtml = async () => {
    await fresh.evaluate(() => { window.showSaveFilePicker = undefined; });
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "video-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return { path, html: await readFile(path, "utf8") };
  };
  const manifestOf = (html) => fresh.evaluate((text) => JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent), html);
  const menuItem = async (blockId, query) => {
    const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await row.hover();
    await row.locator(".drag-grip").click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type(query);
    await fresh.waitForTimeout(200);
    return fresh.evaluate(() => [...document.querySelectorAll("#block-menu button, #block-menu [role=menuitem]")].map((node) => node.textContent));
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    // 試しの動画(webm、2 秒)をページの中で作る。録画が空に近いことがあるので、大きさを見て作り直す
    let video = null;
    for (let attempt = 0; attempt < 4 && !video; attempt += 1) {
      const base64 = await fresh.evaluate(async () => {
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
            g.fillStyle = "#f0b429"; g.fillRect(10 + t * 60, 30, 24, 24);
            if (t < 2) requestAnimationFrame(draw); else resolve();
          };
          draw();
        });
        recorder.stop();
        await done;
        const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      });
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length > 2000) video = buffer;
    }
    result.videoFixtureMade = Boolean(video);

    // 1) 添付すると、その場で再生できる(エディタ)
    await fresh.locator(".block-content").nth(1).click();
    await fresh.keyboard.press("End");
    await fresh.locator("#attach-input").setInputFiles({ name: "試験の様子.webm", mimeType: "video/webm", buffer: video });
    await fresh.waitForTimeout(1200);
    const playable = await fresh.evaluate(async () => {
      const element = document.querySelector(".video-attachment-card .attachment-video");
      if (!element) return { found: false };
      if (element.readyState < 1) await new Promise((resolve) => { element.addEventListener("loadedmetadata", resolve, { once: true }); setTimeout(resolve, 3000); });
      element.muted = true;
      await element.play().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 600));
      return { found: true, src: element.src.slice(0, 5), duration: element.duration, time: element.currentTime, error: element.error?.code ?? null, blockId: element.closest(".block")?.dataset.id };
    });
    result.videoPlaysInEditor = playable.found && playable.src === "blob:" && playable.duration > 1 && playable.time > 0 && playable.error === null;
    result.videoPlayEvidence = playable;
    const blockId = playable.blockId;

    // 1b) 幅のバー(画像と同じ左右のバー)。動画は押すと再生になってブロックを選べないので、ブロックを選ばなくても
    //     マウスを乗せればバーが出て、ドラッグで幅が変わる(v273。ユーザー「画像のように左右のバーで…できてほしい」)
    await fresh.evaluate(() => document.querySelector(".video-attachment-card .attachment-video")?.pause());
    await fresh.locator(".block-content").first().click();
    const resizeRow = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await resizeRow.scrollIntoViewIfNeeded();
    await resizeRow.locator(".image-attachment-stage").hover();
    await fresh.waitForTimeout(200);
    const hoverBar = await resizeRow.evaluate((row) => {
      const handle = row.querySelector(".image-resize-handle.is-right");
      const box = handle?.getBoundingClientRect();
      const top = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { selected: row.classList.contains("selected"), opacity: handle ? getComputedStyle(handle).opacity : null, onTop: Boolean(top && handle.contains(top)), widthBefore: Math.round(row.querySelector(".image-attachment-stage").getBoundingClientRect().width) };
    });
    const bar = await resizeRow.locator(".image-resize-handle.is-right").boundingBox();
    await fresh.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(bar.x + bar.width / 2 - 120, bar.y + bar.height / 2, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const resizedWidth = await resizeRow.evaluate((row) => Math.round(row.querySelector(".image-attachment-stage").getBoundingClientRect().width));
    const resizedBlock = (await manifestOf((await saveHtml()).html)).pages[0].blocks.find((block) => block.id === blockId);
    result.videoResizeOnHover = !hoverBar.selected && hoverBar.opacity === "1" && hoverBar.onTop
      && resizedWidth < hoverBar.widthBefore - 60 && resizedBlock?.imageWidth < 100;
    result.videoResizeEvidence = { ...hoverBar, resizedWidth, imageWidth: resizedBlock?.imageWidth };

    // 2) ダウンロードできる(カードの Download。エディタでは、ブロックを選ぶと名前・大きさ・Download の欄が出る。画像と同じ)
    const videoRow = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await videoRow.hover();
    await videoRow.locator(".drag-grip").click();
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    const downloadEvent = fresh.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await fresh.locator('#blocks .block[data-id="' + blockId + '"] .attachment-download').click();
    const downloaded = await downloadEvent;
    result.videoDownloads = downloaded?.suggestedFilename() === "試験の様子.webm";

    // 3) つまみのメニューで「ファイルとして表示」→ ファイルのカード(一言は出ない)。保存に attachmentView: "file"。メニューから戻せる。Undo 1手
    const menuBefore = await menuItem(blockId, "表示");
    await fresh.locator("text=ファイルとして表示").first().click();
    await fresh.waitForTimeout(300);
    const asFile = await fresh.evaluate((id) => {
      const row = document.querySelector('#blocks .block[data-id="' + id + '"]');
      return { fileCard: Boolean(row?.querySelector(".attachment-file-card")), video: Boolean(row?.querySelector("video")), note: Boolean(row?.querySelector(".attachment-unplayable-note")) };
    }, blockId);
    const asFileSaved = await saveHtml();
    const asFileManifest = await manifestOf(asFileSaved.html);
    const savedBlock = asFileManifest.pages[0].blocks.find((block) => block.id === blockId);
    const menuAfter = await menuItem(blockId, "表示");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    result.videoShowAsFileToggle = menuBefore.some((text) => text.includes("ファイルとして表示")) && asFile.fileCard && !asFile.video && !asFile.note
      && savedBlock?.attachmentView === "file" && menuAfter.some((text) => text.includes("動画として表示"))
      && /<section class="attachment">/.test(asFileSaved.html) && !/data-attachment-video=/.test(asFileSaved.html);
    result.videoShowAsFileEvidence = { menuBefore, menuAfter, asFile, attachmentView: savedBlock?.attachmentView };
    await fresh.locator(".block-content").first().click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.videoShowAsFileUndo = await fresh.evaluate((id) => Boolean(document.querySelector('#blocks .block[data-id="' + id + '"] .attachment-video')), blockId);

    // 4) 保存HTMLをブラウザで開いても再生できる。Download もある
    const savedPlay = await saveHtml();
    const viewer = await context.newPage();
    viewer.on("pageerror", (error) => errors.push("viewer: " + error.message));
    await viewer.goto("file:///" + savedPlay.path.replace(/\\/g, "/"));
    const savedVideo = await viewer.evaluate(async () => {
      const element = document.querySelector("figure.video-attachment video[data-attachment-video]");
      if (!element) return { found: false };
      for (let i = 0; i < 40 && element.readyState < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      return { found: true, src: element.src.slice(0, 5), duration: element.duration, download: Boolean(document.querySelector("figure.video-attachment [data-download]")) };
    });
    await viewer.close();
    result.videoPlaysInSavedHtml = savedVideo.found && savedVideo.src === "blob:" && savedVideo.duration > 1 && savedVideo.download;
    result.videoSavedEvidence = savedVideo;

    // 5) 再生できない動画(中身がでたらめな mov)は、一言を出してファイルとして見せる。保存HTMLでも同じ。文書の中身は動画のまま
    await fresh.locator(".block-content").nth(1).click();
    await fresh.locator("#attach-input").setInputFiles({ name: "現場の記録.mov", mimeType: "video/quicktime", buffer: Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37) % 256)) });
    await fresh.waitForTimeout(1500);
    const broken = await fresh.evaluate(() => {
      const card = [...document.querySelectorAll(".attachment-card")].find((node) => node.textContent.includes("現場の記録.mov"));
      return { unplayable: card?.classList.contains("is-unplayable"), note: card?.querySelector(".attachment-unplayable-note")?.textContent || "", video: Boolean(card?.querySelector("video")), download: Boolean(card?.querySelector(".attachment-download")) };
    });
    const brokenSaved = await saveHtml();
    const brokenManifest = await manifestOf(brokenSaved.html);
    const brokenViewer = await context.newPage();
    await brokenViewer.goto("file:///" + brokenSaved.path.replace(/\\/g, "/"));
    await brokenViewer.waitForTimeout(1500);
    const brokenInSaved = await brokenViewer.evaluate(() => ({ note: document.querySelector(".video-unplayable")?.textContent || "", playable: document.querySelectorAll("video[data-attachment-video]").length }));
    await brokenViewer.close();
    const movBlock = brokenManifest.pages[0].blocks.find((block) => block.type === "attachment" && brokenManifest.attachments.find((item) => item.id === block.attachmentId)?.name === "現場の記録.mov");
    result.videoUnplayableShowsNote = broken.unplayable && broken.note.includes("この環境では再生できませんでした") && broken.note.includes("video/quicktime")
      && !broken.video && broken.download && movBlock && movBlock.attachmentView === undefined
      && brokenInSaved.note.includes("この環境では再生できませんでした") && brokenInSaved.playable === 1;
    result.videoUnplayableEvidence = { broken, brokenInSaved };

    // 6) 画像も「ファイルとして表示」にできる(「画像として表示」で戻す)。動画・画像は図(題名を付けられる)
    const png = await fresh.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 40; canvas.height = 20;
      canvas.getContext("2d").fillRect(0, 0, 40, 20);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    });
    await fresh.locator(".block-content").nth(1).click();
    await fresh.locator("#attach-input").setInputFiles({ name: "図.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await fresh.waitForTimeout(800);
    const imageId = await fresh.evaluate(() => document.querySelector(".image-attachment-card:not(.video-attachment-card)")?.closest(".block")?.dataset.id);
    const imageMenu = await menuItem(imageId, "表示");
    await fresh.locator("text=ファイルとして表示").first().click();
    await fresh.waitForTimeout(300);
    const imageAsFile = await fresh.evaluate((id) => Boolean(document.querySelector('#blocks .block[data-id="' + id + '"] .attachment-file-card')), imageId);
    const imageMenuAfter = await menuItem(imageId, "表示");
    await fresh.keyboard.press("Escape");
    const videoCaptionMenu = await menuItem(blockId, "題名");
    await fresh.keyboard.press("Escape");
    result.videoImageAlsoShowAsFile = imageMenu.some((text) => text.includes("ファイルとして表示")) && imageAsFile
      && imageMenuAfter.some((text) => text.includes("画像として表示")) && videoCaptionMenu.some((text) => text.includes("題名を付ける"));

    // 7) 開くとき、attachmentView は添付のブロックの "file" だけを受ける
    result.videoViewSanitizedOnOpen = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const html = fmt.buildPortableHtml({ pages: [{ id: "V", title: "v", blocks: [
        { id: "a1", type: "paragraph", text: "x", attachmentView: "file" },
        { id: "a2", type: "attachment", attachmentId: "none", attachmentView: "weird" },
        { id: "a3", type: "attachment", attachmentId: "none", attachmentView: "file" },
      ] }], fonts: [], attachments: [] });
      const blocks = fmt.parsePortableHtml(html).pages[0].blocks;
      return !("attachmentView" in blocks[0]) && !("attachmentView" in blocks[1]) && blocks[2].attachmentView === "file";
    });
    result.videoNoPageErrors = errors.length === 0;
    result.videoErrors = errors.slice(0, 3).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
