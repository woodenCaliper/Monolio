// editor-pwa/emoji-data.js(絵文字の候補の表)を、Unicode の公式データだけから作る。
//   node scripts/build-emoji-data.mjs [--cache=<フォルダ>]
//
// 使うデータ(どちらも Unicode License v3。https://www.unicode.org/license.txt)
//   - Unicode Emoji の emoji-test.txt: 絵文字の一覧・並び・分類(出どころ: https://unicode.org/Public/emoji/latest/emoji-test.txt)
//   - CLDR の annotations(英語 en・日本語 ja): 短い名前(tts)とキーワード
//       https://raw.githubusercontent.com/unicode-org/cldr/<CLDR_TAG>/common/annotations/{en,ja}.xml
//       https://raw.githubusercontent.com/unicode-org/cldr/<CLDR_TAG>/common/annotationsDerived/{en,ja}.xml(旗・合成の絵文字)
// 版(Unicode Emoji の版は emoji-test.txt の先頭から読む。CLDR は下の CLDR_TAG)を変えたら、このスクリプトを流し直して
// editor-pwa/emoji-data.js を作り直す。元データはリポジトリに入れない(流すたびに取ってくる。--cache を付けると取ったものをそこへ置いて再利用する)。
//
// 1行が1つの絵文字:「絵文字 名前|日本語の名前 キーワード…」(app.js の parseEmojiTable が読む)。
//   - 名前 = CLDR 英語の短い名前(tts。"grinning face")を小文字・下線つなぎにしたもの("grinning_face")。無ければ emoji-test.txt の名前。
//   - 「|」の後ろ = 日本語の短い名前・日本語のキーワード・英語のキーワード(複数語は下線つなぎ)。空白で区切る。
//   - 並び = emoji-test.txt の並び(Unicode の分類順)。
//   - 入れるもの = fully-qualified の絵文字。肌色の違い(1F3FB-1F3FF)と、部品(Component)の分類は入れない(基本形だけ)。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLDR_TAG = "release-49";
const EMOJI_TEST_URL = "https://unicode.org/Public/emoji/latest/emoji-test.txt";
const CLDR_BASE = "https://raw.githubusercontent.com/unicode-org/cldr/" + CLDR_TAG + "/common/";
const ANNOTATION_FILES = [
  ["en", "annotations/en.xml"],
  ["en", "annotationsDerived/en.xml"],
  ["ja", "annotations/ja.xml"],
  ["ja", "annotationsDerived/ja.xml"],
];
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "editor-pwa", "emoji-data.js");
const cacheArg = process.argv.find((arg) => arg.startsWith("--cache="));
const cacheDir = cacheArg ? cacheArg.slice("--cache=".length) : null;

async function fetchText(url) {
  const cachePath = cacheDir ? join(cacheDir, url.replace(/[^A-Za-z0-9.]+/g, "_")) : null;
  if (cachePath) {
    try { return await readFile(cachePath, "utf8"); } catch { /* 無ければ取る */ }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + " を取れませんでした: " + response.status);
  const text = await response.text();
  if (cachePath) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachePath, text, "utf8");
  }
  return text;
}

const stripVariation = (text) => text.replace(/️/g, "");
const decodeXml = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name]);
const snake = (text) => text.trim().toLowerCase().replace(/[\s]+/g, "_");

// annotations の XML: <annotation cp="😀">語 | 語</annotation> / <annotation cp="😀" type="tts">名前</annotation>
function parseAnnotations(xml, into) {
  const pattern = /<annotation cp="([^"]+)"( type="tts")?>([^<]*)<\/annotation>/g;
  let match;
  while ((match = pattern.exec(xml))) {
    const key = stripVariation(decodeXml(match[1]));
    const entry = into.get(key) || { tts: "", keywords: [] };
    const value = decodeXml(match[3]).trim();
    if (match[2]) entry.tts = entry.tts || value;
    else entry.keywords = [...new Set([...entry.keywords, ...value.split("|").map((word) => word.trim()).filter(Boolean)])];
    into.set(key, entry);
  }
}

const emojiTest = await fetchText(EMOJI_TEST_URL);
const emojiVersion = (/^# Version: (\S+)/m.exec(emojiTest) || [])[1];
const emojiDate = (/^# Date: (.+)$/m.exec(emojiTest) || [])[1];
if (!emojiVersion) throw new Error("emoji-test.txt の版を読めませんでした");

const annotations = { en: new Map(), ja: new Map() };
for (const [lang, path] of ANNOTATION_FILES) parseAnnotations(await fetchText(CLDR_BASE + path), annotations[lang]);

const rows = [];
let group = "";
for (const line of emojiTest.split("\n")) {
  const groupMatch = /^# group: (.+)$/.exec(line);
  if (groupMatch) { group = groupMatch[1].trim(); continue; }
  const match = /^([0-9A-F ]+?)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E\d+\.\d+\s+(.+)$/.exec(line);
  if (!match || group === "Component") continue;
  const [, codepoints, char, officialName] = match;
  if (/\b1F3F[B-F]\b/.test(codepoints)) continue; // 肌色の違いは基本形にまとめる
  const key = stripVariation(char);
  const en = annotations.en.get(key) || { tts: "", keywords: [] };
  const ja = annotations.ja.get(key) || { tts: "", keywords: [] };
  const name = snake((en.tts || officialName).replace(/[:|]/g, "")).replace(/_+/g, "_");
  const words = [];
  const seen = new Set([name, ...name.split("_")]); // 名前に入っている語は、キーワードに重ねて書かない
  for (const word of [ja.tts, ...ja.keywords, ...en.keywords]) {
    const value = snake(String(word || "").replace(/[:|]/g, " ")).replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!value || seen.has(value)) continue;
    seen.add(value);
    words.push(value);
  }
  rows.push(char + " " + name + "|" + words.join(" "));
}

const header = `// 絵文字の候補の表(Issue #175)。本文で「:」に続けて英字を2つ打つと(「:smi」)、app.js が初めてこのファイルを読み込む
// (ふだんは読まない)。ネットは使わない。1行が1つの絵文字で、「絵文字 英語の名前|日本語の名前 キーワード…」(空白で区切る。
// 英語の名前は一覧に出す。複数語は下線つなぎ)。並びは Unicode の分類順(同じ順位の候補はこの並びで出る)。
//
// このファイルは scripts/build-emoji-data.mjs が作る(手で直さない)。元は Unicode の公式データ:
//   - Unicode Emoji ${emojiVersion}(emoji-test.txt。${emojiDate}): ${EMOJI_TEST_URL}
//   - CLDR ${CLDR_TAG.replace("release-", "")}(annotations と annotationsDerived の en・ja): ${CLDR_BASE}
//
// Copyright © 1991-2026 Unicode, Inc.
// Data files in this file are derived from Unicode Emoji data files and Unicode CLDR data files, distributed under the
// Unicode License v3 (SPDX-License-Identifier: Unicode-3.0): https://www.unicode.org/license.txt
`;
await writeFile(OUTPUT, header + "window.MonolioEmojiData = `\n" + rows.join("\n") + "\n`;\n", "utf8");
console.log("絵文字 " + rows.length + " 個(Unicode Emoji " + emojiVersion + " / CLDR " + CLDR_TAG + ")→ " + OUTPUT);
