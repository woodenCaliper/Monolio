// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- 表の列幅(ドラッグ+ダブルクリック自動調整。Excel/スプレッドシート風) ----
// 列境界の数px内だけが幅変更で、隣の列は不変(独立リサイズ=表全体の幅が変わる)。
export default async function colWidthSuite({ context }) {
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
    const cellRect = (r, c) => fresh.evaluate((selector) => {
      const td = document.querySelector(selector);
      if (!td) return null;
      const rect = td.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    }, cellSelector(r, c));
    const useTool = async (tool, r, c) => {
      await fresh.locator(cellSelector(r, c)).click();
      await fresh.waitForTimeout(200);
      await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
      await fresh.waitForTimeout(260);
    };

    // セパレータ(列の右端に重なる縦帯)を掴む。アクティブなセルがあるときに出る
    // (行・列選択ハンドルと同じ流儀)ので、先にセルをクリックしてから触る。
    const resizerBox = async (col) => {
      await fresh.locator(cellSelector(0, 0)).click();
      await fresh.waitForTimeout(200);
      return fresh.evaluate((c) => {
        const node = document.querySelector('#blocks .block .table-col-resizer[data-col="' + c + '"]');
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        // 掴み点は帯の上端寄りにする。アクティブセルの右下角はフィルハンドル
        // (z-index が上)が優先で、そこを掴むとフィルになる(Excel と同じ優先順位)。
        return { x: rect.left + rect.width / 2, y: rect.top + 10 };
      }, col);
    };
    const dragResizer = async (col, dx) => {
      const at = await resizerBox(col);
      await fresh.mouse.move(at?.x ?? 0, at?.y ?? 0);
      await fresh.mouse.down();
      await fresh.mouse.move((at?.x ?? 0) + dx, at?.y ?? 0, { steps: 6 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(250);
    };

    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/table");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await setCell(0, 0, "col0");
    await setCell(0, 1, "col1");
    await setCell(1, 0, "とても長いテキストで自動調整の幅を確かめるための行");
    await setCell(1, 1, "短い");

    // セパレータは col-resize カーソルの separator ロール。ドラッグで対象列だけが
    // +80px、隣は不変(=表全体の幅が変わる独立リサイズ)。
    const before0 = (await cellRect(0, 0)).width;
    const before1 = (await cellRect(0, 1)).width;
    const sepState = await (async () => {
      await fresh.locator(cellSelector(0, 0)).click();
      await fresh.waitForTimeout(200);
      return fresh.evaluate(() => {
        const node = document.querySelector('#blocks .block .table-col-resizer[data-col="0"]');
        if (!node) return null;
        return { cursor: getComputedStyle(node).cursor, role: node.getAttribute("role") };
      });
    })();
    await dragResizer(0, 80);
    const after0 = (await cellRect(0, 0)).width;
    const after1 = (await cellRect(0, 1)).width;
    result.colResizeDragWidensOnlyTarget = sepState?.cursor === "col-resize"
      && sepState?.role === "separator"
      && Math.abs(after0 - (before0 + 80)) <= 4
      && Math.abs(after1 - before1) <= 3;

    // 幅変更1回 = Undo 1手で戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.colResizeUndoSingleStep = Math.abs((await cellRect(0, 0)).width - before0) <= 4;

    // 最小幅より狭くは潰れない。
    await dragResizer(0, -500);
    const narrowed = (await cellRect(0, 0)).width;
    result.colResizeMinWidth = narrowed >= 44 && narrowed <= 62;

    // セパレータのダブルクリックで最長セル内容にフィット(折り返しが解けて1行に)。
    const tallBefore = (await cellRect(1, 0)).height;
    const sep = await resizerBox(0);
    await fresh.mouse.dblclick(sep?.x ?? 0, sep?.y ?? 0);
    await fresh.waitForTimeout(300);
    const fitted = await cellRect(1, 0);
    result.colResizeDoubleClickFits = fitted.width > narrowed + 40
      && fitted.height < tallBefore;

    // 矢印キーでも幅を変えられる(セパレータにフォーカスして ArrowRight)。
    const beforeKey = (await cellRect(0, 0)).width;
    await fresh.locator(cellSelector(0, 0)).click();
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => document.querySelector('#blocks .block .table-col-resizer[data-col="0"]')?.focus());
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(200);
    result.colResizeKeyboardAdjusts = Math.abs((await cellRect(0, 0)).width - (beforeKey + 16)) <= 3;

    // 競合しない: セル中央からのドラッグは従来どおりセル範囲選択(幅は不変)。
    const beforeSelDrag = (await cellRect(0, 1)).width;
    const from = await cellRect(1, 0);
    const to = await cellRect(1, 1);
    await fresh.mouse.move((from.left + from.right) / 2, (from.top + from.bottom) / 2);
    await fresh.mouse.down();
    await fresh.mouse.move((to.left + to.right) / 2, (to.top + to.bottom) / 2, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    const selCount = await fresh.evaluate(() => document.querySelectorAll("#blocks .editor-table .cell-selected").length);
    // 競合しない: 式編集中でもセパレータのドラッグは幅変更で、参照は挿入されない。
    await fresh.locator(cellSelector(2, 2)).click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("=");
    const sep2 = await fresh.evaluate(() => {
      const node = document.querySelector('#blocks .block .table-col-resizer[data-col="0"]');
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + 10 };
    });
    const formulaWidthBefore = (await cellRect(0, 0)).width;
    await fresh.mouse.move(sep2?.x ?? 0, sep2?.y ?? 0);
    await fresh.mouse.down();
    await fresh.mouse.move((sep2?.x ?? 0) + 28, sep2?.y ?? 0, { steps: 4 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    const formulaText = await fresh.evaluate((selector) => document.querySelector(selector)?.textContent, cellSelector(2, 2));
    result.colResizeAvoidsOtherGestures = selCount === 2
      && Math.abs((await cellRect(0, 1)).width - beforeSelDrag) <= 3
      && formulaText === "="
      && Math.abs((await cellRect(0, 0)).width - (formulaWidthBefore + 28)) <= 4
      && (await fresh.evaluate(() => document.querySelectorAll("#blocks .editor-table .ref-preview").length)) === 0;
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(150);

    // 列の挿入で幅の配列がずれない(既存列は自分の幅を保ったまま右へ動く)。
    const keepWidth = (await cellRect(0, 0)).width;
    await useTool("col-before", 0, 0);
    result.colResizeKeepsWidthsAcrossColumnInsert = Math.abs((await cellRect(0, 1)).width - keepWidth) <= 3;

    // モデル保存とラウンドトリップ: colgroup が焼き込まれ、開き直しで columnWidths が戻る。
    const exported = await fresh.evaluate(() => {
      const cell = (text) => ({ text, colSpan: 1, rowSpan: 1 });
      const table = {
        id: "width-probe", type: "table", text: "", tableColumnWidths: [200, 100, 100],
        rows: [
          [cell("a"), cell("b"), cell("c")],
          [cell("1"), cell("2"), cell("3")],
        ],
      };
      const html = window.SingleHtmlFormat.buildPortableHtml({ title: "width-probe", blocks: [table], fonts: [], attachments: [] });
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const back = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.type === "table");
      return { html, widthsBack: JSON.stringify(back?.tableColumnWidths) };
    });
    const viewer = await context.newPage();
    let exportedWidth = null;
    try {
      await viewer.setContent(exported.html, { waitUntil: "domcontentloaded" });
      exportedWidth = await viewer.evaluate(() => (
        document.querySelector(".doc-table td")?.getBoundingClientRect().width ?? null
      ));
    } finally {
      await viewer.close();
    }
    // v231: 印刷で紙の幅に収めるための割合(--doc-col-pct)も一緒に書く。
    result.colResizePersistsRoundtrip = exported.html.includes('<col style="width:200px;--doc-col-pct:50%">')
      && exported.widthsBack === "[200,100,100]"
      && exportedWidth !== null && Math.abs(exportedWidth - 200) <= 4;

    return result;
  } finally {
    await fresh.close();
  }
}
