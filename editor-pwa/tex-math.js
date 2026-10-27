// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// 数式: TeX(サブセット) → MathML(Issue #207 で document-format.js から分けた)。変換はこの1つだけ。
// エディタ(app.js の数式のブロック・文中の数式)も保存HTMLの焼き込み(document-format.js)も、ここの texToMathML を使う
// (app.js は fmt.texToMathML 経由。document-format.js が同じ関数を載せ直している)。保存HTMLの中では動かない(焼き込み済み)。
// 形: 普通のスクリプトが window.TexMath に載せる(理由は HANDOVER §4.51)。何にも頼らない。
// 読み込みの順: document-format.js より前(document-format.js が読み込んだその場で window.TexMath を読む)。
window.TexMath = (() => {
  // ---- TeX(サブセット) → MathML ----
  // 外部ライブラリを使わず、技術文書でよく使う範囲だけを自前で MathML へ変換し、
  // ブラウザのネイティブ描画に任せる(グラフを自前SVGで描くのと同じ思想)。
  // 変換できない入力では null を返し、呼び出し側が TeX ソースをそのまま見せる。
  // ソース(TeX)が唯一の真実で、MathML はあくまで描画キャッシュ。

  const TEX_GREEK = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
    zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
    lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ",
    sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ",
    chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
    Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  };

  const TEX_SYMBOLS = {
    times: "×", cdot: "⋅", div: "÷", pm: "±", mp: "∓",
    leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
    approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", propto: "∝", infty: "∞",
    rightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔",
    Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", mapsto: "↦",
    in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃",
    subseteq: "⊆", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖",
    forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
    nabla: "∇", partial: "∂", angle: "∠", perp: "⊥", parallel: "∥",
    ldots: "…", cdots: "⋯", dots: "…", vdots: "⋮", ddots: "⋱",
    circ: "∘", bullet: "•", star: "⋆", oplus: "⊕", otimes: "⊗", odot: "⊙",
    emptyset: "∅", varnothing: "∅", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ",
    aleph: "ℵ", prime: "′", degree: "°", langle: "⟨", rangle: "⟩",
    lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", mid: "∣",
    quad: " ", qquad: "  ",
  };

  const TEX_FUNCTIONS = new Set([
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan",
    "sinh", "cosh", "tanh", "coth", "log", "ln", "lg", "exp", "arg",
    "min", "max", "sup", "inf", "det", "gcd", "deg", "dim", "ker", "mod",
  ]);

  // 上下限を base の真上・真下に置く演算子。int 系だけは Excel 等の慣例どおり
  // 右肩・右下に付ける(limits: "side")。
  const TEX_BIG_OPS = {
    sum: { symbol: "∑", limits: "under" },
    prod: { symbol: "∏", limits: "under" },
    coprod: { symbol: "∐", limits: "under" },
    bigcup: { symbol: "⋃", limits: "under" },
    bigcap: { symbol: "⋂", limits: "under" },
    int: { symbol: "∫", limits: "side" },
    iint: { symbol: "∬", limits: "side" },
    oint: { symbol: "∮", limits: "side" },
  };

  const TEX_MATRIX_FENCES = {
    pmatrix: ["(", ")"],
    bmatrix: ["[", "]"],
    Bmatrix: ["{", "}"],
    vmatrix: ["|", "|"],
    matrix: ["", ""],
  };

  function tokenizeTex(source) {
    const text = String(source ?? "");
    const tokens = [];
    let at = 0;
    while (at < text.length) {
      const ch = text[at];
      if (ch === "\\") {
        const command = /^\\([a-zA-Z]+)/.exec(text.slice(at));
        if (command) {
          at += command[0].length;
          // \text{...} と \begin{...} \end{...} は中身を生のまま読む。
          if (command[1] === "text") {
            const body = readTexBraceRaw(text, at);
            tokens.push({ type: "text", value: body.value });
            at = body.at;
          } else if (command[1] === "begin" || command[1] === "end") {
            const body = readTexBraceRaw(text, at);
            tokens.push({ type: command[1], value: body.value.trim() });
            at = body.at;
          } else {
            tokens.push({ type: "cmd", name: command[1] });
          }
          continue;
        }
        // \\ (行区切り) や \{ \} \, などの1文字エスケープ。
        tokens.push({ type: "esc", value: text[at + 1] ?? "" });
        at += 2;
        continue;
      }
      if (/\s/.test(ch)) {
        at += 1;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        const number = /^[0-9]+(?:\.[0-9]+)?/.exec(text.slice(at));
        tokens.push({ type: "num", value: number[0] });
        at += number[0].length;
        continue;
      }
      if (ch === "{" || ch === "}" || ch === "^" || ch === "_" || ch === "&") {
        tokens.push({ type: ch });
        at += 1;
        continue;
      }
      if (/[a-zA-Z]/.test(ch)) {
        tokens.push({ type: "letter", value: ch });
        at += 1;
        continue;
      }
      tokens.push({ type: "op", value: ch });
      at += 1;
    }
    return tokens;
  }

  // { ... } の中身を、入れ子の括弧を数えながら生の文字列で読む。
  function readTexBraceRaw(text, at) {
    while (at < text.length && /\s/.test(text[at])) at += 1;
    if (text[at] !== "{") throw new Error("TEX");
    let depth = 1;
    let value = "";
    at += 1;
    while (at < text.length && depth > 0) {
      const ch = text[at];
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      if (depth > 0) value += ch;
      at += 1;
    }
    if (depth !== 0) throw new Error("TEX");
    return { value, at };
  }

  function escapeMathText(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  // TeX のサブセットを MathML の文字列へ変換する。変換できなければ null。
  // トップレベルの \\ / \newline は行区切り(複数行は mtable、LaTeX の表示数式の
  // 慣例に合わせて中央揃え)。行列の中の \\ は parseTexMatrix が消費するので干渉しない。
  // ソース中の物理改行は LaTeX と同じく無視される(tokenizeTex が空白として読み飛ばす)。
  function texToMathML(source, display) {
    const text = String(source ?? "").trim();
    if (!text) return null;
    try {
      const tokens = tokenizeTex(text);
      const state = { tokens, at: 0 };
      const lines = [];
      for (;;) {
        lines.push(parseTexSequence(state, ["rowsep", "newline"]));
        const token = state.tokens[state.at];
        if (token && ((token.type === "esc" && token.value === "\\")
          || (token.type === "cmd" && token.name === "newline"))) {
          state.at += 1;
          continue;
        }
        break;
      }
      if (state.at < state.tokens.length) throw new Error("TEX");
      // 末尾の \\ が作る空行は LaTeX と同じく落とす(途中の空行は空行として残す)。
      while (lines.length > 1 && !lines.at(-1)) lines.pop();
      const body = lines.length > 1
        ? '<mtable columnalign="center">'
          + lines.map((line) => "<mtr><mtd><mrow>" + line + "</mrow></mtd></mtr>").join("")
          + "</mtable>"
        : "<mrow>" + (lines[0] || "") + "</mrow>";
      return '<math xmlns="http://www.w3.org/1998/Math/MathML" display="'
        + (display ? "block" : "inline") + '">' + body + "</math>";
    } catch {
      return null;
    }
  }

  // stops に挙げた種類のトークンの手前まで読み進める(行列のセル区切りなどに使う)。
  function parseTexSequence(state, stops) {
    let html = "";
    while (state.at < state.tokens.length) {
      const token = state.tokens[state.at];
      if (token.type === "}" || stops.includes(token.type)) break;
      if (token.type === "esc" && token.value === "\\" && stops.includes("rowsep")) break;
      if (token.type === "cmd" && token.name === "newline" && stops.includes("newline")) break;
      if (token.type === "cmd" && token.name === "right" && stops.includes("right")) break;
      html += parseTexItem(state);
    }
    return html;
  }

  // 1要素(atom + 上付き・下付き)を読む。
  function parseTexItem(state) {
    const atom = parseTexAtom(state);
    let sub = null;
    let sup = null;
    while (state.at < state.tokens.length) {
      const token = state.tokens[state.at];
      if (token.type === "_" && sub === null) {
        state.at += 1;
        sub = parseTexGroup(state);
      } else if (token.type === "^" && sup === null) {
        state.at += 1;
        sup = parseTexGroup(state);
      } else {
        break;
      }
    }
    if (sub === null && sup === null) return atom.html;
    // Σ や lim の上下限は真上・真下へ、int や普通の要素は右肩・右下へ。
    if (atom.underOver) {
      if (sub !== null && sup !== null) return "<munderover>" + atom.html + "<mrow>" + sub + "</mrow><mrow>" + sup + "</mrow></munderover>";
      if (sub !== null) return "<munder>" + atom.html + "<mrow>" + sub + "</mrow></munder>";
      return "<mover>" + atom.html + "<mrow>" + sup + "</mrow></mover>";
    }
    const base = atom.wrap ? "<mrow>" + atom.html + "</mrow>" : atom.html;
    if (sub !== null && sup !== null) return "<msubsup>" + base + "<mrow>" + sub + "</mrow><mrow>" + sup + "</mrow></msubsup>";
    if (sub !== null) return "<msub>" + base + "<mrow>" + sub + "</mrow></msub>";
    return "<msup>" + base + "<mrow>" + sup + "</mrow></msup>";
  }

  // ^ や _ の直後の1グループ({...} か単一トークン)を読む。
  function parseTexGroup(state) {
    const token = state.tokens[state.at];
    if (!token) throw new Error("TEX");
    if (token.type === "{") {
      state.at += 1;
      const html = parseTexSequence(state, []);
      if (state.tokens[state.at]?.type !== "}") throw new Error("TEX");
      state.at += 1;
      return html;
    }
    return parseTexAtom(state).html;
  }

  function parseTexAtom(state) {
    const token = state.tokens[state.at];
    if (!token) throw new Error("TEX");
    state.at += 1;
    if (token.type === "num") return { html: "<mn>" + escapeMathText(token.value) + "</mn>" };
    if (token.type === "letter") return { html: "<mi>" + escapeMathText(token.value) + "</mi>" };
    if (token.type === "text") return { html: "<mtext>" + escapeMathText(token.value) + "</mtext>" };
    if (token.type === "op") {
      if (token.value === "(" || token.value === ")" || token.value === "[" || token.value === "]" || token.value === "|") {
        return { html: '<mo stretchy="false">' + escapeMathText(token.value) + "</mo>" };
      }
      if (token.value === "-") return { html: "<mo>−</mo>" };
      if (token.value === "'") return { html: "<mo>′</mo>" };
      return { html: "<mo>" + escapeMathText(token.value) + "</mo>" };
    }
    if (token.type === "esc") {
      // \{ \} \, \; \! などの1文字エスケープ。
      if (token.value === "{" || token.value === "}") return { html: '<mo stretchy="false">' + escapeMathText(token.value) + "</mo>" };
      if (token.value === "," || token.value === ";" || token.value === " ") return { html: '<mspace width="0.2em"></mspace>' };
      if (token.value === "!") return { html: "" };
      throw new Error("TEX");
    }
    if (token.type === "{") {
      const html = parseTexSequence(state, []);
      if (state.tokens[state.at]?.type !== "}") throw new Error("TEX");
      state.at += 1;
      return { html: "<mrow>" + html + "</mrow>" };
    }
    if (token.type === "begin") return parseTexMatrix(state, token.value);
    if (token.type === "cmd") return parseTexCommand(state, token.name);
    throw new Error("TEX");
  }

  function parseTexCommand(state, name) {
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const numerator = parseTexBraced(state);
      const denominator = parseTexBraced(state);
      return { html: "<mfrac><mrow>" + numerator + "</mrow><mrow>" + denominator + "</mrow></mfrac>" };
    }
    if (name === "sqrt") {
      // \sqrt[n]{...} の n(根の指数)は [ ... ] で来る。
      if (state.tokens[state.at]?.type === "op" && state.tokens[state.at].value === "[") {
        state.at += 1;
        let index = "";
        while (state.at < state.tokens.length
          && !(state.tokens[state.at].type === "op" && state.tokens[state.at].value === "]")) {
          index += parseTexItem(state);
        }
        if (!(state.tokens[state.at]?.type === "op" && state.tokens[state.at].value === "]")) throw new Error("TEX");
        state.at += 1;
        const body = parseTexBraced(state);
        return { html: "<mroot><mrow>" + body + "</mrow><mrow>" + index + "</mrow></mroot>" };
      }
      const body = parseTexBraced(state);
      return { html: "<msqrt><mrow>" + body + "</mrow></msqrt>" };
    }
    // \underbrace{…}・\overbrace{…}(#137)。中身の下(上)に伸びる括弧を付ける。続く _{…} / ^{…} の説明は、Σ と同じく
    // 括弧のさらに下(上)へ(underOver)。
    if (name === "underbrace" || name === "overbrace") {
      const body = parseTexBraced(state);
      const html = name === "underbrace"
        ? '<munder accentunder="false"><mrow>' + body + '</mrow><mo stretchy="true">⏟</mo></munder>'
        : '<mover accent="false"><mrow>' + body + '</mrow><mo stretchy="true">⏞</mo></mover>';
      return { html, underOver: true };
    }
    if (name === "left") {
      const open = readTexDelimiter(state);
      const body = parseTexSequence(state, ["right"]);
      const closer = state.tokens[state.at];
      if (!(closer?.type === "cmd" && closer.name === "right")) throw new Error("TEX");
      state.at += 1;
      const close = readTexDelimiter(state);
      // \left( ... \right) は中身の高さに合わせて括弧が伸びる。"." は括弧なし。
      const openMo = open === "." ? "" : '<mo stretchy="true">' + escapeMathText(open) + "</mo>";
      const closeMo = close === "." ? "" : '<mo stretchy="true">' + escapeMathText(close) + "</mo>";
      return { html: "<mrow>" + openMo + "<mrow>" + body + "</mrow>" + closeMo + "</mrow>", wrap: false };
    }
    if (TEX_BIG_OPS[name]) {
      const bigOp = TEX_BIG_OPS[name];
      return {
        html: '<mo movablelimits="false" largeop="true">' + bigOp.symbol + "</mo>",
        underOver: bigOp.limits === "under",
      };
    }
    if (name === "lim") {
      return { html: "<mo>lim</mo>", underOver: true };
    }
    if (TEX_FUNCTIONS.has(name)) {
      // 複数文字の <mi> は立体(upright)で描かれる。関数名の慣例どおり。
      return { html: "<mi>" + escapeMathText(name) + "</mi>" };
    }
    if (TEX_GREEK[name]) return { html: "<mi>" + TEX_GREEK[name] + "</mi>" };
    if (TEX_SYMBOLS[name]) {
      if (name === "quad" || name === "qquad") {
        return { html: '<mspace width="' + (name === "quad" ? "1em" : "2em") + '"></mspace>' };
      }
      if (name === "infty" || name === "partial" || name === "hbar" || name === "ell"
        || name === "emptyset" || name === "varnothing" || name === "aleph"
        || name === "Re" || name === "Im") {
        return { html: "<mi>" + TEX_SYMBOLS[name] + "</mi>" };
      }
      return { html: "<mo>" + TEX_SYMBOLS[name] + "</mo>" };
    }
    throw new Error("TEX");
  }

  function parseTexBraced(state) {
    if (state.tokens[state.at]?.type !== "{") throw new Error("TEX");
    state.at += 1;
    const html = parseTexSequence(state, []);
    if (state.tokens[state.at]?.type !== "}") throw new Error("TEX");
    state.at += 1;
    return html;
  }

  // \left \right の直後の区切り文字。( ) [ ] | . \{ \} \langle など。
  function readTexDelimiter(state) {
    const token = state.tokens[state.at];
    if (!token) throw new Error("TEX");
    state.at += 1;
    if (token.type === "op") return token.value;
    if (token.type === "esc" && (token.value === "{" || token.value === "}")) return token.value;
    if (token.type === "cmd" && (token.name === "langle" || token.name === "rangle"
      || token.name === "lfloor" || token.name === "rfloor"
      || token.name === "lceil" || token.name === "rceil"
      || token.name === "vert")) {
      return token.name === "vert" ? "|" : TEX_SYMBOLS[token.name];
    }
    throw new Error("TEX");
  }

  // \begin{pmatrix} a & b \\ c & d \end{pmatrix} を mtable にする。
  function parseTexMatrix(state, environment) {
    const fences = TEX_MATRIX_FENCES[environment];
    if (!fences) throw new Error("TEX");
    const rows = [];
    let cells = [];
    let current = parseTexSequence(state, ["&", "rowsep", "end"]);
    while (state.at < state.tokens.length) {
      const token = state.tokens[state.at];
      if (token.type === "&") {
        state.at += 1;
        cells.push(current);
        current = parseTexSequence(state, ["&", "rowsep", "end"]);
        continue;
      }
      if (token.type === "esc" && token.value === "\\") {
        state.at += 1;
        cells.push(current);
        rows.push(cells);
        cells = [];
        current = parseTexSequence(state, ["&", "rowsep", "end"]);
        continue;
      }
      if (token.type === "end") {
        if (token.value !== environment) throw new Error("TEX");
        state.at += 1;
        cells.push(current);
        rows.push(cells);
        const table = "<mtable>" + rows.map((row) => (
          "<mtr>" + row.map((cell) => "<mtd><mrow>" + cell + "</mrow></mtd>").join("") + "</mtr>"
        )).join("") + "</mtable>";
        const open = fences[0] ? '<mo stretchy="true">' + escapeMathText(fences[0]) + "</mo>" : "";
        const close = fences[1] ? '<mo stretchy="true">' + escapeMathText(fences[1]) + "</mo>" : "";
        return { html: "<mrow>" + open + table + close + "</mrow>", wrap: false };
      }
      throw new Error("TEX");
    }
    throw new Error("TEX");
  }


  return { texToMathML };
})();
