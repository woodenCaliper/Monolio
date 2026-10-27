// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FONT_FAMILY, FONT_FIXTURE, OUT, PORT, insertBlock, openMenu, pickFont, sha256 } from "../lib.mjs";

// ---- Undo の履歴が添付の中身を写さない(v221) ----
// v218 までは編集のまとまりごとに文書全体(添付の base64 込み)を JSON で複製し、文字列とオブジェクトの両方で
// 持っていた。20MB の添付で1手 +53〜84MB 増え、40手ほどでタブが落ちた(Target crashed)。区切りの最初の打鍵も
// 200〜900ms、Undo も 500ms 前後止まった。いまは控えを JSON の部品で持ち、ブロックは変わらなければ使い回し、
// 添付の中身は参照で持つ(写さない)。
// A) 20MB の添付がある文書で 30 手編集しても落ちず、1手あたりのヒープの増え方が小さい。打鍵と Undo が止まらない。
// B) 添付を消してから(GC を挟んで)Undo すると、添付が中身ごと戻る(保存ファイルの中身が元と同じバイト)。
// C) 埋め込みフォントを消してから Undo すると、フォントが中身ごと戻る(保存ファイルのフォントが元と同じバイト)。
export default async function undoMemorySuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const cdp = await context.newCDPSession(fresh);
    const heapMB = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      const usage = await cdp.send("Runtime.getHeapUsage");
      return usage.usedSize / 1048576;
    };
    const openLiteral = async (blocks) => {
      const literal = { title: "UndoMemory", fonts: [], attachments: [], pages: [{ id: "UM", title: "UndoMemory", blocks }] };
      const source = join(OUT, "undo-memory-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((id) => document.querySelector(`#blocks .block-content[data-id="${id}"]`), blocks[0].id, { timeout: 5000 });
      await fresh.waitForTimeout(300);
    };
    // ページの中で作った乱数のファイルを、先頭のブロックへドロップして添付する。元の中身の SHA-256 を返す。
    const dropRandomFile = async (megabytes, name) => {
      const digest = await fresh.evaluate(async ([megabytes, name]) => {
        const bytes = new Uint8Array(Math.round(megabytes * 1048576));
        for (let offset = 0; offset < bytes.length; offset += 65536) crypto.getRandomValues(bytes.subarray(offset, Math.min(bytes.length, offset + 65536)));
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        document.querySelector("#status").textContent = "";
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], name, { type: "application/octet-stream" }));
        const target = document.querySelector("#blocks .block-content");
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 5, clientY: rect.bottom - 1 }));
        return hash;
      }, [megabytes, name]);
      await fresh.waitForFunction(() => /attached/.test(document.querySelector("#status").textContent), null, { timeout: 60000 });
      await fresh.waitForTimeout(200);
      return digest;
    };
    const typeAtEnd = async (blockId, text) => {
      await fresh.locator(`#blocks .block-content[data-id="${blockId}"]`).click();
      await fresh.keyboard.press("End");
      await fresh.keyboard.type(text);
    };
    const blockText = (blockId) => fresh.evaluate((id) => document.querySelector(`#blocks .block-content[data-id="${id}"]`)?.textContent ?? null, blockId);
    // 保存して読み直した文書(添付は中身を合わせた SHA-256 も付ける)
    const savedDocument = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "undo-memory-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      await fresh.waitForTimeout(150);
      return fresh.evaluate(async (text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        const attachments = [];
        for (const attachment of doc.attachments || []) {
          const bytes = window.SingleHtmlFormat.joinChunks(attachment);
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
          attachments.push({ id: attachment.id, name: attachment.name, size: bytes.length, hash });
        }
        return { attachments, fonts: (doc.fonts || []).map((font) => ({ family: font.family, attachmentId: font.attachmentId })), blockTypes: doc.pages[0].blocks.map((block) => block.type) };
      }, html);
    };
    const attachmentBlockId = () => fresh.evaluate(() => document.querySelector("#blocks .attachment-download")?.closest(".block")?.dataset.id ?? null);

    // ---- A) 大きな添付があっても、履歴の1手が軽い ----
    await openLiteral([{ id: "m1", type: "paragraph", text: "one" }, { id: "m2", type: "paragraph", text: "two" }]);
    await fresh.locator('#blocks .block-content[data-id="m1"]').click();
    await dropRandomFile(20, "big.bin");
    const heapBefore = await heapMB();
    const STEPS = 30;
    // 2つのブロックへ交互に打つ(ブロックが替わるたびに履歴のまとまりが切れて1手になる)
    for (let step = 0; step < STEPS; step += 1) await typeAtEnd(step % 2 ? "m2" : "m1", "x");
    const heapAfter = await heapMB();
    const perStepMB = (heapAfter - heapBefore) / STEPS;
    result.bigAttachmentHistoryPerStepSmall = perStepMB < 2;
    // 区切りの最初の打鍵(ここで履歴を積む)が止まらない: keydown から次のフレームまで
    await fresh.evaluate(() => {
      window.__undoMemoryLatency = [];
      window.addEventListener("keydown", () => {
        const started = performance.now();
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => window.__undoMemoryLatency.push(performance.now() - started);
          channel.port2.postMessage(0);
        });
      }, true);
    });
    const firstKeyMs = [];
    for (let step = 0; step < 6; step += 1) {
      await fresh.locator(`#blocks .block-content[data-id="${step % 2 ? "m2" : "m1"}"]`).click();
      await fresh.keyboard.press("End");
      await fresh.evaluate(() => { window.__undoMemoryLatency = []; });
      await fresh.keyboard.press("z");
      await fresh.waitForTimeout(150);
      firstKeyMs.push(await fresh.evaluate(() => window.__undoMemoryLatency[0] ?? 9999));
    }
    firstKeyMs.sort((a, b) => a - b);
    const firstKeyMedian = firstKeyMs[Math.floor(firstKeyMs.length / 2)];
    // v218 は中央値 150〜350ms。いまは 15ms 前後。緩めに 100ms
    result.bigAttachmentFirstKeyFast = firstKeyMedian < 100;
    // Undo が止まらず、1手ずつ正しく戻る(最後の6手の z が消え、その前の x は残る)
    const undoMs = [];
    for (let step = 0; step < 6; step += 1) {
      await fresh.evaluate(() => { window.__undoMemoryLatency = []; });
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(150);
      undoMs.push(await fresh.evaluate(() => window.__undoMemoryLatency[0] ?? 9999));
    }
    // 最も遅い1回で見る(v218 は 250〜800ms。いまは 20ms 前後。緩めに 300ms)
    const undoSlowest = Math.max(...undoMs);
    const afterUndo = [await blockText("m1"), await blockText("m2")];
    result.bigAttachmentUndoFastAndCorrect = undoSlowest < 300
      && afterUndo[0] === "one" + "x".repeat(STEPS / 2) && afterUndo[1] === "two" + "x".repeat(STEPS / 2);
    result.bigAttachmentEvidence = { heapBefore: Math.round(heapBefore * 10) / 10, heapAfter: Math.round(heapAfter * 10) / 10, perStepMB: Math.round(perStepMB * 100) / 100, firstKeyMs: firstKeyMs.map(Math.round), undoMs: undoMs.map(Math.round), afterUndo };

    // ---- B) 添付を消して Undo すると、中身ごと戻る ----
    await openLiteral([{ id: "d1", type: "paragraph", text: "alpha" }, { id: "d2", type: "paragraph", text: "beta" }]);
    await fresh.locator('#blocks .block-content[data-id="d1"]').click();
    const originalHash = await dropRandomFile(1, "keep.bin");
    const withAttachment = await savedDocument();
    const attachmentId = await attachmentBlockId();
    await fresh.locator(`#blocks .block[data-id="${attachmentId}"] .drag-grip`).click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#block-menu .menu-item[data-action="delete"]').click();
    await fresh.waitForTimeout(250);
    // 消したあとに別の編集を2手積み、GC をかける(履歴だけが中身を持っている状態にする)
    await typeAtEnd("d1", "!");
    await typeAtEnd("d2", "?");
    await heapMB();
    const deleted = await savedDocument();
    for (let step = 0; step < 3; step += 1) {
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(200);
    }
    const restored = await savedDocument();
    // やり直し → 取り消しでも同じ中身
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(200);
    const redone = await savedDocument();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const restoredAgain = await savedDocument();
    const sameBytes = (doc) => doc.attachments.length === 1 && doc.attachments[0].hash === originalHash
      && doc.attachments[0].size === 1048576 && doc.attachments[0].name === "keep.bin" && doc.blockTypes.includes("attachment");
    result.undoAttachmentDeleteRestoresBytes = sameBytes(withAttachment) && deleted.attachments.length === 0
      && sameBytes(restored) && redone.attachments.length === 0 && sameBytes(restoredAgain);
    result.undoAttachmentEvidence = {
      withAttachment: withAttachment.attachments, deleted: deleted.attachments.length, restored: restored.attachments,
      redone: redone.attachments.length, restoredAgain: restoredAgain.attachments, originalHash,
    };

    // ---- C) 埋め込みフォントを消して Undo すると、中身ごと戻る ----
    const fontHash = sha256(await readFile(FONT_FIXTURE));
    await openLiteral([{ id: "f1", type: "paragraph", text: "font host" }]);
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "files");
    await fresh.locator("#embed-font").click();
    await (await chooser).setFiles(FONT_FIXTURE);
    await fresh.waitForFunction((family) => [...document.fonts].some((face) => face.family === family), FONT_FAMILY, { timeout: 5000 }).catch(() => {});
    await fresh.keyboard.press("Escape");
    await fresh.locator('#blocks .block-content[data-id="f1"]').click();
    await insertBlock(fresh);
    await fresh.keyboard.type("undo font sample");
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("undo font sample"));
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await pickFont(fresh, FONT_FAMILY);
    await fresh.waitForTimeout(150);
    await fresh.locator('#blocks .block-content[data-id="f1"]').click();
    const fontBefore = await savedDocument();
    await openMenu(fresh, "files");
    await fresh.locator(`#attachment-summary .attachment-remove[data-font-family="${FONT_FAMILY}"]`).click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Escape");
    await typeAtEnd("f1", "!");
    await heapMB();
    const fontDeleted = await savedDocument();
    for (let step = 0; step < 2; step += 1) {
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(200);
    }
    await fresh.waitForFunction((family) => [...document.fonts].some((face) => face.family === family), FONT_FAMILY, { timeout: 5000 }).catch(() => {});
    const fontRegistered = await fresh.evaluate((family) => [...document.fonts].some((face) => face.family === family), FONT_FAMILY);
    const fontRestored = await savedDocument();
    const fontBytesOk = (doc) => {
      const font = doc.fonts.find((item) => item.family === FONT_FAMILY);
      const attachment = font && doc.attachments.find((item) => item.id === font.attachmentId);
      return Boolean(attachment) && attachment.hash === fontHash;
    };
    result.undoFontDeleteRestoresBytes = fontBytesOk(fontBefore) && !fontDeleted.fonts.length && fontRegistered && fontBytesOk(fontRestored);
    result.undoFontEvidence = { before: fontBefore.fonts, deleted: fontDeleted.fonts, restored: fontRestored.fonts, fontRegistered, fontHash, attachments: fontRestored.attachments };
    return result;
  } finally {
    await fresh.close();
  }
}
