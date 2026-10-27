// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// 文書チェック(Issue #236)。保存・配布の前に、文書の中の参照切れ・表の式のエラー・グラフ・図(Mermaid)・数式の誤りを
// 全ページ(閉じたトグルの中・見ていないページも)から集めて一覧にする。
// 形: 普通のスクリプトが window.DocumentCheck に載せる(table-formula.js・chart.js と同じ。理由は HANDOVER §4.51)。
//   - 判定はどれも既存の1か所を使う(同じ判定を2か所に作らない。CLAUDE.md の決まり 8):
//       参照の行き先 fmt.referenceTargets / fmt.resolveReference(本文の「参照先なし」の印と同じ)、
//       ページ・ブロックへのリンクの行き先 fmt.pageIdOfLinkHref / fmt.blockIdOfLinkHref、
//       表の式のエラー tableFormula.tableCellError(セルに #REF・#CYCLE などを出すのと同じ)、
//       グラフ chartTools.buildChart の errors と DocumentChart.renderChartSvg(グラフの下に出す文言と同じ)、
//       数式 fmt.texToMathML(変換できないと本文で赤のソースになるのと同じ)、
//       図 app.js の Mermaid の描き方(mermaidJob。描いた結果の控えを共有する)
//   - 文書は読むだけで、何も書き換えない(本文・式・添付・描いた絵の chartSvg / mermaidSvg も)。結果は文書に保存しない
//   - 外のもの(URL の行き先)は確かめない(文書の中身を外へ送らない)
// 読み込みの順: document-format.js・table-formula.js・chart.js の後、app.js の前。
window.DocumentCheck = (() => {
  const fmt = window.SingleHtmlFormat;

  // 問題の種類(一覧の札の文字)。
  const CATEGORY_LABELS = {
    reference: "参照・リンク",
    table: "表の式",
    chart: "グラフ",
    diagram: "図(Mermaid)",
    math: "数式",
    attachment: "添付",
  };

  const BLOCK_TYPE_NAMES = {
    paragraph: "段落", bullet: "箇条書き", numbered: "番号付きリスト", todo: "ToDo", quote: "引用", callout: "コールアウト",
    toggle: "トグル", code: "コード", table: "表", chart: "グラフ", mermaid: "図", math: "数式", attachment: "添付", page: "ページへのリンク",
  };

  // 表の式のエラーの手掛かり(原因の種類 → 直し方)。
  const FORMULA_HINTS = {
    REF: "参照しているセルが表の外にあるか、行・列を消して参照が切れています(#REF)。式の参照を書き直してください",
    CYCLE: "式が自分自身を(ほかのセルを通して)参照しています(循環参照)。参照の輪を切ってください",
    MERGE: "同じ結合セルを2つの名前で参照しています。どちらか一方だけを使ってください",
    PARSE: "式の書き方が読めません(かっこ・演算子・区切りを確かめてください)。参照しているセルのエラーが伝わっていることもあります",
    NAME: "知らない関数の名前か、引数の数が合いません(使える関数: SUM・AVERAGE・IF など)",
    DIV0: "0 で割っています",
    VALUE: "数でない値を計算に使っています",
    NUMBER: "計算の結果が数になりません(大きすぎる・小さすぎる値)",
    OTHER: "計算できませんでした",
  };

  // 1つの表で一覧に出す式のエラーの数の上限(連鎖して同じ原因のエラーが何百も並ぶのを避ける。残りは件数だけ)。
  const TABLE_ISSUE_LIMIT = 30;
  // 図(Mermaid)を描き終えるのを待つ長さ。過ぎたら「確かめられなかった」にする(保存の前に待つ長さと同じ)。
  const DIAGRAM_TIMEOUT_MS = 15000;

  const isHeadingType = (type) => /^(?:heading|toggleHeading)[1-5]$/.test(String(type || ""));

  function clip(text, max = 40) {
    const chars = [...String(text || "").replace(/\s+/g, " ").trim()];
    return chars.length > max ? chars.slice(0, max).join("") + "…" : chars.join("");
  }

  // tools: { tableFormula(TableFormula.create の道具), chartTools(DocumentChart.create の道具), diagram(text) → Promise<{ svg } | { error, transient }> }
  function create({ tableFormula, chartTools, diagram }) {
    let inert = null;
    const holder = () => {
      inert ||= document.implementation.createHTMLDocument("");
      return inert.createElement("div");
    };

    // 文書全体を調べる。調べ終わったら結果を返す(図を描くのを待つ間は、途中の結果を onProgress に渡す)。
    // 結果: { issues: [問題], unchecked: [確かめられなかった項目], counts: 調べた数, status: "ok" | "issues" | "incomplete" }
    // 問題・項目: { category, pageId, pageTitle, blockId, cell: { row, col } | null, heading, target, title, hint }
    async function check(doc, { onProgress, timeoutMs = DIAGRAM_TIMEOUT_MS } = {}) {
      const report = collect(doc);
      const waits = report.pendingDiagrams;
      delete report.pendingDiagrams;
      if (!waits.length) return finish(report);
      report.pending = waits.length;
      onProgress?.(finish({ ...report, issues: [...report.issues], unchecked: [...report.unchecked] }));
      await Promise.all(waits.map(async (wait) => {
        let timer = 0;
        const result = await Promise.race([
          Promise.resolve().then(() => diagram(wait.text)).catch((error) => ({ error: String(error?.message || error), transient: true })),
          new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), timeoutMs); }),
        ]);
        clearTimeout(timer);
        wait.blocks.forEach((place) => {
          if (result.timeout) {
            report.unchecked.push({ ...place, category: "diagram", title: "図を時間内に描けませんでした", hint: "図が大きいか、Mermaid の読み込みに時間がかかっています。もう一度チェックしてください" });
          } else if (result.transient) {
            report.unchecked.push({ ...place, category: "diagram", title: "図を確かめられませんでした", hint: "Mermaid を読み込めませんでした(" + clip(result.error, 80) + ")" });
          } else if (result.error) {
            report.issues.push({ ...place, category: "diagram", title: "図を描けません(Mermaid の文法の誤り)", hint: clip(result.error, 200) });
          }
        });
      }));
      report.pending = 0;
      return finish(report);
    }

    function finish(report) {
      const order = new Map(report.blockOrder);
      const sort = (list) => list.sort((a, b) => (order.get(a.blockId) ?? 0) - (order.get(b.blockId) ?? 0)
        || (a.cell?.row ?? -1) - (b.cell?.row ?? -1) || (a.cell?.col ?? -1) - (b.cell?.col ?? -1));
      sort(report.issues);
      sort(report.unchecked);
      report.status = report.pending ? "checking" : report.issues.length ? "issues" : report.unchecked.length ? "incomplete" : "ok";
      return report;
    }

    // 読むだけで集める(図は描く仕事の一覧を返す)。
    function collect(doc) {
      const pages = fmt.pagesInReadingOrder(doc);
      const targets = fmt.referenceTargets(doc);
      const pageIds = new Set(pages.map((page) => page.id));
      const blockIds = new Set();
      pages.forEach((page) => (page.blocks || []).forEach((block) => block?.id && blockIds.add(block.id)));
      const trashPages = fmt.trashOf(doc).map((entry) => entry?.page).filter(Boolean);
      const trashPageIds = new Set(trashPages.map((page) => page.id));
      const trashBlockIds = new Set(trashPages.flatMap((page) => (page.blocks || []).map((block) => block?.id)).filter(Boolean));
      const attachmentIds = new Set((doc.attachments || []).map((item) => item?.id));
      const issues = [];
      const unchecked = [];
      const counts = { pages: pages.length, blocks: 0, references: 0, formulas: 0, charts: 0, diagrams: 0, math: 0 };
      const diagramWaits = new Map();
      const blockOrder = [];

      tableFormula.withTableCalcPass(() => pages.forEach((page) => {
        const blocks = page.blocks || [];
        let heading = "";
        blocks.forEach((block) => {
          if (!block || typeof block !== "object") return;
          counts.blocks += 1;
          blockOrder.push([block.id, blockOrder.length]);
          if (isHeadingType(block.type)) heading = clip(block.text, 30) || "(空の見出し)";
          const place = {
            pageId: page.id, pageTitle: fmt.pageTitleOf(page), blockId: block.id, cell: null,
            heading: isHeadingType(block.type) ? "" : heading, target: blockTarget(block, targets, doc),
          };
          const add = (category, title, hint, extra = {}) => issues.push({ ...place, ...extra, category, title, hint });

          // 参照の印(表・図・見出し・ページへの参照、ブロックへのリンク)と、文中の数式
          if (typeof block.html === "string" && (block.html.includes("figure-ref") || block.html.includes("inline-math"))) {
            const box = holder();
            box.innerHTML = block.html;
            box.querySelectorAll(".figure-ref").forEach((chip) => {
              counts.references += 1;
              const ref = chip.getAttribute("data-ref") || "";
              const kind = fmt.refKindOf(chip);
              if (fmt.resolveReference(targets, ref, kind)) return;
              add("reference", kind === fmt.REF_KIND_BLOCK ? "リンクしているブロックが見つかりません" : "参照先が見つかりません",
                missingReferenceHint(ref, kind, { blockIds, trashPageIds, trashBlockIds }), { detail: "本文に「参照先なし」と出ている印" });
            });
            box.querySelectorAll(".inline-math").forEach((span) => {
              counts.math += 1;
              const tex = fmt.inlineMathSource(span);
              if (!tex.trim()) add("math", "空の数式があります", "文中の $$…$$ の中が空です。数式を書くか、消してください");
              else if (!fmt.texToMathML(tex, false)) add("math", "数式を変換できません: " + clip(tex, 40), mathHint());
            });
          }

          if (block.type === "page") {
            counts.references += 1;
            if (!pageIds.has(block.pageId)) {
              add("reference", "リンクしているページが見つかりません", trashPageIds.has(block.pageId)
                ? "行き先のページはゴミ箱にあります。ゴミ箱から元に戻すか、このリンクを消してください"
                : "行き先のページを消しました。このリンクを消してください");
            }
          }

          if (block.attachmentId && !attachmentIds.has(block.attachmentId)) {
            add("attachment", "添付のファイルが文書にありません", "このブロックが指す添付が見つかりません。ファイルを添付し直すか、ブロックを消してください");
          }

          if (block.type === "table" && Array.isArray(block.rows)) checkTable(block, place, issues, counts, { pages, blockIds, trashPageIds, trashBlockIds });

          if (block.type === "chart") {
            counts.charts += 1;
            const chart = chartTools.buildChart(block, blocks);
            const errors = [...chart.errors];
            try {
              window.DocumentChart.renderChartSvg(chart);
            } catch (error) {
              errors.push("グラフを描けませんでした: " + String(error?.message || error));
            }
            [...new Set(errors)].forEach((message) => add("chart", "グラフの定義・データに誤りがあります", message));
          }

          if (block.type === "math") {
            counts.math += 1;
            const tex = String(block.text || "");
            if (tex.trim() && !fmt.texToMathML(tex, true)) add("math", "数式を変換できません: " + clip(tex, 40), mathHint());
          }

          if (block.type === "mermaid") {
            const text = String(block.text || "");
            if (!text.trim()) return;
            counts.diagrams += 1;
            if (!diagramWaits.has(text)) diagramWaits.set(text, { text, blocks: [] });
            diagramWaits.get(text).blocks.push(place);
          }
        });
      }));
      return { issues, unchecked, counts, blockOrder, pendingDiagrams: [...diagramWaits.values()], pending: 0 };
    }

    // 表のセル: 式のエラー(セルに出る #REF などと同じ判定)と、リンクのセルのページ・ブロックの行き先。
    function checkTable(block, place, issues, counts, known) {
      const calc = tableFormula.tableCalc(block);
      const label = place.target;
      let shown = 0;
      let hidden = 0;
      calc.rows.forEach((row, rowIndex) => row.forEach((cell, cellIndex) => {
        if (!cell || cell.covered) return;
        const at = { cell: { row: rowIndex, col: cellIndex } };
        const name = window.TableFormula.columnLabel(cellIndex) + (rowIndex + 1);
        if (tableFormula.isTableFormula(cell.text)) {
          counts.formulas += 1;
          const error = tableFormula.tableCellError(block, rowIndex, cellIndex, calc);
          if (error) {
            if (shown >= TABLE_ISSUE_LIMIT) {
              hidden += 1;
            } else {
              shown += 1;
              const hint = error.reason === "MERGE"
                ? tableFormula.tableMergeAliasMessage(block, cell.text, calc) || FORMULA_HINTS.MERGE
                : FORMULA_HINTS[error.reason] || FORMULA_HINTS.OTHER;
              issues.push({ ...place, ...at, category: "table", title: "セル " + name + " の式が " + error.code + " になります", detail: clip(cell.text, 60), hint });
            }
          }
        }
        const link = typeof cell.link === "string" ? cell.link.trim() : "";
        if (!link) return;
        if (fmt.isPageLinkHref(link)) {
          counts.references += 1;
          if (fmt.pageIdOfLinkHref(known.pages, link)) return;
          const trashed = [...known.trashPageIds].some((id) => fmt.pageLinkHref(id) === link);
          issues.push({ ...place, ...at, category: "reference", title: "セル " + name + " のリンクのページが見つかりません",
            hint: trashed ? "行き先のページはゴミ箱にあります。ゴミ箱から元に戻すか、リンクを外してください" : "行き先のページを消しました。リンクを外してください" });
          return;
        }
        const blockId = fmt.blockIdOfLinkHref(link);
        if (!blockId) return;
        counts.references += 1;
        if (known.blockIds.has(blockId)) return;
        issues.push({ ...place, ...at, category: "reference", title: "セル " + name + " のリンクのブロックが見つかりません",
          hint: known.trashBlockIds.has(blockId) ? "行き先のブロックはゴミ箱のページにあります。ページを元に戻すか、リンクを外してください"
            : "行き先のブロックを消しました。リンクを外してください" });
      }));
      if (hidden) {
        issues.push({ ...place, category: "table", title: label + " にはほかに式のエラーが " + hidden + " か所あります",
          hint: "1つの表で一覧に出すのは " + TABLE_ISSUE_LIMIT + " か所までです。上のエラーを直してから、もう一度チェックしてください" });
      }
    }

    return { check, collectNow: (doc) => finish(collect(doc)) };
  }

  // 行き先が無い参照の手掛かり。ゴミ箱にあるのか、消したのか、行き先が参照できる形でなくなったのかで分ける。
  function missingReferenceHint(ref, kind, { blockIds, trashPageIds, trashBlockIds }) {
    if (trashPageIds.has(ref)) return "行き先のページはゴミ箱にあります。ゴミ箱から元に戻すか、この印を消してください";
    if (trashBlockIds.has(ref)) return "行き先はゴミ箱のページの中にあります。ページを元に戻すか、この印を消してください";
    if (kind !== fmt.REF_KIND_BLOCK && blockIds.has(ref)) {
      return "行き先の表・図の題名を外したか、見出しを別の種類に変えました。題名・見出しを戻すか、「/参照」で付け直してください";
    }
    return kind === fmt.REF_KIND_BLOCK ? "行き先のブロックを消しました。この印を消すか、リンクをコピーし直してください"
      : "行き先(表・図・見出し・ページ)を消しました。この印を消すか、「/参照」で付け直してください";
  }

  function mathHint() {
    return "TeX の書き方が読めないか、対応していない命令です(かっこの対応・\\frac{…}{…} の形などを確かめてください)";
  }

  // 一覧に出すブロックの名前(題名つきの表・図は「表1」「図2」、ほかは種類と文字の頭)。
  function blockTarget(block, targets, doc) {
    const figure = targets.get(block.id);
    if (figure && (figure.kind === "table" || figure.kind === "figure")) return figure.label + "「" + clip(fmt.captionText(block), 24) + "」";
    if (isHeadingType(block.type)) return "見出し「" + (clip(block.text, 30) || "(空)") + "」";
    const name = BLOCK_TYPE_NAMES[block.type] || "ブロック";
    if (["table", "chart", "mermaid", "math", "attachment", "page"].includes(block.type)) {
      const linked = block.type === "page" && (doc.pages || []).some((page) => page.id === block.pageId);
      if (linked || block.type === "attachment") return name + "「" + clip(fmt.blockLinkLabel(block, doc), 24) + "」";
      return name;
    }
    const text = clip(block.text, 24);
    return text ? name + "「" + text + "」" : name + "(空)";
  }

  return { create, CATEGORY_LABELS, TABLE_ISSUE_LIMIT, DIAGRAM_TIMEOUT_MS };
})();
