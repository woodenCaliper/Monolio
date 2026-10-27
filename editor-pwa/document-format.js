// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
window.SingleHtmlFormat = (() => {
  // 保存ファイルの形式名。アプリ名(Monolio。v222。旧名 Pagelith)とは別のもので、変えない(変えると既存のファイルが開けなくなる)。
  const FORMAT = "SingleHtmlTechnicalDocument";
  // 0.8.0: 本文を pages[] で持つようにした(複数ページ機能 Step1)。
  // 0.8.1: 題名は各ページが持ち、manifest.title は**先頭ページの題名から導いた値**になった(Step2)。
  //        0.8.0 では manifest.title が題名そのもので、pages[0].title は "Untitled" のままのことがある
  //        (Step1 の版は題名欄を doc.title にだけ書いていた)。**意味が変わったので版を上げる**。
  // 0.8.2: ページのロック(pages[].locked。v178)。ロックしたページにだけ locked: true を書く。
  //        0.8.1 以前のファイルにはこの項目が無く、すべてロックなしとして読む。
  // 読み込みは 0.7.0 以前の blocks[] も受ける(下の pagesOf を参照)。
  // 0.8.4(v192): 改ページのブロック(type "pagebreak")。古い版の Pagelith では空の段落として見える(種類は残る)。
  // 0.8.6(v198): 本文の中の図表の参照(<span class="figure-ref" data-ref="ブロックid">)。番号は持たず、描くたびに
  //        figureNumbers で数える。古い版の Pagelith では、保存したときの番号の文字のまま見える。
  // 0.8.5(v194): Mermaid の図のブロック(type "mermaid"。コードは text、描いた SVG は mermaidSvg)。古い版の Pagelith では
  //        コードが段落の文字として見える(種類と mermaidSvg は残る)。
  // 0.8.7(v200): 本文の書式に <a href>(リンク)。行き先は http・https・mailto だけ。古い版では文字として見える(文字は残る)。
  // 0.8.9(v226): AI が読みやすい形に。manifest(文書の中身の JSON)を <head> の先頭に置き、その上にファイルの構成の注釈(英語)を書く。
  //        図の絵(mermaidSvg・chartSvg)は manifest に入れず、本文の絵(data-svg-for="ブロックid")だけに持つ(開くときは本文から拾う)。
  //        各ブロックの derived に表示用の計算済みの値(表の計算結果 values・図表の番号 label・見出しの番号 number)を添える。
  //        derived は開くときに捨てる(中身の正は rows・text など。derived は人間用の表示と同じものを AI に見せるための写し)。
  //        古い版で開くと、図はコードから描き直され、derived は使われずに残る。
  // 0.8.8(v218): 文書の設定 settings.headingNumbers(見出しに番号。入のときだけ書く。無い=切。0.8.7 以前のファイルは切)と、
  //        見出しへの参照(figure-ref の data-ref が見出しのブロックの id)。番号は持たず、描くたびに headingNumbers で数える。
  //        古い版の Pagelith では、設定は無視され(番号なし)、見出しへの参照は「参照先なし」に見える(印と id は残る)。
  // 0.8.10(v229): 表のデータベース(表のブロックの database: { columns: [{ type }] } と、リンクのセルの行き先 cell.link)。
  //        古い版の Monolio では、ただの表として見える(文字はそのまま。database は残り、cell.link は落ちる)。
  // 0.8.11(v232): 表のセルの配置 cell.align(left/center/right)と数の見せ方 cell.numberFormat({ comma, percent, decimals })、
  //        表の絞り込み tableFilter: [{ column, hide: [隠す値] }]、式の新しい書き方(文字 "…"・比べる記号・&・IF などの関数・$ の参照)。
  //        古い版の Monolio では、配置・数の見せ方・絞り込みは効かず、新しい書き方の式は #ERR に見える(式の文字は残る)。
  // 0.8.12(v235): 表を見せる高さ viewHeight(px。表のブロック。決めた表だけに書く)。超える分は表の中でスクロールし、見出しの行は
  //        上に残る(保存HTMLも同じ。印刷・PDF では全行)。古い版の Monolio では効かず、表は全部見える(値は残る)。
  // 0.8.13(v238): 表の行の高さ tableRowHeights(px の並び。0 は中身に合わせる。高さを決めた行がある表だけに書く)。高さは「最低の高さ」で、
  //        中身がそれより高ければ中身に合わせて伸びる。古い版の Monolio では効かず、行は中身の高さ(値は残る)。
  // 0.8.14(v240): 提案 suggestions(人・AI・道具が出す、まだ入れていない変更の束)。文書の中身(pages)は変えずに、変更の案だけを
  //        持つ。各提案は書き手(author: name・kind)・題・理由と、変更(changes)の並び。変更は setText(段落などの文字)・setCell(表の
  //        セル)・insertBlock(ブロックを足す)・deleteBlock(ブロックを消す)。決めた結果は変更ごとに result("accepted" / "rejected")、
  //        文字の書き換えを語句ごとに決めたときは hunkResults に残す(提案した側が、何が採られたかを読めるように)。
  //        古い版の Monolio では提案は見えず、そのまま残らない(古い版で保存し直すと消える)。
  //        採用した insertBlock は、足したブロックの id を insertedId に残す(同じ所に足す提案の順番を保つため。v241)。
  // 0.8.15(v269): 表のセルのリンク cell.link を、データベースのリンクの列だけでなく、どの表のセルにも付けられるようにした(ユーザー指示
  //        「表とデータベースは本質的に一緒。表でリンクできないのにデータベースではできる、というのはありえない」)。行き先の形は 0.8.10 と同じ。
  //        古い版の Monolio では、ふつうの表のセルのリンクは見えず文字だけになる(cell.link は残る)。
  // 0.8.16(v273): 動画の添付(video/…)をその場で再生する(再生できない環境ではファイルとして見せる)。添付のブロックの attachmentView: "file" は、画像・動画でもファイルとして
  //        見せる(ユーザー指示「ただのファイルとして表示したいときもある」。書くのは "file" のときだけ)。幅・寄せは画像と同じ imageWidth・imageAlign。
  //        古い版の Monolio では、動画はこれまでどおりファイルとして見え、attachmentView は効かない(画像は画像のまま。値は残る)。
  // 0.8.17(Issue #172): 文の書式に下線 <u> を足した(書式バー・Ctrl+U。Notion などから貼った下線も残す)。古い版の Monolio では下線だけが外れる(文字は残る)。
  // 0.8.18(Issue #174): 文中のページへのリンク。参照の印(span.figure-ref)の data-ref に、ブロックの id だけでなくページの id も入れる
  //        (「@ページ名」で入る。ページの題名を写し、題名を変えるとついてくる)。古い版の Monolio では「参照先なし」になる(文字は残る)。
  // 0.8.19(v277): PDF の添付をその場で見る(ユーザー指示「PDF をダウンロードせずに、その場で開いて閲覧できる機能がほしい」「動画のように…選べるように」)。
  //        既定は「1ページ目の見本」(押すと画面いっぱいに開く)。attachmentView: "read" は「中で読む」(低い枠の中でページをスクロール)。
  //        "file" はこれまでどおりファイルのカード。幅は imageWidth(見本の既定は 35%)。中で読むの高さは表と同じ viewHeight(px。既定 300)。古い版の Monolio では PDF はファイルのカードのまま、"read" は効かない(値は残る)。
  // 0.8.20(Issue #180): 表の絞り込みに、列ごとの条件(tableFilter の項目の condition: { op, value?, value2? }。数の = ≠ > ≥ < ≤ 範囲、
  //        文字の 含む・含まない・で始まる・で終わる、日付の 前・後・その日、空・空でない、チェックのあり・なし)と、列どうしの組み合わせ
  //        (表のブロックの tableFilterJoin: "or"。無い=AND)を足した。条件だけの列は hide を書かない。
  //        古い版の Monolio では、条件だけの列の絞り込みと OR は効かない(隠す値の絞り込みはこれまでどおり効く)。
  // 0.8.20(Issue #176): ブロックへのリンク。参照の印(span.figure-ref)に data-ref-kind="block" を付けると、data-ref はどのブロックの id でもよく
  //        (段落・箇条書き・表など)、印はそのブロックの文字(短く詰めたもの)を写す。行き先が見出し・題名つきの表と図なら、その参照と同じ文字。
  //        data-ref-kind の無い印は今までどおり(表・図・見出し・ページだけ。題名を外すと「参照先なし」)。
  //        古い版の Monolio では、見出し・表・図へのものはその参照として、ほかは「参照先なし」に見える(印と id は残る)。
  // 0.8.20(Issue #161・#162): 呼び出し(コールアウト)のブロック type "callout"(絵文字の icon と色つきの囲みの中の文。icon が無ければ 💡)と、
  //        ブロックの色 color(Notion と同じ名前: 文字の色 "red" など・背景の色 "red_background" など。どちらか1つ)。色は書式つきの本文を
  //        持つ種別(RICH_TEXT_BLOCK_TYPES)のブロック全体に効く。知らない名前・絵文字でない icon は開くときに外す。
  //        古い版の Monolio では、呼び出しは絵文字も囲みもない段落の文字として見え(種類と icon は残る)、色は効かない(color は残る)。
  // 0.8.20(Issue #171・#164 の音声): 番号付きリストの番号の形 listStyle("nested" = 1.1 の階層 / "decimal" = 1. / "alpha" = a. / "roman" = i.)。
  //        番号付きのブロックに書く(つまみのメニューで、続いている同じ段の項目すべてに書く)。段の形はその段の最初の項目の値で決まる。
  //        値が無い段は、親の段が 1. a. i. のどれかなら段の深さで 1. → a. → i. を繰り返し(Notion と同じ)、それ以外は 1.1 の階層(これまでどおり)。
  //        音声の添付(audio/…。種類が分からないときは名前の .mp3 などで見る)をその場で再生する(attachmentView: "file" でファイルとして)。
  //        古い版の Monolio では、番号は 1.1 の階層のまま、音声はファイルのカードのまま(値は残る)。
  // 0.8.20(Issue #173): 文中の日付(「@今日」「@2026-10-30」などで入る)。本文の html に
  //        <span class="date-mention" data-date="2026-10-30">2026年10月30日</span> を書く。data-date(ISO の年-月-日)が正で、文字は
  //        data-date から作り直す(開くとき・保存HTMLを書くとき)。保存HTMLでは <time class="date-mention" datetime="2026-10-30">。
  //        古い版の Monolio では、日付の文字(「2026年10月30日」)がふつうの文字として見える(押しても日付を変えられない。古い版で
  //        保存し直すと data-date は外れて文字だけになる)。
  // 0.8.20(Issue #187): ページのゴミ箱 trash。目次で「削除」したページは捨てずに trash へ入り、あとで元に戻せる(「完全に削除」で消える)。
  //        各項目は { id, deletedAt, index, page: { id, title, blocks, locked? }, links: [{ pageId, afterId, block }], cells: [{ pageId, blockId, row, col }] }。
  //        links・cells は、削除のときにほかのページから外したリンク(ページのブロック・表のリンクのセル)の元の場所で、元に戻すときにそこへ戻す。
  //        ゴミ箱のページは pages に入れない(本文・目次・保存HTMLの表示・番号・検索には出ない)。項目があるときだけ書く(無い文書の manifest は 0.8.19 と同じ形)。
  //        古い版の Monolio では trash は読まれず、ゴミ箱のページは見えない(ふつうのページとしては出ない)。古い版で保存し直すと trash は消え、
  //        ゴミ箱のページだけが使っていた添付も保存されない(そのページは完全に削除したのと同じになる)。
  // 0.8.21(Issue #190): 文書の設定に書体 settings.fontStyle("serif" = 明朝 / "mono" = 等幅。無ければ既定のゴシック)と小さい文字
  //        settings.smallText(true。本文と見出しを 0.875 倍。題名は変えない)。入のときだけ書く。知らない値は開くときに外す(既定になる)。
  //        古い版の Monolio では、既定の書体・大きさで見える(古い版は読まないので、古い版で保存し直すと設定は消える)。
  //        保存HTMLをブラウザで開いたときは、書いた CSS が効くので、どの版で作った HTML でもその書体・大きさで見える。
  // 0.8.21(Issue #184): ページのアイコン page.icon(絵文字1つ。題名の上・目次・ページのブロック)とカバー画像
  //        page.cover = { attachmentId, position }(文書の画像の添付。position は縦の位置 0〜100 の %)。持つページだけに書く。
  //        絵文字でない icon・無い添付や画像でない添付を指す cover は開くときに外す。
  //        古い版の Monolio では、アイコンもカバーも出ない(古い版はページの icon・cover を読まないので、古い版で保存し直すと消え、
  //        カバーだけが使っていた添付も保存されない)。保存HTMLをブラウザで開いたときは、書いた HTML のとおりに見える。
  // 0.8.21(Issue #178): データベースの列の種類に multi(複数選択)・status(状態)・url・email・phone・file(この文書の添付のブロックへのリンク)・
  //        created(作成日時)・edited(更新日時)を足した。中身はどれもセルの文字(「a, b」「進行中」「2026-10-26 14:05」など)で、file だけ cell.link に
  //        「#block-…」を持つ。絞り込みの条件に has・hasNot(複数選択の名前のどれかと同じ)を足した。
  //        古い版の Monolio では、知らない種類の列は文字の列として見え(文字は残る。古い版で保存し直すと種類は text になる)、has・hasNot の条件は外れる。
  // 0.8.21(Issue #179): 表のグループ分け tableGroupBy: { column, collapsed?: [畳んだ組の鍵] }(見せ方だけ。行の順・式・グラフは変えない)。
  //        manifest の derived.groups に、見える組と行([{ value, rows, collapsed? }])を添える。古い版の Monolio では効かない(値は残る)。
  // 0.8.21(Issue #163): コードのブロックの言語 language(CODE_LANGUAGES の id: "javascript"・"python" など。無ければ書式なしの文字)。
  //        エディタと保存HTMLで、字句(キーワード・文字列・注釈・数など)に色を付ける。保存HTMLの本文は <pre data-language="python"> の中に
  //        <span class="tok-keyword"> などの印を書く(中身の正は JSON の text。本文は写し)。知らない id は開くときに外す。
  //        古い版の Monolio では、色の無いコードのまま見え、言語の欄も出ない(language は残る)。
  // 保存形式の版(開くときに読む。公開版 1.0 から互換を守る。0.8.x までは公開前の版)。アプリの版(APP_VERSION)とは別の番号(HANDOVER §4.54)。
  const VERSION = "1.0";
  // このアプリの版(セマンティック バージョニング。上げるのは公開のリリースのときだけ)。保存HTMLの generator(参考。開くときには使わない)・
  // 画面の版の表示・package.json・src-tauri の Cargo.toml / tauri.conf.json の正。ほかの場所は versionSuite がここと一致するかを見張る。
  const APP_VERSION = "1.0.0";
  const CHUNK_SIZE = 64 * 1024;

  // 書式つきの本文(text と html)を持つ種別(app.js の結合・ブロックの書式・変換の基準。#206)。ブロックの色(#162)も、この種別だけに効く。
  const RICH_TEXT_BLOCK_TYPES = new Set([
    "paragraph", "heading1", "heading2", "heading3", "heading4", "heading5",
    "toggleHeading1", "toggleHeading2", "toggleHeading3", "toggleHeading4", "toggleHeading5",
    "bullet", "numbered", "todo", "toggle", "quote", "callout",
  ]);

  // ---- 色の一覧(Issue #162) ----
  // 文中の色(書式バーの文字色・背景色)とブロックの色(ブロックのメニューの「色」)は、この1つの一覧の値を使う(規則 8。値を場所ごとに
  // 書かない)。並びと名前は Notion のブロックの色と同じ(既定・グレー・茶・オレンジ・黄・緑・青・紫・ピンク・赤)。name は保存する値
  // (文字の色は name、背景の色は name + "_background"。Notion の block_color と同じ形)。
  const COLOR_PALETTE = [
    { name: "gray", label: "Gray", ja: "グレー", text: "#6b7078", background: "#eef0f2" },
    { name: "brown", label: "Brown", ja: "茶", text: "#8b5e3c", background: "#f2e9e1" },
    { name: "orange", label: "Orange", ja: "オレンジ", text: "#c45f16", background: "#feecd8" },
    { name: "yellow", label: "Yellow", ja: "黄", text: "#9a6a00", background: "#fff1a8" },
    { name: "green", label: "Green", ja: "緑", text: "#16835f", background: "#ddf3e8" },
    { name: "blue", label: "Blue", ja: "青", text: "#0b6bcb", background: "#dfeefd" },
    { name: "purple", label: "Purple", ja: "紫", text: "#7651a8", background: "#eee6f7" },
    { name: "pink", label: "Pink", ja: "ピンク", text: "#b34778", background: "#f8e2eb" },
    { name: "red", label: "Red", ja: "赤", text: "#c13f2f", background: "#fde8e5" },
  ];
  const BACKGROUND_SUFFIX = "_background";

  // ブロックの color の値として受けるか(知らない名前は false)。
  function normalizeBlockColor(value) {
    if (typeof value !== "string") return "";
    const background = value.endsWith(BACKGROUND_SUFFIX);
    const name = background ? value.slice(0, -BACKGROUND_SUFFIX.length) : value;
    return COLOR_PALETTE.some((item) => item.name === name) ? value : "";
  }

  // ---- 呼び出し(コールアウト。Issue #161) ----
  // 絵文字は押して選び直せる(よく使うものの一覧。自由な絵文字の選び方は #175)。icon が無いときは 💡。
  const CALLOUT_DEFAULT_ICON = "💡";
  const CALLOUT_ICONS = ["💡", "⚠️", "❗", "❓", "ℹ️", "✅", "❌", "📌", "📝", "📎", "🔥", "⭐", "🚧", "🔒", "💬", "🎯"];
  // 呼び出しの絵文字として受ける文字(開いたファイル・貼り付けは信用しない)。絵文字とその部品(肌の色・ZWJ・異体字の印・旗・キーキャップ)
  // だけの短い文字。書き出すときは必ず escapeHtml を通すので、ここは「絵文字らしくないものを持ち込ませない」ための形の検査。
  const CALLOUT_ICON_PATTERN = /^[\p{Extended_Pictographic}\p{Regional_Indicator}‍︎️⃣\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}#*0-9]+$/u;
  function isCalloutIcon(value) {
    return typeof value === "string" && value.length <= 32 && CALLOUT_ICON_PATTERN.test(value)
      && /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u.test(value);
  }
  function calloutIcon(block) {
    return isCalloutIcon(block?.icon) ? block.icon : CALLOUT_DEFAULT_ICON;
  }

  // ブロックに効く色(エディタと保存HTMLが同じこれを使う。P7)。{ text, background } に色の値(# の6桁)。効かないものは空。
  // 呼び出しは、背景の色を選んでいなければグレーの背景(Notion の呼び出しの既定と同じ)。文字の色を選んでも囲みは残る。
  function blockColorOf(block) {
    const out = { text: "", background: "" };
    if (!block || !RICH_TEXT_BLOCK_TYPES.has(block.type)) return out;
    const value = normalizeBlockColor(block.color);
    const background = value.endsWith(BACKGROUND_SUFFIX);
    const entry = COLOR_PALETTE.find((item) => item.name === (background ? value.slice(0, -BACKGROUND_SUFFIX.length) : value));
    if (entry && background) out.background = entry.background;
    else if (entry) out.text = entry.text;
    if (block.type === "callout" && !out.background) out.background = COLOR_PALETTE[0].background;
    return out;
  }

  // 保存HTMLの要素に付ける class と style(色の印)。classes は元から付ける class(そのまま前に置く。色の無いブロックの出力は以前と同じ)。
  function blockColorAttrs(block, classes = "") {
    const color = blockColorOf(block);
    const list = classes ? [classes] : [];
    const style = [];
    if (color.text) {
      list.push("block-fg");
      style.push("--block-fg:" + color.text);
    }
    if (color.background) {
      list.push("block-bg");
      style.push("--block-bg:" + color.background);
    }
    return (list.length ? ' class="' + list.join(" ") + '"' : "") + (style.length ? ' style="' + style.join(";") + '"' : "");
  }

  // ---- コードの言語と色分け(Issue #163。形式 0.8.21) ----
  // コードのブロックは language に言語の id を持つ(無い = 書式なしの文字。Notion の「Plain Text」と同じ既定)。中身(text)は今までどおり
  // 素の文字で、色はその文字から毎回作る(エディタは CSS Custom Highlight API で本文の DOM に触らずに塗る。保存HTMLは <span class="tok-…"> を書く)。
  // 字句の分け方はこの1か所(エディタと保存HTMLが同じ codeTokens を使う。P7)。言語ごとの小さな規則(キーワード・文字列・注釈・数など)で、
  // 外のライブラリは入れない(P24)。一覧の並びは Notion と同じく名前の順。id は保存する値なので変えないこと。
  const CODE_LANGUAGES = [
    { id: "bash", label: "Bash / Shell", aliases: ["sh", "shell", "zsh", "console", "shellscript", "shell script"] },
    { id: "c", label: "C", aliases: ["h"] },
    { id: "cpp", label: "C++", aliases: ["c++", "cc", "cxx", "hpp", "h++"] },
    { id: "csharp", label: "C#", aliases: ["c#", "cs"] },
    { id: "css", label: "CSS", aliases: ["scss", "less", "sass"] },
    { id: "go", label: "Go", aliases: ["golang"] },
    { id: "html", label: "HTML", aliases: ["htm", "xhtml"] },
    { id: "java", label: "Java", aliases: [] },
    { id: "javascript", label: "JavaScript", aliases: ["js", "jsx", "mjs", "cjs", "node"] },
    { id: "json", label: "JSON", aliases: ["jsonc", "json5"] },
    { id: "markdown", label: "Markdown", aliases: ["md"] },
    { id: "python", label: "Python", aliases: ["py", "python3"] },
    { id: "rust", label: "Rust", aliases: ["rs"] },
    { id: "sql", label: "SQL", aliases: ["mysql", "postgresql", "postgres", "sqlite", "plsql", "tsql"] },
    { id: "typescript", label: "TypeScript", aliases: ["ts", "tsx"] },
    { id: "xml", label: "XML", aliases: ["svg", "xsl", "xslt", "plist"] },
    { id: "yaml", label: "YAML", aliases: ["yml"] },
  ];
  const CODE_LANGUAGE_IDS = new Set(CODE_LANGUAGES.map((item) => item.id));
  const CODE_PLAIN_LABEL = "Plain text";
  const codeLanguageNames = new Map();
  CODE_LANGUAGES.forEach((item) => [item.id, item.label, ...item.aliases].forEach((name) => codeLanguageNames.set(name.toLowerCase(), item.id)));
  // 名前(id・表示名・よくある別名・Notion の言語名・Markdown の「```」の後ろ・HTML の class="language-…")から id を引く。
  // 知らない名前・書式なし(Plain Text)は ""。
  function codeLanguageId(value) {
    if (typeof value !== "string") return "";
    return codeLanguageNames.get(value.trim().toLowerCase().replace(/^(?:language|lang)-/, "")) || "";
  }
  // ブロックに効く言語(コードのブロックで、知っている id のときだけ。ほかは "")。
  function codeLanguageOf(block) {
    return block?.type === "code" && CODE_LANGUAGE_IDS.has(block.language) ? block.language : "";
  }
  function codeLanguageLabel(id) {
    return CODE_LANGUAGES.find((item) => item.id === id)?.label || CODE_PLAIN_LABEL;
  }

  // 字句の種類。色は document-style.js の CODE_TOKEN_COLORS(エディタの ::highlight(code-…) と保存HTMLの .tok-… の両方をそこから作る)。
  const CODE_TOKEN_KINDS = ["keyword", "string", "comment", "number", "function", "tag", "attr", "meta", "variable", "heading"];
  // これより長いコードは色を付けない(打鍵のたびに全体を数え直すため。素の文字のままで編集はできる)。
  const CODE_HIGHLIGHT_MAX_LENGTH = 300000;

  const codeWords = (list) => new Set(list.split(" "));
  const CODE_RE = {
    blockComment: /\/\*[\s\S]*?(?:\*\/|$)/y,
    lineComment: /\/\/.*/y,
    dq: /"(?:\\[\s\S]|[^"\\\n])*"?/y,
    sq: /'(?:\\[\s\S]|[^'\\\n])*'?/y,
    backtick: /`(?:\\[\s\S]|[^`\\])*`?/y,
    number: /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.(?!\.)[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[A-Za-z]*/y,
    space: /\s+/y,
  };
  function codeFollowedBy(re, text, at) {
    re.lastIndex = at;
    return re.test(text);
  }
  function codeAtLineStart(text, at) {
    for (let k = at - 1; k >= 0; k -= 1) {
      const ch = text[k];
      if (ch === "\n") return true;
      if (ch !== " " && ch !== "\t") return false;
    }
    return true;
  }
  // 合った字句を足す(隣り合う同じ種類はつなぐ)。out は [始め, 終わり, 種類] を平らに並べた配列。
  function pushCodeToken(out, start, end, kind) {
    const last = out.length - 3;
    if (last >= 0 && out[last + 1] === start && out[last + 2] === kind) out[last + 1] = end;
    else out.push(start, end, kind);
  }
  // 規則 [sticky な正規表現, 種類] を前から試し、最初に合ったものを取る。種類は文字列・null(色なし)・関数(合った文字・位置・
  // 全体・状態から種類を返す。false なら次の規則へ)。どれにも合わなければ1字進む。
  function scanCode(text, rules, out, state = {}, from = 0, to = text.length) {
    let at = from;
    while (at < to) {
      let next = at + 1;
      for (const rule of rules) {
        const re = rule[0];
        re.lastIndex = at;
        const match = re.exec(text);
        if (!match || !match[0].length) continue;
        const kind = typeof rule[1] === "function" ? rule[1](match, at, text, state) : rule[1];
        if (kind === false) continue;
        const end = Math.min(to, at + match[0].length);
        if (kind) pushCodeToken(out, at, end, kind);
        next = end;
        break;
      }
      at = next;
    }
  }
  // 名前の規則: キーワード・決まった値(true など。数と同じ色)・関数の呼び出し(直後が「(」)。macro は Rust の println! など。
  function codeWordRule(keywords, constants, { ignoreCase = false, macro = false, pattern = /[A-Za-z_$][\w$]*/y } = {}) {
    return [pattern, (match, at, text) => {
      const word = ignoreCase ? match[0].toLowerCase() : match[0];
      if (keywords.has(word)) return "keyword";
      if (constants.has(word)) return "number";
      const after = text.charCodeAt(at + match[0].length);
      if (after === 40) return "function";
      if (macro && after === 33 && text.charCodeAt(at + match[0].length + 1) !== 61) return "function";
      return null;
    }];
  }
  // C の仲間(C・C++・C#・Java・JavaScript・TypeScript・Go・Rust)の規則。strings は言語ごとの文字列の形(既定の "…"・'…' より先に試す)。
  function cLikeRules({ keywords, constants, strings = [], singleQuote = true, preprocessor = false, annotations = false, macro = false }) {
    return [
      [CODE_RE.blockComment, "comment"],
      [CODE_RE.lineComment, "comment"],
      ...(preprocessor ? [[/#[ \t]*[A-Za-z]+[^\n]*/y, (match, at, text) => (codeAtLineStart(text, at) ? "meta" : false)]] : []),
      ...strings,
      [CODE_RE.dq, "string"],
      ...(singleQuote ? [[CODE_RE.sq, "string"]] : []),
      ...(annotations ? [[/@[A-Za-z_][\w.]*/y, "meta"]] : []),
      codeWordRule(keywords, constants, { macro }),
      [CODE_RE.number, "number"],
      [CODE_RE.space, null],
      [/[^\w\s$"'`\/#@.]+/y, null],
    ];
  }
  const C_KEYWORDS = "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool bool size_t";
  const JS_KEYWORDS = "async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield";
  const CODE_RULES = {
    javascript: cLikeRules({ keywords: codeWords(JS_KEYWORDS), constants: codeWords("true false null undefined NaN Infinity"),
      strings: [[CODE_RE.backtick, "string"]], annotations: true }),
    typescript: cLikeRules({
      keywords: codeWords(JS_KEYWORDS + " abstract as declare enum implements interface keyof namespace private protected public readonly type infer is satisfies unique module override any boolean number string symbol unknown never object bigint"),
      constants: codeWords("true false null undefined NaN Infinity"), strings: [[CODE_RE.backtick, "string"]], annotations: true }),
    c: cLikeRules({ keywords: codeWords(C_KEYWORDS), constants: codeWords("NULL true false"), preprocessor: true }),
    cpp: cLikeRules({
      keywords: codeWords(C_KEYWORDS + " alignas alignof and asm catch class co_await co_return co_yield concept constexpr consteval constinit const_cast decltype delete dynamic_cast explicit export final friend mutable namespace new noexcept not operator or override private protected public reinterpret_cast requires static_assert static_cast template this thread_local throw try typeid typename using virtual wchar_t"),
      constants: codeWords("true false nullptr NULL"), preprocessor: true,
      strings: [[/R"([^()\\\s]{0,16})\([\s\S]*?(?:\)\1"|$)/y, "string"]] }),
    csharp: cLikeRules({
      keywords: codeWords("abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double dynamic else enum event explicit extern finally fixed float for foreach get goto if implicit in init int interface internal is lock long namespace new object operator out override params partial private protected public readonly record ref required return sbyte sealed set short sizeof stackalloc static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile when where while yield"),
      constants: codeWords("true false null"), preprocessor: true,
      strings: [[/@\$?"(?:""|[^"])*"?/y, "string"], [/\$@?"(?:\\[\s\S]|[^"\\\n])*"?/y, "string"]] }),
    java: cLikeRules({
      keywords: codeWords("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package permits private protected public record return sealed short static strictfp super switch synchronized this throw throws transient try var void volatile while yield"),
      constants: codeWords("true false null"), annotations: true, strings: [[/"""[\s\S]*?(?:"""|$)/y, "string"]] }),
    go: cLikeRules({
      keywords: codeWords("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var any bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr"),
      constants: codeWords("true false nil iota"), strings: [[CODE_RE.backtick, "string"]] }),
    rust: cLikeRules({
      keywords: codeWords("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box"),
      constants: codeWords("true false None"), singleQuote: false, macro: true,
      strings: [
        [/b?r(#*)"[\s\S]*?(?:"\1|$)/y, "string"],
        [/b?"(?:\\[\s\S]|[^"\\])*"?/y, "string"],
        [/b?'(?:\\(?:x[\da-fA-F]{2}|u\{[\da-fA-F]{1,6}\}|.)|[^\\'\n])'/y, "string"],
        [/'[A-Za-z_]\w*/y, "meta"],
        [/#!?\[[^\]\n]*\]?/y, "meta"],
      ] }),
    python: [
      [/#.*/y, "comment"],
      [/(?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?)/y, "string"],
      [/@[A-Za-z_][\w.]*/y, "meta"],
      codeWordRule(codeWords("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case"),
        codeWords("True False None"), { pattern: /[A-Za-z_]\w*/y }),
      [CODE_RE.number, "number"],
      [CODE_RE.space, null],
      [/[^\w\s"'#@.]+/y, null],
    ],
    json: [
      [CODE_RE.lineComment, "comment"],
      [CODE_RE.blockComment, "comment"],
      [CODE_RE.dq, (match, at, text) => (codeFollowedBy(/\s*:/y, text, at + match[0].length) ? "attr" : "string")],
      [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y, "number"],
      [/[A-Za-z_]\w*/y, (match) => (match[0] === "true" || match[0] === "false" || match[0] === "null" ? "number" : null)],
      [CODE_RE.space, null],
      [/[^\s"\/\w-]+/y, null],
    ],
    yaml: [
      [/(?<!\S)#.*/y, "comment"],
      [/^(?:---|\.\.\.)(?=\s|$)/my, "meta"],
      [CODE_RE.dq, (match, at, text) => (codeFollowedBy(/[ \t]*:(?=\s|$)/my, text, at + match[0].length) ? "attr" : "string")],
      [/'(?:''|[^'\n])*'?/y, (match, at, text) => (codeFollowedBy(/[ \t]*:(?=\s|$)/my, text, at + match[0].length) ? "attr" : "string")],
      [/[^\s#'"{}\[\],&*!|>%@`-][^\n:#]{0,200}?(?=[ \t]*:(?:[ \t]|$))/my, "attr"],
      [/[&*][\w-]+/y, "variable"],
      [/!!?[\w\/.-]*/y, "meta"],
      [/[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?=[ \t]*(?:$|#|,|\]|\}))/my, "number"],
      [/~(?=[ \t]*(?:$|#|,|\]|\}))/my, "number"],
      [/[A-Za-z_][\w-]*/y, (match, at, text) => (["true", "false", "null", "yes", "no", "on", "off"].includes(match[0].toLowerCase())
        && codeFollowedBy(/[ \t]*(?:$|#|,|\]|\})/my, text, at + match[0].length) ? "number" : null)],
      [CODE_RE.space, null],
      [/[^\s#"'&*!\w~.+-]+/y, null],
    ],
    css: [
      [CODE_RE.blockComment, "comment"],
      [CODE_RE.dq, "string"],
      [CODE_RE.sq, "string"],
      [/@[\w-]+/y, (match, at, text, state) => { state.prelude = true; return "keyword"; }],
      [/[{};]/y, (match, at, text, state) => { state.value = false; state.prelude = false; return null; }],
      [/!\s*important\b/yi, "keyword"],
      [/-{0,2}[A-Za-z_][\w-]*(?=\s*:)/y, (match, at, text, state) => {
        if (state.value) return false;
        if (state.prelude) return "attr";
        if (!codeFollowedBy(/\s*:[^;{}]{0,500}(?:[;}]|$)/y, text, at + match[0].length)) return false;
        state.value = true;
        return "attr";
      }],
      [/::?[A-Za-z-][\w-]*/y, (match, at, text, state) => (state.value || state.prelude ? false : "meta")],
      [/-?[A-Za-z_][\w-]*(?=\()/y, "function"],
      [/#[\w-]+/y, (match, at, text, state) => (state.value ? (/^#[\da-fA-F]{3,8}$/.test(match[0]) ? "number" : null) : "tag")],
      [/(?:\d+\.?\d*|\.\d+)(?:%|[A-Za-z]+)?/y, "number"],
      [/\.[A-Za-z_-][\w-]*/y, (match, at, text, state) => (state.value || state.prelude ? null : "tag")],
      [/-{0,2}[A-Za-z_][\w-]*/y, (match, at, text, state) => (state.value || state.prelude ? null : "tag")],
      [CODE_RE.space, null],
      [/[^\s\w"'@{};!:#.\/-]+/y, null],
    ],
    sql: [
      [/--.*/y, "comment"],
      [CODE_RE.blockComment, "comment"],
      [/'(?:''|[^'])*'?/y, "string"],
      [/"(?:""|[^"\n])*"?|`[^`\n]*`?/y, "attr"],
      [/[@:$][A-Za-z_]\w*/y, (match, at, text) => (text[at - 1] === ":" ? false : "variable")],
      codeWordRule(codeWords("add all alter and any as asc begin between by case cast check column commit constraint create cross database default delete desc distinct drop else end except exists foreign from full function group having if in index inner insert intersect into is join key left like limit merge not null offset on or order outer over partition primary procedure references replace returning right rollback select set table then to transaction trigger truncate union unique update using values view when where with int integer bigint smallint decimal numeric float real double varchar char text date time timestamp boolean serial"),
        codeWords("true false"), { ignoreCase: true, pattern: /[A-Za-z_]\w*/y }),
      [CODE_RE.number, "number"],
      [CODE_RE.space, null],
      [/[^\s\w'"`@:$\/-]+/y, null],
    ],
    bash: [
      [/#!.*/y, (match, at) => (at === 0 ? "meta" : false)],
      [/\\[\s\S]/y, null],
      [/(?<![^\s;&|(){}])#.*/y, "comment"],
      [/"(?:\\[\s\S]|[^"\\])*"?/y, "string"],
      [/\$'(?:\\[\s\S]|[^'\\])*'?/y, "string"],
      [/'[^']*'?/y, "string"],
      [/\$(?:\{[^}\n]*\}?|[A-Za-z_]\w*|[0-9#?@*$!-])/y, "variable"],
      [/[A-Za-z_]\w*(?==)/y, "variable"],
      [/[A-Za-z_][\w-]*/y, (match) => {
        if (BASH_KEYWORDS.has(match[0])) return "keyword";
        return BASH_BUILTINS.has(match[0]) ? "function" : null;
      }],
      [/\d+\b/y, "number"],
      [CODE_RE.space, null],
      [/[^\s\w"'$#\\]+/y, null],
    ],
    markdown: [
      [/^[ \t]*(`{3,}|~{3,})[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/my, "string"],
      [/^#{1,6}(?=[ \t]|$).*/my, "heading"],
      [/^[ \t]*>.*/my, "comment"],
      [/^[ \t]*(?:[-*_][ \t]*){3,}$/my, "meta"],
      [/^[ \t]*(?:[-*+]|\d{1,9}[.)])(?=[ \t])/my, "keyword"],
      [/<!--[\s\S]*?(?:-->|$)/y, "comment"],
      [/`[^`\n]*`/y, "string"],
      [/\*\*[^*\n]+\*\*|__[^_\n]+__/y, "variable"],
      [/\*[^*\s][^*\n]*\*|(?<!\w)_[^_\s][^_\n]*_(?!\w)/y, "variable"],
      [/!?\[[^\]\n]*\]\([^)\n]*\)/y, "attr"],
      [/<\/?[A-Za-z][^>\n]*>/y, "tag"],
      [/\n|[ \t]+/y, null],
      [/[^\s`*_\[!<#>~\d+=|-]+/y, null],
    ],
  };
  const BASH_KEYWORDS = codeWords("if then else elif fi for while until do done case esac in function select time return exit export local readonly declare unset shift source alias break continue eval exec set trap");
  const BASH_BUILTINS = codeWords("echo printf read cd pwd test");

  // HTML・XML。タグの中(属性の名前と値)と外(文字・実体参照)で分ける。HTML の <script>・<style> の中は JavaScript・CSS の規則で分ける。
  function scanMarkup(text, out, html) {
    const lower = html ? text.toLowerCase() : "";
    const tagOpen = /<\/?([A-Za-z][\w:.-]*)/y;
    const attrName = /[^\s"'>\/=]+/y;
    const attrValue = /"[^"]*"?|'[^']*'?|[^\s>"']+/y;
    const entity = /&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][\w]*);/y;
    const len = text.length;
    const skipTo = (from, marker) => {
      const found = text.indexOf(marker, from);
      return found < 0 ? len : found + marker.length;
    };
    let at = 0;
    while (at < len) {
      const lt = text.indexOf("<", at);
      const amp = text.indexOf("&", at);
      const next = Math.min(lt < 0 ? len : lt, amp < 0 ? len : amp);
      if (next > at) {
        at = next;
        continue;
      }
      if (text[at] === "&") {
        entity.lastIndex = at;
        const match = entity.exec(text);
        if (match) pushCodeToken(out, at, at + match[0].length, "meta");
        at += match ? match[0].length : 1;
        continue;
      }
      if (text.startsWith("<!--", at)) {
        const end = skipTo(at + 4, "-->");
        pushCodeToken(out, at, end, "comment");
        at = end;
        continue;
      }
      if (text.startsWith("<![CDATA[", at)) {
        const end = skipTo(at + 9, "]]>");
        pushCodeToken(out, at, end, "string");
        at = end;
        continue;
      }
      if (text.startsWith("<!", at) || text.startsWith("<?", at)) {
        const end = skipTo(at + 2, text[at + 1] === "?" ? "?>" : ">");
        pushCodeToken(out, at, end, "meta");
        at = end;
        continue;
      }
      tagOpen.lastIndex = at;
      const open = tagOpen.exec(text);
      if (!open) {
        at += 1;
        continue;
      }
      pushCodeToken(out, at, at + open[0].length, "tag");
      const name = open[1].toLowerCase();
      const closing = open[0][1] === "/";
      at += open[0].length;
      while (at < len) {
        const ch = text[at];
        if (ch === ">" || (ch === "/" && text[at + 1] === ">")) {
          const end = at + (ch === ">" ? 1 : 2);
          pushCodeToken(out, at, end, "tag");
          at = end;
          break;
        }
        if (ch === "<") break;
        if (/\s/.test(ch)) {
          at += 1;
          continue;
        }
        if (ch === "=") {
          at += 1;
          while (at < len && /[ \t]/.test(text[at])) at += 1;
          attrValue.lastIndex = at;
          const value = attrValue.exec(text);
          if (value) {
            pushCodeToken(out, at, at + value[0].length, "string");
            at += value[0].length;
          }
          continue;
        }
        attrName.lastIndex = at;
        const attr = attrName.exec(text);
        if (attr) {
          pushCodeToken(out, at, at + attr[0].length, "attr");
          at += attr[0].length;
        } else {
          at += 1;
        }
      }
      if (html && !closing && (name === "script" || name === "style")) {
        const close = lower.indexOf("</" + name, at);
        const end = close < 0 ? len : close;
        scanCode(text, name === "script" ? CODE_RULES.javascript : CODE_RULES.css, out, {}, at, end);
        at = end;
      }
    }
  }

  // コードの字句の並び。[始め, 終わり, 種類] を平らに並べた配列(文字の位置は text の位置。色の無い所は含まない)。
  function codeTokens(text, language) {
    const source = typeof text === "string" ? text : "";
    const out = [];
    if (!source || source.length > CODE_HIGHLIGHT_MAX_LENGTH || !CODE_LANGUAGE_IDS.has(language)) return out;
    if (language === "html" || language === "xml") scanMarkup(source, out, language === "html");
    else scanCode(source, CODE_RULES[language], out, {});
    return out;
  }

  // 保存HTMLの <pre> の中身(色の印つき)。言語の無いコードは今までどおり素の文字だけ。
  function highlightedCodeHtml(text, language) {
    const source = typeof text === "string" ? text : String(text ?? "");
    const tokens = codeTokens(source, language);
    let html = "";
    let at = 0;
    for (let k = 0; k < tokens.length; k += 3) {
      if (tokens[k] > at) html += escapeHtml(source.slice(at, tokens[k]));
      html += '<span class="tok-' + tokens[k + 2] + '">' + escapeHtml(source.slice(tokens[k], tokens[k + 1])) + "</span>";
      at = tokens[k + 1];
    }
    return html + escapeHtml(source.slice(at));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  // JSON を <script> に埋める。"<" をすべて \u003c にする(JSON.parse で元の文字に戻る)。以前は小文字の "</script" だけを
  // 置き換えていたので、本文の "</SCRIPT>" や "<!--<script>" でスクリプトが途中で閉じ、保存したファイルが開けなくなり、
  // 閉じた後ろの文字が HTML として読まれていた(v213)。
  function escapeScriptJson(value) {
    return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
  }

  function renderInlineMarkdown(value) {
    const text = String(value ?? "");
    const pattern = /`([^`\n]+)`|\$\$([^$\n]+?)\$\$/g;
    let html = "";
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text))) {
      html += escapeHtml(text.slice(cursor, match.index));
      if (match[1] !== undefined) html += '<code class="inline-code">' + escapeHtml(match[1]) + "</code>";
      else html += renderInlineMathHtml(match[2]);
      cursor = match.index + match[0].length;
    }
    return html + escapeHtml(text.slice(cursor));
  }

  // 書体名の一部が数字で始まると、引用符が無い font-family 指定は無効になる。
  // 例: M PLUS 1 Code。そのまま代入するとスタイルが空になるため整える。
  // 複数指定は名前ごとに見る。1つでも無効な名前があると指定が丸ごと捨てられる。
  function cssFontFamilyValue(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.split(",").map(cssFontFamilyName).filter(Boolean).join(", ");
  }

  // generic family（monospace など）は引用符を付けると効かなくなるため、
  // 識別子として通る名前はそのままにする。
  function cssFontFamilyName(value) {
    const name = String(value || "").trim();
    if (!name) return "";
    if (/^(".*"|'.*')$/.test(name)) return name;
    return /^[A-Za-z_-][\w-]*(\s+[A-Za-z_-][\w-]*)*$/.test(name)
      ? name
      : '"' + name.replaceAll('"', "") + '"';
  }

  // 書き出し中の参照の行き先(図表と見出し。renderPortableBlocks が設定する。本文の参照の文字とリンク先に使う。v198・v218)。
  let activeRefTargets = null;
  // 書き出し中の見出しの番号(v218。見出しに番号が切なら空の Map)。
  let activeHeadingNumbers = null;

  // ---- リンク(v200。ユーザー指示「URL などにリンクを付与する機能」。v202: 自動で付くのは「URL だけを貼り付けたとき」に限る) ----
  // リンクは、付けたもの(リンクのボタン・URL の貼り付け)だけ。書いてある URL の文字を勝手にリンクにしない
  // (v200 では表示・保存のたびに URL をリンクにしていて、外したリンクが描き直しで戻っていた。ユーザー指摘)。
  // 行き先は http・https・mailto だけ(javascript: などは文字に戻す)。空白や < > " を含むものも受けない。
  function safeLinkHref(value) {
    const href = String(value ?? "").trim();
    if (/^https?:\/\/[^\s<>"]+$/i.test(href) || /^mailto:[^\s<>"]+$/i.test(href)) return href;
    return null;
  }
  // ---- 表のセルの数と書式(v232。ユーザー指示「全部対応してほしい」: 配置・数の見せ方) ----
  // セルの文字を数として読む(v213)。ふつうの10進の数(符号・小数点・指数、桁区切りのカンマ)だけを数にする。
  // 「0x10」「0b11」のような書き方は数にしない。全角の数字・符号・小数点・カンマも数として読む(v221)。数でなければ null。
  // エディタの計算と、保存HTMLの数の見せ方が同じ読み方をするよう、ここに置く(P25)。
  const TABLE_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
  function parseTableNumberText(text) {
    const value = String(text ?? "").trim()
      .replace(/[\uFF10-\uFF19\uFF0B\uFF0C\uFF0D\uFF0E]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
      .replace(/,/g, "");
    if (!TABLE_NUMBER_PATTERN.test(value)) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  // 数を文字にする(式の結果の見せ方)。ふつうの大きさ(0.0001 以上 1e21 未満)は小数 10 桁で丸める(0.1 + 0.2 → 0.3)。
  // それより小さい・大きい値は有効数字 12 桁で丸める(v213)。
  function formatNumberValue(value) {
    const size = Math.abs(value);
    if (size === 0) return "0";
    // 端数のある値は、さらに有効数字15桁で丸める(v248。Issue #83。Excel と同じ桁。1e10 倍の丸めはおよそ 9e5 を超えると 2^53 を超えて
    // 効かず、=1234567+0.1+0.1 が 1234567.2000000002 と見えていた。整数はそのまま)。
    if (size >= 1e-4 && size < 1e21) {
      const rounded = Math.round(value * 1e10) / 1e10;
      return String(Number.isInteger(rounded) ? rounded : Number(rounded.toPrecision(15)));
    }
    return String(Number(value.toPrecision(12)));
  }
  // 四捨五入(0 から遠い方へ。Excel の ROUND と同じ)。digits が負なら整数の位で丸める(ROUND(1234, -2) = 1200)。
  // 2進の誤差で 1.005 が 1.00 にならないよう、10進の文字のまま桁をずらす。
  function roundHalfAwayFromZero(value, digits) {
    if (!Number.isFinite(value)) return value;
    const sign = value < 0 ? -1 : 1;
    const base = Number(Math.abs(value).toPrecision(15));
    const text = String(base);
    if (text.includes("e")) return sign * (Math.round(base * Math.pow(10, digits)) / Math.pow(10, digits));
    const rounded = Math.round(Number(text + "e" + digits));
    return sign * Number(rounded + "e" + (-digits));
  }
  // セルの文字の配置。left / center / right のどれか(無ければ "")。
  const TABLE_CELL_ALIGNS = ["left", "center", "right"];
  function tableCellAlign(cell) {
    return TABLE_CELL_ALIGNS.includes(cell?.align) ? cell.align : "";
  }
  // 数の見せ方(セルの numberFormat)。{ comma: 桁区切り, percent: 百分率, decimals: 小数の桁(0〜10) }。中身の文字は変えない。
  // 何も無ければ null。
  function normalizeNumberFormat(value) {
    if (!value || typeof value !== "object") return null;
    const next = {};
    if (value.comma === true) next.comma = true;
    if (value.percent === true) next.percent = true;
    const decimals = Number(value.decimals);
    if (value.decimals !== undefined && value.decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 10) next.decimals = decimals;
    return Object.keys(next).length ? next : null;
  }
  // 数を、決めた見せ方の文字にする(数でなければ元の文字のまま)。桁を決めていなければ、その数の桁のまま(百分率は整数)。
  function formatTableNumber(text, format) {
    const style = normalizeNumberFormat(format);
    if (!style) return text;
    const value = parseTableNumberText(text);
    if (value === null) return text;
    const shown = style.percent ? value * 100 : value;
    if (!Number.isFinite(shown) || Math.abs(shown) >= 1e21) return text;
    const decimals = style.decimals ?? (style.percent ? 0 : null);
    let body = decimals === null ? formatNumberValue(shown) : roundHalfAwayFromZero(shown, decimals).toFixed(decimals);
    if (/^-0(\.0*)?$/.test(body)) body = body.slice(1);
    if (style.comma && !/e/i.test(body)) {
      body = body.replace(/^(-?)(\d+)/, (match, sign, digits) => sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
    }
    return body + (style.percent ? "%" : "");
  }
  // いま見えている小数の桁(「小数の桁を増やす・減らす」の起点。Excel と同じく、今の見え方から1つずつ)。
  function shownDecimals(text, format) {
    const style = normalizeNumberFormat(format);
    if (style?.decimals !== undefined) return style.decimals;
    const value = parseTableNumberText(text);
    if (value === null) return 0;
    if (style?.percent) return 0;
    const match = /\.(\d+)/.exec(formatNumberValue(value).replace(/e.*$/i, ""));
    return match ? match[1].length : 0;
  }

  // ---- 表の絞り込み(v232) ----
  // 表のブロックの tableFilter: [{ column, hide: [隠す値…] }]。値はセルの見える文字(式は計算した結果。数の見せ方を付ける前)の
  // 前後の空白を除いたもの。隠す値で持つので、あとから足した行(新しい値)は見える(Excel の「選んだ値だけ見せる」とは逆の持ち方)。
  // 見出しの行(ヘッダー行・データベースの1行目)は隠さない。縦に結合したセルのある表では、絞り込みを止める(行を隠すと結合が崩れる)。
  // Issue #180(形式 0.8.20): 列ごとの条件 condition: { op, value?, value2? } と、列どうしの組み合わせ(表のブロックの
  // tableFilterJoin: "or"。無い=AND。"or" のときだけ書く)を足した。1つの列の中は「隠す値でない」かつ「条件に合う」で見せる。
  // 列どうしは AND(どの列も合う行を見せる。既定。Excel のフィルターと同じ)か OR(どれかの列が合う行を見せる。Notion の「または」)。
  // 条件だけの列は hide を書かない({ column, condition })。古い版の Monolio では条件だけの列の絞り込みは外れ(hide の無い項目は捨てる)、
  // OR は効かない(AND で見る)。隠す値はこれまでどおり効く。
  function normalizeTableFilter(value, columnCount) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const filters = [];
    value.forEach((entry) => {
      const column = Number(entry?.column);
      if (!Number.isInteger(column) || column < 0 || column >= columnCount || seen.has(column)) return;
      const hide = [...new Set((Array.isArray(entry.hide) ? entry.hide : []).map((item) => String(item ?? "").trim()))];
      const condition = normalizeTableFilterCondition(entry.condition);
      if (!hide.length && !condition) return;
      seen.add(column);
      const filter = { column };
      if (hide.length) filter.hide = hide;
      if (condition) filter.condition = condition;
      filters.push(filter);
    });
    return filters.sort((a, b) => a.column - b.column);
  }
  // 条件の種類(Issue #180)。比べる(eq〜between)は、セルと値が両方とも数なら数で、両方とも日付なら日付で比べる。
  // eq・ne はそれ以外では文字で比べる(大文字・小文字を区別しない。Excel・Notion と同じ)。大小(gt〜between)は数か日付どうしだけ
  // (文字・空のセルは合わない。Excel の「より大きい」と同じ)。文字の条件(contains〜endsWith)は大文字・小文字を区別しない。
  // 列の種類(数・文字・日付・チェック)で選べる条件の一覧が変わるのは画面だけで、判定は値から決める(保存HTMLも同じ判定)。
  // has・hasNot(0.8.21。Issue #178 の複数選択): 「,」「、」で区切った名前のどれかが値と同じ(大文字・小文字は区別しない)か。
  // 古い版の Monolio では、この条件は読めずに外れる(その列の条件だけの絞り込みは効かない)。
  const TABLE_FILTER_OPS = ["eq", "ne", "gt", "ge", "lt", "le", "between", "contains", "notContains", "startsWith", "endsWith", "empty", "notEmpty", "checked", "unchecked", "has", "hasNot"];
  const TABLE_FILTER_VALUELESS_OPS = ["empty", "notEmpty", "checked", "unchecked"];
  const TABLE_FILTER_VALUE_MAX = 1000;
  function normalizeTableFilterCondition(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const op = value.op;
    if (!TABLE_FILTER_OPS.includes(op)) return null;
    if (TABLE_FILTER_VALUELESS_OPS.includes(op)) return { op };
    const operand = (item) => (typeof item === "string" || (typeof item === "number" && Number.isFinite(item)) ? String(item).trim().slice(0, TABLE_FILTER_VALUE_MAX) : "");
    const first = operand(value.value);
    if (!first) return null;
    if (op !== "between") return { op, value: first };
    const second = operand(value.value2);
    return second ? { op, value: first, value2: second } : null;
  }
  function normalizeTableFilterJoin(value) {
    return value === "or" ? "or" : "and";
  }
  // 日付の文字(2026-10-24・2026/10/24・2026年10月24日。後ろに時刻や「→ 終わりの日」が続いてもよい)を日の番号にする。読めなければ null。
  function parseTableDateText(text) {
    const match = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?=$|[\sT(→~〜])/.exec(String(text ?? "").normalize("NFKC").trim());
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return Math.round(time / 86400000);
  }
  // セルの値と条件の値の大小。数どうし・日付どうしで比べられなければ null。
  function compareTableFilterValues(text, operand) {
    const a = parseTableNumberText(text);
    const b = parseTableNumberText(operand);
    if (a !== null && b !== null) {
      // 有効数字15桁で比べる(エディタの式の比べ方と同じ。0.1+0.2 と 0.3 を等しいとみる)。
      const x = Number(a.toPrecision(15));
      const y = Number(b.toPrecision(15));
      return x < y ? -1 : x > y ? 1 : 0;
    }
    const da = parseTableDateText(text);
    const db = parseTableDateText(operand);
    if (da !== null && db !== null) return Math.sign(da - db);
    return null;
  }
  // 条件 → セルの見える文字(前後の空白を除いたもの)を受けて合うかを返す関数。条件が無ければ null。
  function tableFilterConditionTest(condition) {
    const rule = normalizeTableFilterCondition(condition);
    if (!rule) return null;
    const lower = (text) => String(text ?? "").toLowerCase();
    const value = lower(rule.value);
    const equal = (text) => {
      const order = compareTableFilterValues(text, rule.value);
      return order === null ? lower(text) === value : order === 0;
    };
    const ordered = (test) => (text) => {
      const order = compareTableFilterValues(text, rule.value);
      return order !== null && test(order);
    };
    switch (rule.op) {
      case "eq": return (text) => text !== "" && equal(text);
      case "ne": return (text) => text === "" || !equal(text);
      case "gt": return ordered((order) => order > 0);
      case "ge": return ordered((order) => order >= 0);
      case "lt": return ordered((order) => order < 0);
      case "le": return ordered((order) => order <= 0);
      case "between": return (text) => {
        const low = compareTableFilterValues(text, rule.value);
        const high = compareTableFilterValues(text, rule.value2);
        // 2つの値の順はどちらでもよい(小さい方から大きい方まで。両端を含む)。
        return low !== null && high !== null && ((low >= 0 && high <= 0) || (low <= 0 && high >= 0));
      };
      case "contains": return (text) => lower(text).includes(value);
      case "notContains": return (text) => !lower(text).includes(value);
      case "startsWith": return (text) => lower(text).startsWith(value);
      case "endsWith": return (text) => lower(text).endsWith(value);
      case "empty": return (text) => text === "";
      case "notEmpty": return (text) => text !== "";
      case "checked": return (text) => dbChecked(text);
      case "unchecked": return (text) => !dbChecked(text);
      case "has": return (text) => dbMultiValues(text).some((name) => lower(name) === value);
      case "hasNot": return (text) => !dbMultiValues(text).some((name) => lower(name) === value);
      default: return null;
    }
  }
  // 絞り込み・並べ替えの対象になる最初の行(見出しの行の次)。
  function tableDataFirstRow(block) {
    return block?.tableHeader || block?.database ? 1 : 0;
  }
  function tableHasVerticalMerge(rows, firstRow = 0) {
    return rows.some((row, r) => r >= firstRow && row.some((cell) => cell && typeof cell === "object" && !cell.covered && Number(cell.rowSpan) > 1));
  }
  // 表の「その行を絞り込みで隠すか」の判定(行の番号 → 真偽)を作る。valueOf(行, 列) はセルの見える文字。
  // 絞り込みの整えと「縦の結合があるか」(全セルを見る)は、ここで表ごとに1回だけ行う(Issue #203。以前は1行ごとにやり直していたので、
  // 隠す行を決めるのが行数の2乗だった)。エディタ(app.js の tableHiddenRowSet)と保存HTML(renderPortableTable)の両方がこれを使う。
  // 絞り込みが無い・縦の結合がある表では、どの行も隠さない判定を返す。
  function tableRowFilter(block, valueOf) {
    const rows = block?.rows || [];
    const filters = normalizeTableFilter(block?.tableFilter, (rows[0] || []).length);
    const first = tableDataFirstRow(block);
    if (!filters.length || tableHasVerticalMerge(rows, first)) return () => false;
    const tests = filters.map((filter) => ({ column: filter.column, hide: new Set(filter.hide || []), test: tableFilterConditionTest(filter.condition) }));
    // その列で見せるか: 隠す値でなく、条件があれば条件に合う。
    const passes = (rowIndex, filter) => {
      const text = String(valueOf(rowIndex, filter.column) ?? "").trim();
      return !filter.hide.has(text) && (!filter.test || filter.test(text));
    };
    // 列どうし: AND はどれかの列で外れたら隠す。OR はどの列でも外れたら隠す(Issue #180)。
    if (normalizeTableFilterJoin(block?.tableFilterJoin) === "or") return (rowIndex) => rowIndex >= first && !tests.some((filter) => passes(rowIndex, filter));
    return (rowIndex) => rowIndex >= first && tests.some((filter) => !passes(rowIndex, filter));
  }
  // その行を絞り込みで隠すか(1行だけ見るとき。何行も見るときは tableRowFilter を1回作って使う)。
  function tableRowFilteredOut(block, rowIndex, valueOf) {
    return tableRowFilter(block, valueOf)(rowIndex);
  }
  function tableFilterNote(total, shown) {
    return "絞り込み中: " + total + " 行のうち " + shown + " 行を表示";
  }

  // ---- 表のグループ分け(0.8.21。Issue #179) ----
  // 表のブロックの tableGroupBy: { column, collapsed?: [畳んだ組の鍵…] }。ある列の値ごとに行をまとめて見せる(Notion の「グループ」)。
  // **見せ方だけ**: 行の保存の順・式の A1・グラフ・AI 用の写しの rows は変えない(隠すのと消すのは別物。Issue #109)。組の中は保存の順。
  // 表の機能なので、データベースでない表でも使える(ユーザー指示「表はデータベースのすべてができる」)。縦の結合がある表では効かない(絞り込みと同じ)。
  // 組の鍵は列の見える文字(前後の空白を除く)。複数選択は名前ごと(2つの名前を持つ行は2つの組に出る。Notion と同じ)、チェックは "✓"(あり)と ""(なし)。
  // 組の順: チェックは なし→あり、状態は 未着手→進行中→完了 の組の順(組の中は既定の名前・先に出た順)、ほかは先に出た順。空の組は最後。
  // 絞り込みで隠した行は、どの組にも入れない(行の無い組は出さない)。
  // 古い版の Monolio では、グループ分けは効かず(値は残る)、ふつうの表として見える。
  function normalizeTableGroupBy(value, columnCount) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const column = Number(value.column);
    if (!Number.isInteger(column) || column < 0 || column >= columnCount) return null;
    const next = { column };
    if (Array.isArray(value.collapsed)) {
      const keys = [...new Set(value.collapsed.filter((key) => typeof key === "string").map((key) => key.trim().slice(0, TABLE_FILTER_VALUE_MAX)))].slice(0, 1000);
      if (keys.length) next.collapsed = keys;
    }
    return next;
  }
  // 組の並び。valueOf(行, 列) はセルの見える文字、isHidden(行) は絞り込みで隠す行か。グループ分けが無い・効かない表は null。
  // 返すもの: { column, type, groups: [{ key, rows: [行の番号…], collapsed }] }。エディタと保存HTMLの両方がこれを使う(P7)。
  function tableGroupPlan(block, valueOf, isHidden = () => false) {
    const rows = block?.rows || [];
    const setting = normalizeTableGroupBy(block?.tableGroupBy, (rows[0] || []).length);
    const first = tableDataFirstRow(block);
    if (!setting || tableHasVerticalMerge(rows, first)) return null;
    const type = block.database ? dbColumnType(block, setting.column) : "text";
    const groups = new Map();
    const add = (key, rowIndex) => {
      let group = groups.get(key);
      if (!group) groups.set(key, group = { key, rows: [] });
      group.rows.push(rowIndex);
    };
    for (let r = first; r < rows.length; r += 1) {
      if (isHidden(r)) continue;
      const text = String(valueOf(r, setting.column) ?? "").trim();
      if (type === "multi") {
        const names = dbMultiValues(text);
        if (!names.length) add("", r);
        names.forEach((name) => add(name, r));
      } else if (type === "check") add(dbChecked(text) ? "✓" : "", r);
      else add(text, r);
    }
    let keys = [...groups.keys()];
    if (type === "check") keys = ["", "✓"].filter((key) => groups.has(key));
    else {
      if (type === "status") {
        const appear = new Map(keys.map((key, index) => [key, index]));
        keys = keys.filter((key) => key !== "").sort((a, b) => dbStatusRank(a) - dbStatusRank(b) || appear.get(a) - appear.get(b));
      } else keys = keys.filter((key) => key !== "");
      if (groups.has("")) keys.push("");
    }
    const collapsed = new Set(setting.collapsed || []);
    return { column: setting.column, type, groups: keys.map((key) => ({ key, rows: groups.get(key).rows, collapsed: collapsed.has(key) })) };
  }
  // 組の見出しの名前(HTML)。セルと同じ札で見せる。空の組は「(空白)」、チェックは「チェックあり / なし」。
  function tableGroupLabelHtml(type, key) {
    if (type === "check") return key ? '<span class="db-check is-on" aria-hidden="true"></span> チェックあり' : '<span class="db-check" aria-hidden="true"></span> チェックなし';
    if (!key) return '<span class="table-group-empty">(空白)</span>';
    if (type === "select" || type === "multi") return dbPillHtml(key);
    if (type === "status") return dbStatusHtml(key);
    return escapeHtml(key);
  }

  // ---- データベースの表(v229。ユーザー指示「表とデータベースは本質的には同じもので、どちらにも切り替えられるようにしたい」) ----
  // 表のブロックに database: { columns: [{ type }] } があればデータベース。1行目が列の名前(ヘッダー行)。
  // 列の種類で変わるのはセルの見せ方だけで、中身はどれも文字で持つ(表に戻しても文字はそのまま残る)。
  //   text 文字 / number 数(右寄せ) / date 日付 / select 選択肢(色の札) / check チェック(✓ か空)
  //   link リンク(セルの文字が題名。行き先は cell.link。別の HTML なら、文書の場所からの相対パス。入ると行き先の窓が出る)
  //   リンク(cell.link)は v269 からどのセルにも付けられる(ふつうの表も、データベースのどの列も。選択肢・チェックの列は札・四角で描く)。
  // 0.8.21(Issue #178)で足した種類。どれも中身はセルの文字のまま(表に戻しても、古い版で開いても文字は残る):
  //   multi 複数選択(「a, b」のように「,」か「、」で区切った名前。名前ごとに札。選択肢は列の値から作る。選択肢と同じ)
  //   status 状態(名前は選択肢と同じく文字。名前から 未着手・進行中・完了 の組を決め、組の色の札で見せる。Notion の状態と同じ)
  //   url・email・phone(文字がそのまま行き先。形が読めれば押せるリンク、読めなければ文字のまま薄い印。打つ値は縛らない)
  //   file ファイル(この文書の添付のブロックへのリンク。cell.link が「#block-…」、文字がファイル名)
  //   created 作成日時・edited 更新日時(「2026-10-26 14:05」の文字。行を足したとき・行のほかのセルを変えたときにエディタが書く。手では打たない)
  const DB_COLUMN_TYPES = ["text", "number", "date", "select", "multi", "status", "check", "url", "email", "phone", "link", "file", "created", "edited"];
  const DB_SELECT_COLOR_COUNT = 7;
  function dbColumnType(block, cellIndex) {
    const type = block?.database?.columns?.[cellIndex]?.type;
    return DB_COLUMN_TYPES.includes(type) ? type : "text";
  }
  // 行の時刻の列(エディタが書く。手では打たない)。
  const DB_TIME_TYPES = ["created", "edited"];
  // 複数選択の名前の並び(「,」「、」で区切る。前後の空白を除き、空と重なりを外す)。
  function dbMultiValues(text) {
    const names = [];
    String(text ?? "").split(/[,、]/).forEach((part) => {
      const name = part.trim();
      if (name && !names.includes(name)) names.push(name);
    });
    return names;
  }
  // 状態の組(Notion と同じ3つ)。名前で組を決める(知らない名前は「未着手」の組。Notion も新しい名前は To-do の組に入る)。
  // 状態の列の既定の名前は各組の最初の名前(未着手・進行中・完了)。
  const DB_STATUS_GROUPS = [
    { key: "todo", label: "未着手", names: ["未着手", "未対応", "未", "todo", "to do", "to-do", "not started", "backlog"] },
    { key: "doing", label: "進行中", names: ["進行中", "対応中", "作業中", "確認中", "in progress", "doing", "wip"] },
    { key: "done", label: "完了", names: ["完了", "済", "済み", "完", "done", "complete", "completed", "closed"] },
  ];
  function dbStatusGroup(name) {
    const value = String(name ?? "").trim().toLowerCase();
    if (!value) return null;
    return DB_STATUS_GROUPS.find((group) => group.names.includes(value))?.key || "todo";
  }
  // 状態の並びの順(並べ替え・グループ分けの組の順で共通): 組の順(未着手 → 進行中 → 完了)、組の中は決まった名前の順、知らない名前はその後。
  // 同じ順の名前どうし(知らない名前)は、呼び手が名前か出た順で並べる。
  function dbStatusRank(name) {
    const value = String(name ?? "").trim().toLowerCase();
    const index = DB_STATUS_GROUPS.findIndex((group) => group.key === (dbStatusGroup(value) || "todo"));
    const fixed = DB_STATUS_GROUPS[index].names.indexOf(value);
    return index * 1000 + (fixed < 0 ? 999 : fixed);
  }
  // URL の列の行き先: http・https はそのまま、「example.com/…」のようにドメインで始まるものは https:// を付ける。ほかは null(文字のまま)。
  function dbUrlHref(text) {
    const value = String(text ?? "").trim();
    if (/^https?:\/\/[^\s<>"]+$/i.test(value)) return value;
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s<>"]*)?$/i.test(value)) return "https://" + value;
    return null;
  }
  function dbEmailHref(text) {
    const value = String(text ?? "").trim();
    return /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/.test(value) ? "mailto:" + value : null;
  }
  // 電話: 数字(全角も)と + ( ) - . 空白だけで、数字が3つ以上。行き先は tel:+数字。
  function dbPhoneHref(text) {
    const value = String(text ?? "").normalize("NFKC").trim();
    if (!/^\+?[\d\s().\-‐−]+$/.test(value)) return null;
    const digits = value.replace(/\D/g, "");
    return digits.length >= 3 ? "tel:" + (value.startsWith("+") ? "+" : "") + digits : null;
  }
  // 行の時刻の文字(手元の時刻。分まで)。並べ替え・絞り込み(日付の条件)は、この文字のまま効く。
  function dbTimeText(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return String(date.getFullYear()).padStart(4, "0") + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }
  // この文書のブロックへのリンク(ファイルの列。#block-…)の行き先のブロックの id。ブロックへのリンクでなければ null。
  function blockIdOfLinkHref(href) {
    const match = /^#block-([A-Za-z0-9_-]+)$/.exec(String(href ?? "").trim());
    return match ? match[1] : null;
  }
  // 選択肢の札の色は、名前から決める(同じ名前はどの文書でも同じ色。色を別に持たない)。
  function dbSelectColor(name) {
    let hash = 0;
    for (const ch of String(name ?? "")) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return hash % DB_SELECT_COLOR_COUNT;
  }
  function dbChecked(text) {
    const value = String(text ?? "").trim();
    return value !== "" && !/^(0|false|no|off|いいえ|✗|×)$/i.test(value);
  }
  // データベースのリンクの行き先: http・https と、文書の場所からの相対パス(別の HTML)だけ。
  // javascript: など scheme の付いたもの、/ や \ で始まる絶対パス、< > " を含むものは受けない。
  function safeDbLinkHref(value) {
    const href = String(value ?? "").trim();
    if (!href) return null;
    if (/^https?:\/\/[^\s<>"]+$/i.test(href)) return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || /^[\\/]/.test(href) || /[<>"\n\r]/.test(href)) return null;
    return href;
  }
  // 同じ文書のページへのリンク(v267。#147)。行き先は保存HTMLのページの錨(<section id="page-…">)と同じ「#page-…」で、
  // 保存HTMLではそのページへ切り替わる(ページ移動のランタイム)。**行き先の形とページの引き当てはここだけ**(ページブロックの錨・
  // データベースのリンクのセル・削除で外すリンクの判定がすべて通る)。
  function pageLinkHref(pageId) {
    return "#page-" + String(pageId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  }
  function isPageLinkHref(href) {
    return /^#page-/.test(String(href ?? "").trim());
  }
  // 行き先のページの id。この文書に無いページなら null。
  function pageIdOfLinkHref(pages, href) {
    const value = String(href ?? "").trim();
    if (!isPageLinkHref(value)) return null;
    return (pages || []).find((page) => pageLinkHref(page.id) === value)?.id ?? null;
  }
  // リンクのセルの行き先。行き先(cell.link)が無く、セルの文字が http・https の URL そのものなら、その URL を行き先にする
  // (v268。ユーザー「そのセルに https から始まるリンクを付けられない」。セルへ URL を打つ・貼るだけでリンクになる。Notion の URL の列と
  // 同じ)。文字から取るのは http・https だけ(ふつうの文字を相対パスのリンクにしない)。エディタの表示・保存HTML・手伝いの表示が通る。
  function dbCellLinkHref(cell, text) {
    const href = safeDbLinkHref(cell?.link);
    if (href) return href;
    const value = String(text ?? "").trim();
    return /^https?:\/\/[^\s<>"]+$/i.test(value) ? value : null;
  }
  // セルの中身の HTML。エディタの表示と保存HTMLで同じものを使う(P7)。text は見せる文字(式なら計算結果)。type はデータベースの
  // 列の種類(データベースでない表のセルは null)。**リンクはどのセルでも同じ**(v269。ユーザー指示「データベースと表は本質的に一緒。
  // 表の方が機能が広いはず。表でリンクできないのにデータベースではできる、というのはありえない」): 行き先(cell.link)か URL の文字があれば
  // リンクで描く。データベースの列の種類で変わるのは、選択肢(札)とチェック(四角)の見せ方だけ。
  function dbCellHtml(type, text, cell) {
    const value = String(text ?? "");
    if (type === "select") return dbPillHtml(value.trim());
    // 複数選択(0.8.21): 名前ごとに札。
    if (type === "multi") return dbMultiValues(value).map(dbPillHtml).join(" ");
    if (type === "status") return dbStatusHtml(value.trim());
    if (type === "check") {
      const on = dbChecked(value);
      return '<span class="db-check' + (on ? " is-on" : "") + '" role="img" aria-label="' + (on ? "済" : "未") + '"></span>';
    }
    // URL・メール・電話(0.8.21): 文字がそのまま行き先。読めない形は文字のまま、薄い波線で知らせる(打つ値は縛らない)。
    if (type === "url" || type === "email" || type === "phone") {
      const shown = value.trim();
      if (!shown) return "";
      const href = type === "url" ? dbUrlHref(shown) : type === "email" ? dbEmailHref(shown) : dbPhoneHref(shown);
      if (!href) return '<span class="db-invalid" title="' + (type === "url" ? "URL" : type === "email" ? "メールアドレス" : "電話番号") + 'として読めません">' + escapeHtml(value) + "</span>";
      return '<a class="db-link db-' + type + '" href="' + escapeHtml(href) + '"' + (type === "url" ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + escapeHtml(shown) + "</a>";
    }
    // 行の時刻(0.8.21): 文字のまま、薄い色で。
    if (type === "created" || type === "edited") return value.trim() ? '<span class="db-time">' + escapeHtml(value.trim()) + "</span>" : "";
    const href = dbCellLinkHref(cell, value);
    if (href) {
      const external = /^https?:/i.test(href);
      return '<a class="db-link' + (type === "file" ? " db-file" : "") + '" href="' + escapeHtml(external ? href : encodeURI(href)) + '"'
        + (external ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + escapeHtml(value || href) + "</a>";
    }
    if (type === "file" && value.trim()) return '<span class="db-file is-missing">' + escapeHtml(value) + "</span>";
    return escapeHtml(value);
  }
  function dbPillHtml(name) {
    return name ? '<span class="db-pill db-pill-' + dbSelectColor(name) + '">' + escapeHtml(name) + "</span>" : "";
  }
  // 状態の札: 組の色(未着手は灰・進行中は青・完了は緑)と、頭に丸。
  function dbStatusHtml(name) {
    return name ? '<span class="db-status db-status-' + dbStatusGroup(name) + '">' + escapeHtml(name) + "</span>" : "";
  }
  // 別の HTML の題名。Monolio の文書なら manifest の先頭ページの題名、ほかの HTML なら <title>。読めなければ null
  // (リンクのセルの題名は、取れたときだけ書き換える。ユーザー指示「取れなかったら元のまま」)。
  function htmlDocumentTitle(html) {
    try {
      const parsed = new DOMParser().parseFromString(String(html ?? ""), "text/html");
      const manifestNode = parsed.querySelector("#document-manifest");
      if (manifestNode) {
        try {
          const manifest = JSON.parse(manifestNode.textContent || "{}");
          const title = String(manifest?.pages?.[0]?.title ?? manifest?.title ?? "").trim();
          if (title) return title;
        } catch {
          // 壊れた manifest は <title> を見る。
        }
      }
      const title = String(parsed.querySelector("title")?.textContent ?? "").replace(/\s+/g, " ").trim();
      return title || null;
    } catch {
      return null;
    }
  }

  // 保存HTMLのリンク: 別のタブで開き、開いた先からこのページを操作させない(noopener)。
  function exportLink(href) {
    const a = document.createElement("a");
    a.className = "doc-link";
    a.setAttribute("href", href);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    return a;
  }

  // 文中の日付(Issue #173)。持つのは ISO の年-月-日(「2026-10-30」)で、見せる文字は「2026年10月30日」。エディタ・保存HTMLの両方がこれを使う。
  const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  function isIsoDate(value) {
    const match = ISO_DATE_PATTERN.exec(String(value ?? ""));
    if (!match) return false;
    const [year, month, day] = match.slice(1).map(Number);
    if (year < 1) return false;
    const date = new Date(Date.UTC(2000, month - 1, day));
    date.setUTCFullYear(year);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function dateMentionText(iso) {
    const match = ISO_DATE_PATTERN.exec(String(iso ?? ""));
    return match ? Number(match[1]) + "年" + Number(match[2]) + "月" + Number(match[3]) + "日" : "";
  }
  // Date(手元の時刻)→ ISO の年-月-日。「今日」は手元の暦の日付。
  function isoDateOf(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return String(date.getFullYear()).padStart(4, "0") + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }
  // 打った語を日付として読む(「@」の一覧の日付の候補)。読めるのは 2026-10-30・2026/10/30・2026.10.30・2026年10月30日(年あり)と、
  // 10/30・10-30・10月30日(年なし。today の年)。暦に無い日(2月30日など)は null。
  function parseDateQuery(text, today = new Date()) {
    const value = String(text ?? "").normalize("NFKC").trim();
    let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value) || /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/.exec(value);
    let parts = match ? match.slice(1).map(Number) : null;
    if (!parts) {
      match = /^(\d{1,2})[-/](\d{1,2})$/.exec(value) || /^(\d{1,2})月(\d{1,2})日?$/.exec(value);
      if (match) parts = [today.getFullYear(), Number(match[1]), Number(match[2])];
    }
    if (!parts) return null;
    const pad = (number) => String(number).padStart(2, "0");
    const iso = String(parts[0]).padStart(4, "0") + "-" + pad(parts[1]) + "-" + pad(parts[2]);
    return isIsoDate(iso) ? iso : null;
  }
  // ISO の日付に days 日を足す(「明日」「昨日」)。
  function addDaysIso(iso, days) {
    const match = ISO_DATE_PATTERN.exec(String(iso ?? ""));
    if (!match) return null;
    return isoDateOf(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  }

  // ---- 本文の書式(block.html)の無害化(Issue #201。エディタと保存HTMLで1つ) ----
  // 残す要素・残す style(文字色・背景・書体・大きさ)・書体の目印の扱い・リンクの行き先の検査・印の id や日付の検査は、ここの1か所だけ。
  // エディタ(表示・保存・貼り付け・提案)も保存HTMLの書き出しも、これを通す。以前は app.js と ここに別々の写しがあり、
  // 書体の目印(FONT_FAMILY_SENTINEL)の扱い・コードの中身の読み方・行き先の無い参照の扱いがずれていた。
  // 印(数式・参照・日付・コード・リンク)の「作り直した形」だけは使う側が marks で渡す(エディタは打って変えない編集用の印、
  // 保存HTMLは読む人向けの形)。marks を渡さなければ保存HTMLの形(exportInlineMarks)。
  const INLINE_ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "S", "STRIKE", "DEL", "U", "SPAN", "FONT", "CODE", "BR"]);
  // 書体を選ぶ途中で execCommand("fontName") に渡す目印(実在しない書体名)。本文には残さない。
  const FONT_FAMILY_SENTINEL = "__doc-editor-font__";
  // インライン数式のソース。正は data-tex。旧構造(v102 以前: data-tex 無しで .inline-math-value にソース)からも読む(New-21)。
  function inlineMathSource(element) {
    const tex = element.getAttribute?.("data-tex");
    if (tex !== null && tex !== undefined) return tex.replaceAll("​", "");
    const legacy = element.querySelector?.(":scope > .inline-math-value");
    return (legacy ? legacy.textContent : "").replaceAll("​", "");
  }
  // インラインコードの中身。正は data-code。旧構造(.inline-code-value)・素の <code> の文字からも読む。
  function inlineCodeSource(element) {
    const code = element.getAttribute?.("data-code");
    if (code !== null && code !== undefined) return code.replaceAll("​", "");
    const legacy = element.querySelector?.(":scope > .inline-code-value");
    return (legacy ? legacy.textContent : element.textContent || "").replaceAll("​", "");
  }
  // 残す style を写す(色・背景・書体・大きさ)。書体は CSS として通る形に整え、目印は落とす。
  function copyInlineStyle(to, { color, background, family, size }) {
    if (color) to.style.color = color;
    if (background) to.style.backgroundColor = background;
    if (family && family !== FONT_FAMILY_SENTINEL) to.style.fontFamily = cssFontFamilyValue(family);
    if (size) to.style.fontSize = size;
  }
  // 保存HTMLの印の形。参照は書き出し中の行き先(activeRefTargets)で番号と錨を付け、数式は MathML にする。
  const exportInlineMarks = {
    inlineMath(tex) {
      const rebuilt = document.createElement("template");
      rebuilt.innerHTML = renderInlineMathHtml(tex);
      return rebuilt.content;
    },
    // 図表・見出し・ページへの参照(v198・v218)と、ブロックへのリンク(Issue #176。頭に矢印 .is-block)。行き先が無いものは「参照先なし」。
    figureRef(id, kind) {
      const entry = activeRefTargets ? resolveReference(activeRefTargets, id, kind) : null;
      const rebuilt = document.createElement(entry ? "a" : "span");
      rebuilt.className = "figure-ref" + (entry ? "" : " is-missing") + (entry?.kind === "page" ? " is-page" : "") + (entry && kind === REF_KIND_BLOCK ? " is-block" : "");
      if (entry) rebuilt.setAttribute("href", "#" + entry.anchor);
      rebuilt.textContent = entry ? entry.label : "参照先なし";
      return rebuilt;
    },
    // 文中の日付(Issue #173)。<time> に作り直す(文字は data-date から作る)。
    dateMention(iso) {
      const time = document.createElement("time");
      time.className = "date-mention";
      time.setAttribute("datetime", iso);
      time.textContent = dateMentionText(iso);
      return time;
    },
    code(text) {
      const code = document.createElement("code");
      code.className = "inline-code";
      code.textContent = text;
      return code;
    },
    // リンク(v200)。別のタブで開き、開いた先からこのページを操作させない。
    link: (href) => exportLink(href),
  };
  function sanitizeInlineHtml(html, marks = exportInlineMarks) {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");
    const toText = (node) => node.replaceWith(document.createTextNode(node.textContent || ""));
    function clean(node) {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) return;
        if (child.nodeType !== Node.ELEMENT_NODE) {
          toText(child);
          return;
        }
        // インライン数式はソース(data-tex)から作り直す。外から来た MathML を素通しにしない。
        if (child.classList.contains("inline-math")) {
          child.replaceWith(marks.inlineMath(inlineMathSource(child)));
          return;
        }
        // 図表・見出し・ページ・ブロックへの参照(v198)。行き先の id だけを持つ印に作り直す(番号は今の文書で数える)。
        // id が安全な形でなければ、印をやめて文字だけにする(エディタも保存HTMLも同じ。v159)。
        if (child.classList.contains("figure-ref")) {
          const id = child.getAttribute("data-ref") || "";
          if (isSafeId(id)) child.replaceWith(marks.figureRef(id, refKindOf(child)));
          else toText(child);
          return;
        }
        // 文中の日付(Issue #173)。data-date(ISO)だけを持つ印に作り直す。日付として読めなければ文字だけ。
        if (child.classList.contains("date-mention")) {
          const iso = child.getAttribute("data-date") || "";
          if (isIsoDate(iso)) child.replaceWith(marks.dateMention(iso));
          else toText(child);
          return;
        }
        // リンク(v200)。行き先(href)が安全な形(http・https・mailto・文書の中)のときだけ残す。中の書式はそのまま。
        if (child.nodeName === "A") {
          const href = safeLinkHref(child.getAttribute("href"));
          if (!href) {
            toText(child);
            return;
          }
          const link = marks.link(href);
          link.append(...child.childNodes);
          child.replaceWith(link);
          clean(link);
          return;
        }
        if (!INLINE_ALLOWED_TAGS.has(child.nodeName)) {
          toText(child);
          return;
        }
        if (child.nodeName === "CODE") {
          child.replaceWith(marks.code(inlineCodeSource(child)));
          return;
        }
        // <font>(execCommand の色・書体)は span に直す。
        if (child.nodeName === "FONT") {
          const span = document.createElement("span");
          copyInlineStyle(span, { color: child.getAttribute("color") || child.style.color, background: child.style.backgroundColor, family: child.getAttribute("face") || child.style.fontFamily, size: child.style.fontSize });
          span.append(...child.childNodes);
          child.replaceWith(span);
          clean(span);
          return;
        }
        // 残す要素の属性は、span の style(色・背景・書体・大きさ)だけ。
        const style = child.nodeName === "SPAN" && child.hasAttribute("style")
          ? { color: child.style.color, background: child.style.backgroundColor, family: child.style.fontFamily, size: child.style.fontSize }
          : null;
        [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
        if (style) copyInlineStyle(child, style);
        clean(child);
      });
    }
    clean(template.content);
    return template.innerHTML.replaceAll("​", "");
  }

  function renderInlineContent(block) {
    // 本文の中に </script が来ても保存HTMLのスクリプトを閉じない(書き出しだけの決まり)。
    return block.html ? sanitizeInlineHtml(block.html).replaceAll("</script", "<\\/script") : renderInlineMarkdown(block.text);
  }

  function blockAnchor(block) {
    return "block-" + String(block.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function formatBytes(size) {
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
    return (size / 1024 / 1024).toFixed(1) + " MB";
  }

  function safeFilename(value) {
    return String(value || "document").replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
  }

  function imageWidth(block) {
    const value = Number(block?.imageWidth);
    return Number.isFinite(value) ? Math.max(20, Math.min(100, value)) : 100;
  }

  function imageAlign(block) {
    return ["left", "center", "right"].includes(block?.imageAlign) ? block.imageAlign : "left";
  }

  // ---- 添付の見せ方(v273。形式 0.8.16) ----
  // 添付のブロックを、画像・動画としてその場に見せるか、ファイル(名前・大きさ・Download)として見せるか。**この1か所で決めて**、エディタ・
  // 保存HTML・図の番号(figureKind)が同じ判定を使う。動画は種類(video/…)で決め打ちせず、再生はブラウザに試させる(ユーザー決定:
  // 「再生を試して駄目だったらファイル表示に。ただし、この環境では再生できませんでした、と表示してから」)。再生できる形式はブラウザで決まる
  // (2026-10-23 に Chrome・Edge 155 で調べた: mp4(H.264・AV1)と webm はできる。mp4 でも H.265、ogg の Theora、mov・avi・wmv はできない)。
  function videoType(mime) {
    const type = String(mime || "").toLowerCase().split(";")[0].trim();
    return /^video\/[a-z0-9][a-z0-9.+-]*$/.test(type) ? type : null;
  }

  // PDF(v277)。種類が application/pdf のもの。種類が分からない(空・application/octet-stream)ときは名前の .pdf で見る。
  function isPdfAttachment(attachment) {
    const type = String(attachment?.mime || "").toLowerCase().split(";")[0].trim();
    if (type === "application/pdf") return true;
    return (!type || type === "application/octet-stream") && /\.pdf$/i.test(String(attachment?.name || ""));
  }

  // 音声(0.8.20。Issue #164 の音声)。種類が audio/… のもの。種類が分からない(空・application/octet-stream)ときは名前の拡張子で見る
  // (PDF と同じ考え)。再生できるかは動画と同じくブラウザに試させる(できなければ一言を出してファイルとして見せる)。
  const AUDIO_EXTENSIONS = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", weba: "audio/webm" };
  function isAudioAttachment(attachment) {
    const type = String(attachment?.mime || "").toLowerCase().split(";")[0].trim();
    if (/^audio\/[a-z0-9][a-z0-9.+-]*$/.test(type)) return true;
    const ext = (String(attachment?.name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
    return (!type || type === "application/octet-stream") && Object.prototype.hasOwnProperty.call(AUDIO_EXTENSIONS, ext);
  }

  // "image" / "video" / "audio" / "pdf"(1ページ目の見本。押すと大きく開く) / "pdf-read"(中で読む) / "file"
  function attachmentView(block, attachment) {
    if (!attachment || block?.attachmentView === "file") return "file";
    if (String(attachment.mime || "").startsWith("image/")) return "image";
    if (videoType(attachment.mime)) return "video";
    if (isAudioAttachment(attachment)) return "audio";
    if (isPdfAttachment(attachment)) return block?.attachmentView === "read" ? "pdf-read" : "pdf";
    return "file";
  }

  // その場に見せる添付の幅(%)。imageWidth が無ければ、PDF の見本は 35%(ページ全体を小さく見せる。ユーザー「場所を取りすぎる」)、ほかは 100%。
  // エディタのカード・幅のバー・保存HTMLが同じこの決まりを使う。
  const PDF_PREVIEW_WIDTH = 35;
  function attachmentWidth(block, view) {
    const value = Number(block?.imageWidth);
    if (Number.isFinite(value)) return Math.max(20, Math.min(100, value));
    return view === "pdf" ? PDF_PREVIEW_WIDTH : 100;
  }

  // 「中で読む」の PDF の高さ(px)。表を見せる高さと同じ block.viewHeight を使い、決めていなければ 300px(ユーザー「表やブロックの高さで表示する範囲を決められた…これもそうなっていますか」)。値の確かめ方は表と同じ portableTableViewHeight の1か所。
  const PDF_READ_HEIGHT = 300;
  function pdfReadHeight(block) {
    return portableTableViewHeight(block) || PDF_READ_HEIGHT;
  }

  // PDF のビューアに渡す指定(Chrome・Edge の PDF ビューアが読む。ほかのブラウザでは効かないことがあるが、表示はできる)。
  // 見本と中で読むは、上の黒い道具の帯と縮小版の列を出さない(ユーザー「上の黒い道具の帯」がいや)。大きく開いたときは、
  // ページ送り・拡大のため帯を出す(ユーザー了承)。
  const PDF_VIEW_HASH = { pdf: "#toolbar=0&navpanes=0&view=Fit", "pdf-read": "#toolbar=0&navpanes=0&view=FitH", open: "#navpanes=0" };

  // PDF を画面に出すときの URL(blob)。種類は必ず application/pdf(ブラウザの PDF ビューアが開く。文書として開いてスクリプトが
  // 動くことは無い)。保存HTMLのランタイムへもソースを埋め込むので、この関数の中で完結させる。
  function pdfDisplayUrl(bytes) {
    return { url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), revocable: true };
  }

  // この環境で PDF をその場に出せるか(ブラウザの PDF ビューア)。分からない(古いブラウザ)ときは出せるものとして試す。
  // スマートフォンのブラウザなどは false を返す(枠の中に出せない)。
  function pdfViewerAvailable() {
    return typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;
  }

  // PDF をその場に出せない環境での一言(エディタと保存HTMLで同じ文)。
  function pdfUnavailableText() {
    return "この環境では PDF をその場で表示できません。Download で保存して、ほかのアプリで開いてください。";
  }

  // 動画を画面に出すときの URL(blob)。種類は video/… の形のものだけ、ほかは application/octet-stream(新しいタブで開いても、動画か
  // ダウンロードになり、文書として開いてスクリプトが動くことは無い。imageDisplayUrl の SVG と同じ考え)。
  // 保存HTMLのランタイムへもソースを埋め込む(embeddedSource)ので、外の名前に頼らず、この関数の中で完結させる。
  function videoDisplayUrl(bytes, mime) {
    const type = String(mime || "").toLowerCase().split(";")[0].trim();
    return { url: URL.createObjectURL(new Blob([bytes], { type: /^video\/[a-z0-9][a-z0-9.+-]*$/.test(type) ? type : "application/octet-stream" })), revocable: true };
  }

  // 音声を画面に出すときの URL(blob。0.8.20)。種類は audio/… の形のもの、無ければ名前の拡張子から(.mp3 → audio/mpeg など)、
  // どちらも無ければ application/octet-stream(動画と同じ考え。文書として開いてスクリプトが動くことは無い)。
  // 保存HTMLのランタイムへもソースを埋め込む。拡張子の表 AUDIO_EXTENSIONS はランタイムにも同じ名前で JSON を置く(PDF_VIEW_HASH と同じ)。
  function audioDisplayUrl(bytes, mime, name) {
    const type = String(mime || "").toLowerCase().split(";")[0].trim();
    const ext = (String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
    const byName = Object.prototype.hasOwnProperty.call(AUDIO_EXTENSIONS, ext) ? AUDIO_EXTENSIONS[ext] : null;
    return { url: URL.createObjectURL(new Blob([bytes], { type: /^audio\/[a-z0-9][a-z0-9.+-]*$/.test(type) ? type : byName || "application/octet-stream" })), revocable: true };
  }

  // 再生できなかった動画・音声の一言(エディタと保存HTMLで同じ文)。
  function unplayableVideoText(attachment) {
    return "この環境では再生できませんでした(形式: " + String(attachment?.mime || "不明") + ")。Download で保存して、ほかのアプリで開いてください。";
  }

  // バイト列を base64 にする(Issue #222)。添付を文書へ入れる(chunkBase64)のも、SVG の画像の data: URL(imageDisplayUrl)も、これ1つを使う。
  // 以前の chunkBase64 は1バイトずつ文字列をつないでいた(imageDisplayUrl は 32KB ずつ。やり方が揃っていなかった)。
  // Uint8Array.prototype.toBase64 があればそれを、無ければ 32KB ずつまとめて文字にして btoa。どちらも以前の作りと同じ文字列(attachViewSuite)。
  // まとめるのは apply で(Chrome 155 で 32MB: 1バイトずつ 430〜900ms、...展開 約 950ms、apply 約 150ms、toBase64 約 20ms)。
  // 保存HTMLのランタイムへもソースを埋め込む(embeddedSource)ので、外の名前に頼らず、この関数の中で完結させる。
  function bytesToBase64(bytes) {
    if (typeof bytes.toBase64 === "function") return bytes.toBase64();
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // ---- 画像の添付を画面に出すときの URL(v227。エディタと保存HTMLのランタイムで共用) ----
  // 以前は添付の mime(文書の値)をそのまま blob の種類にしていた。image/svg+xml の blob を「新しいタブで開く」と、
  // その SVG がアプリ(保存HTMLならそのファイル)と同じオリジンの文書として開き、中のスクリプトが動いた(CSP も効かなかった)。
  //   - SVG は data: URL で見せる(<img> の中ではスクリプトは動かず、開いても別のオリジン扱いになる)
  //   - ほかは、知っているラスター画像の種類だけその種類の blob。それ以外は application/octet-stream(開いても文書にならない)
  // 保存HTMLのランタイムへはソースをそのまま埋め込む(embeddedSource)ので、外の名前は bytesToBase64(ランタイムへも埋め込む)だけを使う。
  function imageDisplayUrl(bytes, mime) {
    const type = String(mime || "").toLowerCase().split(";")[0].trim();
    if (type === "image/svg+xml") return { url: "data:image/svg+xml;base64," + bytesToBase64(bytes), revocable: false };
    const raster = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon"];
    const blob = new Blob([bytes], { type: raster.includes(type) ? type : "application/octet-stream" });
    return { url: URL.createObjectURL(blob), revocable: true };
  }

  // ---- 拡大表示の倍率と見る位置(2026-10-23。ユーザー要望「画像を細かく見たい場面は非常に頻繁にある」) ----
  // 画像・Mermaid の図・グラフを画面いっぱいに出したとき、ホイールで(カーソルの所を中心に)拡大・縮小し、ドラッグで見る位置を動かし、
  // ダブルクリックで「画面に収まる大きさ ⇔ 元の大きさ(100%)」を切り替える。以前は画面に収まる大きさで出すだけだった。
  // エディタの拡大表示(app.js の openZoomViewer)と保存HTMLのランタイム(portableZoomRuntime)の両方が使う。保存HTMLへはソースを
  // そのまま埋め込む(embeddedSource)ので、外の名前に頼らず、この関数の中で完結させる。
  //   viewport: 画面いっぱいの枠。content: 動かす中身(img か、svg を包んだ要素)。size: 元の大きさ(100% のときの幅と高さ)。
  //   controls: 押すと動くボタン(zoomIn・zoomOut・fit・actual)と、倍率を出す欄(label)。どれも無くてよい。
  function attachZoomPan(viewport, content, size, controls) {
    const parts = controls || {};
    const state = { scale: 1, x: 0, y: 0, fitted: true, drag: null, dragged: false };
    // 触れている指(pointerId → 位置)と、2本指のピンチの途中の値(2026-10-27。Issue #258。拡大率の上限・下限は zoomTo と同じ limits())
    const touches = new Map();
    let pinch = null;
    const box = () => viewport.getBoundingClientRect();
    const fitScale = () => {
      const rect = box();
      const padding = rect.width <= 800 ? 32 : 112;
      return Math.max(0.01, Math.min((rect.width - padding) / size.width, (rect.height - padding) / size.height));
    };
    const limits = () => {
      const fit = fitScale();
      return [Math.min(fit, 1) / 4, Math.max(fit, 1) * 8];
    };
    Object.assign(content.style, {
      position: "absolute", left: "0", top: "0", margin: "0", maxWidth: "none", maxHeight: "none",
      width: size.width + "px", height: size.height + "px", transformOrigin: "0 0",
    });
    const show = () => {
      const rect = box();
      const width = size.width * state.scale;
      const height = size.height * state.scale;
      state.x = width <= rect.width ? (rect.width - width) / 2 : Math.min(0, Math.max(rect.width - width, state.x));
      state.y = height <= rect.height ? (rect.height - height) / 2 : Math.min(0, Math.max(rect.height - height, state.y));
      content.style.transform = "translate(" + state.x + "px, " + state.y + "px) scale(" + state.scale + ")";
      if (parts.label) parts.label.textContent = Math.round(state.scale * 100) + "%";
      viewport.classList.toggle("is-pannable", width > rect.width + 0.5 || height > rect.height + 0.5);
    };
    const zoomTo = (next, cx, cy) => {
      const [low, high] = limits();
      const target = Math.min(high, Math.max(low, next));
      const rect = box();
      const px = cx === undefined ? rect.width / 2 : cx;
      const py = cy === undefined ? rect.height / 2 : cy;
      state.x = px - (px - state.x) * (target / state.scale);
      state.y = py - (py - state.y) * (target / state.scale);
      state.scale = target;
      state.fitted = false;
      show();
    };
    const fit = () => {
      state.scale = fitScale();
      state.fitted = true;
      show();
    };
    const actual = (cx, cy) => zoomTo(1, cx, cy);
    const local = (event) => {
      const rect = box();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const onWheel = (event) => {
      event.preventDefault();
      const [cx, cy] = local(event);
      const delta = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1);
      zoomTo(state.scale * Math.pow(1.0018, -delta), cx, cy);
    };
    const pinchMetrics = () => {
      const [a, b] = [...touches.values()];
      const rect = box();
      return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cx: (a.x + b.x) / 2 - rect.left, cy: (a.y + b.y) / 2 - rect.top };
    };
    const endPinch = () => {
      pinch = null;
      // 残った1本の指は、そこからドラッグの続き。dragged は立てたまま(指を離したときの click で閉じない)
      const rest = [...touches.entries()][0];
      if (rest) state.drag = { id: rest[0], x: rest[1].x, y: rest[1].y, startX: state.x, startY: state.y };
    };
    const onDown = (event) => {
      if (event.button !== 0 || event.target.closest?.("button")) return;
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2) {
          // 2本目の指: 1本指のドラッグと「背景を押したら閉じる」の判定を取り消し、ピンチを始める
          state.drag = null;
          state.dragged = true;
          viewport.classList.remove("is-dragging");
          // 指が枠の外へ出ても動きを受ける。実際に触れていない id(合成した動き・離れた指)では例外になるので握りつぶす
          touches.forEach((_, id) => { try { viewport.setPointerCapture?.(id); } catch { /* 捕まえられなくても、枠の中の動きは受けられる */ } });
          const m = pinchMetrics();
          pinch = { distance: m.distance, cx: m.cx, cy: m.cy, scale: state.scale, x: state.x, y: state.y };
          return;
        }
        if (touches.size > 2) return;
      }
      state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: state.x, startY: state.y };
      state.dragged = false;
    };
    const onMove = (event) => {
      if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && touches.size === 2) {
        const m = pinchMetrics();
        const [low, high] = limits();
        const target = Math.min(high, Math.max(low, pinch.scale * (m.distance / pinch.distance)));
        // ピンチを始めた指の間の点が今の指の間に来るように(指の間を中心に拡大。2本指のままの移動はそのまま見る位置の移動)
        state.x = m.cx - (pinch.cx - pinch.x) * (target / pinch.scale);
        state.y = m.cy - (pinch.cy - pinch.y) * (target / pinch.scale);
        state.scale = target;
        state.fitted = false;
        show();
        return;
      }
      if (!state.drag || event.pointerId !== state.drag.id) return;
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      // 動かし始めてから掴む(押しただけで掴むと、そのあとのクリックが背景のクリックになり、閉じてしまった)
      if (!state.dragged && Math.abs(dx) + Math.abs(dy) > 3) {
        state.dragged = true;
        try { viewport.setPointerCapture?.(event.pointerId); } catch { /* 捕まえられなくても動かせる */ }
        viewport.classList.add("is-dragging");
      }
      if (!state.dragged) return;
      state.x = state.drag.startX + dx;
      state.y = state.drag.startY + dy;
      show();
    };
    const onUp = (event) => {
      if (touches.delete(event.pointerId) && pinch) {
        if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        endPinch();
        return;
      }
      if (!state.drag || event.pointerId !== state.drag.id) return;
      if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      viewport.classList.remove("is-dragging");
      state.drag = null;
    };
    const onDragStart = (event) => event.preventDefault();
    const onDoubleClick = (event) => {
      if (event.target.closest?.("button")) return;
      event.preventDefault();
      const [cx, cy] = local(event);
      if (Math.abs(state.scale - 1) < 0.01) {
        if (Math.abs(fitScale() - 1) < 0.01) zoomTo(2, cx, cy);
        else fit();
      } else actual(cx, cy);
    };
    const handleKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return false;
      const step = 80;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (event.key === "+" || event.key === "=") zoomTo(state.scale * 1.25);
      else if (event.key === "-" || event.key === "_") zoomTo(state.scale / 1.25);
      else if (event.key === "0") fit();
      else if (event.key === "1") actual();
      else if (moves[event.key]) {
        state.x += moves[event.key][0];
        state.y += moves[event.key][1];
        show();
      } else return false;
      event.preventDefault();
      return true;
    };
    const buttons = [[parts.zoomIn, () => zoomTo(state.scale * 1.25)], [parts.zoomOut, () => zoomTo(state.scale / 1.25)], [parts.fit, fit], [parts.actual, () => actual()]]
      .filter(([button]) => button);
    const clicks = buttons.map(([button, run]) => {
      const listener = (event) => {
        event.stopPropagation();
        run();
      };
      button.addEventListener("click", listener);
      return [button, listener];
    });
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    viewport.addEventListener("dblclick", onDoubleClick);
    // 画像はブラウザが自分のドラッグ(画像を持ち出す)を始め、見る位置のドラッグが最初の一歩で止まった。それを止める
    viewport.addEventListener("dragstart", onDragStart);
    fit();
    return {
      fit,
      actual,
      zoomBy: (factor) => zoomTo(state.scale * factor),
      handleKey,
      resize: () => (state.fitted ? fit() : show()),
      // 直前の押し下げがドラッグだったか(ドラッグの終わりのクリックで、枠の外を押したとみなして閉じないため)
      wasDragged: () => state.dragged,
      state: () => ({ scale: state.scale, x: state.x, y: state.y, fitted: state.fitted }),
      destroy() {
        viewport.removeEventListener("wheel", onWheel);
        viewport.removeEventListener("pointerdown", onDown);
        viewport.removeEventListener("pointermove", onMove);
        viewport.removeEventListener("pointerup", onUp);
        viewport.removeEventListener("pointercancel", onUp);
        viewport.removeEventListener("dblclick", onDoubleClick);
        viewport.removeEventListener("dragstart", onDragStart);
        clicks.forEach(([button, listener]) => button.removeEventListener("click", listener));
        viewport.classList.remove("is-pannable", "is-dragging");
        ["position", "left", "top", "margin", "maxWidth", "maxHeight", "width", "height", "transformOrigin", "transform"].forEach((key) => { content.style[key] = ""; });
      },
    };
  }

  // 拡大表示に出す SVG の元の大きさ(100%)。viewBox があればその幅と高さ、無ければ width・height、それも無ければ画面に出ている大きさ。
  function svgNaturalSize(svg) {
    const view = svg.viewBox?.baseVal;
    if (view && view.width > 0 && view.height > 0) return { width: view.width, height: view.height };
    const width = Number.parseFloat(svg.getAttribute("width"));
    const height = Number.parseFloat(svg.getAttribute("height"));
    if (width > 0 && height > 0) return { width, height };
    const rect = svg.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  function joinChunks(attachment) {
    const chunks = attachment.chunks.map(base64ToBytes);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  function chunkBase64(bytes) {
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) chunks.push(bytesToBase64(bytes.subarray(offset, offset + CHUNK_SIZE)));
    return chunks;
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function fileToAttachment(file, id) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      id,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: bytes.length,
      sha256: await sha256Hex(bytes),
      encoding: "base64-chunks",
      chunkSize: CHUNK_SIZE,
      chunks: chunkBase64(bytes),
    };
  }

  // 記録の sha256 は16進。大文字で書かれていても同じ値として比べる(v247。Issue #111)。比べ方はここ1か所(保存HTMLのランタイムにも
  // そのまま埋め込む。以前はランタイムが手で写した別の比べ方で、大文字の記録の画像が保存HTMLでだけ「Hash mismatch」になった。Issue #219)。
  function sameDigest(actual, recorded) {
    return actual === String(recorded ?? "").toLowerCase();
  }

  async function verifyAttachment(attachment) {
    const bytes = joinChunks(attachment);
    const actual = await sha256Hex(bytes);
    return { ok: sameDigest(actual, attachment.sha256), actual, bytes };
  }

  // ---- 確かめ済みの添付の中身(Issue #217) ----
  // 以前は保存(Ctrl+S)のたびに、全部の添付をデコードして SHA-256 を取り直していた(100MB の動画で 1 回 約 0.3 秒)。添付の中身
  // (chunks の配列)は作った後に書き換えない決まり(app.js の Undo の履歴の説明)なので、一度ハッシュを取った配列は、その結果を覚えて
  // 使い回す。覚えるのは「配列 → 実際のハッシュ」で、記録の sha256 との比べは毎回する(記録の側が変われば、ちゃんと食い違いになる)。
  // 念のため、配列の長さと先頭・末尾の要素(同じ文字列そのもの)も一緒に覚え、変わっていたら覚えを使わずに取り直す。
  // 開いたファイル(外から来た中身)は repairAttachmentRecords が開くときに必ずハッシュを取る。ここで覚えるのはその結果。
  const verifiedChunks = new WeakMap();

  function rememberVerifiedChunks(attachment, actual) {
    const chunks = attachment?.chunks;
    if (!Array.isArray(chunks)) return;
    verifiedChunks.set(chunks, { length: chunks.length, first: chunks[0], last: chunks[chunks.length - 1], actual });
  }

  function verifiedDigestOf(attachment) {
    const chunks = attachment?.chunks;
    const known = Array.isArray(chunks) ? verifiedChunks.get(chunks) : undefined;
    if (!known || known.length !== chunks.length || known.first !== chunks[0] || known.last !== chunks[chunks.length - 1]) return null;
    return known.actual;
  }

  // 開いたファイルの添付の記録(sha256・size)を中身に合わせて直し、直した添付を返す(v247。Issue #111。エディタが開いた直後に呼ぶ)。
  async function repairAttachmentRecords(doc) {
    const repaired = [];
    for (const attachment of doc.attachments || []) {
      const result = await verifyAttachment(attachment);
      rememberVerifiedChunks(attachment, result.actual);
      const sizeWrong = attachment.size !== result.bytes.length;
      if (result.ok && !sizeWrong) continue;
      if (!result.ok) repaired.push(attachment);
      attachment.sha256 = result.actual;
      attachment.size = result.bytes.length;
    }
    return repaired;
  }

  // 保存の前の検査。確かめ済みの中身はハッシュを取り直さない(上の verifiedChunks)。新しく足した添付だけを確かめる。
  async function verifyDocument(doc) {
    for (const attachment of doc.attachments) {
      let actual = verifiedDigestOf(attachment);
      if (actual === null) {
        actual = (await verifyAttachment(attachment)).actual;
        rememberVerifiedChunks(attachment, actual);
      }
      if (!sameDigest(actual, attachment.sha256)) return { ok: false, attachment, actual };
    }
    return { ok: true };
  }

  // ---- 番号付きリストの番号の形(0.8.20。Issue #171。Notion の「数字 / 文字 / ローマ数字」) ----
  // "nested" = 1. → 1.1 → 1.1.1(これまでの形) / "decimal" = 1. 2. / "alpha" = a. b. … z. aa. / "roman" = i. ii. iii.
  // 形は「段」(続いている同じ深さの項目の並び)ごとで、その段の最初の項目の listStyle で決まる(途中で Enter・Tab しても形が変わらない)。
  // 値の無い段は、親の段が 1. a. i. のどれか(平らな形)なら段の深さで 1. → a. → i. を繰り返し(Notion の既定)、それ以外は "nested"。
  // 値の無い古い文書は、すべて "nested" になり、見た目は変わらない。エディタも保存HTMLも、この数え方1つを使う(P7)。
  const NUMBERED_LIST_STYLES = ["nested", "decimal", "alpha", "roman"];
  const NUMBERED_LIST_CYCLE = ["decimal", "alpha", "roman"];

  function numberedListStyleOf(block) {
    return NUMBERED_LIST_STYLES.includes(block?.listStyle) ? block.listStyle : null;
  }

  function alphaListNumber(count) {
    let text = "";
    for (let n = count; n > 0; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(97 + ((n - 1) % 26)) + text;
    return text;
  }

  // ローマ数字は 3999 まで(それより大きい番号は数字で出す)。
  function romanListNumber(count) {
    if (count < 1 || count > 3999) return String(count);
    const table = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let rest = count;
    let text = "";
    for (const [value, letters] of table) {
      while (rest >= value) {
        text += letters;
        rest -= value;
      }
    }
    return text;
  }

  // 番号付きの項目ごとに { marker, style(効いている形), runStart(段の最初の項目の id), level }。
  function numberedListInfo(blocks) {
    const info = new Map();
    let context = null;
    let counters = [];
    let styles = [];
    let starts = [];
    for (const block of blocks) {
      const nextContext = block.columnGroup ? block.columnGroup + ":" + (block.columnIndex || 0) : "document";
      if (nextContext !== context) {
        context = nextContext;
        counters = [];
        styles = [];
        starts = [];
      }
      if (block.type !== "numbered") {
        counters = [];
        styles = [];
        starts = [];
        continue;
      }
      // 7 段以上も段として数える(v259。Issue #139。以前は 6 で切り詰め、7 段目以降が 6 段目の続きの番号になった)。
      const level = clampIndent(block.indent);
      while (counters.length <= level) counters.push(0);
      if (!counters[level]) {
        // 段の始まり。形を決める(親の段 = これより浅い段のうち、いちばん深いもの)。
        let parent = null;
        for (let up = level - 1; up >= 0 && !parent; up -= 1) if (counters[up] > 0) parent = styles[up];
        styles[level] = numberedListStyleOf(block)
          || (parent && parent !== "nested" ? NUMBERED_LIST_CYCLE[level % NUMBERED_LIST_CYCLE.length] : "nested");
        starts[level] = block.id;
      }
      counters[level] = (counters[level] || 0) + 1;
      counters.length = level + 1;
      styles.length = level + 1;
      starts.length = level + 1;
      const style = styles[level];
      const count = counters[level];
      let marker;
      if (style === "decimal") marker = count + ".";
      else if (style === "alpha") marker = alphaListNumber(count) + ".";
      else if (style === "roman") marker = romanListNumber(count) + ".";
      else {
        // 存在しない親に番号 1 を補わない。親の無いままインデントされた項目は
        // 「1.1」ではなく、そのレベル単独の「1.」から数える。親の段の番号は、その段の形で書く(英字の親の下なら「b.1」)。
        const parts = [];
        counters.forEach((value, at) => {
          if (value > 0) parts.push(styles[at] === "alpha" ? alphaListNumber(value) : styles[at] === "roman" ? romanListNumber(value) : String(value));
        });
        marker = parts.join(".") + (parts.length === 1 ? "." : "");
      }
      info.set(block.id, { marker, style, runStart: starts[level], level });
    }
    return info;
  }

  function numberedListMarkers(blocks) {
    const markers = new Map();
    numberedListInfo(blocks).forEach((item, id) => markers.set(id, item.marker));
    return markers;
  }

  function renderPortableBlock(block, doc, childHtml = "", numberedMarkers = new Map(), options = {}) {
    if (block.type === "heading1") return '<h2' + blockColorAttrs(block) + ' id="' + blockAnchor(block) + '">' + headingNumberHtml(block) + renderInlineContent(block) + "</h2>";
    if (block.type === "heading2") return '<h3' + blockColorAttrs(block) + ' id="' + blockAnchor(block) + '">' + headingNumberHtml(block) + renderInlineContent(block) + "</h3>";
    if (block.type === "heading3") return '<h4' + blockColorAttrs(block) + ' id="' + blockAnchor(block) + '">' + headingNumberHtml(block) + renderInlineContent(block) + "</h4>";
    if (block.type === "heading4") return '<h5' + blockColorAttrs(block) + ' id="' + blockAnchor(block) + '">' + headingNumberHtml(block) + renderInlineContent(block) + "</h5>";
    if (block.type === "heading5") return '<h6' + blockColorAttrs(block) + ' id="' + blockAnchor(block) + '">' + headingNumberHtml(block) + renderInlineContent(block) + "</h6>";
    if (block.type === "toggleHeading1") return renderToggleBlock(block, "h2", childHtml);
    if (block.type === "toggleHeading2") return renderToggleBlock(block, "h3", childHtml);
    if (block.type === "toggleHeading3") return renderToggleBlock(block, "h4", childHtml);
    if (block.type === "toggleHeading4") return renderToggleBlock(block, "h5", childHtml);
    if (block.type === "toggleHeading5") return renderToggleBlock(block, "h6", childHtml);
    if (block.type === "toggle") return renderToggleBlock(block, "span", childHtml);
    if (block.type === "toc") return renderTocBlock(doc, options);
    if (block.type === "page") return renderPageLinkBlock(block, doc);
    if (block.type === "quote") return "<p" + blockColorAttrs(block, "quote") + ">" + renderInlineContent(block) + "</p>";
    // 呼び出し(Issue #161)。絵文字は本文の文字ではない(エディタも本文の外のボタン)。囲みの色は blockColorOf(既定はグレーの背景)。
    if (block.type === "callout") return "<div" + blockColorAttrs(block, "callout") + '><span class="callout-icon">' + escapeHtml(calloutIcon(block)) + '</span><div class="callout-text">' + renderInlineContent(block) + "</div></div>";
    // コード(言語は Issue #163)。言語のあるコードは字句ごとに色の印(<span class="tok-…">)を書く(スクリプトなしで色が出る。印刷も同じ)。
    // 言語の無いコードの出力は前と同じ。
    if (block.type === "code") {
      const language = codeLanguageOf(block);
      if (!language) return "<pre>" + escapeHtml(block.text) + "</pre>";
      return '<pre data-language="' + language + '">' + highlightedCodeHtml(block.text, language) + "</pre>";
    }
    if (block.type === "divider") return "<hr>";
    // 改ページ(v192)。画面には何も出さず、印刷・PDF でここから次の紙へ送る(@media print の .page-break)。
    if (block.type === "pagebreak") return '<div class="page-break" aria-hidden="true"></div>';
    if (block.type === "table") return renderPortableCaption(block, "table", options) + renderPortableTable(block, options);
    if (block.type === "chart") return renderPortableChart(block, options);
    if (block.type === "mermaid") return renderPortableMermaid(block, options);
    if (block.type === "math") return renderPortableMath(block);
    if (block.type === "bullet") return "<ul" + blockColorAttrs(block) + "><li>" + renderInlineContent(block) + "</li></ul>";
    if (block.type === "numbered") return "<p" + blockColorAttrs(block, "numbered-item") + '><span class="numbered-marker">' + escapeHtml(numberedMarkers.get(block.id) || "1.") + "</span><span>" + renderInlineContent(block) + "</span></p>";
    if (block.type === "todo") return "<p" + blockColorAttrs(block, "todo " + (block.checked ? "done" : "")) + '><span class="todo-mark">' + iconSvg(block.checked ? "checkbox-checked" : "checkbox") + "</span>" + renderInlineContent(block) + "</p>";
    if (block.type === "attachment") {
      const attachment = doc.attachments.find((item) => item.id === block.attachmentId);
      if (!attachment) return "";
      const view = attachmentView(block, attachment);
      if (view === "video") {
        // 動画(v273)。中身はランタイムが添付から blob にして入れる(hydrateVideo)。preload は "metadata"(開いただけで全部は読まない)。
        return ('<figure class="image-attachment video-attachment" data-align="' + imageAlign(block) + '" style="--image-width:' + imageWidth(block) + '%"><video controls preload="metadata" playsinline data-attachment-video="' + escapeHtml(attachment.id) + '" data-unplayable="' + escapeHtml(unplayableVideoText(attachment)) + '" aria-label="' + escapeHtml(attachment.name) + '"></video><figcaption><div><strong>' + escapeHtml(attachment.name) + '</strong><div class="meta">' + escapeHtml(attachment.mime) + " / " + formatBytes(attachment.size) + '</div></div><button data-download="' + escapeHtml(attachment.id) + '">Download</button></figcaption></figure>').replace("<figcaption>", () => renderPortableCaption(block, "figure", options) + "<figcaption>");
      }
      if (view === "audio") {
        // 音声(0.8.20)。ファイルのカード(名前・大きさ・Download)の下にプレーヤー。中身はランタイムが添付から blob にして入れる(hydrateAudio)。
        // 図ではない(番号・題名は付けない)。
        return '<section class="attachment audio-attachment"><div><strong>' + escapeHtml(attachment.name) + '</strong><div class="meta">' + escapeHtml(attachment.mime) + " / " + formatBytes(attachment.size) + '</div></div><button data-download="' + escapeHtml(attachment.id) + '">Download</button><audio controls preload="metadata" data-attachment-audio="' + escapeHtml(attachment.id) + '" data-unplayable="' + escapeHtml(unplayableVideoText(attachment)) + '" aria-label="' + escapeHtml(attachment.name) + '"></audio></section>';
      }
      if (view === "pdf" || view === "pdf-read") {
        // PDF(v277)。中身はランタイムが添付から blob にして iframe で入れる(hydratePdf)。スクリプトが動かないとき(印刷の枠など)は、
        // 名前だけの囲み(.pdf-fallback)が見える。
        return ('<figure class="image-attachment pdf-attachment" data-pdf-view="' + (view === "pdf" ? "preview" : "read") + '" data-align="' + imageAlign(block) + '" style="--image-width:' + attachmentWidth(block, view) + "%" + (view === "pdf-read" ? ";--pdf-height:" + pdfReadHeight(block) + "px" : "") + '"><div class="pdf-frame" data-attachment-pdf="' + escapeHtml(attachment.id) + '" data-unplayable="' + escapeHtml(pdfUnavailableText()) + '"><span class="pdf-fallback">PDF: ' + escapeHtml(attachment.name) + " (" + formatBytes(attachment.size) + ')</span></div><figcaption><div><strong>' + escapeHtml(attachment.name) + '</strong><div class="meta">' + escapeHtml(attachment.mime) + " / " + formatBytes(attachment.size) + '</div></div><button data-download="' + escapeHtml(attachment.id) + '">Download</button></figcaption></figure>').replace("<figcaption>", () => renderPortableCaption(block, "figure", options) + "<figcaption>");
      }
      if (view === "image") {
        return ('<figure class="image-attachment" data-align="' + imageAlign(block) + '" style="--image-width:' + imageWidth(block) + '%"><img data-attachment-image="' + escapeHtml(attachment.id) + '" alt="' + escapeHtml(attachment.name) + '"><figcaption><div><strong>' + escapeHtml(attachment.name) + '</strong><div class="meta">' + escapeHtml(attachment.mime) + " / " + formatBytes(attachment.size) + '</div></div><button data-download="' + escapeHtml(attachment.id) + '">Download</button></figcaption></figure>').replace("<figcaption>", () => renderPortableCaption(block, "figure", options) + "<figcaption>");
      }
      return '<section class="attachment"><div><strong>' + escapeHtml(attachment.name) + '</strong><div class="meta">' + escapeHtml(attachment.mime) + " / " + formatBytes(attachment.size) + '</div></div><button data-download="' + escapeHtml(attachment.id) + '">Download</button></section>';
    }
    return "<p" + blockColorAttrs(block) + ">" + renderInlineContent(block) + "</p>";
  }

  function renderToggleBlock(block, tag, childHtml) {
    return '<details class="toggle"' + (block.open === false ? "" : " open") + '><summary' + blockColorAttrs(block) + '><' + tag + ' id="' + blockAnchor(block) + '">' + headingNumberHtml(block) + renderInlineContent(block) + "</" + tag + "></summary>" + childHtml + "</details>";
  }

  // UI のアイコン(v174)。以前は文字(⋮ ▸ ☰ ← 🗑 など)をアイコンにしていたが、文字の幅・余白・形は
  // OS や入っているフォントで変わり、Linux ではボタンからはみ出したり(v172)位置がずれたり(v173)した。
  // そこで図形(SVG)で描く。エディタ(fmt.iconSvg)も保存HTMLも、この1か所の定義を使う(P25)。
  // 線は stroke(currentColor・太さ2)、塗りは fill="currentColor" の部品で描く。box を省くと 0 0 24 24。
  const iconFill = (d) => '<path fill="currentColor" stroke="none" d="' + d + '"/>';
  const iconDot = (cx, cy, r) => '<circle fill="currentColor" stroke="none" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
  const ICON_BOX = '<rect x="4" y="4" width="16" height="16" rx="2.5"/>';
  const UI_ICONS = {
    // ブロックのつまみ。ボタン(16x24)と同じ枠で描き、2列の点を定位置に置く。
    // 点の半径は 1.4(v183。ユーザー指示「つまみの丸をわずかに小さく」。以前は 1.6)。
    grip: { box: "0 0 16 24", body: [5, 11].flatMap((x) => [7, 12, 17].map((y) => iconDot(x, y, 1.4))).join("") },
    // トグルの三角。**絵の左端が枠の左端(x=0)**になる形にしてある。リストの記号と本文の左端をそろえる
    // ときに、字形の余白の補正(v127・v173)が要らない。
    "caret-right": { box: "0 0 12 12", body: iconFill("M0 1L10 6L0 11Z") },
    "caret-down": { box: "0 0 12 12", body: iconFill("M0 1H12L6 11Z") },
    dot: { body: iconDot(12, 12, 4) },
    plus: { body: '<path d="M12 5v14M5 12h14"/>' },
    minus: { body: '<path d="M5 12h14"/>' },
    close: { body: '<path d="M6 6l12 12M18 6L6 18"/>' },
    check: { body: '<path d="M5 12.5l4.5 4.5L19 7"/>' },
    "arrow-up": { body: '<path d="M12 19V5M5 12l7-7 7 7"/>' },
    "arrow-down": { body: '<path d="M12 5v14M5 12l7 7 7-7"/>' },
    "arrow-left": { body: '<path d="M19 12H5M12 5l-7 7 7 7"/>' },
    "arrow-right": { body: '<path d="M5 12h14M12 5l7 7-7 7"/>' },
    download: { body: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>' },
    caption: { body: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M6 19.5h12"/>' },
    print: { body: '<path d="M7 9V4h10v5"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6H7z"/>' },
    list: { body: '<path d="M4 6h16M4 12h16M4 18h16"/>' },
    // 左の目次を開け閉めするボタン(v203。ユーザー指示: ハンバーガーではなく Claude Desktop と同じ「左に仕切りのある四角」)。
    sidebar: { body: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>' },
    more: { body: iconDot(6, 12, 1.8) + iconDot(12, 12, 1.8) + iconDot(18, 12, 1.8) },
    trash: { body: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>' },
    duplicate: { body: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>' },
    checkbox: { body: ICON_BOX },
    "checkbox-checked": { body: ICON_BOX + '<path d="M8 12.5l3 3 5-6"/>' },
    quote: { body: iconFill("M10.5 6C7 7.2 5 9.8 5 13.5V18h5.5v-5.5H8.2c.2-2 1.2-3.4 3-4.4z")
      + iconFill("M19.5 6c-3.5 1.2-5.5 3.8-5.5 7.5V18h5.5v-5.5h-2.3c.2-2 1.2-3.4 3-4.4z") },
    divider: { body: '<path d="M4 12h16"/>' },
    // 呼び出し(Issue #161): 角の丸い囲みの左に丸(絵文字の場所)と、右に文の線。
    callout: { body: '<rect x="3" y="5" width="18" height="14" rx="2.5"/>' + iconDot(8, 12, 1.9) + '<path d="M11.5 10h6M11.5 14h4"/>' },
    // ページのアイコン・カバーを足す道具(Issue #184): 笑顔と、山と太陽の絵。
    emoji: { body: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2"/>' + iconDot(9.2, 10, 1.1) + iconDot(14.8, 10, 1.1) },
    image: { body: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M4 17l5-5 4 4 2.5-2.5L20 18"/>' + iconDot(15.5, 9.5, 1.4) },
    // ブロックの色(Issue #162): 「A」の字と下の線(色の印)。
    color: { body: '<path d="M7 17L12 4.5 17 17M8.8 12.5h6.4"/><path d="M5 20.5h14"/>' },
    // リンク(v200): Material Symbols の link(Apache License 2.0。書式ツールバーのほかのアイコンと同じ出どころ)。
    link: { box: "0 -960 960 960", body: iconFill("M450-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h170v60H280q-58.33 0-99.17 40.76-40.83 40.77-40.83 99Q140-422 180.83-381q40.84 41 99.17 41h170v60ZM325-450v-60h310v60H325Zm185 170v-60h170q58.33 0 99.17-40.76 40.83-40.77 40.83-99Q820-538 779.17-579q-40.84-41-99.17-41H510v-60h170q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H510Z") },
    // 改ページ: 上下の紙の端と、間の点線(v191)。
    "page-break": { body: '<path d="M6 3v5h12V3M6 21v-5h12v5"/><path d="M3 12h2.5M8.5 12h3M14.5 12h3M20.5 12H21"/>' },
    table: { body: ICON_BOX + '<path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16"/>' },
    page: { body: '<path d="M6 2.5h8.2l4.3 4.3v14.7H6z"/><path d="M14 2.5v4.5h4.5"/><path d="M9 12.5h6M9 16.5h6"/>' },
    chart: { body: '<path d="M4 4v16h16"/><path d="M7.5 15l4-4 3 2.5 5-6"/>' },
    // Mermaid の図(v194): 2つの箱を線でつないだ流れ図。
    diagram: { body: '<rect x="3" y="3.5" width="8" height="6" rx="1.5"/><rect x="13" y="14.5" width="8" height="6" rx="1.5"/><path d="M7 9.5v8h6"/>' },
    sqrt: { body: '<path d="M2.5 12.5h2.5l3 7 4.5-15.5h9.5"/><path d="M14.5 10l5.5 6.5M20 10l-5.5 6.5"/>' },
    // 表の操作。ヘッダー行(上辺を塗った四角)とヘッダー列(左辺を塗った四角)は対称のペアに見えるよう、
    // 同じ描き方でそろえる(以前の ⬒/◧ と同じ考え。ユーザー指示)。
    "row-before": { body: '<path d="M5 4h14M12 20V9M7 13l5-5 5 5"/>' },
    "row-after": { body: '<path d="M5 20h14M12 4v11M7 11l5 5 5-5"/>' },
    "row-delete": { body: ICON_BOX + '<path d="M8 12h8"/>' },
    "col-before": { body: '<path d="M4 5v14M20 12H9M13 7l-5 5 5 5"/>' },
    "col-after": { body: '<path d="M20 5v14M4 12h11M11 7l5 5-5 5"/>' },
    "col-delete": { body: ICON_BOX + '<path d="M12 8v8"/>' },
    "cells-merge": { body: ICON_BOX + '<path d="M4 9h16M4 15h16"/>' },
    "cells-split": { body: ICON_BOX + '<path d="M9 4v16M15 4v16"/>' },
    "header-row": { body: ICON_BOX + iconFill("M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5V10H4z") },
    // 表のセルの配置・並べ替え・絞り込み(v232)。
    "align-left": { body: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>' },
    "align-center": { body: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>' },
    "align-right": { body: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>' },
    sort: { body: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>' },
    // 表の全画面の編集(v238): 四隅が外へ開く形と、内へ閉じる形。
    expand: { body: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>' },
    collapse: { body: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>' },
    // 数の見せ方: 「123」の字を線で描いた形(表の道具は図形だけで、文字は使わない。v175 のユーザー指示と同じ流儀)。
    "number-format": { body: '<path d="M3.5 9.5l2.5-2v9"/><path d="M9 9.3a2.2 2.2 0 0 1 4.2.6c0 2.1-4.2 4-4.2 6.6h4.4"/><path d="M15.5 7.5h4.2l-2.5 3.3a2.8 2.8 0 1 1-2.1 4.8"/>' },
    filter: { body: '<path d="M4 5h16l-6 7.5V18l-4 2v-7.5z"/>' },
    // グループ分け(Issue #179): 組の頭(下向きの三角)と、その下に字下げした行が2組。
    group: { body: '<path d="M3.5 4.5l2 2.5 2-2.5z"/><path d="M10 5.5h10.5M7 9.5h13.5M7 12.5h13.5"/><path d="M3.5 15.5l2 2.5 2-2.5z"/><path d="M10 16.5h10.5M7 20.5h13.5"/>' },
    // 文中の日付(Issue #173)。日付の印の頭と、「@」の一覧の日付の候補に使う。
    calendar: { body: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
    "header-col": { body: ICON_BOX + iconFill("M6.5 4A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10V4z") },
    // ページのロック(v178)。閉じた錠と開いた錠。
    lock: { body: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>' },
    "lock-open": { body: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>' },
    // 書式ツールバー(v175)。自作の文字(B・I・S・Tx)は分かりにくかったので(ユーザー指示)、Google の
    // Material Symbols(Outlined, weight 400。Apache License 2.0、https://fonts.google.com/icons)の形をそのまま使う。
    // 枠は Material の 960 単位。文字色(A)と背景色(マーカー)は今の絵のまま(ユーザー確認)。
    "format-bold": { box: "0 -960 960 960", body: iconFill("M275-200v-560h228q66 0 114.5 42T666-612q0 38-21 70t-56 49v6q43 14 69.5 50t26.5 81q0 68-52.5 112T510-200H275Zm86-76h144q38 0 66-25t28-63q0-37-28-62t-66-25H361v175Zm0-247h136q35 0 60.5-23t25.5-58q0-35-25.5-58.5T497-686H361v163Z") },
    "format-italic": { box: "0 -960 960 960", body: iconFill("M224-199v-80h134l139-409H338v-80h380v80H584L445-279h159v80H224Z") },
    // 下線(Issue #172): Material Symbols の format_underlined(Apache License 2.0。ほかの書式のアイコンと同じ出どころ)。
    "format-underlined": { box: "0 -960 960 960", body: iconFill("M200-120v-80h560v80H200Zm280-160q-101 0-157-63t-56-167v-330h103v336q0 56 28 91t82 35q54 0 82-35t28-91v-336h103v330q0 104-56 167t-157 63Z") },
    "format-strikethrough": { box: "0 -960 960 960", body: iconFill("M504-160q-78 0-142-41.5T269-313l69-29q20 48 65 77t101 29q52 0 83-27t31-73q0-23-9.5-48.5T582-430h84q14 23 21 46t7 48q0 78-53 127t-137 49ZM80-490v-60h800v60H80Zm394-316q66 0 117 31t75 86l-69 31q-14-34-46.5-53T474-730q-49 0-79 24t-30 66q0 8 1 15t3 15h-74q-2-8-3-16t-1-16q0-73 51-118.5T474-806Z") },
    "format-clear": { box: "0 -960 960 960", body: iconFill("m507-524-77-76 24-56h-79L271-760h529v100H565l-58 136ZM806-56 457-406l-88 206H260l120-282L56-806l42-42L848-98l-42 42Z") },
  };

  function iconSvg(name, className = "ui-icon") {
    const icon = UI_ICONS[name];
    if (!icon) throw new Error("Unknown icon: " + name);
    return '<svg class="' + className + '" data-icon="' + name + '" viewBox="' + (icon.box || "0 0 24 24")
      + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
      + ' aria-hidden="true" focusable="false">' + icon.body + "</svg>";
  }

  // CSS の mask に使う data URI(保存HTMLのトグルの三角は ::before で描くため)。色は background で付ける。
  // 線の絵(ToDo の箱など)も描けるよう、iconSvg と同じ線の指定を付け、塗りは黒(mask では黒=見える)にする(v190)。
  // color を渡すと、その色で描いた絵の URL になる(mask ではなく background-image に使う。エディタの ToDo の箱)。
  function iconMaskUrl(name, color = "#000") {
    const icon = UI_ICONS[name];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (icon.box || "0 0 24 24")
      + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + icon.body.replaceAll('fill="currentColor"', 'fill="' + color + '"') + "</svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg).replaceAll("'", "%27") + '")';
  }

  // ページブロック = 子ページへのリンク。保存HTMLの中のそのページ(<section id="page-…">)へのリンクにする。
  // スクリプトが動けば、そのページへ切り替わる(Step 4)。動かなければ、縦に並んだそのページへ飛ぶ。
  // ページブロックのアイコン(書類の形。本文の文字に近い濃い色の太い輪郭。v153)。エディタも保存HTMLも
  // これを使う(P25)。色は currentColor(CSS の --page-link-icon / .page-link-icon の color)で決める。
  const PAGE_LINK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M6 2.5h8.2l4.3 4.3v14.7H6z" fill="#fff"/><path d="M14 2.5v4.5h4.5"/><path d="M9 12.5h6M9 16.5h6"/></svg>';

  function renderPageLinkBlock(block, doc) {
    const pages = pagesOf(doc);
    const target = pages.find((page) => page.id === block.pageId);
    const title = escapeHtml(pageTitleOf(target));
    // 行き先のページにアイコン(Issue #184)があれば、書類の形の代わりにその絵文字(Notion と同じ)。
    const emoji = pageIconOf(target);
    const iconHtml = emoji
      ? '<span class="page-link-icon is-emoji" aria-hidden="true">' + escapeHtml(emoji) + "</span>"
      : '<span class="page-link-icon" aria-hidden="true">' + PAGE_LINK_ICON_SVG + "</span>";
    // 1ページの文書の出力は従来と同一に保つ(目立たせる見た目の CSS は2ページ以上のときだけ載るため。
    // 1ページで出るのは、行き先の無いリンクか自分自身へのリンクだけ)。
    if (!target || pages.length < 2) {
      const icon = iconHtml + " ";
      if (!target) return '<p class="page-link is-missing">' + icon + title + "</p>";
      return '<p class="page-link"><a href="#' + pageAnchor(target) + '">' + icon + title + "</a></p>";
    }
    return '<p class="page-link"><a href="#' + pageAnchor(target) + '">' + iconHtml + '<span class="page-link-title">' + title + "</span></a></p>";
  }

  function pageAnchor(page) {
    return pageLinkHref(page.id).slice(1);
  }

  // ---- ページ目次の導出(エディタと保存HTMLが同じコードを使う。P25) ----
  // ツリーは**ページブロック(リンク)から毎回導く**。ページに親子関係のデータは持たせない
  // (持たせると、リンクと親子の2つの真実がずれる)。規則:
  //  ・**ルートは先頭ページだけ**(v140。ユーザーが承認した図「ホームの下に階層、どの親にも繋がって
  //    いないページは『未分類』に集まる」のとおり)。先頭ページは削除できず必ずあるので、入口は常に1つ
  //  ・**未分類 = 先頭ページから辿れないページすべて**(リンクの無いページ・外から切れた循環・
  //    リンク元のページを削除された子)。未分類の中は、**未分類の中で入次数0のページを頭**にして
  //    その下に子を辿る。どこからも入れない循環だけが残るので、それは文書順に頭にする
  //  ・親が複数あるページは両方の親の下に出す
  //  ・一度展開したページは、2回目以降は葉として置く(再展開しない)。これで循環も止まる
  // 結果として**どんなリンク構造でも、すべてのページが目次に1回以上現れる**(テストで固定)。
  function derivePageTree(pages) {
    const childrenOf = pageChildrenMap(pages);
    const inDegree = new Map(pages.map((page) => [page.id, 0]));
    childrenOf.forEach((children) => children.forEach((child) => inDegree.set(child, inDegree.get(child) + 1)));
    const expanded = new Set();
    const build = (pageId) => buildPageTreeNode(childrenOf, expanded, pageId);
    const firstPageId = pages[0]?.id;
    const roots = firstPageId ? [build(firstPageId)] : [];
    // 先頭から辿れるページ(roots を作った時点の expanded)から入るリンクは無いので、ここでの入次数は
    // 未分類の中だけで数えたものと同じ。
    const heads = pages.filter((page) => !expanded.has(page.id) && inDegree.get(page.id) === 0);
    const unclassified = heads.map((page) => build(page.id));
    pages.forEach((page) => {
      if (!expanded.has(page.id)) unclassified.push(build(page.id));
    });
    return { roots, unclassified };
  }

  // 親のページの並び(先頭ページから、そのページの親まで)。目次と同じ木(derivePageTree)の、最初に展開される場所までの道。
  // 先頭ページや、どこからもリンクされていないページは空。題名の上の「親のページ名」(v201)がエディタと保存HTMLで使う(P25)。
  function pageAncestors(pages, pageId) {
    const { roots, unclassified } = derivePageTree(pages);
    const path = [];
    const walk = (node) => {
      if (node.repeated) return false;
      if (node.pageId === pageId) return true;
      path.push(node.pageId);
      if (node.children.some(walk)) return true;
      path.pop();
      return false;
    };
    for (const root of [...roots, ...unclassified]) {
      if (walk(root)) return path.slice();
      path.length = 0;
    }
    return [];
  }

  // 1つのページから下を展開する。**一度展開したページは2回目以降は葉**(循環もこれで止まる)。
  // 目次の導出と、検索の「このページと子ページ」が**同じ訪問済みの仕組み**を使う(P25。別実装にしない)。
  function buildPageTreeNode(childrenOf, expanded, pageId) {
    if (expanded.has(pageId)) return { pageId, children: [], repeated: true };
    expanded.add(pageId);
    return {
      pageId,
      children: (childrenOf.get(pageId) || []).map((child) => buildPageTreeNode(childrenOf, expanded, child)),
      repeated: false,
    };
  }

  // ツリーを上から順に、展開したページ(各ページ1回)だけを並べる。
  function flattenPageTree(nodes, out = []) {
    nodes.forEach((node) => {
      if (node.repeated) return;
      out.push(node.pageId);
      flattenPageTree(node.children, out);
    });
    return out;
  }

  // pageId と、そこからページブロックのリンクで辿れるページ(子・孫…)。**自分を含む**。並びは目次の順。
  // 親・兄弟・未分類は入らない(リンクを下へ辿るだけ)。
  function pageSubtreeIds(pages, pageId) {
    const childrenOf = pageChildrenMap(pages);
    if (!childrenOf.has(pageId)) return [];
    return flattenPageTree([buildPageTreeNode(childrenOf, new Set(), pageId)]);
  }

  // 全ページを目次の順に(先頭ページの下の階層 → 未分類)。各ページ1回。
  function pagesInTreeOrder(pages) {
    const { roots, unclassified } = derivePageTree(pages);
    return flattenPageTree([...roots, ...unclassified]);
  }

  // ページ id → そのページの本文にあるリンク先(重複を除く)。同じページ内に同じ子へのリンクが2つあっても、
  // 目次ではその親の下に1回だけ出す(親ごとに重複を除く)。
  function pageChildrenMap(pages) {
    const known = new Set(pages.map((page) => page.id));
    return new Map(pages.map((page) => [
      page.id,
      [...new Set((page.blocks || []).filter((block) => block.type === "page" && known.has(block.pageId)).map((block) => block.pageId))],
    ]));
  }

  // 先頭ページからリンクを辿って行けるページ。skipPageId のページは無いものとして辿る(削除の下見)。
  function pagesReachableFromFirst(pages, childrenOf, skipPageId = null) {
    const reached = new Set();
    const firstPageId = pages[0]?.id;
    const pending = firstPageId && firstPageId !== skipPageId ? [firstPageId] : [];
    while (pending.length) {
      const pageId = pending.pop();
      if (reached.has(pageId)) continue;
      reached.add(pageId);
      childrenOf.get(pageId).forEach((child) => {
        if (child !== skipPageId && !reached.has(child)) pending.push(child);
      });
    }
    return reached;
  }

  // ---- ページの移動の履歴(エディタと保存HTMLのランタイムが**同じ関数**を使う。P25) ----
  // ブラウザの履歴と同じ形: 1本の列と今の位置。**無くなったページの項目は取り除かず、辿るときに飛ばす**
  // (取り除くと、Undo でページが戻っても履歴は戻らない)。どれが辿れるかは呼び出し側が isReachable で決める
  // (エディタ: 存在して今いるページでない / 保存HTML: そのページの <section> があって今いるページでない)。
  // **保存HTMLにはこの関数のソースをそのまま埋め込む**ので、外側の変数・関数を参照しないこと。
  function createPageHistory(isReachable) {
    let entries = [];
    let index = -1;
    return {
      // from から to へ移った(目次・リンクから)。戻った状態で移ったら進む側は捨てる。最初の移動のとき・
      // Undo で別ページへ切り替わっていたときは、離れるページをここで積む。
      visit(from, to) {
        entries = entries.slice(0, index + 1);
        if (entries[entries.length - 1] !== from) entries.push(from);
        entries.push(to);
        index = entries.length - 1;
      },
      // 今の位置から step の向き(-1 = 戻る / 1 = 進む)へ、辿れる最初の項目の位置。無ければ -1。
      reachable(step) {
        for (let i = index + step; i >= 0 && i < entries.length; i += step) {
          if (isReachable(entries[i])) return i;
        }
        return -1;
      },
      moveTo(i) {
        index = i;
        return entries[i];
      },
      // 位置だけを pageId の最寄りの項目へ合わせる(まず進む側、無ければ戻る側。見つからなければそのまま)。
      // 列は変えず、新しい項目も積まない(エディタの Undo/Redo でページが切り替わったとき)。
      align(pageId) {
        if (entries[index] === pageId) return;
        for (let i = index + 1; i < entries.length; i += 1) {
          if (entries[i] === pageId) { index = i; return; }
        }
        for (let i = index - 1; i >= 0; i -= 1) {
          if (entries[i] === pageId) { index = i; return; }
        }
      },
      // 今いるページ(removedId)が無くなったときの移り先: 位置より前で exists を満たす最寄りの項目へ
      // 位置を戻す(**「戻る」と同じ扱い**。列は切り詰めないので、無くなったページは進む側に残る)。
      stepBackFrom(removedId, exists) {
        const start = entries[index] === removedId ? index - 1 : index;
        for (let i = start; i >= 0; i -= 1) {
          if (exists(entries[i])) { index = i; return entries[i]; }
        }
        return null;
      },
      reset() {
        entries = [];
        index = -1;
      },
    };
  }

  // 保存HTMLのページ目次(2ページ以上のとき)。**書き出す時点で導出して静的な HTML にする**(保存HTMLは
  // 文書が変わらないので、ツリーを導くコードを持ち込まなくてよい)。見た目・規則はエディタの目次と同じ。
  // 今いるページの強調はランタイムが付ける。スクリプトが動かないときは CSS で隠れている。
  function renderPortablePageTree(pages) {
    const { roots, unclassified } = derivePageTree(pages);
    const byId = new Map(pages.map((page) => [page.id, page]));
    const list = (nodes, extraClass = "") => '<ul class="doc-page-tree-list' + extraClass + '">' + nodes.map((node) => {
      const page = byId.get(node.pageId);
      const repeated = node.repeated ? ' is-repeated" title="ほかの場所にも出ているページ(ここでは中を開かない)' : "";
      const icon = pageIconOf(page);
      return '<li><a class="doc-page-tree-item' + repeated + '" href="#' + pageAnchor(page) + '" data-page-id="'
        + escapeHtml(page.id) + '">' + (icon ? '<span class="doc-page-tree-icon" aria-hidden="true">' + escapeHtml(icon) + "</span>" : "")
        + escapeHtml(pageTitleOf(page)) + "</a>"
        + (node.children.length ? list(node.children) : "") + "</li>";
    }).join("") + "</ul>";
    return '<aside class="doc-page-tree" id="doc-page-tree" aria-label="ページ目次"><div class="doc-page-tree-heading">ページ</div>'
      + list(roots)
      + (unclassified.length ? '<div class="doc-page-tree-section">未分類</div>' + list(unclassified, " is-unclassified") : "")
      + "</aside>";
  }

  // 目次の開閉と戻る/進む(アイコンは UI_ICONS の sidebar・arrow-left・arrow-right)。エディタのツールバー左端と同じ並び・同じ意味。
  const PORTABLE_PAGE_BAR = '<div class="doc-page-bar" id="doc-page-bar">'
    + '<button type="button" id="doc-page-tree-toggle" aria-label="ページ目次を開閉" aria-controls="doc-page-tree" aria-expanded="true" title="ページ目次">' + iconSvg("sidebar") + "</button>"
    + '<button type="button" id="doc-page-back" aria-label="前のページへ戻る" title="戻る" disabled>' + iconSvg("arrow-left") + "</button>"
    + '<button type="button" id="doc-page-forward" aria-label="次のページへ進む" title="進む" disabled>' + iconSvg("arrow-right") + "</button>"
    + '<nav class="doc-page-path" id="doc-page-path" aria-label="ページの場所"></nav>'
    + "</div>";

  // ページの場所の中身(v207。エディタの renderPagePath と同じ規則: 「親 › 自分」、親の親があれば「… › 親 › 自分」。
  // 「…」は省いた上の階層の名前を title に持ち、押すと親の親へ)。リンクは #ページ で、ランタイムの既存のリンクの扱いで移る。
  function renderPortablePagePath(pages, page) {
    const ancestors = pageAncestors(pages, page.id).map((id) => pages.find((item) => item.id === id)).filter(Boolean);
    const sep = '<span class="doc-page-path-sep" aria-hidden="true">›</span>';
    const link = (target, text, title) => '<a class="doc-page-path-item" href="#' + pageAnchor(target) + '" title="' + escapeHtml(title) + '">' + escapeHtml(text) + "</a>";
    let html = "";
    if (ancestors.length > 1) {
      const hidden = ancestors.slice(0, -1);
      html += link(hidden[hidden.length - 1], "…", hidden.map((item) => pageTitleOf(item)).join(" › ")) + sep;
    }
    if (ancestors.length) {
      const parent = ancestors[ancestors.length - 1];
      html += link(parent, pageTitleOf(parent), pageTitleOf(parent)) + sep;
    }
    const title = escapeHtml(pageTitleOf(page));
    return html + '<span class="doc-page-path-current" aria-current="page" title="' + title + '">' + title + "</span>";
  }

  // 2ページ以上のときだけ足すランタイム。移動の履歴は createPageHistory の**ソースをそのまま埋め込む**
  // (エディタと同じコード)。URL(location.hash / History API)は書き換えない: ブラウザ自身の戻る操作と
  // ぶつけないため(エディタの v136 の判断と同じ)。開いたときの # がページを指していれば、そのページから始める。
  // 関数のソースを保存HTMLへ埋め込む形に整える: 行コメントを落とし(サイズ)、改行を LF にそろえる
  // (このファイルは CRLF なので、そのままだと保存HTMLの中に CR が混ざる)。
  function embeddedSource(fn) {
    return fn.toString().replace(/\r\n/g, "\n").replace(/^[ \t]*\/\/[^\n]*\n/gm, "");
  }

  function portablePagesRuntime() {
    return `(() => {
  const createPageHistory = ${embeddedSource(createPageHistory)};
  const pages = [...document.querySelectorAll("section.doc-page")];
  const byId = new Map(pages.map((page) => [page.id, page]));
  const tree = document.querySelector("#doc-page-tree");
  const toggle = document.querySelector("#doc-page-tree-toggle");
  const backButton = document.querySelector("#doc-page-back");
  const forwardButton = document.querySelector("#doc-page-forward");
  const pagePath = document.querySelector("#doc-page-path");
  const positions = new Map();
  let current = null;
  const history = createPageHistory((id) => id !== current && byId.has(id));
  const narrow = () => matchMedia("(max-width: 900px)").matches;
  function syncToggle() { toggle.setAttribute("aria-expanded", String(narrow() ? tree.classList.contains("is-overlay-open") : !tree.classList.contains("is-collapsed"))); }
  function closeOverlay() { tree.classList.remove("is-overlay-open"); syncToggle(); }
  function show(id, restore) {
    if (current) positions.set(current, scrollY);
    current = id;
    pages.forEach((page) => page.classList.toggle("is-current", page.id === id));
    tree.querySelectorAll(".doc-page-tree-item").forEach((item) => {
      const on = item.getAttribute("href") === "#" + id;
      item.classList.toggle("is-current", on);
      if (on) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    });
    const source = byId.get(id).querySelector(":scope > template.doc-page-path-src");
    if (pagePath) pagePath.replaceChildren(...(source ? [source.content.cloneNode(true)] : []));
    scrollTo(0, restore ? positions.get(id) || 0 : 0);
    closeOverlay();
    backButton.disabled = history.reachable(-1) < 0;
    forwardButton.disabled = history.reachable(1) < 0;
  }
  // #… の読み取り。壊れた %(例 #%)で decodeURIComponent が投げると、ページの切り替えが動かず全ページが縦に並んだ(v244)。
  function decodeHash(value) { try { return decodeURIComponent(value); } catch { return value; } }
  function go(id) { if (!byId.has(id) || id === current) return; history.visit(current, id); show(id, false); }
  function step(direction) { const index = history.reachable(direction); if (index >= 0) show(history.moveTo(index), true); }
  backButton.addEventListener("click", () => step(-1));
  forwardButton.addEventListener("click", () => step(1));
  toggle.addEventListener("click", () => { tree.classList.toggle(narrow() ? "is-overlay-open" : "is-collapsed"); syncToggle(); });
  const resizer = document.createElement("div");
  resizer.className = "doc-page-tree-resizer";
  resizer.tabIndex = 0;
  resizer.title = "ドラッグで目次の幅を変える(ダブルクリックで元の幅)";
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-controls", "doc-page-tree");
  resizer.setAttribute("aria-label", "ページ目次の幅");
  tree.after(resizer);
  let treeWidth = 240;
  let drag = null;
  const maxTreeWidth = () => Math.max(160, Math.min(600, Math.round(innerWidth * .5)));
  function applyTreeWidth() {
    const shown = Math.max(160, Math.min(maxTreeWidth(), treeWidth));
    tree.style.setProperty("--doc-page-tree-width", shown + "px");
    resizer.setAttribute("aria-valuenow", String(shown));
    resizer.setAttribute("aria-valuemin", "160");
    resizer.setAttribute("aria-valuemax", String(maxTreeWidth()));
  }
  function setTreeWidth(width) { treeWidth = Math.round(Math.max(160, Math.min(maxTreeWidth(), width))); applyTreeWidth(); }
  applyTreeWidth();
  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add("resizing");
    document.documentElement.classList.add("doc-page-tree-resizing");
    drag = { id: event.pointerId, x: event.clientX, width: tree.getBoundingClientRect().width };
  });
  resizer.addEventListener("pointermove", (event) => { if (drag && event.pointerId === drag.id) setTreeWidth(drag.width + event.clientX - drag.x); });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    resizer.classList.remove("resizing");
    document.documentElement.classList.remove("doc-page-tree-resizing");
  };
  resizer.addEventListener("pointerup", endDrag);
  resizer.addEventListener("pointercancel", endDrag);
  resizer.addEventListener("dblclick", () => setTreeWidth(240));
  resizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setTreeWidth(treeWidth + (event.key === "ArrowLeft" ? -16 : 16));
  });
  addEventListener("resize", applyTreeWidth);
  tree.addEventListener("mouseover", (event) => {
    const item = event.target.closest && event.target.closest(".doc-page-tree-item");
    if (!item) return;
    if (!item.dataset.note) item.dataset.note = item.getAttribute("title") || " ";
    const note = item.dataset.note.trim();
    const name = item.textContent;
    item.title = item.scrollWidth > item.clientWidth + 1 ? (note ? name + "\\n" + note : name) : note;
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = decodeHash(link.getAttribute("href").slice(1));
    if (byId.has(id)) { event.preventDefault(); go(id); return; }
    const owner = id && document.getElementById(id)?.closest("section.doc-page");
    if (owner && owner.id !== current) go(owner.id);
  });
  document.addEventListener("pointerdown", (event) => {
    if (tree.classList.contains("is-overlay-open") && !tree.contains(event.target) && !toggle.contains(event.target)) closeOverlay();
  }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeOverlay(); });
  const start = decodeHash(location.hash.slice(1));
  // #… がページでなく、ページの中の見出しなどを指すときは、そのページを開いてからそこへ送る(クリックと同じ。v213)。
  // ページの id しか見ておらず、2ページ目の見出しへのリンクで開くと1ページ目が出て、見出しは隠れたままだった。
  const target = start && !byId.has(start) ? document.getElementById(start) : null;
  const owner = target && target.closest("section.doc-page");
  document.documentElement.classList.add("doc-pages-ready");
  show(byId.has(start) ? start : owner ? owner.id : pages[0].id, false);
  if (owner) target.scrollIntoView();
})();`;
  }

  // 目次ブロックが並べるのは**そのページの見出し**(ページ目次とは別物)。
  // 書き出しはページ単位で行い、走査する範囲を options.tocScope で渡す。
  // ここで全ページを見てしまうと、他のページの見出しが混ざる。
  function renderTocBlock(doc, options = {}) {
    const scope = options.tocScope || allPageBlocks(doc);
    const headings = scope.filter((block) => /^heading[1-5]$/.test(block.type) || /^toggleHeading[1-5]$/.test(block.type));
    const title = '<div class="toc-title">Table of contents</div>';
    if (!headings.length) return '<nav class="toc">' + title + '<p>No headings</p></nav>';
    return '<nav class="toc">' + title + headings.map((block) => {
      const level = Number(String(block.type).match(/(\d)$/)?.[1] || 1);
      // a は flex なので、中身を span に包まないと文字と `コード`・$$数式$$ の間の空白が消える(v213。エディタの目次も同じ形)。
      // 見出しの番号(v218。見出しに番号が入のときの見出し1〜3だけ)は文字の前に別の span で(見出しの文字には入れない)。
      const number = activeHeadingNumbers?.get(block.id);
      return '<a class="toc-level-' + level + '" href="#' + blockAnchor(block) + '">' + (number ? '<span class="toc-number">' + escapeHtml(number) + "</span>" : "")
        + "<span>" + renderInlineMarkdown(block.text || "Untitled heading") + "</span></a>";
    }).join("") + "</nav>";
  }

  // 段組みの組(同じ columnGroup が続く範囲)の終わりと深さ(組の中で一番浅い字下げ)。
  // トグルの中の段組み(v256。Issue #133): 組はまるごと1つのブロックとして、この深さにあるものと見なす。自分より浅い
  // ブロックの子になり、閉じたトグルの中なら隠れ(エディタ)、保存HTML・印刷ではそのトグルの中に書き出す。
  // エディタの隠す判定・部分木・目次から開く処理と、保存HTMLが、この1つを使う(P25)。
  function columnRun(blocks, start) {
    const groupId = blocks[start]?.columnGroup;
    let end = start;
    let indent = Infinity;
    while (groupId && end < blocks.length && blocks[end].columnGroup === groupId) {
      indent = Math.min(indent, blocks[end].indent || 0);
      end++;
    }
    return { end, indent: Number.isFinite(indent) ? indent : 0 };
  }

  // ブロックの並びを書き出す。トグルの子(後ろに続く字下げの深いブロック)は <details> の中へ入れる。
  // 段組みの組は、トグルの中にあればそのトグルの中身としてその場に書き出し(v256。Issue #133)、トグルの外なら字下げの
  // 入れ物から抜けて一番上の段に書き出す(以前と同じ出力)。段組みの列の中身(columns: false)に組は無い。
  function renderPortableBlockSequence(blocks, doc, numberedMarkers, options = {}, startLevel = 0, columns = true) {
    let index = 0;
    function renderLevel(level, inToggle) {
      let html = "";
      while (index < blocks.length) {
        const block = blocks[index];
        if (columns && block.columnGroup) {
          const run = columnRun(blocks, index);
          // トグルの中でも、組がこの段より浅ければ、外のトグル(か一番上の段)のもの。
          if (inToggle ? run.indent < level : level > startLevel) break;
          html += renderColumnGroup(blocks.slice(index, run.end), level);
          index = run.end;
          continue;
        }
        const indent = block.indent || 0;
        if (indent < level) break;
        if (indent > level) {
          html += '<div class="indent">' + renderLevel(indent, inToggle) + "</div>";
          continue;
        }
        index++;
        let blockHtml;
        if (block.type === "toggle" || String(block.type).startsWith("toggleHeading")) {
          const childHtml = renderLevel(level + 1, true);
          blockHtml = renderPortableBlock(block, doc, childHtml, numberedMarkers, options);
        } else {
          blockHtml = renderPortableBlock(block, doc, "", numberedMarkers, options);
        }
        // ブロックへのリンクの行き先(Issue #176)は、錨(id="block-…")を持つ入れ物で包む。見出し・題名つきの表と図は
        // 自分の錨(見出し・題名の段落)があるので包まない。リンクの無い文書の出力は変わらない。
        if (options.blockLinkTargets?.has(block.id) && !activeRefTargets?.has(block.id)) {
          blockHtml = '<div class="block-target" id="' + blockAnchor(block) + '">' + blockHtml + "</div>";
        }
        html += blockHtml + "\n";
      }
      return html;
    }
    // 列の中身は、組を置いた段(level)から数えた字下げで書く(一番上の段なら以前と同じ 0 から)。
    function renderColumnGroup(grouped, level) {
      const columnIds = [...new Set(grouped.map((block) => block.columnIndex || 0))].sort((a, b) => a - b);
      if (columnIds.length < 2) return renderPortableBlockSequence(grouped, doc, numberedMarkers, options, level, false);
      const widths = columnIds.map((columnIndex) => {
        const block = grouped.find((item) => (item.columnIndex || 0) === columnIndex);
        const width = Number(block?.columnWidth);
        return Number.isFinite(width) && width > 0 ? width : 1;
      });
      const template = widths.map((width) => "minmax(0," + width + "fr)").join(" ");
      let html = '<section class="doc-columns" style="grid-template-columns:' + template + '">';
      columnIds.forEach((columnIndex) => {
        const columnBlocks = grouped.filter((block) => (block.columnIndex || 0) === columnIndex);
        html += '<div class="doc-column">' + renderPortableBlockSequence(columnBlocks, doc, numberedMarkers, options, level, false) + "</div>";
      });
      return html + "</section>\n";
    }
    return renderLevel(startLevel, false);
  }

  function renderPortableBlocks(blocks, doc, options = {}) {
    // 本文の参照(figure-ref)の行き先と見出しの番号は、この書き出しの間だけ使う(v198・v218)。
    const previous = [activeRefTargets, activeHeadingNumbers];
    activeHeadingNumbers = options.headingNumbers || headingNumbers(doc);
    activeRefTargets = options.refTargets || referenceTargets(doc, options.figureNumbers, activeHeadingNumbers);
    try {
      return renderPortableBlocksInner(blocks, doc, options);
    } finally {
      [activeRefTargets, activeHeadingNumbers] = previous;
    }
  }

  function renderPortableBlocksInner(blocks, doc, options = {}) {
    return renderPortableBlockSequence(blocks, doc, numberedListMarkers(blocks), options);
  }

  // セル色として style 属性へ入れる値。開いた文書の manifest 由来でも入るため、
  // 色として妥当な形だけに絞る（url() などの持ち込みを防ぐ）。
  function safeCssColor(value) {
    return typeof value === "string"
      && /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/.test(value.trim());
  }

  // 行の高さ(v238)。行の数にそろえた px の並び(0 は中身に合わせる)。数でない値は 0、20px 未満は 0、2000px で頭打ち。
  // 高さを決めた行が1つも無ければ null(書かない)。style に書く値なので、必ずここを通す。
  const TABLE_MIN_ROW_HEIGHT = 20;
  function normalizeTableRowHeights(value, rowCount) {
    if (!Array.isArray(value)) return null;
    const heights = Array.from({ length: rowCount }, (_, r) => {
      const height = Math.round(Number(value[r]));
      return Number.isFinite(height) && height >= TABLE_MIN_ROW_HEIGHT ? Math.min(height, 2000) : 0;
    });
    return heights.some(Boolean) ? heights : null;
  }

  // 表を見せる高さ(v235)。80px 未満・数でない値は「決めていない」(全部見せる)。style に書く値なので、必ず数に直してから使う。
  function portableTableViewHeight(block) {
    const height = Number(block?.viewHeight);
    return Number.isFinite(height) && height >= 80 && height <= 100000 ? Math.round(height) : 0;
  }

  function renderPortableTable(block, options = {}) {
    const rows = block.rows || [];
    const database = Boolean(block.database);
    // セルの中身。エディタは数式の計算器（tableCellResult）を渡してくるので、
    // 式のセルは読者に見える計算結果として焼き込まれる。保存したHTMLには
    // 再計算の仕組みが無いため、生の式を書くと読者には式が見えてしまう。
    // 数の見せ方(v232。桁区切り・百分率・小数の桁)もここで付ける(エディタと同じ formatTableNumber)。
    const cellText = (cell, rowIndex, cellIndex) => {
      const value = options.tableCellDisplay
        ? String(options.tableCellDisplay(block, rowIndex, cellIndex) ?? "")
        : String((cell && typeof cell === "object" ? cell.text : cell) ?? "");
      return cell && typeof cell === "object" && cell.numberFormat ? formatTableNumber(value, cell.numberFormat) : value;
    };
    // セルは { text, colSpan, rowSpan } もしくは古い形式の文字列。結合で覆われた
    // 位置は covered なので書き出さない（覆っているセルが場所を占める）。
    const filtered = normalizeTableFilter(block.tableFilter, (rows[0] || []).length).length > 0;
    const shownValue = (rowIndex, cellIndex) => {
      const cell = rows[rowIndex]?.[cellIndex];
      return options.tableCellDisplay ? options.tableCellDisplay(block, rowIndex, cellIndex) : (cell && typeof cell === "object" ? cell.text : cell);
    };
    const rowFilteredOut = filtered ? tableRowFilter(block, shownValue) : () => false;
    const hiddenRows = rows.map((row, rowIndex) => rowFilteredOut(rowIndex));
    // 行の高さ(v238。エディタと同じ最低の高さ)。
    const rowHeights = normalizeTableRowHeights(block.tableRowHeights, rows.length) || [];
    const rowHtml = rows.map((row, rowIndex) => {
      const cells = row.map((cell, cellIndex) => {
        // ヘッダー列(最左列)のセルは印を付けて、エディタと同じ意匠(背景トーン+
        // 太字)で焼き込む。結合で列0が覆われる並びでも崩れないよう、tr:first-child
        // 方式ではなくセル自身にクラスを付ける。
        const headerColumn = Boolean(block.tableHeaderColumn) && cellIndex === 0;
        if (cell && typeof cell === "object") {
          if (cell.covered) return "";
          const span = (cell.colSpan > 1 ? ' colspan="' + cell.colSpan + '"' : "")
            + (cell.rowSpan > 1 ? ' rowspan="' + cell.rowSpan + '"' : "");
          // 計算値のセルには印を付け、ホバーで元の式が見えるようにする。
          // エディタ側と同じツールチップ(#MERGE なら「式 — 説明」)を焼き込めるよう、
          // 呼び出し元(app.js)が options.tableCellTitle で文言を差し込める(P7)。
          // 式かどうかは呼び出し元(app.js)の isTableFormula で決める(v213。全角の「＝」で始まる式は、式として読めるときだけ式)。
          const formula = typeof cell.text === "string"
            && (options.isTableFormula ? options.isTableFormula(cell.text) : cell.text.trim().startsWith("="));
          const cellTitle = formula && options.tableCellTitle
            ? String(options.tableCellTitle(block, rowIndex, cellIndex, cell.text) ?? cell.text)
            : cell.text;
          const classes = [];
          if (formula) classes.push("doc-formula");
          if (headerColumn) classes.push("doc-th-col");
          let marks = (classes.length ? ' class="' + classes.join(" ") + '"' : "")
            + (formula ? ' title="' + escapeHtml(cellTitle) + '"' : "");
          // セルの色。色として妥当な形だけを style へ通す。
          const styleParts = [];
          if (safeCssColor(cell.color)) styleParts.push("color:" + cell.color.trim());
          if (safeCssColor(cell.background)) styleParts.push("background-color:" + cell.background.trim());
          // 文字の配置(v232)。決まった3つの値だけを通す。
          if (tableCellAlign(cell)) styleParts.push("text-align:" + tableCellAlign(cell));
          if (styleParts.length) marks += ' style="' + escapeHtml(styleParts.join(";")) + '"';
          // データベースの本文のセル(1行目は列の名前)は、列の種類で描く(v229)。
          if (database && rowIndex > 0) {
            const type = dbColumnType(block, cellIndex);
            const dbClass = type === "number" ? ' class="db-col-number"' : type === "check" ? ' class="db-col-check"' : "";
            return "<td" + span + (classes.length ? "" : dbClass) + marks + ">" + dbCellHtml(type, cellText(cell, rowIndex, cellIndex), cell) + "</td>";
          }
          // ふつうの表のセルも、リンクはデータベースと同じ形で描く(v269)。
          return "<td" + span + marks + ">" + dbCellHtml(null, cellText(cell, rowIndex, cellIndex), cell) + "</td>";
        }
        return "<td" + (headerColumn ? ' class="doc-th-col"' : "") + ">" + escapeHtml(cellText(cell, rowIndex, cellIndex)) + "</td>";
      }).join("");
      return "<tr" + (hiddenRows[rowIndex] ? " hidden" : "") + (rowHeights[rowIndex] ? ' style="height:' + rowHeights[rowIndex] + 'px"' : "") + ">" + cells + "</tr>";
    });
    // グループ分け(0.8.21。Issue #179)。組ごとに <tbody> を分け、頭の行に名前と行の数。畳む・開くは頭の行のチェック(CSS の :has だけで動く。
    // スクリプトは使わない)。保存したときに畳んでいた組は畳んだまま。絞り込みで隠した行は最後の <tbody> に隠したまま置く。
    const groupPlan = tableGroupPlan(block, shownValue, (rowIndex) => hiddenRows[rowIndex]);
    // ヘッダー行は <thead> に入れる。印刷で表がページをまたぐと、次のページの先頭にも見出しの行が出る(v182)。
    let body;
    if (groupPlan) {
      const first = tableDataFirstRow(block);
      const width = (rows[0] || []).length;
      const head = rowHtml.slice(0, first).join("");
      const groupsHtml = groupPlan.groups.map((group) => '<tbody class="doc-group">'
        + '<tr class="doc-group-head"><td colspan="' + width + '"><label class="doc-group-toggle"><input type="checkbox" aria-label="畳む"' + (group.collapsed ? " checked" : "") + '>'
        + '<span class="doc-group-arrow" aria-hidden="true"></span><span class="doc-group-name">' + tableGroupLabelHtml(groupPlan.type, group.key) + '</span><span class="doc-group-count">' + group.rows.length + "</span></label></td></tr>"
        + group.rows.map((rowIndex) => rowHtml[rowIndex]).join("") + "</tbody>").join("");
      const hiddenHtml = rowHtml.filter((html, rowIndex) => rowIndex >= first && hiddenRows[rowIndex]).join("");
      body = (block.tableHeader && head ? "<thead>" + head + "</thead>" : head ? "<tbody>" + head + "</tbody>" : "") + groupsHtml + (hiddenHtml ? "<tbody>" + hiddenHtml + "</tbody>" : "");
    } else {
      body = block.tableHeader && rowHtml.length > 1
        ? "<thead>" + rowHtml[0] + "</thead><tbody>" + rowHtml.slice(1).join("") + "</tbody>"
        : rowHtml.join("");
    }
    // 列幅(px)を持つ表は colgroup ごと焼き込み、エディタと同じ見え方にする(P7)。
    // 値はモデル由来でも数値に強制してから style へ通す。
    let colgroup = "";
    let sized = "";
    let sizedStyle = "";
    if (Array.isArray(block.tableColumnWidths) && block.tableColumnWidths.length === (rows[0] || []).length) {
      const pixels = block.tableColumnWidths.map((width) => Math.max(48, Number(width) || 48));
      // 印刷では列の幅を割合で決め直して紙の幅に収める(v231)。そのための割合を --doc-col-pct に書いておく。
      const total = pixels.reduce((sum, width) => sum + width, 0);
      colgroup = "<colgroup>" + pixels.map((width) => '<col style="width:' + width + "px;--doc-col-pct:" + (Math.round(width / total * 100000) / 1000) + '%">').join("") + "</colgroup>";
      sized = " doc-table-sized";
      // 幅は合計の明示 px(width:auto は親幅で頭打ちになり、列が圧縮される)。
      sizedStyle = ' style="width:' + pixels.reduce((total, width) => total + width, 0) + 'px"';
    }
    const tableHtml = '<table class="doc-table' + (block.tableHeader ? " doc-table-header" : "") + (database ? " doc-db" : "") + (groupPlan ? " doc-grouped" : "") + sized + '"' + sizedStyle + ">" + colgroup + body + "</table>";
    // 列幅のある表は、本文の欄より広くなることがあるので、横にスクロールする箱で包む(v231。列幅の無い表は欄の幅に収まるので包まない)。
    // 表を見せる高さを決めた表(v235)も同じ箱で包み、高さで止めて縦にもスクロールする(エディタと同じ。印刷では全行)。
    const viewHeight = portableTableViewHeight(block);
    const wrapped = sized || viewHeight
      ? '<div class="doc-table-scroll' + (viewHeight ? ' doc-table-view" style="max-height:' + viewHeight + 'px"' : '"') + ">" + tableHtml + "</div>"
      : tableHtml;
    // 絞り込み中の表は、表の下に一言(v232。エディタと同じ文言。隠した行があると分かるように)。
    if (!filtered) return wrapped;
    const total = rows.length - tableDataFirstRow(block);
    const shown = hiddenRows.slice(tableDataFirstRow(block)).filter((hidden) => !hidden).length;
    return wrapped + '<p class="doc-table-filter-note">' + escapeHtml(tableFilterNote(total, shown)) + "</p>";
  }

  // グラフの SVG を、アプリ自身の renderChartSvg が出力する語彙だけに絞って
  // 組み立て直す。chartSvg は開いた文書の manifest 経由で任意の文字列が入り得る
  // （閉じたトグルの中のグラフは描き直されないまま保存へ流れる）ため、
  // ここで無害化しないと保存型 XSS の経路になる。
  const CHART_SVG_TAGS = new Set(["svg", "line", "rect", "circle", "polyline", "text", "path"]);
  const CHART_SVG_ATTRIBUTES = new Set([
    "class", "viewBox", "role", "aria-label", "x", "y", "x1", "y1", "x2", "y2",
    "cx", "cy", "r", "width", "height", "fill", "stroke", "points", "text-anchor", "transform", "d",
    // 近似直線の破線(v177)。値は数と空白だけ(描画が作る形)。保存HTMLの CSS を変えずに線の見た目を持たせるため属性で書く。
    "stroke-width", "stroke-dasharray",
  ]);
  // 属性の値も検査するもの(v168)。path の d(円グラフの扇形)は、描画(renderChartSvg)が作る書き方だけを字句の単位で許す:
  // コマンド M・L・A・Z と、符号つきの固定小数(指数表記は無い。描画は小数2桁に丸める)を、空白・カンマで区切った並び。
  // 名前だけの検査では d の中身が素通りするため。合わない path は丸ごと落とす。
  const CHART_PATH_DATA = /^(?:[MLAZ]|-?\d+(?:\.\d+)?)(?:[ ,]+(?:[MLAZ]|-?\d+(?:\.\d+)?))*$/;
  function sanitizeChartSvg(svg) {
    const text = typeof svg === "string" ? svg : "";
    if (!text.trim()) return "";
    const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = parsed.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg") return "";
    // 許した要素と属性だけで文字列を作り直す。入力の断片は一切そのまま使わない。
    const serialize = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.nodeName.toLowerCase();
      if (!CHART_SVG_TAGS.has(tag)) return "";
      if (tag === "path" && !CHART_PATH_DATA.test(node.getAttribute("d") || "")) return "";
      // d は path にだけ許す(値の検査も path でだけ行うので、ほかの要素の d は素通りさせない。v169。TL)。
      // url(…) を含む値は捨てる(v227)。描画が作る塗り・線は色だけで、url(…) を通すと保存HTMLを開いたときに外へ読みに行けた。
      const attributes = [...node.attributes]
        .filter((attr) => CHART_SVG_ATTRIBUTES.has(attr.name) && (attr.name !== "d" || tag === "path") && !/url\s*\(/i.test(attr.value))
        .map((attr) => " " + attr.name + '="' + escapeHtml(attr.value) + '"')
        .join("");
      const children = [...node.childNodes].map(serialize).join("");
      return "<" + tag + attributes + ">" + children + "</" + tag + ">";
    };
    return serialize(root);
  }

  // グラフは編集時に描いた SVG を載せる。書き出したHTMLでは値が変わらない
  // ため、描き直しの仕組みまで持たせる必要がない。載せる前に必ず無害化する。
  function renderPortableChart(block, options = {}) {
    const svg = sanitizeChartSvg(block.chartSvg);
    // コードはエディタと同じく既定で畳む(v161。段4。P7)。<details> なので、読む人は開いて見られる。
    const source = '<details class="doc-chart-source"><summary>コード</summary><pre>' + escapeHtml(block.text || "") + "</pre></details>";
    if (!svg) return '<div class="doc-chart">' + source + "</div>";
    // エディタと同じく、コードの帯がグラフの上(P7。v190)。
    return '<div class="doc-chart">' + source + '<div class="doc-chart-canvas" data-svg-for="' + escapeHtml(block.id || "") + '">' + svg + "</div>" + renderPortableCaption(block, "figure", options) + "</div>";
  }

  // ---- Mermaid の図(v194。形式 0.8.5) ----
  // mermaidSvg は、エディタが Mermaid で描いた SVG。保存HTMLにはこれをそのまま載せる(Mermaid を読まずに図が出る)。
  // 開いた文書の manifest から**任意の文字列が入り得る**ので、グラフ(sanitizeChartSvg)と同じく、許した要素と属性だけで
  // 組み立て直す(入力の断片は一切そのまま使わない)。Mermaid の出力は語彙が広いので、許す範囲はグラフより広い:
  //   - 要素: 下の MERMAID_SVG_TAGS だけ。a と switch は中身だけ残す(リンクにしない)。script・foreignObject・image などは中身ごと捨てる
  //     入れ子の <svg>(根の中の svg)は許す(v196。アーキテクチャ図のアイコンが入れ子の svg で描かれ、捨てると絵が消えるため)。
  //     入れ子の svg は g と同じく根の絵の中の入れ物で、属性も他の要素と同じ規則で絞る(根の id・大きさの扱いは根だけ)
  //   - 属性: on〜・xmlns〜・名前空間つき(xlink:href は href に読み替え)は捨てる。href と url(…) は、図の中の id(#…)を指す
  //     ものだけ。javascript: / data: を含む値は捨てる
  //   - id: 図の根の id は "pagelith-mermaid-" で始まるものだけ(エディタが描くたびに付ける形)。中の id はその根の id を
  //     含むものだけ(Mermaid の付け方。多くは根の id で始まるが、特性要因図・ワードリー・Cynefin の矢印や treemap の
  //     切り抜きは「ishikawa-arrow-根の id」のように前に付ける。v196 で「始まる」から「含む」へ広げた)。根の id は
  //     "pagelith-mermaid-" で始まるので、それを含む id はアプリの要素の id(blocks など)と重ならない。重なる id を、文書から入れさせないため
  //   - <style>: CSS として読み(CSSStyleSheet)、規則ごとに作り直す。残すのは「#根の id の中の要素」を選ぶ規則
  //     (#根 の直後が空白か >)と、根そのもの(#根)の文字の指定(書体・大きさ・色)と、@keyframes だけ。@import・@font-face・
  //     外を指す url(…)・expression(…) を含む規則は捨てる。<svg> の中の <style> はページ全体に効くので、図の外
  //     (エディタの画面・保存HTMLの本文)を変える規則を残さないため
  //   - 根の属性は大きさと役割だけ(class は捨て、style は max-width だけ)。アプリの CSS のクラスや固定配置で、図が画面を覆わないように
  // outerHTML 由来の文字は &nbsp; を含み得て、XML としては読めない(v177 のグラフで起きた)ので &#160; に置き換えてから読む。
  // 接頭辞は旧名(pagelith-)のまま(v222 でアプリ名を Monolio にしても変えない): 保存HTMLに入っていて、読み込むときにこれで確かめるため。
  const MERMAID_SVG_ID_PREFIX = "pagelith-mermaid-";
  const MERMAID_ROOT_ID = /^pagelith-mermaid-[A-Za-z0-9_-]+$/;
  const MERMAID_SVG_TAGS = new Map([
    "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "marker", "style",
    "title", "desc", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "use", "symbol",
    "filter", "feDropShadow", "feGaussianBlur", "feOffset", "feFlood", "feComposite", "feMerge", "feMergeNode", "feBlend", "feColorMatrix",
  ].map((name) => [name.toLowerCase(), name]));
  const MERMAID_UNWRAP_TAGS = new Set(["a", "switch"]);
  const MERMAID_ROOT_ATTRIBUTES = new Set(["width", "height", "viewBox", "role", "aria-roledescription", "preserveAspectRatio"]);
  const MERMAID_ROOT_PROPERTIES = new Set(["font-family", "font-size", "font-weight", "font-style", "fill", "color"]);
  const MERMAID_ATTRIBUTE_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;

  // CSS の文字(規則1つ・宣言・style 属性)が安全か。文字の逃がし(\)は形を変えて検査をすり抜けるので、含めば捨てる。
  function mermaidCssIsSafe(text, rootId) {
    const value = String(text || "").toLowerCase();
    if (value.includes("\\") || value.includes("<")) return false;
    if (/@import|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|image-set\s*\(|(?:^|[^-\w])image\s*\(|src\s*\(/.test(value)) return false;
    return mermaidUrlsAreInternal(value, rootId);
  }

  // url(…) が図の中の id だけを指すか。根の id が無ければ url(…) は1つも許さない。
  function mermaidUrlsAreInternal(value, rootId) {
    const urls = [...String(value).matchAll(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi)];
    if ((String(value).match(/url\s*\(/gi) || []).length !== urls.length) return false;
    return urls.every((match) => mermaidRefIsInternal(match[2].trim(), rootId));
  }

  function mermaidRefIsInternal(ref, rootId) {
    return Boolean(rootId) && /^#[A-Za-z][\w-]*$/.test(ref) && ref.slice(1).includes(rootId);
  }

  // セレクタの並び(a, b)を、括弧と引用符の中のカンマでは切らずに分ける。
  function splitCssSelectors(text) {
    const parts = [];
    let depth = 0;
    let quote = "";
    let current = "";
    for (const ch of String(text)) {
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "(" || ch === "[") {
        depth += 1;
      } else if (ch === ")" || ch === "]") {
        depth -= 1;
      } else if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    parts.push(current.trim());
    return parts;
  }

  function sanitizeMermaidCss(css, rootId) {
    if (!rootId || typeof CSSStyleSheet !== "function") return "";
    const sheet = new CSSStyleSheet();
    try {
      sheet.replaceSync(String(css || ""));
    } catch {
      return "";
    }
    const root = "#" + rootId;
    const out = [];
    for (const rule of sheet.cssRules) {
      if (typeof CSSKeyframesRule === "function" && rule instanceof CSSKeyframesRule) {
        if (/^[A-Za-z][\w-]*$/.test(rule.name) && mermaidCssIsSafe(rule.cssText, rootId)) out.push(rule.cssText);
        continue;
      }
      // @import・@font-face・@media などは捨てる。入れ子の規則(CSS nesting)を持つものも捨てる(& で外を選べるため)。
      if (!(rule instanceof CSSStyleRule) || rule.cssRules?.length) continue;
      const selectors = splitCssSelectors(rule.selectorText);
      if (selectors.length === 1 && selectors[0] === root) {
        // 根そのものへの規則は、文字の指定だけを宣言から作り直す(配置・大きさ・はみ出しは変えさせない)。
        const declarations = [];
        for (let index = 0; index < rule.style.length; index += 1) {
          const name = rule.style[index];
          if (!MERMAID_ROOT_PROPERTIES.has(name)) continue;
          const value = rule.style.getPropertyValue(name);
          if (!mermaidCssIsSafe(value, rootId)) continue;
          declarations.push(name + ": " + value + (rule.style.getPropertyPriority(name) ? " !important" : "") + ";");
        }
        if (declarations.length) out.push(root + " { " + declarations.join(" ") + " }");
        continue;
      }
      // 「#根 の中」= #根 のすぐ後が子孫(空白)か子(>)の結合子。兄弟(~ +)は図の外を選ぶので捨てる。
      const inside = selectors.every((selector) => selector.startsWith(root) && /^(?:\s*>\s*|\s+)(?![~+>])\S/.test(selector.slice(root.length)));
      if (inside && mermaidCssIsSafe(rule.cssText, rootId)) out.push(rule.cssText);
    }
    return out.join("\n");
  }

  function sanitizeMermaidSvg(svg) {
    const text = typeof svg === "string" ? svg.replaceAll("&nbsp;", "&#160;") : "";
    if (!text.trim()) return "";
    const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
    const root = parsed.documentElement;
    if (!root || root.localName !== "svg" || parsed.querySelector("parsererror")) return "";
    const rootId = MERMAID_ROOT_ID.test(root.getAttribute("id") || "") ? root.getAttribute("id") : "";
    const attributesOf = (node, isRoot) => {
      const seen = new Set();
      const out = [];
      const add = (name, value) => {
        if (seen.has(name)) return;
        seen.add(name);
        out.push(" " + name + '="' + escapeHtml(value) + '"');
      };
      if (isRoot && rootId) add("id", rootId);
      for (const attr of [...node.attributes]) {
        let name = attr.name;
        const value = attr.value;
        if (name === "xlink:href") name = "href";
        if (!MERMAID_ATTRIBUTE_NAME.test(name) || /^on/i.test(name) || name === "id" && isRoot) continue;
        if (isRoot) {
          if (name === "style") {
            // ユースケース図などは max-width の後に CSS 変数を並べる。max-width の数だけを拾って作り直す(v196)。
            const maxWidth = /(?:^|;)\s*max-width:\s*(\d+(?:\.\d+)?)px\s*(?:;|$)/.exec(value);
            if (maxWidth) add("style", "max-width: " + maxWidth[1] + "px;");
            continue;
          }
          if (!MERMAID_ROOT_ATTRIBUTES.has(name)) continue;
          if ((name === "width" || name === "height") && !/^\d+(?:\.\d+)?(?:px|%)?$/.test(value.trim())) continue;
          if (name === "viewBox" && !/^[-\d.eE\s,]+$/.test(value)) continue;
        }
        const compact = value.replace(/[\s\u0000-\u001f]+/g, "").toLowerCase();
        if (compact.includes("javascript:") || compact.includes("vbscript:") || compact.includes("data:")) continue;
        if (name === "id") {
          if (!rootId || !value.includes(rootId) || !/^[A-Za-z][\w-]*$/.test(value)) continue;
        } else if (name === "href") {
          if (!mermaidRefIsInternal(value.trim(), rootId)) continue;
        } else if (name === "style") {
          if (!mermaidCssIsSafe(value, rootId)) continue;
        } else if (/url\s*\(/i.test(value) && !mermaidUrlsAreInternal(value, rootId)) {
          continue;
        }
        add(name, value);
      }
      return out.join("");
    };
    const serialize = (node) => {
      if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return escapeHtml(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const lower = node.localName.toLowerCase();
      if (MERMAID_UNWRAP_TAGS.has(lower)) return [...node.childNodes].map(serialize).join("");
      const tag = MERMAID_SVG_TAGS.get(lower);
      if (!tag) return "";
      if (tag === "style") {
        const css = sanitizeMermaidCss(node.textContent, rootId);
        return css ? "<style>" + escapeHtml(css) + "</style>" : "";
      }
      return "<" + tag + attributesOf(node, false) + ">" + [...node.childNodes].map(serialize).join("") + "</" + tag + ">";
    };
    return '<svg xmlns="http://www.w3.org/2000/svg"' + attributesOf(root, true) + ">" + [...root.childNodes].map(serialize).join("") + "</svg>";
  }

  // Mermaid の図は、グラフと同じ形で書き出す(コードは畳んだ <details>、絵はその下、題名は絵の下。P7)。
  // 絵が無い(描けていない)ときはコードだけ。
  function renderPortableMermaid(block, options = {}) {
    const svg = sanitizeMermaidSvg(block.mermaidSvg);
    const source = '<details class="doc-chart-source"><summary>コード</summary><pre>' + escapeHtml(block.text || "") + "</pre></details>";
    if (!svg) return '<div class="doc-chart doc-mermaid">' + source + "</div>";
    return '<div class="doc-chart doc-mermaid">' + source + '<div class="doc-chart-canvas doc-mermaid-canvas" data-svg-for="' + escapeHtml(block.id || "") + '">' + svg + "</div>"
      + renderPortableCaption(block, "figure", options) + "</div>";
  }

  // ---- 図表の題名と番号(v191。形式 0.8.3) ----
  // 題名(block.caption。ただの文字)のある表・グラフ・画像にだけ、文書全体の通し番号を振る。表は「表n」、グラフと
  // 画像は「図n」。順は保存HTML・印刷と同じページの並び(pagesOf)と、ページの中のブロックの並び。
  // 題名は表なら上、図なら下に置く(技術文書の慣習)。題名の無いものには番号も付けない(Word と同じ)。
  function captionText(block) {
    return typeof block?.caption === "string" ? block.caption.trim() : "";
  }

  function figureKind(block, doc) {
    if (block.type === "table") return "table";
    if (block.type === "chart" || block.type === "mermaid") return "figure";
    if (block.type === "attachment") {
      // その場に見せる画像・動画だけが図(ファイルとして見せる添付には番号を付けない。v273)。
      const attachment = (doc.attachments || []).find((item) => item.id === block.attachmentId);
      // 音声(0.8.20)は図にしない(見せる絵が無い)。
      const view = attachmentView(block, attachment);
      if (view !== "file" && view !== "audio") return "figure";
    }
    return null;
  }

  function figureNumbers(doc) {
    const numbers = new Map();
    const count = { table: 0, figure: 0 };
    pagesInReadingOrder(doc).forEach((page) => (page.blocks || []).forEach((block) => {
      const kind = figureKind(block, doc);
      if (!kind || !captionText(block)) return;
      count[kind] += 1;
      numbers.set(block.id, { kind, number: count[kind], label: (kind === "table" ? "表" : "図") + count[kind] });
    }));
    return numbers;
  }

  // 題名の段落。番号は呼び出し元が figureNumbers の結果を options.figureNumbers で渡す(無ければ題名だけ)。
  function renderPortableCaption(block, kind, options = {}) {
    const text = captionText(block);
    if (!text) return "";
    const entry = options.figureNumbers?.get(block.id);
    return '<p class="doc-caption doc-caption-' + kind + '" id="fig-' + escapeHtml(block.id) + '">'
      + (entry ? '<span class="doc-caption-label">' + escapeHtml(entry.label) + ":</span> " : "") + escapeHtml(text) + "</p>";
  }

  // ---- 文書の設定(settings)の形(0.8.8 から。0.8.21 で書体と小さい文字を足した) ----
  // 入(既定でない値)のものだけを持つ。1つも無ければ settings ごと持たない(既定の文書の doc・manifest は前の版と同じ形)。
  // 開いたファイルの値は信用しない: 知っている値だけを受ける(ほかは既定 = 項目なし)。書き出す・開く・エディタの切り替えのすべてがこれを通る。
  //   headingNumbers: true(見出しに番号。v218)
  //   fontStyle: "serif" | "mono"(文書の書体。Issue #190。Notion のページの「スタイル」と同じ3つ。無ければ既定 = 環境標準のゴシック)
  //   smallText: true(小さい文字。Issue #190。本文と見出しを 0.875 倍。題名の大きさは変えない)
  const DOCUMENT_FONT_STYLES = ["default", "serif", "mono"];
  // 書体の並び(フォントの一覧の「Serif」「Monospace」と同じ値。app.js の builtinFonts もこれを使う。1か所)。
  const DOCUMENT_FONT_STACKS = {
    serif: '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "MS PMincho", serif',
    mono: 'ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace',
  };
  function normalizeDocumentSettings(raw) {
    const out = {};
    if (raw && typeof raw === "object") {
      if (raw.headingNumbers === true) out.headingNumbers = true;
      if (raw.fontStyle === "serif" || raw.fontStyle === "mono") out.fontStyle = raw.fontStyle;
      if (raw.smallText === true) out.smallText = true;
    }
    return Object.keys(out).length ? out : null;
  }
  function documentFontStyle(doc) {
    const value = doc?.settings?.fontStyle;
    return value === "serif" || value === "mono" ? value : "default";
  }
  // 本文に効かせる書体の並び。既定は空(エディタは style.css・保存HTMLは body の指定がそのまま効く)。
  function documentFontStack(doc) {
    return DOCUMENT_FONT_STACKS[documentFontStyle(doc)] || "";
  }
  function smallTextOn(doc) {
    return doc?.settings?.smallText === true;
  }
  // ---- ページのアイコンとカバー画像(Issue #184。形式 0.8.21) ----
  // page.icon: 絵文字 1つ(呼び出しの絵文字と同じ形の検査 isCalloutIcon。開いたファイルの値もこれで見る)。題名の上・目次・ページのブロックに出す。
  // page.cover: { attachmentId, position }。attachmentId は文書の画像の添付(無い・画像でない添付なら開くときに外す)。position は縦の位置(0〜100 の %。
  // 画像のどこを帯に見せるか。object-position の縦。既定 50 = 真ん中)。題名の帯の上に、本文の欄の端から端までの帯で出す。
  const PAGE_COVER_HEIGHT = 200;
  function isImageAttachment(attachment) {
    return String(attachment?.mime || "").toLowerCase().startsWith("image/");
  }
  function pageIconOf(page) {
    return isCalloutIcon(page?.icon) ? page.icon : "";
  }
  function clampCoverPosition(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(Math.max(0, Math.min(100, number)) * 10) / 10 : 50;
  }
  // ページのカバー(attachments を渡すと、その中の画像の添付を指すときだけ返す)。無ければ null。
  function pageCoverOf(page, attachments = null) {
    const cover = page?.cover;
    if (!cover || typeof cover !== "object" || !isSafeId(cover.attachmentId)) return null;
    if (attachments && !attachments.some((attachment) => attachment?.id === cover.attachmentId && isImageAttachment(attachment))) return null;
    return { attachmentId: cover.attachmentId, position: clampCoverPosition(cover.position) };
  }
  // 開いたファイルのページのアイコン・カバーを決まった形に直す(その場で書き換える)。添付の id の付け直しと読めない添付の片付けの後に呼ぶ。
  function normalizePageAppearance(page, attachments) {
    if (!page || typeof page !== "object") return;
    if (page.icon !== undefined && !isCalloutIcon(page.icon)) delete page.icon;
    if (page.cover !== undefined) {
      const cover = pageCoverOf(page, attachments);
      if (cover) page.cover = cover;
      else delete page.cover;
    }
  }
  // ページのアイコン・カバーを manifest へ書く形(持っているものだけ)。
  function pageAppearanceFields(page) {
    const icon = pageIconOf(page);
    const cover = pageCoverOf(page);
    return { ...(icon ? { icon } : {}), ...(cover ? { cover } : {}) };
  }
  // 保存HTMLの題名の部分。アイコンもカバーも無いページは今までどおり <h1> だけ(出力は変わらない)。
  // あるときは、帯を <header class="doc-page-head"> に移し、アイコンを題名の上に置く。カバーは帯の上の .doc-cover(画像はランタイムが入れる)。
  function renderPortablePageHead(page, title, h1Class, attachments) {
    const icon = pageIconOf(page);
    const cover = pageCoverOf(page, attachments);
    const h1 = "<h1" + (h1Class ? ' class="' + h1Class + '"' : "") + ">" + title + "</h1>";
    if (!icon && !cover) return h1;
    const coverHtml = cover
      ? '<div class="doc-cover"><img data-attachment-image="' + escapeHtml(cover.attachmentId) + '" alt="" style="object-position:50% ' + cover.position + '%"></div>'
      : "";
    const headClass = "doc-page-head" + (h1Class ? " " + h1Class : "") + (cover ? " has-cover" : "");
    return coverHtml + '<header class="' + headClass + '">' + (icon ? '<div class="doc-page-icon" aria-hidden="true">' + escapeHtml(icon) + "</div>" : "")
      + "<h1>" + title + "</h1></header>";
  }

  // ---- 見出しに番号(v218。形式 0.8.8) ----
  // 文書ごとの設定(doc.settings.headingNumbers。既定は切。0.8.7 以前のファイルも切)。入なら見出し1〜3(トグル見出しも)に
  // 「1」「1.1」「1.1.1」。見出し4・5には付けない。数える順は図表の番号(figureNumbers)と同じ: 保存HTML・印刷と同じ
  // ページの並び(pagesInReadingOrder。ページ一覧の並び。v253)と、ページの中のブロックの並び(文書全体の通し。閉じたトグルの中の見出しも数える)。
  // 上の段が無いまま下の段が来たら、上の段は 0(見出し1の直下の見出し3は「1.0.1」、最初の見出し1より前の見出し2は「0.1」)。
  // Word の多段階リスト・LaTeX と同じ規則(段を飛ばしたことが番号で分かる。勝手に 1 を補わない)。
  // 番号は block.text に入れない(描くたび・書き出すたびに数える。見出しの文字・検索・Undo とは関係しない)。
  function headingNumbersOn(doc) {
    return doc?.settings?.headingNumbers === true;
  }

  // 番号を付ける見出しの段(1〜3)。それ以外は 0。
  function numberedHeadingLevel(type) {
    const match = /^(?:heading|toggleHeading)([1-3])$/.exec(String(type || ""));
    return match ? Number(match[1]) : 0;
  }

  function headingNumbers(doc) {
    const numbers = new Map();
    if (!headingNumbersOn(doc)) return numbers;
    const counters = [0, 0, 0];
    pagesInReadingOrder(doc).forEach((page) => (page.blocks || []).forEach((block) => {
      const level = numberedHeadingLevel(block?.type);
      if (!level) return;
      counters[level - 1] += 1;
      for (let index = level; index < counters.length; index += 1) counters[index] = 0;
      numbers.set(block.id, counters.slice(0, level).join("."));
    }));
    return numbers;
  }

  // 見出しの番号の印(保存HTML。見出しの文字の前の span。番号が無ければ空)。
  function headingNumberHtml(block) {
    const number = activeHeadingNumbers?.get(block.id);
    return number ? '<span class="heading-number">' + escapeHtml(number) + "</span>" : "";
  }

  function isHeadingType(type) {
    return /^(?:heading|toggleHeading)[1-5]$/.test(String(type || ""));
  }

  // 見出しへの参照に出す見出しの名前(1行の素の文字)。見出しの中の参照の印の文字は除く(印の文字は行き先の名前から作るので、
  // 入れると見出しが自分や互いを参照したときに名前が描くたびに伸びていく)。`コード` の印も外す。
  function headingRefTitle(block) {
    return refTitleText(block) || "無題の見出し";
  }

  // 参照の印に写すブロックの文字(1行の素の文字。見出しへの参照とブロックへのリンクの1つ。P25)。
  function refTitleText(block) {
    let text = String(block?.text || "");
    if (block?.html && block.html.includes("figure-ref")) {
      const template = document.createElement("template");
      template.innerHTML = block.html;
      template.content.querySelectorAll(".figure-ref").forEach((chip) => chip.remove());
      template.content.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
      text = template.content.textContent || "";
    }
    return text.replaceAll("​", "").replace(/`([^`\n]+)`/g, "$1").replace(/\s+/g, " ").trim();
  }

  // ---- ブロックへのリンク(Issue #176。形式 0.8.20) ----
  // つまみのメニューの「ブロックへのリンクをコピー」で作り、文中に貼ると参照の印(span.figure-ref data-ref-kind="block")になる。
  // 表・図・見出しの参照と同じ印・同じ行き先の一覧(referenceTargets)を使い、違うのは「どのブロックでも行き先にできる」ことだけ:
  // 行き先が見出し・題名つきの表と図なら、その参照と同じ文字(「1.2 目的」「表1」)、ほかのブロックはその文字を短く詰めたもの。
  // data-ref-kind の無い印(表・図・見出しの参照)は今までどおり、題名を外した表・見出しでなくなったブロックは「参照先なし」。
  const REF_KIND_BLOCK = "block";
  const BLOCK_LINK_LABEL_MAX = 30;

  function refKindOf(chip) {
    return chip?.getAttribute?.("data-ref-kind") === REF_KIND_BLOCK ? REF_KIND_BLOCK : "";
  }

  // ブロックへのリンクの印に写す文字。文字の無いブロックは種類の名前(添付はファイル名、ページのブロックはページの題名)。
  function blockLinkLabel(block, doc) {
    const type = String(block?.type || "");
    const clip = (text) => {
      const chars = [...text];
      return chars.length > BLOCK_LINK_LABEL_MAX ? chars.slice(0, BLOCK_LINK_LABEL_MAX).join("").trimEnd() + "…" : text;
    };
    const named = { table: "表", chart: "グラフ", mermaid: "図", math: "数式", divider: "区切り線", pagebreak: "改ページ", toc: "目次" };
    if (named[type]) return named[type];
    if (type === "attachment") {
      const attachment = (doc?.attachments || []).find((item) => item.id === block.attachmentId);
      return attachment ? clip(String(attachment.name || "添付")) : "添付";
    }
    if (type === "page") return clip(pageTitleOf(pagesOf(doc).find((page) => page.id === block.pageId)));
    if (type === "code") {
      const line = String(block.text || "").split("\n").find((item) => item.trim()) || "";
      return line.trim() ? clip(line.trim()) : "コード";
    }
    const text = refTitleText(block);
    return text ? clip(text) : "空のブロック";
  }

  // 参照の行き先の一覧(referenceTargets の結果)から、印1つの行き先を引く(印の描き方・保存HTML・番号の付け直しの1つ。P25)。
  // kind が "block"(ブロックへのリンク)なら、一覧に無いブロックも行き先にする(文書の全ブロックの索引は、要るときに1回だけ作る)。
  const referenceTargetDocs = new WeakMap();
  const referenceBlockIndexes = new WeakMap();
  function resolveReference(targets, id, kind = "") {
    if (!targets || !id) return null;
    const entry = targets.get(id);
    if (entry || kind !== REF_KIND_BLOCK) return entry || null;
    const doc = referenceTargetDocs.get(targets);
    if (!doc) return null;
    let index = referenceBlockIndexes.get(targets);
    if (!index) {
      index = new Map();
      pagesOf(doc).forEach((page) => (page.blocks || []).forEach((block) => {
        if (block && block.id && !index.has(block.id)) index.set(block.id, { block, page });
      }));
      referenceBlockIndexes.set(targets, index);
    }
    const found = index.get(id);
    if (!found) return null;
    if (!found.entry) {
      found.entry = { kind: REF_KIND_BLOCK, label: blockLinkLabel(found.block, doc), anchor: blockAnchor(found.block), pageId: found.page.id };
    }
    return found.entry;
  }

  // 文書の中でブロックへのリンクが指しているブロックの id(保存HTMLで、そのブロックに錨を付けるため)。
  function blockLinkTargetIds(doc) {
    const ids = new Set();
    let template = null;
    pagesOf(doc).forEach((page) => (page.blocks || []).forEach((block) => {
      // 表のセルのリンクで、この文書のブロックを指すもの(ファイルの列の「#block-…」。0.8.21)も行き先にする。
      if (block?.type === "table" && Array.isArray(block.rows)) {
        block.rows.forEach((row) => (Array.isArray(row) ? row : []).forEach((cell) => {
          const id = cell && typeof cell === "object" ? blockIdOfLinkHref(cell.link) : null;
          if (id) ids.add(id);
        }));
      }
      if (!block?.html || !block.html.includes("data-ref-kind")) return;
      template ||= document.createElement("template");
      template.innerHTML = block.html;
      template.content.querySelectorAll(".figure-ref").forEach((chip) => {
        if (refKindOf(chip) === REF_KIND_BLOCK && chip.getAttribute("data-ref")) ids.add(chip.getAttribute("data-ref"));
      });
    }));
    return ids;
  }

  // 本文の参照(figure-ref)の行き先の一覧(v218)。id → { kind, label, anchor }。
  // 図表(題名の付いた表・図): kind は table / figure、label は「表n」「図n」、anchor は題名の段落(fig-…)。
  // 見出し(見出し1〜5。トグル見出しも): kind は heading、label は「番号 名前」(番号が切・見出し4・5は名前だけ)、anchor は見出し(block-…)。
  // 印はどちらでも同じ形(<span class="figure-ref" data-ref="id">)で、行き先の種類は id から引く。
  function referenceTargets(doc, figures = figureNumbers(doc), headings = headingNumbers(doc)) {
    const targets = new Map();
    figures.forEach((entry, id) => targets.set(id, { ...entry, anchor: "fig-" + id }));
    pagesOf(doc).forEach((page) => (page.blocks || []).forEach((block) => {
      if (!block || !isHeadingType(block.type) || targets.has(block.id)) return;
      const number = headings.get(block.id) || "";
      const title = headingRefTitle(block);
      targets.set(block.id, {
        kind: "heading",
        level: Number(String(block.type).slice(-1)),
        number,
        title,
        label: number ? number + " " + title : title,
        anchor: blockAnchor(block),
      });
    }));
    // ページ(Issue #174。形式 0.8.18)。文中の「@ページ名」の印(figure-ref)はページの id を持ち、ページの題名を写す。
    // 押すとそのページへ移る(保存HTMLではページへのリンク)。ブロックと id が重なったときはブロックを優先する(今までの参照を変えない)。
    pagesOf(doc).forEach((page) => {
      if (!page || targets.has(page.id)) return;
      const title = pageTitleOf(page);
      targets.set(page.id, { kind: "page", title, label: title, anchor: pageAnchor(page) });
    });
    // ブロックへのリンク(Issue #176)の行き先は、引くときに文書から作る(resolveReference。全ブロックの文字をここで数えない)。
    referenceTargetDocs.set(targets, doc);
    return targets;
  }

  // 保存HTMLのランタイム(添付の画像・動画・PDF・フォント・Download)。
  // 中身の確かめ(デコードと SHA-256・記録との比べ)は、エディタと同じ関数のソースを埋め込む(base64ToBytes・joinChunks・sha256Hex・
  // sameDigest・verifyAttachment。Issue #219。以前は手で写した別の実装で、比べ方が違い、大文字の sha256 の記録の画像が保存HTMLでだけ
  // 「Hash mismatch」になった)。確かめてから見せる(確かめに通らない添付は出さない)のは以前と同じ。
  // 以前は読み込んだ直後に、全ページの全部の画像・動画・PDF をデコードしてハッシュを取り、同じ添付を N ブロックで使えば N 回やっていた
  // (動画の preload="metadata" も意味が無かった)。いまは:
  //   - 添付の id ごとに、見せる URL を1つだけ作って使い回す(デコード・ハッシュも1回)
  //   - 動画・PDF は、画面に近づいたとき(IntersectionObserver。上下に画面1つ分の余裕)に作る。見ていないページのものは作らない
  //   - 画像は、画面に近いものから作り、残りは手の空いたとき(requestIdleCallback)に1つずつ作る。紙に刷るときに画像が抜けないため
  //     (印刷の直前(beforeprint)からでは、確かめが間に合わない)。動画・PDF は紙に刷らない(PDF は名前の囲みを刷る)
  //   - フォントは本文の見た目に要るので、すぐに読む
  // 中身を読めない(base64 でない)・この環境でハッシュを取れない(crypto.subtle が無い)ときは「Cannot verify」と出して見せない(以前は例外で止まっていた)。
  // 音声(0.8.20)の部分は、音声のある文書にだけ足す(無い文書の出力は変わらない)。
  function portableRuntime({ audio = false } = {}) {
    return `(() => {
  const store = JSON.parse(document.querySelector("#document-attachments").textContent);
  const status = document.querySelector("#status");
  const objectUrls = [];
  function showStatus(text, kind = "") { status.textContent = text; status.className = "status " + kind; }
  const base64ToBytes = ${embeddedSource(base64ToBytes)};
  const bytesToBase64 = ${embeddedSource(bytesToBase64)};
  const joinChunks = ${embeddedSource(joinChunks)};
  const sha256Hex = ${embeddedSource(sha256Hex)};
  const sameDigest = ${embeddedSource(sameDigest)};
  const verifyAttachment = ${embeddedSource(verifyAttachment)};
  const imageDisplayUrl = ${embeddedSource(imageDisplayUrl)};
  const videoDisplayUrl = ${embeddedSource(videoDisplayUrl)};
  const pdfDisplayUrl = ${embeddedSource(pdfDisplayUrl)};
  const PDF_VIEW_HASH = ${JSON.stringify(PDF_VIEW_HASH)};
  const attachmentsById = new Map();
  (Array.isArray(store.attachments) ? store.attachments : []).forEach((attachment) => { if (attachment && typeof attachment === "object" && !attachmentsById.has(attachment.id)) attachmentsById.set(attachment.id, attachment); });
  async function verifiedBytes(attachment) { let result = null; try { result = await verifyAttachment(attachment); } catch (error) { showStatus("Cannot verify: " + attachment.name, "warn"); return null; } if (result.ok) return result.bytes; showStatus("Hash mismatch: " + attachment.name, "warn"); return null; }
  const shownUrls = new Map();
  function shownUrl(kind, attachment, make) { const key = kind + ":" + attachment.id; if (!shownUrls.has(key)) shownUrls.set(key, verifiedBytes(attachment).then((bytes) => { if (!bytes) return null; const shown = make(bytes); if (shown.revocable) objectUrls.push(shown.url); return shown.url; })); return shownUrls.get(key); }
  const waiting = new Map();
  const nearView = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) start(entry.target); }), { rootMargin: "100% 0px" }) : null;
  function start(element) { const hydrate = waiting.get(element); if (!hydrate) return Promise.resolve(); waiting.delete(element); if (nearView) nearView.unobserve(element); return Promise.resolve(hydrate(element)).catch(() => {}); }
  function whenNear(element, hydrate) { waiting.set(element, hydrate); if (nearView) nearView.observe(element); else start(element); }
  async function download(id) { const attachment = attachmentsById.get(id); if (!attachment) { showStatus("Missing attachment", "warn"); return; } const bytes = await verifiedBytes(attachment); if (!bytes) return; const blob = new Blob([bytes], { type: attachment.mime || "application/octet-stream" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = attachment.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); showStatus(attachment.name + " downloaded. SHA-256 verified.", "ok"); }
  async function hydrateImage(image) { const attachment = attachmentsById.get(image.dataset.attachmentImage); if (!attachment) return; const url = await shownUrl("image", attachment, (bytes) => imageDisplayUrl(bytes, attachment.mime)); if (url) image.src = url; }
  async function loadFont(font) { const attachment = attachmentsById.get(font.attachmentId); if (!attachment) return; const bytes = await verifiedBytes(attachment); if (!bytes) return; try { const face = new FontFace(font.family, bytes, { display: "block", ...(font.weight ? { weight: font.weight } : {}), ...(font.unicodeRange ? { unicodeRange: font.unicodeRange } : {}) }); await face.load(); document.fonts.add(face); } catch (error) { showStatus("Font failed: " + font.family, "warn"); } }
  (JSON.parse(document.querySelector("#document-manifest").textContent).fonts || []).forEach((font) => loadFont(font));
  function markUnplayable(video) { const figure = video.closest("figure"); if (!figure || figure.classList.contains("is-unplayable")) return; figure.classList.add("is-unplayable"); const note = document.createElement("div"); note.className = "video-unplayable"; note.textContent = video.dataset.unplayable || "この環境では再生できませんでした。"; video.replaceWith(note); }
  function openPdf(url, name, from) { const overlay = document.createElement("div"); overlay.className = "doc-pdf-view"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", name); overlay.innerHTML = '<div class="doc-pdf-title"></div><button type="button" class="doc-pdf-close" title="Close (Esc)" aria-label="Close">×</button>'; overlay.querySelector(".doc-pdf-title").textContent = name; const frame = document.createElement("iframe"); frame.title = name; frame.src = url + PDF_VIEW_HASH.open; overlay.append(frame); const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }; const close = () => { overlay.remove(); removeEventListener("keydown", onKey, true); document.documentElement.style.overflow = ""; from?.focus?.(); }; overlay.querySelector(".doc-pdf-close").addEventListener("click", close); overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); }); addEventListener("keydown", onKey, true); document.body.append(overlay); document.documentElement.style.overflow = "hidden"; overlay.querySelector(".doc-pdf-close").focus(); }
  async function hydratePdf(holder) { const attachment = attachmentsById.get(holder.dataset.attachmentPdf); if (!attachment) return; const url = await shownUrl("pdf", attachment, (bytes) => pdfDisplayUrl(bytes)); if (!url) return; const preview = holder.closest("figure")?.dataset.pdfView === "preview"; const frame = document.createElement("iframe"); frame.title = attachment.name; frame.src = url + (preview ? PDF_VIEW_HASH.pdf : PDF_VIEW_HASH["pdf-read"]); holder.append(frame); holder.classList.add("is-ready"); if (!preview) return; frame.tabIndex = -1; holder.tabIndex = 0; holder.setAttribute("role", "button"); holder.setAttribute("aria-label", "Open " + attachment.name); const hint = document.createElement("span"); hint.className = "pdf-open-hint"; hint.textContent = "押すと大きく開く"; holder.append(hint); holder.addEventListener("click", () => openPdf(url, attachment.name, holder)); holder.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPdf(url, attachment.name, holder); } }); }
  async function hydrateVideo(video) { const attachment = attachmentsById.get(video.dataset.attachmentVideo); if (!attachment) return; const url = await shownUrl("video", attachment, (bytes) => videoDisplayUrl(bytes, attachment.mime)); if (!url) return; video.addEventListener("error", () => markUnplayable(video), { once: true }); video.src = url; }
  document.querySelectorAll("[data-attachment-image]").forEach((image) => whenNear(image, hydrateImage));
  document.querySelectorAll("[data-attachment-video]").forEach((video) => whenNear(video, hydrateVideo));${audio ? portableAudioRuntimePart() : ""}
  document.querySelectorAll("[data-attachment-pdf]").forEach((holder) => { if (navigator.pdfViewerEnabled === false) markUnplayable(holder); else whenNear(holder, hydratePdf); });
  const whenIdle = typeof requestIdleCallback === "function" ? (run) => requestIdleCallback(run, { timeout: 1000 }) : (run) => setTimeout(run, 50);
  function fillImages() { const next = [...waiting.keys()].find((element) => element.matches("[data-attachment-image]")); if (next) whenIdle(() => start(next).then(fillImages)); }
  fillImages();
  addEventListener("beforeprint", () => [...waiting.keys()].filter((element) => element.matches("[data-attachment-image]")).forEach((image) => start(image)));
  document.querySelectorAll("[data-download]").forEach((button) => button.addEventListener("click", () => download(button.dataset.download)));
  addEventListener("unload", () => objectUrls.forEach((url) => URL.revokeObjectURL(url)));
})();`;
  }

  // 音声のプレーヤーに添付の中身を入れる(0.8.20)。再生できなければ、プレーヤーの代わりに一言を出す(動画と同じ文。ファイルのカードは残る)。
  function portableAudioRuntimePart() {
    return `
  const AUDIO_EXTENSIONS = ${JSON.stringify(AUDIO_EXTENSIONS)};
  const audioDisplayUrl = ${embeddedSource(audioDisplayUrl)};
  function markAudioUnplayable(audio) { const card = audio.closest(".audio-attachment"); if (!card || card.classList.contains("is-unplayable")) return; card.classList.add("is-unplayable"); const note = document.createElement("div"); note.className = "video-unplayable"; note.textContent = audio.dataset.unplayable || "この環境では再生できませんでした。"; audio.replaceWith(note); }
  async function hydrateAudio(audio) { const attachment = attachmentsById.get(audio.dataset.attachmentAudio); if (!attachment) return; const url = await shownUrl("audio", attachment, (bytes) => audioDisplayUrl(bytes, attachment.mime, attachment.name)); if (!url) return; audio.addEventListener("error", () => markAudioUnplayable(audio), { once: true }); audio.src = url; }
  document.querySelectorAll("[data-attachment-audio]").forEach((audio) => whenNear(audio, hydrateAudio));`;
  }

  function hasPathHeadings(pages) {
    return pages.some((page) => (page.blocks || []).some((block) => /^(toggleH|h)eading[1-3]$/.test(block.type)));
  }

  // 保存HTMLの拡大表示(2026-10-23。エディタの拡大表示と同じ操作。倍率と見る位置は attachZoomPan をそのまま埋め込む。P25)。
  // 画像・Mermaid の図・グラフをダブルクリック(または Enter)で、画面いっぱいに出す。ホイールで拡大・縮小、ドラッグで見る位置、
  // ダブルクリックで「収まる大きさ ⇔ 100%」、+ - 0 1 と矢印キー、Esc で閉じる。画像・図・グラフの無い文書には足さない(出力は変わらない)。


  function portableZoomRuntime() {
    return `(() => {
  const attachZoomPan = ${embeddedSource(attachZoomPan)};
  const svgNaturalSize = ${embeddedSource(svgNaturalSize)};
  const overlay = document.createElement("div");
  overlay.className = "doc-zoom";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = '<div class="doc-zoom-bar"><button type="button" data-zoom="out" title="Zoom out (-)" aria-label="Zoom out">−</button><span class="doc-zoom-level"></span>'
    + '<button type="button" data-zoom="in" title="Zoom in (+)" aria-label="Zoom in">+</button><button type="button" data-zoom="fit" title="Fit to screen (0)">Fit</button>'
    + '<button type="button" data-zoom="actual" title="Actual size (1)">100%</button><button type="button" data-zoom="close" title="Close (Esc)" aria-label="Close">×</button></div>';
  document.body.append(overlay);
  const button = (name) => overlay.querySelector('[data-zoom="' + name + '"]');
  let viewer = null;
  let content = null;
  let returnFocus = null;
  function close() {
    if (overlay.hidden) return;
    viewer?.destroy();
    viewer = null;
    content?.remove();
    content = null;
    overlay.hidden = true;
    document.documentElement.style.overflow = "";
    returnFocus?.focus?.();
  }
  function open(node, size, label, from) {
    close();
    content = node;
    returnFocus = from;
    overlay.setAttribute("aria-label", label);
    overlay.append(node);
    overlay.hidden = false;
    document.documentElement.style.overflow = "hidden";
    viewer = attachZoomPan(overlay, node, size, { zoomIn: button("in"), zoomOut: button("out"), fit: button("fit"), actual: button("actual"), label: overlay.querySelector(".doc-zoom-level") });
    button("close").focus();
  }
  function openFrom(target) {
    const image = target.closest?.("figure.image-attachment img");
    if (image) {
      if (!image.naturalWidth || !image.naturalHeight) return false;
      const copy = new Image();
      copy.src = image.src;
      copy.alt = image.alt;
      copy.draggable = false;
      open(copy, { width: image.naturalWidth, height: image.naturalHeight }, "Image preview", image);
      return true;
    }
    const svg = target.closest?.(".doc-chart-canvas")?.querySelector("svg");
    if (!svg) return false;
    const holder = document.createElement("div");
    holder.className = "doc-chart doc-zoom-svg";
    const copy = svg.cloneNode(true);
    copy.removeAttribute("width");
    copy.removeAttribute("height");
    copy.style.maxWidth = "none";
    copy.style.width = "100%";
    copy.style.height = "100%";
    holder.append(copy);
    open(holder, svgNaturalSize(svg), "Diagram preview", target.closest(".doc-chart-canvas"));
    return true;
  }
  document.querySelectorAll("figure.image-attachment img, .doc-chart-canvas").forEach((item) => {
    if (!item.hasAttribute("tabindex")) item.tabIndex = 0;
  });
  document.addEventListener("dblclick", (event) => {
    if (!overlay.hidden || !openFrom(event.target)) return;
    event.preventDefault();
  });
  button("close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !viewer?.wasDragged()) close();
  });
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) {
      if (event.key === "Enter" && openFrom(event.target)) event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      event.preventDefault();
      const buttons = [...overlay.querySelectorAll("button")];
      const at = buttons.indexOf(document.activeElement);
      buttons[(at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    } else viewer?.handleKey(event);
  });
  addEventListener("resize", () => viewer?.resize());
})();`;
  }

  function portableHeadingPathRuntime() {
    return `(() => {
  const main = document.querySelector("main");
  if (!main) return;
  const HEIGHT = 30;
  const LEVEL = { H2: 1, H3: 2, H4: 3 };
  const bar = document.createElement("nav");
  bar.className = "doc-heading-path";
  bar.hidden = true;
  bar.setAttribute("aria-label", "いま読んでいる所の見出し");
  document.body.append(bar);
  let key = "";
  let frame = 0;
  const topOf = () => { const pageBar = document.querySelector("#doc-page-bar"); return pageBar && pageBar.getClientRects().length ? Math.max(0, pageBar.getBoundingClientRect().bottom) : 0; };
  function update() {
    frame = 0;
    const top = topOf();
    const limit = top + HEIGHT;
    let path = [];
    main.querySelectorAll('h2[id^="block-"], h3[id^="block-"], h4[id^="block-"]').forEach((heading) => {
      if (!heading.getClientRects().length || heading.getBoundingClientRect().bottom > limit) return;
      const level = LEVEL[heading.tagName];
      path = path.filter((item) => item.level < level);
      path.push({ level, heading });
    });
    if (!path.length) { bar.hidden = true; key = ""; return; }
    const column = (document.querySelector(".doc-view") || document.body).getBoundingClientRect();
    const textLeft = main.getBoundingClientRect().left + parseFloat(getComputedStyle(main).paddingLeft || "0");
    bar.style.top = top + "px";
    bar.style.left = column.left + "px";
    bar.style.width = column.width + "px";
    bar.style.paddingLeft = Math.max(16, Math.round(textLeft - column.left)) + "px";
    bar.hidden = false;
    // 見出しの番号(v217。span.heading-number)は名前の前に空白を挟んで載せる(textContent のままだと「1.1目的」とつながる)。
    const names = path.map((item) => {
      const number = item.heading.querySelector(".heading-number");
      const text = (number ? item.heading.textContent.slice(number.textContent.length) : item.heading.textContent).trim() || "無題の見出し";
      return number ? number.textContent + " " + text : text;
    });
    const next = path.map((item) => item.heading.id).join("/") + "|" + JSON.stringify(names);
    if (next === key) return;
    key = next;
    const parts = [];
    path.forEach((item, index) => {
      if (index) { const sep = document.createElement("span"); sep.setAttribute("aria-hidden", "true"); sep.textContent = "›"; parts.push(sep); }
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = names[index];
      button.title = names[index];
      button.addEventListener("click", () => { scrollTo(0, Math.max(0, scrollY + item.heading.getBoundingClientRect().top - (topOf() + HEIGHT + 8))); schedule(); });
      parts.push(button);
    });
    bar.replaceChildren(...parts);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  // ページの切り替え(押す操作)・トグルの開閉でも見える見出しが変わる。
  document.addEventListener("click", () => setTimeout(schedule, 0));
  document.addEventListener("toggle", schedule, true);
  schedule();
})();`;
  }

  // 文書からページの配列を得る。**旧形式(blocks[])も受ける**のは2つの理由から:
  //  (1) 0.7.0 以前に保存したファイルを開けるようにするため(互換は必須)
  //  (2) 呼び出し側が { title, blocks } の素の文書を直接渡すことがあるため
  // 正規化はここ1か所だけ。2か所で書くと、片方だけ新形式に対応して静かにずれる。
  function pagesOf(doc) {
    if (Array.isArray(doc.pages) && doc.pages.length) return doc.pages;
    return [{
      id: newId(),
      title: doc.title || "Untitled",
      blocks: doc.blocks || [],
    }];
  }

  // 読む順(ページ一覧の並び)のページ。見出しの番号・図表の番号・保存HTMLと印刷のページの並びはこの順(v253。Issue #105。
  // ユーザー決定「推奨で」。以前は作った順(pagesOf)で、子ページを後から足すと番号が飛び、印刷の順もページ一覧と違った)。
  // 保存する manifest の pages の並びは変えない(作った順のまま。開いたときの先頭ページ・互換のため)。
  function pagesInReadingOrder(doc) {
    const pages = pagesOf(doc);
    if (pages.length < 2) return pages;
    const byId = new Map(pages.map((page) => [page.id, page]));
    const ordered = pagesInTreeOrder(pages).map((id) => byId.get(id)).filter(Boolean);
    // 目次に出ないページ(あれば)は、作った順で後ろに付ける(取りこぼさない)。
    const seen = new Set(ordered);
    return [...ordered, ...pages.filter((page) => !seen.has(page))];
  }

  // 文書の名前 = 先頭ページの題名。**文書の題名という別の値は持たない**(各ページが自分の題名を
  // 独立して持つ。ユーザー指示)。保存ファイルの <title>・先頭の <h1>・マニフェストの title はここから導く。
  function documentTitleOf(doc) {
    return pageTitleOf(pagesOf(doc)[0]);
  }

  // ページの表示名。**題名の導出はここだけ**(P25)。エディタの題名欄・目次・ページリンク・保存ファイルの
  // <title> がすべてこれを通る(2か所で書くと、空白だけの題名の扱いなどが片方だけずれる)。
  // ---- 題名・名前の候補の並べ方(ユーザー指示「一律で。打った語で始まる題名を先に並べる」。Issue #174 のレビュー) ----
  // 打った語(query)で候補を絞って並べる決まりの1つ(ページの一覧「@」・表のセルの「ページを選ぶ」・フォントの一覧・コマンドパレット)。
  //   0: 全部一致 → 1: 打った語で始まる → 2: 打った語を(そのままの並びで)含む → 3: 打った語の文字を全部含む(並びは違う)
  // それより外は候補にしない。同じ順位の中は元の並び(文書の順など)のまま。全角の英数字は半角に、大文字は小文字にそろえて比べる。
  // 以前は「含む」だけで元の並びのままだったので、完全に一致する題名が後ろに出ることがあった。
  function queryRank(text, query) {
    const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase();
    const target = normalize(text);
    const needle = normalize(query).trim();
    if (!needle) return 0;
    if (target === needle) return 0;
    if (target.startsWith(needle)) return 1;
    if (target.includes(needle)) return 2;
    const left = [...target];
    const chars = [...needle.replace(/\s+/g, "")];
    const all = chars.every((char) => {
      const at = left.indexOf(char);
      if (at < 0) return false;
      left.splice(at, 1);
      return true;
    });
    return all && chars.length ? 3 : Infinity;
  }

  // items を query で絞って並べる。textsOf(item) は比べる文字の並び(題名・日本語の呼び名など)で、いちばん良い順位を使う。
  // maxRank を渡すと、その順位までの候補だけにする(絵文字の候補は 2 =「含む」まで。字がばらばらに入っているだけの名前まで拾うと、
  // 2文字打っただけで何百も合ってしまう。Issue #175)。
  function rankByQuery(items, query, textsOf, { maxRank = 3 } = {}) {
    if (!String(query || "").trim()) return [...items];
    return items
      .map((item, index) => {
        const texts = [].concat(textsOf(item)).filter((value) => value !== undefined && value !== null);
        return { item, index, rank: Math.min(Infinity, ...texts.map((value) => queryRank(value, query))) };
      })
      .filter((entry) => entry.rank <= maxRank)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.item);
  }

  function pageTitleOf(page) {
    return (page?.title || "").trim() || "Untitled";
  }

  // 全ページのブロックを文書順につないだ読み取り用の配列。
  // 保存はページを1つでも落とすと内容が失われるので、**必ず全ページ**を見る。
  function allPageBlocks(doc) {
    return pagesOf(doc).flatMap((page) => page.blocks || []);
  }

  // HTML の属性・id に書き出しても安全な ID(英数字・"_"・"-" だけ、128 文字まで)。
  function isSafeId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  }

  function isUntitled(title) {
    const text = String(title || "").trim();
    return !text || text === "Untitled";
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2);
  }

  // ファイルの構成の注釈(0.8.9)。ファイルの先頭に置く。中身の正(manifest)が先頭にあることを、読み手(人・AI・道具)に
  // 事実として伝える(ユーザー決定: 「AI の方へ」のような宛先は書かず、構成だけを英語で)。表示とアプリには影響しない。
  // 読み方・直し方の決まりはファイルに書かず、公開する案内(docs/format/。GitHub Pages)へのリンク1行にする(ユーザー決定 2026-10-23:
  // 「ドキュメントはあくまで出力の結果であって指示書ではない」「指示がアップデートされても対応できる」)。リンクを読めない AI のために、
  // 構成の事実(中身は JSON だけ・後ろは写し)だけは残す。
  // ゴミ箱(0.8.20)の行は、ゴミ箱にページがある文書にだけ足す(無い文書の注釈は変わらない)。
  // ライセンスの表記(Issue #234)。この HTML の中のスクリプト・スタイルは Monolio のもの(GPL-3.0-or-later)で、文書の中身(利用者のもの)とは
  // 別。図(Mermaid)の絵があるときは、描いた Mermaid(MIT)の表記を足す。表示とアプリには影響しない。
  function portableLicenseNote(hasMermaid) {
    return "License: the scripts and styles in this file come from Monolio, free software under GPL-3.0-or-later (Copyright (C) woodenCaliper). "
      + "The document content itself is the author's own and is not covered by that license. "
      + (hasMermaid ? "Diagram pictures were drawn with Mermaid (MIT License, Copyright (c) 2014 - 2022 Knut Sveidqvist). " : "")
      + "License texts and source: https://github.com/woodenCaliper/Monolio\n";
  }
  function portableLayoutNote(hasTrash, hasMermaid) {
    const trashLine = hasTrash
      ? '4. "trash" in the JSON holds deleted pages that can be restored in Monolio; they are not part of the document and are not shown.\n'
      : "";
    return `<!--
Monolio document (SingleHtmlTechnicalDocument ${VERSION}, saved by Monolio ${APP_VERSION})
File layout:
1. The JSON right below (script element with id "document-manifest") is the document itself: pages, blocks, text, tables (formulas), diagram sources, TeX. "derived" holds display values computed from it (table results, table/figure numbers, heading numbers).
2. Everything after it renders the same content for viewing in a browser (styles, HTML, diagram pictures, attachment data). Monolio reads only the JSON; the rendered part is rebuilt on save.
3. "suggestions" in the JSON holds proposed changes awaiting review; they are not applied to "pages".
${trashLine}Format and editing guide: https://woodencaliper.github.io/Monolio/format/
${portableLicenseNote(hasMermaid)}-->`;
  }

  // ---- ページのゴミ箱(0.8.20。Issue #187) ----
  // 文書のゴミ箱の項目(無ければ空)。ゴミ箱のページは pages に入れないので、本文・目次・番号・検索・保存HTMLの表示は見ない。
  // 添付の掃除と書体の収集(エディタの allBlocks)だけはゴミ箱のページも数える(数えないと、元に戻したページの添付が消えている)。
  function trashOf(doc) {
    return Array.isArray(doc?.trash) ? doc.trash : [];
  }

  // manifest に書く形。表示用の写し(derived)は持たない(ゴミ箱のページは描かないので、番号も計算の結果も無い)。
  function manifestTrashEntryOf(entry) {
    const strip = (block) => {
      if (!block || typeof block !== "object") return block;
      const { derived, ...rest } = block;
      return rest;
    };
    return {
      ...entry,
      page: { ...entry.page, blocks: (entry.page?.blocks || []).map(strip) },
      links: (entry.links || []).map((link) => ({ ...link, block: strip(link.block) })),
    };
  }

  // 開いたファイルのゴミ箱を決まった形に直す(外から来た値。形の合わない項目・記録は捨てる)。ブロックの無害化と id の振り直しは
  // parsePortableHtml が本文のページと一緒に行う(sanitizeImportedContent)。
  function normalizeTrash(raw) {
    if (!Array.isArray(raw)) return [];
    const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
    const out = [];
    raw.forEach((entry) => {
      const page = entry?.page;
      if (!isObject(page)) return;
      const blocks = (Array.isArray(page.blocks) ? page.blocks : []).filter(isObject);
      const links = (Array.isArray(entry.links) ? entry.links : [])
        .filter((link) => isObject(link) && isSafeId(link.pageId) && isObject(link.block))
        .map((link) => ({ pageId: link.pageId, afterId: isSafeId(link.afterId) ? link.afterId : null, block: { ...link.block, type: "page" } }));
      const cells = (Array.isArray(entry.cells) ? entry.cells : [])
        .filter((cell) => isObject(cell) && isSafeId(cell.pageId) && isSafeId(cell.blockId)
          && Number.isInteger(cell.row) && Number.isInteger(cell.col) && cell.row >= 0 && cell.col >= 0)
        .map(({ pageId, blockId, row, col }) => ({ pageId, blockId, row, col }));
      out.push({
        id: isSafeId(entry.id) ? entry.id : newId(),
        deletedAt: typeof entry.deletedAt === "string" ? entry.deletedAt.slice(0, 40) : "",
        ...(Number.isInteger(entry.index) && entry.index > 0 ? { index: entry.index } : {}),
        page: {
          id: page.id === undefined ? newId() : page.id,
          title: typeof page.title === "string" ? page.title : "Untitled",
          blocks,
          ...(page.locked === true ? { locked: true } : {}),
          // アイコン・カバー(0.8.21)。形の検査は parsePortableHtml が添付を読んだ後に行う(normalizePageAppearance)。
          ...(page.icon !== undefined ? { icon: page.icon } : {}),
          ...(page.cover !== undefined ? { cover: page.cover } : {}),
        },
        links,
        cells,
      });
    });
    // 項目の id は、エディタが一覧の項目と結ぶ鍵。重なっていたら2つ目からは振り直す。
    const seen = new Set();
    out.forEach((entry) => {
      if (seen.has(entry.id)) entry.id = newId();
      seen.add(entry.id);
    });
    return out;
  }

  // manifest に書くブロックの形(0.8.9)。図の絵(mermaidSvg・chartSvg)は本文の絵(data-svg-for)だけに持つので外す。
  // derived に、人間用の表示と同じ計算済みの値を添える(表の計算結果は、式のある表だけ。図表の番号は題名のあるものだけ)。
  function manifestBlockOf(block, options) {
    if (!block || typeof block !== "object") return block;
    const { mermaidSvg, chartSvg, derived: staleDerived, ...rest } = block;
    const derived = {};
    const target = options.refTargets?.get(block.id);
    if (target && target.kind !== "heading" && target.label) derived.label = target.label;
    const headingNumber = options.headings?.get(block.id);
    if (headingNumber) derived.number = headingNumber;
    if (block.type === "table" && options.tableCellDisplay && Array.isArray(block.rows)) {
      // 式かどうかは本文の表の描画と同じ判定(app.js の isTableFormula。全角の「＝」・先頭の空白も扱う。v226)。
      const isFormula = (text) => (options.isTableFormula ? options.isTableFormula(text) : text.trim().startsWith("="));
      const hasFormula = block.rows.some((row) => Array.isArray(row) && row.some((cell) => isFormula(String((cell && typeof cell === "object" ? cell.text : cell) ?? ""))));
      if (hasFormula) {
        // 数の見せ方(桁区切り・百分率・小数の桁)も通す(v251。Issue #113。§4.31 の「人間に見えるのと同じ値」。以前は生の値で、
        // 画面の 25.0% が 0.25 になっていた。本文の表(renderPortableTable の cellText)と同じ formatTableNumber)。
        derived.values = block.rows.map((row, rowIndex) => (Array.isArray(row) ? row : []).map((cell, cellIndex) => {
          const value = String(options.tableCellDisplay(block, rowIndex, cellIndex) ?? "");
          return cell && typeof cell === "object" && cell.numberFormat ? formatTableNumber(value, cell.numberFormat) : value;
        }));
      }
    }
    // グループ分け(0.8.21。Issue #179)の組: 人間に見えるのと同じ組と行(行の番号は rows の位置。隠した行は入らない)。
    if (block.type === "table" && block.tableGroupBy && Array.isArray(block.rows)) {
      const valueOf = (rowIndex, cellIndex) => {
        if (options.tableCellDisplay) return options.tableCellDisplay(block, rowIndex, cellIndex);
        const cell = block.rows[rowIndex]?.[cellIndex];
        return cell && typeof cell === "object" ? cell.text : cell;
      };
      const plan = tableGroupPlan(block, valueOf, tableRowFilter(block, valueOf));
      if (plan) derived.groups = plan.groups.map((group) => ({ value: group.key, rows: group.rows, ...(group.collapsed ? { collapsed: true } : {}) }));
    }
    return Object.keys(derived).length ? { ...rest, derived } : rest;
  }

  // options のうち、書き出しの形に関わるもの:
  //   omitAttachmentData: 添付の中身(chunks)を書かない(Issue #220。印刷の枠用。枠では画像・フォントをエディタの側から入れるので
  //     添付の JSON を読まない。以前は印刷のたびに全添付の base64 を入れた HTML を作り、置換と解析をかけて捨てていた)。
  //     添付の JSON には名前などの記録だけを書く(本文・CSS は同じなので、紙の見た目は変わらない)。保存には使わない。
  //   onManifest: 書いた manifest を受ける関数(Issue #217)。
  function buildPortableHtml(doc, options = {}) {
    const scriptClose = "<" + "/script>";
    const pages = pagesOf(doc);
    const trash = trashOf(doc);
    const numbers = figureNumbers(doc);
    // 見出しの番号と参照の行き先は文書全体で1回だけ数える(ページごとに数え直すと、ページをまたいだ通し番号にならない)。
    const headings = headingNumbers(doc);
    const refTargets = referenceTargets(doc, numbers, headings);
    // ブロックへのリンクが指すブロック(Issue #176。錨を付ける)。
    const blockLinkTargets = blockLinkTargetIds(doc);
    const manifestBlock = (block) => manifestBlockOf(block, { ...options, headings, refTargets });
    // ページごとに書き出して連結する(1ページなら従来と同じ出力)。
    // 目次ブロックの走査範囲を、そのページのブロックに限るため。
    const multiPage = pages.length > 1;
    // ページは読む順(ページ一覧の並び。v253。Issue #105)に書き出す。先頭ページは作った順でも読む順でも先頭。
    const blockHtml = pagesInReadingOrder(doc)
      .map((page, index) => {
        const body = renderPortableBlocks(page.blocks || [], doc, { ...options, figureNumbers: numbers, headingNumbers: headings, refTargets, blockLinkTargets, tocScope: page.blocks || [] });
        if (!multiPage) return body;
        // ページごとに <section> で包む(スクリプトが動けば1ページずつ表示する単位)。題名はどれも帯つきの <h1>(v201)。
        // 2ページ目以降は h1.page-title で、スクリプトが無いときは上に間を空けて続ける。
        const title = escapeHtml(pageTitleOf(page));
        // アイコン・カバー(Issue #184)のあるページは、帯を <header> に移してアイコンを題名の上、カバーをその上に置く(renderPortablePageHead)。
        const heading = renderPortablePageHead(page, title, index === 0 ? "" : "page-title", doc.attachments);
        // ページの場所の中身(v207)。上のバーへはランタイムが写す(template なので、それ自体は表示されない)。
        const path = '<template class="doc-page-path-src">' + renderPortablePagePath(pages, page) + "</template>";
        return '<section class="doc-page" id="' + pageAnchor(page) + '" data-page-id="' + escapeHtml(page.id) + '">'
          + path + heading + body + "</section>";
      })
      .join("");
    // manifest は本文を描いた後に組み立てる(v226)。表は描くときに整う(行の長さをそろえる・結合で隠れたセルを片付ける。
    // アプリの tableRows)ので、先に組み立てると、一度も画面に出していないページの表が整える前の形で書かれ、本文の表示や
    // 2回目の保存と食い違った。ファイルの中の並び(manifest が先頭)は変わらない。
    const manifest = {
      format: FORMAT,
      formatVersion: VERSION,
      // このファイルを作ったアプリ(参考。開くときには使わない。読み込みでは外す)。
      generator: "Monolio " + APP_VERSION,
      // 読み込みでは使わない(ページごとの題名が正)。旧い版のエディタが開いたときの名前として残す。
      title: documentTitleOf(doc),
      createdAt: new Date().toISOString(),
      integrity: { algorithm: "SHA-256", scope: "attachments" },
      // 本文は pages[] で持つ(0.8.0)。ページを1つでも落とすと内容が失われるため、
      // 現在ページではなく必ず全ページを載せる。
      pages: pagesOf(doc).map((page) => ({
        id: page.id,
        title: page.title,
        blocks: (page.blocks || []).map(manifestBlock),
        // ロックしたページだけに書く(0.8.2。v178)。
        ...(page.locked ? { locked: true } : {}),
        // アイコン・カバー(0.8.21。Issue #184)。持っているページだけに書く。
        ...pageAppearanceFields(page),
      })),
      // ページのゴミ箱(0.8.20。Issue #187)。あるときだけ書く。本文には描かない(保存HTMLの表示に出さない)。
      ...(trash.length ? { trash: trash.map(manifestTrashEntryOf) } : {}),
      // 提案(0.8.14。v240)。あるときだけ書く(無い文書の manifest は 0.8.13 と同じ形)。
      ...(Array.isArray(doc.suggestions) && doc.suggestions.length ? { suggestions: doc.suggestions } : {}),
      fonts: doc.fonts || [],
      attachments: doc.attachments.map(({ chunks, ...attachment }) => attachment),
      // 文書の設定(0.8.8。v218。0.8.21 で書体・小さい文字)。入のものだけ書く(既定の文書の manifest は 0.8.7 と同じ形)。
      ...(normalizeDocumentSettings(doc.settings) ? { settings: normalizeDocumentSettings(doc.settings) } : {}),
    };
    // 書いた manifest を呼び出し側へ渡す(Issue #217。保存のあと、ファイルを読み直さずに比べる元を作る。documentFromWrittenManifest)。
    options.onManifest?.(manifest);
    // 1ページの文書には、ページの目次・バー・ランタイムを出さない。足すものは下の3つの差し込み口だけで、
    // 1ページのときはどれも空文字になる。ただし見出し1〜3がある文書には、ページ数によらず
    // いま読んでいる所の見出し(v205)の CSS とスクリプトを足す(見出しの無い1ページの文書の出力は変わらない)。
    const headingPath = hasPathHeadings(pages);
    // 音声のプレーヤー(0.8.20)の CSS とランタイムは、音声のある文書にだけ足す(無い文書の出力は変わらない)。
    const hasAudio = /data-attachment-audio=/.test(blockHtml);
    // 保存HTMLの CSS は document-style.js(本文の見た目の正。Issue #201)が作る。文書が使う部品の CSS だけを足す(無い部品の CSS は書かない)。
    const css = window.DocumentStyle.portableCss({
      multiPage,
      headingPath,
      headingNumbers: headingNumbersOn(doc),
      zoom: /data-attachment-image=|class="doc-chart-canvas/.test(blockHtml),
      pdf: /data-attachment-pdf=/.test(blockHtml),
      blockLink: /class="figure-ref is-block"|class="block-target"/.test(blockHtml),
      blockColor: / style="--block-(?:fg|bg):/.test(blockHtml),
      audio: hasAudio,
      date: /<time class="date-mention"/.test(blockHtml),
      pageHead: pages.some((page) => pageIconOf(page) || pageCoverOf(page, doc.attachments)),
      documentText: { fontStack: documentFontStack(doc), small: smallTextOn(doc) },
      code: /<span class="tok-/.test(blockHtml),
    });
    const bodyHtml = multiPage
      ? '<div class="doc-app">\n' + renderPortablePageTree(pages) + '\n<div class="doc-view">\n' + PORTABLE_PAGE_BAR
        + "\n<main>\n" + blockHtml + '\n<div class="status" id="status"></div>\n</main>\n</div>\n</div>'
      : "<main>\n" + renderPortablePageHead(pages[0], escapeHtml(documentTitleOf(doc)), "", doc.attachments) + "\n" + blockHtml + '\n<div class="status" id="status"></div>\n</main>';
    // 拡大表示(2026-10-23)は、画像・Mermaid の図・グラフがある文書にだけ足す(無い文書の出力は変わらない)。
    const zoomable = /data-attachment-image=|class="doc-chart-canvas/.test(blockHtml);
    const pagesScript = (multiPage ? "\n<script>\n" + portablePagesRuntime() + "\n" + scriptClose : "")
      + (headingPath ? "\n<script>\n" + portableHeadingPathRuntime() + "\n" + scriptClose : "")
      + (zoomable ? "\n<script>\n" + portableZoomRuntime() + "\n" + scriptClose : "");
    return `<!doctype html>
${portableLayoutNote(trash.length > 0, blockHtml.includes('class="doc-chart doc-mermaid"') && blockHtml.includes("doc-mermaid-canvas"))}
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Monolio ${APP_VERSION}">
<title>${escapeHtml(documentTitleOf(doc))}</title>
<script type="application/vnd.single-html-doc.manifest+json" id="document-manifest">
${escapeScriptJson(manifest)}
${scriptClose}
<style>
${css}
</style>
</head>
<body>
${bodyHtml}
<script type="application/vnd.single-html-doc.attachments+json" id="document-attachments">
${escapeScriptJson({ attachments: options.omitAttachmentData ? manifest.attachments : doc.attachments })}
${scriptClose}
<script>
${portableRuntime({ audio: hasAudio })}
${scriptClose}${pagesScript}
</body>
</html>`;
  }

  // 保存形式の版を比べる(点で区切った数の並びとして。"0.8.10" は "0.8.9" より新しい)。a が新しければ正、同じなら 0、古ければ負(v228)。
  function compareFormatVersions(a, b) {
    const left = String(a ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
    const right = String(b ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const diff = (left[index] || 0) - (right[index] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  // 本文の文字だけ(v251。Issue #115)。スクリプト・スタイル・添付やマニフェストの JSON(<script>)・テンプレートは除く。DOMParser の文書は
  // 描画しないので innerText が textContent と同じになり、以前はランタイムの JS と添付の base64 まで段落に入っていた。
  function readableBodyText(parsed) {
    const body = parsed.body?.cloneNode(true);
    if (!body) return "";
    body.querySelectorAll("script, style, template, noscript").forEach((node) => node.remove());
    return (body.textContent || "").replace(/[ \t]*\n[ \t\n]*/g, "\n").trim();
  }

  // ---- 提案(suggestions。0.8.14・v240) ----
  // 開いたファイル(人・AI・道具が書いたもの)の提案を、決まった形に直して受ける。形の合わない変更は捨てる。id が無い・使えない
  // 文字のときは振り直す(AI が id を付けずに書いてもよい)。before(変更前の値)が無い変更は、エディタが開いた時点の値を前とする。
  // 足すブロック(insertBlock の item)は、本文のブロックと同じく図の絵を持たせない(コードから描く)。文字の書式(html)は描くときに無害化する。
  const SUGGESTION_OPS = new Set(["setText", "setCell", "insertBlock", "deleteBlock"]);
  // partial は、段落の書き換えを語句ごとに決めて、採ったものと戻したものが混じったとき。
  const SUGGESTION_RESULTS = new Set(["accepted", "rejected", "partial"]);

  function suggestionText(value, max) {
    return typeof value === "string" ? value.slice(0, max) : "";
  }

  // 行き先の id(block・after・page)はエディタが CSS セレクタへ入れる値なので、安全な形でなければ変更ごと捨てる(v241。P25・v159)。
  // 足すブロック(item)は段組みを持たない(前のブロックの列に入る。エディタが当てるときに決める)。
  function normalizeSuggestionChange(change) {
    if (!change || typeof change !== "object" || !SUGGESTION_OPS.has(change.op)) return null;
    const out = { id: isSafeId(change.id) ? change.id : newId(), op: change.op };
    if (change.op === "insertBlock") {
      const item = change.item;
      if (!item || typeof item !== "object" || typeof item.type !== "string") return null;
      // after・page が無い(空)のはページの頭。あるのに安全な形でなければ捨てる。
      if (change.after && !isSafeId(change.after)) return null;
      if (change.page && !isSafeId(change.page)) return null;
      const { mermaidSvg, chartSvg, derived, columnGroup, columnIndex, columnWidth, ...block } = item;
      out.item = { ...block, id: isSafeId(block.id) ? block.id : newId() };
      out.after = change.after ? change.after : null;
      if (change.page) out.page = change.page;
    } else {
      if (!isSafeId(change.block)) return null;
      out.block = change.block;
    }
    if (change.op === "setCell") {
      const row = Number(change.row);
      const col = Number(change.col);
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) return null;
      out.row = row;
      out.col = col;
    }
    if (change.op === "setText" || change.op === "setCell") {
      if (typeof change.text !== "string") return null;
      out.text = change.text.slice(0, 200000);
      if (typeof change.before === "string") out.before = change.before.slice(0, 200000);
      if (change.op === "setText" && typeof change.html === "string") out.html = change.html.slice(0, 400000);
    }
    if (SUGGESTION_RESULTS.has(change.result)) out.result = change.result;
    // 足したブロックの id は、採用済みの追加だけが持つ(足す位置の決め方に使う。採用していない変更に書いてあっても受けない。v242)。
    if (out.op === "insertBlock" && out.result === "accepted" && isSafeId(change.insertedId)) out.insertedId = change.insertedId;
    if (Array.isArray(change.hunkResults)) out.hunkResults = change.hunkResults.map((value) => (SUGGESTION_RESULTS.has(value) ? value : null));
    return out;
  }

  // sanitize: 足すブロックをここで直すか。ファイルを開くとき(parsePortableHtml)は、本文のブロックと一緒に直すので false
  // (一緒でないと、添付の id を付け直したときに、提案のブロックの参照が付け替わらない。v242)。
  function normalizeSuggestions(raw, { sanitize = true } = {}) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    // 提案・変更の id は、エディタが項目と本文の印・仮の行を結ぶ鍵。重なっていたら2つ目からは振り直す(v241)。
    const seen = new Set();
    const unique = (value) => {
      const fresh = seen.has(value) ? newId() : value;
      seen.add(fresh);
      return fresh;
    };
    raw.forEach((suggestion) => {
      if (!suggestion || typeof suggestion !== "object") return;
      const changes = (Array.isArray(suggestion.changes) ? suggestion.changes : []).map(normalizeSuggestionChange).filter(Boolean);
      if (!changes.length) return;
      changes.forEach((change) => { change.id = unique(change.id); });
      const kind = ["human", "ai", "tool"].includes(suggestion.author?.kind) ? suggestion.author.kind : "tool";
      out.push({
        id: unique(isSafeId(suggestion.id) ? suggestion.id : newId()),
        author: { name: suggestionText(suggestion.author?.name, 80) || "名前なし", kind },
        title: suggestionText(suggestion.title, 300),
        reason: suggestionText(suggestion.reason, 4000),
        createdAt: suggestionText(suggestion.createdAt, 40),
        ...(suggestion.status === "done" ? { status: "done" } : {}),
        changes,
      });
    });
    // 足すブロックは、開いたページのブロック・貼り付けのブロックと同じ直しを通す(字下げ・id・図の絵。v241。通さないと、
    // 字下げがマイナスのブロックを採用して保存したとき、保存HTMLでその後ろの本文が消えた)。
    const items = out.flatMap((suggestion) => suggestion.changes.filter((change) => change.op === "insertBlock").map((change) => change.item));
    if (sanitize && items.length) sanitizeImportedContent([{ blocks: items }], [], []);
    return out;
  }

  function parsePortableHtml(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const manifestNode = parsed.querySelector("#document-manifest");
    const attachmentsNode = parsed.querySelector("#document-attachments");
    if (!manifestNode) throw new Error("No document manifest found");
    const manifest = JSON.parse(manifestNode.textContent);
    const attachmentStore = attachmentsNode ? JSON.parse(attachmentsNode.textContent) : { attachments: [] };
    return documentFromManifest(manifest, attachmentStore, parsed);
  }

  // 書き出した manifest(buildPortableHtml の onManifest で受けたもの)から、そのファイルを開き直したときと同じ文書を作る(Issue #217)。
  // 保存のあと、外での書き換えと比べる元(app.js の rememberSavedFile)を、書いた HTML を丸ごと読み直さずに作るため
  // (以前は 140MB の HTML を DOMParser にかけ、JSON の解析・base64 の検査・SVG の無害化まで走らせていた。約 0.9 秒)。
  // 開くときと同じ関数(documentFromManifest)を通すので、本文の形は開き直したものと同じになる。ファイルに書くのと同じく JSON を通して写す。
  // 違うのは次の2つだけ(どちらも比べる元には入れないもの): 添付は中身(chunks)を持たないので返す attachments は空、
  // 図の絵(chartSvg・mermaidSvg)は本文の HTML から拾わない。
  function documentFromWrittenManifest(manifest) {
    const copy = JSON.parse(JSON.stringify(manifest));
    return documentFromManifest(copy, { attachments: Array.isArray(copy.attachments) ? copy.attachments : [] }, null);
  }

  // manifest と添付の JSON から文書を作る(開くときの本体)。parsed は開いた HTML(DOMParser の文書)。無いとき(上の書き出した manifest)は
  // 本文の HTML から拾うもの(旧形式の題名・本文の文字・図の絵)を使わない。
  function documentFromManifest(manifest, attachmentStore, parsed) {
    // 旧形式(0.7.0 以前)は題名が文書に1つだけなので、それを先頭ページの題名にする。
    const title = manifest.title || parsed?.title || "Untitled";
    // 0.8.0 以降は pages[]、それ以前は blocks[]。**旧形式を1ページに包んで受ける**
    // (互換は必須。ここを落とすと、これまで保存したファイルが開けなくなる)。
    // 0.8.0 以降は**各ページの題名をそのまま使う**(ページごとに独立。manifest.title では上書きしない)。
    const pages = Array.isArray(manifest.pages) && manifest.pages.length
      ? manifest.pages.map((page) => ({
        id: page.id || newId(),
        title: page.title || "Untitled",
        blocks: page.blocks || [],
        // ページのロック(0.8.2)。項目の無い旧いファイルはロックなし。
        ...(page.locked === true ? { locked: true } : {}),
        // アイコン・カバー(0.8.21)。形の検査は添付を読んだ後(normalizePageAppearance)。
        ...(page.icon !== undefined ? { icon: page.icon } : {}),
        ...(page.cover !== undefined ? { cover: page.cover } : {}),
      }))
      : [{
        id: newId(),
        title,
        blocks: manifest.blocks || [{ id: newId(), type: "paragraph", text: parsed ? readableBodyText(parsed) : "" }],
      }];
    // 0.8.0(Step 1 の版)のファイルは、本当の題名を manifest.title にだけ持ち、先頭ページの題名は
    // "Untitled" のままのことがある。**そのときだけ** manifest.title を先頭ページの題名として採る
    // (採らないと開いた時点で題名が消え、保存し直すと元の題名が失われる)。
    // 0.8.1 以降の manifest.title は先頭ページの題名から導いた値なので、読み込みでは使わない。
    if (manifest.formatVersion === "0.8.0" && isUntitled(pages[0].title) && !isUntitled(manifest.title)) {
      pages[0].title = manifest.title;
    }
    // 0.8.9: 図の絵は本文(data-svg-for="ブロックid")にだけある。manifest に絵が無いグラフ・Mermaid の図は、そこから拾う
    // (下の無害化を通る)。derived は表示用の写しなので捨てる(中身の正は rows・text など)。
    // 取り出しは XML の書き方で(HTML の outerHTML だと &nbsp; などの名前付きの文字がそのまま残り、無害化が XML として読めずに絵が消える)。
    const bodySvgs = new Map();
    const serializer = parsed ? new XMLSerializer() : null;
    parsed?.querySelectorAll("[data-svg-for]").forEach((node) => {
      const svg = node.querySelector(":scope > svg");
      if (svg && !bodySvgs.has(node.getAttribute("data-svg-for"))) bodySvgs.set(node.getAttribute("data-svg-for"), serializer.serializeToString(svg));
    });
    pages.forEach((page) => (page.blocks || []).forEach((block) => {
      if (!block || typeof block !== "object") return;
      delete block.derived;
      const svg = bodySvgs.get(block.id);
      if (!svg) return;
      if (block.type === "chart" && block.chartSvg === undefined) block.chartSvg = svg;
      if (block.type === "mermaid" && block.mermaidSvg === undefined) block.mermaidSvg = svg;
    }));
    const fonts = manifest.fonts || [];
    // 添付は物(オブジェクト)だけを受ける(null などが混ざると、下の検査で落ちて「開けませんでした」になる)。
    const attachments = (Array.isArray(attachmentStore.attachments) ? attachmentStore.attachments : [])
      .filter((attachment) => attachment && typeof attachment === "object");
    // 提案(0.8.14)。外から来た内容なので、決まった形のものだけを受ける(normalizeSuggestions)。足すブロックは本文のブロックと
    // 一緒に直す(添付の id の付け直しが提案のブロックにも届く。ブロックの id が本文と重なれば振り直す。v242)。
    const suggestions = normalizeSuggestions(manifest.suggestions, { sanitize: false });
    const suggestionItems = suggestions.flatMap((suggestion) => suggestion.changes.filter((change) => change.op === "insertBlock").map((change) => change.item));
    // ページのゴミ箱(0.8.20)。本文のページと一緒に直す(ページ・ブロックの id が本文と重なれば振り直し、添付の id の付け直しも届く)。
    // 本文のページを先に並べるので、重なったときに振り直されるのはゴミ箱の側。
    const trash = normalizeTrash(manifest.trash);
    const trashLinks = trash.flatMap((entry) => entry.links.map((link) => link.block));
    sanitizeImportedContent([
      ...pages,
      ...trash.map((entry) => entry.page),
      ...(trashLinks.length ? [{ blocks: trashLinks }] : []),
      ...(suggestionItems.length ? [{ blocks: suggestionItems }] : []),
    ], fonts, attachments);
    trash.forEach((entry) => {
      entry.page.blocks.forEach((block) => { delete block.derived; });
      // 外したリンクはそのページへのリンク(ページの id を振り直したときも、ここで合わせる)。
      entry.links.forEach((link) => { link.block.pageId = entry.page.id; });
    });
    dropUnreadableAttachments(attachments);
    // ページのアイコンは絵文字だけ、カバーは文書にある画像の添付を指すときだけ受ける(0.8.21。ゴミ箱のページも同じ)。
    [...pages, ...trash.map((entry) => entry.page)].forEach((page) => normalizePageAppearance(page, attachments));
    // 文書の設定(0.8.8)。見出しに番号・小さい文字は true のときだけ入、書体は "serif" / "mono" だけ(項目の無い旧いファイル・ほかの値は既定)。
    const settings = normalizeDocumentSettings(manifest.settings);
    // 文書の題名は返さない(持たない)。返すと doc に3つ目の題名が入り、どこからも編集されずに残る。
    return {
      pages,
      // どのページを開くかは UI 状態なので返さない(エディタ側が先頭ページへ落とす)。
      fonts,
      attachments,
      // 設定が1つも入でなければ項目ごと持たない(切の文書の doc は 0.8.7 と同じ形)。
      ...(settings ? { settings } : {}),
      ...(suggestions.length ? { suggestions } : {}),
      ...(trash.length ? { trash } : {}),
      // このファイルを保存したときの形式の版(v228)。アプリより新しければエディタが注意を出す。doc には入れない(エディタが外す)。
      formatVersion: typeof manifest.formatVersion === "string" ? manifest.formatVersion : null,
    };
  }

  // 中身(chunks)を読めない添付を外す(v221)。chunks が無い・base64 でない添付を開くと、エディタの描画(画像の表示)で
  // 落ちて「開けませんでした」と出るのに文書は差し替わっていて、保存も入力もできない状態になった。画像でない添付は
  // 開けても、保存の前の検査で落ちて黙って保存できなかった。外した添付を使うブロックは「Missing attachment」と出る
  // (黙って消さない)。ファイルを開くときだけ行う: 貼り付け(クリップボード)の添付はもともと中身を持たない。
  function dropUnreadableAttachments(attachments) {
    for (let index = attachments.length - 1; index >= 0; index--) {
      if (!isReadableAttachment(attachments[index])) attachments.splice(index, 1);
    }
  }

  function isReadableAttachment(attachment) {
    if (!Array.isArray(attachment.chunks)) return false;
    return attachment.chunks.every((chunk) => {
      if (typeof chunk !== "string") return false;
      // 保存した形(btoa の出力)はこれで通る。通らないもの(空白入りなど)は、読む関数(atob)が受けるかで決める。
      if (chunk.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(chunk)) return true;
      try {
        atob(chunk);
        return true;
      } catch {
        return false;
      }
    });
  }

  // **外から来た内容は信用しない**。開いたファイル(parsePortableHtml)と、クリップボードから貼り付けた
  // ブロック(v147)の両方がここを通る(入口ごとに書くと、片方だけ無害化が抜ける。P25)。その場で書き換える。
  // 字下げの上限は文書全体で1つ(v259。Issue #139。ユーザー決定「20で統一」)。Tab・貼り付け・ドラッグ・段組みへの移動・
  // 開くとき・番号の数え方のすべてがこれを使う。以前は Tab が 6 段・開くときが 20 段・貼り付けとドラッグは上限なしで
  // ばらばらだったので、21 段以上を作って保存すると、開き直したときに 20 段へ切り詰められて親子の形が変わった。
  const MAX_INDENT = 20;
  function clampIndent(value) {
    const level = Math.floor(Number(value));
    return Number.isFinite(level) ? Math.max(0, Math.min(MAX_INDENT, level)) : 0;
  }

  // 段組みの列の数の上限(v262。Issue #142。ユーザー決定「8」。以前は 3)。列を作るドラッグはここまで。
  // これより多い列の文書を開くと、上限より右の列の中身は最後の列の下に並ぶ(文字は消さない。app.js normalizeColumnLayouts)。
  const MAX_COLUMNS = 8;

  function sanitizeImportedContent(pages, fonts, attachments) {
    // chartSvg は保存HTMLにそのまま載るので無害化する。**全ページに対して**行う(現在ページだけだと、
    // 他ページの細工が生き残る)。
    pages.forEach((page) => (page.blocks || []).forEach((block) => {
      // 添付の見せ方(v273。v277 で "read" を足した)。添付のブロックの "file"・"read" だけを受ける(ほかの値・ほかの種類のブロックの値は外す)。
      if (block && block.attachmentView !== undefined && !(block.type === "attachment" && ["file", "read"].includes(block.attachmentView))) delete block.attachmentView;
      // 番号の形(0.8.20)。決まった4つの値だけを受ける。種類は問わない(番号付きから別の種類へ変えても値は残し、戻したら効く。
      // 開き直しで消すと、画面と開き直した文書で形が変わるため)。
      if (block && block.listStyle !== undefined && !NUMBERED_LIST_STYLES.includes(block.listStyle)) delete block.listStyle;
      // 種類と文字は文字列に直す(v244)。文字列でないと、開けたあと、まだ描いていないページへ移ったときに描画が例外で止まった
      // (type.startsWith・text.slice)。種類が無い・分からない形のブロックは段落として受ける。
      if (block && typeof block === "object") {
        if (typeof block.type !== "string") block.type = "paragraph";
        if (block.text != null && typeof block.text !== "string") block.text = typeof block.text === "object" ? "" : String(block.text);
        // ブロックの色(Issue #162)は知っている名前だけ、呼び出しの絵文字(Issue #161)は絵文字の形のときだけ受ける(ほかは外す。
        // 外した呼び出しは 💡)。種類は問わずに値だけ見る(新しい版の種類の値も残す。描くのは色を持てる種類だけ)。
        if (block.color !== undefined && !normalizeBlockColor(block.color)) delete block.color;
        if (block.icon !== undefined && !isCalloutIcon(block.icon)) delete block.icon;
        // コードの言語(0.8.21。Issue #163)。知っている id だけを受ける(ほかは外す = 書式なし)。種類は問わない(番号の形と同じ。
        // コードから別の種類へ変えても値は残し、コードへ戻したら効く)。
        if (block.language !== undefined && !CODE_LANGUAGE_IDS.has(block.language)) delete block.language;
      }
      // 行の高さ(v238)。数に直し、行の数にそろえる。決めた行が無ければ外す。
      if (block && block.tableRowHeights !== undefined) {
        const heights = block.type === "table" ? normalizeTableRowHeights(block.tableRowHeights, (block.rows || []).length) : null;
        if (heights) block.tableRowHeights = heights;
        else delete block.tableRowHeights;
      }
      // 表の絞り込み(v232。条件と OR は Issue #180)。形を整え、列の数の外・読めない条件は外す。組み合わせは "or" のときだけ残す。
      if (block && (block.tableFilter !== undefined || block.tableFilterJoin !== undefined)) {
        const filters = block.type === "table" && Array.isArray(block.rows)
          ? normalizeTableFilter(block.tableFilter, block.rows.reduce((most, row) => Math.max(most, Array.isArray(row) ? row.length : 0), 0)) : [];
        if (filters.length) block.tableFilter = filters;
        else delete block.tableFilter;
        if (filters.length && normalizeTableFilterJoin(block.tableFilterJoin) === "or") block.tableFilterJoin = "or";
        else delete block.tableFilterJoin;
      }
      // 表のグループ分け(0.8.21。Issue #179)。列の数の外・形の違う値は外す。畳んだ組の鍵は文字だけ。
      if (block && block.tableGroupBy !== undefined) {
        const groupBy = block.type === "table" && Array.isArray(block.rows)
          ? normalizeTableGroupBy(block.tableGroupBy, block.rows.reduce((most, row) => Math.max(most, Array.isArray(row) ? row.length : 0), 0)) : null;
        if (groupBy) block.tableGroupBy = groupBy;
        else delete block.tableGroupBy;
      }
      // 表を見せる高さ(v235)・中で読む PDF の高さ(v277)。数でない・小さすぎる値は外す(表は全部見せる、PDF は既定の高さ)。
      if (block && block.viewHeight !== undefined) {
        const height = portableTableViewHeight(block);
        if (height && (block.type === "table" || block.type === "attachment")) block.viewHeight = height;
        else delete block.viewHeight;
      }
      if (block && block.type === "chart" && block.chartSvg !== undefined) {
        block.chartSvg = sanitizeChartSvg(block.chartSvg);
      }
      // Mermaid の図の SVG も同じ(v194)。種類を問わず mermaidSvg を持っていれば無害化する(種類を書き換えて
      // 素通りさせられないように。今は mermaid 以外のブロックは使わない値)。
      if (block && block.mermaidSvg !== undefined) {
        block.mermaidSvg = sanitizeMermaidSvg(block.mermaidSvg);
      }
    }));
    // 添付の ID は HTML の属性に書き出す値(v144)。エディタが作る ID(UUID か "b-…")と同じ文字だけなら
    // 残し、それ以外は新しい ID に振り直して、**全ページのブロックと埋め込みフォントからの参照も同じ
    // 対応表で付け替える**(付け替えないと、添付がどのブロックからも見えなくなり、次の掃除で消える)。
    const renamed = new Map();
    attachments.forEach((attachment) => {
      if (isSafeId(attachment.id)) return;
      const fresh = newId();
      renamed.set(attachment.id, fresh);
      attachment.id = fresh;
    });
    if (renamed.size) {
      pages.forEach((page) => (page.blocks || []).forEach((block) => {
        if (block && renamed.has(block.attachmentId)) block.attachmentId = renamed.get(block.attachmentId);
      }));
      // ページのカバー(0.8.21)も同じ表で付け替える。
      pages.forEach((page) => {
        const cover = page?.cover;
        if (cover && typeof cover === "object" && renamed.has(cover.attachmentId)) page.cover = { ...cover, attachmentId: renamed.get(cover.attachmentId) };
      });
      fonts.forEach((font) => {
        if (font && renamed.has(font.attachmentId)) font.attachmentId = renamed.get(font.attachmentId);
      });
    }
    sanitizeStructureIds(pages);
    // 字下げは 0〜20 の整数に直す(v227)。マイナスだと保存HTMLでその後ろの本文が消え、極端な値だと画面からはみ出した。
    // エディタで付けられる字下げは 6 段までで、貼り付けのずらしで少し増えることがあるので、上限は余裕を持たせる。
    pages.forEach((page) => (page.blocks || []).forEach((block) => {
      if (!block || block.indent === undefined) return;
      const level = Math.floor(Number(block.indent));
      if (!Number.isFinite(level) || level <= 0) delete block.indent;
      else block.indent = clampIndent(level);
    }));
  }

  // ページの id・ブロックの id・段組みの組の id(columnGroup)も、エディタが CSS セレクタ(data-id など)や HTML の
  // 属性へ連結する値(v159。添付の id と同じ扱い)。細工した id(例 x"],[data-id="y)だと要素の検索が落ちたり、別の
  // ブロックに操作が効いたりする。**安全な形でない id と、文書の中で重複した id は新しい id に振り直し、参照を同じ
  // 対応表で付け替える**:
  //   - ページの id ← ページのリンクのブロックの pageId
  //   - ブロックの id ← グラフの table(id="…")
  //   - 段組みの組の id は組の全員で共有する値なので、同じ値は同じ新しい id へ(重複は正常)
  //   - 段組みの列の番号(columnIndex)も data-column-index のセレクタに入る。0 以上の整数でない値は、組の中で
  //     使われていない番号へ振り直す(同じ値は同じ番号へ。0 に丸めると、別の列が1つにまとまってしまう)
  // 重複した id の2つ目以降は新しい id にするが、参照は1つ目を指したまま(どちらを指すつもりかは分からない)。
  // 貼り付けの入れ物(ページの id を持たない)はページの検査を飛ばす。
  function sanitizeStructureIds(pages) {
    const renameAll = (items, read, write) => {
      const renamed = new Map();
      const seen = new Set();
      items.forEach((item) => {
        const value = read(item);
        if (value === undefined) return;
        if (!isSafeId(value)) {
          if (renamed.has(value)) {
            write(item, newId());
          } else {
            const fresh = newId();
            renamed.set(value, fresh);
            write(item, fresh);
          }
        } else if (seen.has(value)) {
          write(item, newId());
        }
        seen.add(read(item));
      });
      return renamed;
    };
    const pageRenamed = renameAll(pages.filter(Boolean), (page) => page.id, (page, value) => { page.id = value; });
    const blocks = pages.flatMap((page) => (page?.blocks || []).filter((block) => block && typeof block === "object"));
    const blockRenamed = renameAll(blocks, (block) => block.id, (block, value) => { block.id = value; });
    const groupRenamed = new Map();
    blocks.forEach((block) => {
      if (block.columnGroup === undefined || block.columnGroup === null || isSafeId(block.columnGroup)) return;
      if (!groupRenamed.has(block.columnGroup)) groupRenamed.set(block.columnGroup, newId());
      block.columnGroup = groupRenamed.get(block.columnGroup);
    });
    const validIndex = (value) => Number.isInteger(value) && value >= 0 && value < 1000;
    const nextFree = new Map();
    const indexRenamed = new Map();
    blocks.forEach((block) => {
      if (!block.columnGroup || validIndex(block.columnIndex)) return;
      nextFree.set(block.columnGroup, nextFree.get(block.columnGroup) ?? Math.max(-1, ...blocks
        .filter((item) => item.columnGroup === block.columnGroup && validIndex(item.columnIndex))
        .map((item) => item.columnIndex)) + 1);
    });
    blocks.forEach((block) => {
      if (block.columnIndex === undefined || validIndex(block.columnIndex)) return;
      if (!block.columnGroup) {
        delete block.columnIndex;
        return;
      }
      const key = block.columnGroup + "\u0000" + String(block.columnIndex);
      if (!indexRenamed.has(key)) {
        indexRenamed.set(key, nextFree.get(block.columnGroup));
        nextFree.set(block.columnGroup, nextFree.get(block.columnGroup) + 1);
      }
      block.columnIndex = indexRenamed.get(key);
    });
    blocks.forEach((block) => {
      if (block.type === "page" && pageRenamed.has(block.pageId)) block.pageId = pageRenamed.get(block.pageId);
      if (block.type === "chart" && blockRenamed.size) block.text = retargetChartTables(block.text, blockRenamed);
    });
  }

  // グラフのコードの table(id="旧") を、対応表(旧 id → 新 id)に従って書き換える。ほかの行はそのまま(v158。
  // 貼り付けの組の付け替えと、開いたファイルの id の振り直しの両方が使う。P25)。
  function retargetChartTables(text, renamed) {
    return String(text || "").split("\n").map((line) => line.replace(
      /^(\s*table\s*\(\s*id\s*=\s*")([^"]*)("\s*\)\s*)$/i,
      (whole, head, oldId, tail) => (renamed.has(oldId) ? head + renamed.get(oldId) + tail : whole),
    )).join("\n");
  }

  // ---- 数式の焼き込み ----
  // TeX → MathML の変換は tex-math.js の1つ(Issue #207。このファイルより前に読む)。エディタも fmt.texToMathML でこれを使う。
  const { texToMathML } = window.TexMath;

  // インライン数式の焼き込み。MathML は data-tex(ソース)から都度作り直すため、
  // 開いた文書由来の MathML をそのまま信用しない。
  function renderInlineMathHtml(tex) {
    const source = String(tex ?? "");
    const math = texToMathML(source, false);
    if (!math) {
      return '<span class="inline-math math-error" data-tex="' + escapeHtml(source) + '">'
        + escapeHtml("$$" + source + "$$") + "</span>";
    }
    return '<span class="inline-math" data-tex="' + escapeHtml(source) + '">' + math + "</span>";
  }

  // ブロック数式の焼き込み。変換できなければ TeX ソースをそのまま示す。
  function renderPortableMath(block) {
    const tex = String(block.text || "");
    const math = texToMathML(tex, true);
    if (!math) return '<div class="doc-math math-error"><pre class="doc-math-source">' + escapeHtml(tex) + "</pre></div>";
    return '<div class="doc-math">' + math + "</div>";
  }

  // ---- Markdown の書き出しと読み込み(Issue #192) ----
  // 書き出し(documentToMarkdown): 文書の全ページを読む順(pagesInReadingOrder)に1つの .md へ書く。各ページは「# ページの題名」で
  // 始まり、ページの中の見出しは1段下げる(見出し1 → ##。題名の下の節なので)。Markdown に無いものは近い形にする:
  //   トグル → <details>、呼び出し → 「> 絵文字 文」、表の式 → 計算した値(人に見えるのと同じ。§4.31 の derived と同じ考え)、
  //   数式 → $…$ / $$…$$、Mermaid → ```mermaid、改ページ → <!-- pagebreak -->、目次 → <!-- toc --> と見出しへのリンクの並び、
  //   ページのブロック・ページと見出しへの参照 → 「#見出しの錨」へのリンク(錨の作り方は GitHub と同じ)、画像・添付 → ファイル名だけ
  //   (中身は入れない)、グラフ → 注記の1行(Markdown では描けない。データは元の表にある)。色・字の大きさ・書体は書かない。
  // 読み込み(markdownToPages): Markdown を HTML にし、ブロックに分けるのは外から貼った HTML と同じ blocksFromPastedHtml(app.js)が
  // 受け持つ(変換を2つ持たない。規則 8)。ここは CommonMark・GFM の主な形だけを読む(見出し・段落・強調・コード・リンク・リスト・
  // ToDo・引用・表・区切り線・コードのフェンス・$$数式$$・<details>・<aside>)。ファイルが「# 」で始まるなら「# 」ごとにページに分けて
  // 見出しを1段上げる(書き出しの逆)。生の HTML は決まったもの(<u> <br> <details> <summary> <aside> と目印の注釈)のほかは文字のまま。
  const MD_PAGEBREAK = "<!-- pagebreak -->";
  const MD_TOC_START = "<!-- toc -->";
  const MD_TOC_END = "<!-- /toc -->";
  const MD_LIST_TYPES = new Set(["bullet", "numbered", "todo"]);
  // GitHub の注意書き(> [!NOTE] など)は呼び出しにする。
  const MD_ALERT_ICONS = { NOTE: "ℹ️", TIP: "💡", IMPORTANT: "❗", WARNING: "⚠️", CAUTION: "🛑" };

  // 見出しの錨(GitHub と同じ: 小文字にし、文字・数字・空白・-・_ 以外を落とし、空白を - に。同じ錨は -1, -2 …)。
  function markdownSlugger() {
    const seen = new Map();
    return (text) => {
      const base = String(text || "").trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count ? base + "-" + count : base;
    };
  }

  // ---- 書き出し ----
  // 文字を Markdown の記号として読まれないようにする。_ は語の中(snake_case)ならそのまま。~ は2つ続くときだけ。
  function mdEscapeText(value) {
    return String(value ?? "")
      .replace(/[\\`*[\]<$]/g, "\\$&")
      .replace(/~{2,}/g, (run) => run.replace(/~/g, "\\~"))
      .replace(/_/g, (mark, offset, all) => (/[\p{L}\p{N}]/u.test(all[offset - 1] || "") && /[\p{L}\p{N}]/u.test(all[offset + 1] || "") ? "_" : "\\_"))
      .replace(/&(?=#?[A-Za-z0-9]+;)/g, "&amp;");
  }

  // 行の頭が見出し・引用・リスト・区切り線に読まれないようにする。行頭の空白(4つでコードになる)は文字の参照にする。
  function mdSafeLineStart(line) {
    let value = String(line);
    const lead = /^ +/.exec(value);
    if (lead) value = "&#32;".repeat(lead[0].length) + value.slice(lead[0].length);
    if (/^(#|>|[-+](\s|$)|[=-]+\s*$)/.test(value)) return "\\" + value;
    const ordered = /^(\d{1,9})([.)])(\s|$)/.exec(value);
    if (ordered) return ordered[1] + "\\" + value.slice(ordered[1].length);
    return value;
  }

  // 改行(<br>)は行末の \ (CommonMark の改行)。
  function mdTextLines(inline) {
    const lines = String(inline).split("\n").map(mdSafeLineStart);
    return lines.map((line, index) => (index < lines.length - 1 ? line + "\\" : line));
  }

  function mdWrap(inner, mark) {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    return match[2] ? match[1] + mark + match[2] + mark + match[3] : inner;
  }

  function mdCodeSpan(text) {
    const value = String(text ?? "").replace(/\n/g, " ");
    if (!value) return "";
    const longest = Math.max(0, ...(value.match(/`+/g) || []).map((run) => run.length));
    const ticks = "`".repeat(longest + 1);
    const pad = /^`|`$/.test(value) || /^ .* $/.test(value) ? " " : "";
    return ticks + pad + value + pad + ticks;
  }

  // リンク先。空白・かっこを含むときは <…> で囲む(ファイル名に多い)。
  function mdDestination(href) {
    const value = String(href ?? "");
    return /[\s()<>]/.test(value) ? "<" + value.replace(/[<>]/g, (char) => encodeURIComponent(char)) + ">" : value;
  }

  function mdReference(chip, ctx) {
    const id = chip.getAttribute("data-ref") || "";
    const entry = isSafeId(id) ? resolveReference(ctx.targets, id, refKindOf(chip)) : null;
    if (!entry) return mdEscapeText("参照先なし");
    // 見出しへの参照は見出しの名前(番号は書かない。見出しにも番号を書かないため)、ほかは画面と同じ文字(表1・ページの題名など)。
    const label = entry.kind === "heading" ? entry.title : entry.label;
    const anchor = ctx.anchors.get(id);
    return anchor !== undefined ? "[" + mdEscapeText(label) + "](#" + anchor + ")" : mdEscapeText(label);
  }

  function mdInlineNodes(parent, ctx) {
    let out = "";
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += mdEscapeText(node.nodeValue);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const name = node.nodeName;
      if (node.classList.contains("inline-math")) {
        const tex = String(node.getAttribute("data-tex") ?? node.querySelector(".inline-math-value")?.textContent ?? "").replace(/​/g, "").trim();
        if (tex) out += "$" + tex + "$";
        return;
      }
      if (node.classList.contains("figure-ref")) {
        out += mdReference(node, ctx);
        return;
      }
      if (node.classList.contains("date-mention")) {
        const iso = node.getAttribute("data-date") || "";
        out += mdEscapeText(isIsoDate(iso) ? dateMentionText(iso) : node.textContent || "");
        return;
      }
      if (name === "BR") {
        out += "\n";
        return;
      }
      if (name === "CODE") {
        const value = node.getAttribute("data-code") ?? node.querySelector(".inline-code-value")?.textContent ?? node.textContent ?? "";
        out += mdCodeSpan(String(value).replace(/​/g, ""));
        return;
      }
      const inner = mdInlineNodes(node, ctx);
      if (name === "B" || name === "STRONG") out += mdWrap(inner, "**");
      else if (name === "I" || name === "EM") out += mdWrap(inner, "*");
      else if (name === "S" || name === "STRIKE" || name === "DEL") out += mdWrap(inner, "~~");
      // 下線は Markdown に無いので HTML の <u>(Issue #172)。
      else if (name === "U" || name === "INS") out += inner.trim() ? "<u>" + inner + "</u>" : inner;
      else if (name === "A") {
        const href = safeLinkHref(node.getAttribute("href"));
        out += href && inner.trim() ? "[" + inner + "](" + mdDestination(href) + ")" : inner;
      } else out += inner;
    });
    return out;
  }

  // ブロックの文(書式つき)を Markdown の文に。改行は "\n" のまま返す(行の扱いは呼ぶ側)。
  function mdInlineOf(block, ctx) {
    const template = document.createElement("template");
    template.innerHTML = block.html ? String(block.html) : renderInlineMarkdown(block.text || "");
    return mdInlineNodes(template.content, ctx).replace(/​/g, "");
  }

  function mdCaption(block, ctx) {
    const text = captionText(block);
    if (!text) return "";
    const entry = ctx.figures.get(block.id);
    return "*" + mdEscapeText((entry ? entry.label + ": " : "") + text) + "*";
  }

  function mdTable(block, ctx) {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    const width = Math.max(0, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
    if (!rows.length || !width) return [];
    let formula = false;
    const cellText = (cell, r, c) => {
      // 結合で覆われたセルは空(文字は左上のセルだけ。Markdown の表に結合は無い)。
      if (cell && typeof cell === "object" && cell.covered) return "";
      const raw = String((cell && typeof cell === "object" ? cell.text : cell) ?? "");
      let value = raw;
      // 式は計算した値(画面に見える値)で書く。
      if (ctx.isTableFormula(raw) && ctx.tableCellDisplay) {
        value = String(ctx.tableCellDisplay(block, r, c) ?? "");
        formula = true;
      }
      if (cell && typeof cell === "object" && cell.numberFormat) value = formatTableNumber(value, cell.numberFormat);
      let text = mdEscapeText(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
      const link = cell && typeof cell === "object" ? cell.link : "";
      const pageId = link && isPageLinkHref(link) ? pageIdOfLinkHref(ctx.pages, link) : null;
      const href = pageId ? (ctx.anchors.has(pageId) ? "#" + ctx.anchors.get(pageId) : "") : safeLinkHref(link);
      if (href && text.trim()) text = "[" + text + "](" + mdDestination(href) + ")";
      return text;
    };
    const line = (row, r) => "| " + Array.from({ length: width }, (_, c) => cellText(Array.isArray(row) ? row[c] : undefined, r, c)).join(" | ") + " |";
    const lines = [line(rows[0], 0), "| " + Array.from({ length: width }, () => "---").join(" | ") + " |", ...rows.slice(1).map((row, r) => line(row, r + 1))];
    if (formula) ctx.stats.formulaTables += 1;
    return lines;
  }

  // ブロックの木(字下げで子を持つ)を Markdown の行にする。prefix はリストの中の字下げ。
  function mdEmitNodes(nodes, prefix, ctx) {
    const out = [];
    let previous = null;
    let number = 0;
    nodes.forEach((node) => {
      const type = node.block.type;
      const list = type === "numbered" ? "ol" : type === "bullet" || type === "todo" ? "ul" : null;
      const next = list === "ol" ? (previous === "ol" ? number + 1 : 1) : 0;
      const lines = mdEmitNode(node, prefix, ctx, next);
      if (!lines.length) return;
      // 同じリストの項目どうしは空行を入れずに続ける。ほかは空行で区切る。
      if (out.length && !(list && list === previous)) out.push("");
      out.push(...lines);
      previous = list;
      number = next;
    });
    return out;
  }

  function mdEmitNode(node, prefix, ctx, number) {
    const block = node.block;
    const type = String(block.type || "");
    const childLines = (childPrefix) => mdEmitNodes(node.children, childPrefix, ctx);
    // リスト・トグルのほかの子は、Markdown に入れ子が無いので、親の後ろに同じ字下げで並べる。
    const withChildren = (lines) => {
      const kids = childLines(prefix);
      if (!kids.length) return lines;
      return lines.length ? [...lines, "", ...kids] : kids;
    };
    const atPrefix = (lines) => lines.map((line) => (line ? prefix + line : ""));
    if (MD_LIST_TYPES.has(type)) {
      const marker = type === "numbered" ? number + ". " : type === "todo" ? "- [" + (block.checked ? "x" : " ") + "] " : "- ";
      const pad = " ".repeat(type === "numbered" ? marker.length : 2);
      const inline = mdInlineOf(block, ctx);
      const textLines = inline.trim() ? mdTextLines(inline) : [""];
      const lines = [prefix + (textLines[0] ? marker + textLines[0] : marker.trimEnd()), ...textLines.slice(1).map((line) => prefix + pad + line)];
      const kids = childLines(prefix + pad);
      if (!kids.length) return lines;
      // 子が段落などのときは空行を挟む(挟まないと項目の文の続きとして読まれる)。
      return [...lines, ...(MD_LIST_TYPES.has(node.children[0].block.type) ? [] : [""]), ...kids];
    }
    const heading = /^(?:heading|toggleHeading)([1-5])$/.exec(type);
    if (heading) {
      return withChildren([prefix + "#".repeat(Number(heading[1]) + 1) + " " + mdInlineOf(block, ctx).replace(/\n/g, " ").trim()]);
    }
    if (type === "quote" || type === "callout") {
      const inline = mdInlineOf(block, ctx);
      if (type === "quote" && !inline.trim()) return withChildren([]);
      const lines = inline.trim() ? mdTextLines(inline) : [""];
      if (type === "callout") lines[0] = (calloutIcon(block) + " " + lines[0]).trim();
      return withChildren(atPrefix(lines.map((line) => (line ? "> " + line : ">"))));
    }
    if (type === "toggle") {
      const summary = mdInlineOf(block, ctx).replace(/\n/g, " ").trim();
      const kids = childLines(prefix);
      return [prefix + (block.open === false ? "<details>" : "<details open>"), prefix + "<summary>" + summary + "</summary>",
        ...(kids.length ? ["", ...kids, ""] : []), prefix + "</details>"];
    }
    if (type === "code" || type === "mermaid") {
      const text = String(block.text ?? "");
      const longest = Math.max(2, ...(text.match(/`{3,}/g) || []).map((run) => run.length));
      const fence = "`".repeat(longest + 1);
      const caption = type === "mermaid" ? mdCaption(block, ctx) : "";
      // コードの言語(Issue #163)はフェンスの後ろに書く(読み込むと同じ言語に戻る。#192 と #163 をつなぐ)。
      const info = type === "mermaid" ? "mermaid" : (codeLanguageOf(block) || "");
      return withChildren([prefix + fence + info, ...text.split("\n").map((line) => prefix + line), prefix + fence,
        ...(caption ? ["", prefix + caption] : [])]);
    }
    if (type === "math") {
      const tex = String(block.text ?? "").trim();
      return withChildren(tex ? [prefix + "$$", ...tex.split("\n").map((line) => prefix + line), prefix + "$$"] : []);
    }
    if (type === "divider") return withChildren([prefix + "---"]);
    if (type === "pagebreak") return withChildren([prefix + MD_PAGEBREAK]);
    if (type === "toc") {
      const items = ctx.pageHeadings;
      const min = Math.min(...items.map((item) => item.level));
      return withChildren([prefix + MD_TOC_START, ...(items.length ? ["", ...items.map((item) => prefix + "  ".repeat(item.level - min) + "- [" + item.text + "](#" + item.anchor + ")"), ""] : []), prefix + MD_TOC_END]);
    }
    if (type === "table") {
      const caption = mdCaption(block, ctx);
      const lines = mdTable(block, ctx);
      return withChildren(lines.length ? atPrefix([...(caption ? [caption, ""] : []), ...lines]) : []);
    }
    if (type === "chart") {
      ctx.stats.charts += 1;
      const title = captionText(block) || /title\(\s*["']([^"'\n]*)["']/.exec(String(block.text || ""))?.[1] || "";
      const entry = ctx.figures.get(block.id);
      const name = (entry ? entry.label + ": " : "") + title;
      return withChildren([prefix + "*" + mdEscapeText("(グラフ" + (name ? "「" + name + "」" : "") + "。Markdown には図として書き出せません。データは元の表にあります)") + "*"]);
    }
    if (type === "attachment") {
      const attachment = (ctx.doc.attachments || []).find((item) => item.id === block.attachmentId);
      if (!attachment) return withChildren([]);
      ctx.stats.attachments += 1;
      const name = String(attachment.name || "file");
      const view = attachmentView(block, attachment);
      const caption = mdCaption(block, ctx);
      // 中身は入れず、ファイル名だけを書く(同じフォルダに置けば見える相対のリンク)。
      const line = (view === "image" ? "!" : "") + "[" + mdEscapeText(name) + "](" + mdDestination(name) + ")";
      return withChildren(atPrefix([line, ...(caption ? ["", caption] : [])]));
    }
    if (type === "page") {
      const page = ctx.pageById.get(block.pageId);
      const anchor = ctx.anchors.get(block.pageId);
      return withChildren(page && anchor !== undefined ? [prefix + "[" + mdEscapeText(pageTitleOf(page)) + "](#" + anchor + ")"] : []);
    }
    // 段落(と知らない種類)。
    const inline = mdInlineOf(block, ctx);
    return withChildren(inline.trim() ? atPrefix(mdTextLines(inline)) : []);
  }

  // 段組みの組は、列ごとに順に並べる(Markdown に段組みは無い)。
  function mdOrderColumns(blocks) {
    const out = [];
    for (let index = 0; index < blocks.length;) {
      if (!blocks[index]?.columnGroup) {
        out.push(blocks[index]);
        index += 1;
        continue;
      }
      const run = columnRun(blocks, index);
      const grouped = blocks.slice(index, run.end);
      [...new Set(grouped.map((block) => block.columnIndex || 0))].sort((a, b) => a - b)
        .forEach((column) => out.push(...grouped.filter((block) => (block.columnIndex || 0) === column)));
      index = run.end;
    }
    return out.filter((block) => block && typeof block === "object");
  }

  function mdTree(blocks) {
    const root = [];
    const stack = [{ indent: -1, children: root }];
    blocks.forEach((block) => {
      const indent = Math.max(0, Number(block.indent) || 0);
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
      const node = { block, indent, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });
    return root;
  }

  // options: tableCellDisplay(block, row, col)(式の計算した値)・isTableFormula(text)(エディタの判定)。
  // 返す値: { markdown, stats: { attachments, formulaTables, charts } }(stats は知らせの文に使う)。
  function documentToMarkdown(doc, options = {}) {
    const pages = pagesInReadingOrder(doc);
    const figures = figureNumbers(doc);
    const targets = referenceTargets(doc, figures, headingNumbers(doc));
    const ctx = {
      doc,
      pages,
      figures,
      targets,
      pageById: new Map(pages.map((page) => [page.id, page])),
      anchors: new Map(),
      stats: { attachments: 0, formulaTables: 0, charts: 0 },
      tableCellDisplay: options.tableCellDisplay || null,
      isTableFormula: options.isTableFormula || ((text) => String(text).trim().startsWith("=")),
      pageHeadings: [],
    };
    // 錨は、書く順(ページの題名 → そのページの見出し)に先に全部作る(後ろのページへのリンクがあるため)。読み込みも同じ順で作る。
    const slug = markdownSlugger();
    const ordered = pages.map((page) => mdOrderColumns(page.blocks || []));
    const titles = pages.map((page) => mdEscapeText(pageTitleOf(page)));
    pages.forEach((page, index) => {
      ctx.anchors.set(page.id, slug(markdownInlineText(titles[index])));
      ordered[index].forEach((block) => {
        if (!isHeadingType(block.type)) return;
        const text = mdInlineOf(block, ctx).replace(/\n/g, " ").trim();
        if (!ctx.anchors.has(block.id)) ctx.anchors.set(block.id, slug(markdownInlineText(text)));
      });
    });
    const sections = pages.map((page, index) => {
      ctx.pageHeadings = ordered[index].filter((block) => isHeadingType(block.type)).map((block) => ({
        level: Number(String(block.type).slice(-1)),
        text: mdEscapeText(headingRefTitle(block)),
        anchor: ctx.anchors.get(block.id),
      }));
      const body = mdEmitNodes(mdTree(ordered[index]), "", ctx);
      return ["# " + titles[index], ...(body.length ? ["", ...body] : [])].join("\n");
    });
    return { markdown: sections.join("\n\n") + "\n", stats: ctx.stats };
  }

  // ---- 読み込み ----
  const mdIndentOf = (line) => /^ */.exec(line)[0].length;

  function mdExpandTabs(line) {
    if (!line.includes("\t")) return line;
    let out = "";
    for (const char of line) out += char === "\t" ? " ".repeat(4 - (out.length % 4)) : char;
    return out;
  }

  // 文中の Markdown → HTML。太字・斜体・取り消し線・<u>・コード・$数式$・リンク・自動リンク・文字参照・\ の打ち消し。
  // 画像(![…](…))は読めない(ファイルが無い)ので「(画像: 名前)」の文字にする(黙って消さない)。改行は "\u0001"(mdJoinLines)。
  function markdownInlineHtml(source) {
    const held = [];
    const hold = (html, text = "") => "\u0000" + (held.push({ html, text }) - 1) + "\u0000";
    const restore = (value, key) => {
      let out = value;
      while (/\u0000\d+\u0000/.test(out)) out = out.replace(/\u0000(\d+)\u0000/g, (_, n) => held[Number(n)]?.[key] ?? "");
      return out;
    };
    const decode = (entity) => {
      const area = document.createElement("textarea");
      area.innerHTML = entity;
      return area.value;
    };
    const emphasis = (value) => value
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>")
      .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<b><i>$1</i></b>")
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, "$1<b>$2</b>")
      .replace(/\*(?=\S)([\s\S]*?\S)\*/g, "<i>$1</i>")
      .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/gu, "$1<i>$2</i>");
    const render = (value) => restore(emphasis(escapeHtml(value)).replace(/\u0001/g, "<br>"), "html");
    let text = String(source ?? "").replace(/\u0000/g, "");
    text = text.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\\([!-/:-@[-`{-~])|\$\$([^$\n]+?)\$\$|\$(?=[^\s$])([^$\n]*?[^\s$\\])\$(?!\d)|<((?:https?:\/\/|mailto:)[^\s<>]+)>|<(\/?)(u|ins|b|strong|i|em|s|del|br)\s*\/?>|&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/gi,
      (match, ticks, code, escaped, math2, math1, auto, close, tag, entity) => {
        if (ticks) {
          let body = code.replace(/\u0001/g, " ");
          if (/^ [\s\S]* $/.test(body) && body.trim()) body = body.slice(1, -1);
          return hold('<code>' + escapeHtml(body) + "</code>", body);
        }
        if (escaped) return hold(escapeHtml(escaped), escaped);
        if (math2 !== undefined || math1 !== undefined) return hold('<span class="inline-math" data-tex="' + escapeHtml((math2 ?? math1).trim()) + '"></span>');
        if (auto) return hold('<a href="' + escapeHtml(auto) + '">' + escapeHtml(auto) + "</a>", auto);
        if (tag) {
          const name = { ins: "u", strong: "b", em: "i", del: "s" }[tag.toLowerCase()] || tag.toLowerCase();
          return hold(name === "br" ? "<br>" : "<" + close + name + ">");
        }
        if (entity) {
          const value = decode("&" + entity + ";");
          return hold(escapeHtml(value), value);
        }
        return match;
      });
    // リンクと画像。[文字](行き先 "題")。行き先は <…> でもよい。
    text = text.replace(/(!?)\[((?:[^[\]\u0000]|\u0000\d+\u0000|\[[^[\]]*\])*)\]\(\s*(<[^<>\n]*>|(?:[^\s()]|\([^\s()]*\))*)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/g,
      (match, bang, label, destination) => {
        const href = restore(destination.replace(/^<([\s\S]*)>$/, "$1"), "text");
        if (bang) {
          const alt = restore(label, "text").trim();
          const note = "(画像: " + (alt || href) + ")";
          return hold(escapeHtml(note), note);
        }
        return hold('<a href="' + escapeHtml(href) + '">' + render(label) + "</a>", restore(label, "text"));
      });
    // 文の中の URL(GFM の自動リンク)。
    text = text.replace(/\bhttps?:\/\/[^\s<>\u0000\u0001]*[^\s<>\u0000\u0001.,;:!?'")\]」』）。、]/g, (url) => hold('<a href="' + escapeHtml(url) + '">' + escapeHtml(url) + "</a>", url));
    return render(text);
  }

  function markdownInlineText(source) {
    const template = document.createElement("template");
    template.innerHTML = markdownInlineHtml(source);
    return template.content.textContent || "";
  }

  // 段落の行をつなぐ。行末の \ と2つ以上の空白は改行("\u0001")。ふつうの改行は空白(日本語どうしの間は何も入れない)。
  function mdJoinLines(lines) {
    const cjk = /[⺀-ヿ㐀-鿿豈-﫿＀-￯]/;
    let out = "";
    lines.forEach((raw, index) => {
      let line = raw.replace(/^\s+/, "");
      if (index === lines.length - 1) {
        out += line.replace(/\s+$/, "");
        return;
      }
      const backslash = /(^|[^\\])(\\\\)*\\$/.test(line);
      const hard = backslash || / {2,}$/.test(line);
      line = backslash ? line.slice(0, -1) : line.replace(/\s+$/, "");
      const next = (lines[index + 1] || "").replace(/^\s+/, "");
      out += line + (hard ? "\u0001" : cjk.test(line.slice(-1)) && cjk.test(next.charAt(0)) ? "" : " ");
    });
    return out;
  }

  function mdIsThematic(line) {
    return /^ {0,3}([-*_])( *\1){2,} *$/.test(line);
  }

  function mdFenceOpen(line) {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match || (match[2][0] === "`" && match[3].includes("`"))) return null;
    return { indent: match[1].length, fence: match[2], info: match[3].trim().split(/\s+/)[0].toLowerCase() };
  }

  function mdListMarker(line) {
    if (mdIsThematic(line)) return null;
    const match = /^( *)([-*+]|\d{1,9}[.)])( +|$)/.exec(line);
    if (!match) return null;
    const rest = line.slice(match[0].length);
    const spaces = match[3].length;
    const ordered = /\d/.test(match[2]);
    return {
      indent: match[1].length,
      ordered,
      mark: match[2].slice(-1),
      start: ordered ? Number(match[2].slice(0, -1)) : 0,
      content: match[1].length + match[2].length + (rest.trim() ? (spaces > 4 ? 1 : spaces) : 1),
      empty: !rest.trim(),
    };
  }

  const MD_TABLE_DELIMITER = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  function mdSplitRow(line) {
    let value = line.trim();
    if (value.startsWith("|")) value = value.slice(1);
    if (value.endsWith("|") && !/(^|[^\\])(\\\\)*\\\|$/.test(value)) value = value.slice(0, -1);
    const cells = [];
    let current = "";
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === "\\" && value[index + 1] === "|") {
        current += "\\|";
        index += 1;
      } else if (char === "|") {
        cells.push(current.trim());
        current = "";
      } else current += char;
    }
    cells.push(current.trim());
    return cells;
  }

  // 段落を止める行(見出し・フェンス・引用・区切り線・リスト・数式・目印の HTML)。
  function mdStartsBlock(line) {
    if (mdIndentOf(line) > 3) return false;
    const marker = mdListMarker(line);
    return /^ *(#{1,6}(\s|$)|>|\$\$|<\/?(details|aside|summary)\b|<!--)/i.test(line) || Boolean(mdFenceOpen(line)) || mdIsThematic(line)
      || Boolean(marker && !marker.empty && (!marker.ordered || marker.start === 1));
  }

  // 囲みの HTML(<details>…</details> など)の終わりまでを集める(入れ子も数える)。
  function mdContainer(lines, start, tag) {
    const open = new RegExp("<" + tag + "\\b", "gi");
    const close = new RegExp("</" + tag + "\\s*>", "gi");
    let depth = 0;
    for (let index = start; index < lines.length; index += 1) {
      depth += (lines[index].match(open) || []).length - (lines[index].match(close) || []).length;
      if (depth <= 0) return { text: lines.slice(start, index + 1).join("\n"), next: index + 1 };
    }
    return { text: lines.slice(start).join("\n"), next: lines.length };
  }

  function mdParagraphHtml(lines, ctx) {
    // ページへのリンクだけの段落(書き出しのページのブロック)は、読み込んだページへのリンクに戻す。
    const page = lines.length === 1 ? /^\[([^\]]*)\]\(#([^()\s]+)\)$/.exec(lines[0].trim()) : null;
    if (page && ctx.pageSlugs) {
      let slug = page[2];
      try {
        slug = decodeURIComponent(slug);
      } catch {
        // 読めない % はそのまま比べる
      }
      if (ctx.pageSlugs.has(slug)) {
        return '<monolio-md data-kind="page" data-page="' + ctx.pageSlugs.get(slug) + '" data-title="' + escapeHtml(markdownInlineText(page[1])) + '"></monolio-md>';
      }
    }
    return "<p>" + markdownInlineHtml(mdJoinLines(lines)) + "</p>";
  }

  // ブロックの並びの Markdown → HTML。ctx.shift: 見出しを上げる段数(ページに分けたときは 1)。
  function mdBlocksHtml(lines, ctx) {
    let html = "";
    let paragraph = [];
    const flush = () => {
      if (paragraph.length) html += mdParagraphHtml(paragraph, ctx);
      paragraph = [];
    };
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        flush();
        index += 1;
        continue;
      }
      const indent = mdIndentOf(line);
      if (indent >= 4) {
        if (paragraph.length) {
          paragraph.push(line);
          index += 1;
          continue;
        }
        // 字下げのコード
        const code = [];
        while (index < lines.length && (!lines[index].trim() || mdIndentOf(lines[index]) >= 4)) code.push(lines[index++].slice(4));
        while (code.length && !code[code.length - 1].trim()) code.pop();
        html += "<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>";
        continue;
      }
      const trimmed = line.trim();
      const fence = mdFenceOpen(line);
      if (fence) {
        flush();
        const body = [];
        index += 1;
        while (index < lines.length) {
          const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[index]);
          if (close && close[1][0] === fence.fence[0] && close[1].length >= fence.fence.length) break;
          body.push(lines[index].slice(Math.min(fence.indent, mdIndentOf(lines[index]))));
          index += 1;
        }
        index += 1;
        const language = /^[\w+#.-]+$/.test(fence.info) ? fence.info : "";
        html += "<pre><code" + (language ? ' class="language-' + escapeHtml(language) + '"' : "") + ">" + escapeHtml(body.join("\n")) + "</code></pre>";
        continue;
      }
      // $$ … $$(1行の「$$ 式 $$」か、「$$」だけの行で挟んだもの)
      const single = /^\$\$([\s\S]+?)\$\$$/.exec(trimmed);
      if (trimmed === "$$" || (single && !single[1].includes("$$"))) {
        flush();
        let tex;
        if (single) {
          tex = single[1];
          index += 1;
        } else {
          const body = [trimmed.slice(2)];
          index += 1;
          while (index < lines.length && !/\$\$\s*$/.test(lines[index])) body.push(lines[index++]);
          if (index < lines.length) body.push(lines[index++].replace(/\$\$\s*$/, ""));
          tex = body.join("\n");
        }
        if (tex.trim()) html += '<pre><code class="language-math">' + escapeHtml(tex.trim()) + "</code></pre>";
        continue;
      }
      const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
      if (heading) {
        flush();
        const level = Math.min(6, Math.max(1, heading[1].length - ctx.shift));
        html += "<h" + level + ">" + markdownInlineHtml(heading[2] || "") + "</h" + level + ">";
        index += 1;
        continue;
      }
      // 下線の見出し(Setext)
      if (paragraph.length && /^ {0,3}(=+|-+) *$/.test(line)) {
        const level = Math.min(6, Math.max(1, (trimmed[0] === "=" ? 1 : 2) - ctx.shift));
        html += "<h" + level + ">" + markdownInlineHtml(mdJoinLines(paragraph)) + "</h" + level + ">";
        paragraph = [];
        index += 1;
        continue;
      }
      if (mdIsThematic(line)) {
        flush();
        html += "<hr>";
        index += 1;
        continue;
      }
      if (trimmed === MD_PAGEBREAK) {
        flush();
        html += '<monolio-md data-kind="pagebreak"></monolio-md>';
        index += 1;
        continue;
      }
      if (trimmed === MD_TOC_START) {
        flush();
        // 書き出しの目次(<!-- toc --> から <!-- /toc --> までの見出しのリンク)は目次のブロックに戻す。
        const end = lines.findIndex((item, at) => at > index && item.trim() === MD_TOC_END);
        html += '<monolio-md data-kind="toc"></monolio-md>';
        index = end > index ? end + 1 : index + 1;
        continue;
      }
      if (trimmed.startsWith("<!--")) {
        // ほかの注釈は Markdown でも見えないので読まない。
        flush();
        while (index < lines.length && !lines[index].includes("-->")) index += 1;
        index += 1;
        continue;
      }
      if (/^<details\b[^>]*>/i.test(trimmed)) {
        flush();
        const block = mdContainer(lines, index, "details");
        const open = /^\s*<details\b[^>]*\bopen\b/i.test(block.text);
        let inner = block.text.replace(/^\s*<details\b[^>]*>/i, "").replace(/<\/details\s*>\s*$/i, "");
        const summary = /^\s*<summary>([\s\S]*?)<\/summary>/i.exec(inner);
        if (summary) inner = inner.slice(summary[0].length);
        html += "<details" + (open ? " open" : "") + "><summary>" + markdownInlineHtml(mdJoinLines((summary?.[1] || "").split("\n"))) + "</summary>"
          + mdBlocksHtml(inner.split("\n"), ctx) + "</details>";
        index = block.next;
        continue;
      }
      if (/^<aside\b[^>]*>/i.test(trimmed)) {
        flush();
        const block = mdContainer(lines, index, "aside");
        const inner = block.text.replace(/^\s*<aside\b[^>]*>/i, "").replace(/<\/aside\s*>\s*$/i, "");
        html += "<aside>" + mdBlocksHtml(inner.split("\n"), ctx) + "</aside>";
        index = block.next;
        continue;
      }
      if (/^ {0,3}>/.test(line)) {
        flush();
        const inner = [];
        while (index < lines.length) {
          const quoted = /^ {0,3}> ?(.*)$/.exec(lines[index]);
          if (quoted) inner.push(quoted[1]);
          else if (lines[index].trim() && inner.length && inner[inner.length - 1].trim() && !mdStartsBlock(lines[index])) inner.push(lines[index].trim());
          else break;
          index += 1;
        }
        // > [!NOTE] などと「> 絵文字 文」は呼び出し(書き出しの逆)。
        const alert = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(inner[0] || "");
        if (alert) {
          inner.shift();
          inner[0] = MD_ALERT_ICONS[alert[1].toUpperCase()] + " " + (inner[0] || "");
        }
        const first = inner.find((item) => item.trim()) || "";
        const icon = /^\s*(\S+)(\s|$)/.exec(first)?.[1] || "";
        html += (isCalloutIcon(icon) ? "<aside>" : "<blockquote>") + mdBlocksHtml(inner, ctx) + (isCalloutIcon(icon) ? "</aside>" : "</blockquote>");
        continue;
      }
      if (trimmed.includes("|") && index + 1 < lines.length && MD_TABLE_DELIMITER.test(lines[index + 1]) && lines[index + 1].includes("-")) {
        const header = mdSplitRow(line);
        if (header.length === mdSplitRow(lines[index + 1]).length) {
          flush();
          const width = header.length;
          const row = (cells, tag) => "<tr>" + Array.from({ length: width }, (_, c) => "<" + tag + ">" + markdownInlineHtml(cells[c] ?? "") + "</" + tag + ">").join("") + "</tr>";
          let table = "<table><thead>" + row(header, "th") + "</thead><tbody>";
          index += 2;
          while (index < lines.length && lines[index].trim() && lines[index].includes("|") && !mdStartsBlock(lines[index])) table += row(mdSplitRow(lines[index++]), "td");
          html += table + "</tbody></table>";
          continue;
        }
      }
      const marker = mdListMarker(line);
      if (marker && marker.indent <= 3 && (!paragraph.length || (!marker.empty && (!marker.ordered || marker.start === 1)))) {
        flush();
        const items = [];
        let content = marker.content;
        while (index < lines.length) {
          const item = mdListMarker(lines[index]);
          if (!item || item.ordered !== marker.ordered || item.mark !== marker.mark || item.indent >= content) break;
          content = item.content;
          const body = [lines[index].slice(Math.min(content, lines[index].length))];
          index += 1;
          while (index < lines.length) {
            const next = lines[index];
            if (!next.trim()) {
              let ahead = index;
              while (ahead < lines.length && !lines[ahead].trim()) ahead += 1;
              if (ahead < lines.length && mdIndentOf(lines[ahead]) >= content) {
                while (index < ahead) {
                  body.push("");
                  index += 1;
                }
                continue;
              }
              break;
            }
            if (mdIndentOf(next) >= content) body.push(next.slice(content));
            else if (body[body.length - 1].trim() && !mdListMarker(next) && !mdStartsBlock(next)) body.push(next.trim());
            else break;
            index += 1;
          }
          items.push(body);
          // 項目の間の空行は飛ばして、同じリストの次の項目へ。
          let ahead = index;
          while (ahead < lines.length && !lines[ahead].trim()) ahead += 1;
          const following = ahead < lines.length ? mdListMarker(lines[ahead]) : null;
          if (!following || following.ordered !== marker.ordered || following.mark !== marker.mark || following.indent >= content) break;
          index = ahead;
        }
        const tag = marker.ordered ? "ol" : "ul";
        html += "<" + tag + ">" + items.map((body) => "<li>" + mdBlocksHtml(body, ctx) + "</li>").join("") + "</" + tag + ">";
        continue;
      }
      if (paragraph.length && mdStartsBlock(line)) flush();
      paragraph.push(line);
      index += 1;
    }
    flush();
    return html;
  }

  // Markdown の文字 → ページの並び [{ title, html }]。html はブロックに分ける前の HTML(app.js の blocksFromPastedHtml が分ける)。
  // ページへのリンク・改ページ・目次は <monolio-md data-kind="…"> の目印にする(読み込みの時だけ、ブロックに戻す)。
  // ファイルが「# 」の見出しで始まるときは「# 」ごとのページ(題名はその見出し)に分け、中の見出しを1段上げる。そうでなければ
  // 1ページ(題名は fallbackTitle。ファイル名)で、# → 見出し1 … ##### 以下 → 見出し5。先頭の YAML(--- … ---)はコードにする。
  function markdownToPages(source, fallbackTitle = "") {
    const lines = String(source ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/[\u0000\u0001]/g, "").split("\n").map(mdExpandTabs);
    let front = "";
    if (lines[0]?.trim() === "---") {
      const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
      if (end > 0) front = '<pre><code class="language-yaml">' + escapeHtml(lines.splice(0, end + 1).slice(1, -1).join("\n")) + "</code></pre>";
    }
    // 見出しの錨を、書き出しと同じ順(ファイルの上から。コードのフェンスの中は数えない)で作る。
    const slug = markdownSlugger();
    const headings = [];
    let fence = null;
    lines.forEach((line, index) => {
      const open = mdFenceOpen(line);
      if (fence) {
        if (open && open.fence[0] === fence[0] && open.fence.length >= fence.length && !open.info) fence = null;
        return;
      }
      if (open) {
        fence = open.fence;
        return;
      }
      const heading = /^\s*(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
      if (heading) headings.push({ index, level: heading[1].length, top: mdIndentOf(line) <= 3, text: heading[2] || "", slug: slug(markdownInlineText(heading[2] || "")) });
    });
    const firstLine = lines.findIndex((line) => line.trim());
    const titles = headings.filter((heading) => heading.level === 1 && heading.top);
    if (!titles.length || titles[0].index !== firstLine) {
      return [{ title: String(fallbackTitle || "").trim() || "Untitled", html: front + mdBlocksHtml(lines, { shift: 0, pageSlugs: null }) }];
    }
    const pageSlugs = new Map();
    titles.forEach((heading, index) => { if (!pageSlugs.has(heading.slug)) pageSlugs.set(heading.slug, index); });
    return titles.map((heading, index) => {
      const end = index + 1 < titles.length ? titles[index + 1].index : lines.length;
      return {
        title: markdownInlineText(heading.text).trim() || "Untitled",
        html: (index === 0 ? front : "") + mdBlocksHtml(lines.slice(heading.index + 1, end), { shift: 1, pageSlugs }),
      };
    });
  }

  return {
    FORMAT,
    VERSION,
    APP_VERSION,
    documentToMarkdown,
    markdownToPages,
    markdownInlineHtml,
    CHUNK_SIZE,
    RICH_TEXT_BLOCK_TYPES,
    COLOR_PALETTE,
    normalizeBlockColor,
    blockColorOf,
    CALLOUT_DEFAULT_ICON,
    CALLOUT_ICONS,
    CODE_LANGUAGES,
    CODE_PLAIN_LABEL,
    CODE_TOKEN_KINDS,
    codeLanguageId,
    codeLanguageOf,
    codeLanguageLabel,
    codeTokens,
    highlightedCodeHtml,
    isCalloutIcon,
    calloutIcon,
    buildPortableHtml,
    parsePortableHtml,
    documentFromWrittenManifest,
    normalizeSuggestions,
    normalizeTrash,
    trashOf,
    compareFormatVersions,
    sanitizeImportedContent,
    isSafeId,
    retargetChartTables,
    renderPortableBlocks,
    renderInlineMarkdown,
    escapeHtml,
    cssFontFamilyValue,
    sanitizeInlineHtml,
    inlineMathSource,
    inlineCodeSource,
    FONT_FAMILY_SENTINEL,
    cssFontFamilyName,
    PAGE_LINK_ICON_SVG,
    iconSvg,
    iconMaskUrl,
    figureNumbers,
    headingNumbers,
    headingNumbersOn,
    DOCUMENT_FONT_STYLES,
    DOCUMENT_FONT_STACKS,
    normalizeDocumentSettings,
    documentFontStyle,
    documentFontStack,
    smallTextOn,
    PAGE_COVER_HEIGHT,
    isImageAttachment,
    pageIconOf,
    pageCoverOf,
    clampCoverPosition,
    normalizePageAppearance,
    numberedHeadingLevel,
    referenceTargets,
    resolveReference,
    refKindOf,
    REF_KIND_BLOCK,
    blockLinkLabel,
    blockLinkTargetIds,
    figureKind,
    captionText,
    derivePageTree,
    pageSubtreeIds,
    pagesInTreeOrder,
    pagesInReadingOrder,
    pageChildrenMap,
    pagesReachableFromFirst,
    createPageHistory,
    documentTitleOf,
    pageTitleOf,
    queryRank,
    rankByQuery,
    isIsoDate,
    dateMentionText,
    isoDateOf,
    parseDateQuery,
    addDaysIso,
    fileToAttachment,
    verifyDocument,
    repairAttachmentRecords,
    verifyAttachment,
    joinChunks,
    imageDisplayUrl,
    videoDisplayUrl,
    videoType,
    audioDisplayUrl,
    isAudioAttachment,
    attachmentView,
    isPdfAttachment,
    attachmentWidth,
    pdfReadHeight,
    PDF_VIEW_HASH,
    pdfDisplayUrl,
    pdfViewerAvailable,
    pdfUnavailableText,
    unplayableVideoText,
    attachZoomPan,
    svgNaturalSize,
    numberedListMarkers,
    numberedListInfo,
    NUMBERED_LIST_STYLES,
    MAX_INDENT,
    clampIndent,
    MAX_COLUMNS,
    columnRun,
    formatBytes,
    safeFilename,
    sanitizeChartSvg,
    sanitizeMermaidSvg,
    MERMAID_SVG_ID_PREFIX,
    safeCssColor,
    safeLinkHref,
    parseTableNumberText,
    formatNumberValue,
    roundHalfAwayFromZero,
    TABLE_CELL_ALIGNS,
    tableCellAlign,
    normalizeNumberFormat,
    formatTableNumber,
    shownDecimals,
    normalizeTableFilter,
    normalizeTableRowHeights,
    TABLE_MIN_ROW_HEIGHT,
    tableDataFirstRow,
    tableHasVerticalMerge,
    tableRowFilter,
    tableRowFilteredOut,
    normalizeTableFilterCondition,
    normalizeTableFilterJoin,
    tableFilterConditionTest,
    parseTableDateText,
    TABLE_FILTER_OPS,
    TABLE_FILTER_VALUELESS_OPS,
    tableFilterNote,
    DB_COLUMN_TYPES,
    DB_TIME_TYPES,
    DB_STATUS_GROUPS,
    dbColumnType,
    dbMultiValues,
    dbStatusGroup,
    dbStatusRank,
    dbUrlHref,
    dbEmailHref,
    dbPhoneHref,
    dbTimeText,
    blockIdOfLinkHref,
    normalizeTableGroupBy,
    tableGroupPlan,
    tableGroupLabelHtml,
    dbSelectColor,
    dbChecked,
    safeDbLinkHref,
    dbCellLinkHref,
    pageLinkHref,
    isPageLinkHref,
    pageIdOfLinkHref,
    dbCellHtml,
    htmlDocumentTitle,
    texToMathML,
    pageAncestors,
  };
})();
