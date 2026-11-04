// 公開用の組み立て（scripts/build-site.mjs）の答え合わせ。
// 2026-11-04 に、sw.js の目印（VERSION / PRECACHE）がコメント行にだけ置き換わって本体に残り、
// 裏方（サービスワーカー）が一度も動いてへんかった。二度と起きんように、組み立てた結果を実際に動かして確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "../scripts/build-site.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = mkdtempSync(join(tmpdir(), "kameari-dist-"));
const r = build(root, dist, { writeRootCopies: false });
process.on("exit", () => rmSync(dist, { recursive: true, force: true }));

// sw.js を、ブラウザの代わりの小さな環境で実際に読み込む（目印が残っていれば ReferenceError で落ちる）
function runSw() {
  const listeners = {};
  const Request = class { constructor(url, init) { this.url = url; this.init = init || {}; } };
  const sandbox = {
    self: { addEventListener: (k, f) => { listeners[k] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    location: { origin: "https://example.test" },
    caches: null, fetch: null, Request, Response: class {}, URL, AbortController, setTimeout, clearTimeout, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const result = vm.runInContext(readFileSync(join(dist, "sw.js"), "utf8") + "\n;({ VERSION, PRECACHE })", sandbox, { filename: "sw.js" });
  return { listeners, sandbox, ...result };
}

test("組み立て：sw.js に目印が残っておらず、版の印が git のコミットから付く", () => {
  const sw = readFileSync(join(dist, "sw.js"), "utf8");
  assert.ok(!sw.includes("__VERSION__") && !sw.includes("__PRECACHE__"), "目印が残っとる");
  assert.match(sw, new RegExp(`const VERSION = "${r.version}";`));
  assert.ok(r.version.startsWith(r.commit + "-"));
  const v = JSON.parse(readFileSync(join(dist, "version.json"), "utf8"));
  assert.deepEqual(v, { built: r.built, commit: r.commit, version: r.version });
});

test("組み立て：sw.js は読み込みで落ちず、install / activate / fetch の3つを受け持ち、保存一覧のファイルは全部 dist にある", () => {
  const { listeners, VERSION, PRECACHE } = runSw();
  assert.equal(VERSION, r.version);
  assert.deepEqual(Object.keys(listeners).sort(), ["activate", "fetch", "install"]);
  assert.ok(PRECACHE.includes("./") && PRECACHE.includes("./index.html") && PRECACHE.includes("./app.js") && PRECACHE.includes("./engine.js"));
  assert.ok(PRECACHE.includes("./data/holidays.json") && PRECACHE.includes("./data/transfers.json") && PRECACHE.includes("./version.json"));
  for (const u of PRECACHE) {
    const f = u === "./" ? "./index.html" : u;
    assert.ok(existsSync(join(dist, f)), `${u} が dist に無い`);
  }
});

test("組み立て：install は保存一覧を「一時保存を使わず」取りに行き、終わったら新しい裏方にすぐ切り替える", async () => {
  const { listeners, sandbox, PRECACHE } = runSw();
  let added = null, skipped = false, opened = null;
  sandbox.caches = { open: async name => { opened = name; return { addAll: async reqs => { added = reqs; } }; } };
  sandbox.self.skipWaiting = async () => { skipped = true; };
  let waited;
  listeners.install({ waitUntil: p => { waited = p; } });
  await waited;
  assert.equal(opened, "kameari-" + r.version);
  assert.deepEqual(added.map(x => x.url), PRECACHE);
  assert.ok(added.every(x => x.init.cache === "no-cache"));
  assert.ok(skipped);
});

test("組み立て：fetch はネット優先（no-cache）。ネットが落ちたら保存してある版、それも無ければ503", async () => {
  const { listeners, sandbox } = runSw();
  const store = new Map();
  sandbox.caches = { open: async () => ({ put: async (req, res) => { store.set(req.url, res); }, match: async req => store.get(req.url) || undefined }) };
  const respond = async (req, fetchImpl) => {
    sandbox.fetch = fetchImpl;
    let out;
    listeners.fetch({ request: req, respondWith: p => { out = p; } });
    return out;
  };
  const req = { method: "GET", url: "https://example.test/norikae-tool/app.js" };
  const fresh = { ok: true, body: "新", clone() { return this; } };
  let seenInit = null;
  assert.equal(await respond(req, async (q, init) => { seenInit = init; return fresh; }), fresh);
  assert.equal(seenInit.cache, "no-cache");
  // ネットが落ちた → さっき保存した版
  assert.equal(await respond(req, async () => { throw new Error("offline"); }), fresh);
  // 保存も無い → 503
  const res = await respond({ method: "GET", url: "https://example.test/norikae-tool/none.json" }, async () => { throw new Error("offline"); });
  assert.ok(res instanceof sandbox.Response);
  // 別のサイトや GET 以外は裏方が触らない
  let touched = false;
  listeners.fetch({ request: { method: "POST", url: "https://example.test/x" }, respondWith: () => { touched = true; } });
  listeners.fetch({ request: { method: "GET", url: "https://other.test/x" }, respondWith: () => { touched = true; } });
  assert.equal(touched, false);
});

test("組み立て：index.html と app.js の読み込み先に版の印（?v=）が付く", () => {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const app = readFileSync(join(dist, "app.js"), "utf8");
  assert.ok(html.includes(`src="./app.js?v=${r.version}"`), "app.js に版の印が無い");
  assert.ok(html.includes(`href="./styles.css?v=${r.version}"`), "styles.css に版の印が無い");
  assert.ok(app.includes(`from "./engine.js?v=${r.version}"`), "engine.js に版の印が無い");
  // 元の index.html / app.js（手元で試す用）は印なしのまま
  assert.ok(readFileSync(join(root, "index.html"), "utf8").includes('src="./app.js"'));
  assert.ok(readFileSync(join(root, "app.js"), "utf8").includes('from "./engine.js"'));
});
