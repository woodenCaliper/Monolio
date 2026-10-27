// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 画面まわりの不具合(v252。探索的なデバッグで見つけたもの。ユーザー指示「あなたの側で、順番に直していってほしい」) ----
// 1) Issue #101: ブラウザのメニューから印刷すると、本文が 40px 幅の列に詰め込まれた(つまみの列を display:none にしていた)。
// 2) Issue #104: 「戻る」でページに戻ると、上に画像があるときスクロールの位置がずれた。
// 3) Issue #107: 狭い画面(480px 以下)で Edit / View / Attach Files のメニューが右へはみ出した。
// 4) Issue #108: グラフの題名・軸の名前が長いと、両端が枠の外へ出て切れた。
// 5) Issue #114: 保存HTMLを単体で開くと、空白の無い長い語が右で切れた。
export default async function visualFixSuite({ browser }) {
  const result = {};
  const pageErrors = [];
  const newPage = async (width, height = 860) => {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => {
      Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
      Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector("#blocks .block-content");
    return { context, page };
  };
  let opened = 0;
  const openDoc = async (page, pages, extra = {}) => {
    const path = join(OUT, "visual-fix-" + (opened += 1) + ".html");
    await writeFile(path, await page.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), { pages, fonts: [], attachments: [], ...extra }), "utf8");
    const chooser = page.waitForEvent("filechooser");
    await openMenu(page, "file");
    await page.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await page.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, pages[0].title, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  const P = (id, text) => ({ id, type: "paragraph", text });
  const cells = (...values) => values.map((text) => ({ text, colSpan: 1, rowSpan: 1 }));
  const contexts = [];
  try {
    // 1) #101 ブラウザのメニューからの印刷(印刷の見た目)
    {
      const { context, page } = await newPage(1280);
      contexts.push(context);
      await openDoc(page, [{ id: "A", title: "印刷", blocks: [{ id: "h", type: "heading1", text: "見出し" }, P("p", "本文の段落です。ブラウザのメニューから刷ったときの見た目。"), { id: "b", type: "bullet", text: "箇条書き" }] }]);
      await page.emulateMedia({ media: "print" });
      await page.waitForTimeout(200);
      const print = await page.evaluate(() => ({
        widths: [...document.querySelectorAll("#blocks .block .block-content")].map((node) => Math.round(node.getBoundingClientRect().width)),
        chartPane: getComputedStyle(document.querySelector("#chart-pane")).display,
        headingPath: getComputedStyle(document.querySelector("#heading-path")).display,
      }));
      await page.emulateMedia({ media: "screen" });
      result.browserPrintKeepsBodyWidth = print.widths.length === 3 && print.widths.every((width) => width > 400)
        && print.chartPane === "none" && print.headingPath === "none";
      result.browserPrintEvidence = JSON.stringify(print);
    }

    // 2) #104 「戻る」とスクロールの位置(上に画像)
    {
      const { context, page } = await newPage(1280, 900);
      contexts.push(context);
      // 高さ 600px の画像(読み込みのあとで高さが決まる)。
      const image = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 600;
        canvas.getContext("2d").fillRect(0, 0, 400, 600);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        return window.SingleHtmlFormat.fileToAttachment(new File([blob], "tall.png", { type: "image/png" }), "img-1");
      });
      const blocks = [{ id: "img", type: "attachment", attachmentId: "img-1" }];
      for (let i = 1; i <= 80; i += 1) blocks.push(P("p" + i, "段落 " + i));
      await openDoc(page, [{ id: "A", title: "画像のページ", blocks }, { id: "B", title: "二枚目", blocks: [P("q", "二枚目")] }], { attachments: [image] });
      await page.waitForTimeout(500);
      const topBlock = () => page.evaluate(() => {
        const top = document.querySelector(".toolbar").getBoundingClientRect().bottom;
        return [...document.querySelectorAll("#blocks .block")].find((row) => row.getBoundingClientRect().bottom > top + 40)?.dataset.id;
      });
      await page.evaluate(() => document.querySelector('#blocks .block[data-id="p40"]').scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      const before = await topBlock();
      await page.evaluate(() => document.querySelector('#page-tree-body [data-page-id="B"]').click());
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector("#page-back").click());
      await page.waitForTimeout(1500);
      const after = await topBlock();
      result.pageBackRestoresScrollWithImage = Boolean(before) && before === after;
      result.pageBackScrollEvidence = JSON.stringify({ before, after });
    }

    // 3) #107 狭い画面のメニュー
    {
      const { context, page } = await newPage(375, 800);
      contexts.push(context);
      const overflow = {};
      for (const name of ["file", "edit", "view", "files"]) {
        await page.click("#menu-" + name + "-button");
        await page.waitForTimeout(120);
        overflow[name] = await page.evaluate((menu) => {
          const box = document.querySelector("#menu-" + menu + "-panel").getBoundingClientRect();
          return { left: Math.round(box.left), right: Math.round(box.right), width: document.documentElement.clientWidth };
        }, name);
        await page.keyboard.press("Escape");
      }
      result.narrowMenusStayInView = Object.values(overflow).every((box) => box.left >= 0 && box.right <= box.width);
      result.narrowMenusEvidence = JSON.stringify(overflow);
    }

    // 4) #108 グラフの長い題名・軸の名前
    {
      const { context, page } = await newPage(1280);
      contexts.push(context);
      const title = "2026年度 第3四半期 製品別・地域別の売上高と前年同期比の推移(単位: 百万円)の長い題名で、グラフの幅にはとても収まらないくらい長く書いた題名です";
      await openDoc(page, [{ id: "C", title: "グラフ", blocks: [
        { id: "t", type: "table", rows: [cells("月", "売上"), cells("1月", "120"), cells("2月", "150"), cells("3月", "170")] },
        { id: "c", type: "chart", text: 'bar(A2:A4, B2:B4)\ntitle("' + title + '")\nxlabel("月(2026年度の会計期間で、4月始まりの期首から数えた月の長い名前)")\nylabel("売上高(百万円、税抜き、返品控除後の純額、長い名前)")' },
      ] }]);
      await page.waitForTimeout(600);
      const texts = await page.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="c"] .chart-canvas svg text')]
        .filter((node) => /chart-title|chart-label/.test(node.getAttribute("class") || ""))
        .map((node) => {
          const box = node.getBoundingClientRect();
          const svg = node.ownerSVGElement.getBoundingClientRect();
          return { text: node.textContent, inside: box.left >= svg.left - 1 && box.right <= svg.right + 1 && box.top >= svg.top - 1 && box.bottom <= svg.bottom + 1 };
        }));
      result.chartLongTitleFitsWithEllipsis = texts.length === 3 && texts.every((item) => item.inside) && texts[0].text.endsWith("…") && texts[2].text.endsWith("…");
      result.chartLongTitleEvidence = JSON.stringify(texts);
    }

    // 5) #114 保存HTMLの長い語
    {
      const { context, page } = await newPage(1280);
      contexts.push(context);
      const long = "Title_" + "x".repeat(120);
      await openDoc(page, [{ id: "L", title: long, blocks: [{ id: "h", type: "heading2", text: "Heading_" + "y".repeat(120) }, P("p", "ab".repeat(64) + "cd".repeat(64))] }]);
      const download = page.waitForEvent("download");
      await page.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "visual-fix-long.html");
      await (await download).saveAs(path);
      const view = await context.newPage();
      await view.setViewportSize({ width: 390, height: 800 });
      await view.goto("file:///" + path.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      const edges = await view.evaluate(() => [...document.querySelectorAll("h1, h2, h3, h4, p")].filter((node) => node.textContent.length > 100)
        .map((node) => ({ tag: node.tagName, right: Math.round(node.getBoundingClientRect().right), scroll: node.scrollWidth, client: node.clientWidth, width: document.documentElement.clientWidth })));
      await view.close();
      result.savedHtmlWrapsLongWords = edges.length >= 3 && edges.every((edge) => edge.scroll <= edge.client + 1 && edge.right <= edge.width + 1);
      result.savedHtmlLongWordEvidence = JSON.stringify(edges);
    }

    result.visualFixNoPageErrors = pageErrors.length === 0;
    if (pageErrors.length) result.visualFixPageErrors = pageErrors.join(" | ");
  } finally {
    for (const context of contexts) await context.close();
  }
  return result;
}
