// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 提案(v241。PR #79 のレビューで再現した不具合) ----
// 1. 提案中の段落と Backspace / Delete でつなぐと、差分の文字(消える側と増える側の両方)が本文に混ざった
// 2. 同じブロックを「消す」と「書き換える」を一緒に採用すると、例外で止まった(文書は途中まで変わった)
// 3. 「足す」提案のブロックが、開くときの直し(字下げ・id)を素通りし、保存HTMLの後ろの本文が消えた
// 4. 書式のある段落を文字の書き換えで採用すると、書式(太字・参照の印)が消えた
// 5. 同じ所に2つ足す提案を採用すると、順番が逆になった
// 6. 行き先の id を細工した提案の項目を押すと、例外で止まった
// あわせて: 提案・変更の id の重なり、同じ所への2つの提案をまとめて採用したとき(後の提案は当てずに残す)
// 2回目の確認(v242)で見つかったもの:
// A. 提案中の段落をブロックごと選んで太字・書式のクリアをすると、差分の文字が本文として保存された
// B. 提案の中でだけ使う添付が、開いて保存しただけで消えた(開くときの添付の id の付け直しも、提案のブロックへ届かなかった)
// C. 段落ごとの書き換え(html つき)で、見せる差分(text)と入る中身(html)が違っても採用できた。リンクの行き先も見えなかった
// D. 採用できるものが全部「当てられない」で終わっても、空の Undo の段と「未保存」の印が付いた
// E. insertedId をファイルで偽れた(採用していない変更にも残った)
// 3回目の確認(v243)で見つかったもの:
// F. 提案のパネルを開いたまま検索・置換を開くと、パネルが「すべて置換」の上に重なって押せなかった
// G. 提案中の段落で、検索の一致の色が別の文字に付いた(差分の増える側の文字まで数えていた。自分で見つけた)
export default async function suggestReviewSuite({ context }) {
  const fresh = await context.newPage();
  let dialogs = 0;
  fresh.on("dialog", (dialog) => {
    dialogs += 1;
    dialog.accept();
  });
  await fresh.setViewportSize({ width: 1440, height: 900 });
  const result = {};
  const errors = [];
  fresh.on("pageerror", (error) => errors.push(error.message));
  let saved = 0;
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const saveHtml = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "suggest-review-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return readFile(path, "utf8");
  };
  const manifestOf = (html) => fresh.evaluate((text) => JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent), html);
  const bodyTextOf = (html) => fresh.evaluate((text) => {
    const parsed = new DOMParser().parseFromString(text, "text/html");
    parsed.querySelectorAll("script, style").forEach((node) => node.remove());
    return parsed.body.textContent.replace(/\s+/g, " ");
  }, html);
  const blocksOf = (manifest) => manifest.pages[0].blocks;
  const paragraph = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const docWith = (title, blocks, suggestions) => ({ pages: [{ id: "R", title, blocks }], fonts: [], attachments: [], suggestions });
  const ai = { name: "Claude", kind: "ai" };
  const acceptAll = async () => {
    await fresh.locator("#suggest-pane .sg-section .sg-actions .sg-btn.ok").first().click();
    await fresh.waitForTimeout(300);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 提案中の段落へ Backspace でつなごうとしても、つながず、差分の文字は本文に入らない。Delete(前の段落の末尾)も同じ
    await openLiteral(docWith("つなぐ", [paragraph("p0", "HEAD"), paragraph("p1", "temp 25C"), paragraph("p2", "NEXT")],
      [{ author: ai, title: "t", changes: [{ op: "setText", block: "p1", text: "temp 23C" }] }]), "review-merge.html");
    await fresh.locator('.block-content[data-id="p2"]').click();
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(250);
    await fresh.locator('.block-content[data-id="p0"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(250);
    const mergeStatus = await fresh.locator("#status").textContent();
    const merged = blocksOf(await manifestOf(await saveHtml()));
    result.suggestReviewMergeKeepsDiffOut = merged.map((block) => block.id + "=" + block.text).join(",") === "p0=HEAD,p1=temp 25C,p2=NEXT"
      && merged.every((block) => !/23C/.test(block.html || "")) && !merged.find((block) => block.id === "p1").html && mergeStatus.includes("提案");
    result.suggestReviewMergeEvidence = { blocks: merged.map((block) => [block.id, block.text, block.html || ""]), status: mergeStatus };

    // 2) 同じブロックを消す・書き換えるを一緒に採用しても止まらない。ブロックは消え、Undo 1回で元に戻る
    const errorsBefore = errors.length;
    await openLiteral(docWith("消す書き換え", [paragraph("p1", "ONE"), paragraph("p2", "TWO")],
      [{ author: ai, title: "t", changes: [{ op: "deleteBlock", block: "p1" }, { op: "setText", block: "p1", text: "ONE!" }] }]), "review-delete-set.html");
    await acceptAll();
    const afterBoth = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.id + "=" + row.querySelector(".block-content")?.textContent).join(","));
    const bothManifest = await manifestOf(await saveHtml());
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undoneBoth = await fresh.evaluate(() => ({
      rows: [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.id).join(","),
      toggle: document.querySelector("#suggest-toggle")?.textContent,
    }));
    result.suggestReviewDeleteAndSetTogether = errors.length === errorsBefore && afterBoth === "p2=TWO"
      && bothManifest.suggestions[0].changes.every((change) => change.result === "accepted")
      && undoneBoth.rows === "p1,p2" && undoneBoth.toggle === "提案 2";
    result.suggestReviewDeleteAndSetEvidence = { afterBoth, results: bothManifest.suggestions[0].changes.map((change) => change.result), undoneBoth, errors: errors.slice(errorsBefore).join(" | ") };

    // 3) 足すブロックも開くときに直す(字下げ -5 → なし)。採用して保存しても、後ろの本文が消えない
    await openLiteral(docWith("足す直し", [paragraph("p1", "ONE"), paragraph("p2", "TWO"), paragraph("p3", "THREE")],
      [{ author: ai, title: "t", changes: [{ op: "insertBlock", after: "p1", item: { type: "paragraph", text: "INSERTED", indent: -5, columnIndex: "x\"]" } }] }]), "review-insert-sanitize.html");
    await acceptAll();
    const insertedHtml = await saveHtml();
    const insertedBlocks = blocksOf(await manifestOf(insertedHtml));
    const insertedBody = await bodyTextOf(insertedHtml);
    const inserted = insertedBlocks.find((block) => block.text === "INSERTED");
    result.suggestReviewInsertIsSanitized = Boolean(inserted) && inserted.indent === undefined && inserted.columnIndex === undefined
      && insertedBlocks.map((block) => block.text).join(",") === "ONE,INSERTED,TWO,THREE"
      && ["ONE", "INSERTED", "TWO", "THREE"].every((word) => insertedBody.includes(word));
    result.suggestReviewInsertEvidence = { inserted, body: insertedBody.slice(0, 200) };

    // 4) 書式のある段落を文字の書き換えで採用しても、書式(太字)と参照の印は残る
    await openLiteral(docWith("書式", [
      paragraph("p1", "BOLD word here", { html: "<b>BOLD</b> word here" }),
      { id: "t1", type: "table", caption: "表の題", rows: [[{ text: "a" }]] },
      paragraph("p2", "see 表1 now", { html: 'see <span class="figure-ref" data-ref="t1">表1</span> now' }),
    ], [{ author: ai, title: "t", changes: [
      { op: "setText", block: "p1", text: "BOLD word here!" },
      { op: "setText", block: "p2", text: "see 表1 later" },
    ] }]), "review-format.html");
    const formatLeaves = await fresh.evaluate(() => [...document.querySelectorAll("#suggest-pane .sg-node .sg-label")].map((node) => node.textContent));
    await acceptAll();
    const formatted = blocksOf(await manifestOf(await saveHtml()));
    const p1 = formatted.find((block) => block.id === "p1");
    const p2 = formatted.find((block) => block.id === "p2");
    result.suggestReviewFormattingKept = p1.text === "BOLD word here!" && /<b>BOLD<\/b> word here!$/.test(p1.html)
      && p2.text === "see 表1 later" && /data-ref="t1"/.test(p2.html) && /later$/.test(p2.html);
    result.suggestReviewFormattingEvidence = { p1, p2, formatLeaves };

    // 5) 同じ所に2つ足す提案は、見えている順(A, B)で入る。後ろ(B)を先に採用しても同じ
    const twoInserts = () => docWith("2つ足す", [paragraph("p1", "ONE"), paragraph("p2", "TWO")],
      [{ author: ai, title: "t", changes: [
        { op: "insertBlock", after: "p1", item: { type: "paragraph", text: "A" } },
        { op: "insertBlock", after: "p1", item: { type: "paragraph", text: "B" } },
      ] }]);
    const rowTexts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => row.querySelector(".block-content")?.textContent).join(","));
    await openLiteral(twoInserts(), "review-two-inserts.html");
    const ghostOrder = await rowTexts();
    await acceptAll();
    const allOrder = await rowTexts();
    await openLiteral(twoInserts(), "review-two-inserts-b.html");
    await fresh.locator(".block.sg-block-ins", { hasText: "B" }).hover();
    await fresh.waitForTimeout(150);
    await fresh.locator(".sg-popup .sg-btn.ok").click();
    await fresh.waitForTimeout(300);
    const afterB = await rowTexts();
    await fresh.locator(".block.sg-block-ins", { hasText: "A" }).hover();
    await fresh.waitForTimeout(150);
    await fresh.locator(".sg-popup .sg-btn.ok").click();
    await fresh.waitForTimeout(300);
    const afterBA = await rowTexts();
    result.suggestReviewInsertOrderKept = ghostOrder === "ONE,A,B,TWO" && allOrder === "ONE,A,B,TWO" && afterB === "ONE,A,B,TWO" && afterBA === "ONE,A,B,TWO";
    result.suggestReviewInsertOrderEvidence = { ghostOrder, allOrder, afterB, afterBA };

    // 6) 行き先の id を細工した変更は受けない(ほかの変更は受ける)。項目を押しても止まらない
    const errorsBeforeHostile = errors.length;
    await openLiteral(docWith("細工", [paragraph("p1", "ONE")], [{ author: ai, title: "t", changes: [
      { op: "setText", block: 'x"]', text: "bad" },
      { op: "insertBlock", after: 'p1"],[data-id="p1', item: { type: "paragraph", text: "bad" } },
      { op: "setText", block: "p1", text: "ONE!" },
      { op: "insertBlock", after: "p1", insertedId: "p1", item: { type: "paragraph", text: "forged" } },
    ] }]), "review-hostile-id.html");
    const labels = fresh.locator("#suggest-pane .sg-node .sg-label");
    for (let index = 0; index < await labels.count(); index += 1) await labels.nth(index).click();
    await fresh.waitForTimeout(200);
    const hostileManifest = await manifestOf(await saveHtml());
    result.suggestReviewHostileTargetDropped = errors.length === errorsBeforeHostile
      && hostileManifest.suggestions[0].changes.length === 2 && hostileManifest.suggestions[0].changes[0].block === "p1";
    // E. 採用していない追加の insertedId は受けない(足す位置の決め方に使うので、ファイルで偽れないように)
    result.suggestReviewForgedInsertedIdDropped = hostileManifest.suggestions[0].changes[1]?.op === "insertBlock"
      && !("insertedId" in hostileManifest.suggestions[0].changes[1]);

    // 7) 提案・変更の id が重なっていても、別々に見えて別々に決められる
    await openLiteral({ pages: [{ id: "R", title: "重なり", blocks: [{ id: "t1", type: "table", rows: [[{ text: "a" }, { text: "b" }, { text: "c" }]] }] }], fonts: [], attachments: [], suggestions: [
      { id: "same", author: ai, title: "t1", changes: [{ id: "dup", op: "setCell", block: "t1", row: 0, col: 0, text: "A" }, { id: "dup", op: "setCell", block: "t1", row: 0, col: 1, text: "B" }] },
      { id: "same", author: ai, title: "t2", changes: [{ id: "dup", op: "setCell", block: "t1", row: 0, col: 2, text: "C" }] },
    ] }, "review-duplicate-ids.html");
    const duplicateToggle = await fresh.evaluate(() => document.querySelector("#suggest-toggle")?.textContent);
    await fresh.locator('.editor-table [data-row="0"][data-cell="1"]').hover();
    await fresh.waitForTimeout(150);
    await fresh.locator(".sg-popup .sg-btn.ok").click();
    await fresh.waitForTimeout(300);
    const duplicateCells = await fresh.evaluate(() => [...document.querySelectorAll(".editor-table td")].map((td) => (td.classList.contains("sg-cell") ? "?" : "") + td.textContent).join("|"));
    const duplicateManifest = await manifestOf(await saveHtml());
    const ids = duplicateManifest.suggestions.flatMap((suggestion) => [suggestion.id, ...suggestion.changes.map((change) => change.id)]);
    result.suggestReviewDuplicateIdsSeparated = duplicateToggle === "提案 3" && duplicateCells === "?aA|B|?cC" && new Set(ids).size === ids.length;
    result.suggestReviewDuplicateEvidence = { duplicateToggle, duplicateCells, ids };

    // 8) 同じセルへの2つの提案を「すべて採用」: 先の提案が入り、後の提案は元が変わったので当てずに残す(黙って上書きしない)
    await openLiteral({ pages: [{ id: "R", title: "同じセル", blocks: [{ id: "t1", type: "table", rows: [[{ text: "a" }]] }] }], fonts: [], attachments: [], suggestions: [
      { author: ai, title: "first", changes: [{ op: "setCell", block: "t1", row: 0, col: 0, text: "A" }] },
      { author: { name: "佐藤", kind: "human" }, title: "second", changes: [{ op: "setCell", block: "t1", row: 0, col: 0, text: "Z" }] },
    ] }, "review-same-cell.html");
    await fresh.locator("#suggest-pane .sg-btn.ok", { hasText: "すべて採用" }).click();
    await fresh.waitForTimeout(300);
    const sameCellStatus = await fresh.locator("#status").textContent();
    const sameCellManifest = await manifestOf(await saveHtml());
    result.suggestReviewSecondOnSameCellNotApplied = sameCellManifest.pages[0].blocks[0].rows[0][0].text === "A"
      && sameCellManifest.suggestions[0].changes[0].result === "accepted" && sameCellManifest.suggestions[1].changes[0].result === undefined
      && sameCellStatus.includes("採用できなかった 1 か所");
    result.suggestReviewSameCellEvidence = { cell: sameCellManifest.pages[0].blocks[0].rows[0][0], results: sameCellManifest.suggestions.map((suggestion) => suggestion.changes[0].result ?? null), status: sameCellStatus };

    // A. 提案中の段落をブロックごと選んで太字・書式のクリアをしても、差分の文字は本文に入らない(提案はそのまま残る)
    await openLiteral(docWith("ブロックの書式", [paragraph("p1", "temp 25C"), paragraph("p2", "NEXT")],
      [{ author: ai, title: "t", changes: [{ op: "setText", block: "p1", text: "temp 23C" }] }]), "review-block-format.html");
    const selectByGrip = async (blockId) => {
      const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
      await row.hover();
      await row.locator(".drag-grip").click();
      await fresh.waitForTimeout(150);
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(100);
    };
    await selectByGrip("p1");
    await fresh.keyboard.press("Control+b");
    await fresh.waitForTimeout(200);
    await selectByGrip("p1");
    await fresh.locator("#format-reset").click();
    await fresh.waitForTimeout(200);
    const blockFormat = blocksOf(await manifestOf(await saveHtml()));
    const heldText = await fresh.evaluate(() => document.querySelectorAll('.block[data-id="p1"] .sg-ins').length);
    result.suggestReviewBlockFormatSkipsDiff = blockFormat[0].text === "temp 25C" && !blockFormat[0].html && heldText === 1;
    result.suggestReviewBlockFormatEvidence = { p1: blockFormat[0], heldText };

    // B. 提案の中でだけ使う添付は、開いて保存しても残る。開くときに付け直した添付の id も、提案のブロックへ届く
    const attachmentPath = join(OUT, "review-attachment.html");
    await writeFile(attachmentPath, await fresh.evaluate(async () => {
      const fmt = window.SingleHtmlFormat;
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 20;
      canvas.getContext("2d").fillRect(0, 0, 40, 20);
      const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const safe = await fmt.fileToAttachment(new File([png], "sg.png", { type: "image/png" }), "att-sg");
      const unsafe = await fmt.fileToAttachment(new File([png], "sg2.png", { type: "image/png" }), "att bad");
      return fmt.buildPortableHtml({ pages: [{ id: "R", title: "添付の提案", blocks: [{ id: "p1", type: "paragraph", text: "ONE" }, { id: "p2", type: "paragraph", text: "TWO" }] }],
        fonts: [], attachments: [safe, unsafe], suggestions: [{ author: { name: "Claude", kind: "ai" }, title: "t", changes: [
          { op: "insertBlock", after: "p1", item: { type: "attachment", attachmentId: "att-sg" } },
          { op: "insertBlock", after: "p2", item: { type: "attachment", attachmentId: "att bad" } },
        ] }] });
    }), "utf8");
    {
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(attachmentPath);
      await fresh.waitForTimeout(700);
    }
    const ghostImages = await fresh.evaluate(() => [...document.querySelectorAll(".block.sg-block-ins img")].map((img) => img.naturalWidth));
    const keptManifest = await manifestOf(await saveHtml());
    const keptIds = keptManifest.attachments.map((attachment) => attachment.id);
    const itemIds = keptManifest.suggestions[0].changes.map((change) => change.item.attachmentId);
    await acceptAll();
    const acceptedManifest = await manifestOf(await saveHtml());
    const acceptedRefs = blocksOf(acceptedManifest).filter((block) => block.type === "attachment").map((block) => block.attachmentId);
    result.suggestReviewSuggestionAttachmentsKept = ghostImages.length === 2 && ghostImages.every((width) => width > 0)
      && keptIds.length === 2 && itemIds.every((value) => keptIds.includes(value))
      && acceptedRefs.length === 2 && acceptedRefs.every((value) => acceptedManifest.attachments.some((attachment) => attachment.id === value));
    result.suggestReviewAttachmentEvidence = { ghostImages, keptIds, itemIds, acceptedRefs };

    // C. 段落ごとの書き換え(html つき)は、html の文字が text と合うときだけ採用できる。新しい側は書式・リンクの行き先ごと見せる
    await openLiteral(docWith("段落ごと", [
      paragraph("p1", "Price 100 yen", { html: "Price <b>100</b> yen" }),
      paragraph("p2", "Fee 5 yen", { html: "Fee <b>5</b> yen" }),
    ], [{ author: ai, title: "t", changes: [
      { op: "setText", block: "p1", text: "Price 100 yen.", html: 'Price <b>999</b> yen. <a href="https://example.com/">click</a>' },
      { op: "setText", block: "p2", text: "Fee 5 yen. click", html: 'Fee <b>5</b> yen. <a href="https://example.com/">click</a>' },
    ] }]), "review-whole.html");
    const wholeView = await fresh.evaluate(() => ({
      counts: [...document.querySelectorAll("#suggest-pane .sg-count")].map((node) => node.textContent),
      p1Decorated: Boolean(document.querySelector('.block[data-id="p1"] .sg-text')),
      p2Bold: Boolean(document.querySelector('.block[data-id="p2"] .sg-ins b')),
      p2Href: document.querySelector('.block[data-id="p2"] .sg-ins .sg-href')?.textContent || "",
      anchors: document.querySelectorAll(".sg-text a").length,
    }));
    await acceptAll();
    const whole = blocksOf(await manifestOf(await saveHtml()));
    result.suggestReviewWholeHtmlMustMatchText = wholeView.counts.includes("中身が合わない") && !wholeView.p1Decorated
      && wholeView.p2Bold && wholeView.p2Href.includes("https://example.com/") && wholeView.anchors === 0
      && whole[0].text === "Price 100 yen" && whole[0].html === "Price <b>100</b> yen"
      && whole[1].text === "Fee 5 yen. click" && /<b>5<\/b>/.test(whole[1].html) && /href="https:\/\/example\.com\/"/.test(whole[1].html);
    result.suggestReviewWholeEvidence = { wholeView, whole };

    // D. 採用できるものが全部当てられずに終わったら、Undo の段も「未保存」の印も付けない(開き直すときに確かめが出ない)
    await openLiteral(docWith("当てられない", [
      { id: "t1", type: "table", caption: "表の題", rows: [[{ text: "a" }]] },
      paragraph("p1", "see 表1 now", { html: 'see <span class="figure-ref" data-ref="t1">表1</span> now' }),
    ], [{ author: ai, title: "t", changes: [{ op: "setText", block: "p1", text: "see 表2 now" }] }]), "review-noop.html");
    await acceptAll();
    const noopStatus = await fresh.locator("#status").textContent();
    const dialogsBefore = dialogs;
    await openLiteral(docWith("次の文書", [paragraph("p1", "x")], []), "review-next.html");
    result.suggestReviewNoopLeavesNoUndoOrDirty = noopStatus.includes("採用できなかった 1 か所") && dialogs === dialogsBefore;
    result.suggestReviewNoopEvidence = { noopStatus, dialogs: dialogs - dialogsBefore };

    // F. 提案のパネルを開いたまま検索・置換を開いても「すべて置換」が押せる(パネルは検索バーの下から始まり、閉じると元の高さへ戻る)
    await openLiteral(docWith("検索", [paragraph("p1", "temp 25C"), paragraph("p2", "temp NEXT")],
      [{ author: ai, title: "t", changes: [{ op: "setText", block: "p1", text: "temp 23C" }] }]), "review-search.html");
    const paneTopBefore = await fresh.evaluate(() => document.querySelector("#suggest-pane").getBoundingClientRect().top);
    await fresh.locator('.block-content[data-id="p2"]').click();
    await fresh.keyboard.press("Control+f");
    await fresh.locator("#search-input").fill("temp");
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-replace-input").fill("TEMP");
    await fresh.waitForTimeout(300);
    const searchLayout = await fresh.evaluate(() => {
      const button = document.querySelector("#search-replace-all").getBoundingClientRect();
      const hit = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
      return { onButton: Boolean(hit?.closest("#search-replace-all")), hit: hit?.className || hit?.id || null,
        paneTop: document.querySelector("#suggest-pane").getBoundingClientRect().top, barBottom: document.querySelector("#search-bar").getBoundingClientRect().bottom };
    });
    await fresh.locator("#search-replace-all").click({ timeout: 3000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    const replacedText = await fresh.evaluate(() => document.querySelector('.block-content[data-id="p2"]')?.textContent);
    await fresh.locator("#search-input").focus();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(300);
    const paneTopAfter = await fresh.evaluate(() => ({ hidden: document.querySelector("#search-bar").hidden, top: document.querySelector("#suggest-pane").getBoundingClientRect().top }));
    result.suggestReviewPaneLeavesSearchBarFree = searchLayout.onButton && searchLayout.paneTop >= searchLayout.barBottom
      && replacedText === "TEMP NEXT" && paneTopAfter.hidden && paneTopAfter.top === paneTopBefore;
    result.suggestReviewSearchEvidence = { paneTopBefore, searchLayout, replacedText, paneTopAfter };

    // G. 提案中の段落でも、検索の一致の色は一致した文字に付く(差分の増える側は本文ではないので数えない)
    await openLiteral(docWith("検索の色", [paragraph("p1", "AA 25C ok")],
      [{ author: ai, title: "t", changes: [{ op: "setText", block: "p1", text: "AA 23C ok" }] }]), "review-search-paint.html");
    await fresh.locator("#search-input").focus().catch(() => {});
    await fresh.keyboard.press("Control+f");
    await fresh.locator("#search-input").fill("ok");
    await fresh.waitForTimeout(300);
    const painted = await fresh.evaluate(() => ["doc-search-match", "doc-search-current"].flatMap((name) => [...(CSS.highlights.get(name) || [])].map((range) => range.toString())));
    await fresh.locator("#search-input").focus();
    await fresh.keyboard.press("Escape");
    result.suggestReviewSearchPaintsMatchedText = painted.length === 1 && painted[0] === "ok";
    result.suggestReviewSearchPaintEvidence = painted.join("|");

    result.suggestReviewNoPageErrors = errors.length === 0;
    result.suggestReviewErrors = errors.slice(0, 3).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
