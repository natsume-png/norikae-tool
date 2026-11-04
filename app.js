// 亀有の達人 ― 画面側（データの読み込み、入力、表示）。計算は engine.js に任せる。
import { toMin, fmt, toInput, dayKind, DEST, ikiCandidates, kaeriCandidates, shimbashiCandidates, aotoCandidates, kameariCandidates } from "./engine.js";

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
  yamanote: `./data/jr-yamanote-outer-${k}.json`,    // 山手線 外回り（日暮里→東京→新橋）
  keihin: `./data/jr-keihintohoku-south-${k}.json`,  // 京浜東北線 南行
  jrRapidDown: `./data/jr-joban-rapid-down-${k}.json`, // 常磐線快速 下り（品川・上野→北千住・松戸）
  yamanoteInner: `./data/jr-yamanote-inner-${k}.json`, // 山手線 内回り（新橋→上野→日暮里→西日暮里）
  keihinNorth: `./data/jr-keihintohoku-north-${k}.json`, // 京浜東北線 北行（川崎→品川→上野→西日暮里）
  tokaidoUp: `./data/jr-tokaido-up-${k}.json`,       // 東海道線 上り（川崎→品川→東京→上野）
  utlNorth: `./data/jr-utl-north-${k}.json`,         // 上野東京ライン 北行
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
  ginzaGinzaAsakusa: `./data/ekitan-metro-ginza-ginza-asakusa-${k}.json`,
  hibiyaGinzaUp: `./data/ekitan-metro-hibiya-ginza-up-${k}.json`,
  hibiyaHigashiginzaUp: `./data/ekitan-metro-hibiya-higashiginza-up-${k}.json`,
  hibiyaMinamisenjuUp: `./data/ekitan-metro-hibiya-minamisenju-up-${k}.json`,
  asakusaShimbashiOshiage: `./data/ekitan-toei-asakusa-shimbashi-oshiage-${k}.json`,
  asakusaHigashiginzaOshiage: `./data/ekitan-toei-asakusa-higashiginza-oshiage-${k}.json`,
  keiseiAotoUpMain: `./data/ekitan-keisei-main-aoto-up-${k}.json`,
  keiseiTateishiDown: `./data/ekitan-keisei-oshiage-tateishi-down-${k}.json`,
  keiseiNipporiUp: `./data/ekitan-keisei-main-nippori-up-${k}.json`,
  airport1MainUp: `./data/ekitan-keisei-main-airport1-up-${k}.json`,
  airport1SAUp: `./data/ekitan-keisei-sa-airport1-up-${k}.json`,
  airport2MainUp: `./data/ekitan-keisei-main-airport2-up-${k}.json`,
  airport2SAUp: `./data/ekitan-keisei-sa-airport2-up-${k}.json`,
  keikyuKawasakiUp: `./data/ekitan-keikyu-kawasaki-up-${k}.json`,
});
const D = { wd: {}, hd: {}, holidays: null, transfers: null, bus: null, busKeisei: null, missing: { wd: [], hd: [] } };
async function fetchJson(url, optional = false) {
  const r = await fetch(url, { cache: "no-cache" }).catch(() => null);
  if (!r || !r.ok) { if (optional) return null; throw new Error(url + " が読めへん"); }
  return r.json();
}
async function loadData() {
  [D.holidays, D.transfers, D.bus, D.busKeisei] = await Promise.all([fetchJson("./data/holidays.json"), fetchJson("./data/transfers.json"), fetchJson("./data/bus-shuttle-seven.json"), fetchJson("./data/bus-keiseibus-kameari.json")]);
  for (const [kind, k] of Object.entries(KINDS)) {
    const req = Object.entries(FILES(k)).map(async ([key, url]) => [key, await fetchJson(url)]);
    const opt = Object.entries(OPTIONAL(k)).map(async ([key, url]) => [key, await fetchJson(url, true)]);
    for (const [key, v] of await Promise.all([...req, ...opt])) {
      D[kind][key] = v;
      if (v === null) D.missing[kind].push(key);
    }
    D[kind].transfers = D.transfers; D[kind].bus = D.bus; D[kind].busKeisei = D.busKeisei; D[kind].dayKind = k;
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
    const missed = "";   // 綾瀬は向かいのホームなので「間に合わなかったら」は出さない
    return `<article class="card${i === 0 ? " first" : ""}">
      <div class="leg"><span class="t">${fmt(c.kameariDep)}</span><span>亀有 発（各駅停車）</span>
      <span class="t">${fmt(c.ayaseDep)}</span><span>綾瀬 発（${fmt(c.ayaseArr)}着・向かいのホームで待ち ${waitAyase}分）　<b>${what}</b></span></div>
      ${gap}${missed}
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
    const tx = (g, tight) => tight ? `<span class="tight">乗り換えに使える時間 ${g}分・ギリギリ</span>` : `乗り換えに使える時間 ${g}分`;
    const ms = (m, dep, label) => m ? `<br>${fmt(dep)}発に間に合わへんかったら次は ${fmt(m.dep)}発${label ? "（" + label + "）" : ""} → 亀有 ${fmt(m.arr)}着` : "";
    const r1 = c.kameari1 === null ? `<span class="how">北千住 ${fmt(c.kitasenjuArr)} 着${pl(c.kitasenjuPlatform)}　このあと亀有に止まる千代田線があらへん</span><span class="arr">—</span><span class="sub"></span>`
      : `<span class="how">北千住 <b class="tm">${fmt(c.kitasenjuArr)}</b> 着${pl(c.kitasenjuPlatform)} → <b class="tm">${fmt(c.chiyodaDep)}</b> 発 千代田線 ${c.chiyodaDest}</span>
        <span class="arr">${fmt(c.kameari1)}<small>亀有</small></span>
        <span class="sub">${tx(c.transfer1, c.tight1)}${ms(c.missed1, c.chiyodaDep, c.missed1 && c.missed1.dest)}</span>`;
    const r2 = c.kameari2 === null ? `<span class="how">松戸 ${fmt(c.matsudoArr)} 着${pl(c.matsudoPlatform)}　このあと各駅停車があらへん</span><span class="arr">—</span><span class="sub"></span>`
      : `<span class="how">松戸 <b class="tm">${fmt(c.matsudoArr)}</b> 着${pl(c.matsudoPlatform)} → <b class="tm">${fmt(c.matsudoDep)}</b> 発 各駅停車</span>
        <span class="arr">${fmt(c.kameari2)}<small>亀有</small></span>
        <span class="sub">${tx(c.transfer2, c.tight2)}・ずっと座れる${ms(c.missed2, c.matsudoDep, "")}</span>`;
    return `<article class="card${i === 0 ? " first" : ""}">
      <div class="head"><span class="dep">${fmt(c.shinagawaDep)}<small>品川 発${pl(c.shinagawaPlatform)}</small></span><span class="tag">${c.typeName}</span></div>
      <div class="route c${b1 ? " best" : ""}"><span class="no">①</span>${r1}</div>
      <div class="route j${b2 ? " best" : ""}"><span class="no">②</span>${r2}</div>
    </article>`;
  }).join("");
}

// ---- 経路の表示（新橋・青砥で共通）----
// 経路の表示。乗り換えは「使える時間」（前の電車の着から次の発まで）で出す。歩きの区間は次の乗り物の行にまとめる。
function legsHtml(c) {
  const L = c.legs;
  const legs = L.map((l, i) => {
    if (l.walk && L[i + 1] && !L[i + 1].walk) return "";   // 歩き→乗り物：次の行にまとめる
    if (l.walk) return `<span class="t">${fmt(l.dep)}</span><span>${l.from} から歩き（${l.minutes}分の目安）</span><span class="t">${fmt(l.arr)}</span><span>${l.to} 着</span>`;
    let info = "";
    if (i > 0) {
      const prevWalk = L[i - 1].walk ? L[i - 1] : null;
      const prev = prevWalk ? L[i - 2] : L[i - 1];
      const avail = l.dep - prev.arr;
      if (prevWalk) info = `　<span class="${avail <= prevWalk.minutes ? "tight" : "sub"}">歩きに使える時間 ${avail}分（${prevWalk.from}から。歩き${prevWalk.minutes}分で計算）</span>`;
      else if (l.from === "綾瀬") info = `　<span class="sub">向かいのホームで待ち ${l.gap}分</span>`;
      else info = `　<span class="${l.tight ? "tight" : "sub"}">乗り換えに使える時間 ${l.gap}分${l.tight ? "・ギリギリ" : ""}</span>`;
      if (l.ifMissed) info += `<br><span class="sub">${fmt(l.dep)}発に間に合わへんかったら次は <b>${fmt(l.ifMissed.dep)}発</b> → ${l.ifMissed.to} ${fmt(l.ifMissed.arr)}着</span>`;
    }
    return `<span class="t">${fmt(l.dep)}</span><span>${l.from} 発　${l.line}${info}</span><span class="t">${fmt(l.arr)}</span><span>${l.to} 着</span>`;
  }).join("");
  return `<div class="leg">${legs}</div>${c.estimated ? `<p class="note">一部の時刻は手前の駅からの目安</p>` : ""}`;
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
      <p class="note">${c.safeBus ? `余裕を見るなら <b>${c.dep - c.safeBus.dep}分前の ${fmt(c.safeBus.dep)}発</b>のバス（${c.safeBus.route}、青砥 ${fmt(c.safeBus.aoto)}着）。` : ""}</p>
      ${c.wait >= 25 ? `<div class="warnbox">この時間帯は直通が少ない。${dest === "kawasaki" ? "品川や京急蒲田で京急線に乗り換える手もある（この画面では計算してへん）。" : "青砥で別の電車に乗り換える手もある（この画面では直通だけ計算）。"}</div>` : ""}
    </article>`).join("");
}

// ---- 各地から亀有へ ----
function renderHome() {
  const t = toMin($("hTime").value || "00:00");
  const from = $("hFrom").value;
  const rows = kameariCandidates(D[kind()], from, t, 3);
  const note = missingNote();
  if (!rows.length) { $("hList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  $("hList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      <div class="head"><span class="dep">${fmt(c.arr)}<small>亀有 着</small></span><span class="tag">${c.extra ? (c.kind === "bus" ? "バス経由で最速" : "JR経由で最速") : (i + 1) + "位"}</span></div>
      <p style="margin:0"><b>${c.via}</b>（${c.arr - c.dep}分）</p>
      ${legsHtml(c)}
    </article>`).join("");
}

// ---- 帰り（新橋から最速）----
function renderHomeShimbashi() {
  const t = toMin($("hsTime").value || "00:00");
  const rows = kameariCandidates(D[kind()], "shimbashi", t, 3).filter(c => !c.extra);
  const note = missingNote();
  if (!rows.length) { $("hsList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  $("hsList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      <div class="head"><span class="dep">${fmt(c.arr)}<small>亀有 着</small></span><span class="tag">${i + 1}位</span></div>
      <p style="margin:0"><b>${c.via}</b>（${c.arr - c.dep}分）</p>
      ${legsHtml(c)}
    </article>`).join("");
}

// ---- タブ ----
const TABS = { iki: "pIki", kaeri: "pKaeri", shimbashi: "pShimbashi", aoto: "pAoto", home: "pHome", homeShimbashi: "pHomeShimbashi" };
function setTab(tab) {
  if (!TABS[tab]) tab = "iki";
  for (const [name, pid] of Object.entries(TABS)) {
    $(pid).hidden = name !== tab;
    document.querySelector(`[data-tab="${name}"]`).setAttribute("aria-selected", String(name === tab));
  }
  store.set("tab", tab);
}
function renderAll() { renderDay(); renderIki(); renderKaeri(); renderShimbashi(); renderAoto(); renderHome(); renderHomeShimbashi(); }

// ---- 出典の表示 ----
function renderSources() {
  const seen = new Map();
  const add = d => { if (!d) return; for (const s of (d.meta && d.meta.sources) || []) { const key = s.name + s.version; if (!seen.has(key)) seen.set(key, `${s.name}（${s.version}）取り込み ${d.meta.imported}`); } };
  add(D.holidays); add(D.transfers); add(D.bus); add(D.busKeisei);
  for (const k of Object.keys(KINDS)) for (const d of Object.values(D[k])) add(d);
  $("sourceList").innerHTML = [...seen.values()].map(x => `<li>${x}</li>`).join("");
}

// ---- 起動 ----
async function main() {
  $("status").textContent = "時刻表を読み込み中…";
  try { await loadData(); } catch (e) { $("status").textContent = "時刻表が読めへんかった：" + e.message; return; }
  $("status").textContent = "";
  $("dest").innerHTML = DEST.map((d, i) => `<option value="${i}">${d[0]}</option>`).join("");
  $("dest").value = store.get("dest") ?? String(DEST.findIndex(d => d[0] === "新御茶ノ水"));   // 最初の行き先は新御茶ノ水（夏目さん）
  $("aDest").value = store.get("aDest") ?? "narita";
  const now = toInput(nowMin());
  for (const id of ["ikiTime", "kTime", "sTime", "aTime", "hTime", "hsTime"]) $(id).value = now;
  $("hsNow").onclick = () => { $("hsTime").value = toInput(nowMin()); renderHomeShimbashi(); };
  $("hsTime").oninput = renderHomeShimbashi;
  $("hFrom").value = store.get("hFrom") ?? "shimbashi";
  $("hNow").onclick = () => { $("hTime").value = toInput(nowMin()); renderHome(); };
  $("hTime").oninput = renderHome;
  $("hFrom").onchange = () => { store.set("hFrom", $("hFrom").value); renderHome(); };
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
