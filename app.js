// 亀有の達人 ― 画面側（データの読み込み、入力、表示）。計算は engine.js に任せる。
import { toMin, fmt, toInput, dayKind, DEST, ikiCandidates, kaeriCandidates } from "./engine.js";

const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

// ---- データの読み込み（data/ の JSON）----
const DATA_FILES = {
  iki: "./data/iki-ayase-v1.json",
  kaeri: "./data/kaeri-shinagawa-v1.json",
  holidays: "./data/holidays.json",
};
const D = {};
async function loadData() {
  const entries = await Promise.all(Object.entries(DATA_FILES).map(async ([k, url]) => {
    const r = await fetch(url, { cache: "no-cache" }).catch(() => null);
    if (!r || !r.ok) throw new Error(url + " が読めへん");
    return [k, await r.json()];
  }));
  for (const [k, v] of entries) D[k] = v;
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
  const out = ikiCandidates(D.iki, kind(), t, di, 3);
  if (!out.length) { $("ikiList").innerHTML = '<p class="empty">この時刻のあとに綾瀬で乗れる始発はあらへん。</p>'; return; }
  $("ikiList").innerHTML = out.map((c, i) => {
    const what = c.origin + (c.type || c.dest ? "・" + (c.type ? c.type + " " : "") + (c.dest ? c.dest + "行き" : "") : "");
    const gap = c.wait >= 15 ? `<div class="warnbox">綾瀬で${c.wait - 4}分ほど待つ。急ぐならJRから来た電車にそのまま乗る手もある。</div>` : "";
    return `<article class="card${i === 0 ? " first" : ""}">
      <div class="leg"><span class="t">${fmt(c.kameariDep)}</span><span>亀有 発（各駅停車）</span>
      <span class="t">${fmt(c.ayaseDep)}</span><span>綾瀬 発　<b>${what}</b></span></div>
      ${gap}
      <div class="goal"><span>${c.destName} 着（目安）</span><span class="arr">${fmt(c.destArr)}</span></div>
    </article>`;
  }).join("");
}

// ---- 帰り ----
function renderKaeri() {
  const t = toMin($("kTime").value || "00:00");
  const rows = kaeriCandidates(D.kaeri, kind(), t, 3);
  if (!rows.length) {
    const last = D.kaeri[kind()].at(-1)[0];
    $("kList").innerHTML = `<p class="empty">この時刻のあとの品川始発はあらへん（最終は${last}発）。</p>`; return;
  }
  $("kList").innerHTML = rows.map((c, i) => {
    const b1 = c.kameari1 <= c.kameari2, b2 = c.kameari2 <= c.kameari1;
    return `<article class="card${i === 0 ? " first" : ""}">
      <div class="head"><span class="dep">${fmt(c.shinagawaDep)}<small>品川 発</small></span><span class="tag">${c.typeName}</span></div>
      <div class="route c${b1 ? " best" : ""}"><span class="no">①</span>
        <span class="how">北千住 ${fmt(c.kitasenjuArr)} 着 → ${fmt(c.chiyodaDep)} 発 千代田線${c.chiyodaDest}</span>
        <span class="arr">${fmt(c.kameari1)}<small>亀有</small></span>
        <span class="sub">${c.tight1 ? '<span class="tight">乗り換え1分ギリギリ</span>' : "乗り換え " + c.transfer1 + "分"}</span></div>
      <div class="route j${b2 ? " best" : ""}"><span class="no">②</span>
        <span class="how">松戸 ${fmt(c.matsudoArr)} 着${c.matsudoEst ? "（推定）" : ""} → ${fmt(c.matsudoDep)} 発 各駅停車</span>
        <span class="arr">${fmt(c.kameari2)}<small>亀有</small></span>
        <span class="sub">${c.tight2 ? '<span class="tight">乗り換え1分ギリギリ</span>' : "乗り換え " + c.transfer2 + "分"}・ずっと座れる</span></div>
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
  const items = [];
  for (const [k, d] of Object.entries(D)) {
    const m = d.meta || {};
    for (const s of m.sources || []) items.push(`${m.title ? m.title.split("：")[0] : k}：${s.name}（${s.version || ""}）取り込み ${m.imported || ""}`);
  }
  $("sourceList").innerHTML = items.map(x => `<li>${x}</li>`).join("");
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
  // 画面に戻ってきたら「今」の時刻に合わせ直す（ホーム画面から開き直したとき用）
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderDay(); } });
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
