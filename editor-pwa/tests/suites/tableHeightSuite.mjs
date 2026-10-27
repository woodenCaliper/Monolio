// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 表を見せる高さ(v235。形式 0.8.12) ----
// ユーザー「表はかなり縦に長くなることがある…ブロックとして長く表示すると視認性が悪くなるため、たたんだり表示の長さを調整したりできる機能が欲しい」
// → 案A「表示の高さを決めて、中でスクロール」+「表示する高さは…ユーザーが調整できるように」、つまみは案1「下の端のつまみ」(ユーザー選択)。
// 表の下の端のつまみをドラッグすると高さ(block.viewHeight)が決まり、超える分は表の中でスクロールする(見出しの行は上に残る)。
// ダブルクリックで全部見せる。保存HTMLも同じ見え方で、印刷では全行。古いファイル(高さ無し)は全部見える。
export default async function tableHeightSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1100, height: 820 });
  const result = {};
  let saved = 0;
  const rows = [["No", "部品名", "数量"], ...Array.from({ length: 40 }, (_, index) => [String(index + 1), "部品 " + (index + 1), "=A" + (index + 2) + "*2"])];
  const literal = (extra = {}) => ({ pages: [{ id: "TH", title: "長い表", blocks: [
    { id: "intro", type: "paragraph", text: "前の段落" },
    { id: "t", type: "table", caption: "部品表", tableHeader: true, rows: rows.map((row) => row.map((text) => ({ text }))), ...extra },
    { id: "after", type: "paragraph", text: "後の段落" },
  ] }], fonts: [], attachments: [] });
  const openLiteral = async (doc, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((value) => window.SingleHtmlFormat.buildPortableHtml(value), doc), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "長い表", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const saveHtml = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "table-height-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return readFile(path, "utf8");
  };
  const state = () => fresh.evaluate(() => {
    const row = document.querySelector('.block[data-id="t"]');
    const content = row.querySelector(":scope > .block-content");
    return {
      limited: row.classList.contains("has-view-height"),
      height: Math.round(content.getBoundingClientRect().height),
      tableHeight: Math.round(content.querySelector(".editor-table").getBoundingClientRect().height),
      scrollable: content.scrollHeight > content.clientHeight + 1,
      count: row.querySelector(".table-height-count")?.textContent || "",
      grip: Boolean(row.querySelector(":scope > .table-height-grip")),
    };
  });
  // つまみを見える所へ出して、縦に dy だけドラッグする(行全体へ hover すると表の真ん中までスクロールしてしまうので、つまみだけを動かす)
  const dragGrip = async (dy) => {
    await fresh.evaluate(() => document.querySelector('.block[data-id="t"] > .table-height-grip').scrollIntoView({ block: "center" }));
    await fresh.waitForTimeout(200);
    const box = await fresh.locator('.block[data-id="t"] > .table-height-grip').boundingBox();
    await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 10 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 高さを決めていない表は全部見える。つまみはあるがレイアウトを変えない(古いファイルも同じ)
    await openLiteral(literal(), "table-height-plain.html");
    const plain = await state();
    result.tableHeightPlainShowsAll = !plain.limited && !plain.scrollable && plain.grip && plain.count === "" && Math.abs(plain.height - plain.tableHeight) <= 8;

    // 2) つまみを上へドラッグすると高さが決まり、表の中でスクロールする。「41行中 n行」が出る
    await dragGrip(-500);
    const dragged = await state();
    result.tableHeightDragLimits = dragged.limited && dragged.scrollable && dragged.height < plain.height - 400 && /^41行中 \d+行$/.test(dragged.count);
    const viewHeight = await fresh.evaluate(() => document.querySelector('.block[data-id="t"] > .block-content').style.maxHeight);
    result.tableHeightEvidence = { plain, dragged, viewHeight };

    // 3) 中をスクロールしても見出しの行は上に残る
    const sticky = await fresh.evaluate(() => {
      const content = document.querySelector('.block[data-id="t"] > .block-content');
      content.scrollTop = 300;
      const th = content.querySelector("tr:first-child > th");
      return Math.abs(th.getBoundingClientRect().top - content.getBoundingClientRect().top);
    });
    result.tableHeightHeaderStaysOnTop = sticky <= 2;

    // 4) 編集中の行の番号は、見えている行(見出しの裏に隠れていない行)にだけ出る。列の番号は見えている上の端に出る
    await fresh.evaluate(() => {
      const content = document.querySelector('.block[data-id="t"] > .block-content');
      content.scrollIntoView({ block: "start" });
      content.scrollTop = 300;
    });
    await fresh.waitForTimeout(200);
    const cellBox = await fresh.evaluate(() => {
      const content = document.querySelector('.block[data-id="t"] > .block-content');
      const view = content.getBoundingClientRect();
      const cell = [...content.querySelectorAll("td")].find((node) => node.dataset.cell === "1" && node.getBoundingClientRect().top > view.top + 80 && node.getBoundingClientRect().bottom < view.bottom - 20);
      const box = cell.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await fresh.mouse.click(cellBox.x, cellBox.y);
    await fresh.waitForTimeout(300);
    const labels = await fresh.evaluate(() => {
      const row = document.querySelector('.block[data-id="t"]');
      const content = row.querySelector(":scope > .block-content");
      const view = content.getBoundingClientRect();
      const header = content.querySelector("tr:first-child > th").getBoundingClientRect();
      const rowLabels = [...row.querySelectorAll(".table-axis-label.row")].map((label) => ({ text: label.textContent, y: label.getBoundingClientRect().top + label.getBoundingClientRect().height / 2 }));
      const columnLabels = [...row.querySelectorAll(".table-axis-label.column")].map((label) => label.getBoundingClientRect().bottom);
      return {
        outside: rowLabels.filter((label) => label.y < view.top - 1 || label.y > view.bottom + 1).length,
        behindHeader: rowLabels.filter((label) => label.text !== "1" && label.y < header.bottom - 1).length,
        headerLabel: rowLabels.some((label) => label.text === "1"),
        columnAboveBox: columnLabels.length > 0 && columnLabels.every((bottom) => bottom <= view.top + 2 && bottom >= view.top - 20),
      };
    });
    result.tableHeightLabelsOnlyForVisibleRows = labels.outside === 0 && labels.behindHeader === 0 && labels.headerLabel && labels.columnAboveBox;
    result.tableHeightLabelsEvidence = labels;
    await fresh.keyboard.press("Escape");

    // 5) 保存HTML: 同じ高さの箱で中をスクロールし、見出しは上に残る。印刷では全行(高さの制限が外れる)。開き直しても高さが残る
    const html = await saveHtml();
    const savedHeight = await fresh.evaluate((text) => {
      const manifest = JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent);
      return manifest.pages[0].blocks.find((block) => block.id === "t").viewHeight;
    }, html);
    const view = await context.newPage();
    try {
      await view.setViewportSize({ width: 1100, height: 820 });
      await view.setContent(html, { waitUntil: "load" });
      const screen = await view.evaluate(() => {
        const box = document.querySelector(".doc-table-view");
        box.scrollTop = 200;
        const head = box.querySelector("thead td");
        return { box: Boolean(box), maxHeight: box.style.maxHeight, scrollable: box.scrollHeight > box.clientHeight + 1, headTop: Math.abs(head.getBoundingClientRect().top - box.getBoundingClientRect().top) };
      });
      await view.emulateMedia({ media: "print" });
      const print = await view.evaluate(() => {
        const box = document.querySelector(".doc-table-view");
        return { all: box.scrollHeight <= box.clientHeight + 1, height: box.getBoundingClientRect().height };
      });
      result.tableHeightSavedHtmlSameView = screen.box && screen.maxHeight === savedHeight + "px" && screen.scrollable && screen.headTop <= 2;
      result.tableHeightPrintShowsAllRows = print.all;
      result.tableHeightSavedEvidence = { savedHeight, screen, print };
    } finally {
      await view.close();
    }
    await openLiteral(literal({ viewHeight: savedHeight }), "table-height-reopen.html");
    const reopened = await state();
    result.tableHeightReopens = Number.isFinite(savedHeight) && savedHeight >= 80 && reopened.limited && Math.abs(reopened.height - savedHeight) <= 2;

    // 6) ダブルクリックで全部見せる。Ctrl+Z で決めた高さに戻る
    await fresh.evaluate(() => document.querySelector('.block[data-id="t"] > .table-height-grip').scrollIntoView({ block: "center" }));
    await fresh.waitForTimeout(200);
    const gripBox = await fresh.locator('.block[data-id="t"] > .table-height-grip').boundingBox();
    await fresh.mouse.dblclick(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await fresh.waitForTimeout(300);
    const reset = await state();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await state();
    result.tableHeightDoubleClickShowsAll = !reset.limited && !reset.scrollable;
    result.tableHeightUndoRestores = undone.limited && Math.abs(undone.height - savedHeight) <= 2;

    // 7) 開くときの検査: 数でない・小さすぎる高さは外す(style に入る値なので、細工を通さない)
    const sanitized = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const build = (value) => fmt.buildPortableHtml({ pages: [{ id: "S", title: "S", blocks: [{ id: "s1", type: "table", rows: [[{ text: "a" }]] }] }], fonts: [], attachments: [] })
        .replace('"id": "s1",', () => '"id": "s1",\n          "viewHeight": ' + JSON.stringify(value) + ",");
      const read = (value) => fmt.parsePortableHtml(build(value)).pages[0].blocks[0];
      const hostile = read("100px;background:url(http://evil.example/x)");
      const tiny = read(5);
      const good = read(240.4);
      const hostileHtml = fmt.buildPortableHtml({ pages: [{ id: "S", title: "S", blocks: [{ id: "s1", type: "table", rows: [[{ text: "a" }]], viewHeight: "100px;background:url(http://evil.example/x)" }] }], fonts: [], attachments: [] });
      return { hostile: "viewHeight" in hostile, tiny: "viewHeight" in tiny, good: good.viewHeight, hostileHtmlClean: !hostileHtml.includes("max-height:100px;background") && !hostileHtml.includes("doc-table-view\" style") };
    });
    result.tableHeightSanitizedOnOpen = !sanitized.hostile && !sanitized.tiny && sanitized.good === 240 && sanitized.hostileHtmlClean;

    // 8) ロックしたページでは、つまみを出さない(高さは変えられない。決めた高さでは見える)
    await openLiteral({ ...literal({ viewHeight: 240 }), pages: [{ ...literal({ viewHeight: 240 }).pages[0], locked: true }] }, "table-height-locked.html");
    const locked = await state();
    result.tableHeightLockedHasNoGrip = !locked.grip && locked.limited;
    return result;
  } finally {
    await fresh.close();
  }
}
