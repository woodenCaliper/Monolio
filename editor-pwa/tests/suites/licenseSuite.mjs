// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { PORT } from "../lib.mjs";

// ---- ライセンス表記(Issue #234) ----
// 本体は GPL-3.0-or-later。次を見張る(公開するファイルの中身がそのまま公開物になるので、抜け・食い違いを赤にする):
//   LICENSE(GPL v3 の全文)と配る場所の写し(editor-pwa/legal/LICENSE.txt)が同じ・package.json と Cargo.toml の license・README の
//   「または それ以降」「著作権表示」「無保証」「ソースの入手方法」・本体のソースの SPDX の表記(同梱のライブラリには付けない)・
//   ライセンスのファイルが配る場所(Service Worker の一覧・デスクトップ版の stage-frontend)の全部に入っている・第三者の表記が
//   同梱の Mermaid の版と食い違わない・アプリの中(File → ライセンス情報…)から全文と第三者の表記が読める(1280px と 800px)・
//   保存HTMLの先頭の注釈に本体のライセンスの表記があり、図のある文書にだけ Mermaid の表記が足される。
const read = (path) => readFile(resolve(path), "utf8");

async function sourceFiles() {
  const files = [];
  for (const name of await readdir(resolve("editor-pwa"))) {
    if (/\.(js|mjs|css|html)$/.test(name) && name !== "emoji-data.js") files.push("editor-pwa/" + name);
  }
  const walk = async (dir) => {
    for (const entry of await readdir(resolve(dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== "fixtures" && entry.name !== "fonts") await walk(dir + "/" + entry.name);
      } else if (entry.name.endsWith(".mjs")) files.push(dir + "/" + entry.name);
    }
  };
  await walk("editor-pwa/tests");
  for (const name of await readdir(resolve("src-tauri"))) if (/\.(mjs|ps1)$/.test(name)) files.push("src-tauri/" + name);
  files.push("src-tauri/src/main.rs", "src-tauri/build.rs", "sample/build-sample.mjs", "editor-pwa/vendor/mermaid/build/build-mermaid.mjs");
  return files;
}

export default async function licenseSuite({ context }) {
  const result = {};
  // 1) 全文と写し
  const [gpl, gplCopy, pkg, cargo, readme, notices, desktopNotices, worker, stage, mermaid, mermaidLicense] = await Promise.all([
    read("LICENSE"), read("editor-pwa/legal/LICENSE.txt"), read("package.json"), read("src-tauri/Cargo.toml"), read("README.md"),
    read("editor-pwa/legal/THIRD_PARTY_NOTICES.txt"), read("src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt"),
    read("editor-pwa/service-worker.js"), read("src-tauri/stage-frontend.mjs"), read("editor-pwa/vendor/mermaid/mermaid.min.js"),
    read("editor-pwa/vendor/mermaid/LICENSE"),
  ]);
  result.licenseIsGplV3FullText = /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(gpl)
    && gpl.includes("END OF TERMS AND CONDITIONS") && gpl.includes("How to Apply These Terms to Your New Programs");
  result.licenseCopyForDistributionIsIdentical = gpl === gplCopy;
  result.licenseManifestsSayGplOrLater = JSON.parse(pkg).license === "GPL-3.0-or-later" && /^license = "GPL-3\.0-or-later"$/m.test(cargo);
  // 2) README(「GPL v3 全文を置くだけで or later を済ませない」)
  result.licenseReadmeStatesOrLaterCopyrightWarrantySource = readme.includes("GPL-3.0-or-later") && readme.includes("またはそれ以降")
    && readme.includes("either version 3 of the License, or") && readme.includes("(at your option) any later version")
    && readme.includes("Copyright (C) woodenCaliper") && readme.includes("無保証") && readme.includes("./LICENSE")
    && readme.includes("THIRD_PARTY_NOTICES.md") && readme.includes("Source code");
  // 3) SPDX は本体のソースに付ける。同梱のライブラリ(第三者)には付けない
  const files = await sourceFiles();
  const missing = [];
  for (const file of files) {
    const head = (await read(file)).slice(0, 400);
    if (!head.includes("SPDX-License-Identifier: GPL-3.0-or-later")) missing.push(file);
  }
  result.licenseSpdxOnOwnSources = files.length > 150 && missing.length === 0;
  result.licenseSpdxMissing = missing.slice(0, 10).join(", ");
  result.licenseVendorCodeKeepsOwnLicense = !mermaid.includes("SPDX-License-Identifier: GPL-3.0-or-later") && !mermaidLicense.includes("GPL")
    && mermaidLicense.startsWith("The MIT License (MIT)") && mermaidLicense.includes("Knut Sveidqvist");
  // 4) 配る場所の全部に入っている(Service Worker の一覧・デスクトップ版の stage-frontend)
  const web = ["legal/LICENSE.txt", "legal/THIRD_PARTY_NOTICES.txt"];
  const shippedFiles = await Promise.all([...web.map((path) => stat(resolve("editor-pwa", path))), stat(resolve("src-tauri/legal/DESKTOP_THIRD_PARTY_NOTICES.txt"))]);
  result.licenseFilesExist = shippedFiles.length === 3 && shippedFiles.every((info) => info.size > 1000);
  result.licenseInServiceWorkerList = web.every((path) => worker.includes('"./' + path + '"')) && worker.includes('"./vendor/mermaid/LICENSE"');
  result.licenseInDesktopStage = web.every((path) => stage.includes('"' + path + '"')) && stage.includes('"vendor/mermaid/LICENSE"')
    && stage.includes('"legal/DESKTOP_THIRD_PARTY_NOTICES.txt"') && stage.includes("src-tauri");
  // 5) 第三者の表記は、同梱している Mermaid の版・バンドルの部品・Apache の全文を持つ
  const bundledVersion = /\{version:"(\d+\.\d+\.\d+)"\},\w+=\w+\(\(\)=>\w+\.version/.exec(mermaid)?.[1] ?? "";
  result.licenseNoticeMatchesBundledMermaid = bundledVersion !== "" && notices.includes("Mermaid " + bundledVersion) && readme.includes("Mermaid " + bundledVersion);
  result.licenseNoticeListsBundledParts = ["dompurify", "lodash-es", "d3-shape", "katex", "chevrotain"].every((name) => notices.includes(name + " "))
    && notices.includes("Apache License") && notices.includes("Material Symbols");
  // 5b) 同梱の Mermaid に elkjs(EPL-2.0。GPL を第二ライセンスに指定していないので GPL v3 と組み合わせられない)が入っていない。
  //   npm の配布物には入っているので、作り直しのスクリプト(vendor/mermaid/build/build-mermaid.mjs)で外したものを置く。
  //   配布物をそのまま置き直すと赤になる。第三者の表記は elkjs を部品の一覧・全文に載せず、取り除いたことを書く。
  const buildScript = await read("editor-pwa/vendor/mermaid/build/build-mermaid.mjs");
  result.licenseBundledMermaidHasNoElkjs = mermaid.length > 1000000
    && ["elkjs", "org.eclipse.elk", "elk.bundled", "elk-worker", "Eclipse Public License"].every((needle) => !mermaid.includes(needle))
    && mermaid.includes("elk-layout-removed");
  result.licenseNoticeSaysElkjsRemoved = notices.includes("取り除いた部品: elkjs 0.9.3") && !/^  elkjs \d/m.test(notices)
    && !notices.includes("elkjs@0.9.3 (EPL-2.0)") && !notices.includes("Eclipse Public License - v 2.0")
    && notices.includes("build-mermaid.mjs");
  result.licenseMermaidBuildScriptMatchesBundle = buildScript.includes(`const MERMAID_VERSION = "${bundledVersion}";`)
    && /const MERMAID_INTEGRITY = "sha512-[A-Za-z0-9+/=]+";/.test(buildScript) && /const ESBUILD_VERSION = "\d+\.\d+\.\d+";/.test(buildScript);
  result.licenseDesktopNoticeListsRustParts = ["tauri ", "wry ", "tao ", "windows-sys ", "selectors ", "cssparser "].every((name) => desktopNotices.includes("  " + name))
    && desktopNotices.includes("Mozilla Public License") && desktopNotices.includes("Apache License");

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    // 6) 配る場所から読める(ブラウザ版のサーバーで 200)
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await page.waitForSelector("#blocks .block-content");
    const served = await page.evaluate(async () => {
      const out = {};
      for (const path of ["legal/LICENSE.txt", "legal/THIRD_PARTY_NOTICES.txt", "vendor/mermaid/LICENSE"]) {
        const response = await fetch(path);
        out[path] = response.ok ? (await response.text()).length : -1;
      }
      return out;
    });
    result.licenseServedToBrowser = Object.values(served).every((length) => length > 1000);
    result.licenseServedEvidence = served;

    // 7) アプリの中から読める(1280px と 800px)
    const view = async (width) => {
      await page.setViewportSize({ width, height: 800 });
      await page.locator("#menu-file-button").click();
      await page.locator("#menu-licenses").click();
      await page.waitForFunction(() => document.querySelector("#license-popover")?.dataset.licenseLoaded === "license", null, { timeout: 5000 });
      const first = await page.evaluate(() => {
        const popover = document.querySelector("#license-popover");
        const text = document.querySelector("#license-text");
        const box = popover.getBoundingClientRect();
        return {
          open: !popover.hidden, summary: popover.querySelector(".license-summary").textContent,
          gpl: text.textContent.includes("GNU GENERAL PUBLIC LICENSE") && text.textContent.includes("Version 3, 29 June 2007"),
          scrollable: text.scrollHeight > text.clientHeight + 50,
          inView: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight,
          tabs: [...popover.querySelectorAll(".license-tab")].map((tab) => tab.getAttribute("aria-selected")),
        };
      });
      await page.locator('#license-popover .license-tab[data-license-doc="third"]').click();
      await page.waitForFunction(() => document.querySelector("#license-popover")?.dataset.licenseLoaded === "third", null, { timeout: 5000 });
      const third = await page.evaluate(() => document.querySelector("#license-text").textContent);
      await page.locator('#license-popover .license-tab[data-license-doc="desktop"]').click();
      await page.waitForFunction(() => document.querySelector("#license-popover")?.dataset.licenseLoaded === "desktop", null, { timeout: 5000 });
      const desktop = await page.evaluate(() => document.querySelector("#license-text").textContent);
      await page.keyboard.press("Escape");
      const closed = await page.evaluate(() => document.querySelector("#license-popover").hidden);
      return { first, third, desktop, closed };
    };
    const wide = await view(1280);
    const narrow = await view(800);
    const ok = (state) => state.first.open && state.first.gpl && state.first.scrollable && state.first.inView
      && state.first.summary.includes("GPL-3.0-or-later") && state.first.summary.includes("woodenCaliper") && state.first.summary.includes("無保証")
      && state.first.tabs.join() === "true,false,false"
      && state.third.includes("Mermaid") && state.third.includes("Material Symbols") && state.third.includes("取り除いた部品: elkjs")
      && state.desktop.includes("デスクトップ版にだけ含まれる") && state.closed;
    result.licenseInAppDialog1280 = ok(wide);
    result.licenseInAppDialog800 = ok(narrow);
    result.licenseInAppEvidence = { wide: wide.first, narrow: narrow.first };

    // 8) 保存HTMLの先頭の注釈: 本体のライセンスの表記は常に。Mermaid の表記は図のある文書だけ
    const notes = await page.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const plain = fmt.buildPortableHtml({ pages: [{ id: "L1", title: "L", blocks: [{ id: "l1", type: "paragraph", text: "本文" }] }], fonts: [], attachments: [] });
      const diagram = fmt.buildPortableHtml({ pages: [{ id: "L2", title: "L", blocks: [{ id: "l2", type: "mermaid", text: "flowchart LR\n A-->B", mermaidSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' }] }], fonts: [], attachments: [] });
      const head = (html) => html.slice(0, html.indexOf("-->") + 3);
      return { plain: head(plain), diagram: head(diagram), plainParsed: fmt.parsePortableHtml(plain).pages[0].blocks[0].text };
    });
    result.licenseSavedHtmlNoteStatesGpl = notes.plain.includes("GPL-3.0-or-later") && notes.plain.includes("Copyright (C) woodenCaliper")
      && notes.plain.includes("not covered by that license") && notes.plain.includes("https://github.com/woodenCaliper/Monolio")
      && notes.plain.startsWith("<!doctype html>\n<!--") && !notes.plain.includes("Mermaid") && notes.plainParsed === "本文";
    result.licenseSavedHtmlNoteCreditsMermaidOnlyWithDiagram = notes.diagram.includes("Mermaid (MIT License") && notes.diagram.includes("Knut Sveidqvist");
    result.licenseNoPageErrors = errors.length === 0;
    result.licenseErrors = errors.slice(0, 3).join(" | ");
  } finally {
    await page.close();
  }
  return result;
}
