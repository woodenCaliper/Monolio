// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
// ブラウザ版(PWA)の index.html には CSP を <meta http-equiv="Content-Security-Policy"> で入れてある(v217)。
// デスクトップ版(Tauri)の CSP は tauri.conf.json の security.csp が正で、Tauri の IPC(ipc: / http://ipc.localhost)も
// そちらで許している。meta を残したまま同梱すると、2つの CSP が両方効き(より厳しい側が勝つ)、meta 側に IPC が無いため
// 保存・開くなどの呼び出しが CSP で止まる。だから同梱するとき(stage-frontend.mjs)はこの meta を外す。
// cspSuite も同じ関数で「exe と同じ形」を再現して試す(関数を1つにして、同梱とテストで食い違わないようにする)。
const CSP_META = /^[ \t]*<meta\s+http-equiv="Content-Security-Policy"[^>]*>[ \t]*\r?\n?/im;

export function stripCspMeta(html) {
  return String(html).replace(CSP_META, "");
}

export function hasCspMeta(html) {
  return /<meta\s+http-equiv="Content-Security-Policy"/i.test(String(html));
}
