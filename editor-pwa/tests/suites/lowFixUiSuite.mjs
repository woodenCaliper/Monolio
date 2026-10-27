// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 小さな不具合の直し(v213): 目次ブロックの追随・狭い画面の検索バー・別ページの見出しへのリンクで開く・本文の無いページ ----
// 1) エディタの目次ブロックは描き直し(render)のときにしか作られず、見出しを打ち替えても古い文字のまま、
//    "## " で作った見出しは "Untitled heading" のままだった。見出しの `コード`・$$数式$$ も素の印のまま出ていた
//    (保存HTMLの目次は renderInlineMarkdown で描く。P7)。
// 2) 360px の画面で検索バー(Ctrl+H)の閉じる(×)・すべて置換が画面の外へはみ出していた。
// 3) 複数ページの保存HTMLを 2ページ目の見出しへの #リンク(…#block-h2)で開くと、1ページ目が出て見出しが見えなかった。
// 4) blocks: [] のページ(手書き・古いファイル)は、打てるブロックが無く編集できなかった。
export default async function lowFixUiSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1200, height: 800 });
  const result = {};
  const open = async (literal, name, expectedBlocks) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((count) => document.querySelectorAll("#blocks .block").length === count, expectedBlocks, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(250);
  };
  const save = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(OUT, name);
    await (await download).saveAs(path);
    return path;
  };
  const tocTexts = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="toc"] .toc-item')].map((item) => item.textContent));
  const savedTocTexts = async (path) => fresh.evaluate((text) => [...new DOMParser().parseFromString(text, "text/html")
    .querySelectorAll("main nav.toc a")].map((a) => a.textContent), await readFile(path, "utf8"));
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1a) 見出しを打ち替えると、同じページの目次ブロックが追随する。打っている見出しのキャレットは動かない
    //     (続けて打った文字が見出しの末尾に続く)。
    await open({ title: "T", fonts: [], attachments: [], pages: [{ id: "TOC1", title: "目次", blocks: [
      { id: "toc", type: "toc", text: "" },
      { id: "h2", type: "heading2", text: "概要" },
      { id: "p", type: "paragraph", text: "body" },
    ] }] }, "low-fix-toc.html", 3);
    await fresh.locator('#blocks .block-content[data-id="h2"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("と目的");
    await fresh.waitForTimeout(150);
    const whileTyping = await tocTexts();
    await fresh.keyboard.type("X");
    const headingText = await fresh.locator('#blocks .block-content[data-id="h2"]').textContent();
    await fresh.keyboard.press("Backspace");
    await fresh.locator('#blocks .block-content[data-id="p"]').click();
    await fresh.waitForTimeout(200);
    const afterLeave = await tocTexts();
    result.tocFollowsHeadingEdit = whileTyping.join("|") === "概要と目的" && afterLeave.join("|") === "概要と目的"
      && headingText === "概要と目的X";
    // 1b) "## " で作った見出しも、打った文字で目次に載る("Untitled heading" のままにならない)。
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("## 新しい見出し");
    await fresh.locator('#blocks .block-content[data-id="p"]').click();
    await fresh.waitForTimeout(200);
    const afterNewHeading = await tocTexts();
    result.tocFollowsNewHeading = afterNewHeading.join("|") === "概要と目的|新しい見出し";
    const savedToc = await savedTocTexts(await save("low-fix-toc-saved.html"));
    result.tocMatchesSavedAfterEdit = savedToc.join("|") === afterNewHeading.join("|");

    // 1c) 見出しの `コード` と $$数式$$ は、保存HTMLの目次と同じく描く(素の印を出さない)。文字との間の空白も残る。
    await open({ title: "T", fonts: [], attachments: [], pages: [{ id: "TOC2", title: "目次2", blocks: [
      { id: "toc", type: "toc", text: "" },
      { id: "h1", type: "heading1", text: "Use `foo` and $$x^2$$ end" },
      { id: "p", type: "paragraph", text: "body" },
    ] }] }, "low-fix-toc-inline.html", 3);
    // 「Use」の右端と、続くコードの左端の間が空いているか(空白が消えていないか)。
    const gapProbe = (root) => {
      const link = root.querySelector(".toc-item, nav.toc a");
      const code = link?.querySelector("code.inline-code");
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode();
      if (!code || !first) return null;
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(first, 3);
      return {
        gap: code.getBoundingClientRect().left - range.getBoundingClientRect().right,
        math: !!link.querySelector(".inline-math math"),
        code: code.textContent,
        text: link.textContent,
      };
    };
    const editorInline = await fresh.evaluate(`(${gapProbe})(document.querySelector('#blocks .block[data-id="toc"]'))`);
    const inlineSaved = await save("low-fix-toc-inline-saved.html");
    const viewer = await context.newPage();
    try {
      await viewer.goto(pathToFileURL(inlineSaved).href, { waitUntil: "load" });
      await viewer.waitForTimeout(200);
      const savedInline = await viewer.evaluate(`(${gapProbe})(document.querySelector("main nav.toc"))`);
      result.tocRendersInlineCodeAndMath = !!editorInline && editorInline.code === "foo" && editorInline.math
        && !editorInline.text.includes("`") && !editorInline.text.includes("$$")
        && !!savedInline && editorInline.text === savedInline.text;
      result.tocKeepsSpaceBeforeInlineCode = !!editorInline && editorInline.gap > 1 && !!savedInline && savedInline.gap > 1;
      result.tocInlineEvidence = { editorInline, savedInline };
    } finally {
      await viewer.close();
    }

    // 3) 2ページ目の見出しへの #リンクで保存HTMLを開くと、そのページが出て見出しが見える。
    // 4) blocks: [] のページは、開いたときに空の段落が1つ入り、そのまま打てる。
    await open({ title: "A", fonts: [], attachments: [], pages: [
      { id: "P1", title: "A", blocks: [
        { id: "a1", type: "paragraph", text: "one" },
        { id: "l2", type: "page", text: "", pageId: "P2" },
        { id: "l3", type: "page", text: "", pageId: "P3" },
      ] },
      { id: "P2", title: "B", blocks: [
        ...Array.from({ length: 30 }, (_, index) => ({ id: "b" + index, type: "paragraph", text: "two " + index })),
        { id: "h2", type: "heading1", text: "見出しB" },
      ] },
      { id: "P3", title: "C", blocks: [] },
    ] }, "low-fix-pages.html", 3);
    const pagesSaved = await save("low-fix-pages-saved.html");
    const deep = await context.newPage();
    try {
      await deep.setViewportSize({ width: 1200, height: 700 });
      await deep.goto(pathToFileURL(pagesSaved).href + "#block-h2", { waitUntil: "load" });
      await deep.waitForTimeout(300);
      const state = await deep.evaluate(() => {
        const heading = document.querySelector("#block-h2");
        const box = heading?.getBoundingClientRect();
        return {
          current: document.querySelector("section.doc-page.is-current")?.id || "",
          inView: !!box && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight,
          scrollY: Math.round(scrollY),
        };
      });
      result.deepLinkOpensOwningPage = state.current === "page-P2" && state.inView;
      result.deepLinkEvidence = state;
    } finally {
      await deep.close();
    }
    await fresh.locator('#page-tree-body button.page-tree-item[data-page-id="P3"]').click();
    await fresh.waitForTimeout(300);
    const emptyPageBlocks = await fresh.locator("#blocks .block-content[contenteditable='true']").count();
    // 打てるブロックが無いと click が待ちきりになるので、あるときだけ打つ(無ければ下の判定が false になる)。
    if (emptyPageBlocks) {
      await fresh.locator("#blocks .block-content").first().click();
      await fresh.keyboard.type("typed");
      await fresh.waitForTimeout(100);
    }
    const typed = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((el) => el.textContent).join("|"));
    result.emptyPageGetsEditableParagraph = emptyPageBlocks === 1 && typed === "typed";
    result.emptyPageEvidence = { emptyPageBlocks, typed };

    // 2) 360px の画面で、検索バー(置換の行も)の部品が画面の中に収まり、横スクロールも出ない。
    await fresh.setViewportSize({ width: 360, height: 800 });
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.press("Control+h");
    await fresh.waitForTimeout(200);
    const narrow = await fresh.evaluate(() => {
      const bar = document.querySelector("#search-bar");
      const outside = [bar, ...bar.querySelectorAll("*")].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.left < -0.5 || box.right > innerWidth + 0.5);
      }).map((el) => (el.id || String(el.className?.baseVal ?? el.className)) + ":" + Math.round(el.getBoundingClientRect().right));
      const close = document.querySelector("#search-close").getBoundingClientRect();
      const hit = document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2);
      return {
        open: !bar.hidden && !document.querySelector("#search-replace-row").hidden,
        outside,
        closeClickable: !!hit?.closest("#search-close"),
        pageScroll: document.documentElement.scrollWidth - innerWidth,
        mainScroll: document.querySelector("main.main").scrollWidth - innerWidth,
      };
    });
    result.searchBarFitsAt360 = narrow.open && narrow.outside.length === 0 && narrow.closeClickable
      && narrow.pageScroll <= 0 && narrow.mainScroll <= 0;
    result.searchBarEvidence = narrow;
  } finally {
    await fresh.close();
  }
  return result;
}
