// 公開用のフォルダ dist/ を組み立てる。
//  - 画面のファイル（index.html, app.js, engine.js, styles.css, manifest, icons/, data/）を写す
//  - sw.js（サービスワーカー＝電波が弱くても開けるようにする裏方）に、保存しておくファイル一覧と版の印を書き込む
//  - version.json に組み立てた日時と git のコミット（変更の番号）を書く
// 使い方: node scripts/build-site.mjs
import { cpSync, mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const shell = ["index.html", "app.js", "engine.js", "styles.css", "manifest.webmanifest"];
for (const f of shell) cpSync(resolve(root, f), resolve(dist, f));
cpSync(resolve(root, "icons"), resolve(dist, "icons"), { recursive: true });
cpSync(resolve(root, "data"), resolve(dist, "data"), { recursive: true });

let commit = "local";
try { commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch (e) {}
const built = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const version = commit + "-" + Date.now().toString(36);

const dataFiles = readdirSync(resolve(root, "data")).filter(f => f.endsWith(".json")).map(f => "./data/" + f);
const iconFiles = readdirSync(resolve(root, "icons")).map(f => "./icons/" + f);
const precache = ["./", ...shell.map(f => "./" + f), ...iconFiles, ...dataFiles, "./version.json"];

const swTemplate = readFileSync(resolve(root, "sw.template.js"), "utf8");
const sw = swTemplate.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache, null, 1));
writeFileSync(resolve(dist, "sw.js"), sw);
writeFileSync(resolve(dist, "version.json"), JSON.stringify({ built, commit, version }));
// 手元で試すときのために、root にも sw.js と version.json を置く（git には入れない）
writeFileSync(resolve(root, "sw.js"), sw);
writeFileSync(resolve(root, "version.json"), JSON.stringify({ built, commit, version }));
console.log("dist/ を組み立てた:", version, "ファイル", precache.length, "個");
