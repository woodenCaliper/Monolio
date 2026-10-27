// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- ハンドル(⋮⋮)のブロックメニュー ----
// 後からブロックの種類を変える/複製・移動・削除する入口。ドラッグは従来どおりで、
// 動かさずに離したクリックだけがメニューを開く。
export default async function blockMenuSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  const menuOpen = () => fresh.evaluate(() => !document.querySelector("#block-menu").hidden);
  const menuShape = () => fresh.evaluate(() => {
    const menu = document.querySelector("#block-menu");
    return {
      current: menu.querySelector(".menu-current")?.textContent || "",
      sections: [...menu.querySelectorAll(".menu-section")].map((node) => node.textContent),
      actions: [...menu.querySelectorAll(".menu-item")].map((node) => node.dataset.action),
      checked: [...menu.querySelectorAll('.menu-item[aria-checked="true"]')].map((node) => node.dataset.action),
      // 画面に出る ✓ も見る。ARIA だけだと、印を消しても気づけない(赤確認で判明)。
      checkMarks: [...menu.querySelectorAll(".menu-item")].filter((node) => node.querySelector(".menu-check")).map((node) => node.dataset.action),
      focused: document.activeElement?.className || "",
    };
  });
  const typeOf = (text) => fresh.evaluate((needle) => {
    const row = [...document.querySelectorAll("#blocks .block")]
      .find((item) => (item.querySelector(".block-content")?.textContent || "") === needle);
    return row ? [...row.classList].find((name) => name.startsWith("type-")) : null;
  }, text);
  const openMenuFor = async (text) => {
    // 開いたままのメニューは次のブロックのハンドルを覆う(実際にフルランで詰まった)。
    // 利用者も同じで、別のブロックを触るにはまず閉じる操作が要る。
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(80);
    const id = await fresh.evaluate((needle) => [...document.querySelectorAll("#blocks .block")]
      .find((item) => (item.querySelector(".block-content")?.textContent || "").includes(needle))?.dataset.id, text);
    if (!id) return null;
    await fresh.locator(`#blocks .block[data-id="${id}"] .drag-grip`).click();
    await fresh.waitForTimeout(200);
    return id;
  };
  const newParagraph = async (text) => {
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type(text);
    await fresh.waitForTimeout(150);
  };
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 開いたときの中身: 検索欄にフォーカス、いまの種別、変換と操作の2段。
    await newParagraph("MENU base text");
    await openMenuFor("MENU base text");
    const opened = await menuShape();
    result.blockMenuOpensFromGrip = await menuOpen();
    result.blockMenuFocusesSearchBox = opened.focused.includes("block-menu-search");
    result.blockMenuShowsCurrentType = opened.current.includes("段落");
    result.blockMenuHasConvertAndActionSections = opened.sections.length === 2
      && opened.sections[0].includes("変換") && opened.sections[1] === "操作";
    // いまの種別にだけ ✓ が付く(Notion と同じ)。
    result.blockMenuChecksCurrentType = opened.checked.length === 1 && opened.checked[0] === "paragraph"
      && opened.checkMarks.length === 1 && opened.checkMarks[0] === "paragraph";
    // 変換先は「本文テキストだけで表せる種別」。表・添付・区切り線は出さない。
    result.blockMenuOffersTextTypesOnly = ["code", "math", "quote", "todo"].every((type) => opened.actions.includes(type))
      && ["table", "attachment", "divider", "chart", "toc"].every((type) => !opened.actions.includes(type));
    result.blockMenuOffersBlockActions = ["duplicate", "moveup", "movedown", "delete"]
      .every((action) => opened.actions.includes(action));

    // 2) 検索で絞れる(日本語ラベル)。
    await fresh.keyboard.type("複製");
    await fresh.waitForTimeout(200);
    const filtered = await menuShape();
    result.blockMenuSearchFiltersItems = filtered.actions.length === 1 && filtered.actions[0] === "duplicate";
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);

    // 3) キーボードで選んで変換できる(↓↓ + Enter)。
    await openMenuFor("MENU base text");
    await fresh.keyboard.type("見出し2");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    result.blockMenuConvertsTypeFromKeyboard = (await typeOf("MENU base text")) === "type-heading2";
    result.blockMenuClosesAfterChoosing = !(await menuOpen());
    // 変換は Undo 1手で戻る。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.blockMenuConvertUndoIsOneStep = (await typeOf("MENU base text")) === "type-paragraph";

    // 4) 書式つきの本文を見出しへ変えても書式は残る(素のテキスト種別へ移すときだけ捨てる)。
    await newParagraph("MENU rich text");
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent === "MENU rich text");
      const range = document.createRange();
      range.selectNodeContents(editable);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Control+b");
    await fresh.waitForTimeout(200);
    const boldBefore = await fresh.evaluate(() => Boolean([...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent === "MENU rich text")?.querySelector("b, strong")));
    await openMenuFor("MENU rich text");
    await fresh.keyboard.type("見出し3");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const boldAfterHeading = await fresh.evaluate(() => Boolean([...document.querySelectorAll("#blocks .block-content")]
      .find((item) => item.textContent === "MENU rich text")?.querySelector("b, strong")));
    result.blockMenuConvertKeepsRichText = boldBefore && boldAfterHeading;
    // コードへ移すと装飾は持てない(Notion と同じ)。ただし Undo 1手で書式ごと戻る。
    await openMenuFor("MENU rich text");
    await fresh.keyboard.type("コード");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const codeState = await fresh.evaluate(() => {
      const row = [...document.querySelectorAll("#blocks .block")]
        .find((item) => (item.querySelector(".block-content")?.textContent || "") === "MENU rich text");
      return {
        type: row ? [...row.classList].find((name) => name.startsWith("type-")) : null,
        bold: Boolean(row?.querySelector("b, strong")),
        text: row?.querySelector(".block-content")?.textContent || "",
      };
    });
    result.blockMenuConvertToCodeKeepsTextDropsFormat = codeState.type === "type-code"
      && codeState.text === "MENU rich text" && !codeState.bold;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    const restored = await fresh.evaluate(() => {
      const row = [...document.querySelectorAll("#blocks .block")]
        .find((item) => (item.querySelector(".block-content")?.textContent || "") === "MENU rich text");
      return {
        type: row ? [...row.classList].find((name) => name.startsWith("type-")) : null,
        bold: Boolean(row?.querySelector("b, strong")),
      };
    });
    result.blockMenuCodeConvertUndoRestoresFormat = restored.type === "type-heading3" && restored.bold;
    // コード化で装飾を捨てていることは、描画では見えない(コードは text しか描かない)。
    // 段落へ戻したときに太字が復活しないことで確かめる。捨てずに持ち越すと、本文だけ
    // 編集したあとに戻したとき古い書式が復活する(赤確認Dでこの穴が見つかった)。
    await openMenuFor("MENU rich text");
    await fresh.keyboard.type("コード");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await openMenuFor("MENU rich text");
    await fresh.keyboard.type("段落");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const roundTrip = await fresh.evaluate(() => {
      const row = [...document.querySelectorAll("#blocks .block")]
        .find((item) => (item.querySelector(".block-content")?.textContent || "") === "MENU rich text");
      return {
        type: row ? [...row.classList].find((name) => name.startsWith("type-")) : null,
        bold: Boolean(row?.querySelector("b, strong")),
      };
    });
    result.blockMenuCodeRoundTripDropsFormat = roundTrip.type === "type-paragraph" && !roundTrip.bold;

    // 5) 構造ブロック(表)では変換の段を出さない。操作の段は出す。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh, "table");
    await fresh.waitForTimeout(300);
    const tableId = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block.type-table")].at(-1)?.dataset.id);
    await fresh.locator(`#blocks .block[data-id="${tableId}"] .drag-grip`).click();
    await fresh.waitForTimeout(250);
    const tableMenu = await menuShape();
    result.blockMenuHidesConvertForStructuralBlock = (await menuOpen())
      && tableMenu.sections.length === 1 && tableMenu.sections[0] === "操作"
      // v191: 表・グラフ・画像には「題名を付ける」(caption)が加わった。v229: 表には「データベースにする」(database)が加わった。
      // v283(#176): どのブロックにも「ブロックへのリンクをコピー」(copy-block-link)が加わった。
      && tableMenu.actions.join(",") === "duplicate,copy-block-link,moveup,movedown,caption,database,delete";
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);

    // 6) トグル→段落で子は残る(P16)。トグル系どうしの変換では開いた状態になる。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.type("MENU toggle parent");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("MENU toggle child");
    await fresh.waitForTimeout(250);
    // 閉じてから変換する(閉じていた子が見えるようになることまで見る)。
    await fresh.evaluate(() => {
      const row = [...document.querySelectorAll("#blocks .block.type-toggle")]
        .find((item) => (item.querySelector(".block-content")?.textContent || "") === "MENU toggle parent");
      row?.querySelector(".toggle-caret")?.click();
    });
    await fresh.waitForTimeout(250);
    const childHiddenWhileClosed = await fresh.evaluate(() => ![...document.querySelectorAll("#blocks .block")]
      .some((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU toggle child"));
    await openMenuFor("MENU toggle parent");
    await fresh.keyboard.type("段落");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const afterToParagraph = await fresh.evaluate(() => ({
      parentType: [...document.querySelectorAll("#blocks .block")]
        .find((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU toggle parent")?.className || "",
      childVisible: [...document.querySelectorAll("#blocks .block")]
        .some((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU toggle child"),
    }));
    result.toggleToParagraphKeepsChildren = childHiddenWhileClosed
      && afterToParagraph.parentType.includes("type-paragraph")
      && afterToParagraph.childVisible;
    // 段落へ戻したときに子が見えているのだから、トグルへ戻したときも見えていること
    // (変換は開閉状態の記憶ではない、という仕様)。
    await openMenuFor("MENU toggle parent");
    await fresh.keyboard.type("トグルリスト");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    result.toggleConversionOpensCollapsedToggle = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .some((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU toggle child"));

    // 7) 複製は子ごと。Undo 1手で消える。
    const countChild = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .filter((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU toggle child").length);
    const beforeDuplicate = await countChild();
    await openMenuFor("MENU toggle parent");
    await fresh.keyboard.type("複製");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const afterDuplicate = await countChild();
    result.blockMenuDuplicatesWithChildren = beforeDuplicate === 1 && afterDuplicate === 2;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.blockMenuDuplicateUndoIsOneStep = (await countChild()) === 1;

    // 8) 上へ移動。
    await newParagraph("MENU move target");
    const orderOf = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .map((row) => row.querySelector(".block-content")?.textContent || ""));
    const beforeMove = await orderOf();
    await openMenuFor("MENU move target");
    await fresh.keyboard.type("上へ");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const afterMove = await orderOf();
    result.blockMenuMovesBlockUp = beforeMove.indexOf("MENU move target") > afterMove.indexOf("MENU move target");

    // 9) 削除。
    await openMenuFor("MENU move target");
    await fresh.keyboard.type("削除");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    result.blockMenuDeletesBlock = await fresh.evaluate(() => ![...document.querySelectorAll("#blocks .block")]
      .some((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU move target"));

    // 10) メニューが開いている間でも、検索欄に打っていなければ Delete はブロックを消す(v208。ユーザー指示)。
    //     検索欄に打ったあとの Backspace / Delete は検索欄のもの(打ち直しでブロックが消えない)。
    await newParagraph("MENU delete guard");
    await openMenuFor("MENU delete guard");
    await fresh.keyboard.type("x");
    await fresh.keyboard.press("Backspace");
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(250);
    result.blockMenuSwallowsDeleteWhileOpen = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .some((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU delete guard"));
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(250);
    result.blockMenuDeleteWorksAfterEscape = await fresh.evaluate(() => ![...document.querySelectorAll("#blocks .block")]
      .some((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU delete guard"));

    // 11) 種別変更の入口が3つとも同じ核を通ること(New-28)。コマンドパレットから
    //     グラフにしたとき、スラッシュメニューと同じくサンプル定義が入る。
    //     以前は setActiveType にだけサンプル投入が無く、空のグラフができていた。
    await newParagraph("");
    await fresh.evaluate(() => document.querySelector("#menu-palette")?.click());
    await fresh.waitForTimeout(250);
    await fresh.evaluate(() => {
      const target = [...document.querySelectorAll("#palette-results button")]
        .find((button) => button.textContent.includes("Plot values from a table"));
      target?.click();
    });
    await fresh.waitForTimeout(350);
    result.paletteChartGetsSampleDefinition = await fresh.evaluate(() => {
      const row = [...document.querySelectorAll("#blocks .block.type-chart")].at(-1);
      const text = row?.querySelector(".block-content")?.textContent || "";
      return text.includes("scatter(") && text.includes("title(");
    });

    // 11) ドラッグは従来どおり(動かしたときはメニューを開かない)。
    await newParagraph("MENU drag source");
    const dragId = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .find((row) => (row.querySelector(".block-content")?.textContent || "") === "MENU drag source")?.dataset.id);
    const gripBox = await fresh.locator(`#blocks .block[data-id="${dragId}"] .drag-grip`).boundingBox();
    await fresh.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y - 80, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    result.blockMenuStaysClosedAfterDrag = !(await menuOpen());

    return result;
  } finally {
    await fresh.close();
  }
}
