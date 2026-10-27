// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- 本文の中の図表の参照(v198。形式 0.8.6) ----
// 本文で「/参照」を選ぶと、題名の付いた表・図の一覧(文書全体)が出て、選ぶと「表n」「図n」の印が入る(ユーザー指示)。
// 印が持つのは行き先の id だけで、番号は描くたびに数える(並べ替え・題名の付け外しに追従)。行き先が無いときは
// 「参照先なし」。印を押すと行き先へ移る。保存HTMLでは題名の段落へのリンク(別のページでも移れる)。
export default async function figureRefSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const literal = { title: "Refs", fonts: [], attachments: [], pages: [
      { id: "RP1", title: "Refs", blocks: [
        { id: "t1", type: "table", text: "", caption: "条件", rows: [cells("a", "b"), cells("1", "2")] },
        { id: "g1", type: "chart", text: "plot(A2:A2, B2:B2)", caption: "温度" },
        { id: "p2", type: "paragraph", text: "本文" },
        { id: "p3", type: "paragraph", text: "REF end" },
      ] },
      { id: "RP2", title: "Other", blocks: [
        { id: "o1", type: "paragraph", text: "OTHER top" },
        { id: "t3", type: "table", text: "", caption: "別ページの表", rows: [cells("k", "v"), cells("1", "2")] },
      ] },
    ] };
    const source = join(OUT, "figure-refs.html");
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Refs", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    const chips = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .figure-ref")].map((chip) => ({
      text: chip.textContent, ref: chip.dataset.ref, missing: chip.classList.contains("is-missing"),
    })));
    const paragraphText = () => fresh.evaluate(() => document.querySelector('#blocks .block[data-id="p2"] .block-content').textContent);

    // 1) 「/参照」→ 一覧(題名の付いた表・図。文書全体。別のページの表も)
    await fresh.locator('#blocks .block[data-id="p2"] .block-content').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" /参照");
    await fresh.waitForTimeout(200);
    const firstItem = await fresh.evaluate(() => document.querySelector("#slash-menu .menu-item.active")?.dataset.type);
    result.slashOffersReference = firstItem === "figure-ref";
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    const listed = await fresh.evaluate(() => [...document.querySelectorAll("#slash-menu .menu-item")].map((item) => item.textContent));
    result.referenceListShowsCaptionedFigures = listed.length === 3
      && listed.some((text) => text.includes("表1: 条件")) && listed.some((text) => text.includes("表2: 別ページの表"))
      && listed.some((text) => text.includes("図1: 温度")) && listed.some((text) => text.includes("Other"));
    result.referenceListEvidence = listed;

    // 2) 選ぶと「/参照」が消えて印が入る(文字はそのまま続けて打てる)
    await fresh.locator("#slash-menu .menu-item", { hasText: "表2: 別ページの表" }).click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("を見よ");
    await fresh.waitForTimeout(200);
    const inserted = await chips();
    // 日本語の文の中では印の前後に空白を作らない(v221。以前は「本文 表2 を見よ」。imeFixSuite の H)。
    result.referenceInsertedAsChip = inserted.length === 1 && inserted[0].text === "表2" && inserted[0].ref === "t3"
      && (await paragraphText()) === "本文表2を見よ";

    // 3) 番号は追従する: 前にある表の題名を外すと「表1」になる
    const removeCaption = async (id) => {
      await fresh.locator(`#blocks .block[data-id="${id}"]`).hover();
      await fresh.locator(`#blocks .block[data-id="${id}"] .drag-grip`).click();
      await fresh.locator('#block-menu [data-action="caption-remove"]').click();
      await fresh.waitForTimeout(200);
    };
    await removeCaption("t1");
    result.referenceFollowsRenumbering = (await chips())[0]?.text === "表1";

    // 4) 行き先の題名を外すと「参照先なし」。Undo で戻る
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Other" }).click();
    await fresh.waitForTimeout(300);
    await removeCaption("t3");
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Refs" }).click();
    await fresh.waitForTimeout(300);
    const missing = (await chips())[0];
    result.referenceShowsMissing = missing?.text === "参照先なし" && missing?.missing === true;
    await fresh.locator("#blocks .block-content", { hasText: "REF end" }).click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    // Undo は変えた所(2ページ目)を見せる。参照のある1ページ目へ戻って確かめる
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Refs" }).click();
    await fresh.waitForTimeout(300);
    result.undoRestoresReferenceTarget = (await chips())[0]?.text === "表1";

    // 5) 印を押すと行き先(別のページ)へ移る
    await fresh.locator("#blocks .figure-ref").first().click();
    await fresh.waitForTimeout(400);
    result.chipClickJumpsToTarget = await fresh.evaluate(() => {
      const row = document.querySelector('#blocks .block[data-id="t3"]');
      if (!row) return false;
      const rect = row.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Refs" }).click();
    await fresh.waitForTimeout(300);

    // 6) 置換しても印は壊れない(印の文字は置換の対象にしない)
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(200);
    await fresh.locator("#search-input").fill("表1");
    await fresh.locator("#search-replace-input").fill("XX");
    await fresh.waitForTimeout(200);
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Escape");
    const afterReplace = await chips();
    result.replaceLeavesChipIntact = afterReplace.length === 1 && afterReplace[0].text === "表1" && afterReplace[0].ref === "t3";

    // 7) 保存HTML: 題名の段落へのリンク。manifest は id だけ持つ。形式 0.8.6。開き直しても印のまま
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const saved = join(DOWNLOADS, "figure-refs-saved.html");
    await (await download).saveAs(saved);
    const html = await readFile(saved, "utf8");
    const exported = await fresh.evaluate((text) => {
      const view = new DOMParser().parseFromString(text, "text/html");
      const link = view.querySelector("a.figure-ref");
      const manifest = JSON.parse(view.querySelector("#document-manifest").textContent);
      const p2 = manifest.pages[0].blocks.find((block) => block.id === "p2");
      const target = view.getElementById("fig-t3");
      return {
        href: link?.getAttribute("href"), text: link?.textContent, targetExists: Boolean(target),
        stored: p2?.html || "", version: manifest.formatVersion,
      };
    }, html);
    result.savedReferenceIsLink = exported.href === "#fig-t3" && exported.text === "表1" && exported.targetExists;
    result.savedReferenceStoresIdOnly = exported.stored.includes('data-ref="t3"') && exported.version === FORMAT_VERSION;
    result.figureRefEvidence = exported;

    // 8) 保存HTMLをブラウザで開いて印を押すと、別のページの表へ移る
    const view = await context.newPage();
    await view.goto("file://" + saved);
    await view.waitForTimeout(400);
    const hasLink = (await view.locator("a.figure-ref").count()) > 0;
    if (hasLink) await view.locator("a.figure-ref").click();
    await view.waitForTimeout(300);
    result.savedReferenceSwitchesPage = hasLink && await view.evaluate(() => document.querySelector("section.doc-page.is-current")?.id === "page-RP2");
    await view.close();

    // 9) 細工した行き先の id は使わない(印をやめて文字だけになる)。#201 で無害化の決まりを1つにし、エディタと同じく
    //    保存HTMLでも文字だけにした(以前の保存HTMLは「参照先なし」の印にしていた)。
    result.unsafeReferenceIsNeutralized = await fresh.evaluate(() => {
      const doc = { pages: [{ id: "U", title: "U", blocks: [
        { id: "u1", type: "paragraph", text: "x", html: 'x <span class="figure-ref" data-ref="a&quot; onclick=&quot;alert(1)">表1</span>' },
      ] }], fonts: [], attachments: [] };
      const html = window.SingleHtmlFormat.buildPortableHtml(doc);
      const view = new DOMParser().parseFromString(html, "text/html");
      const para = view.querySelector("main p");
      return !view.querySelector("main .figure-ref") && para?.textContent === "x 表1" && !view.querySelector("main [onclick]");
    });

    // 10) 番号が変わったら、検索と目次も今の番号を使う(印の text は描いた時点の写しだったので、検索で「表1」が
    //     見つからず「表2」で当たり、目次は古い番号のままだった。v213 で直した。v196 の確認で発見)
    const literal2 = { title: "Toc", fonts: [], attachments: [], pages: [{ id: "TP1", title: "Toc", blocks: [
      { id: "h1", type: "heading1", text: "見出し 表2", html: '見出し <span class="figure-ref" data-ref="t3">表2</span>' },
      { id: "toc", type: "toc", text: "" },
      { id: "t1", type: "table", text: "", caption: "条件", rows: [cells("a", "b"), cells("1", "2")] },
      { id: "p2", type: "paragraph", text: "本文 表2 を見よ", html: '本文 <span class="figure-ref" data-ref="t3">表2</span> を見よ' },
      { id: "t3", type: "table", text: "", caption: "二つ目", rows: [cells("k", "v"), cells("1", "2")] },
    ] }] };
    const source2 = join(OUT, "figure-refs-toc.html");
    await writeFile(source2, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal2), "utf8");
    const chooser2 = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser2).setFiles(source2);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Toc", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    await removeCaption("t1");
    const searchCount = async (query) => {
      await fresh.locator("#search-input").fill(query);
      await fresh.waitForTimeout(250);
      return fresh.evaluate(() => document.querySelector("#search-count")?.textContent || "");
    };
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(200);
    const foundNew = await searchCount("表1");
    const foundOld = await searchCount("表2");
    await fresh.keyboard.press("Escape");
    const tocText = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="toc"]')?.textContent || "");
    result.searchFindsCurrentNumber = foundNew === "1/2" && foundOld === "0/0";
    result.tocShowsCurrentNumber = tocText.includes("見出し 表1") && !tocText.includes("表2");
    const download2 = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const saved2 = join(DOWNLOADS, "figure-refs-toc-saved.html");
    await (await download2).saveAs(saved2);
    const savedToc = await fresh.evaluate((text) => new DOMParser().parseFromString(text, "text/html").querySelector("main nav.toc")?.textContent || "", await readFile(saved2, "utf8"));
    result.savedTocShowsCurrentNumber = savedToc.includes("見出し 表1") && !savedToc.includes("表2");
    result.renumberEvidence = { foundNew, foundOld, tocText, savedToc };

    // 11) ロック中のページに印があっても、ほかのページで番号が変わる編集はふつうにでき、Undo もできる。
    //     印の番号の付け直しをロックが「中身の書き換え」とみて、毎回「ロックされています」と出し、Undo も断っていた(v213)
    const literal3 = { title: "Home", fonts: [], attachments: [], pages: [
      { id: "LP1", title: "Home", locked: true, blocks: [
        { id: "lp", type: "paragraph", text: "詳しくは 表1 を見よ", html: '詳しくは <span class="figure-ref" data-ref="lt2">表1</span> を見よ' },
      ] },
      { id: "LP2", title: "Data", blocks: [
        { id: "lt1", type: "table", text: "", rows: [cells("a", "b"), cells("1", "2")] },
        { id: "lt2", type: "table", text: "", caption: "B", rows: [cells("c", "d"), cells("3", "4")] },
        { id: "lq", type: "paragraph", text: "end" },
      ] },
    ] };
    const source3 = join(OUT, "figure-refs-lock.html");
    await writeFile(source3, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal3), "utf8");
    const chooser3 = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser3).setFiles(source3);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Home", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    const lockNotice = () => fresh.evaluate(() => {
      const notice = document.querySelector("#notice");
      return notice && !notice.hidden && notice.textContent.includes("ロック") ? notice.textContent : "";
    });
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Data" }).click();
    await fresh.waitForTimeout(300);
    await fresh.locator('#blocks .block[data-id="lt1"]').hover();
    await fresh.locator('#blocks .block[data-id="lt1"] .drag-grip').click();
    await fresh.locator('#block-menu [data-action="caption"]').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("A");
    await fresh.waitForTimeout(300);
    const noticeWhileTyping = await lockNotice();
    await fresh.locator('#blocks .block-content[data-id="lq"]').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const noticeAfterUndo = await lockNotice();
    const captionAfterUndo = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="lt1"] .block-caption-input')?.value || "");
    result.lockedPageRefAllowsRenumbering = !noticeWhileTyping && !noticeAfterUndo && captionAfterUndo === "";
    result.lockRefEvidence = { noticeWhileTyping, noticeAfterUndo, captionAfterUndo };
  } finally {
    await fresh.close();
  }
  return result;
}
