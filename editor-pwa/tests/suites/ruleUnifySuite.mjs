// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 同じ決まりを1か所に(Issue #206) ----
// 場所ごとにばらばらに書かれていた決まりを1つにまとめたときに、食い違いを直した所を確かめる。
// 1) つまみ(段組みの幅・画像の幅)を押しただけ(動かさずに離す)では Undo の1手を積まない。Redo も消えない(以前は押した
//    時点で積み、何も変わらない1手で Redo が消えた。#118 と同じ種類)。動かせば Ctrl+Z 1回で戻る。
// 2) 文書の最後が目次・ページのブロックのとき、下の余白を押すと、その下に段落を足してカーソルを置く(区切り線・添付と
//    同じ。以前はこの2つが漏れていて、何も起きずに文を書き足せなかった)。
// 3) データベースの列の種類のメニューは、下に入らず上に入るなら、列の名前の上に出す(ほかのポップアップと同じ置き方。
//    以前は画面の下の端で押し上げるだけで、押した列の名前に重なった)。
export default async function ruleUnifySuite({ browser }) {
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
  const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const openDoc = async (pages) => {
    const title = pages[0].title;
    const path = join(OUT, "rule-unify-" + (opened += 1) + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), { pages, fonts: [], attachments: [] }), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const press = async (key) => {
    await fresh.keyboard.press(key);
    await fresh.waitForTimeout(120);
  };
  const textOf = (id) => fresh.locator('#blocks .block-content[data-id="' + id + '"]').textContent();
  // 「m」に打って Undo した直後の状態を作る(Redo が1手ある)。
  const typeThenUndo = async () => {
    await fresh.locator('#blocks .block-content[data-id="m"]').click();
    await fresh.keyboard.type("XYZ");
    await fresh.waitForTimeout(200);
    await press("Control+z");
  };
  // つまみを押して、動かさずに離す。
  const clickWithoutMoving = async (locator) => {
    const box = await locator.boundingBox();
    await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
  };
  const dragBy = async (locator, dx) => {
    const box = await locator.boundingBox();
    await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1a) 段組みの幅のつまみ
    await openDoc([{ id: "P1", title: "Column grip", blocks: [
      P("m", ""),
      P("l", "Left", { columnGroup: "g", columnIndex: 0, columnWidth: 1 }),
      P("r", "Right", { columnGroup: "g", columnIndex: 1, columnWidth: 1 }),
    ] }]);
    const resizer = fresh.locator('#blocks .column-layout[data-column-group="g"] .column-resizer').first();
    const leftWidth = () => fresh.evaluate(() => Math.round(document.querySelector('#blocks .column-layout[data-column-group="g"] .column')?.getBoundingClientRect().width || 0));
    await typeThenUndo();
    const columnBefore = await textOf("m");
    await clickWithoutMoving(resizer);
    await press("Control+y");
    const columnRedo = await textOf("m");
    const widthBeforeDrag = await leftWidth();
    await dragBy(resizer, 60);
    const widthAfterDrag = await leftWidth();
    await press("Control+z");
    const widthAfterUndo = await leftWidth();
    const textAfterDragUndo = await textOf("m");
    result.columnGripClickKeepsRedo = columnBefore === "" && columnRedo === "XYZ";
    result.columnGripDragUndoesInOneStep = widthAfterDrag > widthBeforeDrag + 30 && Math.abs(widthAfterUndo - widthBeforeDrag) <= 2
      && textAfterDragUndo === "XYZ";
    result.columnGripEvidence = JSON.stringify({ columnBefore, columnRedo, widthBeforeDrag, widthAfterDrag, widthAfterUndo, textAfterDragUndo });

    // 1b) 画像の幅のつまみ
    await openDoc([{ id: "P1", title: "Image grip", blocks: [P("m", ""), P("z", "end")] }]);
    const png = await fresh.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const g = canvas.getContext("2d");
      g.fillStyle = "#4a90d9";
      g.fillRect(0, 0, 320, 180);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await fresh.locator('#blocks .block-content[data-id="z"]').click();
    await fresh.locator("#attach-input").setInputFiles({ name: "grip.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    const image = fresh.locator("img.attachment-image").first();
    await image.waitFor({ state: "visible", timeout: 5000 });
    await fresh.waitForTimeout(200);
    const card = fresh.locator(".image-attachment-card").first();
    const handle = card.locator(".image-resize-handle.is-right");
    await typeThenUndo();
    const imageBefore = await textOf("m");
    await image.click();
    await fresh.waitForTimeout(150);
    await clickWithoutMoving(handle);
    const widthAfterClick = await card.getAttribute("data-width");
    await press("Control+y");
    const imageRedo = await textOf("m");
    await image.click();
    await fresh.waitForTimeout(150);
    await dragBy(handle, -150);
    const widthAfterImageDrag = Number(await card.getAttribute("data-width"));
    await press("Control+z");
    const widthAfterImageUndo = Number(await card.getAttribute("data-width"));
    const textAfterImageUndo = await textOf("m");
    result.imageGripClickKeepsRedo = imageBefore === "" && imageRedo === "XYZ";
    result.imageGripDragUndoesInOneStep = widthAfterImageDrag < 100 && widthAfterImageUndo === 100 && textAfterImageUndo === "XYZ";
    result.imageGripEvidence = JSON.stringify({ imageBefore, widthAfterClick, imageRedo, widthAfterImageDrag, widthAfterImageUndo, textAfterImageUndo });

    // 2) 最後が目次・ページのブロックのとき、下の余白を押すと段落を足す
    const below = {};
    for (const [name, last] of [["toc", { id: "x", type: "toc", text: "" }], ["page", { id: "x", type: "page", text: "", pageId: "P2" }]]) {
      await openDoc([{ id: "P1", title: "Below " + name, blocks: [{ id: "h", type: "heading1", text: "Head" }, last] }, { id: "P2", title: "Sub", blocks: [P("s", "")] }]);
      const box = await fresh.locator('#blocks .block[data-id="x"]').boundingBox();
      await fresh.mouse.click(box.x + 60, box.y + box.height + 120);
      await fresh.waitForTimeout(250);
      below[name] = await fresh.evaluate(() => {
        const ids = [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.id);
        const lastRow = document.querySelector("#blocks .block:last-of-type");
        const editable = document.activeElement?.closest?.(".block-content");
        return { count: ids.length, lastIsAfterX: ids.indexOf("x") === ids.length - 2, focusedLast: Boolean(editable) && editable.dataset.id === ids.at(-1), lastType: lastRow?.querySelector(".block-content")?.isContentEditable };
      });
    }
    result.blankClickBelowTextlessLastAddsParagraph = ["toc", "page"].every((name) => below[name].count === 3 && below[name].lastIsAfterX && below[name].focusedLast);
    result.blankClickBelowEvidence = JSON.stringify(below);

    // 3) データベースの列の種類のメニュー(画面の下の端の列の名前)
    const filler = Array.from({ length: 40 }, (_, i) => P("f" + i, "filler " + i));
    const cellOf = (text) => ({ text, colSpan: 1, rowSpan: 1 });
    await openDoc([{ id: "P1", title: "DB menu", blocks: [...filler, { id: "t", type: "table", database: { columns: [{ type: "text" }, { type: "text" }] }, rows: [
      [cellOf("名前"), cellOf("状態")], [cellOf("a"), cellOf("b")], [cellOf("c"), cellOf("d")],
    ] }, P("after", "after")] }]);
    const header = fresh.locator('#blocks .block[data-id="t"] .editor-table [data-row="0"][data-cell="1"]');
    // 列の名前の行が画面の下の端に来るように。
    await header.evaluate((node) => node.scrollIntoView({ block: "end" }));
    await fresh.waitForTimeout(200);
    const headerBox = await header.boundingBox();
    await fresh.mouse.click(headerBox.x + 14, headerBox.y + headerBox.height / 2);
    await fresh.waitForTimeout(200);
    const placement = await fresh.evaluate(() => {
      const menu = document.querySelector(".db-column-menu");
      const head = document.querySelector('#blocks .block[data-id="t"] .editor-table [data-row="0"][data-cell="1"]');
      if (!menu || !head) return { open: Boolean(menu) };
      const m = menu.getBoundingClientRect();
      const h = head.getBoundingClientRect();
      return { open: true, menuTop: Math.round(m.top), menuBottom: Math.round(m.bottom), headTop: Math.round(h.top), headBottom: Math.round(h.bottom), viewport: innerHeight };
    });
    result.dbColumnMenuGoesAboveNearBottom = placement.open === true && placement.headBottom + placement.menuBottom - placement.menuTop + 4 > placement.viewport - 8
      && placement.menuBottom <= placement.headTop && placement.menuTop >= 8;
    result.dbColumnMenuEvidence = JSON.stringify(placement);
    await press("Escape");

    result.ruleUnifyNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.ruleUnifyPageErrors = pageErrors.join(" | ");
  } finally {
    await context.close();
  }
  return result;
}
