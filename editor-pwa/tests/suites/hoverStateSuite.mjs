// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 状態を地の色で見せるボタンは、マウスを乗せても地を失わない(Issue #250) ----
// 全体の button:hover(薄い灰の地)が、.sg-box-on(提案のパネルの付いているチェック。緑の地に白の ✓)や
// .link-apply(青の地に白の字)の地を奪い、白い ✓・白い字が灰の地に溶けて消えた(乗せただけで外れたように見えた)。
// 決まりは style.css の全体の hover 1か所(状態を地で見せるボタンは :not() に並べる)。
// ここでは :hover の計算値を、広い画面(1280)と狭い画面(800)の両方で測る。
// ふだんのボタンの hover(薄い灰)が変わらないことも見る。
const SOFT = "rgb(240, 242, 245)";
const GREEN = "rgb(58, 163, 91)";
const BLUE = "rgb(11, 107, 203)";

export default async function hoverStateSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  const evidence = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const doc = {
      pages: [{ id: "R", title: "確認", blocks: [{ id: "p1", type: "paragraph", text: "temp 25C" }, { id: "p2", type: "paragraph", text: "NEXT" }] }],
      fonts: [], attachments: [],
      suggestions: [{ author: { name: "Claude", kind: "ai" }, title: "t", changes: [{ op: "setText", block: "p1", text: "temp 23C" }, { op: "setText", block: "p2", text: "NEXT!" }] }],
    };
    const path = join(OUT, "hover-state.html");
    await writeFile(path, await fresh.evaluate((literal) => window.SingleHtmlFormat.buildPortableHtml(literal), doc), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "確認", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
    if (!(await fresh.locator("#suggest-pane .sg-box").count())) await fresh.locator("#suggest-toggle").click();
    await fresh.waitForSelector("#suggest-pane .sg-box-on");

    const measure = async (selector) => {
      await fresh.mouse.move(2, 2);
      const read = () => fresh.locator(selector).first().evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, text: el.textContent }; });
      const before = await read();
      await fresh.locator(selector).first().hover();
      await fresh.waitForTimeout(250);
      const after = await read();
      await fresh.mouse.move(2, 2);
      return { before, after };
    };
    // 隠れている部品(リンクの popover)を、見える所へ出して測る
    const showPopoverOf = (selector) => fresh.evaluate((sel) => {
      let node = document.querySelector(sel);
      while (node && node !== document.body) { node.hidden = false; node.classList.remove("hidden"); node = node.parentElement; }
      const pop = document.querySelector(sel).closest(".popover");
      if (pop) pop.style.cssText += ";position:fixed;left:200px;top:200px;display:block;z-index:99999";
    }, selector);
    // 状態を作りにくい部品は、クラス・属性だけ合わせた仮のボタンで測る
    const probe = async (cls, attrs) => {
      await fresh.evaluate(([c, a]) => {
        document.getElementById("hover-probe")?.remove();
        const wrap = document.createElement("div");
        wrap.id = "hover-probe";
        wrap.style.cssText = "position:fixed;left:300px;top:300px;z-index:99999;background:#fff;padding:20px";
        const button = document.createElement("button");
        button.className = c; button.id = "hover-probe-button"; button.textContent = "x";
        for (const key in a) button.setAttribute(key, a[key]);
        wrap.append(button); document.body.append(wrap);
      }, [cls, attrs]);
      return measure("#hover-probe-button");
    };

    for (const width of [1280, 800]) {
      await fresh.setViewportSize({ width, height: 800 });
      await fresh.waitForTimeout(150);
      if (!(await fresh.locator("#suggest-pane .sg-box-on").count())) await fresh.locator("#suggest-toggle").click();
      await fresh.waitForSelector("#suggest-pane .sg-box-on");
      const on = await measure("#suggest-pane .sg-box-on");
      result["hoverKeepsCheckedBox" + width] = on.before.bg === GREEN && on.after.bg === GREEN && on.after.text === "✓" && on.after.color === "rgb(255, 255, 255)";
      evidence["checked" + width] = on;
      await showPopoverOf("#link-apply");
      const apply = await measure("#link-apply");
      result["hoverKeepsLinkApply" + width] = apply.before.bg === BLUE && apply.after.bg === BLUE;
      evidence["linkApply" + width] = apply;
      await fresh.evaluate(() => { document.querySelector("#link-apply").closest(".popover").style.display = "none"; });
    }

    // 状態を地の色で見せるほかの部品(洗って見つけたもの)も、乗せて地が変わらない
    const kept = [
      ["format-button active", {}], ["color-tool", { "aria-expanded": "true" }], ["image-align-button", { "aria-pressed": "true" }],
      ["table-tool is-on", {}], ["menu-command menu-font-style", { "aria-checked": "true" }], ["suggest-toggle", { "aria-pressed": "true" }],
      ["callout-icon-choice", { "aria-checked": "true" }], ["size-option", { "aria-selected": "true" }], ["primary", {}],
    ];
    const keptBad = [];
    for (const [cls, attrs] of kept) {
      const m = await probe(cls, attrs);
      if (m.before.bg !== m.after.bg) keptBad.push(cls + " " + m.before.bg + " -> " + m.after.bg);
    }
    result.hoverKeepsOtherStateButtons = keptBad.length === 0;
    evidence.keptBad = keptBad;

    // ふだんのボタンの hover は変わらない(薄い灰)
    const plain = [];
    for (const [cls, attrs] of [["format-button", {}], ["sg-box sg-box-off", {}], ["sg-box sg-box-part", {}], ["menu-button", {}]]) {
      plain.push([cls, (await probe(cls, attrs)).after.bg]);
    }
    result.hoverPlainButtonsStaySoft = plain.every(([, bg]) => bg === SOFT);
    evidence.plain = plain;
    result.hoverStateEvidence = JSON.stringify(evidence);
    return result;
  } finally {
    await fresh.close();
  }
}
