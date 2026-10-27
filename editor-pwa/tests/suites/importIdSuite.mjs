// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 開いたファイルのブロック・ページ・段組みの id の検査(v159。PdM 依頼・TL 指摘) ----
// id は CSS セレクタ(data-id など)や HTML の属性へ連結される。細工した id を持つファイルを開いても、安全な形でない
// id と重複した id は振り直され、参照(ページのリンク・グラフの table(id=…)・段組みの組)が付け替わって使えること。
export default async function importIdSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const hostilePage2 = 'p2"],[data-id="x';
  const hostileTable = "t'],*{";
  const hostileGroup = 'cg"] .x';
  const literal = {
    pages: [
      {
        id: 'p1"],[x="1',
        title: "Hostile One",
        blocks: [
          { id: 'b"],[data-id="dup', type: "paragraph", text: "HOSTILE-A" },
          { id: "dup", type: "paragraph", text: "DUP-FIRST" },
          { id: "dup", type: "paragraph", text: "DUP-SECOND" },
          { id: hostileTable, type: "table", rows: [cells("x", "y"), cells("1", "1000"), cells("3", "2000")] },
          { id: "g-ok", type: "chart", text: 'table(id="' + hostileTable + '")\nscatter(A2:A3, B2:B3)' },
          { id: "c-left", type: "paragraph", text: "COL-LEFT", columnGroup: hostileGroup, columnIndex: 0 },
          // 列の番号も細工(data-column-index のセレクタに入る)。組の中で使われていない番号へ振り直され、別の列のまま。
          { id: "c-right", type: "paragraph", text: "COL-RIGHT", columnGroup: hostileGroup, columnIndex: '1"] .x' },
          { id: "link-2", type: "page", pageId: hostilePage2 },
          { id: "tail", type: "paragraph", text: "TAIL" },
        ],
      },
      { id: hostilePage2, title: "Hostile Two", blocks: [{ id: "q1", type: "paragraph", text: "ON PAGE TWO" }] },
      // 一度も開かないページ(描き直しの正規化を通らない)。列の番号の細工は、取り込み時の検査でしか消えない。
      {
        id: "page-three",
        title: "Hostile Three",
        blocks: [
          { id: "r1", type: "paragraph", text: "R-LEFT", columnGroup: "cg-three", columnIndex: 0 },
          { id: "r2", type: "paragraph", text: "R-RIGHT", columnGroup: "cg-three", columnIndex: "7\"] .y" },
        ],
      },
    ],
    fonts: [],
    attachments: [],
  };
  const safe = (value) => /^[A-Za-z0-9_-]{1,128}$/.test(String(value));
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "import-ids.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Hostile One", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    const rows = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => ({
      id: row.dataset.id,
      text: row.querySelector(".block-content")?.textContent ?? "",
      chart: row.querySelector(".chart-canvas")?.textContent ?? null,
    })));
    const ids = rows.map((row) => row.id);
    // すべてのブロックの id が安全な形で、重複しない。重複していた id の1つ目は元の id のまま。
    result.importedBlockIdsAreSafeAndUnique = ids.length === 9 && ids.every(safe) && new Set(ids).size === ids.length
      && rows.find((row) => row.text === "DUP-FIRST")?.id === "dup" && rows.find((row) => row.text === "DUP-SECOND")?.id !== "dup";
    // 振り直した表を、グラフが読み続ける(table(id=…) が付け替わっている)。
    const chartRow = rows.find((row) => row.chart !== null);
    result.importedChartStillReadsRenamedTable = Boolean(chartRow) && chartRow.chart.includes("2000")
      && !chartRow.chart.includes("見つかりません");
    // 段組みの組は1つのまま(組の全員が同じ新しい id)で、左右に並ぶ。列幅のつまみも探せる。
    result.importedColumnGroupIsSafeAndIntact = await fresh.evaluate(() => {
      const layouts = [...document.querySelectorAll("#blocks .column-layout")];
      if (layouts.length !== 1) return false;
      const group = layouts[0].dataset.columnGroup || "";
      const left = [...document.querySelectorAll("#blocks .block")].find((row) => row.textContent.includes("COL-LEFT"));
      const right = [...document.querySelectorAll("#blocks .block")].find((row) => row.textContent.includes("COL-RIGHT"));
      return /^[A-Za-z0-9_-]+$/.test(group) && Boolean(left && right)
        && Math.abs(left.getBoundingClientRect().top - right.getBoundingClientRect().top) < 2
        && left.getBoundingClientRect().left < right.getBoundingClientRect().left
        && [...layouts[0].querySelectorAll(".column")].every((column) => /^\d+$/.test(column.dataset.columnIndex || ""))
        && Boolean(document.querySelector('.column-layout[data-column-group="' + group + '"] .column-resizer'));
    });
    // 幅も変えられる(列幅のつまみにフォーカスして → キー)。
    const leftWidth = () => fresh.evaluate(() => document.querySelector("#blocks .column-layout .column")?.getBoundingClientRect().width ?? 0);
    const widthBefore = await leftWidth();
    await fresh.evaluate(() => document.querySelector("#blocks .column-layout .column-resizer")?.focus());
    await fresh.keyboard.press("ArrowRight");
    await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(250);
    result.importedColumnLayoutCanBeResized = (await leftWidth()) > widthBefore + 4;
    // 細工した id だったブロックも操作できる: ハンドルで選んで Delete → そのブロックだけが消える。
    const hostileRow = rows.find((row) => row.text === "HOSTILE-A");
    await fresh.locator('.block[data-id="' + hostileRow.id + '"]').hover();
    await fresh.locator('.block[data-id="' + hostileRow.id + '"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const afterDelete = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block .block-content")].map((el) => el.textContent));
    result.importedHostileBlockIsOperable = !afterDelete.includes("HOSTILE-A") && afterDelete.includes("DUP-FIRST")
      && afterDelete.includes("DUP-SECOND") && afterDelete.includes("TAIL");
    // 同じ id を持っていた2つのブロックは、別々に操作できる(2つ目を消すと、1つ目は残る)。
    const secondId = rows.find((row) => row.text === "DUP-SECOND").id;
    await fresh.locator('.block[data-id="' + secondId + '"]').hover();
    await fresh.locator('.block[data-id="' + secondId + '"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(300);
    const afterDupDelete = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block .block-content")].map((el) => el.textContent));
    result.importedDuplicateIdBlocksAreSeparate = !afterDupDelete.includes("DUP-SECOND") && afterDupDelete.includes("DUP-FIRST");
    // ページの id も安全な形になり、ページのリンクが振り直した id を辿れる。
    const pageIds = await fresh.evaluate(() => [...document.querySelectorAll("#page-tree-body .page-tree-item")].map((item) => item.dataset.pageId));
    await fresh.locator('.block[data-id="link-2"] .page-link').click();
    await fresh.waitForTimeout(400);
    const onPageTwo = await fresh.evaluate(() => ({
      title: document.querySelector("#doc-title")?.textContent,
      text: document.querySelector("#blocks")?.textContent ?? "",
    }));
    result.importedPageLinkFollowsRenamedPage = pageIds.length === 3 && pageIds.every(safe)
      && onPageTwo.title === "Hostile Two" && onPageTwo.text.includes("ON PAGE TWO");
    // 保存したファイルそのもの(読み直した結果ではなく)に、細工した id が残っていない(P13)。
    const download = fresh.waitForEvent("download");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "import-ids-saved.html");
    await (await download).saveAs(savedPath);
    const raw = await readFile(savedPath, "utf8");
    const parsed = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), raw);
    const savedIds = [...parsed.pages.map((page) => page.id), ...parsed.pages.flatMap((page) => page.blocks.map((block) => block.id))];
    result.savedFileHasNoHostileIds = !raw.includes("],[x=") && !raw.includes("],[data-id=") && !raw.includes("],*{") && !raw.includes("] .x") && !raw.includes("] .y") && savedIds.every(safe)
      && pageErrors.length === 0;
    return result;
  } finally {
    await fresh.close();
  }
}
