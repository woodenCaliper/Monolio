// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 複数ページの実体とナビゲーション(Step 2) ----
// /page で子ページを作る・左の目次で行き来する・Undo が編集したページへ戻る、を固定する。
// 目次の不変条件「どんなリンク構造でも、すべてのページが目次に1回以上現れる」もここで見る。
export default async function pageNavSuite({ context }) {
  const fresh = await context.newPage();
  let dialogCount = 0;
  let lastDialogMessage = "";
  let dismissNextDialog = false;
  fresh.on("dialog", (dialog) => {
    dialogCount += 1;
    lastDialogMessage = dialog.message();
    if (dismissNextDialog) {
      dismissNextDialog = false;
      dialog.dismiss();
    } else {
      dialog.accept();
    }
  });
  const result = {};
  // 目次と画面の様子。今いるページは is-current(複数の場所に出ていれば全部)。
  const view = () => fresh.evaluate(() => ({
    title: document.querySelector("#doc-title")?.textContent || "",
    texts: [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent),
    items: [...document.querySelectorAll("#page-tree-body .page-tree-item")].map((item) => ({
      id: item.dataset.pageId,
      title: item.textContent,
      current: item.classList.contains("is-current"),
      repeated: item.classList.contains("is-repeated"),
      depth: (() => { let depth = 0; let node = item.closest("ul"); while (node && node.id !== "page-tree-body") { if (node.tagName === "UL") depth += 1; node = node.parentElement; } return depth; })(),
      unclassified: Boolean(item.closest(".is-unclassified")),
    })),
  }));
  // 文書を保存ファイル経由で開く(複雑なリンク構造はこの経路でしか作れない)。
  const openDoc = async (literal, name) => {
    const html = await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal);
    const path = join(OUT, name);
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title,
      literal.title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(250);
    return path;
  };
  const clickTree = async (title) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: title }).first().click();
    await fresh.waitForTimeout(200);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) /page で子ページを作り、その位置にリンクが残り、新しいページへ移る。
    await fresh.locator("#blocks .block-content").last().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("SUBPAGE one /page");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(350);
    const created = await view();
    result.slashPageCreatesPageAndMovesThere = created.title === "SUBPAGE one"
      && created.items.length === 2
      && created.items.find((item) => item.title === "SUBPAGE one")?.current === true;
    // 目次は親の下に子を字下げして出す。
    const parentItem = created.items.find((item) => item.title !== "SUBPAGE one");
    const childItem = created.items.find((item) => item.title === "SUBPAGE one");
    result.pageTreeNestsChildUnderParent = Boolean(parentItem && childItem) && childItem.depth === parentItem.depth + 1;
    await fresh.keyboard.type("SUBPAGE body");
    await fresh.waitForTimeout(200);
    await clickTree(parentItem.title);
    const backToParent = await fresh.evaluate(() => ({
      linkTitle: document.querySelector("#blocks .page-link .page-link-title")?.textContent || "",
      linkCount: document.querySelectorAll("#blocks .page-link").length,
    }));
    result.parentKeepsLinkToNewPage = backToParent.linkCount === 1 && backToParent.linkTitle === "SUBPAGE one";
    await fresh.locator("#blocks .page-link").first().click();
    await fresh.waitForTimeout(250);
    const viaLink = await view();
    result.pageLinkClickSwitchesPage = viaLink.title === "SUBPAGE one" && viaLink.texts.includes("SUBPAGE body");

    // 2) ページ作成を Undo すると、ページは消え、先頭ページへ落ちる(currentPage() の保険経路)。
    await clickTree(parentItem.title);
    await fresh.locator("#blocks .block-content").nth(1).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("UNDOABLE /page");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(350);
    const beforeUndoCreate = await view();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const afterUndoCreate = await view();
    result.undoPageCreationFallsBackToFirstPage = beforeUndoCreate.title === "UNDOABLE"
      && !afterUndoCreate.items.some((item) => item.title === "UNDOABLE")
      && afterUndoCreate.items[0]?.current === true
      && afterUndoCreate.title === afterUndoCreate.items[0]?.title;

    // 3) 保存して開き直すと、全ページとリンクが残る。
    const saveDownload = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "pages-roundtrip.html");
    await (await saveDownload).saveAs(savedPath);
    const reopenChooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await reopenChooser).setFiles(savedPath);
    await fresh.waitForTimeout(500);
    const reopened = await view();
    await fresh.locator("#blocks .page-link").first().click().catch(() => {});
    await fresh.waitForTimeout(250);
    const reopenedChild = await view();
    result.saveReopenKeepsPagesAndLinks = reopened.items.length === 2
      && reopened.items[0].current
      && reopenedChild.title === "SUBPAGE one"
      && reopenedChild.texts.includes("SUBPAGE body");

    // 4) A を編集 → B へ移動 → Undo で、A が表示され、変更が消える。Redo は A の変更を A で戻す。
    const pair = {
      title: "Undo Pages",
      pages: [
        { id: "pa", title: "Undo Pages", blocks: [
          { id: "pa1", type: "paragraph", text: "PAGEA text" },
          { id: "pa2", type: "page", text: "", pageId: "pb" },
        ] },
        { id: "pb", title: "Page B", blocks: [{ id: "pb1", type: "paragraph", text: "PAGEB text" }] },
      ],
      fonts: [],
      attachments: [],
    };
    const pairPath = await openDoc(pair, "undo-pages.html");
    await fresh.locator("#blocks .block-content", { hasText: "PAGEA text" }).click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" EDITED");
    await fresh.waitForTimeout(200);
    await clickTree("Page B");
    const onB = await view();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const undone = await view();
    result.undoReturnsToEditedPage = onB.title === "Page B"
      && undone.title === "Undo Pages"
      && undone.texts.includes("PAGEA text")
      && !undone.texts.some((text) => text.includes("EDITED"));
    await clickTree("Page B");
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(350);
    const redone = await view();
    result.redoReturnsToEditedPage = redone.title === "Undo Pages"
      && redone.texts.some((text) => text.includes("PAGEA text EDITED"));

    // 4b) 題名は各ページが独立して持つ。B の題名を変えても A の題名は変わらず、
    //     保存ファイルの <title>(= 先頭ページの題名)も変わらない。
    await openDoc(pair, "undo-pages.html");
    await clickTree("Page B");
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+a");
    await fresh.keyboard.type("Page B renamed");
    await fresh.waitForTimeout(200);
    const renamedTree = await view();
    await clickTree("Undo Pages");
    const pageATitle = (await view()).title;
    const titleDownload = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const titlePath = join(DOWNLOADS, "independent-titles.html");
    await (await titleDownload).saveAs(titlePath);
    const titleHtml = await readFile(titlePath, "utf8");
    const savedTitle = titleHtml.slice(titleHtml.indexOf("<title>") + 7, titleHtml.indexOf("</title>"));
    result.pageTitlesAreIndependent = renamedTree.items.some((item) => item.title === "Page B renamed")
      && renamedTree.items.some((item) => item.title === "Undo Pages")
      && pageATitle === "Undo Pages"
      && savedTitle === "Undo Pages"
      && titleHtml.includes("Page B renamed");

    // 5) ページを移動しただけでは dirty にならない(開き直すときに破棄の確認が出ない)。
    await openDoc(pair, "undo-pages.html");
    await clickTree("Page B");
    await clickTree("Undo Pages");
    await clickTree("Page B");
    const dialogsBefore = dialogCount;
    await openMenu(fresh, "file");
    await fresh.locator("#menu-new-document").click();
    await fresh.waitForTimeout(300);
    result.pageSwitchDoesNotDirtyDocument = dialogCount === dialogsBefore;

    // 6) ページ B を見た状態で同じファイルを開き直すと、先頭ページで開く。
    //    (ページ id はファイルに保存されるので、明示的に戻さないと前回のページで開いてしまう)
    await openDoc(pair, "undo-pages.html");
    await clickTree("Page B");
    const reopenSame = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await reopenSame).setFiles(pairPath);
    await fresh.waitForTimeout(400);
    const reopenedSame = await view();
    result.reopeningSameFileStartsAtFirstPage = reopenedSame.title === "Undo Pages"
      && reopenedSame.items.find((item) => item.title === "Undo Pages")?.current === true;

    // 7) 目次の不変条件: どんなリンク構造でも、すべてのページが目次に1回以上現れる。
    //    R→A, R→B, A→C, B→C(複数の親), C→A(循環), S→S(自己リンク),
    //    P→Q, Q→P(外からリンクされない循環ペア), O(リンクなしの孤立)。
    const tangled = {
      title: "Tangled",
      pages: [
        { id: "R", title: "Tangled", blocks: [
          { id: "r1", type: "page", text: "", pageId: "A" },
          { id: "r2", type: "page", text: "", pageId: "B" },
        ] },
        { id: "A", title: "PA", blocks: [{ id: "a1", type: "page", text: "", pageId: "C" }] },
        { id: "B", title: "PB", blocks: [{ id: "b1", type: "page", text: "", pageId: "C" }] },
        { id: "C", title: "PC", blocks: [{ id: "c1", type: "page", text: "", pageId: "A" }] },
        { id: "S", title: "PS", blocks: [{ id: "s1", type: "page", text: "", pageId: "S" }] },
        { id: "P", title: "PP", blocks: [{ id: "p1", type: "page", text: "", pageId: "Q" }] },
        { id: "Q", title: "PQ", blocks: [{ id: "q1", type: "page", text: "", pageId: "P" }] },
        { id: "O", title: "PO", blocks: [{ id: "o1", type: "paragraph", text: "alone" }] },
      ],
      fonts: [],
      attachments: [],
    };
    await openDoc(tangled, "tangled-pages.html");
    const tree = await view();
    result.pageTreeGeometry = tree.items;
    const allIds = tangled.pages.map((page) => page.id).sort().join(",");
    const shownIds = [...new Set(tree.items.map((item) => item.id))].sort().join(",");
    result.everyPageAppearsInTree = allIds === shownIds;
    // 未分類 = ルートから辿れないページ(自己リンク・外から切れた循環ペア)。孤立ページは入次数0なのでルート。
    const unclassifiedIds = [...new Set(tree.items.filter((item) => item.unclassified).map((item) => item.id))].sort().join(",");
    // v140: ルートは先頭ページだけ。先頭から辿れないページ(孤立の O・自己リンクの S・循環ペアの P↔Q)はすべて未分類。
    // 孤立ページ O は未分類の最上位(深さ1)にあり、本体のツリーには出ない。v139 までの orphanPageIsRoot
    // (孤立ページはルートに出る)を意味を反転させた orphanPageIsUnclassified を、ここへまとめた
    // (仕様が「孤立ページはルート」→「孤立ページは未分類」に変わった。v140。承認済みの図に合わせた)。
    const orphanItems = tree.items.filter((item) => item.id === "O");
    const orphanIsUnclassifiedTop = orphanItems.some((item) => item.depth === 1 && item.unclassified)
      && !orphanItems.some((item) => !item.unclassified);
    result.unclassifiedCollectsUnreachablePages = unclassifiedIds === "O,P,Q,S" && orphanIsUnclassifiedTop;
    result.unclassifiedEvidence = { unclassifiedIds, orphanItems, orphanIsUnclassifiedTop };
    // 目次の最上位は「先頭ページ(ホーム)が1項目」で、その下に階層(先頭ページの子を最上位に並べない)。
    const topItems = tree.items.filter((item) => !item.unclassified && item.depth === 1);
    result.treeTopIsFirstPageOnly = topItems.map((item) => item.id).join(",") === "R"
      && ["A", "B"].every((id) => tree.items.some((item) => item.id === id && item.depth === 2 && !item.unclassified));
    // 未分類の中の循環ペア P↔Q は、頭になるのが片方だけで、どちらも中を開くのは1回だけ
    // (戻りのリンクは「ほかの場所にも出ている」葉として置く。本体のツリーの R→A→R と同じ規則)。
    const cycleItems = tree.items.filter((item) => item.unclassified && (item.id === "P" || item.id === "Q"));
    result.unclassifiedCycleShownOnce = cycleItems.filter((item) => item.depth === 1).length === 1
      && ["P", "Q"].every((id) => cycleItems.filter((item) => item.id === id && !item.repeated).length === 1);
    // 親が2つあるページは両方の下に出て、2回目は中を開かない(葉として置く)。
    const cItems = tree.items.filter((item) => item.id === "C" && !item.unclassified);
    result.multiParentPageShownUnderBothParents = cItems.length === 2
      && cItems.filter((item) => item.repeated).length === 1;

    // 7b) 狭い画面: 目次が閉じていても開くボタンが見えて押せる。開いたら Escape と外側のタップで閉じる
    //     (開いたオーバーレイがボタンの上に重なるので、ボタンでは閉じられない)。
    await fresh.setViewportSize({ width: 375, height: 700 });
    await fresh.waitForTimeout(150);
    const overlayState = () => fresh.evaluate(() => {
      const toggle = document.querySelector("#page-tree-toggle");
      const tree = document.querySelector("#page-tree");
      const box = toggle.getBoundingClientRect();
      const treeBox = tree.getBoundingClientRect();
      return {
        toggleClickable: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === toggle,
        open: tree.classList.contains("is-overlay-open") && treeBox.right > 0,
        expanded: toggle.getAttribute("aria-expanded"),
      };
    });
    const narrowClosed = await overlayState();
    await fresh.locator("#page-tree-toggle").click();
    await fresh.waitForTimeout(250);
    const narrowOpened = await overlayState();
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(250);
    const afterEscape = await overlayState();
    await fresh.locator("#page-tree-toggle").click();
    await fresh.waitForTimeout(250);
    // オーバーレイの外(画面の右端近く)をタップする。
    await fresh.mouse.click(365, 400);
    await fresh.waitForTimeout(250);
    const afterOutside = await overlayState();
    await fresh.setViewportSize({ width: 1280, height: 720 });
    await fresh.waitForTimeout(150);
    result.narrowPageTreeToggleVisibleWhenClosed = narrowClosed.toggleClickable && !narrowClosed.open;
    result.narrowPageTreeClosesWithEscapeAndOutsideTap = narrowOpened.open
      && !afterEscape.open && afterEscape.expanded === "false"
      && !afterOutside.open;

    // 7b) 未分類の中は、未分類の中で入次数0のページを頭にし、その下に子を辿る。
    //     子が文書順で親より前にあっても、子は親の下に1回だけ出る(頭にはならない)。
    await openDoc({
      title: "Loose Home",
      pages: [
        { id: "LH", title: "Loose Home", blocks: [{ id: "lh1", type: "paragraph", text: "home" }] },
        { id: "LC", title: "Loose Child", blocks: [{ id: "lc1", type: "paragraph", text: "child" }] },
        { id: "LP", title: "Loose Parent", blocks: [{ id: "lp1", type: "page", text: "", pageId: "LC" }] },
      ],
      fonts: [],
      attachments: [],
    }, "loose-pages.html");
    const loose = await view();
    const looseOf = (id) => loose.items.filter((item) => item.id === id);
    result.unclassifiedStartsFromUnlinkedPages = looseOf("LP").length === 1
      && looseOf("LP")[0].unclassified && looseOf("LP")[0].depth === 1
      && looseOf("LC").length === 1 && looseOf("LC")[0].unclassified && looseOf("LC")[0].depth === 2
      && loose.items.filter((item) => !item.unclassified).map((item) => item.id).join(",") === "LH";

    // 8) 先頭ページは常にルート。子からリンクし返されても(R→A, A→R)「未分類」に入らない。
    await openDoc({
      title: "Loop Home",
      pages: [
        { id: "LR", title: "Loop Home", blocks: [{ id: "lr1", type: "page", text: "", pageId: "LA" }] },
        { id: "LA", title: "Loop Child", blocks: [{ id: "la1", type: "page", text: "", pageId: "LR" }] },
      ],
      fonts: [],
      attachments: [],
    }, "loop-home.html");
    const loop = await view();
    const home = loop.items.find((item) => item.id === "LR" && !item.repeated);
    const child = loop.items.find((item) => item.id === "LA");
    result.firstPageStaysRootEvenWhenLinkedBack = Boolean(home && child)
      && home.depth === 1 && !home.unclassified
      && child.depth === 2 && !child.unclassified
      && !loop.items.some((item) => item.unclassified);

    // 8b) Step 1 の版(形式 0.8.0)で保存したファイルを開く。本当の題名は manifest.title にだけあり、
    //     先頭ページの題名は "Untitled"。開くと題名欄に本当の題名が出て、保存し直しても失われない。
    const step1Html = await fresh.evaluate(() => {
      const close = "<" + "/script>";
      const manifest = {
        format: "SingleHtmlTechnicalDocument",
        formatVersion: "0.8.0",
        title: "本当の題名",
        pages: [{ id: "st1", title: "Untitled", blocks: [{ id: "st1p", type: "paragraph", text: "STEP1 body" }] }],
        fonts: [],
        attachments: [],
      };
      return "<!doctype html><html><head><title>本当の題名</title>"
        + '<script type="application/vnd.single-html-doc+json" id="document-manifest">'
        + JSON.stringify(manifest) + close
        + '<script type="application/vnd.single-html-doc.attachments+json" id="document-attachments">'
        + JSON.stringify({ attachments: [] }) + close
        + "</head><body><main></main></body></html>";
    });
    const step1Path = join(OUT, "step1-saved.html");
    await writeFile(step1Path, step1Html, "utf8");
    const step1Chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await step1Chooser).setFiles(step1Path);
    await fresh.waitForFunction(() => document.querySelector("#blocks .block-content")?.textContent === "STEP1 body",
      null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(250);
    const step1Opened = await view();
    const step1Download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const step1Resaved = join(DOWNLOADS, "step1-resaved.html");
    await (await step1Download).saveAs(step1Resaved);
    const step1Back = await fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html).pages[0].title,
      await readFile(step1Resaved, "utf8"));
    result.openingStep1FileShowsRealTitle = step1Opened.title === "本当の題名"
      && step1Opened.items.some((item) => item.title === "本当の題名")
      && step1Back === "本当の題名";

    // 8c) 同じページの中に同じ子ページへのリンクが2つあっても、目次ではその親の下に1回だけ出す。
    await openDoc({
      title: "Twin Links",
      pages: [
        { id: "TW", title: "Twin Links", blocks: [
          { id: "tw1", type: "page", text: "", pageId: "TC" },
          { id: "tw2", type: "paragraph", text: "between" },
          { id: "tw3", type: "page", text: "", pageId: "TC" },
        ] },
        { id: "TC", title: "Twin Child", blocks: [{ id: "tc1", type: "paragraph", text: "child" }] },
      ],
      fonts: [],
      attachments: [],
    }, "twin-links.html");
    const twinTree = await view();
    const twinChild = twinTree.items.filter((item) => item.id === "TC");
    result.childListedOncePerParent = twinChild.length === 1
      && twinChild[0].depth === 2 && !twinChild[0].repeated && !twinChild[0].unclassified;

    // 9) ページの戻る/進む(ブラウザと同じ)。A→B→C と移って 戻る×2 で A、進むで B。
    //    A は長いページにして、戻ったときに最後に見ていたスクロール位置へ戻ることも見る。
    const navDoc = {
      title: "Nav A",
      pages: [
        { id: "NA", title: "Nav A", blocks: [
          { id: "na-b", type: "page", text: "", pageId: "NB" },
          { id: "na-d", type: "page", text: "", pageId: "ND" },
          ...Array.from({ length: 60 }, (_, index) => ({ id: "na-p" + index, type: "paragraph", text: "NAV A line " + index })),
        ] },
        { id: "NB", title: "Nav B", blocks: [{ id: "nb-c", type: "page", text: "", pageId: "NC" }] },
        { id: "NC", title: "Nav C", blocks: [{ id: "nc1", type: "paragraph", text: "NAV C body" }] },
        { id: "ND", title: "Nav D", blocks: [{ id: "nd1", type: "paragraph", text: "NAV D body" }] },
      ],
      fonts: [],
      attachments: [],
    };
    const navButtons = () => fresh.evaluate(() => ({
      back: !document.querySelector("#page-back").disabled,
      forward: !document.querySelector("#page-forward").disabled,
    }));
    const pressBack = async () => { await fresh.locator("#page-back").click(); await fresh.waitForTimeout(200); };
    const pressForward = async () => { await fresh.locator("#page-forward").click(); await fresh.waitForTimeout(200); };
    await openDoc(navDoc, "nav-pages.html");
    const navOpened = await navButtons();
    // A を下までスクロールしてから B へ移る(戻ったときにこの位置へ戻ること)。
    await fresh.evaluate(() => window.scrollTo(0, 1200));
    await fresh.waitForTimeout(100);
    const scrollBeforeLeaving = await fresh.evaluate(() => Math.round(window.scrollY));
    await clickTree("Nav B");
    await clickTree("Nav C");
    const atC = await navButtons();
    await pressBack();
    const back1 = (await view()).title;
    await pressBack();
    const back2 = await view();
    const scrollAfterBack = await fresh.evaluate(() => Math.round(window.scrollY));
    const atAAfterBack = await navButtons();
    await pressForward();
    const forward1 = (await view()).title;
    result.pageBackForwardFollowsHistory = !navOpened.back && !navOpened.forward
      && atC.back && !atC.forward
      && back1 === "Nav B" && back2.title === "Nav A"
      && !atAAfterBack.back && atAAfterBack.forward
      && forward1 === "Nav B";
    result.pageBackRestoresScrollPosition = scrollBeforeLeaving > 800 && Math.abs(scrollAfterBack - scrollBeforeLeaving) <= 5;

    // 10) 戻った状態で別のページへ移ると、進む側の履歴は捨てられる(ブラウザと同じ)。
    const beforeBranch = await navButtons();
    await clickTree("Nav D");
    const afterBranch = await navButtons();
    result.navigatingAfterBackClearsForward = beforeBranch.forward && !afterBranch.forward && afterBranch.back;

    // 11) 戻る/進むは dirty にしない(開き直すときに破棄の確認が出ない)。
    await openDoc(navDoc, "nav-pages.html");
    await clickTree("Nav B");
    await pressBack();
    await pressForward();
    await pressBack();
    const navDialogsBefore = dialogCount;
    await openMenu(fresh, "file");
    await fresh.locator("#menu-new-document").click();
    await fresh.waitForTimeout(300);
    result.pageBackForwardDoesNotDirtyDocument = dialogCount === navDialogsBefore;

    // 12) 戻る/進むは Undo の履歴を増やさない。A を編集 → B → 戻る → 進む → Undo で、
    //     最初の Undo が A の編集を取り消す(戻る/進むが一手として積まれていれば、ここで何も起きない)。
    await openDoc(navDoc, "nav-pages.html");
    await fresh.locator("#blocks .block-content", { hasText: "NAV A line 0" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" EDITED");
    await fresh.waitForTimeout(200);
    await clickTree("Nav B");
    await pressBack();
    await pressForward();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const undoneAfterNav = await view();
    result.pageBackForwardAddsNoUndoHistory = undoneAfterNav.title === "Nav A"
      && undoneAfterNav.texts.includes("NAV A line 0")
      && !undoneAfterNav.texts.some((text) => text.includes("EDITED"));
    // Undo で A へ切り替わったのは移動ではないので、移動の履歴に積まない。履歴は「A → B」だけで、
    // 今 A にいるので戻る先は無い(積んでいれば「戻る」で B へ飛べてしまう)。
    result.undoPageSwitchIsNotPageHistory = !(await navButtons()).back;

    // 12b) Undo で別ページへ切り替わったら、履歴の位置もそのページに合う(列は変えない)。
    //      A 編集 → B へ移動 → Undo(A を表示)→ 進むで B へ行ける。位置が B のままだと進む先が無い。
    await openDoc(navDoc, "nav-pages.html");
    await fresh.locator("#blocks .block-content", { hasText: "NAV A line 1" }).first().click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" ALIGN");
    await fresh.waitForTimeout(200);
    await clickTree("Nav B");
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const alignedUndo = await view();
    const alignedButtons = await navButtons();
    // 進むが押せないときに押すと30秒待って落ちるので、押せるときだけ押す(赤は下の判定で名前つきで出す)。
    if (alignedButtons.forward) await pressForward();
    const alignedForward = (await view()).title;
    result.undoPageSwitchAlignsHistoryPosition = alignedUndo.title === "Nav A"
      && !alignedUndo.texts.some((text) => text.includes("ALIGN"))
      && alignedButtons.forward && !alignedButtons.back
      && alignedForward === "Nav B";

    // 13) ファイルを開くと移動の履歴は空になる(前の文書のページへは戻れない)。
    await clickTree("Nav B");
    const beforeReopen = await navButtons();
    await openDoc(navDoc, "nav-pages.html");
    const afterReopen = await navButtons();
    result.openingFileClearsPageHistory = beforeReopen.back && !afterReopen.back && !afterReopen.forward;

    // ---- Step 3: ページの削除 ----
    // 文書: R(先頭)→ M, X, A。M → C1, C2。C1 → M(循環)。X → M(2つ目の親。リンクの下に子ブロック)。
    // O はどこからもリンクされない。A は添付を持つ。M へのリンクは M 以外に3箇所(R・C1・X)。
    const deleteHtml = await fresh.evaluate(async () => {
      const file = new File([new Uint8Array([9, 8, 7, 6])], "del-only.bin", { type: "application/octet-stream" });
      const attachment = await window.SingleHtmlFormat.fileToAttachment(file, "att-del");
      const link = (id, pageId, extra = {}) => ({ id, type: "page", text: "", pageId, ...extra });
      const para = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
      return window.SingleHtmlFormat.buildPortableHtml({
        title: "Del Root",
        pages: [
          { id: "R", title: "Del Root", blocks: [link("r1", "M"), para("r2", "ROOT body"), link("r3", "X"), link("r4", "A")] },
          { id: "M", title: "Del Middle", blocks: [para("m1", "MIDDLE body"), link("m2", "C1"), link("m3", "C2")] },
          // C1 は段組み(2列)の片方が M へのリンク。リンクが消えると1列になり、段組みが解かれるはず。
          { id: "C1", title: "Del Child1", blocks: [
            para("c11", "CHILD1 body", { columnGroup: "cg", columnIndex: 0, columnWidth: 1 }),
            link("c12", "M", { columnGroup: "cg", columnIndex: 1, columnWidth: 1 }),
          ] },
          { id: "C2", title: "Del Child2", blocks: [para("c21", "CHILD2 body")] },
          { id: "X", title: "Del Other", blocks: [link("x1", "M"), para("x2", "UNDER LINK", { indent: 1 }), para("x3", "OTHER body")] },
          { id: "O", title: "Del Orphan", blocks: [para("o1", "ORPHAN body")] },
          { id: "A", title: "Del Att", blocks: [{ id: "a1", type: "attachment", text: "", attachmentId: "att-del" }] },
        ],
        fonts: [],
        attachments: [attachment],
      });
    });
    const deletePath = join(OUT, "delete-pages.html");
    await writeFile(deletePath, deleteHtml, "utf8");
    const openDeleteDoc = async () => {
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(deletePath);
      await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Del Root"
        && [...document.querySelectorAll("#blocks .block-content")].some((node) => node.textContent === "ROOT body"),
      null, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(300);
    };
    const rowOf = (title) => fresh.locator("#page-tree-body .page-tree-row", {
      has: fresh.locator(".page-tree-item", { hasText: title }),
    }).first();
    const deleteFromTree = async (title, { cancel = false } = {}) => {
      const row = rowOf(title);
      await row.hover();
      await row.locator(".page-tree-more").click();
      dismissNextDialog = cancel;
      await fresh.locator('#page-menu [data-action="delete-page"]').click();
      await fresh.waitForTimeout(300);
    };
    const treeIds = async () => [...new Set((await view()).items.map((item) => item.id))].sort().join(",");
    const saveAndParse = async (name) => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, name);
      await (await download).saveAs(path);
      return fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), await readFile(path, "utf8"));
    };

    // 15) 先頭ページは削除できない。メニューそのものが出ず(⋯ も右クリックも)、
    //     **削除関数を直接呼んでも何も起きない**(ガードは関数の側にもある)。
    await openDeleteDoc();
    const idsBefore = await treeIds();
    const rootHasMore = await rowOf("Del Root").locator(".page-tree-more").count();
    const middleHasMore = await rowOf("Del Middle").locator(".page-tree-more").count();
    await rowOf("Del Root").locator(".page-tree-item").click({ button: "right" });
    await fresh.waitForTimeout(150);
    const menuOpenedForRoot = await fresh.evaluate(() => !document.querySelector("#page-menu").hidden);
    await fresh.keyboard.press("Escape");
    result.firstPageHasNoDeleteMenu = rootHasMore === 0 && middleHasMore === 1 && !menuOpenedForRoot;
    const directResult = await fresh.evaluate(() => window.__docEditorPages.deletePage("R"));
    await fresh.waitForTimeout(150);
    result.firstPageDeleteCallIsNoop = directResult === false && (await treeIds()) === idsBefore
      && (await view()).title === "Del Root";

    // 16) 確認ダイアログは、ほかのページで取り除かれるリンクの数を先に見せる(0 のときは後半を省く)。
    //     キャンセルすれば何も変わらず、未保存にもならない。
    await deleteFromTree("Del Middle", { cancel: true });
    const middleMessage = lastDialogMessage;
    await deleteFromTree("Del Orphan", { cancel: true });
    const orphanMessage = lastDialogMessage;
    // X の子 M は R からも辿れるので未分類に移らない(前半を省く)。X へのリンクは R に1箇所。
    await deleteFromTree("Del Other", { cancel: true });
    const otherMessage = lastDialogMessage;
    // M を消すと C1・C2 は先頭から辿れなくなる(C1 のリンク先は M だけ)。M へのリンクは R・C1・X の3箇所。
    result.deleteDialogCountsLinksOnOtherPages = middleMessage
        === "このページを削除しますか(子ページ 2 件は未分類に移ります。他のページの 3 箇所のリンクも取り除かれます)"
      && otherMessage === "このページを削除しますか(他のページの 1 箇所のリンクも取り除かれます)"
      && orphanMessage === "このページを削除しますか";
    const idsAfterCancel = await treeIds();
    const cancelDialogs = dialogCount;
    await openMenu(fresh, "file");
    await fresh.locator("#menu-new-document").click();
    await fresh.waitForTimeout(300);
    result.cancelDeleteChangesNothing = idsAfterCancel === idsBefore && dialogCount === cancelDialogs;

    // 16b) 狭い画面(目次はオーバーレイ)でも、目次のメニューはオーバーレイの上に出て押せる。
    //      メニューを押しても目次は閉じない(メニューはオーバーレイの外に置いてあるため)。
    await openDeleteDoc();
    await fresh.setViewportSize({ width: 375, height: 700 });
    await fresh.waitForTimeout(200);
    await fresh.locator("#page-tree-toggle").click();
    await fresh.waitForTimeout(300);
    const narrowRow = rowOf("Del Orphan");
    await narrowRow.hover();
    await narrowRow.locator(".page-tree-more").click();
    await fresh.waitForTimeout(150);
    const narrowMenuOnTop = await fresh.evaluate(() => {
      const item = document.querySelector("#page-menu .menu-item");
      if (!item) return false;
      const rect = item.getBoundingClientRect();
      return item.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    });
    await fresh.locator('#page-menu [data-action="delete-page"]').click();
    await fresh.waitForTimeout(300);
    const narrowAfter = await fresh.evaluate(() => ({
      overlayOpen: document.querySelector("#page-tree").classList.contains("is-overlay-open"),
      orphanGone: ![...document.querySelectorAll("#page-tree-body .page-tree-item")].some((item) => item.textContent === "Del Orphan"),
    }));
    await fresh.keyboard.press("Escape");
    await fresh.setViewportSize({ width: 1280, height: 720 });
    await fresh.waitForTimeout(200);
    result.narrowPageMenuIsAboveOverlay = narrowMenuOnTop && narrowAfter.orphanGone && narrowAfter.overlayOpen;

    // 17) 今いるページ(M)を削除する。移動の履歴で1つ前(X。先頭ページではない)へ移り、子ページは消えず、
    //     M へのリンクは全ページ(R・C1・X)から消え、X のリンクの下にあった子ブロックは残る。
    //     子ページ C1・C2 は先頭から辿れなくなるので「未分類」に出る(v140: ルートは先頭ページだけ)。
    await openDeleteDoc();
    await clickTree("Del Other");
    await clickTree("Del Middle");
    await deleteFromTree("Del Middle");
    const afterDelete = await view();
    result.deletingCurrentPageMovesToPreviousPage = afterDelete.title === "Del Other"
      && afterDelete.texts.includes("OTHER body");
    const childItems = afterDelete.items.filter((item) => item.id === "C1" || item.id === "C2");
    result.childPagesMoveToUnclassified = childItems.length === 2
      && childItems.every((item) => item.unclassified);
    result.everyPageAppearsAfterDeletion = (await treeIds()) === "A,C1,C2,O,R,X";
    const savedAfterDelete = await saveAndParse("after-page-delete.html");
    const linksToMiddle = savedAfterDelete.pages.flatMap((page) => page.blocks)
      .filter((block) => block.type === "page" && block.pageId === "M").length;
    result.deleteRemovesLinksFromAllPages = linksToMiddle === 0
      && !savedAfterDelete.pages.some((page) => page.id === "M")
      && savedAfterDelete.pages.length === 6;
    const otherPage = savedAfterDelete.pages.find((page) => page.id === "X");
    const underLink = otherPage?.blocks.find((block) => block.text === "UNDER LINK");
    result.deleteKeepsLinkChildBlocks = Boolean(underLink) && (underLink.indent || 0) === 0
      && otherPage.blocks.map((block) => block.text).join("|") === "UNDER LINK|OTHER body";
    // リンクを取り除いた**各ページ**で段組みを正規化する(1列だけ残った段組みは解く)。
    const childOne = savedAfterDelete.pages.find((page) => page.id === "C1");
    result.deleteNormalizesColumnsOnEveryPage = childOne?.blocks.length === 1
      && childOne.blocks[0].text === "CHILD1 body" && !childOne.blocks[0].columnGroup;

    // 18) Undo 1手で、削除したページへ戻り、中身もリンクも戻る(子ページも未分類から親の下へ戻る)。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const afterUndoDelete = await view();
    const middleItem = afterUndoDelete.items.find((item) => item.id === "M" && !item.repeated);
    result.undoDeleteRestoresPageAndLinks = afterUndoDelete.title === "Del Middle"
      && afterUndoDelete.texts.includes("MIDDLE body")
      && Boolean(middleItem) && middleItem.depth === 2 && !middleItem.unclassified
      && afterUndoDelete.items.filter((item) => item.id === "C1" || item.id === "C2").every((item) => !item.unclassified);

    // 19) 添付を持つページを削除すると、その添付は掃除される。Undo でページと一緒に戻り、開ける。
    await openDeleteDoc();
    const attachmentListed = () => fresh.evaluate(() => (
      [...document.querySelectorAll("#attachment-summary > *")].some((item) => item.textContent.includes("del-only.bin"))
    ));
    const listedBefore = await attachmentListed();
    await deleteFromTree("Del Att");
    const listedAfterDelete = await attachmentListed();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const listedAfterUndo = await attachmentListed();
    await clickTree("Del Att");
    const attachmentDownload = fresh.waitForEvent("download", { timeout: 5000 });
    await fresh.locator(".attachment-file-card", { hasText: "del-only.bin" }).locator(".attachment-download").click();
    const restoredFile = await (await attachmentDownload.catch(() => null));
    let restoredBytes = "";
    if (restoredFile) {
      const restoredPath = join(DOWNLOADS, "restored-del-only.bin");
      await restoredFile.saveAs(restoredPath);
      restoredBytes = [...(await readFile(restoredPath))].join(",");
    }
    result.undoDeleteRestoresAttachment = listedBefore && !listedAfterDelete && listedAfterUndo
      && restoredFile?.suggestedFilename() === "del-only.bin" && restoredBytes === "9,8,7,6";

    // 20) 戻る/進むは削除したページを飛ばし、Undo でページが戻ればまた辿れる
    //     (履歴から項目を取り除かず、辿るときに飛ばしているから)。R → X → C2 と移ってから X を削除。
    await openDeleteDoc();
    await clickTree("Del Other");
    await clickTree("Del Child2");
    await deleteFromTree("Del Other");
    await pressBack();
    const backSkipped = (await view()).title;
    await pressForward();
    const forwardSkipped = (await view()).title;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const afterUndoHistory = (await view()).title;
    await pressBack();
    const backAfterUndo = (await view()).title;
    result.pageHistorySkipsDeletedPageUntilUndo = backSkipped === "Del Root"
      && forwardSkipped === "Del Child2"
      && afterUndoHistory === "Del Child2"
      && backAfterUndo === "Del Other";

    // 20b) 今いるページを削除したあとの移動は「戻る」と同じ扱い。削除したページは進む側に残り、
    //      削除中は進むで飛ばされ(押せない)、Undo でページが戻れば、別ページへ戻ったあと進むで行ける。
    await openDeleteDoc();
    await clickTree("Del Other");
    await clickTree("Del Middle");
    await deleteFromTree("Del Middle");
    const landedOn = (await view()).title;
    const forwardWhileDeleted = (await navButtons()).forward;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(350);
    const afterUndoCurrent = (await view()).title;
    const forwardRightAfterUndo = (await navButtons()).forward;
    await pressBack();
    const backFromRestored = (await view()).title;
    const forwardTitles = [];
    for (let step = 0; step < 3 && (await navButtons()).forward; step += 1) {
      await pressForward();
      forwardTitles.push((await view()).title);
    }
    result.deletingCurrentPageKeepsItOnForwardSide = landedOn === "Del Other"
      && !forwardWhileDeleted
      && afterUndoCurrent === "Del Middle"
      // Undo で Del Middle へ戻ったら、履歴の位置も Del Middle に合う。進む先は無く、戻るはちょうど1つ前の
      // Del Other("!== Del Middle" では、Del Other を飛ばして先頭へ行っても緑になってしまう。P13)。
      && !forwardRightAfterUndo
      && backFromRestored === "Del Other"
      && forwardTitles.includes("Del Middle");

    // 検索バーを開いたまま今いるページを削除したときの確かめは searchScopeSuite の searchScopeFollowsPageDeletion
    // (件数が 0/0 になり、古い塗りが残らない)。

    return result;
  } finally {
    await fresh.close();
  }
}
