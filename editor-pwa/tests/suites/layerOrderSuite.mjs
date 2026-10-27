// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT } from "../lib.mjs";

// ---- メニュー類と横の欄の重なり順(v284。Issue #243) ----
// 提案の欄を開いたまま表の絞り込みを開くと、メニューが提案の欄の下に隠れて操作できなかった(メニュー類の z-index 20 < 提案の欄 25)。
// メニュー(.popover の仲間: つまみ・スラッシュ・表の絞り込み・ページなど)は、横の欄(表の帯・グラフの設定欄・提案の欄・目次のオーバーレイ・検索の帯)より
// 上に出る。上の道具の帯の中にある書体・大きさ・色の一覧は、帯(z-index 5)の重なりに縛られるので対象外(Issue #243 の残り)。
// 欄とメニューを同じ場所に重ねて、重なった点でいちばん上にあるのがメニューかを見る(位置ではなく重なり順を確かめる)。
export default async function layerOrderSuite({ context }) {
  const page = await context.newPage();
  const result = {};
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await page.waitForSelector("#blocks .block-content");
    const outcome = await page.evaluate(() => {
      const panes = [".suggest-pane", ".chart-pane", ".table-toolbar", ".search-bar"].map((selector) => document.querySelector(selector)).filter(Boolean);
      const menus = [...document.querySelectorAll(".popover")].filter((menu) => !menu.closest(".toolbar"));
      const checks = [];
      for (const pane of panes) {
        for (const menu of menus) {
          const saved = { pane: pane.getAttribute("style"), paneHidden: pane.hidden, menu: menu.getAttribute("style"), menuHidden: menu.hidden };
          pane.hidden = false;
          pane.style.cssText += ";display:block;position:fixed;left:100px;top:100px;width:300px;height:300px;";
          menu.hidden = false;
          menu.style.cssText += ";display:block;position:fixed;left:150px;top:150px;width:200px;height:200px;";
          const top = document.elementFromPoint(250, 250);
          checks.push({ pane: pane.className || pane.id, menu: menu.id || menu.className, menuOnTop: Boolean(top && (top === menu || menu.contains(top))) });
          pane.setAttribute("style", saved.pane || "");
          if (saved.pane === null) pane.removeAttribute("style");
          pane.hidden = saved.paneHidden;
          menu.setAttribute("style", saved.menu || "");
          if (saved.menu === null) menu.removeAttribute("style");
          menu.hidden = saved.menuHidden;
        }
      }
      return { panes: panes.length, menus: menus.length, checks };
    });
    result.popoversAboveSidePanes = outcome.panes >= 3 && outcome.menus >= 3 && outcome.checks.every((check) => check.menuOnTop);
    result.layerOrderEvidence = outcome.checks.filter((check) => !check.menuOnTop).map((check) => check.menu + " < " + check.pane).join(" | ") || "ok " + outcome.checks.length;

    // 上の道具の帯の書体・大きさ・文字色・背景色(Issue #243 の残り)。提案の欄を開いたまま、広い画面と狭い画面で(複数ページの文書。
    // ページの道の行が出て帯が高くなる(124px)ので、決め打ちの 96px とずれる)、
    // (1) 欄が帯の下端から始まる(以前は CSS の決め打ち 96px で帯(124px)の下の部分にかぶり、800px では文字色・背景色のボタンが押せなかった)
    // (2) ボタンをふつうに押せて、開いた一覧のどこも欄に隠れない(以前は帯の重なり(5)に縛られ、一覧の右側が欄(25)の下に隠れた)
    const toolbarChecks = [];
    for (const width of [1280, 800]) {
      await page.setViewportSize({ width, height: 800 });
      const html = await page.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
        pages: [{ id: "P", title: "重なり", blocks: [
          { id: "b1", type: "paragraph", text: "提案の欄を開いたまま、帯の一覧を開く。" },
          { id: "b2", type: "paragraph", text: "二つ目の段落。" },
          { id: "b3", type: "page", pageId: "Q" },
        ] }, { id: "Q", title: "子のページ", blocks: [{ id: "q1", type: "paragraph", text: "子" }] }],
        fonts: [],
        attachments: [],
        suggestions: [{ id: "sg", author: { name: "Claude", kind: "ai" }, createdAt: "2026-10-26", title: "言い回し", changes: [{ id: "c1", op: "setText", block: "b2", text: "二つ目の段落を直した。" }] }],
      }));
      await page.locator("#open-input").setInputFiles({ name: "layer.html", mimeType: "text/html", buffer: Buffer.from(html) });
      await page.waitForFunction(() => { const pane = document.querySelector(".suggest-pane"); return pane && !pane.hidden && pane.getBoundingClientRect().width > 0; }, null, { timeout: 5000 }).catch(() => {});
      const place = await page.evaluate(() => ({
        toolbarBottom: Math.round(document.querySelector(".toolbar").getBoundingClientRect().bottom),
        paneTop: Math.round(document.querySelector(".suggest-pane")?.getBoundingClientRect().top ?? -1),
        paneShown: Boolean(document.querySelector(".suggest-pane") && !document.querySelector(".suggest-pane").hidden),
      }));
      const menus = {};
      for (const [name, trigger, menu] of [["font", "#format-font", "#format-font-menu"], ["size", "#format-size", "#format-size-menu"], ["color", "#format-color-trigger", "#format-color-menu"], ["background", "#format-background-trigger", "#format-background-menu"]]) {
        await page.locator('#blocks .block[data-id="b1"] .block-content').click();
        // ふつうに押す(欄がボタンにかぶっていれば、押せずに時間切れになる)
        const clicked = await page.locator(trigger).click({ timeout: 2000 }).then(() => true, () => false);
        await page.waitForTimeout(150);
        menus[name] = await page.evaluate(({ selector, clicked }) => {
          const box = document.querySelector(selector);
          if (!clicked || !box || box.hidden) return { clicked, open: false, hidden: -1 };
          const rect = box.getBoundingClientRect();
          let hidden = 0;
          for (let x = rect.left + 4; x < rect.right - 4; x += 12) {
            for (let y = rect.top + 4; y < rect.bottom - 4; y += 12) {
              const top = document.elementFromPoint(x, y);
              if (!(top && (top === box || box.contains(top)))) hidden += 1;
            }
          }
          return { clicked, open: true, hidden };
        }, { selector: menu, clicked });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);
      }
      toolbarChecks.push({ width, ...place, menus });
    }
    result.toolbarMenusAboveSuggestPane = toolbarChecks.every((check) => check.paneShown && check.paneTop >= check.toolbarBottom
      && Object.values(check.menus).every((menu) => menu.clicked && menu.open && menu.hidden === 0));
    result.toolbarMenusEvidence = toolbarChecks;
  } finally {
    await page.close();
  }
  return result;
}
