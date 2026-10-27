// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT, PORT, openMenu } from "../lib.mjs";
import { hasCspMeta, stripCspMeta } from "../../../src-tauri/strip-csp-meta.mjs";

// ---- Content-Security-Policy の下でアプリが動く(デスクトップ版 v214・ブラウザ版 v217) ----
// 無害化がすり抜けても、読み込める script を自分のファイル(script-src 'self')に限り、注入されたインラインスクリプトを
// 実行させないための CSP(HANDOVER §4.28)。CSP は2か所にある:
//   - デスクトップ版(exe): tauri.conf.json の security.csp(下の EXE_CSP。Tauri の IPC を connect-src で許す)
//   - ブラウザ版(PWA): index.html の <meta http-equiv="Content-Security-Policy">(下の PWA_CSP。EXE_CSP から IPC だけ除いたもの)
//     exe へ同梱するときは meta を外す(src-tauri/strip-csp-meta.mjs。2つが両方効くと IPC が止まるため)
// このスイートは、
//   - 3か所(スイート・tauri.conf.json・index.html)の CSP がずれていないこと、同梱で meta が外れること
//   - exe と同じ形(meta を外した index.html + ヘッダの EXE_CSP)と、ブラウザ版そのまま(meta の PWA_CSP)の両方で、
//     アプリが起動し、グラフ・Mermaid・数式が描け、印刷の枠に実行されるスクリプトが無く、CSP 違反が1件も出ないこと
//   - ブラウザ版で、差し込まれたインラインスクリプトが実際に止まること(CSP が効いている証拠)
// を確かめる。※exe の IPC(保存・開く・添付・リンク)は実機で確認済み(v214)。この環境では exe をビルドできない。
// v273: 動画の添付を blob の URL で再生するため media-src 'self' blob: を足した(3か所とも)。
// v277: PDF の添付をその場で見るため(blob の URL を iframe に入れて、ブラウザの PDF ビューアで見る)frame-src に blob: を足した(3か所とも)。
const EXE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' blob: ipc: http://ipc.localhost; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'self' blob:";
const PWA_CSP = EXE_CSP.replace(" ipc: http://ipc.localhost", "");
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const cells = (...values) => values.map((text) => ({ text }));
const LITERAL = {
  title: "CSP 見本",
  fonts: [],
  attachments: [],
  pages: [
    { id: "C1", title: "CSP 見本", blocks: [
      { id: "p", type: "paragraph", text: "本文" },
      { id: "tb", type: "table", rows: [cells("x", "y"), cells("1", "10"), cells("2", "20")] },
      { id: "c", type: "chart", text: "line(A2:A3, B2:B3)" },
      { id: "mm", type: "mermaid", text: "graph TD;A-->B;B-->C" },
      { id: "ma", type: "math", text: "x^2 + y^2 = z^2" },
    ] },
    { id: "C2", title: "二枚目", blocks: [{ id: "q", type: "paragraph", text: "二枚目の本文" }] },
  ],
};

// 1つの形(コンテキスト)で、起動・文書を開く・描画・印刷を通し、結果と CSP 違反を返す。
async function runScenario(context, fileName) {
  const violations = [];
  // ファイルは input 経由で開く(showOpenFilePicker を無効化)。印刷の枠を含む全フレームで window.print を記録に置換。
  await context.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    window.print = () => {
      const host = window.top;
      host.__printCalls = host.__printCalls || [];
      host.__printCalls.push({
        inFrame: window !== window.top,
        hasManifest: Boolean(document.querySelector("#document-manifest")),
        // 実行される script(型なし・javascript・module)が枠に残っていないこと。
        executableScripts: [...document.querySelectorAll("script")]
          .filter((s) => !s.type || /javascript|module/i.test(s.type)).length,
        pageTitles: [...document.querySelectorAll("h1")].map((n) => n.textContent),
      });
    };
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  page.on("console", (m) => { const t = m.text(); if (/content security policy|refused to|violat/i.test(t)) violations.push(m.type() + ": " + t); });
  page.on("pageerror", (e) => violations.push("pageerror: " + String(e.message || e)));

  await page.goto("http://127.0.0.1:" + PORT + "/");
  await page.waitForSelector("#blocks .block-content", { timeout: 8000 });
  const file = join(OUT, fileName);
  await writeFile(file, await page.evaluate((doc) => window.SingleHtmlFormat.buildPortableHtml(doc), LITERAL), "utf8");
  const chooser = page.waitForEvent("filechooser");
  await openMenu(page, "file");
  await page.locator("#menu-open-document").click();
  await (await chooser).setFiles(file);
  await page.waitForFunction(() => document.querySelector("#doc-title")?.textContent === "CSP 見本", null, { timeout: 6000 }).catch(() => {});
  // Mermaid の描画を待つ。
  await page.waitForTimeout(3000);
  const rendered = await page.evaluate(() => ({
    chart: !!document.querySelector("#blocks .doc-chart svg, #blocks .chart-canvas svg"),
    mermaid: !!document.querySelector("#blocks [class*=mermaid] svg"),
    math: !!document.querySelector("#blocks math"),
    title: document.querySelector("#doc-title")?.textContent,
    cspMeta: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? null,
  }));
  // 印刷(Ctrl+P): 見えない枠の保存HTMLを刷る。ヘッドレスでは print() は記録に置換済み。
  await page.locator("#blocks .block-content", { hasText: "本文" }).click();
  await page.keyboard.press("Control+p");
  await page.waitForFunction(() => (window.__printCalls || []).length >= 1, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  const printCall = (await page.evaluate(() => window.__printCalls || []))[0] || null;
  return {
    page,
    violations,
    renders: rendered.chart && rendered.mermaid && rendered.math && rendered.title === "CSP 見本",
    cspMeta: rendered.cspMeta,
    // 印刷の枠は、保存HTML(目印あり)で、実行されるインラインスクリプトが無く、全ページを含む。
    printClean: Boolean(printCall) && printCall.inFrame && printCall.hasManifest && printCall.executableScripts === 0
      && printCall.pageTitles.includes("CSP 見本") && printCall.pageTitles.includes("二枚目"),
  };
}

export default async function cspSuite({ browser }) {
  const result = {};

  // ---- 3か所の CSP と、同梱で meta が外れること ----
  // exe の CSP(tauri.conf.json)とこのスイートの CSP が同じで、Tauri の IPC(http://ipc.localhost。保存・開く・添付の呼び出し)を
  // connect-src で許していること(v214。許していないと、呼ぶたびに CSP 違反が出て予備の postMessage へ落ちる。実機の exe で見つけた)。
  const tauriConf = JSON.parse(await readFile(join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
  const exeCsp = tauriConf.app?.security?.csp ?? "";
  result.exeCspMatchesSuite = exeCsp === EXE_CSP;
  result.exeCspAllowsTauriIpc = /connect-src[^;]*\bipc:/.test(exeCsp) && /connect-src[^;]*http:\/\/ipc\.localhost/.test(exeCsp);
  // ブラウザ版の index.html は、EXE_CSP から IPC だけ除いた CSP を meta で持ち、それが CSS・script より前にある
  // (meta の CSP は、それより前に読み始めたものには効かない)。
  const indexHtml = await readFile(join(ROOT, "editor-pwa/index.html"), "utf8");
  const metaMatch = indexHtml.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/i);
  const metaAt = metaMatch ? metaMatch.index : -1;
  const firstResource = Math.min(...[/<link\s+rel="stylesheet"/i, /<script\b/i].map((re) => {
    const at = indexHtml.search(re);
    return at < 0 ? Infinity : at;
  }));
  result.pwaIndexHasCspMeta = Boolean(metaMatch) && metaMatch[1] === PWA_CSP && metaAt < firstResource
    && (indexHtml.match(/http-equiv="Content-Security-Policy"/gi) || []).length === 1;
  result.pwaCspIsExeCspWithoutIpc = PWA_CSP !== EXE_CSP && !/ipc/.test(PWA_CSP);
  // 同梱(npm run tauri:stage と同じスクリプト)で、exe の index.html から meta が外れ、ほかは変わらない。
  const staged = spawnSync(process.execPath, ["src-tauri/stage-frontend.mjs"], { cwd: ROOT, encoding: "utf8" });
  const stagedIndex = staged.status === 0 ? await readFile(join(ROOT, "src-tauri/frontend/index.html"), "utf8") : "";
  result.stagedExeIndexHasNoCspMeta = staged.status === 0 && !hasCspMeta(stagedIndex)
    && stagedIndex === stripCspMeta(indexHtml) && stagedIndex.includes('<script src="./app.js"></script>');
  result.stageEvidence = staged.status === 0 ? "ok" : String(staged.stderr || staged.error || staged.status).slice(0, 300);

  // ---- exe と同じ形: meta を外した index.html + ヘッダの EXE_CSP ----
  const exeContext = await browser.newContext();
  try {
    await exeContext.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") return route.continue();
      try {
        const resp = await route.fetch();
        await route.fulfill({
          response: resp,
          body: stripCspMeta(await resp.text()),
          headers: { ...resp.headers(), "content-security-policy": EXE_CSP },
        });
      } catch {
        route.continue();
      }
    });
    const exe = await runScenario(exeContext, "csp-doc-exe.html");
    // CSP 下でも、グラフ・Mermaid・数式が描ける(script-src 'self' で動く)。
    result.cspRendersChartMermaidMath = exe.renders && exe.cspMeta === null;
    result.cspPrintFrameHasNoExecutableScripts = exe.printClean;
    // 一連の操作(起動・描画・印刷)で CSP 違反・未捕捉エラーが1件も出ていない。
    result.cspNoViolations = exe.violations.length === 0;
    // 証拠は文字列で残す(空配列は report で不合格に数えられるため、配列にしない)。
    result.cspViolationsSeen = exe.violations.slice(0, 10).join("  ||  ");
  } finally {
    await exeContext.close();
  }

  // ---- ブラウザ版そのまま: index.html の meta の PWA_CSP だけ(ヘッダは付けない) ----
  const pwaContext = await browser.newContext();
  try {
    const pwa = await runScenario(pwaContext, "csp-doc-pwa.html");
    result.pwaCspRendersChartMermaidMath = pwa.renders && pwa.cspMeta === PWA_CSP;
    result.pwaCspPrintFrameHasNoExecutableScripts = pwa.printClean;
    result.pwaCspNoViolations = pwa.violations.length === 0;
    result.pwaCspViolationsSeen = pwa.violations.slice(0, 10).join("  ||  ");
    // CSP が効いている証拠: 差し込まれたインラインスクリプトは実行されない(無害化がすり抜けた場合と同じ形)。
    // 違反が1件出るのが正しい動きなので、上の「違反なし」を数えたあとで試す。
    result.pwaCspBlocksInjectedInlineScript = await pwa.page.evaluate(async () => {
      window.__injected = false;
      const script = document.createElement("script");
      script.textContent = "window.__injected = true;";
      document.body.append(script);
      await new Promise((resolve) => setTimeout(resolve, 100));
      script.remove();
      return window.__injected === false;
    });
  } finally {
    await pwaContext.close();
  }
  return result;
}
