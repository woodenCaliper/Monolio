// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- AI が読みやすい保存の形(v226。形式 0.8.9) ----
// ユーザー「AIにこのHTMLを大量に読ませる構成を作りたい…人間用とAI用はあくまで表示が違うだけで内容の意味などは変わらないようにしたい」
// 「原理的には1つでいい」→ 写しを増やさず、中身の正(manifest の JSON)をファイルの先頭へ寄せ、図の絵の重複(manifest と本文の両方に
// 入っていた SVG)をやめて本文の1か所だけにした。表の計算結果・図表と見出しの番号は、人間用の表示と同じ値を derived として添える
// (開くときは捨てる)。先頭の注釈は「AI の方へ」ではなく、ファイルの構成の事実だけを英語で(ユーザー決定)。
export default async function aiReadableSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  let saved = 0;
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  // アプリの保存(Ctrl+S)と同じ経路で書き出したファイルの中身
  const saveHtml = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "ai-readable-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    return readFile(path, "utf8");
  };
  const literal = { settings: { headingNumbers: true }, pages: [{ id: "AI", title: "AI 読み", blocks: [
    { id: "h1", type: "heading1", text: "売上" },
    { id: "h2", type: "heading2", text: "月別" },
    { id: "t1", type: "table", caption: "月別の売上", rows: [
      [{ text: "月" }, { text: "A" }, { text: "B" }, { text: "合計" }],
      [{ text: "1月" }, { text: "120" }, { text: "80" }, { text: "=B2+C2" }],
      [{ text: "2月" }, { text: "150" }, { text: "95" }, { text: "=B3+C3" }],
    ] },
    { id: "c1", type: "chart", caption: "売上のグラフ", text: 'table(id="t1")\nbar(A2:A3, B2:B3, label="A")' },
    { id: "m1", type: "mermaid", caption: "流れ", text: "flowchart LR\n  P[受注] --> Q[出荷]" },
    { id: "p1", type: "paragraph", text: "表は 表1 を参照。", html: '表は <span class="figure-ref" data-ref="t1">表1</span> を参照。' },
  ] }], fonts: [], attachments: [] };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await openLiteral(literal, "ai-readable-source.html");
    // 図が描けるのを待つ(グラフと Mermaid の絵が画面に出るまで)
    await fresh.waitForFunction(() => document.querySelector("#blocks .block.type-mermaid svg") && document.querySelector("#blocks .block.type-chart .chart-canvas svg"), null, { timeout: 20000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    const html = await saveHtml();
    const info = await fresh.evaluate((text) => {
      const view = new DOMParser().parseFromString(text, "text/html");
      const manifestNode = view.querySelector("#document-manifest");
      const manifest = JSON.parse(manifestNode.textContent);
      const blocks = manifest.pages.flatMap((page) => page.blocks);
      const byId = Object.fromEntries(blocks.map((block) => [block.id, block]));
      const table = view.querySelector("table.doc-table");
      return {
        manifestInHead: manifestNode.parentElement?.tagName === "HEAD",
        blocks: byId,
        bodySvgFor: [...view.querySelectorAll("[data-svg-for]")].map((node) => node.getAttribute("data-svg-for") + ":" + Boolean(node.querySelector(":scope > svg"))),
        tableShown: [...table.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => cell.textContent)),
        captionsShown: [...view.querySelectorAll(".doc-caption-label")].map((node) => node.textContent.replace(/[:：]\s*$/, "")),
        headingNumbersShown: [...view.querySelectorAll(".heading-number")].map((node) => node.textContent),
      };
    }, html);
    // 1) 先頭は構成の注釈、その直後(<head> の先頭)に中身の JSON。CSS・本文より前
    const manifestAt = html.indexOf('id="document-manifest"');
    result.aiLayoutNoteAtTop = html.startsWith("<!doctype html>\n<!--\nMonolio document") && !/For AI|AI の方へ/.test(html.slice(0, manifestAt));
    result.aiManifestBeforeStyleAndBody = info.manifestInHead && manifestAt < html.indexOf("<style>") && manifestAt < html.indexOf("<body>");
    // 2) 図の絵は本文の1か所だけ(manifest には持たない)
    result.aiManifestHasNoDiagramPictures = !("mermaidSvg" in info.blocks.m1) && !("chartSvg" in info.blocks.c1)
      && JSON.stringify(info.blocks).indexOf("<svg") < 0
      && info.bodySvgFor.includes("m1:true") && info.bodySvgFor.includes("c1:true");
    // 3) derived は人間用の表示と同じ値(表の計算結果・図表の番号・見出しの番号)
    result.aiDerivedTableValuesMatchView = JSON.stringify(info.blocks.t1.derived?.values) === JSON.stringify(info.tableShown)
      && info.blocks.t1.derived.values[1][3] === "200" && info.blocks.t1.rows[1][3].text === "=B2+C2";
    result.aiDerivedLabelsMatchView = [info.blocks.t1, info.blocks.c1, info.blocks.m1].map((block) => block.derived?.label).join(",") === "表1,図1,図2"
      && ["表1", "図1", "図2"].every((label) => info.captionsShown.includes(label));
    result.aiDerivedHeadingNumbersMatchView = info.blocks.h1.derived?.number === "1" && info.blocks.h2.derived?.number === "1.1"
      && info.headingNumbersShown.join(",") === "1,1.1";
    result.aiReadableEvidence = { bodySvgFor: info.bodySvgFor, captions: info.captionsShown, headings: info.headingNumbersShown, values: info.blocks.t1.derived?.values };

    // 4) 開くときは derived を捨て、図の絵は本文から拾う。derived を書き換えたファイルでも、開き直して保存すると正しい値に戻る
    const reopened = await fresh.evaluate((text) => {
      const parsed = window.SingleHtmlFormat.parsePortableHtml(text);
      const blocks = parsed.pages.flatMap((page) => page.blocks);
      const byId = Object.fromEntries(blocks.map((block) => [block.id, block]));
      return {
        noDerived: blocks.every((block) => !("derived" in block)),
        mermaidSvg: String(byId.m1.mermaidSvg || "").startsWith("<svg"),
        chartSvg: String(byId.c1.chartSvg || "").startsWith("<svg"),
      };
    }, html);
    result.aiOpenDropsDerivedAndTakesPicturesFromBody = reopened.noDerived && reopened.mermaidSvg && reopened.chartSvg;
    const forged = html.replace('"200"', '"999"');
    const forgedPath = join(OUT, "ai-readable-forged.html");
    await writeFile(forgedPath, forged, "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(forgedPath);
    await fresh.waitForTimeout(800);
    const resaved = await saveHtml();
    const resavedValue = await fresh.evaluate((text) => {
      const manifest = JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent);
      return manifest.pages[0].blocks.find((block) => block.id === "t1").derived?.values?.[1]?.[3];
    }, resaved);
    result.aiForgedDerivedIsRecomputed = forged.includes('"999"') && resavedValue === "200";

    // 5) 古い形(0.8.8。manifest に絵がある)も、そのまま絵を使って開ける
    const oldOpens = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';
      const html = fmt.buildPortableHtml({ pages: [{ id: "O", title: "Old", blocks: [{ id: "om", type: "mermaid", text: "flowchart LR\n  A --> B", mermaidSvg: svg }] }], fonts: [], attachments: [] })
        .replace('"formatVersion": "' + window.SingleHtmlFormat.VERSION + '"', '"formatVersion": "0.8.8"')
        .replace(/ data-svg-for="om"/, "")
        .replace('"id": "om",', () => '"id": "om",\n          "mermaidSvg": ' + JSON.stringify(svg) + ",");
      const parsed = fmt.parsePortableHtml(html);
      return html.includes('"0.8.8"') && String(parsed.pages[0].blocks[0].mermaidSvg || "").includes("<rect");
    });
    result.aiOldFormatWithPicturesInManifestOpens = oldOpens;
    // 6) 本文の絵に HTML の部品(foreignObject の中の <br> など)が入っていても、絵を拾える(ほかの道具で手を入れたファイル)。
    //    HTML の書き方(outerHTML)で取り出すと <br> が閉じずに XML として読めず、絵が空になっていた(作っている途中に見つけた)。
    //    無害化で foreignObject は中身ごと捨て、残りの絵は使う。
    result.aiBodyPictureWithHtmlPartsSurvives = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      const plain = '<svg xmlns="http://www.w3.org/2000/svg" id="pagelith-mermaid-fo" viewBox="0 0 10 10"><text x="1" y="5">KEEP</text></svg>';
      const tampered = '<svg xmlns="http://www.w3.org/2000/svg" id="pagelith-mermaid-fo" viewBox="0 0 10 10"><foreignObject width="5" height="5"><div xmlns="http://www.w3.org/1999/xhtml">x<br>y</div></foreignObject><text x="1" y="5">KEEP</text></svg>';
      const html = fmt.buildPortableHtml({ pages: [{ id: "F", title: "Fo", blocks: [{ id: "fm", type: "mermaid", text: "flowchart LR\n  A --> B", mermaidSvg: plain }] }], fonts: [], attachments: [] })
        .replace(/(data-svg-for="fm">)<svg[\s\S]*?<\/svg>/, (match, open) => open + tampered);
      const parsed = String(fmt.parsePortableHtml(html).pages[0].blocks[0].mermaidSvg || "");
      return html.includes("<br>") && parsed.includes("KEEP") && !parsed.includes("foreignObject");
    });

    // 7) 全角の「＝」や先頭に空白のある式しか無い表にも、計算結果(derived.values)を添える。式かどうかの判定がアプリ
    //    (isTableFormula。trim して全角も扱う)と違い、半角の「=」で始まるセルが無い表には values が付かなかった(v226 の確認で発見)
    // 8) 一度も画面に出していないページの表も、整えた形(行の長さをそろえた形)で manifest に書く。manifest を本文より先に
    //    組み立てたため、整える前の rows が書かれ、本文の表示・2回目の保存と食い違っていた(v226 の確認で発見)
    const quirky = { pages: [
      { id: "Q1", title: "全角の式", blocks: [
        { id: "qt", type: "table", caption: "全角", rows: [[{ text: "x" }, { text: "＝1+2" }], [{ text: "y" }, { text: " =3+4" }]] },
      ] },
      { id: "Q2", title: "見ていないページ", blocks: [
        { id: "rt", type: "table", rows: [[{ text: "a" }, { text: "b" }, { text: "c" }], [{ text: "d" }]] },
      ] },
    ], fonts: [], attachments: [] };
    await openLiteral(quirky, "ai-readable-quirky.html");
    const quirkyHtml = await saveHtml();
    const quirkyInfo = await fresh.evaluate((text) => {
      const manifest = JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent);
      const blocks = Object.fromEntries(manifest.pages.flatMap((page) => page.blocks).map((block) => [block.id, block]));
      return { values: blocks.qt.derived?.values, rowLengths: blocks.rt.rows.map((row) => row.length) };
    }, quirkyHtml);
    result.aiDerivedValuesForFullWidthFormulas = JSON.stringify(quirkyInfo.values) === JSON.stringify([["x", "3"], ["y", "7"]]);
    result.aiManifestTablesAreNormalized = JSON.stringify(quirkyInfo.rowLengths) === JSON.stringify([3, 3]);
    result.aiQuirkyEvidence = quirkyInfo;
    return result;
  } finally {
    await fresh.close();
  }
}
