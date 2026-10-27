// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DOWNLOADS, FORMAT_VERSION, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 絵文字(「:」で候補。Issue #175)と、文中の日付(「@今日」「@2026-10-30」。Issue #173。保存形式 0.8.20) ----
// 絵文字: 「:」に続けて英字を2つ以上(または日本語の呼び名)打つと候補が出て、Enter・Tab・クリックで絵文字の文字になる。Esc で閉じる。
//   時刻(10:30)・URL(http:)・「単位:mm」・コードのブロック・打っている途中のコード/数式の中では出ない。IME の変換中は開かない。
//   絵文字の表(emoji-data.js)は初めて使うときに読み込む。
// 日付: 「@」の一覧に日付の候補(今日・明日・昨日・打った日付)。選ぶと日付の印(span.date-mention。data-date は ISO)になり、
//   「2026年10月30日」と見える。押すと日付を選び直せる。保存HTMLでは <time datetime>。開くときに無害化する。
// 画面(メモリ上)と、保存したファイルの両方で確かめる。
export default async function emojiDateSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  await fresh.setViewportSize({ width: 1280, height: 800 });
  const result = {};
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error)));
  let opened = 0;
  const openLiteral = async (literal, title) => {
    const path = join(OUT, "emoji-date-" + (opened += 1) + ".html");
    await writeFile(path, await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    await fresh.waitForFunction((name) => document.querySelector("#doc-title")?.textContent === name, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(300);
  };
  const menuState = () => fresh.evaluate(() => {
    const menu = document.querySelector("#slash-menu");
    return {
      open: !menu.hidden,
      items: [...menu.querySelectorAll(".menu-item .menu-title")].map((node) => node.textContent),
      sections: [...menu.querySelectorAll(".menu-section")].map((node) => node.textContent),
      icons: [...menu.querySelectorAll(".menu-item .menu-icon")].map((node) => node.textContent),
      descs: [...menu.querySelectorAll(".menu-item .menu-desc")].map((node) => node.textContent),
    };
  });
  const textOf = (id) => fresh.evaluate((blockId) => document.querySelector('#blocks .block-content[data-id="' + blockId + '"]')?.textContent || "", id);
  const caretAtEnd = (id) => fresh.evaluate((blockId) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, id);
  const clear = (id) => fresh.evaluate((blockId) => {
    const editable = document.querySelector('#blocks .block-content[data-id="' + blockId + '"]');
    editable.textContent = "";
    editable.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, id);
  const pause = (ms = 150) => fresh.waitForTimeout(ms);
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    const cdp = await context.newCDPSession(fresh);
    const compose = async (text) => {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
      await fresh.waitForTimeout(80);
    };
    const commit = async (text) => {
      await cdp.send("Input.insertText", { text });
      await fresh.waitForTimeout(200);
    };
    const literal = { pages: [
      { id: "P1", title: "記号と日付", blocks: [
        { id: "e1", type: "paragraph", text: "" },
        { id: "e2", type: "paragraph", text: "" },
        { id: "e3", type: "paragraph", text: "" },
        { id: "e4", type: "paragraph", text: "" },
        { id: "c1", type: "code", text: "" },
        { id: "d1", type: "paragraph", text: "" },
        { id: "d2", type: "paragraph", text: "" },
        { id: "d3", type: "paragraph", text: "" },
      ] },
      { id: "P2", title: "今日の議事録", blocks: [{ id: "x1", type: "paragraph", text: "本文" }] },
    ], fonts: [], attachments: [] };
    await openLiteral(literal, "記号と日付");
    const today = await fresh.evaluate(() => window.SingleHtmlFormat.isoDateOf(new Date()));
    const fmtText = (iso) => fresh.evaluate((value) => window.SingleHtmlFormat.dateMentionText(value), iso);

    // ===== 絵文字 =====
    // 1) 表は初めて使うときに読み込む(開いただけでは読まない)
    const loadedBefore = await fresh.evaluate(() => Boolean(window.MonolioEmojiData) || Boolean(document.querySelector('script[src="emoji-data.js"]')));
    // 2) 行頭の「:smile」で候補(Unicode 公式データの名前・キーワードで探す)。先頭は「smile」を語として持つ最初の 😀。Enter で「:smile」が 😀 になる(ただの文字)
    await caretAtEnd("e1");
    await fresh.keyboard.type("見て :smile");
    await fresh.waitForFunction(() => !document.querySelector("#slash-menu").hidden, null, { timeout: 3000 }).catch(() => {});
    await pause();
    const smile = await menuState();
    await fresh.keyboard.press("Enter");
    await pause(200);
    const afterEnter = await textOf("e1");
    result.emojiLoadsLazily = !loadedBefore && await fresh.evaluate(() => typeof window.MonolioEmojiData === "string");
    result.emojiMenuListsCandidates = smile.open && smile.items[0] === ":grinning_face:" && smile.icons[0] === "😀" && smile.sections[0] === "絵文字"
      && smile.items.length > 1 && smile.items.length <= 30;
    result.emojiEnterInsertsCharacter = afterEnter === "見て 😀" && !(await menuState()).open;
    result.emojiEvidence = JSON.stringify({ smile, afterEnter });
    // 3) 続けて打てる。Ctrl+Z 1回で「:smile」へ戻る
    await fresh.keyboard.type("!");
    await pause();
    const typedAfter = await textOf("e1");
    await fresh.keyboard.press("Control+z");
    await pause(200);
    const undo1 = await textOf("e1");
    await fresh.keyboard.press("Control+z");
    await pause(200);
    const undo2 = await textOf("e1");
    result.emojiTypingContinuesAndUndo = typedAfter === "見て 😀!" && undo1 === "見て 😀" && undo2 === "見て :smile";
    result.emojiUndoEvidence = JSON.stringify({ typedAfter, undo1, undo2 });
    await fresh.keyboard.press("Control+Shift+z");
    await pause(200);
    await fresh.keyboard.press("Escape");
    // 4) Tab でも選べる。矢印で2つ目を選べる。クリックでも入る
    await clear("e2");
    await caretAtEnd("e2");
    await fresh.keyboard.type(":thumbsu");
    await pause();
    const thumbs = await menuState();
    await fresh.keyboard.press("Tab");
    await pause(200);
    const afterTab = await textOf("e2");
    await fresh.keyboard.type(" :heart");
    await pause();
    const heart = await menuState();
    await fresh.keyboard.press("ArrowDown");
    await pause(80);
    await fresh.keyboard.press("Enter");
    await pause(200);
    const afterArrow = await textOf("e2");
    await fresh.keyboard.type(" :rocke");
    await pause();
    await fresh.locator("#slash-menu .menu-item").first().click();
    await pause(200);
    const afterClick = await textOf("e2");
    result.emojiTabArrowClick = thumbs.open && thumbs.icons[0] === "👍" && afterTab === "👍"
      && heart.open && afterArrow === "👍 " + heart.icons[1] && heart.icons[1] !== heart.icons[0]
      && afterClick.endsWith(" 🚀");
    result.emojiTabEvidence = JSON.stringify({ thumbs: thumbs.icons.slice(0, 3), afterTab, heart: heart.icons.slice(0, 3), afterArrow, afterClick });
    // 5) Esc で一覧だけ閉じ、打った文字は残る。合う候補が無いと出ず、Enter はふつうに改行(ブロックを分ける)
    await clear("e3");
    await caretAtEnd("e3");
    await fresh.keyboard.type(":smi");
    await pause();
    const beforeEscape = await menuState();
    await fresh.keyboard.press("Escape");
    await pause();
    const afterEscape = await menuState();
    result.emojiEscapeKeepsText = beforeEscape.open && !afterEscape.open && (await textOf("e3")) === ":smi";
    await clear("e3");
    await caretAtEnd("e3");
    await fresh.keyboard.type(":qqzzx");
    await pause();
    const noHit = await menuState();
    const blocksBefore = await fresh.evaluate(() => document.querySelectorAll("#blocks .block").length);
    await fresh.keyboard.press("Enter");
    await pause(200);
    const blocksAfter = await fresh.evaluate(() => document.querySelectorAll("#blocks .block").length);
    result.emojiNoHitNoMenu = !noHit.open && blocksAfter === blocksBefore + 1;
    await fresh.keyboard.press("Control+z");
    await pause(200);
    // 6) 出さない所: 時刻・URL・語の後ろの「:」・英字1字・打っている途中のコード/数式・コードのブロック
    const noMenuAfter = async (id, text) => {
      await clear(id);
      await caretAtEnd(id);
      await fresh.keyboard.type(text);
      await pause();
      const state = await menuState();
      await fresh.keyboard.press("Escape");
      return !state.open;
    };
    const exclusions = {
      time: await noMenuAfter("e4", "会議は 10:30"),
      timeLetters: await noMenuAfter("e4", "at 10:sm"),
      url: await noMenuAfter("e4", "see http:smile"),
      wordColon: await noMenuAfter("e4", "単位:mm と値:smile"),
      oneLetter: await noMenuAfter("e4", ":s"),
      inlineCode: await noMenuAfter("e4", "コード `a :smile"),
      inlineMath: await noMenuAfter("e4", "式 $$x :smile"),
      codeBlock: await noMenuAfter("c1", ":smile"),
    };
    // 閉じたコードの後ろでは出る
    await clear("e4");
    await caretAtEnd("e4");
    await fresh.keyboard.type("`a` :smile");
    await pause();
    exclusions.afterClosedCodeOpens = (await menuState()).open;
    await fresh.keyboard.press("Escape");
    result.emojiExclusions = Object.values(exclusions).every(Boolean);
    result.emojiExclusionEvidence = JSON.stringify(exclusions);
    // 7) 日本語の呼び名。IME の変換中は一覧を開かず、確定してから出す
    await clear("e4");
    await caretAtEnd("e4");
    await fresh.keyboard.type(":");
    await compose("わらい");
    const duringCompose = await menuState();
    await commit("笑");
    await pause(200);
    const afterCommit = await menuState();
    await fresh.keyboard.press("Enter");
    await pause(200);
    const jaInserted = await textOf("e4");
    result.emojiImeNoMenuWhileComposing = !duringCompose.open;
    result.emojiJapaneseKeyword = afterCommit.open && afterCommit.icons.includes("😀") && afterCommit.items.length > 0
      && [...jaInserted].length === 1 && afterCommit.icons[0] === jaInserted;
    result.emojiImeEvidence = JSON.stringify({ duringCompose: duringCompose.open, afterCommit: afterCommit.icons.slice(0, 5), jaInserted });
    // 7b) 公式データの名前から作った呼び名: 下線なしの入力(:thumbsup)・日本語の名前(ロケット)・旗(:flag_japan)でも候補が出る
    const probe = async (text) => {
      await clear("e4");
      await caretAtEnd("e4");
      await fresh.keyboard.type(":");
      if (/^[A-Za-z]/.test(text)) await fresh.keyboard.type(text);
      else await commit(text);
      await pause(200);
      const state = await menuState();
      await fresh.keyboard.press("Escape");
      return state;
    };
    const probes = { thumbsup: await probe("thumbsup"), thumbs_up: await probe("thumbs_up"), rocket: await probe("rocket"), flagJapan: await probe("flag_japan"), jaRocket: await probe("ロケット"), jaHeart: await probe("赤いハート") };
    result.emojiOfficialNames = probes.thumbsup.icons[0] === "👍" && probes.thumbs_up.icons[0] === "👍" && probes.rocket.icons[0] === "🚀"
      && probes.flagJapan.icons[0] === "🇯🇵" && probes.jaRocket.icons[0] === "🚀" && probes.jaHeart.icons[0] === "❤️";
    result.emojiOfficialNamesEvidence = JSON.stringify(Object.fromEntries(Object.entries(probes).map(([key, value]) => [key, value.icons.slice(0, 4)])));

    // ===== 日付 =====
    // 8) 「@」だけでは日付を出さない(ページの一覧のまま)。「@今日」で日付の候補、Enter で日付の印
    await caretAtEnd("d1");
    await fresh.keyboard.type("期限は@");
    await pause();
    const bareAt = await menuState();
    await fresh.keyboard.type("今日");
    await pause();
    const todayMenu = await menuState();
    const todayIndex = todayMenu.items.indexOf("今日");
    for (let index = 0; index < todayIndex; index += 1) await fresh.keyboard.press("ArrowDown");
    await fresh.keyboard.press("Enter");
    await pause(200);
    const todayChip = await fresh.evaluate(() => {
      const chip = document.querySelector('#blocks .block-content[data-id="d1"] .date-mention');
      return chip ? { date: chip.dataset.date, text: chip.textContent, editable: chip.contentEditable } : null;
    });
    const todayText = await fmtText(today);
    result.dateNotShownForBareAt = bareAt.open && !bareAt.sections.includes("日付") && !bareAt.items.includes("今日");
    // 「今日」はページ「今日の議事録」とも合う(ページが先、日付は後ろのまとまり)
    result.dateTodayCandidate = todayMenu.open && todayMenu.sections.join(",") === "ページへのリンク,日付" && todayIndex > 0
      && todayMenu.descs[todayIndex] === todayText;
    result.dateTodayInsertsChip = todayChip?.date === today && todayChip.text === todayText && todayChip.editable === "false"
      && (await textOf("d1")) === "期限は" + todayText;
    result.dateTodayEvidence = JSON.stringify({ bareAt, todayMenu, todayChip, todayText });
    // 9) 打った日付(年あり・年なし)。日付の形なら日付が先頭。明日・tomorrow
    await caretAtEnd("d2");
    await fresh.keyboard.type("締切 @2026-10-30");
    await pause();
    const typed = await menuState();
    await fresh.keyboard.press("Enter");
    await pause(200);
    await fresh.keyboard.type("と@10/3");
    await pause();
    const noYear = await menuState();
    await fresh.keyboard.press("Escape");
    await fresh.keyboard.type(" @tomorrow");
    await pause();
    const tomorrow = await menuState();
    const tomorrowIso = await fresh.evaluate((iso) => window.SingleHtmlFormat.addDaysIso(iso, 1), today);
    await fresh.keyboard.press("Enter");
    await pause(200);
    const d2 = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block-content[data-id="d2"] .date-mention')].map((chip) => chip.dataset.date));
    const year = today.slice(0, 4);
    result.dateTypedDates = typed.open && typed.items[0] === "2026年10月30日" && typed.sections[0] === "日付"
      && noYear.open && noYear.items[0] === Number(year) + "年10月3日"
      && tomorrow.open && tomorrow.items.includes("明日")
      && JSON.stringify(d2) === JSON.stringify(["2026-10-30", tomorrowIso]);
    result.dateTypedEvidence = JSON.stringify({ typed: typed.items, noYear: noYear.items, tomorrow: tomorrow.items, d2 });
    // 10) 暦に無い日・日付でない語は日付の候補にならない(合うページも無ければ一覧は出ない)
    await caretAtEnd("d3");
    await fresh.keyboard.type("@2026-02-30");
    await pause();
    const badDate = await menuState();
    await fresh.keyboard.press("Escape");
    await clear("d3");
    const units = await fresh.evaluate(() => {
      const fmt = window.SingleHtmlFormat;
      return {
        leap: fmt.parseDateQuery("2028-02-29"),
        notLeap: fmt.parseDateQuery("2027-02-29"),
        japanese: fmt.parseDateQuery("2026年1月2日", new Date(2030, 0, 1)),
        fullWidth: fmt.parseDateQuery("２０２６／１０／３０"),
        monthDay: fmt.parseDateQuery("10月30日", new Date(2031, 5, 1)),
        word: fmt.parseDateQuery("today"),
        text: fmt.dateMentionText("2026-01-05"),
        yearEnd: fmt.addDaysIso("2026-12-31", 1),
        loose: fmt.rankByQuery(["slightly_smiling_face", "smile"], "sf", (name) => name, { maxRank: 2 }),
        looseDefault: fmt.rankByQuery(["slightly_smiling_face", "smile"], "sf", (name) => name),
      };
    });
    result.dateParsingRules = !badDate.open && units.leap === "2028-02-29" && units.notLeap === null && units.japanese === "2026-01-02"
      && units.fullWidth === "2026-10-30" && units.monthDay === "2031-10-30" && units.word === null && units.text === "2026年1月5日"
      && units.yearEnd === "2027-01-01" && units.loose.length === 0 && units.looseDefault.length === 1;
    result.dateParsingEvidence = JSON.stringify({ badDate, units });
    // 11) IME: 「@きょう」の変換中は一覧を開かず、確定してから出す
    await clear("d3");
    await caretAtEnd("d3");
    await fresh.keyboard.type("@");
    await pause();
    await fresh.keyboard.press("Escape");
    await compose("きょう");
    const dateDuringCompose = await menuState();
    await commit("きょう");
    await pause(200);
    const dateAfterCommit = await menuState();
    await fresh.keyboard.press("Escape");
    result.dateImeNoMenuWhileComposing = !dateDuringCompose.open && dateAfterCommit.open && dateAfterCommit.items.includes("今日");
    await clear("d3");
    // 12) 印を押すと日付の欄が出て、選び直すと印が変わる(Undo 1手で戻る)。Esc で閉じる
    await fresh.locator('#blocks .block-content[data-id="d2"] .date-mention').first().click();
    await pause(200);
    const popover = await fresh.evaluate(() => ({ open: !document.querySelector("#date-popover").hidden, value: document.querySelector("#date-input").value }));
    await fresh.locator("#date-input").fill("2026-11-05");
    await pause(200);
    const changed = await fresh.evaluate(() => {
      const chip = document.querySelector('#blocks .block-content[data-id="d2"] .date-mention');
      return { date: chip.dataset.date, text: chip.textContent };
    });
    // ブラウザの日付の一覧(showPicker)が開いていれば、1回目の Esc はそれを閉じる。2回目までに窓が閉じればよい
    await fresh.locator("#date-input").press("Escape");
    await pause(200);
    const closedFirst = await fresh.evaluate(() => document.querySelector("#date-popover").hidden);
    if (!closedFirst) {
      await fresh.locator("#date-input").press("Escape");
      await pause(200);
    }
    const closed = await fresh.evaluate(() => document.querySelector("#date-popover").hidden);
    await fresh.keyboard.press("Control+z");
    await pause(250);
    const undone = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="d2"] .date-mention')?.dataset.date);
    await fresh.keyboard.press("Control+Shift+z");
    await pause(250);
    const redone = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="d2"] .date-mention')?.dataset.date);
    result.dateChipClickChangesDate = popover.open && popover.value === "2026-10-30" && changed.date === "2026-11-05" && changed.text === "2026年11月5日"
      && closed && undone === "2026-10-30" && redone === "2026-11-05";
    result.dateChipEvidence = JSON.stringify({ popover, changed, closedFirst, closed, undone, redone });
    // 13) 書式を外しても印は残る(以前は包みが外れて、ただの文字になっていた)
    await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="d2"]');
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await fresh.locator("#format-reset").click();
    await pause(200);
    const afterReset = await fresh.evaluate(() => [...document.querySelectorAll('#blocks .block-content[data-id="d2"] .date-mention')].map((chip) => chip.dataset.date));
    result.dateSurvivesClearFormatting = JSON.stringify(afterReset) === JSON.stringify(["2026-11-05", tomorrowIso]);
    result.dateClearEvidence = JSON.stringify(afterReset);
    // 14) 保存: 形式 0.8.20。manifest の html は ISO(data-date)、保存HTMLは <time datetime>、日付の CSS が入る。開き直しても印が残る
    await caretAtEnd("e1");
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const savedPath = join(DOWNLOADS, "emoji-date-saved.html");
    await (await download).saveAs(savedPath);
    const saved = await readFile(savedPath, "utf8");
    const parsed = await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), saved);
    const savedD2 = parsed.pages[0].blocks.find((block) => block.id === "d2");
    const savedE1 = parsed.pages[0].blocks.find((block) => block.id === "e1");
    const savedView = await fresh.evaluate((text) => {
      const page = new DOMParser().parseFromString(text, "text/html");
      return {
        times: [...page.querySelectorAll("main time.date-mention")].map((node) => ({ datetime: node.getAttribute("datetime"), text: node.textContent })),
        css: [...page.querySelectorAll("style")].some((node) => node.textContent.includes(".date-mention::before")),
      };
    }, saved);
    result.dateSavedAsIsoAndTime = parsed.formatVersion === FORMAT_VERSION && /data-date="2026-11-05"/.test(savedD2?.html || "")
      && (savedD2?.text || "").includes("2026年11月5日")
      && savedView.times.some((time) => time.datetime === "2026-11-05" && time.text === "2026年11月5日") && savedView.css;
    result.emojiSavedAsText = (savedE1?.text || "") === "見て 😀";
    result.dateSavedEvidence = JSON.stringify({ version: parsed.formatVersion, html: savedD2?.html, text: savedD2?.text, savedView, e1: savedE1?.text });
    // 日付の無い文書の保存HTMLは変わらない(日付の CSS を足さない)
    result.dateCssOnlyWhenUsed = await fresh.evaluate(() => !window.SingleHtmlFormat.buildPortableHtml({ pages: [{ id: "Q", title: "なし", blocks: [{ id: "q1", type: "paragraph", text: "ふつう" }] }], fonts: [], attachments: [] }).includes("date-mention"));
    // 15) 開くときの無害化: 暦に無い日付は文字だけ、余計な属性は落とし、文字は data-date から作り直す
    await openLiteral({ pages: [{ id: "S1", title: "無害化", blocks: [
      { id: "s1", type: "paragraph", text: "偽の日 と 2026年1月2日",
        html: '<span class="date-mention" data-date="2026-02-30">偽の日</span> と <span class="date-mention" data-date="2026-01-02" onclick="alert(1)" style="color:red">ちがう文字</span>' },
    ] }], fonts: [], attachments: [] }, "無害化");
    const sanitized = await fresh.evaluate(() => {
      const editable = document.querySelector('#blocks .block-content[data-id="s1"]');
      const chips = [...editable.querySelectorAll(".date-mention")];
      return {
        count: chips.length,
        date: chips[0]?.dataset.date,
        text: chips[0]?.textContent,
        onclick: chips.some((chip) => chip.hasAttribute("onclick") || chip.hasAttribute("style")),
        plain: editable.textContent,
      };
    });
    result.dateImportSanitized = sanitized.count === 1 && sanitized.date === "2026-01-02" && sanitized.text === "2026年1月2日" && !sanitized.onclick
      && sanitized.plain === "偽の日 と 2026年1月2日";
    result.dateSanitizeEvidence = JSON.stringify(sanitized);
    result.emojiDateNoPageErrors = pageErrors.length === 0;
    result.emojiDatePageErrorEvidence = pageErrors.join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
