// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FONT_FIXTURE, FONT_FAMILY, OUT, PORT, openMenu } from "../lib.mjs";

// ---- データが消える・保存できない不具合(v247。探索的なデバッグで見つけたもの。ユーザー指示「あなたの側で、順番に直していってほしい」) ----
// 1) Issue #111: 添付の記録(sha256)が中身と合わないファイルは、黙って開けるのに保存の前の検査で毎回止まり、二度と保存できなかった。
//    いまは開いたときに記録を中身に合わせて直し、そう知らせる。大文字の16進は正しい値として受ける。size の誤りも直す。
// 2) Issue #112: 本文の html が <font face> で埋め込みフォントを指すファイルを保存すると、フォントと添付が黙って消えた。
// 3) Issue #88: Ctrl+A を2回(ページ全体の選択)のあと日本語を入力すると、題名が置き換わり Undo でも戻らなかった。
//    いまは選択の直前にいたブロックへ戻ってから入力する。
// 4) Issue #80: 行・列をドラッグで動かすと、表の外まで伸びた範囲(A1:A10・1:20・A:Z)の式とグラフが NaN に壊れた。
// 5) Issue #117: Undo のあと見えないセルの範囲が残り、Delete で見えていないセルが消えた。いまは範囲を見えるように塗り直し、
//    範囲の外のセルで押したキーは範囲に効かない。
export default async function dataLossFixSuite({ browser }) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 860 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  let opened = 0;
  const openHtml = async (html, title) => {
    const path = join(OUT, "data-loss-fix-" + (opened += 1) + ".html");
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const openDoc = async (literal) => openHtml(await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), literal.pages[0].title);
  const status = () => fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
  let saved = 0;
  // Ctrl+S → 保存できたら manifest を返す(できなければ null)。
  const save = async () => {
    const download = fresh.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await fresh.keyboard.press("Control+s");
    const file = await download;
    if (!file) return null;
    const path = join(DOWNLOADS, "data-loss-fix-saved-" + (saved += 1) + ".html");
    await file.saveAs(path);
    return fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), await readFile(path, "utf8"));
  };
  const typeAtEnd = async (id, text) => {
    await fresh.locator('#blocks .block-content[data-id="' + id + '"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(text);
    await fresh.waitForTimeout(150);
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // ---- 1) #111 添付の記録が中身と合わないファイル ----
    const attachmentCases = {
      zeros: (a) => ({ ...a, sha256: "0".repeat(64) }),
      missing: (a) => { const { sha256, ...rest } = a; return rest; },
      upper: (a) => ({ ...a, sha256: a.sha256.toUpperCase() }),
      size: (a) => ({ ...a, size: 999999 }),
    };
    const attachmentResults = {};
    for (const [name, mutate] of Object.entries(attachmentCases)) {
      const title = "Att " + name;
      const html = await fresh.evaluate(async (title) => {
        const fmt = window.SingleHtmlFormat;
        const attachment = await fmt.fileToAttachment(new File([new TextEncoder().encode("a,b\n1,2\n")], "data.csv", { type: "text/csv" }), "att-1");
        return { html: fmt.buildPortableHtml({ pages: [{ id: "P1", title, blocks: [{ id: "a", type: "attachment", attachmentId: "att-1" }, { id: "p", type: "paragraph", text: "本文" }] }], fonts: [], attachments: [attachment] }), sha: attachment.sha256, size: attachment.size };
      }, title);
      // 添付の記録だけを書き換える(中身はそのまま)。
      const store = JSON.parse(html.html.match(/id="document-attachments">\n([\s\S]*?)\n<\/script>/)[1]);
      store.attachments = store.attachments.map(mutate);
      await openHtml(html.html.replace(/(id="document-attachments">\n)[\s\S]*?(\n<\/script>)/, (m, a, b) => a + JSON.stringify(store, null, 2) + b), title);
      const openStatus = await status();
      await typeAtEnd("p", "を編集した");
      const doc = await save();
      const savedAttachment = doc?.attachments?.[0];
      attachmentResults[name] = {
        warned: openStatus.includes("中身に合わせて直しました"),
        saved: Boolean(doc),
        sha: savedAttachment ? savedAttachment.sha256.toLowerCase() === html.sha : false,
        size: savedAttachment?.size === html.size,
        text: doc?.pages?.[0]?.blocks?.find((block) => block.id === "p")?.text,
      };
    }
    const savedOk = (r) => r.saved && r.sha && r.size && r.text === "本文を編集した";
    result.attachmentMismatchOpensWithWarningAndSaves = attachmentResults.zeros.warned && savedOk(attachmentResults.zeros)
      && attachmentResults.missing.warned && savedOk(attachmentResults.missing);
    result.attachmentUppercaseShaIsAccepted = !attachmentResults.upper.warned && savedOk(attachmentResults.upper);
    result.attachmentWrongSizeIsCorrected = savedOk(attachmentResults.size);
    result.attachmentRecordEvidence = JSON.stringify(attachmentResults);

    // ---- 2) #112 <font face> で埋め込みフォントを指すファイル ----
    const fontBytes = [...await readFile(FONT_FIXTURE)];
    await openHtml(await fresh.evaluate(async ({ fontBytes, family }) => {
      const fmt = window.SingleHtmlFormat;
      const attachment = await fmt.fileToAttachment(new File([new Uint8Array(fontBytes)], family + ".TTF", { type: "font/ttf" }), "font-att");
      return fmt.buildPortableHtml({ pages: [{ id: "P1", title: "Font face", blocks: [
        { id: "p", type: "paragraph", text: "埋め込み書体の文字", html: '<font face="' + family + '">埋め込み書体の文字</font>' },
      ] }], fonts: [{ id: "f1", family, attachmentId: "font-att" }], attachments: [attachment] });
    }, { fontBytes, family: FONT_FAMILY }), "Font face");
    const fontDoc = await save();
    result.fontFaceKeepsEmbeddedFont = fontDoc?.fonts?.length === 1 && fontDoc.fonts[0].family === FONT_FAMILY
      && fontDoc.attachments.length === 1;
    result.fontFaceEvidence = JSON.stringify({ fonts: fontDoc?.fonts, attachments: fontDoc?.attachments?.map((a) => a.name) });

    // ---- 3) #88 Ctrl+A 2回のあとの日本語入力 ----
    const cdp = await context.newCDPSession(fresh);
    const compose = async (text) => {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
      await fresh.waitForTimeout(50);
    };
    const imeKey = async (key, style) => {
      const event = { windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229, key: style === "mac" ? key : "Process", code: key };
      await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
      await fresh.waitForTimeout(80);
    };
    const imeResults = {};
    for (const style of ["win", "mac"]) {
      for (const firstKey of [false, true]) {
        await openDoc({ pages: [{ id: "P1", title: "My Title", blocks: [{ id: "a", type: "paragraph", text: "alpha" }, { id: "z", type: "paragraph", text: "omega" }] }], fonts: [], attachments: [] });
        await fresh.locator('#blocks .block-content[data-id="a"]').click();
        await fresh.keyboard.press("Control+a");
        await fresh.keyboard.press("Control+a");
        await fresh.waitForTimeout(150);
        const pageSelected = await fresh.evaluate(() => window.__lastSelectAllMode);
        // 実際の IME は変換の前に keyCode 229 のキーが来る(firstKey)。来ない並び(CDP の変換だけ)も確かめる。
        if (firstKey) await imeKey("n", style);
        for (const text of ["に", "にほ", "にほん", "日本"]) await compose(text);
        await imeKey("Enter", style);
        await cdp.send("Input.insertText", { text: "日本" });
        await fresh.waitForTimeout(150);
        imeResults[style + (firstKey ? "+key" : "")] = {
          pageSelected,
          title: await fresh.locator("#doc-title").textContent(),
          a: await fresh.locator('#blocks .block-content[data-id="a"]').textContent(),
          z: await fresh.locator('#blocks .block-content[data-id="z"]').textContent(),
        };
      }
    }
    result.pageSelectImeKeepsTitle = Object.values(imeResults).every((r) => r.pageSelected === "page" && r.title === "My Title" && r.z === "omega");
    result.pageSelectImeTypesWhereCaretWas = Object.values(imeResults).every((r) => r.a === "alpha日本");
    result.pageSelectImeEvidence = JSON.stringify(imeResults);

    // ---- 4) #80 行・列のドラッグと、表の外まで伸びた範囲 ----
    await openDoc({ pages: [{ id: "P1", title: "Line move", blocks: [
      { id: "t", type: "table", rows: [["1", "=SUM(A1:A10)", "=SUM(1:20)"], ["2", "", ""], ["3", "", ""], ["4", "", ""]].map((line) => line.map((text) => ({ text }))) },
      { id: "g", type: "chart", text: 'table(id="t")\nbar(A1:A10, A1:A10)' },
    ] }], fonts: [], attachments: [] });
    const raws = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table tr')]
      .map((tr) => [...tr.children].map((td) => (td.classList.contains("formula-cell") && td.title ? td.title : td.textContent)).join("|")).join("/"));
    const values = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table tr')]
      .map((tr) => [...tr.children].map((td) => td.textContent).join("|")).join("/"));
    // 2行目を行の取っ手のドラッグで最後へ動かす(tableMoveSuite と同じ操作)。
    await fresh.locator('#blocks .block[data-id="t"] [data-row="1"][data-cell="0"]').click();
    await fresh.waitForTimeout(150);
    const gripBox = await fresh.locator('#blocks .block[data-id="t"] .table-range-handle.row').boundingBox().catch(() => null);
    const lastRow = await fresh.locator('#blocks .block[data-id="t"] [data-row="3"][data-cell="0"]').boundingBox();
    if (gripBox && lastRow) {
      await fresh.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(gripBox.x + 3, lastRow.y + lastRow.height - 2, { steps: 10 });
      await fresh.waitForTimeout(120);
      await fresh.mouse.up();
      await fresh.waitForTimeout(300);
    }
    const movedRaws = await raws();
    const movedValues = await values();
    const chartDoc = await save();
    const chartText = chartDoc?.pages?.[0]?.blocks?.find((block) => block.id === "g")?.text;
    result.lineMoveKeepsRangesBeyondTable = movedRaws === "1|=SUM(A1:A10)|=SUM(1:20)/3||/4||/2||" && movedValues.startsWith("1|10|")
      && chartText === 'table(id="t")\nbar(A1:A10, A1:A10)';
    result.lineMoveEvidence = JSON.stringify({ gripFound: Boolean(gripBox), movedRaws, movedValues, chartText });

    // ---- 5) #117 Undo のあとの見えないセルの範囲 ----
    await openDoc({ pages: [{ id: "P1", title: "Undo range", blocks: [
      { id: "t", type: "table", rows: [["", "1"], ["a", "b"], ["c", "d"]].map((line) => line.map((text) => ({ text }))) },
    ] }], fonts: [], attachments: [] });
    const cellAt = (r, c) => fresh.locator('#blocks .block[data-id="t"] [data-row="' + r + '"][data-cell="' + c + '"]');
    await cellAt(0, 0).click();
    await fresh.keyboard.type("Q");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    await cellAt(1, 0).click();
    await cellAt(2, 1).click({ modifiers: ["Shift"] });
    await fresh.waitForTimeout(150);
    const rangeBefore = await fresh.evaluate(() => document.querySelectorAll("#blocks .cell-selected").length);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    // 範囲は Undo のあとも見えたまま(Excel と同じ。全画面の行の選択も Undo で解けない)。
    const rangeAfterUndo = await fresh.evaluate(() => document.querySelectorAll("#blocks .cell-selected").length);
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(250);
    const afterDelete = await values();
    result.undoKeepsRangeVisible = rangeBefore === 4 && rangeAfterUndo === 4;
    result.undoRangeIgnoresKeysOutside = afterDelete.split("/").slice(1).join("/") === "a|b/c|d";
    result.undoRangeEvidence = JSON.stringify({ rangeBefore, rangeAfterUndo, afterDelete });

    result.dataLossFixNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.dataLossFixPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
