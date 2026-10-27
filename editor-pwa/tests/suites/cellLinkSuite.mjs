// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, hasFormatVersion } from "../lib.mjs";

// ---- 表のセルのリンク(v269。形式 0.8.15) ----
// ユーザー指示「データベースと表は本質的に同じ。むしろ表のほうが機能が広いはず。表でリンクできないのにデータベースではリンクできる、というのは普通に考えてありえない」「極端に言えば、表なら何でもできる」(案 B: 普通の表のセルでも、上のリンクの
// ボタンでリンクを付けられる。セルまるごとがリンク)。リンクの決まり(描き方・行き先の窓・URL を打つとリンク・HTML を落とすと
// リンク・Ctrl+クリック)は、ふつうの表とデータベースで同じ。選択肢・チェックの列だけは札・四角で見せるので付けない。
export default async function cellLinkSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const c = (text) => ({ text, colSpan: 1, rowSpan: 1 });
  const literal = {
    pages: [
      { id: "T1", title: "ふつうの表", blocks: [
        { id: "pl", type: "page", text: "", pageId: "T2" },
        { id: "t", type: "table", rows: [
          [c("名前"), c("資料"), c("メモ")],
          [c("A"), c("仕様書"), c("")],
          [c("B"), c("別ページ"), c("")],
          [c("C"), c(""), c("")],
        ] },
        { id: "d", type: "table", database: { columns: [{ type: "text" }, { type: "select" }, { type: "check" }] }, rows: [
          [c("名前"), c("状態"), c("済")],
          [c("X"), c("対応中"), c("")],
        ] },
      ] },
      { id: "T2", title: "行き先のページ", blocks: [{ id: "x1", type: "paragraph", text: "x" }] },
    ],
    fonts: [],
    attachments: [],
  };
  const cell = (r, k, id = "t") => fresh.locator('#blocks .block[data-id="' + id + '"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
  const linkOf = (r, k, id = "t") => fresh.evaluate(([row, col, blockId]) => {
    const a = document.querySelector('#blocks .block[data-id="' + blockId + '"] .editor-table [data-row="' + row + '"][data-cell="' + col + '"] a.db-link');
    return a ? a.textContent + "=" + a.getAttribute("href") : null;
  }, [r, k, id]);
  const blur = async () => {
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(200);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "cell-link.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "ふつうの表", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);

    // 1) ふつうの表のセルでも、上のリンクのボタンは押せる(太字などは押せないまま)。押すと行き先の窓が出て、URL を入れて Enter で
    //    セルまるごとのリンクになる(セルの文字が題名)。Ctrl+Z 1回で戻る。
    await cell(1, 1).click();
    await fresh.waitForTimeout(200);
    const buttons = await fresh.evaluate(() => ({ link: document.querySelector("#format-link")?.disabled, bold: document.querySelector("#format-bold")?.disabled }));
    await fresh.locator("#format-link").click({ timeout: 3000 }).catch(() => {});
    await fresh.waitForTimeout(200);
    const helperShown = await fresh.evaluate(() => Boolean(document.querySelector(".db-cell-helper-link .db-link-input")));
    const focusedInput = await fresh.evaluate(() => document.activeElement?.classList.contains("db-link-input") ?? false);
    if (helperShown) {
      await fresh.locator(".db-cell-helper .db-link-input").fill("https://example.com/spec");
      await fresh.locator(".db-cell-helper .db-link-input").press("Enter");
      await fresh.waitForTimeout(200);
    }
    await blur();
    const viaButton = await linkOf(1, 1);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const undone = await linkOf(1, 1);
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(250);
    result.cellLinkEvidence = { buttons, helperShown, focusedInput, viaButton, undone };
    result.cellLinkButtonWorksInTable = buttons.link === false && buttons.bold === true && helperShown && focusedInput
      && viaButton === "仕様書=https://example.com/spec" && undone === null && (await linkOf(1, 1)) === viaButton;

    // 2) ふつうの表のセルでも「ページを選ぶ…」で同じ文書のページへのリンクにできる。
    await cell(2, 1).click();
    await fresh.waitForTimeout(200);
    await fresh.locator("#format-link").click({ timeout: 3000 }).catch(() => {});
    await fresh.waitForTimeout(200);
    const pagePick = await fresh.locator(".db-cell-helper .db-link-page-pick").count() === 1;
    if (pagePick) {
      await fresh.locator(".db-cell-helper .db-link-page-pick").click();
      await fresh.waitForTimeout(200);
      await fresh.locator(".db-cell-helper .db-page-option", { hasText: "行き先のページ" }).click();
      await fresh.waitForTimeout(250);
    }
    await blur();
    const pageLinked = await linkOf(2, 1);
    result.cellLinkEvidence.pageLinked = pageLinked;
    result.cellLinkPagePickInTable = pageLinked === "行き先のページ=#page-T2";

    // 3) ふつうの表のセルへ URL をそのまま打つと、その URL へのリンクになる(リンクの列と同じ)。
    await cell(3, 2).click();
    await fresh.keyboard.type("https://example.com/typed");
    await blur();
    const typed = await linkOf(3, 2);
    result.cellLinkEvidence.typed = typed;
    result.cellLinkTypedUrlInTable = typed === "https://example.com/typed=https://example.com/typed";

    // 4) HTML をふつうの表のセルへ落とすと、その文書へのリンクになり、題名を読んで入れる(リンクの列と同じ)。
    const otherDoc = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "Z", title: "別の文書の題名", blocks: [{ id: "z", type: "paragraph", text: "z" }] }], fonts: [], attachments: [] }));
    await fresh.evaluate(([text]) => {
      const target = document.querySelector('#blocks .block[data-id="t"] [data-row="3"][data-cell="1"]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], "other.html", { type: "text/html" }));
      const rect = target.getBoundingClientRect();
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 5, clientY: rect.top + 5 };
      target.dispatchEvent(new DragEvent("dragover", options));
      target.dispatchEvent(new DragEvent("drop", options));
    }, [otherDoc]);
    await fresh.waitForTimeout(400);
    await blur();
    const dropped = await linkOf(3, 1);
    result.cellLinkEvidence.dropped = dropped;
    result.cellLinkHtmlDropInTable = dropped === "別の文書の題名=other.html";

    // Ctrl+クリックで開くのは、ふつうの表もデータベースも同じ経路(document の pointerdown の capture で td・th の中の
    // a[href] を受けて openBlockLink)なので、tableDbSuite.tableLinkCtrlClickOpens が見る。

    // 5) 選択肢・チェックの列のセルにはリンクを付けない(札・四角で見せる列)。ボタンを押すと知らせ、窓は出ない。
    await cell(1, 1, "d").click();
    await fresh.waitForTimeout(200);
    await fresh.locator("#format-link").click({ timeout: 3000 }).catch(() => {});
    await fresh.waitForTimeout(200);
    const refused = await fresh.evaluate(() => ({ helper: Boolean(document.querySelector(".db-cell-helper-link")), status: document.querySelector("#status")?.textContent || "" }));
    result.cellLinkEvidence.refused = refused;
    result.cellLinkRefusedOnSelectColumn = !refused.helper && refused.status.includes("リンクを付けられません");
    await blur();

    // 6) 保存すると形式 0.8.15 で、ふつうの表(doc-db でない)のセルもリンクで描かれ、開き直してもリンクが残る。
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "cell-link-saved.html");
    await (await download).saveAs(savedPath);
    const html = await readFile(savedPath, "utf8");
    const parsed = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html);
    const savedRows = parsed.pages[0].blocks.find((block) => block.id === "t").rows;
    const view = await context.newPage();
    let savedLinks = "";
    try {
      await view.goto("file:///" + savedPath.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      savedLinks = await view.evaluate(() => {
        const table = [...document.querySelectorAll("table.doc-table")].find((node) => !node.classList.contains("doc-db"));
        return [...table.querySelectorAll("a.db-link")].map((a) => a.textContent + "=" + a.getAttribute("href")).join("|");
      });
    } finally {
      await view.close();
    }
    result.cellLinkEvidence.saved = { savedLinks, link11: savedRows[1][1].link, link21: savedRows[2][1].link };
    result.cellLinkSavedInTable = hasFormatVersion(html)
      && savedRows[1][1].link === "https://example.com/spec" && savedRows[2][1].link === "#page-T2"
      && savedLinks === "仕様書=https://example.com/spec|行き先のページ=#page-T2|別の文書の題名=other.html|https://example.com/typed=https://example.com/typed";

    result.cellLinkNoPageErrors = pageErrors.length === 0;
    result.cellLinkPageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
