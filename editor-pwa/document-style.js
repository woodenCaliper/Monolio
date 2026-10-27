// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// 本文の見た目の正(もと)(Issue #201)。エディタの画面と保存HTMLの両方が、ここの値と規則を使う。
// ・色と寸法は TOKENS の1か所だけ。CSS の中では var(--doc-…) で使い、値を直に書かない(テスト documentStyleSingleSource が見る)。
//   エディタは index.html の <head> でこのファイルを読み、:root に TOKENS を入れる(style.css は var(--doc-…) で読む)。
//   保存HTMLは portableCss() の頭に同じ :root を書く。
// ・同じ名前の部品(本文の書式の印・データベースの札・グラフの絵など、エディタと保存HTMLで要素とクラスが同じもの)の規則は
//   SHARED_CSS の1か所。エディタには style.css の前に入れ(style.css の編集用の規則が後から足す・勝つ)、保存HTMLにも同じ文を書く。
// ・保存HTMLだけの組み方(本文は p・h2… で組む。エディタは .block・.block-content で組む)は PORTABLE_* に書く。値は TOKENS から。
// document-format.js(window.SingleHtmlFormat)の後に読む(アイコンの絵 iconMaskUrl・字句の種類 CODE_TOKEN_KINDS を使う)。
window.DocumentStyle = (() => {
  const fmt = window.SingleHtmlFormat;

  // ---- 値(トークン) ----
  // 色。値ごとに1つの名前(白だけは「地」と「色の上の字」の2つ)。エディタの style.css は、ここにある色(白を除く)を直に書かない。
  // #201 で揃えた値: 引用の線・表の線・表の見出しの地・絞り込みの一言・時刻・グループの頭・グラフの目盛線・グラフのコードの枠は、
  // 保存HTMLだけ別の値になっていた(エディタの値を正にした)。
  const COLORS = {
    ink: "#202124",
    muted: "#6b7078",
    accent: "#0b6bcb",
    "accent-soft": "#e8f1fb",
    danger: "#b9382b",
    ok: "#12805c",
    warn: "#a35f00",
    surface: "#fff",
    "on-accent": "#fff",
    line: "#dcdee3",
    soft: "#f0f2f5",
    "faint-line": "#e7e9ed",
    rule: "#b4b9c1",
    sep: "#9aa0a6",
    "title-band": "#f1f2f4",
    "title-band-line": "#e2e4e8",
    "link-underline": "#c8cdd3",
    "quote-ink": "#42464d",
    "inline-code-bg": "#eef0f2",
    "code-bg": "#f1f3f4",
    "toc-line": "#e1e5e9",
    "toc-accent": "#a7b5c3",
    "toc-bg": "#f6f8fa",
    "toc-title": "#68737e",
    "toc-title-line": "#e4e8ec",
    "toc-ink": "#39414a",
    "toc-hover": "#e9eef3",
    "formula-underline": "#9aa8b6",
    invalid: "#d39e00",
    "chart-axis": "#9aa3ad",
    "media-bg": "#f5f6f8",
    "video-bg": "#111",
    "notice-line": "#f0c36d",
    "notice-bg": "#fff8e6",
    "notice-ink": "#7a4b00",
    "error-bg": "#fdf3f2",
    "error-line": "#f0b5ad",
    flash: "#fff1b8",
    "placeholder-bg": "#e9ebee",
    // データベースの札の色(選択肢・状態。fmt.dbSelectColor が札の番号 0〜6 を決める)
    "tag-orange-bg": "#fde8c8", "tag-orange-ink": "#8a4b00",
    "tag-gray-bg": "#eceef1", "tag-gray-ink": "#4a4f57",
    "tag-green-bg": "#d8f0e0", "tag-green-ink": "#1d6b3a",
    "tag-blue-bg": "#dbe9fb", "tag-blue-ink": "#1a4f8f",
    "tag-purple-bg": "#ece0f8", "tag-purple-ink": "#5b2d8a",
    "tag-red-bg": "#fbe0de", "tag-red-ink": "#9a2c22",
    "tag-yellow-bg": "#f6efc4", "tag-yellow-ink": "#6b5a00",
    // 拡大表示・PDF を大きく見る窓(エディタの .image-lightbox と同じ)
    overlay: "rgba(15,16,18,.92)",
    "overlay-panel": "rgba(32,33,36,.94)",
    "overlay-line": "rgba(255,255,255,.24)",
    "overlay-hover": "rgba(255,255,255,.14)",
    "overlay-shadow": "rgba(0,0,0,.35)",
    "overlay-hint": "rgba(32,33,36,.78)",
    "pdf-viewer-bg": "#525659",
    hover: "rgba(0,0,0,.05)",
    "bar-bg": "rgba(255,255,255,.94)",
    "shadow-faint": "rgba(32,33,36,.04)",
    "shadow-soft": "rgba(32,33,36,.06)",
    shadow: "rgba(32,33,36,.12)",
  };
  // コードの字句の色(GitHub の明るい配色に近い値。背景 code-bg の上で読める濃さ)。種類は fmt.CODE_TOKEN_KINDS(字句の分け方の側)。
  const CODE_TOKEN_COLORS = {
    keyword: "#cf222e", string: "#0a3069", comment: "#636c76", number: "#0550ae", function: "#8250df",
    tag: "#116329", attr: "#0550ae", meta: "#953800", variable: "#953800", heading: "#0550ae",
  };
  // 寸法と書体。見出しは本文のブロックの種類の名前(heading1 = 保存HTMLの h2)。
  const SIZES = {
    font: 'system-ui,-apple-system,"Segoe UI","Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif',
    mono: 'ui-monospace,SFMono-Regular,Consolas,"Courier New",monospace',
    "font-size": "15px",
    "line-height": "1.5",
    "title-size": "42px",
    "title-line-height": "1.15",
    "title-weight": "760",
    "heading1-size": "30px", "heading1-line-height": "1.22", "heading1-weight": "760", "heading1-pad": "14px",
    "heading2-size": "22px", "heading2-line-height": "1.3", "heading2-weight": "720", "heading2-pad": "10px",
    "heading3-size": "18px", "heading3-line-height": "1.35", "heading3-weight": "700", "heading3-pad": "8px",
    "heading4-size": "16px", "heading4-line-height": "1.4", "heading4-weight": "700", "heading4-pad": "6px",
    "heading5-size": "14px", "heading5-line-height": "1.45", "heading5-weight": "700", "heading5-pad": "4px",
    "caption-size": "14px",
    // ブロックの行: 高さ 32px 以上・上下 3px の余白、行と行のあいだ 2px。字下げ1段 28px。
    "block-min-height": "32px",
    "block-pad": "3px",
    "block-gap": "2px",
    indent: "28px",
    // 記号(点・箱・三角・番号)の箱の幅と、記号と本文のあいだ。
    "marker-gap": "4px",
    "bullet-width": "14px",
    "todo-width": "16px",
    "toggle-width": "24px",
    "number-width": "24px",
    "tab-size": "4em",
  };
  // 狭い画面の題名(エディタも保存HTMLも 800px 以下)。
  const NARROW = { width: 800, sizes: { "title-size": "32px" } };
  // 小さい文字(文書の設定。Notion の 16 → 14 と同じ 0.875 倍)。題名は変えない。
  const SMALL_TEXT_SCALE = 0.875;
  const SMALL_TEXT_SIZES = ["font-size", "heading1-size", "heading2-size", "heading3-size", "heading4-size", "heading5-size", "caption-size"];

  const tokenRef = (prefix) => (table) => Object.fromEntries(Object.keys(table).map((name) => [name, "var(--doc-" + prefix + name + ")"]));
  const c = tokenRef("")(COLORS);
  const s = tokenRef("")(SIZES);
  const tok = tokenRef("tok-")(CODE_TOKEN_COLORS);
  const declarations = (table, prefix = "") => Object.entries(table).map(([name, value]) => "--doc-" + prefix + name + ":" + value).join(";");

  // :root の値(エディタも保存HTMLも同じ文)。
  function tokensCss() {
    return ":root{" + declarations(COLORS) + ";" + declarations(CODE_TOKEN_COLORS, "tok-") + ";" + declarations(SIZES) + "}"
      + "@media(max-width:" + NARROW.width + "px){:root{" + declarations(NARROW.sizes) + "}}";
  }
  // 小さい文字の値(selector の中だけ大きさのトークンを 0.875 倍にする)。
  function smallTextTokens() {
    const scaled = Object.fromEntries(SMALL_TEXT_SIZES.map((name) => [name, Math.round(Number.parseFloat(SIZES[name]) * SMALL_TEXT_SCALE * 1000) / 1000 + "px"]));
    return declarations(scaled);
  }
  // コードの字句の色。エディタは ::highlight(…) に色そのもの(Highlight の擬似要素では var() を当てにしない)、保存HTMLは .tok-… に var()。
  function codeTokenCss(selectorOf, { literal = false } = {}) {
    return fmt.CODE_TOKEN_KINDS.map((kind) => selectorOf(kind) + "{color:" + (literal ? CODE_TOKEN_COLORS[kind] : tok[kind]) + "}").join("");
  }

  const mask = (name) => fmt.iconMaskUrl(name);
  const PAGE_ICON_MASK = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 2.5h8.2l4.3 4.3v14.7H6z'/><path d='M14 2.5v4.5h4.5'/><path d='M9 12.5h6M9 16.5h6'/></svg>") center/contain no-repeat`;
  const BLOCK_LINK_ARROW_MASK = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='M7 17L17 7'/><path d='M9 7h8v8'/></svg>") center/contain no-repeat`;

  // ---- エディタと保存HTMLで同じ規則(要素とクラスが同じ部品) ----
  // base: 本文の書式の印(インラインコード・数式・参照)、グラフの絵、データベースの札。blockLink・date はその印のある文書にだけ(保存HTML)。
  const SHARED_CSS = {
    base: [
      `.inline-code{padding:1px 4px;border-radius:4px;background:${c["inline-code-bg"]};color:${c.danger};font-family:${s.mono};font-size:.92em;font-weight:500;box-decoration-break:clone;-webkit-box-decoration-break:clone}`,
      `.inline-math{padding:0 2px}.inline-math math{display:inline-block}.inline-math.math-error{border-radius:4px;background:${c["error-bg"]};color:${c.danger};font-family:${s.mono};font-size:.92em}`,
      `.figure-ref.is-missing{color:${c.danger}}`,
      `.figure-ref.is-page::before{content:"";display:inline-block;width:1.05em;height:1.05em;margin-right:.18em;vertical-align:-.17em;background:currentColor;-webkit-mask:${PAGE_ICON_MASK};mask:${PAGE_ICON_MASK}}`,
      `.chart-grid{stroke:${c.line};stroke-width:1}.chart-axis{stroke:${c["chart-axis"]};stroke-width:1}.chart-line{stroke-width:2}`,
      `.chart-tick{font-size:10px;fill:${c.muted}}.chart-title{font-size:13px;font-weight:700;fill:${c.ink}}.chart-label{font-size:11px;fill:${c.muted}}`,
      `.chart-legend{font-size:11px;fill:${c.ink}}.chart-value{font-size:10px;fill:${c.ink}}.chart-value-inside{fill:${c["on-accent"]}}.chart-message{font-size:12px;fill:${c.muted}}`,
      `.db-pill{display:inline-block;max-width:100%;padding:0 8px;border-radius:10px;line-height:22px;font-size:.92em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:top}.db-pill+.db-pill{margin-left:2px}`,
      ["orange", "gray", "green", "blue", "purple", "red", "yellow"].map((name, index) => `.db-pill-${index}{background:${c["tag-" + name + "-bg"]};color:${c["tag-" + name + "-ink"]}}`).join(""),
      `.db-status{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:0 9px 0 8px;border-radius:11px;line-height:22px;font-size:.92em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:top}.db-status::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:currentColor}`,
      `.db-status-todo{background:${c["tag-gray-bg"]};color:${c["tag-gray-ink"]}}.db-status-doing{background:${c["tag-blue-bg"]};color:${c["tag-blue-ink"]}}.db-status-done{background:${c["tag-green-bg"]};color:${c["tag-green-ink"]}}`,
      `.db-invalid{text-decoration:underline wavy ${c.invalid};text-underline-offset:3px}.db-time{color:${c.muted};font-variant-numeric:tabular-nums}`,
      `a.db-file::before,.db-file.is-missing::before{content:"📎";margin-right:4px;display:inline-block;text-decoration:none}.db-file.is-missing{color:${c.muted};text-decoration:line-through}`,
      `.db-check{display:inline-block;box-sizing:border-box;width:16px;height:16px;border:1.5px solid ${c.sep};border-radius:3px;vertical-align:-3px;position:relative}.db-check.is-on{background:${c.accent};border-color:${c.accent}}`,
      `.db-check.is-on::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid ${c["on-accent"]};border-width:0 2px 2px 0;transform:rotate(45deg)}`,
      `a.db-link{color:${c.accent};text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}`,
    ].join("\n"),
    blockLink: `.figure-ref.is-block::before{content:"";display:inline-block;width:.9em;height:.9em;margin-right:.12em;vertical-align:-.08em;background:currentColor;-webkit-mask:${BLOCK_LINK_ARROW_MASK};mask:${BLOCK_LINK_ARROW_MASK}}`,
    date: `.date-mention{white-space:nowrap}.date-mention::before{content:"";display:inline-block;width:1em;height:1em;margin-right:.2em;vertical-align:-.14em;background:${c.muted};-webkit-mask:${mask("calendar")} center/contain no-repeat;mask:${mask("calendar")} center/contain no-repeat}`,
  };

  // エディタに入れる CSS(値と同じ規則)。style.css より前に置く。
  function editorCss() {
    return tokensCss() + "\n.doc-text-small{" + smallTextTokens() + "}\n" + Object.values(SHARED_CSS).join("\n");
  }
  function installEditorStyle(doc = document) {
    if (doc.getElementById("document-style")) return;
    const style = doc.createElement("style");
    style.id = "document-style";
    style.textContent = editorCss();
    const sheet = doc.querySelector('link[rel="stylesheet"]');
    if (sheet) sheet.before(style);
    else doc.head.append(style);
  }

  // ---- 保存HTMLだけの組み方 ----
  // 本文の並びはエディタ(style.css の .block / .block-content)と同じ寸法で組む(P7。v190)。
  // 題名は本文より 50px 左(エディタの題名と本文の位置の関係と同じ)。main の左の余白 72px はエディタの .doc の余白 22px
  // + ブロックの左の列(つまみ 40px + 間 4px + 本文の余白 6px)。
  const blockRow = `box-sizing:border-box;min-height:${s["block-min-height"]};padding:${s["block-pad"]} 0`;
  const heading = (tag, level) => `${tag}{font-size:${s["heading" + level + "-size"]};line-height:${s["heading" + level + "-line-height"]};font-weight:${s["heading" + level + "-weight"]};padding-top:${s["heading" + level + "-pad"]}}`;
  const PORTABLE_BASE_CSS = [
    `body{margin:0;color:${c.ink};background:${c.surface};font:${s["font-size"]}/${s["line-height"]} ${s.font}}`,
    `main{--marker-line-center:14.25px;max-width:820px;margin:0 auto;padding:42px 28px 80px 72px}`,
    `h1{font-size:${s["title-size"]};line-height:${s["title-line-height"]};font-weight:${s["title-weight"]};overflow-wrap:anywhere;margin:0 0 26px -50px;padding-bottom:18px;background:${c["title-band"]};box-shadow:0 0 0 100vmax ${c["title-band"]},0 1px 0 100vmax ${c["title-band-line"]};clip-path:inset(-80px -100vmax -1px -100vmax)}body{overflow-x:clip}h1.page-title{margin-top:48px}p.page-link a{color:inherit;text-decoration:underline;text-decoration-color:${c["link-underline"]};text-underline-offset:3px}p.page-link.is-missing{color:${c.muted}}`,
    // ブロックは「上下 3px の余白・高さ 32px 以上」の行で、行と行のあいだは 2px。見出しは上の余白を広げる。
    `p,li,details.toggle>summary{${blockRow}}`,
    `p,ul,pre,h2,h3,h4,h5,h6,details.toggle{margin:0 0 ${s["block-gap"]}}`,
    `h2,h3,h4,h5,h6{box-sizing:border-box;min-height:${s["block-min-height"]};padding-bottom:${s["block-pad"]}}`,
    heading("h2", 1), heading("h3", 2), heading("h4", 3), heading("h5", 4), heading("h6", 5),
    `h6{color:${c.muted}}`,
    `.quote{margin-left:-6px;border-left:3px solid ${c.line};padding-left:14px;color:${c["quote-ink"]}}`,
    // 編集画面(pre-wrap)と同じく、貼り付け由来の改行文字を行として残す
    `p,li,h2,h3,h4,h5,h6{white-space:pre-wrap;tab-size:${s["tab-size"]};overflow-wrap:anywhere}`,
    // トグルの三角と箇条書きの点は図形で描く(エディタと同じ大きさ)。ブラウザ既定の印は消す。
    `details.toggle>summary{cursor:pointer;list-style:none;position:relative;padding-left:calc(${s["toggle-width"]} + ${s["marker-gap"]})}details.toggle>summary::-webkit-details-marker{display:none}details.toggle>summary::before{content:"";position:absolute;left:1px;top:var(--marker-line-center);width:14px;height:14px;transform:translateY(-50%);background:${c.muted};-webkit-mask:${mask("caret-right")} left center/contain no-repeat;mask:${mask("caret-right")} left center/contain no-repeat}details.toggle[open]>summary::before{-webkit-mask-image:${mask("caret-down")};mask-image:${mask("caret-down")}}details.toggle>summary:has(>h2)::before{top:32.3px}details.toggle>summary:has(>h3)::before{top:24.3px}details.toggle>summary:has(>h4)::before{top:20.15px}details.toggle>summary:has(>h5)::before{top:17.2px}details.toggle>summary:has(>h6)::before{top:14.15px}details.toggle>summary>*{display:inline;margin:0}details.toggle>summary>:is(h2,h3,h4,h5,h6){display:block;margin:0}details.toggle>summary:has(>:is(h2,h3,h4,h5,h6)){padding-top:0;padding-bottom:0;min-height:0}details.toggle>summary{margin-bottom:${s["block-gap"]}}`,
    `ul{padding-left:0;list-style:none}ul>li{position:relative;padding-left:calc(${s["bullet-width"]} + ${s["marker-gap"]})}ul>li::before{content:"";position:absolute;left:0;top:var(--marker-line-center);width:8px;height:8px;border-radius:50%;transform:translateY(-50%);background:${c.muted}}`,
    `.toc{display:grid;gap:2px;margin:2px -6px;padding:10px;border:1px solid ${c["toc-line"]};border-left:3px solid ${c["toc-accent"]};border-radius:6px;background:${c["toc-bg"]};box-shadow:0 1px 2px ${c["shadow-faint"]}}.toc .toc-title{margin-bottom:3px;padding:0 8px 8px;border-bottom:1px solid ${c["toc-title-line"]};color:${c["toc-title"]};font-size:12px;font-weight:700;line-height:1.4}.toc a{display:flex;align-items:center;height:30px;padding:0 8px;border-radius:4px;color:${c["toc-ink"]};text-decoration:none}.toc a:hover{background:${c["toc-hover"]}}.toc a.toc-level-1{font-weight:650}.toc a.toc-level-2{padding-left:22px}.toc a.toc-level-3{padding-left:36px}.toc a.toc-level-4{padding-left:50px}.toc a.toc-level-5{padding-left:64px;color:${c.muted}}`,
    `.doc-columns{display:grid;column-gap:12px;align-items:start;margin:6px -6px 6px -50px}.doc-column{min-width:0;padding:0 10px 0 54px}.doc-column>:last-child{margin-bottom:0}`,
    `.indent{margin-left:${s.indent}}`,
    // トグルの中身は、エディタと同じくトグルの文字の頭にそろえる(v182)。すぐ下の入れ子(.indent)は字下げ1段を足す(#132)。
    `details.toggle>:not(summary){margin-left:calc(${s["toggle-width"]} + ${s["marker-gap"]})}`,
    `details.toggle>.indent{margin-left:calc(${s["toggle-width"]} + ${s["marker-gap"]} + ${s.indent})}`,
    `.numbered-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:${s["marker-gap"]};align-items:start}.numbered-marker{min-width:${s["number-width"]};color:${c.muted};text-align:left;font-variant-numeric:tabular-nums;user-select:none}`,
    `pre{margin:0 0 ${s["block-gap"]};background:${c["code-bg"]};padding:10px 12px;border-radius:5px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:inherit;font-family:${s.mono}}`,
    `hr{border:0;border-top:1px solid ${c.rule};margin:14px 0 21px}`,
    // 図表の題名(v191)。「表n:」「図n:」は太字。表の題名は表の上、図の題名は図の下。
    `a.figure-ref{color:${c.accent};text-decoration:none}a.figure-ref:hover{text-decoration:underline;text-underline-offset:3px}`,
    `.doc-caption{box-sizing:border-box;min-height:${s["block-min-height"]};margin:0 0 ${s["block-gap"]};padding:${s["block-pad"]} 0;font-size:${s["caption-size"]};line-height:1.5}.doc-caption-label{font-weight:700}`,
    `.doc-caption-table{padding-top:18px}.doc-caption-table+table.doc-table{margin-top:7px}.doc-caption-figure{min-height:0;margin:0}`,
    `.doc-chart-canvas+.doc-caption{margin-top:8px}.doc-chart:has(>.doc-caption){margin-bottom:2px}`,
    `.image-attachment>.doc-caption{margin-top:7px}.image-attachment:has(>.doc-caption){margin-bottom:2px}`,
    // 表の上は、エディタの表の上の帯(18px)ぶん空ける。
    `table.doc-table{width:100%;border-collapse:collapse;margin:23px 0 5px;table-layout:fixed;background:${c.surface}}`,
    `table.doc-table-sized{width:auto}`,
    `.doc-table-filter-note{margin:4px 0 0;color:${c.muted};font-size:12px}`,
    // 広い表は箱の中で横にスクロール(v231)。印刷では紙の幅に縮めて全部刷る。
    `.doc-table-scroll{max-width:100%;overflow-x:auto}.doc-caption-table+.doc-table-scroll>table.doc-table{margin-top:7px}`,
    `@media print{.doc-table-scroll{overflow:visible}table.doc-table-sized{width:100%!important}table.doc-table-sized col{width:var(--doc-col-pct)!important}}`,
    // 表を見せる高さを決めた表(v235)。見出しの行は上に残す。印刷では全行を刷る。
    `.doc-table-view{overflow:auto;margin:23px 0 5px}.doc-caption-table+.doc-table-view{margin-top:7px}.doc-table-view>table.doc-table{margin:0!important}.doc-table-view thead td{position:sticky;top:0;z-index:1;box-shadow:0 1px 0 ${c.line}}`,
    `@media print{.doc-table-view{max-height:none!important;overflow:visible}.doc-table-view thead td{position:static;box-shadow:none}}`,
    // セルの中の改行はエディタと同じく見せる(#136)。
    `table.doc-table td{border:1px solid ${c.line};padding:7px 9px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}`,
    `table.doc-table-header thead td{background:${c.soft};font-weight:700}`,
    `table.doc-table td.doc-th-col{background:${c.soft};font-weight:700}`,
    `table.doc-table td.doc-formula{text-decoration:underline dotted ${c["formula-underline"]};text-underline-offset:3px}`,
    // データベースの表(v229)
    `table.doc-db td.db-col-number{text-align:right;font-variant-numeric:tabular-nums}table.doc-db td.db-col-check{text-align:center}`,
    // グループ分け(Issue #179)
    `tr.doc-group-head>td{padding:6px 9px;background:${c.soft}}.doc-group-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;white-space:normal}`,
    `.doc-group-toggle input{position:absolute;width:1px;height:1px;opacity:0}.doc-group-toggle:has(input:focus-visible){outline:2px solid ${c.accent};outline-offset:2px;border-radius:4px}`,
    `.doc-group-arrow{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid ${c.muted};transition:transform .12s}input:checked+.doc-group-arrow{transform:rotate(-90deg)}`,
    `.doc-group-count{color:${c.muted};font-weight:400;font-size:.9em}.table-group-empty{color:${c.muted};font-weight:400}`,
    `tbody.doc-group:has(>tr.doc-group-head input:checked)>tr:not(.doc-group-head){display:none}`,
    `.doc-chart{margin:4px 0 6px}.doc-chart-canvas{margin-top:18px;padding:6px;border:1px solid ${c.line};border-radius:8px;background:${c.surface};overflow-x:auto}`,
    `.doc-chart svg{display:block;width:100%;max-width:660px;height:auto}`,
    // Mermaid の図(v194)。大きさは図が持つ max-width で決まり、枠の中で真ん中に置く
    `.doc-mermaid-canvas svg{margin:0 auto}`,
    `.doc-chart-source{margin:0}.doc-chart-source summary{cursor:pointer;color:${c.muted};font-size:12px;line-height:24px}.doc-chart-source pre{margin:4px 0 0;padding:7px 9px;border:1px solid ${c.line};border-radius:7px;background:${c.soft};font-family:${s.mono};font-size:12px;overflow-x:auto}`,
    `.doc-math{margin:6px -6px;padding:6px 8px;text-align:center;font-size:1.12em}`,
    `.doc-math math{display:inline-block}`,
    `pre.doc-math-source{margin:6px 0 0;padding:7px 9px;border:1px solid ${c["error-line"]};border-radius:7px;background:${c["error-bg"]};color:${c.danger};font-family:${s.mono};font-size:12px;overflow-x:auto;text-align:left}`,
    `.todo{position:relative;padding-left:calc(${s["todo-width"]} + ${s["marker-gap"]})}.todo-mark{position:absolute;left:0;top:calc(var(--marker-line-center) - 8px);line-height:0;user-select:none}.todo-mark svg{display:block;width:16px;height:16px}.page-link-icon{display:inline-block;width:1.1em;height:1.1em;vertical-align:-.2em}.page-link-icon svg{display:block;width:100%;height:100%}.todo.done{text-decoration:line-through;color:${c.muted}}`,
    `.attachment{border:1px solid ${c.line};border-radius:8px;background:${c.surface};padding:10px 12px;margin:5px 0;display:flex;justify-content:space-between;gap:10px;align-items:center}`,
    `.image-attachment{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:7px 0 13px}.image-attachment[data-align="center"]{align-items:center}.image-attachment[data-align="right"]{align-items:flex-end}.image-attachment img,.image-attachment video{display:block;box-sizing:border-box;width:var(--image-width,100%);height:auto;border:1px solid ${c.line};border-radius:7px;background:${c["media-bg"]}}.image-attachment video{background:${c["video-bg"]}}.video-unplayable{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid ${c["notice-line"]};border-radius:8px;background:${c["notice-bg"]};color:${c["notice-ink"]};font-size:13px}.image-attachment.is-unplayable figcaption{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%}.image-attachment figcaption{display:none}.image-attachment:hover figcaption,.image-attachment:focus-within figcaption{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%}`,
    `button{border:1px solid ${c.accent};background:${c.accent};color:${c["on-accent"]};border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer}`,
    `.doc-link{color:${c.accent};text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}.meta{color:${c.muted};font-size:13px}.status{margin-top:16px;color:${c.muted}}.ok{color:${c.ok}}.warn{color:${c.warn}}.page-break{height:0;margin:0}`,
    `@media(max-width:700px){.doc-columns{display:block;margin-left:0;margin-right:0}.doc-column{padding:0}.doc-column+.doc-column{margin-top:10px;padding-top:10px;border-top:1px solid ${c["faint-line"]}}}`,
    // 印刷・PDF(v182)。色と点は「背景も印刷」の設定によらず出す。閉じたトグルも開いて刷る。グラフのコード・ダウンロードのボタンは刷らない。
    // 見出しの直後・表の行・図・コードの途中では改ページしにくくする。図・数式・表の直前の段落も図と同じ紙に残す(v197)。
    `@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}main{max-width:none;padding:0}h1{margin-left:0}
details::details-content{content-visibility:visible;display:block}details.toggle>summary::before{-webkit-mask-image:${mask("caret-down")};mask-image:${mask("caret-down")}}
h1,h2,h3,h4,h5,h6,details.toggle>summary{break-after:avoid}tr,img,figure,pre,.doc-chart,.doc-math,.todo,li,.numbered-item,.attachment,.toc{break-inside:avoid}thead{display:table-header-group}.page-break{break-after:page}
.doc-chart-source,.status,.attachment button{display:none}.doc-caption-table{break-after:avoid}
p:has(+ :is(.doc-chart,figure,.doc-math,table,.doc-caption-table)){break-after:avoid}}`,
  ].join("\n");

  // 2ページ以上のときだけ足す CSS。**スクリプトが動いたとき(html.doc-pages-ready)だけ**今のページ以外を隠し、
  // 目次を左ペインに、バーを上に出す。動かなければ、全ページが縦に並ぶ表示のまま、目次は本文の上にリンクの箱として出る。
  // 見た目はエディタの目次(style.css の .page-tree 一式)に合わせる。**印刷は全ページ**(2ページ目以降は改ページ)。
  const PORTABLE_PAGES_CSS = [
    `.doc-page-bar{display:none}.doc-page-tree{box-sizing:border-box;width:calc(100% - 40px);max-width:860px;margin:24px auto 0;padding:12px 14px;border:1px solid ${c["toc-line"]};border-radius:6px;background:${c["toc-bg"]}}`,
    `html.doc-pages-ready .doc-app{display:flex;align-items:flex-start;min-height:100vh}html.doc-pages-ready .doc-view{flex:1;min-width:0;overflow-x:clip}`,
    `html.doc-pages-ready .doc-page:not(.is-current){display:none}html.doc-pages-ready .doc-page>h1.page-title{margin-top:0}`,
    // ページの場所(v207。エディタの .page-path と同じ形・同じ置き方: ☰ ← → の行の下の1行に「… › 親 › 自分」)。
    `html.doc-pages-ready .doc-page-bar{flex-wrap:wrap}.doc-page-path{display:flex;flex:0 0 100%;align-items:center;min-width:0;padding:0 2px;font-size:13.5px;line-height:20px;white-space:nowrap;overflow:hidden}.doc-page-path:empty{display:none}.doc-page-path-item{flex:0 4 auto;min-width:1.5em;overflow:hidden;text-overflow:ellipsis;color:${c.muted};text-decoration:none}.doc-page-path-item:hover{color:${c.ink};text-decoration:underline}.doc-page-path-current{flex:0 1 auto;min-width:2.5em;overflow:hidden;text-overflow:ellipsis;color:${c.ink};font-weight:600}.doc-page-path-sep{flex:none;margin:0 6px;color:${c.sep}}`,
    `html.doc-pages-ready .doc-page-tree{display:block;flex:none;position:sticky;top:0;width:var(--doc-page-tree-width,240px);max-width:none;height:100vh;margin:0;overflow:auto;box-sizing:border-box;border:0;border-right:1px solid ${c.line};border-radius:0;background:${c.soft};padding:14px 8px 24px}html.doc-pages-ready .doc-page-tree.is-collapsed{display:none}`,
    // 目次の幅を変えるつまみ(v199。エディタの .page-tree-resizer と同じ形。ランタイムが目次の直後に足す)。
    `.doc-page-tree-resizer{display:none}html.doc-pages-ready .doc-page-tree-resizer{display:block;flex:none;position:sticky;top:0;align-self:flex-start;z-index:6;width:9px;height:100vh;margin:0 -4px 0 -5px;outline:0;cursor:col-resize;touch-action:none}.doc-page-tree-resizer::after{content:"";position:absolute;top:0;bottom:0;left:3px;width:3px;background:${c.accent};opacity:0;transition:opacity .12s ease}.doc-page-tree-resizer:hover::after,.doc-page-tree-resizer:focus-visible::after{opacity:.55}.doc-page-tree-resizer.resizing::after{opacity:1}html.doc-pages-ready .doc-page-tree.is-collapsed+.doc-page-tree-resizer{display:none}html.doc-page-tree-resizing,html.doc-page-tree-resizing *{cursor:col-resize!important;user-select:none}`,
    `.doc-page-tree-heading,.doc-page-tree-section{padding:2px 8px 8px;color:${c.muted};font-size:12px;font-weight:700}.doc-page-tree-section{margin-top:14px;padding-top:4px}`,
    // 親子をつなぐ線(v184。エディタの .page-tree-list と同じ形・色)。
    `.doc-page-tree ul{margin:0;padding:0}.doc-page-tree ul ul{padding-left:18px}.doc-page-tree ul>li{padding-left:0;white-space:normal}.doc-page-tree ul>li::before{content:none}.doc-page-tree ul ul>li{position:relative}.doc-page-tree ul ul>li::before,.doc-page-tree ul ul>li::after{content:"";position:absolute;left:-10px;width:auto;height:auto;border-radius:0;transform:none;background:none;pointer-events:none}.doc-page-tree ul ul>li::before{top:0;bottom:0;border-left:1px solid ${c.rule}}.doc-page-tree ul ul>li:last-child::before{bottom:auto;height:14px}.doc-page-tree ul ul>li::after{top:14px;width:13px;border-top:1px solid ${c.rule}}`,
    `.doc-page-tree-item{display:block;min-height:28px;box-sizing:border-box;padding:4px 8px;border-radius:5px;color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.doc-page-tree-item:hover{background:${c.hover}}.doc-page-tree-item.is-current{background:${c["accent-soft"]};font-weight:650}.doc-page-tree-item.is-repeated{color:${c.muted}}`,
    `html.doc-pages-ready .doc-page-bar{display:flex;gap:2px;position:sticky;top:0;z-index:5;padding:8px 12px;border-bottom:1px solid ${c["faint-line"]};background:${c["bar-bg"]}}`,
    `.doc-page-bar button svg{display:block;width:16px;height:16px;margin:auto}.doc-page-bar button{min-width:32px;min-height:32px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:${c.ink};font-size:16px;line-height:1}.doc-page-bar button:hover:not(:disabled){background:${c.hover}}.doc-page-bar button:disabled{color:${c.muted};opacity:.45;cursor:default}`,
    `@media(max-width:900px){html.doc-pages-ready .doc-page-tree,html.doc-pages-ready .doc-page-tree.is-collapsed{display:block;position:fixed;left:0;top:0;bottom:0;z-index:25;width:min(280px,85vw);height:auto;transform:translateX(-100%);transition:transform .15s ease;box-shadow:0 12px 36px ${c.shadow}}html.doc-pages-ready .doc-page-tree.is-overlay-open{transform:none}html.doc-pages-ready .doc-page-tree-resizer{display:none}}`,
    // 本文のページブロック(エディタの .page-link と同じ値。v153): 太字・リンクの青・濃い輪郭のアイコン・ホバーで下線。
    `p.page-link a{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;min-height:32px;margin-left:-6px;padding:2px 6px;border-radius:5px;color:${c.accent};font-weight:700;text-decoration:none}p.page-link a:hover{background:${c.soft}}p.page-link a:hover .page-link-title{text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px}p.page-link .page-link-icon{display:inline-flex;flex:none;width:1.1em;height:1.1em;color:${c.ink}}p.page-link .page-link-icon svg{display:block;width:100%;height:100%}`,
    `@media print{html.doc-pages-ready .doc-page:not(.is-current){display:block}.doc-page-tree,.doc-page-tree-resizer,.doc-page-bar{display:none!important}.doc-page+.doc-page{break-before:page}.doc-page>h1.page-title{margin-top:0}}`,
  ].join("\n");

  // 題名の帯・アイコン・カバー(エディタの .title-row・.page-icon・.page-cover と同じ寸法)。アイコンかカバーのあるページがある文書にだけ。
  const PORTABLE_PAGE_HEAD_CSS = `.doc-page-head{margin:0 0 26px -50px;padding-bottom:18px;background:${c["title-band"]};box-shadow:0 0 0 100vmax ${c["title-band"]},0 1px 0 100vmax ${c["title-band-line"]};clip-path:inset(-80px -100vmax -1px -100vmax)}`
    + ".doc-page-head>h1{margin:0;padding:0;background:none;box-shadow:none;clip-path:none}"
    + ".doc-page-icon{width:64px;height:64px;margin:0 0 8px;font-size:52px;line-height:64px;text-align:center;user-select:none}"
    + ".doc-page-head.page-title{margin-top:48px}html.doc-pages-ready .doc-page>.doc-page-head.page-title{margin-top:0}"
    + `.doc-cover{height:${fmt.PAGE_COVER_HEIGHT}px;margin-top:-42px}.doc-page+.doc-page>.doc-cover{margin-top:48px}html.doc-pages-ready .doc-page>.doc-cover{margin-top:-42px}html.doc-pages-ready .doc-view{position:relative}`
    + `.doc-cover img{position:absolute;left:0;right:0;width:100%;height:${fmt.PAGE_COVER_HEIGHT}px;object-fit:cover;display:block;background:${c["placeholder-bg"]}}`
    + ".doc-page-head.has-cover{margin-top:0;padding-top:42px;clip-path:inset(0 -100vmax -1px -100vmax)}"
    + ".doc-page-tree-icon{display:inline-block;width:1.25em;margin-right:.3em;text-align:center}.page-link-icon.is-emoji{display:inline-flex;align-items:center;justify-content:center;line-height:1}"
    // 紙では main の余白が 0 なので、カバーを上の余白へ引き上げない(各ページは紙の頭から始まる)。
    + "@media print{.doc-page-head{margin-left:0}.doc-page-head.page-title{margin-top:0}.doc-cover{margin-top:0!important;break-inside:avoid}}";

  // いま読んでいる所の見出し(v205。エディタの .heading-path と同じ形)。見出し1〜3がある文書にだけ。縮む割合は 親 4 : 今の見出し 1(v224)。
  const PORTABLE_HEADING_PATH_CSS = `.doc-heading-path{position:fixed;z-index:4;display:flex;align-items:center;box-sizing:border-box;height:30px;padding-right:16px;border-bottom:1px solid ${c.line};background:${c.surface};box-shadow:0 4px 10px ${c["shadow-soft"]};font-size:13.5px;line-height:1.5;white-space:nowrap;overflow:hidden}.doc-heading-path[hidden]{display:none}`
    + `.doc-heading-path button{flex:0 4 auto;min-width:2.5em;overflow:hidden;text-overflow:ellipsis;padding:0;border:0;background:none;color:${c.muted};font:inherit;font-weight:500;cursor:pointer}.doc-heading-path button:last-child{flex-shrink:1;color:${c.ink};font-weight:650}.doc-heading-path button:hover{color:${c.ink};text-decoration:underline}.doc-heading-path span{flex:none;margin:0 8px;color:${c.sep}}`
    + "@media print{.doc-heading-path{display:none!important}}";

  // 見出しの番号(v218)。番号と名前のあいだは 0.5em(エディタの ::before と同じ)。目次の番号も同じ間をあける。
  const PORTABLE_HEADING_NUMBER_CSS = ".heading-number{margin-right:.5em}.toc a .toc-number{flex:none;margin-right:.5em;font-variant-numeric:tabular-nums}";

  // ブロックの色(Issue #162)と呼び出し(Issue #161)。エディタ(style.css の .block-fg・.block-bg・.type-callout)と同じ寸法。色の値は
  // 要素の style の --block-fg・--block-bg(値は fmt.COLOR_PALETTE だけから来る)。背景は本文の左右 6px の余白まで塗る。
  const PORTABLE_BLOCK_COLOR_CSS = `.block-fg{color:var(--block-fg)}.block-fg>h6{color:inherit}ul.block-fg>li::before,details.toggle>summary.block-fg::before{background:var(--block-fg)}.block-fg>.numbered-marker{color:var(--block-fg)}.todo.block-fg:not(.done)>.todo-mark{color:${c.ink}}`
    + ".block-bg{background:var(--block-bg);border-radius:5px;box-shadow:-6px 0 0 var(--block-bg),6px 0 0 var(--block-bg)}.quote.block-bg{box-shadow:6px 0 0 var(--block-bg)}"
    + `.callout{position:relative;box-sizing:border-box;min-height:${s["block-min-height"]};margin:4px -6px;padding:10px 12px 10px 44px;border-radius:5px}.callout.block-bg{box-shadow:none}`
    + ".callout-icon{position:absolute;left:12px;top:9.25px;width:24px;height:24px;font-size:18px;line-height:24px;text-align:center;user-select:none}"
    + `.callout-text{white-space:pre-wrap;tab-size:${s["tab-size"]};overflow-wrap:anywhere}@media print{.callout{break-inside:avoid}}`;

  // 拡大表示(2026-10-23。エディタの拡大表示と同じ見た目)。画像・Mermaid の図・グラフがある文書にだけ。
  const PORTABLE_ZOOM_CSS = `.doc-zoom{position:fixed;z-index:20;inset:0;overflow:hidden;background:${c.overlay};user-select:none;touch-action:none}.doc-zoom[hidden]{display:none}`
    + `.doc-zoom.is-pannable{cursor:grab}.doc-zoom.is-dragging{cursor:grabbing}.doc-zoom img{display:block;border-radius:4px;box-shadow:0 18px 60px ${c["overlay-shadow"]}}`
    + `.doc-zoom .doc-chart.doc-zoom-svg{overflow:hidden;border-radius:4px;background:${c.surface};box-shadow:0 18px 60px ${c["overlay-shadow"]}}.doc-zoom .doc-zoom-svg svg{display:block}`
    + `.doc-zoom-bar{position:absolute;z-index:1;top:16px;right:16px;display:flex;align-items:center;gap:4px;padding:0 4px;border:1px solid ${c["overlay-line"]};border-radius:8px;background:${c["overlay-panel"]};color:${c["on-accent"]};font:13px system-ui,sans-serif}`
    + `.doc-zoom-bar button{min-width:32px;height:34px;padding:0 6px;border:0;background:none;color:${c["on-accent"]};font:inherit;font-size:15px;cursor:pointer}.doc-zoom-bar button:hover{background:${c["overlay-hover"]}}`
    + `.doc-zoom-bar button:focus-visible{outline:2px solid ${c["on-accent"]};outline-offset:-2px}.doc-zoom-level{min-width:46px;text-align:center;font-variant-numeric:tabular-nums}`
    + "figure.image-attachment img,.doc-chart-canvas svg{cursor:zoom-in}@media print{.doc-zoom{display:none!important}}";

  // ブロックへのリンク(Issue #176)で移った先を、少しの間だけ薄い黄色で知らせる(エディタの .ref-flash と同じ色)。印は SHARED_CSS.blockLink。
  const PORTABLE_BLOCK_TARGET_CSS = `.block-target{border-radius:4px}.block-target:target{animation:doc-ref-flash 1.6s ease-out}@keyframes doc-ref-flash{0%,25%{background:${c.flash}}100%{background:transparent}}`;

  // 音声(0.8.20)。ファイルのカードの下の段にプレーヤーを幅いっぱいに出す。紙には刷らない。
  const PORTABLE_AUDIO_CSS = ".audio-attachment{flex-wrap:wrap}.audio-attachment>div{flex:1 1 0;min-width:0}.audio-attachment audio{display:block;flex:1 0 100%;width:100%;height:40px}.audio-attachment .video-unplayable{flex:1 0 100%}"
    + "@media print{.audio-attachment audio{display:none}}";

  // PDF(v277)。見本・中で読むがある文書にだけ。印刷では枠を出さず、名前の囲みにする。
  const PORTABLE_PDF_CSS = `.pdf-attachment .pdf-frame{position:relative;box-sizing:border-box;width:var(--image-width,100%);overflow:hidden;border:1px solid ${c.line};border-radius:7px;background:${c["media-bg"]}}`
    + '.pdf-attachment[data-pdf-view="preview"] .pdf-frame{aspect-ratio:1/1.414;cursor:zoom-in}.pdf-attachment[data-pdf-view="read"] .pdf-frame{height:var(--pdf-height,300px)}'
    + `.pdf-frame iframe{display:block;width:100%;height:100%;border:0;background:${c.surface}}.pdf-attachment[data-pdf-view="preview"] iframe{pointer-events:none}`
    + `.pdf-fallback{display:grid;place-items:center;box-sizing:border-box;height:100%;padding:12px;color:${c.muted};font-size:13px;text-align:center}.pdf-frame.is-ready .pdf-fallback{display:none}`
    + `.pdf-open-hint{position:absolute;right:8px;bottom:8px;padding:3px 8px;border-radius:6px;background:${c["overlay-hint"]};color:${c["on-accent"]};font-size:12px;pointer-events:none}`
    + `.doc-pdf-view{position:fixed;z-index:20;inset:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 24px 24px;background:${c.overlay}}`
    + `.doc-pdf-title{color:${c["on-accent"]};font:14px system-ui,sans-serif}.doc-pdf-view iframe{flex:1;width:min(1000px,100%);border:0;border-radius:6px;background:${c["pdf-viewer-bg"]};box-shadow:0 18px 60px ${c["overlay-shadow"]}}`
    + `.doc-pdf-close{position:absolute;top:12px;right:16px;width:36px;height:36px;border:1px solid ${c["overlay-line"]};border-radius:8px;background:${c["overlay-panel"]};color:${c["on-accent"]};font-size:20px;cursor:pointer}`
    + "@media print{.doc-pdf-view{display:none!important}.pdf-frame iframe,.pdf-open-hint{display:none!important}.pdf-frame .pdf-fallback{display:grid!important}.pdf-attachment .pdf-frame{aspect-ratio:auto!important;height:auto!important}}";

  // 文書の書体・小さい文字(Issue #190。文書の設定)。小さい文字は大きさのトークンを 0.875 倍にする(エディタの .doc-text-small と同じ値)。
  // 記号(点・番号・箱・三角・呼び出しの絵文字)の縦の位置は、保存HTMLの組み方での1行目の中心へ合わせ直す。
  function portableDocumentTextCss({ fontStack = "", small = false } = {}) {
    const font = fontStack ? "main{font-family:" + fontStack + "}" : "";
    if (!small) return font;
    return font
      + "main{" + smallTextTokens() + ";font-size:" + s["font-size"] + ";--marker-line-center:12.84px}"
      + "main details.toggle>summary:has(>h2)::before{top:30.01px}main details.toggle>summary:has(>h3)::before{top:22.51px}main details.toggle>summary:has(>h4)::before{top:18.63px}"
      + "main details.toggle>summary:has(>h5)::before{top:15.8px}main details.toggle>summary:has(>h6)::before{top:12.88px}"
      + "main .callout-icon{top:7.84px}";
  }

  // 保存HTMLの <style> の中身。足すものは文書が使う部品のものだけ(無い部品の CSS は書かない)。
  function portableCss(features = {}) {
    const parts = [tokensCss(), SHARED_CSS.base, PORTABLE_BASE_CSS];
    if (features.multiPage) parts.push(PORTABLE_PAGES_CSS);
    if (features.headingPath) parts.push(PORTABLE_HEADING_PATH_CSS);
    if (features.headingNumbers) parts.push(PORTABLE_HEADING_NUMBER_CSS);
    if (features.zoom) parts.push(PORTABLE_ZOOM_CSS);
    if (features.pdf) parts.push(PORTABLE_PDF_CSS);
    if (features.blockLink) parts.push(SHARED_CSS.blockLink + PORTABLE_BLOCK_TARGET_CSS);
    if (features.blockColor) parts.push(PORTABLE_BLOCK_COLOR_CSS);
    if (features.audio) parts.push(PORTABLE_AUDIO_CSS);
    if (features.date) parts.push(SHARED_CSS.date);
    // ページのアイコン・カバー。文書の書体・小さい文字は最後に置いて、上の寸法に勝たせる。
    if (features.pageHead) parts.push(PORTABLE_PAGE_HEAD_CSS);
    const text = portableDocumentTextCss(features.documentText);
    if (text) parts.push(text);
    if (features.code) parts.push(codeTokenCss((kind) => ".tok-" + kind));
    return parts.join("\n");
  }

  return Object.freeze({
    COLORS: Object.freeze({ ...COLORS }),
    CODE_TOKEN_COLORS: Object.freeze({ ...CODE_TOKEN_COLORS }),
    SIZES: Object.freeze({ ...SIZES }),
    SHARED_CSS: Object.freeze({ ...SHARED_CSS }),
    tokensCss,
    smallTextTokens,
    codeTokenCss,
    editorCss,
    installEditorStyle,
    portableCss,
  });
})();
// エディタ(index.html の <head>)では読み込んだその場で入れる(style.css より前。最初の描画から値がそろう)。
window.DocumentStyle.installEditorStyle();
