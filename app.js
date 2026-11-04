// 亀有の達人 ― 画面側（データの読み込み、入力、表示）。計算は engine.js に任せる。
import { toMin, fmt, toInput, dayKind, DEST, ikiCandidates, kaeriCandidates, shimbashiCandidates, aotoCandidates } from "./engine.js";

const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};

// ---- データの読み込み（data/ の JSON。平日・土休日の両方を最初に読む）----
const KINDS = { wd: "weekday", hd: "holiday" };
// 必ず要るもの
const FILES = k => ({
  jrUp: `./data/jr-joban-local-up-${k}.json`,        // 常磐線各停 上り（亀有発→綾瀬、松戸発→亀有、JR直通は千代田線内も）
  jrDown: `./data/jr-joban-local-down-${k}.json`,    // 千代田線→常磐線各停 下り（北千住発→亀有）
  shinagawa: `./data/jr-shinagawa-joban-${k}.json`,  // 品川始発の各列車（停車駅の着・発・番線）
  ayase: `./data/ekitan-metro-chiyoda-ayase-${k}.json`, // 綾瀬駅 代々木上原方面の全列車（始発の見分け用）
  jrRapidUp: `./data/jr-joban-rapid-up-${k}.json`,   // 常磐線快速 上り（北千住→日暮里・上野・新橋）
  yamanote: `./data/jr-yamanote-outer-${k}.json`,    // 山手線 外回り
  keihin: `./data/jr-keihintohoku-south-${k}.json`,  // 京浜東北線 南行
});
// 無くてもよいもの（駅探のデータ。土休日分はまだ無いことがある）
const OPTIONAL = k => ({
  kitasenjuUp: `./data/ekitan-metro-chiyoda-kitasenju-up-${k}.json`,
  hibiyaKitasenju: `./data/ekitan-metro-hibiya-kitasenju-${k}.json`,
  hibiyaGinza: `./data/ekitan-metro-hibiya-ginza-${k}.json`,
  hibiyaHigashiginza: `./data/ekitan-metro-hibiya-higashiginza-${k}.json`,
  ginzaGinza: `./data/ekitan-metro-ginza-ginza-shibuya-${k}.json`,
  ginzaShimbashiShibuya: `./data/ekitan-metro-ginza-shimbashi-shibuya-${k}.json`,
  ginzaTameike: `./data/ekitan-metro-ginza-tameike-asakusa-${k}.json`,
  ginzaShimbashiAsakusa: `./data/ekitan-metro-ginza-shimbashi-asakusa-${k}.json`,
  asakusaHigashiginza: `./data/ekitan-toei-asakusa-higashiginza-nishimagome-${k}.json`,
  asakusaShimbashi: `./data/ekitan-toei-asakusa-shimbashi-nishimagome-${k}.json`,
  keiseiAotoUp: `./data/ekitan-keisei-oshiage-aoto-up-${k}.json`,
  keiseiAotoDown: `./data/ekitan-keisei-main-aoto-down-${k}.json`,
  keikyuKawasaki: `./data/ekitan-keikyu-kawasaki-down-${k}.json`,
  airportMain: `./data/ekitan-keisei-main-airport2-down-${k}.json`,
  airportSA: `./data/ekitan-keisei-sa-airport2-down-${k}.json`,
});
const D = { wd: {}, hd: {}, holidays: null, transfers: null, bus: null, missing: { wd: [], hd: [] } };
async function fetchJson(url, optional = false) {
  const r = await fetch(url, { cache: "no-cache" }).catch(() => null);
  if (!r || !r.ok) { if (optional) return null; throw new Error(url + " が読めへん"); }
  return r.json();
}
async function loadData() {
  [D.holidays, D.transfers, D.bus] = await Promise.all([fetchJson("./data/holidays.json"), fetchJson("./data/transfers.json"), fetchJson("./data/bus-shuttle-seven.json")]);
  for (const [kind, k] of Object.entries(KINDS)) {
    const req = Object.entries(FILES(k)).map(async ([key, url]) => [key, await fetchJson(url)]);
    const opt = Object.entries(OPTIONAL(k)).map(async ([key, url]) => [key, await fetchJson(url, true)]);
    for (const [key, v] of await Promise.all([...req, ...opt])) {
      D[kind][key] = v;
      if (v === null) D.missing[kind].push(key);
    }
    D[kind].transfers = D.transfers; D[kind].bus = D.bus;
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
function missingNote() {
  return D.missing[kind()].length ? `<div class="warnbox">${kind() === "hd" ? "土休日" : "平日"}の地下鉄・京成・京急の時刻表がまだ取り込めてへん分があるので、その経路は出えへん（取り込みは土曜か休日に行う）。</div>` : "";
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

// ---- 経路の表示（新橋・青砥で共通）----
function legsHtml(c) {
  const legs = c.legs.map(l => `<span class="t">${fmt(l.dep)}</span><span>${l.from} 発　${l.line}</span><span class="t">${fmt(l.arr)}</span><span>${l.to} 着</span>`).join("");
  const tr = (c.transfers || []).map(t => `${t.station} ${t.minutes}分${t.confirmed ? "" : "（未確認）"}`).join("、");
  return `<div class="leg">${legs}</div>${tr ? `<p class="note">乗り換え：${tr}${c.estimated ? "。綾瀬始発の先の時刻は目安" : ""}</p>` : ""}`;
}

// ---- 新橋 ----
function renderShimbashi() {
  const t = toMin($("sTime").value || "00:00");
  const rows = shimbashiCandidates(D[kind()], t, 3);
  const note = missingNote();
  if (!rows.length) { $("sList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  $("sList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      <div class="head"><span class="dep">${fmt(c.arr)}<small>新橋 着</small></span><span class="tag">${i + 1}位</span></div>
      <p style="margin:0"><b>${c.via}</b>（${c.arr - c.dep}分）</p>
      ${legsHtml(c)}
    </article>`).join("");
}

// ---- 青砥経由 ----
function renderAoto() {
  const t = toMin($("aTime").value || "00:00");
  const dest = $("aDest").value;
  const rows = aotoCandidates(D[kind()], t, dest, 3);
  const note = missingNote();
  if (!rows.length) { $("aList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  const goal = { narita: "成田空港第2・3ターミナル", shimbashi: "新橋", kawasaki: "JR川崎駅" }[dest];
  $("aList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      <div class="head"><span class="dep">${fmt(c.arr)}<small>${goal} 着</small></span><span class="tag">バス ${fmt(c.dep)} 発</span></div>
      ${legsHtml(c)}
      <p class="note">青砥で電車まで ${c.wait} 分の余裕。${c.safeBus ? `余裕を見るなら <b>${c.dep - c.safeBus.dep}分前の ${fmt(c.safeBus.dep)} 発</b>のバス（青砥駅東交差点 ${fmt(c.safeBus.aoto)} 着）。` : ""}</p>
      ${c.wait >= 25 ? `<div class="warnbox">この時間帯は直通が少ない。${dest === "kawasaki" ? "品川や京急蒲田で京急線に乗り換える手もある（この画面では計算してへん）。" : "青砥で別の電車に乗り換える手もある（この画面では直通だけ計算）。"}</div>` : ""}
    </article>`).join("");
}

// ---- タブ ----
const TABS = { iki: "pIki", kaeri: "pKaeri", shimbashi: "pShimbashi", aoto: "pAoto" };
function setTab(tab) {
  if (!TABS[tab]) tab = "iki";
  for (const [name, pid] of Object.entries(TABS)) {
    $(pid).hidden = name !== tab;
    document.querySelector(`[data-tab="${name}"]`).setAttribute("aria-selected", String(name === tab));
  }
  store.set("tab", tab);
}
function renderAll() { renderDay(); renderIki(); renderKaeri(); renderShimbashi(); renderAoto(); }

// ---- 出典の表示 ----
function renderSources() {
  const seen = new Map();
  const add = d => { if (!d) return; for (const s of (d.meta && d.meta.sources) || []) { const key = s.name + s.version; if (!seen.has(key)) seen.set(key, `${s.name}（${s.version}）取り込み ${d.meta.imported}`); } };
  add(D.holidays); add(D.transfers); add(D.bus);
  for (const k of Object.keys(KINDS)) for (const d of Object.values(D[k])) add(d);
  $("sourceList").innerHTML = [...seen.values()].map(x => `<li>${x}</li>`).join("");
}

// ---- 起動 ----
async function main() {
  $("status").textContent = "時刻表を読み込み中…";
  try { await loadData(); } catch (e) { $("status").textContent = "時刻表が読めへんかった：" + e.message; return; }
  $("status").textContent = "";
  $("dest").innerHTML = DEST.map((d, i) => `<option value="${i}">${d[0]}</option>`).join("");
  $("dest").value = store.get("dest") ?? "11";
  $("aDest").value = store.get("aDest") ?? "narita";
  const now = toInput(nowMin());
  for (const id of ["ikiTime", "kTime", "sTime", "aTime"]) $(id).value = now;
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $("ikiNow").onclick = () => { $("ikiTime").value = toInput(nowMin()); renderIki(); };
  $("kNow").onclick = () => { $("kTime").value = toInput(nowMin()); renderKaeri(); };
  $("sNow").onclick = () => { $("sTime").value = toInput(nowMin()); renderShimbashi(); };
  $("aNow").onclick = () => { $("aTime").value = toInput(nowMin()); renderAoto(); };
  $("ikiTime").oninput = renderIki; $("kTime").oninput = renderKaeri; $("sTime").oninput = renderShimbashi; $("aTime").oninput = renderAoto;
  $("dest").onchange = () => { store.set("dest", $("dest").value); renderIki(); };
  $("aDest").onchange = () => { store.set("aDest", $("aDest").value); renderAoto(); };
  [["dAuto", "auto"], ["dWd", "wd"], ["dHd", "hd"]].forEach(([id, v]) => $(id).onclick = () => { dayMode = v; renderAll(); });
  setTab(store.get("tab") || "iki");
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
