// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
//
// 同梱の Mermaid(editor-pwa/vendor/mermaid/mermaid.min.js)を作り直すスクリプト。
//
// なぜ自前で作るか: npm の mermaid の配布物(dist/mermaid.min.js)には elkjs 0.9.3(EPL-2.0。GPL を第二ライセンスに
// 指定していない)が入っていて、Monolio 本体(GPL-3.0-or-later)と組み合わせられない。そこで elkjs を取り除いた束を作る
// (2026-10-27 決定。`layout: elk` の並べ方は使えなくなり、Mermaid 自身の仕組みでふつうの並べ方 dagre に戻る)。
//
// 使うもの(どちらも npm の公開レジストリから取る。integrity で中身を確かめる):
//   - mermaid 12.2.0 の配布物 https://registry.npmjs.org/mermaid/-/mermaid-12.2.0.tgz
//     その dist/mermaid.js(Mermaid が esbuild で束ねた、縮めていない IIFE。部品ごとに取り込み元の印が付いている)
//     元のソースは https://github.com/mermaid-js/mermaid のタグ mermaid@12.2.0(MIT)
//   - esbuild 0.28.2(縮めるだけに使う)
//
// やること:
//   1. dist/mermaid.js から elkjs の部品(`// ../../node_modules/.pnpm/elkjs@0.9.3/…/elk.bundled.js` の印から、次の部品の印の前まで)
//      を外し、呼ばれたらエラーを投げるだけの空の部品に差し替える
//   2. 並べ方の登録(src/rendering-util/render.ts の registerDefaultLayoutLoaders)から `...elkLayoutLoaders()` を外す。
//      `layout: elk`・`elk.*` を指定した図は、Mermaid の getRegisteredLayoutAlgorithm が「登録されていない」として dagre で描く
//      (Mermaid が tiny 版で elk を外すときと同じ仕組み)
//   3. elkjs・org.eclipse.elk が残っていないことを確かめ、esbuild で縮めて mermaid.min.js に書く
//
// 使い方(リポジトリの根で):
//   node editor-pwa/vendor/mermaid/build/build-mermaid.mjs          作り直して editor-pwa/vendor/mermaid/mermaid.min.js に書く
//   node editor-pwa/vendor/mermaid/build/build-mermaid.mjs --check  作り直した結果が、同梱のものと同じかだけを見る(書かない)
//   作業用のフォルダは OS の一時フォルダに作り、終わったら消す(取ってきたものはリポジトリに入れない)。要るもの: Node.js・npm・tar。
import { createHash } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MERMAID_VERSION = "12.2.0";
const MERMAID_INTEGRITY = "sha512-w7nr/SFrLO7BaVTs3dQTvYSV6nYSBj0Yy9DjBhsIJtAcHqRzXSq4Pg32ujHZ/AdWsAMNEvvhbm5dt9E2tOiHzw==";
const ESBUILD_VERSION = "0.28.2";
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "mermaid.min.js");
const checkOnly = process.argv.includes("--check");

const io = { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" };
// npm は Windows では npm.cmd なので、シェルを通して呼ぶ(引数はこのファイルの定数だけ)
const npm = (args, cwd) => execSync("npm " + args, { ...io, cwd });
const run = (cmd, args, cwd) => execFileSync(cmd, args, { ...io, cwd });

// 1か所だけに当たることを確かめてから置き換える(上流の形が変わったら、黙って違うものを作らずに止める)
function replaceOnce(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0 || text.indexOf(search, first + 1) >= 0) throw new Error(`${label}: 置き換える場所が1か所に決まらない`);
  return text.slice(0, first) + replacement + text.slice(first + search.length);
}

function removeElk(source) {
  // 1) elkjs の部品を空の部品に差し替える
  const marker = "  // ../../node_modules/.pnpm/elkjs@0.9.3/node_modules/elkjs/lib/elk.bundled.js\n";
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + 1) >= 0) throw new Error("elkjs の部品の印が1か所に決まらない");
  const next = source.indexOf("\n  // ", start + marker.length);
  if (next < 0) throw new Error("elkjs の次の部品の印が見つからない");
  const removed = source.slice(start, next + 1);
  if (!removed.includes("var require_elk_bundled = __commonJS(")) throw new Error("elkjs の部品の形が想定と違う");
  const stub = [
    "  // elkjs (EPL-2.0) is removed from this build for GPL-3.0 compatibility (Monolio). The ELK layouts are not registered,",
    "  // so diagrams that ask for them are laid out with dagre (see registerDefaultLayoutLoaders).",
    "  var require_elk_bundled = __commonJS({",
    '    "elk-layout-removed"(exports3, module2) {',
    "      module2.exports = class ELK {",
    "        constructor() {",
    '          throw new Error("The ELK layout is not included in this Mermaid build (removed for GPL-3.0 compatibility).");',
    "        }",
    "      };",
    "    }",
    "  });",
    "",
  ].join("\n");
  let out = source.slice(0, start) + stub + source.slice(next + 1);
  // 2) 並べ方の登録から elk を外す
  out = replaceOnce(out, "            },\n            ...elkLayoutLoaders()\n          ] : []", "            }\n          ] : []", "elk の並べ方の登録");
  return { out, removedBytes: removed.length };
}

function assertNoElk(text, label) {
  for (const needle of ["elkjs@", "org.eclipse.elk", "elk.bundled", "elk-worker", "Eclipse Public License"]) {
    if (text.includes(needle)) throw new Error(`${label} に ${needle} が残っている`);
  }
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const work = await mkdtemp(join(tmpdir(), "monolio-mermaid-"));
try {
  // mermaid の配布物を取り、integrity を確かめて広げる
  const packed = JSON.parse(npm(`pack mermaid@${MERMAID_VERSION} --json --silent`, work));
  const tgz = join(work, packed[0].filename);
  const tgzData = await readFile(tgz);
  const integrity = "sha512-" + createHash("sha512").update(tgzData).digest("base64");
  if (integrity !== MERMAID_INTEGRITY) throw new Error(`mermaid ${MERMAID_VERSION} の integrity が違う: ${integrity}`);
  run("tar", ["-xzf", packed[0].filename, "package/dist/mermaid.js", "package/LICENSE", "package/package.json"], work);
  const pkg = JSON.parse(await readFile(join(work, "package/package.json"), "utf8"));
  if (pkg.version !== MERMAID_VERSION) throw new Error("mermaid の版が違う: " + pkg.version);

  // esbuild(縮めるだけ)を作業用のフォルダに入れる
  await writeFile(join(work, "package.json"), JSON.stringify({ private: true, dependencies: { esbuild: ESBUILD_VERSION } }));
  npm(`install --no-audit --no-fund --silent esbuild@${ESBUILD_VERSION}`, work);
  const esbuild = await import(pathToFileURL(join(work, "node_modules/esbuild/lib/main.js")).href);
  if (esbuild.version !== ESBUILD_VERSION) throw new Error("esbuild の版が違う: " + esbuild.version);

  const source = await readFile(join(work, "package/dist/mermaid.js"), "utf8");
  const { out, removedBytes } = removeElk(source);
  assertNoElk(out, "差し替えたあとの mermaid.js");
  const minified = await esbuild.transform(out, { minify: true, legalComments: "eof", charset: "ascii" });
  await esbuild.stop(); // 作業用のフォルダを消せるように、esbuild の常駐を止める
  const code = minified.code;
  assertNoElk(code, "縮めたあとの mermaid.min.js");
  if (!code.includes('globalThis["mermaid"]') && !code.includes("globalThis.mermaid")) throw new Error("window.mermaid を出す行が無い");

  console.log(`mermaid ${MERMAID_VERSION}: elkjs の部品 ${removedBytes} 文字を外した`);
  console.log(`作った mermaid.min.js: ${Buffer.byteLength(code)} バイト sha256 ${sha256(code)}`);
  if (checkOnly) {
    const current = await readFile(OUTPUT, "utf8");
    const same = current === code;
    console.log(same ? "同梱のものと同じ" : `同梱のものと違う(同梱: ${Buffer.byteLength(current)} バイト sha256 ${sha256(current)})`);
    process.exitCode = same ? 0 : 1;
  } else {
    await writeFile(OUTPUT, code);
    console.log("書いた: " + OUTPUT);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
