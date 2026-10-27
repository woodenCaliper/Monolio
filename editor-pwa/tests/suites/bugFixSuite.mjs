// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { join } from "node:path";
import { DOWNLOADS, PORT, dragBlock, insertBlock, openMenu } from "../lib.mjs";

// 2026-08-27 にまとめて報告された不具合(旧 BUGS.md)の再発防止。文書全体の状態に
// 依存しないよう、それぞれ新しいページで検証する。
export default async function bugFixSuite({ context }) {
  const result = {};
  const withPage = async (run) => {
    const fresh = await context.newPage();
    // 新規文書の確認ダイアログはテストでは常に受け入れる。
    fresh.on("dialog", (dialog) => dialog.accept());
    try {
      await fresh.goto("http://127.0.0.1:" + PORT + "/");
      await fresh.waitForSelector("#blocks .block-content");
      await run(fresh);
    } finally {
      await fresh.close();
    }
  };
  const tableShape = (fresh) => fresh.evaluate(() => {
    const table = document.querySelector("#blocks .block.type-table .editor-table");
    if (!table) return null;
    return [...table.querySelectorAll("tr")].map((tr) => (
      [...tr.querySelectorAll("td, th")].map((td) => ({
        tag: td.tagName.toLowerCase(),
        row: Number(td.dataset.row),
        cell: Number(td.dataset.cell),
        colSpan: td.colSpan,
        rowSpan: td.rowSpan,
        text: td.textContent,
      }))
    ));
  });
  const setCell = async (fresh, r, c, text) => {
    await fresh.evaluate(([row, cell, value]) => {
      const td = document.querySelector('#blocks .block.type-table .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]');
      td.focus();
      td.textContent = value;
      td.dispatchEvent(new Event("input", { bubbles: true }));
      td.blur();
    }, [r, c, text]);
    await fresh.waitForTimeout(60);
  };
  const focusCell = async (fresh, r, c) => {
    await fresh.evaluate(([row, cell]) => {
      document.querySelector('#blocks .block.type-table .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]')?.focus();
    }, [r, c]);
    await fresh.waitForTimeout(120);
  };
  const useTool = async (fresh, tool, r, c) => {
    await focusCell(fresh, r, c);
    await fresh.locator('#table-toolbar .table-tool[data-tool="' + tool + '"]').click();
    await fresh.waitForTimeout(250);
  };
  const dragCells = async (fresh, from, to) => {
    const box = await fresh.evaluate(([a, b]) => {
      const q = (r, c) => document.querySelector('#blocks .block.type-table .editor-table [data-row="' + r + '"][data-cell="' + c + '"]');
      const one = q(a[0], a[1]).getBoundingClientRect();
      const two = q(b[0], b[1]).getBoundingClientRect();
      return {
        from: { x: one.left + one.width / 2, y: one.top + one.height / 2 },
        to: { x: two.left + two.width / 2, y: two.top + two.height / 2 },
      };
    }, [from, to]);
    await fresh.mouse.move(box.from.x, box.from.y);
    await fresh.mouse.down();
    await fresh.mouse.move(box.to.x, box.to.y, { steps: 8 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(200);
  };
  const makeTable = async (fresh) => {
    await insertBlock(fresh, "table");
    await fresh.waitForTimeout(250);
  };
  const fillTable = async (fresh, labels) => {
    for (let r = 0; r < labels.length; r += 1) {
      for (let c = 0; c < labels[r].length; c += 1) await setCell(fresh, r, c, labels[r][c]);
    }
  };

  // Bug 1: 本文の途中の Enter はキャレット位置で分割し、キャレットは後半の先頭へ。
  await withPage(async (fresh) => {
    await insertBlock(fresh);
    await fresh.keyboard.type("HeadPartTailPart");
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent === "HeadPartTailPart");
      editable.focus();
      const range = document.createRange();
      range.setStart(editable.firstChild, "HeadPart".length);
      range.collapse(true);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    const texts = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block-content")].map((n) => n.textContent)
    ));
    result.enterSplitsParagraphAtCaret = texts.includes("HeadPart") && texts.includes("TailPart")
      && !texts.includes("HeadPartTailPart");
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(120);
    result.enterSplitCaretLandsAtTailStart = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "XTailPart")
    ));
  });

  // Bug 2: code / chart の中の Enter は改行になり、ブロックは増えない。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "code");
    await fresh.keyboard.type("line1");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("line2");
    await fresh.waitForTimeout(150);
    result.codeBlockEnterInsertsNewline = await fresh.evaluate(() => {
      const blocks = document.querySelectorAll("#blocks .block.type-code");
      return blocks.length === 1
        && blocks[0].querySelector(".block-content").textContent === "line1\nline2";
    });
  });
  await withPage(async (fresh) => {
    await insertBlock(fresh, "chart");
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => {
      const editable = document.querySelector("#blocks .block.type-chart .block-content");
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("xlabel(added)");
    await fresh.waitForTimeout(150);
    result.chartBlockEnterAddsCommandLine = await fresh.evaluate(() => {
      const blocks = document.querySelectorAll("#blocks .block.type-chart");
      const text = blocks[0]?.querySelector(".block-content")?.textContent || "";
      return blocks.length === 1 && text.endsWith("\nxlabel(added)");
    });
  });

  // Bug 3: ヘッダー行 (th) へフォーカスできること。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await useTool(fresh, "header", 0, 0);
    result.tableHeaderToggleKeepsFocus = await fresh.evaluate(() => (
      document.activeElement?.tagName === "TH" && document.activeElement?.dataset.row === "0"
    ));
    await focusCell(fresh, 1, 0);
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(150);
    result.tableShiftTabReachesHeaderRow = await fresh.evaluate(() => (
      document.activeElement?.tagName === "TH" && document.activeElement?.dataset.row === "0"
    ));
  });

  // Bug 4: 空にした親の Backspace は親だけを消し、子はインデントを戻して残す。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.type("parent");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("childdata");
    await fresh.waitForTimeout(150);
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent === "parent");
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(150);
    // 1回目の（空にしてからの）Backspace ではトグルの印だけ外れて段落になり、
    // 子ブロックはまだそのまま残る。
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(250);
    result.emptyParentBackspaceDemotesFirst = await fresh.evaluate(() => {
      const child = [...document.querySelectorAll("#blocks .block")]
        .find((row) => row.querySelector(".block-content")?.textContent === "childdata");
      const toggles = document.querySelectorAll("#blocks .block.type-toggle").length;
      return Boolean(child) && toggles === 1
        && getComputedStyle(child).getPropertyValue("--indent").trim() === "1";
    });
    // 2回目で空の段落だけが消え、子はインデントを1つ戻して残る。
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(250);
    result.emptyParentBackspaceKeepsChildren = await fresh.evaluate(() => {
      const child = [...document.querySelectorAll("#blocks .block")]
        .find((row) => row.querySelector(".block-content")?.textContent === "childdata");
      return Boolean(child)
        && getComputedStyle(child).getPropertyValue("--indent").trim() === "0";
    });
  });

  // Bug 5: 行の挿入削除で式の A1 参照が追随し、結果が黙って変わらないこと。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await setCell(fresh, 0, 0, "10");
    await setCell(fresh, 1, 0, "2");
    await setCell(fresh, 2, 0, "3");
    await setCell(fresh, 0, 1, "=SUM(A1:A3)");
    await setCell(fresh, 1, 1, "=B1*2");
    await setCell(fresh, 2, 1, "=A2");
    await useTool(fresh, "row-before", 0, 0);
    const inserted = (await tableShape(fresh)).flat();
    const at = (r, c) => inserted.find((cell) => cell.row === r && cell.cell === c)?.text;
    result.tableRowInsertKeepsFormulaTargets = at(1, 1) === "15";
    result.tableRowInsertKeepsFormulaChain = at(2, 1) === "30";
    // 行を消したら、範囲は1行縮んで残りの値だけを合計すること。
    await useTool(fresh, "row-delete", 0, 0);
    await useTool(fresh, "row-delete", 1, 0);
    const removed = (await tableShape(fresh)).flat();
    const afterAt = (r, c) => removed.find((cell) => cell.row === r && cell.cell === c)?.text;
    result.tableRowDeleteShiftsFormulaRange = afterAt(0, 1) === "13";
    // 合計が偶然同じ値になっても検出できるよう、式そのものの書き換えも見る。
    await focusCell(fresh, 0, 1);
    result.tableRowDeleteRewritesFormulaText = await fresh.evaluate(() => (
      document.activeElement?.textContent === "=SUM(A1:A2)"
    ));
    // 消した行そのものへの参照は #REF になること（黙って別の値を出さない。
    // v114 で Excel の語彙に合わせ、参照切れは #ERR ではなく #REF と表示する）。
    result.tableDeletedFormulaRefBecomesError = afterAt(1, 1) === "#REF";
  });

  // Bug 6: 結合セルをまたぐ列の挿入で、列がまっすぐのまま結合が1列伸びること。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await fillTable(fresh, [["a1", "b1", "c1"], ["a2", "b2", "c2"], ["a3", "b3", "c3"]]);
    await dragCells(fresh, [0, 0], [1, 1]);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(250);
    await useTool(fresh, "col-before", 2, 1);
    const rows = await tableShape(fresh);
    const merged = rows.flat().find((cell) => cell.row === 0 && cell.cell === 0);
    const bottom = rows[2] ?? [];
    result.columnInsertAcrossMergeKeepsGrid = merged?.colSpan === 3
      && bottom.length === 4 && bottom[0]?.text === "a3" && bottom[1]?.text === ""
      && bottom[2]?.text === "b3" && bottom[3]?.text === "c3";
  });

  // Bug 7: 縦結合に覆われた行を消しても、繰り上がった行が飲み込まれないこと。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await fillTable(fresh, [["a1", "b1", "c1"], ["a2", "b2", "c2"], ["a3", "b3", "c3"]]);
    await dragCells(fresh, [0, 0], [1, 0]);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(250);
    await useTool(fresh, "row-delete", 1, 1);
    const rows = await tableShape(fresh);
    const texts = rows.flat().map((cell) => cell.text);
    const merged = rows.flat().find((cell) => cell.row === 0 && cell.cell === 0);
    result.rowDeleteUnderVerticalMergeKeepsNextRow = merged?.rowSpan === 1
      && texts.includes("a3") && texts.includes("b3") && texts.includes("c3");
  });

  // Bug 8: 添付ブロックをコピー→元を削除→貼り付けで、実データごと戻ること。
  await withPage(async (fresh) => {
    await fresh.evaluate(async () => {
      const target = document.querySelector("#blocks .block-content");
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      canvas.getContext("2d").fillRect(0, 0, 40, 40);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "clipboard-image.png", { type: "image/png" }));
      target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await fresh.locator('img.attachment-image[alt="clipboard-image.png"]').waitFor({ state: "visible" });
    const attachmentRow = fresh.locator("#blocks .block", { has: fresh.locator("img.attachment-image") });
    await attachmentRow.locator(".drag-grip").click();
    // v125: メニューが開くが、Ctrl 付きのショートカットはそのまま効く(素通りさせている)。
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+c");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Delete");
    await fresh.waitForTimeout(250);
    const dataRemoved = await fresh.evaluate(() => document.querySelectorAll("img.attachment-image").length === 0);
    await fresh.locator("#blocks .block .drag-grip").first().click();
    await fresh.keyboard.press("Control+v");
    await fresh.waitForTimeout(300);
    result.blockPasteRestoresDeletedAttachment = dataRemoved && await fresh.evaluate(() => {
      const image = document.querySelector("img.attachment-image");
      const missing = [...document.querySelectorAll("#blocks .block")]
        .some((row) => row.textContent.includes("Missing attachment"));
      return Boolean(image) && !missing;
    });
  });

  // Bug 9: 新規文書の直後に Ctrl+Z しても、前の文書が呼び戻されないこと。
  await withPage(async (fresh) => {
    await fresh.locator("#blocks .block-content").nth(1).click();
    await fresh.keyboard.press("Control+A");
    await fresh.keyboard.type("previous document body");
    await fresh.waitForTimeout(150);
    await openMenu(fresh, "file");
    await fresh.locator("#menu-new-document").click();
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    result.undoAfterNewDocumentKeepsNewDocument = await fresh.evaluate(() => (
      ![...document.querySelectorAll("#blocks .block-content")]
        .some((n) => n.textContent.includes("previous document body"))
    ));
  });

  // v188: 済んだ ToDo は、エディタでも取り消し線と薄い色(Notion と同じ。保存HTMLの .todo.done にそろえる。ユーザー指示)。
  // チェックを外せば戻り、Undo でも戻る。
  await withPage(async (fresh) => {
    await fresh.locator("#blocks .block-content").nth(1).click();
    await insertBlock(fresh, "todo");
    await fresh.keyboard.type("todo-strike-check");
    const row = fresh.locator("#blocks .block.type-todo", { hasText: "todo-strike-check" });
    const struck = () => row.evaluate((el) => {
      const style = getComputedStyle(el.querySelector(".block-content"));
      return style.textDecorationLine.includes("line-through") && style.color !== getComputedStyle(document.body).color;
    });
    const before = await struck();
    await row.locator(".todo-box").click();
    await fresh.waitForTimeout(100);
    const checked = await struck();
    await row.locator(".todo-box").click();
    await fresh.waitForTimeout(100);
    const unchecked = await struck();
    await row.locator(".todo-box").click();
    await fresh.waitForTimeout(100);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(200);
    const undone = await fresh.locator("#blocks .block.type-todo", { hasText: "todo-strike-check" }).evaluate((el) => (
      getComputedStyle(el.querySelector(".block-content")).textDecorationLine.includes("line-through")
    ));
    result.todoDoneIsStruckThrough = !before && checked && !unchecked;
    result.todoDoneStrikeFollowsUndo = !undone;
  });

  // Bug 10: タイトルでの Enter は改行にならず(題名は1行のまま。打った文字も題名に入らない)、本文へ移る。
  // v187: タイトルの末尾で Enter → 本文の一番上に空の行を作ってそこへ(Notion と同じ)。以前は先頭ブロックの末尾へ移り、
  // 打った文字が先頭の文の後ろに付いた(ユーザー報告)。先頭がもう空の段落なら行を重ねない。Undo 1回で行が消える。
  await withPage(async (fresh) => {
    const texts = () => fresh.evaluate(() => [...document.querySelectorAll("#blocks .block > .block-content")].map((n) => n.textContent));
    const before = await texts();
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("new-top-line");
    await fresh.waitForTimeout(150);
    const after = await texts();
    const title = await fresh.evaluate(() => document.querySelector("#doc-title").textContent);
    result.titleEnterCreatesEmptyLineOnTop = after[0] === "new-top-line" && after[1] === before[0] && after.length === before.length + 1
      && !title.includes("\n") && !title.includes("new-top-line");
    result.titleEnterEvidence = { title, before: before.slice(0, 2), after: after.slice(0, 2), beforeCount: before.length, afterCount: after.length };
    // もう一度タイトルから Enter: 先頭は空ではないので1行増える。その空の行のまま、もう一度 → 増えない。
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(100);
    const once = (await texts()).length;
    await fresh.locator("#doc-title").click();
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(100);
    const twice = (await texts()).length;
    result.titleEnterDoesNotStackEmptyLines = once === after.length + 1 && twice === once;
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(150);
    result.titleEnterNewLineUndoable = (await texts()).length === after.length;
  });

  // Open-A(chartSvg は開いた文書由来の文字列なので、読み込み時と保存時に無害化する)は importSanitizeSuite の
  // savedHtmlHasNoScriptOrHandlers・savedChartSvgKeepsDrawingAndReopensClean が見る。

  // Open-B: 上書き保存の createWritable が失敗しても、黙らずエラーを出す。
  await withPage(async (fresh) => {
    await fresh.evaluate(() => {
      const handle = {
        name: "probe.html",
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      };
      window.__probeHandle = handle;
      Object.defineProperty(window, "showSaveFilePicker", {
        value: async () => handle,
        configurable: true,
      });
    });
    await openMenu(fresh, "file");
    await fresh.locator("#menu-save-as").click();
    // 決め打ちの 400ms 待ちは、全テストを10組で同時に流すと間に合わないことがあった(2026-10-18)。表示を待つ
    result.fileHandleSaveWorks = await fresh.waitForFunction(() => (
      document.querySelector("#status")?.textContent === "Saved"
    ), null, { timeout: 5000 }).then(() => true).catch(() => false);
    // 権限失効を模して、以後の createWritable を失敗させる。
    await fresh.evaluate(() => {
      window.__probeHandle.createWritable = async () => {
        throw new DOMException("The request is not allowed", "NotAllowedError");
      };
    });
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.keyboard.type("x");
    await fresh.keyboard.press("Control+s");
    // 決め打ちの 400ms 待ちは、全テストを同時に流すと間に合わないことがあった(2026-10-24。fileHandleSaveWorks と同じ)。表示を待つ
    result.fileHandleSaveFailureWarns = await fresh.waitForFunction(() => {
      const status = document.querySelector("#status");
      return status?.dataset.kind === "warn" && String(status?.textContent).includes("保存できませんでした");
    }, null, { timeout: 5000 }).then(() => true).catch(() => false);
  });

  // Open-C: 連続入力は1回の Undo でまとめて戻り、キャレットは編集していた場所へ戻る。
  await withPage(async (fresh) => {
    await insertBlock(fresh);
    await fresh.keyboard.type("first");
    await fresh.waitForTimeout(1700);
    await fresh.keyboard.type("second");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(300);
    const afterUndo = await fresh.evaluate(() => ({
      texts: [...document.querySelectorAll("#blocks .block-content")].map((n) => n.textContent),
      activeText: document.activeElement?.closest?.(".block-content")?.textContent ?? null,
    }));
    result.undoCoalescesTypingBurst = afterUndo.texts.includes("first")
      && !afterUndo.texts.some((text) => text.includes("second"));
    result.undoReturnsCaretToEditedBlock = afterUndo.activeText === "first";
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(300);
    result.redoRestoresCoalescedBurst = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "firstsecond")
    ));
  });

  // Open-D: 空のトグルも Enter / Backspace で段落へ戻る（bullet などと同じ）。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    result.emptyToggleEnterReturnsParagraph = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .block.type-toggle").length === 0
      && Boolean(document.activeElement?.closest?.(".block.type-paragraph"))
    ));
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(250);
    result.emptyToggleBackspaceReturnsParagraph = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .block.type-toggle").length === 0
    ));
  });

  // Open-E: 先頭セルの Shift+Tab は留まる。(最終セルの Tab が行を足して移るのは tableKeepCellSuite の tableTabAtEndStillMovesToNewRow が見る。)
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await focusCell(fresh, 0, 0);
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(200);
    result.tableFirstCellShiftTabStays = await fresh.evaluate(() => (
      document.activeElement?.dataset?.row === "0" && document.activeElement?.dataset?.cell === "0"
    ));
  });

  // Open-F: 上に表が無いグラフは、下の表へ黙ってフォールバックせずエラーを出す。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "chart");
    await fresh.waitForTimeout(250);
    await makeTable(fresh);
    await setCell(fresh, 0, 0, "1");
    await setCell(fresh, 0, 1, "2");
    await setCell(fresh, 1, 0, "3");
    await setCell(fresh, 1, 1, "4");
    await fresh.waitForTimeout(250);
    result.chartWithoutTableAboveShowsError = await fresh.evaluate(() => {
      const canvas = document.querySelector("#blocks .block.type-chart .chart-canvas");
      return Boolean(canvas)
        && canvas.textContent.includes("読み取る表が見つかりません")
        && canvas.querySelectorAll(".chart-point").length === 0;
    });
  });

  // New-1: セル内の Enter はブロックを増やさず、下の行の同じ列へ移る。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    const blocksBefore = await fresh.evaluate(() => document.querySelectorAll("#blocks .block").length);
    await focusCell(fresh, 0, 0);
    await fresh.keyboard.type("x");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const afterFirst = await fresh.evaluate(() => ({
      blocks: document.querySelectorAll("#blocks .block").length,
      row: document.activeElement?.dataset?.row,
      cell: document.activeElement?.dataset?.cell,
    }));
    result.tableCellEnterMovesToRowBelow = afterFirst.row === "1" && afterFirst.cell === "0";
    await focusCell(fresh, 2, 0);
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const afterLast = await fresh.evaluate(() => ({
      blocks: document.querySelectorAll("#blocks .block").length,
      row: document.activeElement?.dataset?.row,
    }));
    result.tableCellEnterAddsNoBlock = afterFirst.blocks === blocksBefore && afterLast.blocks === blocksBefore;
    result.tableCellEnterLastRowStays = afterLast.row === "2";
  });

  // New-2(保存した単一HTMLでは数式セルは計算結果の文字として焼き込まれ、保存した中身には式が残る)は、このファイルの
  // exportedFormulaCellUnderlined(保存HTMLのセルの文字が計算値・式は title・doc-formula の印)と、lowFixNumberSuite の
  // lowFixFullWidthStoredTextKept(保存HTMLを読み直したモデルに式の文字が残る)が見る。

  // New-3: 目次から、閉じたトグルの中の見出しへも移れる（祖先を開いて移動）。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "toggle heading 1");
    await fresh.keyboard.type("親見出し");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.type("## 子見出し");
    await fresh.waitForTimeout(200);
    // 目次はトグルの外（インデント0）に作る。
    const childId = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent === "子見出し")?.dataset.id ?? null
    ));
    await fresh.locator('#blocks .block[data-id="' + childId + '"] .insert-block').click();
    await fresh.keyboard.press("Shift+Tab");
    await fresh.keyboard.type("/toc");
    await fresh.waitForTimeout(300);
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    await fresh.locator("#blocks .block.type-toggleHeading1 .toggle-caret").click();
    await fresh.waitForTimeout(250);
    result.tocKeepsHiddenHeadingListed = await fresh.evaluate(() => (
      ![...document.querySelectorAll("#blocks .block-content")].some((item) => item.textContent === "子見出し")
      && [...document.querySelectorAll("#blocks .toc-item")].some((item) => item.textContent === "子見出し")
    ));
    await fresh.locator("#blocks .toc-item", { hasText: "子見出し" }).click();
    await fresh.waitForTimeout(300);
    const state = await fresh.evaluate(() => ({
      childVisible: [...document.querySelectorAll("#blocks .block-content")]
        .some((item) => item.textContent === "子見出し"),
      activeText: document.activeElement?.closest?.(".block-content")?.textContent ?? null,
      toggleOpen: Boolean(document.querySelector('#blocks .block.type-toggleHeading1 .toggle-caret svg[data-icon="caret-down"]')),
    }));
    result.tocClickOpensClosedToggle = state.childVisible && state.toggleOpen;
    result.tocClickFocusesHiddenHeading = state.activeText === "子見出し";
  });

  // New-4: 複数行テキストの貼り付けで行の区切りが失われない。
  // New-6: 貼り付けた複数行の段落は、保存した単一HTMLでも行として残る(同じ貼り付け1回で、画面 → 描き直し → 保存HTMLの順に見る)。
  await withPage(async (fresh) => {
    await insertBlock(fresh);
    await fresh.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", "expLine1\nexpLine2\nexpLine3");
      document.activeElement.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer })
      );
    });
    await fresh.waitForTimeout(200);
    result.multilinePasteKeepsLineBreaks = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "expLine1\nexpLine2\nexpLine3")
    ));
    // モデルから描き直しても3行のままであること（潰れているとここで1行になる）。
    await insertBlock(fresh);
    await fresh.waitForTimeout(200);
    result.multilinePasteSurvivesRerender = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "expLine1\nexpLine2\nexpLine3")
    ));
    await fresh.keyboard.press("Escape");
    const downloadPromise = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const download = await downloadPromise;
    const savedPath = join(DOWNLOADS, "multiline-export-probe.html");
    await download.saveAs(savedPath);
    const viewer = await context.newPage();
    try {
      await viewer.goto("file:///" + savedPath.replaceAll("\\", "/"), { waitUntil: "domcontentloaded" });
      result.exportedParagraphKeepsLineBreaks = await viewer.evaluate(() => {
        const target = [...document.querySelectorAll("main p")].find((node) => node.textContent.includes("expLine1"));
        const single = [...document.querySelectorAll("main p")].find((node) => node.textContent.includes("ここに本文"));
        if (!target || !single) return false;
        // pre-wrap で改行文字が行として描かれ、1行の段落より背が高くなること。
        return getComputedStyle(target).whiteSpace === "pre-wrap"
          && target.textContent.includes("expLine1\nexpLine2")
          && target.getBoundingClientRect().height > single.getBoundingClientRect().height * 2;
      });
    } finally {
      await viewer.close();
    }
  });

  // New-5: 親の無いままインデントした番号付きリストは「1.1」ではなく「1.」。
  await withPage(async (fresh) => {
    await insertBlock(fresh);
    await fresh.keyboard.type("1. item");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(250);
    result.orphanIndentedNumberStartsAtOne = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block.type-numbered")]
        .find((row) => row.textContent.includes("item"))
        ?.querySelector(".numbered-marker")?.textContent === "1."
    ));
  });

  // New-7: 折りたたんだトグルをドラッグ移動しても、隠れている子が付いてくる。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.type("dragparent");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("dragchild");
    await insertBlock(fresh);
    await fresh.keyboard.press("Shift+Tab");
    await fresh.keyboard.type("dropzone");
    await fresh.waitForTimeout(150);
    await fresh.locator("#blocks .block.type-toggle .toggle-caret").first().click();
    await fresh.waitForTimeout(200);
    await dragBlock(fresh, "dragparent", "dropzone", "after");
    await fresh.locator("#blocks .block.type-toggle .toggle-caret").first().click();
    await fresh.waitForTimeout(250);
    result.dragMovesSubtreeTogether = await fresh.evaluate(() => {
      const rows = [...document.querySelectorAll("#blocks .block")].map((row) => ({
        text: row.querySelector(".block-content")?.textContent ?? "",
        indent: getComputedStyle(row).getPropertyValue("--indent").trim() || "0",
      }));
      const at = (text) => rows.findIndex((row) => row.text === text);
      return at("dropzone") >= 0 && at("dragparent") === at("dropzone") + 1
        && at("dragchild") === at("dragparent") + 1
        && rows[at("dragchild")].indent === "1";
    });
  });

  // New-8: 表のセルを編集している間、効かない書式ツールは無効表示になる。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await focusCell(fresh, 0, 0);
    const whileEditing = await fresh.evaluate(() => ({
      bold: document.querySelector("#format-bold").disabled,
      font: document.querySelector("#format-font").disabled,
      // 文字色・背景色・Tx は「セルの色」として効くので、無効にしない。
      color: document.querySelector("#format-color-trigger").disabled,
      reset: document.querySelector("#format-reset").disabled,
      tableToolEnabled: !document.querySelector("#table-toolbar .table-tool").disabled,
    }));
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    const afterLeaving = await fresh.evaluate(() => ({
      bold: document.querySelector("#format-bold").disabled,
      font: document.querySelector("#format-font").disabled,
    }));
    result.cellEditingDisablesFormatTools = whileEditing.bold && whileEditing.font
      && !whileEditing.color && !whileEditing.reset && whileEditing.tableToolEnabled;
    result.formatToolsReenableOutsideTable = !afterLeaving.bold && !afterLeaving.font;
  });

  // New-9: コードブロックの Tab はブロックの字下げではなく、タブ文字の入力。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "code");
    await fresh.keyboard.type("if x:");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("y");
    await fresh.waitForTimeout(150);
    result.codeTabInsertsIndentCharacter = await fresh.evaluate(() => {
      const row = document.querySelector("#blocks .block.type-code");
      return row?.querySelector(".block-content")?.textContent === "if x:\n\ty"
        && (getComputedStyle(row).getPropertyValue("--indent").trim() || "0") === "0";
    });
  });

  // New-10(ブロックを選択した状態の Tab / Shift+Tab で字下げ)は blockSelectSuite の selectedBlockTabIndentsOnlyThatBlock・
  // deepIndentSelectedTabStepsOne(選んだまま Shift+Tab を2回押して2段戻る = 字下げの後も選択が残る)が見る。

  // 行・列の選択ハンドル（Notion と同じ）。アクティブなセルの列の上と行の左に
  // だけ出て、押すとその列・行がまるごと選択される。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await focusCell(fresh, 1, 1);
    result.tableRangeHandlesAppearForActiveCell = await fresh.evaluate(() => {
      const handles = [...document.querySelectorAll(".table-range-handle")];
      const td = document.querySelector('#blocks .editor-table [data-row="1"][data-cell="1"]');
      const cellRect = td.getBoundingClientRect();
      const tableRect = document.querySelector("#blocks .editor-table").getBoundingClientRect();
      const column = handles.find((h) => h.dataset.handle === "column")?.getBoundingClientRect();
      const rowHandle = handles.find((h) => h.dataset.handle === "row")?.getBoundingClientRect();
      return handles.length === 2
        && column && Math.abs((column.left + column.width / 2) - (cellRect.left + cellRect.width / 2)) < 3
        && Math.abs((column.top + column.height / 2) - tableRect.top) < 6
        && rowHandle && Math.abs((rowHandle.top + rowHandle.height / 2) - (cellRect.top + cellRect.height / 2)) < 3
        && Math.abs((rowHandle.left + rowHandle.width / 2) - tableRect.left) < 6;
    });
    await fresh.locator('.table-range-handle[data-handle="column"]').click();
    await fresh.waitForTimeout(200);
    result.tableColumnHandleSelectsColumn = await fresh.evaluate(() => {
      const selected = [...document.querySelectorAll("#blocks .editor-table .cell-selected")];
      return selected.length === 3 && selected.every((node) => node.dataset.cell === "1");
    });
    await fresh.locator('.table-range-handle[data-handle="row"]').click();
    await fresh.waitForTimeout(200);
    result.tableRowHandleSelectsRow = await fresh.evaluate(() => {
      const selected = [...document.querySelectorAll("#blocks .editor-table .cell-selected")];
      return selected.length === 3 && selected.every((node) => node.dataset.row === "1");
    });
    // 別のセルへ移ると、取っ手もそのセルの列・行へ動く。
    await focusCell(fresh, 0, 2);
    result.tableRangeHandlesFollowActiveCell = await fresh.evaluate(() => {
      const handles = [...document.querySelectorAll(".table-range-handle")];
      const td = document.querySelector('#blocks .editor-table [data-row="0"][data-cell="2"]');
      const cellRect = td.getBoundingClientRect();
      const column = handles.find((h) => h.dataset.handle === "column")?.getBoundingClientRect();
      return handles.length === 2
        && column && Math.abs((column.left + column.width / 2) - (cellRect.left + cellRect.width / 2)) < 3;
    });
    // 選択した行は既存の「セルを結合」にそのまま使える。
    await fresh.locator('.table-range-handle[data-handle="row"]').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#table-toolbar .table-tool[data-tool="merge"]').click();
    await fresh.waitForTimeout(300);
    result.tableRowSelectionCanMerge = await fresh.evaluate(() => (
      document.querySelector('#blocks .editor-table [data-row="0"][data-cell="0"]')?.colSpan === 3
    ));
    // 表の外へ出ると取っ手は消える。
    await fresh.locator("#blocks .block-content").first().click();
    await fresh.waitForTimeout(250);
    result.tableRangeHandlesHideOutsideTable = await fresh.evaluate(() => (
      document.querySelectorAll(".table-range-handle").length === 0
    ));
  });

  // New-11〜14: ブロック選択モードのキー操作（Backspace 削除・↑↓・Enter）。
  await withPage(async (fresh) => {
    const gripSelect = async (text) => {
      const rowId = await fresh.evaluate((needle) => (
        [...document.querySelectorAll("#blocks .block-content")]
          .find((n) => n.textContent === needle)?.dataset.id
      ), text);
      await fresh.locator('#blocks .block[data-id="' + rowId + '"] .drag-grip').click();
      // v125: 選択だけしたいので、開いたメニューは閉じる。
      await fresh.keyboard.press("Escape");
      await fresh.waitForTimeout(150);
    };
    const selectedTexts = () => fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block.selected")]
        .map((row) => row.querySelector(".block-content")?.textContent ?? "")
    ));
    await insertBlock(fresh);
    await fresh.keyboard.type("arrow-a");
    await insertBlock(fresh);
    await fresh.keyboard.type("arrow-b");
    await fresh.waitForTimeout(150);
    // ↑↓ で選択が隣の見えているブロックへ移る。
    await gripSelect("arrow-a");
    await fresh.keyboard.press("ArrowDown");
    await fresh.waitForTimeout(200);
    const afterDown = await selectedTexts();
    await fresh.keyboard.press("ArrowUp");
    await fresh.waitForTimeout(200);
    const afterUp = await selectedTexts();
    result.selectedBlockArrowMovesSelection = afterDown.length === 1 && afterDown[0] === "arrow-b"
      && afterUp.length === 1 && afterUp[0] === "arrow-a";
    // Enter で選択したブロックの本文編集に入る。
    await gripSelect("arrow-b");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(150);
    result.selectedBlockEnterEntersEditing = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "arrow-bX")
      && document.querySelectorAll("#blocks .block.selected").length === 0
    ));
    // Backspace でも Delete と同じく選択ブロックを削除できる。
    await gripSelect("arrow-a");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(250);
    result.selectedBlockBackspaceDeletes = await fresh.evaluate(() => (
      ![...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "arrow-a")
    ));
  });

  // New-12: code の Shift+Tab は行頭の字下げを1段外す（Tab の逆操作）。
  await withPage(async (fresh) => {
    await insertBlock(fresh, "code");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("indented");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Shift+Tab");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(150);
    result.codeShiftTabRemovesLineIndent = await fresh.evaluate(() => {
      const row = document.querySelector("#blocks .block.type-code");
      return row?.querySelector(".block-content")?.textContent === "indentedX"
        && (getComputedStyle(row).getPropertyValue("--indent").trim() || "0") === "0";
    });
  });

  // New-15: 区切り線の直後の先頭 Backspace は、区切り線そのものを消す。
  await withPage(async (fresh) => {
    await insertBlock(fresh);
    await fresh.keyboard.type("---");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("afterline");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Home");
    await fresh.keyboard.press("Backspace");
    await fresh.waitForTimeout(250);
    await fresh.keyboard.type("Z");
    await fresh.waitForTimeout(150);
    result.backspaceAfterDividerRemovesIt = await fresh.evaluate(() => (
      document.querySelectorAll("#blocks .block.type-divider").length === 0
      && [...document.querySelectorAll("#blocks .block-content")].some((n) => n.textContent === "Zafterline")
    ));
  });

  // 数式セルの見分け: 計算値には点線の下線とホバーで式のツールチップが付く。
  // 手で入れた値には付かず、式⇄値の書き換えにも追随する。保存HTMLでも同じ。
  await withPage(async (fresh) => {
    await makeTable(fresh);
    await setCell(fresh, 0, 0, "120");
    await setCell(fresh, 0, 1, "3");
    await setCell(fresh, 0, 2, "=A1*B1");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(200);
    const cellState = (r, c) => fresh.evaluate(([row, cell]) => {
      const td = document.querySelector('#blocks .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]');
      const style = getComputedStyle(td);
      return {
        text: td.textContent,
        formulaClass: td.classList.contains("formula-cell"),
        underline: style.textDecorationLine.includes("underline") && style.textDecorationStyle === "dotted",
        title: td.getAttribute("title"),
      };
    }, [r, c]);
    const computed = await cellState(0, 2);
    const plain = await cellState(0, 0);
    result.formulaCellShowsDottedUnderline = computed.text === "360" && computed.formulaClass
      && computed.underline && computed.title === "=A1*B1";
    result.plainCellHasNoUnderline = !plain.formulaClass && !plain.underline && plain.title === null;
    await setCell(fresh, 0, 2, "999");
    await setCell(fresh, 1, 0, "=B1*10");
    await fresh.waitForTimeout(150);
    const cleared = await cellState(0, 2);
    const added = await cellState(1, 0);
    result.formulaUnderlineFollowsEdits = !cleared.formulaClass && !cleared.underline
      && added.formulaClass && added.underline;
    await setCell(fresh, 0, 2, "=A1*B1");
    await setCell(fresh, 1, 0, "");
    const downloadPromise = fresh.waitForEvent("download");
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+s");
    const download = await downloadPromise;
    const savedPath = join(DOWNLOADS, "formula-underline-probe.html");
    await download.saveAs(savedPath);
    const viewer = await context.newPage();
    try {
      await viewer.goto("file:///" + savedPath.replaceAll("\\", "/"), { waitUntil: "domcontentloaded" });
      result.exportedFormulaCellUnderlined = await viewer.evaluate(() => {
        const cells = [...document.querySelectorAll("table.doc-table td")];
        const computedCell = cells.find((td) => td.textContent === "360");
        const plainCell = cells.find((td) => td.textContent === "120");
        if (!computedCell || !plainCell) return false;
        const style = getComputedStyle(computedCell);
        return computedCell.classList.contains("doc-formula")
          && style.textDecorationLine.includes("underline") && style.textDecorationStyle === "dotted"
          && computedCell.getAttribute("title") === "=A1*B1"
          && !plainCell.classList.contains("doc-formula");
      });
    } finally {
      await viewer.close();
    }
  });

  // セルの色: 既存の文字色・背景色ボタンでセル（や行・列の選択範囲）を塗り、
  // Tx でまとめて外せる。色はモデルに入り、保存HTMLにも焼き込まれる。
  await withPage(async (fresh) => {
    const cellStyle = (r, c) => fresh.evaluate(([row, cell]) => {
      const td = document.querySelector('#blocks .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]');
      return { color: td.style.color, background: td.style.backgroundColor };
    }, [r, c]);
    const clickCell = async (r, c) => {
      await fresh.locator('#blocks .editor-table [data-row="' + r + '"][data-cell="' + c + '"]').click();
      await fresh.waitForTimeout(200);
    };
    await makeTable(fresh);
    await clickCell(0, 0);
    await fresh.keyboard.type("colored");
    await fresh.locator("#format-background-trigger").click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#format-background-options .color-swatch").nth(1).click();
    await fresh.waitForTimeout(250);
    await fresh.locator("#format-color-trigger").click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#format-color-options .color-swatch").nth(2).click();
    await fresh.waitForTimeout(250);
    const colored = await cellStyle(0, 0);
    result.cellBackgroundAndTextColorApply = Boolean(colored.background) && Boolean(colored.color);
    // 塗ったあともセルの編集は続けられる（フォーカスを奪わない）。
    await fresh.keyboard.type("X");
    await fresh.waitForTimeout(150);
    // 再描画（モデルからの描き直し）後も色が残り、セルの文字が表の外へ
    // 漏れないこと（セル入力が block.text を汚していた潜在バグの再発防止）。
    await insertBlock(fresh);
    await fresh.waitForTimeout(250);
    const rendered = await fresh.evaluate(() => {
      const content = document.querySelector("#blocks .block.type-table .block-content");
      const td = document.querySelector('#blocks .editor-table [data-row="0"][data-cell="0"]');
      return {
        blockText: content.textContent,
        firstChildIsTable: content.firstElementChild?.tagName === "TABLE",
        cellText: td.textContent,
        background: td.style.backgroundColor,
        color: td.style.color,
      };
    });
    result.cellColorsSurviveRerender = Boolean(rendered.background) && Boolean(rendered.color);
    result.cellTypingDoesNotLeakIntoBlockText = rendered.cellText === "coloredX"
      && rendered.blockText === "coloredX" && rendered.firstChildIsTable;
    // 行の取っ手で選択して背景色 → 行全体に付く。
    await clickCell(1, 0);
    await fresh.locator('.table-range-handle[data-handle="row"]').click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#format-background-trigger").click();
    await fresh.waitForTimeout(150);
    await fresh.locator("#format-background-options .color-swatch").nth(3).click();
    await fresh.waitForTimeout(250);
    result.rowSelectionBackgroundColorsAllCells = await fresh.evaluate(() => (
      [...document.querySelectorAll('#blocks .editor-table [data-row="1"]')]
        .every((td) => Boolean(td.style.backgroundColor))
    ));
    // Tx でセルの色をまとめて外す（素のクリックで範囲は解除され、そのセルだけ）。
    await clickCell(0, 0);
    await fresh.locator("#format-reset").click();
    await fresh.waitForTimeout(250);
    const reset = await cellStyle(0, 0);
    result.cellFormatResetClearsColors = !reset.color && !reset.background
      && await fresh.evaluate(() => (
        [...document.querySelectorAll('#blocks .editor-table [data-row="1"]')]
          .every((td) => Boolean(td.style.backgroundColor))
      ));
    // 保存HTMLにも色が焼き込まれ、外したセルには付かない。
    const downloadPromise = fresh.waitForEvent("download");
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.press("Control+s");
    const download = await downloadPromise;
    const savedPath = join(DOWNLOADS, "cell-color-probe.html");
    await download.saveAs(savedPath);
    const viewer = await context.newPage();
    try {
      await viewer.goto("file:///" + savedPath.replaceAll("\\", "/"), { waitUntil: "domcontentloaded" });
      result.exportedCellKeepsColors = await viewer.evaluate(() => {
        const rows = [...document.querySelectorAll("table.doc-table tr")];
        const row1 = rows[1] ? [...rows[1].querySelectorAll("td")] : [];
        const cleared = rows[0]?.querySelector("td");
        return row1.length === 3 && row1.every((td) => Boolean(td.style.backgroundColor))
          && cleared && !cleared.style.backgroundColor && !cleared.style.color;
      });
    } finally {
      await viewer.close();
    }
  });

  // New-16: 見出しへの太字は <b> を足し、外すと元の太さに戻る（細字化しない）。
  // キャレットを置いただけでは太字ボタンは点灯しない。
  await withPage(async (fresh) => {
    const selectHeading = () => fresh.evaluate(() => {
      const heading = document.querySelector("#blocks .block.type-heading1 .block-content");
      heading.focus();
      const range = document.createRange();
      range.selectNodeContents(heading);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    const headingState = () => fresh.evaluate(() => {
      const content = document.querySelector("#blocks .block.type-heading1 .block-content");
      const bold = content.querySelector("b, strong");
      return {
        hasB: Boolean(bold),
        normalSpan: [...content.querySelectorAll("span")].some((node) => node.style.fontWeight === "normal"),
        weight: Number.parseInt(getComputedStyle(bold || content).fontWeight, 10),
        hostWeight: content.style.fontWeight || "",
      };
    });
    await selectHeading();
    await fresh.waitForTimeout(150);
    await fresh.locator("#format-bold").click();
    await fresh.waitForTimeout(300);
    const bolded = await headingState();
    result.headingBoldAddsBold = bolded.hasB && !bolded.normalSpan
      && bolded.weight > 760 && bolded.hostWeight === "";
    await fresh.locator("#format-bold").click();
    await fresh.waitForTimeout(300);
    const unbolded = await headingState();
    result.headingBoldTogglesOffCleanly = !unbolded.hasB && !unbolded.normalSpan && unbolded.weight === 760;
    await fresh.evaluate(() => {
      const heading = document.querySelector("#blocks .block.type-heading1 .block-content");
      heading.focus();
      const range = document.createRange();
      range.setStart(heading.firstChild, 2);
      range.collapse(true);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.waitForTimeout(250);
    result.headingCaretDoesNotLightBold = await fresh.evaluate(() => (
      !document.querySelector("#format-bold").classList.contains("active")
    ));
  });

  // New-18: ページ全体選択（Ctrl+A×2）の太字は、見出しにも掛かる。
  await withPage(async (fresh) => {
    await fresh.locator("#blocks .block-content").nth(1).click();
    await fresh.keyboard.press("Control+A");
    await fresh.keyboard.press("Control+A");
    await fresh.waitForTimeout(250);
    await fresh.locator("#format-bold").click();
    await fresh.waitForTimeout(400);
    result.selectAllBoldsHeadings = await fresh.evaluate(() => (
      Boolean(document.querySelector("#blocks .block.type-heading1 .block-content b, #blocks .block.type-heading1 .block-content strong"))
      && Boolean(document.querySelector("#blocks .block.type-paragraph .block-content b, #blocks .block.type-paragraph .block-content strong"))
      && ![...document.querySelectorAll("#blocks .block.type-heading1 .block-content span")]
        .some((node) => node.style.fontWeight === "normal")
    ));
  });

  // New-17: 段組みを作るドラッグでも、子ブロックが同じカラムへ付いてくる。
  await withPage(async (fresh) => {
    await insertBlock(fresh);
    await fresh.keyboard.type("coltarget");
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.type("colparent");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("colchild");
    await fresh.waitForTimeout(200);
    const source = fresh.locator(".block", { hasText: "colparent" }).locator(".drag-grip").first();
    const target = fresh.locator(".block", { hasText: "coltarget" });
    const sourceRect = await source.boundingBox();
    const targetRect = await target.boundingBox();
    await fresh.mouse.move(sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
    await fresh.mouse.down();
    await fresh.mouse.move(targetRect.x + targetRect.width - 2, targetRect.y + targetRect.height / 2, { steps: 16 });
    await fresh.mouse.up();
    await fresh.waitForTimeout(300);
    result.columnDragMovesSubtree = await fresh.evaluate(() => {
      const find = (text) => [...document.querySelectorAll("#blocks .block")]
        .find((row) => row.querySelector(".block-content")?.textContent === text);
      const parent = find("colparent");
      const child = find("colchild");
      const parentColumn = parent?.closest(".column");
      return Boolean(parent?.closest(".column-layout")) && Boolean(parentColumn)
        && parentColumn === child?.closest(".column")
        && getComputedStyle(child).getPropertyValue("--indent").trim() === "1";
    });
  });

  // New-19: 見出しの途中の Enter は両方見出しに分割。末尾の Enter は段落のまま。
  await withPage(async (fresh) => {
    await fresh.evaluate(() => {
      const heading = document.querySelector("#blocks .block.type-heading1 .block-content");
      heading.focus();
      const range = document.createRange();
      range.setStart(heading.firstChild, 4);
      range.collapse(true);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    result.headingSplitKeepsHeadingType = await fresh.evaluate(() => {
      const rows = [...document.querySelectorAll("#blocks .block")].slice(0, 2);
      return rows[0]?.classList.contains("type-heading1")
        && rows[0]?.querySelector(".block-content")?.textContent === "技術文書"
        && rows[1]?.classList.contains("type-heading1")
        && rows[1]?.querySelector(".block-content")?.textContent === "エディタ";
    });
    await fresh.keyboard.press("End");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    result.headingEnterAtEndCreatesParagraph = await fresh.evaluate(() => (
      [...document.querySelectorAll("#blocks .block")][2]?.classList.contains("type-paragraph")
    ));
  });

  // New-20(言語付きコードフェンス「```js」の言語名は本文に残らない)は listShortcutSuite の fenceLanguageAtEndIsDropped が見る。

  // Excel 風ポイントモード: 式（= 始まり）を編集中に別セルをクリックすると
  // 参照が入る。直後のクリックは参照を置き換え、演算子の後は追記。
  // 参照が入るのは = や演算子の直後だけで、それ以外は通常のセル移動。
  await withPage(async (fresh) => {
    const clickCell = async (r, c) => {
      await fresh.locator('#blocks .editor-table [data-row="' + r + '"][data-cell="' + c + '"]').click();
      await fresh.waitForTimeout(200);
    };
    const cellText = (r, c) => fresh.evaluate(([row, cell]) => (
      document.querySelector('#blocks .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]')?.textContent
    ), [r, c]);
    const activeCell = () => fresh.evaluate(() => ({
      row: document.activeElement?.dataset?.row ?? null,
      cell: document.activeElement?.dataset?.cell ?? null,
    }));
    await makeTable(fresh);
    await setCell(fresh, 0, 0, "10");
    await setCell(fresh, 0, 1, "4");
    await clickCell(0, 2);
    await fresh.keyboard.type("=");
    await clickCell(0, 0);
    const first = { text: await cellText(0, 2), active: await activeCell() };
    result.formulaClickInsertsReference = first.text === "=A1"
      && first.active.row === "0" && first.active.cell === "2";
    await clickCell(0, 1);
    result.formulaClickReplacesPointedReference = (await cellText(0, 2)) === "=B1";
    await fresh.keyboard.type("*");
    await clickCell(0, 0);
    result.formulaOperatorThenClickAppends = (await cellText(0, 2)) === "=B1*A1";
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(200);
    result.formulaPointedComputes = (await cellText(0, 2)) === "40";
    // 参照の直後（演算子が無い位置）でのクリックは通常のセル移動のまま。
    await clickCell(0, 2);
    await fresh.keyboard.press("End");
    await clickCell(1, 1);
    const moved = await activeCell();
    result.formulaNonPointClickMovesNormally = moved.row === "1" && moved.cell === "1"
      && (await cellText(0, 2)) === "40";
    // 式でないセルの編集中のクリックも通常どおり。
    await clickCell(2, 0);
    await fresh.keyboard.type("plain");
    await clickCell(2, 1);
    const plainMove = await activeCell();
    result.plainCellClickStillMoves = plainMove.row === "2" && plainMove.cell === "1"
      && (await cellText(2, 0)) === "plain";
  });

  // ポイントモードのドラッグ: セルをドラッグすると範囲参照(A1:B3)が入り、
  // ドラッグ中は live で更新される。SUM 専用ではなく、参照を挿入できる位置
  // (= / 演算子 / カンマの直後)ならどこでも範囲が入る。通常のセル範囲選択・
  // フィルハンドルとは取り合いにならない。
  await withPage(async (fresh) => {
    const box = (r, c) => fresh.evaluate(([row, cell]) => {
      const td = document.querySelector('#blocks .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]');
      if (!td) return null;
      const rect = td.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, [r, c]);
    const cellText = (r, c) => fresh.evaluate(([row, cell]) => (
      document.querySelector('#blocks .editor-table [data-row="' + row + '"][data-cell="' + cell + '"]')?.textContent
    ), [r, c]);
    const previewState = () => fresh.evaluate(() => ({
      ref: document.querySelectorAll("#blocks .editor-table .ref-preview").length,
      selected: document.querySelectorAll("#blocks .editor-table .cell-selected").length,
      fill: document.querySelectorAll("#blocks .editor-table .fill-preview").length,
      active: (document.activeElement?.dataset?.row ?? "-") + "," + (document.activeElement?.dataset?.cell ?? "-"),
    }));
    const clickCell = async (r, c) => {
      const at = await box(r, c);
      await fresh.mouse.click(at?.x ?? 0, at?.y ?? 0);
      await fresh.waitForTimeout(150);
    };
    const dragCells = async (from, to) => {
      await fresh.mouse.move(from?.x ?? 0, from?.y ?? 0);
      await fresh.mouse.down();
      await fresh.mouse.move(to?.x ?? 0, to?.y ?? 0, { steps: 4 });
      await fresh.mouse.up();
      await fresh.waitForTimeout(150);
    };
    await makeTable(fresh);
    await setCell(fresh, 0, 0, "1");
    await setCell(fresh, 1, 0, "2");
    await setCell(fresh, 0, 1, "3");
    await setCell(fresh, 1, 1, "4");
    await clickCell(2, 2);
    await fresh.keyboard.type("=SUM(");
    // A1 から B2 へドラッグ。途中経過(A1:A2)も live で見えること。
    const a1 = await box(0, 0);
    const a2 = await box(1, 0);
    const b1 = await box(0, 1);
    const b2 = await box(1, 1);
    await fresh.mouse.move(a1?.x ?? 0, a1?.y ?? 0);
    await fresh.mouse.down();
    await fresh.waitForTimeout(120);
    const atDown = { text: await cellText(2, 2), ...(await previewState()) };
    await fresh.mouse.move(a2?.x ?? 0, a2?.y ?? 0, { steps: 4 });
    await fresh.waitForTimeout(120);
    const midDrag = { text: await cellText(2, 2), ...(await previewState()) };
    await fresh.mouse.move(b2?.x ?? 0, b2?.y ?? 0, { steps: 4 });
    await fresh.waitForTimeout(120);
    const fullDrag = { text: await cellText(2, 2), ...(await previewState()) };
    await fresh.mouse.up();
    await fresh.waitForTimeout(150);
    const afterUp = { text: await cellText(2, 2), ...(await previewState()) };
    result.formulaRangeDragInsertsRange = atDown.text === "=SUM(A1"
      && midDrag.text === "=SUM(A1:A2" && fullDrag.text === "=SUM(A1:B2"
      && afterUp.text === "=SUM(A1:B2" && afterUp.active === "2,2";
    // ドラッグ中は対象範囲がハイライトされ、指を離すと消える。
    result.formulaRangeDragHighlights = atDown.ref === 1 && midDrag.ref === 2
      && fullDrag.ref === 4 && afterUp.ref === 0;
    // ポイントモード中のドラッグは、セル範囲選択にもフィルにも化けない。
    result.formulaRangeDragAvoidsCellSelection = midDrag.selected === 0
      && fullDrag.selected === 0 && fullDrag.fill === 0;
    // 続けてのドラッグは、直前に入れた範囲参照を置き換える。
    await dragCells(b1, b2);
    result.formulaRangeDragReplacesPrevious = (await cellText(2, 2)) === "=SUM(B1:B2";
    // 逆方向(右下→左上)に引いても、範囲は 左上:右下 に正規化される(Excel と同じ)。
    await dragCells(b2, a1);
    result.formulaRangeReverseDragNormalizes = (await cellText(2, 2)) === "=SUM(A1:B2";
    // 単一クリックは従来どおり単一参照で、こちらも直前の範囲を置き換える。
    await clickCell(0, 0);
    result.formulaRangeThenClickReplacesWithSingle = (await cellText(2, 2)) === "=SUM(A1";
    // カンマの後にもドラッグで範囲が入り、確定すると計算される。
    await fresh.keyboard.type(",");
    await dragCells(b1, b2);
    result.formulaRangeAfterCommaAppends = (await cellText(2, 2)) === "=SUM(A1,B1:B2";
    await fresh.keyboard.type(")");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(150);
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(200);
    result.formulaRangeComputes = (await cellText(2, 2)) === "8";
    // SUM 専用ではない: 演算子の直後にも範囲が入る(スカラー文脈の評価エラーは
    // 評価系に任せる。ここでは挿入されたテキストだけを見る)。
    await clickCell(2, 0);
    await fresh.keyboard.type("=A1+");
    await dragCells(b1, b2);
    result.formulaRangeAfterOperatorInserts = (await cellText(2, 0)) === "=A1+B1:B2";
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(150);
    // 式を編集していないときのドラッグは、従来どおりセル範囲選択のまま。
    await clickCell(0, 0);
    await dragCells(a1, b2);
    const normalDrag = await previewState();
    result.formulaRangeNormalDragStillSelects = normalDrag.selected === 4 && normalDrag.ref === 0;
    // フィルハンドルのドラッグはポイントモードに奪われず、フィルのまま。
    await clickCell(2, 1);
    await fresh.keyboard.type("=5");
    await fresh.waitForTimeout(150);
    const grip = await fresh.evaluate(() => {
      const handle = document.querySelector("#blocks .table-fill-handle");
      if (!handle) return null;
      const rect = handle.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const c3 = await box(2, 2);
    await fresh.mouse.move(grip?.x ?? 0, grip?.y ?? 0);
    await fresh.mouse.down();
    await fresh.mouse.move(c3?.x ?? 0, c3?.y ?? 0, { steps: 4 });
    await fresh.waitForTimeout(120);
    const fillState = { text: await cellText(2, 1), ...(await previewState()) };
    await fresh.mouse.up();
    await fresh.waitForTimeout(250);
    result.fillHandleWinsOverPointMode = fillState.text === "=5" && fillState.fill > 0
      && fillState.ref === 0 && (await cellText(2, 2)) === "5";
  });

  return result;
}
