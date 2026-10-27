// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FORMAT_VERSION, OUT, PORT, openMenu } from "../lib.mjs";

// ---- ブロックへのリンク(Issue #176。保存形式 0.8.20)と被リンク(Issue #188) ----
// つまみのメニューの「ブロックへのリンクをコピー」で、どのブロック(段落・箇条書き・表・見出し…)へのリンクもクリップボードに載る。
// 文中に貼ると参照の印(span.figure-ref data-ref-kind="block")になり、行き先のブロックの文字(短く詰めたもの)を写す。押すと
// そのブロックへ移って少しの間だけ光る(別のページでも)。保存→開き直し・保存HTMLのリンク・行き先を消したとき・別の文書へ貼った
// とき・ほかのアプリへ貼る文字も確かめる。被リンクは、ほかのページから今のページを指しているものの数と一覧(題名の横のボタン)。
// 画面(メモリ上)と保存したファイルの両方で確かめる。
export default async function blockLinkSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error)));
  const cells = (...values) => values.map((text) => ({ text }));
  const longText = "ブロックへのリンクの行き先になる段落です。三十文字より長いので、印の文字は途中で詰めて「…」を付けます。";
  const literal = { fonts: [], attachments: [], pages: [
    { id: "P1", title: "設計書", blocks: [
      { id: "h1", type: "heading1", text: "目的" },
      { id: "p1", type: "paragraph", text: longText },
      { id: "b1", type: "bullet", text: "箇条書きの項目" },
      { id: "t1", type: "table", text: "", rows: [cells("名前", "値"), cells("a", "1")] },
      { id: "pz", type: "paragraph", text: "" },
      { id: "p2", type: "paragraph", text: "" },
      { id: "l2", type: "page", pageId: "P2", text: "" },
      { id: "l3", type: "page", pageId: "P3", text: "" },
    ] },
    { id: "P2", title: "試験の記録", blocks: [
      { id: "q1", type: "paragraph", text: "別ページの本文" },
      { id: "q2", type: "paragraph", text: "" },
    ] },
    { id: "P3", title: "議事録", blocks: [
      { id: "r1", type: "paragraph", text: "試験の記録を見る", html: '<span class="figure-ref" data-ref="P2">試験の記録</span>を見る' },
      { id: "r2", type: "paragraph", text: "参照先なし", html: '<span class="figure-ref" data-ref="q1">x</span>' },
    ] },
  ] };
  const source = join(OUT, "block-link.html");
  const chipIn = (id) => fresh.evaluate((blockId) => {
    const chip = document.querySelector('#blocks .block-content[data-id="' + blockId + '"] .figure-ref');
    return chip ? {
      ref: chip.dataset.ref, kind: chip.dataset.refKind || "", text: chip.textContent,
      block: chip.classList.contains("is-block"), missing: chip.classList.contains("is-missing"),
    } : null;
  }, id);
  const caretAtEnd = (id) => fresh.evaluate((blockId) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, id);
  const goPage = async (title) => {
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: title }).first().click();
    await fresh.waitForTimeout(250);
  };
  const currentTitle = () => fresh.evaluate(() => document.querySelector("#doc-title").textContent);
  // つまみのメニューを開いて「ブロックへのリンクをコピー」を押し、クリップボードに載ったもの(copy のイベントの中身)を返す。
  const copyLinkOf = async (id) => {
    await fresh.evaluate(() => { window.__copied = null; });
    await fresh.locator('#blocks .block[data-id="' + id + '"] .drag-grip').click();
    await fresh.waitForTimeout(200);
    const offered = await fresh.locator('#block-menu .menu-item[data-action="copy-block-link"]').count();
    if (offered) await fresh.locator('#block-menu .menu-item[data-action="copy-block-link"]').click();
    await fresh.waitForTimeout(150);
    return { offered: offered === 1, ...(await fresh.evaluate(() => window.__copied || {})) };
  };
  // 本文へ貼る(コピーで載った text/html と text/plain を、そのまま paste のイベントで渡す)。
  const pasteInto = async (id, copied) => {
    await caretAtEnd(id);
    await fresh.evaluate(({ blockId, html, plain }) => {
      const transfer = new DataTransfer();
      if (html) transfer.setData("text/html", html);
      transfer.setData("text/plain", plain || "");
      document.querySelector('#blocks .block-content[data-id="' + blockId + '"]')
        .dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, { blockId: id, html: copied.html, plain: copied.plain });
    await fresh.waitForTimeout(200);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(source);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "設計書", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    await fresh.evaluate(() => {
      window.addEventListener("copy", (event) => {
        window.__copied = { html: event.clipboardData.getData("text/html"), plain: event.clipboardData.getData("text/plain") };
      });
    });

    // 1) つまみのメニューに「ブロックへのリンクをコピー」(段落・箇条書き・表・見出しのどれにも)
    const offeredFor = {};
    for (const id of ["p1", "b1", "t1", "h1"]) {
      await fresh.locator('#blocks .block[data-id="' + id + '"] .drag-grip').click();
      await fresh.waitForTimeout(150);
      offeredFor[id] = await fresh.evaluate(() => document.querySelector('#block-menu .menu-item[data-action="copy-block-link"] .menu-title')?.textContent || "");
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(100);
    }
    result.blockLinkMenuOffered = Object.values(offeredFor).every((title) => title === "ブロックへのリンクをコピー");
    result.blockLinkMenuEvidence = JSON.stringify(offeredFor);

    // 2) 押すとクリップボードに、このアプリ用の印(文中のコピーと同じ形)と、ほかのアプリ用の文字(行き先の文字を短く詰めたもの)が載る
    const copiedP1 = await copyLinkOf("p1");
    const expectedLabel = [...longText].slice(0, 30).join("") + "…";
    result.blockLinkCopiesChip = copiedP1.offered === true &&/data-monolio-inline/.test(copiedP1.html || "")
      && /data-ref="p1"/.test(copiedP1.html) && /data-ref-kind="block"/.test(copiedP1.html);
    result.blockLinkPlainFallbackIsLabel = copiedP1.plain === expectedLabel;
    result.blockLinkCopyStatus = /ブロックへのリンクをコピーしました/.test(await fresh.evaluate(() => document.querySelector("#status").textContent));
    result.blockLinkCopyEvidence = JSON.stringify(copiedP1);

    // 3) 文中に貼ると印になる(行き先の文字を写す。頭に矢印)。文書の値にも data-ref-kind="block" で入る。Ctrl+Z 1回で貼る前へ
    await pasteInto("pz", copiedP1);
    const pasted = await chipIn("pz");
    result.blockLinkPastesChip = pasted?.ref === "p1" && pasted.kind === "block" && pasted.block === true && pasted.missing === false && pasted.text === expectedLabel;
    result.blockLinkPasteEvidence = JSON.stringify({ pasted });
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const undone = await chipIn("pz");
    await fresh.keyboard.press("Control+Shift+z");
    await fresh.waitForTimeout(200);
    result.blockLinkPasteUndoable = undone === null && (await chipIn("pz"))?.ref === "p1";

    // 4) 印を押すと、行き先のブロックへ移って光る
    await fresh.evaluate(() => window.scrollTo(0, 0));
    await fresh.locator('#blocks .block-content[data-id="pz"] .figure-ref').click();
    await fresh.waitForTimeout(200);
    result.blockLinkJumpFlashes = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="p1"]')?.classList.contains("ref-flash") === true);

    // 5) 行き先を打ち替えると、印の文字もついてくる(次のフレームで)
    await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="p1"]');
      editable.focus();
      const range = document.createRange();
      range.setStart(editable.firstChild, 0);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await fresh.keyboard.type("新");
    await fresh.waitForTimeout(200);
    result.blockLinkFollowsTargetText = (await chipIn("pz"))?.text === [...("新" + longText)].slice(0, 30).join("") + "…";
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);

    // 6) 見出しへのリンクは、見出しへの参照と同じ文字(番号が切なら名前)
    const copiedH1 = await copyLinkOf("h1");
    await pasteInto("pz", copiedH1);
    const headingChip = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block-content[data-id="pz"] .figure-ref')].map((chip) => chip.textContent + "|" + chip.dataset.ref + "|" + (chip.dataset.refKind || "")));
    result.blockLinkToHeadingUsesHeadingLabel = headingChip.includes("目的|h1|block");
    // 文字の無いブロック(表)は種類の名前
    const copiedT1 = await copyLinkOf("t1");
    result.blockLinkToTableLabel = copiedT1.plain === "表";

    // 7) 別のページのブロックへのリンク。押すとそのページへ移って光る
    await goPage("試験の記録");
    const copiedQ1 = await copyLinkOf("q1");
    await goPage("設計書");
    await pasteInto("p2", copiedQ1);
    const crossChip = await chipIn("p2");
    result.blockLinkCrossPageChip = crossChip?.ref === "q1" && crossChip.text === "別ページの本文" && crossChip.block === true;
    await fresh.locator('#blocks .block-content[data-id="p2"] .figure-ref').click();
    await fresh.waitForTimeout(300);
    result.blockLinkCrossPageJump = (await currentTitle()) === "試験の記録"
      && await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="q1"]')?.classList.contains("ref-flash") === true);

    // 8) 被リンク: 「試験の記録」を指しているのは、設計書のページのブロック・設計書のブロックへのリンク・議事録の「@」の3つ。
    //    議事録の r2(data-ref-kind の無い印で段落を指す=「参照先なし」)は数えない。同じページの中のリンクは数えない
    const backlinkState = () => fresh.evaluate(() => {
      const button = document.querySelector("#page-backlinks");
      return { shown: !button.hidden, count: document.querySelector("#page-backlinks-count").textContent };
    });
    const onP2 = await backlinkState();
    await fresh.locator("#page-backlinks").click();
    await fresh.waitForTimeout(200);
    const listed = await fresh.evaluate(() => [...document.querySelectorAll("#backlinks-menu .menu-item")].map((item) => ({
      page: item.dataset.page, block: item.dataset.block, kind: item.dataset.kind, text: item.textContent,
    })));
    const kinds = listed.map((item) => item.page + ":" + item.block + ":" + item.kind).sort().join(",");
    result.backlinksCountShown = onP2.shown && onP2.count === "3";
    result.backlinksListsSources = kinds === "P1:l2:page-block,P1:p2:block-link,P3:r1:mention";
    result.backlinksEvidence = JSON.stringify({ onP2, listed });
    // 一覧の項目を押すと、そのページのリンクの所へ移って光る
    await fresh.locator('#backlinks-menu .menu-item[data-kind="mention"]').click();
    await fresh.waitForTimeout(300);
    result.backlinksJumpToSource = (await currentTitle()) === "議事録"
      && await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="r1"]')?.classList.contains("ref-flash") === true
        && document.querySelector("#backlinks-menu").hidden);
    // 指されていないページ(議事録は設計書のページのブロックだけ。設計書は誰からも指されていない)
    const onP3 = await backlinkState();
    await goPage("設計書");
    const onP1 = await backlinkState();
    result.backlinksOnlyOtherPages = onP3.shown && onP3.count === "1" && !onP1.shown;
    result.backlinksOtherEvidence = JSON.stringify({ onP3, onP1 });

    // 9) 保存HTML: 印は行き先のブロックへのリンク(#block-…)、行き先は錨つきの入れ物。形式 0.8.20。開き直しても印のまま
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const saved = join(DOWNLOADS, "block-link-saved.html");
    await (await download).saveAs(saved);
    const html = await readFile(saved, "utf8");
    const exported = await fresh.evaluate((text) => {
      const view = new DOMParser().parseFromString(text, "text/html");
      const manifest = JSON.parse(view.querySelector("#document-manifest").textContent);
      const links = [...view.querySelectorAll("a.figure-ref.is-block")].map((link) => link.getAttribute("href") + "|" + link.textContent);
      const pz = manifest.pages[0].blocks.find((block) => block.id === "pz");
      return {
        version: manifest.formatVersion, links, stored: pz?.html || "",
        p1Anchor: view.getElementById("block-p1")?.className || "", q1Anchor: view.getElementById("block-q1")?.className || "",
        h1Anchor: view.getElementById("block-h1")?.tagName || "",
      };
    }, html);
    result.savedBlockLinkFormatVersion = exported.version === FORMAT_VERSION && /data-ref="p1"/.test(exported.stored) && /data-ref-kind="block"/.test(exported.stored);
    result.savedBlockLinkIsAnchor = exported.links.includes("#block-p1|" + expectedLabel) && exported.links.includes("#block-q1|別ページの本文")
      && exported.links.includes("#block-h1|目的") && exported.p1Anchor === "block-target" && exported.q1Anchor === "block-target" && exported.h1Anchor === "H2";
    result.savedBlockLinkEvidence = JSON.stringify(exported);
    // 保存HTMLをブラウザで開いて押すと、別のページのブロックへ移る
    const view = await context.newPage();
    await view.goto("file://" + saved);
    await view.waitForTimeout(400);
    await view.locator('a.figure-ref[href="#block-q1"]').click();
    await view.waitForTimeout(300);
    result.savedBlockLinkSwitchesPage = await view.evaluate(() => document.querySelector("section.doc-page.is-current")?.id === "page-P2"
      && location.hash === "#block-q1" && Boolean(document.getElementById("block-q1")?.matches(":target")));
    await view.close();
    // 開き直しても印のまま(種類も行き先も)
    const reopenChooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await reopenChooser).setFiles(saved);
    await fresh.waitForTimeout(500);
    const reopened = await chipIn("pz");
    result.blockLinkSurvivesReopen = reopened?.ref === "p1" && reopened.kind === "block" && reopened.block === true && reopened.text === expectedLabel;

    // 10) 行き先を消すと「参照先なし」(文字は残る。押しても移らない)。Undo で戻る
    await goPage("試験の記録");
    await fresh.locator('#blocks .block[data-id="q1"] .drag-grip').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#block-menu .menu-item[data-action="delete"]').click();
    await fresh.waitForTimeout(200);
    await goPage("設計書");
    const deleted = await chipIn("p2");
    result.blockLinkMissingAfterDelete = deleted?.missing === true && deleted.text === "参照先なし" && deleted.block === false;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    await goPage("設計書");
    result.blockLinkBackAfterUndo = (await chipIn("p2"))?.text === "別ページの本文";

    // 11) 別の文書(そのブロックの無い文書)へ貼ると、リンクではなく文字になる
    await fresh.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData("text/html", '<span data-monolio-inline="1"><span class="figure-ref" data-ref="zz-nowhere" data-ref-kind="block">よその段落</span></span>');
      transfer.setData("text/plain", "よその段落");
      const editable = document.querySelector('#blocks .block-content[data-id="b1"]');
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      editable.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.waitForTimeout(200);
    result.foreignBlockLinkBecomesText = await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="b1"]');
      return editable.textContent === "箇条書きの項目よその段落" && !editable.querySelector(".figure-ref");
    });

    // 12) 表・図・見出しの参照(data-ref-kind の無い印)は今までどおり: 段落を指すものは「参照先なし」
    await goPage("議事録");
    const plainRef = await fresh.evaluate(() => {
      const chip = document.querySelector('#blocks .block-content[data-id="r2"] .figure-ref');
      return { text: chip?.textContent, missing: chip?.classList.contains("is-missing"), block: chip?.classList.contains("is-block") };
    });
    result.plainReferenceToParagraphStillMissing = plainRef.text === "参照先なし" && plainRef.missing === true && plainRef.block === false;

    // 13) 打鍵は軽いまま: リンクの無い段落への打鍵では参照の行き先を数え直さない。行き先への打鍵は1フレームに1回まで
    await goPage("設計書");
    const typingCost = async (id) => {
      await fresh.evaluate(() => {
        const fmt = window.SingleHtmlFormat;
        window.__refCount = 0;
        if (!fmt.__countedReferenceTargets) {
          const original = fmt.referenceTargets;
          fmt.referenceTargets = (...args) => { window.__refCount += 1; return original(...args); };
          fmt.__countedReferenceTargets = true;
        }
      });
      await caretAtEnd(id);
      await fresh.keyboard.type("abcdefghij", { delay: 5 });
      await fresh.waitForTimeout(150);
      return fresh.evaluate(() => window.__refCount);
    };
    const plainTyping = await typingCost("b1");
    const targetTyping = await typingCost("p1");
    result.blockLinkTypingStaysLight = plainTyping === 0 && targetTyping >= 1 && targetTyping <= 10;
    result.blockLinkTypingEvidence = JSON.stringify({ plainTyping, targetTyping });

    result.blockLinkNoPageErrors = pageErrors.length === 0;
    result.blockLinkPageErrors = JSON.stringify(pageErrors);
  } finally {
    await fresh.close();
  }
  return result;
}
