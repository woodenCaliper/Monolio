# Monolio

日本語版: [README.md](./README.md)

**Text, spreadsheets, charts, and attachments, all in one HTML file. A technical document editor you can edit and read in the same file.**

Besides editing text, Monolio lets you calculate in tables, turn data into charts, write math and diagrams, and attach files such as images, PDFs, and CAD data.
The writing, data, and reference material a technical document or design note needs can live together in one document.

The save format is a single HTML file that opens as it is in a browser.
The file you read and the file you edit are the same, so a recipient can read it without any special app, and can keep editing it by opening it in Monolio.
You can keep the document and its attachments together on your own machine and share them as they are.

**[Open the feature tour (it opens right in your browser)](https://woodencaliper.github.io/Monolio/sample/monolio-features.en.html)** — a document that uses Monolio's features one after another.
Download it and open it in Monolio to edit it too. ([Japanese version of the tour](https://woodencaliper.github.io/Monolio/sample/monolio-features.html))

## Download

**[Get the release → GitHub Releases](https://github.com/woodenCaliper/Monolio/releases)**

Pick the file for your environment from the **Assets** of a release.

| Environment | File | How to use |
|---|---|---|
| Windows 10 / 11 | `Monolio_<version>_x64-setup.exe` | Run it to install. The app is not signed, so Windows may show a warning (SmartScreen) the first time. Choose "More info" → "Run anyway" |
| Ubuntu and other Debian-based systems | `Monolio_<version>_amd64.deb` | Install with `sudo apt install ./Monolio_<version>_amd64.deb`. Remove with `sudo apt remove monolio` |
| Source code | Source code (zip / tar.gz) | The source for that version ([How to get the source code](#how-to-get-the-source-code)) |

You do not need to install anything just to read a saved document (HTML). Open it in a browser.
To run it from source, see [Run and build](#run-and-build).

## What you can do

Write technical documents, design notes, procedures, and research logs as if assembling blocks.
A saved HTML file opens as it is in a browser, and opening it in Monolio lets you keep editing.
Saving and viewing documents does not need any cloud service.

### Keep the document and its attachments together

Text, images, videos, PDFs, and other attachments can be stored inside the HTML of the document.
You can also attach and hand over files a browser cannot show directly, such as CAD data.
A recipient can read the document in a browser and take out the attachments without installing Monolio.

### Build text from blocks

Combine headings, paragraphs, bulleted lists, numbered lists, checkboxes, quotes, code, dividers, and toggles.
Type with slash commands or Markdown-style shortcuts, and drag blocks to reorder them.
You can also paste with formatting from Notion, Google Docs, web pages, and more.

### Calculate in tables and turn them into charts

Tables support merged cells, adding, removing, and sorting rows and columns, adjusting widths and heights, number formats, and filtering.
You can calculate with the four arithmetic operations, functions such as `SUM`, `AVERAGE`, and `IF`, and cell and range references.

From the values in a table you can draw scatter plots, line charts, and histograms, and show trend lines with their equations and R².
When you change the values in the table, the chart is updated too.

### Organize as a database

You can give the columns of a table a type: text, number, date, select, check, or link.
Line up links to other documents or to pages in the same document and use the table as a list of materials.

### Add math and diagrams

Write math in the text or in its own block using part of the TeX notation.
With Mermaid you can draw flowcharts, sequence diagrams, and more from code.

A saved HTML file contains the already drawn math and diagrams, so the reader does not need to prepare any drawing library.

### Structure a long document

You can use a table of contents, links between pages, heading numbers, and captions and running numbers for figures and tables.
You can refer to headings, figures, and tables from the text, and the numbers are reassigned when you reorder things.

### Review and take in suggestions from people and AI

Without rewriting the text right away, you can put proposed changes into the document and accept or reject them while looking at the differences.
Suggestions added by people or AI can be reviewed block by block or cell by cell.
If an external tool rewrites a file you have open, the differences can be reviewed as suggestions too.

### Check the document before saving or sharing

"Check document…" (文書をチェック…) in the File menu lists broken references and links, formula errors in tables, and mistakes in charts, diagrams, and math across all pages (including pages you have not looked at and the inside of closed toggles).
Choose an item to jump to that place, and re-check after fixing. URLs outside the document are not checked (the document is never sent out). You can save even when problems remain.

### Print and export to PDF

You can print a document, or save it as a PDF with the browser's print function.
You can specify page breaks, and folded content is expanded when printing.

### Choose fonts, and embed them if needed

By default Monolio uses the fonts of the operating system.
To keep the typeface the same across environments, you can attach fonts that allow embedding and embed them in the document.

## Guide and feature tour

- [User guide](./docs/usage.md) (Japanese) — how to use each feature, shortcuts, and how to write math and charts
- [Feature tour (HTML)](https://woodencaliper.github.io/Monolio/sample/monolio-features.en.html) ([Japanese version](https://woodencaliper.github.io/Monolio/sample/monolio-features.html)) — opens right in your browser. Download it and open it in Monolio with "File → Open" to edit it too (files are in [docs/sample/](./docs/sample/))
- [Document format and guide for AI](./docs/format/index.md) — the structure of the saved HTML and the specification for adding suggestions (English)

## Run and build

### Run in a browser / as a PWA

Prepare Node.js 20 or later and npm, then run this in the folder where you got this repository.

```sh
npm ci
npm run pwa:serve
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/) in a browser.

### Build the Windows desktop app

In addition to the npm dependencies above, you need:

- Rust (stable, `x86_64-pc-windows-msvc`)
- Visual Studio Build Tools with "Desktop development with C++"
- The WebView2 runtime (included with Windows 11)

```sh
npm run tauri:build
```

Output:

- `src-tauri/target/release/Monolio.exe` — the executable
- `src-tauri/target/release/bundle/nsis/` — where the installer is written

During development, start it with `npm run tauri:dev`.
The desktop app also uses the editor in `editor-pwa/`, and opens and saves files through Tauri.
`src-tauri/stage-frontend.mjs` gathers the files for distribution and keeps test output from being bundled.

### Build the Linux desktop app

On Ubuntu and similar systems, install the following packages and then run the same `npm run tauri:build` (Linux-only settings are in `src-tauri/tauri.linux.conf.json`).

```sh
sudo apt install -y build-essential curl wget file pkg-config libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

Output:

- `src-tauri/target/release/bundle/deb/` — a .deb (install with `sudo apt install ./Monolio_1.0.0_amd64.deb`; "Monolio" appears in the menu. Remove with `sudo apt remove monolio`)
- `src-tauri/target/release/bundle/appimage/` — an AppImage (do not install it; make it executable (`chmod +x`) and start it as it is)

You can check an installed app by driving it from outside with `node src-tauri/linux-e2e.mjs /usr/bin/Monolio screenshot.png` (see [HANDOVER.md](./HANDOVER.md) §4.44 (Japanese) for the steps).

### Tests

The first time, prepare the browser used for tests.

```sh
npm run pwa:browser
npm run pwa:test
```

The tests are split into several groups and run in parallel. To run them one after another, use `npm run pwa:test:serial`.
For what is checked, see the [feature test notes](./FEATURE_TEST_CHECKLIST.md) (Japanese).

## License

Monolio is free software. You may redistribute and modify it under the terms of the **GNU General Public License, version 3 or (at your option) any later version (GPL-3.0-or-later)** (SPDX: `GPL-3.0-or-later`).

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

- There is no warranty (sections 15 to 17 of the GPL v3).
- The full license text is in [LICENSE](./LICENSE) (the official full text of the GPL v3). Inside the app you can also read it from File → "License information…" (ライセンス情報…).
- You may use it as an individual or a company, use it for work, modify it, and redistribute it for free or for a fee.
  When you distribute Monolio (the original or a modified version), pass on the GPL terms and provide the corresponding source code in accordance with the GPL.
- **The GPL does not extend to documents or other work you create with Monolio.** The contents of a document belong to whoever made it.
  However, a saved HTML file contains Monolio's script and styles (that part is GPL-3.0-or-later; the notice is in the comment at the top of the HTML).
- Source files carry `SPDX-License-Identifier: GPL-3.0-or-later`. Bundled third-party code keeps its original license.

### How to get the source code

- The latest source: this repository (<https://github.com/woodenCaliper/Monolio>).
- **The source that corresponds to a distributed build (`Monolio.exe`, the installer, `.deb`, AppImage)**: the **Source code (zip / tar.gz)** in the Assets of each version on [Releases](https://github.com/woodenCaliper/Monolio/releases).
  It contains every file needed to build, as of that version's tag (`package.json`, `package-lock.json`, `src-tauri/Cargo.lock`, `src-tauri/stage-frontend.mjs`, and so on).
  Use the Source code of a version's tag, not a branch that keeps changing.
- The build steps are in [Run and build](#run-and-build) above.

### Third-party software

Bundled third-party code, icons, and dependency libraries keep their own original licenses (they are not overridden by the license of Monolio itself).
The list, sources, and conclusions are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) (Japanese), and the notices and full license texts included in the distribution are in
[`editor-pwa/legal/THIRD_PARTY_NOTICES.txt`](./editor-pwa/legal/THIRD_PARTY_NOTICES.txt) (shared by the browser and desktop versions) and
[`src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt`](./src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt) (the Rust parts of the desktop version).

The main ones:

- **Mermaid 12.2.0**: MIT License. Copyright (c) 2014–2022 Knut Sveidqvist. Used to draw diagrams.
  [Full license text](./editor-pwa/vendor/mermaid/LICENSE). The notices for the parts contained in the bundle are in THIRD_PARTY_NOTICES above.
  What is bundled is rebuilt from the npm distribution with elkjs (EPL-2.0, which cannot be combined with the GPL) removed
  (see [`editor-pwa/vendor/mermaid/build/build-mermaid.mjs`](./editor-pwa/vendor/mermaid/build/build-mermaid.mjs) for how it is built).
  Because of this, a diagram whose layout is set to `layout: elk` is drawn with the ordinary layout (dagre).
- **Unicode Emoji 18.0 and CLDR 49**: Unicode License v3. Copyright © 1991-2026 Unicode, Inc.
  The table of emoji suggestions (`editor-pwa/emoji-data.js`) is built from these official data files with [`scripts/build-emoji-data.mjs`](./scripts/build-emoji-data.mjs).
- **Material Symbols**: Apache License 2.0. The SVGs of [Google Material Symbols](https://fonts.google.com/icons) are used for the shapes of six icons on the formatting toolbar: bold, italic, underline, strikethrough, clear formatting, and link (the full Apache-2.0 text and the notice of changes are in THIRD_PARTY_NOTICES).

## About the project

- [Purpose of the app](./APP_PURPOSE.md) (Japanese)
- [Origin of the name](./NAME_ORIGIN.md) (Japanese)

### How it is developed

Monolio is developed by its author in conversation with an AI (Claude Code).
The repository also includes the notes used for that work, as they are.

- [CLAUDE.md](./CLAUDE.md) (Japanese) — the working rules given to the AI
- [HANDOVER.md](./HANDOVER.md) (Japanese) — design premises, working procedures, and the reasons for decisions (a mark such as "§4.22" in the code refers to a section of this document)
- [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md) (Japanese) — design principles (a mark such as "P6" in the code refers to a principle in this document)
- [CHANGELOG.md](./CHANGELOG.md) (Japanese) — a detailed record of changes (the `vNNN` in a heading is the running build number)
- [FEATURE_TEST_CHECKLIST.md](./FEATURE_TEST_CHECKLIST.md) (Japanese) — how features map to tests

There are three kinds of version number: the app version (in the form `1.0.0`; the unit of a release), the build number (which goes up with every change), and the save format version (in the form `1.0`).
The bottom right of the app shows something like "v1.0.0 · build NNN".

Send bug reports and requests to [Issues](https://github.com/woodenCaliper/Monolio/issues).
