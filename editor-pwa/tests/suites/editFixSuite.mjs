// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 本文の編集の不具合の直し(v213 の確認で見つかった3件) ----
// 1) 本文で打った段落(html を持つ)で、インラインの数式・コードの中の一致を置換すると、チップごと置換文字に化けていた
//    (「速度 $$v = d / t$$」の v → u で「速度 u」)。チップのソースの中だけを書き換える(html の無いブロックと同じ結果)。
// 2) スラッシュコマンドで種別を変えると、ブロックの**最初の「/」から後ろ**が消え(「and/or」で切れた)、書式も消えていた。
//    打った「/…」だけを消し、残りの書式は保つ。
// 3) 文字の残るブロックで、文字を持たない種別(区切り線・改ページ・表・目次・グラフ)を選ぶと、文字が見えなくなっていた
//    (区切り線などは隠れたまま保存、表では消えた)。文字のブロックは残し、すぐ下に新しいブロックを入れる(Notion と同じ)。
//    Undo 1手で両方戻る。「/…」しか無いブロックでは今までどおりその場で変える。
export default async function editFixSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const openLiteral = async (blocks) => {
      const literal = { title: "EditFix", fonts: [], attachments: [], pages: [{ id: "EP1", title: "EditFix", blocks }] };
      const source = join(OUT, "edit-fix-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "EditFix", null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 保存HTMLから読んだ文書モデル(ブロックの type / text / html)
    const savedBlocks = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "edit-fix-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      await fresh.waitForTimeout(150);
      return fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages[0].blocks.map((block) => ({ type: block.type, text: block.text, html: block.html || "" }));
      }, html);
    };
    const domBlocks = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => ({
      type: [...row.classList].find((name) => name.startsWith("type-"))?.slice(5),
      text: row.querySelector(".block-content")?.textContent ?? null,
    })));
    const chipCounts = (blockId) => fresh.evaluate((id) => {
      const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
      return { math: editable.querySelectorAll(".inline-math").length, code: editable.querySelectorAll(".inline-code").length };
    }, blockId);
    const caretToEnd = async (blockId) => {
      await fresh.locator('#blocks .block-content[data-id="' + blockId + '"]').click();
      await fresh.keyboard.press("End");
    };
    const chooseSlash = async (command) => {
      await fresh.keyboard.type(" /" + command);
      await fresh.waitForFunction((type) => document.querySelector("#slash-menu .menu-item.active")?.dataset.type === type,
        command, { timeout: 3000 }).catch(() => {});
      await fresh.keyboard.press("Enter");
      await fresh.waitForTimeout(300);
    };

    // 1) 置換1件ずつ: 数式・コードのチップの中の一致は、チップのソースの中だけが変わる
    await openLiteral([
      { id: "a", type: "paragraph", text: "" },
      { id: "b", type: "paragraph", text: "" },
      { id: "c", type: "heading2", text: "見出し" },
    ]);
    await fresh.locator('#blocks .block-content[data-id="a"]').click();
    await fresh.keyboard.type("速度 $$v = d / t$$ と `velocity` ");
    await fresh.locator('#blocks .block-content[data-id="b"]').click();
    await fresh.keyboard.type("時間 $$w = v t$$ と `vector` ");
    await fresh.keyboard.press("Control+b");
    await fresh.keyboard.type("太字");
    await fresh.keyboard.press("Control+b");
    await fresh.locator('#blocks .block-content[data-id="c"]').click();
    await fresh.waitForTimeout(200);
    const typed = await savedBlocks();
    result.editFixTypedBlocksHaveHtml = Boolean(typed[0].html) && Boolean(typed[1].html);

    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-input").fill("v");
    await fresh.locator("#search-replace-input").fill("u");
    await fresh.waitForTimeout(200);
    // 1件目・2件目は段落 a の数式とコードの中
    await fresh.locator("#search-replace-one").click();
    await fresh.waitForTimeout(200);
    await fresh.locator("#search-replace-one").click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Escape");
    const afterOne = await savedBlocks();
    const chipsA = await chipCounts("a");
    result.replaceOneInsideChipEditsSource = afterOne[0].text === "速度 $$u = d / t$$ と `uelocity` "
      && chipsA.math === 1 && chipsA.code === 1;
    result.replaceOneInsideChipEvidence = { text: afterOne[0].text, chipsA };

    // 2) すべて置換: 数式・コードの中を書き換え、周りの書式(太字)は残る
    await fresh.locator('#blocks .block-content[data-id="c"]').click();
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-input").fill("v");
    await fresh.locator("#search-replace-input").fill("u");
    await fresh.waitForTimeout(200);
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Escape");
    const afterAll = await savedBlocks();
    const chipsB = await chipCounts("b");
    result.replaceAllInsideChipEditsSource = afterAll[1].text === "時間 $$w = u t$$ と `uector` 太字"
      && chipsB.math === 1 && chipsB.code === 1 && /<b>太字<\/b>/.test(afterAll[1].html);
    result.replaceAllInsideChipEvidence = { text: afterAll[1].text, html: afterAll[1].html, chipsB };

    // 3) スラッシュコマンドは打った「/…」だけを消す(「and/or」は残る)。残りの太字も残る
    await openLiteral([
      { id: "s1", type: "paragraph", text: "use and/or here, see bold", html: "use and/or here, see <b>bold</b>" },
      { id: "s2", type: "paragraph", text: "next" },
    ]);
    await caretToEnd("s1");
    await chooseSlash("h1");
    const slashed = await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="s1"]');
      return { type: [...editable.closest(".block").classList].find((name) => name.startsWith("type-")), text: editable.textContent, bold: editable.querySelector("b")?.textContent || "" };
    });
    result.slashRemovesOnlyTypedCommand = slashed.type === "type-heading1"
      && slashed.text.trim() === "use and/or here, see bold" && slashed.bold.trim() === "bold";
    result.slashRemovesOnlyTypedCommandEvidence = slashed;
    // 保存しても同じ(書式は html に残る)
    const slashedSaved = (await savedBlocks())[0];
    result.slashKeepsFormattingInModel = slashedSaved.type === "heading1"
      && slashedSaved.text.trim() === "use and/or here, see bold" && /<b>bold\s*<\/b>/.test(slashedSaved.html);

    // 4) 文字の残るブロックで文字を持たない種別を選ぶと、文字は残して、すぐ下に入る。Undo 1手で元に戻る
    const textless = {};
    for (const command of ["divider", "table", "toc", "pagebreak", "chart"]) {
      await openLiteral([
        { id: "k1", type: "paragraph", text: "keep this text" },
        { id: "k2", type: "paragraph", text: "next" },
      ]);
      await caretToEnd("k1");
      await chooseSlash(command);
      const dom = await domBlocks();
      const model = await savedBlocks();
      const expectTypes = command === "pagebreak" ? ["paragraph", command, "paragraph", "paragraph"] : ["paragraph", command, "paragraph"];
      const inserted = model.map((block) => block.type).join(",") === expectTypes.join(",")
        && model[0].text === "keep this text " && dom[0].text === "keep this text "
        && model.at(-1).text === "next";
      await fresh.locator('#blocks .block-content[data-id="k2"]').click();
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(300);
      const undone = await domBlocks();
      const undoOneStep = undone.length === 2 && undone[0].type === "paragraph" && undone[0].text === "keep this text /" + command
        && undone[1].text === "next";
      textless[command] = { inserted, undoOneStep, dom, model: model.map((block) => block.type + ":" + block.text), undone };
    }
    result.slashTextlessTypeInsertsBelow = Object.values(textless).every((item) => item.inserted);
    result.slashTextlessTypeUndoIsOneStep = Object.values(textless).every((item) => item.undoOneStep);
    result.slashTextlessEvidence = textless;

    // 5) 「/…」しか無いブロックでは、今までどおりその場で変わる(下に足さない)
    await openLiteral([
      { id: "e1", type: "paragraph", text: "" },
      { id: "e2", type: "paragraph", text: "next" },
    ]);
    await fresh.locator('#blocks .block-content[data-id="e1"]').click();
    await fresh.keyboard.type("/divider");
    await fresh.waitForFunction(() => document.querySelector("#slash-menu .menu-item.active")?.dataset.type === "divider", null, { timeout: 3000 }).catch(() => {});
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const inPlace = await savedBlocks();
    result.slashOnEmptyBlockConvertsInPlace = inPlace.length === 2 && inPlace[0].type === "divider" && !inPlace[0].text
      && inPlace[1].text === "next";
    result.slashOnEmptyBlockEvidence = inPlace;
  } finally {
    await fresh.close();
  }
  return result;
}
