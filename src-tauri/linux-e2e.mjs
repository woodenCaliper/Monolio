// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// Linux のデスクトップ版(入れたもの)を、Tauri の自動操作(tauri-driver + WebKitWebDriver)で外から操作して確かめる(v281)。
// 起動・版の表示・文字の入力・表と式・動画の再生・リンクを開く処理(落ちないこと)を見て、画面を撮る。手順は HANDOVER §4.44。
// 使い方(Linux): node src-tauri/linux-e2e.mjs <アプリの場所(/usr/bin/Monolio か AppImage)> <撮った画面の保存先.png>
// 要るもの: tauri-driver(cargo install tauri-driver)、WebKitWebDriver(apt の webkitgtk-webdriver)。動画は機能見本の sample/sample-video.webm を使う
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const [app, shotPath] = process.argv.slice(2);
const driver = spawn(process.env.HOME + "/.cargo/bin/tauri-driver", [], { stdio: ["ignore", "ignore", "pipe"] });
let driverLog = "";
driver.stderr.on("data", (d) => { driverLog += d; });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "http://127.0.0.1:4444";
const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(method + " " + path + ": " + JSON.stringify(json).slice(0, 300));
  return json.value;
};
const results = {};
let session = null;
try {
  for (let i = 0; i < 40; i += 1) {
    await wait(250);
    const ok = await fetch(base + "/status").then((r) => r.ok, () => false);
    if (ok) break;
  }
  session = (await call("POST", "/session", { capabilities: { alwaysMatch: { "tauri:options": { application: app } } } })).sessionId;
  const s = (path) => "/session/" + session + path;
  const run = (script, args = []) => call("POST", s("/execute/sync"), { script, args });
  const runAsync = (script, args = []) => call("POST", s("/execute/async"), { script, args });
  for (let i = 0; i < 40; i += 1) {
    if (await run("return Boolean(document.querySelector('#blocks .block-content'))").catch(() => false)) break;
    await wait(250);
  }
  results.started = await run(`return {
    title: document.title,
    tauri: Boolean(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke),
    version: [...document.querySelectorAll("*")].map((n) => n.childElementCount === 0 ? n.textContent : "").find((t) => /^v\\d+\\.\\d+\\.\\d+ · build \\d+$/.test((t || "").trim())) || null,
    fonts: getComputedStyle(document.body).fontFamily.slice(0, 40),
  }`);
  // 文字の入力(本文の最初の段落の末尾に打つ)。
  const find = async (css) => Object.values(await call("POST", s("/element"), { using: "css selector", value: css }))[0];
  const type = (el, text) => call("POST", s("/element/" + el + "/value"), { text });
  const firstPara = await find("#blocks .block-content");
  await call("POST", s("/element/" + firstPara + "/click"), {});
  await call("POST", s("/actions"), { actions: [{ type: "key", id: "k", actions: [{ type: "keyDown", value: "" }, { type: "keyUp", value: "" }] }] });
  await type(firstPara, " Linux から入力 abc");
  await wait(300);
  results.typed = await run("return document.querySelector('#blocks .block-content').textContent");
  // 表を作って式を計算する(新しい段落で「/」→ 表 → Enter → セルに式)。
  await call("POST", s("/actions"), { actions: [{ type: "key", id: "k", actions: [{ type: "keyDown", value: "" }, { type: "keyUp", value: "" }] }] });
  await wait(200);
  const active = Object.values(await call("GET", s("/element/active")))[0];
  await type(active, "/表");
  await wait(400);
  await call("POST", s("/actions"), { actions: [{ type: "key", id: "k", actions: [{ type: "keyDown", value: "" }, { type: "keyUp", value: "" }] }] });
  await wait(600);
  results.table = await run("return document.querySelectorAll('#blocks .editor-table').length");
  if (results.table) {
    const cell = await find('#blocks .editor-table [data-row="0"][data-cell="0"]');
    await call("POST", s("/element/" + cell + "/click"), {});
    await type(cell, "=1+2");
    await call("POST", s("/actions"), { actions: [{ type: "key", id: "k", actions: [{ type: "keyDown", value: "" }, { type: "keyUp", value: "" }] }] });
    await wait(400);
    results.formula = await run("return document.querySelector('#blocks .editor-table [data-row=\"0\"][data-cell=\"0\"]').textContent");
  }
  // 動画の再生(機能見本の短い webm を、アプリの中で blob にして鳴らさずに再生する)。
  const webm = readFileSync(new URL("../sample/sample-video.webm", import.meta.url)).toString("base64");
  results.video = await runAsync(`
    const done = arguments[arguments.length - 1];
    const bytes = Uint8Array.from(atob(arguments[0]), (c) => c.charCodeAt(0));
    const video = document.createElement("video");
    video.muted = true;
    video.src = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
    document.body.append(video);
    const out = { canPlay: video.canPlayType("video/webm"), error: null };
    video.addEventListener("error", () => { out.error = video.error ? video.error.code + " " + video.error.message : "error"; });
    video.play().catch((e) => { out.error = String(e); });
    setTimeout(() => { out.time = video.currentTime; out.width = video.videoWidth; out.ready = video.readyState; video.remove(); done(out); }, 2500);
  `, [webm]);
  // リンクを開く(この Ubuntu には既定のブラウザが無いので、落ちずに「開けませんでした」と返れば良い)。
  results.openUrl = await runAsync(`
    const done = arguments[arguments.length - 1];
    window.__TAURI__.core.invoke("open_url", { url: "https://example.com/?a=1,b=2" }).then(() => done("ok"), (e) => done("error: " + e));
  `);
  const png = await call("GET", s("/screenshot"));
  writeFileSync(shotPath, Buffer.from(png, "base64"));
  results.screenshot = shotPath;
} catch (error) {
  results.error = String(error.message || error);
  results.driverLog = driverLog.slice(-800);
} finally {
  if (session) await call("DELETE", "/session/" + session).catch(() => {});
  driver.kill();
  console.log(JSON.stringify(results, null, 1));
  setTimeout(() => process.exit(0), 300);
}
