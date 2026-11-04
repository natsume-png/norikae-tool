// サービスワーカー（電波が弱くても開けるようにする裏方）。
// このファイルは雛形。scripts/build-site.mjs が下の VERSION と PRECACHE の目印を埋めて sw.js を作る。
// （注意：目印の文字列をこのコメントに書くと、置き換えがコメントに当たってしまうので書かない）
//
// 方針：ネットがつながるときは必ずネットから最新を取る（画面・計算・時刻表がちぐはぐにならんように）。
//      取れへんとき（圏外・電波が弱い）だけ、保存してある版を使う。
const VERSION = "__VERSION__";
const CACHE = "kameari-" + VERSION;
const PRECACHE = __PRECACHE__;
const NET_TIMEOUT_MS = 6000;

self.addEventListener("install", e => {
  // 保存するときもブラウザの一時保存は使わず、サーバーに確かめてから取る
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: "no-cache" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
      const r = await fetch(req, { signal: ctrl.signal, cache: "no-cache" });
      clearTimeout(timer);
      if (r && r.ok) c.put(req, r.clone());
      return r;
    } catch (err) {
      const cached = await c.match(req, { ignoreSearch: true });
      return cached || new Response("オフラインで、まだ保存されてへんページや。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
