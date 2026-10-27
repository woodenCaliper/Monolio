// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper

// 公開の手順(開発用 Monolio-dev → 公開用 woodenCaliper/Monolio)。2段に分ける。
//
//   node scripts/publish.mjs build [--skip-tests]
//     master の今の中身で、全テスト → Windows のインストーラー(exe)と Ubuntu の .deb を作る → 公開する中身と配布物を
//     ../_publish/v<版>/ に書き出す。ここで止まる(公開用には何も送らない)。書き出した中身をユーザーが確かめる。
//
//   MONOLIO_PUBLISH=1 node scripts/publish.mjs push
//     **ユーザーの許可を得たときだけ流す**(CLAUDE.md「Git」)。build で書き出したものと同じ中身を公開用の master に1コミット足し、
//     タグ v<版> を付けて push し、配布物を付けたリリースを下書きで作る。下書きを確かめて公開するのはユーザー。
//     --replace: 公開する前(公開用が非公開で、リリースがすべて下書き)に限り、前の下書き・タグ・コミットを捨てて作り直す。
//
// 公開用の中身は、開発用のコミットの木から scripts/public-files.mjs の PRIVATE_PATHS を除いたもの(手で直さない)。
// 公開用の履歴は開発用とつながない(開発用の履歴は送らない)。公開用の master は上書きしない(前の公開の上に足すだけ)。

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRIVATE_PATHS } from "./public-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_REPO = "woodenCaliper/Monolio";
const PUBLIC_URL = `https://github.com/${PUBLIC_REPO}.git`;
// 公開用のコミットの作者。手元の git のメールアドレスを公開しないよう、GitHub の noreply を使う。
const PUBLIC_AUTHOR = { name: "woodenCaliper", email: "35729492+woodenCaliper@users.noreply.github.com" };
// exe はいつもの作り場所(src-tauri/target)を上書きしないよう、別の場所で作る。
const WIN_TARGET_DIR = path.resolve(ROOT, "..", "_build-release");
const PUBLISH_ROOT = path.resolve(ROOT, "..", "_publish");

const [command, ...flags] = process.argv.slice(2);

function fail(message) {
  console.error(`止めました: ${message}`);
  process.exit(1);
}

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", ...options }).trim();
}

function run(cmd, args, options = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" && cmd === "npm", ...options });
  if (result.status !== 0) fail(`${cmd} ${args.join(" ")} が失敗しました(終了コード ${result.status})`);
}

function readVersion() {
  const fromFormat = fs.readFileSync(path.join(ROOT, "editor-pwa/document-format.js"), "utf8").match(/const APP_VERSION = "([^"]+)"/)?.[1];
  const versions = {
    "document-format.js APP_VERSION": fromFormat,
    "package.json": JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version,
    "src-tauri/tauri.conf.json": JSON.parse(fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8")).version,
    "src-tauri/Cargo.toml": fs.readFileSync(path.join(ROOT, "src-tauri/Cargo.toml"), "utf8").match(/^version = "([^"]+)"/m)?.[1],
  };
  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1 || !fromFormat) fail(`アプリの版数がそろっていません: ${JSON.stringify(versions)}`);
  return fromFormat;
}

function readBuildNumber() {
  return fs.readFileSync(path.join(ROOT, "editor-pwa/service-worker.js"), "utf8").match(/CACHE = "doc-editor-pwa-v(\d+)"/)?.[1] ?? "?";
}

// 開発用の master の今のコミットであること(手元の変更や、push していないコミットを公開しない)。
function checkSource() {
  if (git(["status", "--porcelain"])) fail("手元に未コミットの変更があります");
  if (git(["rev-parse", "--abbrev-ref", "HEAD"]) !== "master") fail("master で流してください");
  git(["fetch", "-q", "origin", "master"]);
  const head = git(["rev-parse", "HEAD"]);
  if (head !== git(["rev-parse", "origin/master"])) fail("手元の master が開発用(origin)の master と違います");
  return head;
}

// 公開する木 = コミットの木から PRIVATE_PATHS を除いたもの。一時の索引で作るので、手元の索引・作業中のファイルには触れない。
function publicTree(commit) {
  const indexFile = path.join(PUBLISH_ROOT, `index-${process.pid}`);
  fs.mkdirSync(PUBLISH_ROOT, { recursive: true });
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  try {
    git(["read-tree", commit], { env });
    const privates = PRIVATE_PATHS.map((entry) => entry.replace(/\/$/, ""));
    git(["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", ...privates], { env });
    return git(["write-tree"], { env });
  } finally {
    fs.rmSync(indexFile, { force: true });
  }
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function toWslPath(p) {
  return p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, "/");
}

function buildWindows(version, assetsDir) {
  run("npm", ["run", "tauri:build"], { env: { ...process.env, CARGO_TARGET_DIR: WIN_TARGET_DIR } });
  // tauri build は Cargo.toml を書き直し、改行だけが変わって「変更あり」に見える(中身は同じ)。次に流すとき止まらないよう戻す。
  if (!git(["diff", "--", "src-tauri/Cargo.toml"])) git(["checkout", "--", "src-tauri/Cargo.toml"]);
  const name = `Monolio_${version}_x64-setup.exe`;
  const built = path.join(WIN_TARGET_DIR, "release/bundle/nsis", name);
  if (!fs.existsSync(built)) fail(`exe ができていません: ${built}`);
  fs.copyFileSync(built, path.join(assetsDir, name));
}

// WSL の Ubuntu の複製(~/Monolio。HANDOVER §4.44)で、同じコミットから .deb を作る。
function buildDeb(commit, version, assetsDir) {
  const name = `Monolio_${version}_amd64.deb`;
  const script = path.join(PUBLISH_ROOT, "build-deb.sh");
  fs.writeFileSync(script, [
    "#!/bin/bash",
    "set -e",
    "source ~/.nvm/nvm.sh >/dev/null",
    "source ~/.cargo/env 2>/dev/null || true",
    "cd ~/Monolio",
    "git fetch -q origin +refs/heads/master:refs/remotes/gh/master",
    `git checkout -q --detach ${commit}`,
    "ls node_modules/@tauri-apps/cli-linux-x64-gnu >/dev/null 2>&1 || npm i --no-save @tauri-apps/cli-linux-x64-gnu >/dev/null",
    "node node_modules/@tauri-apps/cli/tauri.js build --bundles deb",
    `cp src-tauri/target/release/bundle/deb/${name} "${toWslPath(assetsDir)}/"`,
    "",
  ].join("\n"), { encoding: "utf8" });
  console.log("> wsl -d Ubuntu -- bash build-deb.sh");
  const result = spawnSync("wsl", ["-d", "Ubuntu", "--", "bash", toWslPath(script)], { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  if (result.status !== 0) fail(".deb を作れませんでした");
  if (!fs.existsSync(path.join(assetsDir, name))) fail(`.deb ができていません: ${name}`);
}

function build() {
  const skipTests = flags.includes("--skip-tests");
  const commit = checkSource();
  const version = readVersion();
  const outDir = path.join(PUBLISH_ROOT, `v${version}`);
  const sourceDir = path.join(outDir, "source");
  const assetsDir = path.join(outDir, "assets");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  if (!skipTests) {
    run("npm", ["run", "pwa:test"]);
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, "editor-pwa/out/test-report.json"), "utf8"));
    if (report.ok !== true) fail(`全テストが緑ではありません(ok: ${JSON.stringify(report.ok)})`);
  }
  buildWindows(version, assetsDir);
  buildDeb(commit, version, assetsDir);

  // 公開する中身を、コミットの木からそのまま(改行の変換なしで)書き出す。
  const tree = publicTree(commit);
  const tar = path.join(outDir, "source.tar");
  git(["archive", "--format=tar", "-o", tar, tree]);
  // 相対の名前で渡す(Git の tar は「C:\…」を「C という機械の上のファイル」と読んで失敗する)。
  run("tar", ["-xf", path.relative(sourceDir, tar)], { cwd: sourceDir });
  fs.rmSync(tar);

  const assets = fs.readdirSync(assetsDir).sort();
  fs.writeFileSync(path.join(assetsDir, "SHA256SUMS.txt"), assets.map((name) => `${sha256(path.join(assetsDir, name))}  ${name}\n`).join(""));
  const manifest = { version, build: readBuildNumber(), devCommit: commit, publicTree: tree, tested: !skipTests, assets: [...assets, "SHA256SUMS.txt"], createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n書き出しました: ${outDir}\n${JSON.stringify(manifest, null, 2)}\n公開用にはまだ何も送っていません。中身を確かめて、ユーザーの許可を得てから push を流します。`);
}

// 公開する前(公開用が非公開で、リリースがすべて下書き)に限り、そのタグの下書きとタグを消す。公開したあとは作り直さない。
function replaceUnreleased(tag) {
  const { visibility } = JSON.parse(execFileSync("gh", ["repo", "view", PUBLIC_REPO, "--json", "visibility"], { encoding: "utf8" }));
  if (visibility !== "PRIVATE") fail(`公開用はもう公開されています(${visibility})。作り直しはできません`);
  const releases = JSON.parse(execFileSync("gh", ["release", "list", "--repo", PUBLIC_REPO, "--json", "tagName,isDraft"], { encoding: "utf8" }));
  if (releases.some((release) => !release.isDraft)) fail("公開済みのリリースがあります。作り直しはできません");
  if (releases.some((release) => release.tagName === tag)) run("gh", ["release", "delete", tag, "--repo", PUBLIC_REPO, "--yes"]);
  if (git(["ls-remote", PUBLIC_URL, `refs/tags/${tag}`])) run("git", ["push", PUBLIC_URL, `:refs/tags/${tag}`]);
}

function push() {
  if (process.env.MONOLIO_PUBLISH !== "1") fail("公開用への push です。ユーザーの許可を得てから MONOLIO_PUBLISH=1 を付けて流してください");
  const commit = checkSource();
  const version = readVersion();
  const tag = `v${version}`;
  const outDir = path.join(PUBLISH_ROOT, tag);
  const manifestFile = path.join(outDir, "manifest.json");
  if (!fs.existsSync(manifestFile)) fail(`先に build を流してください(${manifestFile} がありません)`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (!manifest.tested) fail("テストを飛ばした書き出しは公開しません。build を --skip-tests なしで流し直してください");
  // 確かめてもらった書き出しと同じ中身であること(build のあとに master が進んでいたら、書き出し直す)。
  if (manifest.devCommit !== commit) fail(`書き出しのあとに master が進みました(書き出し ${manifest.devCommit.slice(0, 7)}、今 ${commit.slice(0, 7)})。build から流し直してください`);
  const tree = publicTree(commit);
  if (tree !== manifest.publicTree) fail("公開する中身が書き出しと違います");

  // 公開用の今の master の上に足す(上書きしない)。空のリポジトリなら最初のコミットになる。
  // --replace のときだけ、公開する前の中身を捨てて最初のコミットから作り直す。
  const replace = flags.includes("--replace");
  if (replace) replaceUnreleased(tag);
  const remoteHeads = git(["ls-remote", PUBLIC_URL, "refs/heads/master", `refs/tags/${tag}`]);
  if (remoteHeads.includes(`refs/tags/${tag}`)) fail(`公開用にタグ ${tag} がもうあります`);
  let parent = null;
  if (!replace && remoteHeads.includes("refs/heads/master")) {
    git(["fetch", "-q", PUBLIC_URL, "+refs/heads/master:refs/remotes/public/master"]);
    parent = git(["rev-parse", "refs/remotes/public/master"]);
  }
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: PUBLIC_AUTHOR.name, GIT_AUTHOR_EMAIL: PUBLIC_AUTHOR.email,
    GIT_COMMITTER_NAME: PUBLIC_AUTHOR.name, GIT_COMMITTER_EMAIL: PUBLIC_AUTHOR.email,
  };
  const message = `Monolio ${tag}(build ${manifest.build})`;
  const publicCommit = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message], { env });
  run("git", ["push", PUBLIC_URL, `${replace ? "+" : ""}${publicCommit}:refs/heads/master`, `${publicCommit}:refs/tags/${tag}`]);

  const assets = manifest.assets.map((name) => path.join(outDir, "assets", name));
  const notes = [
    `Monolio ${tag}(build ${manifest.build})`,
    "",
    "| 環境 | ファイル |",
    "|---|---|",
    `| Windows 10 / 11 | \`Monolio_${version}_x64-setup.exe\` |`,
    `| Ubuntu など(Debian 系) | \`Monolio_${version}_amd64.deb\` |`,
    "",
    "入れ方と注意は README の「ダウンロード」を見てください。変更の記録は CHANGELOG.md にあります。",
  ].join("\n");
  run("gh", ["release", "create", tag, "--repo", PUBLIC_REPO, "--draft", "--verify-tag", "--title", `Monolio ${tag}`, "--notes", notes, ...assets]);
  console.log(`\n公開用の master に ${publicCommit.slice(0, 7)} を足し、${tag} のリリースを下書きで作りました。下書きを確かめて公開するのはユーザーです。`);
}

if (command === "build") build();
else if (command === "push") push();
else fail("使い方: node scripts/publish.mjs build [--skip-tests] / MONOLIO_PUBLISH=1 node scripts/publish.mjs push [--replace]");
