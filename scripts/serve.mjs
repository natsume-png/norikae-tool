// 手元で試すための小さなウェブサーバー。使い方: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const port = Number(process.argv[2] || 8080);
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(resolve(root, "." + p));
    res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log("http://localhost:" + port + "/"));
