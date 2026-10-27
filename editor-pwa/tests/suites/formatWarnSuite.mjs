// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 新しい版で作られた文書を開いたときの注意(v228) ----
// ユーザー指示「ドキュメントより古い版のアプリで開いたら警告を出すような仕組みを入れてほしい」。保存形式の版(manifest の formatVersion)が
// アプリ(fmt.VERSION)より新しい文書を開くと、押すまで消えない注意を出す。同じ版・古い版の文書では出さない。
export default async function formatWarnSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const result = {};
  let opened = 0;
  const literal = (title) => ({ pages: [{ id: "FW", title, blocks: [{ id: "f1", type: "paragraph", text: "本文" }] }], fonts: [], attachments: [] });
  // version を差し替えた保存HTMLを開く(null なら今の版のまま)。
  const openWithVersion = async (title, version) => {
    let html = await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal(title));
    if (version) html = html.replace(/"formatVersion":\s*"[^"]+"/, '"formatVersion": "' + version + '"');
    const path = join(OUT, "format-warn-" + (opened += 1) + ".html");
    await writeFile(path, html, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(200);
  };
  const notice = () => fresh.evaluate(() => {
    const node = document.querySelector("#notice");
    return { shown: Boolean(node && !node.hidden), text: node?.textContent || "" };
  });
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");
    const appVersion = await fresh.evaluate(() => window.SingleHtmlFormat.VERSION);

    // 1) 版の比べ方: 数の並びとして比べる("0.8.10" は "0.8.9" より新しい)。
    result.formatVersionCompareIsNumeric = await fresh.evaluate(() => {
      const cmp = window.SingleHtmlFormat.compareFormatVersions;
      return cmp("0.8.10", "0.8.9") > 0 && cmp("0.8.9", "0.8.10") < 0 && cmp("0.8.9", "0.8.9") === 0
        && cmp("0.9", "0.8.12") > 0 && cmp("0.8", "0.8.0") === 0 && cmp("1.0.0", "0.99.99") > 0;
    });

    // 2) 新しい版の文書: 注意が出て、時間が経っても消えない(押すと消える)。文面に両方の版が入る。
    await openWithVersion("新しい版の文書", "9.0.0");
    const first = await notice();
    await fresh.waitForTimeout(4600);
    const later = await notice();
    result.newerFormatWarns = first.shown && first.text.includes("新しい版の Monolio") && first.text.includes("9.0.0") && first.text.includes(appVersion);
    result.newerFormatWarningStays = later.shown && later.text === first.text;
    await fresh.locator("#notice").click();
    await fresh.waitForTimeout(150);
    result.newerFormatWarningClosesOnClick = !(await notice()).shown;

    // 3) 保存し直すと、今の版で書く(開いたときの版を文書に持ち越さない)。
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "format-warn-saved.html");
    await (await download).saveAs(path);
    const savedVersion = ((await readFile(path, "utf8")).match(/"formatVersion":\s*"([^"]+)"/) || [])[1];
    result.resavedUsesAppFormat = savedVersion === appVersion;

    // 4) 同じ版・古い版の文書では注意を出さない。
    await openWithVersion("同じ版の文書", null);
    const same = await notice();
    await openWithVersion("古い版の文書", "0.8.1");
    const older = await notice();
    // 注意の欄は消えても前の文面が残るので、出ているか(shown)で見る。
    result.sameOrOlderFormatDoesNotWarn = !(same.shown && same.text.includes("新しい版")) && !(older.shown && older.text.includes("新しい版"));
    result.formatWarnEvidence = { appVersion, first: first.text.slice(0, 80), same: same.text.slice(0, 40), older: older.text.slice(0, 40) };
    return result;
  } finally {
    await fresh.close();
  }
}
