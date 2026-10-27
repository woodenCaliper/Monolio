// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOWNLOADS, OUT, PORT, openMenu } from "../lib.mjs";

// ---- 呼び出し(コールアウト。Issue #161)とブロックの色(Issue #162)。保存形式 0.8.20 ----
// 呼び出し: 絵文字(既定 💡。押すと選び直せる)つきの色の囲み。「/」のメニュー(/callout・/コールアウト・/呼び出し)とつまみのメニューの
// 変換で入る。Notion の呼び出しを貼ると呼び出しになる(#141 では引用にしていた)。
// ブロックの色: つまみのメニューの「色」で、Notion と同じ 9 色の文字の色か背景の色をブロック全体に付ける(どちらか1つ)。Notion の
// ブロックの色(block_color)を貼ると、文中の色ではなくブロックの色になる。
// エディタ(メモリ上・画面)と保存HTMLの両方で確かめる(開くときの無害化で不具合が隠れないように。規則 8 の注)。
const NOTION_FIXTURE = fileURLToPath(new URL("../fixtures/notion-clipboard.json", import.meta.url));

// 画面の位置と色を測る(エディタ・保存HTMLの両方で同じ関数)。基準は先頭の段落の文字の左上。
function measureColors(needles) {
  const editor = Boolean(document.querySelector("#blocks"));
  const root = editor ? document.querySelector("#blocks") : document.querySelector("main");
  const find = (needle) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.nodeValue.indexOf(needle);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      return { el: node.parentElement, rect: range.getBoundingClientRect() };
    }
    return null;
  };
  const ref = find("REF paragraph").rect;
  // 背景を塗っている箱。エディタは本文の箱(.block-content)。保存HTMLは色の印の要素に、左右の影(-6px・+6px。引用は右だけ)を足した箱。
  const paintedBox = (el) => {
    if (editor) {
      const content = el.closest(".block-content");
      const row = el.closest(".block");
      if (!row?.classList.contains("block-bg")) return null;
      return { node: content, rect: content.getBoundingClientRect() };
    }
    const host = el.closest(".block-bg");
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    const callout = host.classList.contains("callout");
    const quote = host.classList.contains("quote");
    const left = callout || quote ? rect.left : rect.left - 6;
    const right = callout ? rect.right : rect.right + 6;
    return { node: host, rect: { left, right, top: rect.top, bottom: rect.bottom, width: right - left, height: rect.height } };
  };
  const out = {};
  for (const needle of needles) {
    const hit = find(needle);
    if (!hit) {
      out[needle] = null;
      continue;
    }
    const painted = paintedBox(hit.el);
    const marker = (() => {
      if (editor) {
        const row = hit.el.closest(".block");
        const node = row?.querySelector(":scope > .bullet-marker, :scope > .numbered-marker, :scope > .toggle-caret");
        return node ? getComputedStyle(node).color : null;
      }
      const li = hit.el.closest("li");
      if (li) return getComputedStyle(li, "::before").backgroundColor;
      const number = hit.el.closest(".numbered-item")?.querySelector(".numbered-marker");
      if (number) return getComputedStyle(number).color;
      const summary = hit.el.closest("summary");
      if (summary) return getComputedStyle(summary, "::before").backgroundColor;
      return null;
    })();
    const iconNode = editor ? hit.el.closest(".block")?.querySelector(":scope > .callout-icon") : hit.el.closest(".callout")?.querySelector(".callout-icon");
    const iconRect = iconNode?.getBoundingClientRect();
    out[needle] = {
      dx: hit.rect.left - ref.left,
      dy: hit.rect.top - ref.top,
      color: getComputedStyle(hit.el).color,
      background: painted ? getComputedStyle(painted.node).backgroundColor : null,
      box: painted ? { dx: painted.rect.left - ref.left, dy: painted.rect.top - ref.top, w: painted.rect.width, h: painted.rect.height } : null,
      // 印(点・番号・三角)の色。エディタの点は currentColor の円、三角は SVG の currentColor。保存HTMLは ::before の地の色。
      marker,
      icon: iconRect ? { dx: iconRect.left - ref.left, dy: iconRect.top - ref.top, text: iconNode.textContent } : null,
    };
  }
  return out;
}

export default async function calloutColorSuite({ context }) {
  const fresh = await context.newPage();
  fresh.on("dialog", (dialog) => dialog.accept());
  const pageErrors = [];
  fresh.on("pageerror", (error) => pageErrors.push(String(error)));
  await fresh.setViewportSize({ width: 1280, height: 900 });
  const result = {};
  const fixture = JSON.parse(await readFile(NOTION_FIXTURE, "utf8"));
  const openLiteral = async (literal, name) => {
    const path = join(OUT, name);
    await writeFile(path, typeof literal === "string" ? literal : await fresh.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), literal), "utf8");
    const chooser = fresh.waitForEvent("filechooser");
    await openMenu(fresh, "file");
    await fresh.locator("#menu-open-document").click();
    await (await chooser).setFiles(path);
    const title = typeof literal === "string" ? null : literal.pages[0].title;
    if (title) await fresh.waitForFunction((value) => document.querySelector("#doc-title")?.textContent === value, title, { timeout: 5000 }).catch(() => {});
    await fresh.waitForTimeout(400);
  };
  const saveAndParse = async (name) => {
    const download = fresh.waitForEvent("download");
    await fresh.keyboard.press("Control+s");
    const path = join(DOWNLOADS, name);
    await (await download).saveAs(path);
    const html = await readFile(path, "utf8");
    return { html, path, parsed: await fresh.evaluate((text) => window.SingleHtmlFormat.parsePortableHtml(text), html) };
  };
  const doc = (title, blocks) => ({ pages: [{ id: "P", title, blocks }], fonts: [], attachments: [] });
  const rowOf = (id) => '#blocks .block[data-id="' + id + '"]';
  const typeOf = (id) => fresh.evaluate((selector) => [...document.querySelector(selector)?.classList || []].find((name) => name.startsWith("type-")) || "", rowOf(id));
  const openGripMenu = async (id) => {
    await fresh.locator(rowOf(id) + " .drag-grip").click();
    await fresh.waitForSelector("#block-menu:not([hidden])", { timeout: 3000 });
    await fresh.waitForTimeout(100);
  };
  const menuActions = () => fresh.evaluate(() => [...document.querySelectorAll("#block-menu .menu-item")].map((node) => node.dataset.action));
  const pasteInto = async (id, items) => {
    await fresh.locator('#blocks .block-content[data-id="' + id + '"]').click();
    await fresh.evaluate(({ id: blockId, items: data }) => {
      const transfer = new DataTransfer();
      Object.entries(data).forEach(([type, value]) => transfer.setData(type, value));
      document.querySelector('#blocks .block-content[data-id="' + blockId + '"]').dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, { id, items });
    await fresh.waitForTimeout(400);
  };
  // 開いている文書のブロック(保存せずにメモリ上の値を読む: 保存の前の画面の状態。保存→開き直しの無害化で隠れないように)。
  const liveBlocks = () => fresh.evaluate(() => {
    const out = [];
    document.querySelectorAll("#blocks .block").forEach((row) => {
      const type = [...row.classList].find((name) => name.startsWith("type-"))?.slice(5) || "";
      out.push({ id: row.dataset.id, type, indent: Number(row.dataset.indent || 0), text: row.querySelector(".block-content")?.textContent || "",
        fg: row.style.getPropertyValue("--block-fg"), bg: row.style.getPropertyValue("--block-bg"), icon: row.querySelector(":scope > .callout-icon")?.textContent || "" });
    });
    return out;
  });
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");

    // 1) 「/」のメニュー: /callout・/コールアウト・/呼び出し の先頭に呼び出しが出て、Enter で呼び出しになる(文字はそのまま)
    await openLiteral(doc("呼び出し", [
      { id: "s1", type: "paragraph", text: "" },
      { id: "s2", type: "paragraph", text: "変える段落" },
      { id: "s3", type: "paragraph", text: "末尾" },
    ]), "callout-slash.html");
    const firstSlashOption = async (query, last) => {
      await fresh.locator('#blocks .block-content[data-id="s1"]').click();
      await fresh.keyboard.type("/" + query);
      await fresh.waitForTimeout(250);
      const first = await fresh.evaluate(() => document.querySelector("#slash-menu:not([hidden]) .menu-item")?.dataset.type || "");
      if (!last) {
        await fresh.keyboard.press("Escape");
        await fresh.keyboard.press("Backspace", { delay: 0 });
        for (let count = 1; count < [...("/" + query)].length; count += 1) await fresh.keyboard.press("Backspace");
        await fresh.waitForTimeout(100);
      }
      return first;
    };
    const slashFirsts = {};
    for (const query of ["callout", "コールアウト", "呼び出し"]) slashFirsts[query] = await firstSlashOption(query, query === "呼び出し");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    result.calloutSlashOffersCallout = Object.values(slashFirsts).every((type) => type === "callout");
    result.calloutSlashEvidence = JSON.stringify(slashFirsts);
    result.calloutSlashInserts = (await typeOf("s1")) === "type-callout"
      && (await fresh.evaluate((selector) => document.querySelector(selector + " > .callout-icon")?.textContent, rowOf("s1"))) === "💡";

    // 2) つまみのメニューの変換で、文字のある段落を呼び出しにできる(文字は残る)。Undo 1手で戻る
    await openGripMenu("s2");
    await fresh.keyboard.type("呼び出し");
    await fresh.waitForTimeout(200);
    const convertFirst = (await menuActions())[0];
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const convertedText = await fresh.evaluate(() => document.querySelector('#blocks .block-content[data-id="s2"]')?.textContent);
    result.calloutConvertFromMenu = convertFirst === "callout" && (await typeOf("s2")) === "type-callout" && convertedText === "変える段落";
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.calloutConvertUndoOneStep = (await typeOf("s2")) === "type-paragraph";
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(250);

    // 3) 絵文字を押すと一覧が開き、選ぶと変わる(Undo 1手で戻る)。Esc で閉じる。保存しても残る
    await fresh.locator(rowOf("s2") + " > .callout-icon").click();
    await fresh.waitForTimeout(200);
    const picker = await fresh.evaluate(() => {
      const node = document.querySelector("#callout-icon-picker");
      return { open: Boolean(node && !node.hidden), count: node?.querySelectorAll(".callout-icon-choice").length || 0,
        checked: node?.querySelector('[aria-checked="true"]')?.textContent || "", focused: document.activeElement?.classList.contains("callout-icon-choice") };
    });
    // 矢印キーで動いて Enter で選ぶ(💡 → → ⚠️)
    await fresh.keyboard.press("ArrowRight");
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(250);
    const afterPick = await fresh.evaluate((selector) => ({
      icon: document.querySelector(selector + " > .callout-icon")?.textContent,
      open: !document.querySelector("#callout-icon-picker").hidden,
    }), rowOf("s2"));
    result.calloutIconPickerOpens = picker.open && picker.count === 16 && picker.checked === "💡" && picker.focused;
    result.calloutIconPickChanges = afterPick.icon === "⚠️" && !afterPick.open;
    result.calloutIconPickerEvidence = JSON.stringify({ picker, afterPick });
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.calloutIconUndoOneStep = (await fresh.evaluate((selector) => document.querySelector(selector + " > .callout-icon")?.textContent, rowOf("s2"))) === "💡";
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(250);
    await fresh.locator(rowOf("s2") + " > .callout-icon").click();
    await fresh.waitForTimeout(150);
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    result.calloutIconPickerEscCloses = await fresh.evaluate(() => document.querySelector("#callout-icon-picker").hidden);
    const saved1 = await saveAndParse("callout-slash-saved.html");
    const savedCallout = saved1.parsed.pages[0].blocks.find((block) => block.id === "s2");
    result.calloutSavedRoundTrip = savedCallout?.type === "callout" && savedCallout.icon === "⚠️" && savedCallout.text === "変える段落"
      && /<div class="callout block-bg" style="--block-bg:#eef0f2"><span class="callout-icon">⚠️<\/span><div class="callout-text">変える段落<\/div><\/div>/.test(saved1.html);
    result.calloutSavedEvidence = (saved1.html.match(/<div class="callout[^\n]{0,200}/) || [""])[0];

    // 4) ブロックの色: つまみのメニューの「色」→ 文字の色・背景の色の一覧(既定 + 9 色ずつ)。選ぶとブロック全体に付き、もう片方は外れる。
    //    「既定の背景」は背景だけを外す。どれも Undo 1手
    await openLiteral(doc("色", [
      { id: "c1", type: "paragraph", text: "色を付ける段落" },
      { id: "c2", type: "heading2", text: "色を付ける見出し" },
      { id: "c3", type: "table", rows: [[{ text: "a" }]] },
      { id: "c4", type: "paragraph", text: "末尾" },
    ]), "color-menu.html");
    await openGripMenu("c1");
    const mainActions = await menuActions();
    const mainSections = await fresh.evaluate(() => [...document.querySelectorAll("#block-menu .menu-section")].map((node) => node.textContent));
    await fresh.locator('#block-menu .menu-item[data-action="color"]').click();
    await fresh.waitForTimeout(200);
    const colorMenu = await fresh.evaluate(() => ({
      sections: [...document.querySelectorAll("#block-menu .menu-section")].map((node) => node.textContent),
      actions: [...document.querySelectorAll("#block-menu .menu-item")].map((node) => node.dataset.action),
      checked: [...document.querySelectorAll('#block-menu .menu-item[aria-checked="true"]')].map((node) => node.dataset.action),
      titles: [...document.querySelectorAll("#block-menu .menu-item .menu-title")].map((node) => node.textContent),
      redSwatch: getComputedStyle(document.querySelector('#block-menu .menu-item[data-action="color-red"] .menu-icon')).color,
      redBgSwatch: getComputedStyle(document.querySelector('#block-menu .menu-item[data-action="color-red_background"] .menu-icon')).backgroundColor,
      focused: document.activeElement?.classList.contains("block-menu-search"),
    }));
    const names = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
    result.colorMenuInBlockMenu = mainActions.includes("color") && mainSections.length === 2 && !mainActions.some((action) => action.startsWith("color-"));
    result.colorMenuListsNotionPalette = JSON.stringify(colorMenu.sections) === JSON.stringify(["文字の色", "背景の色"])
      && JSON.stringify(colorMenu.actions) === JSON.stringify(["color-default", ...names.map((name) => "color-" + name), "color-default_background", ...names.map((name) => "color-" + name + "_background")])
      && JSON.stringify(colorMenu.checked) === JSON.stringify(["color-default", "color-default_background"])
      && colorMenu.titles[0] === "既定の色" && colorMenu.titles.includes("赤") && colorMenu.titles.includes("青の背景")
      && colorMenu.redSwatch === "rgb(193, 63, 47)" && colorMenu.redBgSwatch === "rgb(253, 232, 229)" && colorMenu.focused;
    result.colorMenuEvidence = JSON.stringify({ mainActions, mainSections, colorMenu });
    // 色の一覧で Esc はふだんの一覧へ戻る
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    const backToMain = await menuActions();
    result.colorMenuEscBacksToMain = backToMain.includes("duplicate") && backToMain.includes("color") && !(await fresh.evaluate(() => document.querySelector("#block-menu").hidden));
    // キーボード: 「赤」で探して Enter(色の一覧も探せる)
    await fresh.keyboard.type("赤");
    await fresh.waitForTimeout(200);
    const searchRed = await menuActions();
    await fresh.keyboard.press("Enter");
    await fresh.waitForTimeout(300);
    const redState = await fresh.evaluate((selector) => {
      const row = document.querySelector(selector);
      return { fg: row.classList.contains("block-fg"), color: getComputedStyle(row.querySelector(".block-content")).color, menuOpen: !document.querySelector("#block-menu").hidden };
    }, rowOf("c1"));
    result.colorMenuSearchFindsColors = searchRed[0] === "color-red" && searchRed.includes("color-red_background");
    result.colorTextApplies = redState.fg && redState.color === "rgb(193, 63, 47)" && !redState.menuOpen;
    result.colorTextEvidence = JSON.stringify({ searchRed, redState });
    // 背景の色を選ぶと、文字の色は外れる(どちらか1つ。Notion と同じ)
    await openGripMenu("c1");
    await fresh.locator('#block-menu .menu-item[data-action="color"]').click();
    await fresh.waitForTimeout(150);
    const checkedWithRed = await fresh.evaluate(() => [...document.querySelectorAll('#block-menu .menu-item[aria-checked="true"]')].map((node) => node.dataset.action));
    await fresh.locator('#block-menu .menu-item[data-action="color-blue_background"]').click();
    await fresh.waitForTimeout(300);
    const blueState = await fresh.evaluate((selector) => {
      const row = document.querySelector(selector);
      const content = row.querySelector(".block-content");
      content.focus();
      const focusedBg = getComputedStyle(content).backgroundColor;
      content.blur();
      return { fg: row.classList.contains("block-fg"), bg: getComputedStyle(content).backgroundColor, focusedBg, color: getComputedStyle(content).color };
    }, rowOf("c1"));
    result.colorMenuChecksCurrent = JSON.stringify(checkedWithRed) === JSON.stringify(["color-red", "color-default_background"]);
    result.colorBackgroundReplacesText = !blueState.fg && blueState.bg === "rgb(223, 238, 253)" && blueState.color === "rgb(32, 33, 36)";
    // 書いている最中(フォーカスのある本文)も背景は白にならない
    result.colorBackgroundKeptWhileEditing = blueState.focusedBg === "rgb(223, 238, 253)";
    result.colorBackgroundEvidence = JSON.stringify(blueState);
    // Undo 1手で赤に戻る
    await fresh.keyboard.press("Control+z");
    await fresh.waitForTimeout(250);
    result.colorUndoOneStep = await fresh.evaluate((selector) => {
      const row = document.querySelector(selector);
      return row.classList.contains("block-fg") && !row.classList.contains("block-bg");
    }, rowOf("c1"));
    await fresh.keyboard.press("Control+y");
    await fresh.waitForTimeout(250);
    // 「既定の色」(文字の側)を選んでも背景は残る。「既定の背景」で背景が外れる
    await openGripMenu("c1");
    await fresh.locator('#block-menu .menu-item[data-action="color"]').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#block-menu .menu-item[data-action="color-default"]').click();
    await fresh.waitForTimeout(250);
    const keptBg = await fresh.evaluate((selector) => document.querySelector(selector).classList.contains("block-bg"), rowOf("c1"));
    await openGripMenu("c1");
    await fresh.locator('#block-menu .menu-item[data-action="color"]').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#block-menu .menu-item[data-action="color-default_background"]').click();
    await fresh.waitForTimeout(250);
    const cleared = await fresh.evaluate((selector) => {
      const row = document.querySelector(selector);
      return !row.classList.contains("block-bg") && !row.classList.contains("block-fg");
    }, rowOf("c1"));
    result.colorDefaultClearsOnlyThatSide = keptBg && cleared;
    // 表(色を持てない種類)のメニューには「色」が無い
    await fresh.locator(rowOf("c3") + " .drag-grip").click();
    await fresh.waitForTimeout(200);
    result.colorMenuNotForTable = !(await menuActions()).includes("color");
    await fresh.keyboard.press("Escape");
    await fresh.waitForTimeout(150);
    // 見出しに緑の文字。保存すると color が残り、保存HTMLにも同じ色
    await openGripMenu("c2");
    await fresh.locator('#block-menu .menu-item[data-action="color"]').click();
    await fresh.waitForTimeout(150);
    await fresh.locator('#block-menu .menu-item[data-action="color-green"]').click();
    await fresh.waitForTimeout(250);
    const saved2 = await saveAndParse("color-menu-saved.html");
    const savedBlocks = saved2.parsed.pages[0].blocks;
    result.colorSavedInManifest = savedBlocks.find((block) => block.id === "c2")?.color === "green" && !("color" in savedBlocks.find((block) => block.id === "c1"));
    result.colorSavedHtml = /<h3 class="block-fg" style="--block-fg:#16835f" id="block-c2">/.test(saved2.html) && saved2.html.includes(".block-fg{color:var(--block-fg)}");

    // 5) 書式バーの文中の色は、これまでどおりの並びと値(同じ一覧から取るようにした。規則 8)
    const inlineSwatches = await fresh.evaluate(() => ({
      text: [...document.querySelectorAll("#format-color-options .color-swatch")].map((node) => node.dataset.color),
      background: [...document.querySelectorAll("#format-background-options .color-swatch")].map((node) => node.dataset.color),
    }));
    result.inlinePaletteUnchanged = JSON.stringify(inlineSwatches.text) === JSON.stringify(["#202124", "#c13f2f", "#0b6bcb", "#16835f", "#6b7078", "#8b5e3c", "#c45f16", "#9a6a00", "#7651a8", "#b34778"])
      && JSON.stringify(inlineSwatches.background) === JSON.stringify(["#ffffff", "#eef0f2", "#fde8e5", "#dfeefd", "#ddf3e8", "#f2e9e1", "#feecd8", "#fff1a8", "#eee6f7", "#f8e2eb"]);
    result.inlinePaletteEvidence = JSON.stringify(inlineSwatches);

    // 6) エディタと保存HTMLの見た目がそろう(P7): 文字の位置・色・背景の箱・印の色・絵文字の位置。広い画面と狭い画面の両方で
    const parityBlocks = [
      { id: "r0", type: "paragraph", text: "REF paragraph text" },
      { id: "k1", type: "callout", text: "CALLOUT default box" },
      { id: "k2", type: "callout", text: "CALLOUT blue box", icon: "⚠️", color: "blue_background" },
      { id: "k3", type: "callout", text: "CALLOUT red text\n2行目", color: "red" },
      { id: "p1", type: "paragraph", text: "PCOLOR red text", color: "red" },
      { id: "p2", type: "paragraph", text: "PBG yellow background", color: "yellow_background" },
      { id: "h1", type: "heading1", text: "HBG heading one", color: "pink_background" },
      { id: "h2", type: "heading2", text: "HCOLOR heading two", color: "green" },
      { id: "b1", type: "bullet", text: "BCOLOR purple item", color: "purple" },
      { id: "b2", type: "bullet", text: "BBG pink item", color: "pink_background", indent: 1 },
      { id: "n1", type: "numbered", text: "NCOLOR orange item", color: "orange" },
      { id: "t1", type: "todo", text: "TCOLOR brown todo", color: "brown", checked: false },
      { id: "t2", type: "todo", text: "TDONE done todo", color: "red", checked: true },
      { id: "g1", type: "toggle", text: "GBG blue toggle", color: "blue_background", open: true },
      { id: "g1c", type: "paragraph", text: "GCHILD plain child", indent: 1 },
      { id: "g2", type: "toggle", text: "GCOLOR red toggle", color: "red", open: true },
      { id: "q1", type: "quote", text: "QBG gray quote", color: "gray_background" },
      { id: "q2", type: "quote", text: "QCOLOR blue quote", color: "blue" },
      { id: "th", type: "toggleHeading3", text: "THCOLOR toggle heading", color: "orange", open: true },
      { id: "h5", type: "heading5", text: "H5COLOR small heading", color: "purple" },
      { id: "pz", type: "paragraph", text: "END paragraph" },
    ];
    const needles = ["CALLOUT default", "CALLOUT blue", "CALLOUT red", "2行目", "PCOLOR", "PBG", "HBG", "HCOLOR", "BCOLOR", "BBG", "NCOLOR", "TCOLOR", "TDONE",
      "GBG", "GCHILD", "GCOLOR", "QBG", "QCOLOR", "THCOLOR", "H5COLOR", "END paragraph"];
    await openLiteral(doc("色と呼び出しの見た目", parityBlocks), "color-parity.html");
    const saved3 = await saveAndParse("color-parity-saved.html");
    const view = await context.newPage();
    const near = (a, b, tolerance = 1.5) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tolerance;
    const parity = {};
    for (const width of [1280, 800]) {
      await fresh.setViewportSize({ width, height: 900 });
      await fresh.waitForTimeout(300);
      await fresh.evaluate(() => window.scrollTo(0, 0));
      const editor = await fresh.evaluate(measureColors, needles);
      await view.setViewportSize({ width, height: 900 });
      await view.goto("file://" + saved3.path);
      await view.waitForTimeout(300);
      const exported = await view.evaluate(measureColors, needles);
      const diffs = [];
      for (const needle of needles) {
        const a = editor[needle];
        const b = exported[needle];
        if (!a || !b) { diffs.push(needle + " missing"); continue; }
        if (!near(a.dx, b.dx) || !near(a.dy, b.dy)) diffs.push(needle + " pos " + [a.dx, a.dy, b.dx, b.dy].map((v) => v.toFixed(1)).join("/"));
        if (a.color !== b.color) diffs.push(needle + " color " + a.color + "/" + b.color);
        if (a.background !== b.background) diffs.push(needle + " bg " + a.background + "/" + b.background);
        if (Boolean(a.box) !== Boolean(b.box)) diffs.push(needle + " box presence");
        else if (a.box) for (const key of ["dx", "dy", "w", "h"]) if (!near(a.box[key], b.box[key], 2)) diffs.push(needle + " box " + key + " " + a.box[key].toFixed(1) + "/" + b.box[key].toFixed(1));
        if (a.marker !== b.marker) diffs.push(needle + " marker " + a.marker + "/" + b.marker);
        if (Boolean(a.icon) !== Boolean(b.icon)) diffs.push(needle + " icon presence");
        else if (a.icon && (!near(a.icon.dx, b.icon.dx) || !near(a.icon.dy, b.icon.dy) || a.icon.text !== b.icon.text)) diffs.push(needle + " icon " + JSON.stringify([a.icon, b.icon]));
      }
      parity[width] = { diffs, editor };
    }
    await view.close();
    await fresh.setViewportSize({ width: 1280, height: 900 });
    result.colorParityWide = parity[1280].diffs.length === 0;
    result.colorParityNarrow = parity[800].diffs.length === 0;
    result.colorParityEvidence = JSON.stringify({ wide: parity[1280].diffs.slice(0, 12), narrow: parity[800].diffs.slice(0, 12) });
    // 中身の色: 呼び出しの既定はグレーの囲み、文字の色の呼び出しも囲みは残る。済んだ ToDo は薄い色(色を付けても)。トグルの子には効かない
    const e = parity[1280].editor;
    result.colorValuesAsDesigned = e["CALLOUT default"]?.background === "rgb(238, 240, 242)" && e["CALLOUT blue"]?.background === "rgb(223, 238, 253)"
      && e["CALLOUT red"]?.background === "rgb(238, 240, 242)" && e["CALLOUT red"]?.color === "rgb(193, 63, 47)"
      && e["PCOLOR"]?.color === "rgb(193, 63, 47)" && e["PBG"]?.background === "rgb(255, 241, 168)"
      && e["BCOLOR"]?.marker === "rgb(118, 81, 168)" && e["TDONE"]?.color === "rgb(107, 112, 120)"
      && e["GCHILD"]?.background === null && e["GCHILD"]?.color === "rgb(32, 33, 36)" && e["H5COLOR"]?.color === "rgb(118, 81, 168)"
      && e["CALLOUT blue"]?.icon?.text === "⚠️" && e["CALLOUT default"]?.icon?.text === "💡";
    result.colorValuesEvidence = JSON.stringify(Object.fromEntries(["CALLOUT default", "CALLOUT red", "BCOLOR", "TDONE", "GCHILD", "H5COLOR"].map((key) => [key, e[key]])));

    // 7) 印刷(保存HTMLの @media print)でも色と囲みが出る。呼び出しは紙の途中で切らない
    const printView = await context.newPage();
    await printView.goto("file://" + saved3.path);
    await printView.emulateMedia({ media: "print" });
    await printView.waitForTimeout(200);
    const printed = await printView.evaluate(() => {
      const callout = document.querySelector(".callout");
      const bg = [...document.querySelectorAll(".block-bg")].find((node) => node.textContent.includes("PBG"));
      return { callout: getComputedStyle(callout).backgroundColor, breakInside: getComputedStyle(callout).breakInside, bg: getComputedStyle(bg).backgroundColor,
        adjust: getComputedStyle(bg).printColorAdjust || getComputedStyle(bg).webkitPrintColorAdjust };
    });
    await printView.close();
    result.colorPrintKeepsColors = printed.callout === "rgb(238, 240, 242)" && printed.bg === "rgb(255, 241, 168)" && printed.breakInside === "avoid" && printed.adjust === "exact";
    result.colorPrintEvidence = JSON.stringify(printed);

    // 8) 細工したファイル: 知らない色の名前・CSS の持ち込み・絵文字でない icon は開くときに外す(呼び出しは 💡)。正しい値は残る。何も実行されない
    await openLiteral(doc("細工", [
      { id: "x0", type: "paragraph", text: "REF paragraph" },
      { id: "x1", type: "callout", text: "悪い絵文字", icon: '<img src=x onerror="window.__pwned=1">' },
      { id: "x2", type: "paragraph", text: "悪い色", color: "red;background:url(https://example.com/x)" },
      { id: "x3", type: "paragraph", text: "悪い色2", color: "#ff0000" },
      { id: "x4", type: "callout", text: "よい呼び出し", icon: "🚧", color: "orange_background" },
      { id: "x5", type: "callout", text: "文字の icon", icon: "A" },
      { id: "x6", type: "paragraph", text: "知らない種類の色", color: { bad: true } },
    ]), "color-hostile.html");
    const hostile = await liveBlocks();
    const savedHostile = await saveAndParse("color-hostile-saved.html");
    const hostileManifest = savedHostile.parsed.pages[0].blocks;
    const byId = (id) => hostileManifest.find((block) => block.id === id) || {};
    result.colorImportDropsUnknown = !("icon" in byId("x1")) && !("color" in byId("x2")) && !("color" in byId("x3")) && !("icon" in byId("x5")) && !("color" in byId("x6"))
      && byId("x4").icon === "🚧" && byId("x4").color === "orange_background";
    result.colorImportShowsDefaults = hostile.find((block) => block.id === "x1")?.icon === "💡" && hostile.find((block) => block.id === "x5")?.icon === "💡"
      && hostile.find((block) => block.id === "x4")?.bg === "#feecd8" && !hostile.find((block) => block.id === "x2")?.fg;
    result.colorImportRunsNothing = !(await fresh.evaluate(() => window.__pwned)) && !/onerror|url\(https:\/\/example/.test(savedHostile.html.slice(savedHostile.html.indexOf("<body")));
    result.colorImportEvidence = JSON.stringify(hostile.map((block) => [block.id, block.icon, block.fg, block.bg]));

    // 9) Notion の貼り付け: 呼び出しは呼び出し(絵文字と色つき)、ブロックの色はブロックの色に(文中の色にしない)。文中の一部の色は文中の色のまま
    await openLiteral(doc("Notion", [{ id: "e1", type: "paragraph", text: "" }]), "color-notion.html");
    await pasteInto("e1", {
      "text/plain": fixture["text/plain"],
      "text/html": fixture["text/html"],
      "text/_notion-blocks-v3-production": fixture["text/_notion-blocks-v3-production"],
    });
    const notionLive = await liveBlocks();
    const notionSaved = (await saveAndParse("color-notion-saved.html")).parsed.pages[0].blocks;
    const calloutAt = notionSaved.findIndex((block) => block.type === "callout");
    const red = notionSaved.find((block) => block.text === "赤いブロックの文");
    const partly = notionSaved.find((block) => String(block.text || "").includes("ここだけ色つき"));
    result.notionCalloutBecomesCallout = calloutAt >= 0 && notionSaved[calloutAt].icon === "💡" && notionSaved[calloutAt].color === "gray_background"
      && notionSaved[calloutAt + 1]?.type === "bullet" && notionSaved[calloutAt + 1]?.indent === 1 && notionSaved[calloutAt + 1]?.text === "呼び出し(callout)の文"
      && !notionSaved.some((block) => block.type === "quote" && /💡/.test(block.text || ""));
    result.notionBlockColorBecomesBlockColor = red?.color === "red" && !/color/.test(red?.html || "")
      && notionLive.find((block) => block.text === "赤いブロックの文")?.fg === "#c13f2f";
    result.notionInlineColorStaysInline = /color:\s*rgb\(193, 63, 47\)/.test(partly?.html || "") && !("color" in (partly || {}));
    result.notionPasteEvidence = JSON.stringify({ callout: notionSaved.slice(calloutAt, calloutAt + 2), red, partly });
    // 今の形の呼び出し(題名なし・中身は子)で、先頭の段落の子は呼び出しの文に改行でつなぐ。古い形(題名あり)は題名が文。見出しの背景の色も
    const notionBlocks = (records, roots) => JSON.stringify({ blocks: roots.map((id) => ({ blockId: id, blockSubtree: { __version__: 3, block: Object.fromEntries(Object.entries(records).map(([key, value]) => [key, { value: { id: key, alive: true, ...value } }])) } })) });
    await openLiteral(doc("Notion2", [{ id: "e2", type: "paragraph", text: "" }]), "color-notion2.html");
    await pasteInto("e2", {
      "text/plain": "x\ny",
      "text/_notion-blocks-v3-production": notionBlocks({
        n1: { type: "callout", content: ["n2", "n3", "n4"], format: { callout_version: 2, page_icon: "🔥", block_color: "yellow_background" } },
        n2: { type: "text", properties: { title: [["1行目の", []], ["太字", [["b"]]]] } },
        n3: { type: "text", properties: { title: [["2行目"]] } },
        n4: { type: "bulleted_list", properties: { title: [["中の箇条書き"]] } },
        n5: { type: "callout", properties: { title: [["古い形の呼び出し"]] }, format: { page_icon: "https://example.com/icon.png" } },
        n6: { type: "sub_header", properties: { title: [["青い背景の見出し"]] }, format: { block_color: "blue_background" } },
        n7: { type: "text", properties: { title: [["知らない色"]] }, format: { block_color: "teal" } },
      }, ["n1", "n5", "n6", "n7"]),
    });
    const notion2 = (await saveAndParse("color-notion2-saved.html")).parsed.pages[0].blocks;
    const merged = notion2.find((block) => block.type === "callout" && block.icon === "🔥");
    const old = notion2.find((block) => block.text === "古い形の呼び出し");
    result.notionCalloutMergesParagraphs = merged?.text === "1行目の太字\n2行目" && /<b>太字<\/b>/.test(merged?.html || "") && merged?.color === "yellow_background"
      && notion2[notion2.indexOf(merged) + 1]?.type === "bullet" && notion2[notion2.indexOf(merged) + 1]?.indent === 1;
    result.notionOldCalloutUsesTitle = old?.type === "callout" && !("icon" in old);
    result.notionHeadingBackground = notion2.find((block) => block.text === "青い背景の見出し")?.color === "blue_background"
      && notion2.find((block) => block.type === "heading2")?.text === "青い背景の見出し"
      && !("color" in (notion2.find((block) => block.text === "知らない色") || { color: 1 }));
    result.notionCalloutEvidence = JSON.stringify(notion2.map((block) => [block.type, block.indent || 0, block.text, block.icon, block.color]));

    // 10) ほかのページの HTML の <aside> は呼び出しになる(段落はまとめる)
    await openLiteral(doc("aside", [{ id: "e3", type: "paragraph", text: "" }]), "color-aside.html");
    await pasteInto("e3", { "text/plain": "注意\n2行目\n後ろ", "text/html": "<aside><p>注意</p><p>2行目</p></aside><p>後ろ</p>" });
    const asideLive = await liveBlocks();
    const asideSaved = (await saveAndParse("color-aside-saved.html")).parsed.pages[0].blocks;
    result.htmlAsideBecomesCallout = asideLive[0]?.type === "callout" && asideSaved[0]?.type === "callout" && asideSaved[0]?.text === "注意\n2行目"
      && asideSaved[1]?.type === "paragraph" && asideSaved[1]?.text === "後ろ" && asideSaved.length === 2;
    result.htmlAsideEvidence = JSON.stringify(asideSaved);

    // 11) ロックしたページでは、色も絵文字も変えられない
    await openLiteral({ pages: [{ id: "L", title: "ロック", locked: true, blocks: [
      { id: "l1", type: "callout", text: "ロックした呼び出し" }, { id: "l2", type: "paragraph", text: "ロックした段落" },
    ] }], fonts: [], attachments: [] }, "color-locked.html");
    await fresh.locator(rowOf("l1") + " > .callout-icon").click();
    await fresh.waitForTimeout(200);
    const lockedPicker = await fresh.evaluate(() => Boolean(document.querySelector("#callout-icon-picker:not([hidden])")));
    const lockedIcon = await fresh.evaluate((selector) => document.querySelector(selector + " > .callout-icon")?.textContent, rowOf("l1"));
    // ロック中はつまみが出ない(メニューの「色」まで届かない)
    const gripHidden = !(await fresh.locator(rowOf("l2") + " .drag-grip").isVisible());
    result.colorLockedPageUnchanged = !lockedPicker && lockedIcon === "💡" && gripHidden;

    result.calloutColorNoPageErrors = pageErrors.length === 0;
    result.calloutColorPageErrorEvidence = pageErrors.join(" | ");
    return result;
  } finally {
    await fresh.close();
  }
}
