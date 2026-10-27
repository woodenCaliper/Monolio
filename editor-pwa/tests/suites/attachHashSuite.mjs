// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT } from "../lib.mjs";

// ---- 添付の確かめ・読み直しのむだ(Issue #217・#219・#220) ----
// #217: Ctrl+S のたびに全添付をデコードして SHA-256 を取り直し、書いた HTML を丸ごと読み直して(parsePortableHtml)比べる元を作っていた。
//       いまは確かめ済みの中身(chunks の配列)を覚えて新しい添付だけ確かめ、比べる元は書いた manifest から作る(開き直したものと同じ形)。
// #219: 保存HTMLを開くと、全ページの全部の画像・動画・PDF を一度にデコード・ハッシュし、同じ添付は使う数だけ繰り返した。ランタイムの
//       比べ方がエディタと違い、大文字の sha256 の記録の画像が保存HTMLでだけ「Hash mismatch」になった。いまは id ごとに1回、動画・PDF は
//       画面に近づいたとき。比べ方はエディタの関数そのもの(埋め込み)。確かめに通らない添付は出さないのは同じ。
// #220: 印刷のたびに、全添付の base64 を入れた HTML を作って捨て、画像は要素ごとにデコードし直していた。紙の見た目は変えない。
// 数えるのは crypto.subtle.digest(ハッシュ)を呼んだ回数と、そのときのバイト数(どの添付かはバイト数で見分ける)。
export default async function attachHashSuite({ context }) {
  const result = {};
  const errors = [];
  const sample = await readFile("docs/sample/monolio-features.html", "utf8");

  // SHA-256 の呼び出しを数える(バイト数を記録)。アプリより先に入れる
  const countDigests = () => {
    window.__digests = [];
    // PDF の枠など、SubtleCrypto の無い枠では数えない
    if (typeof SubtleCrypto === "undefined") return;
    const original = SubtleCrypto.prototype.digest;
    SubtleCrypto.prototype.digest = function (algorithm, data) {
      window.__digests.push(data.byteLength);
      return original.call(this, algorithm, data);
    };
  };
  // 開いたファイルの手がかり(PWA の showOpenFilePicker の handle)を真似る。書いた中身は window.__file.text
  const fakeHandle = () => {
    window.__file = { name: "hash.html", text: "", lastModified: 1 };
    window.__writes = 0;
    const handle = {
      kind: "file",
      name: "hash.html",
      getFile: async () => new File([window.__file.text], window.__file.name, { type: "text/html", lastModified: window.__file.lastModified }),
      createWritable: async () => {
        let out = "";
        return {
          write: async (chunk) => { out += typeof chunk === "string" ? chunk : await new Blob([chunk]).text(); },
          close: async () => {
            window.__file.text = out;
            window.__file.lastModified += 1;
            window.__writes += 1;
          },
        };
      },
    };
    window.showOpenFilePicker = async () => [handle];
  };
  const newApp = async () => {
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.addInitScript(countDigests);
    await page.addInitScript(fakeHandle);
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await page.waitForSelector("#blocks .block-content");
    return page;
  };
  const openHtml = async (page, html, title) => {
    await page.evaluate((text) => { window.__file.text = text; }, html);
    await page.locator("#menu-file-button").click();
    await page.locator("#menu-open-document").click();
    await page.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  // 保存(Ctrl+S)1回のあいだの、添付のバイト数のハッシュの回数と、parsePortableHtml の回数
  const saveCounting = async (page, sizes) => {
    await page.evaluate(() => {
      window.__digests.length = 0;
      window.__parses = 0;
      const fmt = window.SingleHtmlFormat;
      if (!fmt.__parseWrapped) {
        const parse = fmt.parsePortableHtml;
        fmt.parsePortableHtml = (...args) => { window.__parses += 1; return parse(...args); };
        fmt.__parseWrapped = true;
      }
    });
    const before = await page.evaluate(() => window.__writes);
    await page.keyboard.press("Control+s");
    await page.waitForFunction((count) => window.__writes > count, before, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    return page.evaluate((list) => ({
      attachmentDigests: window.__digests.filter((size) => list.includes(size)).length,
      allDigests: window.__digests.length,
      parses: window.__parses,
      writes: window.__writes,
    }), sizes);
  };
  const typeInto = async (page, text) => {
    await page.locator("#blocks .block-content", { hasText: text }).first().click();
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    await page.waitForTimeout(150);
  };
  // 試しの添付(中身は決まった並び。大きさで見分ける)
  const makeAttachments = (page, specs) => page.evaluate(async (list) => {
    const fmt = window.SingleHtmlFormat;
    const out = [];
    for (const spec of list) {
      let bytes;
      if (spec.png) {
        const canvas = document.createElement("canvas");
        canvas.width = spec.png[0];
        canvas.height = spec.png[1];
        const g = canvas.getContext("2d");
        for (let x = 0; x < canvas.width; x += 4) {
          g.fillStyle = "hsl(" + ((x * spec.png[2]) % 360) + ",70%,50%)";
          g.fillRect(x, 0, 4, canvas.height);
        }
        bytes = new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))).arrayBuffer());
      } else {
        bytes = new Uint8Array(spec.size);
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + spec.seed) % 251;
      }
      out.push(await fmt.fileToAttachment(new File([bytes], spec.name, { type: spec.mime }), spec.id));
    }
    return out;
  }, specs);

  const app = await newApp();
  try {
    // ---- #217 1) 保存の前の確かめは、確かめ済みの添付をハッシュし直さない。比べる元のために書いた HTML を読み直さない ----
    const files = await makeAttachments(app, [
      { id: "att-a", name: "a.bin", mime: "application/octet-stream", size: 3001, seed: 1 },
      { id: "att-b", name: "b.bin", mime: "application/octet-stream", size: 5003, seed: 2 },
      { id: "att-c", name: "c.bin", mime: "application/octet-stream", size: 7007, seed: 3 },
    ]);
    const sizes = [3001, 5003, 7007];
    const literal = { pages: [{ id: "H", title: "確かめ", blocks: [
      { id: "h1", type: "paragraph", text: "本文の一行目" },
      ...files.map((file, index) => ({ id: "f" + index, type: "attachment", attachmentId: file.id })),
      { id: "h2", type: "paragraph", text: "本文の二行目" },
    ] }], fonts: [], attachments: files };
    const html = await app.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal);
    await app.evaluate(() => { window.__digests.length = 0; });
    await openHtml(app, html, "確かめ");
    const atOpen = await app.evaluate((list) => window.__digests.filter((size) => list.includes(size)).length, sizes);
    await typeInto(app, "本文の一行目");
    const save1 = await saveCounting(app, sizes);
    await typeInto(app, "本文の二行目");
    const save2 = await saveCounting(app, sizes);
    // 新しく足した添付は、最初の保存で1回だけ確かめる(その次からは確かめない)
    await app.locator("#blocks .block-content", { hasText: "本文の二行目" }).first().click();
    await app.locator("#attach-input").setInputFiles({ name: "new.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(4099, 7) });
    await app.waitForTimeout(800);
    const save3 = await saveCounting(app, [...sizes, 4099]);
    const save3New = await app.evaluate(() => window.__digests.filter((size) => size === 4099).length);
    await typeInto(app, "本文の一行目");
    const save4 = await saveCounting(app, [...sizes, 4099]);
    const savedText = await app.evaluate(() => window.__file.text);
    result.attachHashOpenVerifiesAll = atOpen === 3;
    result.attachHashSaveSkipsVerified = save1.writes >= 1 && save1.attachmentDigests === 0 && save2.attachmentDigests === 0 && save4.attachmentDigests === 0;
    result.attachHashSaveVerifiesNewOnce = save3.attachmentDigests === 1 && save3New === 1;
    result.attachHashSaveNoReparse = save1.parses === 0 && save2.parses === 0 && save3.parses === 0 && save4.parses === 0;
    result.attachHashSavedFileComplete = savedText.includes("本文の一行目!!") && savedText.includes("本文の二行目!") && savedText.includes('"name": "new.bin"');
    result.attachHashSaveEvidence = { atOpen, save1, save2, save3, save3New, save4 };

    // ---- #217 2) 確かめの覚えがあっても、記録や中身が変われば食い違いになる(確かめは弱めない) ----
    result.attachHashVerifyStillStrict = await app.evaluate(async () => {
      const fmt = window.SingleHtmlFormat;
      const bytes = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
      const attachment = await fmt.fileToAttachment(new File([bytes], "x.bin"), "att-x");
      const doc = { attachments: [attachment] };
      const first = (await fmt.verifyDocument(doc)).ok;
      const upper = { ...attachment, sha256: attachment.sha256.toUpperCase() };
      const upperOk = (await fmt.verifyDocument({ attachments: [upper] })).ok;
      const wrongRecord = (await fmt.verifyDocument({ attachments: [{ ...attachment, sha256: "0".repeat(64) }] })).ok;
      const otherChunks = (await fmt.verifyDocument({ attachments: [{ ...attachment, chunks: [btoa("other")] }] })).ok;
      // 決まりに反して配列をその場で書き換えても、覚えは使わずに取り直す
      attachment.chunks.push(btoa("tail"));
      const mutated = (await fmt.verifyDocument(doc)).ok;
      return { first, upperOk, wrongRecord, otherChunks, mutated };
    });
    result.attachHashVerifyStrictOk = result.attachHashVerifyStillStrict.first && result.attachHashVerifyStillStrict.upperOk
      && !result.attachHashVerifyStillStrict.wrongRecord && !result.attachHashVerifyStillStrict.otherChunks && !result.attachHashVerifyStillStrict.mutated;

    // ---- #217 3) 比べる元(書いた manifest から作る)は、書いた HTML を開き直したものと同じ(機能見本で) ----
    result.attachHashBaselineSameAsReparse = await app.evaluate((text) => {
      const fmt = window.SingleHtmlFormat;
      if (typeof fmt.documentFromWrittenManifest !== "function") return { same: false, missing: "documentFromWrittenManifest" };
      const doc = fmt.parsePortableHtml(text);
      doc.suggestions = fmt.normalizeSuggestions([{ author: { name: "AI", kind: "ai" }, title: "提案", changes: [{ op: "setText", block: doc.pages[0].blocks[0].id, text: "書き換え" }] }]);
      let manifest = null;
      const html = fmt.buildPortableHtml(doc, { onManifest: (value) => { manifest = value; } });
      // app.js の fileContentOf と同じ取り出し(図の絵・表示用の写しは外す)
      const contentOf = (value) => JSON.stringify({
        pages: (value.pages || []).map((page) => ({ id: page.id, title: page.title, blocks: (page.blocks || []).map(({ mermaidSvg, chartSvg, derived, ...block }) => block) })),
        suggestions: (value.suggestions || []).map(({ id, ...rest }) => ({ ...rest, changes: rest.changes.map(({ id: changeId, ...change }) => change) })),
      });
      const reparsed = contentOf(fmt.parsePortableHtml(html));
      const fromManifest = contentOf(fmt.documentFromWrittenManifest(manifest));
      return { same: reparsed === fromManifest, length: reparsed.length, pages: doc.pages.length, blocks: doc.pages.reduce((sum, page) => sum + page.blocks.length, 0) };
    }, sample);
    result.attachHashBaselineSame = result.attachHashBaselineSameAsReparse.same && result.attachHashBaselineSameAsReparse.blocks > 20;
  } finally {
    await app.close();
  }

  // ---- #217 4) 機能見本を開いて保存したあと、外で1か所だけ書き換えると、取り込む書き換えは1か所(比べる元がファイルと同じ) ----
  const watch = await newApp();
  try {
    await openHtml(watch, sample, await watch.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text).pages[0].title, sample));
    const firstText = await watch.evaluate(() => window.SingleHtmlFormat.parsePortableHtml(window.__file.text).pages[0].blocks.find((block) => block.type === "paragraph" && block.text)?.text);
    await typeInto(watch, firstText.slice(0, 12));
    const saved = await saveCounting(watch, []);
    // 見本にもともとある提案の数(書き換えを取り込むと、ここから 1 増える)
    const pendingBefore = await watch.evaluate(() => (document.querySelector("#suggest-toggle")?.hidden ? 0 : Number((document.querySelector("#suggest-toggle")?.textContent || "").replace(/[^0-9]/g, "")) || 0));
    // ファイルの manifest の段落を1つだけ書き換える(AI が直接書き換えたのと同じ)
    await watch.evaluate(() => {
      const text = window.__file.text;
      const marker = 'id="document-manifest">';
      const start = text.indexOf(marker) + marker.length;
      const end = text.indexOf("</script>", start);
      const manifest = JSON.parse(text.slice(start, end));
      const block = manifest.pages[0].blocks.find((item) => item.type === "paragraph" && item.text);
      block.text += "(外で書き換え)";
      window.__file.text = text.slice(0, start) + JSON.stringify(manifest, null, 2).replace(/</g, "\\u003c") + text.slice(end);
      window.__file.lastModified += 1000;
    });
    await watch.evaluate(() => window.dispatchEvent(new Event("focus")));
    await watch.waitForTimeout(800);
    const seen = await watch.evaluate(() => ({
      toggle: document.querySelector("#suggest-toggle")?.hidden ? null : document.querySelector("#suggest-toggle")?.textContent,
      status: document.querySelector("#status")?.textContent || "",
      notice: document.querySelector("#notice")?.hidden === false ? document.querySelector("#notice")?.textContent : "",
    }));
    const message = seen.notice || seen.status;
    result.attachHashWatchAfterSaveExact = saved.parses === 0 && seen.toggle === "提案 " + (pendingBefore + 1) && message.includes("本文の書き換え 1 か所") && !message.includes("提案 ");
    result.attachHashWatchEvidence = { saved, pendingBefore, seen };
  } finally {
    await watch.close();
  }

  // ---- #219 保存HTMLのランタイム ----
  const maker = await newApp();
  let runtimeHtml = "";
  let specs = null;
  try {
    const made = await makeAttachments(maker, [
      { id: "img-a", name: "A.png", mime: "image/png", png: [96, 40, 7] },
      { id: "img-b", name: "B.png", mime: "image/png", png: [64, 30, 13] },
      { id: "img-c", name: "C.png", mime: "image/png", png: [120, 50, 3] },
      { id: "vid-v", name: "V.webm", mime: "video/webm", size: 9001, seed: 5 },
      { id: "pdf-p", name: "P.pdf", mime: "application/pdf", size: 11003, seed: 9 },
    ]);
    specs = Object.fromEntries(made.map((item) => [item.id, item.size]));
    const byId = Object.fromEntries(made.map((item) => [item.id, item]));
    // A の記録は大文字(Issue #111 の形。エディタは通す)。B の記録は中身と合わない(出してはいけない)
    byId["img-a"].sha256 = byId["img-a"].sha256.toUpperCase();
    byId["img-b"].sha256 = "0".repeat(64);
    const spacer = (prefix, count) => Array.from({ length: count }, (_, index) => ({ id: prefix + index, type: "paragraph", text: "間の段落 " + prefix + index }));
    const doc = { pages: [{ id: "R", title: "保存HTMLの添付", blocks: [
      { id: "r0", type: "paragraph", text: "画像 A を5か所で使う" },
      ...[1, 2, 3, 4, 5].map((n) => ({ id: "ia" + n, type: "attachment", attachmentId: "img-a", imageWidth: 20 })),
      { id: "ib", type: "attachment", attachmentId: "img-b", imageWidth: 20 },
      ...spacer("s", 90),
      { id: "iv", type: "attachment", attachmentId: "vid-v" },
      ...spacer("t", 90),
      { id: "ip", type: "attachment", attachmentId: "pdf-p" },
      ...spacer("u", 60),
      { id: "ic", type: "attachment", attachmentId: "img-c", imageWidth: 20 },
    ] }], fonts: [], attachments: made };
    runtimeHtml = await maker.evaluate((value) => window.SingleHtmlFormat.buildPortableHtml(value), doc);
  } finally {
    await maker.close();
  }
  const runtimePath = join(DOWNLOADS, "attach-hash-runtime.html");
  await writeFile(runtimePath, runtimeHtml, "utf8");
  const sizesDistinct = new Set(Object.values(specs)).size === 5;
  const viewer = await context.newPage();
  const viewerErrors = [];
  viewer.on("pageerror", (error) => viewerErrors.push(error.message));
  await viewer.setViewportSize({ width: 1280, height: 720 });
  await viewer.addInitScript(countDigests);
  // この環境で PDF をその場に出せるものとして試す(pdfSuite と同じ)
  await viewer.addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { get: () => true, configurable: true }));
  try {
    await viewer.goto("file:///" + runtimePath.replace(/\\/g, "/"));
    await viewer.waitForFunction(() => [...document.querySelectorAll('img[data-attachment-image="img-a"]')].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 5000 }).catch(() => {});
    await viewer.waitForTimeout(1200);
    const count = (id) => viewer.evaluate((size) => window.__digests.filter((value) => value === size).length, specs[id]);
    const atLoad = await viewer.evaluate(() => ({
      aShown: [...document.querySelectorAll('img[data-attachment-image="img-a"]')].map((image) => image.naturalWidth > 0),
      aSrcs: new Set([...document.querySelectorAll('img[data-attachment-image="img-a"]')].map((image) => image.src)).size,
      bShown: document.querySelector('img[data-attachment-image="img-b"]')?.naturalWidth > 0,
      bSrc: document.querySelector('img[data-attachment-image="img-b"]')?.getAttribute("src") || "",
      status: document.querySelector("#status")?.textContent || "",
      videoSrc: document.querySelector("video[data-attachment-video]")?.getAttribute("src") || "",
      pdfFrame: Boolean(document.querySelector("[data-attachment-pdf] iframe")),
    }));
    const digestsAtLoad = { a: await count("img-a"), b: await count("img-b"), v: await count("vid-v"), p: await count("pdf-p") };
    // 画面の外の画像も、手の空いたときに出る(紙に刷るときに抜けない)
    await viewer.waitForFunction(() => document.querySelector('img[data-attachment-image="img-c"]')?.naturalWidth > 0, null, { timeout: 6000 }).catch(() => {});
    const cFilled = await viewer.evaluate(() => document.querySelector('img[data-attachment-image="img-c"]')?.naturalWidth > 0);
    const beforeScroll = { v: await count("vid-v"), p: await count("pdf-p"), c: await count("img-c") };
    // 動画・PDF は画面に近づいたときに作る
    await viewer.evaluate(() => document.querySelector("video[data-attachment-video]")?.scrollIntoView({ block: "center" }));
    await viewer.waitForFunction(() => (document.querySelector("video[data-attachment-video]")?.getAttribute("src") || "").startsWith("blob:") || Boolean(document.querySelector(".video-unplayable")), null, { timeout: 5000 }).catch(() => {});
    const afterVideo = { v: await count("vid-v"), p: await count("pdf-p") };
    await viewer.evaluate(() => document.querySelector("[data-attachment-pdf]")?.scrollIntoView({ block: "center" }));
    await viewer.waitForFunction(() => Boolean(document.querySelector("[data-attachment-pdf] iframe")), null, { timeout: 5000 }).catch(() => {});
    const afterPdf = { v: await count("vid-v"), p: await count("pdf-p"), pdfFrame: await viewer.evaluate(() => (document.querySelector("[data-attachment-pdf] iframe")?.getAttribute("src") || "").startsWith("blob:")) };
    // 大文字の記録の添付も Download できる(確かめて渡す)
    await viewer.evaluate(() => window.scrollTo(0, 0));
    const downloadEvent = viewer.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await viewer.evaluate(() => document.querySelector('[data-download="img-a"]')?.click());
    const downloaded = await downloadEvent;
    await viewer.waitForTimeout(300);
    const downloadStatus = await viewer.evaluate(() => document.querySelector("#status")?.textContent || "");
    result.attachHashRuntimeSizesDistinct = sizesDistinct;
    result.attachHashRuntimeUppercaseShown = atLoad.aShown.length === 5 && atLoad.aShown.every(Boolean);
    result.attachHashRuntimeOneUrlPerId = atLoad.aSrcs === 1 && digestsAtLoad.a === 1;
    result.attachHashRuntimeMismatchHidden = !atLoad.bShown && !atLoad.bSrc && atLoad.status.includes("Hash mismatch: B.png") && digestsAtLoad.b === 1;
    result.attachHashRuntimeLazyMedia = digestsAtLoad.v === 0 && digestsAtLoad.p === 0 && !atLoad.videoSrc && !atLoad.pdfFrame && beforeScroll.v === 0 && beforeScroll.p === 0
      && afterVideo.v === 1 && afterVideo.p === 0 && afterPdf.v === 1 && afterPdf.p === 1 && afterPdf.pdfFrame;
    result.attachHashRuntimeImagesFilled = cFilled && beforeScroll.c === 1;
    result.attachHashRuntimeDownloadUppercase = Boolean(downloaded) && downloaded?.suggestedFilename() === "A.png" && downloadStatus.includes("SHA-256 verified");
    result.attachHashRuntimeSharedCode = runtimeHtml.includes("const sameDigest = function sameDigest") && runtimeHtml.includes("const verifyAttachment = async function verifyAttachment");
    result.attachHashRuntimeNoErrors = viewerErrors.length === 0;
    result.attachHashRuntimeEvidence = { specs, atLoad, digestsAtLoad, cFilled, beforeScroll, afterVideo, afterPdf, downloadStatus, viewerErrors: viewerErrors.slice(0, 3) };
  } finally {
    await viewer.close();
  }

  // ---- #220 印刷: 添付の中身を入れない・同じ画像は1回だけデコード・紙の見た目(本文と CSS)は保存HTMLと同じ ----
  const printer = await context.newPage();
  printer.on("dialog", (dialog) => dialog.accept());
  printer.on("pageerror", (error) => errors.push(error.message));
  await printer.setViewportSize({ width: 1280, height: 860 });
  await printer.addInitScript(countDigests);
  await printer.addInitScript(fakeHandle);
  await printer.addInitScript(() => {
    window.print = () => {
      const host = window.top;
      host.__printCalls = host.__printCalls || [];
      host.__printCalls.push({
        inFrame: window !== window.top,
        srcdoc: window.frameElement?.srcdoc || "",
        images: [...document.querySelectorAll("img[data-attachment-image]")].map((image) => ({ ok: image.complete && image.naturalWidth > 0, src: image.src })),
      });
    };
  });
  try {
    await printer.goto("http://127.0.0.1:" + PORT + "/");
    await printer.waitForSelector("#blocks .block-content");
    const made = await makeAttachments(printer, [
      { id: "img-p", name: "P.png", mime: "image/png", png: [80, 40, 11] },
      { id: "big-g", name: "G.bin", mime: "application/octet-stream", size: 200003, seed: 4 },
    ]);
    const doc = { pages: [{ id: "PR", title: "印刷の添付", blocks: [
      { id: "q0", type: "paragraph", text: "画像を3か所で使う" },
      ...[1, 2, 3].map((n) => ({ id: "qp" + n, type: "attachment", attachmentId: "img-p", imageWidth: 30 })),
      { id: "qg", type: "attachment", attachmentId: "big-g" },
      { id: "q9", type: "paragraph", text: "おわり" },
    ] }], fonts: [], attachments: made };
    const bigChunk = made[1].chunks[0].slice(0, 200);
    await openHtml(printer, await printer.evaluate((value) => window.SingleHtmlFormat.buildPortableHtml(value), doc), "印刷の添付");
    // 同じ文書の保存HTML(添付の中身入り)と比べる。違うのは添付の JSON の中身と manifest の作った時刻だけ
    // (先に保存する。印刷の後に保存すると、押したブロックの書式の控え(html)が保存の側にだけ入っていて、比べる文書が違った)
    await printer.locator("#blocks .block-content", { hasText: "おわり" }).click();
    await printer.keyboard.press("Control+s");
    await printer.waitForFunction(() => window.__writes >= 1, null, { timeout: 8000 }).catch(() => {});
    const savedHtml = await printer.evaluate(() => window.__file.text);
    await printer.evaluate(() => {
      window.__joins = 0;
      const fmt = window.SingleHtmlFormat;
      const join = fmt.joinChunks;
      fmt.joinChunks = (...args) => { window.__joins += 1; return join(...args); };
    });
    await printer.keyboard.press("Control+p");
    await printer.waitForFunction(() => (window.__printCalls || []).length >= 1, null, { timeout: 8000 }).catch(() => {});
    const call = await printer.evaluate(() => (window.__printCalls || [])[0] || null);
    const joins = await printer.evaluate(() => window.__joins);
    await printer.waitForTimeout(300);
    const normalize = (text) => text
      .replace(/<script>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/(<script type="application\/vnd\.single-html-doc\.attachments\+json" id="document-attachments">)[\s\S]*?(<\/script>)/, "$1$2")
      .replace(/"createdAt": "[^"]*"/, '"createdAt": ""');
    const attachmentsJson = (text) => {
      const match = /id="document-attachments">([\s\S]*?)<\/script>/.exec(text);
      return match ? JSON.parse(match[1]) : null;
    };
    const printedStore = attachmentsJson(call?.srcdoc || "");
    result.attachHashPrintNoPayload = Boolean(call?.inFrame) && !call.srcdoc.includes(bigChunk) && Array.isArray(printedStore?.attachments)
      && printedStore.attachments.length === 2 && printedStore.attachments.every((item) => !("chunks" in item)) && savedHtml.includes(bigChunk);
    result.attachHashPrintImagesOnce = call?.images.length === 3 && call.images.every((image) => image.ok) && new Set(call.images.map((image) => image.src)).size === 1 && joins === 1;
    result.attachHashPrintSameLook = Boolean(call?.srcdoc) && normalize(call.srcdoc) === normalize(savedHtml);
    const diffAt = (() => { const a = normalize(call?.srcdoc || ""); const b = normalize(savedHtml); let i = 0; while (i < a.length && a[i] === b[i]) i += 1; return i < Math.max(a.length, b.length) ? { at: i, print: a.slice(i - 80, i + 120), saved: b.slice(i - 80, i + 120) } : null; })();
    result.attachHashPrintEvidence = { diffAt, srcdocLength: call?.srcdoc.length, savedLength: savedHtml.length, joins, images: call?.images.map((image) => image.ok), sameLook: result.attachHashPrintSameLook };
  } finally {
    await printer.close();
  }

  result.attachHashNoPageErrors = errors.length === 0;
  result.attachHashErrors = errors.slice(0, 3).join(" | ");
  return result;
}
