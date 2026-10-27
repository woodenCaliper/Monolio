// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 拡大表示で、拡大・縮小・100%・見る位置の移動ができる(2026-10-23。ユーザー要望) ----
// ユーザー「画像を細かく見たいという場面は非常に頻繁にある」。以前は画像だけが「画面に収まる大きさ」で出るだけで、
// 拡大・縮小・元の大きさ・ドラッグでの移動はできず、Mermaid の図とグラフは拡大表示そのものが無かった。保存HTMLにも無かった。
// 倍率と見る位置の決まりは fmt.attachZoomPan の1つ(エディタと保存HTMLで同じ)。画面の上の位置(getBoundingClientRect)で確かめる。
export default async function zoomViewerSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error)));
  const contentRect = (page, selector) => page.evaluate((target) => {
    const rect = document.querySelector(target).getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, selector);
  const level = (page, selector) => page.evaluate((target) => document.querySelector(target)?.textContent || "", selector);
  // ホイールで拡大したとき、カーソルの下の点が動かない(カーソルの所を中心に拡大する)
  const wheelKeepsPoint = async (page, selector, x, y) => {
    const before = await contentRect(page, selector);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(150);
    const after = await contentRect(page, selector);
    const u0 = (x - before.left) / before.width;
    const v0 = (y - before.top) / before.height;
    const u1 = (x - after.left) / after.width;
    const v1 = (y - after.top) / after.height;
    return { grew: after.width > before.width * 1.5, kept: Math.abs(u0 - u1) < 0.01 && Math.abs(v0 - v1) < 0.01, before, after };
  };
  // 2本指(Issue #258): PointerEvent(pointerType "touch")を合成して枠へ送る。実機のタッチの代わり
  const touch = (page, selector, type, id, x, y) => page.evaluate(([target, kind, pid, px, py]) => {
    document.querySelector(target).dispatchEvent(new PointerEvent(kind, { pointerId: pid, pointerType: "touch", isPrimary: pid === 11, button: 0, buttons: kind === "pointerup" ? 0 : 1, clientX: px, clientY: py, bubbles: true, cancelable: true }));
  }, [selector, type, id, x, y]);
  const pinchChecks = async (page, viewportSel, imageSel) => {
    const out = {};
    const fit0 = await contentRect(page, imageSel);
    // 指の間(500,300)を中心に、間隔 100 の2本指を 200 まで広げる → 2倍
    await touch(page, viewportSel, "pointerdown", 11, 450, 300);
    await touch(page, viewportSel, "pointerdown", 12, 550, 300);
    const u0 = (500 - fit0.left) / fit0.width;
    const v0 = (300 - fit0.top) / fit0.height;
    await touch(page, viewportSel, "pointermove", 11, 400, 300);
    await touch(page, viewportSel, "pointermove", 12, 600, 300);
    const big = await contentRect(page, imageSel);
    out.grew = Math.abs(big.width / fit0.width - 2) < 0.02;
    out.centered = Math.abs((500 - big.left) / big.width - u0) < 0.01 && Math.abs((300 - big.top) / big.height - v0) < 0.01;
    // 2本指のまま 50px 右・30px 下へ動かす → 位置だけ動く(拡大率は同じ)
    await touch(page, viewportSel, "pointermove", 11, 450, 330);
    await touch(page, viewportSel, "pointermove", 12, 650, 330);
    const moved = await contentRect(page, imageSel);
    out.panned = Math.abs(moved.width - big.width) < 0.5 && Math.abs(moved.left - big.left - 50) < 1 && Math.abs(moved.top - big.top - 30) < 1;
    // 指を離す(1本ずつ)。ピンチの終わりで閉じない(背景の上で click も届ける)
    await touch(page, viewportSel, "pointerup", 12, 650, 330);
    await touch(page, viewportSel, "pointerup", 11, 450, 330);
    await page.evaluate((target) => document.querySelector(target).dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 })), viewportSel);
    out.staysOpen = await page.locator(viewportSel).isVisible();
    // 1本指のドラッグは今まで通り(ピンチの後でも)
    const beforeDrag = await contentRect(page, imageSel);
    await touch(page, viewportSel, "pointerdown", 21, 300, 300);
    await touch(page, viewportSel, "pointermove", 21, 320, 300);
    await touch(page, viewportSel, "pointermove", 21, 340, 310);
    await touch(page, viewportSel, "pointerup", 21, 340, 310);
    const afterDrag = await contentRect(page, imageSel);
    out.oneFingerDrag = Math.abs(afterDrag.left - beforeDrag.left - 40) < 1 && Math.abs(afterDrag.top - beforeDrag.top - 10) < 1;
    // 新しいピンチ: 狭める → 縮む
    await touch(page, viewportSel, "pointerdown", 31, 400, 300);
    await touch(page, viewportSel, "pointerdown", 32, 600, 300);
    await touch(page, viewportSel, "pointermove", 31, 470, 300);
    await touch(page, viewportSel, "pointermove", 32, 530, 300);
    const small = await contentRect(page, imageSel);
    out.shrank = Math.abs(small.width / afterDrag.width - 0.3) < 0.02;
    // 極端に広げても上限(ホイールと同じ。fit と 1 の大きいほうの 8 倍)を超えず、狭めても下限(fit と 1 の小さいほうの 1/4)を割らない
    await touch(page, viewportSel, "pointermove", 31, 0, 300);
    await touch(page, viewportSel, "pointermove", 32, 1200, 300);
    const max = await contentRect(page, imageSel);
    await touch(page, viewportSel, "pointermove", 31, 600, 300);
    await touch(page, viewportSel, "pointermove", 32, 601, 300);
    const min = await contentRect(page, imageSel);
    out.limits = Math.abs(max.width - 1600 * 8) < 2 && Math.abs(min.width - fit0.width / 4) < 2;
    out.limitEvidence = JSON.stringify({ fit: fit0.width, max: max.width, min: min.width });
    await touch(page, viewportSel, "pointerup", 32, 601, 300);
    await touch(page, viewportSel, "pointerup", 31, 600, 300);
    // 拡大表示の中はページのピンチを止める(touch-action: none)
    out.touchActionNone = await page.evaluate((target) => getComputedStyle(document.querySelector(target)).touchAction === "none", viewportSel);
    return out;
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    // 文書: 表とグラフ・Mermaid の図・空の段落(画像を貼る所)
    const literal = { pages: [{ id: "P", title: "拡大表示", blocks: [
      { id: "t1", type: "table", tableHeader: true, rows: [[{ text: "x" }, { text: "y" }], [{ text: "1" }, { text: "2" }], [{ text: "2" }, { text: "5" }], [{ text: "3" }, { text: "4" }]] },
      { id: "c1", type: "chart", text: 'table(id="t1")\nplot(A2:A4, B2:B4, label="測定")\ntitle("拡大の確認")' },
      { id: "m1", type: "mermaid", text: "flowchart LR\n  A[開始] --> B{判定}\n  B -->|はい| C[記録]\n  B -->|いいえ| D[やり直し]" },
      { id: "p1", type: "paragraph", text: "" },
    ] }], fonts: [], attachments: [] };
    const docPath = join(OUT, "zoom-viewer.html");
    await writeFile(docPath, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(docPath);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "拡大表示", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForSelector(".mermaid-canvas svg", { timeout: 15000 }).catch(() => {});
    // 画面より大きい画像(1600x1000)を貼る
    await fresh.locator('#blocks .block-content[data-id="p1"]').click();
    await fresh.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1000;
      const draw = canvas.getContext("2d");
      for (let i = 0; i < 1600; i += 40) { draw.fillStyle = "hsl(" + i / 5 + ",70%,50%)"; draw.fillRect(i, 0, 40, 1000); }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "big.png", { type: "image/png" }));
      document.querySelector('#blocks .block-content[data-id="p1"]').dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.locator("img.attachment-image").waitFor({ state: "visible" });
    await fresh.waitForFunction(() => document.querySelector("img.attachment-image")?.naturalWidth === 1600);

    // 1) 画像: 開くと画面に収まる大きさ。ホイールでカーソルの所を中心に拡大
    await fresh.locator(".image-attachment-stage").dblclick();
    await fresh.locator("#image-lightbox").waitFor({ state: "visible" });
    await fresh.waitForFunction(() => /^\d+%$/.test(document.querySelector("#image-lightbox-level")?.textContent || ""));
    const fitted = await contentRect(fresh, "#image-lightbox-image");
    const fitLevel = await level(fresh, "#image-lightbox-level");
    result.zoomImageOpensFitted = fitted.width < 1280 && fitted.height < 800 && fitted.left > 0 && fitted.top > 0
      && Math.abs(fitted.width / fitted.height - 1.6) < 0.02 && Number.parseInt(fitLevel, 10) < 100;
    const wheel = await wheelKeepsPoint(fresh, "#image-lightbox-image", 500, 350);
    result.zoomImageWheelZoomsAtCursor = wheel.grew && wheel.kept;
    // 2) 拡大した画像はドラッグで見る位置が動き、ドラッグの終わりで閉じない
    const beforeDrag = await contentRect(fresh, "#image-lightbox-image");
    await fresh.mouse.move(640, 400);
    await fresh.mouse.down();
    await fresh.mouse.move(540, 340, { steps: 6 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
    const afterDrag = await contentRect(fresh, "#image-lightbox-image");
    result.zoomImageDragPans = Math.abs(afterDrag.left - beforeDrag.left + 100) < 2 && Math.abs(afterDrag.top - beforeDrag.top + 60) < 2
      && await fresh.locator("#image-lightbox").isVisible();
    result.zoomImageDragEvidence = JSON.stringify({ beforeDrag, afterDrag });
    // 3) ダブルクリックで 100% と、画面に収まる大きさを行き来する
    await fresh.mouse.dblclick(640, 400);
    await fresh.waitForTimeout(150);
    const actualRect = await contentRect(fresh, "#image-lightbox-image");
    const actualLevel = await level(fresh, "#image-lightbox-level");
    await fresh.mouse.dblclick(640, 400);
    await fresh.waitForTimeout(150);
    const backRect = await contentRect(fresh, "#image-lightbox-image");
    result.zoomImageDoubleClickToggles = Math.abs(actualRect.width - 1600) < 1 && actualLevel === "100%"
      && Math.abs(backRect.width - fitted.width) < 1 && await level(fresh, "#image-lightbox-level") === fitLevel;
    result.zoomImageDoubleClickEvidence = JSON.stringify({ actualWidth: actualRect.width, actualLevel, backWidth: backRect.width, fitWidth: fitted.width, fitLevel });
    // 4) ボタンとキー: + で拡大、Fit で戻る、100% で元の大きさ、キーの 1 と 0
    await fresh.locator("#image-lightbox-zoom-in").click();
    const zoomedIn = await contentRect(fresh, "#image-lightbox-image");
    await fresh.locator("#image-lightbox-fit").click();
    const fitAgain = await contentRect(fresh, "#image-lightbox-image");
    await fresh.locator("#image-lightbox-actual").click();
    const actualByButton = await contentRect(fresh, "#image-lightbox-image");
    await fresh.keyboard.press("0");
    const fitByKey = await contentRect(fresh, "#image-lightbox-image");
    await fresh.keyboard.press("1");
    const actualByKey = await contentRect(fresh, "#image-lightbox-image");
    await fresh.keyboard.press("-");
    const smallerByKey = await contentRect(fresh, "#image-lightbox-image");
    result.zoomImageButtonsAndKeys = Math.abs(zoomedIn.width - fitted.width * 1.25) < 1 && Math.abs(fitAgain.width - fitted.width) < 1
      && Math.abs(actualByButton.width - 1600) < 1 && Math.abs(fitByKey.width - fitted.width) < 1 && Math.abs(actualByKey.width - 1600) < 1
      && Math.abs(smallerByKey.width - 1280) < 1;
    // 5) 背景を押すと閉じ、閉じたら倍率の付けた形は残らない
    await fresh.keyboard.press("0");
    await fresh.mouse.click(8, 400);
    await fresh.waitForTimeout(150);
    result.zoomImageBackdropCloses = !(await fresh.locator("#image-lightbox").isVisible())
      && await fresh.evaluate(() => !document.querySelector("#image-lightbox-image").style.transform);
    // 狭い画面(800px)でも、道具と閉じるボタンが重ならずに出る
    await fresh.setViewportSize({ width: 800, height: 700 });
    await fresh.locator(".image-attachment-stage").dblclick();
    await fresh.locator("#image-lightbox").waitFor({ state: "visible" });
    await fresh.waitForTimeout(150);
    const narrow = await fresh.evaluate(() => {
      const bar = document.querySelector("#image-lightbox-bar").getBoundingClientRect();
      const close = document.querySelector("#image-lightbox-close").getBoundingClientRect();
      const image = document.querySelector("#image-lightbox-image").getBoundingClientRect();
      return { barRight: bar.right, closeLeft: close.left, barLeft: bar.left, imageWidth: image.width };
    });
    result.zoomNarrowToolbarFits = narrow.barRight <= narrow.closeLeft && narrow.barLeft >= 0 && narrow.imageWidth <= 800;
    await fresh.keyboard.press("Escape");
    await fresh.setViewportSize({ width: 1280, height: 800 });

    // 6) グラフ: ダブルクリックで拡大表示(SVG の写し)。ホイールで拡大できる。元のグラフはそのまま
    await fresh.locator('#blocks .block[data-id="c1"] .chart-canvas').dblclick();
    await fresh.locator("#image-lightbox").waitFor({ state: "visible" });
    await fresh.waitForTimeout(150);
    const chartOpen = await fresh.evaluate(() => ({
      svg: Boolean(document.querySelector("#image-lightbox-svg:not([hidden]) svg.chart-svg")),
      imageHidden: document.querySelector("#image-lightbox-image").hidden,
      label: document.querySelector("#image-lightbox").getAttribute("aria-label"),
      original: document.querySelectorAll('#blocks .block[data-id="c1"] .chart-canvas svg').length,
    }));
    const chartWheel = await wheelKeepsPoint(fresh, "#image-lightbox-svg", 640, 400);
    result.zoomChartOpens = chartOpen.svg && chartOpen.imageHidden && chartOpen.label === "Chart preview" && chartOpen.original === 1;
    result.zoomChartWheelZooms = chartWheel.grew && chartWheel.kept;
    await fresh.keyboard.press("Escape");
    result.zoomChartClosesClean = await fresh.evaluate(() => document.querySelector("#image-lightbox").hidden && !document.querySelector("#image-lightbox-svg").children.length);

    // 7) Mermaid の図: ダブルクリックで拡大表示
    const mermaidCanvas = fresh.locator('#blocks .block[data-id="m1"] .mermaid-canvas');
    await mermaidCanvas.dblclick();
    await fresh.locator("#image-lightbox").waitFor({ state: "visible" });
    await fresh.waitForTimeout(150);
    const mermaidOpen = await fresh.evaluate(() => ({
      svg: Boolean(document.querySelector("#image-lightbox-svg:not([hidden]) svg")),
      label: document.querySelector("#image-lightbox").getAttribute("aria-label"),
    }));
    const mermaidWheel = await wheelKeepsPoint(fresh, "#image-lightbox-svg", 640, 400);
    result.zoomMermaidOpensAndZooms = mermaidOpen.svg && mermaidOpen.label === "Diagram preview" && mermaidWheel.grew && mermaidWheel.kept;
    await fresh.keyboard.press("Escape");

    // 7b) 2本指のピンチ(エディタの拡大表示)
    const pageTouch = () => fresh.evaluate(() => JSON.stringify([document.documentElement.style.touchAction, document.body.style.touchAction, getComputedStyle(document.body).touchAction]));
    const pageTouchBefore = await pageTouch();
    await fresh.locator(".image-attachment-stage").dblclick();
    await fresh.locator("#image-lightbox").waitFor({ state: "visible" });
    await fresh.waitForTimeout(150);
    const editorPinch = await pinchChecks(fresh, "#image-lightbox", "#image-lightbox-image");
    result.zoomEditorPinchZoomsAtMidpoint = editorPinch.grew && editorPinch.centered && editorPinch.shrank;
    result.zoomEditorPinchPans = editorPinch.panned;
    result.zoomEditorPinchLimitsSameAsWheel = editorPinch.limits;
    result.zoomEditorPinchDoesNotClose = editorPinch.staysOpen;
    result.zoomEditorOneFingerStillDrags = editorPinch.oneFingerDrag;
    result.zoomEditorViewerBlocksPagePinch = editorPinch.touchActionNone;
    result.zoomEditorPinchEvidence = editorPinch.limitEvidence;
    await fresh.keyboard.press("Escape");
    result.zoomPagePinchUntouchedAfterClose = await pageTouch() === pageTouchBefore;

    // 8) 保存HTML: ブラウザで開いても、画像・グラフ・図をダブルクリックで拡大表示でき、ホイール・ドラッグ・Esc が効く
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "zoom-viewer-saved.html");
    await (await download).saveAs(savedPath);
    const saved = await readFile(savedPath, "utf8");
    const viewer = await context.newPage();
    viewer.on("pageerror", (error) => pageErrors.push("saved: " + String(error)));
    await viewer.setViewportSize({ width: 1280, height: 800 });
    await viewer.goto(pathToFileURL(savedPath).href);
    await viewer.waitForFunction(() => document.querySelector("figure.image-attachment img")?.naturalWidth === 1600, null, { timeout: 10000 }).catch(() => {});
    await viewer.locator("figure.image-attachment img").dblclick();
    await viewer.locator(".doc-zoom").waitFor({ state: "visible" });
    const savedFit = await contentRect(viewer, ".doc-zoom > img");
    const savedWheel = await wheelKeepsPoint(viewer, ".doc-zoom > img", 500, 350);
    await viewer.mouse.move(640, 400);
    await viewer.mouse.down();
    await viewer.mouse.move(560, 360, { steps: 5 });
    await viewer.mouse.up();
    const savedDragged = await contentRect(viewer, ".doc-zoom > img");
    result.zoomSavedImageZoomsAndPans = savedFit.width < 1280 && savedWheel.grew && savedWheel.kept
      && Math.abs(savedDragged.left - savedWheel.after.left + 80) < 2 && await viewer.locator(".doc-zoom").isVisible();
    await viewer.keyboard.press("Escape");
    const savedClosed = await viewer.evaluate(() => document.querySelector(".doc-zoom").hidden && !document.querySelector(".doc-zoom > img"));
    await viewer.locator(".doc-chart-canvas:not(.doc-mermaid-canvas)").first().dblclick();
    await viewer.locator(".doc-zoom").waitFor({ state: "visible" });
    const savedChart = await viewer.evaluate(() => {
      const svg = document.querySelector(".doc-zoom .doc-zoom-svg svg.chart-svg");
      const tick = svg?.querySelector(".chart-tick");
      return { svg: Boolean(svg), tickFill: tick ? getComputedStyle(tick).fill : "" };
    });
    await viewer.keyboard.press("Escape");
    await viewer.locator(".doc-mermaid-canvas").first().dblclick();
    await viewer.locator(".doc-zoom").waitFor({ state: "visible" });
    const savedMermaid = await viewer.evaluate(() => Boolean(document.querySelector(".doc-zoom .doc-zoom-svg svg")));
    await viewer.keyboard.press("Escape");
    // 保存HTMLでも2本指のピンチ。閉じたあとはページの touch-action を変えず、viewport の拡大も止めていない
    const savedPageTouch = () => viewer.evaluate(() => JSON.stringify([document.documentElement.style.touchAction, document.body.style.touchAction, getComputedStyle(document.body).touchAction]));
    const savedTouchBefore = await savedPageTouch();
    await viewer.locator("figure.image-attachment img").dblclick();
    await viewer.locator(".doc-zoom").waitFor({ state: "visible" });
    const savedPinch = await pinchChecks(viewer, ".doc-zoom", ".doc-zoom > img");
    result.zoomSavedPinchZoomsPansAndLimits = savedPinch.grew && savedPinch.centered && savedPinch.panned && savedPinch.shrank && savedPinch.limits;
    result.zoomSavedPinchDoesNotClose = savedPinch.staysOpen && savedPinch.oneFingerDrag;
    result.zoomSavedViewerBlocksPagePinch = savedPinch.touchActionNone;
    result.zoomSavedPinchEvidence = savedPinch.limitEvidence;
    await viewer.keyboard.press("Escape");
    result.zoomSavedPagePinchUntouchedAfterClose = await savedPageTouch() === savedTouchBefore
      && await viewer.evaluate(() => !/user-scalable=no|maximum-scale/.test(document.querySelector('meta[name="viewport"]')?.content || ""));
    await viewer.close();
    // グラフの字の色は保存HTMLの決まり(.doc-chart .chart-tick)のまま(写しを .doc-chart で包む)
    result.zoomSavedChartAndDiagram = savedClosed && savedChart.svg && savedChart.tickFill === "rgb(107, 112, 120)" && savedMermaid;
    result.zoomSavedEvidence = JSON.stringify({ savedFit: Math.round(savedFit.width), savedChart });
    // 画像・図・グラフの無い文書には、拡大表示のスクリプトを足さない(出力は変わらない)
    result.zoomRuntimeOnlyWhenNeeded = /class="doc-zoom|portableZoom|doc-zoom-bar/.test(saved)
      && await fresh.evaluate(() => !/doc-zoom/.test(window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "Q", title: "文字だけ", blocks: [{ id: "q1", type: "paragraph", text: "本文" }] }], fonts: [], attachments: [] })));
    result.zoomNoPageErrors = pageErrors.length === 0;
    result.zoomPageErrorEvidence = pageErrors.join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
