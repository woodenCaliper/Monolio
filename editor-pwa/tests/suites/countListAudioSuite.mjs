// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 文字数(Issue #189)・番号付きリストの番号の形(Issue #171)・音声の添付の再生(Issue #164 の音声。形式 0.8.20) ----
// 文字数: Edit → 文字数… の窓(このページ・選んでいる文字・選んだブロック・すべてのページ)と、つまみのメニューの下の一行。
//   見える文字を1字ずつ(書記素)。改行は数えない。空白は数え、空白を除いた数も出す。表は見えている値、図・数式のコードは数えない。
//   開いたときにだけ数える(打鍵では数えない)。
// 番号の形: つまみのメニュー「番号の形」で 1.1 の階層 / 数字 / 英字 / ローマ数字。続いている同じ段の項目すべてに listStyle を書く。
//   値の無い段は、親が平らな形(1. a. i.)なら段の深さで 1. → a. → i.、それ以外は 1.1 の階層(古い文書の見た目は変わらない)。
// 音声: audio/…(種類が分からなければ拡張子)の添付は、ファイルのカードの下に <audio controls>。保存HTMLでも再生できる。
//   「ファイルとして表示」で切り替え。再生できなければ一言を出す。音声の無い文書の保存HTMLは変わらない。
export default async function countListAudioSuite({ context }) {
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
    const path = join(DOWNLOADS, "count-list-audio-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return { path, html: await readFile(path, "utf8") };
  };
  const manifestOf = (html) => fresh.evaluate((text) => JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent), html);
  const openLiteral = async (doc, name) => {
    const source = join(OUT, name);
    await writeFile(source, await fresh.evaluate((value) => window.SingleHtmlFormat.buildPortableHtml(value), doc), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction((t) => document.querySelector("#doc-title")?.textContent === t, doc.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const editorMarkers = () => fresh.evaluate(() => Object.fromEntries([...document.querySelectorAll("#blocks .block")]
    .filter((row) => row.querySelector(":scope > .numbered-marker"))
    .map((row) => [row.dataset.id, row.querySelector(":scope > .numbered-marker").textContent])));
  const savedMarkers = (html) => fresh.evaluate((text) => {
    const view = new DOMParser().parseFromString(text, "text/html");
    return [...view.querySelectorAll(".numbered-item .numbered-marker")].map((node) => node.textContent);
  }, html);
  const openGripMenu = async (blockId) => {
    const row = fresh.locator('#blocks .block[data-id="' + blockId + '"]');
    await row.hover();
    await row.locator(".drag-grip").click();
    await fresh.waitForTimeout(200);
  };
  const countRows = () => fresh.evaluate(() => Object.fromEntries([...document.querySelectorAll("#count-rows tr")]
    .map((row) => [row.dataset.count, { label: row.querySelector("th").textContent, all: Number(row.cells[1].textContent.replace(/,/g, "")), noSpace: Number(row.cells[2].textContent.replace(/,/g, "")) }])));
  const openCount = async () => {
    await openMenu(fresh, "edit");
    await fresh.locator("#menu-char-count").click();
    await fresh.waitForTimeout(150);
    return countRows();
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // ======== 番号の形(Issue #171) ========
    // 1) 数え方(fmt)。値の無い文書は今までと同じ(1. / 1.1 / 1.2 / 2.、親の無い字下げは 1.)。平らな形の親の下は 1. → a. → i. → 1.。
    result.listStyleRules = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const n = (id, indent = 0, listStyle) => ({ id, type: "numbered", text: id, indent, ...(listStyle ? { listStyle } : {}) });
      const marks = (blocks) => [...fmt.numberedListMarkers(blocks).values()].join(" ");
      const old = marks([n("a"), n("b", 1), n("c", 1), n("d"), { id: "p", type: "paragraph", text: "" }, n("e", 1), n("f", 1)]);
      const cycle = marks([n("a", 0, "decimal"), n("b", 1), n("c", 2), n("d", 3), n("e", 1), n("f")]);
      const alpha = marks(Array.from({ length: 28 }, (_, i) => n("x" + i, 0, i === 0 ? "alpha" : undefined)));
      const roman = marks(Array.from({ length: 14 }, (_, i) => n("r" + i, 0, i === 0 ? "roman" : undefined)));
      // 段の形は最初の項目で決まる(途中の項目の値は効かない)。明示の nested は平らな親の下でも階層。
      const firstWins = marks([n("a", 0, "alpha"), n("b", 0, "roman"), n("c", 1, "nested")]);
      const columns = marks([{ ...n("a", 0, "roman"), columnGroup: "g", columnIndex: 0 }, { ...n("b"), columnGroup: "g", columnIndex: 1 }]);
      return { old, cycle, alpha: alpha.split(" ").slice(24).join(" "), roman: roman.split(" ").slice(2, 14).join(" "), firstWins, columns };
    });
    result.listStyleOldDocsUnchanged = result.listStyleRules.old === "1. 1.1 1.2 2. 1. 2.";
    result.listStyleDepthCycle = result.listStyleRules.cycle === "1. a. i. 1. b. 2.";
    result.listStyleAlphaRoman = result.listStyleRules.alpha === "y. z. aa. ab." && result.listStyleRules.roman === "iii. iv. v. vi. vii. viii. ix. x. xi. xii. xiii. xiv.";
    result.listStyleFirstItemWins = result.listStyleRules.firstWins === "a. b. b.1" && result.listStyleRules.columns === "i. 1.";

    // 2) エディタ: つまみのメニュー「番号の形」で英字に → 続いている同じ段すべてが a. b. c.、入れ子の段(値なし)は段の深さで a.。
    //    保存HTMLの番号はエディタと同じ。Undo 1手で戻る。既定(1.1)を選び直すと値を書かない。
    await openLiteral({ fonts: [], attachments: [], pages: [{ id: "L", title: "番号の形", blocks: [
      { id: "l1", type: "numbered", text: "一つ目" },
      { id: "l2", type: "numbered", text: "入れ子", indent: 1 },
      { id: "l3", type: "numbered", text: "二つ目" },
      { id: "l4", type: "numbered", text: "三つ目" },
      { id: "lp", type: "paragraph", text: "区切り" },
      { id: "l5", type: "numbered", text: "別のリスト" },
    ] }] }, "list-style.html");
    const before = await editorMarkers();
    await openGripMenu("l3");
    const menu = await fresh.evaluate(() => ({
      section: [...document.querySelectorAll("#block-menu .menu-section")].map((node) => node.textContent),
      items: [...document.querySelectorAll('#block-menu [data-action^="list-style-"]')].map((node) => ({ action: node.dataset.action, checked: node.getAttribute("aria-checked") })),
    }));
    await fresh.locator('#block-menu [data-action="list-style-alpha"]').click();
    await fresh.waitForTimeout(250);
    const afterAlpha = await editorMarkers();
    const alphaSaved = await saveHtml();
    const alphaManifest = await manifestOf(alphaSaved.html);
    const styles = Object.fromEntries(alphaManifest.pages[0].blocks.map((block) => [block.id, block.listStyle ?? null]));
    const alphaSavedMarkers = await savedMarkers(alphaSaved.html);
    result.listStyleMenuSetsRun = before.l1 === "1." && before.l2 === "1.1" && before.l3 === "2." && before.l5 === "1."
      && menu.section.includes("番号の形") && menu.items.length === 4 && menu.items.find((item) => item.action === "list-style-nested")?.checked === "true"
      && afterAlpha.l1 === "a." && afterAlpha.l2 === "a." && afterAlpha.l3 === "b." && afterAlpha.l4 === "c." && afterAlpha.l5 === "1."
      && styles.l1 === "alpha" && styles.l3 === "alpha" && styles.l4 === "alpha" && styles.l2 === null && styles.l5 === null;
    result.listStyleSavedMatchesEditor = alphaSavedMarkers.join(" ") === [afterAlpha.l1, afterAlpha.l2, afterAlpha.l3, afterAlpha.l4, afterAlpha.l5].join(" ");
    result.listStyleEvidence = { before, menu, afterAlpha, styles, alphaSavedMarkers };

    // 3) Enter で足した項目は段の形を受け継ぐ(d.)。Tab で入れ子にすると、その段の既定(英字の親の下 → a.)。
    await fresh.locator('#blocks .block[data-id="l4"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("四つ目");
    await fresh.waitForTimeout(150);
    const afterEnter = await fresh.evaluate(() => {
      const row = [...document.querySelectorAll("#blocks .block")].find((node) => node.querySelector(".block-content")?.textContent === "四つ目");
      return { id: row?.dataset.id, marker: row?.querySelector(".numbered-marker")?.textContent };
    });
    // 本文の Tab は「行の頭なら字下げ」(v176)
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const afterTab = (await editorMarkers())[afterEnter.id];
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(150);
    result.listStyleEnterAndTab = afterEnter.marker === "d." && afterTab === "a.";
    result.listStyleEnterEvidence = { afterEnter, afterTab };

    // 4) Undo で戻す(英字にする前の番号と、値の無い文書)。既定を選び直すと値を書かない
    for (let i = 0; i < 6; i += 1) {
      const markers = await editorMarkers();
      if (markers.l1 === "1.") break;
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(150);
    }
    const undone = await editorMarkers();
    const undoneManifest = await manifestOf((await saveHtml()).html);
    await openGripMenu("l1");
    await fresh.locator('#block-menu [data-action="list-style-decimal"]').click();
    await fresh.waitForTimeout(200);
    const decimal = await editorMarkers();
    await openGripMenu("l1");
    await fresh.locator('#block-menu [data-action="list-style-nested"]').click();
    await fresh.waitForTimeout(200);
    const backToNested = await editorMarkers();
    const nestedManifest = await manifestOf((await saveHtml()).html);
    result.listStyleUndoAndDefault = undone.l1 === "1." && undone.l3 === "2." && undoneManifest.pages[0].blocks.every((block) => !("listStyle" in block))
      && decimal.l1 === "1." && decimal.l2 === "a." && decimal.l3 === "2."
      && backToNested.l2 === "1.1" && nestedManifest.pages[0].blocks.every((block) => !("listStyle" in block));
    result.listStyleUndoEvidence = { undone, decimal, backToNested };

    // 5) 開くとき: listStyle は4つの値だけを受ける(種類は問わない)。形式の版は 0.8.20 以上
    result.listStyleSanitizedOnOpen = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const html = fmt.buildPortableHtml({ pages: [{ id: "S", title: "s", blocks: [
        { id: "a", type: "numbered", text: "a", listStyle: "roman" },
        { id: "b", type: "numbered", text: "b", listStyle: "upper-roman" },
        { id: "c", type: "bullet", text: "c", listStyle: "alpha" },
      ] }], fonts: [], attachments: [] });
      const blocks = fmt.parsePortableHtml(html).pages[0].blocks;
      return blocks[0].listStyle === "roman" && !("listStyle" in blocks[1]) && blocks[2].listStyle === "alpha"
        && fmt.compareFormatVersions(fmt.VERSION, "0.8.20") >= 0;
    });

    // 5b) 見た目(P7): ローマ数字・英字の番号の後ろの本文の位置は、エディタと保存HTMLで同じずれ方(i. と iii. と xxviii. が同じ字の幅で
    //     測られる。以前の 1字 8px の見積もりでは、エディタだけ iii. の本文が 8px 右へずれた)。1280px と 800px
    const romanDoc = { fonts: [], attachments: [], pages: [{ id: "R", title: "ローマ数字", blocks: [
      ...Array.from({ length: 28 }, (_, i) => ({ id: "r" + i, type: "numbered", text: "項目", ...(i === 0 ? { listStyle: "roman" } : {}) })),
      { id: "rp", type: "paragraph", text: "" },
      ...Array.from({ length: 23 }, (_, i) => ({ id: "w" + i, type: "numbered", text: "項目", ...(i === 0 ? { listStyle: "alpha" } : {}) })),
    ] }] };
    await openLiteral(romanDoc, "roman.html");
    const romanSaved = await saveHtml();
    const parity = {};
    for (const width of [1280, 800]) {
      await fresh.setViewportSize({ width, height: 860 });
      await fresh.waitForTimeout(200);
      const editorShift = await fresh.evaluate(() => {
        // 本文の字の左端(.block-content の箱は padding を含むので、字の範囲で測る)
        const left = (id) => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('#blocks .block[data-id="' + id + '"] .block-content'));
          return range.getClientRects()[0].left;
        };
        return ["r0", "r2", "r7", "r17", "r27", "w12", "w22"].map((id) => Math.round(left(id) - left("r0")));
      });
      const viewer = await context.newPage();
      await viewer.setViewportSize({ width, height: 860 });
      await viewer.goto("file:///" + romanSaved.path.replace(/\\/g, "/"));
      const savedShift = await viewer.evaluate(() => {
        const items = [...document.querySelectorAll(".numbered-item")];
        const left = (index) => items[index].lastElementChild.getBoundingClientRect().left;
        return [0, 2, 7, 17, 27, 28 + 12, 28 + 22].map((index) => Math.round(left(index) - left(0)));
      });
      await viewer.close();
      parity[width] = { editorShift, savedShift };
    }
    await fresh.setViewportSize({ width: 1280, height: 860 });
    result.listStyleMarkerWidthMatchesSaved = Object.values(parity).every(({ editorShift, savedShift }) => editorShift.every((value, i) => Math.abs(value - savedShift[i]) <= 1));
    result.listStyleMarkerWidthEvidence = parity;

    // ======== 文字数(Issue #189) ========
    await openLiteral({ fonts: [], attachments: [], pages: [
      { id: "C", title: "文字数", blocks: [
        { id: "p1", type: "paragraph", text: "日本語 の文章" },
        { id: "p2", type: "paragraph", text: "式 $$x^2$$ と `npm`" },
        { id: "p3", type: "paragraph", text: "一行目\n二行目" },
        { id: "p4", type: "paragraph", text: "👨‍👩‍👧が来た　全角" },
        { id: "c1", type: "code", text: "a = 1" },
        { id: "t1", type: "table", text: "", rows: [[{ text: "名前" }, { text: "値" }], [{ text: "A" }, { text: "=1+2" }]] },
        { id: "m1", type: "math", text: "E=mc^2" },
        { id: "dv", type: "divider", text: "" },
        { id: "h1", type: "heading1", text: "見出し" },
        { id: "n1", type: "numbered", text: "項目" },
      ] },
      { id: "C2", title: "二枚目", blocks: [{ id: "q1", type: "paragraph", text: "二枚目" }] },
    ] }, "count.html");
    // 6) ページ: 7+11+6+7+5+5+3+2 = 46(空白を除く 6+8+6+6+3+5+3+2 = 39)。すべてのページは +3
    const pageRows = await openCount();
    result.countPageAndAll = pageRows.page?.all === 46 && pageRows.page?.noSpace === 39 && pageRows.all?.all === 49 && pageRows.all?.noSpace === 42
      && !pageRows.selection && !pageRows.blocks;
    result.countPageEvidence = pageRows;
    // 打鍵で閉じる(古い数を見せない)
    await fresh.keyboard.press("Escape");
    result.countPopoverClosesOnKey = await fresh.evaluate(() => document.querySelector("#count-popover").hidden);

    // 7) 選んでいる文字: 1つの段落の中(「本語 の」= 4、空白を除く 3)と、ブロックをまたぐ選択(p1 の「の文章」+ p2 全部 + p3 の「一行」)
    const selectIn = (from, fromOffset, to, toOffset) => fresh.evaluate(([a, ao, b, bo]) => {
      const textOf = (id) => {
        const walker = document.createTreeWalker(document.querySelector('#blocks .block[data-id="' + id + '"] .block-content'), NodeFilter.SHOW_TEXT);
        return walker.nextNode();
      };
      getSelection().setBaseAndExtent(textOf(a), ao, textOf(b), bo);
      return getSelection().toString();
    }, [from, fromOffset, to, toOffset]);
    await fresh.locator('#blocks .block[data-id="p1"] .block-content').click();
    await selectIn("p1", 1, "p1", 5);
    const inside = await openCount();
    await fresh.mouse.click(5, 500);
    await fresh.locator('#blocks .block[data-id="p1"] .block-content').click();
    await selectIn("p1", 4, "p3", 2);
    await fresh.waitForTimeout(100);
    const across = await openCount();
    await fresh.keyboard.press("Escape");
    result.countSelection = inside.selection?.all === 4 && inside.selection?.noSpace === 3 && inside.page?.all === 46
      && across.selection?.all === 16 && across.selection?.noSpace === 13;
    result.countSelectionEvidence = { inside: inside.selection, across: across.selection };

    // 8) つまみのメニューの下に、そのブロックの文字数。選んだブロックは窓にも出る。数えないブロック(区切り線)には出ない
    await openGripMenu("p4");
    const footer = await fresh.evaluate(() => document.querySelector("#block-menu .block-menu-count")?.textContent || "");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(100);
    const blockRows = await openCount();
    await fresh.keyboard.press("Escape");
    await openGripMenu("t1");
    const tableFooter = await fresh.evaluate(() => document.querySelector("#block-menu .block-menu-count")?.textContent || "");
    await fresh.keyboard.press("Escape");
    await openGripMenu("dv");
    const dividerFooter = await fresh.evaluate(() => Boolean(document.querySelector("#block-menu .block-menu-count")));
    await fresh.keyboard.press("Escape");
    result.countBlockMenuFooter = footer === "文字数 7(空白を除く 6)" && tableFooter === "文字数 5(空白を除く 5)" && !dividerFooter
      && blockRows.blocks?.all === 7 && blockRows.blocks?.label === "選んだブロック(1)";
    result.countBlockEvidence = { footer, tableFooter, dividerFooter, blockRows };

    // 9) 打鍵では数えない(数える関数は窓・メニューを開いたときだけ)。Intl.Segmenter の分け方を数えて確かめる
    await fresh.locator('#blocks .block[data-id="p1"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.evaluate(() => {
      window.__countCalls = 0;
      const original = Intl.Segmenter.prototype.segment;
      Intl.Segmenter.prototype.segment = function (...args) {
        if (this.resolvedOptions().granularity === "grapheme") window.__countCalls += 1;
        return original.apply(this, args);
      };
    });
    await fresh.keyboard.type("を足す");
    await fresh.waitForTimeout(300);
    const typingCalls = await fresh.evaluate(() => window.__countCalls);
    await openCount();
    const openCalls = await fresh.evaluate(() => window.__countCalls);
    await fresh.keyboard.press("Escape");
    result.countNotOnTyping = typingCalls === 0 && openCalls > 0;
    result.countTypingEvidence = { typingCalls, openCalls };

    // ======== 音声(Issue #164 の音声) ========
    // 試しの音: 1 秒の WAV(8 kHz・8 ビット)
    const rate = 8000;
    const samples = Buffer.from(Array.from({ length: rate }, (_, i) => Math.round(128 + 50 * Math.sin(2 * Math.PI * 440 * i / rate))));
    const wav = Buffer.alloc(44 + samples.length);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples.length, 4); wav.write("WAVE", 8); wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(samples.length, 40);
    samples.copy(wav, 44);
    await openLiteral({ fonts: [], attachments: [], pages: [{ id: "A", title: "音声", blocks: [
      { id: "a0", type: "paragraph", text: "音声の添付" },
    ] }] }, "audio.html");

    // 10) 添付すると、カードの下にプレーヤー(エディタ)。blob で読めて長さが分かる。Download で取り出せる
    await fresh.locator('#blocks .block[data-id="a0"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.locator("#attach-input").setInputFiles({ name: "打合せの録音.wav", mimeType: "audio/wav", buffer: wav });
    await fresh.waitForTimeout(800);
    const editorAudio = await fresh.evaluate(async () => {
      const element = document.querySelector(".audio-attachment-card audio.attachment-audio");
      if (!element) return { found: false };
      for (let i = 0; i < 40 && element.readyState < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      const card = element.closest(".attachment-card");
      return { found: true, src: element.src.slice(0, 5), controls: element.controls, duration: element.duration, error: element.error?.code ?? null,
        name: card.querySelector(".attachment-name")?.textContent, download: Boolean(card.querySelector(".attachment-download")), blockId: element.closest(".block")?.dataset.id,
        isFigure: card.tagName === "FIGURE" };
    });
    const audioBlockId = editorAudio.blockId;
    const downloadEvent = fresh.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await fresh.locator('#blocks .block[data-id="' + audioBlockId + '"] .attachment-download').click();
    const downloaded = await downloadEvent;
    result.audioPlaysInEditor = editorAudio.found && editorAudio.src === "blob:" && editorAudio.controls && editorAudio.duration > 0.9 && editorAudio.duration < 1.1
      && editorAudio.error === null && editorAudio.name === "打合せの録音.wav" && !editorAudio.isFigure && downloaded?.suggestedFilename() === "打合せの録音.wav";
    result.audioEditorEvidence = editorAudio;

    // 11) 保存HTMLをブラウザで開いても再生できる(Download もある)。図ではない(番号・題名なし)
    const audioSaved = await saveHtml();
    const viewer = await context.newPage();
    viewer.on("pageerror", (error) => errors.push("viewer: " + error.message));
    await viewer.setViewportSize({ width: 1280, height: 860 });
    await viewer.goto("file:///" + audioSaved.path.replace(/\\/g, "/"));
    const savedAudio = await viewer.evaluate(async () => {
      const element = document.querySelector("section.audio-attachment audio[data-attachment-audio]");
      if (!element) return { found: false };
      for (let i = 0; i < 40 && element.readyState < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
      const card = element.closest("section");
      const box = card.getBoundingClientRect();
      const player = element.getBoundingClientRect();
      return { found: true, src: element.src.slice(0, 5), duration: element.duration, download: Boolean(card.querySelector("[data-download]")),
        playerLeft: Math.round(player.left - box.left), playerRight: Math.round(box.right - player.right), playerBelowName: player.top > card.querySelector("strong").getBoundingClientRect().bottom,
        height: Math.round(player.height) };
    });
    await viewer.close();
    const editorBox = await fresh.evaluate((id) => {
      const card = document.querySelector('#blocks .block[data-id="' + id + '"] .attachment-card');
      const box = card.getBoundingClientRect();
      const player = card.querySelector("audio").getBoundingClientRect();
      return { playerLeft: Math.round(player.left - box.left), playerRight: Math.round(box.right - player.right), playerBelowName: player.top > card.querySelector(".attachment-name").getBoundingClientRect().bottom, height: Math.round(player.height) };
    }, audioBlockId);
    result.audioPlaysInSavedHtml = savedAudio.found && savedAudio.src === "blob:" && savedAudio.duration > 0.9 && savedAudio.download
      && /\.audio-attachment\{/.test(audioSaved.html) && !/<figure[^>]*>[^]*?data-attachment-audio/.test(audioSaved.html.slice(audioSaved.html.indexOf("<body")));
    // 見た目(P7): プレーヤーはカードの中で名前の下、左右の余白と高さがエディタと同じ
    result.audioLayoutMatchesEditor = savedAudio.playerBelowName && editorBox.playerBelowName
      && Math.abs(savedAudio.playerLeft - editorBox.playerLeft) <= 1 && Math.abs(savedAudio.playerRight - editorBox.playerRight) <= 1 && savedAudio.height === editorBox.height;
    result.audioSavedEvidence = { savedAudio, editorBox };

    // 12) つまみのメニューで「ファイルとして表示」⇄「音声として表示」。保存に attachmentView: "file"。題名の項目は出ない
    await openGripMenu(audioBlockId);
    const audioMenu = await fresh.evaluate(() => [...document.querySelectorAll("#block-menu .menu-item")].map((node) => node.dataset.action + ":" + node.querySelector(".menu-title").textContent));
    await fresh.locator('#block-menu [data-action="attachment-view"]').click();
    await fresh.waitForTimeout(250);
    const asFile = await fresh.evaluate((id) => {
      const row = document.querySelector('#blocks .block[data-id="' + id + '"]');
      return { fileCard: Boolean(row?.querySelector(".attachment-file-card")), audio: Boolean(row?.querySelector("audio")) };
    }, audioBlockId);
    const asFileSaved = await saveHtml();
    const asFileBlock = (await manifestOf(asFileSaved.html)).pages[0].blocks.find((block) => block.id === audioBlockId);
    await openGripMenu(audioBlockId);
    const audioMenuAfter = await fresh.evaluate(() => [...document.querySelectorAll("#block-menu .menu-item .menu-title")].map((node) => node.textContent));
    await fresh.locator('#block-menu [data-action="attachment-view"]').click();
    await fresh.waitForTimeout(250);
    const backToAudio = await fresh.evaluate((id) => Boolean(document.querySelector('#blocks .block[data-id="' + id + '"] audio.attachment-audio')), audioBlockId);
    result.audioShowAsFileToggle = audioMenu.some((text) => text.endsWith(":ファイルとして表示")) && !audioMenu.some((text) => text.includes("題名"))
      && asFile.fileCard && !asFile.audio && asFileBlock?.attachmentView === "file" && !/data-attachment-audio=/.test(asFileSaved.html)
      && audioMenuAfter.includes("音声として表示") && backToAudio;
    result.audioMenuEvidence = { audioMenu, audioMenuAfter, asFile };

    // 13) 再生できない音声(中身がでたらめな mp3)は、一言を出してファイルとして見せる。保存HTMLでも一言。文書の中身は音声のまま
    await fresh.locator('#blocks .block[data-id="a0"] .block-content').click();
    await fresh.locator("#attach-input").setInputFiles({ name: "壊れた録音.mp3", mimeType: "audio/mpeg", buffer: Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 53) % 256)) });
    await fresh.waitForTimeout(1500);
    const broken = await fresh.evaluate(() => {
      const card = [...document.querySelectorAll(".attachment-card")].find((node) => node.textContent.includes("壊れた録音.mp3"));
      return { unplayable: card?.classList.contains("is-unplayable"), note: card?.querySelector(".attachment-unplayable-note")?.textContent || "", audio: Boolean(card?.querySelector("audio")) };
    });
    const brokenSaved = await saveHtml();
    const brokenViewer = await context.newPage();
    await brokenViewer.goto("file:///" + brokenSaved.path.replace(/\\/g, "/"));
    await brokenViewer.waitForTimeout(1500);
    const brokenInSaved = await brokenViewer.evaluate(() => ({
      note: [...document.querySelectorAll(".audio-attachment.is-unplayable .video-unplayable")].map((node) => node.textContent).join("|"),
      playable: document.querySelectorAll("audio[data-attachment-audio]").length,
    }));
    await brokenViewer.close();
    const brokenManifest = await manifestOf(brokenSaved.html);
    const mp3Block = brokenManifest.pages[0].blocks.find((block) => block.type === "attachment" && brokenManifest.attachments.find((item) => item.id === block.attachmentId)?.name === "壊れた録音.mp3");
    result.audioUnplayableShowsNote = broken.unplayable && broken.note.includes("この環境では再生できませんでした") && broken.note.includes("audio/mpeg") && !broken.audio
      && mp3Block && mp3Block.attachmentView === undefined && brokenInSaved.note.includes("この環境では再生できませんでした") && brokenInSaved.playable === 1;
    result.audioUnplayableEvidence = { broken, brokenInSaved };

    // 14) 種類の判定(fmt): audio/… と、種類が分からないときの拡張子。動画・画像・ほかのファイルは音声にしない。blob の種類
    result.audioDetection = await fresh.evaluate(async () => {
      const fmt = window.SingleHtmlFormat;
      const view = (mime, name) => fmt.attachmentView({ type: "attachment" }, { id: "x", mime, name });
      const blobType = async (mime, name) => {
        const url = fmt.audioDisplayUrl(new Uint8Array([1, 2, 3]), mime, name).url;
        const type = (await (await fetch(url)).blob()).type;
        URL.revokeObjectURL(url);
        return type;
      };
      return view("audio/mpeg", "a.mp3") === "audio" && view("audio/x-m4a", "a.m4a") === "audio" && view("", "録音.m4a") === "audio"
        && view("application/octet-stream", "a.OGG") === "audio" && view("text/plain", "a.mp3") === "file" && view("video/webm", "a.webm") === "video"
        && view("application/octet-stream", "a.bin") === "file"
        && fmt.figureKind({ type: "attachment", attachmentId: "x" }, { attachments: [{ id: "x", mime: "audio/wav", name: "a.wav" }] }) === null
        && await blobType("audio/wav", "a.wav") === "audio/wav" && await blobType("", "a.mp3") === "audio/mpeg" && await blobType("text/html", "a.html") === "application/octet-stream";
    });

    // 15) 音声の無い文書の保存HTMLには、音声の CSS・ランタイムを足さない(出力は変わらない)
    result.audioNoOutputChangeWithoutAudio = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "N", title: "n", blocks: [{ id: "p", type: "paragraph", text: "x" }] }], fonts: [], attachments: [] });
      return !/audio/i.test(html);
    });

    result.countListAudioNoPageErrors = errors.length === 0;
    result.countListAudioErrors = errors.slice(0, 3).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
