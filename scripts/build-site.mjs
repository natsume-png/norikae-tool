// 公開用のフォルダ dist/ を組み立てる。
//  - 画面のファイル（index.html, app.js, engine.js, styles.css, manifest, icons/, data/）を写す
//  - index.html と app.js が読み込むファイル名に版の印（?v=…）を付ける（ブラウザの一時保存に古い版が残っても、新しい画面は新しい計算を読む）
//  - sw.js（サービスワーカー＝電波が弱くても開けるようにする裏方）に、保存しておくファイル一覧と版の印を書き込む
//  - version.json に組み立てた日時と git のコミット（変更の番号）を書く
// 使い方: node scripts/build-site.mjs [出力先]   （出力先を省くと dist/）
import { cpSync, mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function build(root, dist, { writeRootCopies = true } = {}) {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  let commit = "local";
  try { commit = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) {}
  const built = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const version = commit + "-" + Date.now().toString(36);

  // 文字の置き換え。目印が1つも無い／置き換え後も残っている、はどちらも組み立ての間違いなので止める
  const fill = (name, text, pairs) => {
    for (const [from, to] of pairs) {
      if (!text.includes(from)) throw new Error(`${name} に「${from}」が見つからへん（雛形が変わった？）`);
      text = text.replaceAll(from, to);
    }
    for (const [from] of pairs) if (text.includes(from)) throw new Error(`${name} に「${from}」が残っとる`);
    return text;
  };

  const shell = ["index.html", "app.js", "engine.js", "styles.css", "manifest.webmanifest"];
  for (const f of shell) cpSync(resolve(root, f), resolve(dist, f));
  cpSync(resolve(root, "icons"), resolve(dist, "icons"), { recursive: true });
  cpSync(resolve(root, "data"), resolve(dist, "data"), { recursive: true });

  // 読み込み先に版の印を付ける（index.html → app.js / styles.css、app.js → engine.js）
  const q = "?v=" + version;
  writeFileSync(resolve(dist, "index.html"), fill("index.html", readFileSync(resolve(root, "index.html"), "utf8"), [
    ['src="./app.js"', `src="./app.js${q}"`],
    ['href="./styles.css"', `href="./styles.css${q}"`],
  ]));
  writeFileSync(resolve(dist, "app.js"), fill("app.js", readFileSync(resolve(root, "app.js"), "utf8"), [
    ['from "./engine.js"', `from "./engine.js${q}"`],
  ]));

  const dataFiles = readdirSync(resolve(root, "data")).filter(f => f.endsWith(".json")).map(f => "./data/" + f);
  const iconFiles = readdirSync(resolve(root, "icons")).map(f => "./icons/" + f);
  const precache = ["./", ...shell.map(f => "./" + f), ...iconFiles, ...dataFiles, "./version.json"];

  const sw = fill("sw.template.js", readFileSync(resolve(root, "sw.template.js"), "utf8"), [
    ["__VERSION__", version],
    ["__PRECACHE__", JSON.stringify(precache, null, 1)],
  ]);
  const versionJson = JSON.stringify({ built, commit, version });
  writeFileSync(resolve(dist, "sw.js"), sw);
  writeFileSync(resolve(dist, "version.json"), versionJson);
  if (writeRootCopies) {
    // 手元で試すときのために、root にも sw.js と version.json を置く（git には入れない）
    writeFileSync(resolve(root, "sw.js"), sw);
    writeFileSync(resolve(root, "version.json"), versionJson);
  }
  return { version, commit, built, precache };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dist = resolve(process.argv[2] || resolve(root, "dist"));
  const r = build(root, dist);
  console.log("組み立てた:", dist, "版", r.version, "ファイル", r.precache.length, "個");
}
