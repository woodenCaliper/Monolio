// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { FONT_FAMILY, FONT_FIXTURE, PORT, insertBlock, openMenu, pickFont } from "../lib.mjs";

// ---- 埋め込みフォントの削除(v176 ユーザー指示) ----
// 「Attach Files」メニューの一覧で、フォントの行の削除ボタンから消せる。そのフォントを使っていた文字は、
// 書体の指定も外して標準の書体へ戻す(エディタと保存HTMLの見た目をそろえる。P7)。Ctrl+Z で戻せる。
export default async function fontDeleteSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    // フォントを埋め込み、本文に当てる
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "files");
    await fresh.locator("#embed-font").click();
    await (await chooser).setFiles(FONT_FIXTURE);
    await fresh.waitForFunction((family) => [...document.fonts].some((face) => face.family === family), FONT_FAMILY, { timeout: 5000 }).catch(() => {});
    await fresh.keyboard.press("Escape");
    await fresh.locator("#blocks .block-content").nth(1).click();
    await insertBlock(fresh);
    await fresh.keyboard.type("font delete sample");
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("font delete sample"));
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await pickFont(fresh, FONT_FAMILY);
    await fresh.waitForTimeout(150);
    const state = () => fresh.evaluate((family) => {
      const editable = [...document.querySelectorAll(".block-content")].find((item) => item.textContent.includes("font delete sample"));
      return {
        styled: [...(editable?.querySelectorAll("[style]") || [])].some((node) => node.style.fontFamily.includes(family)),
        text: editable?.textContent,
        registered: [...document.fonts].some((face) => face.family === family),
        inPicker: [...document.querySelectorAll("#format-font-list .font-option")].some((option) => option.textContent === family),
        removeButtons: document.querySelectorAll("#attachment-summary .attachment-remove").length,
        attachmentRows: document.querySelectorAll("#attachment-summary .attachment-meta").length,
      };
    }, FONT_FAMILY);
    const before = await state();

    // 一覧の削除ボタン(フォントの行にだけある)
    await openMenu(fresh, "files");
    const button = fresh.locator(`#attachment-summary .attachment-remove[data-font-family="${FONT_FAMILY}"]`);
    result.fontRowHasDeleteButton = before.removeButtons === 1 && (await button.count()) === 1
      && Boolean(await button.locator("svg.ui-icon").count());
    await button.click();
    await fresh.waitForTimeout(200);
    const after = await state();
    result.deletingFontRemovesEmbed = before.registered && before.inPicker
      && !after.registered && !after.inPicker && after.removeButtons === 0;
    result.deletingFontResetsTextToDefault = before.styled && !after.styled && after.text === "font delete sample";
    await fresh.keyboard.press("Escape");
    // 保存したファイルにもフォントが残らない(本文から指定が外れているので、使用中として残ることもない)
    await fresh.locator("#blocks .block-content", { hasText: "font delete sample" }).click();
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const saved = await readFile(await (await download).path(), "utf8");
    result.deletedFontNotSaved = saved.includes("font delete sample") && !saved.includes(FONT_FAMILY);
    // Ctrl+Z で戻る(フォントも書体の指定も)
    await fresh.locator("#blocks .block-content", { hasText: "font delete sample" }).click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForFunction((family) => [...document.fonts].some((face) => face.family === family), FONT_FAMILY, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(200);
    const undone = await state();
    result.deletingFontCanBeUndone = undone.registered && undone.inPicker && undone.styled;
    return result;
  } finally {
    await fresh.close();
  }
}
