// 亀有の達人 ― 画面側（データの読み込み、入力、表示）。計算は engine.js に任せる。
import { toMin, fmt, toInput, dayKind, DEST, ikiCandidates, kaeriCandidates } from "./engine.js";

const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

// ---- データの読み込み（data/ の JSON。平日・土休日の両方を最初に読む）----
const KINDS = { wd: "weekday", hd: "holiday" };
const FILES = k => ({
  jrUp: `./data/jr-joban-local-up-${k}.json`,        // 常磐線各停 上り（亀有発→綾瀬、松戸発→亀有）
  jrDown: `./data/jr-joban-local-down-${k}.json`,    // 千代田線→常磐線各停 下り（北千住発→亀有）
  shinagawa: `./data/jr-shinagawa-joban-${k}.json`,  // 品川始発の各列車（停車駅の着・発・番線）
  ayase: `./data/ekitan-metro-chiyoda-ayase-${k}.json`, // 綾瀬駅 代々木上原方面の全列車（始発の見分け用）
});
const D = { wd: {}, hd: {}, holidays: null };
async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-cache" }).catch(() => null);
  if (!r || !r.ok) throw new Error(url + " が読めへん");
  return r.json();
}
async function loadData() {
  D.holidays = await fetchJson("./data/holidays.json");
  for (const [kind, k] of Object.entries(KINDS)) {
    const files = FILES(k);
    const got = await Promise.all(Object.entries(files).map(async ([key, url]) => [key, await fetchJson(url)]));
    for (const [key, v] of got) D[kind][key] = v;
  }
}

// ---- 平日／土休日 ----
let dayMode = "auto";
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function kind() { return dayMode === "auto" ? dayKind(new Date(), D.holidays) : dayMode; }
function renderDay() {
  $("dayLabel").textContent = (kind() === "hd" ? "土休日" : "平日") + "ダイヤ";
  [["dAuto", "auto"], ["dWd", "wd"], ["dHd", "hd"]].forEach(([id, v]) => $(id).setAttribute("aria-pressed", String(dayMode === v)));
}

// ---- 行き ----
function renderIki() {
  const t = toMin($("ikiTime").value || "00:00");
  const di = Number($("dest").value);
  const out = ikiCandidates(D[kind()], t, di, 3);
  if (!out.length) { $("ikiList").innerHTML = '<p class="empty">この時刻のあとの亀有発（各駅停車）があらへん。</p>'; return; }
  $("ikiList").innerHTML = out.map((c, i) => {
    if (c.ayaseDep === null) {
      return `<article class="card${i === 0 ? " first" : ""}">
        <div class="leg"><span class="t">${fmt(c.kameariDep)}</span><span>亀有 発（各駅停車）</span>
        <span class="t">${fmt(c.ayaseArr)}</span><span>綾瀬 着</span></div>
        <div class="warnbox">このあと綾瀬で乗れる始発があらへん。JRから来た電車にそのまま乗る。${c.throughArr ? `${c.destName} 着 ${fmt(c.throughArr)}` : ""}</div>
      </article>`;
    }
    const what = c.origin + (c.type || c.dest ? "・" + (c.type ? c.type + " " : "") + (c.dest ? c.dest + "行き" : "") : "");
    const waitAyase = c.ayaseDep - c.ayaseArr;
    const gap = waitAyase >= 10
      ? `<div class="warnbox">綾瀬で${waitAyase}分待つ。急ぐならJRから来た電車にそのまま乗る手もある${c.throughArr ? `（${c.destName} 着 ${fmt(c.throughArr)}）` : ""}。</div>` : "";
    return `<article class="card${i === 0 ? " first" : ""}">
      <div class="leg"><span class="t">${fmt(c.kameariDep)}</span><span>亀有 発（各駅停車）</span>
      <span class="t">${fmt(c.ayaseDep)}</span><span>綾瀬 発（${fmt(c.ayaseArr)}着）　<b>${what}</b></span></div>
      ${gap}
      <div class="goal"><span>${c.destName} 着（目安）</span><span class="arr">${fmt(c.destArr)}</span></div>
    </article>`;
  }).join("");
}

// ---- 帰り ----
function renderKaeri() {
  const t = toMin($("kTime").value || "00:00");
  const rows = kaeriCandidates(D[kind()], t, 3);
  if (!rows.length) { $("kList").innerHTML = `<p class="empty">この時刻のあとの品川始発（普通・快速・特別快速）はあらへん。</p>`; return; }
  const pl = p => p ? `（${p}番線）` : "";
  $("kList").innerHTML = rows.map((c, i) => {
    const b1 = c.kameari1 !== null && (c.kameari2 === null || c.kameari1 <= c.kameari2);
    const b2 = c.kameari2 !== null && (c.kameari1 === null || c.kameari2 <= c.kameari1);
    const r1 = c.kameari1 === null ? `<span class="how">北千住 ${fmt(c.kitasenjuArr)} 着${pl(c.kitasenjuPlatform)}　このあと亀有に止まる千代田線があらへん</span><span class="arr">—</span><span class="sub"></span>`
      : `<span class="how">北千住 ${fmt(c.kitasenjuArr)} 着${pl(c.kitasenjuPlatform)} → ${fmt(c.chiyodaDep)} 発 千代田線 ${c.chiyodaDest}</span>
        <span class="arr">${fmt(c.kameari1)}<small>亀有</small></span>
        <span class="sub">${c.tight1 ? '<span class="tight">乗り換え1分ギリギリ</span>' : "乗り換え " + c.transfer1 + "分"}</span>`;
    const r2 = c.kameari2 === null ? `<span class="how">松戸 ${fmt(c.matsudoArr)} 着${pl(c.matsudoPlatform)}　このあと各駅停車があらへん</span><span class="arr">—</span><span class="sub"></span>`
      : `<span class="how">松戸 ${fmt(c.matsudoArr)} 着${pl(c.matsudoPlatform)} → ${fmt(c.matsudoDep)} 発 各駅停車</span>
        <span class="arr">${fmt(c.kameari2)}<small>亀有</small></span>
        <span class="sub">${c.tight2 ? '<span class="tight">乗り換え1分ギリギリ</span>' : "乗り換え " + c.transfer2 + "分"}・ずっと座れる</span>`;
    return `<article class="card${i === 0 ? " first" : ""}">
      <div class="head"><span class="dep">${fmt(c.shinagawaDep)}<small>品川 発${pl(c.shinagawaPlatform)}</small></span><span class="tag">${c.typeName}</span></div>
      <div class="route c${b1 ? " best" : ""}"><span class="no">①</span>${r1}</div>
      <div class="route j${b2 ? " best" : ""}"><span class="no">②</span>${r2}</div>
    </article>`;
  }).join("");
}

// ---- タブ ----
function setTab(tab) {
  const iki = tab === "iki";
  $("tIki").setAttribute("aria-selected", String(iki)); $("tKaeri").setAttribute("aria-selected", String(!iki));
  $("pIki").hidden = !iki; $("pKaeri").hidden = iki; store.set("tab", tab);
}
function renderAll() { renderDay(); renderIki(); renderKaeri(); }

// ---- 出典の表示 ----
function renderSources() {
  const seen = new Map();
  const add = d => { for (const s of (d.meta && d.meta.sources) || []) { const key = s.name + s.version; if (!seen.has(key)) seen.set(key, `${s.name}（${s.version}）取り込み ${d.meta.imported}`); } };
  add(D.holidays);
  for (const kind of Object.keys(KINDS)) for (const d of Object.values(D[kind])) add(d);
  $("sourceList").innerHTML = [...seen.values()].map(x => `<li>${x}</li>`).join("");
}

// ---- 起動 ----
async function main() {
  $("status").textContent = "時刻表を読み込み中…";
  try { await loadData(); } catch (e) { $("status").textContent = "時刻表が読めへんかった：" + e.message; return; }
  $("status").textContent = "";
  $("dest").innerHTML = DEST.map((d, i) => `<option value="${i}">${d[0]}</option>`).join("");
  $("dest").value = store.get("dest") ?? "11";
  $("ikiTime").value = $("kTime").value = toInput(nowMin());
  $("tIki").onclick = () => setTab("iki"); $("tKaeri").onclick = () => setTab("kaeri");
  $("ikiNow").onclick = () => { $("ikiTime").value = toInput(nowMin()); renderIki(); };
  $("kNow").onclick = () => { $("kTime").value = toInput(nowMin()); renderKaeri(); };
  $("ikiTime").oninput = renderIki; $("kTime").oninput = renderKaeri;
  $("dest").onchange = () => { store.set("dest", $("dest").value); renderIki(); };
  [["dAuto", "auto"], ["dWd", "wd"], ["dHd", "hd"]].forEach(([id, v]) => $(id).onclick = () => { dayMode = v; renderAll(); });
  setTab(store.get("tab") === "kaeri" ? "kaeri" : "iki");
  renderSources();
  renderAll();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderDay(); });
}
main();

// ---- ホーム画面用の仕組み（サービスワーカー＝電波が弱くても開けるようにする裏方）----
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw && nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) $("updateBox").hidden = false;
      });
    });
  }).catch(() => {});
  $("updateBtn").onclick = () => location.reload();
  fetch("./version.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(v => {
    if (v) $("buildInfo").textContent = "この版：" + v.built + "（" + v.commit + "）";
  }).catch(() => {});
}
