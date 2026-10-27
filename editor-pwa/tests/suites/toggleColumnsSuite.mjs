// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, dragBlock, openMenu } from "../lib.mjs";

// ---- トグルの中の段組み(v256。Issue #133) ----
// 段組みの組は、まるごと1つのブロックとして、組の中で一番浅い字下げにあるものと見なす(fmt.columnRun)。トグルより深い組は
// トグルの中身。以前は「段組みが違うブロックは親子にならない」だったので、トグルの中に段組みがあると:
//  1) 閉じても段組みとその後ろの中身が隠れなかった(エディタ)
//  2) 保存HTML・印刷で、段組みとその後ろがトグルの <details> の外に出た
//  3) トグルを動かす・複製する・字下げすると、段組みが置き去りになった(部分木が段組みの手前で止まった)
//  4) 目次から段組みの中の見出しへ飛んでも、外の閉じたトグルが開かなかった
// 段組みの中に段組みは作らない: 段組みを含む部分木は、段組みの列の中へ動かさない(断って知らせる)。
// トグルの外の段組みの書き出しは以前と同じ(一番上の段。字下げは列の中で付ける)。
export default async function toggleColumnsSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const openLiteral = async (blocks) => {
      const literal = { title: "ToggleColumns", fonts: [], attachments: [], pages: [{ id: "TC1", title: "ToggleColumns", blocks }] };
      const source = join(OUT, "toggle-columns-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), blocks[0].id, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 保存して、保存HTMLの文字と、文書モデル(「本文@字下げ#組:列」の列。組の id は出てきた順に g1, g2… と読み替える)を返す
    const save = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "toggle-columns-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      await fresh.waitForTimeout(150);
      const html = await readFile(path, "utf8");
      const model = await fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        const names = new Map();
        return doc.pages[0].blocks.map((block) => {
          if (block.columnGroup && !names.has(block.columnGroup)) names.set(block.columnGroup, "g" + (names.size + 1));
          return (block.text || block.type) + "@" + (block.indent || 0)
            + (block.columnGroup ? "#" + names.get(block.columnGroup) + ":" + (block.columnIndex || 0) : "")
            + (block.open === false ? "(closed)" : "");
        });
      }, html);
      return { html, model };
    };
    // 画面に見えているブロックの本文
    const visibleTexts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .filter((row) => row.offsetParent)
      .map((row) => row.querySelector(".block-content")?.textContent ?? ""));
    const toggleCaret = async (blockId) => {
      await fresh.locator('#blocks .block[data-id="' + blockId + '"] .toggle-caret').click();
      await fresh.waitForTimeout(250);
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const statusText = () => fresh.evaluate(() => document.querySelector("#status")?.textContent || "");

    // トグル A の中に段組み(左の列に段落と見出し、右の列に段落)と、その後ろの段落。比べる用に段組みの無いトグル B。
    // 目次ブロックは 7) だけに入れる(目次の中にも「Toggle A」の文字が出て、文字でブロックを探すドラッグが2つに当たるため)。
    const base = (openA = true, toc = false) => [
      ...(toc ? [{ id: "TOC", type: "toc" }] : []),
      { id: "A", type: "toggleHeading2", text: "Toggle A", open: openA },
      { id: "a1", type: "paragraph", text: "a before", indent: 1 },
      { id: "L", type: "paragraph", text: "left col", indent: 1, columnGroup: "g1", columnIndex: 0 },
      { id: "H", type: "heading3", text: "Head in column", indent: 1, columnGroup: "g1", columnIndex: 0 },
      { id: "R", type: "paragraph", text: "right col", indent: 1, columnGroup: "g1", columnIndex: 1 },
      { id: "a2", type: "paragraph", text: "a after", indent: 1 },
      { id: "B", type: "toggle", text: "Toggle B", open: true },
      { id: "b1", type: "paragraph", text: "b child", indent: 1 },
      { id: "Z", type: "paragraph", text: "Zulu" },
    ];
    const baseModel = ["Toggle A@0", "a before@1", "left col@1#g1:0", "Head in column@1#g1:0", "right col@1#g1:1", "a after@1",
      "Toggle B@0", "b child@1", "Zulu@0"];
    const hasText = (list, text) => list.some((item) => item.includes(text));

    // 1) 閉じると、段組みとその後ろも隠れる。開けば戻る。段組みの無いトグルは今までどおり
    await openLiteral(base());
    await toggleCaret("A");
    await toggleCaret("B");
    const closedVisible = await visibleTexts();
    await toggleCaret("A");
    const reopenedVisible = await visibleTexts();
    result.closingToggleHidesColumnsInside = !["a before", "left col", "Head in column", "right col", "a after", "b child"].some((text) => hasText(closedVisible, text))
      && hasText(closedVisible, "Toggle A") && hasText(closedVisible, "Toggle B") && hasText(closedVisible, "Zulu")
      && ["a before", "left col", "Head in column", "right col", "a after"].every((text) => hasText(reopenedVisible, text));
    result.closingToggleEvidence = { closedVisible, reopenedVisible };

    // 2) 保存HTML: 段組みとその後ろは、トグル A の <details> の中。閉じたまま保存すると閉じた <details>
    await toggleCaret("A");
    const closedSave = await save();
    const exported = await fresh.evaluate((html) => {
      const page = new DOMParser().parseFromString(html, "text/html");
      const details = (id) => page.getElementById("block-" + id)?.closest("details");
      const a = details("A");
      const b = details("B");
      const columns = page.querySelector(".doc-columns");
      return {
        aOpen: a?.hasAttribute("open"),
        inA: ["a before", "left col", "Head in column", "right col", "a after"].map((text) => Boolean(a?.textContent.includes(text))),
        bHasA: Boolean(b?.textContent.includes("left col")),
        columnsInA: Boolean(columns && a?.contains(columns)),
        columnCount: columns?.querySelectorAll(":scope > .doc-column").length || 0,
        zuluOutside: [...page.querySelectorAll("p")].some((p) => p.textContent === "Zulu" && !p.closest("details")),
      };
    }, closedSave.html);
    result.savedHtmlKeepsColumnsInsideToggle = exported.aOpen === false && exported.inA.every(Boolean) && !exported.bHasA
      && exported.columnsInA && exported.columnCount === 2 && exported.zuluOutside;
    result.savedHtmlEvidence = exported;

    // 3) トグルの外の段組みは、以前と同じく一番上の段に書き出す(字下げは列の中で付く)
    await openLiteral([
      { id: "T", type: "toggle", text: "Plain toggle", open: false },
      { id: "t1", type: "paragraph", text: "plain child", indent: 1 },
      { id: "P", type: "paragraph", text: "top left", columnGroup: "g2", columnIndex: 0 },
      { id: "Q", type: "paragraph", text: "top right", columnGroup: "g2", columnIndex: 1 },
      { id: "p0", type: "paragraph", text: "lead" },
      { id: "p1", type: "paragraph", text: "lead child", indent: 1 },
      { id: "I", type: "paragraph", text: "indented left", indent: 1, columnGroup: "g3", columnIndex: 0 },
      { id: "J", type: "paragraph", text: "indented right", indent: 1, columnGroup: "g3", columnIndex: 1 },
    ]);
    const outsideSave = await save();
    const outside = await fresh.evaluate((html) => {
      const page = new DOMParser().parseFromString(html, "text/html");
      const sections = [...page.querySelectorAll(".doc-columns")];
      return sections.map((section) => ({
        inDetails: Boolean(section.closest("details")),
        inIndent: Boolean(section.closest(".indent")),
        indentInColumn: section.querySelectorAll(".doc-column > .indent").length,
      }));
    }, outsideSave.html);
    result.columnsOutsideToggleExportUnchanged = same(outside, [
      { inDetails: false, inIndent: false, indentInColumn: 0 },
      { inDetails: false, inIndent: false, indentInColumn: 2 },
    ]);
    result.columnsOutsideToggleEvidence = outside;

    // 4) トグルを動かすと、中の段組みも組のまま一緒に動く(ドラッグで Zulu の後ろへ)
    await openLiteral(base());
    await dragBlock(fresh, "Toggle A", "Zulu", "after");
    await fresh.waitForTimeout(300);
    const moved = await save();
    result.movingToggleCarriesColumns = same(moved.model, ["Toggle B@0", "b child@1", "Zulu@0", "Toggle A@0", "a before@1",
      "left col@1#g1:0", "Head in column@1#g1:0", "right col@1#g1:1", "a after@1"]);
    result.movingToggleEvidence = moved.model;

    // 5) トグルを複製すると、中の段組みも組のまま写る(元とは別の組)
    await openLiteral(base());
    await fresh.locator('#blocks .block[data-id="A"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("複製");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const duplicated = await save();
    const copyPart = ["Toggle A@0", "a before@1", "left col@1#g2:0", "Head in column@1#g2:0", "right col@1#g2:1", "a after@1"];
    result.duplicatingToggleCopiesColumns = same(duplicated.model, [...baseModel.slice(0, 6), ...copyPart, ...baseModel.slice(6)]);
    result.duplicatingToggleEvidence = duplicated.model;

    // 6) 閉じたトグルを Tab で字下げすると、中の段組みも一緒に下がる
    await openLiteral(base(false));
    await fresh.locator('#blocks .block-content[data-id="A"]').click();
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(250);
    const indented = await save();
    result.indentingClosedToggleShiftsColumns = same(indented.model, ["Toggle A@1(closed)", "a before@2", "left col@2#g1:0",
      "Head in column@2#g1:0", "right col@2#g1:1", "a after@2", "Toggle B@0", "b child@1", "Zulu@0"]);
    result.indentingEvidence = indented.model;

    // 7) 目次から段組みの中の見出しへ飛ぶと、外の閉じたトグルが開いて見出しが見える
    await openLiteral(base(false, true));
    const headBefore = await visibleTexts();
    await fresh.locator('#blocks .toc-item[data-heading-id="H"]').click();
    await fresh.waitForTimeout(400);
    const headAfter = await visibleTexts();
    const revealed = await save();
    // 目次ブロックの行にも見出しの名前が出るので、行の文字の完全一致で見る
    result.tocJumpOpensToggleAroundColumns = !headBefore.includes("Head in column") && headAfter.includes("Head in column")
      && revealed.model[1] === "Toggle A@0";
    result.tocJumpEvidence = { headBefore, headAfter, toggle: revealed.model[1] };

    // 8) 段組みを含む部分木は、段組みの列の中へ動かさない(段組みの中に段組みは作らない)。断って知らせる
    const withTopColumns = [
      ...base(),
      { id: "P", type: "paragraph", text: "top left", columnGroup: "g9", columnIndex: 0 },
      { id: "Q", type: "paragraph", text: "top right", columnGroup: "g9", columnIndex: 1 },
    ];
    await openLiteral(withTopColumns);
    await dragBlock(fresh, "Toggle A", "top left", "before");
    await fresh.waitForTimeout(300);
    const refusedStatus = await statusText();
    await dragBlock(fresh, "Toggle A", "top right", "right");
    await fresh.waitForTimeout(300);
    const refused = await save();
    result.columnsNotNestedInColumns = same(refused.model, [...baseModel, "top left@0#g2:0", "top right@0#g2:1"])
      && refusedStatus.includes("段組みの中に段組みは作れません");
    result.columnsNotNestedEvidence = { model: refused.model, refusedStatus };
  } finally {
    await fresh.close();
  }
  return result;
}
