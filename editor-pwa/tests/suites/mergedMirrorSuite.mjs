// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, insertBlock } from "../lib.mjs";

// ---- セル結合の新モデル: ミラー(書き込みの整合)・解除・移行・往復・ポイントモード ----
export default async function mergedMirrorSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const cellSelector = (r, c) => '#blocks .block.type-table .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
    const setCell = async (r, c, text) => {
      await fresh.evaluate(([selector, value]) => {
        const td = document.querySelector(selector);
        if (!td) return;
        td.focus();
        td.textContent = value;
        td.dispatchEvent(new Event("input", { bubbles: true }));
        td.blur();
      }, [cellSelector(r, c), text]);
      await fresh.waitForTimeout(70);
    };
    const dispCell = (r, c) => fresh.evaluate((selector) => (
      document.querySelector(selector)?.textContent ?? null
    ), cellSelector(r, c));
    const rawCell = (r, c) => fresh.evaluate((selector) => {
      const td = document.querySelector(selector);
      if (!td) return null;
      return td.classList.contains("formula-cell") && td.title ? td.title : td.textContent;
    }, cellSelector(r, c));
    const useTool = async (tool, r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
    };
    const dragCells = async (a, b) => {
      const box = await fresh.evaluate(([s1, s2]) => {
        const one = document.querySelector(s1)?.getBoundingClientRect();
        const two = document.querySelector(s2)?.getBoundingClientRect();
        if (!one || !two) return null;
        return {
          from: { x: one.left + one.width / 2, y: one.top + one.height / 2 },
          to: { x: two.left + two.width / 2, y: two.top + two.height / 2 },
        };
      }, [cellSelector(a[0], a[1]), cellSelector(b[0], b[1])]);
      if (!box) return;
      await fresh.mouse.move(box.from.x, box.from.y);
      await fresh.mouse.down();
      await fresh.mouse.move(box.to.x, box.to.y, { steps: 6 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(250);
    };
    const clickMerge = async () => {
      await fresh.evaluate(() => document.querySelector('#table-toolbar .table-tool[data-tool="merge"]')?.click());
      await fresh.waitForTimeout(250);
    };

    // 4行3列。A1=7、B3=SUM(A1:A2)。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await useTool("row-after", 2, 0);
    await setCell(0, 0, "7");
    await setCell(2, 1, "=SUM(A1:A2)");
    const sumBefore = await dispCell(2, 1);

    // 結合しても(値が1つなら)範囲集計は見た目どおり変わらない。
    await dragCells([0, 0], [1, 0]);
    await clickMerge();
    result.mergeKeepsSingleValueAggregate = sumBefore === "7" && (await dispCell(2, 1)) === "7";

    // 編集のミラー: 本体を書き換えると、メンバー座標への参照も同じ値になる。
    await setCell(1, 2, "=A2");
    await setCell(0, 0, "9");
    result.mirrorOnEditReachesMembers = (await dispCell(1, 2)) === "9";

    // 置換のミラー: 置換(すべて置換)で書き換えた値もメンバーへ届く。
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => {
      const input = document.querySelector("#search-input");
      input.focus();
      input.select();
    });
    await fresh.keyboard.type("9");
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => {
      const input = document.querySelector("#search-replace-input");
      input.focus();
      input.select();
    });
    await fresh.keyboard.type("12");
    await fresh.waitForTimeout(150);
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    result.mirrorOnReplaceReachesMembers = (await dispCell(0, 0)) === "12"
      && (await dispCell(1, 2)) === "12";

    // 保存経路のミラー: アプリで結合・編集した表を保存すると、manifest の
    // メンバー(covered)にも本体と同じ値が入っている(正規化=書き込みの共通出口が
    // 常にミラーしている直接の証拠。旧文書はここが空だった)。
    const savePromise = fresh.waitForEvent("download", { timeout: 8000 });
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+S");
    const savedFile = await savePromise;
    const savedPath = join(DOWNLOADS, "merged-mirror-probe.html");
    await savedFile.saveAs(savedPath);
    const savedHtml = await readFile(savedPath, "utf8");
    result.mergedModelSavesMemberValues = await fresh.evaluate((html) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const table = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.type === "table");
      const member = table?.rows?.[1]?.[0];
      return member?.covered === true && member?.text === "12";
    }, savedHtml);

    // 色のミラー(解除後に両方へ残ることは後段で確認)。
    await fresh.locator(cellSelector(0, 0)).click();
    await fresh.waitForTimeout(200);
    await fresh.locator("#format-background-trigger").click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#format-background-options .color-swatch").nth(3).click();
    await fresh.waitForTimeout(250);

    // remap のミラー: 結合セルの式も、行の挿入で全メンバーが同じ形に追随する。
    await dragCells([0, 1], [1, 1]);
    await clickMerge();
    await setCell(0, 1, "=A1");
    await useTool("row-before", 0, 0);

    // 解除: 各メンバーに同じ値・色が残り、参照も生きる(集計は見た目どおり
    // 2セルぶんになる)。
    await useTool("split", 1, 0);
    await useTool("split", 1, 1);
    result.unmergeKeepsValuesAndRefs = (await dispCell(1, 0)) === "12"
      && (await dispCell(2, 0)) === "12"
      && (await dispCell(2, 2)) === "12"
      && (await dispCell(3, 1)) === "24";
    result.mirrorOnRemapReachesMembers = (await rawCell(1, 1)) === "=A2"
      && (await rawCell(2, 1)) === "=A2";
    result.mirrorOnColorReachesMembers = await fresh.evaluate(([s1, s2]) => {
      const one = document.querySelector(s1);
      const two = document.querySelector(s2);
      if (!one || !two) return false;
      const a = getComputedStyle(one).backgroundColor;
      const b = getComputedStyle(two).backgroundColor;
      return a === b && a !== "rgba(0, 0, 0, 0)";
    }, [cellSelector(1, 0), cellSelector(2, 0)]);

    // ポイントモードは格子を見る: 結合セルの左半分をクリックすれば A1、
    // 右半分なら B1 が入る(ナビゲーションは従来どおり結合=1セルのまま)。
    await dragCells([0, 0], [0, 1]);
    await clickMerge();
    await fresh.locator(cellSelector(0, 2)).click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("=");
    const mergedRect = await fresh.evaluate((selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { left: rect.left, width: rect.width, y: rect.top + rect.height / 2 } : null;
    }, cellSelector(0, 0));
    await fresh.mouse.click(mergedRect.left + mergedRect.width * 0.25, mergedRect.y);
    await fresh.waitForTimeout(200);
    const leftInsert = await dispCell(0, 2);
    await fresh.mouse.click(mergedRect.left + mergedRect.width * 0.75, mergedRect.y);
    await fresh.waitForTimeout(200);
    const rightInsert = await dispCell(0, 2);
    result.mergedPointModeUsesGridCoordinate = leftInsert === "=A1" && rightInsert === "=B1";
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(150);

    // 保存・往復: 新モデルの manifest はメンバーにも値を持ち、parse がそれを
    // 落とさずに返す(値入り covered の許容)。
    result.mergedRoundtripKeepsMemberValues = await fresh.evaluate(() => {
      const cell = (text, extra = {}) => ({ text, colSpan: 1, rowSpan: 1, ...extra });
      const table = {
        id: "mirror-roundtrip", type: "table", text: "",
        rows: [
          [cell("5", { rowSpan: 2 }), cell("x")],
          [cell("5", { covered: true }), cell("y")],
        ],
      };
      const html = window.SingleHtmlFormat.buildPortableHtml({ title: "m", blocks: [table], fonts: [], attachments: [] });
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const back = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.type === "table");
      return back?.rows?.[1]?.[0]?.text === "5" && back?.rows?.[1]?.[0]?.covered === true;
    });

    // 旧文書の移行: covered が空の古い保存HTMLを開くと、読み込みの正規化で
    // 本体値がメンバーへ複製される(解除しても値が失われない)。
    const legacyHtml = await fresh.evaluate(() => {
      const cell = (text, extra = {}) => ({ text, colSpan: 1, rowSpan: 1, ...extra });
      const table = {
        id: "legacy-merge", type: "table", text: "",
        rows: [
          [cell("5", { rowSpan: 2 }), cell("x")],
          [cell("", { covered: true }), cell("y")],
        ],
      };
      return window.SingleHtmlFormat.buildPortableHtml({ title: "legacy", blocks: [table], fonts: [], attachments: [] });
    });
    const legacyPath = join(OUT, "legacy-merge.html");
    await writeFile(legacyPath, legacyHtml, "utf8");
    await fresh.locator("#open-input").setInputFiles(legacyPath);
    await fresh.waitForTimeout(400);
    await useTool("split", 0, 0);
    result.legacyCoveredMigratesOnLoad = (await dispCell(0, 0)) === "5"
      && (await dispCell(1, 0)) === "5";

    return result;
  } finally {
    await fresh.close();
  }
}
