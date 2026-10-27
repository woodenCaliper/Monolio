# 第三者のソフトウェアと権利の整理

Monolio 本体のライセンスは **GPL-3.0-or-later**（[LICENSE](./LICENSE)）です。
このファイルは、Monolio が同梱・利用している第三者のソフトウェアとその条件、GPL v3 との関係をまとめたものです（Issue #234。2026-10-27 時点）。
第三者のコードは、それぞれの元のライセンスのままで、本体のライセンスで上書きしていません。

配布物に入れる表記とライセンス全文は、次のファイルにあります（アプリの File → 「ライセンス情報…」でも読めます）。

| ファイル | 中身 | 入る配布物 |
|---|---|---|
| [`LICENSE`](./LICENSE) / [`editor-pwa/legal/LICENSE.txt`](./editor-pwa/legal/LICENSE.txt) | GPL v3 の公式全文（2つは同じ。テストで一致を見張る） | リポジトリ・ブラウザ版・デスクトップ版 |
| [`editor-pwa/legal/THIRD_PARTY_NOTICES.txt`](./editor-pwa/legal/THIRD_PARTY_NOTICES.txt) | Mermaid とそのバンドルの部品、Material Symbols の表記とライセンス全文 | ブラウザ版・デスクトップ版 |
| [`src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt`](./src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt) | デスクトップ版の Rust の部品（305個）の表記とライセンス全文 | デスクトップ版（`legal/` に同梱） |
| [`editor-pwa/vendor/mermaid/LICENSE`](./editor-pwa/vendor/mermaid/LICENSE) | Mermaid 本体の MIT ライセンス | ブラウザ版・デスクトップ版 |

## 結論

- **GPL v3 と合わないもの：0件**。npm の Mermaid の配布物には `elkjs 0.9.3`（EPL-2.0）が入っていますが、EPL-2.0 は第二ライセンス（GPL）の
  指定が無い限り GPL v3 と両立せず、elkjs はその指定を付けていません。そのため、**同梱の `mermaid.min.js` は elkjs を取り除いて自前で作り直した
  もの**です（2026-10-27 決定。下の「Mermaid 12.2.0」）。図の配置を `layout: elk` などにした図は、ふつうの並べ方（dagre）で描かれます。
- それ以外は、MIT・Apache-2.0・BSD・ISC・Zlib・Unicode-3.0・Unlicense・CC0・0BSD の許諾型と、MPL-2.0（Rust の5個。GPL v3 と組み合わせられる）で、
  GPL v3 と矛盾しません。Apache-2.0 は GPL v3 と両立します（GPL v2 とは両立しない）。
- 「A OR B」の二重ライセンスの部品は、GPL v3 と矛盾しない側（MIT・Apache-2.0）で使います。
- 保存した HTML に入るのは、Monolio 自身のスクリプト・スタイル（GPL-3.0-or-later）だけです。第三者のコードは入りません（下の「保存HTML」）。

## ブラウザ版・デスクトップ版に共通（Web の部品）

### Mermaid 12.2.0 — MIT

- ファイル：`editor-pwa/vendor/mermaid/mermaid.min.js`。npm の `mermaid@12.2.0` の `dist/mermaid.js`（Mermaid が束ねた、縮めていない IIFE）から
  **elkjs を取り除き**、esbuild で縮め直したもの（改変あり。SHA-256 `ae382421e6c07aff8e8170246efe0d8f47e508bc2b9eb905e86639d0dce7598d`。5.5MB → 約4.0MB）。
  - 作り方：[`editor-pwa/vendor/mermaid/build/build-mermaid.mjs`](./editor-pwa/vendor/mermaid/build/build-mermaid.mjs)（`npm run mermaid:build`）。
    npm から `mermaid@12.2.0`（integrity で中身を確かめる）と `esbuild@0.28.2` を一時フォルダに取り、elkjs の部品を「呼ばれたらエラーを投げる空の部品」に
    差し替え、並べ方の登録から ELK を外して縮める。同じものが作り直せる（`--check` で同梱のものと一致するかを見る）。
  - 外したことの影響：`layout: elk`・`elk.*`・`flowchart-elk` を指定した図は、Mermaid の仕組み（登録されていない並べ方は dagre に戻す）で、
    ふつうの並べ方で描かれる（エラーにはならない）。ほかの図には影響しない。
- 出典：<https://github.com/mermaid-js/mermaid>（元のソースはタグ `mermaid@12.2.0`）。Copyright (c) 2014–2022 Knut Sveidqvist。
- **バンドルの内側の部品**：このファイルは 75 個ほどの部品を内側にまとめています（同じ版の `dist/mermaid.js` の取り込み元の表記と、
  `@mermaid-js/parser` の依存から特定）。主なライセンスは MIT（lodash-es・dayjs・katex・marked・roughjs・stylis・cytoscape・langium など）、
  ISC・BSD-3-Clause（d3 の各部品）、Apache-2.0（chevrotain）、Apache-2.0 OR MPL-2.0（DOMPurify。Apache-2.0 を選択）。
  部品ごとの一覧・著作権表示・ライセンス全文は `editor-pwa/legal/THIRD_PARTY_NOTICES.txt` にあります（取り除いた elkjs は載せず、取り除いたことを書いています）。
- 版を上げるとき：スクリプトの版と integrity を直して作り直し、同じ手順で一覧を作り直す（[HANDOVER.md](./HANDOVER.md) の §4.53）。

### Material Symbols のアイコン — Apache-2.0

- 書式ツールバーの6つ（太字・斜体・下線・取り消し線・書式クリア・リンク）の SVG の path は、Google の
  [Material Symbols](https://fonts.google.com/icons)（Outlined、太さ 400）の形です。場所は `editor-pwa/document-format.js` の `UI_ICONS`。
- Apache-2.0 の全文を `editor-pwa/legal/THIRD_PARTY_NOTICES.txt` に置き、改変の表示（path は上流のまま、枠・線・色を属性と CSS で付け替え）を書いています。
  上流（google/material-design-icons）には NOTICE ファイルがありません（2026-10-27 に確認）。
- 保存した HTML には、これらのアイコンは入りません（保存 HTML に入るのは Monolio が描いたアイコンだけ）。
- これ以外のアイコン（`UI_ICONS` の残り）は Monolio のために描いたもの、と記録されています。

### 保存HTML

保存した HTML には、次が入ります。

- 文書の中身（利用者のもの）。**GPL は及びません。**
- Monolio のスクリプト（ランタイム）とスタイル（`document-format.js`・`document-style.js` が書き出す）。**GPL-3.0-or-later です。**
  HTML の先頭の注釈に、その旨・著作権者・ライセンスとソースの場所を書いています。
- 図（Mermaid）の絵：Mermaid が描いた SVG（Mermaid 本体のコードは入らない）。図のある文書では、注釈に Mermaid（MIT）の表記を足します。
- 利用者が添付したファイルや埋め込んだフォント：利用者のものです（フォントは埋め込みが許可されたものを、利用者が選びます）。
- Mermaid・第三者のスクリプトは、保存 HTML には入りません。

## デスクトップ版（Tauri）

- **Rust の部品（305個）**：`src-tauri/Cargo.lock` の版で、Windows（`x86_64-pc-windows-msvc`）と Linux（`x86_64-unknown-linux-gnu`）の実行時の依存を数えたもの。
  Tauri 2（`tauri`・`wry`・`tao` など。Apache-2.0 OR MIT）、`tauri-plugin-dialog`・`tauri-plugin-fs`、`windows-sys`、Linux では `gtk`・`gio`・`webkit2gtk` の Rust の結び付け（MIT）など。
  ライセンスの内訳：

  | ライセンス表記 | 個数 |
  |---|---|
  | MIT OR Apache-2.0（および同じ意味の表記） | 184 |
  | MIT | 73 |
  | Unicode-3.0（ほか、`unicode-ident` の (MIT OR Apache-2.0) AND Unicode-3.0 を「そのほか」に数える） | 18 |
  | Unlicense OR MIT | 10 |
  | Zlib を含む二重・三重ライセンス（Zlib 単独 1 を含む） | 5 |
  | MPL-2.0（`selectors`・`cssparser`・`cssparser-macros`・`dtoa-short`・`option-ext`） | 5 |
  | BSD-3-Clause（`alloc-stdlib`・`alloc-no-stdlib`・`brotli`・`brotli-decompressor`） | 4 |
  | そのほか（ISC・Apache-2.0 単独・0BSD OR …・CC0-1.0 OR MIT-0 OR Apache-2.0・Apache-2.0 AND MIT など） | 6 |

  MPL-2.0 の5個は、GPL v3 と組み合わせられます（MPL-2.0 第3.3条の「二次ライセンス」）。改変せず、crates.io の配布物のまま使っています。
  すべての一覧と全文は `src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt` にあります。
- **ビルドだけに使う Rust の部品（25個）は実行ファイルに入りません**：`tauri-build`・`tauri-plugin`・`tauri-winres`・`embed-resource`・`cc`・`pkg-config`・
  `system-deps`・`cfg-expr`・`toml`・`winnow`・`version-compare`・`target-lexicon`（Apache-2.0 WITH LLVM-exception）ほか。すべて MIT・Apache-2.0 の系統（上の表記）です。
- **Windows**：
  - Microsoft Edge WebView2 ランタイムは**同梱しません**。インストーラ（NSIS）が、無ければ Microsoft の配布から取得します（Microsoft の条件に従う。Windows 11 には標準で入っています）。
  - インストーラは NSIS で作ります（NSIS のライセンスは zlib/libpng 系の許諾型）。
- **Linux**：
  - `.deb`：GTK・WebKitGTK などは依存パッケージとして OS から入れます（同梱しません）。
  - AppImage：GTK・WebKitGTK・GStreamer（`bundleMediaFramework`）などの共有ライブラリを同梱します。主に LGPL-2.1 以降などで、
    ソースは各プロジェクトから入手できます。AppImage を配るときは、その案内を添えます（`src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt` に書いています）。
- **macOS**：配布しません（`aarch64-apple-darwin` の部品は数えていません）。

## ビルド・テストだけに使うもの（配布物に入らない）

`node_modules` はリポジトリに含まれています（`npm install` 不要にするため）。それぞれのパッケージの LICENSE をそのまま残しています。

| パッケージ | ライセンス | 用途 |
|---|---|---|
| `playwright-core` 1.62.1 | Apache-2.0 | テストでブラウザを操作する（`LICENSE`・`NOTICE`・`ThirdPartyNotices.txt` をパッケージに含む） |
| `@tauri-apps/cli` 2.11.4 と、その OS 別の部品（`cli-win32-x64-msvc` など） | Apache-2.0 OR MIT | デスクトップ版のビルド（`LICENSE_APACHE-2.0`・`LICENSE_MIT` をパッケージに含む） |

どちらもアプリ（ブラウザ版・デスクトップ版）には入りません。`package-lock.json` には、この2つと `@tauri-apps/cli` の OS 別の部品（11個。ライセンスは同じ）しかありません。

## 判断が要るもの

1. ~~**elkjs（EPL-2.0）と GPL v3**~~ → **A に決定・対応済み**（2026-10-27）。elkjs を外した Mermaid を自前で作って同梱した（上の「Mermaid 12.2.0」）。
   検討した選択肢（記録として残す）：
   - A. ELK を外した Mermaid を自前でビルドして置き換える（`layout: elk` が使えなくなる。ほかの図には影響しない。ビルドの仕組みが要る）。← 採用
   - B. 今の同梱版のまま公開し、「別のプログラム（Mermaid の配布物）を、そのまま同梱して読み込む」とみなす。EPL-2.0 の条件（全文の同梱・ソースの案内）は満たしているが、
     「Monolio の中で同じ JavaScript として動くので、結合した作品にあたる」という見方も残る（弁護士に確認したい点）。
   - C. Mermaid の遅延読み込みを、利用者が別に取得する形にする（同梱をやめる。オフラインで図を描けなくなる）。
2. ~~**`editor-pwa/emoji-data.js`（絵文字の名前の表）**~~ → **Unicode 公式データから作り直した**（2026-10-27。Unicode Emoji 18.0・CLDR 49、Unicode License v3。`scripts/build-emoji-data.mjs`）。以下は以前の記録：約480個の絵文字と、英語の名前・日本語の呼び名の表です。出典の記録がありません。
   一般的な短縮名（gemoji・CLDR に近い）に似ていますが、どこから作ったかが分からないため、SPDX の表記を付けていません。作った経緯の確認が要ります
   （自分で作ったなら GPL を付けるだけ。他から写したなら、その出典のライセンスを確かめる）。
3. **アプリのアイコン**（`editor-pwa/icons/icon.svg`・`src-tauri/icons/*`）：リポジトリの履歴では著作権者名での追加ですが、素材の出どころの記録がありません。
   自作であれば GPL で問題ありません（`src-tauri/icons` は `icon.svg` から作った派生と見られます）。
4. **機能見本の動画・PDF**（`sample/sample-video.webm`・`sample/sample-report.pdf`）：どちらも Chrome（MediaRecorder・Skia/PDF）で、このプロジェクトの中で作ったものです。
   第三者の素材は入っていません（見本の画像も、見本の作成スクリプトが canvas で描いたものです）。
5. **著作権者の名前**：「woodenCaliper」を使っています（個人の本名・メールアドレスは書いていません）。公開用リポジトリの URL
   （`https://github.com/woodenCaliper/Monolio`）が変わるなら、README・アプリの中の窓・保存 HTML の注釈の URL を直す必要があります。
6. **公開用の新しいリポジトリへの移し方**：履歴を持っていかないので、LICENSE・SPDX の表記・THIRD_PARTY_NOTICES は今のファイルの中身のまま入ります。
   実行ファイル（exe・AppImage）を配るときは、その版のタグと Source code（Releases の Assets）を必ず残す（README に書いた入手方法）。
7. **`docs/`（操作ガイド・形式の案内）と機能見本 HTML の文章**：Monolio の一部として GPL-3.0-or-later で扱う想定です。別のライセンス（CC BY など）にしたいかは未決です。

## 一覧の作り方

作り方と、版を上げるときの手順は [HANDOVER.md](./HANDOVER.md) の §4.53にあります。
