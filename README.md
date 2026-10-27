# Monolio（モノリオ）

English version: [README.en.md](./README.en.md)

**文章も、表計算も、グラフも、添付ファイルも。ひとつのHTMLにまとめて、編集・閲覧できる技術文書エディタ。**

Monolioでは、テキストの編集に加えて、表での計算、データのグラフ化、数式や図の作成、画像・PDF・CADデータなどのファイル添付ができます。
技術文書や設計メモに必要な文章・データ・資料を、ひとつの文書にまとめられます。

保存形式は、ブラウザでそのまま読める単一のHTMLファイルです。
読むためのファイルと編集するためのファイルが同じなので、受け取った人は専用アプリなしで閲覧でき、Monolioで開けば編集を続けられます。
文書も添付ファイルも手元にまとめて保管し、そのまま共有できます。

**[機能見本を開く（ブラウザでそのまま開きます）](https://woodencaliper.github.io/Monolio/sample/monolio-features.html)** — Monolio の機能をひととおり使った文書です。
ダウンロードして Monolio で開けば、編集もできます。（[英語版の見本](https://woodencaliper.github.io/Monolio/sample/monolio-features.en.html)）

## ダウンロード

**[配布版を確認・ダウンロードする → GitHub Releases](https://github.com/woodenCaliper/Monolio/releases)**

リリースの **Assets** から、お使いの環境向けのファイルを選んでください。

| 環境 | ファイル | 使い方 |
|---|---|---|
| Windows 10 / 11 | `Monolio_<版>_x64-setup.exe` | 実行してインストールします。署名のないアプリのため、初回に Windows の警告（SmartScreen）が出ることがあります。「詳細情報」→「実行」で進めます |
| Ubuntu など（Debian 系） | `Monolio_<版>_amd64.deb` | `sudo apt install ./Monolio_<版>_amd64.deb` で入れます。外すのは `sudo apt remove monolio` |
| ソースコード | Source code（zip / tar.gz） | その版に対応するソースです（[ソースコードの入手方法](#ソースコードの入手方法)） |

保存した文書（HTML）を読むだけなら、インストールは要りません。ブラウザで開けば読めます。
ソースから動かす場合は[起動・ビルド方法](#起動ビルド方法)へ。

## できること

技術文書・設計メモ・手順書・調査ログを、ブロックを組み立てる感覚で書けます。
保存したHTMLはブラウザでそのまま読めて、Monolioで開けば編集を続けられます。
文書の保存・閲覧に専用のクラウドサービスは必要ありません。

### 文書と添付ファイルを、ひとつにまとめる

本文・画像・動画・PDF・その他の添付ファイルを、文書のHTML内に保存できます。
CADデータなど、ブラウザで直接表示できないファイルも添付して渡せます。
受け取った人は、Monolioをインストールせずにブラウザで文書を読み、添付ファイルを取り出せます。

### ブロックで文章を組み立てる

見出し・段落・箇条書き・番号付きリスト・チェックボックス・引用・コード・区切り線・トグルを組み合わせて書けます。
スラッシュコマンドやMarkdown風ショートカットで入力し、ブロックをドラッグして並べ替えられます。
Notion・Googleドキュメント・Webページなどから、書式を含めて貼り付けることもできます。

### 表で計算し、グラフにする

セルの結合、行・列の追加や並べ替え、幅・高さの調整、数値の表示形式、絞り込みに対応しています。
四則演算や `SUM`・`AVERAGE`・`IF` などの関数、セル・範囲の参照を使って計算できます。

表の値から散布図・折れ線・ヒストグラムを描き、近似曲線や式・R²を表示できます。
表の値を書き換えると、グラフも更新されます。

### データベースとして整理する

表の列に文字・数値・日付・選択肢・チェック・リンクの種類を設定できます。
別の文書や文書内のページへのリンクを並べて、資料の一覧として使えます。

### 数式や図を入れる

TeXの一部の記法を使って、本文中や独立したブロックに数式を書けます。
Mermaidでは、フローチャートやシーケンス図などをコードから描けます。

保存HTMLには描画済みの数式・図が入るため、読む側で描画用ライブラリを用意する必要はありません。

### 長い文書の構成を整える

目次、ページへのリンク、見出し番号、図表の題名と通し番号を使えます。
本文から見出しや図表を参照でき、並べ替えに合わせて番号も振り直されます。

### 人やAIの提案を確認して取り込む

本文をすぐに書き換えず、変更案を文書に入れて、差分を見ながら採用・取り消しを選べます。
人やAIが加えた提案を、ブロックや表のセルごとに確認できます。
外部のツールが開いているファイルを書き換えた場合も、差分を提案として確認できます。

### 保存・配布の前に文書をチェックする

File メニューの「文書をチェック…」で、全ページ（見ていないページ・閉じたトグルの中も）の参照切れ・リンク切れ、表の式のエラー、グラフ・図・数式の誤りを一覧にできます。
項目を選ぶとその場所へ移り、直したら再チェックできます。外部のURLは確かめません（文書を外へ送りません）。問題があっても保存はできます。

### 印刷・PDF出力する

文書を印刷したり、ブラウザの印刷機能でPDFに保存したりできます。
改ページを指定でき、折り畳んだ内容も印刷時には展開されます。

### フォントを選び、必要なら埋め込む

既定ではOS標準フォントを使います。
環境をまたいで書体を揃えたいときは、埋め込みが許可されたフォントを添付し、文書に埋め込めます。

## 使い方・機能見本

- [操作ガイド](./docs/usage.md) — 各機能の操作、ショートカット、数式・グラフの書き方
- [機能見本のHTML](https://woodencaliper.github.io/Monolio/sample/monolio-features.html)（[英語版](https://woodencaliper.github.io/Monolio/sample/monolio-features.en.html)） — ブラウザでそのまま閲覧できます。ダウンロードして Monolio の「File → Open」で開けば編集もできます（ファイルは [docs/sample/](./docs/sample/)）
- [文書形式・AI向けの案内](./docs/format/index.md) — 保存HTMLの構造と、提案を追加するための仕様（英語）

## 起動・ビルド方法

### ブラウザ / PWAで動かす

Node.js 20以降とnpmを用意し、このリポジトリを取得したフォルダで実行します。

```sh
npm ci
npm run pwa:serve
```

ブラウザで [http://127.0.0.1:4173/](http://127.0.0.1:4173/) を開きます。

### Windowsのデスクトップ版をビルドする

上記のnpm依存に加えて、次の環境が必要です。

- Rust（stable、`x86_64-pc-windows-msvc`）
- Visual Studio Build Toolsの「C++によるデスクトップ開発」
- WebView2ランタイム（Windows 11は標準搭載）

```sh
npm run tauri:build
```

生成物：

- `src-tauri/target/release/Monolio.exe` — 実行ファイル
- `src-tauri/target/release/bundle/nsis/` — インストーラの出力先

開発中の起動は `npm run tauri:dev` です。
デスクトップ版も `editor-pwa/` のエディタを使用し、Tauriを介してファイルを開いたり保存したりします。
`src-tauri/stage-frontend.mjs` が配布用のファイルを収集し、テスト生成物の同梱を防ぎます。

### Linuxのデスクトップ版をビルドする

Ubuntuなどで、次の部品を入れてから同じ `npm run tauri:build` を実行します（Linuxだけの設定は `src-tauri/tauri.linux.conf.json`）。

```sh
sudo apt install -y build-essential curl wget file pkg-config libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

生成物：

- `src-tauri/target/release/bundle/deb/` — .deb（`sudo apt install ./Monolio_1.0.0_amd64.deb` で入り、メニューに「Monolio」が出ます。外すのは `sudo apt remove monolio`）
- `src-tauri/target/release/bundle/appimage/` — AppImage（入れずに、実行できるようにして（`chmod +x`）そのまま起動します）

入れたアプリは `node src-tauri/linux-e2e.mjs /usr/bin/Monolio 画面.png` で、外から操作して確かめられます（手順は [HANDOVER.md](./HANDOVER.md) §4.44）。

### テスト

初回はテスト用のブラウザを準備します。

```sh
npm run pwa:browser
npm run pwa:test
```

テストは複数の組に分けて並列実行します。順番に実行する場合は `npm run pwa:test:serial` を使います。
確認項目は[機能テスト用メモ](./FEATURE_TEST_CHECKLIST.md)を参照してください。

## ライセンス

Monolio は自由ソフトウェアです。**GNU General Public License v3.0 またはそれ以降のバージョン（GPL-3.0-or-later）**の条件で、
再配布・改変できます（SPDX: `GPL-3.0-or-later`）。

```text
Monolio
Copyright (C) woodenCaliper

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

- 無保証です（GPL v3 の第15〜17条）。
- ライセンス全文は [LICENSE](./LICENSE)（GPL v3 の公式全文）にあります。アプリの中では File → 「ライセンス情報…」でも読めます。
- 個人・企業での利用、仕事での利用、改変、無料・有料での再配布ができます。
  Monolio（原版・改変版）を配布するときは、GPL の条件を引き継ぎ、対応するソースコードを GPL に従って渡してください。
- **Monolio で作った文書や成果物には、GPL は及びません。** 文書の中身は作った人のものです。
  ただし、保存した HTML には Monolio のスクリプト・スタイルが入っています（その部分は GPL-3.0-or-later です。HTML の先頭の注釈に表記があります）。
- ソースファイルには `SPDX-License-Identifier: GPL-3.0-or-later` を付けています。同梱した第三者のコードは、元のライセンスのままです。

### ソースコードの入手方法

- 最新のソース：このリポジトリ（<https://github.com/woodenCaliper/Monolio>）。
- **配布版（`Monolio.exe`・インストーラ・`.deb`・AppImage）に対応するソース**：[Releases](https://github.com/woodenCaliper/Monolio/releases) の各版の **Assets にある Source code（zip / tar.gz）**です。
  その版のタグの時点の、ビルドに必要なファイル（`package.json`・`package-lock.json`・`src-tauri/Cargo.lock`・`src-tauri/stage-frontend.mjs` など）をすべて含みます。
  更新され続けるブランチではなく、版ごとのタグ・Source code を使ってください。
- ビルド手順は上の[起動・ビルド方法](#起動ビルド方法)にあります。

### 第三者のソフトウェア

同梱した第三者のコード・アイコン・依存ライブラリは、それぞれの元のライセンスのままです（本体のライセンスで上書きしていません）。
一覧・出典・結論は [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)、配布物に入れる表記とライセンス全文は
[`editor-pwa/legal/THIRD_PARTY_NOTICES.txt`](./editor-pwa/legal/THIRD_PARTY_NOTICES.txt)（ブラウザ版・デスクトップ版共通）と
[`src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt`](./src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt)（デスクトップ版の Rust の部品）にあります。

主なもの：

- **Mermaid 12.2.0**：MIT License。Copyright (c) 2014–2022 Knut Sveidqvist。図の描画に使用しています。
  [ライセンス全文](./editor-pwa/vendor/mermaid/LICENSE)。バンドルに含まれる部品の表記は上記の THIRD_PARTY_NOTICES にあります。
  同梱しているのは、npm の配布物から elkjs（EPL-2.0。GPL と組み合わせられない）を取り除いて作り直したものです
  （作り方は [`editor-pwa/vendor/mermaid/build/build-mermaid.mjs`](./editor-pwa/vendor/mermaid/build/build-mermaid.mjs)）。
  そのため、図の配置を `layout: elk` にした図は、ふつうの並べ方（dagre）で描かれます。
- **Unicode Emoji 18.0・CLDR 49**：Unicode License v3。Copyright © 1991-2026 Unicode, Inc.
  絵文字の候補の表（`editor-pwa/emoji-data.js`）を、これらの公式データから [`scripts/build-emoji-data.mjs`](./scripts/build-emoji-data.mjs) で作っています。
- **Material Symbols**：Apache License 2.0。書式ツールバーの太字・斜体・下線・取り消し線・書式クリア・リンクの6つのアイコンの形に、
  [Google Material Symbols](https://fonts.google.com/icons) の SVG を使用しています（Apache-2.0 の全文と改変の表示は THIRD_PARTY_NOTICES にあります）。

## プロジェクトについて

- [アプリの目的](./APP_PURPOSE.md)
- [名前の由来](./NAME_ORIGIN.md)

### 開発の進め方

Monolio は、作者が AI（Claude Code）と対話しながら開発しています。
リポジトリには、その作業のためのメモも、そのまま入っています。

- [CLAUDE.md](./CLAUDE.md) — AI に渡している作業の決まり
- [HANDOVER.md](./HANDOVER.md) — 設計の前提・作業の手順・判断の理由（コードの中の「§4.22」などはこの文書の節です）
- [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md) — 設計原則（コードの中の「P6」などはこの文書の原則です）
- [CHANGELOG.md](./CHANGELOG.md) — 細かい変更の記録（見出しの `vNNN` は通し番号の build です）
- [FEATURE_TEST_CHECKLIST.md](./FEATURE_TEST_CHECKLIST.md) — 機能とテストの対応

版の番号は、アプリの版（`1.0.0` の形。リリースの単位）、通し番号（build。変更のたびに上がる）、保存形式の版（`1.0` の形）の3つです。
アプリの右下には「v1.0.0 · build NNN」のように表示されます。

不具合の報告や要望は、[Issues](https://github.com/woodenCaliper/Monolio/issues) へお寄せください。
