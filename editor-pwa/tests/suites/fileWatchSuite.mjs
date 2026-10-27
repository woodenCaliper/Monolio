// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT } from "../lib.mjs";

// ---- 外での書き換えの取り込み(v245) ----
// ユーザー案「AI は直接ファイルを編集する。開いていたら書き換わったことを検出して、差分を今開いてるドキュメントに表示し、受け入れるか
// 無視するかをブロック単位で決める。受け入れなかったら元に戻す」。開いているファイルを見張り、外で書き換わったら、新しい提案はそのまま、
// 本文の書き換えは差分を提案「ファイルの外の変更」として取り込む(本文はまだ変えない)。保存の前にも見て、取り込んでいない書き換えを
// 黙って上書きしない。
// テストでは、開いたファイルの手がかり(PWA の showOpenFilePicker の handle)と exe の橋渡しを、アプリより先に差し込んで真似る。
// 外の書き換えは window.__file(PWA)・window.__desk(exe)の中身を変えて起こし、窓の focus で見に行かせる。
export default async function fileWatchSuite({ context }) {
  const result = {};
  const errors = [];
  const base = () => ({ pages: [{ id: "W", title: "見張り", blocks: [
    { id: "p1", type: "paragraph", text: "温度は 25℃ とする。" },
    { id: "p2", type: "paragraph", text: "手順は次のとおり。" },
    { id: "t1", type: "table", rows: [[{ text: "条件" }, { text: "電圧" }], [{ text: "A" }, { text: "12V" }], [{ text: "B" }, { text: "24V" }]] },
    { id: "p3", type: "paragraph", text: "古い注意書き。" },
  ] }], fonts: [], attachments: [] });
  // AI がファイルの JSON(manifest)をその場で書き換えたのと同じ形にする
  // (書き換えはテストの側で行う。アプリの CSP は文字列からの関数を許さない)
  const editManifest = async (page, edit, holder = "__file") => {
    const text = await page.evaluate((holderName) => window[holderName].text, holder);
    const marker = 'id="document-manifest">';
    const start = text.indexOf(marker) + marker.length;
    const end = text.indexOf("</script>", start);
    const manifest = JSON.parse(text.slice(start, end));
    edit(manifest);
    const next = text.slice(0, start) + JSON.stringify(manifest, null, 2).replace(/</g, "\\u003c") + text.slice(end);
    await page.evaluate(({ holderName, value }) => {
      window[holderName].text = value;
      window[holderName].lastModified = (window[holderName].lastModified || 0) + 1000;
    }, { holderName: holder, value: next });
  };
  const poke = async (page) => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(500);
  };
  const view = (page) => page.evaluate(() => ({
    toggle: document.querySelector("#suggest-toggle")?.hidden ? null : document.querySelector("#suggest-toggle")?.textContent,
    titles: [...document.querySelectorAll("#suggest-pane .sg-title")].map((node) => node.textContent),
    counts: [...document.querySelectorAll("#suggest-pane .sg-count")].map((node) => node.textContent),
    notice: document.querySelector("#notice")?.hidden === false ? document.querySelector("#notice")?.textContent : "",
    status: document.querySelector("#status")?.textContent || "",
    p1: document.querySelector('.block[data-id="p1"] .block-content')?.textContent,
    p1Diff: document.querySelectorAll('.block[data-id="p1"] .sg-ins').length,
    ghost: [...document.querySelectorAll(".block.sg-block-ins .block-content")].map((node) => node.textContent),
    p3Del: Boolean(document.querySelector('.block[data-id="p3"].sg-block-del')),
    cell: [...document.querySelectorAll('.block[data-id="t1"] .editor-table [data-row="1"][data-cell="1"]')].map((td) => (td.classList.contains("sg-cell") ? "?" : "") + td.textContent).join(""),
  }));
  const manifestOf = (page, holder = "__file") => page.evaluate((holderName) => {
    const text = window[holderName].text;
    return JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent);
  }, holder);
  // マウスを乗せて出る帯で1か所決める。帯の出し入れが重なって空振りしたときは、もう1回(決めた数で確かめる)。
  const pendingCount = (page) => page.evaluate(() => (document.querySelector("#suggest-toggle")?.hidden ? 0 : Number((document.querySelector("#suggest-toggle")?.textContent || "").replace(/[^0-9]/g, "")) || 0));
  const decide = async (page, selector, verdict) => {
    const before = await pendingCount(page);
    for (let attempt = 0; attempt < 3 && (await pendingCount(page)) === before; attempt += 1) {
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);
      await page.locator(selector).first().hover({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(200);
      await page.locator(".sg-popup .sg-btn." + (verdict === "accepted" ? "ok" : "ng")).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  };

  // ---- PWA(開いたファイルの手がかり) ----
  const pwa = await context.newPage();
  pwa.on("dialog", (dialog) => dialog.accept());
  pwa.on("pageerror", (error) => errors.push(error.message));
  await pwa.setViewportSize({ width: 1440, height: 900 });
  await pwa.addInitScript(() => {
    window.__file = { name: "watch.html", text: "", lastModified: 1 };
    window.__writes = 0;
    const handle = {
      kind: "file",
      name: "watch.html",
      getFile: async () => new File([window.__file.text], window.__file.name, { type: "text/html", lastModified: window.__file.lastModified }),
      createWritable: async () => {
        let out = "";
        return {
          write: async (chunk) => { out += typeof chunk === "string" ? chunk : await new Blob([chunk]).text(); },
          close: async () => {
            window.__file.text = out;
            window.__file.lastModified += 1;
            window.__writes += 1;
          },
        };
      },
    };
    window.showOpenFilePicker = async () => [handle];
  });
  try {
    await pwa.goto("http://127.0.0.1:" + PORT + "/");
    await pwa.waitForSelector("#blocks .block-content");
    await pwa.evaluate((literal) => { window.__file.text = window.SingleHtmlFormat.buildPortableHtml(literal); }, base());
    await pwa.locator("#menu-file-button").click();
    await pwa.locator("#menu-open-document").click();
    await pwa.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "見張り", null, { timeout: 5000 }).catch(() => {});
    await pwa.waitForTimeout(300);

    // 1) AI が本文を直接書き換える(段落の文字・表のセル・段落を足す・消す)→ 提案「ファイルの外の変更」として出る。本文はまだ変わらない
    await editManifest(pwa, (manifest) => {
      const blocks = manifest.pages[0].blocks;
      blocks.find((b) => b.id === "p1").text = "温度は 23±2℃ とする。";
      blocks.find((b) => b.id === "t1").rows[1][1].text = "12.0 V";
      blocks.splice(blocks.findIndex((b) => b.id === "p2") + 1, 0, { id: "p-new", type: "paragraph", text: "新しい手順。" });
      blocks.splice(blocks.findIndex((b) => b.id === "p3"), 1);
    });
    await poke(pwa);
    const imported = await view(pwa);
    result.watchImportsDirectEdits = imported.toggle === "提案 4" && imported.titles.includes("ファイルが外で書き換えられた所")
      && imported.p1Diff === 1 && imported.ghost.join(",") === "新しい手順。" && imported.p3Del && imported.cell === "?12V12.0 V"
      && imported.notice.includes("ファイルが外で書き換わりました") && imported.notice.includes("本文の書き換え 4 か所");
    result.watchImportEvidence = imported;

    // 2) 段落と追加は採用、セルと削除は戻して保存 → ファイルは、採用した所だけ変わり、戻した所は元に戻る(AI の書き換えが消える)
    await decide(pwa, '.block[data-id="p1"] .sg-ins', "accepted");
    await decide(pwa, ".block.sg-block-ins", "accepted");
    await decide(pwa, '.block[data-id="t1"] .editor-table [data-row="1"][data-cell="1"]', "rejected");
    await decide(pwa, '.block[data-id="p3"] .block-content', "rejected");
    const writesBefore = await pwa.evaluate(() => window.__writes);
    await pwa.keyboard.press("Control+s");
    await pwa.waitForTimeout(500);
    const saved = await manifestOf(pwa);
    const savedBlocks = saved.pages[0].blocks;
    result.watchSaveKeepsOnlyAccepted = (await pwa.evaluate(() => window.__writes)) === writesBefore + 1
      && savedBlocks.map((block) => block.id).join(",") === "p1,p2,p-new,t1,p3"
      && savedBlocks[0].text === "温度は 23±2℃ とする。" && savedBlocks[3].rows[1][1].text === "12V" && savedBlocks[4].text === "古い注意書き。"
      && saved.suggestions?.[0]?.status === "done";
    result.watchSaveEvidence = { ids: savedBlocks.map((block) => block.id), cell: savedBlocks[3]?.rows?.[1]?.[1]?.text };

    // 3) 自分で保存したのは外の書き換えではない(取り込まない)
    await poke(pwa);
    const afterOwnSave = await view(pwa);
    result.watchIgnoresOwnSave = afterOwnSave.toggle === null && afterOwnSave.status === "Saved";
    result.watchOwnSaveEvidence = { toggle: afterOwnSave.toggle, status: afterOwnSave.status };

    // 4) AI が提案(suggestions)を id を付けずに足す → その提案として出る(本文の書き換えの提案は作らない)。もう1つ足しても、前の提案は二重にならない
    await editManifest(pwa, (manifest) => {
      manifest.suggestions = [...(manifest.suggestions || []), { author: { name: "Claude", kind: "ai" }, title: "注意を足す", changes: [{ op: "setText", block: "p2", text: "手順は次のとおり(安全に注意)。" }] }];
    });
    await poke(pwa);
    const appended = await view(pwa);
    await editManifest(pwa, (manifest) => {
      manifest.suggestions.push({ author: { name: "Claude", kind: "ai" }, title: "注意書きを直す", changes: [{ op: "setText", block: "p3", text: "新しい注意書き。" }] });
    });
    await poke(pwa);
    const appendedTwice = await view(pwa);
    result.watchImportsAppendedSuggestion = appended.toggle === "提案 1" && appended.titles.join(",") === "注意を足す"
      && appendedTwice.titles.join(",") === "注意を足す,注意書きを直す" && /^提案 [2-9]/.test(appendedTwice.toggle || "");
    result.watchAppendEvidence = { appended: appended.titles, twice: appendedTwice.titles, toggle: appendedTwice.toggle };

    // 5) こちらで打った所を AI も書き換えた → 取り込んだ書き換えは「古い」(採用できない。こちらの文字を守る)
    await pwa.locator('.block-content[data-id="p-new"]').click();
    await pwa.keyboard.press("End");
    await pwa.keyboard.type("!");
    await pwa.waitForTimeout(200);
    await editManifest(pwa, (manifest) => {
      manifest.pages[0].blocks.find((b) => b.id === "p-new").text = "新しい手順です。";
      // 前の値(before)を書かない提案も、ファイルの値を前とするので「古い」になる(こちらの「!」を黙って消す案にならない)
      manifest.suggestions.push({ author: { name: "Claude", kind: "ai" }, title: "手順を直す", changes: [{ op: "setText", block: "p-new", text: "新しい手順(改)。" }] });
    });
    await poke(pwa);
    const conflict = await view(pwa);
    const pNew = await pwa.evaluate(() => document.querySelector('.block[data-id="p-new"] .block-content')?.textContent);
    result.watchConflictIsStale = conflict.counts.filter((text) => text === "古い").length === 2 && pNew === "新しい手順。!";
    result.watchConflictEvidence = { counts: conflict.counts, pNew };

    // 6) 外で書き換わった直後に保存しても、書き換えを黙って消さない(保存の前に取り込んで、保存を止める)
    await editManifest(pwa, (manifest) => {
      manifest.pages[0].blocks.find((b) => b.id === "p2").text = "手順は次のとおりとする。";
    });
    const writesBeforeGuard = await pwa.evaluate(() => window.__writes);
    await pwa.locator('.block-content[data-id="p-new"]').click();
    await pwa.keyboard.press("Control+s");
    await pwa.waitForTimeout(600);
    const guarded = await manifestOf(pwa);
    const guardView = await view(pwa);
    const kept = guarded.pages[0].blocks.find((block) => block.id === "p2")?.text === "手順は次のとおりとする。"
      || (guarded.suggestions || []).some((suggestion) => suggestion.changes.some((change) => change.block === "p2" && change.text === "手順は次のとおりとする。" && !change.result));
    result.watchSaveDoesNotLoseExternalEdit = kept
      && ((await pwa.evaluate(() => window.__writes)) === writesBeforeGuard ? guardView.notice.includes("保存は止めました") : true);
    result.watchGuardEvidence = { writes: (await pwa.evaluate(() => window.__writes)) - writesBeforeGuard, notice: guardView.notice };

    // 7) 書いている途中など、Monolio の文書として読めないときは何もしない。読めるようになったら取り込む
    const brokenErrors = errors.length;
    const toggleBeforeBroken = (await view(pwa)).toggle;
    const goodText = await pwa.evaluate(() => window.__file.text);
    await pwa.evaluate(() => { window.__file.text = "<html><body>書いている途中"; window.__file.lastModified += 1000; });
    await poke(pwa);
    const whileBroken = (await view(pwa)).toggle;
    await pwa.evaluate((text) => { window.__file.text = text; window.__file.lastModified += 1000; }, goodText);
    await editManifest(pwa, (manifest) => {
      manifest.pages[0].blocks.find((b) => b.id === "p1").text = "温度は 23±2℃ とし、湿度も記録する。";
    });
    await poke(pwa);
    const afterBroken = await view(pwa);
    result.watchSkipsUnreadableFile = errors.length === brokenErrors && whileBroken === toggleBeforeBroken && afterBroken.toggle !== toggleBeforeBroken;
    result.watchBrokenEvidence = { before: toggleBeforeBroken, whileBroken, after: afterBroken.toggle };

    // 8) 書式のある段落: 書式はそのままで語句だけ変えたら語句ごと(採用しても書式が残る)。書式だけ変えたら段落ごと(書式ごと入る)。
    //    種類が変わったブロック(段落 → 見出し)は、新しいブロックを足して元を消す
    await pwa.evaluate((literal) => { window.__file.text = window.SingleHtmlFormat.buildPortableHtml(literal); window.__file.lastModified += 1000; }, { pages: [{ id: "F", title: "書式の見張り", blocks: [
      { id: "fb", type: "paragraph", text: "BOLD word", html: "<b>BOLD</b> word" },
      { id: "fc", type: "paragraph", text: "plain text" },
      { id: "fd", type: "paragraph", text: "見出しにする" },
    ] }], fonts: [], attachments: [] });
    await pwa.locator("#menu-file-button").click();
    await pwa.locator("#menu-open-document").click();
    await pwa.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "書式の見張り", null, { timeout: 5000 }).catch(() => {});
    await pwa.waitForTimeout(300);
    await editManifest(pwa, (manifest) => {
      const blocks = manifest.pages[0].blocks;
      Object.assign(blocks.find((b) => b.id === "fb"), { text: "BOLD words", html: "<b>BOLD</b> words" });
      Object.assign(blocks.find((b) => b.id === "fc"), { html: "plain <b>text</b>" });
      blocks.find((b) => b.id === "fd").type = "heading2";
    });
    await poke(pwa);
    const formatLabels = await pwa.evaluate(() => [...document.querySelectorAll("#suggest-pane .sg-node .sg-label")].map((node) => node.textContent));
    await pwa.locator("#suggest-pane .sg-section .sg-actions .sg-btn.ok").first().click();
    await pwa.waitForTimeout(300);
    await pwa.keyboard.press("Control+s");
    await pwa.waitForTimeout(500);
    const formatManifest = await manifestOf(pwa);
    const formatSaved = formatManifest.pages[0].blocks;
    const formatChanges = formatManifest.suggestions?.[0]?.changes || [];
    const fb = formatSaved.find((block) => block.id === "fb");
    const fc = formatSaved.find((block) => block.id === "fc");
    result.watchFormattingAndTypeChanges = formatChanges.some((change) => change.block === "fb" && change.op === "setText" && !("html" in change))
      && formatChanges.some((change) => change.block === "fc" && change.op === "setText" && (change.html || "").includes("<b>text</b>"))
      && fb?.html === "<b>BOLD</b> words" && /plain <b>text<\/b>/.test(fc?.html || "")
      && !formatSaved.some((block) => block.id === "fd") && formatSaved.some((block) => block.type === "heading2" && block.text === "見出しにする");
    result.watchFormattingEvidence = { formatLabels, fb, fc, types: formatSaved.map((block) => block.type + ":" + block.text) };
  } finally {
    await pwa.close();
  }

  // ---- デスクトップ版(exe。開いた場所を、今ある read_linked_document で読み直す) ----
  // v275(Issue #199): 先に目印(document_stamp。更新時刻と大きさ)だけを聞き、変わったときだけ全文を読む。目印が取れない(古い exe)ときは
  // 今までどおり毎回読む。真似では目印を「lastModified:文字数」にし、__deskNoStamp で目印を取れなくする。
  const desk = await context.newPage();
  desk.on("dialog", (dialog) => dialog.accept());
  desk.on("pageerror", (error) => errors.push(error.message));
  await desk.setViewportSize({ width: 1440, height: 900 });
  await desk.addInitScript(() => {
    window.__desk = { text: "", lastModified: 0 };
    window.__deskCalls = [];
    window.__deskNoStamp = false;
    const stamp = () => window.__desk.lastModified + ":" + window.__desk.text.length;
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          window.__deskCalls.push({ command, href: args?.href ?? null, base: args?.base ?? null });
          if (command === "read_document") return { path: "C:\\docs\\見張り.html", name: "見張り.html", contents: window.__desk.text, stamp: stamp() };
          if (command === "read_linked_document") {
            if (args.base !== "C:\\docs\\見張り.html" || args.href !== encodeURIComponent("見張り.html")) throw new Error("見つかりません: " + args.href);
            return { path: "C:\\docs\\見張り.html", name: "見張り.html", contents: window.__desk.text, stamp: stamp() };
          }
          if (command === "document_stamp") {
            if (window.__deskNoStamp) throw new Error("unknown command");
            return stamp();
          }
          if (command === "write_document") {
            window.__desk.text = args.contents;
            window.__desk.lastModified += 1;
            return stamp();
          }
          if (command === "confirm_discard") return true;
          return null;
        },
      },
    };
  });
  try {
    await desk.goto("http://127.0.0.1:" + PORT + "/");
    await desk.waitForSelector("#blocks .block-content");
    await desk.evaluate((literal) => { window.__desk.text = window.SingleHtmlFormat.buildPortableHtml(literal); }, base());
    await desk.locator("#menu-file-button").click();
    await desk.locator("#menu-open-document").click();
    await desk.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "見張り", null, { timeout: 5000 }).catch(() => {});
    await desk.waitForTimeout(300);
    await editManifest(desk, (manifest) => {manifest.pages[0].blocks.find((b) => b.id === "p1").text = "温度は 23±2℃ とする。";}, "__desk");
    await poke(desk);
    const deskImported = await view(desk);
    await decide(desk, '.block[data-id="p1"] .sg-ins', "accepted");
    await desk.keyboard.press("Control+s");
    await desk.waitForTimeout(500);
    await poke(desk);
    const deskAfterSave = await view(desk);
    const deskSaved = await manifestOf(desk, "__desk");
    result.watchDesktopImportsAndSaves = deskImported.toggle === "提案 1" && deskImported.titles.includes("ファイルが外で書き換えられた所")
      && deskSaved.pages[0].blocks[0].text === "温度は 23±2℃ とする。" && deskAfterSave.toggle === null
      && (await desk.evaluate(() => window.__deskCalls.some((call) => call.command === "read_linked_document" && call.href === encodeURIComponent("見張り.html"))));
    result.watchDesktopEvidence = { imported: deskImported.toggle, afterSave: deskAfterSave.toggle };
    // 変わっていない間は全文を読まない(以前は見るたびに全文を読んでいた)
    const fullReads = () => desk.evaluate(() => window.__deskCalls.filter((call) => call.command === "read_linked_document").length);
    const readsBefore = await fullReads();
    for (let i = 0; i < 3; i += 1) await poke(desk);
    const readsQuiet = await fullReads();
    // 外で書き換わったら目印が変わり、全文を読んで取り込む
    await editManifest(desk, (manifest) => {manifest.pages[0].blocks.find((b) => b.id === "p2").text = "手順は次のとおり(改)。";}, "__desk");
    await poke(desk);
    const readsAfterEdit = await fullReads();
    const deskEdited = await view(desk);
    result.watchDesktopReadsOnlyWhenChanged = readsQuiet === readsBefore && readsAfterEdit > readsQuiet && deskEdited.toggle !== null;
    // 目印が取れない(古い exe)ときは、今までどおり全文を読んで比べる
    await desk.evaluate(() => { window.__deskNoStamp = true; });
    const readsNoStamp = await fullReads();
    await poke(desk);
    result.watchDesktopFallsBackWithoutStamp = (await fullReads()) > readsNoStamp;
    result.watchDesktopStampEvidence = { readsBefore, readsQuiet, readsAfterEdit, toggle: deskEdited.toggle };
  } finally {
    await desk.close();
  }
  result.watchNoPageErrors = errors.length === 0;
  result.watchErrors = errors.slice(0, 3).join(" | ");
  return result;
}
