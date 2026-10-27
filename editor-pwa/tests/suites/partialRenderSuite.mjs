// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, dragBlock, openMenu } from "../lib.mjs";

// ---- 部分の描き直し(v225) ----
// 構造の編集(Enter・Backspace / Delete の結合・Tab・種類の変更・移動・ドラッグ・ブロックの貼り付け・複製・削除・トグルの開閉・
// 題名を外す・Undo / Redo)のたびに、以前はページの全ブロックの行を作り直していた(5000 ブロックで Enter 1回に約 2.5 秒)。
// いまは変わった行だけを作り直す。ここで確かめること:
// 1) 正しさ: 編集の直後の #blocks が、丸ごと描き直した #blocks(ページを移って戻る)と同じ。番号付きリスト・トグル(開・閉)・
//    段組み・式のある表・グラフ・題名と参照の印・見出しの番号・目次・ロックしたページを含む文書で。どの手順でも、
//    実際に部分の描き直しを通ったこと(行の多くが同じ要素のまま残ったこと)も確かめる(丸ごと描き直せば等しいのは当たり前なので)。
// 2) 遠くの行は作り直さない(Enter の後もグラフの絵・表の要素が同じ要素のまま)。
// 3) 速さ(緩い上限。修正後の実測の 3〜5 倍。修正前の作りでは上限を超える。赤確認済み): 5000 ブロックのページの Enter・Undo、
//    表 20・グラフ 20 を含む 1000 ブロックの文書の Enter。
export default async function partialRenderSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  await fresh.setViewportSize({ width: 1200, height: 800 });
  const result = {};
  const evidence = {};
  let opened = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const open = async (literal) => {
      const path = join(OUT, "partial-render-" + (opened += 1) + ".html");
      await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(path);
      const lastId = literal.pages[0].blocks.at(-1).id;
      await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), lastId, { timeout: 60000 });
      await fresh.waitForTimeout(400);
    };

    // 保存した文書の1つのブロック(ページ P1)。
    const savedBlock = async (id) => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(OUT, "partial-render-saved-" + (opened += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      return fresh.evaluate(([text, id]) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages[0].blocks.find((block) => block.id === id) || null;
      }, [html, id]);
    };

    // ---- 1) 正しさ ----
    const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
    const cells = (...values) => values.map((text) => ({ text }));
    const literal = {
      title: "Partial", fonts: [], attachments: [], settings: { headingNumbers: true },
      pages: [
        { id: "P1", title: "部分の描き直し", blocks: [
          P("p0", "先頭"),
          { id: "toc", type: "toc" },
          { id: "h1", type: "heading1", text: "章A" },
          { id: "n1", type: "numbered", text: "いち" },
          { id: "n2", type: "numbered", text: "に" },
          { id: "n3", type: "numbered", text: "にのいち", indent: 1 },
          { id: "n4", type: "numbered", text: "さん" },
          { id: "t1", type: "toggle", text: "開いたトグル", open: true },
          P("t1c", "開いた中身", { indent: 1 }),
          { id: "t2", type: "toggle", text: "閉じたトグル", open: false },
          P("t2c", "隠れた中身", { indent: 1 }),
          { id: "h2", type: "heading2", text: "節A1" },
          { id: "tbl", type: "table", caption: "売上", tableHeader: true,
            rows: [cells("項目", "値"), cells("a", "1"), cells("b", "=B2*2"), cells("合計", "=SUM(B2:B3)")] },
          P("ref", "参照 表1 と 図1 と 節", { html: '参照 <span class="figure-ref" data-ref="tbl">表1</span> と <span class="figure-ref" data-ref="ch">図1</span> と <span class="figure-ref" data-ref="h2">節</span>' }),
          { id: "ch", type: "chart", caption: "グラフ", text: 'bar(A2:A3, B2:B3)\ntitle("売上")' },
          { id: "tbl2", type: "table", caption: "在庫", tableHeader: true, rows: [cells("品目", "数"), cells("x", "5"), cells("y", "7")] },
          P("cga", "左の列", { columnGroup: "cg", columnIndex: 0, columnWidth: 1 }),
          P("cgb", "右の列", { columnGroup: "cg", columnIndex: 1, columnWidth: 1 }),
          { id: "m1", type: "math", text: "x^2" },
          { id: "td1", type: "todo", text: "やること", checked: true },
          { id: "q1", type: "quote", text: "引用" },
          { id: "h3", type: "heading1", text: "章B" },
          P("e1", "編集用1"),
          P("e2", "編集用2"),
          P("e3", "編集用3"),
          P("e4", "編集用4"),
          { id: "lnk", type: "page", pageId: "P2" },
          P("last", "最後"),
        ] },
        { id: "P2", title: "鍵のページ", locked: true, blocks: [
          P("o1", "別ページ"),
          { id: "ot", type: "toggle", text: "鍵のトグル", open: true },
          P("otc", "鍵の中", { indent: 1 }),
        ] },
      ],
    };
    await open(literal);

    // #blocks を比べられる形にする(要素・属性・入力欄の状態・文字)。選択の印(.selected)はページを移ると消えるので
    // 比べない(選択の見た目は別に確かめる)。数式ブロックのソースの開閉(.source-open)はフォーカスで付くので比べない。
    const serialize = () => fresh.evaluate(() => {
      const out = [];
      const walk = (node, depth) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.nodeValue) out.push(depth + "#" + node.nodeValue);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const attrs = [...node.attributes].map((attr) => {
          if (attr.name === "class") {
            const tokens = attr.value.split(/\s+/).filter((token) => token && token !== "selected" && token !== "source-open").sort();
            return "class=" + tokens.join(".");
          }
          return attr.name + "=" + attr.value;
        }).filter((text) => !text.startsWith("aria-expanded=") && !text.startsWith("aria-controls=")).sort();
        let state = "";
        if (node.tagName === "INPUT") state = " value=" + node.value + " checked=" + node.checked + " disabled=" + node.disabled;
        out.push(depth + "<" + node.tagName.toLowerCase() + " " + attrs.join(" ") + state);
        node.childNodes.forEach((child) => walk(child, depth + 1));
      };
      document.querySelector("#blocks").childNodes.forEach((child) => walk(child, 0));
      return out;
    });
    // いまの行に印を付ける(部分の描き直しで残った行は印を持ったまま)。
    const markRows = () => fresh.evaluate(() => {
      document.querySelectorAll("#blocks > *").forEach((row) => { row.__partialMark = true; });
      return document.querySelectorAll("#blocks > *").length;
    });
    const keptRows = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks > *")].filter((row) => row.__partialMark).length);
    // 丸ごと描き直す: ほかのページへ移って戻る。
    const currentPageId = () => fresh.evaluate(() => document.querySelector(".page-tree-item.is-current")?.dataset.pageId);
    const fullRender = async () => {
      const here = await currentPageId();
      const other = here === "P1" ? "P2" : "P1";
      await fresh.locator('.page-tree-item[data-page-id="' + other + '"]').click();
      await fresh.waitForTimeout(150);
      await fresh.locator('.page-tree-item[data-page-id="' + here + '"]').click();
      await fresh.waitForTimeout(250);
    };
    const firstDiff = (a, b) => {
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) if (a[i] !== b[i]) return { at: i, partial: a[i], full: b[i] };
      return null;
    };
    // action の直後の DOM が丸ごと描き直した DOM と同じで、かつ行が minKept 個以上残っている(部分の描き直しを通った)か。
    // 判定は1つ(partialRender + 手順の名前)。どちらが崩れたかは証拠の same(diff が無い)・keptEnough(kept と minKept)で分かる。
    const unfocus = async () => {
      await fresh.evaluate(() => document.activeElement?.blur?.());
      await fresh.waitForTimeout(100);
    };
    const check = async (name, action, minKept = 10) => {
      const before = await markRows();
      await action();
      await fresh.waitForTimeout(250);
      // フォーカスで付く見た目(編集中の表の印・行と列の番号など)は、丸ごと描き直した側(ページの先頭へフォーカス)と
      // 揃わないので、どちらもフォーカスを外してから比べる。
      await unfocus();
      const partial = await serialize();
      const kept = await keptRows();
      await fullRender();
      await unfocus();
      const full = await serialize();
      const diff = firstDiff(partial, full);
      const same = diff === null;
      const keptEnough = kept >= minKept;
      result["partialRender" + name] = same && keptEnough;
      evidence[name] = { same, keptEnough, before, kept, minKept, rows: partial.length, diff };
    };
    const caret = async (id, offset) => {
      await fresh.evaluate(([id, offset]) => {
        const el = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
        el.scrollIntoView({ block: "center" });
        el.focus();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let left = offset === "end" ? Infinity : offset;
        let node = walker.nextNode();
        const range = document.createRange();
        if (!node) range.setStart(el, 0);
        while (node) {
          if (left <= node.nodeValue.length) { range.setStart(node, left); break; }
          left -= node.nodeValue.length;
          const next = walker.nextNode();
          if (!next) { range.setStart(node, node.nodeValue.length); break; }
          node = next;
        }
        range.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }, [id, offset]);
      await fresh.waitForTimeout(60);
    };
    const press = (key) => async () => { await fresh.keyboard.press(key); };
    const menu = (id, action) => async () => {
      await fresh.locator('#blocks .block[data-id="' + id + '"] .drag-grip').click();
      await fresh.waitForTimeout(150);
      await fresh.locator('#block-menu .menu-item[data-action="' + action + '"]').click();
    };

    await check("EnterAtEnd", async () => { await caret("e1", "end"); await fresh.keyboard.press("Enter"); await fresh.keyboard.type("新しい"); });
    await check("EnterUndo", press("Control+z"));
    await check("EnterRedo", press("Control+y"));
    await check("EnterSplit", async () => { await caret("e2", 2); await fresh.keyboard.press("Enter"); });
    await check("SplitUndo", press("Control+z"));
    await check("BackspaceMerge", async () => { await caret("e3", 0); await fresh.keyboard.press("Backspace"); });
    await check("MergeUndo", press("Control+z"));
    await check("DeleteMerge", async () => { await caret("e1", "end"); await fresh.keyboard.press("Delete"); });
    await check("DeleteMergeUndo", press("Control+z"));
    // 番号付きリストの字下げ: 隣の行の番号が変わる(残した行の番号も正しいこと)。
    await check("TabNumbered", async () => { await caret("n2", 0); await fresh.keyboard.press("Tab"); });
    await check("ShiftTabNumbered", async () => { await caret("n2", 0); await fresh.keyboard.press("Shift+Tab"); });
    await check("TabUndo", press("Control+z"));
    // 種類の変更: 見出しにすると、後ろの見出しの番号・目次・見出しへの参照が変わる。
    await check("MarkdownHeading", async () => { await caret("e4", 0); await fresh.keyboard.type("# "); });
    await check("MarkdownHeadingUndo", press("Control+z"));
    await check("SlashHeading", async () => {
      await caret("e3", "end");
      await fresh.keyboard.press("Enter");
      await fresh.keyboard.type("/heading2");
      await fresh.waitForTimeout(150);
      await fresh.keyboard.press("Enter");
    });
    await check("SlashHeadingUndo", press("Control+z"));
    // 先頭の段落を見出しにすると、残した見出しの行の番号がすべて1つずつずれる。
    await check("MenuConvertHeading", menu("p0", "heading1"));
    await check("MenuConvertUndo", press("Control+z"));
    await check("MenuMoveDown", menu("e2", "movedown"));
    await check("MenuMoveUp", menu("h2", "moveup"));
    await check("MoveUndo", press("Control+z"));
    await check("MenuDuplicate", menu("n1", "duplicate"));
    await check("MenuDelete", menu("n2", "delete"));
    await check("DeleteUndo", press("Control+z"));
    // 題名を外す: 後ろの表の番号(残した行の題名の番号)・参照の印が変わる。
    await check("CaptionRemove", menu("tbl", "caption-remove"));
    await check("CaptionRemoveUndo", press("Control+z"));
    // グラフが読む表(上の一番近い表)が替わる: 動かしていないグラフも描き直す。
    await check("ChartSourceChange", menu("tbl2", "moveup"));
    await check("ChartSourceUndo", press("Control+z"));
    await check("DragDrop", async () => { await dragBlock(fresh, "編集用4", "引用", "before"); });
    await check("DragUndo", press("Control+z"));
    await check("BlockPaste", async () => {
      await fresh.locator('#blocks .block[data-id="e3"] .drag-grip').click();
      await fresh.keyboard.press("Escape");
      await fresh.keyboard.press("Control+c");
      await fresh.waitForTimeout(100);
      await fresh.keyboard.press("Control+v");
    });
    await check("PasteUndo", press("Control+z"));
    await check("ToggleOpen", async () => { await fresh.locator('#blocks .block[data-id="t2"] .toggle-caret').click(); });
    await check("ToggleClose", async () => { await fresh.locator('#blocks .block[data-id="t1"] .toggle-caret').click(); });
    await check("ToggleUndo", press("Control+z"));
    await check("ColumnEnter", async () => { await caret("cga", "end"); await fresh.keyboard.press("Enter"); });
    await check("ColumnUndo", press("Control+z"));
    // 選択の見た目: 下へ移動の後は動かしたブロックだけが選ばれている。
    await markRows();
    await menu("e1", "movedown")();
    await fresh.waitForTimeout(250);
    const selection = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id));
    result.partialRenderSelectionMarksMovedBlock = selection.length === 1 && selection[0] === "e1";
    evidence.selection = selection;
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);

    // ロックしたページ: トグルの開閉(ロック中もできる)。
    await fresh.locator('.page-tree-item[data-page-id="P2"]').click();
    await fresh.waitForTimeout(250);
    await check("LockedToggleClose", async () => { await fresh.locator('#blocks .block[data-id="ot"] .toggle-caret').click(); }, 1);
    const lockedState = await fresh.evaluate(() => ({
      editable: [...document.querySelectorAll('#blocks [contenteditable="true"]')].length,
      locked: document.body.classList.contains("page-locked"),
    }));
    result.partialRenderLockedPageStaysReadOnly = lockedState.locked && lockedState.editable === 0;
    evidence.lockedState = lockedState;
    await fresh.locator('.page-tree-item[data-page-id="P1"]').click();
    await fresh.waitForTimeout(250);

    // ---- 2) 遠くの行は作り直さない ----
    await fresh.evaluate(() => {
      window.__keptNodes = {
        chart: document.querySelector('#blocks .block[data-id="ch"] .chart-canvas'),
        table: document.querySelector('#blocks .block[data-id="tbl"] .editor-table'),
        math: document.querySelector('#blocks .block[data-id="m1"] .math-canvas'),
        last: document.querySelector('#blocks .block[data-id="last"]'),
      };
    });
    const sameNodes = () => fresh.evaluate(() => {
      const now = {
        chart: document.querySelector('#blocks .block[data-id="ch"] .chart-canvas'),
        table: document.querySelector('#blocks .block[data-id="tbl"] .editor-table'),
        math: document.querySelector('#blocks .block[data-id="m1"] .math-canvas'),
        last: document.querySelector('#blocks .block[data-id="last"]'),
      };
      return Object.fromEntries(Object.entries(now).map(([key, node]) => [key, Boolean(node) && node === window.__keptNodes[key]]));
    });
    await caret("e1", "end");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const afterEnter = await sameNodes();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const afterUndo = await sameNodes();
    result.partialRenderKeepsFarRowsOnEnter = Object.values(afterEnter).every(Boolean);
    result.partialRenderKeepsFarRowsOnUndo = Object.values(afterUndo).every(Boolean);
    evidence.sameNodes = { afterEnter, afterUndo };

    // Undo の後も残した行のイベントが文書のブロックへ効く(行が掴むブロックは、Undo で戻した文書の中のオブジェクト)。
    // 済みの ToDo のチェックを外して保存すると、外れている。
    await markRows();
    await caret("e1", "end");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const todoKept = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="td1"]').__partialMark === true);
    await fresh.locator('#blocks .block[data-id="td1"] .todo-box').click();
    await fresh.waitForTimeout(150);
    const savedTodo = await savedBlock("td1");
    result.partialRenderKeptRowHandlersWorkAfterUndo = todoKept && savedTodo?.checked === false;
    evidence.keptHandlers = { todoKept, savedTodo };
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);

    // 描いた後に行の DOM が(モデルを通らずに)変わったら、その行は使い回さずに作り直す。
    await fresh.evaluate(() => {
      document.querySelector('#blocks .block-content[data-id="last"]').append(document.createTextNode("(描いた後の書き換え)"));
    });
    await caret("e1", "end");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const lastText = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="last"]').textContent);
    result.partialRenderRebuildsRowChangedInPlace = lastText === "最後";
    evidence.changedInPlace = lastText;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);

    // ---- 3) 速さ ----
    // keydown から次のフレームの後まで(描き直し・レイアウト・描画を含む)と、キーの処理そのもの(keydown の間。
    // 描き直しと、その中で待たされるスタイル・レイアウトの計算)。
    await fresh.evaluate(() => {
      window.__latency = [];
      window.__sync = [];
      let t0 = 0;
      window.addEventListener("keydown", () => {
        t0 = performance.now();
        const start = t0;
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => window.__latency.push(performance.now() - start);
          channel.port2.postMessage(0);
        });
      }, true);
      window.addEventListener("keydown", () => window.__sync.push(performance.now() - t0));
    });
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const timed = async (key) => {
      await fresh.evaluate(() => { window.__latency = []; window.__sync = []; });
      await fresh.keyboard.press(key);
      await fresh.waitForTimeout(400);
      return fresh.evaluate(() => [window.__latency.at(-1) ?? Infinity, window.__sync.at(-1) ?? Infinity]);
    };
    const bigText = (n) => {
      const blocks = [];
      for (let k = 0; blocks.length < n; k += 1) {
        const m = k % 20;
        const id = "b" + k;
        if (m === 0) blocks.push({ id, type: "heading2", text: "見出し " + k });
        else if (m === 2 || m === 3) blocks.push({ id, type: "bullet", text: "箇条書き " + k, indent: m - 2 });
        else if (m === 4) blocks.push({ id, type: "numbered", text: "番号 " + k });
        else if (m === 7) blocks.push({ id, type: "todo", text: "やること " + k, checked: k % 3 === 0 });
        else if (m === 9) blocks.push({ id, type: "code", text: "function f" + k + "(a, b) {\n  return a + b;\n}" });
        else blocks.push({ id, type: "paragraph", text: "段落 " + k + " 通常の文字。Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
          html: "段落 " + k + " 通常の<b>文字</b>。Lorem ipsum dolor sit amet, consectetur adipiscing elit." });
      }
      blocks.push({ id: "end", type: "paragraph", text: "最後" });
      return blocks;
    };
    const measureEnterUndo = async () => {
      const enter = [];
      const undo = [];
      for (let i = 0; i < 3; i += 1) {
        await caret("b15", "end");
        enter.push(await timed("Enter"));
        undo.push(await timed("Control+z"));
      }
      const pick = (list, index) => list.map((item) => Math.round(item[index]));
      return {
        enter: median(pick(enter, 0)), undo: median(pick(undo, 0)), enterSync: median(pick(enter, 1)), undoSync: median(pick(undo, 1)),
        enterAll: pick(enter, 0), undoAll: pick(undo, 0), enterSyncAll: pick(enter, 1), undoSyncAll: pick(undo, 1),
      };
    };
    await open({ title: "Big", fonts: [], attachments: [], pages: [{ id: "BIG", title: "Big", blocks: bigText(5000) }] });
    const big = await measureEnterUndo();
    result.partialRenderEnterOn5000IsFast = big.enter < 1000;
    result.partialRenderUndoOn5000IsFast = big.undo < 1000;
    // キーの処理そのもの(描き直しと、その中で待たされる計算)。題名の contenteditable を毎回書くと約 300ms 増えていた。
    result.partialRenderKeyHandlingOn5000IsFast = big.enterSync < 250 && big.undoSync < 250;
    evidence.big5000 = big;
    // 行を1つ出し入れしたときのスタイルの計算が、その行の周りだけで済む(#blocks の子に CSS の + の規則があると、
    // 全行のスタイルを計算し直す。5000 ブロックで約 350ms。部分の描き直しにしても Enter が速くならなかった原因)。
    const restyle = await fresh.evaluate(() => {
      const row = document.querySelector('#blocks .block[data-id="b15"]');
      const far = document.querySelector('#blocks .block-content[data-id="b4000"]');
      const times = [];
      for (let i = 0; i < 3; i += 1) {
        document.body.offsetHeight;
        const clone = row.cloneNode(true);
        clone.dataset.id = "restyle-probe";
        const t0 = performance.now();
        row.after(clone);
        getComputedStyle(far).color;
        times.push(performance.now() - t0);
        clone.remove();
        getComputedStyle(far).color;
      }
      return times.map(Math.round);
    });
    result.partialRenderRowInsertRestylesLocally = restyle.every((ms) => ms < 60);
    evidence.restyle5000 = restyle;

    // 表 20(50 行 × 10 列・式あり)・グラフ 20・参照の印を含む 1000 ブロック。
    const COL = "ABCDEFGHIJ";
    const table = (id, caption) => {
      const rows = [Array.from({ length: 10 }, (_, c) => ({ text: "列" + COL[c] }))];
      for (let r = 2; r <= 50; r += 1) {
        rows.push(Array.from({ length: 10 }, (_, c) => ({
          text: c < 5 ? String((r * 7 + c * 3) % 97) : c === 9 ? "=SUM(A" + r + ":" + COL[8] + r + ")" : "=" + COL[c - 1] + r + "*2+A" + r,
        })));
      }
      return { id, type: "table", caption, tableHeader: true, rows };
    };
    const mixed = bigText(1000);
    for (let t = 19; t >= 0; t -= 1) {
      const at = 40 + t * 48;
      mixed.splice(at, 0, table("tb" + t, "表 " + t), { id: "cv" + t, type: "chart", caption: "図 " + t,
        text: 'table(id="tb' + t + '")\nbar(A2:A50, B2:B50, label="B")\nplot(A2:A50, J2:J50, label="sum")' },
      { id: "rf" + t, type: "paragraph", text: "参照 表", html: '参照 <span class="figure-ref" data-ref="tb' + t + '">表</span>' });
    }
    await open({ title: "Mixed", fonts: [], attachments: [], pages: [{ id: "MIX", title: "Mixed", blocks: mixed }] });
    const mix = await measureEnterUndo();
    result.partialRenderEnterOnMixed1000IsFast = mix.enter < 400;
    evidence.mixed1000 = mix;

    result.partialRenderNoPageErrors = pageErrors.length === 0;
    evidence.pageErrors = pageErrors;
  } finally {
    await fresh.close();
  }
  result.partialRenderEvidence = evidence;
  return result;
}
