// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 選択が動くたびの書式の見直し(Issue #204) ----
// 範囲を選んでいるとき、書式ボタン・文字の大きさ・書体の表示を決めるために、選択の共通の祖先(ブロックをまたぐと #blocks)の
// 頭から文字のノードを全部歩いていた。
// a) 文字の大きさの混在の判定が、範囲より前のノードも 500 件の上限に数えていたため、長い文書の後ろの方をまたいで選ぶと
//    判定をあきらめ、範囲の頭の大きさを出していた(混ざっていても「混在」= 空欄にならない)。
// b) 範囲より前のノードを上限なしに歩くので、長い文書の後ろの方を選ぶたびに重い。
// c) selectionchange が1フレームに何度届いても、書式の見直しは1フレームに1回。
// d) ブロックをまたぐドラッグは、動きの1回ごとに選択の写しを1フレームへ1回だけ予約する(pointermove と mousemove の両方で
//    予約していた・予約済みかを見ていなかった)。
// 速さの検査は緩い上限(修正後の実測の数倍)。修正前の作りでは上限を超える(赤確認済み)。
export default async function selectionWalkSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  await fresh.setViewportSize({ width: 1280, height: 800 });
  // フレームの処理(requestAnimationFrame のコールバック)の時間と、予約された回数(関数の名前ごと)、
  // queryCommandState("italic") を呼んだ回数(= 書式ボタンを見直した回数)を数える。
  await fresh.addInitScript(() => {
    window.__walk = { raf: 0, names: {}, italic: 0 };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      if (callback?.name) window.__walk.names[callback.name] = (window.__walk.names[callback.name] || 0) + 1;
      return raf((time) => {
        const t0 = performance.now();
        try {
          callback(time);
        } finally {
          window.__walk.raf += performance.now() - t0;
        }
      });
    };
    const query = Document.prototype.queryCommandState;
    Document.prototype.queryCommandState = function queryCommandStateCounted(command, ...rest) {
      if (command === "italic") window.__walk.italic += 1;
      return query.call(this, command, ...rest);
    };
  });
  const result = {};
  const evidence = {};
  const P = (id, text, extra = {}) => ({ id, type: "paragraph", text, ...extra });
  const open = async (blocks, name) => {
    const literal = { pages: [{ id: "W", title: "選択の見直し", blocks }], fonts: [], attachments: [] };
    const path = join(OUT, name);
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    const lastId = blocks.at(-1).id;
    await fresh.waitForFunction((id) => document.querySelector('#blocks .block[data-id="' + id + '"]'), lastId, { timeout: 60000 });
    await fresh.waitForTimeout(400);
  };
  const frame = () => fresh.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  })));
  // ブロック from の文字の fromOffset から、ブロック to の文字の toOffset までを選ぶ(画面の真ん中に出す)。
  const selectAcross = async (from, fromOffset, to, toOffset) => {
    await fresh.evaluate(({ from: a, fromOffset: ao, to: b, toOffset: bo }) => {
      const point = (id, offset) => {
        const editable = document.querySelector('#blocks .block-content[data-id="' + id + '"]');
        const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
        let left = offset;
        while (walker.nextNode()) {
          if (left <= walker.currentNode.nodeValue.length) return [walker.currentNode, left];
          left -= walker.currentNode.nodeValue.length;
        }
        return [editable, editable.childNodes.length];
      };
      document.querySelector('#blocks .block-content[data-id="' + a + '"]').scrollIntoView({ block: "center" });
      const range = document.createRange();
      range.setStart(...point(a, ao));
      range.setEnd(...point(b, bo));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, { from, fromOffset, to, toOffset });
    await frame();
    await fresh.waitForTimeout(80);
    await frame();
  };
  const sizeShown = () => fresh.evaluate(() => document.querySelector("#format-size").value);
  const underlineActive = () => fresh.evaluate(() => document.querySelector("#format-underline").classList.contains("active"));

  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 前に 6000 段落(1段落に文字のノード 3つ。大きさの違う字を含む)があり、末尾に確かめる段落を置いた文書。
    const filler = Array.from({ length: 6000 }, (_, i) => P("f" + i, "段落 " + i + " 大 後", {
      html: "段落 " + i + ' <span style="font-size: 20px;">大</span> 後',
    }));
    await open([
      ...filler,
      P("mixA", "大きい字", { html: '<span style="font-size: 24px;">大きい字</span>' }),
      P("mixB", "ふつうの字"),
      P("sameA", "同じ大きさ一", { html: '<span style="font-size: 24px;">同じ大きさ一</span>' }),
      P("sameB", "同じ大きさ二", { html: '<span style="font-size: 24px;">同じ大きさ二</span>' }),
      P("ulA", "下線一", { html: "<u>下線一</u>" }),
      P("ulB", "下線二", { html: "<u>下線二</u>" }),
      P("ulC", "下線なし"),
      P("tail", "末尾"),
    ], "selection-walk-long.html");

    // a) 長い文書の後ろの方で、大きさの違う2つのブロックをまたいで選ぶと「混在」(空欄)。同じ大きさなら、その大きさ。
    await selectAcross("mixA", 1, "mixB", 3);
    const mixed = await sizeShown();
    await selectAcross("sameA", 1, "sameB", 3);
    const same = await sizeShown();
    result.selectionWalkMixedSizeAtDocEnd = mixed === "" && same === "24";
    evidence.mixedSize = { mixed, same };

    // a') 下線ボタン: 範囲の全部が下線なら点き、下線の無い字が混ざれば消える(長い文書の後ろの方で、ブロックをまたいで)。
    await selectAcross("ulA", 0, "ulB", 3);
    const allUnderlined = await underlineActive();
    await selectAcross("ulB", 0, "ulC", 2);
    const partlyUnderlined = await underlineActive();
    result.selectionWalkUnderlineAtDocEnd = allUnderlined === true && partlyUnderlined === false;
    evidence.underline = { allUnderlined, partlyUnderlined };

    // b) 速さ: 長い文書の後ろの方をまたいで選んだまま、selectionchange を 10 回(1フレームに1回)。
    //    見直しにかかった時間(イベントの処理 + フレームの処理)の合計。
    await selectAcross("mixA", 1, "ulB", 2);
    const times = [];
    for (let i = 0; i < 10; i += 1) {
      await fresh.evaluate(() => { window.__walk.raf = 0; });
      const sync = await fresh.evaluate(() => {
        const t0 = performance.now();
        document.dispatchEvent(new Event("selectionchange"));
        return performance.now() - t0;
      });
      await frame();
      times.push(sync + await fresh.evaluate(() => window.__walk.raf));
    }
    const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
    // 修正後は文書の長さによらず約 1ms、修正前は 6000 段落で約 16ms(14 コアの機械の実測)。
    result.selectionWalkFastAtDocEnd = median < 6;
    evidence.updateMs = { median: Math.round(median * 100) / 100, times: times.map((value) => Math.round(value * 100) / 100) };

    // c) 1つの処理の中で selectionchange が 10 回届いても、書式ボタンの見直しは1回(次のフレームで)。
    const coalesced = await fresh.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      window.__walk.italic = 0;
      for (let i = 0; i < 10; i += 1) document.dispatchEvent(new Event("selectionchange"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
      return window.__walk.italic;
    });
    result.selectionWalkCoalescedPerFrame = coalesced >= 1 && coalesced <= 2;
    evidence.formatUpdatesFor10Events = coalesced;

    // d) ブロックをまたぐドラッグ: 同じフレームの中で動きが何回届いても、ブロックの選択への写しは1回だけ予約する。
    const short = Array.from({ length: 12 }, (_, i) => P("d" + i, "ドラッグの行 " + i));
    await open(short, "selection-walk-drag.html");
    await fresh.evaluate(() => document.addEventListener("pointerdown", (event) => { window.__walkPointerId = event.pointerId; }, { capture: true, once: true }));
    const first = await fresh.locator('#blocks .block-content[data-id="d1"]').boundingBox();
    const later = await fresh.locator('#blocks .block-content[data-id="d4"]').boundingBox();
    await fresh.mouse.move(first.x + 6, first.y + first.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(first.x + 40, first.y + first.height / 2 + 30, { steps: 3 });
    await frame();
    const scheduled = await fresh.evaluate(({ x, y }) => {
      window.__walk.names.syncCrossBlockSelection = 0;
      const pointerId = window.__walkPointerId ?? 1;
      for (let i = 0; i < 3; i += 1) {
        const at = { bubbles: true, cancelable: true, buttons: 1, clientX: x + i * 4, clientY: y + i * 4 };
        document.dispatchEvent(new PointerEvent("pointermove", { ...at, pointerId, pointerType: "mouse", isPrimary: true }));
        document.dispatchEvent(new MouseEvent("mousemove", at));
      }
      return window.__walk.names.syncCrossBlockSelection || 0;
    }, { x: later.x + 30, y: later.y + later.height / 2 });
    await fresh.mouse.move(later.x + 40, later.y + later.height / 2, { steps: 2 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
    const selectedAfterDrag = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.selected")].map((row) => row.dataset.id));
    result.selectionWalkDragSyncOncePerFrame = scheduled === 1
      && ["d1", "d2", "d3", "d4"].every((id) => selectedAfterDrag.includes(id)) && !selectedAfterDrag.includes("d5");
    evidence.drag = { scheduled, selectedAfterDrag };

    result.selectionWalkNoPageErrors = pageErrors.length === 0;
    evidence.pageErrors = pageErrors;
    result.selectionWalkEvidence = JSON.stringify(evidence);
    return result;
  } finally {
    await fresh.close();
  }
}
