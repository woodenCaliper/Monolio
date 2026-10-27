// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- データベースのリンクの列から、同じ文書のページへ(v267。Issue #147) ----
// ユーザー要望「データベースのリンクの列から、同じ文書の別のページ(子ページなど)へ飛べるようにしたい。Notion の一覧の表から各ページへ
// 飛ぶのと同じ使い方」。行き先は保存HTMLのページの錨と同じ「#page-…」。エディタでは「ページを選ぶ…」で選べ、Ctrl+クリックで移る。
// ページへのリンクはページのブロックとこのセルの2種類で、削除(文字は残して行き先だけ外す)・数え・ロックの判定・
// 別の文書への貼り付けはどちらも同じ規則。題名を変えると、文字が元の題名のままのセルはついてくる。
export default async function dbPageLinkSuite({ context }) {
  const fresh = await context.newPage();
  const dialogs = [];
  fresh.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    dialog.accept();
  });
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const literal = {
    pages: [
      { id: "P1", title: "一覧", blocks: [
        { id: "la", type: "page", text: "", pageId: "PA" },
        { id: "lb", type: "page", text: "", pageId: "PB" },
        { id: "lt", type: "table", database: { columns: [{ type: "text" }, { type: "link" }] }, rows: [
          [{ text: "名前" }, { text: "ページ" }],
          [{ text: "A" }, { text: "子ページA", link: "#page-PA" }],
          [{ text: "B" }, { text: "説明", link: "#page-PB" }],
          [{ text: "C" }, { text: "" }],
          [{ text: "D" }, { text: "Aの説明", link: "#page-PA" }],
          [{ text: "E" }, { text: "子ページC", link: "#page-PC" }],
        ] },
      ] },
      { id: "PA", title: "子ページA", blocks: [{ id: "pa1", type: "paragraph", text: "Aの本文" }] },
      { id: "PB", title: "子ページB", blocks: [{ id: "pb1", type: "paragraph", text: "Bの本文" }] },
      // PC はどのページのブロックからも指されない(未分類)。データベースのセルだけが指す。
      { id: "PC", title: "子ページC", blocks: [{ id: "pc1", type: "paragraph", text: "Cの本文" }] },
    ],
    fonts: [],
    attachments: [],
  };
  const path = join(OUT, "db-page-link.html");
  const title = () => fresh.evaluate(() => document.querySelector("#doc-title")?.textContent);
  const cell = (r) => fresh.locator('#blocks .block[data-id="lt"] .editor-table [data-row="' + r + '"][data-cell="1"]');
  // 各行のリンクの列: 「文字=行き先」(行き先が無ければ文字だけ)。
  const linkColumn = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="lt"] .editor-table [data-cell="1"]')].slice(1).map((td) => {
    const a = td.querySelector("a.db-link");
    return a ? a.textContent + "=" + a.getAttribute("href") : td.textContent;
  }).join("|"));
  const blur = async () => {
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(200);
  };
  const goToPage = async (name) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: name }).first().click();
    await fresh.waitForTimeout(250);
  };
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "一覧", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);

    // 1) Ctrl+クリックでそのページへ移る。戻るで元のページへ(以前は「別の文書へのリンクは…」と知らせるだけだった)。
    const box = await fresh.locator('#blocks .block[data-id="lt"] a.db-link[href="#page-PA"]').first().boundingBox();
    await fresh.keyboard.down("Control");
    await fresh.mouse.click(box.x + 5, box.y + box.height / 2);
    await fresh.keyboard.up("Control");
    await fresh.waitForTimeout(300);
    const jumped = await title();
    if (jumped !== "一覧") {
      await fresh.locator("#page-back").click();
      await fresh.waitForTimeout(300);
    }
    result.dbPageLinkEvidence = { jumped, back: await title() };
    result.dbPageLinkCtrlClickSwitches = jumped === "子ページA" && result.dbPageLinkEvidence.back === "一覧";

    // 2) 「ページを選ぶ…」: ページが読む順で並び、名前で絞り込め、Enter でいちばん上を選ぶ。行き先とセルの文字(題名)が入り、Undo 1手で戻る。
    await cell(3).click();
    await fresh.waitForTimeout(200);
    const hasPicker = await fresh.locator(".db-cell-helper .db-link-page-pick").count() === 1;
    let listed = "";
    let filtered = "";
    let inView = null;
    if (hasPicker) {
      // 画面の低いときは、一覧を開いて背の伸びた手伝いがセルの上に出て、画面に収まる(下へはみ出して切れない)。
      // (下へ出したままだと、画面の下の表の道具の帯に隠れてボタンも押せなかった。押せなければ不合格にする)
      await fresh.setViewportSize({ width: 1280, height: 520 });
      await fresh.waitForTimeout(150);
      const pressed = await fresh.locator(".db-cell-helper .db-link-page-pick").click({ timeout: 3000 }).then(() => true, () => false);
      await fresh.waitForTimeout(200);
      inView = pressed ? await fresh.evaluate(() => {
        const rect = document.querySelector(".db-cell-helper").getBoundingClientRect();
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), vh: innerHeight };
      }) : null;
      await fresh.setViewportSize({ width: 1280, height: 800 });
      await fresh.waitForTimeout(150);
      if (!pressed) await fresh.locator(".db-cell-helper .db-link-page-pick").click();
      await fresh.waitForTimeout(200);
      listed = await fresh.evaluate(() => [...document.querySelectorAll(".db-cell-helper .db-page-option")].map((node) => node.textContent).join("|"));
      await fresh.locator(".db-cell-helper .db-page-filter").fill("ページB");
      await fresh.waitForTimeout(100);
      filtered = await fresh.evaluate(() => [...document.querySelectorAll(".db-cell-helper .db-page-option")].map((node) => node.textContent).join("|"));
      await fresh.locator(".db-cell-helper .db-page-filter").press("Enter");
      await fresh.waitForTimeout(250);
    }
    const hint = await fresh.evaluate(() => document.querySelector(".db-cell-helper .db-cell-helper-hint")?.textContent || "");
    await blur();
    const picked = await linkColumn();
    await undo();
    const undone = await linkColumn();
    result.dbPageLinkEvidence.picker = { listed, filtered, hint, picked, undone, inView };
    result.dbPageLinkHelperStaysInView = Boolean(inView) && inView.top >= 0 && inView.bottom <= inView.vh;
    result.dbPageLinkPickerChooses = listed === "一覧|子ページA|子ページB|子ページC" && filtered === "子ページB"
      && picked.split("|")[2] === "子ページB=#page-PB" && hint.includes("子ページB")
      && undone.split("|")[2] === "";

    // 3) 題名を変えると、文字が元の題名のままのセルはついてくる。自分で変えた文字(「Aの説明」)は触らない。
    await goToPage("子ページA");
    await fresh.locator("#doc-title").fill("子ページA改");
    await fresh.waitForTimeout(200);
    await goToPage("一覧");
    const followed = await linkColumn();
    result.dbPageLinkEvidence.followed = followed;
    result.dbPageLinkTitleFollows = followed === "子ページA改=#page-PA|説明=#page-PB||Aの説明=#page-PA|子ページC=#page-PC";

    // 4) セルだけが指すページ(PC)を消す: 確認に「他のページの 1 箇所のリンク」と出て、セルは文字を残して行き先だけ外れる。Undo で戻る。
    dialogs.length = 0;
    const pcRow = fresh.locator("#page-tree-body .page-tree-row", { has: fresh.locator(".page-tree-item", { hasText: "子ページC" }) }).first();
    await pcRow.hover();
    await pcRow.locator(".page-tree-more").click();
    await fresh.locator('#page-menu [data-action="delete-page"]').click();
    await fresh.waitForTimeout(300);
    const deleted = await linkColumn();
    const confirmText = dialogs.join(" / ");
    await undo();
    const restored = await linkColumn();
    result.dbPageLinkEvidence.delete = { confirmText, deleted, restored };
    result.dbPageLinkDeleteKeepsText = confirmText.includes("1 箇所のリンク") && deleted.split("|")[4] === "子ページC"
      && restored.split("|")[4] === "子ページC=#page-PC";

    // 5) セルが指すページを持つページがロック中なら、そのページは消せない(ページのブロックと同じ。ロックしたページを書き換えない)。
    // 先頭ページには目次のメニューが無いので、題名の横のロックのボタンで切り替える。
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(200);
    const lockedDelete = await fresh.evaluate(() => window.__docEditorPages.deletePage("PC"));
    const stillLinked = (await linkColumn()).split("|")[4];
    await fresh.locator("#page-lock-toggle").click();
    await fresh.waitForTimeout(200);
    result.dbPageLinkEvidence.locked = { lockedDelete, stillLinked };
    result.dbPageLinkLockedLinkerBlocksDelete = lockedDelete === false && stillLinked === "子ページC=#page-PC";

    // 6) 保存HTMLでも、押すとそのページへ切り替わる(行き先の形は保存HTMLのページの錨と同じ)。
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "db-page-link-saved.html");
    await (await download).saveAs(savedPath);
    const view = await context.newPage();
    try {
      await view.goto("file:///" + savedPath.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      await view.locator('a.db-link[href="#page-PB"]').first().click();
      await view.waitForTimeout(200);
      result.dbPageLinkSavedHtmlSwitches = await view.evaluate(() => {
        const shown = [...document.querySelectorAll("section.doc-page")].filter((section) => getComputedStyle(section).display !== "none");
        return shown.length === 1 && shown[0].id === "page-PB";
      });
    } finally {
      await view.close();
    }

    // 7) 貼り付け: 同じ文書ではページへの行き先を保つ。別の文書(そのページが無い)へは、行き先を外して文字だけ残す
    //    (ページのブロックを別の文書へ貼ると題名の段落になるのと同じ。無いページを指すリンクは作らない)。
    const grip = fresh.locator('#blocks .block[data-id="lt"]');
    await grip.hover();
    await grip.locator(".drag-grip").click();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await goToPage("子ページB");
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const samePasted = await fresh.evaluate(() => [...document.querySelectorAll('#blocks a.db-link[href^="#page-"]')].map((a) => a.getAttribute("href")).join(","));
    await openMenu(fresh, "file");
    await fresh.locator("#menu-new-document").click();
    await fresh.waitForTimeout(300);
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const crossPasted = await fresh.evaluate(() => ({
      links: document.querySelectorAll('#blocks a.db-link[href^="#page-"]').length,
      texts: [...document.querySelectorAll("#blocks .editor-table td")].map((td) => td.textContent).join(","),
    }));
    result.dbPageLinkEvidence.paste = { samePasted, crossPasted };
    result.dbPageLinkPasteDropsMissingPages = samePasted === "#page-PA,#page-PB,#page-PA,#page-PC"
      && crossPasted.links === 0 && crossPasted.texts.includes("子ページA改") && crossPasted.texts.includes("説明");

    // 8) リンクの列のセルへ URL をそのまま打つと、その URL へのリンクになる(行き先が空のとき。v268。ユーザー「そのセルに https から
    //    始めるリンクをつけれない」)。保存HTMLも同じ形。ふつうの文字(「説明」)はリンクにしない。
    //    (Ctrl+クリックで開くのは、どの表のセルのリンクも同じ経路なので tableDbSuite.tableLinkCtrlClickOpens が見る。
    //    ふつうの表のセルへ URL を打つ場合は描く分かれ道が違うので cellLinkSuite.cellLinkTypedUrlInTable が別に見る)
    const urlCell = fresh.locator('#blocks .editor-table [data-row="3"][data-cell="1"]').first();
    await urlCell.click();
    await fresh.keyboard.type("https://example.com/notion-page");
    await blur();
    const typed = await fresh.evaluate(() => {
      const at = (r) => document.querySelector('#blocks .editor-table [data-row="' + r + '"][data-cell="1"] a.db-link');
      const a = at(3);
      return { link: a ? a.getAttribute("href") + "=" + a.textContent : null, plain: Boolean(at(2)) };
    });
    const savedForm = await fresh.evaluate(() => window.SingleHtmlFormat.dbCellHtml("link", "https://example.com/a", { text: "https://example.com/a" }));
    result.dbPageLinkEvidence.typedUrl = { typed, savedForm };
    result.dbLinkTypedUrlBecomesLink = typed.link === "https://example.com/notion-page=https://example.com/notion-page" && typed.plain === false
      && savedForm.includes('href="https://example.com/a"');

    result.dbPageLinkNoPageErrors = pageErrors.length === 0;
    result.dbPageLinkPageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
