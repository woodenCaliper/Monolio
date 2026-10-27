// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DOWNLOADS, FORMAT_VERSION, OUT, PORT, openMenu } from "../lib.mjs";

// ---- ブロックを別のページへ移す(Issue #193)と、ページのゴミ箱(Issue #187。形式 0.8.20) ----
// #193: ブロックのつまみのメニュー「別のページへ移す」→ 移す先のページを選ぶ(名前で絞り込み。並べ方は fmt.rankByQuery)→ ブロックは
//       子ごと(P16)そのページの最後へ(Notion と同じ)。複数選んでいればまとめて。ロック中のページは断る。Undo 1手。参照・番号はついてくる。
// #187: 目次の「削除」はページをゴミ箱へ移す(捨てない)。目次のいちばん下の「ゴミ箱」から元に戻す・完全に削除。元に戻すと、外したリンクは
//       元の場所へ戻り、ページは元の親の下へ戻る(子ページも)。ゴミ箱は文書に保存されるが、保存HTMLの表示には出ない。
export default async function moveTrashSuite({ context }) {
  const fresh = await context.newPage();
  const dialogs = [];
  fresh.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    dialog.accept();
  });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const evidence = {};
  result.moveTrashEvidence = evidence;

  const openLiteral = async (literal, name, firstTitle) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, firstTitle, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const docCopy = () => fresh.evaluate(() => window.__docEditorPages.documentCopy());
  const pageOf = (doc, pageId) => doc.pages.find((page) => page.id === pageId);
  const ids = (page) => (page?.blocks || []).map((block) => block.id).join(",");
  const status = () => fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
  const tree = () => fresh.evaluate(() => {
    const walk = (list, depth) => [...list.children].flatMap((item) => [
      " ".repeat(depth) + item.querySelector(".page-tree-item")?.textContent,
      ...(item.querySelector(":scope > ul") ? walk(item.querySelector(":scope > ul"), depth + 1) : []),
    ]);
    return [...document.querySelectorAll("#page-tree-body > ul")].map((list) => walk(list, 0).join("/")).join(" | ");
  });
  const goToPage = async (name) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: name }).first().click();
    await fresh.waitForTimeout(250);
  };
  const rowOf = (title) => fresh.locator("#page-tree-body .page-tree-row", { has: fresh.locator(".page-tree-item", { hasText: title }) }).first();
  const pageMenu = async (title, action) => {
    const row = rowOf(title);
    await row.hover();
    await row.locator(".page-tree-more").click();
    await fresh.locator('#page-menu [data-action="' + action + '"]').click();
    await fresh.waitForTimeout(300);
  };
  const box = (text) => fresh.locator("#blocks .block-content", { hasText: new RegExp("^" + text + "$") }).boundingBox();
  const openGripMenu = async (text) => {
    const row = fresh.locator("#blocks .block", { has: fresh.locator(".block-content", { hasText: new RegExp("^" + text + "$") }) }).first();
    await row.hover();
    await row.locator(".drag-grip").first().click();
    await fresh.waitForTimeout(200);
  };
  const selectAcross = async (from, to) => {
    const start = await box(from);
    const end = await box(to);
    await fresh.mouse.move(start.x + 10, start.y + start.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(end.x + 30, end.y + end.height / 2, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
  };
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
  };
  const menuTexts = () => fresh.evaluate(() => [...document.querySelectorAll("#block-menu .menu-item .menu-title")].map((node) => node.textContent));

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // ================= #193 別のページへ移す =================
    const para = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
    const moveDoc = {
      pages: [
        { id: "M1", title: "移す元", blocks: [
          { id: "l2", type: "page", text: "", pageId: "M2" },
          { id: "l3", type: "page", text: "", pageId: "M3" },
          { id: "l4", type: "page", text: "", pageId: "M4" },
          para("a", "親の段落"), para("a1", "子の段落", { indent: 1 }), para("a2", "孫の段落", { indent: 2 }),
          para("b", "二つ目"), para("c", "三つ目"), para("d", "四つ目"),
          { id: "t1", type: "table", caption: "最初の表", rows: [[{ text: "x" }], [{ text: "1" }]] },
          para("e", "残る段落"),
        ] },
        { id: "M2", title: "行き先", blocks: [
          para("m2a", "行き先の本文"),
          { id: "t2", type: "table", caption: "二つ目の表", rows: [[{ text: "y" }], [{ text: "2" }]] },
          { id: "m2r", type: "paragraph", text: "参照 表1", html: '参照 <span class="figure-ref" data-ref="t1">表1</span>' },
        ] },
        { id: "M3", title: "空のページ", blocks: [para("m3a", "")] },
        { id: "M4", title: "鍵のページ", locked: true, blocks: [para("m4a", "鍵の本文")] },
      ],
      fonts: [],
      attachments: [],
    };
    await openLiteral(moveDoc, "move-blocks.html", "移す元");

    // 1) つまみのメニューに「別のページへ移す」。押すと移す先の一覧(今のページは出ない。読む順)。名前で絞れる。
    await openGripMenu("親の段落");
    const actions = await menuTexts();
    // キーで選ぶ(↑2回で下から2つ目の「別のページへ移す」へ。キーで選ぶとブロックを選んだまま一覧が替わる)。
    await fresh.keyboard.press("ArrowUp");
    await fresh.keyboard.press("ArrowUp");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    const pickerTitles = await menuTexts();
    // 検索欄が空のままの Backspace でブロックを消さない(移す先を選んでいる間。操作の一覧の近道は効かない)。
    await fresh.locator("#block-menu .block-menu-search").press("Backspace");
    await fresh.waitForTimeout(150);
    result.movePickerBackspaceKeepsBlock = ids(pageOf(await docCopy(), "M1")).includes(",a,a1,a2,")
      && await fresh.evaluate(() => !document.querySelector("#block-menu").hidden);
    await fresh.locator("#block-menu .block-menu-search").fill("空");
    await fresh.waitForTimeout(150);
    const filteredTitles = await menuTexts();
    await fresh.locator("#block-menu .block-menu-search").fill("行き");
    await fresh.waitForTimeout(150);
    await fresh.locator("#block-menu .block-menu-search").press("Enter");
    await fresh.waitForTimeout(300);
    const afterMove = await docCopy();
    const movedStatus = await status();
    evidence.move = { actions, pickerTitles, filteredTitles, movedStatus, source: ids(pageOf(afterMove, "M1")), target: ids(pageOf(afterMove, "M2")) };
    result.moveMenuHasMoveToPage = actions.includes("別のページへ移す");
    result.movePickerListsOtherPagesInReadingOrder = pickerTitles.join("|") === "行き先|空のページ|鍵のページ"
      && filteredTitles.join("|") === "空のページ";
    const target = pageOf(afterMove, "M2");
    result.moveCarriesSubtreeToEndOfPage = ids(pageOf(afterMove, "M1")) === "l2,l3,l4,b,c,d,t1,e"
      && ids(target) === "m2a,t2,m2r,a,a1,a2"
      && target.blocks.slice(3).map((block) => block.indent || 0).join(",") === "0,1,2";
    result.moveStatusNamesDestination = movedStatus.includes("「行き先」");
    // 2) Undo 1回で、移す元・移す先の両方が戻る。
    await undo();
    const undone = await docCopy();
    result.moveUndoesInOneStep = ids(pageOf(undone, "M1")) === ids(moveDoc.pages[0]) && ids(pageOf(undone, "M2")) === "m2a,t2,m2r";

    // 3) 複数選んで、その1つのつまみ → まとめての操作のメニュー。空のページへ移すと、空の段落と入れ替わる(並びはそのまま)。
    await selectAcross("二つ目", "四つ目");
    await openGripMenu("三つ目");
    const groupHeader = await fresh.evaluate(() => document.querySelector("#block-menu .menu-current")?.textContent || "");
    const groupActions = await menuTexts();
    await fresh.locator('#block-menu [data-action="move-to-page"]').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#block-menu [data-action="move-to"][data-page-id="M3"]').click();
    await fresh.waitForTimeout(300);
    const afterGroup = await docCopy();
    evidence.group = { groupHeader, groupActions, source: ids(pageOf(afterGroup, "M1")), target: ids(pageOf(afterGroup, "M3")), status: await status() };
    result.moveGroupMovesAllSelected = groupHeader.includes("3 個") && groupActions.includes("別のページへ移す")
      && ids(pageOf(afterGroup, "M1")) === "l2,l3,l4,a,a1,a2,t1,e" && ids(pageOf(afterGroup, "M3")) === "b,c,d"
      && evidence.group.status.includes("3 個") && evidence.group.status.includes("「空のページ」");
    await undo();

    // 4) 図表の参照はついてくる(ブロックの id はそのまま)。番号は読む順で数え直す: 表1 を後ろのページへ移すと 表2 になる。
    const chipText = () => fresh.evaluate(() => document.querySelector('#blocks .figure-ref[data-ref="t1"]')?.textContent || "");
    await goToPage("行き先");
    const chipBefore = await chipText();
    await goToPage("移す元");
    const movedTable = await fresh.evaluate(() => window.__docEditorPages.moveBlocksToPage(["t1"], "M3"));
    await goToPage("行き先");
    const chipAfter = await chipText();
    const chipMissing = await fresh.evaluate(() => document.querySelector('#blocks .figure-ref[data-ref="t1"]')?.classList.contains("is-missing"));
    evidence.reference = { chipBefore, chipAfter, chipMissing, movedTable };
    result.moveKeepsReferencesAndRenumbers = movedTable === true && chipBefore === "表1" && chipAfter === "表2" && chipMissing === false;
    await goToPage("移す元");
    await undo();

    // 5) ロック中のページへは移さない(いつものロックの知らせ)。ロック中のページからも移さない。
    const toLocked = await fresh.evaluate(() => window.__docEditorPages.moveBlocksToPage(["e"], "M4"));
    const toLockedStatus = await status();
    await goToPage("鍵のページ");
    const fromLocked = await fresh.evaluate(() => window.__docEditorPages.moveBlocksToPage(["m4a"], "M2"));
    const fromLockedStatus = await status();
    await goToPage("移す元");
    const afterLocked = await docCopy();
    evidence.locked = { toLocked, toLockedStatus, fromLocked, fromLockedStatus };
    result.moveRefusesLockedPages = toLocked === false && toLockedStatus.includes("移す先のページ「鍵のページ」はロックされています")
      && fromLocked === false && fromLockedStatus.includes("このページはロックされています")
      && ids(pageOf(afterLocked, "M4")) === "m4a" && ids(pageOf(afterLocked, "M1")).endsWith(",e");

    // 6) ページへのリンクを、そのページ自身の中へは移さない(親子が輪になる)。
    const intoItself = await fresh.evaluate(() => window.__docEditorPages.moveBlocksToPage(["l2"], "M2"));
    evidence.loop = await status();
    result.moveRefusesLinkIntoItsOwnPage = intoItself === false && evidence.loop.includes("その子ページの中へは移せません")
      && ids(pageOf(await docCopy(), "M1")).startsWith("l2,");

    // ================= #187 ページのゴミ箱 =================
    const trashDoc = await fresh.evaluate(async () => {
      const file = new File([new Uint8Array([7, 7, 1])], "trash-only.bin", { type: "application/octet-stream" });
      const attachment = await window.SingleHtmlFormat.fileToAttachment(file, "att-trash");
      return {
        pages: [
          { id: "R", title: "ホーム", blocks: [
            { id: "ra", type: "page", text: "", pageId: "A" },
            { id: "rb", type: "paragraph", text: "ホームの本文" },
            { id: "rc", type: "page", text: "", pageId: "B" },
            { id: "rd", type: "paragraph", text: "@消すページ", html: 'メモ <span class="figure-ref" data-ref="A">消すページ</span>' },
          ] },
          { id: "A", title: "消すページ", blocks: [
            { id: "a1", type: "paragraph", text: "消すページの本文" },
            { id: "a2", type: "page", text: "", pageId: "C" },
            { id: "a3", type: "attachment", text: "", attachmentId: "att-trash" },
          ] },
          { id: "C", title: "子ページ", blocks: [{ id: "c1", type: "paragraph", text: "子の本文" }] },
          { id: "B", title: "別ページ", blocks: [
            { id: "b1", type: "paragraph", text: "別ページの本文" },
            { id: "bl", type: "page", text: "", pageId: "A" },
            { id: "bt", type: "table", database: { columns: [{ type: "text" }, { type: "link" }] }, rows: [
              [{ text: "名前" }, { text: "ページ" }],
              [{ text: "x" }, { text: "消すページ", link: "#page-A" }],
            ] },
          ] },
        ],
        fonts: [],
        attachments: [attachment],
      };
    });
    await openLiteral(trashDoc, "trash-pages.html", "ホーム");
    const treeBefore = await tree();
    const attachmentListed = () => fresh.evaluate(() => [...document.querySelectorAll("#attachment-summary > *")].some((item) => item.textContent.includes("trash-only.bin")));
    const mentionText = () => fresh.evaluate(() => document.querySelector('#blocks .figure-ref[data-ref="A"]')?.textContent || "");

    // 7) 目次の「削除」で、ページはゴミ箱へ入る。目次から消え、子ページは未分類へ、ほかのページのリンクは外れる(これまでどおり)。
    //    ゴミ箱のページだけが使う添付は、一覧には出ないが文書には残る。目次の下にゴミ箱(件数つき)が出る。
    const trashButtonBefore = await fresh.locator("#page-tree-trash").count();
    dialogs.length = 0;
    await pageMenu("消すページ", "delete-page");
    const deleted = await docCopy();
    const treeDeleted = await tree();
    evidence.deleted = {
      treeBefore, treeDeleted, dialogs: [...dialogs], status: await status(),
      trash: (deleted.trash || []).map((entry) => ({ page: entry.page.id, links: entry.links.map((link) => link.pageId + ":" + link.afterId), cells: entry.cells.length })),
      count: await fresh.locator("#page-tree-trash .page-tree-trash-count").textContent().catch(() => ""),
      mention: await mentionText(),
    };
    result.trashDeleteMovesPageToTrash = trashButtonBefore === 0 && !deleted.pages.some((page) => page.id === "A")
      && deleted.trash?.length === 1 && deleted.trash[0].page.id === "A" && ids(deleted.trash[0].page) === "a1,a2,a3"
      && !treeDeleted.includes("消すページ") && treeDeleted.includes("子ページ")
      && evidence.deleted.count === "1" && evidence.deleted.status.includes("ゴミ箱へ移しました");
    result.trashDeleteRemembersLinkPlaces = JSON.stringify(evidence.deleted.trash[0]?.links) === JSON.stringify(["R:null", "B:b1"])
      && evidence.deleted.trash[0]?.cells === 1
      && ids(pageOf(deleted, "R")) === "rb,rc,rd" && ids(pageOf(deleted, "B")) === "b1,bt";
    result.trashKeepsAttachmentButHidesIt = deleted.attachments.some((attachment) => attachment.id === "att-trash") && !(await attachmentListed());
    result.trashedPageMentionShowsMissing = evidence.deleted.mention === "参照先なし";

    // 8) 保存: ゴミ箱は manifest に入るが、保存HTMLの表示(本文・目次)には出ない。pages にも入らない(古い版はゴミ箱のページを見ない)。
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "trash-saved.html");
    await (await download).saveAs(savedPath);
    const savedHtml = await readFile(savedPath, "utf8");
    const parsed = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), savedHtml);
    const manifest = JSON.parse(savedHtml.match(/<script type="application\/vnd\.single-html-doc\.manifest\+json" id="document-manifest">\n([\s\S]*?)\n<\/script>/)?.[1] || "{}");
    const viewer = await context.newPage();
    await viewer.goto(pathToFileURL(savedPath).href);
    await viewer.waitForTimeout(300);
    const view = await viewer.evaluate(() => ({
      text: document.body.innerText,
      section: Boolean(document.querySelector("#page-A")),
      treeLinks: [...document.querySelectorAll("#doc-page-tree a")].map((a) => a.textContent).join("|"),
    }));
    await viewer.close();
    evidence.saved = { formatVersion: manifest.formatVersion, manifestPages: (manifest.pages || []).map((page) => page.id), manifestTrash: (manifest.trash || []).map((entry) => entry.page?.id), view };
    result.trashIsSavedInManifest = manifest.formatVersion === FORMAT_VERSION && manifest.trash?.[0]?.page?.id === "A"
      && !manifest.pages.some((page) => page.id === "A") && savedHtml.includes('4. "trash" in the JSON holds deleted pages')
      && parsed.trash?.[0]?.page?.id === "A" && parsed.trash[0].links.length === 2
      && parsed.attachments.some((attachment) => attachment.id === "att-trash");
    result.trashIsNotShownInSavedHtml = !view.section && !view.text.includes("消すページの本文") && !view.treeLinks.includes("消すページ")
      && view.treeLinks.includes("子ページ");

    // 9) ゴミ箱の一覧から元に戻す: ページは元の親の下へ、外したリンクは元の場所へ、表のリンクのセルも戻る。子ページも親の下へ。
    await fresh.locator("#page-tree-trash").click();
    await fresh.waitForTimeout(200);
    const listed = await fresh.evaluate(() => [...document.querySelectorAll("#page-menu .trash-row .trash-title")].map((node) => node.textContent).join("|"));
    await fresh.locator('#page-menu .trash-row [data-action="restore-page"]').first().click();
    await fresh.waitForTimeout(300);
    const restored = await docCopy();
    const treeRestored = await tree();
    evidence.restored = { listed, treeRestored, status: await status(), mention: await mentionText(), menuOpen: await fresh.evaluate(() => !document.querySelector("#page-menu").hidden) };
    result.trashRestoreReturnsPageUnderParent = listed === "消すページ" && treeRestored === treeBefore
      && ids(pageOf(restored, "R")) === "ra,rb,rc,rd" && ids(pageOf(restored, "B")) === "b1,bl,bt"
      && pageOf(restored, "B").blocks[2].rows[1][1].link === "#page-A"
      && !(restored.trash?.length) && (await fresh.locator("#page-tree-trash").count()) === 0
      && evidence.restored.status.includes("元に戻しました");
    result.trashRestoreBringsBackAttachmentAndMention = (await attachmentListed()) && evidence.restored.mention === "消すページ";
    // 10) Undo 1回で、元に戻す前(ゴミ箱の中)へ戻る。
    await undo();
    const undoneRestore = await docCopy();
    result.trashRestoreUndoesInOneStep = undoneRestore.trash?.length === 1 && !undoneRestore.pages.some((page) => page.id === "A")
      && (await tree()) === treeDeleted;

    // 11) ロック中のページへリンクを戻すことになるなら、元に戻さない(ロックを解除してから)。
    await pageMenu("別ページ", "toggle-page-lock");
    const entryId = (await docCopy()).trash[0].id;
    const lockedRestore = await fresh.evaluate((id) => window.__docEditorPages.restoreFromTrash(id), entryId);
    const lockedStatus = await status();
    const afterLockedRestore = await docCopy();
    evidence.lockedRestore = { lockedRestore, lockedStatus };
    result.trashRestoreRefusesLockedParent = lockedRestore === false && lockedStatus.includes("ロック中のページ「別ページ」")
      && afterLockedRestore.trash?.length === 1 && !afterLockedRestore.pages.some((page) => page.id === "A");
    await pageMenu("別ページ", "toggle-page-lock");

    // 12) 完全に削除: 確かめてから消す。ゴミ箱が空になり、そのページだけの添付も消える。Undo でゴミ箱へ戻る。
    dialogs.length = 0;
    await fresh.locator("#page-tree-trash").click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#page-menu .trash-row [data-action="purge-page"]').first().click();
    await fresh.waitForTimeout(300);
    const purged = await docCopy();
    evidence.purged = { dialogs: [...dialogs], status: await status() };
    result.trashPurgeRemovesPageAndAttachment = dialogs.some((text) => text.includes("「消すページ」を完全に削除しますか"))
      && !purged.trash?.length && !purged.attachments.some((attachment) => attachment.id === "att-trash")
      && (await fresh.locator("#page-tree-trash").count()) === 0;
    await undo();
    const unpurged = await docCopy();
    result.trashPurgeUndoesInOneStep = unpurged.trash?.length === 1 && unpurged.attachments.some((attachment) => attachment.id === "att-trash");

    // 13) 開くときの無害化: 形の合わない項目は捨て、本文のページと重なる id は振り直し、外したリンクの行き先を合わせる。
    const sanitized = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const html = fmt.buildPortableHtml({ pages: [{ id: "L", title: "生きている", blocks: [{ id: "x1", type: "paragraph", text: "x" }] }], fonts: [], attachments: [] });
      const hostile = {
        trash: [
          { id: "e1", deletedAt: "2026-10-26T00:00:00.000Z", page: { id: "L", title: "同じidのページ", blocks: [{ id: "x1", type: "paragraph", text: "重なるブロック", derived: { label: "古い" } }, "壊れたブロック"] },
            links: [{ pageId: "L", afterId: "x1", block: { id: "lk", type: "paragraph", pageId: "L" } }, { pageId: 'bad"id', block: { id: "lk2" } }],
            cells: [{ pageId: "L", blockId: "x1", row: -1, col: 0 }, { pageId: "L", blockId: "x1", row: 0, col: 1 }] },
          { id: "e1", page: { id: "Q", title: "2つ目", blocks: [] } },
          { id: "e3", page: "ページでない" },
          null,
        ],
      };
      const patched = html.replace(/(<script type="application\/vnd\.single-html-doc\.manifest\+json" id="document-manifest">\n)([\s\S]*?)(\n<\/script>)/, (all, head, json, tail) => {
        const manifest = JSON.parse(json);
        return head + JSON.stringify({ ...manifest, ...hostile }).replace(/</g, "\\u003c") + tail;
      });
      const parsed = fmt.parsePortableHtml(patched);
      return {
        count: parsed.trash?.length,
        ids: parsed.trash?.map((entry) => entry.id),
        pageIds: parsed.trash?.map((entry) => entry.page.id),
        blockIds: parsed.trash?.[0]?.page.blocks.map((block) => block.id),
        derived: parsed.trash?.[0]?.page.blocks.some((block) => block.derived),
        links: parsed.trash?.[0]?.links.map((link) => link.block.type + ":" + link.block.pageId),
        cells: parsed.trash?.[0]?.cells.length,
        livePage: parsed.pages.map((page) => page.id).join(","),
      };
    });
    evidence.sanitized = sanitized;
    result.trashImportIsSanitized = sanitized.count === 2 && sanitized.ids[0] === "e1" && sanitized.ids[1] !== "e1"
      && sanitized.pageIds[0] !== "L" && sanitized.pageIds[1] === "Q" && sanitized.livePage === "L"
      && sanitized.blockIds.length === 1 && sanitized.blockIds[0] !== "x1" && sanitized.derived === false
      && JSON.stringify(sanitized.links) === JSON.stringify(["page:" + sanitized.pageIds[0]]) && sanitized.cells === 1;

    result.moveTrashNoPageErrors = pageErrors.length === 0;
    evidence.pageErrors = pageErrors;
    return result;
  } finally {
    await fresh.close();
  }
}
