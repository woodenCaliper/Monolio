// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 段組みの列の数の上限(v262。Issue #142) ----
// 上限は fmt.MAX_COLUMNS(8)の1か所。以前は 3 で、列を作るドラッグ(canCreateColumn)と開くときの寄せ
// (normalizeColumnLayouts)にそれぞれ 3 が書かれていた。
//  1) 7 列の文書は 7 列のまま開ける(以前は 4 列目より右が 3 列目の下に寄った)
//  2) 7 列の右端へドラッグすると 8 列になる
//  3) 8 列の右端へドラッグしても 9 列目は作らず、その列の中へ入る。ドラッグ中も「右に列を作る」印(.drop-right)を出さない
//     (落とした後の形は、開くときの寄せでも 8 列に戻るので、印で canCreateColumn を見る)
//  4) 10 列の文書は 9・10 列目の中身が 8 列目の下に並び(文字は消えない)、保存すると 8 列になる
// 画面(メモリ上の文書を描いたもの)と、保存→読み直しの両方で見る。
export default async function columnLimitSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const openLiteral = async (blocks) => {
      const literal = { title: "ColumnLimit", fonts: [], attachments: [], pages: [{ id: "CL1", title: "ColumnLimit", blocks }] };
      const source = join(OUT, "column-limit-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), blocks[0].id, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 列 n 個の段組み(各列に「col<n>」の段落1つ)と、その外の段落
    const columnBlocks = (count) => [
      ...Array.from({ length: count }, (_, index) => ({
        id: "c" + index, type: "paragraph", text: "col" + index, columnGroup: "g1", columnIndex: index, columnWidth: index + 1,
      })),
      { id: "out", type: "paragraph", text: "Outside block" },
    ];
    // 画面の段組み: 列ごとの本文の並び
    const screenColumns = () => fresh.evaluate(() => {
      const layout = document.querySelector("#blocks .column-layout");
      return layout ? [...layout.querySelectorAll(":scope > .column")]
        .map((column) => [...column.querySelectorAll(".block")].map((row) => row.querySelector(".block-content")?.textContent ?? "")) : [];
    });
    // 保存して読み直した文書の、本文と列番号の並び
    const savedModel = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "column-limit-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      await fresh.waitForTimeout(150);
      const html = await readFile(path, "utf8");
      return fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages[0].blocks.map((block) => block.text + (block.columnGroup ? ":" + block.columnIndex + "/" + block.columnWidth : ""));
      }, html);
    };
    // 右端までドラッグして、離す前に「右に列を作る」印が出ているかを返す(離して終える)
    const rightMarkWhileDragging = async (sourceText, targetText) => {
      const source = fresh.locator(".block", { hasText: sourceText }).locator(".drag-grip");
      const target = fresh.locator(".block", { hasText: targetText });
      const sourceRect = await source.boundingBox();
      const targetRect = await target.boundingBox();
      if (!sourceRect || !targetRect) return null;
      await fresh.mouse.move(sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(targetRect.x + targetRect.width - 2, targetRect.y + targetRect.height / 2, { steps: 16 });
      const marked = await target.evaluate((row) => row.classList.contains("drop-right"));
      await fresh.mouse.up();
      return marked;
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const range = (count) => Array.from({ length: count }, (_, index) => index);

    result.columnLimitIsEight = await fresh.evaluate(() => window.SingleHtmlFormat.MAX_COLUMNS === 8);

    // 1) 7 列の文書はそのまま開ける
    await openLiteral(columnBlocks(7));
    result.sevenColumnDocumentStaysSeven = same(await screenColumns(), range(7).map((index) => ["col" + index]));

    // 2) 7 列の右端へドラッグすると 8 列
    result.rightMarkShownBelowLimit = await rightMarkWhileDragging("Outside block", "col6") === true;
    result.eighthColumnCanBeCreated = same(await screenColumns(), [...range(7).map((index) => ["col" + index]), ["Outside block"]]);

    // 3) 8 列の右端へドラッグしても 9 列目は作らない(その列の中へ入る)
    await openLiteral(columnBlocks(8));
    result.rightMarkHiddenAtLimit = await rightMarkWhileDragging("Outside block", "col7") === false;
    const afterNinth = await screenColumns();
    result.ninthColumnIsPrevented = afterNinth.length === 8 && afterNinth[7].includes("col7") && afterNinth[7].includes("Outside block");

    // 4) 10 列の文書: 9・10 列目は 8 列目の下に並ぶ。保存すると 8 列(幅は 8 列目までの値のまま)
    await openLiteral(columnBlocks(10));
    result.tenColumnDocumentFoldsIntoEight = same(await screenColumns(), [...range(7).map((index) => ["col" + index]), ["col7", "col8", "col9"]]);
    result.tenColumnDocumentSavesAsEight = same(await savedModel(), [
      ...range(10).map((index) => "col" + index + ":" + Math.min(index, 7) + "/" + (Math.min(index, 7) + 1)),
      "Outside block",
    ]);
  } finally {
    await fresh.close();
  }
  return result;
}
