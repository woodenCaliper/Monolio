// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT } from "../lib.mjs";

// ---- 保存・開くの流れ(Issue #212・#213・#214・#215) ----
// #212 保存の途中(HTML を作ってから書き終わるまで)に打った編集が「保存済み」になり、閉じるときの確認も出ずに消えた。
//      編集の番号を覚え、作った後に編集が無いときだけ「変更なし」にする(上書き・名前を付けて保存・exe の各経路)。
// #213 保存が重なって走った(Ctrl+S の押しっぱなし・連打)。保存は一度に1つ。途中に来た「保存」は終わった後の1回にまとめる。
//      押しっぱなしの繰り返し(repeat)は受けない。
// #214 開くのに失敗する(描くところで落ちる)と、前のファイルの見張りが止まったままになり、外の変更を黙って上書きした。
// #215 「名前を付けて保存」で書けなかったとき、エラーが「Downloaded」で消え、黙ってダウンロードへ落ちた。
// テストでは、ファイルの手がかり(PWA の showOpenFilePicker / showSaveFilePicker)と exe の橋渡し(window.__TAURI__)を、アプリより
// 先に差し込んで真似る。書き込みは window.__hold() で止め、window.__release() で進める(保存の途中を決まった形で作る)。
// 描くところの失敗は、題名「描けない文書」の文書だけ fmt.headingNumbers(描くたびに呼ばれる)を落として作る。
export default async function saveFlowSuite({ browser }) {
  const result = {};
  const errors = [];
  const context = await browser.newContext();
  const docLiteral = (title, text) => ({ pages: [{ id: "S", title, blocks: [{ id: "p1", type: "paragraph", text }] }], fonts: [], attachments: [] });

  // 書き込みを止める門と、描くところの失敗(両方の版で共通)。
  await context.addInitScript(() => {
    window.__gate = null;
    window.__hold = () => {
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      window.__gate = { promise, release };
    };
    window.__release = () => {
      const gate = window.__gate;
      window.__gate = null;
      gate?.release();
    };
    window.__breakRender = () => {
      const fmt = window.SingleHtmlFormat;
      const original = fmt.headingNumbers;
      fmt.headingNumbers = (value, ...rest) => {
        if ((value?.pages || []).some((page) => page.title === "描けない文書")) throw new Error("描けません(テスト)");
        return original(value, ...rest);
      };
    };
    // ダウンロードは記録だけにする(本当には落とさない)。
    window.__downloads = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__downloads.push(this.download);
        return;
      }
      click.call(this);
    };
  });

  const isDirty = (page) => page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  const typeAtEnd = async (page, text, selector = '.block-content[data-id="p1"]') => {
    await page.locator(selector).first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(text);
    await page.waitForTimeout(150);
  };
  const poke = async (page) => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(500);
  };
  const noticeText = (page) => page.evaluate(() => (document.querySelector("#notice")?.hidden === false ? document.querySelector("#notice")?.textContent || "" : ""));
  const statusText = (page) => page.evaluate(() => document.querySelector("#status")?.textContent || "");
  const suggestToggle = (page) => page.evaluate(() => (document.querySelector("#suggest-toggle")?.hidden ? null : document.querySelector("#suggest-toggle")?.textContent || null));
  const titleText = (page) => page.evaluate(() => document.querySelector("#doc-title")?.textContent || "");
  const openFromMenu = async (page) => {
    await page.locator("#menu-file-button").click();
    await page.locator("#menu-open-document").click();
    await page.waitForTimeout(400);
  };
  // 文書の HTML から、最初のページの p1 の文字を取り出す
  const manifestOf = (page, html) => page.evaluate((text) => {
    try {
      return JSON.parse(new DOMParser().parseFromString(text, "text/html").querySelector("#document-manifest").textContent);
    } catch {
      return null;
    }
  }, html);
  const p1Of = async (page, html) => (await manifestOf(page, html))?.pages[0].blocks.find((block) => block.id === "p1")?.text ?? null;
  const firstTextOf = async (page, html) => (await manifestOf(page, html))?.pages[0].blocks[0]?.text ?? null;
  // 外の書き換えを消していない: ファイルの本文にあるか、決めていない提案としてファイルに残っている
  const keepsOutsideEdit = async (page, html, value) => {
    const manifest = await manifestOf(page, html);
    if (!manifest) return false;
    if (manifest.pages[0].blocks.find((block) => block.id === "p1")?.text === value) return true;
    return (manifest.suggestions || []).some((suggestion) => suggestion.changes.some((change) => change.block === "p1" && change.text === value && !change.result));
  };
  // 外(AI など)がファイルの本文を書き換えたのと同じ形にする(p1 の文字を差し替える)
  const editOutside = (text, value) => {
    const marker = 'id="document-manifest">';
    const start = text.indexOf(marker) + marker.length;
    const end = text.indexOf("</script>", start);
    const manifest = JSON.parse(text.slice(start, end));
    manifest.pages[0].blocks.find((block) => block.id === "p1").text = value;
    return text.slice(0, start) + JSON.stringify(manifest, null, 2).replace(/</g, "\\u003c") + text.slice(end);
  };

  // ---- PWA(ファイルの手がかり) ----
  const pwaInit = () => {
    window.__files = {};
    window.__openQueue = [];
    window.__saveAsName = "new.html";
    window.__failWrite = {};
    window.__writes = 0;
    window.__writeStarted = 0;
    window.__inFlight = 0;
    window.__maxInFlight = 0;
    window.__pickerCalls = 0;
    let clock = 1000;
    const makeHandle = (name) => ({
      kind: "file",
      name,
      getFile: async () => {
        const file = window.__files[name];
        return new File([file.text], name, { type: "text/html", lastModified: file.lastModified });
      },
      createWritable: async () => {
        if (window.__failWrite[name]) throw new DOMException("この場所には書き込めません(テスト)", "NotAllowedError");
        window.__inFlight += 1;
        window.__maxInFlight = Math.max(window.__maxInFlight, window.__inFlight);
        let out = "";
        return {
          write: async (chunk) => {
            window.__writeStarted += 1;
            if (window.__gate) await window.__gate.promise;
            out += typeof chunk === "string" ? chunk : await new Blob([chunk]).text();
          },
          close: async () => {
            clock += 1;
            window.__files[name] = { text: out, lastModified: clock };
            window.__inFlight -= 1;
            window.__writes += 1;
          },
        };
      },
    });
    window.__setFile = (name, text) => {
      clock += 1;
      window.__files[name] = { text, lastModified: clock };
    };
    Object.defineProperty(window, "showOpenFilePicker", { value: async () => [makeHandle(window.__openQueue.shift())], configurable: true, writable: true });
    Object.defineProperty(window, "showSaveFilePicker", {
      value: async () => {
        window.__pickerCalls += 1;
        const name = window.__saveAsName;
        if (!window.__files[name]) window.__setFile(name, "");
        return makeHandle(name);
      },
      configurable: true,
      writable: true,
    });
  };
  const newPwaPage = async () => {
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(pwaInit);
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await page.waitForSelector("#blocks .block-content");
    return page;
  };
  const pwaFile = (page, name) => page.evaluate((fileName) => window.__files[fileName]?.text || "", name);
  const setPwaFile = (page, name, text) => page.evaluate(({ fileName, value }) => window.__setFile(fileName, value), { fileName: name, value: text });
  const pwaWrites = (page) => page.evaluate(() => window.__writes);
  const waitWriteStarted = (page, count) => page.waitForFunction((n) => window.__writeStarted >= n, count, { timeout: 5000 }).catch(() => {});

  const pwa = await newPwaPage();
  try {
    await setPwaFile(pwa, "a.html", await pwa.evaluate((literal) => window.SingleHtmlFormat.buildPortableHtml(literal), docLiteral("保存の流れ", "本文")));
    await pwa.evaluate(() => { window.__openQueue = ["a.html"]; });
    await openFromMenu(pwa);
    result.saveFlowOpened = (await titleText(pwa)) === "保存の流れ";

    // 1) #212 上書き保存の途中に打った編集は、ファイルに入っていないので「変更あり」のまま(閉じるときに確認が出る)
    await typeAtEnd(pwa, "A");
    await pwa.evaluate(() => window.__hold());
    await pwa.keyboard.press("Control+s");
    await waitWriteStarted(pwa, 1);
    await typeAtEnd(pwa, "B");
    await pwa.evaluate(() => window.__release());
    await pwa.waitForTimeout(500);
    const midSaved = await p1Of(pwa, await pwaFile(pwa, "a.html"));
    const midDirty = await isDirty(pwa);
    result.saveEditDuringWriteStaysDirty = midSaved === "本文A" && midDirty === true;
    result.saveEditDuringWriteEvidence = { saved: midSaved, dirty: midDirty, status: await statusText(pwa) };
    // 途中で打たなければ、書き終えたら「変更なし」(閉じるときに確認が出ない)
    await pwa.keyboard.press("Control+s");
    await pwa.waitForTimeout(500);
    const plainSaved = await p1Of(pwa, await pwaFile(pwa, "a.html"));
    result.saveWithoutEditsClearsDirty = plainSaved === "本文AB" && (await isDirty(pwa)) === false && (await statusText(pwa)) === "Saved";

    // 2) #213 保存の途中の Ctrl+S は、並べて走らせず、終わった後の1回にまとめる(途中で打った分も、その1回で入る)
    await typeAtEnd(pwa, "C");
    const writesBeforeBurst = await pwaWrites(pwa);
    const startedBeforeBurst = await pwa.evaluate(() => window.__writeStarted);
    await pwa.evaluate(() => { window.__maxInFlight = 0; window.__hold(); });
    await pwa.keyboard.press("Control+s");
    await waitWriteStarted(pwa, startedBeforeBurst + 1);
    await typeAtEnd(pwa, "D");
    await pwa.keyboard.press("Control+s");
    await pwa.waitForTimeout(100);
    await pwa.keyboard.press("Control+s");
    await pwa.waitForTimeout(400);
    await pwa.evaluate(() => window.__release());
    await pwa.waitForTimeout(800);
    const burst = {
      maxInFlight: await pwa.evaluate(() => window.__maxInFlight),
      writes: (await pwaWrites(pwa)) - writesBeforeBurst,
      saved: await p1Of(pwa, await pwaFile(pwa, "a.html")),
      dirty: await isDirty(pwa),
      notice: await noticeText(pwa),
      toggle: await suggestToggle(pwa),
    };
    result.saveRunsOneAtATime = burst.maxInFlight === 1;
    result.saveDuringSaveIsCoalesced = burst.writes === 2 && burst.saved === "本文ABCD" && burst.dirty === false
      && !burst.notice.includes("外で書き換わ") && burst.toggle === null;
    result.saveBurstEvidence = burst;

    // 3) #213 押しっぱなしの繰り返し(repeat)の Ctrl+S では保存しない
    await typeAtEnd(pwa, "E");
    const writesBeforeRepeat = await pwaWrites(pwa);
    await pwa.evaluate(() => {
      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "s", code: "KeyS", ctrlKey: true, repeat: true, bubbles: true, cancelable: true }));
    });
    await pwa.waitForTimeout(500);
    result.saveIgnoresKeyRepeat = (await pwaWrites(pwa)) === writesBeforeRepeat && (await isDirty(pwa)) === true;
    // 押しっぱなし(1回目 + 繰り返し)でも、書くのは1回
    await pwa.evaluate(() => { window.__maxInFlight = 0; window.__hold(); });
    const startedBeforeHeld = await pwa.evaluate(() => window.__writeStarted);
    await pwa.keyboard.down("Control");
    await pwa.keyboard.down("s");
    await waitWriteStarted(pwa, startedBeforeHeld + 1);
    for (let i = 0; i < 4; i += 1) {
      await pwa.keyboard.down("s");
      await pwa.waitForTimeout(30);
    }
    await pwa.keyboard.up("s");
    await pwa.keyboard.up("Control");
    await pwa.evaluate(() => window.__release());
    await pwa.waitForTimeout(600);
    result.saveHeldKeySavesOnce = (await pwaWrites(pwa)) === writesBeforeRepeat + 1 && (await pwa.evaluate(() => window.__maxInFlight)) === 1
      && (await p1Of(pwa, await pwaFile(pwa, "a.html"))) === "本文ABCDE";

    // 4) #214 開くのに失敗したら、前のファイルの見張りも保存先も変更ありも、そのまま(外の変更に気づき、保存で黙って上書きしない)
    await typeAtEnd(pwa, "F");
    await pwa.evaluate(() => window.__breakRender());
    await setPwaFile(pwa, "broken.html", await pwa.evaluate((literal) => window.SingleHtmlFormat.buildPortableHtml(literal), docLiteral("描けない文書", "x")));
    await pwa.evaluate(() => { window.__openQueue = ["broken.html"]; });
    await openFromMenu(pwa);
    const failedOpen = { status: await statusText(pwa), title: await titleText(pwa), dirty: await isDirty(pwa) };
    result.openFailureKeepsDocState = failedOpen.status.includes("開けませんでした") && failedOpen.title === "保存の流れ" && failedOpen.dirty === true;
    // 外で書き換わった直後の保存: 保存の前の確かめで気づいて取り込み、保存を止める(黙って上書きしない)
    await setPwaFile(pwa, "a.html", editOutside(await pwaFile(pwa, "a.html"), "外で直した本文"));
    await pwa.keyboard.press("Control+s");
    await pwa.waitForTimeout(600);
    const guarded = { toggle: await suggestToggle(pwa), notice: await noticeText(pwa), p1: await p1Of(pwa, await pwaFile(pwa, "a.html")) };
    result.openFailureKeepsWatch = guarded.toggle !== null;
    result.openFailureSaveDoesNotOverwrite = await keepsOutsideEdit(pwa, await pwaFile(pwa, "a.html"), "外で直した本文");
    result.openFailureEvidence = { failedOpen, guarded };
  } finally {
    await pwa.close();
  }

  // 5) #212 名前を付けて保存(showSaveFilePicker)の途中に打った編集も、「変更あり」のまま
  const fresh = await newPwaPage();
  try {
    await typeAtEnd(fresh, "あ", "#blocks .block-content");
    await fresh.evaluate(() => { window.__saveAsName = "new.html"; window.__hold(); });
    await fresh.keyboard.press("Control+s");
    await waitWriteStarted(fresh, 1);
    await typeAtEnd(fresh, "い", "#blocks .block-content");
    await fresh.evaluate(() => window.__release());
    await fresh.waitForTimeout(500);
    const savedAs = await firstTextOf(fresh, await pwaFile(fresh, "new.html"));
    const savedAsDirty = await isDirty(fresh);
    result.saveAsEditDuringWriteStaysDirty = /あ$/.test(savedAs || "") && savedAsDirty === true;
    // 次の Ctrl+S は選んだファイルへ上書きし、途中で打った分も入る
    await fresh.keyboard.press("Control+s");
    await fresh.waitForTimeout(500);
    result.saveAsThenSaveWritesRest = /あい$/.test((await firstTextOf(fresh, await pwaFile(fresh, "new.html"))) || "") && (await isDirty(fresh)) === false
      && (await fresh.evaluate(() => window.__pickerCalls)) === 1;
    result.saveAsEvidence = { savedAs, dirty: savedAsDirty, pickerCalls: await fresh.evaluate(() => window.__pickerCalls) };
  } finally {
    await fresh.close();
  }

  // 6) #215 名前を付けて保存で書けなかったら、そう知らせる。ダウンロードへ切り替えたことも書く(「Downloaded」で消さない)。
  //    選んだ場所には入っていないので「変更あり」のまま。選んだファイルを保存先として覚えない
  const locked = await newPwaPage();
  try {
    await typeAtEnd(locked, "う", "#blocks .block-content");
    await locked.evaluate(() => { window.__saveAsName = "locked.html"; window.__failWrite["locked.html"] = true; });
    await locked.keyboard.press("Control+s");
    await locked.waitForTimeout(600);
    const failed = {
      status: await statusText(locked),
      notice: await noticeText(locked),
      downloads: await locked.evaluate(() => window.__downloads.slice()),
      dirty: await isDirty(locked),
    };
    result.saveAsFailureIsVisible = failed.status !== "Downloaded" && failed.status.includes("保存できませんでした")
      && failed.status.includes("この場所には書き込めません") && failed.notice.includes("保存できませんでした");
    result.saveAsFailureSaysDownloaded = failed.downloads.length === 1 && failed.status.includes("ダウンロード") && failed.dirty === true;
    // 押して消すまで残る(4 秒で消える知らせにしない)
    await locked.waitForTimeout(4500);
    result.saveAsFailureNoticeStays = (await noticeText(locked)).includes("保存できませんでした");
    // 次の Ctrl+S も、書けなかったファイルへは書かずに、場所を聞き直す
    await locked.evaluate(() => { window.__failWrite["locked.html"] = false; window.__saveAsName = "retry.html"; });
    await locked.keyboard.press("Control+s");
    await locked.waitForTimeout(600);
    result.saveAsFailureDoesNotAdoptFile = (await locked.evaluate(() => window.__pickerCalls)) === 2
      && /う$/.test((await firstTextOf(locked, await pwaFile(locked, "retry.html"))) || "") && (await isDirty(locked)) === false;
    result.saveAsFailureEvidence = failed;
  } finally {
    await locked.close();
  }

  // ---- デスクトップ版(exe の橋渡し) ----
  const deskInit = () => {
    const files = {};
    let clock = 0;
    window.__deskFiles = files;
    window.__deskOpenQueue = [];
    window.__deskSaveAsPath = "C:\\docs\\別名.html";
    window.__deskWrites = 0;
    window.__deskStarted = 0;
    window.__deskInFlight = 0;
    window.__deskMaxInFlight = 0;
    const stampOf = (path) => (files[path] ? files[path].clock + ":" + files[path].text.length : null);
    window.__deskSet = (path, text) => {
      clock += 1;
      files[path] = { text, clock };
    };
    const opened = (path) => ({ path, name: path.split("\\").pop(), contents: files[path].text, stamp: stampOf(path) });
    const write = async (path, contents) => {
      window.__deskStarted += 1;
      window.__deskInFlight += 1;
      window.__deskMaxInFlight = Math.max(window.__deskMaxInFlight, window.__deskInFlight);
      if (window.__gate) await window.__gate.promise;
      window.__deskSet(path, contents);
      window.__deskInFlight -= 1;
      window.__deskWrites += 1;
    };
    window.__TAURI__ = {
      core: {
        invoke: async (command, args) => {
          if (command === "read_document") return opened(window.__deskOpenQueue.shift());
          if (command === "read_linked_document") {
            const path = args.base.replace(/[^\\/]+$/, "") + decodeURIComponent(args.href);
            if (!files[path]) throw new Error("見つかりません: " + args.href);
            return opened(path);
          }
          if (command === "document_stamp") return stampOf(args.path);
          if (command === "write_document") {
            await write(args.path, args.contents);
            return stampOf(args.path);
          }
          if (command === "save_document_as") {
            await write(window.__deskSaveAsPath, args.contents);
            return window.__deskSaveAsPath;
          }
          if (command === "confirm_discard") return true;
          return null;
        },
      },
    };
  };
  const newDeskPage = async () => {
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(deskInit);
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await page.waitForSelector("#blocks .block-content");
    return page;
  };
  const deskFile = (page, path) => page.evaluate((filePath) => window.__deskFiles[filePath]?.text || "", path);
  const setDeskFile = (page, path, text) => page.evaluate(({ filePath, value }) => window.__deskSet(filePath, value), { filePath: path, value: text });
  const waitDeskStarted = (page, count) => page.waitForFunction((n) => window.__deskStarted >= n, count, { timeout: 5000 }).catch(() => {});
  const A = "C:\\docs\\a.html";
  const C = "C:\\docs\\c.html";

  const desk = await newDeskPage();
  try {
    await setDeskFile(desk, A, await desk.evaluate((literal) => window.SingleHtmlFormat.buildPortableHtml(literal), docLiteral("保存の流れ", "本文")));
    await desk.evaluate((path) => { window.__deskOpenQueue = [path]; }, A);
    await openFromMenu(desk);
    result.desktopSaveFlowOpened = (await titleText(desk)) === "保存の流れ";

    // 7) #212 exe の上書き保存(write_document)の途中に打った編集も、「変更あり」のまま
    await typeAtEnd(desk, "A");
    await desk.evaluate(() => window.__hold());
    await desk.keyboard.press("Control+s");
    await waitDeskStarted(desk, 1);
    await typeAtEnd(desk, "B");
    await desk.evaluate(() => window.__release());
    await desk.waitForTimeout(500);
    const deskMid = { saved: await p1Of(desk, await deskFile(desk, A)), dirty: await isDirty(desk) };
    result.desktopSaveEditDuringWriteStaysDirty = deskMid.saved === "本文A" && deskMid.dirty === true;
    result.desktopSaveEvidence = deskMid;

    // 8) #212 exe の名前を付けて保存(save_document_as)の途中に打った編集も、「変更あり」のまま
    const startedBeforeAs = await desk.evaluate(() => window.__deskStarted);
    await desk.evaluate(() => window.__hold());
    await desk.locator("#menu-file-button").click();
    await desk.locator("#menu-save-as").click();
    await waitDeskStarted(desk, startedBeforeAs + 1);
    await typeAtEnd(desk, "C");
    await desk.evaluate(() => window.__release());
    await desk.waitForTimeout(500);
    const deskAs = { saved: await p1Of(desk, await deskFile(desk, "C:\\docs\\別名.html")), dirty: await isDirty(desk) };
    result.desktopSaveAsEditDuringWriteStaysDirty = deskAs.saved === "本文AB" && deskAs.dirty === true;
    result.desktopSaveAsEvidence = deskAs;
    // 保存先は別名へ移る。続けて Ctrl+S で残りも入り、「変更なし」になる
    await desk.keyboard.press("Control+s");
    await desk.waitForTimeout(500);
    result.desktopSaveAsThenSave = (await p1Of(desk, await deskFile(desk, "C:\\docs\\別名.html"))) === "本文ABC" && (await isDirty(desk)) === false;

    // 9) 保存の途中に別のファイルを開いたら、終わった保存は新しい文書の状態(変更なし・見張りの控え)に手を出さない
    //    (以前は、前の文書の中身を新しいファイルの控えにして、新しいファイルとの差を「外の変更」と取り違えた)
    await setDeskFile(desk, C, await desk.evaluate((literal) => window.SingleHtmlFormat.buildPortableHtml(literal), docLiteral("別の文書", "別の本文")));
    await typeAtEnd(desk, "D");
    const startedBeforeSwitch = await desk.evaluate(() => window.__deskStarted);
    await desk.evaluate(() => window.__hold());
    await desk.keyboard.press("Control+s");
    await waitDeskStarted(desk, startedBeforeSwitch + 1);
    await desk.evaluate((path) => { window.__deskOpenQueue = [path]; }, C);
    await openFromMenu(desk);
    await desk.evaluate(() => window.__release());
    await desk.waitForTimeout(500);
    await poke(desk);
    const switched = { title: await titleText(desk), toggle: await suggestToggle(desk), notice: await noticeText(desk), dirty: await isDirty(desk) };
    result.saveFinishingAfterOpenLeavesNewFileAlone = switched.title === "別の文書" && switched.toggle === null
      && !switched.notice.includes("外で書き換わ") && switched.dirty === false;
    result.saveSwitchEvidence = switched;

    // 10) #214 exe でも、開くのに失敗したら前のファイル(c.html)の見張りが続く
    await desk.evaluate(() => window.__breakRender());
    await setDeskFile(desk, "C:\\docs\\broken.html", await desk.evaluate((literal) => window.SingleHtmlFormat.buildPortableHtml(literal), docLiteral("描けない文書", "x")));
    await desk.evaluate(() => { window.__deskOpenQueue = ["C:\\docs\\broken.html"]; });
    await openFromMenu(desk);
    const deskFailed = { status: await statusText(desk), title: await titleText(desk) };
    await setDeskFile(desk, C, editOutside(await deskFile(desk, C), "外で直した本文"));
    await typeAtEnd(desk, "E");
    await desk.keyboard.press("Control+s");
    await desk.waitForTimeout(600);
    const deskWatch = await suggestToggle(desk);
    result.desktopOpenFailureKeepsWatch = deskFailed.status.includes("開けませんでした") && deskFailed.title === "別の文書" && deskWatch !== null
      && (await keepsOutsideEdit(desk, await deskFile(desk, C), "外で直した本文"));
    result.desktopOpenFailureEvidence = { deskFailed, deskWatch, p1: await p1Of(desk, await deskFile(desk, C)) };
  } finally {
    await desk.close();
  }

  await context.close();
  result.saveFlowNoPageErrors = errors.filter((message) => !message.includes("描けません(テスト)")).length === 0;
  result.saveFlowErrors = errors.slice(0, 3).join(" | ");
  return result;
}
