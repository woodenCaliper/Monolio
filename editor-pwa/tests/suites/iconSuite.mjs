// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { insertBlock, PORT } from "../lib.mjs";

// ---- アイコンは図形(SVG)で描く(v174) ----
// 文字(⋮ ▸ ☰ ← × 🗑 など)のアイコンは、文字の幅・余白・形が OS のフォントで変わり、
// Linux ではボタンからはみ出して本文のクリックを奪ったり(v172)、記号の位置がずれたり(v173)した。
// 画面のいくつかの状態と保存HTMLで、文字のアイコンが残っていないことを見る。
export default async function iconSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 画面にある全要素(隠れているものも含む)の、要素直下の文字を調べる。本文・題名・入力欄・
    // メニューの説明文は文字そのものなので対象外。アイコンになりがちな記号(矢印・図形・絵文字・
    // 数学記号・「•」「—」)が、ASCII 以外で1文字でも入っていたら「文字のアイコン」とみなす。
    const glyphIcons = (state) => fresh.evaluate((label) => {
      const isGlyph = (text) => [...text].some((ch) => ch.codePointAt(0) > 0x7f && /[\p{So}\p{Sm}•—]/u.test(ch));
      const skip = "#blocks .block-content, #doc-title, .page-title, .menu-title, .menu-desc, .page-tree-item, option, textarea, .chart-pane-code, .status, #status";
      const found = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest(skip)) continue;
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          const text = node.nodeValue.trim();
          if (text && isGlyph(text)) found.push(label + ": " + (el.id ? "#" + el.id : el.className || el.tagName) + " " + JSON.stringify(text));
        }
      }
      return found;
    }, state);
    const found = [];

    // 文書を用意: 箇条書き・トグル・ToDo・表・子ページ
    await fresh.locator("#blocks .block-content").nth(1).click();
    await fresh.keyboard.type("icon plain");
    await insertBlock(fresh, "bullet");
    await fresh.keyboard.type("icon bullet");
    await insertBlock(fresh, "toggle");
    await fresh.keyboard.type("icon toggle");
    await insertBlock(fresh, "todo");
    await fresh.keyboard.type("icon todo");
    await insertBlock(fresh, "page");
    await fresh.waitForTimeout(300);
    // 子ページを作ると、そのページへ移ることがある。元のページへ戻ってから続ける。
    const firstTreeItem = fresh.locator("#page-tree-body .page-tree-item").first();
    if (await firstTreeItem.count()) await firstTreeItem.click();
    await fresh.waitForTimeout(200);
    await fresh.locator("#blocks .block-content", { hasText: "icon todo" }).click();
    await insertBlock(fresh, "table");
    await fresh.waitForTimeout(200);

    // 1) 通常(ブロックにホバーしてハンドルを出す)
    await fresh.locator("#blocks .block-content", { hasText: "icon bullet" }).hover();
    found.push(...await glyphIcons("通常"));
    // ハンドル・トグルの三角・箇条書きの点が図形であること
    result.blockMarkersAreShapes = await fresh.evaluate(() => {
      const row = (text) => [...document.querySelectorAll("#blocks .block")]
        .find((item) => item.querySelector(".block-content")?.textContent === text);
      const bullet = row("icon bullet");
      const toggle = row("icon toggle");
      return Boolean(bullet?.querySelector('.drag-grip svg[data-icon="grip"]'))
        && Boolean(bullet?.querySelector('.insert-block svg[data-icon="plus"]'))
        && Boolean(bullet?.querySelector(".bullet-marker .bullet-dot"))
        && Boolean(toggle?.querySelector(".toggle-caret svg[data-icon^='caret-']"));
    });
    // 書式ツールバーは Material Symbols の図形(v175。文字の B・I・S・Tx は分かりにくいとユーザー指示。文字色・背景色は今の絵のまま)
    result.formatToolbarUsesMaterialIcons = await fresh.evaluate(() => {
      const expected = {
        "#format-bold": "format-bold",
        "#format-italic": "format-italic",
        "#format-strike": "format-strikethrough",
        "#format-reset": "format-clear",
      };
      return Object.entries(expected).every(([selector, icon]) => {
        const button = document.querySelector(selector);
        return Boolean(button?.querySelector(`svg.ui-icon[data-icon="${icon}"]`)) && !button.textContent.trim();
      });
    });
    // 2) 表のセルにカーソル(表の操作がツールバーに出る)
    await fresh.locator(".editor-table td").first().click();
    await fresh.waitForTimeout(150);
    found.push(...await glyphIcons("表"));
    result.tableToolsAreShapes = await fresh.evaluate(() => {
      // v229: 右端の「データベース」の切り替えだけは、図形に名前を添える(案1。ユーザー決定)。ほかは図形だけ。
      const tools = [...document.querySelectorAll("#table-toolbar .table-tool")];
      const shapes = tools.filter((tool) => !tool.classList.contains("table-tool-db"));
      const db = tools.find((tool) => tool.classList.contains("table-tool-db"));
      return shapes.length >= 10 && shapes.every((tool) => tool.querySelector("svg.ui-icon") && !tool.textContent.trim())
        && Boolean(db?.querySelector("svg.ui-icon")) && db.textContent.trim() === "データベース";
    });
    // 3) ブロックのメニュー(つまみをクリック)
    await fresh.locator("#blocks .block", { hasText: "icon plain" }).first().locator(".drag-grip").click();
    await fresh.waitForTimeout(250);
    found.push(...await glyphIcons("ブロックメニュー"));
    await fresh.keyboard.press("Escape");
    // 4) スラッシュメニュー
    await fresh.locator("#blocks .block-content", { hasText: "icon plain" }).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("/");
    await fresh.waitForTimeout(250);
    found.push(...await glyphIcons("スラッシュメニュー"));
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Backspace");
    // 5) コマンドパレット
    await fresh.keyboard.press("Control+k");
    await fresh.waitForTimeout(250);
    found.push(...await glyphIcons("コマンドパレット"));
    await fresh.keyboard.press("Escape");
    // 6) ページ目次の「…」とページのメニュー
    const childRow = fresh.locator("#page-tree-body .page-tree-row", { has: fresh.locator(".page-tree-more") }).first();
    if (await childRow.count()) {
      await childRow.hover();
      found.push(...await glyphIcons("ページ目次"));
      await childRow.locator(".page-tree-more").click();
      await fresh.waitForTimeout(200);
      found.push(...await glyphIcons("ページのメニュー"));
      await fresh.keyboard.press("Escape");
    } else {
      found.push("ページ目次: 子ページの行が見つからない(状態を作れていない)");
    }
    // 7) 検索バー
    await fresh.locator("#blocks .block-content", { hasText: "icon plain" }).click();
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(200);
    found.push(...await glyphIcons("検索バー"));
    await fresh.keyboard.press("Escape");

    // 見つかったものの一覧(証拠)。配列にしないのは、空の配列が「真偽値の配列」として不合格に数えられるため。
    result.iconGlyphsFound = found.join(" / ") || "none";
    result.uiHasNoGlyphIcons = found.length === 0;

    // 8) 保存HTML: ToDo の箱・ページ送りのバー・ページリンクは図形、トグルの三角と点は CSS の図形
    const exported = await fresh.evaluate(() => {
      const html = window.SingleHtmlFormat.buildPortableHtml({
        pages: [
          { id: "P1", title: "Icon One", blocks: [
            { id: "e1", type: "toggle", text: "exp toggle", open: true },
            { id: "e2", type: "bullet", text: "exp bullet" },
            { id: "e3", type: "todo", text: "exp todo", checked: false },
            { id: "e4", type: "todo", text: "exp done", checked: true },
            { id: "e5", type: "page", text: "", pageId: "P2" },
          ] },
          { id: "P2", title: "Icon Two", blocks: [{ id: "e6", type: "paragraph", text: "two" }] },
        ],
        fonts: [],
        attachments: [],
      });
      const view = new DOMParser().parseFromString(html, "text/html");
      const style = [...view.querySelectorAll("style")].map((node) => node.textContent).join("\n");
      const marks = [...view.querySelectorAll(".todo-mark")];
      const barButtons = [...view.querySelectorAll("#doc-page-bar button")];
      return {
        todoMarksAreShapes: marks.length === 2 && marks.every((mark) => mark.querySelector("svg") && !mark.textContent.trim()),
        pageBarIsShapes: barButtons.length === 3 && barButtons.every((button) => button.querySelector("svg") && !button.textContent.trim()),
        pageLinkIsShape: Boolean(view.querySelector(".page-link .page-link-icon svg")),
        noGlyphMarkersInCss: !/content:\s*"[▸▾•☐☑]"/.test(style),
      };
    });
    result.exportedIconsAreShapes = Object.values(exported).every(Boolean);
    result.exportedIconChecks = exported;
    return result;
  } finally {
    await fresh.close();
  }
}
