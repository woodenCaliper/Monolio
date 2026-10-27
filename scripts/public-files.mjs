// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper

// 公開用リポジトリ(woodenCaliper/Monolio)に入れないファイル。公開用の中身は「開発用(Monolio-dev)の中身から、これを除いたもの」を
// 機械的に写すだけにする(公開用だけを手で直さない。二重管理にしない)。公開する範囲を決めるのはこの1か所。
// 開発の文書(CLAUDE.md・HANDOVER.md・CHANGELOG.md など)も公開する(個人・会社の情報が無いことを確かめた。2026-10-27 ユーザー決定)。
// - node_modules/: 第三者の部品の実体(npm install で入る)
// - .claude/: 手元の道具(Claude Code)の設定
export const PRIVATE_PATHS = [
  "node_modules/",
  ".claude/",
];

export function isPrivatePath(file) {
  return PRIVATE_PATHS.some((entry) => entry.endsWith("/") ? file.startsWith(entry) : file === entry);
}
