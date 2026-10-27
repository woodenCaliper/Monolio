// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// 機能見本(docs/sample/monolio-features.html と monolio-features.en.html)を作り直すスクリプト。
//   node sample/build-sample.mjs                日本語版と英語版の両方を作る
//   node sample/build-sample.mjs --lang=ja      日本語版だけ
//   node sample/build-sample.mjs --lang=en      英語版だけ(文は sample/sample-strings.mjs の表で日本語から置き換える)
//   --out=<ファイル>  書き出し先を変える(--lang を付けたとき)   --shots=<フォルダ>  画面の写真を出す   --dump=<ファイル>  日本語の文の一覧を書き出して終わる
// アプリ(editor-pwa)を自前のサーバー(ポート 4177)で開き、下の文書を読み込ませてから、アプリの保存(Ctrl+S)と同じ経路で
// 保存HTMLを書き出す(グラフの絵・表の式の計算結果は、アプリが描いたものがそのまま入る)。
// 機能を足したら、下の文書にその機能を使う見本を足して、日本語版・英語版の両方を作り直す(CLAUDE.md「機能見本」)。
// 文の持ち方: 下の文書は日本語で書く(日本語の表)。英語版は sample/sample-strings.mjs の EN(日本語の文 → 英語の文の表)で、
// 文書の中の文字列(文・表のセル・グラフと図のコード・題名・添付の名前など)を丸ごと置き換えて作る。英語の表に無い日本語の文が残ったら警告する。
// 日本語の文を足したら、EN にも英語を足す(足りないと警告が出る)。
import { chromium } from "playwright-core";
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromePath, waitForServer } from "../editor-pwa/tests/lib.mjs";
import { EN } from "./sample-strings.mjs";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const flag = (name) => process.argv.find((a) => a.startsWith("--" + name + "="))?.slice(name.length + 3) || "";
const LANG = flag("lang");
if (!LANG) {
  // 両方作る: 同じポートを使うので、順に別のプロセスで流す。
  for (const lang of ["ja", "en"]) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--lang=" + lang, ...process.argv.slice(2)], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status || 1);
  }
  process.exit(0);
}
if (LANG !== "ja" && LANG !== "en") throw new Error("--lang は ja か en");
const EN_MODE = LANG === "en";
const OUTFILE = flag("out") || fileURLToPath(new URL(EN_MODE ? "../docs/sample/monolio-features.en.html" : "../docs/sample/monolio-features.html", import.meta.url));
const SHOTDIR = flag("shots");
const DUMPFILE = flag("dump");
const shot = (name) => SHOTDIR + "/" + name + (EN_MODE ? ".en" : "") + ".png";
const tr = (text) => (EN_MODE ? (EN[text] ?? text) : text); // 文書の外の文字(キャンバスに描く文字)
const PORT = 4177;
const server = spawn(process.execPath, ["editor-pwa/server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } });
await waitForServer(server);
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://127.0.0.1:" + PORT + "/");
await page.waitForSelector("#blocks .block-content");

// 動画の見本(v273)。毎回作ると中身が変わるので、一度作った短い webm(sample/sample-video.webm)を使う。
const sampleVideo = (await readFile(fileURLToPath(new URL("./sample-video.webm", import.meta.url)))).toString("base64");
// PDF の見本(v277)。一度作った試験成績書(sample/sample-report.pdf。2ページ)を使う。
const samplePdf = (await readFile(fileURLToPath(new URL("./sample-report.pdf", import.meta.url)))).toString("base64");
const built = await page.evaluate(async ([videoBase64, pdfBase64, T, dict, dumpMode]) => {
  const fmt = window.SingleHtmlFormat;
  // 画像(図): canvas で簡単な構成図を描いて PNG にする。
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 240;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 640, 240);
  const box = (x, label, color) => {
    g.fillStyle = color; g.fillRect(x, 80, 150, 80);
    g.fillStyle = "#ffffff"; g.font = "bold 20px sans-serif"; g.textAlign = "center"; g.fillText(label, x + 75, 127);
  };
  box(30, T.sensor, "#2f6fb2"); box(245, T.board, "#16835f"); box(460, T.motor, "#c1512f");
  g.strokeStyle = "#555"; g.lineWidth = 3;
  [[180, 245], [395, 460]].forEach(([a, b]) => { g.beginPath(); g.moveTo(a, 120); g.lineTo(b - 6, 120); g.stroke(); g.beginPath(); g.moveTo(b, 120); g.lineTo(b - 12, 112); g.lineTo(b - 12, 128); g.fill(); });
  g.fillStyle = "#333"; g.font = "16px sans-serif"; g.textAlign = "center"; g.fillText(T.caption, 320, 210);
  const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const image = await fmt.fileToAttachment(new File([png], "system.png", { type: "image/png" }), "att-image");
  const csv = T.csvHead + "\n0,25.0,1.2\n10,31.5,1.4\n20,38.2,1.5\n";
  const file = await fmt.fileToAttachment(new File([csv], "measurement.csv", { type: "text/csv" }), "att-csv");
  const videoBytes = Uint8Array.from(atob(videoBase64), (ch) => ch.charCodeAt(0));
  const video = await fmt.fileToAttachment(new File([videoBytes], "試験の様子.webm", { type: "video/webm" }), "att-video");
  const pdfBytes = Uint8Array.from(atob(pdfBase64), (ch) => ch.charCodeAt(0));
  const pdf = await fmt.fileToAttachment(new File([pdfBytes], "試験成績書.pdf", { type: "application/pdf" }), "att-pdf");
  // 音声の見本(Issue #164 の音声)。毎回同じ中身になるよう、ここで決まった音(ド・ミ・ソ、1.5 秒、8 kHz・8 ビットの WAV)を作る。
  const rate = 8000;
  const samples = Uint8Array.from({ length: rate * 1.5 }, (_, i) => {
    const freq = [523.25, 659.25, 783.99][Math.min(2, Math.floor(i / (rate * 0.5)))];
    return Math.round(128 + 60 * Math.sin(2 * Math.PI * freq * i / rate) * Math.min(1, (rate * 1.5 - i) / 400));
  });
  const wav = new Uint8Array(44 + samples.length);
  const wavView = new DataView(wav.buffer);
  const ascii = (offset, text) => [...text].forEach((ch, k) => wavView.setUint8(offset + k, ch.charCodeAt(0)));
  ascii(0, "RIFF"); wavView.setUint32(4, 36 + samples.length, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  wavView.setUint32(16, 16, true); wavView.setUint16(20, 1, true); wavView.setUint16(22, 1, true); wavView.setUint32(24, rate, true);
  wavView.setUint32(28, rate, true); wavView.setUint16(32, 1, true); wavView.setUint16(34, 8, true); ascii(36, "data"); wavView.setUint32(40, samples.length, true);
  wav.set(samples, 44);
  const audio = await fmt.fileToAttachment(new File([wav], "確認音.wav", { type: "audio/wav" }), "att-audio");

  const c = (...values) => values.map((text) => ({ text }));
  const blocks = [
    { id: "b-intro", type: "paragraph", text: "Monolio の主な機能を1つの文書にまとめた見本です。このファイル1つに、表・グラフ・数式・図(Mermaid)・画像・添付・複数ページがすべて入っています。" },
    { id: "b-toc", type: "toc" },

    { id: "h-text", type: "heading1", text: "文字の書式" },
    { id: "b-inline", type: "paragraph", html: '通常の文字、<b>太字</b>、<i>斜体</i>、<u>下線</u>、<s>取り消し線</s>、<span style="color: rgb(193, 81, 47);">文字色</span>、<span style="background-color: rgb(255, 243, 163);">背景色(マーカー)</span>、<span style="font-size: 20px;">大きな文字</span>、<span style="font-family: serif;">書体の変更(Serif)</span>。' },
    { id: "b-inline2", type: "paragraph", text: "インラインコード `npm run pwa:test` と、文中の数式 $$E = mc^2$$ や $$\\sqrt{a^2 + b^2}$$ も書けます。" },
    { id: "b-link", type: "paragraph", text: "リンク: Monolio のリポジトリ。URL を貼り付けるとリンクになります: https://example.com/", html: 'リンク: <a href="https://github.com/woodenCaliper/Monolio">Monolio のリポジトリ</a>。URL を貼り付けるとリンクになります: <a href="https://example.com/">https://example.com/</a>' },
    { id: "b-mention", type: "paragraph", text: "文中のページへのリンク: 「@」でページを選ぶと入ります。例: 図の一覧は 図(Mermaid)の全種類 、付録は 付録 を参照。", html: '文中のページへのリンク: 「@」でページを選ぶと入ります。例: 図の一覧は <span class="figure-ref" data-ref="P-mermaid">図(Mermaid)の全種類</span> 、付録は <span class="figure-ref" data-ref="P-appendix">付録</span> を参照。' },
    // ブロックへのリンク(Issue #176。形式 0.8.20)。つまみのメニューの「ブロックへのリンクをコピー」で取り、文中に貼ると入る。
    // 印は行き先のブロックの文字を写し、押すとそのブロックへ移って光る(別のページでも)。リンクされたページの題名の横には被リンクの数(Issue #188)。
    { id: "b-blocklink", type: "paragraph", text: "ブロックへのリンク: つまみのメニューの「ブロックへのリンクをコピー」で取って文中に貼ります。例: 電源電圧: 24 V ± 10% 、ヘッダー行・ヘッダー列・セルの結合・セルの色・式(SUM・四… 。リンクされたページ(仕様の詳細)の題名の横に、被リンクの数が出ます。",
      html: 'ブロックへのリンク: つまみのメニューの「ブロックへのリンクをコピー」で取って文中に貼ります。例: <span class="figure-ref" data-ref="s3" data-ref-kind="block">電源電圧: 24 V ± 10%</span> 、<span class="figure-ref" data-ref="b-tabledesc" data-ref-kind="block">ヘッダー行・ヘッダー列・セルの結合・セルの色・式(SUM・四…</span> 。リンクされたページ(仕様の詳細)の題名の横に、被リンクの数が出ます。' },
    // 文中の日付(Issue #173。形式 0.8.20)と絵文字(Issue #175)。日付は「@今日」「@2026-11-30」などで入る印で、押すと日付を選び直せる。
    { id: "b-date", type: "paragraph", text: "文中の日付: 「@今日」「@明日」「@2026-11-30」「@11/30」で入ります(押すと日付を選び直せる)。例: 試作の締切は 2026年11月30日 、評価会は 2026年12月10日 。",
      html: '文中の日付: 「@今日」「@明日」「@2026-11-30」「@11/30」で入ります(押すと日付を選び直せる)。例: 試作の締切は <span class="date-mention" data-date="2026-11-30">2026年11月30日</span> 、評価会は <span class="date-mention" data-date="2026-12-10">2026年12月10日</span> 。' },
    { id: "b-emoji", type: "paragraph", text: "絵文字: 「:」に続けて英語の名前を打つと候補が出ます(「:smile」→ 😄、「:warning」→ ⚠️、「:white_check_mark」→ ✅)。日本語の呼び名(「:笑」「:注意」)でも出ます。" },
    { id: "b-zoom", type: "paragraph", text: "拡大表示: 画像・Mermaid の図・グラフをダブルクリックすると画面いっぱいに出ます。ホイールで拡大・縮小、ドラッグで見る位置を動かし、ダブルクリックで「画面に収まる大きさ ⇔ 100%」を切り替えます(保存HTMLでも同じ)。" },
    { id: "b-foreign-paste", type: "paragraph", text: "ほかのアプリからの貼り付け: Notion でブロックごとコピーして貼ると、見出し・箇条書き・ToDo・表・トグルなどがブロックのまま入ります(ブラウザのページ・Google ドキュメントの見出しやリストも同じ)。" },
    // 文字数(Issue #189)。
    { id: "b-count", type: "paragraph", text: "文字数: Edit → 文字数… で、このページ・選んでいる文字・選んだブロックの文字数が出ます(日本語も1字ずつ。改行は数えず、空白を除いた数も並べます)。ブロックのつまみのメニューの下にも、そのブロックの文字数が出ます。" },
    // Markdown の書き出し・読み込み(Issue #192)。
    { id: "b-markdown", type: "paragraph", text: "Markdown: File → Markdown に書き出す で、全ページを1つの .md に書き出せます(各ページは「# 題名」、表の式は計算した値、トグルは <details>、画像・添付は名前だけ)。File → Markdown を読み込む… で、.md を新しいページとして取り込めます(「# 」で始まるファイルは「# 」ごとのページに分かれます)。" },
    { id: "h-head", type: "heading2", text: "見出しは5段階" },
    // 見出しに番号(v218)。この見本は View → 見出しに番号 を入にしてある(下の doc.settings)。
    { id: "b-headnum", type: "paragraph", text: "View → 見出しに番号 を入にすると、見出し1〜3に 1 / 1.1 / 1.1.1 の番号が文書全体(ページをまたいで)の通しで付きます(この見本は入)。番号は見出しの文字ではないので、並べ替えや見出しの段を変えると自動で付け直されます。見出し4・5には付きません。" },
    { id: "b-h3", type: "heading3", text: "見出し3" },
    { id: "b-h4", type: "heading4", text: "見出し4" },
    { id: "b-h5", type: "heading5", text: "見出し5" },

    { id: "h-list", type: "heading1", text: "リストとチェック" },
    { id: "l1", type: "bullet", text: "箇条書き" },
    { id: "l2", type: "bullet", text: "入れ子の箇条書き", indent: 1 },
    { id: "l3", type: "bullet", text: "さらに入れ子", indent: 2 },
    { id: "n1", type: "numbered", text: "番号付きリスト" },
    { id: "n2", type: "numbered", text: "階層番号(1.1)", indent: 1 },
    { id: "n3", type: "numbered", text: "階層番号(1.2)", indent: 1 },
    { id: "n4", type: "numbered", text: "番号付きリスト(2)" },
    // 番号の形(Issue #171)。つまみのメニュー「番号の形」で選ぶ。続いている同じ段の項目すべてに書く(listStyle)。
    { id: "b-liststyle", type: "paragraph", text: "番号の形は、番号付きのブロックのつまみのメニュー「番号の形」で、1.1 の階層(上)・数字(1. 2.)・英字(a. b.)・ローマ数字(i. ii.)から選べます。数字にすると、入れ子の段は a. → i. の順になります(Notion と同じ)。" },
    { id: "n5", type: "numbered", text: "数字の形(1.)", listStyle: "decimal" },
    { id: "n6", type: "numbered", text: "入れ子は英字(a.)", indent: 1 },
    { id: "n7", type: "numbered", text: "さらに入れ子はローマ数字(i.)", indent: 2 },
    { id: "n8", type: "numbered", text: "入れ子の英字(b.)", indent: 1 },
    { id: "n9", type: "numbered", text: "数字の形(2.)", listStyle: "decimal" },
    { id: "t1", type: "todo", text: "完了した作業", checked: true },
    { id: "t2", type: "todo", text: "未完了の作業", checked: false },

    { id: "h-block", type: "heading1", text: "いろいろなブロック" },
    { id: "g1", type: "toggle", text: "トグル(クリックで開閉)", open: true },
    { id: "g1c", type: "paragraph", text: "トグルの中身。閉じると隠れます。", indent: 1 },
    { id: "g2", type: "toggleHeading2", text: "トグル見出し(閉じた状態)", open: false },
    { id: "g2c", type: "paragraph", text: "閉じたトグル見出しの中身。", indent: 1 },
    { id: "q1", type: "quote", text: "引用ブロック。仕様書の原文や、誰かの発言を引くときに使います。" },
    { id: "co1", type: "callout", text: "呼び出し(コールアウト)。「/呼び出し」で入ります。左の絵文字を押すと選び直せます。" },
    { id: "co2", type: "callout", text: "注意書きには ⚠️ と黄の背景。囲みの色はつまみのメニューの「色」で変えられます。", icon: "⚠️", color: "yellow_background" },
    { id: "bc1", type: "paragraph", text: "ブロックの色: つまみのメニューの「色」で、ブロック全体の文字の色(この段落は赤)か背景の色を付けられます(Notion と同じ 9 色)。", color: "red" },
    { id: "bc2", type: "bullet", text: "背景の色を付けた箇条書き(青の背景)", color: "blue_background" },
    { id: "bc3", type: "heading4", text: "緑の見出し(見出し4)", color: "green" },
    { id: "d1", type: "divider" },
    { id: "code1", type: "code", text: "// コードブロック(言語: JavaScript)\nfunction add(a, b) {\n  return a + b;\n}", language: "javascript" },
    // コードの言語と色分け(Issue #163)。言語はコードの右上(行に乗ると出る)で選ぶ。既定は書式なし(Plain text)。
    { id: "code-lang", type: "paragraph", text: "コードの言語と色分け: コードのブロックの右上に出る言語の名前を押すと、言語を選べます(JavaScript・Python・C/C++・Java・C#・Go・Rust・JSON・HTML・CSS・SQL・Bash・YAML・Markdown など)。「```python」と打っても言語が付きます。保存HTMLでも同じ色です。" },
    { id: "code-py", type: "code", text: "# Python\n@dataclass\nclass Part:\n    name: str\n    qty: int = 0\n\ndef total(parts):\n    \"\"\"在庫の合計\"\"\"\n    return sum(p.qty for p in parts if p.qty > 0)", language: "python" },
    { id: "code-sql", type: "code", text: "-- 出荷数の集計\nSELECT part_no, SUM(qty) AS total\nFROM shipments\nWHERE shipped_at >= '2026-01-01'\nGROUP BY part_no\nORDER BY total DESC;", language: "sql" },
    { id: "code-json", type: "code", text: "{\n  \"name\": \"Monolio\",\n  \"version\": 1.2,\n  \"offline\": true,\n  \"tags\": [\"doc\", \"html\"]\n}", language: "json" },
    { id: "code-plain", type: "code", text: "書式なし(Plain text)のコードは色を付けません。\nlog: 2026-10-26 12:00 ok" },
    { id: "colL", type: "paragraph", text: "段組み(左の列)。ブロックを横に並べられます。", columnGroup: "cols1", columnIndex: 0 },
    { id: "colR", type: "paragraph", text: "段組み(右の列)。", columnGroup: "cols1", columnIndex: 1 },
    // 段組みは 8 列まで(v262。#142。以前は 3 列まで)。
    { id: "col4a", type: "paragraph", text: "4列の段組み(1)", columnGroup: "cols4", columnIndex: 0 },
    { id: "col4b", type: "paragraph", text: "(2)", columnGroup: "cols4", columnIndex: 1 },
    { id: "col4c", type: "paragraph", text: "(3)", columnGroup: "cols4", columnIndex: 2 },
    { id: "col4d", type: "paragraph", text: "(4)。列は8列まで作れます", columnGroup: "cols4", columnIndex: 3 },
    // トグルの中の段組み(v256)。トグルを閉じると段組みも一緒に隠れる(保存HTMLでもトグルの中)。
    { id: "g3", type: "toggle", text: "トグルの中の段組み(閉じると段組みも隠れる)", open: true },
    { id: "g3l", type: "paragraph", text: "トグルの中の左の列", indent: 1, columnGroup: "cols2", columnIndex: 0 },
    { id: "g3r", type: "paragraph", text: "トグルの中の右の列", indent: 1, columnGroup: "cols2", columnIndex: 1 },
    { id: "g3c", type: "paragraph", text: "段組みの後ろも、トグルの中身です。", indent: 1 },

    { id: "h-table", type: "heading1", text: "計算できる表" },
    { id: "b-tabledesc", type: "paragraph", text: "ヘッダー行・ヘッダー列・セルの結合・セルの色・式(SUM・四則演算)を使っています。" },
    // 本文の中の図表の参照(v198)。「/参照」で入れる印。番号は表・図の題名の番号に追従する。
    // 見出しへの参照(v218)も同じ「/参照」で入れる。印は「番号 見出しの名前」で、番号・名前の変更に追従する(別のページの見出しも)。
    { id: "b-xref", type: "paragraph", text: "月別の売上は 表1 、温度と抵抗の関係は 図1 を参照(「/参照」で入れた印。押すとその表・図へ移る)。見出しも参照できます: グラフは 5 グラフ 、動作条件は 10 動作条件 を参照。",
      html: '月別の売上は <span class="figure-ref" data-ref="tbl-sales">表1</span> 、温度と抵抗の関係は <span class="figure-ref" data-ref="ch-scatter">図1</span> を参照(「/参照」で入れた印。押すとその表・図へ移る)。見出しも参照できます: グラフは <span class="figure-ref" data-ref="h-chart">5 グラフ</span> 、動作条件は <span class="figure-ref" data-ref="s2">10 動作条件</span> を参照。' },
    {
      id: "tbl-sales", type: "table", caption: "月別の売上(題名を付けた表には「表n:」の通し番号が付く)", tableHeader: true, tableHeaderColumn: true,
      rows: [
        c("月", "製品A", "製品B", "合計"),
        [{ text: "1月" }, { text: "120" }, { text: "80" }, { text: "=B2+C2" }],
        [{ text: "2月" }, { text: "150" }, { text: "95" }, { text: "=B3+C3" }],
        [{ text: "3月" }, { text: "170" }, { text: "130" }, { text: "=B4+C4" }],
        [{ text: "4月" }, { text: "160" }, { text: "140" }, { text: "=B5+C5" }],
        [{ text: "計" }, { text: "=SUM(B2:B5)" }, { text: "=SUM(C2:C5)" }, { text: "=SUM(D2:D5)", background: "#fff3a3" }],
      ],
    },
    {
      id: "tbl-merge", type: "table", tableHeader: true,
      rows: [
        c("区分", "機体", "最小", "最大"),
        [{ text: "温度 [℃]", rowSpan: 2 }, { text: "1号機" }, { text: "21.5" }, { text: "38.2", color: "#c1512f" }],
        // ふつうの表のセルのリンク(v269): 「2号機」は「仕様の詳細」ページへのリンク(セルに入って上のリンクのボタン)。
        [{ text: "温度 [℃]", covered: true }, { text: "2号機", link: "#page-P-spec" }, { text: "22.0" }, { text: "36.9" }],
        [{ text: "電流 [A]", rowSpan: 2 }, { text: "1号機" }, { text: "1.2" }, { text: "1.5" }],
        [{ text: "電流 [A]", covered: true }, { text: "2号機" }, { text: "1.1" }, { text: "1.4" }],
        [{ text: "備考: 2号機は冷却ファン付き(横の結合)\nセルの中の改行もそのまま見える", colSpan: 4, background: "#eef6ff" }, { text: "", covered: true }, { text: "", covered: true }, { text: "", covered: true }],
      ],
    },

    { id: "b-db", type: "paragraph", text: "表はデータベースにもできます(表の道具の帯の右端「データベース」)。列ごとに種類(文字・数・日付・選択肢・チェック・リンク)を付けると、選択肢は色の札、チェックは四角、リンクは別の文書の題名で見えます。リンクの行き先には、同じ文書のページも選べます(セルに入って「ページを選ぶ…」。Ctrl+クリックでそのページへ移る)。リンクはふつうの表のセルにも付けられます(セルに入って上のリンクのボタン。上の表の「2号機」)。" },
    {
      id: "tbl-db", type: "table", tableHeader: true,
      database: { headerBefore: true, columns: [{ type: "text" }, { type: "select" }, { type: "date" }, { type: "number" }, { type: "check" }, { type: "link" }] },
      rows: [
        c("要求", "状態", "期限", "工数", "済", "資料"),
        [{ text: "常温で液体であること" }, { text: "対応中" }, { text: "2026-11-01" }, { text: "3" }, { text: "" }, { text: "この見本(自分自身)", link: "monolio-features.html" }],
        [{ text: "長期で変質しないこと" }, { text: "未対応" }, { text: "2026-12-15" }, { text: "5" }, { text: "" }, { text: "Monolio のリポジトリ", link: "https://github.com/woodenCaliper/Monolio" }],
        [{ text: "酸化膜を除去できること" }, { text: "完了" }, { text: "2026-10-20" }, { text: "2" }, { text: "✓" }, { text: "仕様の詳細", link: "#page-P-spec" }],
      ],
    },

    // 表計算の基本(v232): 配置・数の見せ方・IF・COUNTIF・ROUND・$ の絶対参照・絞り込み(「区分」で「欠席」を隠している)。
    { id: "b-excel", type: "paragraph", text: "表計算の基本: 文字の配置(左・中央・右)、数の見せ方(桁区切り・パーセント・小数の桁)、IF・COUNTIF・ROUND などの関数、$ の付いた絶対参照、並べ替え・絞り込み(表の道具の帯)。この表は「区分」で絞り込んで「欠席」の行を隠しています。帯の右端の「全画面」で、表を画面の幅いっぱいに広げて編集できます。見出しの行は、行の高さを変えて高くしています。" },
    {
      id: "tbl-excel", type: "table", tableHeader: true,
      tableFilter: [{ column: 1, hide: ["欠席"] }],
      // 行の高さ(v238): 見出しの行だけ高くしている(行の番号の下の端をドラッグで変えられる)。
      tableRowHeights: [48, 0, 0, 0, 0, 0, 0],
      rows: [
        c("名前", "区分", "点", "判定", "得点率", "金額"),
        ...[["佐藤", "出席", "72", "1250000"], ["鈴木", "出席", "45", "980000"], ["高橋", "欠席", "", "0"], ["田中", "出席", "88", "1530000"]].map(([name, kind, point, money], i) => [
          { text: name }, { text: kind, align: "center" }, { text: point, align: "right" },
          { text: '=IF(C' + (i + 2) + '="","―",IF(C' + (i + 2) + '>=60,"合格","不合格"))', align: "center" },
          { text: "=C" + (i + 2) + "/$C$7", numberFormat: { percent: true, decimals: 1 } },
          { text: money, align: "right", numberFormat: { comma: true } },
        ]),
        [{ text: "合格の人数" }, { text: "" }, { text: '=COUNTIF(D2:D5,"合格")', align: "right" }, { text: "" }, { text: "=ROUND(AVERAGE(C2:C5)/$C$7,3)", numberFormat: { percent: true, decimals: 1 } }, { text: "=SUM(F2:F5)", align: "right", numberFormat: { comma: true } }],
        [{ text: "満点" }, { text: "" }, { text: "100", align: "right" }, { text: "" }, { text: "" }, { text: "" }],
      ],
    },

    // 絞り込みの条件と AND・OR(Issue #180): 列ごとに条件(数の ≥・範囲、文字の「含む」、日付の「より前」など)を付け、列どうしを
    // AND(すべての列に合う)か OR(どれかの列に合う)で組める。この表は「工数 ≥ 5」または「期限が 2026-11-01 より前」の行だけを見せている。
    { id: "b-filter-cond", type: "paragraph", text: "絞り込みには条件も使えます(列のセルに入って、表の道具の帯の「絞り込み」→「条件」)。数の列は = ≠ > ≥ < ≤ と範囲、文字の列は「含む」「で始まる」など、日付の列は「より前」「より後」「この日」。いくつかの列に付けた条件は、「すべての列に合う行(AND)」か「どれかの列に合う行(OR)」で組めます。この表は「工数 ≥ 5」または「期限が 2026-11-01 より前」の行だけを見せています(隠した行も合計には入ります)。" },
    {
      id: "tbl-filter-cond", type: "table", tableHeader: true,
      database: { headerBefore: true, columns: [{ type: "text" }, { type: "select" }, { type: "date" }, { type: "number" }] },
      tableFilter: [{ column: 2, condition: { op: "lt", value: "2026-11-01" } }, { column: 3, condition: { op: "ge", value: "5" } }],
      tableFilterJoin: "or",
      rows: [
        c("作業", "担当", "期限", "工数"),
        c("回路図の見直し", "設計", "2026-10-20", "2"),
        c("筐体の試作", "製造", "2026-11-20", "8"),
        c("取扱説明書", "文書", "2026-12-10", "3"),
        c("部品の発注", "購買", "2026-10-28", "1"),
        c("耐久試験", "評価", "2026-12-01", "5"),
        c("出荷前検査", "評価", "2026-12-20", "2"),
        c("合計", "", "", "=SUM(D2:D7)"),
      ],
    },

    // データベースの列の種類(Issue #178)とグループ分け(Issue #179)。複数選択・状態・URL・メール・電話・ファイル(この文書の添付)・作成日時・更新日時。
    // 表は「状態」でまとめ、「完了」の組を畳んでいる(見せ方だけ。行の順と合計の式は変わらない)。
    { id: "b-db-more", type: "paragraph", text: "データベースの列には、複数選択(「,」で区切った名前ごとの札)・状態(未着手・進行中・完了の組の色)・URL・メール・電話(押すと開く。読めない形は波線)・ファイル(この文書の添付へのリンク)・作成日時と更新日時(行を足す・変えると自動で入る)も使えます。表の道具の帯の「グループ」で、列の値ごとに行をまとめられます(組の頭を押すと畳む)。この表は「状態」でまとめて、「完了」の組を畳んでいます。" },
    {
      id: "tbl-db-more", type: "table", tableHeader: true,
      database: { headerBefore: true, columns: ["text", "multi", "status", "url", "email", "phone", "file", "created", "edited", "number"].map((type) => ({ type })) },
      tableGroupBy: { column: 2, collapsed: ["完了"] },
      rows: [
        c("作業", "タグ", "状態", "URL", "担当のメール", "電話", "資料", "作成日時", "更新日時", "工数"),
        [{ text: "仕様の確認" }, { text: "設計, 重要" }, { text: "進行中" }, { text: "https://github.com/woodenCaliper/Monolio" }, { text: "sato@example.com" }, { text: "03-1234-5678" }, { text: "measurement.csv", link: "#block-file1" }, { text: "2026-10-20 09:00" }, { text: "2026-10-25 17:40" }, { text: "3" }],
        [{ text: "部品の発注" }, { text: "購買" }, { text: "未着手" }, { text: "example.com/parts" }, { text: "buyer@example.com" }, { text: "090-0000-1111" }, { text: "" }, { text: "2026-10-21 10:15" }, { text: "2026-10-21 10:15" }, { text: "1" }],
        [{ text: "試験成績書" }, { text: "試験, 文書" }, { text: "完了" }, { text: "" }, { text: "lab@example.com" }, { text: "+81 3 9999 0000" }, { text: "試験成績書.pdf", link: "#block-pdf1" }, { text: "2026-10-18 13:30" }, { text: "2026-10-24 18:05" }, { text: "5" }],
        [{ text: "治具の改修" }, { text: "試験" }, { text: "確認中" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "2026-10-23 11:00" }, { text: "2026-10-26 09:20" }, { text: "2" }],
        [{ text: "合計" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "=SUM(J2:J5)" }],
      ],
    },

    // 表を見せる高さ(v235): 長い表は、下の端のつまみで見せる高さを決めると、表の中でスクロールする(見出しの行は上に残る。印刷では全行)。
    { id: "b-tall", type: "paragraph", text: "長い表は、表の下の端のつまみを上下にドラッグすると見せる高さを決められます(超える分は表の中でスクロールし、見出しの行は上に残ります。ダブルクリックで全部見せる。印刷では全行)。この表は 30 行を、およそ 8 行ぶんの高さで見せています。" },
    {
      id: "tbl-tall", type: "table", caption: "点検の記録(見せる高さを決めた表)", tableHeader: true, viewHeight: 300,
      rows: [
        c("No", "点検日", "項目", "結果"),
        ...Array.from({ length: 30 }, (_, i) => c(String(i + 1), "2026-10-" + String((i % 28) + 1).padStart(2, "0"), ["電源", "冷却", "配線", "表示"][i % 4], i % 7 === 3 ? "要確認" : "良")),
      ],
    },

    { id: "h-chart", type: "heading1", text: "グラフ" },
    { id: "b-chartdesc", type: "paragraph", text: "グラフは表の値から描かれ、表を書き換えると描き直されます(右の設定欄でも、コードでも編集できます)。" },
    { id: "ch-bar", type: "chart", text: 'table(id="tbl-sales")\nbar(A2:A5, B2:B5, label="製品A", values=True)\nbar(A2:A5, C2:C5, label="製品B", values=True)\ntitle("月別の売上(縦棒)")\nylabel("台数")' },
    { id: "ch-pie", type: "chart", text: 'table(id="tbl-sales")\npie(A2:A5, D2:D5, autopct=True)\ntitle("月別の構成比(円)")' },
    { id: "tbl-meas", type: "table", tableHeader: true, rows: [c("温度", "抵抗A", "抵抗B"), c("10", "102", "98"), c("20", "108", "101"), c("30", "113", "109"), c("40", "121", "112"), c("50", "126", "119"), c("60", "131", "122")] },
    { id: "ch-scatter", type: "chart", caption: "温度と抵抗の関係(図の題名は図の下)", text: 'scatter(A2:A7, B2:B7, label="抵抗A", trendline=True, trendline_eq=True, trendline_r2=True)\nscatter(A2:A7, C2:C7, label="抵抗B", trendline=True, trendline_eq=True, trendline_r2=True)\ntitle("温度と抵抗(散布図+近似直線)")\nxlabel("温度 [℃]")\nylabel("抵抗 [Ω]")' },
    { id: "tbl-growth", type: "table", tableHeader: true, rows: [c("時間", "増殖"), c("1", "2.1"), c("2", "3.9"), c("3", "8.2"), c("4", "15.8"), c("5", "33"), c("6", "61"), c("7", "130"), c("8", "250")] },
    { id: "ch-plot", type: "chart", text: 'plot(A2:A9, B2:B9, label="増殖", trendline="exp", trendline_eq=True, trendline_r2=True)\ntitle("増殖の推移(折れ線+指数近似)")\nxlabel("時間 [h]")\ngrid("both")' },
    { id: "ch-barh", type: "chart", text: 'table(id="tbl-sales")\nbarh(A2:A5, D2:D5, values=True, color="C2")\ntitle("月別の合計(横棒)")' },
    { id: "tbl-hist", type: "table", rows: [c("10.2"), c("10.5"), c("9.8"), c("10.1"), c("10.0"), c("9.7"), c("10.3"), c("10.4"), c("9.9"), c("10.0"), c("10.6"), c("9.6"), c("10.2"), c("10.1"), c("9.9"), c("10.0")] },
    { id: "ch-hist", type: "chart", text: 'hist(A1:A16, bins=6)\ntitle("寸法のばらつき(ヒストグラム)")\nxlabel("寸法 [mm]")' },

    { id: "h-math", type: "heading1", text: "数式(TeX)" },
    { id: "m1", type: "math", text: "\\int_0^1 x^2\\,dx = \\frac{1}{3}" },
    { id: "m2", type: "math", text: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\begin{pmatrix} x \\\\ y \\end{pmatrix} = \\begin{pmatrix} ax + by \\\\ cx + dy \\end{pmatrix}" },
    { id: "m3", type: "math", text: "\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}" },
    { id: "m4", type: "math", text: "\\underbrace{a + b + c}_{\\text{3つの和}} = \\overbrace{x + y}^{n}" },

    { id: "h-mermaid", type: "heading1", text: "図(Mermaid)" },
    { id: "b-mermaiddesc", type: "paragraph", text: "Mermaid のコードから図を描きます(/mermaid または /図 で入れる)。保存したファイルには描いた図(SVG)が入るので、Mermaid が無くても見られます。" },
    { id: "mm-flow", type: "mermaid", caption: "処理の流れ(流れ図)", text: "flowchart LR\n  A[測定開始] --> B{温度は範囲内?}\n  B -->|はい| C[記録する]\n  B -->|いいえ| D[警告を出す]\n  C --> E[次の測定]\n  D --> E" },
    { id: "mm-seq", type: "mermaid", text: "sequenceDiagram\n  participant U as 利用者\n  participant P as Monolio\n  participant F as 保存ファイル\n  U->>P: 図のコードを書く\n  P->>P: Mermaid で SVG を描く\n  U->>P: 保存(Ctrl+S)\n  P->>F: SVG とコードを書き込む\n  Note over F: Mermaid なしで図が見える" },
    { id: "b-mermaidall", type: "paragraph", text: "Mermaid で描ける図の全種類(35種)の見本は、下の子ページにあります。" },
    { id: "pl-mermaid", type: "page", pageId: "P-mermaid" },

    // 提案(v240)。AI が出した想定の提案を、下の doc.suggestions に入れてある(開くと右に提案のパネルが出る)。
    { id: "h-suggest", type: "heading1", text: "提案(人・AI からの変更の案)" },
    { id: "b-suggestdesc", type: "paragraph", text: "本文を書き換えずに「こう変えたら」を文書に入れておく仕組みです。右のパネル(上の帯の「提案」)で、提案 → 表 → 列 → 1か所 のどの段でも選んで、採用・戻すを決められます。本文の語句・セルにマウスを乗せても決められます。開いているファイルを AI などが外で書き換えると、その差分も提案として出ます(採用しなかった書き換えは、保存すると元に戻ります)。下の段落と表には、AI が出した想定の提案が入っています。" },
    { id: "b-suggesttarget", type: "paragraph", text: "試験は室温 25℃ で行い、各条件で 3 回測定した。" },
    { id: "tbl-suggest", type: "table", caption: "試験条件(提案の見本)", tableHeader: true, rows: [c("条件", "電圧", "電流"), c("A", "12V", "0.5A"), c("B", "24V", "1.2A"), c("C", "5V", "0.1A")] },

    { id: "h-attach", type: "heading1", text: "画像と添付ファイル" },
    { id: "img1", type: "attachment", attachmentId: "att-image", imageWidth: 70, imageAlign: "center", caption: "見本の画像" },
    { id: "file1", type: "attachment", attachmentId: "att-csv" },
    // 動画(v273)。その場で再生できる(mp4・webm など、ブラウザが再生できる形式)。つまみのメニューの「ファイルとして表示」で、名前と Download だけにもできる。
    { id: "b-videodesc", type: "paragraph", text: "動画も添付できます。その場で再生でき、Download で取り出せます。つまみのメニューの「ファイルとして表示」で、ファイルのカードにもできます(下の2つ目)。" },
    { id: "video1", type: "attachment", attachmentId: "att-video", imageWidth: 60, caption: "試験の様子(動画)" },
    { id: "video2", type: "attachment", attachmentId: "att-video", attachmentView: "file" },
    // 音声(Issue #164 の音声)。名前・大きさ・Download のカードの下にプレーヤー。つまみのメニューの「ファイルとして表示」でカードだけにもできる。
    { id: "b-audiodesc", type: "paragraph", text: "音声(mp3・m4a・wav・ogg など)も、その場で再生できます。名前と Download のカードの下にプレーヤーが出ます。" },
    { id: "audio1", type: "attachment", attachmentId: "att-audio" },
    // PDF(v277)。既定は1ページ目の見本(押すと画面いっぱいに開く)。つまみのメニューで「中で読む」「ファイルとして表示」に切り替えられる。
    { id: "b-pdfdesc", type: "paragraph", text: "PDF もダウンロードせずに見られます。既定は1ページ目の見本で、押すと画面いっぱいに開きます。つまみのメニューで「中で読む」(枠の中でページをスクロール。高さは表と同じく下の端のつまみで変えられます)と「ファイルとして表示」に切り替えられます(下の3つ)。" },
    { id: "pdf1", type: "attachment", attachmentId: "att-pdf", caption: "試験成績書(PDF。1ページ目の見本)" },
    { id: "pdf2", type: "attachment", attachmentId: "att-pdf", attachmentView: "read", caption: "試験成績書(PDF。中で読む)" },
    { id: "pdf3", type: "attachment", attachmentId: "att-pdf", attachmentView: "file" },

    { id: "pb-desc", type: "paragraph", text: "下の「改ページ」から先は、印刷・PDF で次の紙になります(画面では何も表示されません)。" },
    { id: "pb1", type: "pagebreak", text: "" },
    { id: "h-pages", type: "heading1", text: "複数ページ" },
    { id: "b-pagesdesc", type: "paragraph", text: "下のリンクから子ページへ移れます。左の目次からも移れます。「仕様の詳細」はロックしてあり、鍵を外すまで編集できません。" },
    { id: "pl1", type: "page", pageId: "P-spec" },
    { id: "pl2", type: "page", pageId: "P-appendix" },
    // 文書チェック(Issue #236)。File メニューの「文書をチェック…」。わざと問題を入れたページ「文書チェックの練習」で試せる。
    { id: "b-checkdesc", type: "paragraph", text: "保存・配布の前に、File メニューの「文書をチェック…」(コマンドパレットでは「チェック」)で、全ページの参照切れ・表の式のエラー・グラフ・図・数式の誤りを右のパネルに一覧にできます。項目を押すとその場所へ移ります(別のページ・閉じたトグルの中でも)。直したら「再チェック」。下のページには、わざと問題を入れてあります。" },
    { id: "pl-check", type: "page", pageId: "P-check" },
    // ページのアイコン・カバー画像(Issue #184。形式 0.8.21)。このページ(📘)と「付録」(📎 とカバー画像)に付けてある。
    { id: "b-icondesc", type: "paragraph", text: "ページには、題名の上のアイコン(絵文字)とカバー画像を付けられます。題名の帯に乗せると出る「アイコンを追加」「カバーを追加」から。アイコンは目次とページへのリンクにも出ます(「付録」にカバー画像の例があります)。" },
    // 文書の書体・小さい文字(Issue #190。形式 0.8.21)。見本の見た目を保つため、この見本では既定のまま(View メニューで試せる)。
    { id: "b-styledesc", type: "paragraph", text: "文書全体の書体(標準・明朝・等幅)と「小さい文字」は、View メニューで切り替えます(文書に保存され、保存した HTML と印刷も同じになります)。" },
    // 別のページへ移す(Issue #193)。つまみのメニュー →「別のページへ移す」→ ページを選ぶと、子ブロックごとそのページの最後へ移る。
    { id: "b-movedesc", type: "paragraph", text: "ブロックは、つまみ(⋮⋮)のメニューの「別のページへ移す」で、ほかのページの最後へ移せます(子のブロックも一緒に。複数選んでいればまとめて)。" },
    { id: "b-movetry", type: "bullet", text: "試しに、この項目を「付録」へ移してみてください" },
    { id: "b-movetry1", type: "bullet", text: "この子の項目も一緒に移ります", indent: 1 },
    // ページのゴミ箱(Issue #187。形式 0.8.20)。下の doc.trash に、削除したページを1つ入れてある(目次のいちばん下の「ゴミ箱」から戻せる)。
    { id: "b-trashdesc", type: "paragraph", text: "目次のページの「削除」は、ページをゴミ箱へ移します。目次のいちばん下の「ゴミ箱」から、元に戻す・完全に削除ができます(この見本には「古いメモ」が入っています。元に戻すと、このすぐ下にリンクが戻ります)。" },
  ];
  const doc = {
    pages: [
      { id: "P-main", title: "Monolio 機能見本", icon: "📘", blocks },
      // Mermaid(同梱の 12.2.0)で描ける図の全種類。種類ごとに 見出し2・一言の説明・図。
      { id: "P-mermaid", title: "図(Mermaid)の全種類", blocks: [
        { id: "mm-intro", type: "paragraph", text: "同梱の Mermaid(12.2.0)で描ける図の全種類です。エディタでは図を押すとコードが開きます(保存HTMLでは図の上の「コード」で見られます)。名前に -beta が付く種類は、Mermaid 側で書き方が変わることがあります。" },
        { id: "mm-toc", type: "toc" },
        { id: "mmh-01", type: "heading2", text: "流れ図(flowchart)" },
        { id: "mmp-01", type: "paragraph", text: "処理の手順や分岐を書きます。箱の形(四角・ひし形・円筒など)と、まとまり(subgraph)を使えます。" },
        { id: "mmd-01", type: "mermaid", text: "flowchart TD\n  subgraph 受入検査\n    A[部品の受け入れ] --> B{寸法は公差内?}\n  end\n  B -->|はい| C[在庫へ]\n  B -->|いいえ| D[(不良記録)]\n  D --> E([仕入先へ連絡])" },
        { id: "mmh-02", type: "heading2", text: "流れ図・ELK 配置(flowchart-elk)" },
        { id: "mmp-02", type: "paragraph", text: "Mermaid では流れ図を ELK という配置方法で並べる書き方です。Monolio が同梱する Mermaid には ELK の部品(elkjs。ライセンスが GPL と組み合わせられない)が入っていないので、ふつうの流れ図と同じ並べ方で描きます。書き方は流れ図と同じです。" },
        { id: "mmd-02", type: "mermaid", text: "flowchart-elk LR\n  S1[温度センサー] --> C[制御基板]\n  S2[非常停止] --> C\n  C --> M[モーター]\n  C --> D[表示器]\n  C --> L[(記録)]\n  D -.-> S2" },
        { id: "mmh-03", type: "heading2", text: "シーケンス図(sequenceDiagram)" },
        { id: "mmp-03", type: "paragraph", text: "機器やプログラムの間のやりとりを、時間の順に上から下へ書きます。繰り返し(loop)や場合分け(alt)も書けます。" },
        { id: "mmd-03", type: "mermaid", text: "sequenceDiagram\n  participant PC as 制御PC\n  participant M as 計測器\n  PC->>M: 測定開始(*TRG)\n  activate M\n  M-->>PC: 受付\n  loop 10回\n    M->>M: サンプリング\n  end\n  M-->>PC: 測定値\n  deactivate M\n  alt 範囲外\n    PC->>PC: 警告を記録\n  else 範囲内\n    PC->>PC: 結果を保存\n  end" },
        { id: "mmh-04", type: "heading2", text: "クラス図(classDiagram)" },
        { id: "mmp-04", type: "paragraph", text: "ソフトの部品(クラス)が持つ値・操作と、部品どうしの関係(継承・集約など)を書きます。" },
        { id: "mmd-04", type: "mermaid", text: "classDiagram\n  class Sensor[\"センサー\"] {\n    +String 型番\n    +read() float\n  }\n  class Thermocouple[\"熱電対\"] {\n    +String 種類\n  }\n  class Logger[\"記録器\"] {\n    +save(値)\n  }\n  Sensor <|-- Thermocouple\n  Logger \"1\" o-- \"*\" Sensor : 接続" },
        { id: "mmh-05", type: "heading2", text: "状態遷移図(stateDiagram-v2)" },
        { id: "mmp-05", type: "paragraph", text: "装置の状態と、状態が変わるきっかけを書きます。" },
        { id: "mmd-05", type: "mermaid", text: "stateDiagram-v2\n  state \"停止\" as Stop\n  state \"待機\" as Idle\n  state \"運転\" as Run\n  state \"異常\" as Fault\n  [*] --> Stop\n  Stop --> Idle : 電源投入\n  Idle --> Run : 開始\n  Run --> Idle : 停止\n  Run --> Fault : 過電流\n  Fault --> Stop : リセット" },
        { id: "mmh-06", type: "heading2", text: "ER図(erDiagram)" },
        { id: "mmp-06", type: "paragraph", text: "データベースの表(実体)と、表どうしの関係(1対多など)を書きます。" },
        { id: "mmd-06", type: "mermaid", text: "erDiagram\n  DEVICE[\"装置\"] {\n    string id PK \"装置番号\"\n    string model \"型式\"\n  }\n  MEASUREMENT[\"測定\"] {\n    int id PK\n    float value \"測定値\"\n    datetime at \"日時\"\n  }\n  OPERATOR[\"作業者\"] {\n    string name \"氏名\"\n  }\n  DEVICE ||--o{ MEASUREMENT : \"記録する\"\n  OPERATOR ||--o{ MEASUREMENT : \"行う\"" },
        { id: "mmh-07", type: "heading2", text: "ユーザージャーニー(journey)" },
        { id: "mmp-07", type: "paragraph", text: "作業の流れに沿って、各段階の満足度(1〜5)と関わる人を書きます。" },
        { id: "mmd-07", type: "mermaid", text: "journey\n  title 測定作業の体験\n  section 準備\n    機器の暖機: 3: 作業者\n    校正: 2: 作業者, 品質担当\n  section 測定\n    測定: 5: 作業者\n    記録の転記: 1: 作業者" },
        { id: "mmh-08", type: "heading2", text: "ガントチャート(gantt)" },
        { id: "mmp-08", type: "paragraph", text: "日程と作業の前後関係を書きます(after で「前の作業の後」、crit で重要な作業)。" },
        { id: "mmd-08", type: "mermaid", text: "gantt\n  title 試作の日程\n  dateFormat YYYY-MM-DD\n  axisFormat %m/%d\n  todayMarker off\n  section 設計\n    回路設計 :a1, 2026-10-01, 10d\n    基板設計 :a2, after a1, 7d\n  section 試作\n    部品手配 :b1, 2026-10-08, 14d\n    組立 :b2, after a2, 5d\n    評価 :crit, b3, after b2, 7d" },
        { id: "mmh-09", type: "heading2", text: "円グラフ(pie)" },
        { id: "mmp-09", type: "paragraph", text: "内訳の割合を書きます(showData で値も出す)。" },
        { id: "mmd-09", type: "mermaid", text: "pie showData\n  title 不良の内訳\n  \"はんだ不良\" : 42\n  \"部品違い\" : 18\n  \"キズ\" : 25\n  \"その他\" : 15" },
        { id: "mmh-10", type: "heading2", text: "4象限図(quadrantChart)" },
        { id: "mmp-10", type: "paragraph", text: "2つの軸で項目を4つの区画に分けて置きます(改善案の優先度の整理など)。" },
        { id: "mmd-10", type: "mermaid", text: "quadrantChart\n  title 改善案の優先度\n  x-axis 低コスト --> 高コスト\n  y-axis 低効果 --> 高効果\n  quadrant-1 検討\n  quadrant-2 すぐやる\n  quadrant-3 後回し\n  quadrant-4 やらない\n  治具の追加: [0.25, 0.8]\n  自動検査機: [0.85, 0.75]\n  手順書の改訂: [0.15, 0.35]\n  設備の更新: [0.9, 0.2]" },
        { id: "mmh-11", type: "heading2", text: "要求図(requirementDiagram)" },
        { id: "mmp-11", type: "paragraph", text: "要求と、それを満たすもの・確かめるものの関係を書きます(SysML)。名前は英数字、説明(text・type)は日本語で書けます。" },
        { id: "mmd-11", type: "mermaid", text: "requirementDiagram\n  requirement temp_req {\n    id: R1\n    text: \"動作温度は0〜40℃\"\n    risk: medium\n    verifymethod: test\n  }\n  functionalRequirement stop_req {\n    id: R2\n    text: \"異常時は1秒以内に停止\"\n    risk: high\n    verifymethod: test\n  }\n  element ctrl_board {\n    type: \"制御基板\"\n  }\n  element thermal_test {\n    type: \"温度試験\"\n  }\n  ctrl_board - satisfies -> temp_req\n  ctrl_board - satisfies -> stop_req\n  thermal_test - verifies -> temp_req" },
        { id: "mmh-12", type: "heading2", text: "Git のグラフ(gitGraph)" },
        { id: "mmp-12", type: "paragraph", text: "ブランチとコミット・マージの流れを書きます。" },
        { id: "mmd-12", type: "mermaid", text: "gitGraph\n  commit id: \"初版\"\n  branch feature\n  checkout feature\n  commit id: \"測定機能\"\n  commit id: \"グラフ追加\"\n  checkout main\n  commit id: \"誤字修正\"\n  merge feature id: \"v1.1\" tag: \"v1.1\"" },
        { id: "mmh-13", type: "heading2", text: "C4 図(C4Context)" },
        { id: "mmp-13", type: "paragraph", text: "システムと利用者・外部システムの関係を、C4 モデルの書き方で書きます(C4Container などの段もある)。" },
        { id: "mmd-13", type: "mermaid", text: "C4Context\n  title 測定システムの全体像\n  Person(op, \"作業者\", \"測定を行う\")\n  System(sys, \"測定システム\", \"測定値を集めて記録する\")\n  System_Ext(erp, \"生産管理システム\", \"結果を受け取る\")\n  Rel(op, sys, \"操作する\")\n  Rel(sys, erp, \"結果を送る\", \"HTTPS\")" },
        { id: "mmh-14", type: "heading2", text: "マインドマップ(mindmap)" },
        { id: "mmp-14", type: "paragraph", text: "1つの主題から、考えを枝分かれで広げます。字下げで階層を表します。" },
        { id: "mmd-14", type: "mermaid", text: "mindmap\n  root((不良の対策))\n    人\n      教育\n      手順書\n    設備\n      治具\n      保守\n    材料\n      受入検査\n    方法\n      条件の見直し" },
        { id: "mmh-15", type: "heading2", text: "年表(timeline)" },
        { id: "mmp-15", type: "paragraph", text: "出来事を年や時期ごとに並べます。" },
        { id: "mmd-15", type: "mermaid", text: "timeline\n  title 製品の歩み\n  2023 : 構想\n  2024 : 試作1号機 : 社内評価\n  2025 : 量産開始\n  2026 : 2号機を発売" },
        { id: "mmh-16", type: "heading2", text: "サンキー図(sankey-beta)" },
        { id: "mmp-16", type: "paragraph", text: "量の流れ(電力・費用など)を帯の太さで表します。1行に「流れ元,流れ先,量」。名前は英数字だけ(この版の Mermaid では日本語を書けません)。" },
        { id: "mmd-16", type: "mermaid", text: "sankey-beta\nPower in,Controller,20\nPower in,Motor,70\nPower in,Loss,10\nMotor,Mechanical out,60\nMotor,Loss,10" },
        { id: "mmh-17", type: "heading2", text: "XY グラフ(xychart-beta)" },
        { id: "mmp-17", type: "paragraph", text: "棒グラフと折れ線を、軸付きで重ねて書きます。表から描くなら「グラフ」ブロックが向いています。" },
        { id: "mmd-17", type: "mermaid", text: "xychart-beta\n  title \"月別の生産数\"\n  x-axis [\"1月\", \"2月\", \"3月\", \"4月\", \"5月\", \"6月\"]\n  y-axis \"台数\" 0 --> 200\n  bar [120, 150, 170, 160, 180, 190]\n  line [110, 140, 165, 165, 175, 185]" },
        { id: "mmh-18", type: "heading2", text: "ブロック図(block-beta)" },
        { id: "mmp-18", type: "paragraph", text: "箱の並び(列の数・空き)を自分で決めて、構成を書きます。" },
        { id: "mmd-18", type: "mermaid", text: "block-beta\n  columns 3\n  sensor[\"センサー\"] space ctrl[\"制御基板\"]\n  space:3\n  power[\"電源\"] space motor[\"モーター\"]\n  sensor --> ctrl\n  ctrl --> motor\n  power --> ctrl" },
        { id: "mmh-19", type: "heading2", text: "パケット図(packet-beta)" },
        { id: "mmp-19", type: "paragraph", text: "通信フレームやレジスタの、ビットの割り当てを書きます。" },
        { id: "mmd-19", type: "mermaid", text: "packet-beta\n  title 送信フレーム\n  0-7: \"開始コード\"\n  8-15: \"装置番号\"\n  16-31: \"測定値\"\n  32-39: \"状態\"\n  40-47: \"チェックサム\"" },
        { id: "mmh-20", type: "heading2", text: "かんばん(kanban)" },
        { id: "mmp-20", type: "paragraph", text: "作業を「未着手・作業中・完了」などの列に並べます。" },
        { id: "mmd-20", type: "mermaid", text: "kanban\n  todo[未着手]\n    t1[治具の設計]\n    t2[手順書の改訂]\n  doing[作業中]\n    t3[試作2号機の組立]\n  done[完了]\n    t4[部品の手配]" },
        { id: "mmh-21", type: "heading2", text: "アーキテクチャ図(architecture-beta)" },
        { id: "mmp-21", type: "paragraph", text: "サーバー・データベースなどをアイコン(cloud・server・database・disk・internet)で並べ、つながりを書きます。" },
        { id: "mmd-21", type: "mermaid", text: "architecture-beta\n  group plant(cloud)[工場]\n  service pc(server)[制御PC] in plant\n  service db(database)[測定データ] in plant\n  service disk1(disk)[記録] in plant\n  service net(internet)[社内網]\n  pc:R --> L:db\n  db:B --> T:disk1\n  pc:L -- R:net" },
        { id: "mmh-22", type: "heading2", text: "レーダーチャート(radar-beta)" },
        { id: "mmp-22", type: "paragraph", text: "いくつかの観点での評価を、多角形で比べます。" },
        { id: "mmd-22", type: "mermaid", text: "radar-beta\n  title 2機種の比較\n  axis a[\"精度\"], b[\"速度\"], c[\"価格\"], d[\"保守性\"], e[\"大きさ\"]\n  curve m1[\"1号機\"]{4, 3, 2, 3, 4}\n  curve m2[\"2号機\"]{3, 5, 4, 4, 2}\n  max 5\n  min 0" },
        { id: "mmh-23", type: "heading2", text: "ツリーマップ(treemap-beta)" },
        { id: "mmp-23", type: "paragraph", text: "全体に占める大きさを、入れ子の四角の面積で表します。" },
        { id: "mmd-23", type: "mermaid", text: "treemap-beta\n\"製造原価\"\n  \"材料費\"\n    \"基板\": 30\n    \"部品\": 45\n  \"加工費\"\n    \"組立\": 15\n    \"検査\": 10" },
        { id: "mmh-24", type: "heading2", text: "ベン図(venn-beta)" },
        { id: "mmp-24", type: "paragraph", text: "集合の重なりを円で表します。" },
        { id: "mmd-24", type: "mermaid", text: "venn-beta\n  title 必要な技能\n  set E[\"電気\"]\n  set M[\"機械\"]\n  set S[\"ソフト\"]\n  union E,M[\"メカトロ\"]\n  union E,S[\"組込み\"]\n  union E,M,S[\"ロボット\"]" },
        { id: "mmh-25", type: "heading2", text: "特性要因図(ishikawa-beta)" },
        { id: "mmp-25", type: "paragraph", text: "不具合の原因を「人・設備・材料・方法」などに分けて、魚の骨の形で書きます。1行目が結果(頭)です。" },
        { id: "mmd-25", type: "mermaid", text: "ishikawa-beta\n  寸法不良\n  人\n    作業手順の誤り\n    熟練度\n  設備\n    治具の摩耗\n  材料\n    ロットのばらつき\n  方法\n    加工条件" },
        { id: "mmh-26", type: "heading2", text: "ツリー表示(treeView-beta)" },
        { id: "mmp-26", type: "paragraph", text: "フォルダやファイルの階層を書きます。字下げで階層、末尾の / でフォルダ(太字)。" },
        { id: "mmd-26", type: "mermaid", text: "treeView-beta\n  測定データ/\n    2026-10/\n      装置1.csv\n      装置2.csv\n    設定.json\n  報告書.html" },
        { id: "mmh-27", type: "heading2", text: "エージェントの流れ(agentflow-beta)" },
        { id: "mmp-27", type: "paragraph", text: "AI エージェントの処理(入力・作業・ツール・判断・出力)の流れを書きます。" },
        { id: "mmd-27", type: "mermaid", text: "agentflow-beta TB\n  flow check[\"点検エージェント\"]\n    logs[\"装置ログ\"]@{ shape: input }\n    analyse[\"異常を探す\"]@{ shape: task }\n    query[\"sql_query\"]@{ shape: tool }\n    ok[\"異常あり?\"]@{ shape: decision }\n    report[\"報告を出す\"]@{ shape: action }\n    logs --> analyse --> query --> ok\n    ok -- はい --> report\n  end" },
        { id: "mmh-28", type: "heading2", text: "スイムレーン(swimlane-beta)" },
        { id: "mmp-28", type: "paragraph", text: "部署や担当ごとの列(レーン)に分けて、業務の流れを書きます。" },
        { id: "mmd-28", type: "mermaid", text: "swimlane-beta LR\n  subgraph design [設計]\n    req[仕様を決める]\n    draw[図面を描く]\n  end\n  subgraph make [製造]\n    build[組み立てる]\n  end\n  subgraph qa [品質保証]\n    test{検査に合格?}\n    ship([出荷])\n  end\n  req --> draw --> build --> test\n  test -->|はい| ship\n  test -->|いいえ| draw" },
        { id: "mmh-29", type: "heading2", text: "構文図(railroad-beta)" },
        { id: "mmp-29", type: "paragraph", text: "文法(書式)を線路の形で表します。部品(terminal・nonterminal・choice・optional など)を組み合わせて書きます。" },
        { id: "mmd-29", type: "mermaid", text: "railroad-beta\ntitle \"数値\"\nnumber = sequence(optional(terminal(\"-\")), oneOrMore(nonterminal(\"digit\")), optional(sequence(terminal(\".\"), oneOrMore(nonterminal(\"digit\"))))) ;\ndigit = choice(terminal(\"0\"), terminal(\"1\"), terminal(\"9\")) ;" },
        { id: "mmh-30", type: "heading2", text: "構文図・EBNF(railroad-ebnf-beta)" },
        { id: "mmp-30", type: "paragraph", text: "EBNF で書いた文法を構文図にします(| は選択、[ ] は省略可)。" },
        { id: "mmd-30", type: "mermaid", text: "railroad-ebnf-beta\ntitle \"コマンドの書式\"\ncommand = \"MEAS\" , \":\" , kind , [ \"?\" ] ;\nkind = \"VOLT\" | \"CURR\" | \"TEMP\" ;" },
        { id: "mmh-31", type: "heading2", text: "構文図・ABNF(railroad-abnf-beta)" },
        { id: "mmp-31", type: "paragraph", text: "ABNF(RFC で使う書式)で書いた文法を構文図にします(1*4DIGIT は数字1〜4個)。" },
        { id: "mmd-31", type: "mermaid", text: "railroad-abnf-beta\ntitle \"装置番号\"\ndevice-id = 2ALPHA \"-\" 1*4DIGIT ;" },
        { id: "mmh-32", type: "heading2", text: "構文図・PEG(railroad-peg-beta)" },
        { id: "mmp-32", type: "paragraph", text: "PEG で書いた文法を構文図にします(/ は順に試す選択、* と + は繰り返し)。" },
        { id: "mmd-32", type: "mermaid", text: "railroad-peg-beta\ntitle \"設定の1行\"\nLine <- Key \"=\" Value ;\nKey <- Letter Letter* ;\nValue <- Digit+ / \"on\" / \"off\" ;\nLetter <- \"a\" / \"b\" / \"z\" ;\nDigit <- \"0\" / \"1\" / \"9\" ;" },
        { id: "mmh-33", type: "heading2", text: "ワードリーマップ(wardley-beta)" },
        { id: "mmp-33", type: "paragraph", text: "部品を「利用者からの見えやすさ(縦)」と「成熟度(横)」の2軸に置き、依存と変化(evolve)を書きます。日本語の名前は \"\" で囲みます。" },
        { id: "mmd-33", type: "mermaid", text: "wardley-beta\ntitle 測定サービスの構成\ncomponent \"利用者\" [0.95, 0.70]\ncomponent \"測定アプリ\" [0.80, 0.45]\ncomponent \"解析\" [0.55, 0.30]\ncomponent \"クラウド\" [0.20, 0.85]\n\"利用者\" -> \"測定アプリ\"\n\"測定アプリ\" -> \"解析\"\n\"解析\" -> \"クラウド\"\nevolve \"解析\" 0.6" },
        { id: "mmh-34", type: "heading2", text: "Cynefin(cynefin-beta)" },
        { id: "mmp-34", type: "paragraph", text: "問題を「明白・煩雑・複雑・混沌・混乱」の5つの領域に分けて置き、領域の移り変わりを矢印で書きます。" },
        { id: "mmd-34", type: "mermaid", text: "cynefin-beta\n  title 不具合対応の分類\n  complex\n    \"原因不明の間欠故障\"\n  complicated\n    \"ノイズの解析\"\n  clear\n    \"ヒューズ交換\"\n  chaotic\n    \"発煙・発火\"\n  confusion\n    \"症状の報告待ち\"\n  chaotic --> complex : \"安全を確保\"\n  complex --> complicated : \"再現できた\"" },
        { id: "mmh-35", type: "heading2", text: "ユースケース図(usecase-beta)" },
        { id: "mmp-35", type: "paragraph", text: "利用者(アクター)と、システムでできること(ユースケース)の関係を書きます。名前(id)は英数字、表示は日本語で書けます。" },
        { id: "mmd-35", type: "mermaid", text: "usecase-beta\ndirection LR\nactor op(\"作業者\")\nactor admin(\"管理者\")\nsystemBoundary \"測定システム\"\n  measure(\"測定する\")\n  report(\"報告書を作る\")\n  calib(\"校正する\")\nend\nop --> measure\nop --> report\nadmin --> calib\nmeasure ..> : include calib" },
        { id: "mmh-none", type: "heading2", text: "載せていない種類" },
        { id: "mmp-none1", type: "paragraph", text: "イベントモデリング(eventmodeling)は、箱の中の文字を HTML(foreignObject)で描くため、Monolio では安全のために文字が消えて空の箱になります。このため見本に載せていません。" },
        { id: "mmp-none2", type: "paragraph", text: "ZenUML(zenuml)は Mermaid 本体に入っていない(別の追加部品)ため描けません。" },
      ] },
      { id: "P-spec", title: "仕様の詳細", locked: true, blocks: [
        { id: "s1", type: "paragraph", text: "このページはロックされています(題名の横の鍵で外せます)。" },
        { id: "s2", type: "heading1", text: "動作条件" },
        { id: "s3", type: "bullet", text: "電源電圧: 24 V ± 10%" },
        { id: "s4", type: "bullet", text: "使用温度: 0〜40 ℃" },
        { id: "s5", type: "page", pageId: "P-sub" },
      ] },
      { id: "P-sub", title: "孫ページ", blocks: [{ id: "u1", type: "paragraph", text: "ページは入れ子にできます(子ページの中の子ページ)。" }] },
      // 文書チェック(Issue #236)の練習。わざと問題を入れてある(参照切れ・表の式のエラー・グラフ・数式・閉じたトグルの中の参照切れ)。
      { id: "P-check", title: "文書チェックの練習", icon: "🔍", blocks: [
        { id: "ck-how", type: "paragraph", text: "このページには、わざと問題を入れてあります。File メニューの「文書をチェック…」を押すと、右に問題の一覧が出ます。項目を押すとその場所へ移り、表のセルはそのセルが光ります。直してから「再チェック」を押すと、直した項目が消えます。" },
        { id: "ck-how2", type: "bullet", text: "試し方1: 下の表の「=B2/0」を「=B2/2」に直して、再チェックする" },
        { id: "ck-how3", type: "bullet", text: "試し方2: 閉じたトグルの中の参照切れの項目を押すと、トグルが開いてその段落へ移る" },
        { id: "ck-h1", type: "heading2", text: "参照" },
        { id: "ck-ref", type: "paragraph", text: "消した表への参照: 参照先なし", html: '消した表への参照: <span class="figure-ref" data-ref="ck-deleted-table">表9</span>' },
        { id: "ck-toggle", type: "toggle", text: "閉じたトグル(中に参照切れ)", open: false },
        { id: "ck-inner", type: "paragraph", indent: 1, text: "中の参照: 参照先なし", html: '中の参照: <span class="figure-ref" data-ref="ck-deleted-heading">見出し</span>' },
        { id: "ck-h2", type: "heading2", text: "計算" },
        { id: "ck-table", type: "table", text: "", caption: "わざと誤りを入れた表", rows: [
          [{ text: "項目" }, { text: "値" }, { text: "計算" }],
          [{ text: "a" }, { text: "10" }, { text: "=B2/0" }],
          [{ text: "b" }, { text: "=B3+1" }, { text: "=SUM(B2:B3" }],
        ] },
        { id: "ck-h3", type: "heading2", text: "図・数式" },
        { id: "ck-chart", type: "chart", text: 'table(id="ck-deleted-table")\nbar(A2:A3, B2:B3)' },
        { id: "ck-math", type: "math", text: "\\frac{1}{" },
      ] },
      { id: "P-appendix", title: "付録", icon: "📎", cover: { attachmentId: "att-image", position: 50 }, blocks: [
        { id: "a1", type: "paragraph", text: "付録のページです。ページ同士は、本文のリンクや目次で行き来できます。" },
        { id: "a2", type: "code", text: "保存: Ctrl+S / 印刷・PDF: ファイルメニュー" },
      ] },
    ],
    fonts: [],
    attachments: [image, file, video, pdf, audio],
    // ページのゴミ箱(Issue #187。形式 0.8.20)。links は削除のときに外したリンクの元の場所(元に戻すとそこへ戻る)。
    trash: [{
      id: "trash-sample", deletedAt: "2026-10-26T09:00:00.000Z", index: 6,
      page: { id: "P-old", title: "古いメモ", blocks: [{ id: "o1", type: "paragraph", text: "ゴミ箱から元に戻したページです。削除する前の中身のまま戻ります。" }] },
      links: [{ pageId: "P-main", afterId: "b-trashdesc", block: { id: "pl-old", type: "page", pageId: "P-old" } }],
      cells: [],
    }],
    // 見出しに番号(v218。文書の設定)。
    settings: { headingNumbers: true },
    // 提案(v240。形式 0.8.14)。AI が書いた形(前の値 before は書かない。開いた時点の値が前になる)。
    suggestions: [{
      id: "sg-sample", author: { name: "Claude", kind: "ai" }, createdAt: "2026-10-17",
      title: "試験の条件と単位の書き方をそろえる",
      reason: "社内規格の試験温度・回数に合わせ、表の単位を「12.0 V」「0.50 A」の形にそろえました。",
      changes: [
        { id: "sg-s1", op: "setText", block: "b-suggesttarget", text: "試験は室温 23±2℃ で行い、各条件で 5 回測定して平均をとった。" },
        ...[["12.0 V", "0.50 A"], ["24.0 V", "1.20 A"], ["5.0 V", "0.10 A"]].flatMap(([volt, amp], i) => [
          { id: "sg-v" + (i + 1), op: "setCell", block: "tbl-suggest", row: i + 1, col: 1, text: volt },
          { id: "sg-a" + (i + 1), op: "setCell", block: "tbl-suggest", row: i + 1, col: 2, text: amp },
        ]),
        { id: "sg-s2", op: "insertBlock", after: "tbl-suggest", item: { id: "b-suggestadd", type: "paragraph", text: "測定の前に、装置を 30 分以上暖めておく。" } },
      ],
    }],
  };
  // 英語版: 文書の中の文字列を、英語の表(dict)で丸ごと置き換える。ダンプのときは、日本語の文字列を集めて返す。
  const isJa = (s) => /[぀-ヿ㐀-鿿＀-￯]/.test(s);
  const walk = (v, f) => (typeof v === "string" ? f(v) : Array.isArray(v) ? v.map((x) => walk(x, f)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, f)])) : v);
  if (dumpMode) { const found = []; walk(doc, (s) => { if (isJa(s) && !found.includes(s)) found.push(s); return s; }); return { dump: found }; }
  const missing = [];
  const out = dict ? walk(doc, (s) => { if (Object.hasOwn(dict, s)) return dict[s]; if (isJa(s) && !missing.includes(s)) missing.push(s); return s; }) : doc;
  return { html: fmt.buildPortableHtml(out), missing };
}, [sampleVideo, samplePdf, { sensor: tr("センサー"), board: tr("制御基板"), motor: tr("モーター"), caption: tr("システム構成(添付した画像)"), csvHead: tr("時刻,温度,電流") }, EN_MODE ? EN : null, !!DUMPFILE]);

if (DUMPFILE) {
  await writeFile(DUMPFILE, JSON.stringify(built.dump, null, 1), "utf8");
  console.log("日本語の文字列 " + built.dump.length + " 件を書き出しました: " + DUMPFILE);
  await browser.close(); server.kill(); process.exit(0);
}
const html = built.html;
// 英語版: 英語の表に無い日本語の文が残っていないか(残っていたら sample/sample-strings.mjs に足す)
if (EN_MODE) {
  console.log("英語版の置き換え漏れ: " + built.missing.length + " 件");
  built.missing.forEach((s) => console.log("  " + JSON.stringify(s)));
  if (built.missing.length) { await browser.close(); server.kill(); process.exit(1); }
}

// アプリで開く(グラフ・式の計算結果を描かせる)
await page.evaluate((h) => { window.showOpenFilePicker = async () => [{ getFile: async () => new File([h], "tour.html", { type: "text/html" }) }]; }, html);
await page.locator("#menu-file-button").click();
await page.locator("#menu-open-document").click();
await page.waitForTimeout(1500);
// Mermaid の図は、本体を読み込んで描き終えるまで待つ(図が2つとも SVG になるまで)。
await page.waitForFunction(() => document.querySelectorAll(".mermaid-canvas svg").length === 2, null, { timeout: 30000 }).catch(() => {});
const check = await page.evaluate(() => ({
  status: document.querySelector("#status")?.textContent,
  title: document.querySelector("#doc-title")?.textContent,
  blocks: document.querySelectorAll("#blocks .block").length,
  charts: [...document.querySelectorAll(".chart-canvas")].map((c) => (c.querySelector(".chart-errors")?.textContent || "ok") + "/" + c.querySelectorAll("rect,circle,path,polyline").length),
  mermaid: [...document.querySelectorAll(".mermaid-canvas")].map((c) => (c.querySelector(".mermaid-errors")?.textContent || "ok") + "/" + c.querySelectorAll("svg text").length),
  formulas: [...document.querySelectorAll('.block[data-id="tbl-sales"] td')].map((td) => td.textContent).slice(-4),
  pages: [...document.querySelectorAll("#page-tree-body .page-tree-item")].map((e) => e.textContent),
  // コードの色分け(Issue #163): 言語のあるコードの数と、塗った字句の数(CSS Custom Highlight API)
  codeHighlights: document.querySelectorAll("#blocks .block.type-code").length + " code / "
    + [...(window.CSS?.highlights?.keys?.() || [])].filter((name) => name.startsWith("code-")).reduce((sum, name) => sum + CSS.highlights.get(name).size, 0) + " ranges",
  // 提案(v240): 上の帯の「提案 N」と、本文の差分の印の数
  suggestions: document.querySelector("#suggest-toggle")?.textContent + " / marks " + document.querySelectorAll(".sg-del, .sg-ins, .sg-cell, .sg-block-ins").length,
}));
console.log(JSON.stringify(check));
if (SHOTDIR) await page.screenshot({ path: shot("tour-editor") });

// 文書チェック(Issue #236): 「文書チェックの練習」のページのわざとの問題が出ること(ページごとの件数)。チェックは文書を変えない。
await page.locator("#menu-file-button").click();
await page.locator("#menu-check-document").click();
await page.waitForFunction(() => {
  const summary = document.querySelector("#check-pane .ck-summary");
  return summary && !summary.classList.contains("ck-checking");
}, null, { timeout: 60000 }).catch(() => {});
const checked = await page.evaluate(() => ({
  summary: document.querySelector("#check-pane .ck-summary-title")?.textContent,
  byPage: [...document.querySelectorAll("#check-pane .ck-group-issues .ck-page")].map((p) => p.querySelector(".ck-page-title").textContent),
  unchecked: document.querySelectorAll("#check-pane .ck-group-unchecked .ck-item").length,
}));
console.log("文書チェック(" + LANG + "): " + JSON.stringify(checked));
await page.locator("#check-pane .sg-pane-close").click();

// 「図(Mermaid)の全種類」のページへ移り、図がすべて描き終わる(SVG か誤りの文言が出る)まで待って、図ごとの結果を出す。
const MERMAID_ALL_TITLE = tr("図(Mermaid)の全種類");
await page.locator("#page-tree-body .page-tree-item", { hasText: MERMAID_ALL_TITLE }).first().click();
await page.waitForFunction(() => {
  const canvases = [...document.querySelectorAll("#blocks .block.type-mermaid .mermaid-canvas")];
  return canvases.length > 0 && canvases.every((c) => c.querySelector("svg") || c.querySelector(".mermaid-errors"));
}, null, { timeout: 180000 }).catch(() => {});
const mermaidAll = await page.evaluate(() => ({
  title: document.querySelector("#doc-title")?.textContent,
  results: [...document.querySelectorAll("#blocks .block.type-mermaid")].map((row) => {
    const canvas = row.querySelector(".mermaid-canvas");
    const keyword = (row.querySelector(".block-content")?.textContent || "").trim().split(/\s/)[0];
    const error = canvas?.querySelector(".mermaid-errors")?.textContent || "";
    const svg = canvas?.querySelector("svg");
    return { keyword, status: error ? "error: " + error.slice(0, 120) : svg ? "ok" : "not drawn", texts: svg ? svg.querySelectorAll("text").length : 0 };
  }),
}));
console.log("Mermaid の全種類(" + mermaidAll.title + "): " + mermaidAll.results.length + " 図");
mermaidAll.results.forEach((r) => console.log("  " + (r.status === "ok" ? "ok   " : "NG   ") + r.keyword.padEnd(20) + " texts=" + r.texts + (r.status === "ok" ? "" : "  " + r.status)));
const mermaidNg = mermaidAll.results.filter((r) => r.status !== "ok").length;
console.log("  → ok " + (mermaidAll.results.length - mermaidNg) + " / NG " + mermaidNg);
if (SHOTDIR) await page.screenshot({ path: shot("tour-mermaid-all") });
await page.locator("#page-tree-body .page-tree-item", { hasText: tr("Monolio 機能見本") }).first().click();
await page.waitForTimeout(500);

// アプリで保存(Ctrl+S と同じ経路。保存先の選択はここで受ける)
const saved = await page.evaluate(async () => {
  let out = "";
  window.showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async (t) => { out += t; }, close: async () => {} }) });
  document.querySelector("#blocks .block-content").focus();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
  for (let i = 0; i < 300 && !out; i++) await new Promise((r) => setTimeout(r, 100));
  return out;
});
if (!saved) throw new Error("save produced nothing");
await writeFile(OUTFILE, saved, "utf8");
console.log("saved bytes", saved.length);

// 保存HTMLをそのままブラウザで開いて見る
const viewer = await browser.newPage({ viewport: { width: 1100, height: 900 } });
viewer.on("pageerror", (e) => console.log("VIEWERERROR", e.message));
await viewer.goto("file:///" + OUTFILE.replaceAll("\\", "/"));
await viewer.waitForTimeout(1000);
console.log(JSON.stringify(await viewer.evaluate(() => ({
  svgCharts: document.querySelectorAll(".doc-chart:not(.doc-mermaid) svg").length,
  images: [...document.querySelectorAll("img")].map((i) => i.naturalWidth),
  math: document.querySelectorAll("math").length,
  mermaidSvgs: document.querySelectorAll(".doc-mermaid-canvas > svg").length,
  // ページごとの Mermaid の図(SVG)の数と、絵の無い(コードだけの)図の数
  mermaidSvgsByPage: Object.fromEntries([...document.querySelectorAll('section[id^="page-"]')]
    .map((s) => [s.querySelector("h1")?.textContent || s.id, s.querySelectorAll(".doc-mermaid-canvas > svg").length]).filter(([, n]) => n > 0)),
  mermaidWithoutSvg: [...document.querySelectorAll(".doc-mermaid")].filter((m) => !m.querySelector(".doc-mermaid-canvas > svg")).length,
  tables: document.querySelectorAll("table.doc-table").length,
  // コードの色分け(Issue #163): 言語のあるコードと、色の印の数
  codeLanguages: [...document.querySelectorAll("pre[data-language]")].map((pre) => pre.dataset.language + ":" + pre.querySelectorAll("span[class^='tok-']").length),
  // 見出しの番号(v218)と、見出しへの参照のリンクの文字
  headingNumbers: document.querySelectorAll(".heading-number").length,
  headingRefs: [...document.querySelectorAll('a.figure-ref[href^="#block-"]:not(.is-block)')].map((a) => a.textContent),
  // ブロックへのリンク(Issue #176)の文字と、行き先に錨があるか
  blockLinks: [...document.querySelectorAll("a.figure-ref.is-block")].map((a) => a.textContent + (document.getElementById(a.getAttribute("href").slice(1)) ? "" : " (行き先なし)")),
}))));
if (SHOTDIR) await viewer.screenshot({ path: shot("tour-saved"), fullPage: true });
await browser.close();
server.kill();
