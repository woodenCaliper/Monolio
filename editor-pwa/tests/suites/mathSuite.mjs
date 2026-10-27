// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, PORT, dragBlock, insertBlock } from "../lib.mjs";

// ---- TeX数式(ブロック数式 + インライン数式) ----
// 文書全体の状態に依存しないよう、新しいページで検証する。
export default async function mathSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    const caretAtEndOf = async (needle) => {
      await fresh.evaluate((text) => {
        const el = [...document.querySelectorAll("#blocks .block-content")]
          .find((item) => item.isContentEditable && item.textContent.includes(text));
        if (!el) return;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }, needle);
      await fresh.waitForTimeout(120);
    };

    // /math で数式ブロックを作れる。ソース欄とプレビューが揃う。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("/math");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    // 右下のバージョン表示は service-worker.js の版数と一致する(実体は1箇所)。
    result.versionBadgeMatchesServiceWorker = await fresh.evaluate(async () => {
      const badge = document.querySelector("#version-badge");
      const source = await (await fetch("./service-worker.js", { cache: "no-store" })).text();
      const matched = /doc-editor-pwa-v(\d+)/.exec(source);
      return Boolean(badge) && Boolean(matched)
        && badge.textContent === "v" + window.SingleHtmlFormat.APP_VERSION + " · build " + matched[1]
        && getComputedStyle(badge).display !== "none";
    });

    result.mathBlockCreatedBySlash = await fresh.evaluate(() => (
      Boolean(document.querySelector("#blocks .block.type-math"))
      && Boolean(document.querySelector("#blocks .block.type-math .math-canvas"))
    ));

    // 空の数式ブロックのプレースホルダは横書き1行で本文列の幅を使う。
    // grid-column 指定漏れで 40px のガター列に落ち、1文字ずつ縦に並んだ実バグ。
    // 属性ではなく getBoundingClientRect の算出値で確かめる。
    result.mathPlaceholderIsHorizontal = await fresh.evaluate(() => {
      const canvas = document.querySelector("#blocks .block.type-math .math-canvas");
      const placeholder = canvas?.querySelector(".math-placeholder");
      if (!canvas || !placeholder) return false;
      const c = canvas.getBoundingClientRect();
      const p = placeholder.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(placeholder).lineHeight) || 20;
      return c.width > 200 && p.width > 100 && p.height < lineHeight * 1.5;
    });

    // TeX を打つとプレビューが MathML(ネイティブ描画)になる。
    await fresh.keyboard.type("\\frac{a+b}{2}");
    await fresh.waitForTimeout(250);
    result.mathBlockRendersMathML = await fresh.evaluate(() => {
      const canvas = document.querySelector("#blocks .block.type-math .math-canvas");
      return Boolean(canvas?.querySelector("math mfrac"));
    });

    // フォーカスが外れるとソースは畳まれ、描画結果だけが残る。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    result.mathBlockSourceCollapsesOnBlur = await fresh.evaluate(() => {
      const content = document.querySelector("#blocks .block.type-math .block-content");
      if (!content) return false;
      const style = getComputedStyle(content);
      return style.opacity === "0" && style.width === "1px"
        && Boolean(document.querySelector("#blocks .block.type-math .math-canvas math"))
        && content.textContent === "\\frac{a+b}{2}";
    });

    // Enter 改行テスト用のブロック数式は /math で作る($$ 変換の廃止に伴う変更)。
    await insertBlock(fresh);
    await fresh.keyboard.type("/math");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);

    // 数式ブロックの Enter は改行(コードブロックと同じ)。ブロックは増えない。
    await fresh.keyboard.type("x");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("y");
    await fresh.waitForTimeout(200);
    result.mathBlockEnterInsertsNewline = await fresh.evaluate(() => {
      const blocks = document.querySelectorAll("#blocks .block.type-math");
      const contents = [...document.querySelectorAll("#blocks .block.type-math .block-content")];
      return blocks.length === 2 && contents.some((content) => content.textContent.includes("x\ny"));
    });

    // 変換できない TeX はソースをそのまま(エラー表示)で見せ、データを壊さない。
    await fresh.evaluate(() => {
      const content = [...document.querySelectorAll("#blocks .block.type-math .block-content")]
        .find((item) => item.textContent.includes("x\ny"));
      if (!content) return;
      content.focus();
      content.textContent = "\\unknown{x";
      content.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    await fresh.waitForTimeout(250);
    result.mathBlockInvalidShowsSource = await fresh.evaluate(() => {
      const target = [...document.querySelectorAll("#blocks .block.type-math .block-content")]
        .find((item) => item.textContent === "\\unknown{x");
      const canvas = target?.closest(".block")?.querySelector(".math-canvas");
      return canvas?.querySelector(".math-error")?.textContent === "\\unknown{x"
        && !canvas.querySelector("math");
    });

    // ---- インライン数式(チップ方式) ----
    // モデルも編集中のDOMも素の文字列で、キャレット(選択)が触れていない
    // well-formed な範囲だけがウィジェット(MathML)表示になる。

    // 閉じの $$ を打っている間(キャレットが触れている間)は素のテキストのまま。
    await caretAtEndOf("ここに本文");
    await fresh.keyboard.type(" あ$$E=mc^2$$");
    await fresh.waitForTimeout(200);
    const touchingStaysText = await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("E=mc^2"));
      return Boolean(editable) && editable.textContent.includes("$$E=mc^2$$")
        && !editable.querySelector(".inline-math");
    });
    // キャレットが範囲から離れた瞬間にウィジェット(MathML)へ。
    await fresh.keyboard.type("え");
    await fresh.waitForTimeout(200);
    result.inlineMathConvertsOnClosingDollars = touchingStaysText && await fresh.evaluate(() => {
      const span = document.querySelector("#blocks .inline-math");
      return Boolean(span) && span.dataset.tex === "E=mc^2"
        && Boolean(span.querySelector("math"))
        && span.contentEditable === "false";
    });

    // 進入後のキャレット位置を「ソース先頭からのオフセット」で読む。
    const mathSourceState = () => fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("E=mc^2"));
      const selection = getSelection();
      if (!editable || !selection?.rangeCount || !editable.contains(selection.anchorNode)) return null;
      const prefix = document.createRange();
      prefix.selectNodeContents(editable);
      prefix.setEnd(selection.anchorNode, selection.anchorOffset);
      const sourceStart = editable.textContent.indexOf("$$");
      return {
        offset: sourceStart < 0 ? null : prefix.toString().length - sourceStart,
        plain: !editable.querySelector(".inline-math"),
        text: editable.textContent,
      };
    });

    // ← でウィジェットへ入ると素のテキストへ戻り、1手ぶん進んだ位置に立つ。
    // "$$E=mc^2$$"(10文字)へ右から入ると 9 = 閉じ $$ の間。以後は1手1位置。
    await fresh.keyboard.press("ArrowLeft");
    await fresh.keyboard.press("ArrowLeft");
    await fresh.waitForTimeout(150);
    const entered = await mathSourceState();
    result.inlineMathArrowEntersSourceEnd = entered?.plain === true && entered?.offset === 9
      && entered?.text.includes("$$E=mc^2$$");

    // 中は普通のテキスト編集。2 の右(閉じ $$ の手前)へ動いて追記できる。
    await fresh.keyboard.press("ArrowLeft");
    await fresh.keyboard.type("+1");
    await fresh.waitForTimeout(150);
    result.inlineMathSourceEditsInPlace = await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("E=mc^2"));
      return Boolean(editable) && editable.textContent.includes("$$E=mc^2+1$$") && !editable.querySelector(".inline-math");
    });

    // 外へ出ると、いまのソースで描画し直したウィジェットに戻る。
    for (let i = 0; i < 3; i += 1) await fresh.keyboard.press("ArrowRight");
    await fresh.waitForTimeout(250);
    result.inlineMathExitRerenders = await fresh.evaluate(() => {
      const span = [...document.querySelectorAll("#blocks .inline-math")]
        .find((item) => item.dataset.tex === "E=mc^2+1");
      return Boolean(span) && Boolean(span.querySelector("math"));
    });

    // 直後からの Backspace は普通のテキストとして閉じ $ を1文字消す
    // (構文が壊れて素のテキストへ戻る。旧「中に入るだけ」仕様から変更)。
    await fresh.keyboard.press("ArrowLeft");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(200);
    result.inlineMathBackspaceDeletesDelimiter = await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("E=mc^2"));
      return Boolean(editable) && editable.textContent.includes("$$E=mc^2+1$え")
        && !editable.textContent.includes("$$E=mc^2+1$$")
        && !editable.querySelector(".inline-math");
    });

    // 中では Backspace で1文字ずつ消せる(普通のテキスト)。
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(150);
    result.inlineMathBackspaceDeletesOneChar = await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("E=mc^2"));
      return Boolean(editable) && editable.textContent.includes("$$E=mc^2+1え");
    });

    // 壊れた構文は、キャレットが離れてもテキストのまま(非破壊)。
    await fresh.keyboard.press("Home");
    await fresh.waitForTimeout(250);
    result.inlineMathBrokenDelimiterFallsBackToText = await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("E=mc^2"));
      return Boolean(editable) && editable.textContent.includes("$$E=mc^2+1え") && !editable.querySelector(".inline-math");
    });

    // Undo は普通のテキスト編集として戻る(消した $$ が戻り、離れていれば描画)。
    // 注意: ウィジェット表示中は MathML の textContent に "^" が無いので、
    // ブロック探しは "E=mc" で行い、状態はソース文字列か data-tex で判定する。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.inlineMathUnwrapUndoRestores = await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("E=mc"));
      return Boolean(editable) && (editable.textContent.includes("$$E=mc^2+1$$")
        || [...document.querySelectorAll("#blocks .inline-math")].some((s) => s.dataset.tex === "E=mc^2+1"));
    });

    // Ctrl+Shift+E: 選択を $$…$$ の素テキストで括り、キャレットは閉じの内側に残る。
    await insertBlock(fresh);
    await fresh.keyboard.type("y+1");
    await fresh.evaluate(() => {
      const el = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.isContentEditable && item.textContent === "y+1");
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Control+Shift+e");
    await fresh.waitForTimeout(200);
    const wrappedAsText = await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("$$y+1$$"));
      const selection = getSelection();
      return Boolean(editable) && !editable.querySelector(".inline-math")
        && editable.contains(selection.anchorNode);
    });
    // 外をクリックすると描画へ。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    result.inlineMathCtrlShiftEWrapsSelection = wrappedAsText && await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .inline-math")]
        .some((span) => span.dataset.tex === "y+1" && span.querySelector("math"))
    ));

    // 選択からの数式化は Undo 1手で元のテキストへ。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.inlineMathSelectionUndoRestores = await fresh.evaluate(() => {
      const el = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.isContentEditable && item.textContent === "y+1");
      return Boolean(el) && !el.querySelector(".inline-math");
    });

    // ツールバーの √x(選択なし)は "$$$$" を挿入して閉じの内側にキャレット。
    // 書いて外に出ると描画される。
    await insertBlock(fresh);
    await fresh.keyboard.type("zpoint");
    await caretAtEndOf("zpoint");
    await fresh.locator("#format-math").click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("\\alpha");
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    result.inlineMathToolbarInsertsNew = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .inline-math")]
        .some((span) => span.dataset.tex === "\\alpha" && span.querySelector("math"))
    ));

    // 検索は TeX ソース(モデルの素の文字列)に当たる。
    await fresh.keyboard.press("Control+f");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.type("mc^2+1$$");
    await fresh.waitForTimeout(250);
    const searchHits = await fresh.evaluate(() => document.querySelector("#search-count").textContent);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    result.searchFindsMathSource = searchHits === "1/1";

    // 保存HTML: MathML が焼き込まれ、TeX ソースも残り、UI の痕跡は混ざらない。
    // 開き直し(parsePortableHtml)で TeX ソースがそのまま戻る(ラウンドトリップ)。
    const savePromise = fresh.waitForEvent("download", { timeout: 8000 });
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("Control+S");
    const saved = await savePromise;
    const savedPath = join(DOWNLOADS, "math-probe.html");
    await saved.saveAs(savedPath);
    const savedHtml = await readFile(savedPath, "utf8");
    const parsedOk = await fresh.evaluate((html) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(html);
      const mathBlock = parsed.pages.flatMap((page) => page.blocks || []).find((block) => block.type === "math" && block.text === "\\frac{a+b}{2}");
      const paragraph = parsed.pages.flatMap((page) => page.blocks || []).find((block) => (block.text || "").includes("$$E=mc^2+1$$"));
      return Boolean(mathBlock) && Boolean(paragraph);
    }, savedHtml);
    const viewer = await context.newPage();
    let viewerOk = false;
    try {
      await viewer.goto("file:///" + savedPath.replaceAll("\\", "/"), { waitUntil: "domcontentloaded" });
      viewerOk = await viewer.evaluate(() => (
        Boolean(document.querySelector(".doc-math math mfrac"))
        && Boolean(document.querySelector("span.inline-math math"))
      ));
    } finally {
      await viewer.close();
    }
    result.exportedMathRoundtrip = savedHtml.includes('class="doc-math"')
      && savedHtml.includes("<math")
      && savedHtml.includes('data-tex="E=mc^2+1"')
      && !savedHtml.includes("version-badge")
      && !savedHtml.includes("math-popover")
      && !savedHtml.includes("math-canvas")
      && parsedOk
      && viewerOk;

    // 仕様: 空の段落で "$$" と打ってもブロック数式には変換されず、ただの文字として残る。
    const mathBlockCountBefore = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .block.type-math").length
    ));
    await insertBlock(fresh);
    await fresh.keyboard.type("$$");
    await fresh.waitForTimeout(250);
    result.emptyParagraphDollarsStayText = await fresh.evaluate((countBefore) => {
      const paragraph = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.isContentEditable && item.textContent.replaceAll("​", "") === "$$");
      return document.querySelectorAll("#blocks .block.type-math").length === countBefore
        && Boolean(paragraph);
    }, mathBlockCountBefore);

    // そのまま閉じれば、行頭でも(前に文字がなくても)キャレットが離れた時点で
    // インライン数式になる。
    await fresh.keyboard.type("abc$$");
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(250);
    result.inlineMathConvertsAtLineStart = await fresh.evaluate(() => {
      const span = [...document.querySelectorAll("#blocks .inline-math")]
        .find((item) => item.dataset.tex === "abc");
      return Boolean(span) && Boolean(span.querySelector("math"));
    });

    // 回帰ガード: ソース内の全キャレット位置(先頭・末尾含む)に方向キーで立てて、
    // 1手1位置で動き、端でも文字を挿入できる。
    const sourceWalkState = (marker) => fresh.evaluate((m) => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes(m));
      const selection = getSelection();
      if (!editable || !selection?.rangeCount || !editable.contains(selection.anchorNode)) return null;
      const widget = editable.querySelector(".inline-math, code.inline-code");
      if (widget) return { plain: false, offset: null, text: editable.textContent };
      const sourceStart = editable.textContent.search(/[`$]/);
      const prefix = document.createRange();
      prefix.selectNodeContents(editable);
      prefix.setEnd(selection.anchorNode, selection.anchorOffset);
      return { plain: true, offset: prefix.toString().length - sourceStart, text: editable.textContent };
    }, marker);

    await insertBlock(fresh);
    await fresh.keyboard.type("前$$pq$$後");
    await fresh.waitForTimeout(250);
    // 後ろから ← で進入し、先頭(0)まで1手ずつ。"$$pq$$" は6文字。
    const mathLeftWalk = [];
    for (let i = 0; i < 7; i += 1) {
      await fresh.keyboard.press("ArrowLeft");
      await fresh.waitForTimeout(90);
      mathLeftWalk.push((await sourceWalkState("前"))?.offset ?? null);
    }
    // 先頭(0)で文字を打てる(旧ジャンプ実装では不可能だった操作)。
    await fresh.keyboard.type("W");
    await fresh.waitForTimeout(150);
    const mathEdgeInsert = (await sourceWalkState("前"))?.text.includes("前W$$pq$$後");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(150);
    // 右方向も1手1位置で、末尾(6)の次の1手で外に出てウィジェットへ戻る。
    const mathRightWalk = [];
    for (let i = 0; i < 7; i += 1) {
      await fresh.keyboard.press("ArrowRight");
      await fresh.waitForTimeout(90);
      const state = await sourceWalkState("前");
      mathRightWalk.push(state?.plain ? state.offset : "widget");
    }
    result.inlineMathCaretReachesBothEnds = JSON.stringify(mathLeftWalk.slice(1)) === JSON.stringify([5, 4, 3, 2, 1, 0])
      && mathEdgeInsert === true
      && JSON.stringify(mathRightWalk) === JSON.stringify([1, 2, 3, 4, 5, 6, "widget"])
      && await fresh.evaluate(() => (
        [...document.querySelectorAll("#blocks .inline-math")].some((s) => s.dataset.tex === "pq")
      ));

    // インラインコードの同じ確かめは core.mjs(inlineCodeLeftMovesOncePerPosition・inlineCodeRightMovesOncePerPosition・
    // inlineCodeArrowRightMovesOutside と、ソースの外の先頭に打てることの確かめ)。

    // 不変条件: 編集状態(素テキスト)のインライン範囲は、同じ文字列を
    // textContent 直代入したプレーン参照と全キャレット位置の字送りが一致する。
    // 一致するなら「キャレットが文字に被る」類の視覚バグは原理的に起きない。
    await insertBlock(fresh);
    await fresh.keyboard.type("こ`日本語コード`ん と $$\\alpha+1$$ 続");
    await fresh.waitForTimeout(300);
    const metricsMatch = async (needle) => {
      const revealed = await fresh.evaluate((n) => {
        const chip = [...document.querySelectorAll("#blocks .inline-math, #blocks code.inline-code")]
          .find((item) => ((item.dataset.tex ?? item.dataset.code) || "").includes(n));
        if (!chip) return false;
        chip.closest(".block-content").focus();
        const rect = chip.getBoundingClientRect();
        chip.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }));
        return true;
      }, needle);
      if (!revealed) return false;
      await fresh.waitForTimeout(200);
      return fresh.evaluate((n) => {
        const editable = [...document.querySelectorAll("#blocks .block-content")]
          .find((item) => [...item.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.includes(n)));
        if (!editable) return false;
        const target = [...editable.childNodes].find((c) => c.nodeType === 3 && c.nodeValue.includes(n));
        if (!target) return false;
        const clone = editable.cloneNode(false);
        clone.removeAttribute("data-id");
        clone.style.gridColumn = "2"; // .block の 40px ガター列に落とさない
        clone.textContent = target.nodeValue;
        editable.parentElement.insertBefore(clone, editable.nextSibling);
        const measure = (node) => {
          const xs = [];
          for (let off = 0; off <= node.nodeValue.length; off += 1) {
            const range = document.createRange();
            range.setStart(node, off);
            range.collapse(true);
            xs.push(range.getBoundingClientRect().x);
          }
          return xs;
        };
        const real = measure(target);
        const ref = measure(clone.firstChild);
        clone.remove();
        if (real.length !== ref.length) return false;
        return real.every((x, i) => i === 0
          || (x >= real[i - 1] - 0.5
            && Math.abs((x - real[i - 1]) - (ref[i] - ref[i - 1])) < 0.5));
      }, needle);
    };
    const mathMetricsOk = await metricsMatch("alpha");
    const codeMetricsOk = await metricsMatch("日本語コード");
    result.inlineSourceMatchesPlainTextMetrics = mathMetricsOk && codeMetricsOk;

    // 見せ替え(ウィジェット⇔素テキスト)は表示の状態遷移であって編集ではない:
    // ←→で出入りしただけでは Undo 履歴も dirty(ステータス表示)も動かない。
    await insertBlock(fresh);
    await fresh.keyboard.type("あ$$pq2$$いう");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("Backspace"); // う を消す(独立した削除履歴が1つ積まれる)
    await fresh.waitForTimeout(200);
    // markDirty が呼ばれるとステータスが "Edited" に書き換わるので、番兵を置いて検出する。
    await fresh.evaluate(() => {
      const status = document.querySelector("#status");
      if (status) status.textContent = "PROBE";
    });
    // 出入りを2往復(←←で進入して先頭方向へ、→→→で退出)
    for (let i = 0; i < 2; i += 1) {
      await fresh.keyboard.press("ArrowLeft");
      await fresh.keyboard.press("ArrowLeft");
      await fresh.keyboard.press("ArrowLeft");
      await fresh.keyboard.press("ArrowRight");
      await fresh.keyboard.press("ArrowRight");
      await fresh.keyboard.press("ArrowRight");
      await fresh.waitForTimeout(150);
    }
    const statusUntouched = await fresh.evaluate(() => (
      document.querySelector("#status")?.textContent === "PROBE"
    ));
    // Undo 1手で「う の削除」が戻る = 出入りは履歴に積まれていない。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.inlineChipTransitionsKeepHistoryClean = statusUntouched && await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent.includes("pq2"));
      return Boolean(editable) && editable.textContent.includes("いう")
        && (editable.textContent.includes("$$pq2$$")
          || Boolean(editable.querySelector('[data-tex="pq2"]')));
    });

    // 回帰(New-21): 旧構造(v102以前、data-tex なしで .inline-math-value にソース)の
    // block.html を含む文書をエクスポートしても、数式は MathML+data-tex で焼き込まれる。
    // 「コードは生きて数式だけ空($$$$)になる」非対称が再発しないよう両方を検証する。
    result.legacyInlineHtmlExportsMath = await fresh.evaluate(() => {
      const legacyHtml = "旧 "
        + '<span class="inline-math"><span class="inline-math-delimiter" data-side="start">$$</span>'
        + '<span class="inline-math-value">​y^2​</span>'
        + '<span class="inline-math-delimiter" data-side="end">$$</span>'
        + '<span class="inline-math-view" contenteditable="false"><math><mi>y</mi></math></span></span>'
        + ' と <code class="inline-code"><span class="inline-code-delimiter" data-side="start">`</span>'
        + '<span class="inline-code-value">​old​</span>'
        + '<span class="inline-code-delimiter" data-side="end">`</span></code> 後';
      const html = window.SingleHtmlFormat.buildPortableHtml({
        title: "legacy-fixture",
        blocks: [{ id: "L1", type: "paragraph", text: "旧 $$y^2$$ と `old` 後", html: legacyHtml }],
        attachments: [],
      }, {});
      return html.includes('data-tex="y^2"')
        && /<span class="inline-math"[^>]*>\s*<math/.test(html)
        && html.includes('<code class="inline-code">old</code>')
        && !html.includes('data-tex=""')
        && !html.includes("$$$$");
    });

    // 回帰(New-22): ブロック数式のソースをクリックしたら、クリックした文字位置に
    // キャレットが立つ(クリック時の静的選択モードで :focus-within が外れ、ソースが
    // 1px に畳まれて既定のキャレット配置がずれる実バグがあった)。
    await insertBlock(fresh);
    await fresh.keyboard.type("/math");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("\\nosuch klmnop");
    await fresh.waitForTimeout(250);
    const mathCaretAfterClickAt = async (index) => {
      const point = await fresh.evaluate((i) => {
        const content = [...document.querySelectorAll("#blocks .block.type-math .block-content")]
          .find((item) => item.textContent.includes("klmnop"));
        const text = content?.firstChild;
        if (!text || text.nodeType !== Node.TEXT_NODE || text.nodeValue.length <= i) return null;
        const range = document.createRange();
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) return null;
        return { x: rect.left + 1, y: rect.top + rect.height / 2 };
      }, index);
      if (!point) return null;
      await fresh.mouse.click(point.x, point.y);
      await fresh.waitForTimeout(150);
      return fresh.evaluate(() => {
        const content = [...document.querySelectorAll("#blocks .block.type-math .block-content")]
          .find((item) => item.textContent.includes("klmnop"));
        const selection = getSelection();
        if (!content || !selection?.rangeCount || !content.contains(selection.anchorNode)) return null;
        const prefix = document.createRange();
        prefix.selectNodeContents(content);
        prefix.setEnd(selection.anchorNode, selection.anchorOffset);
        return prefix.toString().length;
      });
    };
    result.mathBlockSourceClickPlacesCaret = (await mathCaretAfterClickAt(3)) === 3
      && (await mathCaretAfterClickAt(9)) === 9;

    // プレビュー(エラー表示=ソースがそのまま見える)クリックでも、クリックした
    // 文字位置から編集が始まる(末尾へ飛ばさない)。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(300);
    const canvasClickPoint = await fresh.evaluate(() => {
      const canvas = [...document.querySelectorAll("#blocks .block.type-math .math-canvas")]
        .find((item) => item.textContent.includes("klmnop"));
      const errorEl = canvas?.querySelector(".math-error");
      if (!errorEl?.firstChild) return null;
      const range = document.createRange();
      range.setStart(errorEl.firstChild, 5);
      range.setEnd(errorEl.firstChild, 6);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + 1, y: rect.top + rect.height / 2 };
    });
    if (canvasClickPoint) {
      await fresh.mouse.click(canvasClickPoint.x, canvasClickPoint.y);
      await fresh.waitForTimeout(200);
    }
    result.mathBlockCanvasClickEntersAtPosition = Boolean(canvasClickPoint) && await fresh.evaluate(() => {
      const content = [...document.querySelectorAll("#blocks .block.type-math .block-content")]
        .find((item) => item.textContent.includes("klmnop"));
      const selection = getSelection();
      if (!content || !selection?.rangeCount || !content.contains(selection.anchorNode)) return false;
      const prefix = document.createRange();
      prefix.selectNodeContents(content);
      prefix.setEnd(selection.anchorNode, selection.anchorOffset);
      return prefix.toString().length === 5;
    });

    // 数式の改行コマンド: トップレベルの \\ と \newline は行区切り(mtable・中央揃え)。
    // 行列内の \\ は従来どおり行区切りとして働き(非回帰)、末尾 \\ は無視、
    // 連続 \\ は空行、ソースの物理改行は LaTeX と同じく無視される。
    result.mathLineBreakCommands = await fresh.evaluate(() => {
      const f = window.SingleHtmlFormat.texToMathML;
      const rows = (s) => (f(s, true)?.match(/<mtr>/g) || []).length;
      const BS = "\\";
      const sep = BS + BS;
      const matrix = BS + "begin{pmatrix} a & b " + sep + " c & d " + BS + "end{pmatrix}";
      return rows("a+b " + sep + " c+d") === 2
        && (f("a+b " + sep + " c+d", true) || "").includes('columnalign="center"')
        && rows("a " + BS + "newline b") === 2
        && rows(matrix) === 2 && Boolean(f(matrix, true))
        && rows("a+b " + sep) === 0
        && rows("a " + sep + " " + sep + " b") === 3
        && rows("a +\n b") === 0 && Boolean(f("a +\n b", true));
    });

    // \underbrace・\overbrace(Issue #137。以前はエラーの表示になった)。式の下(上)に伸びる括弧を付け、_{…} / ^{…} の説明は
    // 括弧のさらに下(上)へ。Notion から変換した式(\frac や \text の入った説明)も描ける。括弧が中身の幅まで伸びるのは Chrome の MathML の働き
    // (mo の箱の幅には伸びた分が出ないので、ここでは測らない。見た目は PR で確かめた)。
    result.mathUnderOverBrace = await fresh.evaluate(() => {
      const f = window.SingleHtmlFormat.texToMathML;
      const BS = "\\";
      const under = f(BS + "underbrace{a+b}_{" + BS + "text{和}}", true) || "";
      const over = f(BS + "overbrace{a+b}^{n}", true) || "";
      const bare = f(BS + "underbrace{x}", false) || "";
      const notion = f(BS + "text{片道レイテンシ} " + BS + "approx " + BS + "underbrace{C_{" + BS + "text{fixed}}}_{" + BS + "text{CPU 側・サイズ非依存}} + "
        + BS + "underbrace{" + BS + "frac{" + BS + "text{payload}}{B_{" + BS + "text{copy}}}}_{" + BS + "text{コピー・サイズ比例}}", true);
      return /<munder><munder[^>]*><mrow>.*<\/mrow><mo[^>]*>⏟<\/mo><\/munder><mrow><mtext>和<\/mtext><\/mrow><\/munder>/.test(under)
        && /<mover><mover[^>]*><mrow>.*<\/mrow><mo[^>]*>⏞<\/mo><\/mover><mrow><mi>n<\/mi><\/mrow><\/mover>/.test(over)
        && bare.includes("⏟") && Boolean(notion) && (notion.match(/⏟/g) || []).length === 2;
    });

    // エディタ上でも \\ 入りのブロック数式が複数行で描画される。ソース中の
    // Enter(物理改行)は入力できるが、描画には影響しない(行は \\ の数で決まる)。
    // 保存HTMLにも同じ変換で焼き込まれる(共有関数)。
    await insertBlock(fresh);
    await fresh.keyboard.type("/math");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("p+q \\\\");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type(" r+s");
    await fresh.waitForTimeout(250);
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    result.mathBlockLineBreakRenders = await fresh.evaluate(() => {
      const canvas = [...document.querySelectorAll("#blocks .block.type-math .math-canvas")]
        .find((item) => item.querySelector("math") && item.closest(".block")
          ?.querySelector(".block-content")?.textContent.includes("p+q"));
      const rowCount = canvas ? canvas.querySelectorAll("mtr").length : 0;
      const exported = window.SingleHtmlFormat.buildPortableHtml({
        title: "mlb",
        blocks: [{ id: "M9", type: "math", text: "p+q \\\\\n r+s" }],
        attachments: [],
      }, {});
      return rowCount === 2 && !canvas.querySelector(".math-error")
        && (exported.match(/<mtr>/g) || []).length === 2
        && exported.includes('class="doc-math"');
    });

    // 回帰(New-23): クリック押下中の静的選択モード(#blocks が contenteditable+focus)で、
    // UA 既定のフォーカスリング(OSアクセント色の枠)がコンテナ全体に描かれない。
    // 属性ではなく computed outline で確かめる。
    const pressPoint = await fresh.evaluate(() => {
      const content = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.isContentEditable && item.textContent.length > 3);
      if (!content) return null;
      const rect = content.getBoundingClientRect();
      return { x: rect.left + 10, y: rect.top + rect.height / 2 };
    });
    let staticHostState = null;
    if (pressPoint) {
      await fresh.mouse.move(pressPoint.x, pressPoint.y);
      await fresh.mouse.down();
      await fresh.waitForTimeout(100);
      staticHostState = await fresh.evaluate(() => {
        const blocks = document.querySelector("#blocks");
        return {
          hosted: blocks.dataset.staticHost === "true",
          outline: getComputedStyle(blocks).outlineStyle,
        };
      });
      await fresh.mouse.up();
      await fresh.waitForTimeout(100);
    }
    result.staticHostShowsNoFocusRing = staticHostState?.hosted === true
      && staticHostState?.outline === "none";

    // トグルの三角マークは従来(継承15px・箱18×22)の約2倍(28px・箱30×30)。
    // 縦位置は1行目の中心(--first-line-center)に合っていること。算出値で確かめる。
    await insertBlock(fresh);
    await fresh.keyboard.type("/toggle");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("TgSize");
    await fresh.waitForTimeout(200);
    // ブロック移動は常に部分木ごと。子を動かすと孫がついてきて親は残り、
    // 根のインデントは移動先の階層に合わせ、子孫は相対差を維持する。
    await insertBlock(fresh);
    await fresh.keyboard.type("Zone9");
    await insertBlock(fresh);
    await fresh.keyboard.type("Parent9");
    await insertBlock(fresh);
    await fresh.keyboard.type("Child9");
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Tab");
    await insertBlock(fresh);
    await fresh.keyboard.type("Grand9");
    // insertBlock(+ボタン)は直前ブロックの indent を継承する(Child9=1 を継ぐ)ので
    // Tab は1回で indent 2 になる。
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(200);
    const subtreeLayout = () => fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block")]
        .map((row) => ({
          text: row.querySelector(".block-content")?.textContent ?? "",
          indent: Number(getComputedStyle(row).getPropertyValue("--indent") || 0),
        }))
        .filter((row) => /^(Zone9|Parent9|Child9|Grand9)$/.test(row.text))
    ));
    // セットアップの前提: Zone9(0) Parent9(0) Child9(1) Grand9(2)。
    const setupLayout = await subtreeLayout();
    const setupOk = JSON.stringify(setupLayout) === JSON.stringify([
      { text: "Zone9", indent: 0 },
      { text: "Parent9", indent: 0 },
      { text: "Child9", indent: 1 },
      { text: "Grand9", indent: 2 },
    ]);
    await dragBlock(fresh, "Child9", "Zone9", "after");
    await fresh.waitForTimeout(300);
    const movedLayout = await subtreeLayout();
    result.subtreeMoveChildCarriesGrandchild = setupOk
      && JSON.stringify(movedLayout) === JSON.stringify([
        { text: "Zone9", indent: 0 },
        { text: "Child9", indent: 0 },
        { text: "Grand9", indent: 1 },
        { text: "Parent9", indent: 0 },
      ]);
    // Undo 1手で移動全体(順序もインデントも)が戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undoneLayout = await subtreeLayout();
    result.subtreeMoveUndoRestores = JSON.stringify(undoneLayout) === JSON.stringify([
      { text: "Zone9", indent: 0 },
      { text: "Parent9", indent: 0 },
      { text: "Child9", indent: 1 },
      { text: "Grand9", indent: 2 },
    ]);

    // 折りたたんだトグルの移動で隠れた子もついてくることは bugFixSuite の dragMovesSubtreeTogether。

    // 保存HTMLでも、トグル三角と箇条書きドットがエディタと同じ約2倍サイズで描かれる
    // (ブラウザ既定マーカーを消し、自前で描く)。v174 から字形ではなく図形: 三角は mask の SVG(14px)、
    // 点は円(8px)。エディタと同じ大きさ。
    result.exportedMarkersMatchEditorSize = await (async () => {
      const markersHtml = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
        title: "markers",
        blocks: [
          { id: "TM1", type: "toggle", text: "TgExp", open: true },
          { id: "BM1", type: "bullet", text: "DotExp" },
        ],
        attachments: [],
      }, {}));
      const viewer2 = await context.newPage();
      try {
        await viewer2.setContent(markersHtml, { waitUntil: "domcontentloaded" });
        return await viewer2.evaluate(() => {
          const summary = document.querySelector("details.toggle > summary");
          const li = document.querySelector("ul > li");
          if (!summary || !li) return false;
          const caret = getComputedStyle(summary, "::before");
          const dot = getComputedStyle(li, "::before");
          const caretMask = caret.maskImage || caret.webkitMaskImage || "";
          return Number.parseFloat(caret.width) >= 12 && Number.parseFloat(caret.height) >= 12
            && caretMask.includes("data:image/svg+xml")
            && Number.parseFloat(dot.width) >= 7 && Number.parseFloat(dot.width) <= 10
            && dot.borderRadius === "50%"
            && getComputedStyle(summary).listStyleType === "none";
        });
      } finally {
        await viewer2.close();
      }
    })();

    // 箇条書きのドット(•)もトグル三角と同じ流儀で約2倍(28px)。
    // ドット中心の縦位置は1行目の中心、横位置は従来の中心(49px相当)を維持。
    await insertBlock(fresh);
    await fresh.keyboard.type("- DotSize9");
    await fresh.waitForTimeout(250);
    result.bulletMarkerIsDoubled = await fresh.evaluate(() => {
      const blockEl = [...document.querySelectorAll("#blocks .block.type-bullet")]
        .find((item) => item.textContent.includes("DotSize9"));
      // v174: 点は円(.bullet-dot)。以前の 28px の「•」と同じくらいの大きさ(7〜10px)。
      const marker = blockEl?.querySelector(".bullet-marker .bullet-dot");
      if (!marker) return false;
      const rect = marker.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const expectedY = blockEl.getBoundingClientRect().top
        + Number.parseFloat(getComputedStyle(blockEl).getPropertyValue("--first-line-center"));
      return rect.width >= 7 && rect.width <= 10 && rect.height === rect.width
        && Math.abs(centerY - expectedY) < 2;
    });

    // v109 の要求は「三角の見た目が小さい」→約2倍、という絵の話。ここでは箱の寸法では
    // なく、実際に描かれたグリフの大きさ(Range の実測)で見る。v124 で箱はガターの
    // ドラッグ用グリップと食い合わない 14px に縮めたが、絵は 28px のまま。
    // 箱が痩せすぎていないことは別途 rect で見る(高さは従来どおり 26px 以上)。
    result.toggleCaretIsDoubled = await fresh.evaluate(() => {
      const blockEl = [...document.querySelectorAll("#blocks .block.type-toggle")]
        .find((item) => item.textContent.includes("TgSize"));
      const caret = blockEl?.querySelector(".toggle-caret");
      if (!caret) return false;
      const rect = caret.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const expectedCenter = blockEl.getBoundingClientRect().top
        + Number.parseFloat(getComputedStyle(blockEl).getPropertyValue("--first-line-center"));
      // v174: 三角は図形(SVG)。絵(path)の大きさで見る。以前の 28px の ▸/▾ と同じくらい(11px 以上)。
      const shape = caret.querySelector("svg path")?.getBoundingClientRect();
      if (!shape) return false;
      return shape.width >= 11 && shape.height >= 11
        // 箱(当たり判定)は v125 でマーカーが本文カラムへ移り、ドラッグ用グリップと
        // 食い合わなくなったので、WCAG 2.2 Target Size の最小 24x24 CSS px へ戻した。
        && rect.width >= 24 && rect.height >= 24
        && Math.abs(center - expectedCenter) < 2;
    });

    return result;
  } finally {
    await fresh.close();
  }
}
