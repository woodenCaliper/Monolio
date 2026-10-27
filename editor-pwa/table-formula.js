// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// 表の計算(Issue #207 で app.js から分けた)。式の読み方・計算・関数・参照の書き方と、表の計算の「1回の通し」。
// 形: 普通のスクリプトが window.TableFormula に載せる(document-format.js・document-style.js と同じ。理由は HANDOVER §4.51)。
//   - 表を読まないもの(列の名前・参照の書き方・値の比べ方など)は、そのまま載せる
//   - 表を読むもの(式の計算・セルの値・範囲の列挙)は create({ tableRows }) が返す道具にまとめる。tableRows(block) は表の行を
//     整えて返す app.js の関数(結合の形・列の数を直すのは表の編集の決まりなので app.js に残す)。通しの覚えは道具ごとに持つ
// DOM と画面の状態(編集中のセルなど)には触れない。
// 読み込みの順: document-format.js(数の読み方・見せ方 fmt.parseTableNumberText など)の後、chart.js・app.js の前。
window.TableFormula = (() => {
  const fmt = window.SingleHtmlFormat;

  // ---- 表の数式 ----
  // Excel と同じく "=" で始まるセルを式として扱う。対応するのは四則演算・
  // 累乗 ^・剰余 %・括弧・単項マイナス、そして SUM / AVERAGE / MIN / MAX。
  // セルの指定は A1 形式、範囲は A1:B3 形式。

  function columnLabel(index) {
    let label = "";
    let value = index;
    do {
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    return label;
  }

  function columnIndexFromLabel(label) {
    let index = 0;
    for (const character of String(label).toUpperCase()) {
      index = index * 26 + (character.charCodeAt(0) - 64);
    }
    return index - 1;
  }

  // 式の中の全角の英数字・記号(U+FF01〜U+FF5E)と全角の空白を半角へ揃える(v213)。以前は「＝１＋２」が文字のまま、
  // 「=A１+1」が #ERR になっていた。v232 で式に文字("…")が書けるようになったので、文字の中は揃えない(全角の ＂ は囲みとして読む)。
  // 保存する文字は書き換えない(計算と、参照を書き直す操作のときだけ使う)。
  const FULL_WIDTH_ASCII = /[\uFF01-\uFF5E\u3000]/;

  function halfWidthFormula(text) {
    let inString = false;
    let out = "";
    for (const character of String(text)) {
      if (character === '"' || character === "\uFF02") {
        inString = !inString;
        out += '"';
      } else if (!inString && FULL_WIDTH_ASCII.test(character)) {
        out += character === "\u3000" ? " " : String.fromCharCode(character.charCodeAt(0) - 0xFEE0);
      } else {
        out += character;
      }
    }
    return out;
  }

  // 式の文字("…")の外だけに置き換えを掛ける(参照の書き直しが "A1" のような文字を書き換えないように。v232)。
  function replaceOutsideFormulaStrings(text, replacer) {
    return String(text).split(/("(?:[^"]|"")*"?)/).map((part, index) => (index % 2 ? part : replacer(part))).join("");
  }

  // 式の参照を書き直す操作(行・列の挿入削除の追随とフィル)を、全角の式にも効かせる(v213)。全角の文字があれば半角へ
  // 揃えてから書き直し、参照が動いたときだけその文字を返す。動かなければ元の文字のまま(保存する文字を黙って変えない)。
  function rewriteFormulaRefs(text, rewrite) {
    const source = String(text);
    if (!FULL_WIDTH_ASCII.test(source)) return rewrite(source);
    const normalized = halfWidthFormula(source);
    const rewritten = rewrite(normalized);
    return rewritten === normalized ? source : rewritten;
  }

  // セルの文字を数として読む(v213)。ふつうの10進の数(符号・小数点・指数、桁区切りのカンマ)だけを数にする。
  // 以前は Number() で読んでいたので、「0x10」「0b11」「0o7」が 16・3・7 として計算・グラフ・フィルに入っていた。
  // 数でなければ null。
  // 全角の数字・符号・小数点・カンマ(日本語入力の既定で打つ「１２」「－３．５」「１，０００」)も数として読む(v221)。
  // v213 で全角の「＝」の式は読めるようにしたが、値の側は全角のままでは数にならず、=A2*2 が 0、SUM が素通りしていた。
  // 半角へ揃えるのは読むときだけで、セルの表示・保存する文字は打ったまま。
  // 読み方は保存HTMLの数の見せ方(fmt.formatTableNumber)と共有する(v232。document-format.js へ移した)。
  const parseTableNumberText = fmt.parseTableNumberText;

  // 式の中のセル参照。A1 / A1:B2 / A:C(列まるごと) / 2:4(行まるごと) の4形。
  // remapTableFormulaRefs(構造変更の追随)と shiftFormulaRefs(フィルの相対移動)で
  // 共有する。列・行まるごと参照は「生きた参照」で、評価のたびに現在の表の形へ
  // 解決される(rangeValues 参照)。
  // $ は絶対参照の印(v232。$A$1 / A$1 / $A1、$A:$A、$2:$2)。フィルで動かさない向きを決めるだけで、行・列の挿入削除・入れ替えには
  // ついていく(Excel と同じ)。
  // 数の直後(1E3 の E3)は参照ではない(v248。Issue #86。式で指数を読むようにしたので、行の挿入などで書き換えない)。
  const TABLE_REF_PATTERN = /(?<![\d.])(?:(?<fromColAbs>\$?)(?<fromLabel>[A-Za-z]+)(?<fromRowAbs>\$?)(?<fromRow>\d+)(?<colon>\s*:\s*)(?<toColAbs>\$?)(?<toLabel>[A-Za-z]+)(?<toRowAbs>\$?)(?<toRow>\d+)|(?<colFromAbs>\$?)(?<colFrom>[A-Za-z]+)(?<colColon>\s*:\s*)(?<colToAbs>\$?)(?<colTo>[A-Za-z]+)(?![A-Za-z0-9])|(?<rowFromAbs>\$?)(?<rowFrom>\d+)(?<rowColon>\s*:\s*)(?<rowToAbs>\$?)(?<rowTo>\d+)(?![0-9])|(?<colAbs>\$?)(?<label>[A-Za-z]+)(?<rowAbs>\$?)(?<digits>\d+))/g;

  // 手元の rows から探す版。以前の tableRows() はセルを作り直して block.rows を差し替えた
  // ため、構造操作の途中で tableCellOrigin を呼ぶと返るセルが手元の rows と別物に
  // なり、span への変更が最後の block.rows = rows で捨てられた（結合セルをまたぐ
  // 列挿入で表が壊れる実バグの原因）。いまは tableRows() が作り直さない(Issue #198)ので
  // 同じセルが返るが、構造操作の途中(形を直す前の rows)では、こちらを使う。
  function cellOriginInRows(rows, rowIndex, cellIndex) {
    for (let r = rowIndex; r >= 0; r -= 1) {
      for (let c = cellIndex; c >= 0; c -= 1) {
        const cell = rows[r]?.[c];
        if (!cell || cell.covered) continue;
        if (r + cell.rowSpan > rowIndex && c + cell.colSpan > cellIndex) return { rowIndex: r, cellIndex: c, cell };
      }
    }
    return null;
  }

  // ---- 表のセル範囲のコピー・切り取り・削除・貼り付け(v213) ----
  // v208 までは範囲を選んでも、Ctrl+C はクリップボードを変えず、Delete / Backspace は先頭のセル1つだけを消し、
  // 表計算からの貼り付け(タブ区切り)は1つのセルへタブと改行ごと入っていた。表計算(Excel・スプレッドシート)に合わせる。
  // 範囲が働くのは、2セル以上を選んでいて、操作がその表のセルの中で起きたときだけ。範囲を選んだあとセルへ文字を
  // 打つと範囲は解く(セルの input。打ち間違いを Backspace で直したら範囲が丸ごと消えた、を起こさないため)。
  // 範囲(fromRow / fromCell と toRow / toCell。どちらが先でもよい)の左上・右下。端をそろえるのはどこもこれを使う(Issue #206)。
  function tableRangeRect(range) {
    return {
      top: Math.min(range.fromRow, range.toRow),
      bottom: Math.max(range.fromRow, range.toRow),
      left: Math.min(range.fromCell, range.toCell),
      right: Math.max(range.fromCell, range.toCell),
    };
  }

  // アンカー（押したセル）と現在のセルから参照文字列を作る。同じセルなら
  // 単一参照、離れていれば左上:右下 に正規化した範囲参照（Excel と同じ）。
  function formulaRangeRef(anchorRow, anchorCell, row, cell) {
    if (anchorRow === row && anchorCell === cell) return columnLabel(cell) + String(row + 1);
    const { top, bottom, left, right } = tableRangeRect({ fromRow: anchorRow, fromCell: anchorCell, toRow: row, toCell: cell });
    return columnLabel(left) + String(top + 1) + ":" + columnLabel(right) + String(bottom + 1);
  }

  // 計算のエラーのうち、覚えてよいもの(v221)。この表の語彙のエラーだけ。スタックの溢れ(RangeError)などは
  // 辿り始めた深さで変わるので覚えない。
  const TABLE_FORMULA_ERRORS = new Set(["PARSE", "REF", "DIV0", "NAME", "CYCLE", "VALUE"]);

  // 使える関数と引数の数(v232 で COUNT〜SUMIF を足した。知らない名前は #NAME 相当で、構文を読む段で出す)。
  const TABLE_FUNCTIONS = {
    SUM: { min: 0, max: 255 },
    AVERAGE: { min: 0, max: 255 },
    MIN: { min: 0, max: 255 },
    MAX: { min: 0, max: 255 },
    COUNT: { min: 1, max: 255 },
    COUNTA: { min: 1, max: 255 },
    ROUND: { min: 1, max: 2 },
    ROUNDUP: { min: 1, max: 2 },
    ROUNDDOWN: { min: 1, max: 2 },
    INT: { min: 1, max: 1 },
    ABS: { min: 1, max: 1 },
    IF: { min: 2, max: 3 },
    IFERROR: { min: 2, max: 2 },
    AND: { min: 1, max: 255 },
    OR: { min: 1, max: 255 },
    NOT: { min: 1, max: 1 },
    TRUE: { min: 0, max: 0 },
    FALSE: { min: 0, max: 0 },
    COUNTIF: { min: 2, max: 2 },
    SUMIF: { min: 2, max: 3 },
  };

  // 何も入っていないセルの値(数としては 0、文字としては "")。
  const EMPTY_VALUE = Object.freeze({ empty: true });

  // 2つの値の大小(Excel と同じ順): 数 < 文字 < 真偽。文字は大文字・小文字を区別しない。空は相手に合わせて 0 / "" / FALSE。
  function compareTableValues(a, b) {
    const fill = (value, other) => {
      if (value !== EMPTY_VALUE) return value;
      if (typeof other === "string") return "";
      if (typeof other === "boolean") return false;
      return 0;
    };
    const left = fill(a, b);
    const right = fill(b, a);
    const rank = (value) => (typeof value === "number" ? 0 : typeof value === "string" ? 1 : 2);
    if (rank(left) !== rank(right)) return rank(left) - rank(right);
    if (typeof left === "string") {
      const x = left.toLowerCase();
      const y = right.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    // 数は有効数字15桁で比べる(v248。Issue #84。Excel と同じ。0.1+0.2 と 0.3 は表示が同じなのに等しくないと判定されていた)。
    const x = Number(Number(left).toPrecision(15));
    const y = Number(Number(right).toPrecision(15));
    return x < y ? -1 : x > y ? 1 : 0;
  }

  // COUNTIF・SUMIF の条件を、セルの値を受けて合うかを返す関数にする(Excel と同じ読み方)。
  // 数(60)・比べる記号つき(">=60" "<>済")・文字("済"。* と ? の当てはめ、~ で記号そのもの)・空("" は空のセル、"<>" は空でないセル)。
  function tableCriteria(criteria) {
    let op = "=";
    let operand = criteria;
    if (typeof criteria === "string") {
      const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(criteria);
      op = m[1] || "=";
      const rest = m[2];
      const number = parseTableNumberText(rest);
      const word = rest.trim().toUpperCase();
      operand = rest === "" ? EMPTY_VALUE : number !== null ? number : word === "TRUE" ? true : word === "FALSE" ? false : rest;
    } else if (criteria === EMPTY_VALUE) {
      operand = EMPTY_VALUE;
    }
    const isEmpty = (value) => value === EMPTY_VALUE || value === "";
    if (operand === EMPTY_VALUE) {
      if (op === "=") return isEmpty;
      if (op === "<>") return (value) => !isEmpty(value);
      return () => false;
    }
    if (typeof operand === "string") {
      const pattern = new RegExp("^" + operand.replace(/~([*?~])|([*?])|([.+^$|()[\]{}\\])/g, (all, escaped, wild, special) => {
        if (escaped) return "\\" + escaped;
        if (wild) return wild === "*" ? "[\\s\\S]*" : "[\\s\\S]";
        return "\\" + special;
      }) + "$", "i");
      if (op === "=") return (value) => typeof value === "string" && pattern.test(value);
      if (op === "<>") return (value) => !(typeof value === "string" && pattern.test(value));
    }
    // 数・真偽・文字の大小。種類の違う値は合わない(<> だけは合う)。
    return (value) => {
      const sameKind = typeof value === typeof operand;
      if (!sameKind || value === EMPTY_VALUE) return op === "<>";
      const order = compareTableValues(value, operand);
      if (op === "=") return order === 0;
      if (op === "<>") return order !== 0;
      if (op === "<") return order < 0;
      if (op === ">") return order > 0;
      if (op === "<=") return order <= 0;
      return order >= 0;
    };
  }

  // ROUND・ROUNDUP・ROUNDDOWN。half は四捨五入、up は 0 から遠い方、down は 0 に近い方へ(Excel と同じ)。
  // 2進の誤差で 1.005 が 1.00 にならないよう、10進の文字のまま桁をずらす(fmt.roundHalfAwayFromZero と同じ考え)。
  function roundTableNumber(value, digits, mode) {
    if (!Number.isFinite(value)) return value;
    if (mode === "half") return fmt.roundHalfAwayFromZero(value, digits);
    const sign = value < 0 ? -1 : 1;
    const base = Number(Math.abs(value).toPrecision(15));
    const text = String(base);
    const scaled = text.includes("e") ? base * Math.pow(10, digits) : Number(text + "e" + digits);
    const whole = mode === "up" ? Math.ceil(scaled) : Math.floor(scaled);
    const back = String(whole).includes("e") ? whole / Math.pow(10, digits) : Number(whole + "e" + (-digits));
    return sign * back;
  }

  // 式の結果を文字にする。端数は見やすい桁で丸める。整数はそのまま。
  // ふつうの大きさ(0.0001 以上 1e21 未満)は従来どおり小数 10 桁で丸める(0.1 + 0.2 → 0.3)。
  // それより小さい・大きい値は有効数字 12 桁で丸める(v213)。以前は全部を 1e-10 の位で丸めていたので、
  // =6.626*10^-34 や =1/3000000000000 が 0 に、=2^1000 や =10^299 が(値 × 1e10 があふれて)Infinity になっていた。
  // 中身は document-format.js(v232。保存HTMLの数の見せ方と共有)。
  const formatTableFormulaValue = fmt.formatNumberValue;

  // ---- 表を読む計算の道具 ----
  // tableRows(block): 表の行を整えて返す(app.js)。読み取りはすべて、通しの最初にこれで整えた行から。
  function create({ tableRows }) {
    // ---- 表の計算の「1回の通し」(v221。速さ) ----
    // 以前は式の参照を1つ読むたびに tableRows()(全セルの作り直し)が2〜4回走り、セルの計算結果も覚えていなかった。
    // そのため鎖になった式(累計など)は同じセルを何度も計算し直し、100×20 の表を開くのに 30 秒以上かかっていた。
    // いまは「通し」(表の描画・式の描き直し・グラフ・書き出し・コピー)の間だけ、表ごとに次の2つを持つ:
    //   - rows: 通しの最初に1回だけ tableRows() で整えた行(通しの中の読み取りはすべてこれを読む)
    //   - memo: セルの計算結果(本体の座標の鍵 → { value } か { error })
    // 通しの中では表を書き換えない(読むだけの処理だけを包む)。通しの外で呼ばれたときは、その呼び出しだけの使い捨て。
    // 整えた行を通しをまたいで使い回さない(セルを書き換える経路が数十あり、1つでも漏れると古い値を出すため)。
    // tableRows() は block.rows を作り直さない(Issue #198)ので、通しの途中で誰かが読んでも覚えは生きたまま(以前は読むたびに
    // block.rows が差し替わり、rows の同一性の比較で毎回作り直しになっていた)。行・列の操作で block.rows に別の配列を入れたとき・
    // tableRows() が形を直したときは、覚えを使わない(下の rows の比較と、tableRows() が forgetTableCalc で捨てる)。
    let tableCalcPassDepth = 0;
    let tableCalcPassCache = null;

    function withTableCalcPass(run) {
      if (!tableCalcPassDepth) tableCalcPassCache = new Map();
      tableCalcPassDepth += 1;
      try {
        return run();
      } finally {
        tableCalcPassDepth -= 1;
        if (!tableCalcPassDepth) tableCalcPassCache = null;
      }
    }

    function tableCalc(block) {
      const cached = tableCalcPassCache?.get(block);
      if (cached && cached.rows === block.rows) return cached;
      const calc = { block, rows: tableRows(block), memo: new Map() };
      tableCalcPassCache?.set(block, calc);
      return calc;
    }

    // 半角の "=" で始まるセルは式。全角の "＝" で始まるセルは、半角へ揃えて式として読めるときだけ式(v213。日本語入力の
    // まま打った「＝１＋２」)。「＝以下同様」「＝同上」のような文は、日本語の文書でよく使うので文字のまま(式にすると #ERR に
    // なってしまう)。
    function isTableFormula(text) {
      if (typeof text !== "string") return false;
      const head = text.trim();
      if (head.startsWith("=")) return true;
      return head.startsWith("＝") && isFullWidthFormula(head);
    }

    // 全角の "＝" で始まる文字が、半角へ揃えると式として読めるか(構文の誤り・知らない関数が無い)。読めるかは参照先の
    // 値に依らないので、空の表の上で計算して確かめる。#REF・0 除算などの計算のエラーは「読めた式」(式として #REF などを出す)。
    // 描くたびに呼ばれるので、結果を覚えておく。
    const fullWidthFormulaMemo = new Map();

    function isFullWidthFormula(text) {
      if (fullWidthFormulaMemo.has(text)) return fullWidthFormulaMemo.get(text);
      let valid = true;
      try {
        evaluateTableFormula({ rows: [[{ text: "" }]] }, text);
      } catch (error) {
        valid = error.message !== "PARSE" && error.message !== "NAME";
      }
      if (fullWidthFormulaMemo.size > 1000) fullWidthFormulaMemo.clear();
      fullWidthFormulaMemo.set(text, valid);
      return valid;
    }

    // セルの生の中身。結合で覆われた位置は、覆っているセルの中身を指す。
    function rawTableCellText(block, rowIndex, cellIndex, calc = tableCalc(block)) {
      const origin = cellOriginInRows(calc.rows, rowIndex, cellIndex);
      return origin ? origin.cell.text : "";
    }

    // 式のセル1つを計算した結果({ value } か { error })。鍵(本体の座標)ごとに通しの中で覚える(v221)。
    // 覚えてよい理由: 式の計算に分岐は無く(参照は左から順に全部読む)、CYCLE 以外の結果は「辿っている途中のセル(seen)に
    // 一度も触れなかった」ことを意味するので、どこから辿っても同じ結果になる。CYCLE は辿り始めた位置によって
    // 変わりうる(途中のセルに触れて出た CYCLE は、そのセル単独なら別の結果のことがある)ので、そのセル自身から辿った
    // とき(seen が空)だけ覚える。そのセル単独で CYCLE なら、どこから辿っても CYCLE になる。
    function tableFormulaOutcome(calc, key, raw, seen) {
      const known = calc.memo.get(key);
      if (known) return known;
      const fresh = seen.size === 0;
      seen.add(key);
      let outcome;
      try {
        outcome = { value: evaluateTableFormula(calc.block, raw, seen, calc) };
      } catch (error) {
        outcome = { error };
      } finally {
        seen.delete(key);
      }
      const message = String(outcome.error?.message ?? "");
      const remember = !outcome.error
        || (message === "CYCLE" ? fresh : TABLE_FORMULA_ERRORS.has(message) || message.startsWith("MERGE:"));
      if (remember) calc.memo.set(key, outcome);
      return outcome;
    }

    // 表の中の値(v232): 数・文字・真偽・空(EMPTY_VALUE)。式なら計算した結果。表の外は空。
    function tableCellValue(block, rowIndex, cellIndex, seen, calc = tableCalc(block)) {
      const rows = calc.rows;
      if (rowIndex < 0 || rowIndex >= rows.length) return EMPTY_VALUE;
      if (cellIndex < 0 || cellIndex >= rows[0].length) return EMPTY_VALUE;
      const origin = cellOriginInRows(rows, rowIndex, cellIndex);
      const raw = origin ? origin.cell.text : "";
      if (isTableFormula(raw)) {
        // 循環検出の鍵は「本体(origin)へ正規化した座標」。結合グループは複数の
        // 座標名を持つ1つの論理値なので、別名(メンバー座標)経由の循環も
        // 同じ鍵に写ってここで捕まる。
        const key = origin ? origin.rowIndex + ":" + origin.cellIndex : rowIndex + ":" + cellIndex;
        // 同じセルを辿り直したら循環。無限に回らないよう打ち切る。
        if (seen.has(key)) throw new Error("CYCLE");
        const outcome = tableFormulaOutcome(calc, key, raw, seen);
        if (outcome.error) throw outcome.error;
        return outcome.value;
      }
      if (!String(raw ?? "").trim()) return EMPTY_VALUE;
      const number = parseTableNumberText(raw);
      return number !== null ? number : String(raw);
    }

    // 表の中の数値。式なら計算した結果を返す。数値でなければ null(文字・真偽・空・計算できない数)。
    function tableCellNumber(block, rowIndex, cellIndex, seen, calc = tableCalc(block)) {
      const value = tableCellValue(block, rowIndex, cellIndex, seen, calc);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }

    // 矩形範囲を数値の並びへ解決する「範囲列挙の共通1箇所」。式の範囲・全体参照と
    // グラフの range はすべてここを通る。結合グループは1つの論理値なので、
    // **メンバーのどれかが範囲に触れていれば1回だけ**数える(本体が範囲の外でも。
    // 「coveredスキップ」方式だとこのケースを取りこぼす)。filter は座標単位の除外
    // (全体参照のヘッダー除外)。lenient はセル単位でエラーを握りつぶす(グラフ用:
    // 循環などがあっても他のセルは描く)。
    // 範囲の中のセルを、結合グループは1回だけ(最初に出会った位置で)数えて並べる。式の範囲参照(rectNumberValues)と
    // グラフの範囲(chartRangeEntries)が共有する唯一の列挙(P25。v163 で取り出した。並びと数え方は以前の rectNumberValues と同じ)。
    function rectGroupCells(block, rect, filter, calc = tableCalc(block)) {
      const rows = calc.rows;
      const countedGroups = new Set();
      const cells = [];
      const top = Math.max(0, rect.top);
      const bottom = Math.min(rows.length - 1, rect.bottom);
      const left = Math.max(0, rect.left);
      const right = Math.min(rows[0].length - 1, rect.right);
      for (let r = top; r <= bottom; r += 1) {
        for (let c = left; c <= right; c += 1) {
          if (filter && !filter(r, c)) continue;
          const origin = cellOriginInRows(rows, r, c);
          const key = origin ? origin.rowIndex + ":" + origin.cellIndex : r + ":" + c;
          if (countedGroups.has(key)) continue;
          countedGroups.add(key);
          cells.push({ rowIndex: r, cellIndex: c, origin });
        }
      }
      return cells;
    }

    function rectNumberValues(block, rect, seen, filter, lenient = false, calc = tableCalc(block)) {
      const values = [];
      rectGroupCells(block, rect, filter, calc).forEach(({ rowIndex, cellIndex }) => {
        let value = null;
        if (lenient) {
          try {
            value = tableCellNumber(block, rowIndex, cellIndex, seen, calc);
          } catch {
            value = null;
          }
        } else {
          value = tableCellNumber(block, rowIndex, cellIndex, seen, calc);
        }
        if (value !== null) values.push(value);
      });
      return values;
    }

    // 式を計算する。字句解析 → 構文木 → 評価(v232 で構文木を挟んだ。IF・IFERROR で選ばなかった側を計算しない:
    // =IF(A1=0, 0, 1/A1) が 0 除算にならない。Excel と同じ)。構文の誤り(PARSE)・知らない関数(NAME)・結合の別名混在(MERGE)は、
    // 計算する前(構文木を作る段)に出る。
    // calc は表の計算の通し(tableCalc。v221)。読み取りはすべて calc.rows から(tableRows() を呼び直さない)。
    // 値は 数・文字・真偽(TRUE/FALSE)・空(EMPTY_VALUE。何も入っていないセル)。四則は数にして計算する(文字のセルは、数として
    // 読めなければ 0。v231 までと同じ)。比べる(= <> < > <= >=)と真偽になり、& は文字をつなぐ。
    function evaluateTableFormula(block, source, seen = new Set(), calc = tableCalc(block)) {
      const text = halfWidthFormula(source).trim().replace(/^=/, "");
      // フィルや行列削除が式に書き込んだ #REF(参照切れ)は、構文エラーとは区別して #REF と表示する(Excel の語彙に合わせる)。
      // 式の中の値として読む(v248。Issue #82。以前は式を読む前に #REF にしていたので、=IFERROR(#REF,0) や =IF(TRUE,1,#REF) でも #REF だった)。
      // 文字("…")の中の #REF は文字。
      const tokens = [];
      // 文字・比べる記号を先に。列まるごと(A:C)は名前より、行まるごと(2:4)は数値より先に読む。$ は絶対参照の印(v232)。
      // 数は .5 と指数(1E3・2.5e-3)も読む(v248。Issue #86。Excel と同じ。セルの値の 1e3 は以前から数として読んでいた)。
      const pattern = /\s*("(?:[^"]|"")*"|#REF|<=|>=|<>|[<>=&]|\$?\d+:\$?\d+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?|\$?[A-Za-z]+:\$?[A-Za-z]+|[A-Za-z]+|[-+*/^%(),])/g;
      let match;
      let consumed = 0;
      while ((match = pattern.exec(text))) {
        if (match.index !== consumed) throw new Error("PARSE");
        consumed = pattern.lastIndex;
        tokens.push(match[1]);
      }
      if (text.slice(consumed).trim()) throw new Error("PARSE");
      const plainRef = (token) => String(token).replace(/\$/g, "").toUpperCase();
      const isCellToken = (token) => /^\$?[A-Za-z]+\$?\d+$/.test(String(token ?? ""));
      const isRangeToken = (token) => /^(\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+|\$?[A-Za-z]+:\$?[A-Za-z]+|\$?\d+:\$?\d+)$/.test(String(token ?? ""));
      // 結合グループの別名混在(#MERGE)。トークン化直後の1パスで、単一セル参照だけを
      // 本体(origin)へ正規化し、「同一グループに写る異なる座標名が2つ以上」なら
      // エラーにする。範囲トークンは対象外(列挙側がグループを1回化するので
      // =A1+SUM(A1:B5) は合法)。同じ座標名の複数回使用も合法(=A1+A1。$A$1 も同じ座標名)。
      {
        const aliasRows = calc.rows;
        const aliasByOrigin = new Map();
        for (const token of tokens) {
          if (!isCellToken(token)) continue;
          const name = plainRef(token);
          const parts = /^([A-Z]+)(\d+)$/.exec(name);
          const origin = cellOriginInRows(aliasRows, Number(parts[2]) - 1, columnIndexFromLabel(parts[1]));
          if (!origin) continue;
          const key = origin.rowIndex + ":" + origin.cellIndex;
          const existing = aliasByOrigin.get(key);
          if (existing && existing !== name) throw new Error("MERGE:" + existing + ":" + name);
          aliasByOrigin.set(key, existing || name);
        }
      }

      // ---- 構文木を作る ----
      let at = 0;
      const peek = () => tokens[at];
      const next = () => tokens[at++];
      function parseComparison() {
        let node = parseConcat();
        while (["=", "<>", "<", ">", "<=", ">="].includes(peek())) {
          const op = next();
          node = { t: "cmp", op, a: node, b: parseConcat() };
        }
        return node;
      }
      function parseConcat() {
        let node = parseAdditive();
        while (peek() === "&") {
          next();
          node = { t: "cat", a: node, b: parseAdditive() };
        }
        return node;
      }
      function parseAdditive() {
        let node = parseTerm();
        while (peek() === "+" || peek() === "-") {
          const op = next();
          node = { t: "bin", op, a: node, b: parseTerm() };
        }
        return node;
      }
      function parseTerm() {
        let node = parsePower();
        while (peek() === "*" || peek() === "/" || peek() === "%") {
          const op = next();
          node = { t: "bin", op, a: node, b: parsePower() };
        }
        return node;
      }
      // 累乗。Excel と同じく左結合（2^3^2 = 64）で、単項マイナスは累乗より
      // 先に効く（-2^2 = 4）。単項側は parsePrimary が先に取り込む。
      function parsePower() {
        let node = parsePrimary();
        while (peek() === "^") {
          next();
          node = { t: "bin", op: "^", a: node, b: parsePrimary() };
        }
        return node;
      }
      function parsePrimary() {
        const token = next();
        if (token === undefined) throw new Error("PARSE");
        if (token === "-") return { t: "neg", x: parsePrimary() };
        if (token === "+") return { t: "pos", x: parsePrimary() };
        if (token === "(") {
          const node = parseComparison();
          if (next() !== ")") throw new Error("PARSE");
          return node;
        }
        if (token[0] === '"') {
          if (token.length < 2 || !token.endsWith('"')) throw new Error("PARSE");
          return { t: "str", v: token.slice(1, -1).replace(/""/g, '"') };
        }
        if (token === "#REF") return { t: "referr" };
        if (/^[\d.]/.test(token) && !token.includes(":")) return { t: "num", v: Number(token) };
        if (isCellToken(token)) return { t: "ref", token: plainRef(token) };
        if (/^[A-Za-z]+$/.test(token)) {
          const name = token.toUpperCase();
          if (peek() !== "(") {
            if (name === "TRUE" || name === "FALSE") return { t: "bool", v: name === "TRUE" };
            throw new Error("PARSE");
          }
          next();
          const args = [];
          if (peek() === ")") {
            next();
          } else {
            for (;;) {
              // 引数は「範囲」か「式」のどちらか。範囲は A1:B2 のほか、列まるごと(A:C)・行まるごと(2:4)も受ける。
              // 空の引数(=SUM(A1,,A2)・=IF(A1>5,,1))は 0(v248。Issue #86。Excel と同じ)。
              if (peek() === "," || peek() === ")") args.push({ t: "num", v: 0 });
              else if (isRangeToken(peek()) && (tokens[at + 1] === "," || tokens[at + 1] === ")")) args.push({ t: "range", token: plainRef(next()) });
              else args.push(parseComparison());
              if (peek() === ",") {
                next();
                continue;
              }
              if (next() !== ")") throw new Error("PARSE");
              break;
            }
          }
          const spec = TABLE_FUNCTIONS[name];
          if (!spec) throw new Error("NAME");
          if (args.length < spec.min || args.length > spec.max) throw new Error("PARSE");
          return { t: "call", name, args };
        }
        throw new Error("PARSE");
      }
      const tree = parseComparison();
      if (at !== tokens.length) throw new Error("PARSE");

      // ---- 計算する ----
      const rows = calc.rows;
      const cellAt = (ref) => {
        const parts = /^([A-Z]+)(\d+)$/.exec(ref);
        if (!parts) throw new Error("REF");
        return { rowIndex: Number(parts[2]) - 1, cellIndex: columnIndexFromLabel(parts[1]) };
      };
      // 範囲の矩形と、全体参照(A:A / 2:2)のときのヘッダー除外。
      const resolveRange = (token) => {
        let rect;
        let wholeRef = false;
        let m;
        if ((m = /^([A-Z]+):([A-Z]+)$/.exec(token))) {
          // 列まるごと(A:A / A:C)。書いた時点の高さに固定せず、評価のたびに
          // いまの表の高さへ解決する(行の挿入・削除に自動で追従する生きた参照)。
          const a = columnIndexFromLabel(m[1]);
          const b = columnIndexFromLabel(m[2]);
          rect = { top: 0, bottom: rows.length - 1, left: Math.min(a, b), right: Math.max(a, b) };
          wholeRef = true;
        } else if ((m = /^(\d+):(\d+)$/.exec(token))) {
          // 行まるごと(2:2 / 2:4)。同じく評価のたびにいまの表の幅へ解決する。
          const a = Number(m[1]) - 1;
          const b = Number(m[2]) - 1;
          rect = { top: Math.min(a, b), bottom: Math.max(a, b), left: 0, right: rows[0].length - 1 };
          wholeRef = true;
        } else {
          const [from, to] = token.split(":");
          const start = cellAt(from);
          const end = to ? cellAt(to) : start;
          rect = {
            top: Math.min(start.rowIndex, end.rowIndex),
            bottom: Math.max(start.rowIndex, end.rowIndex),
            left: Math.min(start.cellIndex, end.cellIndex),
            right: Math.max(start.cellIndex, end.cellIndex),
          };
        }
        // 宣言済みのヘッダー行・列は「全体参照」からだけ除外する(Excel の構造化
        // テーブル方式。ユーザー承認済み)。明示範囲(A1:B3)は従来どおり全セルを
        // 含む(意図的に含めたいときの逃げ道)。除外規則はこのフィルタ1点にだけ置く。
        // 結合グループの1回化は列挙(rectGroupCells)が守る。
        const included = (r, c) => !wholeRef
          || !((block.tableHeader && r === 0) || (block.tableHeaderColumn && c === 0));
        return { rect, included };
      };
      const rangeNumbers = (token) => {
        const { rect, included } = resolveRange(token);
        return rectNumberValues(block, rect, seen, included, false, calc);
      };
      // 範囲のセル(結合グループは1回)と、その値(数・文字・真偽・空)。エラーのセルは値を持たず error に入れる(v248。Issue #81。
      // 以前はエラーをそのまま投げ、範囲に1つでもエラーがあると COUNT・COUNTA・COUNTIF・SUMIF までエラーになった。Excel は
      // COUNT・COUNTIF・SUMIF はエラーのセルを飛ばし、COUNTA は数える。AND・OR は Excel と同じくエラーにする(logicalArgs)。
      // 循環(CYCLE)は受け止めない(IFERROR と同じ理由: 辿り始めた位置で結果が変わり、計算の覚えが崩れる)。
      const rangeEntries = (token) => {
        const { rect, included } = resolveRange(token);
        return rectGroupCells(block, rect, included, calc).map((entry) => {
          let value;
          let error = null;
          try {
            value = tableCellValue(block, entry.rowIndex, entry.cellIndex, seen, calc);
          } catch (caught) {
            const message = String(caught?.message ?? "");
            if (message === "CYCLE" || !(TABLE_FORMULA_ERRORS.has(message) || message.startsWith("MERGE:"))) throw caught;
            error = caught;
          }
          return { ...entry, rect, value, error, raw: entry.origin ? entry.origin.cell.text : "" };
        });
      };
      const toNumber = (value) => {
        if (typeof value === "number") return value;
        if (typeof value === "boolean") return value ? 1 : 0;
        if (value === EMPTY_VALUE) return 0;
        return parseTableNumberText(value) ?? 0;
      };
      const toText = (value) => {
        if (value === EMPTY_VALUE) return "";
        if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
        if (typeof value === "number") return formatTableFormulaValue(value);
        return String(value);
      };
      // 条件としての真偽。文字は TRUE / FALSE だけを受ける(それ以外は Excel と同じくエラー)。
      const toBoolean = (value) => {
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return value !== 0;
        if (value === EMPTY_VALUE) return false;
        const word = String(value).trim().toUpperCase();
        if (word === "TRUE") return true;
        if (word === "FALSE") return false;
        throw new Error("VALUE");
      };
      // 引数を数の並びに(SUM・AVERAGE・MIN・MAX)。範囲と、引数に直接書いたセル(=SUM(A1))は、数のセルだけを数える
      // (文字・空は数えない。Excel と同じ)。式・数・真偽はその値、数として読めない文字はエラー。
      const numberArgs = (args) => {
        const values = [];
        args.forEach((arg) => {
          if (arg.t === "range" || arg.t === "ref") {
            values.push(...rangeNumbers(arg.token));
            return;
          }
          const value = evaluate(arg);
          if (value === EMPTY_VALUE) return;
          if (typeof value === "string") {
            const number = parseTableNumberText(value);
            if (number === null) throw new Error("VALUE");
            values.push(number);
            return;
          }
          values.push(toNumber(value));
        });
        return values;
      };
      // 引数の値を並べる(AND・OR・COUNT・COUNTA)。範囲と直接書いたセルは、セルの値を1つずつ。
      const valueArgs = (args) => {
        const values = [];
        args.forEach((arg) => {
          if (arg.t === "range" || arg.t === "ref") rangeEntries(arg.token).forEach((entry) => values.push({ value: entry.value, cell: true, raw: entry.raw, error: entry.error }));
          else values.push({ value: evaluate(arg), cell: false });
        });
        return values;
      };
      const rangeArg = (arg) => {
        if (arg.t === "referr") throw new Error("REF");
        if (arg.t !== "range" && arg.t !== "ref") throw new Error("VALUE");
        return arg.token;
      };
      const round = (arg, digitsArg, mode) => {
        const value = toNumber(evaluate(arg));
        const digits = digitsArg ? Math.trunc(toNumber(evaluate(digitsArg))) : 0;
        return roundTableNumber(value, digits, mode);
      };
      const run = {
        SUM: (args) => numberArgs(args).reduce((total, value) => total + value, 0),
        // 数値の入っているセルだけで平均する（Excel と同じ）。対象が無ければ
        // Excel の #DIV/0! に相当するエラーにする。
        AVERAGE: (args) => {
          const values = numberArgs(args);
          if (!values.length) throw new Error("DIV0");
          return values.reduce((total, value) => total + value, 0) / values.length;
        },
        MIN: (args) => {
          const values = numberArgs(args);
          return values.length ? Math.min(...values) : 0;
        },
        MAX: (args) => {
          const values = numberArgs(args);
          return values.length ? Math.max(...values) : 0;
        },
        // 数の個数。範囲では数のセルだけ。直接書いた値は、数・真偽・数として読める文字を数える(Excel と同じ)。
        COUNT: (args) => valueArgs(args).filter(({ value, cell }) => typeof value === "number"
          || (!cell && (typeof value === "boolean" || (typeof value === "string" && parseTableNumberText(value) !== null)))).length,
        // 空でないものの個数。範囲では何か書いてあるセル(式も)。
        COUNTA: (args) => valueArgs(args).filter(({ value, cell, raw }) => (cell ? String(raw ?? "").trim() !== "" : value !== EMPTY_VALUE)).length,
        ROUND: (args) => round(args[0], args[1], "half"),
        ROUNDUP: (args) => round(args[0], args[1], "up"),
        ROUNDDOWN: (args) => round(args[0], args[1], "down"),
        INT: (args) => Math.floor(toNumber(evaluate(args[0]))),
        ABS: (args) => Math.abs(toNumber(evaluate(args[0]))),
        // 選ばなかった側は計算しない(Excel と同じ)。3つ目を省くと FALSE。
        IF: (args) => (toBoolean(evaluate(args[0])) ? evaluate(args[1]) : args[2] ? evaluate(args[2]) : false),
        // エラーなら2つ目。循環(#CYCLE)は受け止めない(辿り始めた位置で結果が変わり、計算の覚えが崩れる)。
        IFERROR: (args) => {
          try {
            return evaluate(args[0]);
          } catch (error) {
            const message = String(error?.message ?? "");
            if (message === "CYCLE" || !(TABLE_FORMULA_ERRORS.has(message) || message.startsWith("MERGE:"))) throw error;
            return evaluate(args[1]);
          }
        },
        AND: (args) => logicalArgs(args).every(Boolean),
        OR: (args) => logicalArgs(args).some(Boolean),
        NOT: (args) => !toBoolean(evaluate(args[0])),
        TRUE: () => true,
        FALSE: () => false,
        // 条件に合うセルの個数・合計(Excel と同じ書き方: 60 / ">=60" / "済" / "<>済" / "" / "*株式*")。
        COUNTIF: (args) => {
          const test = tableCriteria(evaluate(args[1]));
          return rangeEntries(rangeArg(args[0])).filter((entry) => test(entry.value)).length;
        },
        SUMIF: (args) => {
          const test = tableCriteria(evaluate(args[1]));
          const entries = rangeEntries(rangeArg(args[0]));
          // 合計する範囲は、条件の範囲と同じ形で、左上をそろえて読む(省けば条件の範囲そのもの)。
          const sumTop = args[2] ? resolveRange(rangeArg(args[2])).rect : null;
          let total = 0;
          entries.forEach((entry) => {
            if (!test(entry.value)) return;
            const value = sumTop
              ? tableCellValue(block, sumTop.top + entry.rowIndex - entry.rect.top, sumTop.left + entry.cellIndex - entry.rect.left, seen, calc)
              : entry.value;
            if (typeof value === "number") total += value;
          });
          return total;
        },
      };
      // AND・OR の値。範囲では真偽と数だけ(文字・空は飛ばす)。直接書いた値は真偽にする。何も無ければエラー(Excel と同じ)。
      function logicalArgs(args) {
        const values = [];
        valueArgs(args).forEach(({ value, cell, error }) => {
          if (error) throw error;
          if (cell) {
            if (typeof value === "boolean" || typeof value === "number") values.push(toBoolean(value));
            return;
          }
          values.push(toBoolean(value));
        });
        if (!values.length) throw new Error("VALUE");
        return values;
      }
      function evaluate(node) {
        switch (node.t) {
          case "num":
          case "str":
          case "bool":
            return node.v;
          case "ref": {
            const point = cellAt(node.token);
            return tableCellValue(block, point.rowIndex, point.cellIndex, seen, calc);
          }
          case "referr":
            throw new Error("REF");
          case "neg":
            return -toNumber(evaluate(node.x));
          case "pos":
            return toNumber(evaluate(node.x));
          case "cat":
            return toText(evaluate(node.a)) + toText(evaluate(node.b));
          case "cmp": {
            const order = compareTableValues(evaluate(node.a), evaluate(node.b));
            if (node.op === "=") return order === 0;
            if (node.op === "<>") return order !== 0;
            if (node.op === "<") return order < 0;
            if (node.op === ">") return order > 0;
            if (node.op === "<=") return order <= 0;
            return order >= 0;
          }
          case "bin": {
            const left = toNumber(evaluate(node.a));
            const right = toNumber(evaluate(node.b));
            if (node.op === "+") return left + right;
            if (node.op === "-") return left - right;
            if (node.op === "*") return left * right;
            if (node.op === "^") return Math.pow(left, right);
            // 剰余。Excel に % 演算子は無いため、プログラミング言語の慣習に
            // 合わせる（符号は割られる側、0 で割れば #ERR）。
            if (right === 0) throw new Error("DIV0");
            return node.op === "%" ? left % right : left / right;
          }
          case "call":
            return run[node.name](node.args);
          default:
            throw new Error("PARSE");
        }
      }
      const result = evaluate(tree);
      // 空のセルだけを指す式(=A1)は 0(Excel と同じ)。
      return result === EMPTY_VALUE ? 0 : result;
    }

    // セルの表示値。式は必ず計算結果にする（編集状態は見ない）。
    // 保存する単一HTMLには再計算の仕組みが無いので、この値を焼き込む。
    function tableCellResult(block, rowIndex, cellIndex, calc = tableCalc(block)) {
      const cell = calc.rows[rowIndex][cellIndex];
      if (!isTableFormula(cell.text)) return cell.text;
      const outcome = tableCellOutcome(block, rowIndex, cellIndex, calc);
      const error = formulaErrorOf(outcome);
      if (error) return error.code;
      const value = outcome.value;
      if (typeof value === "string") return value;
      if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
      return formatTableFormulaValue(value);
    }

    // 式のセル1つの計算の結果({ value } か { error })。式でなければ null。
    // 自分の位置を辿り始点に入れておく。入れないと自分自身への参照を循環と気付けない。
    // 結果は通しの中で覚える(v221。表示・ツールチップ・グラフ・書き出しで同じセルを何度も計算しない)。
    // 結合で覆われた位置(本体の文字を映した写し)は、鍵が本体と違うので覚えずに毎回計算する(従来どおり)。
    function tableCellOutcome(block, rowIndex, cellIndex, calc = tableCalc(block)) {
      const cell = calc.rows[rowIndex]?.[cellIndex];
      if (!cell || !isTableFormula(cell.text)) return null;
      if (!cell.covered) return tableFormulaOutcome(calc, rowIndex + ":" + cellIndex, cell.text, new Set());
      try {
        return { value: evaluateTableFormula(block, cell.text, new Set([rowIndex + ":" + cellIndex]), calc) };
      } catch (error) {
        return { error };
      }
    }

    // 式のセルのエラー(無ければ null)。{ code: セルに出す文字, reason: 原因の種類 }。セルの表示(tableCellResult)と
    // 文書チェック(document-check.js。Issue #236)がこの1か所で判定する(同じ判定を2か所に作らない)。
    function tableCellError(block, rowIndex, cellIndex, calc = tableCalc(block)) {
      return formulaErrorOf(tableCellOutcome(block, rowIndex, cellIndex, calc));
    }

    // #MERGE の説明文。「なんのエラーなのか分からない」を避けるため、実際の座標名
    // 入りで原因(結合の別名混在)を言う。ツールチップと setStatus、保存HTMLで共用。
    function tableMergeAliasMessage(block, source, calc = tableCalc(block)) {
      try {
        evaluateTableFormula(block, source, new Set(), calc);
        return null;
      } catch (error) {
        const parts = String(error.message).split(":");
        if (parts[0] !== "MERGE") return null;
        return parts[1] + " と " + parts[2] + " は同じ結合セルの別名です。どちらか一方だけを使ってください";
      }
    }

    // 数式セルのツールチップ。通常は式そのもの、#MERGE のときは「式 — 説明」の形。
    // 結果は tableCellResult が通しの中で覚えているので、表示と合わせても計算は1回(v221)。
    function formulaCellTitle(block, rowIndex, cellIndex, raw, calc = tableCalc(block)) {
      if (tableCellResult(block, rowIndex, cellIndex, calc) !== "#MERGE") return raw;
      const message = tableMergeAliasMessage(block, raw, calc);
      return message ? raw + " — " + message : raw;
    }

    // 通しの途中で表の形を直したとき(app.js の tableRows)に、その表の覚えを捨てる(通しの中は読むだけなので、ふつうは起きない)。
    function forgetTableCalc(block) {
      tableCalcPassCache?.delete(block);
    }

    return {
      withTableCalcPass, tableCalc, forgetTableCalc, isTableFormula, rawTableCellText, tableCellValue, tableCellNumber,
      rectGroupCells, rectNumberValues, evaluateTableFormula, tableCellResult, tableCellError, tableMergeAliasMessage, formulaCellTitle,
    };
  }

  // 式の計算の結果({ value } か { error })のエラー。エラーでなければ null。
  // 語彙の使い分け: #REF=参照切れ / #CYCLE=循環 / #MERGE=結合の別名混在 / #ERR=それ以外(構文・知らない関数・型・0除算・数にならない結果)。
  // reason は原因の種類(PARSE・NAME・DIV0・VALUE・REF・CYCLE・MERGE・NUMBER(結果が有限の数でない)・OTHER)。
  function formulaErrorOf(outcome) {
    if (!outcome) return null;
    if (!outcome.error) {
      const value = outcome.value;
      return typeof value === "string" || typeof value === "boolean" || Number.isFinite(value) ? null : { code: "#ERR", reason: "NUMBER" };
    }
    const message = String(outcome.error?.message ?? "");
    if (message === "CYCLE") return { code: "#CYCLE", reason: "CYCLE" };
    if (message === "REF") return { code: "#REF", reason: "REF" };
    if (message.startsWith("MERGE")) return { code: "#MERGE", reason: "MERGE" };
    return { code: "#ERR", reason: ["PARSE", "NAME", "DIV0", "VALUE"].includes(message) ? message : "OTHER" };
  }

  return {
    create,
    columnLabel, columnIndexFromLabel, halfWidthFormula, replaceOutsideFormulaStrings, rewriteFormulaRefs, parseTableNumberText,
    TABLE_REF_PATTERN, cellOriginInRows, tableRangeRect, formulaRangeRef, EMPTY_VALUE, compareTableValues, formatTableFormulaValue,
  };
})();
