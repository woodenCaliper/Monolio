// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- アプリの不具合の直し(v213 の確認で見つかった3件) ----
// 1) 外から書式つきの1行を貼ると、段落・コードに見出し(h1)・30〜40px の赤い字・画像・リンクがそのまま見えるのに、保存される
//    ものは別(コードは文字だけ、段落は書式の一部だけで太字も落ちる)で、画像や見出しの大きさは保存・Undo/Redo・開き直しで
//    消えていた(1行の貼り付けをブラウザの既定に任せきりだった)。**貼った直後に見えるもの = 保存されるもの**にする:
//    書式を持てるブロックは保存と同じ規則(sanitizeInlineHtml)に揃え、コード・グラフ・Mermaid・数式は文字だけを入れる。
// 2) 検索バーの入力欄にフォーカスがあると、Ctrl+S / Ctrl+O / Ctrl+P が効かなかった(バーのキーの振り分けが全部のキーを
//    引き受けていた)。本文と同じく保存・開く・印刷になる。
// 3) ページの題名の変更が Undo の履歴に入らず、前の一手(別ページの本文の編集)の Undo でいっしょに巻き戻っていた。
//    題名の変更はそれだけで1手(続けて打った字は本文の入力と同じく1手にまとまる)。
export default async function appFix2Suite({ browser }) {
  // クリップボードへ書式つきの中身を置くため、読み書きを許した文脈で動かす(本物の Ctrl+V = ブラウザの既定の貼り付け)。
  const context = await browser.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    // 印刷は呼ばれたことだけを記録する(printSuite と同じ。見えない枠にも入るよう初期化スクリプトで)。
    window.print = () => {
      const host = window.top;
      host.__printCalls = (host.__printCalls || 0) + 1;
    };
  });
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  let saved = 0;
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    const openLiteral = async (pages, title) => {
      const literal = { title, fonts: [], attachments: [], pages };
      const source = join(OUT, "app-fix2-" + (opened += 1) + ".html");
      await writeFile(source, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(source);
      await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
      await fresh.waitForTimeout(400);
    };
    // 保存HTMLから読んだ文書モデル(ページごとの題名とブロック)
    const savedDoc = async () => {
      const download = fresh.waitForEvent("download");
      await fresh.keyboard.press("Control+s");
      const path = join(DOWNLOADS, "app-fix2-saved-" + (saved += 1) + ".html");
      await (await download).saveAs(path);
      const html = await readFile(path, "utf8");
      await fresh.waitForTimeout(150);
      return fresh.evaluate((text) => {
        const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
        const doc = parsed.document || parsed;
        return doc.pages.map((page) => ({
          title: page.title,
          blocks: page.blocks.map((block) => ({ id: block.id, type: block.type, text: block.text, html: block.html || "" })),
        }));
      }, html);
    };
    const setClipboard = (html, text) => fresh.evaluate(async ([h, t]) => {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([t], { type: "text/plain" }),
        "text/html": new Blob([h], { type: "text/html" }),
      })]);
    }, [html, text]);
    // 文字の中の位置へキャレットを置く(needle の終わり)
    const caretAfter = async (blockId, needle) => {
      await fresh.locator('#blocks .block-content[data-id="' + blockId + '"]').click();
      await fresh.evaluate(([id, text]) => {
        const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = node.nodeValue.indexOf(text);
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index + text.length);
          range.collapse(true);
          getSelection().removeAllRanges();
          getSelection().addRange(range);
          return;
        }
      }, [blockId, needle]);
    };
    const innerOf = (blockId) => fresh.evaluate((id) => document.querySelector('#blocks .block-content[data-id="' + id + '"]')?.innerHTML ?? null, blockId);
    const tagsOf = (blockId) => fresh.evaluate((id) => [...document.querySelector('#blocks .block-content[data-id="' + id + '"]').querySelectorAll("*")]
      .map((node) => node.nodeName.toLowerCase()), blockId);

    // 1) 書式つきの1行の貼り付け: 見えているもの = 保存されるもの(段落・見出しの中・コード)
    await openLiteral([{ id: "RP1", title: "PasteFix", blocks: [
      { id: "p1", type: "paragraph", text: "AAA BBB" },
      { id: "c1", type: "code", text: "let a = 1;" },
      { id: "p2", type: "paragraph", text: "para" },
      { id: "p3", type: "paragraph", text: "copy source words" },
      { id: "p4", type: "paragraph", text: "copy host" },
    ] }], "PasteFix");
    // 段落の途中へ: 見出し(赤 40px)・リンク・画像
    await caretAfter("p1", "AAA ");
    await setClipboard('<h1 style="color:red;font-size:40px">Title</h1><a href="https://x.example/">link</a><img src="data:image/png;base64,iVBORw0KGgo=">', "Title link");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    // 続けて打った字は貼った中身の直後(リンクの外)に入る
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(200);
    const p1Dom = await innerOf("p1");
    const p1Tags = await tagsOf("p1");
    // コードへ: 赤・太字・30px の字と画像
    await caretAfter("c1", "let a");
    await setClipboard('<span style="color:red;font-weight:bold;font-size:30px">REDCODE</span><img src="data:image/png;base64,iVBORw0KGgo=" alt="pic">', "REDCODE");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const c1Dom = await innerOf("c1");
    // 段落の末尾へ: 同じ中身(太字は保存の規則に無いので、見えている側にも残らない)
    await caretAfter("p2", "para");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const p2Dom = await innerOf("p2");
    const p2Tags = await tagsOf("p2");
    // エディタの中でコピーした文字(Chromium は計算済みの文字色・書体・大きさ・白い背景を付けてくる)を段落へ貼っても、
    // 書式は付かない(自分で sanitizeInlineHtml の結果を差し込む作りにすると、色や背景が付いてしまう)。
    await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="p3"]');
      editable.focus();
      const range = document.createRange();
      range.setStart(editable.firstChild, 5);
      range.setEnd(editable.firstChild, 12);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await caretAfter("p4", "copy host");
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    const p4Dom = await innerOf("p4");
    const afterPaste = (await savedDoc())[0].blocks;
    const savedOf = (id) => afterPaste.find((block) => block.id === id);
    result.richPasteParagraphShownEqualsSaved = p1Dom === savedOf("p1").html
      && !p1Tags.some((tag) => tag === "h1" || tag === "img")
      && savedOf("p1").text === "AAA TitlelinkXBBB";
    result.richPasteCaretAfterPastedOutsideLink = /<a href="https:\/\/x\.example\/">link<\/a>X/.test(p1Dom);
    result.richPasteCodeIsPlainText = c1Dom === "let aREDCODE = 1;" && savedOf("c1").text === "let aREDCODE = 1;";
    result.richPasteParagraphEndShownEqualsSaved = p2Dom === savedOf("p2").html && !p2Tags.includes("img")
      && savedOf("p2").text === "paraREDCODE";
    result.innerCopyPasteAddsNoFormatting = p4Dom === "copy hostsource " && savedOf("p4").html === "copy hostsource ";
    result.richPasteEvidence = { p1Dom, c1Dom, p2Dom, p4Dom, saved: afterPaste };
    // Undo → Redo で描き直しても、貼った直後と同じ
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(200);
    result.richPasteSurvivesUndoRedo = (await innerOf("p1")) === p1Dom && (await innerOf("c1")) === c1Dom && (await innerOf("p2")) === p2Dom;

    // 2) 検索バーの入力欄からも Ctrl+S(保存)・Ctrl+O(開く)・Ctrl+P(印刷)
    await fresh.locator('#blocks .block-content[data-id="p1"]').click();
    await fresh.keyboard.press("Control+f");
    await fresh.locator("#search-input").fill("AAA");
    const downloadFrom = async (focusSelector) => {
      await fresh.locator(focusSelector).focus();
      const download = fresh.waitForEvent("download", { timeout: 3000 }).then(() => true).catch(() => false);
      await fresh.keyboard.press("Control+s");
      return download;
    };
    result.searchInputCtrlSSaves = await downloadFrom("#search-input");
    await fresh.locator("#search-input").focus();
    const chooser = fresh.waitForEvent("filechooser", { timeout: 3000 }).then(() => true).catch(() => false);
    await fresh.keyboard.press("Control+o");
    result.searchInputCtrlOOpens = await chooser;
    await fresh.locator("#search-input").focus();
    await fresh.keyboard.press("Control+p");
    await fresh.waitForFunction(() => (window.__printCalls || 0) >= 1, null, { timeout: 5000 }).catch(() => {});
    result.searchInputCtrlPPrints = (await fresh.evaluate(() => window.__printCalls || 0)) === 1;
    await fresh.keyboard.press("Control+h");
    result.replaceInputCtrlSSaves = await downloadFrom("#search-replace-input");
    // 検索バーの Enter・Esc は今までどおりバーのもの
    await fresh.locator("#search-input").focus();
    await fresh.keyboard.press("Escape");
    result.searchBarEscapeStillCloses = await fresh.evaluate(() => document.querySelector("#search-bar").hidden);

    // 3) 題名の変更は Undo の1手(別ページの本文の編集といっしょに巻き戻らない)
    await openLiteral([
      { id: "TP1", title: "Home", blocks: [{ id: "h1", type: "paragraph", text: "home body" }, { id: "hl", type: "page", pageId: "TP2" }] },
      { id: "TP2", title: "Spec", blocks: [{ id: "s1", type: "paragraph", text: "spec body" }] },
    ], "Home");
    await fresh.locator('#blocks .block-content[data-id="h1"]').click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" EDIT");
    // 本文の入力のまとまり(1.5秒)を切る
    await fresh.waitForTimeout(1700);
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Spec" }).first().click();
    await fresh.waitForTimeout(300);
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.type(" v2");
    await fresh.waitForTimeout(200);
    const tree = () => fresh.evaluate(() => [...document.querySelectorAll("#page-tree-body .page-tree-item")].map((node) => node.textContent));
    const titleNow = () => fresh.evaluate(() => document.querySelector("#doc-title").textContent);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const afterFirstUndo = { title: await titleNow(), tree: await tree(), focusInTitle: await fresh.evaluate(() => document.activeElement?.id === "doc-title") };
    const firstUndoDoc = await savedDoc();
    // 2回目の Undo で Home の本文が戻る
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const secondUndoDoc = await savedDoc();
    // やり直しは逆の順に
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);
    const redoDoc = await savedDoc();
    result.titleUndoRevertsOnlyTitle = afterFirstUndo.title === "Spec"
      && JSON.stringify(afterFirstUndo.tree) === JSON.stringify(["Home", "Spec"])
      && JSON.stringify(firstUndoDoc.map((page) => page.title)) === JSON.stringify(["Home", "Spec"])
      && firstUndoDoc[0].blocks[0].text === "home body EDIT";
    result.titleUndoRestoresCaretToTitle = afterFirstUndo.focusInTitle;
    result.titleUndoThenBodyUndo = secondUndoDoc[0].blocks[0].text === "home body"
      && JSON.stringify(secondUndoDoc.map((page) => page.title)) === JSON.stringify(["Home", "Spec"]);
    result.titleRedoRestoresBoth = redoDoc[0].blocks[0].text === "home body EDIT"
      && JSON.stringify(redoDoc.map((page) => page.title)) === JSON.stringify(["Home", "Spec v2"]);
    result.titleUndoEvidence = { afterFirstUndo, firstUndoDoc, secondUndoDoc, redoDoc };
  } finally {
    await fresh.close();
    await context.close();
  }
  return result;
}
