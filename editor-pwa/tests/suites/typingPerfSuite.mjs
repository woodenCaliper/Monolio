// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 大きな文書での打鍵の速さ(v221) ----
// 1) 本文の並び(#blocks)を grid から素のブロックの流れ(flow-root)へ。見た目(全要素の位置と大きさ)は grid のときと同じ。
//    1打鍵のレイアウトは1回だけ(以前は閉じたメニューの scrollTop・"Edited" の書き直し・書体名の書き直しで3回)。
// 2) 見出しの道筋は、見出しでない行への打鍵では計算し直さない(見出しへの打鍵・スクロールでは追随する)。
// 3) 見出しへの打鍵では、目次の全体でなくその見出しの項目だけを差し替える。
// 4) グラフのコードへの打鍵では、そのグラフだけを描き直す(ほかのグラフの絵はそのまま)。
// 5) すべて置換は、同じブロックの一致をまとめて当て、作業は画面と別の文書で行う(結果は1件ずつ置換したのと同じ・Undo 1手)。
// 速さの検査は緩い上限(修正後の実測の 3〜5 倍)。修正前の作りでは上限を超える(赤確認済み)。
export default async function typingPerfSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  await fresh.setViewportSize({ width: 1200, height: 800 });
  // フレームの処理(requestAnimationFrame のコールバック)と、本文への input の処理にかかった時間を数える。
  await fresh.addInitScript(() => {
    window.__perf = { raf: 0, input: 0 };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => raf((time) => {
      const t0 = performance.now();
      try {
        callback(time);
      } finally {
        window.__perf.raf += performance.now() - t0;
      }
    });
    let inputStart = 0;
    window.addEventListener("input", () => { inputStart = performance.now(); }, true);
    window.addEventListener("input", () => { window.__perf.input += performance.now() - inputStart; });
  });
  const cdp = await context.newCDPSession(fresh);
  await cdp.send("Performance.enable");
  const metric = async (name) => (await cdp.send("Performance.getMetrics")).metrics.find((item) => item.name === name)?.value ?? 0;
  const result = {};
  const evidence = {};
  const p = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const open = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    const lastId = literal.pages[0].blocks.at(-1).id;
    await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), lastId, { timeout: 30000 });
    await fresh.waitForTimeout(400);
  };
  const save = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(OUT, name);
    await (await download).saveAs(path);
    return fresh.evaluate((html) => window.SingleHtmlFormat.parsePortableHtml(html), await readFile(path, "utf8"));
  };
  // ブロックの中身の末尾にキャレットを置く(画面の真ん中に出す)。
  const caretAtEnd = async (id) => {
    await fresh.evaluate((blockId) => {
      const el = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
      el.scrollIntoView({ block: "center" });
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, id);
    await fresh.waitForTimeout(100);
  };
  // 1打鍵ずつ打って、フレームが描き終わるまで待つ。打鍵あたりの rAF・input の処理時間(ms)の中央値を返す。
  const frame = () => fresh.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  })));
  const typeTimed = async (keys) => {
    const raf = [];
    const input = [];
    for (const key of keys) {
      await fresh.evaluate(() => { window.__perf = { raf: 0, input: 0 }; });
      await fresh.keyboard.press(key);
      await frame();
      await fresh.waitForTimeout(30);
      const perf = await fresh.evaluate(() => window.__perf);
      raf.push(perf.raf);
      input.push(perf.input);
    }
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return { raf: Math.round(median(raf) * 10) / 10, input: Math.round(median(input) * 10) / 10 };
  };
  const pathNames = () => fresh.evaluate(() => {
    const bar = document.querySelector("#heading-path");
    return bar && !bar.hidden ? [...bar.querySelectorAll(".heading-path-item")].map((item) => item.textContent) : [];
  });

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // ---- 1) 本文の並び: grid と同じ見た目・レイアウトが軽い・1打鍵1レイアウト ----
    // 段組みが先頭・連続・末尾にあり、字下げ・閉じたトグル・区切り線などを含む文書。
    const col = (group, index, id, text, type = "paragraph") => ({ id, type, text, columnGroup: group, columnIndex: index });
    const shapes = [
      col("g1", 0, "c1", "左の段 1"), col("g1", 0, "c2", "左の段 2"), col("g1", 1, "c3", "右の段の見出し", "heading2"),
      col("g2", 0, "c4", "続く段組み 左"), col("g2", 1, "c5", "続く段組み 右"),
      p("s1", "段落"), { id: "s2", type: "bullet", text: "字下げ", indent: 2 }, { id: "s3", type: "heading1", text: "見出し" },
      { id: "s4", type: "toggle", text: "閉じたトグル", open: false }, p("s5", "中", { indent: 1 }), { id: "s6", type: "divider" },
      { id: "s7", type: "quote", text: "引用" }, { id: "s8", type: "code", text: "const a = 1;" },
    ];
    const filler = Array.from({ length: 2400 }, (_, i) => (i % 48 === 0
      ? { id: "f" + i, type: "heading3", text: "小見出し " + i }
      : p("f" + i, "段落 " + i + " の本文。Lorem ipsum dolor sit amet, consectetur adipiscing elit.")));
    await open({ title: "Layout", fonts: [], attachments: [], pages: [{ id: "P", title: "Layout", blocks: [
      ...shapes, ...filler, col("g3", 0, "e1", "末尾の段組み 左"), col("g3", 1, "e2", "中"), col("g3", 2, "e3", "右"),
    ] }] }, "typing-perf-layout.html");
    const layout = await fresh.evaluate(() => {
      const blocks = document.querySelector("#blocks");
      const geometry = () => {
        const base = blocks.getBoundingClientRect();
        return [...blocks.querySelectorAll(":scope > *, :scope > * > *, .column > *")].map((el) => {
          const rect = el.getBoundingClientRect();
          return [rect.x - base.x, rect.y - base.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100).join(",");
        }).join("|") + "|" + Math.round(blocks.getBoundingClientRect().height * 100);
      };
      // 文字を1つ足して強制レイアウト(中央値)
      const cost = () => {
        const content = document.querySelector('#blocks .block-content[data-id="f1201"]');
        const text = [...content.childNodes].find((node) => node.nodeType === 3);
        document.body.offsetHeight;
        const times = [];
        for (let i = 0; i < 15; i += 1) {
          text.data += "x";
          const t0 = performance.now();
          document.body.offsetHeight;
          times.push(performance.now() - t0);
        }
        text.data = text.data.slice(0, -15);
        return times.sort((a, b) => a - b)[7];
      };
      const flow = geometry();
      const flowMs = cost();
      // 以前の grid(display: grid; gap: 2px)を一時的に当てて比べる。
      blocks.style.display = "grid";
      blocks.style.gap = "2px";
      const style = document.createElement("style");
      style.textContent = "#blocks.blocks > * { margin-top: 0; margin-bottom: 0; } #blocks.blocks > .column-layout { margin: 4px 0; }";
      document.head.append(style);
      const grid = geometry();
      const gridMs = cost();
      blocks.style.display = "";
      blocks.style.gap = "";
      style.remove();
      return { same: flow === grid, flowMs, gridMs, rows: blocks.children.length, display: getComputedStyle(blocks).display };
    });
    evidence.layout = layout;
    result.blocksFlowMatchesGridGeometry = layout.same && layout.rows > 2000;
    // flow-root のレイアウトは grid より十分軽い(実測 約1/5。上限は半分)。
    result.blocksLayoutLighterThanGrid = layout.flowMs * 2 < layout.gridMs;
    // 狭い画面(段組みが縦に並ぶ)でも同じ。
    await fresh.setViewportSize({ width: 640, height: 800 });
    await fresh.waitForTimeout(200);
    const narrow = await fresh.evaluate(() => {
      const blocks = document.querySelector("#blocks");
      const geometry = () => [...blocks.querySelectorAll(":scope > *, :scope > * > *, .column > *")].slice(0, 40).map((el) => {
        const rect = el.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100).join(",");
      }).join("|");
      scrollTo(0, 0);
      const flow = geometry();
      blocks.style.display = "grid";
      blocks.style.gap = "2px";
      const style = document.createElement("style");
      style.textContent = "#blocks.blocks > * { margin-top: 0; margin-bottom: 0; } #blocks.blocks > .column-layout { margin: 4px 0; display: block; }";
      document.head.append(style);
      const grid = geometry();
      blocks.style.display = "";
      blocks.style.gap = "";
      style.remove();
      return flow === grid;
    });
    await fresh.setViewportSize({ width: 1200, height: 800 });
    result.blocksFlowMatchesGridGeometryNarrow = narrow;

    // 段落への打鍵1回で、レイアウトは1回(打った文字のぶん。閉じたメニュー・状態表示・書体名の書き直しで増やさない)。
    await caretAtEnd("f1201");
    await fresh.keyboard.press("KeyA");
    await fresh.waitForTimeout(200);
    const layoutsBefore = await metric("LayoutCount");
    for (let i = 0; i < 8; i += 1) {
      await fresh.keyboard.press("KeyB");
      await frame();
      await fresh.waitForTimeout(60);
    }
    const layoutsPerKey = (await metric("LayoutCount") - layoutsBefore) / 8;
    evidence.layoutsPerKey = layoutsPerKey;
    result.typingDoesOneLayoutPerKey = layoutsPerKey <= 1.5;

    // スクロールの1フレームで道筋を計算し直すとき、見出しの一覧は控えを使う(本文 2400 行を毎回探さない)。
    await fresh.evaluate(() => document.activeElement?.blur());
    const scrollRaf = [];
    for (let i = 0; i < 12; i += 1) {
      await fresh.evaluate(() => { window.__perf = { raf: 0, input: 0 }; scrollBy(0, 240); });
      await frame();
      await fresh.waitForTimeout(30);
      scrollRaf.push(await fresh.evaluate(() => window.__perf.raf));
    }
    const scrollMs = [...scrollRaf].sort((x, y) => x - y)[6];
    const scrollPath = await pathNames();
    evidence.scroll = { scrollMs, scrollPath };
    // 見出し 50 個・本文 2400 行。修正後は約 0.4ms、修正前は約 5ms(1フレームごとに本文全体を querySelectorAll)。
    result.headingPathScrollIsLight = scrollMs < 2 && scrollPath.length > 0;

    // ---- 2) 見出しの道筋: 段落への打鍵では計算し直さない。見出しの編集・スクロールには追随する ----
    const pathBlocks = [];
    for (let i = 0; i < 1500; i += 1) {
      pathBlocks.push({ id: "h" + i, type: i % 10 === 0 ? "heading1" : "heading2", text: "見出し " + i });
      pathBlocks.push(p("q" + i, "本文 " + i));
    }
    await open({ title: "Path", fonts: [], attachments: [], pages: [{ id: "P", title: "Path", blocks: pathBlocks }] }, "typing-perf-path.html");
    await caretAtEnd("q750");
    await fresh.keyboard.press("KeyA");
    await fresh.waitForTimeout(200);
    const pathTyping = await typeTimed(["KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH"]);
    evidence.pathTyping = pathTyping;
    // 見出し 1500 個。修正後は約 0.1ms(行の高さを読むだけ)、修正前は約 10ms(全見出しを探して位置を読む)。
    result.headingPathSkipsParagraphTyping = pathTyping.raf < 5;
    // 道筋は見出しの名前に追随する(スクロールせずに、帯に載っている一番深い見出しの中身を書き換えて input を送る)。
    const pathNow = await pathNames();
    const deepestId = await fresh.evaluate(() => [...document.querySelectorAll("#heading-path .heading-path-item")].at(-1)?.dataset.id || "");
    await fresh.evaluate((id) => {
      const content = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
      content.textContent = "改名した見出し";
      content.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" }));
    }, deepestId);
    await frame();
    await fresh.waitForTimeout(50);
    const pathRenamed = await pathNames();
    // スクロールすると、新しく隠れた見出しが載る(h760 は見出し1。その下の見出し2はまだ見えている)。
    await fresh.evaluate(() => {
      const row = document.querySelector('#blocks .block[data-id="h760"] .block-content');
      scrollBy(0, row.getBoundingClientRect().bottom - (document.querySelector(".toolbar").getBoundingClientRect().bottom + 30) + 4);
    });
    await frame();
    await fresh.waitForTimeout(50);
    const pathScrolled = await pathNames();
    evidence.path = { pathNow, deepestId, pathRenamed, pathScrolled };
    result.headingPathFollowsEditAndScroll = pathNow.length > 0 && Boolean(deepestId)
      && pathRenamed.join("›") === [...pathNow.slice(0, -1), "改名した見出し"].join("›")
      && pathScrolled.join("›") === "見出し 760";

    // 見出しでない行の高さが変わったら、道筋は計算し直す(下の見出しの位置が動くので)。
    // 高い段落を帯の下に隠し、そのすぐ下の見出しをわずかに帯の下へ置く。段落を短くすると見出しが帯の下へ隠れる。
    await open({ title: "Grow", fonts: [], attachments: [], pages: [{ id: "P", title: "Grow", blocks: [
      { id: "g0", type: "heading1", text: "親" }, p("tall", Array.from({ length: 40 }, (_, i) => "長い段落の行 " + i).join(" ")),
      { id: "g1", type: "heading2", text: "子" }, ...Array.from({ length: 60 }, (_, i) => p("z" + i, "後ろ " + i)),
    ] }] }, "typing-perf-grow.html");
    await fresh.evaluate(() => {
      document.documentElement.style.overflowAnchor = "none";
      document.body.style.overflowAnchor = "none";
      const heading = document.querySelector('#blocks .block[data-id="g1"] .block-content');
      const bandBottom = document.querySelector(".toolbar").getBoundingClientRect().bottom + 30;
      scrollBy(0, heading.getBoundingClientRect().bottom - bandBottom - 60);
    });
    await frame();
    await fresh.waitForTimeout(50);
    const growBefore = await pathNames();
    await fresh.evaluate(() => {
      const content = document.querySelector('#blocks .block-content[data-id="tall"]');
      content.textContent = "短い段落";
      content.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    });
    await frame();
    await frame();
    await fresh.waitForTimeout(50);
    const growAfter = await pathNames();
    evidence.grow = { growBefore, growAfter };
    result.headingPathFollowsRowHeight = growBefore.join("›") === "親" && growAfter.join("›") === "親›子";

    // ---- 3) 目次: 見出しへの打鍵では、その項目の文字だけが変わる ----
    const tocBlocks = [{ id: "toc", type: "toc", text: "" }];
    for (let i = 0; i < 800; i += 1) {
      tocBlocks.push({ id: "t" + i, type: i % 8 === 0 ? "heading1" : "heading2", text: "目次の見出し " + i });
      tocBlocks.push(p("u" + i, "本文 " + i));
    }
    await open({ title: "Toc", fonts: [], attachments: [], pages: [{ id: "P", title: "Toc", blocks: tocBlocks }] }, "typing-perf-toc.html");
    await fresh.evaluate(() => {
      const items = [...document.querySelectorAll('#blocks .block[data-id="toc"] .toc-item')];
      window.__tocOther = items[3];
      window.__tocCount = items.length;
    });
    await caretAtEnd("t400");
    await fresh.keyboard.press("KeyA");
    await fresh.waitForTimeout(200);
    const tocTyping = await typeTimed(["KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH"]);
    evidence.tocTyping = tocTyping;
    const toc = await fresh.evaluate(() => {
      const items = [...document.querySelectorAll('#blocks .block[data-id="toc"] .toc-item')];
      return {
        count: items.length,
        sameCount: items.length === window.__tocCount,
        otherKept: items[3] === window.__tocOther && window.__tocOther.isConnected,
        edited: items[400]?.textContent,
        heading: document.querySelector('#blocks .block-content[data-id="t400"]').textContent,
      };
    });
    evidence.toc = toc;
    result.tocUpdatesOnlyEditedEntry = toc.sameCount && toc.otherKept && toc.edited === "目次の見出し 400abcdefgh" && toc.heading === toc.edited;
    // 見出し 800 個の目次。修正後は約 9ms(項目1つの差し替えと、そのあとのレイアウト)、修正前は約 57ms(目次を丸ごと作り直す)。
    result.tocHeadingTypingIsLight = tocTyping.raf < 25;
    // 見出しの段を変える(見出し2 → 見出し3)・見出しを足す、は従来どおり目次ごと作り直して追随する。
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("### 足した見出し");
    await fresh.waitForTimeout(300);
    const tocAdded = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="toc"] .toc-item')]
      .map((item) => item.textContent));
    result.tocFollowsAddedHeading = tocAdded.length === 801 && tocAdded[401] === "足した見出し";

    // ---- 4) グラフのコードへの打鍵: そのグラフだけを描き直す ----
    const rows = [[{ text: "x" }, { text: "y" }], ...Array.from({ length: 150 }, (_, i) => [{ text: String(i) }, { text: String((i * 37) % 101) }])];
    const chartBlocks = [{ id: "tbl", type: "table", tableHeader: true, rows }];
    for (let i = 0; i < 12; i += 1) {
      chartBlocks.push({ id: "ch" + i, type: "chart", text: 'table(id="tbl")\nplot(A2:A151, B2:B151, label="y")\nbar(A2:A151, B2:B151)\ntitle("T' + i + '")' });
    }
    chartBlocks.push(p("after", "後ろ"));
    await open({ title: "Chart", fonts: [], attachments: [], pages: [{ id: "P", title: "Chart", blocks: chartBlocks }] }, "typing-perf-chart.html");
    await fresh.locator('.block[data-id="ch5"] .chart-source-toggle').click();
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => {
      window.__otherSvg = document.querySelector('.block[data-id="ch2"] .chart-canvas svg');
      window.__ownSvg = document.querySelector('.block[data-id="ch5"] .chart-canvas svg');
      const content = document.querySelector('.block-content[data-id="ch5"]');
      content.focus();
      // title("T5") の 5 の後ろへ
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.data.indexOf('T5")');
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at + 2);
        range.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        break;
      }
    });
    const chartTyping = await typeTimed(["KeyA", "KeyB", "KeyC", "KeyD", "KeyE"]);
    evidence.chartTyping = chartTyping;
    const chart = await fresh.evaluate(() => {
      const own = document.querySelector('.block[data-id="ch5"] .chart-canvas svg');
      const other = document.querySelector('.block[data-id="ch2"] .chart-canvas svg');
      return {
        ownRedrawn: Boolean(own) && own !== window.__ownSvg && own.textContent.includes("T5abcde"),
        otherKept: other === window.__otherSvg && other.isConnected,
        code: document.querySelector('.block-content[data-id="ch5"]').textContent.split("\n").at(-1),
      };
    });
    evidence.chart = chart;
    result.chartCodeRedrawsOnlyThatChart = chart.ownRedrawn && chart.otherKept && chart.code === 'title("T5abcde")';
    // グラフ 12 個(各 150 点の線と棒)。修正後は約 60ms(そのグラフ1つ)、修正前は約 450ms(全グラフを描き直す)。
    result.chartCodeTypingIsLight = chartTyping.input < 200;
    // 保存するグラフの絵も、打ったコードのもの(描き直していないグラフの絵もそのまま)。
    const savedChart = await save("typing-perf-chart-saved.html");
    const savedBlocks = savedChart.pages[0].blocks;
    result.chartSavedSvgFollowsCode = savedBlocks.find((block) => block.id === "ch5")?.chartSvg?.includes("T5abcde")
      && savedBlocks.find((block) => block.id === "ch2")?.chartSvg?.includes("T2");

    // ---- 5) すべて置換: 1件ずつの置換と同じ結果・Undo 1手・速い ----
    // 1つのブロックに一致が複数あり、太字・取り消しにまたがる一致、インラインのコード・数式、図表の参照の印、表のセル、
    // html を持たないブロック(コード)を含む。
    const replaceDoc = () => ({ title: "Replace", fonts: [], attachments: [], pages: [{ id: "P", title: "Replace", blocks: [
      { id: "tb", type: "table", caption: "数値", tableHeader: true, rows: [[{ text: "abc" }, { text: "x abc abc" }], [{ text: "1" }, { text: "abcabc" }]] },
      p("r1", "abc と abc と abc、xabcx", { html: 'abc と <b>ab</b>c と <b>abc</b>、<s>xabcx</s>' }),
      p("r2", "`abc` の abc", { html: '<code class="inline-code" data-code="abc">abc</code> の abc' }),
      p("r3", "表1 の abc ABC Abc", { html: '<span class="figure-ref" data-ref="tb">表1</span> の abc ABC Abc' }),
      { id: "r4", type: "code", text: "abc(abc)\nabc" },
      p("r5", "abc"),
      { id: "r6", type: "heading2", text: "abc の見出し abc" },
    ] }] });
    const searchFor = async (query, replacement) => {
      await fresh.locator('#blocks .block-content[data-id="r5"]').click();
      await fresh.keyboard.press("Control+h");
      await fresh.locator("#search-input").fill(query);
      await fresh.locator("#search-replace-input").fill(replacement);
      await fresh.waitForTimeout(250);
    };
    // 書式の無い段落は、触ると html に本文と同じ文字が入る(html "" と同じ意味)ので、そろえて比べる。
    const modelOf = (saved) => saved.pages.map((page) => page.blocks.map(({ id, text, html, rows: cells }) => ({ id, text, html: html && html !== text ? html : "", cells: cells ? cells.map((line) => line.map((cell) => cell.text)) : null })));
    await open(replaceDoc(), "typing-perf-replace.html");
    const original = modelOf(await save("typing-perf-replace-original.html"));
    await searchFor("abc", "XY");
    const totalMatches = await fresh.evaluate(() => document.querySelector("#search-count").textContent);
    await fresh.locator("#search-replace-all").click();
    await fresh.waitForTimeout(300);
    const notice = await fresh.evaluate(() => document.querySelector("#status").textContent);
    await fresh.keyboard.press("Escape");
    const all = modelOf(await save("typing-perf-replace-all.html"));
    await fresh.locator('#blocks .block-content[data-id="r5"]').click();
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const undone = modelOf(await save("typing-perf-replace-undone.html"));
    // 同じ文書を開き直し、「置換」で1件ずつ置き換える。
    await open(replaceDoc(), "typing-perf-replace.html");
    await searchFor("abc", "XY");
    let oneByOne = 0;
    for (; oneByOne < 40; oneByOne += 1) {
      const count = await fresh.evaluate(() => document.querySelector("#search-count").textContent);
      if (!/\/[1-9]/.test(count)) break;
      await fresh.locator("#search-replace-one").click();
      await fresh.waitForTimeout(120);
    }
    await fresh.keyboard.press("Escape");
    const single = modelOf(await save("typing-perf-replace-single.html"));
    evidence.replace = { totalMatches, notice, oneByOne, all: JSON.stringify(all), single: JSON.stringify(single), original: JSON.stringify(original), undone: JSON.stringify(undone) };
    const total = Number(/\/(\d+)/.exec(totalMatches)?.[1] || 0);
    result.replaceAllMatchesOneByOne = total >= 10 && oneByOne === total && notice === total + " 件を 1 ページで置換しました"
      && JSON.stringify(all) === JSON.stringify(single) && JSON.stringify(all) !== JSON.stringify(original);
    result.replaceAllUndoRestoresAll = JSON.stringify(undone) === JSON.stringify(original);

    // 速さ: 150 ページ × 段落 12(1つに一致が4つ。太字つき)= 7200 件。修正後は約 0.9 秒、修正前は約 5 秒
    // (以前は一致ごとに画面の文書の中で組み立てていて、生きている Range が増えるほど1件ごとの書き換えが遅くなった)。
    const bigPages = Array.from({ length: 150 }, (_, pageIndex) => ({
      id: "B" + pageIndex,
      title: "ページ " + pageIndex,
      blocks: [
        ...Array.from({ length: 12 }, (_, i) => p("b" + pageIndex + "-" + i, "段落 a 段落 b 段落 c 段落 d", { html: "段落 a <b>段落</b> b 段落 c <i>段落</i> d " + i })),
        ...(pageIndex === 0 ? Array.from({ length: 149 }, (_, i) => ({ id: "link" + i, type: "page", pageId: "B" + (i + 1) })) : []),
      ],
    }));
    const bigDoc = { title: "Big", fonts: [], attachments: [], pages: bigPages };
    const bigPath = join(OUT, "typing-perf-replace-big.html");
    await writeFile(bigPath, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), bigDoc), "utf8");
    {
      const chooser = fresh.waitForEvent("filechooser");
      await openMenu(fresh, "file");
      await fresh.locator("#menu-open-document").click();
      await (await chooser).setFiles(bigPath);
      await fresh.waitForFunction(() => document.querySelector('#blocks .block[data-id="link148"]'), null, { timeout: 30000 });
      await fresh.waitForTimeout(400);
    }
    await fresh.locator('#blocks .block-content[data-id="b0-0"]').click();
    await fresh.keyboard.press("Control+h");
    await fresh.selectOption("#search-scope", "all");
    await fresh.locator("#search-input").fill("段落");
    await fresh.locator("#search-replace-input").fill("だんらく");
    await fresh.waitForTimeout(400);
    const bigCount = await fresh.evaluate(() => document.querySelector("#search-count").textContent);
    const t0 = Date.now();
    await fresh.locator("#search-replace-all").click();
    await frame();
    const replaceMs = Date.now() - t0;
    const bigAfter = await fresh.evaluate(() => ({ count: document.querySelector("#search-count").textContent, status: document.querySelector("#status").textContent }));
    evidence.replaceBig = { bigCount, replaceMs, bigAfter };
    result.replaceAllBigIsFast = bigCount.endsWith("/7200") && bigAfter.status.startsWith("7200 件を 150 ページ") && replaceMs < 2500;

    result.typingPerfNoPageErrors = pageErrors.length === 0;
    evidence.pageErrors = pageErrors;
  } finally {
    await fresh.close();
  }
  result.typingPerfEvidence = evidence;
  return result;
}
