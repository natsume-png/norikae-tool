// サービスワーカー（電波が弱くても開けるようにする裏方）。
// scripts/build-site.mjs が __VERSION__ と __PRECACHE__ を埋めて sw.js を作る。
const VERSION = "__VERSION__";
const CACHE = "kameari-" + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 同じサイトの GET は「保存してあれば先に返し、裏で最新を取り直す」。初めてのものはネットから。
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const cached = await c.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return cached || (await fresh) || new Response("オフラインで、まだ保存されてへんページや。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }));
});
