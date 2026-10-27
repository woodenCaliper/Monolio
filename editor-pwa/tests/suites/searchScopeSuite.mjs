// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 検索の3スコープ(複数ページ Step 5) ----
// 現在のページ(既定)/このページと子ページ/全ページ。検索バーの中で選ぶ。範囲の選択は UI 状態。
export default async function searchScopeSuite({ context }) {
  const fresh = await context.newPage();
  const dialogs = [];
  fresh.on("dialog", (dialog) => { dialogs.push(dialog.message()); dialog.accept(); });
  const result = {};
  const link = (id, pageId) => ({ id, type: "page", text: "", pageId });
  const para = (id, text) => ({ id, type: "paragraph", text });
  // 先頭 R → A, S。A → B。B → A(循環)と G。O はどこからもリンクされない(未分類)。各ページに needle が1つ。
  const literal = {
    title: "Scope Root",
    pages: [
      { id: "R", title: "Scope Root", blocks: [para("r1", "needle root"), link("r2", "A"), link("r3", "S")] },
      { id: "A", title: "Scope A", blocks: [para("a1", "needle A"), link("a2", "B")] },
      { id: "B", title: "Scope B", blocks: [para("b1", "needle B"), link("b2", "A"), link("b3", "G")] },
      { id: "G", title: "Scope Grand", blocks: [para("g1", "needle grand")] },
      { id: "S", title: "Scope Sibling", blocks: [para("s1", "needle sibling")] },
      { id: "O", title: "Scope Orphan", blocks: [para("o1", "needle orphan")] },
    ],
    fonts: [],
    attachments: [],
  };
  const openScopeDoc = async () => {
    const path = join(OUT, "search-scope.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Scope Root"
      && [...document.querySelectorAll("#blocks .block-content")].some((node) => node.textContent === "needle root"), null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const clickTree = async (title) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: title }).first().click();
    await fresh.waitForTimeout(200);
  };
  const state = () => fresh.evaluate(() => {
    const count = document.querySelector("#search-count").textContent;
    const [position, total] = count.split("/");
    return {
      count,
      position,
      total: Number(total),
      page: document.querySelector("#search-page").textContent,
      title: document.querySelector("#doc-title").textContent,
      highlighted: Boolean(CSS.highlights?.get("doc-search-current")?.size),
    };
  });
  const openSearch = async (query) => {
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+f");
    await fresh.locator("#search-input").fill(query);
    await fresh.waitForTimeout(200);
  };
  const setScope = async (value) => {
    await fresh.selectOption("#search-scope", value);
    await fresh.waitForTimeout(200);
  };
  const next = async () => {
    await fresh.locator("#search-next").click();
    await fresh.waitForTimeout(250);
  };
  // 範囲の一致を「次へ」で一巡し、訪れたページの題名を集める(一致1件につき1回)。
  const visitAll = async () => {
    const titles = [];
    const total = (await state()).total;
    for (let step = 0; step < total; step += 1) {
      await next();
      const now = await state();
      titles.push(now.title);
    }
    return titles;
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await openScopeDoc();
    await clickTree("Scope A");

    // 1) 既定は現在のページだけ(ほかのページの一致は数えない)。
    await openSearch("needle");
    const byDefault = await state();
    const scopeDefault = await fresh.evaluate(() => document.querySelector("#search-scope").value);
    result.searchDefaultsToCurrentPage = scopeDefault === "page" && byDefault.count === "1/1" && byDefault.page === "";

    // 2) このページと子ページ: A から辿れる A・B・G(孫)だけ。親 R・兄弟 S・未分類 O は入らず、
    //    B → A の循環で止まる(自分を含む)。
    await setScope("subtree");
    const subtree = await state();
    const subtreeTitles = await visitAll();
    result.subtreeScopeCoversDescendantsOnly = subtree.total === 3
      && [...new Set(subtreeTitles)].sort().join(",") === "Scope A,Scope B,Scope Grand"
      && subtree.page.includes("3 ページに一致");

    // 3) 全ページ: 全ページの一致を数え、ページをまたいで次へ進むとそのページが表示され、一致が塗られる。
    await clickTree("Scope A");
    await setScope("all");
    const all = await state();
    await next();
    const firstJump = await state();
    await next();
    const crossed = await state();
    result.allScopeCountsEveryPage = all.total === 6;
    result.searchJumpShowsOtherPage = crossed.title !== firstJump.title
      && crossed.highlighted && crossed.position !== "–"
      && crossed.page.startsWith(crossed.title);
    // ページをまたぐ移動が移動の履歴に積まれること(戻るで前のページへ戻れる)は 8) の searchJumpAddsOneHistoryEntry。

    // 4) 範囲を全ページにしてすべて置換: ほかのページのぶんも確認で見せてから置き換え、Undo 1手で全ページが戻る。
    await clickTree("Scope A");
    await openSearch("needle");
    await setScope("all");
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-replace-input").fill("pin");
    const dialogsBefore = dialogs.length;
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(400);
    const confirmMessage = dialogs.slice(dialogsBefore).join("|");
    await fresh.locator("#search-input").fill("needle");
    await fresh.waitForTimeout(200);
    const needleAfter = (await state()).count;
    await fresh.locator("#search-input").fill("pin");
    await fresh.waitForTimeout(200);
    const pinAfter = (await state()).total;
    await fresh.keyboard.press("Escape");
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(400);
    await openSearch("needle");
    const needleRestored = (await state()).total;
    result.replaceAllAcrossPagesIsOneUndo = confirmMessage.includes("6 件") && confirmMessage.includes("ほかの 5 ページ")
      && needleAfter === "0/0" && pinAfter === 6 && needleRestored === 6;

    // 5) 範囲が現在のページなら、すべて置換してもほかのページは変わらない(確認も出ない)。
    await fresh.keyboard.press("Escape");
    await clickTree("Scope A");
    await openSearch("needle");
    await setScope("page");
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-replace-input").fill("pin");
    const pageDialogs = dialogs.length;
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(400);
    await fresh.locator("#search-input").fill("needle");
    await setScope("all");
    const othersKept = (await state()).total;
    result.pageScopeReplaceLeavesOtherPages = othersKept === 5 && dialogs.length === pageDialogs;

    // 6) 範囲の選択は保存ファイルに入らない(文書は pages・fonts・attachments だけ)。バーを閉じて開き直しても
    //    セッションの間は覚えている。
    await fresh.keyboard.press("Escape");
    await openSearch("needle");
    const remembered = await fresh.evaluate(() => document.querySelector("#search-scope").value);
    await fresh.keyboard.press("Escape");
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "search-scope-saved.html");
    await (await download).saveAs(savedPath);
    const savedHtml = await readFile(savedPath, "utf8");
    // formatVersion はファイルの版(v228。開いたときの注意に使う)で、文書の中身ではないので数えない。
    const savedKeys = await fresh.evaluate((html) => Object.keys(window.SingleHtmlFormat.parsePortableHtml(html)).filter((key) => key !== "formatVersion").sort().join(","), savedHtml);
    const manifestText = savedHtml.slice(savedHtml.indexOf('id="document-manifest"'), savedHtml.indexOf('id="document-attachments"'));
    // **別のファイルを開く**と、範囲は既定の「このページ」へ戻る(別の文書へは持ち越さない)。
    const otherPath = join(OUT, "search-scope-other.html");
    await writeFile(otherPath, await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      pages: [
        { id: "X1", title: "Other Doc", blocks: [{ id: "x1", type: "paragraph", text: "needle other" }, { id: "x2", type: "page", text: "", pageId: "X2" }] },
        { id: "X2", title: "Other Child", blocks: [{ id: "x3", type: "paragraph", text: "needle child" }] },
      ],
      fonts: [],
      attachments: [],
    })), "utf8");
    const otherChooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await otherChooser).setFiles(otherPath);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Other Doc", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    await openSearch("needle");
    const afterReopen = await fresh.evaluate(() => document.querySelector("#search-scope").value);
    const reopenedCount = (await state()).count;
    await fresh.keyboard.press("Escape");
    result.searchScopeResetsOnOpen = afterReopen === "page" && reopenedCount === "1/1";
    result.searchScopeIsNotSaved = remembered === "all" && savedKeys === "attachments,fonts,pages"
      // マニフェストの integrity.scope("attachments")は添付の整合性の範囲で、検索とは別物。
      && !/searchScope|subtree|"scope":\s*"(page|all)"/.test(manifestText);

    // 6b) すべて置換の完了を「N 件を M ページで置換しました」と見える形で出す(開いていないページも変わったと分かる)。
    //     (4) の置換のあとに出ていた知らせは、Undo で数え直しても検索語を変えるまで残る仕様なので、ここで改めて確かめる)
    await openScopeDoc();
    await openSearch("needle");
    await setScope("all");
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-replace-input").fill("pin");
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(400);
    const notice = (await state()).page;
    await fresh.locator("#search-input").fill("pin");
    await fresh.waitForTimeout(200);
    const noticeAfterTyping = (await state()).page;
    await fresh.keyboard.press("Escape");
    result.replaceAllReportsPagesChanged = notice === "6 件を 6 ページで置換しました" && !noticeAfterTyping.includes("置換しました");

    // 7) 検索中に今いるページを削除しても、結果が消えたページを指したまま残らない(範囲が全ページでも)。
    await openScopeDoc();
    await clickTree("Scope Grand");
    await openSearch("grand");
    await setScope("all");
    const beforeDelete = await state();
    await fresh.locator("#page-tree-body .page-tree-row", { has: fresh.locator(".page-tree-item", { hasText: "Scope Grand" }) })
      .first().locator(".page-tree-more").click({ force: true });
    await fresh.locator('#page-menu [data-action="delete-page"]').click();
    await fresh.waitForTimeout(400);
    const afterDelete = await state();
    // 古い塗り(消えたページの一致の範囲・数式セルの枠)も残らない(pageNavSuite の searchResultsFollowDeletion から移した)。
    const staleHighlight = await fresh.evaluate(() => Boolean(CSS.highlights?.get("doc-search-current")?.size || CSS.highlights?.get("doc-search-match")?.size)
      || Boolean(document.querySelector(".search-current-cell")));
    result.searchScopeFollowsPageDeletion = beforeDelete.total === 1 && afterDelete.count === "0/0" && afterDelete.page === "" && !staleHighlight;
    result.searchScopeDeletionEvidence = { beforeDelete, afterDelete, staleHighlight };
    await fresh.keyboard.press("Escape");

    // 8) 子ページの範囲: 循環(D → A)と親が2つのページ(D は B と C の子)があっても、同じページを2回数えない。
    //    表示していないページの一致も、書式(太字)を保ったまま置き換わる(置換の処理は1つ)。
    //    ページをまたぐジャンプで移動の履歴は1件だけ増え、古いページのハイライトは残らない。
    const tangled = {
      title: "Tangle Root",
      pages: [
        { id: "TR", title: "Tangle Root", blocks: [para("tr1", "root text"), link("tr2", "TA")] },
        { id: "TA", title: "Tangle A", blocks: [para("ta1", "needle one"), para("ta2", "needle two"), link("ta3", "TB"), link("ta4", "TC")] },
        { id: "TB", title: "Tangle B", blocks: [
          { id: "tb1", type: "paragraph", text: "**needle** bold", html: "<strong>needle</strong> bold" },
          link("tb2", "TD"),
        ] },
        { id: "TC", title: "Tangle C", blocks: [para("tc1", "needle C"), link("tc2", "TD")] },
        { id: "TD", title: "Tangle D", blocks: [para("td1", "needle D"), link("td2", "TA")] },
      ],
      fonts: [],
      attachments: [],
    };
    const tangledPath = join(OUT, "search-tangle.html");
    await writeFile(tangledPath, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), tangled), "utf8");
    const tangledChooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await tangledChooser).setFiles(tangledPath);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Tangle Root", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    await clickTree("Tangle A");
    await openSearch("needle");
    await setScope("subtree");
    const tangleSubtree = await state();
    result.subtreeScopeCountsEachPageOnce = tangleSubtree.total === 5 && tangleSubtree.page.includes("4 ページに一致");
    // A の中で次へ(同じページ: 履歴は増えない)→ 次へで B へ(ページが変わる: 1件だけ増える)。
    await next();
    await next();
    const onB = await state();
    const liveHighlights = await fresh.evaluate(() => {
      const ranges = [...(CSS.highlights?.get("doc-search-current") || []), ...(CSS.highlights?.get("doc-search-match") || [])];
      return {
        count: ranges.length,
        allLive: ranges.every((range) => range.startContainer.isConnected && document.querySelector("#blocks").contains(range.startContainer)),
      };
    });
    await fresh.locator("#page-back").click();
    await fresh.waitForTimeout(250);
    const back1 = (await state()).title;
    await fresh.locator("#page-back").click();
    await fresh.waitForTimeout(250);
    const back2 = (await state()).title;
    result.searchJumpAddsOneHistoryEntry = onB.title === "Tangle B" && back1 === "Tangle A" && back2 === "Tangle Root";
    result.searchHighlightsOnlyLivePage = onB.highlighted && liveHighlights.count === 1 && liveHighlights.allLive;
    // 開いていない B の太字の一致を、A からすべて置換 → B を開くと太字のまま置き換わっている。
    await clickTree("Tangle A");
    await openSearch("needle");
    await setScope("subtree");
    await fresh.keyboard.press("Control+h");
    await fresh.locator("#search-replace-input").fill("pin");
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(400);
    await fresh.keyboard.press("Escape");
    await clickTree("Tangle B");
    const boldAfter = await fresh.evaluate(() => {
      const block = [...document.querySelectorAll("#blocks .block-content")].find((node) => node.textContent.includes("bold"));
      return { text: block?.textContent || "", strong: block?.querySelector("strong")?.textContent || "" };
    });
    result.hiddenPageReplaceKeepsFormatting = boldAfter.text === "pin bold" && boldAfter.strong === "pin";
    return result;
  } finally {
    await fresh.close();
  }
}
