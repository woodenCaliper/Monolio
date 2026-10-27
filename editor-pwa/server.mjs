// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) woodenCaliper
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const ROOT = resolve("editor-pwa");
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function resolvePath(url) {
  // 壊れた %(例 /%)は decodeURIComponent が投げて、サーバーごと落ちていた。受けずに 403 にする。
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return null;
  }
  const target = normalize(join(ROOT, pathname === "/" ? "index.html" : pathname));
  // ROOT + 区切りで比べる(startsWith(ROOT) だけだと、/..%2Feditor-pwa-xxx/ で隣の editor-pwa-xxx フォルダが読めた)。
  if (!target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  const target = resolvePath(req.url);
  if (!target) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const s = await stat(target);
    const file = s.isDirectory() ? join(target, "index.html") : target;
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${PORT}/`);
});
