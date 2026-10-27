// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PORT } from "../lib.mjs";

// ---- Service Worker の控え(キャッシュ)の取り方(v275。Issue #202) ----
// 以前は、ネットからの応答を確かめずに控えへ入れていた(404・500 の応答が良い控えを上書きし、オフラインのときに壊れた画面が出る)。
// 控えへ入れる処理も event.waitUntil の外で、Service Worker が止められると途中で切れることがあった。
// service-worker.js のソースを、偽の self・caches・fetch の中で動かして、fetch の処理だけを確かめる(ブラウザの本物の
// Service Worker で 500 を返させるのは、テストの仕組みからは難しいため)。
export default async function serviceWorkerSuite({ context }) {
  const page = await context.newPage();
  const result = {};
  try {
    await page.goto("http://127.0.0.1:" + PORT + "/");
    const source = await readFile(resolve("editor-pwa/service-worker.js"), "utf8");
    const outcome = await page.evaluate(async (code) => {
      const store = new Map();
      const cache = {
        put: async (request, response) => { store.set(new URL(request.url ?? request, location.href).href, await response.text()); },
        addAll: async () => {},
      };
      const caches = {
        open: async () => cache,
        keys: async () => [],
        delete: async () => true,
        match: async (request) => {
          const key = new URL(request.url ?? request, location.href).href;
          return store.has(key) ? new Response(store.get(key), { status: 200 }) : undefined;
        },
      };
      const handlers = {};
      const self = { addEventListener: (type, handler) => { handlers[type] = handler; }, skipWaiting() {}, clients: { claim() {} } };
      let network = null;
      const fetchStub = async () => {
        if (network === "offline") throw new TypeError("Failed to fetch");
        return new Response(network.body, { status: network.status });
      };
      new Function("self", "caches", "fetch", code)(self, caches, fetchStub);
      const request = async (path, reply) => {
        network = reply;
        const waits = [];
        let responded = null;
        handlers.fetch({
          request: new Request(new URL(path, location.href).href),
          respondWith: (value) => { responded = value; },
          waitUntil: (value) => { waits.push(value); },
        });
        const response = await responded;
        const settled = await Promise.allSettled(waits);
        // 控えへ入れ終わるのを待つ(waitUntil の外で入れていた以前の作りでは、ここまでに入っていないことがある)
        await new Promise((done) => setTimeout(done, 50));
        return { status: response ? response.status : null, text: response ? await response.text() : null, waits: settled.length,
          cached: store.get(new URL(path, location.href).href) ?? null };
      };
      return {
        good: await request("./app.js", { status: 200, body: "GOOD" }),
        broken: await request("./app.js", { status: 500, body: "BROKEN" }),
        missing: await request("./style.css", { status: 404, body: "NOT FOUND" }),
        offline: await request("./app.js", "offline"),
      };
    }, source);
    // 正常な応答は控えへ入れ、入れる処理は waitUntil に渡す
    result.swCachesOnlyOkResponses = outcome.good.status === 200 && outcome.good.cached === "GOOD" && outcome.good.waits >= 1
      && outcome.missing.cached === null;
    // 500 の応答は良い控えを上書きせず、控えがあれば控えを返す
    result.swKeepsGoodCopyOnServerError = outcome.broken.cached === "GOOD" && outcome.broken.text === "GOOD";
    // ネットに出られないときは控えを返す(今までどおり)
    result.swServesCopyWhenOffline = outcome.offline.text === "GOOD";
    result.swEvidence = outcome;
  } finally {
    await page.close();
  }
  return result;
}
