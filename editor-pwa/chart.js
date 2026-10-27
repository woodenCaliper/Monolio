// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// グラフ(Issue #207 で app.js から分けた)。コードの読み方・表から系列を組み立てる処理・絵(SVG)。
// 形: 普通のスクリプトが window.DocumentChart に載せる(table-formula.js と同じ。理由は HANDOVER §4.51)。
//   - 表を読まないもの(コードと設定の読み方・目盛り・近似線・凡例の配置・絵)は、そのまま載せる。renderChartSvg(chart) は
//     組み立てた結果だけから SVG の文字列を作る
//   - 表を読むもの(buildChart・見本の行・系列を足す行)は create({ tableFormula }) が返す道具にまとめる。tableFormula は
//     TableFormula.create の道具(式の計算と通し)
//   - 読むページのブロックは引数 blocks で受け取る(app.js の「いまのページ」には頼らない。app.js の呼び口が既定を渡す)
// 右ペインの GUI・本文の中の絵の置き場・描き直しの段取りは app.js に残す。
// 読み込みの順: document-format.js(fmt.escapeHtml・safeCssColor)・table-formula.js の後、app.js の前。
window.DocumentChart = (() => {
  const fmt = window.SingleHtmlFormat;
  const { columnIndexFromLabel, formulaRangeRef } = window.TableFormula;

  // ---- グラフ ----
  // 定義は matplotlib.pyplot に似せた「1行1コマンド」の形にした。
  // 例:
  //   scatter(A2:A20, B2:B20)
  //   hist(C2:C50, bins=12)
  //   barh(A2:A6, B2:B6)          横棒(v167。matplotlib と同じく、位置(分類・数)、幅の順)
  //   pie(A2:A5, B2:B5)           円グラフ(v168。分類、値の順。matplotlib の pie(B2:B5, labels=A2:A5) も読む)
  //   title("測定結果")
  // 値は表から読む。既定では「そのブロックより上にある一番近い表」を使い、
  // table(2) のように書けば**そのページの中で** n 番目の表を指定できる(複数ページ化で、
  // 表の参照はページを跨がない。数えるのは渡されたページのブロック(app.js の currentBlocks())の中だけ)。
  // table(id="…") は表のブロックの id で指す形(v158)。**GUI で選んだ表はこの形で書く**: 位置で指すと、上に表を
  // 1つ足しただけでグラフが黙って別の表を読み始める(P18)。探すのはこちらも現在ページの中だけ。
  const CHART_KINDS = new Set(["scatter", "plot", "line", "bar", "barh", "hist", "histogram", "pie"]);

  // 種類の別名(line = plot、histogram = hist)と、正の名前ごとの日本語の名前(エラーの文とペインの選択肢で共用。表は1つ。P25。v170)。
  const CHART_KIND_ALIASES = { line: "plot", histogram: "hist" };

  const CHART_KIND_NAMES = { scatter: "散布図", plot: "折れ線", bar: "縦棒", barh: "横棒", hist: "ヒストグラム", pie: "円" };

  const chartKindOf = (name) => CHART_KIND_ALIASES[name] || name;

  const isHistKind = (name) => chartKindOf(name) === "hist";

  // 向き(縦・横棒・円)。グラフの向きを決めるのも、系列の向きを比べるのも、この1つ(v170)。
  const chartLayoutOf = (name) => (name === "barh" ? "horizontal" : name === "pie" ? "pie" : "vertical");

  // 表が無いときの見本(読む表があれば chartSampleFromTable で表から作る。v170)。
  const CHART_SAMPLE = 'scatter(A1:A10, B1:B10)\ntitle("グラフ")\nxlabel("横軸")\nylabel("縦軸")';

  function splitChartArguments(text) {
    const parts = [];
    let depth = 0;
    let quoted = false;
    let current = "";
    for (const character of String(text)) {
      if (character === '"') quoted = !quoted;
      if (!quoted && character === "(") depth += 1;
      if (!quoted && character === ")") depth -= 1;
      if (!quoted && !depth && character === ",") {
        parts.push(current);
        current = "";
        continue;
      }
      current += character;
    }
    if (current.trim()) parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
  }

  function parseChartValue(text) {
    const value = String(text).trim();
    if (/^".*"$/.test(value)) return { type: "string", value: value.slice(1, -1) };
    if (/^(true|false)$/i.test(value)) return { type: "boolean", value: value.toLowerCase() === "true" };
    if (/^[A-Za-z]+\d+:[A-Za-z]+\d+$/.test(value)) return { type: "range", value: value.toUpperCase() };
    if (/^[A-Za-z]+\d+$/.test(value)) return { type: "range", value: value.toUpperCase() + ":" + value.toUpperCase() };
    if (/^-?\d+(\.\d+)?$/.test(value)) return { type: "number", value: Number(value) };
    return { type: "word", value };
  }

  function parseChartSpec(source) {
    const calls = [];
    String(source || "").split(/\r?\n/).forEach((line) => {
      const text = line.trim();
      if (!text || text.startsWith("#")) return;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(text);
      if (!match) {
        calls.push({ name: null, source: text });
        return;
      }
      const args = [];
      const options = {};
      splitChartArguments(match[2]).forEach((piece) => {
        const pair = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(piece);
        if (pair) options[pair[1].toLowerCase()] = parseChartValue(pair[2]);
        else args.push(parseChartValue(piece));
      });
      calls.push({ name: match[1].toLowerCase(), args, options, source: text });
    });
    return calls;
  }

  // 範囲を数値の並びへ。表の式は計算済みの値を使う。
  // グラフの範囲の文字(A1:B3 / A1)を矩形へ。読めなければ null。
  function chartRangeRect(range) {
    const parse = (ref) => {
      const parts = /^([A-Z]+)(\d+)$/.exec(ref);
      if (!parts) return null;
      return { rowIndex: Number(parts[2]) - 1, cellIndex: columnIndexFromLabel(parts[1]) };
    };
    const [from, to] = String(range).split(":");
    const start = parse(from);
    const end = parse(to || from);
    if (!start || !end) return null;
    return {
      top: Math.min(start.rowIndex, end.rowIndex),
      bottom: Math.max(start.rowIndex, end.rowIndex),
      left: Math.min(start.cellIndex, end.cellIndex),
      right: Math.max(start.cellIndex, end.cellIndex),
    };
  }

  // 系列の色(v163)。matplotlib の書き方だけを受ける: 既定の配色の順 "C0"〜"C9"・"tab:blue" などの名前・"#rrggbb"。
  // ほかは null(呼び出し側がエラーを知らせて既定の色で描く。形の分からない値を fill に入れると、ブラウザごとに黙って
  // 黒や無色になり見た目がそろわない。P22)。値の検査は保存HTMLのセルの色と同じ safeCssColor も通す(P25)。
  const CHART_TAB_COLORS = {
    "tab:blue": "#1f77b4", "tab:orange": "#ff7f0e", "tab:green": "#2ca02c", "tab:red": "#d62728", "tab:purple": "#9467bd",
    "tab:brown": "#8c564b", "tab:pink": "#e377c2", "tab:gray": "#7f7f7f", "tab:grey": "#7f7f7f", "tab:olive": "#bcbd22",
    "tab:cyan": "#17becf",
  };

  function chartColorValue(text) {
    const value = String(text || "").trim();
    const cycle = /^C(\d)$/.exec(value);
    if (cycle) return CHART_COLORS[Number(cycle[1])];
    const named = CHART_TAB_COLORS[value.toLowerCase()];
    if (named) return named;
    if (/^#[0-9a-fA-F]{6}$/.test(value) && fmt.safeCssColor(value)) return value.toLowerCase();
    return null;
  }

  // 文字の幅の目安(凡例と分類の目盛の配置用。全角 12px・半角 7px)。
  function chartTextWidth(value) {
    return [...String(value)].reduce((sum, character) => sum + (character.charCodeAt(0) > 255 ? 12 : 7), 0);
  }

  // 幅に収まるよう縮める(はみ出す分は「…」)。分類の目盛の名前は、枠の幅に収まるよう**縮める**に統一(間引かない)。
  function chartFitText(value, width) {
    const text = String(value);
    if (chartTextWidth(text) <= width) return text;
    let out = "";
    for (const character of text) {
      if (chartTextWidth(out + character + "…") > width) break;
      out += character;
    }
    return out + "…";
  }

  // grid() の読み方(描画とペインで共用。P25。v163)。"x" | "y" | "both" | "none"。読めない形は null。
  // matplotlib と同じ書き方: grid(True/False)・grid(axis="y")・grid("both")。真偽は小文字(false)も読む(後方互換)。
  function chartGridSetting(call) {
    if (call.args.length > 1) return null;
    const arg = call.args[0];
    const axis = call.options.axis ? String(call.options.axis.value).toLowerCase() : null;
    if (axis && !["x", "y", "both"].includes(axis)) return null;
    if (!arg) return axis || "both";
    if (arg.type === "boolean") return arg.value ? (axis || "both") : "none";
    const value = String(arg.value ?? "").toLowerCase();
    if (!axis && (arg.type === "string" || arg.type === "word") && ["x", "y", "both"].includes(value)) return value;
    return null;
  }

  // 軸の範囲に書ける数(描画の chartLimitSetting とペインの範囲の欄で共用。P25。v166)。
  const CHART_LIMIT_NUMBER = /^-?\d+(\.\d+)?$/;

  // xlim() / ylim() の読み方(描画とペインで共用。P25。v165)。{ min, max }(書いていない側は null=自動)。読めない形は null。
  // 書き方(matplotlib と同じ): xlim(下, 上)・下限だけ xlim(5)(set_xlim(left=5) と同じ。v166)・名前つき
  // (xlim(left=0, right=10)・ylim(bottom=0, top=100))・None。空の側(xlim(0, ) など)も読む(案内には出さない)。
  // 引数の分け方は、空の引数を落とさないよう元の文字から読む。
  function chartLimitSetting(call, { partial = false } = {}) {
    const inner = /^[A-Za-z_][A-Za-z0-9_]*\s*\(([\s\S]*)\)$/.exec(String(call.source || "").trim())?.[1] ?? null;
    if (inner === null) return null;
    // None と空は「書かない側」(自動)。partial のときは読めない値もその側だけ自動にする(P22 のエラーは呼び出し側が出す)。
    const number = (text) => {
      const value = String(text ?? "").trim();
      if (!value || value === "None") return null;
      if (CHART_LIMIT_NUMBER.test(value)) return Number(value);
      return partial ? null : undefined;
    };
    let min = null;
    let max = null;
    if (inner.includes("=")) {
      const names = call.name === "xlim" ? { min: ["left", "xmin"], max: ["right", "xmax"] } : { min: ["bottom", "ymin"], max: ["top", "ymax"] };
      const keys = Object.keys(call.options);
      if (!partial && (call.args.length || !keys.length || keys.some((key) => !names.min.includes(key) && !names.max.includes(key)))) return null;
      for (const key of keys) {
        const value = number(call.options[key].value);
        if (value === undefined) return null;
        if (names.min.includes(key)) min = value;
        else if (names.max.includes(key)) max = value;
      }
    } else {
      const parts = inner.split(",");
      // 引数が1つなら下限だけ(ylim(5) = set_ylim(bottom=5)。ylim(0, ) と同じ結果。v166)。
      if (parts.length !== 1 && parts.length !== 2) return null;
      min = number(parts[0]);
      max = parts.length === 2 ? number(parts[1]) : null;
      if (min === undefined || max === undefined) return null;
    }
    if (min === null && max === null) return null;
    return { min, max };
  }

  // legend() の読み方(描画とペインで共用。P25。v163)。{ mode: "show" | "hide", loc } を返す。読めない形は null。
  // legend()・legend(True/False)・legend(loc="bottom")。位置は右・左・上・下の4つ。
  const CHART_LEGEND_LOCS = ["right", "left", "top", "bottom"];

  function chartLegendSetting(call) {
    if (call.args.length > 1) return null;
    const arg = call.args[0];
    const loc = call.options.loc ? String(call.options.loc.value).toLowerCase() : null;
    if (loc && !CHART_LEGEND_LOCS.includes(loc)) return null;
    if (!arg) return { mode: "show", loc: loc || "right" };
    if (arg.type === "boolean") return arg.value ? { mode: "show", loc: loc || "right" } : { mode: "hide", loc: "right" };
    const value = String(arg.value ?? "").toLowerCase();
    if (!loc && (arg.type === "string" || arg.type === "word") && CHART_LEGEND_LOCS.includes(value)) return { mode: "show", loc: value };
    return null;
  }

  // blocks はグラフのあるページのブロック(app.js の呼び口の既定はいまのページ)。保存・印刷の前に、ほかのページのグラフも
  // そのページの表で描き直すため(settleChartSvgs)。
  function chartSourceTable(chartBlock, calls, blocks) {
    const tables = blocks.filter((item) => item.type === "table");
    const pick = calls.find((call) => call.name === "table");
    if (pick) {
      if (pick.options?.id) return tables.find((item) => item.id === String(pick.options.id.value)) || null;
      const index = pick.args[0]?.type === "number" ? Math.floor(pick.args[0].value) - 1 : -1;
      return tables[index] || null;
    }
    const at = blocks.findIndex((item) => item.id === chartBlock.id);
    for (let index = at - 1; index >= 0; index -= 1) {
      if (blocks[index].type === "table") return blocks[index];
    }
    // 上に表が無ければ「無い」と伝える。文書のどこかの表へ黙ってフォールバック
    // すると、どの表を読んでいるのか利用者に分からない（table(n) での明示は可能）。
    return null;
  }

  // 数の並びの最小・最大。Math.min(...values) は並びが長い(数万〜)と「Maximum call stack size exceeded」で落ちるので、
  // 1つずつ比べる(v213)。空なら Infinity / -Infinity(Math.min() / Math.max() と同じ)。
  function minOfValues(values) {
    let min = Infinity;
    for (const value of values) if (value < min) min = value;
    return min;
  }

  function maxOfValues(values) {
    let max = -Infinity;
    for (const value of values) if (value > max) max = value;
    return max;
  }

  // ヒストグラムの区間の数の上限(v213)。bins=100000000 のような値をそのまま配列の長さにするとタブが落ちる。
  // グラフの幅(640px)に対して 1000 区間でも 1 区間 1px 未満なので、これ以上は見分けられない。越える値は 1000 で描く。
  const HIST_MAX_BINS = 1000;

  // ヒストグラムの区間を作る。
  function histogramBins(values, binCount) {
    if (!values.length) return [];
    const min = minOfValues(values);
    const max = maxOfValues(values);
    const count = Math.min(HIST_MAX_BINS, Math.max(1, Math.floor(binCount) || 10));
    const width = (max - min) || 1;
    const step = width / count;
    const bins = Array.from({ length: count }, (item, index) => ({
      from: min + step * index,
      to: min + step * (index + 1),
      count: 0,
    }));
    values.forEach((value) => {
      const at = Math.min(count - 1, Math.floor((value - min) / step));
      bins[at].count += 1;
    });
    return bins;
  }

  // 既定の配色(系列の順。color="C0"〜"C9" もこの順。表は1つ。P20)。最初の6色は v162 までと同じ。
  const CHART_COLORS = ["#2f6fb2", "#c1512f", "#16835f", "#7651a8", "#c48a16", "#b34778", "#1b9aaa", "#8c564b", "#7f7f7f", "#9aa31d"];

  const CHART_SIZE = { width: 640, height: 360, left: 58, right: 16, top: 34, bottom: 46 };

  // 横棒の分類の名前のために左を空ける上限(v167)。越える名前は「…」で縮める。
  const CHART_CATEGORY_LEFT_MAX = 170;

  // 目盛りの数の上限(目盛りを足すループの歯止め)。ふつうは 5〜8 本で、これに届くのは計算が壊れたときだけ。
  const CHART_TICK_LIMIT = 100;

  // 目盛りの値の端数(0.1 + 0.2 = 0.30000000000000004 のような誤差)を、目盛りの間隔に対して丸める。
  // 以前は値そのものを 1e-10 の位で丸めており、1e-12 のような小さなデータでは目盛りがすべて 0 になって間隔が 0 になり、
  // 目盛りを足すループが終わらずにタブが落ちた(v213)。間隔の 1/1000 の位で丸める(toFixed の桁の上限 100 を越える
  // ほど小さい間隔では丸めない。目盛りの文字は formatTick が指数で書く)。
  function roundChartTick(value, step) {
    if (!Number.isFinite(value) || !(step > 0) || !Number.isFinite(step)) return value;
    const digits = Math.max(0, Math.ceil(-Math.log10(step)) + 3);
    return digits <= 100 ? Number(value.toFixed(digits)) : value;
  }

  function niceTicks(min, max, count = 5) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (min === max) return [min - 1, min, min + 1];
    const span = max - min;
    const rough = span / count;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude)
      .find((candidate) => candidate >= rough) || magnitude * 10;
    // 間隔が 0・無限・NaN(範囲が数の表せる幅を越える・小さすぎる)なら、目盛りは両端だけ(ループに入らない)。
    if (!(step > 0) || !Number.isFinite(step)) return [min, max];
    const firstIndex = Math.floor(min / step);
    const ticks = [];
    // 目盛りは「間隔 × 番号」で作る(足し算を重ねない)。番号で数えるので、値が変わらない(大きな値に小さな間隔を足しても
    // 値が動かない)場合も上限で必ず止まる。
    for (let index = 0; index < CHART_TICK_LIMIT; index += 1) {
      const value = (firstIndex + index) * step;
      if (value > max + step / 2) break;
      ticks.push(roundChartTick(value, step));
    }
    return ticks.length ? ticks : [min, max];
  }

  // 近似曲線の種類(v177)。コードの名前 → 画面の名前(凡例・ペインの選択肢で共用。表は1つ)。
  const CHART_TREND_NAMES = { linear: "直線", poly2: "二次", log: "対数", exp: "指数" };

  // 最小二乗の当てはめ(Excel の近似曲線と同じ式)。X は位置 + shift(分類の軸は 1 始まり)。
  // 直線 y = a·x + b、二次 y = a·x² + b·x + c、対数 y = a·ln(x) + b、指数 y = a·e^(b·x)(ln y を直線で当てはめる)。
  // R² は Excel と同じく、指数は ln y の当てはめのもの、ほかは y のもの。当てはめられなければ { error }。
  function chartTrendFit(points, type, shift = 0) {
    const data = points.map((point) => ({ x: point.x + shift, y: point.y }));
    const distinct = new Set(data.map((point) => point.x)).size;
    const need = type === "poly2" ? 3 : 2;
    if (distinct < need) return { error: "近似曲線(" + CHART_TREND_NAMES[type] + ")には X の違う点が" + need + "つ以上必要です" };
    if (type === "log" && data.some((point) => point.x <= 0)) return { error: "対数近似は X がすべて 0 より大きいときだけ使えます" };
    if (type === "exp" && data.some((point) => point.y <= 0)) return { error: "指数近似は Y がすべて 0 より大きいときだけ使えます" };
    // 直線の当てはめ(u → v)と決定係数。v がすべて同じなら誤差 0 で R² = 1。
    const line = (pairs) => {
      const n = pairs.length;
      const mu = pairs.reduce((sum, [u]) => sum + u, 0) / n;
      const mv = pairs.reduce((sum, [, v]) => sum + v, 0) / n;
      let suu = 0;
      let suv = 0;
      let svv = 0;
      pairs.forEach(([u, v]) => {
        suu += (u - mu) ** 2;
        suv += (u - mu) * (v - mv);
        svv += (v - mv) ** 2;
      });
      const slope = suv / suu;
      const intercept = mv - slope * mu;
      const residual = pairs.reduce((sum, [u, v]) => sum + (v - (slope * u + intercept)) ** 2, 0);
      return { slope, intercept, r2: svv > 0 ? Math.max(0, 1 - residual / svv) : 1 };
    };
    let coef;
    let predict;
    let r2;
    if (type === "linear") {
      const fit = line(data.map((point) => [point.x, point.y]));
      coef = [fit.slope, fit.intercept];
      predict = (x) => coef[0] * x + coef[1];
      r2 = fit.r2;
    } else if (type === "log") {
      const fit = line(data.map((point) => [Math.log(point.x), point.y]));
      coef = [fit.slope, fit.intercept];
      predict = (x) => coef[0] * Math.log(x) + coef[1];
      r2 = fit.r2;
    } else if (type === "exp") {
      const fit = line(data.map((point) => [point.x, Math.log(point.y)]));
      coef = [Math.exp(fit.intercept), fit.slope];
      predict = (x) => coef[0] * Math.exp(coef[1] * x);
      r2 = fit.r2;
    } else {
      // 二次: 正規方程式(3×3)を、X を平均で中心化してから解く(大きな X でも桁落ちしにくい)。
      const mx = data.reduce((sum, point) => sum + point.x, 0) / data.length;
      const sums = [0, 0, 0, 0, 0];
      const rhs = [0, 0, 0];
      data.forEach(({ x, y }) => {
        const u = x - mx;
        for (let power = 0; power <= 4; power += 1) sums[power] += u ** power;
        for (let power = 0; power <= 2; power += 1) rhs[power] += y * u ** power;
      });
      const m = [[sums[4], sums[3], sums[2], rhs[2]], [sums[3], sums[2], sums[1], rhs[1]], [sums[2], sums[1], sums[0], rhs[0]]];
      for (let col = 0; col < 3; col += 1) {
        let pivot = col;
        for (let row = col + 1; row < 3; row += 1) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
        [m[col], m[pivot]] = [m[pivot], m[col]];
        if (!m[col][col]) return { error: "近似曲線(二次)を計算できません" };
        for (let row = 0; row < 3; row += 1) {
          if (row === col) continue;
          const factor = m[row][col] / m[col][col];
          for (let k = col; k < 4; k += 1) m[row][k] -= factor * m[col][k];
        }
      }
      // 中心化した u = x - mx の係数(p·u² + q·u + r)を、x の係数へ戻す。
      const [p, q, r] = [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
      coef = [p, q - 2 * p * mx, p * mx * mx - q * mx + r];
      predict = (x) => (coef[0] * x + coef[1]) * x + coef[2];
      const mean = data.reduce((sum, point) => sum + point.y, 0) / data.length;
      const total = data.reduce((sum, point) => sum + (point.y - mean) ** 2, 0);
      const residual = data.reduce((sum, point) => sum + (point.y - predict(point.x)) ** 2, 0);
      r2 = total > 0 ? Math.max(0, 1 - residual / total) : 1;
    }
    const xs = data.map((point) => point.x);
    return {
      type,
      coef,
      r2,
      // 描くときは画面の位置(shift を引いた X)で呼ぶ。
      at: (position) => predict(position + shift),
      minX: minOfValues(xs) - shift,
      maxX: maxOfValues(xs) - shift,
      scale: Math.max(maxOfValues(data.map((point) => Math.abs(point.y))), 1e-300),
    };
  }

  // 近似曲線の式と R² の文字(v177)。係数は有効数字4桁(Excel の既定の見え方に近い)。計算の誤差で 0 に近い値(1e-16 など)は 0 と見なす。
  function chartTrendText(trend) {
    const digits = (value) => String(Number(value.toPrecision(4)));
    const clean = (value) => (Math.abs(value) <= trend.scale * 1e-9 ? 0 : value);
    // 項の並び(係数と文字)を「y = 2x² - 3x + 1」の形に。係数 0 の項は省く。
    const join = (terms) => {
      let text = "";
      terms.forEach(([value, unit]) => {
        const number = clean(value);
        if (number === 0) return;
        const body = digits(Math.abs(number)) + unit;
        text += text ? (number < 0 ? " - " : " + ") + body : (number < 0 ? "-" : "") + body;
      });
      return text || "0";
    };
    const [a, b, c] = trend.coef;
    const equation = trend.type === "poly2" ? join([[a, "x²"], [b, "x"], [c, ""]])
      : trend.type === "log" ? join([[a, "ln(x)"], [b, ""]])
      : trend.type === "exp" ? digits(a) + "e^(" + digits(b) + "x)"
      : join([[a, "x"], [b, ""]]);
    const texts = [];
    if (trend.showEq) texts.push("y = " + equation);
    if (trend.showR2) texts.push("R² = " + trend.r2.toFixed(4));
    // SVG の文字は続く空白を1つに詰めるので、間は全角の空白(U+3000)で空ける。NBSP は outerHTML で &nbsp; になり、保存の無害化
    // (XML として読む sanitizeChartSvg)が読めずにグラフごと落ちるので使わない(v177。テストで発見)。
    return texts.join("\u3000");
  }

  // 目盛りの文字。その値を正しく表す最短の桁で書く(v213)。以前は指数を仮数1桁(toExponential(1))、それ以外を小数3桁で
  // 丸めていたので、12500・17500 が「1.3e+4」「1.8e+4」に、0.0011・0.0012 が「0.001」になり、目盛りが実際の値を
  // 表していなかった。計算の誤差は有効数字 12 桁で落とす(目盛りの値は roundChartTick で間隔に対して丸め済み)。
  // 指数は従来の見た目(仮数は小数1桁以上: 1.0e+4・1.25e+4)を保つ。
  function formatTick(value) {
    if (!Number.isFinite(value)) return "";
    const clean = Number(value.toPrecision(12));
    if (Math.abs(clean) >= 10000 || (clean !== 0 && Math.abs(clean) < 0.001)) {
      const shortest = /\.(\d+)e/.exec(clean.toExponential())?.[1].length ?? 0;
      return clean.toExponential(Math.max(1, shortest));
    }
    return String(clean);
  }

  // 凡例の並び(v163)。見せるか: legend() で表示・非表示を書いていればそれ、書いていなければ「系列が2つ以上で
  // ラベルがあれば」(Excel 風)。名前の無い系列は「系列 n」。見せないなら null。
  const CHART_LEGEND_ROW = 22;

  function chartLegendLayout(chart) {
    const setting = chart.legend || { mode: "auto", loc: "right" };
    // 円グラフ(v168)の凡例は分類の名前(扇形の色)で、既定で出す。
    const pie = chart.pie ? chart.series[0] : null;
    const visible = setting.mode === "show"
      || (setting.mode === "auto" && (pie ? pie.slices.length > 0 : chart.series.length >= 2 && chart.series.some((series) => series.label)));
    if (!visible || !chart.series.length) return null;
    const entries = pie
      ? pie.slices.map((slice, index) => ({ name: chartFitText(slice.name, 150), color: CHART_COLORS[index % CHART_COLORS.length] }))
      : chart.series.map((series, index) => ({
        // 長い名前は縮める(分類の目盛と同じ chartFitText。縮め方は1つ。v164)。
        name: chartFitText(String(series.label || "系列 " + (index + 1)), 150),
        color: series.color || CHART_COLORS[index % CHART_COLORS.length],
      })).concat(chart.series.flatMap((series, index) => (series.trend ? [{
        // 近似曲線(v177)は系列の後ろに「名前(二次近似)」などで。見本は破線。
        name: chartFitText(String(series.label || "系列 " + (index + 1)) + "(" + CHART_TREND_NAMES[series.trend.type] + "近似)", 150),
        color: series.color || CHART_COLORS[index % CHART_COLORS.length],
        trend: true,
      }] : [])));
    const widths = entries.map((entry) => chartTextWidth(entry.name) + 22);
    return { loc: setting.loc || "right", entries, widths, width: Math.max(...widths) + 12 };
  }

  // グラフを SVG の文字列にする。保存したHTMLへもこの文字列をそのまま載せる(使う要素は svg・line・rect・circle・
  // polyline・text だけ。保存HTMLの無害化の許可リスト CHART_SVG_TAGS と同じ語彙。新しい要素を足すときは両方へ)。
  function renderChartSvg(chart) {
    const { width, height } = CHART_SIZE;
    const escape = fmt.escapeHtml;
    if (!chart.series.length) {
      const message = chart.errors[0] || "グラフの定義がありません";
      return '<svg class="chart-svg" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="Chart">'
        + '<text x="' + (width / 2) + '" y="' + (height / 2) + '" text-anchor="middle" class="chart-message">'
        + escape(message) + "</text></svg>";
    }
    // 凡例の場所を先に空ける(右・左は幅、上・下は1行ぶん)。
    const legend = chartLegendLayout(chart);
    let { left, right, top, bottom } = CHART_SIZE;
    if (legend?.loc === "right") right += legend.width;
    if (legend?.loc === "left") left += legend.width;
    if (legend?.loc === "top") top += CHART_LEGEND_ROW;
    if (legend?.loc === "bottom") bottom += CHART_LEGEND_ROW;
    // 横棒(v167): 位置(分類・数)は縦の軸、値は横の軸。範囲の計算は縦棒と同じ論理の軸(x=位置・y=値)で行い、画面へ写す
    // 所(sx・sy・目盛り・目盛線・棒)だけ入れ替える。xlim は値の軸、ylim は位置の軸(matplotlib と同じ)。
    const horizontal = Boolean(chart.horizontal);
    // invert_yaxis()(v167): 画面の縦の向きを逆に(縦棒などは値、横棒は位置の軸)。
    const invertY = Boolean(chart.invertY);
    // 横棒の分類の名前は左に並ぶので、名前の幅だけ左を空ける(上限あり。越える分は「…」で縮める)。
    const labelRoom = chart.ylabel ? 18 : 0;
    if (horizontal && chart.categories) {
      const widest = Math.max(...chart.categories.map((name) => chartTextWidth(name)));
      left += Math.max(0, Math.min(CHART_CATEGORY_LEFT_MAX, widest + 14 + labelRoom) - CHART_SIZE.left);
    }
    const categoryRoom = left - (legend?.loc === "left" ? legend.width : 0) - 14 - labelRoom;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const categories = chart.categories;
    const isBar = (series) => series.kind === "bar" || series.kind === "barh";
    // 円グラフ(v168)は軸を持たない(目盛線・xlim・ylim・xlabel・ylabel・invert_yaxis は書いてあっても使わない)。
    if (chart.pie) return renderPieSvg();
    // 軸の範囲を決める。棒グラフとヒストグラムは 0 を含める。
    const xs = [];
    const ys = [];
    chart.series.forEach((series) => {
      if (series.kind === "hist") {
        series.bins.forEach((bin) => {
          xs.push(bin.from, bin.to);
          ys.push(0, bin.count);
        });
        return;
      }
      series.points.forEach((point) => {
        xs.push(point.x);
        ys.push(point.y);
      });
      // 近似曲線(v177)も自動の範囲に入れる(二次の谷などがデータの外へ出ても切れない。Excel と同じ)。描くのと同じ 64 等分。
      if (series.trend) {
        for (let step = 0; step <= 64; step += 1) {
          const y = series.trend.at(series.trend.minX + ((series.trend.maxX - series.trend.minX) * step) / 64);
          if (Number.isFinite(y)) ys.push(y);
        }
      }
      if (isBar(series)) ys.push(0);
    });
    // 軸の範囲(v165): 書いた側(xlim / ylim の下・上)はその値のまま、書いていない側は自動(データ・棒の半間隔・きりのいい目盛り・
    // 上下の余白の規則。v164)。分類の軸では X の範囲は使わない。
    const xLim = categories ? null : (horizontal ? chart.ylim : chart.xlim);
    const yLim = horizontal ? chart.xlim : chart.ylim;
    const fixed = (lim, side) => lim && lim[side] !== null && lim[side] !== undefined;
    let xMin = minOfValues(xs);
    let xMax = maxOfValues(xs);
    let yMin = minOfValues(ys);
    let yMax = maxOfValues(ys);
    // 数の X の縦棒(v164。matplotlib と同じ): 棒は X の値を中心に、幅は「隣り合う X の最小の間隔×0.7」(系列が複数なら
    // 系列の数で割って並べる)。端の棒がはみ出さないよう、X の軸を半間隔ぶん広げる。以前は並びの番号の位置に描いており、
    // Y の途中が空欄だと後ろの棒が左へ詰まって目盛りとずれた。
    const numericBarXs = categories ? [] : [...new Set(chart.series.filter(isBar)
      .flatMap((series) => series.points.map((point) => point.x)))].sort((a, b) => a - b);
    let barGap = 1;
    if (numericBarXs.length > 1) {
      barGap = minOfValues(numericBarXs.slice(1).map((value, index) => value - numericBarXs[index]));
    }
    if (numericBarXs.length) {
      xMin = Math.min(xMin, numericBarXs[0] - barGap / 2);
      xMax = Math.max(xMax, numericBarXs[numericBarXs.length - 1] + barGap / 2);
    }
    if (fixed(xLim, "min")) xMin = xLim.min;
    if (fixed(xLim, "max")) xMax = xLim.max;
    if (fixed(yLim, "min")) yMin = yLim.min;
    if (fixed(yLim, "max")) yMax = yLim.max;
    // 片側だけ書いて、自動の側が書いた側を越えた(例: ylim(100, ) でデータが 100 未満)ときは、自動の側を書いた側から離す。
    const separate = (min, max, lim) => {
      if (min < max) return [min, max];
      const span = Math.abs(fixed(lim, "min") ? min : max) || 1;
      if (fixed(lim, "min") && !fixed(lim, "max")) return [min, min + span];
      if (fixed(lim, "max") && !fixed(lim, "min")) return [max - span, max];
      return [min - 1, max + 1];
    };
    [xMin, xMax] = separate(xMin, xMax, xLim);
    [yMin, yMax] = separate(yMin, yMax, yLim);
    // 目盛りのきりのいい値まで広げる(自動の側だけ)。
    const xTicksAll = categories ? [] : niceTicks(xMin, xMax);
    const yTicksAll = niceTicks(yMin, yMax);
    // 自動の上端は目盛りの値にする(Excel と同じ)。niceTicks は最後の目盛りを「最大値 + 半目盛り」までしか作らないので、
    // 最大値が最後の目盛りを越える(210 で目盛りが 200 まで)ときは、越えるまで目盛りを足す。以前は上端がデータの値ちょうどになり、
    // いちばん高い棒が枠の上端に付いていた(v167。PdM 実測の不具合)。下端は niceTicks が最小値以下から始めるので足りている。
    // 間隔が 0・無限・NaN なら足さない。足す数にも上限を置く(どんな値でもループが終わらないことは無い。v213)。
    if (!fixed(yLim, "max") && yTicksAll.length > 1) {
      const step = yTicksAll[1] - yTicksAll[0];
      if (step > 0 && Number.isFinite(step)) {
        while (yTicksAll.length < CHART_TICK_LIMIT && yTicksAll[yTicksAll.length - 1] < yMax - step * 1e-9) {
          yTicksAll.push(roundChartTick(yTicksAll[yTicksAll.length - 1] + step, step));
        }
      }
    }
    // 自動の Y 軸は、最大値(最小値)がちょうど端の目盛りに乗るとき、もう1目盛り外へ広げて余白を作る(Excel と同じく、
    // いちばん高い棒が上端に貼り付かない。v164)。0 を跨いで広げない(0 から立つ棒の下に負の目盛りを作らない)。
    // 範囲を書いた側(ylim の下・上)は、書いた値に従う。
    if (yTicksAll.length > 1) {
      const step = yTicksAll[1] - yTicksAll[0];
      const epsilon = step * 1e-9;
      const last = yTicksAll[yTicksAll.length - 1];
      const first = yTicksAll[0];
      if (!fixed(yLim, "max") && Math.abs(last - yMax) <= epsilon && !(last < 0 && last + step > 0) && !(last === 0 && yMin < 0)) {
        yTicksAll.push(roundChartTick(last + step, step));
      }
      if (!fixed(yLim, "min") && Math.abs(first - yMin) <= epsilon && !(first >= 0 && first - step < 0)) {
        yTicksAll.unshift(roundChartTick(first - step, step));
      }
    }
    if (!categories) {
      if (!fixed(xLim, "min")) xMin = Math.min(xMin, xTicksAll[0]);
      if (!fixed(xLim, "max")) xMax = Math.max(xMax, xTicksAll[xTicksAll.length - 1]);
    }
    if (!fixed(yLim, "min")) yMin = Math.min(yMin, yTicksAll[0]);
    if (!fixed(yLim, "max")) yMax = Math.max(yMax, yTicksAll[yTicksAll.length - 1]);
    // 書いた範囲の外の目盛りは出さない。
    const inside = (min, max) => (tick) => tick >= min - Math.abs(max - min) * 1e-9 && tick <= max + Math.abs(max - min) * 1e-9;
    const xTicks = xTicksAll.filter(inside(xMin, xMax));
    const yTicks = yTicksAll.filter(inside(yMin, yMax));
    // 分類の軸は等間隔の枠(slot)。n 番目の分類は枠の真ん中。
    const slot = categories ? (horizontal ? plotHeight : plotWidth) / Math.max(1, categories.length) : 0;
    // sx: 位置 → 画面(縦棒は横方向、横棒は縦方向)。sy: 値 → 画面(縦棒は縦方向、横棒は横方向)。
    // 横棒の分類は表の順に**上から**並べる(表の上の行がグラフでも上。PdM 判断。Excel・matplotlib の既定は下から)。
    // 数の位置は、数の軸の向きどおり下から上へ増える。
    const sx = (value) => {
      if (horizontal) {
        const offset = categories ? slot * (value + 0.5) : ((value - xMin) / (xMax - xMin)) * plotHeight;
        // 分類は上端から、数は下端から。invert_yaxis() でどちらも逆。
        return Boolean(categories) !== invertY ? top + offset : top + plotHeight - offset;
      }
      return categories ? left + slot * (value + 0.5) : left + ((value - xMin) / (xMax - xMin)) * plotWidth;
    };
    const sy = (value) => {
      if (horizontal) return left + ((value - yMin) / (yMax - yMin)) * plotWidth;
      const offset = ((value - yMin) / (yMax - yMin)) * plotHeight;
      return invertY ? top + offset : top + plotHeight - offset;
    };

    const parts = [];
    parts.push('<svg class="chart-svg" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="'
      + escape(chart.title || "Chart") + '">');
    // 目盛線(v163): "y" 横・"x" 縦・"both"・"none"(画面の向き。既定は値の軸の線)。分類の軸の線は枠の境目に引く。
    const positionLines = categories
      ? categories.map((item, index) => (horizontal ? top : left) + slot * index).concat(horizontal ? top + plotHeight : left + plotWidth)
      : xTicks.map(sx);
    const valueLines = yTicks.map(sy);
    if (chart.grid === "x" || chart.grid === "both") {
      (horizontal ? valueLines : positionLines).forEach((x) => {
        parts.push('<line class="chart-grid" x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + (top + plotHeight) + '"/>');
      });
    }
    if (chart.grid === "y" || chart.grid === "both") {
      (horizontal ? positionLines : valueLines).forEach((y) => {
        parts.push('<line class="chart-grid" x1="' + left + '" y1="' + y + '" x2="' + (left + plotWidth)
          + '" y2="' + y + '"/>');
      });
    }
    // 軸
    parts.push('<line class="chart-axis" x1="' + left + '" y1="' + (top + plotHeight) + '" x2="' + (left + plotWidth)
      + '" y2="' + (top + plotHeight) + '"/>');
    parts.push('<line class="chart-axis" x1="' + left + '" y1="' + top + '" x2="' + left
      + '" y2="' + (top + plotHeight) + '"/>');
    // 目盛りの文字。縦棒などは位置が下・値が左、横棒は位置(分類の名前)が左・値が下。
    const bottomTick = (x, text) => parts.push('<text class="chart-tick" x="' + x + '" y="' + (top + plotHeight + 16)
      + '" text-anchor="middle">' + escape(text) + "</text>");
    const leftTick = (y, text) => parts.push('<text class="chart-tick" x="' + (left - 8) + '" y="' + (y + 4)
      + '" text-anchor="end">' + escape(text) + "</text>");
    const positionTick = horizontal ? leftTick : bottomTick;
    const valueTick = horizontal ? bottomTick : leftTick;
    if (categories) {
      categories.forEach((name, index) => positionTick(sx(index), chartFitText(name, horizontal ? Math.max(14, categoryRoom) : Math.max(14, slot - 6))));
    } else {
      xTicks.forEach((tick) => positionTick(sx(tick), formatTick(tick)));
    }
    yTicks.forEach((tick) => valueTick(sy(tick), formatTick(tick)));
    // 題名・軸の名前も凡例と同じく、収まらない分は「…」で縮める(v252。Issue #108。以前は長いと枠の外へ出て両端が切れた)。
    // 題名は 13px の太字なので、目安の幅(chartTextWidth は 12px の字)を 1.15 倍で見る。
    if (chart.title) {
      parts.push('<text class="chart-title" x="' + (width / 2) + '" y="20" text-anchor="middle">'
        + escape(chartFitText(chart.title, (width - 16) / 1.15)) + "</text>");
    }
    if (chart.xlabel) {
      parts.push('<text class="chart-label" x="' + (left + plotWidth / 2) + '" y="'
        + (height - 8 - (legend?.loc === "bottom" ? CHART_LEGEND_ROW : 0))
        + '" text-anchor="middle">' + escape(chartFitText(chart.xlabel, plotWidth)) + "</text>");
    }
    if (chart.ylabel) {
      parts.push('<text class="chart-label" transform="translate(' + (14 + (legend?.loc === "left" ? legend.width : 0)) + ","
        + (top + plotHeight / 2) + ') rotate(-90)" text-anchor="middle">' + escape(chartFitText(chart.ylabel, plotHeight)) + "</text>");
    }
    // 枠(描ける範囲)で切る(v165)。範囲を書いたとき、外のデータは枠の外へ描かない(matplotlib と同じ)。
    const plotRect = { left, right: left + plotWidth, top, bottom: top + plotHeight };
    const insidePlot = (x, y) => x >= plotRect.left - 0.5 && x <= plotRect.right + 0.5 && y >= plotRect.top - 0.5 && y <= plotRect.bottom + 0.5;
    const clipRect = (x1, y1, x2, y2) => {
      const l = Math.max(Math.min(x1, x2), plotRect.left);
      const r = Math.min(Math.max(x1, x2), plotRect.right);
      const t = Math.max(Math.min(y1, y2), plotRect.top);
      const b = Math.min(Math.max(y1, y2), plotRect.bottom);
      return r > l && b >= t ? { x: l, y: t, width: r - l, height: b - t } : null;
    };
    // 線分を枠で切る(Liang–Barsky)。枠の外なら null。
    const clipSegment = (x1, y1, x2, y2) => {
      let t0 = 0;
      let t1 = 1;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const edges = [[-dx, x1 - plotRect.left], [dx, plotRect.right - x1], [-dy, y1 - plotRect.top], [dy, plotRect.bottom - y1]];
      for (const [p, q] of edges) {
        if (p === 0) {
          if (q < 0) return null;
          continue;
        }
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) return null;
      }
      return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
    };
    // データラベル(v165)。文字は表のセルの表示と同じ。重なっても間引かない(PdM 既定案)。
    const valueLabel = (x, y, text, inside = false, anchor = "middle") => {
      parts.push('<text class="chart-value' + (inside ? " chart-value-inside" : "") + '" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '">'
        + escape(text) + "</text>");
    };
    // ラベル(高さ約 10px、基準線は文字の下)が枠の上下に収まるか。
    const labelFits = (baseline) => baseline - 10 >= plotRect.top - 0.5 && baseline <= plotRect.bottom + 0.5;
    // 系列。色は系列の color、無ければ既定の配色(CHART_COLORS。配色の表は1つ。P20)を系列の順に。
    const barSeries = chart.series.filter(isBar);
    chart.series.forEach((series, index) => {
      const color = series.color || CHART_COLORS[index % CHART_COLORS.length];
      if (series.kind === "hist") {
        series.bins.forEach((bin) => {
          const box = clipRect(sx(bin.from) + 1, sy(bin.count), sx(bin.to) - 1, sy(0));
          if (!box) return;
          parts.push('<rect class="chart-bar" x="' + box.x + '" y="' + box.y + '" width="' + Math.max(1, box.width)
            + '" height="' + box.height + '" fill="' + color + '"/>');
        });
        return;
      }
      if (isBar(series)) {
        // 棒が複数あれば、枠の中で並べる(重ねない。縦棒は横に、横棒は縦に。v163・v167)。
        const group = barSeries.length;
        const order = barSeries.indexOf(series);
        // 1本(系列が複数ならその組)が占める幅。分類の軸は枠の幅、数の軸は隣り合う位置の最小の間隔を画面の幅にしたもの。
        const width1 = categories ? slot : Math.abs(sx(barGap) - sx(0));
        const each = (width1 * 0.7) / group;
        if (horizontal) {
          series.points.forEach((point) => {
            // 組の中心は分類の枠の真ん中/位置の値。その中で系列の順に上から並べる。
            const y = sx(point.x) - width1 * 0.35 + each * order;
            const end = sy(point.y);
            const box = clipRect(sy(0), y, end, y + each);
            if (!box) return;
            parts.push('<rect class="chart-bar" x="' + box.x + '" y="' + box.y + '" width="' + box.width
              + '" height="' + box.height + '" fill="' + color + '"/>');
            // 値は棒の先(正なら右、負なら左)。枠からはみ出すときは棒の中の先端に白い文字で。値が範囲の外なら出さない。
            if (series.values && insidePlot(end, y + each / 2)) {
              const text = point.text ?? formatTick(point.y);
              const room = chartTextWidth(text);
              const baseline = y + each / 2 + 3.5;
              const positive = point.y >= 0;
              const outside = positive ? end + 4 : end - 4;
              const inside = positive ? end - 4 : end + 4;
              const fits = (x, anchor) => (anchor === "start" ? x + room <= plotRect.right + 0.5 : x - room >= plotRect.left - 0.5);
              if (fits(outside, positive ? "start" : "end")) valueLabel(outside, baseline, text, false, positive ? "start" : "end");
              else if (fits(inside, positive ? "end" : "start")) valueLabel(inside, baseline, text, true, positive ? "end" : "start");
            }
          });
          return;
        }
        series.points.forEach((point) => {
          // 組の中心は分類の枠の真ん中/X の値。その中で系列の順に並べる。
          const x = sx(point.x) - width1 * 0.35 + each * order;
          const y = sy(point.y);
          const box = clipRect(x, y, x + each, sy(0));
          if (!box) return;
          parts.push('<rect class="chart-bar" x="' + box.x + '" y="' + box.y + '" width="' + box.width
            + '" height="' + box.height + '" fill="' + color + '"/>');
          // 値は棒の先(正なら上、負なら下)。値そのものが範囲の外なら出さない。
          // 枠からはみ出すとき(ylim で余白を消したときなど)は、棒の中の先端に白い文字で置く。
          if (series.values && insidePlot(x + each / 2, y)) {
            // 棒が上へ伸びるか(正の値。invert_yaxis() なら逆)。値は伸びた先に置く。
            const up = (point.y >= 0) !== invertY;
            const outside = up ? y - 4 : y + 12;
            const inside = up ? y + 12 : y - 4;
            if (labelFits(outside)) valueLabel(x + each / 2, outside, point.text ?? formatTick(point.y));
            else if (labelFits(inside)) valueLabel(x + each / 2, inside, point.text ?? formatTick(point.y), true);
          }
        });
        return;
      }
      if (series.kind === "plot") {
        // 値なしの所で線を切る(segment ごとに1本。点が1つだけの区間は点だけ)。
        const segments = new Map();
        series.points.forEach((point) => {
          if (!segments.has(point.segment)) segments.set(point.segment, []);
          segments.get(point.segment).push(point);
        });
        // 線は枠で切る(枠の外の部分は描かず、切れた所で線を分ける)。
        segments.forEach((run) => {
          let current = [];
          const flush = () => {
            if (current.length >= 2) {
              parts.push('<polyline class="chart-line" points="' + current.map(([x, y]) => x + "," + y).join(" ")
                + '" fill="none" stroke="' + color + '"/>');
            }
            current = [];
          };
          for (let index = 1; index < run.length; index += 1) {
            const clipped = clipSegment(sx(run[index - 1].x), sy(run[index - 1].y), sx(run[index].x), sy(run[index].y));
            if (!clipped) {
              flush();
              continue;
            }
            const last = current[current.length - 1];
            if (!last || Math.abs(last[0] - clipped[0]) > 0.01 || Math.abs(last[1] - clipped[1]) > 0.01) {
              flush();
              current.push([clipped[0], clipped[1]]);
            }
            current.push([clipped[2], clipped[3]]);
          }
          flush();
        });
      }
      series.points.forEach((point) => {
        const cx = sx(point.x);
        const cy = sy(point.y);
        // 枠の外の点は描かない。
        if (!insidePlot(cx, cy)) return;
        parts.push('<circle class="chart-point" cx="' + cx + '" cy="' + cy + '" r="3.2" fill="' + color + '"/>');
        // 点の上が枠からはみ出すときは点の下に置く。
        if (series.values) {
          if (labelFits(cy - 7)) valueLabel(cx, cy - 7, point.text ?? formatTick(point.y));
          else if (labelFits(cy + 16)) valueLabel(cx, cy + 16, point.text ?? formatTick(point.y));
        }
      });
    });
    // 近似曲線(v177): 系列の色の破線で、その系列の X の最小から最大まで(Excel と同じく外へは延ばさない)。曲線は 64 等分した
    // 点を結ぶ。枠で切り、切れた所で線を分ける(折れ線と同じ)。式・R² は枠の左上から系列の順に1行ずつ(見本の破線 + 文字)。
    // データと重なっても動かさない(位置は固定。PdM 既定案)。
    const trendTexts = [];
    chart.series.forEach((series, index) => {
      const trend = series.trend;
      if (!trend) return;
      const color = series.color || CHART_COLORS[index % CHART_COLORS.length];
      const steps = trend.type === "linear" ? 1 : 64;
      const samples = [];
      for (let step = 0; step <= steps; step += 1) {
        const x = trend.minX + ((trend.maxX - trend.minX) * step) / steps;
        const y = trend.at(x);
        if (Number.isFinite(y)) samples.push([sx(x), sy(y)]);
      }
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          parts.push('<polyline class="chart-trend" points="' + run.map(([x, y]) => x + "," + y).join(" ")
            + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-dasharray="6 4"/>');
        }
        run = [];
      };
      for (let k = 1; k < samples.length; k += 1) {
        const clipped = clipSegment(samples[k - 1][0], samples[k - 1][1], samples[k][0], samples[k][1]);
        if (!clipped) {
          flush();
          continue;
        }
        const last = run[run.length - 1];
        if (!last || Math.abs(last[0] - clipped[0]) > 0.01 || Math.abs(last[1] - clipped[1]) > 0.01) {
          flush();
          run.push([clipped[0], clipped[1]]);
        }
        run.push([clipped[2], clipped[3]]);
      }
      flush();
      const text = chartTrendText(trend);
      if (text) trendTexts.push({ text, color });
    });
    trendTexts.forEach(({ text, color }, order) => {
      const y = top + 14 + order * 15;
      parts.push('<line class="chart-trend-swatch" x1="' + (left + 8) + '" y1="' + (y - 4) + '" x2="' + (left + 26) + '" y2="' + (y - 4)
        + '" stroke="' + color + '" stroke-width="1.6" stroke-dasharray="6 4"/>');
      parts.push('<text class="chart-legend chart-trend-text" x="' + (left + 30) + '" y="' + y + '">' + escape(text) + "</text>");
    });
    drawLegend(parts);
    parts.push("</svg>");
    return parts.join("");

    // 円グラフ(v168)。12時の位置から時計回り(Excel の既定)。扇形は分類ごとに既定の配色(CHART_COLORS)。扇形の輪郭は
    // path の d で、使う語彙は M・L・A・Z と数・空白・負号・小数点だけ(保存HTMLの無害化がこの語彙だけを通す)。
    function renderPieSvg() {
      const series = chart.series[0];
      const out = [];
      out.push('<svg class="chart-svg" viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="'
        + escape(chart.title || "Chart") + '">');
      const areaLeft = (legend?.loc === "left" ? legend.width : 0) + 16;
      const areaRight = width - right;
      const cx = (areaLeft + areaRight) / 2;
      const cy = top + plotHeight / 2;
      const radius = Math.max(10, Math.min(areaRight - areaLeft, plotHeight) / 2 - 4);
      // 座標は小数2桁まで(指数表記を出さない)。
      const coord = (value) => String(Math.round(value * 100) / 100);
      // 角度は12時から時計回りに測る。startangle(3時から反時計回りに測る matplotlib の角度)を、この測り方に直す。
      const at = (angle, distance) => [cx + distance * Math.sin(angle), cy - distance * Math.cos(angle)];
      const base = ((90 - series.startAngle) * Math.PI) / 180;
      const direction = series.counterclock ? -1 : 1;
      const arcs = [];
      let angle = 0;
      series.slices.forEach((slice, index) => {
        const sweep = (slice.value / series.total) * Math.PI * 2;
        const start = angle;
        angle += sweep;
        // 0 の値は扇形を描かない(凡例には出る)。
        if (slice.value <= 0) return;
        arcs.push({ slice, index, start: base + direction * start, sweep });
      });
      arcs.forEach(({ index, start, sweep }) => {
        // 弧はいつも半分(π)以下にする: 半分を越える扇は中点で2本の弧に分ける(large-arc は常に 0。向きのフラグは時計回りが 1)。
        // 1本の大きな弧だと、ほぼ 100% の扇([1000000, 1] など)で始点と終点が小数2桁の丸めで同じ点になり、SVG が弧を描かず、
        // いちばん大きい扇が丸ごと消えていた(v169。TL M監査)。100% の扇(描く扇が1つ)も同じ式で描ける(半円2本)。
        const flag = direction > 0 ? 1 : 0;
        const arcTo = (angle) => {
          const [x, y] = at(angle, radius);
          return " A " + coord(radius) + " " + coord(radius) + " 0 0 " + flag + " " + coord(x) + " " + coord(y);
        };
        const [x1, y1] = at(start, radius);
        // 扇が円全体(描く扇が1つ)なら中心を通らず、始まりの点から弧だけで描く(中心から12時への半径の線を描かない。v170)。
        const whole = sweep >= Math.PI * 2 - 1e-9;
        const d = (whole ? "M " + coord(x1) + " " + coord(y1) : "M " + coord(cx) + " " + coord(cy) + " L " + coord(x1) + " " + coord(y1))
          + (sweep > Math.PI ? arcTo(start + (direction * sweep) / 2) : "") + arcTo(start + direction * sweep) + " Z";
        out.push('<path class="chart-slice" d="' + d + '" fill="' + CHART_COLORS[index % CHART_COLORS.length] + '" stroke="#ffffff"/>');
      });
      // データラベル: values=True は値(表のセルの表示と同じ)、autopct は割合。扇形の中(半径の 0.62)に白い文字で。重なっても間引かない。
      if (series.values || series.percentDigits !== null) {
        arcs.forEach(({ slice, start, sweep }) => {
          const value = series.values ? slice.text ?? formatTick(slice.value) : "";
          const percent = series.percentDigits !== null ? ((slice.value / series.total) * 100).toFixed(series.percentDigits) + "%" : "";
          const text = value && percent ? value + "(" + percent + ")" : value || percent;
          const [x, y] = at(start + (direction * sweep) / 2, sweep >= Math.PI * 2 - 1e-9 ? 0 : radius * 0.62);
          out.push('<text class="chart-value chart-value-inside" x="' + coord(x) + '" y="' + coord(y + 3.5) + '" text-anchor="middle">'
            + escape(text) + "</text>");
        });
      }
      if (chart.title) {
        out.push('<text class="chart-title" x="' + (width / 2) + '" y="20" text-anchor="middle">' + escape(chartFitText(chart.title, (width - 16) / 1.15)) + "</text>");
      }
      drawLegend(out);
      out.push("</svg>");
      return out.join("");
    }

    // 凡例(v163): 右・左は縦に、上・下は横に1行で並べる。
    function drawLegend(parts) {
      if (!legend) return;
      const item = (x, y, entry) => {
        if (entry.trend) {
          parts.push('<line class="chart-trend-swatch" x1="' + x + '" y1="' + (y - 4) + '" x2="' + (x + 10) + '" y2="' + (y - 4)
            + '" stroke="' + entry.color + '" stroke-width="1.6" stroke-dasharray="3 2"/>');
        } else {
          parts.push('<rect class="chart-legend-swatch" x="' + x + '" y="' + (y - 9) + '" width="10" height="10" fill="' + entry.color + '"/>');
        }
        parts.push('<text class="chart-legend" x="' + (x + 14) + '" y="' + y + '">' + escape(entry.name) + "</text>");
      };
      if (legend.loc === "right" || legend.loc === "left") {
        const x = legend.loc === "right" ? left + plotWidth + 14 : 10;
        legend.entries.forEach((entry, index) => item(x, top + 12 + index * 16, entry));
      } else {
        const total = legend.widths.reduce((sum, value) => sum + value, 0);
        let x = Math.max(8, (width - total) / 2);
        const y = legend.loc === "top" ? CHART_SIZE.top + 10 : height - 6;
        legend.entries.forEach((entry, index) => {
          item(x, y, entry);
          x += legend.widths[index];
        });
      }
    }
  }

  // ---- 表を読む道具 ----
  // tableFormula: TableFormula.create の道具。範囲の値は、表の式と同じ計算・同じ列挙(rectGroupCells)で読む。
  function create({ tableFormula }) {
    const { withTableCalcPass, tableCalc, rawTableCellText, tableCellNumber, rectGroupCells, rectNumberValues, tableCellResult } = tableFormula;
    // 範囲の数だけの並び(ヒストグラム用)。列挙は式の範囲参照と同じ共通1箇所(rectNumberValues → rectGroupCells)。
    // 結合グループは1回だけ数え、セル単位のエラー(循環など)は握りつぶして他を描く(lenient)。
    function chartRangeValues(block, range) {
      const rect = chartRangeRect(range);
      return rect ? withTableCalcPass(() => rectNumberValues(block, rect, new Set(), null, true, tableCalc(block))) : [];
    }

    // 範囲の**位置の並び**(v163)。セル(結合グループは1つ)ごとに、表示の文字と数(数として読めなければ null)の組。
    // X と Y はこの並びの**同じ位置同士**で組にする(数だけを詰めた並びで組にすると、Y の途中の空欄で後ろが1つずつずれる)。
    // 列挙は rectGroupCells(P25)。
    // 表の計算の通しの中で読む(v221。以前はセルごとに表全体を整え直していた)。
    function chartRangeEntries(block, range) {
      const rect = chartRangeRect(range);
      if (!rect) return [];
      return withTableCalcPass(() => {
        const calc = tableCalc(block);
        return rectGroupCells(block, rect, null, calc).map(({ rowIndex, cellIndex, origin }) => {
          let number = null;
          try {
            number = tableCellNumber(block, rowIndex, cellIndex, new Set(), calc);
          } catch {
            number = null;
          }
          const at = origin || { rowIndex, cellIndex };
          return { text: String(tableCellResult(block, at.rowIndex, at.cellIndex, calc) ?? "").trim(), number };
        });
      });
    }

    // グラフが読む表を決める。指定がなければ、上にある一番近い表。
    // セルの文字と、「数として読めない、空でない文字」か(範囲選択の見出しの判定・グラフの見本の見出しと分類の判定で共用。
    // 数として読めるかは表の数の判定 tableCellNumber と1つ。「1,000」や式の結果も数。P25。v161・v170)。
    function chartCellText(table, rowIndex, cellIndex) {
      return String(rawTableCellText(table, rowIndex, cellIndex) ?? "").trim();
    }

    function isChartTextCell(table, rowIndex, cellIndex) {
      if (!chartCellText(table, rowIndex, cellIndex)) return false;
      try {
        return tableCellNumber(table, rowIndex, cellIndex, new Set()) === null;
      } catch {
        return true;
      }
    }

    // グラフの見本の系列の行を、読む表から作る(v170。グラフを作るとき。系列がまだ無いグラフの「系列を追加」も)。以前は固定の
    // scatter(A1:A10, B1:B10) で、見出しのある表の下では最初から「散布図の X は数で…」のエラーになっていた。
    //   - 見出しの行: 見出しを宣言した表は1行目。宣言が無ければ、値の列の1行目が文字なら見出し(範囲選択と同じ規則)
    //   - 範囲はデータの行だけ(見出しの次の行から、A か値の列に文字がある最後の行まで)
    //   - A 列に文字があれば縦棒(分類の軸)、すべて数なら散布図
    //   - ラベルは値の列の見出し
    // 値の列は B。B に数が無ければ、右へ数のある列を探し、無ければ B。表が使えなければ null。
    function chartSampleFromTable(table) {
      // 表の計算の通し(v221): 列を上から順に読むので、行を整えるのは1回にする。
      return withTableCalcPass(() => chartSampleFromTableInPass(table));
    }

    function chartSampleFromTableInPass(table) {
      const column = 1;
      const rows = table?.rows || [];
      const columns = Math.max(0, ...rows.map((row) => row.length));
      if (rows.length < 1 || columns < 2) return null;
      const dataColumn = (index) => {
        const header = table.tableHeader || isChartTextCell(table, 0, index) ? 1 : 0;
        for (let row = header; row < rows.length; row += 1) {
          if (!isChartTextCell(table, row, index) && chartCellText(table, row, index)) return true;
        }
        return false;
      };
      let valueColumn = Math.min(Math.max(1, column), columns - 1);
      while (valueColumn < columns && !dataColumn(valueColumn)) valueColumn += 1;
      if (valueColumn >= columns) valueColumn = 1;
      const headerRow = table.tableHeader || isChartTextCell(table, 0, valueColumn);
      const top = headerRow ? 1 : 0;
      let bottom = -1;
      for (let row = top; row < rows.length; row += 1) {
        if (chartCellText(table, row, 0) || chartCellText(table, row, valueColumn)) bottom = row;
      }
      if (bottom < top) return null;
      let categorical = false;
      for (let row = top; row <= bottom; row += 1) if (isChartTextCell(table, row, 0)) categorical = true;
      const name = (text) => String(text || "").replaceAll('"', "");
      const xHeader = headerRow ? name(chartCellText(table, 0, 0)) : "";
      const yHeader = headerRow ? name(chartCellText(table, 0, valueColumn)) : "";
      const seriesKind = categorical ? "bar" : "scatter";
      // ヒストグラムは値の列だけ(区間は値から作る)。
      const valueRange = formulaRangeRef(top, valueColumn, bottom, valueColumn);
      const args = isHistKind(seriesKind) ? [valueRange] : [formulaRangeRef(top, 0, bottom, 0), valueRange];
      if (yHeader) args.push('label="' + yHeader + '"');
      return { line: seriesKind + "(" + args.join(", ") + ")", xHeader, yHeader };
    }

    // 「系列を追加」の行(v170。PdM。Excel が系列を足すときと同じ考え方): X は前の系列と同じ範囲、値はまだどの系列にも使われて
    // いない最初の列(使われていない列が無ければ最後の列。エラーにはしない=GUI で直せる)、行は X と同じ、種類は前の系列、
    // ラベルはその列の見出し(見出しの判定は isChartTextCell)。系列がまだ無ければ見本の行(chartSampleFromTable)。
    function chartAddSeriesLine(table, series) {
      const last = series.at(-1);
      if (!last) return chartSampleFromTable(table)?.line || null;
      const columns = Math.max(0, ...(table?.rows || []).map((row) => row.length));
      const xRect = chartRangeRect(String(last.x || "").trim().toUpperCase());
      if (!table || !xRect || columns < 1) return null;
      const used = new Set();
      series.forEach((entry) => [entry.x, entry.y].forEach((text) => {
        const rect = chartRangeRect(String(text || "").trim().toUpperCase());
        if (rect) for (let column = rect.left; column <= rect.right; column += 1) used.add(column);
      }));
      let column = [...Array(columns).keys()].find((index) => !used.has(index));
      if (column === undefined) column = columns - 1;
      const kind = chartKindOf(last.kind);
      const valueRange = formulaRangeRef(xRect.top, column, xRect.bottom, column);
      const headerRow = xRect.top - 1;
      const header = headerRow >= 0 && ((table.tableHeader && headerRow === 0) || isChartTextCell(table, headerRow, column))
        ? chartCellText(table, headerRow, column).replaceAll('"', "") : "";
      const args = isHistKind(kind) ? [valueRange] : [last.x, valueRange];
      if (header) args.push('label="' + header + '"');
      return kind + "(" + args.join(", ") + ")";
    }

    // 新しいグラフの見本の全体(系列の行+題名・軸の名前)。読む表が無ければ固定の見本(CHART_SAMPLE)。
    function chartSampleText(chartBlock, blocks) {
      const sample = chartSampleFromTable(chartSourceTable(chartBlock, [], blocks));
      if (!sample) return CHART_SAMPLE;
      return [
        sample.line,
        'title("' + (sample.yHeader || "グラフ") + '")',
        'xlabel("' + (sample.xHeader || "横軸") + '")',
        'ylabel("' + (sample.yHeader || "縦軸") + '")',
      ].join("\n");
    }

    // グラフを組み立てる。途中で投げても(想定外の値など)、そのグラフのエラーとして返す(v213)。投げたままにすると
    // 文書を開くときの描画ごと止まり、ほかのブロックまで見えなくなる。
    function buildChart(chartBlock, blocks) {
      try {
        // 表の計算の通し(v221): 同じ表の範囲を何度読んでも、行を整えるのもセルの計算も1回。
        return withTableCalcPass(() => buildChartUnguarded(chartBlock, blocks));
      } catch (error) {
        return {
          title: "", xlabel: "", ylabel: "", grid: "y", legend: { mode: "auto", loc: "right" },
          xlim: null, ylim: null, invertY: false, categories: null, series: [],
          errors: ["グラフを組み立てられませんでした: " + String(error?.message || error)],
          table: null,
        };
      }
    }

    function buildChartUnguarded(chartBlock, blocks) {
      const calls = parseChartSpec(chartBlock.text);
      const table = chartSourceTable(chartBlock, calls, blocks);
      const chart = {
        title: "",
        xlabel: "",
        ylabel: "",
        // 目盛線の既定は Excel と同じく横だけ(v163)。
        grid: "y",
        // 凡例の既定は「系列が2つ以上でラベルがあれば、右に」(v163)。
        legend: { mode: "auto", loc: "right" },
        xlim: null,
        ylim: null,
        // invert_yaxis()(v167): 縦の軸を逆向きに。
        invertY: false,
        // 分類の軸(X が文字のとき)の見出し。null なら数の軸(v163)。
        categories: null,
        series: [],
        errors: [],
        table,
      };
      if (!calls.length) {
        chart.errors.push("グラフの定義を書いてください（例: scatter(A1:A10, B1:B10)）");
        return chart;
      }
      // 向き(縦・横棒・円)は、最初の系列の行で**先に**決める(書きかけでエラーになった行でも。1行目を打っている途中で向きが
      // 揺れない)。向きの違う系列は、範囲を読む前に落とす(分類にも入れない。落とした系列の分類が空の枠で残らない)(v168。TL の記録)。
      const firstSeries = calls.find((call) => call.name && CHART_KINDS.has(call.name));
      const layout = chartLayoutOf(firstSeries?.name);
      chart.horizontal = layout === "horizontal";
      chart.pie = layout === "pie";
      // 円では軸まわりの設定は効かない(書いてあっても使わない。エラーにもしない)。効いていないことはコードの帯に出す(P22。v168)。
      const AXIS_ONLY = new Set(["grid", "xlim", "ylim", "xlabel", "ylabel", "invert_yaxis"]);
      chart.ineffective = chart.pie ? calls.filter((call) => AXIS_ONLY.has(call.name)).length : 0;
      const mixMessage = (name) => {
        if (layout === "pie") return "円グラフ(pie)のグラフに" + CHART_KIND_NAMES[chartKindOf(name)] + "は混ぜられません";
        if (name === "pie") return "円グラフ(pie)はほかの種類と1つのグラフに混ぜられません";
        return layout === "horizontal"
          ? "横棒(barh)のグラフに" + CHART_KIND_NAMES[chartKindOf(name)] + "は混ぜられません(軸の向きが違います)"
          : "横棒(barh)はほかの種類と1つのグラフに混ぜられません(軸の向きが違います)";
      };
      // grid(...) を書いたか(横棒の既定の目盛線は値の軸=縦の線。書いていなければ向きで決める。v167)。
      let gridWritten = false;
      calls.forEach((call) => {
        if (!call.name) {
          chart.errors.push("読めない行: " + call.source);
          return;
        }
        const text = (arg) => (arg?.type === "string" || arg?.type === "word" ? String(arg.value) : "");
        if (call.name === "title") return void (chart.title = text(call.args[0]));
        if (call.name === "xlabel") return void (chart.xlabel = text(call.args[0]));
        if (call.name === "ylabel") return void (chart.ylabel = text(call.args[0]));
        if (call.name === "grid") {
          const grid = chartGridSetting(call);
          if (grid === null) chart.errors.push("目盛線の指定が読めません: " + call.source + '(grid("y")・grid("x")・grid("both")・grid(False))');
          else {
            chart.grid = grid;
            gridWritten = true;
          }
          return;
        }
        if (call.name === "legend") {
          const legend = chartLegendSetting(call);
          if (legend === null) chart.errors.push('凡例の指定が読めません: ' + call.source + '(legend(loc="right")・legend(False) など)');
          else chart.legend = legend;
          return;
        }
        if (call.name === "xlim" || call.name === "ylim") {
          // 軸の範囲(v165)。読めない形・下 ≥ 上は見える形のエラー(P22)。
          const strict = chartLimitSetting(call);
          const limit = strict || chartLimitSetting(call, { partial: true });
          const axis = call.name === "xlim" ? "X" : "Y";
          const sides = call.name === "xlim" ? "left=…・right=…" : "bottom=…・top=…";
          if (!strict) {
            chart.errors.push(axis + " の範囲の指定が読めません: " + call.source + "(" + call.name + "(下, 上)。片側だけなら " + call.name + "(" + sides + ")。"
              + "読めない側は自動で描きます)");
          }
          if (!limit) {
            // 読める側も無い(ylim(,)・ylim(a) など)。両側とも自動。
          } else if (limit.min !== null && limit.max !== null && limit.min >= limit.max) {
            chart.errors.push(axis + " の範囲が不正です(下は上より小さくしてください): " + call.source);
          } else {
            chart[call.name] = limit;
          }
          return;
        }
        if (call.name === "invert_yaxis") {
          // 縦の軸を逆向きに(matplotlib の invert_yaxis と同じ)。横棒の分類は既定で表の順に上から並ぶので、下から並べたい
          // (matplotlib・Excel と同じにしたい)ときに書く(v167)。ylim(上, 下) の逆書きは v165 から「下 ≥ 上」のエラー。
          if (call.args.length || Object.keys(call.options).length) chart.errors.push("invert_yaxis() は引数なしで書きます: " + call.source);
          else chart.invertY = true;
          return;
        }
        if (call.name === "table") return;
        if (!CHART_KINDS.has(call.name)) {
          chart.errors.push("使えないコマンド: " + call.name + "()");
          return;
        }
        if (chartLayoutOf(call.name) !== layout) {
          chart.errors.push(mixMessage(call.name));
          return;
        }
        if (!table) {
          // 表を指定しているのに無い(表を削除した・グラフだけ別のページへ貼った)ときは、そうと分かる言葉で(P22)。
          chart.errors.push(calls.some((item) => item.name === "table")
            ? "データの表が見つかりません(表が削除されたか、別のページにあります。グラフの設定で選び直せます)"
            : "読み取る表が見つかりません");
          return;
        }
        const ranges = call.args.filter((arg) => arg.type === "range");
        if (!ranges.length) {
          chart.errors.push(call.name + "() にはセルの範囲が必要です（例: A1:A10）");
          return;
        }
        const label = call.options.label ? String(call.options.label.value) : "";
        // 系列の色(v163)。使えない色はエラーにして既定の色で描く(chartColorValue)。
        const colorText = call.options.color ? String(call.options.color.value).trim() : "";
        const color = colorText ? chartColorValue(colorText) : null;
        if (colorText && !color) chart.errors.push("使えない色: " + colorText + '(C0〜C9・"tab:blue" などの名前・#rrggbb)');
        // データラベル(v165): values=True で、縦棒は棒の上(負なら下)、折れ線・散布図は点の上に値を出す。
        const showValues = call.options.values?.type === "boolean" && call.options.values.value === true;
        if (call.options.values && call.options.values.type !== "boolean") chart.errors.push("values= は True か False で書いてください: " + call.source);
        // 近似曲線(v177。ユーザー指示「直線近似を引く機能が欲しい」「二次と対数」「指数も入れよう」): trendline="linear"(直線)・
        // "poly2"(二次)・"log"(対数)・"exp"(指数)。trendline=True は直線。式・R² は trendline_eq=True・trendline_r2=True。
        // matplotlib には無いので名前はこのアプリの決め(Excel の近似曲線の種類と項目に寄せた)。散布図・折れ線だけ(ユーザー決定)。
        const trendFlag = (key) => {
          const option = call.options[key];
          if (option && option.type !== "boolean") chart.errors.push(key + "= は True か False で書いてください: " + call.source);
          return option?.type === "boolean" && option.value === true;
        };
        const trendOption = call.options.trendline;
        let trendType = null;
        if (trendOption?.type === "boolean") trendType = trendOption.value ? "linear" : null;
        else if (trendOption && CHART_TREND_NAMES[String(trendOption.value).toLowerCase()]) trendType = String(trendOption.value).toLowerCase();
        else if (trendOption) chart.errors.push('trendline= は "linear"・"poly2"・"log"・"exp" か True で書いてください: ' + call.source);
        const trend = { type: trendType, eq: trendFlag("trendline_eq"), r2: trendFlag("trendline_r2") };
        const trendKind = chartKindOf(call.name) === "scatter" || chartKindOf(call.name) === "plot";
        if (trend.type && !trendKind) chart.errors.push("近似曲線(trendline)は散布図と折れ線だけです: " + call.source);
        if (call.name === "pie") {
          // 円グラフ(v168)。書き方は pie(分類, 値)(このアプリのほかの種類と同じ順)・pie(値, labels=分類)(matplotlib の形)・pie(値)。
          if (chart.series.length) {
            chart.errors.push("円グラフは1つのグラフに1系列だけです: " + call.source);
            return;
          }
          if (colorText) chart.errors.push("円グラフでは color= は使えません(扇形は分類ごとに既定の配色です): " + call.source);
          const labelsOption = call.options.labels;
          if (labelsOption && labelsOption.type !== "range") chart.errors.push("labels= にはセルの範囲を書いてください(例: labels=A2:A5): " + call.source);
          const byLabels = labelsOption?.type === "range";
          const nameRange = byLabels ? labelsOption.value : ranges.length > 1 ? ranges[0].value : null;
          const valueRange = byLabels || ranges.length === 1 ? ranges[0].value : ranges[1].value;
          // 割合(autopct): True は整数の %、"%1.1f%%" の形は小数の桁(matplotlib の autopct と同じ書き方)。
          let percentDigits = null;
          const autopct = call.options.autopct;
          if (autopct) {
            const format = autopct.type === "string" ? /^%\d*(?:\.(\d+))?f%%$/.exec(autopct.value) : null;
            if (autopct.type === "boolean") percentDigits = autopct.value ? 0 : null;
            else if (format) percentDigits = Number(format[1] || 0);
            else chart.errors.push('autopct= は True か "%1.1f%%" の形で書いてください: ' + call.source);
          }
          // 始まりの角度と向き(matplotlib の startangle・counterclock と同じ意味。読むのはこの2つだけ)。書かなければ Excel と同じ
          // 12時から時計回り(= startangle=90, counterclock=False。matplotlib の既定の 3時から反時計回りとは違う。意図した逸脱)。
          let startAngle = 90;
          let counterclock = false;
          if (call.options.startangle) {
            if (call.options.startangle.type === "number") startAngle = call.options.startangle.value;
            else chart.errors.push("startangle= は角度の数で書いてください(例: startangle=90): " + call.source);
          }
          if (call.options.counterclock) {
            if (call.options.counterclock.type === "boolean") counterclock = call.options.counterclock.value;
            else chart.errors.push("counterclock= は True か False で書いてください: " + call.source);
          }
          const valueEntries = chartRangeEntries(table, valueRange);
          const nameEntries = nameRange ? chartRangeEntries(table, nameRange) : null;
          const count = nameEntries ? Math.min(nameEntries.length, valueEntries.length) : valueEntries.length;
          const slices = [];
          const negatives = [];
          for (let index = 0; index < count; index += 1) {
            const value = valueEntries[index].number;
            // 空・文字の値は扇形にしない(ほかの種類の「値なし」と同じ)。0 は凡例には出すが、扇形は描かない。
            if (value === null) continue;
            if (value < 0) {
              negatives.push(valueEntries[index].text);
              continue;
            }
            slices.push({ name: (nameEntries && nameEntries[index].text) || String(index + 1), value, text: valueEntries[index].text });
          }
          if (negatives.length) chart.errors.push("円グラフに負の値は使えません(その扇形は描きません): " + negatives.join(", "));
          if (!slices.length) {
            chart.errors.push("数値が見つかりません: " + valueRange);
            return;
          }
          const total = slices.reduce((sum, slice) => sum + slice.value, 0);
          if (total <= 0) {
            chart.errors.push("円グラフの値がすべて 0 です");
            return;
          }
          chart.series.push({ kind: "pie", slices, total, label, values: showValues, percentDigits, startAngle, counterclock });
          return;
        }
        if (isHistKind(call.name)) {
          if (showValues) chart.errors.push("ヒストグラムには values を使えません");
          const values = chartRangeValues(table, ranges[0].value);
          const binCount = call.options.bins ? Number(call.options.bins.value) : 10;
          // 区間の数が上限を越えたら、上限で描いてそう伝える(黙って変えない。v213)。
          if (binCount > HIST_MAX_BINS) chart.errors.push("区間の数(bins)は " + HIST_MAX_BINS + " までです(" + HIST_MAX_BINS + " で描きます)");
          const bins = histogramBins(values, binCount);
          if (!bins.length) {
            chart.errors.push("数値が見つかりません: " + ranges[0].value);
            return;
          }
          chart.series.push({ kind: "hist", bins, label: label || "count", color });
          return;
        }
        const kind = call.name === "line" ? "plot" : call.name;
        // X と Y は範囲の**位置の並び**で、同じ位置同士を組にする(v163)。数でない Y は「値なし」で点を打たない
        // (縦棒は描かない・折れ線は切る。matplotlib で NaN を渡したときと同じ)。範囲が1つなら、その並び順(1, 2, 3…)を X にする。
        const xEntries = chartRangeEntries(table, ranges[0].value);
        const yEntries = ranges[1] ? chartRangeEntries(table, ranges[1].value) : null;
        const valueEntries = yEntries || xEntries;
        // 分類の軸かどうかは matplotlib と同じ: X の空でないセルがすべて数なら数の軸、1つでも数でなければ分類の軸
        // (数のセルも文字として並べる)。数かどうかは表の数の判定 tableCellNumber と同じ(「1,000」は数)。
        const categoryAxis = Boolean(yEntries) && xEntries.some((entry) => entry.text && entry.number === null);
        // 以前は文字の X を黙って捨て、何も描かれなかった(P22)。散布図は数の軸のままにし、文字の X は見える形のエラーにする。
        if (categoryAxis && kind === "scatter") {
          chart.errors.push("散布図の X は数で指定してください(文字の X は bar・plot で分類の軸になります): " + ranges[0].value);
          return;
        }
        const count = yEntries ? Math.min(xEntries.length, yEntries.length) : valueEntries.length;
        const points = [];
        let segment = 0;
        for (let index = 0; index < count; index += 1) {
          let x = yEntries ? xEntries[index].number : index + 1;
          if (categoryAxis) {
            // 分類は系列をまたいで**最初に出てきた順の和集合**(matplotlib の分類の単位と同じ)。空の X は分類にしない。
            const name = xEntries[index].text;
            if (!name) {
              segment += 1;
              continue;
            }
            chart.categories = chart.categories || [];
            x = chart.categories.indexOf(name);
            if (x < 0) x = chart.categories.push(name) - 1;
          }
          const y = valueEntries[index].number;
          if (y === null || x === null) {
            segment += 1;
            continue;
          }
          // データラベル(values=True)に出す文字は、表のセルの表示と同じ(書いたとおりの「1,000」、式は計算結果。v165)。
          points.push({ x, y, segment, text: valueEntries[index].text });
        }
        if (!points.length) {
          chart.errors.push("数値が見つかりません: " + ranges[ranges.length - 1].value);
          return;
        }
        // 近似曲線(v177)。分類の軸の X は 1, 2, 3…(Excel と同じ)として当てはめ・式を出す。描く位置は分類の位置(0 始まり)なので
        // shift = 1 を足して式に入れる(chartTrendFit)。当てはめられない(点が足りない・対数の X や指数の Y が 0 以下)ときは
        // 見える形のエラーにして描かない(P22)。
        let fit = null;
        if (trend.type && trendKind) {
          const result = chartTrendFit(points, trend.type, categoryAxis ? 1 : 0);
          if (result.error) chart.errors.push(result.error + ": " + call.source);
          else fit = Object.assign(result, { showEq: trend.eq, showR2: trend.r2 });
        }
        chart.series.push({ kind, points, label, color, categorical: categoryAxis, values: showValues, trend: fit });
      });
      // 分類の軸で位置の範囲は使えない(黙って無視しない。P22。v165)。位置の軸は、縦棒では X(xlim)、横棒では Y(ylim)。
      const positionLimit = chart.horizontal ? "ylim" : "xlim";
      if (chart.categories && chart[positionLimit]) {
        chart.errors.push(chart.horizontal
          ? "分類の軸では Y の範囲(ylim)を指定できません(横棒の分類は縦の軸です)"
          : "分類の軸では X の範囲(xlim)を指定できません");
        chart[positionLimit] = null;
      }
      // 分類の軸のグラフに、数の X の系列・散布図・ヒストグラムは重ねられない(見える形のエラー。番号で組にしない)。
      if (chart.categories) {
        chart.series = chart.series.filter((series) => {
          if (series.categorical) return true;
          chart.errors.push("分類の軸のグラフに" + (series.kind === "hist" ? "ヒストグラム" : series.kind === "scatter" ? "散布図"
            : chart.horizontal ? "数の位置の系列" : "数の X の系列") + "は重ねられません");
          return false;
        });
      }
      // 目盛線の既定: 縦棒などは横(値の軸)、横棒は縦(値の軸)。grid(...) を書けば、その向き(画面の向き)に従う(v167)。
      if (chart.horizontal && !gridWritten) chart.grid = "x";
      return chart;
    }

    return { chartRangeValues, chartRangeEntries, chartCellText, isChartTextCell, chartSampleFromTable, chartAddSeriesLine, chartSampleText, buildChart };
  }

  return {
    create,
    CHART_KINDS, CHART_KIND_NAMES, CHART_COLORS, CHART_SIZE, CHART_TREND_NAMES, CHART_LIMIT_NUMBER, CHART_SAMPLE,
    chartKindOf, isHistKind, chartLayoutOf, splitChartArguments, parseChartValue, parseChartSpec, chartRangeRect, chartColorValue,
    chartGridSetting, chartLimitSetting, chartLegendSetting, chartSourceTable, histogramBins, niceTicks, chartTrendFit, renderChartSvg,
  };
})();
