// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { PORT, insertBlock } from "../lib.mjs";

// ---- リストのマーカーの左端そろえ ----
// ユーザーの要求は「『・あいうえお』と『かきくけこ』で **『・』と『か』が同じ位置**」。
// つまりマーカーの左端が通常段落の本文左端に一致し、リストの本文はマーカーのぶん右へ出る。
// (v124 では「本文の左端どうしをそろえる」と読み違えていた。マーカーはガターへぶら下げず、
// 本文カラムの中に入る。)引用は border-left の意匠があるため対象外。保存HTMLも同じ規則(P7)。
export default async function listAlignSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("ALIGN plain text");
    await insertBlock(fresh);
    await fresh.keyboard.type("- ");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.type("ALIGN bullet text");
    await insertBlock(fresh);
    await fresh.keyboard.type("1. ");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.type("ALIGN numbered text");
    await insertBlock(fresh);
    await fresh.keyboard.type("[] ");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.type("ALIGN todo text");
    await insertBlock(fresh, "toggle list");
    await fresh.keyboard.type("ALIGN toggle text");
    await insertBlock(fresh);
    await fresh.keyboard.type("> ");
    await fresh.waitForTimeout(150);
    await fresh.keyboard.type("ALIGN quote text");
    await fresh.waitForTimeout(300);

    const rows = await fresh.evaluate(() => [...document.querySelectorAll("#blocks .block")]
      .map((row) => {
        const text = row.querySelector(".block-content")?.textContent || "";
        return text.startsWith("ALIGN") ? { key: text.split(" ")[1], id: row.dataset.id } : null;
      })
      .filter(Boolean));
    const seen = {};
    for (const row of rows) {
      // ハンドルはホバーで現れる。実際に使う状況で当たり判定を測る。
      await fresh.hover(`#blocks .block[data-id="${row.id}"] .block-content`);
      await fresh.waitForTimeout(80);
      seen[row.key] = await fresh.evaluate((id) => {
        const block = document.querySelector(`#blocks .block[data-id="${id}"]`);
        const base = block.getBoundingClientRect();
        const rel = (value) => Math.round((value - base.left) * 10) / 10;
        // 「実際に描かれた文字」の左端。箱ではなく絵で見るのは、ユーザーが見ているのが絵だから。
        const inkLeft = (node) => {
          if (!node) return null;
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          let text = walker.nextNode();
          while (text && !text.nodeValue.trim()) text = walker.nextNode();
          if (!text) return null;
          const range = document.createRange();
          range.selectNodeContents(text);
          return rel(range.getBoundingClientRect().left);
        };
        const hitName = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!hit) return "none";
          return (typeof hit.className === "string" && hit.className.split(" ")[0]) || hit.tagName.toLowerCase();
        };
        const content = block.querySelector(".block-content");
        const marker = block.querySelector(".bullet-marker, .numbered-marker, .todo-box, .toggle-caret");
        const insert = block.querySelector(".insert-block");
        const grip = block.querySelector(".drag-grip");
        const markerRect = marker?.getBoundingClientRect();
        return {
          textLeft: inkLeft(content),
          markerLeft: markerRect ? rel(markerRect.left) : null,
          markerRight: markerRect ? rel(markerRect.right) : null,
          markerWidth: markerRect ? Math.round(markerRect.width) : null,
          markerHeight: markerRect ? Math.round(markerRect.height) : null,
          // ToDo はチェックボックス(文字ではない)なので、箱の左端がそのまま絵の左端。
          markerInk: marker && marker.tagName === "INPUT" ? rel(markerRect.left) : inkLeft(marker),
          hitMarker: hitName(marker),
          hitInsert: hitName(insert),
          hitGrip: hitName(grip),
        };
      }, row.id);
    }
    result.listAlignGeometry = seen;

    const listKinds = ["bullet", "numbered", "todo", "toggle"];
    // マーカーの箱の左端は、通常段落の本文カラムの左端と同じ位置。
    // **トグルだけは例外**: 三角のグリフが文字枠の中で右寄りに描かれるため、
    // 箱ごと左サイドベアリングぶん左へずらして**絵**をそろえている(v127)。
    // どれだけずらすかは字形の都合なので、ここでは「本文カラムの左端より左、ただし
    // 行き過ぎない範囲」だけを見る。**本当の判定は下のインクのテスト**。
    // v173: • も字形の左余白ぶん箱を戻す(余白はフォントで違い、測った値を使う)ので、トグルと同じく
    // 「本文カラムの左端の近く」だけを見る。
    result.listMarkersAlignWithParagraphText = ["numbered", "todo"].every((k) => {
      const row = seen[k];
      return Boolean(row && row.markerLeft !== null) && row.markerLeft === seen.plain.textLeft;
    })
      && ["bullet", "toggle"].every((k) => Boolean(seen[k] && seen[k].markerLeft !== null)
        && seen[k].markerLeft <= seen.plain.textLeft
        && seen[k].markerLeft >= seen.plain.textLeft - 8);
    // **実際に塗られた絵(インク)の左端**をそろえる。Range の rect が返すのは文字ボックス
    // (送り幅)であって絵の外接矩形ではないため、v126 ではトグルの 6px のずれを
    // 「0〜1px の差」と誤って報告していた(ユーザーの目には明確なずれとして見えていた)。
    // ここは Canvas の TextMetrics(actualBoundingBoxLeft)で絵の左端を測る。
    // ToDo は文字ではなくチェックボックスなので対象外(箱そのものが絵)。
    const inkAlign = await fresh.evaluate(() => {
      const inkLeftAbs = (el, text) => {
        if (!el) return null;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const style = getComputedStyle(el);
        ctx.font = style.font || (style.fontSize + " " + style.fontFamily);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const metrics = ctx.measureText(text);
        return Math.round((el.getBoundingClientRect().left - metrics.actualBoundingBoxLeft) * 100) / 100;
      };
      const rows = [...document.querySelectorAll("#blocks .block")];
      const rowOf = (needle) => rows.find((row) => (row.querySelector(".block-content")?.textContent || "") === needle);
      const plain = rowOf("ALIGN plain text");
      const content = plain.querySelector(".block-content");
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !node.nodeValue.trim()) node = walker.nextNode();
      const range = document.createRange();
      range.selectNodeContents(node);
      const style = getComputedStyle(content);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = style.font || (style.fontSize + " " + style.fontFamily);
      const plainInk = Math.round((range.getBoundingClientRect().left
        - ctx.measureText(node.nodeValue).actualBoundingBoxLeft) * 100) / 100;
      const bulletRow = rows.find((row) => row.classList.contains("type-bullet"));
      const toggleRow = rows.find((row) => row.classList.contains("type-toggle"));
      const numberedRow = rows.find((row) => row.classList.contains("type-numbered"));
      const markerInk = (row, selector) => {
        const marker = row?.querySelector(selector);
        return marker ? inkLeftAbs(marker, marker.textContent) : null;
      };
      // v174: 点と三角は図形。絵の外接矩形(円の要素・SVG の path)の左端がそのまま絵の左端。
      const shapeInk = (row, selector) => {
        const shape = row?.querySelector(selector);
        return shape ? Math.round(shape.getBoundingClientRect().left * 100) / 100 : null;
      };
      return {
        plainInk,
        bulletInk: shapeInk(bulletRow, ".bullet-marker .bullet-dot"),
        toggleInk: shapeInk(toggleRow, ".toggle-caret svg path"),
        numberedInk: markerInk(numberedRow, ".numbered-marker"),
      };
    });
    result.markerInkGeometry = inkAlign;
    // 許容差 2px は字形の余白の丸め。6px ずれていたトグルはここで捕まる。
    result.listMarkerInkMatchesParagraphText = inkAlign.plainInk !== null
      && ["bulletInk", "toggleInk", "numberedInk"].every((key) =>
        inkAlign[key] !== null && Math.abs(inkAlign[key] - inkAlign.plainInk) <= 2);
    // ユーザーは「箇条書きの点は完璧」と言っている。トグルの三角が**その • と同じ見え方**に
    // なっていることを、基準を • にして固定する(v127 の要求そのもの)。
    result.toggleInkMatchesBulletInk = inkAlign.toggleInk !== null && inkAlign.bulletInk !== null
      && Math.abs(inkAlign.toggleInk - inkAlign.bulletInk) <= 1;
    // リストの本文はマーカーの右隣に出る(マーカーと重ならない)。
    result.listTextSitsRightOfMarker = listKinds.every((k) => {
      const row = seen[k];
      return Boolean(row) && row.textLeft >= row.markerRight && row.textLeft > seen.plain.textLeft;
    });
    // ガターにはハンドルが住んでいる。マーカーが本文カラムへ移ったので、もう取り合いにならない。
    result.listMarkersKeepHandleClickable = ["plain", ...listKinds].every((k) => {
      const row = seen[k];
      return Boolean(row) && row.hitInsert === "insert-block" && row.hitGrip === "drag-grip";
    });
    // 押せる必要があるマーカーは、自分の真ん中で自分が勝つ。
    result.clickableMarkersWinTheirOwnCenter = seen.todo?.hitMarker === "todo-box"
      && seen.toggle?.hitMarker === "toggle-caret";
    // トグルの三角は押すもの。当たり判定は WCAG 2.2 Target Size の最小 24x24 CSS px 以上
    // (v124 ではガターとの食い合いで 14px まで縮めていた。本文カラムへ移って回復できた)。
    result.toggleCaretMeetsMinimumTargetSize = seen.toggle?.markerWidth >= 24
      && seen.toggle?.markerHeight >= 24;
    // 引用は対象外。border(3px) + padding(14px) - 既定 padding(6px) = 11px 右のまま。
    result.quoteKeepsItsOwnIndent = Boolean(seen.quote)
      && seen.quote.textLeft - seen.plain.textLeft === 11;

    // 番号が長くなっても、マーカーの左端は動かない(伸びるぶんは右へ出て、本文も一緒に動く)。
    // 箱の幅は app.js が `Math.max(24, 文字数 * 8)px` で決めるので、2桁では広がらない。
    // 階層番号("1.1.1"=5文字 → 40px)なら数ブロックで届く。
    await fresh.locator("#blocks .block-content").last().click();
    await insertBlock(fresh);
    await fresh.keyboard.type("1. WIDE one");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("WIDE two");
    await fresh.keyboard.press("Enter");
    await fresh.keyboard.press("Tab");
    await fresh.keyboard.type("WIDE three");
    await fresh.waitForTimeout(300);
    const widths = await fresh.evaluate(() => {
      const read = (label) => {
        const row = [...document.querySelectorAll("#blocks .block.type-numbered")]
          .find((item) => (item.querySelector(".block-content")?.textContent || "") === label);
        if (!row) return null;
        const base = row.getBoundingClientRect();
        const rel = (value) => Math.round((value - base.left) * 10) / 10;
        const marker = row.querySelector(".numbered-marker");
        const content = row.querySelector(".block-content");
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        const range = document.createRange();
        range.selectNodeContents(node);
        const box = marker.getBoundingClientRect();
        return {
          text: marker.textContent,
          markerLeft: rel(box.left),
          markerRight: rel(box.right),
          textLeft: rel(range.getBoundingClientRect().left),
        };
      };
      return { shallow: read("WIDE one"), deep: read("WIDE three") };
    });
    result.numberedMarkerWidthGeometry = widths;
    result.numberedMarkerKeepsItsLeftEdge = Boolean(widths.shallow && widths.deep)
      && widths.deep.text.length > widths.shallow.text.length
      && widths.deep.markerLeft === widths.shallow.markerLeft
      && widths.deep.markerRight > widths.shallow.markerRight
      && widths.deep.textLeft > widths.shallow.textLeft
      && widths.deep.textLeft >= widths.deep.markerRight;

    // 字下げしても、ブロックの中での規則(マーカー左端 = 本文カラムの左端)は同じ。
    await fresh.evaluate(() => {
      const editable = [...document.querySelectorAll("#blocks .block-content")]
        .find((item) => item.textContent === "ALIGN bullet text");
      if (!editable) return;
      editable.focus();
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(true); // ブロックの先頭で Tab(v176 から途中の Tab はタブ文字)
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await fresh.keyboard.press("Tab");
    await fresh.waitForTimeout(250);
    const nested = await fresh.evaluate(() => {
      const rowOf = (text) => [...document.querySelectorAll("#blocks .block")]
        .find((row) => (row.querySelector(".block-content")?.textContent || "") === text);
      const bullet = rowOf("ALIGN bullet text");
      const plain = rowOf("ALIGN plain text");
      if (!bullet || !plain) return null;
      const inkLeft = (node) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text = walker.nextNode();
        while (text && !text.nodeValue.trim()) text = walker.nextNode();
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getBoundingClientRect().left;
      };
      const markerRect = bullet.querySelector(".bullet-marker").getBoundingClientRect();
      return {
        markerRel: Math.round((markerRect.left - bullet.getBoundingClientRect().left) * 10) / 10,
        plainTextRel: Math.round((inkLeft(plain.querySelector(".block-content")) - plain.getBoundingClientRect().left) * 10) / 10,
        markerAbs: markerRect.left,
        plainTextAbs: inkLeft(plain.querySelector(".block-content")),
        indent: getComputedStyle(bullet).getPropertyValue("--indent").trim(),
      };
    });
    result.nestedListKeepsRelativeAlignment = Boolean(nested)
      && nested.indent === "1"
      // v173: • の箱は字形の左余白ぶん本文の左端より左にある。字下げ前の • と同じ相対位置かで見る。
      && nested.markerRel === seen.bullet?.markerLeft
      && nested.markerAbs > nested.plainTextAbs;

    // 保存HTML側も同じ規則(P7)。
    const exportedAlign = await fresh.evaluate(() => window.SingleHtmlFormat.buildPortableHtml({
      title: "align",
      blocks: [
        { id: "p1", type: "paragraph", text: "plain" },
        { id: "b1", type: "bullet", text: "bullet" },
        { id: "n1", type: "numbered", text: "numbered" },
        { id: "t1", type: "todo", text: "todo", checked: false },
        { id: "g1", type: "toggle", text: "toggle" },
        { id: "q1", type: "quote", text: "quote" },
      ],
      fonts: [],
      attachments: [],
    }));
    const viewer = await context.newPage();
    try {
      await viewer.setContent(exportedAlign, { waitUntil: "domcontentloaded" });
      const exportedLefts = await viewer.evaluate(() => {
        const inkLeft = (root, skipClass) => {
          if (!root) return null;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode();
          while (node && (!node.nodeValue.trim()
            || (skipClass && node.parentElement?.classList.contains(skipClass)))) {
            node = walker.nextNode();
          }
          if (!node) return null;
          const range = document.createRange();
          range.selectNodeContents(node);
          return Math.round(range.getBoundingClientRect().left);
        };
        // ::before で描くマーカーは要素ではないので rect が取れない。要素の左端で代用すると
        // **マーカーを動かしても気づけない**(赤確認Gで判明)。使った位置(left)を読んで足す。
        const pseudoMarkerLeft = (el) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const left = Number.parseFloat(getComputedStyle(el, "::before").left);
          return Math.round(rect.left + (Number.isFinite(left) ? left : 0));
        };
        const paragraph = [...document.querySelectorAll("main p")]
          .find((node) => !node.className && node.textContent.trim() === "plain");
        const li = document.querySelector("main ul > li");
        const summary = document.querySelector("main details.toggle > summary");
        const todo = document.querySelector("main p.todo");
        const numbered = document.querySelector("main .numbered-marker");
        return {
          plainText: inkLeft(paragraph),
          // ::before のマーカーは要素の左端(padding の外)に置いている。
          bulletMarker: pseudoMarkerLeft(li),
          toggleMarker: pseudoMarkerLeft(summary),
          todoMarker: todo ? Math.round(todo.querySelector(".todo-mark").getBoundingClientRect().left) : null,
          numberedMarker: numbered ? Math.round(numbered.getBoundingClientRect().left) : null,
          bulletText: inkLeft(li),
          // 「・」の縦位置。擬似要素は rect が取れないので、使った top の値を読む。
          bulletMarkerTop: li ? Number.parseFloat(getComputedStyle(li, "::before").top) : null,
          bulletTextCenter: (() => {
            if (!li) return null;
            const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
            const node = walker.nextNode();
            const range = document.createRange();
            range.selectNodeContents(node);
            const box = range.getBoundingClientRect();
            return Math.round((box.top + box.height / 2 - li.getBoundingClientRect().top) * 10) / 10;
          })(),
          quoteText: inkLeft(document.querySelector("main .quote")),
        };
      });
      result.exportedListAlignGeometry = exportedLefts;
      // 箱の位置。トグルだけは絵をそろえるために左へずらしてある(エディタと同じ理由)。
      // v173: • もトグルと同じく、字形の左余白ぶん箱を戻す(エディタと同じ)。
      result.exportedMarkersAlignWithParagraphText = exportedLefts.plainText !== null
        && ["todoMarker", "numberedMarker"].every((key) =>
          exportedLefts[key] !== null && Math.abs(exportedLefts[key] - exportedLefts.plainText) <= 1)
        && ["bulletMarker", "toggleMarker"].every((key) => exportedLefts[key] !== null
          && exportedLefts[key] <= exportedLefts.plainText + 1
          && exportedLefts[key] >= exportedLefts.plainText - 8);
      result.exportedListTextSitsRightOfMarker = exportedLefts.bulletText !== null
        && exportedLefts.bulletText > exportedLefts.bulletMarker;
      // 保存HTMLでも**絵の左端**でそろえる(エディタと同じ測り方。P7)。
      const exportedInk = await viewer.evaluate(() => {
        const inkOf = (el, text, pseudo) => {
          if (!el) return null;
          const style = getComputedStyle(el, pseudo || undefined);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          ctx.font = style.font || (style.fontSize + " " + style.fontFamily);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          const metrics = ctx.measureText(text);
          const left = pseudo ? Number.parseFloat(style.left) || 0 : 0;
          return Math.round((el.getBoundingClientRect().left + left
            - metrics.actualBoundingBoxLeft) * 100) / 100;
        };
        const paragraph = [...document.querySelectorAll("main p")]
          .find((node) => !node.className && node.textContent.trim() === "plain");
        const summary = document.querySelector("main details.toggle > summary");
        const li = document.querySelector("main ul > li");
        return {
          plainInk: inkOf(paragraph, paragraph ? paragraph.textContent : "", null),
          // v174: 三角(mask の図形)と点(円)は ::before の箱の左端から描く。
          toggleInk: summary ? Math.round((summary.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(summary, "::before").left)) * 100) / 100 : null,
          bulletInk: li ? Math.round((li.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(li, "::before").left)) * 100) / 100 : null,
        };
      });
      result.exportedMarkerInkGeometry = exportedInk;
      result.exportedMarkerInkMatchesParagraphInk = exportedInk.plainInk !== null
        && ["toggleInk", "bulletInk"].every((key) =>
          exportedInk[key] !== null && Math.abs(exportedInk[key] - exportedInk.plainInk) <= 2);
      // 「・」は本文1行目の中心に来ること。top に em を使うと擬似要素自身の 28px で解決され
      // 21.8px となり、本文の中心(約11.6px)より約10px 低い位置に落ちていた(実測)。
      result.exportedBulletMarkerSitsOnFirstLine = exportedLefts.bulletMarkerTop !== null
        && Math.abs(exportedLefts.bulletMarkerTop - exportedLefts.bulletTextCenter) <= 2;
      // 保存HTMLでも引用だけは右へ寄る。寄り幅はエディタと同じ 11px(border 3px + padding 14px - 既定の余白 6px)。
      // v182 までは保存HTMLだけ 17px で、エディタとずれていた(v190 でそろえた。P7。layoutParitySuite)。
      result.exportedQuoteKeepsItsOwnIndent = exportedLefts.quoteText !== null
        && exportedLefts.quoteText - exportedLefts.plainText === 11;
    } finally {
      await viewer.close();
    }

    return result;
  } finally {
    await fresh.close();
  }
}
