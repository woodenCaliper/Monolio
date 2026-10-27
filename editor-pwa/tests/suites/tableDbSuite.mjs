// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, OUT, PORT, openMenu, hasFormatVersion } from "../lib.mjs";

// ---- 表のデータベース(v229) ----
// ユーザー指示「表とデータベースは本質的には同じもので、どちらにも切り替えられるようにしたい」「別のHTMLのリンクとタイトルを貼って、ページのデータベースのような使い方」「結合を解除するときは確認を取ること」「データベースへの変更も、Ctrl+Z で戻せるようにしてほしい」
// 「タイトルも表に書かれてて、リンクを取れたらタイトルは更新して、取れなかったら元のまま」。見た目は案1〜4(ユーザー決定)。
export default async function tableDbSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1100, height: 800 });
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {};
  const c = (text, extra = {}) => ({ text, colSpan: 1, rowSpan: 1, ...extra });
  const baseRows = () => [
    ["ID", "状態", "数", "済", "資料"],
    ["R-1", "対応中", "3", "", "古い題名"],
    ["R-2", "未対応", "12", "✓", "読めない文書"],
  ].map((row) => row.map((text) => c(text)));
  let opened = 0;
  const openLiteral = async (literal) => {
    const path = join(OUT, "table-db-" + (opened += 1) + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((title) => document.querySelector("#doc-title")?.textContent === title, literal.pages[0].title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  let saved = 0;
  const saveAndParse = async () => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, "table-db-saved-" + (saved += 1) + ".html");
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return { path, html, doc: await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html) };
  };
  const cell = (r, k) => fresh.locator('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]');
  const isDb = () => fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] .editor-table')?.classList.contains("db-table") ?? null);
  const types = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table [data-row="0"]')].map((node) => node.dataset.dbType || "-").join(","));
  const setType = async (k, type) => {
    const box = await cell(0, k).boundingBox();
    await fresh.mouse.click(box.x + 14, box.y + box.height / 2);
    await fresh.waitForTimeout(150);
    await fresh.locator('.db-column-menu [data-db-type="' + type + '"]').click();
    await fresh.waitForTimeout(250);
  };
  const toggleDb = async () => {
    await fresh.locator('#table-toolbar [data-tool="database"]').click();
    await fresh.waitForTimeout(300);
  };
  const undo = async () => {
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
  };
  try {
    await fresh.goto(`http://127.0.0.1:${PORT}/`);
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 表の道具の帯の右端の「データベース」で切り替わる。1行目が列の名前(ヘッダー行)になる。Ctrl+Z 1回で表に戻る。
    await openLiteral({ pages: [{ id: "DB1", title: "データベース", blocks: [{ id: "t", type: "table", rows: baseRows() }] }], fonts: [], attachments: [] });
    await cell(1, 0).click();
    await fresh.waitForTimeout(150);
    const toolbarHasToggle = await fresh.locator('#table-toolbar [data-tool="database"]').count() === 1;
    await toggleDb();
    const switched = { db: await isDb(), types: await types(), header: await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]')?.tagName) };
    result.tableDbToggleTurnsOn = toolbarHasToggle && switched.db === true && switched.types === "text,text,text,text,text" && switched.header === "TH";
    await undo();
    result.tableDbToggleUndoesInOneStep = (await isDb()) === false
      && (await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]')?.tagName)) === "TD";

    // 2) 列の種類(列の名前の左の印を押すとメニュー)。選択肢は札、数は右寄せ、チェックは四角、リンクは題名で見える。
    await cell(1, 0).click();
    await toggleDb();
    await setType(1, "select");
    await setType(2, "number");
    await setType(3, "check");
    await setType(4, "link");
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(200);
    const look = await fresh.evaluate(() => {
      const table = document.querySelector('#blocks .block[data-id="t"] .editor-table');
      const at = (r, k) => table.querySelector('[data-row="' + r + '"][data-cell="' + k + '"]');
      return {
        types: [...table.querySelectorAll('[data-row="0"]')].map((node) => node.dataset.dbType).join(","),
        pills: [...table.querySelectorAll(".db-pill")].map((node) => node.textContent).join("|"),
        numberAlign: getComputedStyle(at(1, 2)).textAlign,
        checks: [...table.querySelectorAll(".db-check")].map((node) => node.classList.contains("is-on")).join(","),
        checkEditable: at(1, 3).isContentEditable,
        linkText: at(1, 4).textContent,
      };
    });
    result.tableDbColumnTypesShow = look.types === "text,select,number,check,link" && look.pills === "対応中|未対応"
      && look.numberAlign === "right" && look.checks === "false,true" && look.checkEditable === false && look.linkText === "古い題名";
    // 種類の変更も Ctrl+Z 1回ずつで戻る。
    await undo();
    const afterOneUndo = await types();
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(250);
    result.tableDbTypeChangeUndoes = afterOneUndo === "text,select,number,check,text" && (await types()) === "text,select,number,check,link";

    // 3) チェックのセルは押すと切り替わる(Ctrl+Z で戻る)。Space でも切り替わる。
    await cell(1, 3).click();
    await fresh.waitForTimeout(200);
    const clicked = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="1"][data-cell="3"] .db-check')?.classList.contains("is-on"));
    await fresh.keyboard.press(" ");
    await fresh.waitForTimeout(200);
    const spaced = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="1"][data-cell="3"] .db-check')?.classList.contains("is-on"));
    await undo();
    const undone = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="1"][data-cell="3"] .db-check')?.classList.contains("is-on"));
    result.tableDbCheckToggles = clicked === true && spaced === false && undone === true;

    // 4) 選択肢のセルに入ると、この列の値が札で並び、押すとその値になる。
    await cell(2, 1).click();
    await fresh.waitForTimeout(200);
    const options = await fresh.evaluate(() => [...document.querySelectorAll(".db-cell-helper .db-pill")].map((node) => node.textContent).join("|"));
    await fresh.locator(".db-cell-helper .db-select-option", { hasText: "対応中" }).click();
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(200);
    const picked = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="2"][data-cell="1"]')?.textContent);
    result.tableDbSelectOffersColumnValues = options === "対応中|未対応" && picked === "対応中";

    // 5) リンク: HTML をセルへ落とすと、行き先がそのファイルになり、題名が読めれば題名を書き換える(Monolio の文書は
    //    manifest の題名、ほかの HTML は <title>)。読めなければ題名は元のまま(ユーザー指示)。
    const dropHtml = (r, k, name, html) => fresh.evaluate(([row, col, fileName, text]) => {
      const target = document.querySelector('#blocks .block[data-id="t"] [data-row="' + row + '"][data-cell="' + col + '"]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], fileName, { type: "text/html" }));
      const rect = target.getBoundingClientRect();
      const options = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + 5, clientY: rect.top + 5 };
      target.dispatchEvent(new DragEvent("dragover", options));
      target.dispatchEvent(new DragEvent("drop", options));
    }, [r, k, name, html]);
    const monolioDoc = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "X", title: "液体金属の選定", blocks: [{ id: "x1", type: "paragraph", text: "x" }] }], fonts: [], attachments: [] }));
    await dropHtml(1, 4, "liquid-metal.html", monolioDoc);
    await fresh.waitForTimeout(400);
    await dropHtml(2, 4, "plain.html", "<!doctype html><title>ふつうの HTML の題名</title><p>x</p>");
    await fresh.waitForTimeout(400);
    const linksAfterDrop = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] a.db-link')].map((a) => decodeURI(a.getAttribute("href")) + "=" + a.textContent).join("|"));
    result.tableDbLinkEvidence = { linksAfterDrop };
    result.tableDbLinkDropReadsTitle = linksAfterDrop === "liquid-metal.html=液体金属の選定|plain.html=ふつうの HTML の題名";
    // 題名の無い HTML は、行き先だけ変わり題名は元のまま。
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    await dropHtml(2, 4, "no-title.html", "<!doctype html><p>題名なし</p>");
    await fresh.waitForTimeout(400);
    const kept = await fresh.evaluate(() => {
      const a = document.querySelector('#blocks .block[data-id="t"] [data-row="2"][data-cell="4"] a.db-link');
      return a ? decodeURI(a.getAttribute("href")) + "=" + a.textContent : null;
    });
    result.tableDbLinkEvidence.kept = kept;
    result.tableDbLinkKeepsTitleWhenUnreadable = kept === "no-title.html=読めない文書";
    // 危ない行き先(javascript:)は、行き先の欄から入れても受けない。
    await cell(1, 4).click();
    await fresh.waitForTimeout(200);
    await fresh.locator(".db-cell-helper .db-link-input").fill("javascript:alert(1)");
    await fresh.locator(".db-cell-helper .db-link-input").press("Enter");
    await fresh.waitForTimeout(200);
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await fresh.waitForTimeout(200);
    const unsafe = await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="1"][data-cell="4"] a.db-link')?.getAttribute("href"));
    result.tableDbLinkRejectsUnsafeHref = unsafe === "liquid-metal.html";

    // 6) 列の追加・削除で、列の種類も一緒にずれる。
    await cell(1, 1).click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#table-toolbar [data-tool="col-before"]').click();
    await fresh.waitForTimeout(250);
    const inserted = await types();
    // v239: 列を足してもカーソルは元のセルのまま。足した列(左に足したので同じ番号の位置)を押してから消す。
    await cell(1, 1).click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#table-toolbar [data-tool="col-delete"]').click();
    await fresh.waitForTimeout(250);
    result.tableDbColumnTypesFollowColumns = inserted === "text,text,select,number,check,link" && (await types()) === "text,select,number,check,link";

    // 7) 保存して開き直しても、データベース・列の種類・リンクが残る。保存HTMLは札・四角・リンクで見える(エディタと同じ形)。
    const first = await saveAndParse();
    const savedBlock = first.doc.pages[0].blocks.find((block) => block.id === "t");
    const savedTypes = savedBlock?.database?.columns?.map((column) => column.type).join(",");
        result.tableDbSavesAndReopens = savedTypes === "text,select,number,check,link" && savedBlock.rows[1][4].link === "liquid-metal.html"
      && hasFormatVersion(first.html);
    const view = await context.newPage();
    try {
      await view.goto("file:///" + first.path.replaceAll("\\", "/"));
      await view.waitForTimeout(300);
      const savedLook = await view.evaluate(() => {
        const table = document.querySelector("table.doc-table");
        return {
          db: table?.classList.contains("doc-db"),
          pills: [...table.querySelectorAll(".db-pill")].map((node) => node.textContent).join("|"),
          checks: [...table.querySelectorAll(".db-check")].map((node) => node.classList.contains("is-on")).join(","),
          links: [...table.querySelectorAll("a.db-link")].map((a) => a.getAttribute("href") + "=" + a.textContent).join("|"),
          numberAlign: getComputedStyle(table.querySelector("td.db-col-number")).textAlign,
        };
      });
      result.tableDbSavedHtmlShowsTypes = savedLook.db === true && savedLook.pills === "対応中|対応中" && savedLook.checks === "true,true"
        && savedLook.links === "liquid-metal.html=液体金属の選定|no-title.html=読めない文書" && savedLook.numberAlign === "right";
      result.tableDbSavedEvidence = savedLook;
    } finally {
      await view.close();
    }
    await openLiteral({ pages: [{ id: "DB2", title: "開き直し", blocks: [savedBlock] }], fonts: [], attachments: [] });
    result.tableDbReopenKeepsTypes = (await types()) === "text,select,number,check,link" && (await isDb()) === true;

    // 8) つまみのメニューからも切り替えられる(表に戻すと文字はそのまま、ヘッダー行は切り替える前の状態)。
    const row = fresh.locator('#blocks .block[data-id="t"]');
    await row.hover();
    await row.locator(".drag-grip").click();
    await fresh.waitForTimeout(200);
    await fresh.locator('#block-menu [data-action="database"]').click();
    await fresh.waitForTimeout(300);
    const backToTable = await fresh.evaluate(() => {
      const table = document.querySelector('#blocks .block[data-id="t"] .editor-table');
      return { db: table.classList.contains("db-table"), text: table.querySelector('[data-row="1"][data-cell="1"]').textContent, head: table.querySelector('[data-row="0"][data-cell="0"]').tagName };
    });
    result.tableDbBlockMenuTurnsBack = backToTable.db === false && backToTable.text === "対応中" && backToTable.head === "TD";

    // 9) 結合のある表: 確認が出る。やめると何も変わらない。外して切り替えると、中身は左上に残り、Ctrl+Z 1回で結合ごと戻る。
    const merged = baseRows();
    merged[1][0] = c("R-1と2", { rowSpan: 2 });
    merged[2][0] = c("", { covered: true });
    merged[0][3] = c("済と資料", { colSpan: 2 });
    merged[0][4] = c("", { covered: true });
    await openLiteral({ pages: [{ id: "DB3", title: "結合あり", blocks: [{ id: "t", type: "table", rows: merged }] }], fonts: [], attachments: [] });
    const mergeShape = () => fresh.evaluate(() => [...document.querySelectorAll('#blocks .block[data-id="t"] .editor-table [data-row]')].filter((n) => n.rowSpan > 1 || n.colSpan > 1).length);
    await cell(1, 1).click();
    await fresh.waitForTimeout(150);
    await toggleDb();
    const dialogShown = await fresh.evaluate(() => document.querySelector(".confirm-dialog")?.textContent || "");
    await fresh.locator('.confirm-dialog [data-confirm="cancel"]').click();
    await fresh.waitForTimeout(250);
    result.tableDbMergeAsksAndCancelKeeps = dialogShown.includes("結合を外して") && dialogShown.includes("2 か所")
      && (await isDb()) === false && (await mergeShape()) === 2 && !(await fresh.evaluate(() => document.querySelector(".confirm-dialog")));
    await cell(1, 1).click();
    await fresh.waitForTimeout(150);
    await toggleDb();
    await fresh.locator('.confirm-dialog [data-confirm="ok"]').click();
    await fresh.waitForTimeout(350);
    const unmerged = await fresh.evaluate(() => {
      const at = (r, k) => document.querySelector('#blocks .block[data-id="t"] .editor-table [data-row="' + r + '"][data-cell="' + k + '"]')?.textContent;
      return { a: at(1, 0), b: at(2, 0), head: at(0, 3), headNext: at(0, 4) };
    });
    result.tableDbMergeOkUnmergesKeepingTopLeft = (await isDb()) === true && (await mergeShape()) === 0
      && unmerged.a === "R-1と2" && unmerged.b === "" && unmerged.head === "済と資料" && unmerged.headNext === "";
    await fresh.evaluate(() => document.activeElement?.blur?.());
    await undo();
    result.tableDbMergeUndoRestoresInOneStep = (await isDb()) === false && (await mergeShape()) === 2;

    // 10) データベースでは結合できず、ヘッダー行も外せない(知らせる)。
    await cell(1, 1).click();
    await toggleDb();
    await fresh.locator('.confirm-dialog [data-confirm="ok"]').click();
    await fresh.waitForTimeout(300);
    await cell(1, 1).click();
    await fresh.locator('#table-toolbar [data-tool="header"]').click();
    await fresh.waitForTimeout(200);
    result.tableDbKeepsHeaderRow = (await fresh.evaluate(() => document.querySelector('#blocks .block[data-id="t"] [data-row="0"][data-cell="0"]')?.tagName)) === "TH";
    // 11) 表のリンクは Ctrl+クリックで開く(v236。ユーザー報告「Ctrlを押しながらクリックしてもリンクに飛ばない」)。押した時点でセルが編集の
    //     形に切り替わってリンクが消え、click が届いていなかった。http・https は1回だけ開き、別の文書は知らせる。ふつうのクリックは編集のまま。
    await openLiteral({ pages: [{ id: "L", title: "表のリンク", blocks: [
      { id: "lt", type: "table", database: { columns: [{ type: "text" }, { type: "link" }] }, rows: [
        [{ text: "名前" }, { text: "資料" }],
        [{ text: "A" }, { text: "例のサイト", link: "https://example.com/" }],
        [{ text: "B" }, { text: "別の文書", link: "other.html" }],
      ] },
    ] }], fonts: [], attachments: [] });
    await fresh.evaluate(() => { window.__openedLinks = []; window.open = (url) => { window.__openedLinks.push(url); return null; }; });
    const ctrlClickLink = async (selector) => {
      const box = await fresh.locator(selector).first().boundingBox();
      await fresh.keyboard.down("Control");
      await fresh.mouse.click(box.x + 5, box.y + box.height / 2);
      await fresh.keyboard.up("Control");
      await fresh.waitForTimeout(300);
    };
    await ctrlClickLink('#blocks .block[data-id="lt"] a.db-link[href^="https"]');
    const openedHttp = await fresh.evaluate(() => [...window.__openedLinks]);
    const httpCellEditing = await fresh.evaluate(() => Boolean(document.activeElement?.closest?.("td, th")));
    await ctrlClickLink('#blocks .block[data-id="lt"] a.db-link[href="other.html"]');
    const statusOther = await fresh.evaluate(() => document.querySelector("#status")?.textContent || "");
    result.tableLinkCtrlClickOpens = JSON.stringify(openedHttp) === JSON.stringify(["https://example.com/"]) && !httpCellEditing;
    result.tableLinkCtrlClickOtherDocNotifies = statusOther.includes("other.html")
      && JSON.stringify(await fresh.evaluate(() => window.__openedLinks)) === JSON.stringify(["https://example.com/"]);
    const plainBox = await fresh.locator('#blocks .block[data-id="lt"] a.db-link[href^="https"]').first().boundingBox();
    await fresh.mouse.click(plainBox.x + 5, plainBox.y + plainBox.height / 2);
    await fresh.waitForTimeout(300);
    result.tableLinkPlainClickEdits = await fresh.evaluate(() => window.__openedLinks.length === 1 && Boolean(document.activeElement?.closest?.("td, th")));
    result.tableLinkEvidence = { openedHttp, httpCellEditing, statusOther };
    result.tableDbNoPageErrors = pageErrors.length === 0;
    result.tableDbPageErrorEvidence = pageErrors.slice(0, 5).join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
