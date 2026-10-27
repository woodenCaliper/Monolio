// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- 図表の題名と番号(v191。形式 0.8.3) ----
// 表・グラフ・画像に題名(block.caption)を付けると、文書全体の通し番号で「表n:」「図n:」が付く(ユーザー決定)。
// 表の題名は表の上、図の題名は図の下。題名の無い表は番号を持たず、隅の呼び名は「題名なし」(番号は題名の番号だけ。v193 ユーザー決定 A)。
// 題名はブロックのメニューの「題名を付ける」で付け、空のまま離れると外れる。保存HTMLにも同じ番号で出る。
export default async function captionSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const literal = { title: "Captions", fonts: [], attachments: [], pages: [
      { id: "CP1", title: "Captions", blocks: [
        { id: "p1", type: "paragraph", text: "CAP intro" },
        { id: "t1", type: "table", text: "", rows: [cells("a", "b"), cells("1", "2")] },
        { id: "t2", type: "table", text: "", rows: [cells("x", "y"), cells("1", "3"), cells("2", "5")] },
        { id: "g1", type: "chart", text: "plot(A2:A3, B2:B3)" },
        { id: "im", type: "attachment", text: "", attachmentId: "img1" },
        { id: "p9", type: "paragraph", text: "CAP end" },
      ] },
      { id: "CP2", title: "Second", blocks: [
        { id: "t3", type: "table", text: "", caption: "二枚目の表", rows: [cells("k", "v"), cells("1", "2")] },
      ] },
    ] };
    const source = join(OUT, "captions.html");
    await writeFile(source, await fresh.evaluate(async (doc) => {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 100;
      canvas.getContext("2d").fillRect(0, 0, 200, 100);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      doc.attachments = [await window.SingleHtmlFormat.fileToAttachment(new File([blob], "pic.png", { type: "image/png" }), "img1")];
      return window.SingleHtmlFormat.buildPortableHtml(doc);
    }, literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Captions", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    const row = (id) => fresh.locator(`#blocks .block[data-id="${id}"]`);
    const state = () => fresh.evaluate(() => {
      const out = {};
      document.querySelectorAll("#blocks .block").forEach((node) => {
        const caption = node.querySelector(".block-caption");
        out[node.dataset.id] = {
          tableLabel: node.dataset.tableLabel ?? null,
          label: caption?.querySelector(".block-caption-label")?.textContent ?? null,
          value: caption?.querySelector(".block-caption-input")?.value ?? null,
          // 題名が本文(表・図)の上か下か
          above: caption ? caption.getBoundingClientRect().top < node.querySelector(".editor-table, .chart-canvas, .image-attachment-card, .block-content").getBoundingClientRect().top : null,
          disabled: caption?.querySelector(".block-caption-input")?.disabled ?? null,
        };
      });
      return out;
    });
    const addCaption = async (id, text) => {
      await row(id).hover();
      await row(id).locator(".drag-grip").click();
      await fresh.locator('#block-menu [data-action="caption"]').click();
      await fresh.waitForTimeout(100);
      const focused = await fresh.evaluate((blockId) => document.activeElement?.closest?.(".block")?.dataset.id === blockId
        && document.activeElement.classList.contains("block-caption-input"), id);
      if (text) await fresh.keyboard.type(text);
      await fresh.keyboard.press("Enter");
      await fresh.waitForTimeout(150);
      return focused;
    };

    // 1) 題名の無い表の隅の呼び名は「題名なし」(番号は持たない。v193)
    const initial = await state();
    result.untitledTablesShowParenLabel = initial.t1?.tableLabel === "題名なし" && initial.t2?.tableLabel === "題名なし"
      && initial.t1?.label === null;

    // 2) メニューの「題名を付ける」で欄が出てそこへ移る。打つと番号が付き、隅の呼び名は消える
    const focused = await addCaption("t2", "試験条件");
    const afterTable = await state();
    result.menuAddsCaptionAndFocuses = focused;
    result.tableCaptionNumbered = afterTable.t2?.label === "表1:" && afterTable.t2?.value === "試験条件"
      && afterTable.t2?.tableLabel === null && afterTable.t1?.tableLabel === "題名なし";
    result.tableCaptionAboveTable = afterTable.t2?.above === true;
    // 表の題名は表のすぐ上に付き、上のブロック(ここでは別の表)より下の表に近い(ユーザー指摘「上の表のことか
    // 下の表のことか分からない」。列の記号の帯は題名の上へ移した)。
    const gaps = await fresh.evaluate(() => {
      const caption = document.querySelector('#blocks .block[data-id="t2"] .block-caption-label');
      const range = document.createRange();
      range.selectNodeContents(caption);
      const text = range.getBoundingClientRect();
      const own = document.querySelector('#blocks .block[data-id="t2"] .editor-table').getBoundingClientRect();
      const previous = document.querySelector('#blocks .block[data-id="t1"] .editor-table').getBoundingClientRect();
      return { below: own.top - text.bottom, above: text.top - previous.bottom };
    });
    // 間隔は OS の書体の高さで 1〜2px 変わる(Windows は 11px / 24px、Linux の Noto・DejaVu は 13px / 25px。v278)。
    // 確かめたいのは「題名が上のブロックより下の表に寄っている」ことなので、書体の差の分だけ許す。
    result.tableCaptionHugsItsTable = gaps.below <= 14 && gaps.above >= gaps.below * 1.8;
    result.tableCaptionGapEvidence = gaps;
    // セルを編集している間だけ、題名と表のあいだに列の記号(A・B)が出る(ユーザー指示「A は題名と表のあいだ」)。
    // 題名が上へずれて場所を空け、表そのものは動かない(ドラッグで範囲を選ぶ途中にずれない)。編集を終えると戻る。
    const editGeometry = () => fresh.evaluate(() => {
      const row = document.querySelector('#blocks .block[data-id="t2"]');
      const range = document.createRange();
      range.selectNodeContents(row.querySelector(".block-caption-label"));
      const caption = range.getBoundingClientRect();
      const table = row.querySelector(".editor-table").getBoundingClientRect();
      const letter = [...row.querySelectorAll(".table-axis-label.column")].find((node) => node.textContent === "A")?.getBoundingClientRect();
      return { captionBottom: caption.bottom, tableTop: table.top, letterMid: letter ? (letter.top + letter.bottom) / 2 : null };
    });
    const idle = await editGeometry();
    await row("t2").locator(".editor-table td").first().click();
    await fresh.waitForTimeout(250);
    const editing = await editGeometry();
    await fresh.locator("#blocks .block-content", { hasText: "CAP intro" }).click();
    await fresh.waitForTimeout(250);
    const after = await editGeometry();
    result.columnLettersBetweenCaptionAndTable = editing.letterMid !== null
      && editing.letterMid > editing.captionBottom && editing.letterMid < editing.tableTop;
    result.editingDoesNotMoveTable = Math.abs(editing.tableTop - idle.tableTop) < 1;
    result.captionReturnsAfterEditing = after.letterMid === null && Math.abs(after.captionBottom - idle.captionBottom) < 1;
    result.captionEditingEvidence = { idle, editing, after };

    // 3) グラフと画像は「図」。題名は図の下
    await addCaption("g1", "温度変化");
    await addCaption("im", "外観");
    const afterFigures = await state();
    result.figureCaptionsNumbered = afterFigures.g1?.label === "図1:" && afterFigures.im?.label === "図2:";
    result.figureCaptionsBelow = afterFigures.g1?.above === false && afterFigures.im?.above === false;

    // 4) 並べ替えると番号が振り直される(画像をグラフの上へ)
    await row("im").hover();
    await row("im").locator(".drag-grip").click();
    await fresh.locator('#block-menu [data-action="moveup"]').click();
    await fresh.waitForTimeout(200);
    const afterMove = await state();
    result.renumberAfterMove = afterMove.im?.label === "図1:" && afterMove.g1?.label === "図2:";

    // 5) 空のまま離れると題名の欄ごと外れる(番号も付かない)
    await addCaption("t1", "");
    const afterEmpty = await state();
    result.emptyCaptionRemoved = afterEmpty.t1?.label === null && afterEmpty.t1?.value === null && afterEmpty.t1?.tableLabel === "題名なし"
      && afterEmpty.t2?.label === "表1:";

    // 6) Undo で題名の入力が戻る
    await fresh.locator("#blocks .block-content", { hasText: "CAP end" }).click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const afterUndo = await state();
    // 直前の操作(並べ替え)が戻る → 図の番号も戻る
    result.undoRestoresOrderAndNumbers = afterUndo.g1?.label === "図1:" && afterUndo.im?.label === "図2:";

    // 7) 番号は文書全体の通し: 2ページ目の表は「表2」
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Second" }).click();
    await fresh.waitForTimeout(300);
    const second = await state();
    result.numbersAreDocumentWide = second.t3?.label === "表2:" && second.t3?.value === "二枚目の表";
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Captions" }).click();
    await fresh.waitForTimeout(300);

    // 8) 保存HTMLに同じ番号で出る(表の題名は表の直前、図の題名は図の後ろ)。読み直すと題名が残る。形式は 0.8.3 から(今は 0.8.6)
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const saved = join(DOWNLOADS, "captions-saved.html");
    await (await download).saveAs(saved);
    const html = await readFile(saved, "utf8");
    const exported = await fresh.evaluate((text) => {
      const view = new DOMParser().parseFromString(text, "text/html");
      const captions = [...view.querySelectorAll(".doc-caption")].map((node) => node.textContent);
      const tableCaption = view.querySelector(".doc-caption-table");
      const chartCaption = view.querySelector(".doc-chart .doc-caption-figure");
      const imageCaption = view.querySelector("figure.image-attachment .doc-caption-figure");
      const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
      const blocks = parsed.pages.flatMap((page) => page.blocks);
      const manifest = JSON.parse(view.querySelector("#document-manifest").textContent);
      return {
        captions,
        tableBeforeTable: tableCaption?.nextElementSibling?.tagName === "TABLE",
        chartAfterCanvas: chartCaption?.previousElementSibling?.classList.contains("doc-chart-canvas") === true,
        imageAfterImg: imageCaption?.previousElementSibling?.tagName === "IMG",
        roundTrip: Object.fromEntries(blocks.filter((block) => block.caption !== undefined).map((block) => [block.id, block.caption])),
        version: manifest.formatVersion,
      };
    }, html);
    result.savedHtmlShowsNumbers = ["表1: 試験条件", "図1: 温度変化", "図2: 外観", "表2: 二枚目の表"].every((text) => exported.captions.includes(text));
    result.savedCaptionPlacement = exported.tableBeforeTable && exported.chartAfterCanvas && exported.imageAfterImg;
    result.captionsRoundTrip = exported.roundTrip.t2 === "試験条件" && exported.roundTrip.g1 === "温度変化"
      && exported.roundTrip.t3 === "二枚目の表" && !("t1" in exported.roundTrip) && exported.version === FORMAT_VERSION;
    result.captionEvidence = exported;

    // 9) 題名は利用者の文字のまま(HTML として解釈しない)
    result.captionIsEscaped = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "X", title: "X", blocks: [
        { id: "tx", type: "table", text: "", caption: "<img src=x onerror=alert(1)>", rows: [[{ text: "1" }]] },
      ] }], fonts: [], attachments: [] });
      const view = new DOMParser().parseFromString(html, "text/html");
      return view.querySelectorAll("main img").length === 0 && view.querySelector(".doc-caption")?.textContent.includes("<img");
    });

    // 10) ロック中のページでは題名を編集できない
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(200);
    const locked = await state();
    result.lockedCaptionDisabled = locked.t2?.disabled === true && locked.g1?.disabled === true;
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(200);

    // 11) グラフの設定欄の表の呼び名も同じ(題名のある表は「表n: 題名」、無い表は「題名なしの表(1行目: …)」。v193)
    await row("g1").hover();
    await row("g1").locator(".drag-grip").click();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(300);
    const paneOptions = await fresh.evaluate(() => [...document.querySelectorAll("#chart-pane-table option")].map((option) => option.textContent));
    result.chartPaneUsesTableLabels = paneOptions.some((text) => text.startsWith("表1: 試験条件")) && paneOptions.some((text) => text.startsWith("題名なしの表") && text.includes("(1行目: "));
    result.chartPaneEvidence = paneOptions;
  } finally {
    await fresh.close();
  }
  return result;
}
