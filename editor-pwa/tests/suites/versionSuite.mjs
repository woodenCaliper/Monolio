// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PORT } from "../lib.mjs";

// ---- 版の番号(3つの役割。HANDOVER §4.54) ----
// ① アプリの版(セマンティック バージョニング。正は document-format.js の APP_VERSION。上げるのは公開のリリースのときだけ)
//    = package.json・package-lock.json・src-tauri/Cargo.toml・Cargo.lock・tauri.conf.json・画面の表示・保存HTMLの generator と一致する。
// ② 内部の通し番号(service-worker.js の CACHE。変更のたびに上げる)= 画面に「build N」と出る。
// ③ 保存形式の版(VERSION。開くときに読む)= 保存HTMLの formatVersion。
export default async function versionSuite({ context }) {
  const fresh = await context.newPage();
  const result = {};
  try {
    const text = (path) => readFile(resolve(path), "utf8");
    const appVersion = /const APP_VERSION = "([^"]+)"/.exec(await text("editor-pwa/document-format.js"))?.[1];
    const pkg = JSON.parse(await text("package.json"));
    const lock = JSON.parse(await text("package-lock.json"));
    const tauri = JSON.parse(await text("src-tauri/tauri.conf.json"));
    const cargo = await text("src-tauri/Cargo.toml");
    const cargoLock = await text("src-tauri/Cargo.lock");
    const cargoVersion = /^version = "([^"]+)"/m.exec(cargo)?.[1];
    const cargoLockVersion = /name = "monolio"\r?\nversion = "([^"]+)"/.exec(cargoLock)?.[1];
    const build = /const CACHE = "doc-editor-pwa-v(\d+)"/.exec(await text("editor-pwa/service-worker.js"))?.[1];
    result.appVersionIsSemver = /^\d+\.\d+\.\d+$/.test(appVersion || "");
    result.appVersionMatchesPackages = [pkg.version, lock.version, lock.packages[""].version, tauri.version, cargoVersion, cargoLockVersion]
      .every((value) => value === appVersion);
    await fresh.goto("http://127.0.0.1:" + PORT + "/");
    await fresh.waitForSelector("#blocks .block-content");
    await fresh.waitForFunction(() => /build \d+/.test(document.querySelector("#version-badge")?.textContent || ""), null, { timeout: 5000 }).catch(() => {});
    const page = await fresh.evaluate(() => {
      const badge = document.querySelector("#version-badge");
      const fmt = window.SingleHtmlFormat;
      const html = fmt.buildPortableHtml({ pages: [{ id: "V1", title: "V", blocks: [{ id: "v1", type: "paragraph", text: "本文" }] }], fonts: [], attachments: [] });
      const parsed = fmt.parsePortableHtml(html);
      const dom = new DOMParser().parseFromString(html, "text/html");
      const manifest = JSON.parse(dom.querySelector("#document-manifest").textContent);
      return {
        badge: badge?.textContent || "", shown: Boolean(badge) && getComputedStyle(badge).display !== "none",
        appVersion: fmt.APP_VERSION, formatVersion: fmt.VERSION,
        manifestFormat: manifest.formatVersion, manifestGenerator: manifest.generator,
        meta: dom.querySelector('meta[name="generator"]')?.content,
        note: /^<!doctype html>\s*<!--([\s\S]*?)-->/i.exec(html)?.[1] || "",
        reopened: parsed.formatVersion, hasGeneratorInDoc: "generator" in parsed,
      };
    });
    // 画面: 「v1.0.0 · build 293」(アプリの版と通し番号)
    result.badgeShowsAppVersionAndBuild = page.shown && page.badge === "v" + appVersion + " · build " + build;
    // 保存HTML: 形式の版(開くとき用)と作ったアプリの版(参考)の両方
    result.savedHtmlHasBothVersions = page.manifestFormat === page.formatVersion && page.manifestGenerator === "Monolio " + appVersion
      && page.meta === "Monolio " + appVersion && page.note.includes("SingleHtmlTechnicalDocument " + page.formatVersion)
      && page.note.includes("Monolio " + appVersion) && page.appVersion === appVersion;
    // 形式の版は 1.0(公開版から互換を守る起点)。開き直しても同じで、generator は文書に入らない(読み込みでは使わない)
    result.formatVersionIs10 = page.formatVersion === "1.0" && page.reopened === "1.0" && !page.hasGeneratorInDoc;
    result.versionEvidence = JSON.stringify({ appVersion, build, badge: page.badge, format: page.formatVersion });
    return result;
  } finally {
    await fresh.close();
  }
}
