// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DOWNLOADS, OUT, PORT, openMenu, FORMAT_VERSION } from "../lib.mjs";

// ---- 見出しに番号・見出しへの参照(v218。形式 0.8.8) ----
// View → 見出しに番号(文書の設定。既定は切・古いファイルも切)。入なら見出し1〜3(トグル見出しも)に「1」「1.1」「1.1.1」を
// 文書全体の通し(ページの並び → ページの中の並び。図表の番号と同じ)で付ける。上の段が無いまま下の段が来たら上の段は 0
// (見出し1の直下の見出し3は「1.0.1」。Word・LaTeX と同じ)。番号は見出しの文字ではない(block.text に入らない・検索に当たらない)。
// エディタ・目次・道筋の帯・保存HTML・印刷に出る。切り替えは Undo の1手。
// 「/参照」は見出し(見出し1〜5)も選べる。印は「番号 名前」(番号が切なら名前だけ)で、番号・名前の変更に追従する。
export default async function headingNumberSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  // 印刷の枠の中身を記録する(印刷の画面そのものは開けない。printSuite と同じ置き換え)
  await fresh.addInitScript(() => {
    window.print = () => {
      const host = window.top;
      host.__printNumbers = [...document.querySelectorAll(".heading-number")].map((node) => node.textContent);
    };
  });
  await fresh.setViewportSize({ width: 1100, height: 700 });
  const result = {};
  const p = (id, text) => ({ id, type: "paragraph", text });
  const filler = (prefix, n) => Array.from({ length: n }, (_, i) => p(prefix + i, prefix + " の本文 " + (i + 1)));
  const literal = { title: "仕様書", fonts: [], attachments: [], pages: [
    { id: "HP1", title: "仕様書", blocks: [
      { id: "toc", type: "toc", text: "" },
      { id: "a1", type: "heading1", text: "概要" },
      { id: "a2", type: "heading2", text: "目的" },
      { id: "a3", type: "heading3", text: "前提" },
      { id: "b1", type: "heading1", text: "方式" },
      { id: "b3", type: "heading3", text: "細部" },
      { id: "b4", type: "heading4", text: "小見出し" },
      { id: "rp", type: "paragraph", text: "REF here" },
      { id: "rp2", type: "paragraph", text: "付録へ x", html: '付録へ <span class="figure-ref" data-ref="d1">x</span>' },
      { id: "end", type: "paragraph", text: "END" },
      ...filler("f", 30),
    ] },
    { id: "HP2", title: "続きのページ", blocks: [
      { id: "c2", type: "toggleHeading2", text: "続き", open: true },
      { id: "d1", type: "heading1", text: "付録" },
      { id: "e1", type: "paragraph", text: "二枚目の本文" },
    ] },
  ] };
  const openLiteral = async (doc, name, title) => {
    const source = join(OUT, name);
    await writeFile(source, await fresh.evaluate((value) => window.SingleHtmlFormat.buildPortableHtml(value), doc), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction((t) => document.querySelector("#doc-title")?.textContent === t, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    return source;
  };
  // エディタの見出しの番号(::before の中身)を id ごとに
  const editorNumbers = () => fresh.evaluate(() => Object.fromEntries([...document.querySelectorAll("#blocks .block > .block-content")]
    .filter((content) => /type-(toggleH|h)eading/.test(content.parentElement.className))
    .map((content) => {
      const shown = getComputedStyle(content, "::before").content;
      return [content.dataset.id, content.dataset.headingNumber && shown === '"' + content.dataset.headingNumber + '"' ? content.dataset.headingNumber : ""];
    })));
  const menuChecked = async () => {
    await openMenu(fresh, "view");
    const checked = await fresh.locator("#menu-heading-numbers").getAttribute("aria-checked");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(100);
    return checked;
  };
  const toggleByMenu = async () => {
    await openMenu(fresh, "view");
    await fresh.locator("#menu-heading-numbers").click();
    await fresh.waitForTimeout(250);
  };
  const isDirty = () => fresh.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  const blockAction = async (id, action) => {
    await fresh.locator(`#blocks .block[data-id="${id}"]`).first().hover();
    await fresh.locator(`#blocks .block[data-id="${id}"] > .handle .drag-grip`).click();
    await fresh.locator(`#block-menu [data-action="${action}"]`).click();
    await fresh.waitForTimeout(250);
  };
  const chips = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .figure-ref")].map((chip) => ({
    text: chip.textContent, ref: chip.dataset.ref, missing: chip.classList.contains("is-missing"),
  })));
  const goPage = async (name) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: name }).first().click();
    await fresh.waitForTimeout(300);
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 既定は切: 新しい文書は番号なし・メニューは ✓ なし・doc に設定の項目なし
    result.headingNumbersOffByDefault = (await menuChecked()) === "false"
      && Object.values(await editorNumbers()).every((value) => value === "")
      && await fresh.evaluate(() => !document.querySelector("#blocks [data-heading-number]"));

    // 2) 数え方(文書全体の通し・段を飛ばすと 0・見出し4・5 は付けない)。切の文書の保存HTMLは番号も CSS も manifest の項目も出ない
    result.numberingRule = await fresh.evaluate((doc) => {
      const fmt = window.SingleHtmlFormat;
      const on = { ...doc, settings: { headingNumbers: true } };
      const numbers = Object.fromEntries(fmt.headingNumbers(on));
      const early = Object.fromEntries(fmt.headingNumbers({ settings: { headingNumbers: true }, pages: [{ id: "x", title: "x", blocks: [
        { id: "q2", type: "heading2", text: "先に見出し2" }, { id: "q1", type: "heading1", text: "A" }, { id: "q3", type: "heading3", text: "B" },
      ] }] }));
      return JSON.stringify(numbers) === JSON.stringify({ a1: "1", a2: "1.1", a3: "1.1.1", b1: "2", b3: "2.0.1", c2: "2.1", d1: "3" })
        && JSON.stringify(early) === JSON.stringify({ q2: "0.1", q1: "1", q3: "1.0.1" })
        && fmt.headingNumbers(doc).size === 0;
    }, literal);
    // 見出しの中の参照の印の文字は、見出しの名前に入れない(自分を参照しても名前が描くたびに伸びない)
    result.headingRefTitleExcludesChips = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const doc = { settings: { headingNumbers: true }, pages: [{ id: "s", title: "s", blocks: [
        { id: "sh", type: "heading1", text: "自分 1 自分", html: '自分 <span class="figure-ref" data-ref="sh">1 自分</span>' },
      ] }] };
      return fmt.referenceTargets(doc).get("sh")?.label === "1 自分";
    });
    result.offOutputHasNoNumbers = await fresh.evaluate((doc) => {
      const html = window.SingleHtmlFormat.buildPortableHtml(doc);
      const view = new DOMParser().parseFromString(html, "text/html");
      const manifest = JSON.parse(view.querySelector("#document-manifest").textContent);
      return !view.querySelector(".heading-number, .toc-number") && !html.includes(".heading-number{") && !("settings" in manifest)
        && manifest.formatVersion === window.SingleHtmlFormat.VERSION;
    }, literal);

    // 3) 古いファイル(0.8.7 以前。設定の項目なし)と、おかしな値は切で開く
    const old = await fresh.evaluate((doc) => {
      const fmt = window.SingleHtmlFormat;
      const html = fmt.buildPortableHtml(doc).replace('"formatVersion": "' + window.SingleHtmlFormat.VERSION + '"', '"formatVersion": "0.8.7"');
      const parsed = fmt.parsePortableHtml(html);
      const odd = fmt.parsePortableHtml(fmt.buildPortableHtml({ ...doc, settings: { headingNumbers: true } }).replace('"headingNumbers": true', '"headingNumbers": "yes"'));
      const onParsed = fmt.parsePortableHtml(fmt.buildPortableHtml({ ...doc, settings: { headingNumbers: true } }));
      return { oldHas: "settings" in parsed, oddHas: "settings" in odd, on: onParsed.settings?.headingNumbers === true, oldVersionReplaced: html.includes('"0.8.7"') };
    }, literal);
    result.oldFileOpensWithNumbersOff = !old.oldHas && !old.oddHas && old.on && old.oldVersionReplaced;
    result.oldFileEvidence = old;

    await openLiteral(literal, "heading-numbers.html", "仕様書");
    result.openedFileStartsOff = (await menuChecked()) === "false" && Object.values(await editorNumbers()).every((value) => value === "");

    // 4) View → 見出しに番号: エディタの見出し・目次に番号。変更ありになる。キャレットは本文の所のまま
    await fresh.locator('#blocks .block-content[data-id="rp"]').click();
    await fresh.keyboard.press("End");
    const dirtyBefore = await isDirty();
    await toggleByMenu();
    const numbersOn = await editorNumbers();
    result.toggleShowsNumbersInEditor = numbersOn.a1 === "1" && numbersOn.a2 === "1.1" && numbersOn.a3 === "1.1.1"
      && numbersOn.b1 === "2" && numbersOn.b3 === "2.0.1" && numbersOn.b4 === "";
    result.toggleMarksDirtyAndChecksMenu = !dirtyBefore && await isDirty() && (await menuChecked()) === "true";
    result.numbersEvidence = numbersOn;
    const toc = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="toc"] .toc-item')].map((item) => item.textContent));
    result.editorTocShowsNumbers = JSON.stringify(toc) === JSON.stringify(["1概要", "1.1目的", "1.1.1前提", "2方式", "2.0.1細部", "小見出し"]);
    result.tocEvidence = toc;

    // 5) 番号は見出しの文字ではない: 検索に当たらない・見出しの文字(textContent)は名前だけ
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(200);
    await fresh.locator("#search-input").fill("1.1");
    await fresh.waitForTimeout(250);
    const searchCount = await fresh.evaluate(() => document.querySelector("#search-count")?.textContent || "");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    const headingText = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="a2"]').textContent);
    result.numbersNotInTextOrSearch = searchCount === "0/0" && headingText === "目的";

    // 6) 複数ページ: 2ページ目は1ページ目の続きの番号
    await goPage("続きのページ");
    const page2 = await editorNumbers();
    result.numberingIsDocumentWide = page2.c2 === "2.1" && page2.d1 === "3";
    await goPage("仕様書");

    // 7) 道筋の帯に番号つきの名前
    await fresh.evaluate(() => {
      const heading = document.querySelector('#blocks .block[data-id="a3"] .block-content');
      const top = document.querySelector("header.toolbar").getBoundingClientRect().bottom;
      scrollTo(0, scrollY + heading.getBoundingClientRect().bottom - (top + 30) + 4);
    });
    await fresh.waitForTimeout(250);
    const bar = await fresh.evaluate(() => [...document.querySelectorAll("#heading-path .heading-path-item")].map((item) => item.textContent));
    result.stickyBarShowsNumbers = JSON.stringify(bar) === JSON.stringify(["1 概要", "1.1 目的", "1.1.1 前提"]);
    result.stickyBarEvidence = bar;
    await fresh.evaluate(() => scrollTo(0, 0));

    // 8) 見出しへの参照: 「/参照」の一覧に「見出し」のまとまり → 選ぶと「1.1 目的」の印
    await fresh.locator('#blocks .block-content[data-id="rp"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" /参照");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    const menu = await fresh.evaluate(() => ({
      sections: [...document.querySelectorAll("#slash-menu .menu-section")].map((node) => node.textContent),
      items: [...document.querySelectorAll("#slash-menu .menu-item")].map((node) => node.textContent),
    }));
    result.referenceMenuListsHeadings = menu.sections.includes("見出し")
      && menu.items.some((text) => text.includes("1.1 目的")) && menu.items.some((text) => text.includes("小見出し"))
      && menu.items.some((text) => text.includes("3 付録") && text.includes("続きのページ"));
    result.referenceMenuEvidence = menu;
    await fresh.locator("#slash-menu .menu-item", { hasText: "1.1 目的" }).click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("を見よ");
    await fresh.waitForTimeout(200);
    const inserted = (await chips()).find((chip) => chip.ref === "a2");
    const rpText = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="rp"]').textContent);
    result.headingRefInserted = inserted?.text === "1.1 目的" && rpText === "REF here 1.1 目的 を見よ";
    result.headingRefAcrossPagesShowsNumber = (await chips()).find((chip) => chip.ref === "d1")?.text === "3 付録";

    // 9) 名前を打ち替えると印も追従し、打っている見出しのキャレットは動かない
    await fresh.locator('#blocks .block-content[data-id="a2"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("と範囲");
    await fresh.waitForTimeout(250);
    const caretInHeading = await fresh.evaluate(() => {
      const selection = getSelection();
      const host = selection.anchorNode?.parentElement?.closest(".block-content") || (selection.anchorNode?.closest ? selection.anchorNode.closest(".block-content") : null);
      return host?.dataset.id === "a2" && host.textContent === "目的と範囲";
    });
    result.headingRefFollowsTitleEdit = (await chips()).find((chip) => chip.ref === "a2")?.text === "1.1 目的と範囲" && caretInHeading;

    // 10) 並べ替え・削除・段の変更で番号が付け直される(印も)
    await blockAction("a2", "heading1");
    let renum = await editorNumbers();
    result.renumberOnLevelChange = renum.a1 === "1" && renum.a2 === "2" && renum.a3 === "2.0.1" && renum.b1 === "3"
      && (await chips()).find((chip) => chip.ref === "a2")?.text === "2 目的と範囲";
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    await blockAction("a1", "delete");
    renum = await editorNumbers();
    result.renumberOnDelete = !("a1" in renum) && renum.a2 === "0.1" && renum.a3 === "0.1.1" && renum.b1 === "1"
      && (await chips()).find((chip) => chip.ref === "d1")?.text === "2 付録";
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    // 並べ替え: 見出し3の b3 を、つまみのメニューの「上へ」で a3 の前まで上げる(b3 が 1.1.1、a3 が 1.1.2 になる)
    const moveUpTimes = async (id, times) => { for (let i = 0; i < times; i += 1) await blockAction(id, "moveup"); };
    const beforeOrder = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")].map((row) => row.dataset.id));
    const steps = beforeOrder.indexOf("b3") - beforeOrder.indexOf("a3");
    await moveUpTimes("b3", steps);
    renum = await editorNumbers();
    result.renumberOnReorder = renum.b3 === "1.1.1" && renum.a3 === "1.1.2" && renum.b1 === "2";
    result.renumberEvidence = { renum, steps };
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    for (let i = 0; i < steps; i += 1) await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);

    // 11) 行き先が見出しでなくなると「参照先なし」。Undo で戻る
    await blockAction("a2", "paragraph");
    const missing = (await chips()).find((chip) => chip.ref === "a2");
    result.headingRefShowsMissing = missing?.text === "参照先なし" && missing?.missing === true;
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.headingRefRestoredByUndo = (await chips()).find((chip) => chip.ref === "a2")?.text === "1.1 目的と範囲";

    // 12) 印を押すと見出しへ移る(別のページへも)
    await fresh.locator('#blocks .figure-ref[data-ref="d1"]').click();
    await fresh.waitForTimeout(400);
    result.headingRefClickJumps = await fresh.evaluate(() => {
      const row = document.querySelector('#blocks .block[data-id="d1"]');
      if (!row) return false;
      const rect = row.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });
    await goPage("仕様書");

    // 13) 保存HTML: 見出し・目次に番号、manifest に設定、形式 0.8.8。印は見出しへのリンク(文字は番号つき)
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const saved = join(DOWNLOADS, "heading-numbers-saved.html");
    await (await download).saveAs(saved);
    const html = await readFile(saved, "utf8");
    const exported = await fresh.evaluate((text) => {
      const view = new DOMParser().parseFromString(text, "text/html");
      const manifest = JSON.parse(view.querySelector("#document-manifest").textContent);
      const a2 = manifest.pages[0].blocks.find((block) => block.id === "a2");
      const link = view.querySelector('a.figure-ref[href="#block-a2"]');
      return {
        h2: view.querySelector("#block-a1")?.innerHTML,
        h3: view.querySelector("#block-a2 .heading-number")?.textContent,
        h4: view.querySelector("#block-b3 .heading-number")?.textContent,
        h5: Boolean(view.querySelector("#block-b4 .heading-number")),
        toggle: view.querySelector("#block-c2 .heading-number")?.textContent,
        toc: [...view.querySelectorAll("main nav.toc a")].map((a) => a.querySelector(".toc-number")?.textContent || ""),
        settings: manifest.settings, version: manifest.formatVersion, storedTitle: a2?.text,
        link: link?.textContent, d1Link: view.querySelector('a.figure-ref[href="#block-d1"]')?.textContent,
        hasCss: text.includes(".heading-number{"),
      };
    }, html);
    result.savedHtmlHasNumbers = exported.h2 === '<span class="heading-number">1</span>概要' && exported.h3 === "1.1" && exported.h4 === "2.0.1"
      && !exported.h5 && exported.toggle === "2.1" && exported.hasCss
      && JSON.stringify(exported.toc) === JSON.stringify(["1", "1.1", "1.1.1", "2", "2.0.1", ""]);
    result.savedManifestHasSetting = exported.settings?.headingNumbers === true && exported.version === FORMAT_VERSION && exported.storedTitle === "目的と範囲";
    result.savedHeadingRefIsLink = exported.link === "1.1 目的と範囲" && exported.d1Link === "3 付録";
    result.savedEvidence = exported;

    // 14) 保存HTMLをブラウザで: 印で別のページの見出しへ移る。道筋の帯にも番号
    const view = await context.newPage();
    await view.setViewportSize({ width: 1100, height: 700 });
    await view.goto(pathToFileURL(saved).href);
    await view.waitForTimeout(400);
    await view.evaluate(() => {
      const heading = document.querySelector("#block-a3");
      const pageBar = document.querySelector("#doc-page-bar");
      const top = pageBar && pageBar.getClientRects().length ? Math.max(0, pageBar.getBoundingClientRect().bottom) : 0;
      scrollTo(0, scrollY + heading.getBoundingClientRect().bottom - (top + 30) + 4);
    });
    await view.waitForTimeout(250);
    const savedBar = await view.evaluate(() => [...document.querySelectorAll(".doc-heading-path button")].map((button) => button.textContent));
    result.savedStickyBarShowsNumbers = JSON.stringify(savedBar) === JSON.stringify(["1 概要", "1.1 目的と範囲", "1.1.1 前提"]);
    result.savedStickyBarEvidence = savedBar;
    await view.locator('a.figure-ref[href="#block-d1"]').click();
    await view.waitForTimeout(300);
    result.savedHeadingRefSwitchesPage = await view.evaluate(() => document.querySelector("section.doc-page.is-current")?.id === "page-HP2");
    await view.close();

    // 15) 開き直すと入のまま
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(saved);
    await fresh.waitForTimeout(500);
    result.reopenedFileKeepsNumbers = (await menuChecked()) === "true" && (await editorNumbers()).a2 === "1.1";

    // 16) 印刷にも番号
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    await fresh.keyboard.press("Control+p");
    await fresh.waitForFunction(() => Array.isArray(window.__printNumbers), null, { timeout: 5000 }).catch(() => {});
    const printed = await fresh.evaluate(() => window.__printNumbers || []);
    result.printShowsNumbers = printed.includes("1.1") && printed.includes("2.0.1") && printed.includes("2.1");

    // 17) 切り替えは Undo の1手: Undo で切、Redo で入。切にすると印は名前だけ
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    await toggleByMenu();
    const offChip = (await chips()).find((chip) => chip.ref === "a2")?.text;
    const offNumbers = await editorNumbers();
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = await editorNumbers();
    const undoneMenu = await menuChecked();
    await fresh.locator('#blocks .block-content[data-id="end"]').click();
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);
    const redone = await editorNumbers();
    result.headingRefWithoutNumbersShowsTitle = offChip === "目的と範囲" && offNumbers.a2 === "";
    result.toggleIsOneUndoStep = undone.a2 === "1.1" && undoneMenu === "true" && redone.a2 === "" && (await menuChecked()) === "false";

    // 18) ロック中のページに見出しへの参照があっても、ほかのページの番号・名前が変わる編集はふつうにでき、Undo もできる
    const literal3 = { title: "Home", fonts: [], attachments: [], settings: { headingNumbers: true }, pages: [
      { id: "LP1", title: "Home", locked: true, blocks: [
        { id: "lp", type: "paragraph", text: "詳しくは x を見よ", html: '詳しくは <span class="figure-ref" data-ref="lh">x</span> を見よ' },
      ] },
      { id: "LP2", title: "Data", blocks: [
        { id: "lq", type: "paragraph", text: "" },
        { id: "lh", type: "heading1", text: "結果" },
        { id: "lz", type: "paragraph", text: "end" },
      ] },
    ] };
    await openLiteral(literal3, "heading-numbers-lock.html", "Home");
    const lockNotice = () => fresh.evaluate(() => {
      const notice = document.querySelector("#notice");
      return notice && !notice.hidden && notice.textContent.includes("ロック") ? notice.textContent : "";
    });
    const lockedChipBefore = (await chips())[0]?.text;
    await goPage("Data");
    await fresh.locator('#blocks .block-content[data-id="lq"]').click();
    await fresh.keyboard.type("# 前置き");
    await fresh.waitForTimeout(300);
    await fresh.locator('#blocks .block-content[data-id="lh"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("と考察");
    await fresh.waitForTimeout(300);
    const noticeWhileEditing = await lockNotice();
    const lhNumber = (await editorNumbers()).lh;
    await fresh.locator('#blocks .block-content[data-id="lz"]').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const noticeAfterUndo = await lockNotice();
    await goPage("Home");
    const lockedChipAfter = (await chips())[0]?.text;
    result.lockedPageHeadingRefAllowsRenumbering = lockedChipBefore === "1 結果" && lhNumber === "2" && !noticeWhileEditing && !noticeAfterUndo
      && /^2 結果/.test(lockedChipAfter || "");
    result.lockEvidence = { lockedChipBefore, lhNumber, noticeWhileEditing, noticeAfterUndo, lockedChipAfter };
    result.noPageErrors = pageErrors.length === 0;
    result.pageErrorEvidence = pageErrors.slice(0, 3).join(" / ");
  } finally {
    await fresh.close();
  }
  return result;
}
