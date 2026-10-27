// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- ブロックのコピー・切り取り・貼り付けと、矩形選択のスクロール(v147) ----
// 矩形選択(余白からドラッグ)で選んだブロックを Ctrl+C → 別の場所で Ctrl+V すると**ブロックとして**貼り付く。
// 矩形選択の開始点は文書の座標で持ち(スクロールしてもずれない)、端では自動でスクロールする。
export default async function blockClipboardSuite({ context, browser }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 720 });
  const result = {};
  const para = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const openLiteral = async (page, literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await page.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = page.waitForEvent("filechooser");
    await openMenu(page, "file");
    await page.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await page.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  const saveAndParse = async (page, name) => {
    const download = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    const path = join(DOWNLOADS, name);
    await (await download).saveAs(path);
    return page.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), await readFile(path, "utf8"));
  };
  const rowBox = (page, text) => page.evaluate((needle) => {
    const row = [...document.querySelectorAll("#blocks .block")].find((item) => item.textContent.includes(needle));
    const rect = row?.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, bottom: rect.bottom, right: rect.right } : null;
  }, text);
  const selectedTexts = (page) => page.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")]
    .map((row) => row.querySelector(".block-content")?.textContent || row.textContent));
  // 余白(ブロックの左)から矩形選択でドラッグする。
  const marqueeSelect = async (page, fromText, toText) => {
    const from = await rowBox(page, fromText);
    await page.mouse.move(from.left - 30, from.top + 4);
    await page.mouse.down();
    await page.mouse.move(from.left - 20, from.top + 10, { steps: 3 });
    const to = await rowBox(page, toText);
    await page.mouse.move(from.left + 160, to.bottom - 4, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const clipLiteral = {
    pages: [
      { id: "C1", title: "Clip Source", blocks: [
        para("c1", "lead text"),
        { id: "c2", type: "heading1", text: "CLIP head" },
        { id: "c3", type: "bullet", text: "CLIP item", indent: 1 },
        { id: "c4", type: "table", text: "", rows: [[{ text: "t1" }, { text: "t2" }], [{ text: "t3" }, { text: "t4" }]] },
        para("c5", "CLIP after"),
        { id: "c6", type: "page", text: "", pageId: "C2" },
      ] },
      { id: "C2", title: "Clip Target", blocks: [para("d1", "")] },
    ],
    fonts: [],
    attachments: [],
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await openLiteral(fresh, clipLiteral, "clip-source.html");
    // コピーでクリップボードに載った text/plain を、後から聞くリスナーで読む(権限なしで確かめるため)。
    await fresh.evaluate(() => {
      window.__copiedPlain = null;
      window.addEventListener("copy", (event) => {
        window.__copiedPlain = event.clipboardData.getData("text/plain");
        window.__copiedJson = event.clipboardData.getData("application/x-doc-editor-blocks+json");
      });
    });

    // 1) 見出し+字下げした箇条書き+表を矩形選択 → Ctrl+C → 別ページの空の段落で Ctrl+V。
    //    種類・字下げの階層・表の中身が一致し、ID は新しく、空の段落は置き換わる。
    await marqueeSelect(fresh, "CLIP head", "t4");
    const picked = await selectedTexts(fresh);
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    const plain = await fresh.evaluate(() => window.__copiedPlain);
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Clip Target" }).first().click();
    await fresh.waitForTimeout(200);
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const saved = await saveAndParse(fresh, "clip-pasted.html");
    const target = saved.pages.find((page) => page.id === "C2").blocks;
    const source = saved.pages.find((page) => page.id === "C1").blocks;
    const table = target.find((block) => block.type === "table");
    result.blockCopyPasteKeepsStructure = picked.length === 3
      && target.map((block) => block.type).join(",") === "heading1,bullet,table"
      && target.map((block) => block.indent || 0).join(",") === "0,1,0"
      && target[0].text === "CLIP head" && target[1].text === "CLIP item"
      && table && table.rows.flat().map((cell) => cell.text).join(",") === "t1,t2,t3,t4"
      && target.every((block) => !source.some((original) => original.id === block.id))
      && source.length === 6;
    // 他のアプリへ貼っても読めるよう、text/plain にも中身が載る(表はタブ区切り)。
    result.blockCopyPutsPlainText = typeof plain === "string" && plain.includes("CLIP head")
      && plain.includes("CLIP item") && plain.includes("t1\tt2");

    // 2) 別のタブの同じエディタへもブロックとして貼れる(クリップボードは共通)。
    const other = await context.newPage();
    await other.goto("http://127.0.0.1:" + PORT + "/");
    await other.waitForSelector("#blocks .block-content");
    await other.locator("#blocks .block-content").last().click();
    await other.keyboard.press("Control+v");
    await other.waitForTimeout(300);
    const otherTexts = await other.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent));
    await other.close();
    result.blockPasteWorksInAnotherTab = otherTexts.includes("CLIP head") && otherTexts.includes("CLIP item")
      && otherTexts.filter((text) => text === "CLIP head").length === 1;

    // 3) 切り取り → 貼り付け → Undo 2回で元どおり(切り取り・貼り付けとも Undo 1手)。
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Clip Source" }).first().click();
    await fresh.waitForTimeout(200);
    const order = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent).join("|"));
    const before = await order();
    await marqueeSelect(fresh, "CLIP after", "CLIP after");
    await fresh.keyboard.press("Control+x");
    await fresh.waitForTimeout(200);
    const afterCut = await order();
    await fresh.locator("#blocks .block-content", { hasText: "lead text" }).first().click();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const afterPaste = await order();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const afterUndo1 = await order();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const afterUndo2 = await order();
    result.blockCutPasteUndoRestores = !afterCut.includes("CLIP after")
      && afterPaste.startsWith("lead text|CLIP after")
      && afterUndo1 === afterCut && afterUndo2 === before;

    // 4) 矩形選択の途中でスクロールしても、開始点は始めたブロックに留まる(画面の位置ではなく文書の位置)。
    const longLiteral = {
      pages: [{ id: "L1", title: "Long Page", blocks: Array.from({ length: 70 }, (_, index) => para("l" + index, "LONG line " + index)) }],
      fonts: [],
      attachments: [],
    };
    await openLiteral(fresh, longLiteral, "long-page.html");
    await fresh.evaluate(() => window.scrollTo(0, 0));
    const start = await rowBox(fresh, "LONG line 2");
    await fresh.mouse.move(start.left - 30, start.top + 4);
    await fresh.mouse.down();
    await fresh.mouse.move(start.left - 20, start.top + 12, { steps: 3 });
    await fresh.mouse.wheel(0, 900);
    await fresh.waitForTimeout(300);
    const scrolledBy = await fresh.evaluate(() => window.scrollY);
    const end = await rowBox(fresh, "LONG line 30");
    await fresh.mouse.move(start.left + 160, end.top + 6, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
    const scrolledSelection = await selectedTexts(fresh);
    result.marqueeKeepsStartWhileScrolling = scrolledBy > 300
      && scrolledSelection[0] === "LONG line 2" && scrolledSelection.at(-1) === "LONG line 30"
      && scrolledSelection.length === 29;

    // 5) ドラッグ中に下端へ持っていくと自動でスクロールし、画面外だったブロックまで選ばれる。端から離れると止まる。
    await fresh.evaluate(() => window.scrollTo(0, 0));
    await fresh.waitForTimeout(100);
    const visibleAtStart = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .filter((row) => row.getBoundingClientRect().top < window.innerHeight).length);
    const top = await rowBox(fresh, "LONG line 2");
    await fresh.mouse.move(top.left - 30, top.top + 4);
    await fresh.mouse.down();
    await fresh.mouse.move(top.left - 20, top.top + 12, { steps: 3 });
    const viewportHeight = await fresh.evaluate(() => window.innerHeight);
    await fresh.mouse.move(top.left + 160, viewportHeight - 4, { steps: 6 });
    await fresh.waitForTimeout(900);
    const autoScrolled = await fresh.evaluate(() => window.scrollY);
    // 端から離す(真ん中へ戻す)と止まる。
    await fresh.mouse.move(top.left + 160, viewportHeight / 2, { steps: 3 });
    await fresh.waitForTimeout(150);
    const stoppedAt = await fresh.evaluate(() => window.scrollY);
    await fresh.waitForTimeout(300);
    const stillAt = await fresh.evaluate(() => window.scrollY);
    await fresh.mouse.move(top.left + 160, viewportHeight - 4, { steps: 2 });
    await fresh.waitForTimeout(150);
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
    const autoSelection = await selectedTexts(fresh);
    const lastIndex = Number(String(autoSelection.at(-1) || "").replace("LONG line ", ""));
    result.marqueeAutoScrollsAtEdge = autoScrolled > 150 && stoppedAt === stillAt
      && autoSelection[0] === "LONG line 2" && lastIndex >= visibleAtStart;

    // 6) クリップボードは他のサイトからも書ける(外から来た値)。貼り付けたブロックも、開いたファイルと同じ
    //    無害化を通る: グラフの SVG のスクリプト・イベント属性は落ち、添付の ID は安全な文字に振り直される。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.evaluate(async () => {
      const hostileId = 'bad"><img src=x onerror="window.__pasteXss=3">';
      const evil = await window.SingleHtmlFormat.fileToAttachment(new File([new Uint8Array([1, 2])], "evil.bin", { type: "application/octet-stream" }), hostileId);
      const payload = {
        format: "doc-editor-blocks",
        version: 1,
        blocks: [
          { id: "x1", type: "chart", text: "plot([1,2],[3,4])", chartSvg: '<svg onload="window.__pasteXss=1"><script>window.__pasteXss=2</script></svg>' },
          { id: "x2", type: "attachment", text: "", attachmentId: hostileId },
        ],
        attachments: [evil],
        pageTitles: {},
      };
      const transfer = new DataTransfer();
      transfer.setData("application/x-doc-editor-blocks+json", JSON.stringify(payload));
      transfer.setData("text/plain", "evil");
      document.querySelector("#blocks .block-content").dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.waitForTimeout(400);
    // 保存と再読込(parsePortableHtml)も同じ無害化をするので、読み直した結果だけを見ると、貼り付けの時点で
    // 無害化していなくても緑になってしまう(P13)。**保存したファイルそのもの**に細工の文字列が残っていないことを見る。
    const hostileDownload = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const hostilePath = join(DOWNLOADS, "clip-hostile.html");
    await (await hostileDownload).saveAs(hostilePath);
    const hostileRaw = await readFile(hostilePath, "utf8");
    const hostile = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), hostileRaw);
    const hostileBlocks = hostile.pages.flatMap((page) => page.blocks);
    const chart = hostileBlocks.find((block) => block.type === "chart");
    // 添付の中身はクリップボードから取り込まない(v148)ので、細工した添付はこの文書に無く、
    // 「添付が見つかりません(名前)」の段落として見える形で残る。
    const missingNote = hostileBlocks.find((block) => block.type === "paragraph" && String(block.text).startsWith("添付が見つかりません"));
    result.pastedBlocksAreSanitized = Boolean(chart) && !/onload|<script/i.test(chart.chartSvg || "")
      && Boolean(missingNote) && missingNote.text === "添付が見つかりません(evil.bin)"
      && !hostileBlocks.some((block) => block.type === "attachment")
      && !hostileRaw.includes("__pasteXss")
      && await fresh.evaluate(() => window.__pasteXss === undefined);

    // 7) ブロックをコピーした後に**文字をコピー**して Ctrl+V すると、古いブロックではなく文字が入る
    //    (クリップボードが唯一の置き場。アプリの中に古いブロックの控えを持たない)。
    await openLiteral(fresh, clipLiteral, "clip-source-2.html");
    await marqueeSelect(fresh, "CLIP head", "t4");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await fresh.locator("#blocks .block-content", { hasText: "lead text" }).first().click();
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Shift+End");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await fresh.locator("#blocks .block-content", { hasText: "CLIP after" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const afterTextPaste = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent));
    result.textCopyAfterBlockCopyPastesText = afterTextPaste.filter((text) => text === "CLIP head").length === 1
      && afterTextPaste.includes("CLIP afterlead text");

    // 8) 画像の添付を切り取り → 貼り付けで、添付が戻る(同じ文書の中なので参照のまま戻す)。
    //    クリップボードには添付の中身を載せない(数MBの base64 を流さない。目印だけ)。
    await openLiteral(fresh, { pages: [{ id: "I1", title: "Image Doc", blocks: [para("i1", "image host"), para("i2", "image tail")] }], fonts: [], attachments: [] }, "image-doc.html");
    await fresh.evaluate(async () => {
      const target = document.querySelector("#blocks .block-content");
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 400;
      const context2d = canvas.getContext("2d");
      for (let i = 0; i < 400; i += 1) { context2d.fillStyle = "hsl(" + i + ",70%,50%)"; context2d.fillRect(i, (i * 7) % 400, 3, 400); }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "clip-image.png", { type: "image/png" }));
      target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.locator('img.attachment-image[alt="clip-image.png"]').waitFor({ state: "visible" });
    const imageBytes = await fresh.evaluate(() => [...document.querySelectorAll("img.attachment-image")].length);
    const imageRow = fresh.locator("#blocks .block", { has: fresh.locator("img.attachment-image") });
    await imageRow.locator(".drag-grip").click();
    await fresh.keyboard.press("Escape");
    await fresh.evaluate(() => { window.__copiedJson = null; });
    await fresh.keyboard.press("Control+x");
    await fresh.waitForTimeout(250);
    const cutJson = await fresh.evaluate(() => window.__copiedJson || "");
    const imageGone = await fresh.evaluate(() => document.querySelectorAll("img.attachment-image").length === 0);
    await fresh.locator("#blocks .block-content", { hasText: "image tail" }).first().click();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const imageBack = await fresh.evaluate(() => ({
      images: document.querySelectorAll("img.attachment-image").length,
      missing: [...document.querySelectorAll("#blocks .block")].some((row) => row.textContent.includes("Missing attachment")),
    }));
    result.cutPasteRestoresImageAttachment = imageBytes === 1 && imageGone && imageBack.images === 1 && !imageBack.missing;
    // 画像を切り取る → **保存する** → 貼り付ける → 画像が戻る(TL の注意: 保存で控えを空にすると画像を失う。
    // 控えは件数の上限で抑え、保存では消さない)。
    await imageRow.locator(".drag-grip").click();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+x");
    await fresh.waitForTimeout(250);
    const cutAgainGone = await fresh.evaluate(() => document.querySelectorAll("img.attachment-image").length === 0);
    const saveDownload = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    await (await saveDownload).saveAs(join(DOWNLOADS, "cut-then-save.html"));
    await fresh.locator("#blocks .block-content", { hasText: "image tail" }).first().click();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const afterSavePaste = await fresh.evaluate(() => ({
      images: document.querySelectorAll("img.attachment-image").length,
      missing: [...document.querySelectorAll("#blocks .block-content")].some((node) => node.textContent.startsWith("添付が見つかりません")),
    }));
    result.cutSavePasteRestoresImage = cutAgainGone && afterSavePaste.images === 1 && !afterSavePaste.missing;
    // 大きさの実測(P24): 添付の中身を載せないので、画像を含めてもクリップボードの JSON は小さい。
    result.clipboardPayloadBytesWithImage = cutJson.length;
    result.clipboardOmitsAttachmentData = cutJson.length > 0 && cutJson.length < 2000 && !cutJson.includes("chunks");

    // 9) 別の文書へ貼ると、添付は「添付が見つかりません(ファイル名)」、ページのリンクは題名だけの段落になる
    //    (黙って消さない・存在しないページを指すリンクは作らない)。
    // 元の添付ブロックも消しておく(掃除で外した添付が控えに入る)。別の文書へはその控えを持ち出さないこと。
    await imageRow.locator(".drag-grip").click();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(200);
    await openMenu(fresh, "file");
    await fresh.locator("#menu-new-document").click();
    await fresh.waitForTimeout(300);
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const crossAttachment = await fresh.evaluate(() => ({
      images: document.querySelectorAll("img.attachment-image").length,
      texts: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent),
    }));
    await openLiteral(fresh, clipLiteral, "clip-source-3.html");
    const linkRow = fresh.locator("#blocks .block", { has: fresh.locator(".page-link") }).first();
    await linkRow.locator(".drag-grip").click();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await openMenu(fresh, "file");
    await fresh.locator("#menu-new-document").click();
    await fresh.waitForTimeout(300);
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const crossLink = await fresh.evaluate(() => ({
      links: document.querySelectorAll("#blocks .page-link").length,
      texts: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent),
    }));
    result.crossDocumentPasteKeepsVisibleNames = crossAttachment.images === 0
      && crossAttachment.texts.includes("添付が見つかりません(clip-image.png)")
      && crossLink.links === 0 && crossLink.texts.includes("Clip Target");

    // 10) paste イベントは修飾キーを持たない(書式なし貼り付けを keydown の印で見分ける根拠の実測)。
    result.clipboardEventHasNoShiftKey = await fresh.evaluate(() => !("shiftKey" in new ClipboardEvent("paste")));

    // 11) ブロックをコピーして、キャレットを置いて Ctrl+Shift+V → **文字として**入る(新しいブロックは増えない)。
    //     その直後の Ctrl+V は**ブロックとして**入る(書式なしの印が残らない)。
    await openLiteral(fresh, clipLiteral, "clip-source-4.html");
    await marqueeSelect(fresh, "CLIP head", "t4");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await fresh.evaluate(() => {
      window.__pasteTypes = [];
      window.addEventListener("paste", (event) => { window.__pasteTypes.push([...(event.clipboardData?.types || [])].join(",")); }, true);
    });
    await fresh.locator("#blocks .block-content", { hasText: "lead text" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+Shift+V");
    // 印は paste で消える(タイマー 250ms を待たずに次の Ctrl+V を押しても、書式なし扱いにならない)。
    await fresh.waitForTimeout(40);
    const headingCount = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .filter((row) => row.querySelector(".block-content")?.textContent === "CLIP head").length);
    const afterPlain = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent));
    const headingsAfterPlain = await headingCount();
    result.plainPasteInsertsBlocksAsText = headingsAfterPlain === 1
      && afterPlain.some((text) => text.startsWith("lead text") && text.includes("CLIP head") && text.includes("CLIP item"));
    await fresh.locator("#blocks .block-content", { hasText: "CLIP after" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    result.normalPasteAfterPlainPasteUsesBlocks = (await headingCount()) === 2;
    // 証拠(判定しない): Ctrl+Shift+V と Ctrl+V の paste イベントで見えたクリップボードの型。
    result.pasteEventTypesPlainThenNormal = await fresh.evaluate(() => window.__pasteTypes.join(" | "));
    // paste イベントが来なかったとき(その環境でキーが貼り付けにならない)も、印は短いタイマーで消える。
    // 合成の keydown(ブラウザは貼り付けをしない)で印だけを立て、待ってから本物の Ctrl+V → ブロックとして入る。
    await fresh.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })));
    await fresh.waitForTimeout(400);
    await fresh.locator("#blocks .block-content", { hasText: "CLIP after" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    result.plainPasteFlagExpiresWithoutPaste = (await headingCount()) === 3;

    // 12) 書式つきの文字(太字)をコピーして Ctrl+Shift+V → 書式が落ちる。対照として、同じものを Ctrl+V すると
    //     太字が残ることも記録する(残らないなら、この判定は書式なしの経路を確かめていないことになる)。
    await openLiteral(fresh, {
      pages: [{ id: "R1", title: "Rich Doc", blocks: [
        { id: "r1", type: "paragraph", text: "**BOLDWORD** rest", html: "<strong>BOLDWORD</strong> rest" },
        para("r2", "plain host"),
        para("r3", "rich host"),
      ] }],
      fonts: [],
      attachments: [],
    }, "rich-doc.html");
    await fresh.locator("#blocks .block-content", { hasText: "BOLDWORD" }).first().click();
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Shift+End");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await fresh.locator("#blocks .block-content", { hasText: "plain host" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+Shift+V");
    await fresh.waitForTimeout(300);
    await fresh.locator("#blocks .block-content", { hasText: "rich host" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const richState = await fresh.evaluate(() => {
      const rowOf = (needle) => [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.startsWith(needle));
      const plainHost = rowOf("plain host");
      const richHost = rowOf("rich host");
      return {
        plainText: plainHost?.textContent || "",
        plainBold: Boolean(plainHost?.querySelector("strong, b")),
        richBold: Boolean(richHost?.querySelector("strong, b")),
      };
    });
    result.richCtrlVKeepsBoldControl = richState.richBold ? "yes" : "no";
    result.plainPasteDropsFormatting = richState.plainText === "plain hostBOLDWORD rest" && !richState.plainBold;

    // 13) 書式なし貼り付けの保険(paste が来なかったときにクリップボードの文字を読んで貼る)の直後に、遅れて
    //     paste が届いても二重に入らない。保険が働くようクリップボードの読み取りを許した別の文脈で確かめる。
    const permitted = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
    try {
      const late = await permitted.newPage();
      await late.goto("http://127.0.0.1:" + PORT + "/");
      await late.waitForSelector("#blocks .block-content");
      await late.locator("#blocks .block-content").last().click();
      await late.keyboard.press("End");
      await late.evaluate(() => navigator.clipboard.writeText("LATE one\nLATE two"));
      const lateCount = () => late.evaluate(() => [...document.querySelectorAll("#blocks .block-content")]
        .map((node) => node.textContent).join("|").split("LATE one").length - 1);
      // 合成の keydown(ブラウザは貼り付けをしない)で印を立て、paste が来ないまま保険が働くのを待つ。
      await late.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })));
      await late.waitForTimeout(600);
      const afterFallback = await lateCount();
      // 遅れて届いた paste(同じ中身)。取り消されるので増えない。
      await late.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.setData("text/plain", "LATE one\nLATE two");
        const target = document.activeElement?.closest?.(".block-content") || document.querySelector("#blocks .block-content");
        target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
      });
      await late.waitForTimeout(200);
      const afterLate = await lateCount();
      result.latePasteAfterFallbackIsIgnored = afterFallback === 1 && afterLate === 1;
    } finally {
      await permitted.close();
    }

    // 14) 掃除で外した添付の控えは新しい 20 件まで(P24)。22 件の添付をまとめてコピー → 削除 → 貼り付けると、
    //     新しい 20 件は戻り、古い 2 件は「添付が見つかりません(ファイル名)」になる。
    await fresh.setViewportSize({ width: 1280, height: 3400 });
    const capHtml = await fresh.evaluate(async () => {
      const attachments = [];
      const blocks = [{ id: "k0", type: "paragraph", text: "cap head" }];
      for (let index = 0; index < 22; index += 1) {
        const name = "cap-" + String(index).padStart(2, "0") + ".bin";
        const attachment = await window.SingleHtmlFormat.fileToAttachment(new File([new Uint8Array([index])], name, { type: "application/octet-stream" }), "att-cap-" + index);
        attachments.push(attachment);
        blocks.push({ id: "k" + (index + 1), type: "attachment", text: "", attachmentId: attachment.id });
      }
      blocks.push({ id: "k99", type: "paragraph", text: "cap tail" });
      return window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "K1", title: "Cap Doc", blocks }], fonts: [], attachments });
    });
    const capPath = join(OUT, "cap-doc.html");
    await writeFile(capPath, capHtml, "utf8");
    const capChooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await capChooser).setFiles(capPath);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Cap Doc", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    await marqueeSelect(fresh, "cap-00.bin", "cap-21.bin");
    const capSelected = (await selectedTexts(fresh)).length;
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    await fresh.locator("#blocks .block-content", { hasText: "cap head" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(500);
    const capState = await fresh.evaluate(() => ({
      cards: document.querySelectorAll(".attachment-file-card").length,
      missing: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent)
        .filter((text) => text.startsWith("添付が見つかりません")),
    }));
    await fresh.setViewportSize({ width: 1280, height: 720 });
    result.detachedAttachmentsAreCapped = capSelected === 22 && capState.cards === 20
      && capState.missing.join(",") === "添付が見つかりません(cap-00.bin),添付が見つかりません(cap-01.bin)";
    return result;
  } finally {
    await fresh.close();
  }
}
