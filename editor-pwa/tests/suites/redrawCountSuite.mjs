// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 同じ描き直しを重ねない(Issue #223・#224・#225) ----
// 1) #223 Mermaid: 描き直しのたびに、変わっていない図まで canvas.innerHTML を書き直していた(使い回した行でも、
//    作り直した行でも作った直後にもう一度)。図(SVG)の要素がそのまま残り、書き込みが 0 回であることを見る。
// 2) #224 文の途中の Enter と、ページをまたぐ Undo: render を2回していた(1回目は捨てる)。render は1回、
//    分割した文字・キャレット・戻ったページは今までどおり。
// 3) #225 表の操作(Delete・貼り付け・フィル)と置換: render が読んでいる表の変わったグラフを描き直した後に、
//    refreshCharts() がページの全グラフをもう一度描いていた。変わった表を読むグラフだけを1回、ほかは触らない。
//    描いた絵は丸ごと描き直したとき(ページを替えて戻る)と同じ。
// 数え方: render は SingleHtmlFormat.numberedListMarkers の呼び出し(render の頭で1回)。図・グラフの描き直しは
// #blocks の MutationObserver で、絵の入れ物(.mermaid-canvas・.chart-canvas)の中身の書き換えと、新しく作った入れ物を数える。
const MERMAID_WAIT = 30000;

export default async function redrawCountSuite({ context }) {
  const fresh = await context.newPage();
  await fresh.setViewportSize({ width: 1280, height: 900 });
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  const result = {};
  const evidence = {};
  const table = (id, a, b) => ({
    id, type: "table", text: "",
    rows: [[{ text: "x" }, { text: "y" }], [{ text: "1" }, { text: String(a) }], [{ text: "2" }, { text: String(a + b) }], [{ text: "3" }, { text: String(a + 2 * b) }]],
  });
  const literal = {
    title: "描き直しの回数", fonts: [], attachments: [],
    pages: [
      {
        id: "P1", title: "本文", blocks: [
          { id: "E1", type: "paragraph", text: "前半の文字と後半の文字" },
          { id: "E2", type: "paragraph", text: "打つ段落" },
          { id: "M1", type: "mermaid", text: "graph TD\nA-->B" },
          { id: "M2", type: "mermaid", text: "graph LR\nC-->D" },
          table("TA", 10, 5),
          { id: "CA1", type: "chart", text: 'table(id="TA")\nbar(A2:A4, B2:B4)' },
          { id: "CA2", type: "chart", text: 'table(id="TA")\nplot(A2:A4, B2:B4)' },
          table("TB", 40, -10),
          // 2行目の字下げは Shift+Tab の確かめ(e)で外す。
          { id: "CB", type: "chart", text: 'table(id="TB")\n  bar(A2:A4, B2:B4)' },
          { id: "END", type: "paragraph", text: "おわり" },
        ],
      },
      { id: "P2", title: "別のページ", blocks: [{ id: "Q1", type: "paragraph", text: "別のページの段落" }] },
    ],
  };
  const CHARTS = ["CA1", "CA2", "CB"];
  const DIAGRAMS = ["M1", "M2"];

  const frames = (n = 2) => fresh.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
  // 数える仕掛け。
  const install = () => fresh.evaluate(() => {
    const c = { on: false, renders: 0, mermaidRenders: 0, writes: {}, created: {} };
    window.__redraw = c;
    const fmt = window.SingleHtmlFormat;
    const markers = fmt.numberedListMarkers;
    fmt.numberedListMarkers = function (...args) {
      if (c.on) c.renders += 1;
      return markers.apply(this, args);
    };
    const seen = new WeakSet();
    const holderOf = (node) => node?.closest?.(".mermaid-canvas, .chart-canvas");
    const idOf = (holder) => holder.closest(".block")?.dataset.id || "?";
    const bump = (map, key) => { map[key] = (map[key] || 0) + 1; };
    const take = (records) => {
      for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        const holder = holderOf(target);
        if (holder && seen.has(holder)) {
          if (c.on) bump(c.writes, idOf(holder));
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const holders = [...(node.matches(".mermaid-canvas, .chart-canvas") ? [node] : []), ...node.querySelectorAll(".mermaid-canvas, .chart-canvas")];
          for (const item of holders) {
            if (seen.has(item)) continue;
            seen.add(item);
            if (c.on) bump(c.created, idOf(item));
          }
        }
      }
    };
    const observer = new MutationObserver(take);
    observer.observe(document.querySelector("#blocks"), { subtree: true, childList: true, characterData: true });
    document.querySelectorAll("#blocks .mermaid-canvas, #blocks .chart-canvas").forEach((node) => seen.add(node));
    c.flush = () => take(observer.takeRecords());
    if (window.mermaid?.render) {
      const render = window.mermaid.render;
      window.mermaid.render = function (...args) {
        if (c.on) c.mermaidRenders += 1;
        return render.apply(this, args);
      };
    }
  });
  const start = () => fresh.evaluate(() => {
    const c = window.__redraw;
    c.flush();
    Object.assign(c, { renders: 0, mermaidRenders: 0, writes: {}, created: {}, on: true });
  });
  const stop = () => fresh.evaluate(() => {
    const c = window.__redraw;
    c.flush();
    c.on = false;
    return { renders: c.renders, mermaidRenders: c.mermaidRenders, writes: { ...c.writes }, created: { ...c.created } };
  });
  const draws = (count, id) => (count.writes[id] || 0) + (count.created[id] || 0);
  const canvasHtml = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block[data-id="' + blockId + '"] .chart-canvas, #blocks .block[data-id="' + blockId + '"] .mermaid-canvas')?.innerHTML ?? null, id);
  const svgTag = () => fresh.evaluate(() => {
    document.querySelectorAll("#blocks .mermaid-canvas svg, #blocks .chart-canvas svg").forEach((svg) => { svg.__redrawTag = true; });
  });
  const svgKept = (id) => fresh.evaluate((blockId) => Boolean(document.querySelector('#blocks .block[data-id="' + blockId + '"] :is(.chart-canvas, .mermaid-canvas) svg')?.__redrawTag), id);
  const cellSel = (blockId, r, c) => '#blocks .block[data-id="' + blockId + '"] .editor-table [data-row="' + r + '"][data-cell="' + c + '"]';
  const cellText = (blockId, r, c) => fresh.evaluate((s) => document.querySelector(s)?.textContent ?? null, cellSel(blockId, r, c));
  const switchPage = async (title, readyId) => {
    await fresh.locator(".page-tree-item", { hasText: title }).first().click();
    await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), readyId, { timeout: 10000 });
    await fresh.waitForTimeout(200);
  };
  const caretAt = () => fresh.evaluate(() => {
    const selection = getSelection();
    const editable = document.activeElement?.closest?.(".block-content");
    if (!editable || !selection.rangeCount) return null;
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
    return { id: editable.dataset.id, offset: range.toString().length };
  });
  // 表の操作1回: 変わった表を読むグラフ(changed)だけが1回描かれ、ほかのグラフ・図は触らない。
  const tableOp = async (name, changed, run) => {
    const before = {};
    for (const id of CHARTS) before[id] = await canvasHtml(id);
    await svgTag();
    await start();
    await run();
    await frames(2);
    await fresh.waitForTimeout(150);
    const count = await stop();
    const after = {};
    for (const id of CHARTS) after[id] = await canvasHtml(id);
    const kept = {};
    for (const id of [...CHARTS, ...DIAGRAMS]) kept[id] = await svgKept(id);
    evidence[name] = { count, kept };
    const changedOnce = changed.every((id) => draws(count, id) === 1);
    const othersUntouched = CHARTS.filter((id) => !changed.includes(id)).every((id) => draws(count, id) === 0 && kept[id] && after[id] === before[id]);
    const diagramsUntouched = DIAGRAMS.every((id) => draws(count, id) === 0 && kept[id]);
    return { count, before, after, changedOnce, othersUntouched, diagramsUntouched };
  };

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "redraw-count.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector('#blocks .block[data-id="END"]'), null, { timeout: 30000 });
    await fresh.waitForFunction(() => document.querySelectorAll("#blocks .block.type-mermaid .mermaid-canvas svg").length === 2
      && typeof window.mermaid?.render === "function", null, { timeout: MERMAID_WAIT }).catch(() => {});
    await fresh.waitForTimeout(400);
    await install();
    const diagramsBefore = {};
    for (const id of DIAGRAMS) diagramsBefore[id] = await canvasHtml(id);
    result.redrawCountSetup = DIAGRAMS.every((id) => diagramsBefore[id]?.includes("<svg"))
      && (await fresh.evaluate(() => document.querySelectorAll("#blocks .chart-canvas svg").length)) === 3;

    // ---- 1) #224 文の途中の Enter: render は1回。図・グラフは描き直さない(#223) ----
    const caretInE1 = () => fresh.evaluate(() => {
      const el = document.querySelector('#blocks .block-content[data-id="E1"]');
      el.focus();
      const text = el.firstChild;
      const range = document.createRange();
      range.setStart(text, 5);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    const enterInE1 = () => fresh.evaluate(() => {
      const el = document.querySelector('#blocks .block-content[data-id="E1"]');
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    });
    // 慣らし: 開いた後に描き終えた図・グラフは、絵(mermaidSvg・chartSvg)が行の鍵に入るので、最初の描き直しで行ごと作り直す
    // (1回きり)。測るのはその後の描き直し。
    await caretInE1();
    await enterInE1();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    await caretInE1();
    await svgTag();
    await start();
    await enterInE1();
    await frames(2);
    const enter = await stop();
    const enterView = await fresh.evaluate(() => {
      const rows = [...document.querySelectorAll("#blocks > .block")].map((row) => row.dataset.id);
      const at = rows.indexOf("E1");
      const next = document.querySelector('#blocks .block-content[data-id="' + rows[at + 1] + '"]');
      return {
        head: document.querySelector('#blocks .block-content[data-id="E1"]').textContent,
        tail: next?.textContent, nextId: rows[at + 1],
      };
    });
    const enterCaret = await caretAt();
    evidence.enter = { ...enter, view: enterView, caret: enterCaret };
    result.redrawEnterSplitRendersOnce = enter.renders === 1;
    result.redrawEnterSplitKeepsTextAndCaret = enterView.head === "前半の文字" && enterView.tail === "と後半の文字"
      && enterCaret?.id === enterView.nextId && enterCaret?.offset === 0;
    // #223: 使い回した行の図は書き直さない(SVG の要素がそのまま)。Mermaid も呼ばない。
    result.redrawEnterKeepsMermaidSvg = DIAGRAMS.every((id) => draws(enter, id) === 0) && enter.mermaidRenders === 0
      && (await svgKept("M1")) && (await svgKept("M2"));
    result.redrawEnterKeepsCharts = CHARTS.every((id) => draws(enter, id) === 0) && (await svgKept("CA1"));
    // Undo 1回で分割ごと戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    result.redrawEnterUndoOneStep = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="E1"]').textContent === "前半の文字と後半の文字"
      && document.querySelectorAll("#blocks > .block").length === 10);

    // ---- 2) #224 ページをまたぐ Undo: render は1回。戻ったページ・キャレットは今までどおり ----
    await fresh.locator('#blocks .block-content[data-id="E2"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("XY");
    await fresh.waitForTimeout(700);
    await switchPage("別のページ", "Q1");
    await fresh.locator('#blocks .block-content[data-id="Q1"]').click();
    await fresh.waitForTimeout(150);
    await start();
    await fresh.keyboard.press("Control+z");
    await frames(2);
    await fresh.waitForTimeout(150);
    const undo = await stop();
    const undoView = await fresh.evaluate(() => ({
      title: document.querySelector("#doc-title")?.textContent,
      e2: document.querySelector('#blocks .block-content[data-id="E2"]')?.textContent ?? null,
    }));
    const undoCaret = await caretAt();
    evidence.undo = { ...undo, view: undoView, caret: undoCaret };
    result.redrawUndoAcrossPagesRendersOnce = undo.renders === 1;
    result.redrawUndoAcrossPagesKeepsPageAndCaret = undoView.title === "本文" && undoView.e2 === "打つ段落"
      && undoCaret?.id === "E2" && undoCaret?.offset === 4;
    // #223: 丸ごと描き直し(ページが替わった)でも、図は作るときの1回だけ(作った直後に書き直さない)。
    result.redrawFullRenderPaintsDiagramOnce = DIAGRAMS.every((id) => draws(undo, id) === 1) && undo.mermaidRenders === 0
      && DIAGRAMS.every((id) => (undo.created[id] || 0) === 1);
    result.redrawFullRenderSameDiagram = (await canvasHtml("M1")) === diagramsBefore.M1 && (await canvasHtml("M2")) === diagramsBefore.M2;

    // ---- 3) #225 表の操作・置換: 変わった表を読むグラフだけを1回 ----
    // a) 範囲を選んで Delete(clearTableRange)
    const clickCell = async (blockId, r, c) => {
      await fresh.locator(cellSel(blockId, r, c)).click();
      await fresh.waitForTimeout(150);
    };
    const dragCells = async (blockId, from, to) => {
      const a = await fresh.locator(cellSel(blockId, from[0], from[1])).boundingBox();
      const b = await fresh.locator(cellSel(blockId, to[0], to[1])).boundingBox();
      await fresh.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(200);
    };
    await dragCells("TA", [2, 1], [3, 1]);
    const del = await tableOp("tableDelete", ["CA1", "CA2"], async () => {
      await fresh.keyboard.press("Delete");
    });
    result.redrawTableDeleteChartsOnce = del.changedOnce && del.othersUntouched && del.diagramsUntouched
      && (await cellText("TA", 2, 1)) === "" && del.after.CA1 !== del.before.CA1;

    // b) 貼り付け(表の形の文字。onTableGridPaste)
    await clickCell("TB", 1, 1);
    const paste = await tableOp("tablePaste", ["CB"], async () => {
      await fresh.evaluate((s) => {
        const cell = document.querySelector(s);
        const data = new DataTransfer();
        data.setData("text/plain", "55\n66\n");
        cell.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }, cellSel("TB", 1, 1));
    });
    result.redrawTablePasteChartsOnce = paste.changedOnce && paste.othersUntouched && paste.diagramsUntouched
      && (await cellText("TB", 1, 1)) === "55" && (await cellText("TB", 2, 1)) === "66" && paste.after.CB !== paste.before.CB;

    // c) フィル(つまみを下へ)
    await clickCell("TA", 1, 1);
    const fill = await tableOp("tableFill", ["CA1", "CA2"], async () => {
      const handle = await fresh.locator("#blocks .block .table-fill-handle").first().boundingBox();
      const cell = await fresh.locator(cellSel("TA", 3, 1)).boundingBox();
      await fresh.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await fresh.mouse.down();
      await fresh.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 6 });
      await fresh.mouse.up();
    });
    result.redrawTableFillChartsOnce = fill.changedOnce && fill.othersUntouched && fill.diagramsUntouched
      && (await cellText("TA", 3, 1)) !== "" && fill.after.CA1 !== fill.before.CA1;

    // d) 置換(1つ・すべて)。表 TB のセルの文字だけに当たる語。
    await fresh.locator('#blocks .block-content[data-id="END"]').click();
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(150);
    const retype = async (selector, text) => {
      await fresh.evaluate((s) => {
        const input = document.querySelector(s);
        input.focus();
        input.select();
      }, selector);
      await fresh.keyboard.type(text);
      await fresh.waitForTimeout(200);
    };
    await retype("#search-input", "66");
    await retype("#search-replace-input", "77");
    const replaceOne = await tableOp("replaceOne", ["CB"], async () => {
      await fresh.locator("#search-replace-one").click();
    });
    result.redrawReplaceOneChartsOnce = replaceOne.changedOnce && replaceOne.othersUntouched && replaceOne.diagramsUntouched
      && (await cellText("TB", 2, 1)) === "77";
    await retype("#search-input", "55");
    await retype("#search-replace-input", "44");
    const replaceAll = await tableOp("replaceAll", ["CB"], async () => {
      await fresh.locator("#search-replace-all").click();
    });
    result.redrawReplaceAllChartsOnce = replaceAll.changedOnce && replaceAll.othersUntouched && replaceAll.diagramsUntouched
      && (await cellText("TB", 1, 1)) === "44";
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);

    // e) グラフのコードの Shift+Tab(行頭の字下げを外す。removeLineIndent): render がそのグラフを作り直して1回描くだけ
    //    (以前は続けて afterSourceEdit がもう一度描いていた)。ほかのグラフ・図は触らない。
    await fresh.evaluate(() => {
      const el = document.querySelector('#blocks .block-content[data-id="CB"]');
      el.focus();
    });
    await fresh.waitForTimeout(250);
    await fresh.evaluate(() => {
      const el = document.querySelector('#blocks .block-content[data-id="CB"]');
      let left = el.textContent.indexOf("\n") + 3;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && left > node.nodeValue.length) {
        left -= node.nodeValue.length;
        node = walker.nextNode();
      }
      const range = document.createRange();
      range.setStart(node, left);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    const outdent = await tableOp("chartOutdent", ["CB"], async () => {
      await fresh.evaluate(() => {
        const el = document.querySelector('#blocks .block-content[data-id="CB"]');
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
      });
    });
    const outdentCode = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="CB"]')?.textContent);
    evidence.chartOutdent.code = outdentCode;
    result.redrawChartOutdentDrawsOnce = outdent.count.renders === 1 && outdent.changedOnce && outdent.othersUntouched && outdent.diagramsUntouched
      && outdentCode === 'table(id="TB")\nbar(A2:A4, B2:B4)';

    // 描いた絵は、丸ごと描き直したとき(ページを替えて戻る)と同じ。
    const shown = {};
    for (const id of [...CHARTS, ...DIAGRAMS]) shown[id] = await canvasHtml(id);
    await switchPage("別のページ", "Q1");
    await switchPage("本文", "END");
    const redrawn = {};
    for (const id of [...CHARTS, ...DIAGRAMS]) redrawn[id] = await canvasHtml(id);
    result.redrawSameAsFullRedraw = [...CHARTS, ...DIAGRAMS].every((id) => shown[id] && shown[id] === redrawn[id]);
    if (!result.redrawSameAsFullRedraw) evidence.mismatch = [...CHARTS, ...DIAGRAMS].filter((id) => shown[id] !== redrawn[id]);

    result.redrawNoPageErrors = pageErrors.length === 0;
    result.redrawCountEvidence = JSON.stringify({ ...evidence, pageErrors });
    return result;
  } finally {
    await fresh.close();
  }
}
