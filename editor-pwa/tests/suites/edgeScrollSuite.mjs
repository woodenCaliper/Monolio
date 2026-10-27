// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- ドラッグ中の端での自動スクロール(v151) ----
// ユーザー指示「ブロックをドラッグするときも、下のほうなどにカーソルを移動させると自動でスクロールするようにしてほしい。
// こういう系のやつは同様の機能を入れてね」。ブロックの移動・文字の選択・表のセル範囲・フィル・ファイルのドラッグで、
// 下端の近くでポインタを止めて待つと自動でスクロールし、操作の結果(落とし先・選択・範囲)が画面外まで伸びる。
export default async function edgeScrollSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 720 });
  const result = {};
  const para = (id, text) => ({ id, type: "paragraph", text });
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
    // 上端へ戻し、スクロールが止まるまで待つ(前の段の自動スクロールの位置や動きが残っていると、次の段の hover が
    // 「visible and stable」を待ち続けて落ちた。v170。松の一時的な落ちの筋)。
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await fresh.evaluate(() => window.scrollTo(0, 0));
      await fresh.waitForTimeout(150);
      if (await fresh.evaluate(() => Math.round(window.scrollY)) === 0) break;
    }
  };
  // 行の上へポインタを動かす(グリップを出すためだけ。locator.hover は要素が「stable」になるのを待つので、動いている
  // 画面では待ち続けることがある。v170)。
  const pointAt = async (locator) => {
    const box = await locator.boundingBox();
    await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await fresh.waitForTimeout(150);
  };
  const scrollY = () => fresh.evaluate(() => Math.round(window.scrollY));
  const viewportHeight = () => fresh.evaluate(() => window.innerHeight);
  const visibleRows = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
    .filter((row) => row.getBoundingClientRect().top < window.innerHeight).length);
  const longLiteral = {
    pages: [{ id: "E1", title: "Edge Long", blocks: Array.from({ length: 70 }, (_, index) => para("e" + index, "EDGE line " + index)) }],
    fonts: [],
    attachments: [],
  };
  // ポインタを下端の近くで止めて待つ → 自動でスクロールしたかを測る。
  const holdAtBottom = async (x) => {
    const height = await viewportHeight();
    await fresh.mouse.move(x, height - 6, { steps: 6 });
    await fresh.waitForTimeout(900);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) ブロックのドラッグ(ハンドル): 下端の近くで止めると自動でスクロールし、画面外だった位置へ落とせる。
    await openLiteral(longLiteral, "edge-long.html");
    const visibleAtStart = await visibleRows();
    const row = fresh.locator("#blocks .block", { has: fresh.locator(".block-content", { hasText: /^EDGE line 2$/ }) }).first();
    await pointAt(row);
    const grip = await row.locator(".drag-grip").boundingBox();
    await fresh.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(grip.x + grip.width / 2 + 40, grip.y + 30, { steps: 4 });
    await holdAtBottom(grip.x + 200);
    const draggedScroll = await scrollY();
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    const afterUp = await scrollY();
    await fresh.waitForTimeout(250);
    const stillAfterUp = await scrollY();
    const order = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent));
    const movedTo = order.indexOf("EDGE line 2");
    result.blockDragAutoScrollsAtEdge = draggedScroll > 150 && movedTo >= visibleAtStart && afterUp === stillAfterUp;

    // 2) ブロックをまたぐ選択(マウス): 下端の近くで止めると自動でスクロールし、選択が画面外まで伸びる。
    await openLiteral(longLiteral, "edge-long-2.html");
    const text = await fresh.locator("#blocks .block-content", { hasText: /^EDGE line 2$/ }).first().boundingBox();
    await fresh.mouse.move(text.x + 4, text.y + text.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(text.x + 60, text.y + text.height / 2 + 40, { steps: 4 });
    // ブラウザ自身の選択の自動スクロールは窓の端のすぐそばでだけ効く(実測: 6px では Chromium が自分で動く)。
    // 少し内側(30px。この実装の端の帯 48px の中)で待ち、この実装の自動スクロールを確かめる。
    await fresh.mouse.move(text.x + 60, (await viewportHeight()) - 30, { steps: 6 });
    await fresh.waitForTimeout(900);
    const selectedScroll = await scrollY();
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    // 離すと、ブロックをまたいだ選択はブロックの選択になる(v206)。選んだブロックの文字で見る。
    const selectedText = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected .block-content")].map((node) => node.textContent).join(" "));
    const lastLine = Math.max(...[...selectedText.matchAll(/EDGE line (\d+)/g)].map((match) => Number(match[1])));
    result.textSelectionAutoScrollsAtEdge = selectedScroll > 150 && selectedText.includes("EDGE line 3") && lastLine >= visibleAtStart;
    // 本文を1回クリックして、選択のための静的モードから編集できる状態へ戻す(次の表の操作のため)。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(150);

    // 2b) 端の近くで素早く離すだけなら、勝手にスクロールしない(端に 0.2 秒とどまってから始まる)。
    await openLiteral(longLiteral, "edge-long-quick.html");
    const quickStart = await fresh.locator("#blocks .block", { has: fresh.locator(".block-content", { hasText: /^EDGE line 2$/ }) }).first().boundingBox();
    await fresh.mouse.move(quickStart.x - 30, quickStart.y + 4);
    await fresh.mouse.down();
    await fresh.mouse.move(quickStart.x - 20, quickStart.y + 14, { steps: 3 });
    await fresh.mouse.move(quickStart.x + 160, (await viewportHeight()) - 20, { steps: 3 });
    await fresh.waitForTimeout(60);
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    result.quickReleaseNearEdgeDoesNotScroll = (await scrollY()) === 0;

    // 3) 表のセル範囲の選択: 下端の近くで止めると自動でスクロールし、範囲が画面外の行まで伸びる。
    const tableLiteral = {
      pages: [{ id: "T1", title: "Edge Table", blocks: [
        para("t0", "table lead"),
        { id: "t1", type: "table", text: "", rows: Array.from({ length: 60 }, (_, index) => [{ text: index === 0 ? "7" : "r" + index }, { text: "c" + index }]) },
      ] }],
      fonts: [],
      attachments: [],
    };
    await openLiteral(tableLiteral, "edge-table.html");
    const cell = (r, c) => fresh.locator('#blocks .editor-table [data-row="' + r + '"][data-cell="' + c + '"]').first();
    const cellsInView = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .editor-table td[data-cell='1']")]
      .filter((td) => td.getBoundingClientRect().bottom < window.innerHeight).length);
    const c1 = await cell(1, 1).boundingBox();
    const c2 = await cell(2, 1).boundingBox();
    await fresh.mouse.move(c1.x + c1.width / 2, c1.y + c1.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(c2.x + c2.width / 2, c2.y + c2.height / 2, { steps: 4 });
    await holdAtBottom(c2.x + c2.width / 2);
    const rangeScroll = await scrollY();
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const selectedCells = await fresh.evaluate(() => document.querySelectorAll("#blocks .editor-table .cell-selected").length);
    result.tableRangeAutoScrollsAtEdge = rangeScroll > 150 && selectedCells > cellsInView + 2;

    // 4) フィルハンドル: 下端の近くで止めると自動でスクロールし、画面外の行までフィルされる。
    await openLiteral(tableLiteral, "edge-table-2.html");
    // 既存の表のテストと同じく、セルへフォーカスを当ててアクティブにする(クリックは文字の編集に入る)。
    await fresh.evaluate(() => document.querySelector('#blocks .editor-table [data-row="0"][data-cell="0"]')?.focus());
    await fresh.waitForTimeout(200);
    const handle = await fresh.locator("#blocks .block .table-fill-handle").first().boundingBox();
    const below = await cell(2, 0).boundingBox();
    await fresh.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(below.x + below.width / 2, below.y + below.height / 2, { steps: 4 });
    await holdAtBottom(below.x + below.width / 2);
    const fillScroll = await scrollY();
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    const filled = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .editor-table td[data-cell='0']")]
      .filter((td) => td.textContent.trim() === "7").length);
    result.fillHandleAutoScrollsAtEdge = fillScroll > 150 && filled > cellsInView + 2;

    // 5) 外からのファイルのドラッグ: 下端の近くで dragover が続くと自動でスクロールし、離れる(dragleave)と止まる。
    await openLiteral(longLiteral, "edge-long-3.html");
    const fileScroll = await fresh.evaluate(async () => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([1])], "drop.bin", { type: "application/octet-stream" }));
      const main = document.querySelector(".main");
      const y = window.innerHeight - 6;
      for (let i = 0; i < 16; i += 1) {
        main.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientX: 700, clientY: y, dataTransfer: transfer }));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const during = window.scrollY;
      main.dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true, clientX: 700, clientY: y, relatedTarget: null, dataTransfer: transfer }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const stopped = window.scrollY;
      await new Promise((resolve) => setTimeout(resolve, 300));
      return { during, stopped, still: window.scrollY };
    });
    result.fileDragAutoScrollsAtEdge = fileScroll.during > 150 && fileScroll.stopped === fileScroll.still;

    // 6) 離したイベントを取りこぼした(ボタンが押されていない動きが届いた)ら、ドラッグと自動スクロールを終える。
    //    ブロックの移動は取り消す(離したことを確かめられないので文書を書き換えない)。
    const scrollStable = async () => {
      const first = await scrollY();
      await fresh.waitForTimeout(300);
      return first === await scrollY();
    };
    await openLiteral(longLiteral, "edge-long-lost.html");
    const lostRow = fresh.locator("#blocks .block", { has: fresh.locator(".block-content", { hasText: /^EDGE line 2$/ }) }).first();
    await pointAt(lostRow);
    const lostGrip = await lostRow.locator(".drag-grip").boundingBox();
    await fresh.mouse.move(lostGrip.x + lostGrip.width / 2, lostGrip.y + lostGrip.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(lostGrip.x + 60, lostGrip.y + 30, { steps: 4 });
    await fresh.mouse.move(lostGrip.x + 200, (await viewportHeight()) - 6, { steps: 4 });
    await fresh.waitForTimeout(500);
    const lostScrolling = await scrollY();
    await fresh.evaluate(() => {
      const grip = [...document.querySelectorAll("#blocks .block")].find((row) => row.textContent.includes("EDGE line 2") && !row.textContent.includes("EDGE line 20"))?.querySelector(".drag-grip");
      grip?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", buttons: 0, clientX: 500, clientY: window.innerHeight - 6 }));
    });
    const lostStopped = await scrollStable();
    const lostDragging = await fresh.evaluate(() => document.querySelectorAll(".dragging").length);
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    const lostOrder = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block-content")].map((node) => node.textContent));
    result.lostReleaseEndsBlockDrag = lostScrolling > 100 && lostStopped && lostDragging === 0 && lostOrder.indexOf("EDGE line 2") === 2;

    // 6b) 矩形選択でも同じ: 端で自動スクロールしている最中に、ボタンを押していない pointermove が届いたら、
    //     自動スクロールと矩形選択を終える(矩形は消え、選択はそのまま残る)。
    await openLiteral(longLiteral, "edge-long-lost-marquee.html");
    const lostMarquee = await fresh.locator("#blocks .block", { has: fresh.locator(".block-content", { hasText: /^EDGE line 2$/ }) }).first().boundingBox();
    await fresh.mouse.move(lostMarquee.x - 30, lostMarquee.y + 4);
    await fresh.mouse.down();
    await fresh.mouse.move(lostMarquee.x - 20, lostMarquee.y + 14, { steps: 3 });
    await fresh.mouse.move(lostMarquee.x + 160, (await viewportHeight()) - 6, { steps: 4 });
    await fresh.waitForTimeout(500);
    const lostMarqueeScrolling = await scrollY();
    await fresh.evaluate(() => document.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", buttons: 0, clientX: 500, clientY: window.innerHeight - 6,
    })));
    const lostMarqueeStopped = await scrollStable();
    const lostMarqueeState = await fresh.evaluate(() => ({
      hidden: document.querySelector("#block-marquee").hidden,
      selected: document.querySelectorAll("#blocks .block.selected").length,
    }));
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
    result.lostReleaseEndsMarquee = lostMarqueeScrolling > 100 && lostMarqueeStopped
      && lostMarqueeState.hidden && lostMarqueeState.selected > 1;

    // 7) 別のウィンドウへ移った(window の blur)ら、矩形選択の自動スクロールを止める。
    await openLiteral(longLiteral, "edge-long-blur.html");
    const blurStart = await fresh.locator("#blocks .block", { has: fresh.locator(".block-content", { hasText: /^EDGE line 2$/ }) }).first().boundingBox();
    await fresh.mouse.move(blurStart.x - 30, blurStart.y + 4);
    await fresh.mouse.down();
    await fresh.mouse.move(blurStart.x - 20, blurStart.y + 14, { steps: 3 });
    await fresh.mouse.move(blurStart.x + 160, (await viewportHeight()) - 6, { steps: 4 });
    await fresh.waitForTimeout(500);
    const blurScrolling = await scrollY();
    await fresh.evaluate(() => window.dispatchEvent(new Event("blur")));
    const blurStopped = await scrollStable();
    const marqueeHidden = await fresh.evaluate(() => document.querySelector("#block-marquee").hidden);
    await fresh.mouse.up();
    result.blurEndsMarqueeAutoScroll = blurScrolling > 100 && blurStopped && marqueeHidden;

    // 8) タブが隠れた(visibilitychange で hidden)ら、文字の選択の自動スクロールを止める。
    await openLiteral(longLiteral, "edge-long-hidden.html");
    const hiddenText = await fresh.locator("#blocks .block-content", { hasText: /^EDGE line 2$/ }).first().boundingBox();
    await fresh.mouse.move(hiddenText.x + 4, hiddenText.y + hiddenText.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(hiddenText.x + 60, hiddenText.y + hiddenText.height / 2 + 40, { steps: 4 });
    await fresh.mouse.move(hiddenText.x + 60, (await viewportHeight()) - 30, { steps: 4 });
    await fresh.waitForTimeout(500);
    const hiddenScrolling = await scrollY();
    await fresh.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      delete document.visibilityState;
    });
    const hiddenStopped = await scrollStable();
    await fresh.mouse.up();
    await fresh.locator("#blocks .block-content").first().click();
    result.hiddenEndsTextSelectionAutoScroll = hiddenScrolling > 100 && hiddenStopped;
    return result;
  } finally {
    await fresh.close();
  }
}
