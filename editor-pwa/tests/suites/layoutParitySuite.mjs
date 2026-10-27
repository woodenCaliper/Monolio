// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- エディタと保存HTMLの見た目の突き合わせ(P7。v190) ----
// 同じ文書をエディタで開いた画面と、保存したHTMLをブラウザで開いた画面で、ブロックの種類ごとに
// 本文の位置(左右・上下の間隔)・文字の大きさ/太さ/行の高さ・記号(点・番号・箱・三角)の位置・
// 長い段落の折り返し・表/グラフ/数式/目次などの箱の位置と大きさを比べる。
// きっかけ: 保存HTMLでトグルの中身が字下げされていなかった(v182 でユーザーが発見)。点検すると、本文の幅
// (820px と 900px で折り返しが違う)・行の高さ・見出しの大きさ・ブロックの間隔・引用とコードの位置・
// 目次・グラフの枠・ページリンク・段組み・画像の枠が少しずつ違っていた。
const TOLERANCE = 1.5; // px(数式の描画など、字形の丸めのぶん)

const cells = (...values) => values.map((text) => ({ text }));
const B = (id, type, text, extra = {}) => ({ id, type, text, ...extra });
const LONG = "WRAP 長い段落です。エディタと保存HTMLで折り返しの位置が同じかを見るための文で、何行かにわたって続きます。Bold と italic と inline code も入ります。".repeat(3);
// BLOCKS・NEEDLES・measure は appearanceSuite(文書の書体・小さい文字の突き合わせ)も使う。
export const BLOCKS = [
  B("p0", "paragraph", "REF paragraph text"),
  B("lw", "paragraph", LONG),
  B("fm", "paragraph", "FMT plain", { html: 'FMT plain <b>BOLDW</b> <i>ITALW</i> <s>STRIKEW</s> <code class="inline-code">CODEW</code> <span style="color: rgb(193, 63, 47);">REDW</span> TAILW' }),
  B("h1", "heading1", "H1 heading"), B("h2", "heading2", "H2 heading"), B("h3", "heading3", "H3 heading"),
  B("h4", "heading4", "H4 heading"), B("h5", "heading5", "H5 heading"),
  B("b0", "bullet", "BUL0 item"), B("b1", "bullet", "BUL1 item", { indent: 1 }), B("b2", "bullet", "BUL2 item", { indent: 2 }),
  B("n0", "numbered", "NUM0 item"), B("n1", "numbered", "NUM1 item", { indent: 1 }), B("n2", "numbered", "NUM0b item"),
  B("t0", "todo", "TODO0 item", { checked: false }), B("t1", "todo", "TODO1 item", { checked: true, indent: 1 }),
  B("q0", "quote", "QUOTE text"),
  B("c0", "code", "CODE text"),
  B("g0", "toggle", "TOG0 text", { open: true }), B("g0c", "paragraph", "TOG0 child para", { indent: 1 }),
  B("g0b", "bullet", "TOG0 child bullet", { indent: 1 }),
  // トグルの中で1段・2段深い箇条書きと段落(#132。保存HTMLでトグルのすぐ下の入れ子が1段浅かった)
  B("g0d", "bullet", "TOGDEEP1 bullet", { indent: 2 }), B("g0e", "bullet", "TOGDEEP2 bullet", { indent: 3 }),
  B("g0p", "paragraph", "TOGDEEPP para", { indent: 2 }),
  B("g1", "toggle", "TOG1 nested", { open: true, indent: 1 }), B("g1c", "paragraph", "TOG1 child para", { indent: 2 }),
  B("th", "toggleHeading2", "TH2 text", { open: true }), B("thc", "paragraph", "TH2 child para", { indent: 1 }),
  B("pi", "paragraph", "PIND1 para", { indent: 1 }),
  B("p9", "paragraph", "AFTER para"),
  B("dv", "divider", ""),
  B("pd", "paragraph", "POSTDIV para"),
  B("tb", "table", "", { caption: "TCAP table caption", rows: [cells("TBL a", "TBL b"), cells("1", "2"), cells("3", "4"),
    // セルの中の改行(#136。保存HTMLでは改行が消えて1行につながっていた)
    cells("5", "LINE1 上の行\nLINE2 下の行")] }),
  B("pt", "paragraph", "POSTTBL para"),
  B("m0", "math", "x^2"),
  B("pm", "paragraph", "POSTMATH para"),
  B("ch", "chart", "plot(A2:A3, B2:B3)", { caption: "GCAP chart caption" }),
  B("pc", "paragraph", "POSTCHART para"),
  B("tc", "toc", ""),
  B("po", "paragraph", "POSTTOC para"),
  B("pg", "page", "", { pageId: "LP2" }),
  B("pp", "paragraph", "POSTPAGE para"),
  B("k1", "paragraph", "COLA para", { columnGroup: "cg", columnIndex: 0 }),
  B("k2", "paragraph", "COLB para", { columnGroup: "cg", columnIndex: 1 }),
  B("pk", "paragraph", "POSTCOL para"),
  B("at", "attachment", "", { attachmentId: "att1" }),
  B("pa", "paragraph", "POSTATT para"),
  B("im", "attachment", "", { attachmentId: "img1", caption: "ICAP image caption" }),
  B("pz", "paragraph", "END para"),
];
export const NEEDLES = ["WRAP", "FMT plain", "BOLDW", "ITALW", "STRIKEW", "CODEW", "REDW", "TAILW",
  "H1 heading", "H2 heading", "H3 heading", "H4 heading", "H5 heading", "BUL0", "BUL1", "BUL2", "NUM0 ", "NUM1", "NUM0b",
  "TODO0", "TODO1", "QUOTE", "CODE text", "TOG0 text", "TOG0 child para", "TOG0 child bullet", "TOGDEEP1", "TOGDEEP2", "TOGDEEPP", "TOG1 nested", "TOG1 child",
  "TH2 text", "TH2 child", "PIND1", "AFTER", "POSTDIV", "TCAP", "TBL a", "LINE1", "LINE2", "POSTTBL", "POSTMATH", "GCAP", "POSTCHART", "POSTTOC", "POSTPAGE",
  "COLA", "COLB", "POSTCOL", "POSTATT", "ICAP", "END para"];

// 画面の中の位置を測る(エディタ・保存HTMLの両方で同じ関数を使う)。基準は先頭の段落の文字の左上。
export function measure(needles) {
  const out = { text: {}, box: {} };
  const editor = Boolean(document.querySelector("#blocks"));
  const root = editor ? document.querySelector("#blocks") : document.querySelector("main");
  const textRect = (needle) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.nodeValue.indexOf(needle);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const rect = range.getBoundingClientRect();
      const style = getComputedStyle(node.parentElement);
      return { node, el: node.parentElement, left: rect.left, top: rect.top, cy: rect.top + rect.height / 2, box: rect,
        fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color,
        decoration: getComputedStyle(node.parentElement.closest(".block-content, p, li, summary, h2, h3, h4, h5, h6") || node.parentElement).textDecorationLine };
    }
    // エディタの図表の題名は入力欄(input)の中の文字。欄の箱と同じ大きさの文字の行として測る(v191)。
    const input = [...root.querySelectorAll(".block-caption-input")].find((node) => node.value.includes(needle));
    if (input) {
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      // 上下は同じ行の「表n:」の文字で測る(入力欄の中の文字は範囲で測れない)。左は欄の左端。
      const range = document.createRange();
      range.selectNodeContents(input.parentElement.querySelector(".block-caption-label"));
      const labelRect = range.getBoundingClientRect();
      const top = labelRect.top;
      return { node: input, el: input, left: rect.left + parseFloat(style.paddingLeft), top, cy: top + labelRect.height / 2,
        fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, decoration: style.textDecorationLine };
    }
    return null;
  };
  const ref = textRect("REF paragraph");
  const marker = (t) => {
    if (editor) {
      const row = t.el.closest(".block");
      const node = row?.querySelector(".bullet-dot, .numbered-marker, .todo-box, .toggle-caret svg");
      if (!node) return null;
      if (node.classList.contains("numbered-marker")) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { x: rect.left, cy: rect.top + rect.height / 2, w: rect.width };
      }
      const rect = node.getBoundingClientRect();
      return { x: rect.left, cy: rect.top + rect.height / 2, w: rect.width };
    }
    const li = t.el.closest("li");
    if (li) {
      const style = getComputedStyle(li, "::before");
      const rect = li.getBoundingClientRect();
      return { x: rect.left + parseFloat(style.left), cy: rect.top + parseFloat(style.top), w: parseFloat(style.width) };
    }
    const number = t.el.closest(".numbered-item")?.querySelector(".numbered-marker");
    if (number) {
      const range = document.createRange();
      range.selectNodeContents(number);
      const rect = range.getBoundingClientRect();
      return { x: rect.left, cy: rect.top + rect.height / 2, w: rect.width };
    }
    const todo = t.el.closest(".todo")?.querySelector(".todo-mark svg");
    if (todo) {
      const rect = todo.getBoundingClientRect();
      return { x: rect.left, cy: rect.top + rect.height / 2, w: rect.width };
    }
    const summary = t.el.closest("summary");
    if (summary) {
      const style = getComputedStyle(summary, "::before");
      const rect = summary.getBoundingClientRect();
      return { x: rect.left + parseFloat(style.left), cy: rect.top + parseFloat(style.top), w: parseFloat(style.width) };
    }
    return null;
  };
  let previousTop = ref.top;
  for (const needle of needles) {
    const t = textRect(needle);
    if (!t) { out.text[needle] = null; continue; }
    const m = marker(t);
    out.text[needle] = {
      dx: t.left - ref.left, dy: t.top - previousTop, fontSize: t.fontSize, fontWeight: t.fontWeight, lineHeight: t.lineHeight,
      color: t.color, decoration: t.decoration,
      marker: m ? { dx: m.x - ref.left, gap: t.left - (m.x + m.w), dcy: m.cy - t.cy } : null,
    };
    previousTop = t.top;
  }
  const wrapWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = wrapWalker.nextNode(); node; node = wrapWalker.nextNode()) {
    if (!node.nodeValue.startsWith("WRAP")) continue;
    const last = document.createRange();
    last.setStart(node, node.nodeValue.length - 1);
    last.setEnd(node, node.nodeValue.length);
    const rect = last.getBoundingClientRect();
    const whole = document.createRange();
    whole.selectNodeContents(node);
    out.wrap = { lines: whole.getClientRects().length, endX: rect.left - ref.left, endY: rect.top - ref.top };
    break;
  }
  const title = document.querySelector(editor ? "#doc-title" : "main h1");
  if (title) {
    const range = document.createRange();
    range.selectNodeContents(title);
    const rect = range.getBoundingClientRect();
    const style = getComputedStyle(title);
    out.title = { dx: rect.left - ref.left, toRef: ref.top - rect.top, fontSize: style.fontSize, fontWeight: style.fontWeight };
  }
  const boxes = editor
    ? { table: "#blocks .editor-table", math: "#blocks .math-canvas", chart: "#blocks .chart-canvas", chartBar: "#blocks .chart-source-bar",
      toc: "#blocks .type-toc .block-content", tocItem: "#blocks .toc-item", page: "#blocks .page-link", code: "#blocks .type-code .block-content",
      attach: "#blocks .attachment-card", image: "#blocks .image-attachment-stage", column: "#blocks .column", divider: "#blocks .type-divider hr" }
    : { table: "main table.doc-table", math: "main .doc-math", chart: "main .doc-chart-canvas", chartBar: "main .doc-chart-source",
      toc: "main .toc", tocItem: "main .toc a", page: "main p.page-link a", code: "main pre",
      attach: "main .attachment", image: "main .image-attachment img", column: "main .doc-column", divider: "main hr" };
  for (const [name, selector] of Object.entries(boxes)) {
    const node = document.querySelector(selector);
    if (!node) { out.box[name] = null; continue; }
    const rect = node.getBoundingClientRect();
    out.box[name] = { dx: rect.left - ref.left, dy: rect.top - ref.top, w: rect.width, h: rect.height };
  }
  const box = document.querySelector("#blocks .todo-box");
  if (box) out.todoBox = { appearance: getComputedStyle(box).appearance, drawn: getComputedStyle(box).backgroundImage.includes("data:image/svg+xml") };
  return out;
}

export default async function layoutParitySuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const literal = { title: "Parity", fonts: [], attachments: [], pages: [
      { id: "LP1", title: "Parity", blocks: BLOCKS },
      { id: "LP2", title: "Second", blocks: [B("s1", "paragraph", "second")] },
    ] };
    const source = join(OUT, "layout-parity.html");
    await writeFile(source, await fresh.evaluate(async (doc) => {
      const file = new File([new Uint8Array([1, 2, 3, 4])], "data.bin", { type: "application/octet-stream" });
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 200;
      const pen = canvas.getContext("2d");
      pen.fillStyle = "#4a90d9";
      pen.fillRect(0, 0, 400, 200);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const image = new File([blob], "pic.png", { type: "image/png" });
      doc.attachments = [await window.SingleHtmlFormat.fileToAttachment(file, "att1"), await window.SingleHtmlFormat.fileToAttachment(image, "img1")];
      return window.SingleHtmlFormat.buildPortableHtml(doc);
    }, literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Parity", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(600);
    await fresh.evaluate(() => window.scrollTo(0, 0));
    const editor = await fresh.evaluate(measure, NEEDLES);
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const saved = join(DOWNLOADS, "layout-parity-saved.html");
    await (await download).saveAs(saved);
    const view = await context.newPage();
    await view.setViewportSize({ width: 1280, height: 900 });
    await view.goto("file://" + saved);
    await view.waitForTimeout(500);
    const exported = await view.evaluate(measure, NEEDLES);
    await view.close();

    const near = (a, b, tolerance = TOLERANCE) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tolerance;
    const diffs = { position: [], font: [], marker: [], box: [] };
    for (const needle of NEEDLES) {
      const a = editor.text[needle];
      const b = exported.text[needle];
      if (!a || !b) { diffs.position.push(needle + " missing"); continue; }
      if (!near(a.dx, b.dx)) diffs.position.push(needle + " dx " + a.dx.toFixed(1) + "/" + b.dx.toFixed(1));
      if (!near(a.dy, b.dy)) diffs.position.push(needle + " dy " + a.dy.toFixed(1) + "/" + b.dy.toFixed(1));
      for (const key of ["fontSize", "fontWeight", "lineHeight", "color"]) {
        if (a[key] !== b[key]) diffs.font.push(needle + " " + key + " " + a[key] + "/" + b[key]);
      }
      if (Boolean(a.marker) !== Boolean(b.marker)) diffs.marker.push(needle + " marker presence");
      else if (a.marker) {
        for (const key of ["dx", "gap", "dcy"]) {
          if (!near(a.marker[key], b.marker[key])) diffs.marker.push(needle + " marker " + key + " " + a.marker[key].toFixed(1) + "/" + b.marker[key].toFixed(1));
        }
      }
    }
    for (const name of Object.keys(editor.box)) {
      const a = editor.box[name];
      const b = exported.box[name];
      if (!a || !b) { diffs.box.push(name + " missing"); continue; }
      for (const key of ["dx", "dy", "w", "h"]) {
        if (!near(a[key], b[key], 2)) diffs.box.push(name + " " + key + " " + a[key].toFixed(1) + "/" + b[key].toFixed(1));
      }
    }
    result.parityTextPositions = diffs.position.length === 0;
    // トグルの中の入れ子も1段ごとに 28px 下がる(#132。保存HTMLではトグルのすぐ下の .indent に字下げが足されていなかった)
    const steps = (side) => ["TOG0 child bullet", "TOGDEEP1", "TOGDEEP2"].map((needle) => side.text[needle]?.dx);
    const stepOk = (side) => { const [a, b, c] = steps(side); return near(b - a, 28) && near(c - b, 28); };
    result.parityToggleNestedIndent = stepOk(editor) && stepOk(exported) && near(exported.text.TOGDEEPP?.dx, editor.text.TOGDEEPP?.dx);
    // セルの中の改行は、保存HTMLでもエディタと同じく次の行に出る(#136)
    result.parityTableCellNewline = [editor, exported].every((side) => side.text.LINE2?.dy > 10 && Math.abs(side.text.LINE2.dx - side.text.LINE1.dx) < 1)
      && near(exported.box.table?.h, editor.box.table?.h, 2);
    result.parityFonts = diffs.font.length === 0;
    result.parityMarkers = diffs.marker.length === 0;
    result.parityBoxes = diffs.box.length === 0;
    // 長い段落は同じ所で折り返す(本文の幅がそろっている)
    result.parityLineWraps = Boolean(editor.wrap && exported.wrap && editor.wrap.lines === exported.wrap.lines && editor.wrap.lines >= 3
      && near(editor.wrap.endX, exported.wrap.endX) && near(editor.wrap.endY, exported.wrap.endY));
    // 題名は本文より左へ出る(エディタと同じ。ユーザー決定)。大きさと本文までの間隔も同じ
    result.parityTitle = Boolean(editor.title && exported.title && near(editor.title.dx, exported.title.dx) && editor.title.dx < -40
      && near(editor.title.toRef, exported.title.toRef) && editor.title.fontSize === exported.title.fontSize);
    // 済んだ ToDo は両方とも灰色で取り消し線(ユーザー決定)。エディタの箱は OS 標準の見た目ではなく図形
    const done = (side) => side.text.TODO1;
    result.parityCheckedTodo = done(editor)?.color === "rgb(107, 112, 120)" && done(exported)?.color === "rgb(107, 112, 120)"
      && done(editor)?.decoration.includes("line-through") && done(exported)?.decoration.includes("line-through")
      && editor.todoBox?.appearance === "none" && editor.todoBox?.drawn === true;
    result.parityEvidence = { ...diffs, toggleSteps: [steps(editor), steps(exported)], wrap: [editor.wrap, exported.wrap], title: [editor.title, exported.title], todoBox: editor.todoBox };
  } finally {
    await fresh.close();
  }
  return result;
}
