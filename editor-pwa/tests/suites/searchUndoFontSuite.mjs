// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FONT_FIXTURE, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 検索の塗り・Undo の控え・埋め込みフォントの手間(Issue #226・#227・#228) ----
// #226 検索欄に1文字打つたび・「次へ」のたびに、全部の一致について Range を2回以上作り直していた
//      (refreshSearch と showCurrentSearchMatch がどちらも updateSearchHighlights を呼び、一致1件ごとにブロックの頭から文字を数えた)。
//      いまは変わったときに1回だけ作り、ブロック(セル)1つは1回の走査で全部の一致の Range を作る。「次へ」は今の1件を移すだけ。
// #227 Undo の1手ごとに、全ブロックを描いたグラフ・図の SVG(chartSvg・mermaidSvg)ごと文字列にしていた。
//      いまは SVG を文字列にせず、控えに参照で持つ(Undo / Redo で同じ SVG が戻る。描き直さない)。
// #228 読めない埋め込みフォントを描き直すたびに読み直して警告を出していた。別の文書を開いても前の文書のフォントが
//      document.fonts に残り、同じ書体名の別の文書で、埋め込んでいない書体がエディタにだけ効いていた。
// 数える回数(TreeWalker・JSON.stringify・FontFace)で確かめ、あわせて結果(塗り・保存HTML・Undo/Redo)が変わらないことを見る。
export default async function searchUndoFontSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const evidence = {};
  let opened = 0;
  let saved = 0;

  const openHtml = async (html, waitId) => {
    const path = join(OUT, "search-undo-font-" + (opened += 1) + ".html");
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((id) => document.querySelector(`#blocks .block[data-id="${id}"]`), waitId, { timeout: 30000 });
    await fresh.waitForTimeout(300);
  };
  const openLiteral = async (literal, waitId) => openHtml(await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), waitId);
  // 保存HTML(作った時刻は毎回変わるので外す)
  const savedHtml = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "search-undo-font-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    await fresh.waitForTimeout(150);
    return (await readFile(path, "utf8")).replace(/"createdAt":\s*"[^"]*"/g, '"createdAt":""');
  };
  const caretAtEnd = (blockId) => fresh.evaluate((id) => {
    const el = document.querySelector(`#blocks .block-content[data-id="${id}"]`);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, blockId);

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // ======== #226 検索の塗り ========
    const searchBlocks = [];
    for (let i = 0; i < 30; i += 1) {
      searchBlocks.push({ id: "S" + i, type: "paragraph", text: "Ab 一 ab 二 aB 三 xab 四 abab 段落" + i });
    }
    searchBlocks.push({ id: "SBR", type: "paragraph", text: "ab\nxAB", html: "ab<br>xAB" });
    searchBlocks.push({ id: "ST", type: "table", rows: [[{ text: "ab1" }, { text: "cab" }], [{ text: "zz" }, { text: "AB ab" }]] });
    searchBlocks.push({ id: "SEND", type: "paragraph", text: "おわり" });
    await openLiteral({ title: "検索", fonts: [], attachments: [], pages: [{ id: "SP", title: "検索", blocks: searchBlocks }] }, "SEND");
    // 期待する一致(モデルから): ホスト(ブロック id かセル)・頭からの文字数・文字
    const expectedMatches = (blocks, query) => {
      const list = [];
      const offsets = (text) => {
        const found = [];
        const lower = text.toLowerCase();
        for (let at = lower.indexOf(query); at >= 0; at = lower.indexOf(query, at + query.length)) found.push(at);
        return found;
      };
      for (const block of blocks) {
        if (block.type === "table") {
          block.rows.forEach((row, r) => row.forEach((cell, c) => offsets(cell.text).forEach((at) => list.push("c" + r + "_" + c + ":" + at + ":" + query))));
        } else {
          offsets(block.text).forEach((at) => list.push(block.id + ":" + at + ":" + query));
        }
      }
      return list.sort();
    };
    await fresh.evaluate(() => {
      const c = { on: false, walkers: 0, sets: 0 };
      window.__sufCount = c;
      const create = Document.prototype.createTreeWalker;
      Document.prototype.createTreeWalker = function (...args) {
        if (c.on) c.walkers += 1;
        return create.apply(this, args);
      };
      if (window.CSS?.highlights) {
        const set = CSS.highlights.set;
        CSS.highlights.set = function (...args) {
          if (c.on) c.sets += 1;
          return set.apply(this, args);
        };
      }
    });
    const startCount = () => fresh.evaluate(() => { Object.assign(window.__sufCount, { on: true, walkers: 0, sets: 0 }); });
    const stopCount = () => fresh.evaluate(() => { window.__sufCount.on = false; const { on, ...rest } = window.__sufCount; return rest; });
    // 塗られている一致(ホスト・頭からの文字数・文字)と、今の一致
    const painted = () => fresh.evaluate(() => {
      const describe = (range) => {
        const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
        const host = start.closest("[data-row][data-cell]") || start.closest(".block-content[data-id]");
        const before = document.createRange();
        before.setStart(host, 0);
        before.setEnd(range.startContainer, range.startOffset);
        const fragment = before.cloneContents();
        const count = fragment.textContent.replace(/​/g, "").length + fragment.querySelectorAll("br").length;
        const name = host.dataset.row !== undefined ? "c" + host.dataset.row + "_" + host.dataset.cell : host.dataset.id;
        return name + ":" + count + ":" + range.toString().toLowerCase();
      };
      const rest = CSS.highlights.get("doc-search-match");
      const current = CSS.highlights.get("doc-search-current");
      return {
        all: [...(rest || []), ...(current || [])].map(describe).sort(),
        current: [...(current || [])].map(describe),
        count: document.querySelector("#search-count")?.textContent || "",
      };
    });
    await fresh.locator('#blocks .block-content[data-id="SEND"]').click();
    await fresh.keyboard.press("Control+f");
    await fresh.waitForSelector("#search-bar:not([hidden])");
    await fresh.keyboard.type("a");
    await fresh.waitForTimeout(100);
    // 1打鍵: 一致 ab は 30×5+2+3 = 155 件、塗る場所(ブロック・セル)は 30+1+3 = 34。
    await startCount();
    await fresh.keyboard.type("b");
    const typed = await stopCount();
    const hosts = 34;
    const expectedAb = expectedMatches(searchBlocks, "ab");
    const afterType = await painted();
    evidence.searchType = { ...typed, matches: expectedAb.length, hosts };
    result.searchUndoFontTypeBuildsOnce = typed.walkers <= hosts + 2;
    result.searchUndoFontTypeSameHighlights = afterType.all.join("|") === expectedAb.join("|")
      && afterType.current.length === 1 && afterType.current[0] === "S0:0:ab" && afterType.count === "1/" + expectedAb.length;
    // 「次へ」: 塗り直さず、今の1件を移すだけ
    await startCount();
    await fresh.locator("#search-next").click();
    const next = await stopCount();
    const afterNext = await painted();
    evidence.searchNext = next;
    result.searchUndoFontNextMovesOnly = next.walkers <= 1;
    result.searchUndoFontNextSameHighlights = afterNext.all.join("|") === expectedAb.join("|")
      && afterNext.current.length === 1 && afterNext.current[0] === "S0:5:ab" && afterNext.count === "2/" + expectedAb.length;
    // 前へ・先頭へ回る・最後へ回る(移すだけでも、今の1件と残りがずれない)
    await fresh.locator("#search-prev").click();
    await fresh.locator("#search-prev").click();
    const wrapped = await painted();
    result.searchUndoFontPrevWraps = wrapped.all.join("|") === expectedAb.join("|") && wrapped.current.length === 1
      && wrapped.current[0] === "c1_1:3:ab" && wrapped.count === expectedAb.length + "/" + expectedAb.length;
    // 本文を打ってから(数え直しの前に)「次へ」: 数え直した後と同じ塗り
    await fresh.locator("#search-next").click();
    await caretAtEnd("S1");
    await fresh.keyboard.type(" ab");
    await fresh.locator("#search-next").click();
    await fresh.waitForTimeout(250);
    const edited = searchBlocks.map((block) => (block.id === "S1" ? { ...block, text: block.text + " ab" } : block));
    const afterEdit = await painted();
    result.searchUndoFontEditThenNext = afterEdit.all.join("|") === expectedMatches(edited, "ab").join("|") && afterEdit.current.length === 1;
    evidence.searchAfterEdit = { count: afterEdit.count, current: afterEdit.current };
    await fresh.keyboard.press("Escape");
    await fresh.locator("#search-close").click().catch(() => {});

    // ======== #227 Undo の控えに SVG を文字列にしない ========
    const undoBlocks = [{ id: "UT", type: "table", rows: [[{ text: "名前" }, { text: "値" }], [{ text: "a" }, { text: "10" }], [{ text: "b" }, { text: "20" }], [{ text: "c" }, { text: "30" }]] }];
    for (let i = 0; i < 20; i += 1) {
      undoBlocks.push({ id: "UC" + i, type: "chart", text: 'table(id="UT")\nbar(A2:A4, B2:B4, label="値")\ntitle("グラフ ' + i + '")' });
    }
    const flow = Array.from({ length: 14 }, (_, n) => "  N" + n + "[工程 " + n + "] --> N" + (n + 1) + "[工程 " + (n + 1) + "]").join("\n");
    for (let i = 0; i < 4; i += 1) undoBlocks.push({ id: "UM" + i, type: "mermaid", text: "flowchart LR\n" + flow + "\n  X" + i + "[図 " + i + "]" });
    for (let i = 0; i < 12; i += 1) undoBlocks.push({ id: "UP" + i, type: "paragraph", text: "段落 " + i });
    await openLiteral({ title: "Undo", fonts: [], attachments: [], pages: [
      { id: "UPg", title: "Undo", blocks: undoBlocks },
      { id: "UPg2", title: "二", blocks: [{ id: "U2a", type: "paragraph", text: "二ページ目" }] },
    ] }, "UP11");
    await fresh.waitForFunction(() => [0, 1, 2, 3].every((i) => document.querySelector(`#blocks .block[data-id="UM${i}"] .mermaid-canvas svg`))
      && [...Array(20).keys()].every((i) => document.querySelector(`#blocks .block[data-id="UC${i}"] .chart-canvas svg`)), null, { timeout: 30000 });
    await fresh.waitForTimeout(300);
    const svgSizes = await fresh.evaluate(() => ({
      chart: [...document.querySelectorAll("#blocks .chart-canvas svg")].reduce((sum, svg) => sum + svg.outerHTML.length, 0),
      mermaid: [0, 1, 2, 3].reduce((sum, i) => sum + (document.querySelector(`#blocks .block[data-id="UM${i}"] .mermaid-canvas svg`)?.outerHTML.length || 0), 0),
      mermaidIds: [0, 1, 2, 3].map((i) => document.querySelector(`#blocks .block[data-id="UM${i}"] .mermaid-canvas svg`)?.id || ""),
    }));
    const original = await savedHtml();
    await fresh.evaluate(() => {
      const c = { on: false, svgChars: 0, chars: 0, ms: 0 };
      window.__sufJson = c;
      const stringify = JSON.stringify;
      JSON.stringify = function (value, replacer, space) {
        if (!c.on) return stringify.call(this, value, replacer, space);
        if (value && typeof value === "object") {
          if (typeof value.chartSvg === "string") c.svgChars += value.chartSvg.length;
          if (typeof value.mermaidSvg === "string") c.svgChars += value.mermaidSvg.length;
        }
        const t0 = performance.now();
        const text = stringify.call(this, value, replacer, space);
        c.ms += performance.now() - t0;
        c.chars += text?.length || 0;
        return text;
      };
    });
    // 履歴を積む1手(段落の最初の打鍵)の間に、文字列にした量
    const historySteps = [];
    for (const [blockId, letter] of [["UP3", "x"], ["UP5", "y"], ["UP7", "z"]]) {
      await caretAtEnd(blockId);
      await fresh.evaluate(() => Object.assign(window.__sufJson, { on: true, svgChars: 0, chars: 0, ms: 0 }));
      await fresh.keyboard.type(letter);
      historySteps.push(await fresh.evaluate(() => { window.__sufJson.on = false; const { on, ...rest } = window.__sufJson; return { ...rest, ms: Math.round(rest.ms * 10) / 10 }; }));
    }
    evidence.undoSnapshot = { svgSizes: { chart: svgSizes.chart, mermaid: svgSizes.mermaid }, historySteps };
    result.searchUndoFontHistorySkipsSvg = svgSizes.chart > 0 && svgSizes.mermaid > 0 && historySteps.every((step) => step.svgChars === 0);
    // 表の値を変える(グラフの絵が描き変わる)・Enter で段落を足す
    await fresh.locator('#blocks .block[data-id="UT"] .editor-table [data-row="1"][data-cell="1"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("5");
    await caretAtEnd("UP9");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("新しい段落");
    await fresh.waitForTimeout(300);
    const edited2 = await savedHtml();
    const chartAfterEdit = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="UC0"] .chart-canvas svg')?.outerHTML || "");
    // Undo を戻せるだけ → 開いた直後と同じ保存HTML。図は描き直さない(同じ id のまま)。Redo を進めるだけ → 編集後と同じ。
    await caretAtEnd("UP0");
    for (let i = 0; i < 12; i += 1) {
      await fresh.keyboard.press("Control+z");
      await fresh.waitForTimeout(60);
    }
    await fresh.waitForTimeout(300);
    const undone = await savedHtml();
    const idsAfterUndo = await fresh.evaluate(() => [0, 1, 2, 3].map((i) => document.querySelector(`#blocks .block[data-id="UM${i}"] .mermaid-canvas svg`)?.id || ""));
    const chartAfterUndo = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="UC0"] .chart-canvas svg')?.outerHTML || "");
    await caretAtEnd("UP0");
    for (let i = 0; i < 12; i += 1) {
      await fresh.keyboard.press("Control+y");
      await fresh.waitForTimeout(60);
    }
    await fresh.waitForTimeout(300);
    const redone = await savedHtml();
    const chartAfterRedo = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="UC0"] .chart-canvas svg')?.outerHTML || "");
    result.searchUndoFontUndoRestoresExactly = undone === original && original !== edited2;
    result.searchUndoFontRedoRestoresExactly = redone === edited2;
    result.searchUndoFontUndoKeepsDrawnFigures = idsAfterUndo.join(",") === svgSizes.mermaidIds.join(",") && svgSizes.mermaidIds.every(Boolean)
      && chartAfterUndo !== chartAfterEdit && chartAfterRedo === chartAfterEdit && chartAfterUndo.length > 0;
    evidence.undoIdentity = { originalLength: original.length, undoneLength: undone.length, editedLength: edited2.length, redoneLength: redone.length, mermaidIds: svgSizes.mermaidIds, idsAfterUndo };
    await fresh.evaluate(() => { window.__sufJson.on = false; });

    // ======== #228 埋め込みフォント ========
    const fontBytes = [...await readFile(FONT_FIXTURE)];
    const fontDoc = (family, bytes, fileName) => fresh.evaluate(async ({ family, bytes, fileName }) => {
      const fmt = window.SingleHtmlFormat;
      const attachment = await fmt.fileToAttachment(new File([new Uint8Array(bytes)], fileName, { type: "font/ttf" }), "font-att");
      return fmt.buildPortableHtml({ title: family, pages: [{ id: "FP", title: family, blocks: [
        { id: "F1", type: "paragraph", text: "書体の文字", html: '<span style="font-family: ' + family + '">書体の文字</span>' },
        { id: "F2", type: "paragraph", text: "二つ目" },
      ] }], fonts: [{ id: "font-1", family, attachmentId: "font-att" }], attachments: [attachment] });
    }, { family, bytes, fileName });
    await fresh.evaluate(() => {
      const c = { broken: 0, warnings: 0 };
      window.__sufFont = c;
      const Original = window.FontFace;
      window.FontFace = new Proxy(Original, {
        construct(target, args) {
          if (args[0] === "SufBrokenFont") c.broken += 1;
          return Reflect.construct(target, args);
        },
      });
      new MutationObserver(() => {
        if ((document.querySelector("#status")?.textContent || "").includes("SufBrokenFont")) c.warnings += 1;
      }).observe(document.querySelector("#status"), { childList: true, characterData: true, subtree: true });
    });
    // 読めないフォント(中身が乱数)の文書を開き、Enter で5回描き直す
    const brokenBytes = Array.from({ length: 4096 }, (_, i) => (i * 7919 + 13) % 256);
    await openHtml(await fontDoc("SufBrokenFont", brokenBytes, "SufBrokenFont.ttf"), "F2");
    await fresh.waitForTimeout(500);
    const afterOpen = await fresh.evaluate(() => ({ ...window.__sufFont }));
    for (let i = 0; i < 5; i += 1) {
      await caretAtEnd("F2");
      await fresh.keyboard.press("Enter");
      await fresh.waitForTimeout(150);
    }
    await fresh.waitForTimeout(300);
    const afterRenders = await fresh.evaluate(() => ({ ...window.__sufFont }));
    evidence.brokenFont = { afterOpen, afterRenders };
    result.searchUndoFontBrokenFontWarnsOnce = afterOpen.broken === 1 && afterOpen.warnings >= 1
      && afterRenders.broken === afterOpen.broken && afterRenders.warnings === afterOpen.warnings;

    // 読めるフォントの文書 → 同じ書体名を使うが埋め込んでいない文書を開く: 前の文書のフォントが残らない
    const registered = (family) => fresh.evaluate((name) => [...document.fonts].filter((face) => face.family.replace(/^["']|["']$/g, "") === name).length, family);
    await openHtml(await fontDoc("SufLeakFont", fontBytes, "SufLeakFont.ttf"), "F2");
    await fresh.waitForFunction(() => [...document.fonts].some((face) => face.family === "SufLeakFont"), null, { timeout: 5000 }).catch(() => {});
    const loadedFirst = await registered("SufLeakFont");
    // 削除 → Undo で戻る → Redo でまた外れる(文書に無いフォントは document.fonts にも無い)
    await openMenu(fresh, "files");
    await fresh.locator('#attachment-summary .attachment-remove[data-font-family="SufLeakFont"]').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Escape");
    const afterDelete = await registered("SufLeakFont");
    await caretAtEnd("F2");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForFunction(() => [...document.fonts].some((face) => face.family === "SufLeakFont"), null, { timeout: 5000 }).catch(() => {});
    const afterUndo = await registered("SufLeakFont");
    await caretAtEnd("F2");
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);
    const afterRedo = await registered("SufLeakFont");
    await caretAtEnd("F2");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForFunction(() => [...document.fonts].some((face) => face.family === "SufLeakFont"), null, { timeout: 5000 }).catch(() => {});
    const beforeOther = await registered("SufLeakFont");
    await openLiteral({ title: "別の文書", fonts: [], attachments: [], pages: [{ id: "OP", title: "別の文書", blocks: [
      { id: "O1", type: "paragraph", text: "同じ書体名", html: '<span style="font-family: SufLeakFont">同じ書体名</span>' },
    ] }] }, "O1");
    await fresh.waitForTimeout(300);
    const afterOther = await registered("SufLeakFont");
    const brokenLeft = await registered("SufBrokenFont");
    evidence.fontLeak = { loadedFirst, afterDelete, afterUndo, afterRedo, beforeOther, afterOther, brokenLeft };
    result.searchUndoFontUndoRedoSyncsFonts = loadedFirst === 1 && afterDelete === 0 && afterUndo === 1 && afterRedo === 0;
    result.searchUndoFontOpenDropsPreviousFonts = beforeOther === 1 && afterOther === 0 && brokenLeft === 0;
    // もう一度、読めるフォントの文書を開くと、また効く(覚えを空にしたので登録し直す)
    await openHtml(await fontDoc("SufLeakFont", fontBytes, "SufLeakFont.ttf"), "F2");
    await fresh.waitForFunction(() => [...document.fonts].some((face) => face.family === "SufLeakFont"), null, { timeout: 5000 }).catch(() => {});
    result.searchUndoFontReopenRegistersAgain = (await registered("SufLeakFont")) === 1;

    evidence.pageErrors = pageErrors;
    result.searchUndoFontNoPageErrors = pageErrors.length === 0;
  } finally {
    result.searchUndoFontEvidence = JSON.stringify(evidence);
    await fresh.close();
  }
  return result;
}
