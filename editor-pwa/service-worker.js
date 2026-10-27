// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// キャッシュ名の接頭辞 doc-editor-pwa- は旧名のまま(v171 で Pagelith、v222 で Monolio にしても変えない): 画面右下の版数の表示と
// 古いキャッシュの掃除が、この接頭辞で見分けているため。版数は変更のたびに上げる。
const CACHE = "doc-editor-pwa-v297";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  // 数式の変換・表の計算・グラフ(Issue #207 で app.js・document-format.js から分けた)。index.html が読む。
  "./tex-math.js",
  "./table-formula.js",
  "./chart.js",
  // 文書チェック(Issue #236)。index.html が app.js の前に読む。
  "./document-check.js",
  "./document-format.js",
  // 本文の見た目の正(色・寸法・エディタと保存HTMLで同じ規則。Issue #201)。
  "./document-style.js",
  "./app.js",
  // 絵文字の候補の表(Issue #175)。「:」で初めて候補を出すときに読み込む(17KB)。オフラインでも出せるように先に入れておく。
  "./emoji-data.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  // Mermaid の図(v194)。読み込むのは図のある文書を開いたときだけだが、オフラインでも描けるように先に入れておく(約4MB)。
  "./vendor/mermaid/mermaid.min.js",
  // ライセンス(Issue #234)。Monolio 本体の GPL-3.0-or-later の全文と、第三者の部品の表記・ライセンス全文。File メニューの「ライセンス情報…」が
  // 読むので、オフラインでも見せられるように先に入れておく(Mermaid の LICENSE も、配るファイルと一緒に持つ)。
  "./legal/LICENSE.txt",
  "./legal/THIRD_PARTY_NOTICES.txt",
  "./vendor/mermaid/LICENSE",
];

// v122 で同梱フォント（unicode-range 付きチャンク 717 ファイル・14.9MB）を撤去したので、
// プリキャッシュはアプリ本体だけになった。古い版のキャッシュは activate で
// まるごと削除されるため、端末に残っていたフォントもそこで解放される。
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// ネットを先に見て、出られないときは控えを返す。控えへ入れるのは正常な応答(2xx)だけ(v275。Issue #202。以前は 404・500 の応答も
// 入れていたので、一時的な誤りが良い控えを上書きし、オフラインのときに壊れた画面が出た)。誤りの応答のときも、控えがあれば控えを返す。
// 控えへ入れる処理は waitUntil に渡す(外だと、Service Worker が止められたときに途中で切れる)。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(event.request);
    } catch {
      return (await caches.match(event.request)) || Response.error();
    }
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
      return response;
    }
    return (await caches.match(event.request)) || response;
  })());
});
