// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OUT, PORT, openMenu } from "../lib.mjs";

// ---- 系列の範囲を表からドラッグで選ぶ(v160。グラフ編集GUI 段3) ----
// 出典はユーザー原文(グラフの編集UI。Excel/スプレッドシートを参考に)。細部はユーザー委任下の PdM 判断。
// 「表から選ぶ」→ 表の上でドラッグ → 欄とコードが書き換わる。その間ペインは閉じない。Esc で取り消し、Undo 1手で戻る。
export default async function chartRangePickSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const cells = (...values) => values.map((text) => ({ text }));
  const literal = {
    pages: [
      {
        id: "RP1",
        title: "Range Pick",
        blocks: [
          { id: "t1", type: "table", rows: [cells("x", "売上"), cells("1", "10"), cells("2", "25"), cells("3", "18"), cells("4", "30")] },
          { id: "g1", type: "chart", text: "scatter(A2:A5, B2:B5)" },
          { id: "t2", type: "table", rows: [cells("9", "9"), cells("8", "8")] },
          { id: "g2", type: "chart", text: 'table(id="nope")\nscatter(A1:A2, B1:B2)' },
          // ヘッダー行を宣言した表(分類の軸は「1月」のような文字)。
          { id: "t3", type: "table", tableHeader: true, rows: [cells("月", "金額"), cells("1月", "10"), cells("2月", "20"), cells("3月", "30")] },
          { id: "g3", type: "chart", text: "scatter(A2:A4, B2:B4)" },
          // 先頭の行が「1,000」(数)の表。見出しではない(表の数の判定と同じ)。
          { id: "t4", type: "table", rows: [cells("1", "1,000"), cells("2", "2,000"), cells("3", "3,000")] },
          { id: "g4", type: "chart", text: "scatter(A1:A3, B1:B3)" },
          // 選ぶ順を比べる2つの表(同じ中身・宣言なし)。
          { id: "t5", type: "table", rows: [cells("月", "金額"), cells("1", "10"), cells("2", "20"), cells("3", "30")] },
          { id: "g5", type: "chart", text: "scatter(A2:A2, B2:B2)" },
          { id: "t6", type: "table", rows: [cells("月", "金額"), cells("1", "10"), cells("2", "20"), cells("3", "30")] },
          { id: "g6", type: "chart", text: "scatter(A2:A2, B2:B2)" },
          // ラベルを手で付けてから Y→X の順に選ぶ(v162)。
          { id: "t7", type: "table", rows: [cells("月", "金額"), cells("1", "10"), cells("2", "20"), cells("3", "30")] },
          { id: "g7", type: "chart", text: "scatter(A2:A2, B2:B2)" },
          // 横棒(v167): 値は2番目・位置は1番目のまま(ペインのデータは入れ替えない)。
          { id: "t8", type: "table", rows: [cells("部署", "売上"), cells("営業部", "10"), cells("開発部", "20")] },
          { id: "g8", type: "chart", text: "barh(A2:A2, B2:B2)" },
          { id: "p2", type: "paragraph", text: "after" },
        ],
      },
      {
        id: "RP2",
        title: "Tall Table",
        blocks: [
          { id: "tt", type: "table", rows: Array.from({ length: 40 }, (_, index) => cells(String(index + 1), String((index + 1) * 2))) },
          { id: "tg", type: "chart", text: "scatter(A1:A2, B1:B2)" },
        ],
      },
    ],
    fonts: [],
    attachments: [],
  };
  const code = (id) => fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .block-content').textContent, id);
  const state = () => fresh.evaluate(() => ({
    paneOpen: !document.querySelector("#chart-pane").hidden,
    picking: document.querySelectorAll("#chart-pane .chart-pane-pick.is-picking").length,
    preview: document.querySelectorAll("#blocks .ref-preview").length,
    x: document.querySelector('#chart-pane .chart-pane-series input[data-field="x"]')?.value ?? null,
    y: document.querySelector('#chart-pane .chart-pane-series input[data-field="y"]')?.value ?? null,
    label: document.querySelector('#chart-pane .chart-pane-series input[data-field="label"]')?.value ?? null,
    hint: document.querySelector("#chart-pane-pick-hint").hidden ? null : document.querySelector("#chart-pane-pick-hint").textContent,
    sourceMarked: Boolean(document.querySelector("#blocks .block.chart-range-source")),
    otherMarked: [...document.querySelectorAll("#blocks .block.chart-range-other")].map((row) => row.dataset.id),
  }));
  const openPane = async (id) => {
    // 絵を画面の中ほどへ(上端に寄せると、押す位置が固定のツールバーの下に入ることがある)。
    await fresh.evaluate((blockId) => document.querySelector('.block[data-id="' + blockId + '"] .chart-canvas')?.scrollIntoView({ block: "center" }), id);
    await fresh.waitForTimeout(100);
    const box = await fresh.locator('.block[data-id="' + id + '"] .chart-canvas').boundingBox();
    await fresh.mouse.click(box.x + box.width / 2, box.y + Math.min(60, box.height / 2));
    await fresh.waitForTimeout(300);
  };
  const pick = async (field) => {
    await fresh.locator('#chart-pane .chart-pane-pick[data-pick="' + field + '"]').first().click();
    await fresh.waitForTimeout(150);
  };
  const cellCenter = async (tableId, r, c) => {
    const box = await fresh.locator('.block[data-id="' + tableId + '"] [data-row="' + r + '"][data-cell="' + c + '"]').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const drag = async (tableId, from, to, { release = true } = {}) => {
    // 押し始めのセルを画面に入れてから測る(画面の外の位置を押すと、表の外の押下になって取り消される)。
    await fresh.evaluate(([id, r, c]) => document.querySelector('.block[data-id="' + id + '"] [data-row="' + r + '"][data-cell="' + c + '"]')
      ?.scrollIntoView({ block: "center" }), [tableId, from[0], from[1]]);
    await fresh.waitForTimeout(80);
    const a = await cellCenter(tableId, from[0], from[1]);
    const b = await cellCenter(tableId, to[0], to[1]);
    await fresh.mouse.move(a.x, a.y);
    await fresh.mouse.down();
    await fresh.mouse.move(b.x, b.y, { steps: 6 });
    await fresh.waitForTimeout(120);
    if (release) {
      await fresh.mouse.up();
      await fresh.waitForTimeout(300);
    }
  };

  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const path = join(OUT, "range-pick.html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Range Pick", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);

    // 「表から選ぶ」→ 読んでいる表に枠・ほかの表は薄く、いまの範囲が強調される。ドラッグ中は欄が live で変わり、
    // ペインは閉じない。離すとコードの行が書き換わり、状態が元に戻る。
    await openPane("g1");
    await pick("y");
    const entered = await state();
    await drag("t1", [1, 1], [3, 1], { release: false });
    const during = await state();
    const codeDuring = await code("g1");
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    const after = await state();
    const committed = await code("g1");
    result.chartRangePickDragWritesFieldAndCode = entered.picking === 1 && entered.sourceMarked && entered.preview === 4
      && during.y === "B2:B4" && codeDuring === "scatter(A2:A5, B2:B5)"
      && committed === "scatter(A2:A5, B2:B4)" && after.y === "B2:B4"
      && after.picking === 0 && after.preview === 0 && !after.sourceMarked;
    result.chartRangePickKeepsPaneOpen = entered.paneOpen && during.paneOpen && after.paneOpen
      && entered.otherMarked.join(",") === "t2,t3,t4,t5,t6,t7,t8";

    // Undo 1手で、選ぶ前のコードに戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.chartRangePickUndoesInOneStep = (await code("g1")) === "scatter(A2:A5, B2:B5)";

    // Esc で取り消すと、コードは変わらず、欄も元に戻る(ペインは閉じない)。
    await pick("x");
    await drag("t1", [1, 0], [2, 0], { release: false });
    await fresh.keyboard.press("Escape");
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    const escaped = await state();
    result.chartRangePickEscapeCancels = (await code("g1")) === "scatter(A2:A5, B2:B5)" && escaped.x === "A2:A5"
      && escaped.paneOpen && escaped.picking === 0 && escaped.preview === 0;

    // 見出し(ヘッダー行を宣言していない表): Y の1行目が文字なら、それをラベルにして範囲は2行目から(ラベルが空のとき)。
    await pick("y");
    await drag("t1", [0, 1], [4, 1]);
    const headerY = await code("g1");
    // X 側は文字かどうかで推測しないが、Y 側で見出しと判定済みなら、X の始まりを Y にそろえる(選ぶ順によらない。v161)。
    await pick("x");
    await drag("t1", [0, 0], [4, 0]);
    const headerX = await code("g1");
    // X が見出しの行から始まっているときに Y を見出しごと選ぶと、X の始まりも Y にそろう(X と Y の組がずれない)。
    await pick("y");
    await drag("t1", [0, 1], [4, 1]);
    const aligned = await code("g1");
    // 手で付けたラベルは黙って上書きしない。
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="label"]').fill("手動");
    await fresh.waitForTimeout(250);
    await pick("y");
    await drag("t1", [0, 1], [2, 1]);
    const keepsLabel = await code("g1");
    result.chartRangePickHeaderRowBecomesLabel = headerY === 'scatter(A2:A5, B2:B5, label="売上")'
      && headerX === 'scatter(A2:A5, B2:B5, label="売上")'
      && aligned === 'scatter(A2:A5, B2:B5, label="売上")'
      && keepsLabel === 'scatter(A2:A5, B2:B3, label="手動")';

    // クリックだけなら1セル、続けて Shift+クリックでいまの範囲の左上から伸ばす。Enter でも決まる。
    await pick("y");
    const c3 = await cellCenter("t1", 2, 1);
    await fresh.mouse.click(c3.x, c3.y);
    await fresh.waitForTimeout(300);
    const single = await code("g1");
    await pick("y");
    const c5 = await cellCenter("t1", 4, 1);
    await fresh.keyboard.down("Shift");
    await fresh.mouse.click(c5.x, c5.y);
    await fresh.keyboard.up("Shift");
    await fresh.waitForTimeout(300);
    const extended = await code("g1");
    await pick("y");
    await drag("t1", [1, 1], [2, 1], { release: false });
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    const byEnter = await code("g1");
    const enterState = await state();
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    result.chartRangePickClickShiftClickAndEnter = single.includes("scatter(A2:A5, B3,") && extended.includes("scatter(A2:A5, B3:B5,")
      && byEnter.includes("scatter(A2:A5, B2:B3,") && enterState.picking === 0 && (await code("g1")) === byEnter;

    // グラフが読んでいない表は選べない(薄く、押しても何も変わらず、案内が出る)。
    await pick("y");
    const beforeOther = await code("g1");
    await drag("t2", [0, 0], [1, 1]);
    const other = await state();
    result.chartRangePickIgnoresOtherTables = (await code("g1")) === beforeOther && other.paneOpen && other.picking === 1
      && other.otherMarked.includes("t2") && String(other.hint).includes("このグラフが読んでいる表(題名なしの表")
      && String(other.hint).includes("データの表を切り替えて");
    // 表の外を押すと取り消して、通常の規則に戻る(ペインは閉じる)。
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(300);
    const outside = await state();
    result.chartRangePickOutsideClickCancelsAndCloses = !outside.paneOpen && outside.picking === 0 && outside.preview === 0
      && !outside.sourceMarked && outside.otherMarked.length === 0 && (await code("g1")) === beforeOther;

    // ヘッダー行を宣言した表: X も Y も見出しを含めて選ぶと、どちらも2行目から。ラベルは Y の見出し。分類の軸の
    // 「1月」は文字でも見出しとして扱わない(宣言した行だけが見出し)。
    await openPane("g3");
    await pick("x");
    await drag("t3", [0, 0], [3, 0]);
    // X だけでも、宣言した見出しの行は外れる(文字かどうかでは推測しないので、宣言が無ければ外れない)。
    const declaredX = await code("g3");
    await pick("y");
    await drag("t3", [0, 1], [3, 1]);
    const declared = await code("g3");
    await pick("x");
    await drag("t3", [1, 0], [3, 0]);
    const categoryKept = await code("g3");
    result.chartRangePickDeclaredHeaderDropsBothAndLabels = declaredX === "scatter(A2:A4, B2:B4)"
      && declared === 'scatter(A2:A4, B2:B4, label="金額")'
      && categoryKept === 'scatter(A2:A4, B2:B4, label="金額")';
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(250);

    // 数として読めるセル(「1,000」)は見出しにしない(表の数の判定 tableCellNumber と同じ。v161)。
    await openPane("g4");
    await pick("y");
    await drag("t4", [0, 1], [2, 1]);
    result.chartRangePickNumericFirstRowIsNotHeader = (await code("g4")) === "scatter(A1:A3, B1:B3)";
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(250);

    // 選ぶ順で結果が変わらない(v161): X→Y でも Y→X でも、X と Y はどちらも見出しの次の行から。
    await openPane("g5");
    await pick("x");
    await drag("t5", [0, 0], [3, 0]);
    await pick("y");
    await drag("t5", [0, 1], [3, 1]);
    const xThenY = await code("g5");
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(250);
    await openPane("g6");
    await pick("y");
    await drag("t6", [0, 1], [3, 1]);
    await pick("x");
    await drag("t6", [0, 0], [3, 0]);
    const yThenX = await code("g6");
    result.chartRangePickOrderDoesNotMatter = xThenY === 'scatter(A2:A4, B2:B4, label="金額")' && yThenX === xThenY;
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(250);
    // ラベルを手で付けていても(見出しの文字とラベルが違っても)、Y→X の順で X はそろう(根拠は見出しの判定。v162)。
    await openPane("g7");
    await fresh.locator('#chart-pane .chart-pane-series input[data-field="label"]').fill("手動");
    await fresh.waitForTimeout(250);
    await pick("y");
    await drag("t7", [0, 1], [3, 1]);
    await pick("x");
    await drag("t7", [0, 0], [3, 0]);
    result.chartRangePickAlignsWithManualLabel = (await code("g7")) === 'scatter(A2:A4, B2:B4, label="手動")';
    await fresh.locator('.block[data-id="p2"] .block-content').click();
    await fresh.waitForTimeout(250);

    // 読む表が無いグラフでは「表から選ぶ」は押せない。
    await openPane("g2");
    result.chartRangePickDisabledWithoutTable = await fresh.evaluate(() => {
      const buttons = [...document.querySelectorAll("#chart-pane .chart-pane-pick")];
      return buttons.length === 2 && buttons.every((button) => button.disabled);
    });

    // 端での自動スクロール: 長い表の上端から下端の近くまでドラッグして止めると、スクロールしながら範囲が伸びる。
    await fresh.locator("#page-tree-body .page-tree-item", { hasText: "Tall Table" }).first().click();
    await fresh.waitForTimeout(400);
    await openPane("tg");
    await pick("y");
    await fresh.evaluate(() => window.scrollTo(0, 0));
    await fresh.waitForTimeout(150);
    const visibleRowsAtStart = await fresh.evaluate(() => [...document.querySelectorAll('.block[data-id="tt"] tr')]
      .filter((tr) => tr.getBoundingClientRect().bottom <= window.innerHeight).length);
    const top = await cellCenter("tt", 1, 1);
    await fresh.mouse.move(top.x, top.y);
    await fresh.mouse.down();
    const height = await fresh.evaluate(() => window.innerHeight);
    await fresh.mouse.move(top.x, height - 6, { steps: 8 });
    const scrollBefore = await fresh.evaluate(() => window.scrollY);
    await fresh.waitForTimeout(1200);
    const scrollAfter = await fresh.evaluate(() => window.scrollY);
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    const tallCode = await code("tg");
    const bottomRow = Number((/B2:B(\d+)/.exec(tallCode) || [])[1] || 0);
    result.chartRangePickEdgeAutoScroll = scrollAfter > scrollBefore + 100 && bottomRow > visibleRowsAtStart + 3;

    // 範囲を選んでいる途中で文書を開き直しても(Ctrl+O。フォーカスは「表から選ぶ」に置いたまま)、選ぶ状態はきれいに
    // 終わり、表のセルは普通に編集できる(状態が残ると、次の表の押下が範囲の選択に取られてセルを編集できない)。
    await pick("y");
    const reopenChooser = fresh.waitForEvent("filechooser");
    await fresh.keyboard.press("Control+o");
    await (await reopenChooser).setFiles(path);
    await fresh.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "Range Pick", null, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(500);
    await fresh.locator('.block[data-id="t1"] [data-row="1"][data-cell="0"]').click();
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("End");
    await fresh.keyboard.type("9");
    await fresh.waitForTimeout(200);
    const cleanEnd = await fresh.evaluate(() => ({
      marks: document.querySelectorAll("#blocks .chart-range-source, #blocks .chart-range-other, #blocks .ref-preview").length,
      cell: document.querySelector('.block[data-id="t1"] [data-row="1"][data-cell="0"]')?.textContent,
      focusedCell: Boolean(document.activeElement?.closest?.(".editor-table")),
    }));
    result.chartRangePickEndsCleanlyAndCellsStayEditable = cleanEnd.marks === 0 && cleanEnd.cell === "19" && cleanEnd.focusedCell;

    // 横棒でも、値(2番目)の欄を見出しごと選ぶと見出しはラベルになり、位置(1番目)を見出しごと選ぶと始まりが値にそろう
    // (分類の「営業部」は見出しとして外れない)。ペインのデータは x=1番目・y=2番目のまま(v167。TL 設計注意)。
    await openPane("g8");
    await pick("y");
    await drag("t8", [0, 1], [2, 1]);
    const barhHeaderY = await code("g8");
    await pick("x");
    await drag("t8", [0, 0], [2, 0]);
    const barhHeaderX = await code("g8");
    result.chartRangePickBarhHeaderBecomesLabel = barhHeaderY === 'barh(A2:A2, B2:B3, label="売上")'
      && barhHeaderX === 'barh(A2:A3, B2:B3, label="売上")';
    return result;
  } finally {
    await fresh.close();
  }
}
