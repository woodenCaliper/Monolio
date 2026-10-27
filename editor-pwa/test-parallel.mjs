// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// 全テストを組に分けて同時に流す実行役(2026-10-12。全部を1つずつ順に流すと約20分かかるため。ユーザー要望)。
// - 各組は test.mjs を別のプロセスで起動し、組ごとに別のポートと別の出力先を渡す(PAGELITH_TEST_PORT / PAGELITH_TEST_OUT)。
//   サーバー・ブラウザ・書き出しのフォルダが組ごとに別なので、同時に走ってもぶつからない。
// - 組分け(#230。2026-10-26): 組を先に決めず、スイートを長いものから順に並べた待ち行列を作り、手の空いた組が次の1つを取る
//   (test.mjs --queue。標準出力の1行で聞き、標準入力の1行で名前を返す)。以前は目安の時間で先に組を決めていたので、目安がずれると組の長さが
//   114〜173 秒とばらつき、いちばん遅い組を待っていた。目安は並べる順にだけ使う(長いものを先に始めると終わりがそろう)。
// - 目安の時間: 前回の全テストで測った時間(tests/.suite-seconds.local.json。全テストのたびに書き直す。git に入れない)。
//   無ければ tests/suite-seconds.json(リポジトリの既定)、それにも無いスイート(新しく足したもの)は平均の時間として扱う。
// - 最後に各組の生の結果(--shard-out)を集め、test.mjs と同じ規則(tests/report.mjs)で report を作って
//   editor-pwa/out/test-report.json に書く(順に流したときと同じ場所・同じ形。ok は全スイートが走ったときだけ true になり得る)。
// - 使うポートは 4181 から組の数だけ。1つでも使われていたら始めない(他のランやサーバーを止めたりはしない)。
// 使い方: npm run pwa:test(= node editor-pwa/test-parallel.mjs [--jobs=6])。1つずつ順に流すのは npm run pwa:test:serial。
// 目安の時間は手で直さなくてよい(全テストのたびに tests/.suite-seconds.local.json を書き直す)。
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "./tests/report.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const OUT = resolve("editor-pwa/out");
const BASE_PORT = 4181;
// 組の数の既定は 10(2026-10-18 に 14 コアの Windows で計測。94 スイート・1818 項目: 6組 195秒・8組 178/169秒・
// 10組 146/160秒・12組 135秒。12組は1本ずつの遅れが大きく(coreSuite 72→107秒)、伸びが小さいので 10 にした。
// 2026-10-12 の計測(順に 552秒 → 4組 147秒・6組 104秒・8組 84秒)から、テストが増えて倍近くになっていた)。
// いちばん長い coreSuite より短くはならない。コアの少ない機械(クラウド等)では、コアの半分までに抑える。
const CORES = cpus().length;
const JOBS = Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--jobs="))?.slice(7))
  || Math.min(10, Math.max(Math.floor(CORES / 2), CORES - 4)));

// スイートの並びは test.mjs の SUITES と同じ(report を重ねる順。test.mjs を import すると全部が走るので、文字から読む)。
const source = await readFile("editor-pwa/test.mjs", "utf8");
const block = source.slice(source.indexOf("const SUITES = ["), source.indexOf("];", source.indexOf("const SUITES = [")));
const suiteNames = [...block.matchAll(/^\s+(\w+),\s*$/gm)].map((match) => match[1]);
if (!suiteNames.length) throw new Error("test.mjs の SUITES を読めなかった");

const LOCAL_SECONDS = "editor-pwa/tests/.suite-seconds.local.json";
const readSeconds = async (path) => (existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {});
const seconds = { ...(await readSeconds("editor-pwa/tests/suite-seconds.json")), ...(await readSeconds(LOCAL_SECONDS)) };
const known = Object.values(seconds).filter((value) => typeof value === "number");
const fallback = known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : 30;
const estimate = (name) => seconds[name] ?? fallback;
// 待ち行列: 長いものから順。組(=プロセス)の数は JOBS とスイートの数の小さい方。
const queue = [...suiteNames].sort((a, b) => estimate(b) - estimate(a));
const groups = Array.from({ length: Math.min(JOBS, suiteNames.length) }, () => ({ names: [], total: 0 }));

function portFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.once("listening", () => probe.close(() => done(true)));
    probe.listen(port, "127.0.0.1");
  });
}
for (let index = 0; index < groups.length; index += 1) {
  if (!(await portFree(BASE_PORT + index))) {
    console.error(`ポート ${BASE_PORT + index} が使われているので始めない(別の並列ランが走っていないか確かめる)`);
    process.exit(2);
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const started = Date.now();
console.error(`並列ラン: ${groups.length} 組 / ${suiteNames.length} スイート(手の空いた組が次を取る。目安の合計 ${Math.round(queue.reduce((sum, name) => sum + estimate(name), 0))}秒)`);

const runs = groups.map((group, index) => new Promise((done) => {
  const shardOut = join(OUT, "shard-" + (index + 1));
  const raw = join(shardOut, "..", "shard-" + (index + 1) + ".json");
  const child = spawn(process.execPath, ["editor-pwa/test.mjs", "--queue", "--shard-out=" + raw], {
    env: { ...process.env, PAGELITH_TEST_PORT: String(BASE_PORT + index), PAGELITH_TEST_OUT: shardOut },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // 次のスイートを聞かれたら(標準出力の QUEUE_ASK の行)、待ち行列の先頭を標準入力へ渡す(空の行 = 終わり)。
  // どの組に何を渡したかは group.names に残す。
  let pending = "";
  child.stdout.on("data", (chunk) => {
    pending += String(chunk);
    let at;
    while ((at = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, at).trim();
      pending = pending.slice(at + 1);
      if (line !== "@@monolio-queue-next@@") continue;
      const name = queue.shift() ?? "";
      if (name) {
        group.names.push(name);
        group.total += estimate(name);
      }
      if (!child.stdin.destroyed) child.stdin.write(name + "\n");
    }
  });
  child.stdin.on("error", () => {});
  child.stderr.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) console.error(`[組${index + 1}] ${line}`);
  });
  child.on("exit", (code) => done({ group, raw, code }));
}));
const finished = await Promise.all(runs);

const results = {};
const crashedSuites = {};
const suiteSeconds = {};
for (const { group, raw, code } of finished) {
  if (!existsSync(raw)) {
    // 組のプロセスごと落ちた(生の結果を書く前に止まった)。その組のスイートは全部「落ちた」とする。
    for (const name of group.names) crashedSuites[name] = `組のプロセスが結果を書かずに終わった(終了コード ${code})`;
    continue;
  }
  const data = JSON.parse(await readFile(raw, "utf8"));
  Object.assign(results, data.results);
  Object.assign(crashedSuites, data.crashedSuites);
  Object.assign(suiteSeconds, data.suiteSeconds);
  for (const name of group.names) {
    if (!(name in data.results) && !(name in data.crashedSuites)) crashedSuites[name] = "組の中で走らなかった";
  }
}
const wallSeconds = Math.round((Date.now() - started) / 100) / 10;
groups.forEach((group, index) => console.error(`  組${index + 1}(${Math.round(group.names.reduce((sum, name) => sum + (suiteSeconds[name] ?? 0), 0))}秒): ${group.names.join(", ")}`));
// 測った時間を次の目安にする(全部のスイートが走ったときだけ。落ちた組があると時間が欠けるので書かない)。
if (suiteNames.every((name) => typeof suiteSeconds[name] === "number")) {
  await writeFile(LOCAL_SECONDS, JSON.stringify(Object.fromEntries(suiteNames.map((name) => [name, suiteSeconds[name]])), null, 2) + "\n");
}
const report = buildReport(suiteNames, results, crashedSuites, {
  extra: { suiteSeconds, parallel: { jobs: groups.length, wallSeconds, groups: groups.map((group) => group.names) } },
});
await writeFile(join(OUT, "test-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error(`並列ラン終了: ${wallSeconds}秒 ok=${report.ok} 判定 ${report.okJudgedCount} 件 不合格 ${report.okFailures.length} 件`);
if (report.ok !== true) process.exitCode = 1;
