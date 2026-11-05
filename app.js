// 亀有の達人 ― 画面側（データの読み込み、入力、表示）。計算は engine.js に任せる。
import { toMin, fmt, toInput, dayKind, DEST, ikiCandidates, kaeriCandidates, shimbashiCandidates, aotoCandidates, kameariCandidates, transferCount } from "./engine.js";

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
  keiyoDown: `./data/jr-keiyo-down-${k}.json`,       // 京葉線 下り（東京→西船橋。武蔵野線直通は西船橋まで）
  musashinoUp: `./data/jr-musashino-up-${k}.json`,   // 武蔵野線 上り（西船橋→新松戸→府中本町）
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
  keikyuShinagawaUp: `./data/ekitan-keikyu-shinagawa-up-${k}.json`,   // 品川（京急）→青砥（帰り 品川から最速）
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
  const out = ikiCandidates(D[kind()], t, di, 6);
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
    // 綾瀬で乗り換えず、JRから来た電車にそのまま乗った場合の着（JRの時刻表の直通列車の時刻。綾瀬止まりなら無し）
    // 別の色の箱（前の版の「そのまま乗る手もある」の箱と同じ色）で、乗り換えの行と見分けがつくようにする
    const stay = c.throughArr
      ? `<div class="stay"><span class="t">${fmt(c.throughArr)}</span><span>${c.destName} 着　← 綾瀬で乗り換えんと、そのまま乗った場合${c.throughArr < c.destArr ? `（${c.destArr - c.throughArr}分早い）` : ""}</span></div>`
      : `<div class="stay"><span class="t">—</span><span>この電車は綾瀬止まり（そのまま乗り続けることはできへん）</span></div>`;
    return `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.kameariDep, "亀有", c.destArr, c.destName, "（目安）")}
      <div class="leg"><span class="t">${fmt(c.kameariDep)}</span><span>亀有 発（各駅停車）</span>
      <span class="t">${fmt(c.ayaseArr)}</span><span>綾瀬 着　<b>${waitAyase}分の待ち合わせ</b></span>
      <span class="t">${fmt(c.ayaseDep)}</span><span><b>${what}</b>に接続</span>
      <span class="t">${fmt(c.destArr)}</span><span>${c.destName} 着（目安）</span></div>
      ${stay}
    </article>`;
  }).join("");
}

// ---- 帰り ----
// 「帰り 品川・東京から」のタブ：どこから（品川／東京）× 何を重視（座って帰る／最速／最安）（夏目さん 2026-11-05）
let kFrom = store.get("kFrom") === "tokyo" ? "tokyo" : "shinagawa";
let kMode = ["fast", "cheap"].includes(store.get("kMode")) ? store.get("kMode") : "seated";
const K_NOTE = {
  shinagawa: {
    seated: "品川始発の常磐線（上野東京ライン）に乗って座って帰る。①北千住で千代田線／②松戸で各駅停車に折り返し。",
    fast: "品川から亀有に早く着く順に6つ（乗り換え2回まで）。常磐線直通→北千住か松戸、山手線・京浜東北線→西日暮里で千代田線／上野で常磐線快速（上野始発。座れることもある）→北千住か松戸、京急→都営浅草線・京成押上線直通で青砥→バス（1本で青砥まで行ける電車だけ）。",
    cheap: "JRだけで帰る道（北千住までJR。運賃が安い）の中で早く着く順に6つ（乗り換え2回まで）。西日暮里で千代田線に乗り換える道は東京メトロの運賃がかかるので出さない。",
  },
  tokyo: {
    seated: "東京始発の京葉線→武蔵野線直通（府中本町行きなど）で新松戸まで行き、新松戸で常磐線各駅停車に乗って亀有へ。ずっと座れる。東京から新松戸まで1本で行く電車だけ（西船橋で乗り換える行き方は出さない）。新松戸の乗り換えは2分で計算（未確認）。",
    fast: "東京から亀有に早く着く順に6つ（乗り換え2回まで）。常磐線直通→北千住か松戸、山手線・京浜東北線→西日暮里で千代田線／上野で常磐線快速（上野始発。座れることもある）→北千住か松戸。",
    cheap: "JRだけで帰る道（北千住までJR。運賃が安い）の中で早く着く順に6つ（乗り換え2回まで）。西日暮里で千代田線に乗り換える道は東京メトロの運賃がかかるので出さない。東京始発→新松戸経由もJRだけなので含む。",
  },
};
function renderKaeri() {
  const t = toMin($("kTime").value || "00:00");
  $("kFromShinagawa").setAttribute("aria-pressed", String(kFrom === "shinagawa"));
  $("kFromTokyo").setAttribute("aria-pressed", String(kFrom === "tokyo"));
  for (const [id, v] of [["kModeSeated", "seated"], ["kModeFast", "fast"], ["kModeCheap", "cheap"]]) $(id).setAttribute("aria-pressed", String(kMode === v));
  const stName = kFrom === "tokyo" ? "東京" : "品川";
  const classic = kFrom === "shinagawa" && kMode === "seated";
  $("kTimeLabel").textContent = classic ? "品川に着く時刻" : stName + "を出る時刻";
  $("kNote").textContent = K_NOTE[kFrom][kMode];
  if (!classic) {
    const origin = kMode === "seated" ? "tokyo" : kFrom + (kMode === "fast" ? "Fast" : "Cheap");
    const rows = kameariCandidates(D[kind()], origin, t, 6);
    if (!rows.length) { $("kList").innerHTML = '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
    $("kList").innerHTML = rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.dep, c.legs[0].from, c.arr, "亀有")}
      <p class="note" style="margin:0"><b>${c.via}</b>（${c.arr - c.dep}分）${transferCount(c) >= 2 ? "・乗り換え2回" : ""}</p>
      ${legsHtml(c)}
    </article>`).join("");
    return;
  }
  const rows = kaeriCandidates(D[kind()], t, 6);
  if (!rows.length) { $("kList").innerHTML = `<p class="empty">この時刻のあとの品川始発（普通・快速・特別快速）はあらへん。</p>`; return; }
  const pl = p => p ? `（${p}番線）` : "";
  $("kList").innerHTML = rows.map((c, i) => {
    const b1 = c.kameari1 !== null && (c.kameari2 === null || c.kameari1 <= c.kameari2);
    const b2 = c.kameari2 !== null && (c.kameari1 === null || c.kameari2 <= c.kameari1);
    // 「乗り換えに使える時間N分」（ギリギリなら赤い文字）。「次」は（H:MM発に間に合わへんかったら次は H:MM発（○○行き）→ 亀有 H:MM着）の形
    const tx = (g, tight) => (g <= 2 ? DASH : "") + `<span class="${tight ? "tight" : ""}"><b>乗り換えに使える時間${g}分</b></span>`;
    const ms = (m, dep, label) => m ? `<br>（${fmt(dep)}発に間に合わへんかったら次は <b>${fmt(m.dep)}発</b>${label ? "（" + label + "）" : ""} → 亀有 ${fmt(m.arr)}着）` : "";
    const r1 = c.kameari1 === null ? `<span class="how">北千住 ${fmt(c.kitasenjuArr)} 着${pl(c.kitasenjuPlatform)}　このあと亀有に止まる千代田線があらへん</span><span class="arr">—</span><span class="sub"></span>`
      : `<span class="how"><b class="tm">${fmt(c.kitasenjuArr)}</b> 北千住 着${pl(c.kitasenjuPlatform)}　${tx(c.transfer1, c.tight1)}<br><b class="tm">${fmt(c.chiyodaDep)}</b> 千代田線 ${c.chiyodaDest}に接続</span>
        <span class="arr">${fmt(c.kameari1)}<small>亀有 着</small></span>
        <span class="sub">${ms(c.missed1, c.chiyodaDep, c.missed1 && c.missed1.dest).replace(/^<br>/, "")}</span>`;
    const r2 = c.kameari2 === null ? `<span class="how">松戸 ${fmt(c.matsudoArr)} 着${pl(c.matsudoPlatform)}　このあと各駅停車があらへん</span><span class="arr">—</span><span class="sub"></span>`
      : `<span class="how"><b class="tm">${fmt(c.matsudoArr)}</b> 松戸 着${pl(c.matsudoPlatform)}　${tx(c.transfer2, c.tight2)}<br><b class="tm">${fmt(c.matsudoDep)}</b> 各駅停車（6番線）に接続</span>
        <span class="arr">${fmt(c.kameari2)}<small>亀有 着</small></span>
        <span class="sub">ずっと座れる${ms(c.missed2, c.matsudoDep, "")}</span>`;
    const best = Math.min(...[c.kameari1, c.kameari2].filter(x => x !== null));
    return `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.shinagawaDep, "品川", best, "亀有")}
      <p class="note" style="margin:0">${c.typeName}${pl(c.shinagawaPlatform)}で出て、①北千住で乗り換え／②松戸で折り返し</p>
      <div class="route c${b1 ? " best" : ""}"><span class="no">①</span>${r1}</div>
      <div class="route j${b2 ? " best" : ""}"><span class="no">②</span>${r2}</div>
    </article>`;
  }).join("");
}

// ---- ダッシュの印（夏目さんの決まり）：青砥でバスとの乗り換えが5分以内、北千住・松戸・日暮里で2分以内 ----
const DASH = '<span class="dash" title="急いで">🏃</span>';
function dashMark(station, avail, afterWalk) {
  const st = String(station || "");
  if (afterWalk || st.startsWith("青砥")) return avail <= 5 ? DASH : "";
  if (["北千住", "松戸", "日暮里"].some(x => st.startsWith(x))) return avail <= 2 ? DASH : "";
  return "";
}
// 大きな見出し：「H:MM 駅 発 → H:MM 駅 着」
function headHtml(dep, from, arr, to, note = "") {
  return `<div class="head big"><span class="dep">${fmt(dep)}<small>${from} 発</small></span><span class="arrow">→</span><span class="dep">${fmt(arr)}<small>${to} 着${note}</small></span></div>`;
}

// ---- 経路の表示（新橋・青砥・亀有へ帰る・東京始発で共通）----
// 書き方（夏目さん 2026-11-05）:
//   H:MM 駅 発（○○）                      ← 最初の乗り物だけ
//   H:MM 駅 着　乗り換えに使える時間N分      ← ギリギリなら赤い文字。歩きなら「歩きに使える時間N分（…歩きM分で計算）」、綾瀬は「N分の待ち合わせ」
//   H:MM ○○に接続                          ← 乗り換え後の乗り物
//        （H:MM発に間に合わへんかったら次は H:MM発（○○行き）→ 駅 H:MM着）   ← 使える時間が5分以内のとき
//   H:MM 駅 着
function legsHtml(c) {
  const L = c.legs;
  const rows = [];
  const shortName = s => s.replace(/（新橋から）|南口\d番のりば/g, "").trim();
  const shortLine = l => shortName(l.line);
  // 「次」の行。別の線（山手線⇄京浜東北線）ならその線の名前、行き先（バスは系統）を添える
  const missedRow = l => {
    const m = l.ifMissed; if (!m) return "";
    const lineDiff = m.line && m.line !== (l.x && l.x.lineName) ? m.line : "";
    const what = [lineDiff, m.dest ? m.dest + "行き" : (m.route || "")].filter(Boolean).join(" ");
    return `<span class="t"></span><span class="sub">（${fmt(l.dep)}発に間に合わへんかったら次は <b>${fmt(m.dep)}発</b>${what ? "（" + what + "）" : ""} → ${m.to} ${fmt(m.arr)}着）</span>`;
  };
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (l.walk) {
      if (L[i + 1] && !L[i + 1].walk) continue;                      // 歩き→乗り物は、前の着の行にまとめてある
      rows.push(`<span class="t">${fmt(l.dep)}</span><span>${l.from} から歩き（${l.minutes}分の目安）</span><span class="t">${fmt(l.arr)}</span><span>${l.to} 着</span>`);
      continue;
    }
    // 発の行：最初の乗り物は「駅 発（○○）」、乗り換え後は「○○に接続」＋「次」
    if (i === 0) rows.push(`<span class="t">${fmt(l.dep)}</span><span>${l.from} 発（${shortLine(l)}）</span>`);
    else rows.push(`<span class="t">${fmt(l.dep)}</span><span><b>${shortLine(l)}</b>に接続</span>` + missedRow(l));
    // 着の行：次の乗り物があれば「乗り換えに使える時間N分」を同じ行に
    const walkNext = L[i + 1] && L[i + 1].walk ? L[i + 1] : null;
    const next = walkNext ? L[i + 2] : L[i + 1];
    let info = "";
    if (next && !next.walk) {
      const avail = next.dep - l.arr;
      if (walkNext) info = `　${dashMark(next.from, avail, true)}<span class="${avail <= walkNext.minutes ? "tight" : ""}"><b>歩きに使える時間${avail}分</b>（${walkNext.to}まで歩き${walkNext.minutes}分で計算）</span>`;
      else if (next.from === "綾瀬") info = `　<b>${next.gap}分の待ち合わせ</b>`;
      else info = `　${dashMark(next.from, next.gap, false)}<span class="${next.tight ? "tight" : ""}"><b>乗り換えに使える時間${next.gap}分</b></span>`;
    }
    rows.push(`<span class="t">${fmt(l.arr)}</span><span>${l.to} 着${info}</span>`);
  }
  return `<div class="leg">${rows.join("")}</div>${c.estimated ? `<p class="note">一部の時刻は手前の駅からの目安</p>` : ""}`;
}

// ---- 新橋の行き・帰りの選択肢（青砥経由のバス／東京メトロ経由を含めるか。初期値はどちらも「いいえ」）----
const OPTS = { bus: store.get("opt-bus") === "1", metro: store.get("opt-metro") === "1" };
function renderOpts() {
  document.querySelectorAll("[data-opt]").forEach(b => b.setAttribute("aria-pressed", String((OPTS[b.dataset.opt] ? "1" : "0") === b.dataset.val)));
}

// ---- 新橋 ----
// 行き 新橋：「最速」か「青砥経由（青砥始発で座る）」か（夏目さん 2026-11-05）
let sMode = store.get("sMode") === "aoto" ? "aoto" : "fast";
function renderShimbashi() {
  const t = toMin($("sTime").value || "00:00");
  $("sModeFast").setAttribute("aria-pressed", String(sMode === "fast"));
  $("sModeAoto").setAttribute("aria-pressed", String(sMode === "aoto"));
  $("sOpts").hidden = sMode !== "fast";
  $("sNoteFast").hidden = sMode !== "fast";
  $("sNoteAoto").hidden = sMode !== "aoto";
  const note = missingNote();
  if (sMode === "aoto") {
    // バスで青砥へ → 青砥始発（新橋まで1本）の電車に並ぶ。青砥発が5〜9時は15分前、9〜10時は10分前にバス停に着くバスを選ぶ
    const rows = aotoCandidates(D[kind()], t, "shimbashi", 6, { startOnly: true, queue: true });
    if (!rows.length) { $("sList").innerHTML = note + '<p class="empty">この時刻のあとの青砥始発（新橋まで1本）に間に合うバスが出えへん。</p>'; return; }
    $("sList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.dep, "亀有駅", c.arr, "新橋")}
      <p class="note" style="margin:0">バス ${c.bus.route}（${c.bus.boarding}）→ ${c.bus.stop}で降りて、<b>青砥始発</b>の電車に並ぶ${c.lead > c.bus.walk.minutes ? `（並ぶため、青砥発の${c.lead}分前にバス停に着く）` : `（歩き${c.bus.walk.minutes}分で計算）`}</p>
      ${legsHtml(c)}
    </article>`).join("");
    return;
  }
  const rows = shimbashiCandidates(D[kind()], t, 6, OPTS);
  if (!rows.length) { $("sList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  $("sList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.dep, c.legs[0].from, c.arr, "新橋")}
      <p class="note" style="margin:0"><b>${c.via}</b>（${c.arr - c.dep}分）</p>
      ${legsHtml(c)}
    </article>`).join("");
}

// ---- 青砥経由 ----
function renderAoto() {
  const t = toMin($("aTime").value || "00:00");
  const dest = $("aDest").value;
  const rows = aotoCandidates(D[kind()], t, dest, 6);
  const note = missingNote();
  if (!rows.length) { $("aList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  const goal = { narita: "成田空港第2・3ターミナル", narita1: "成田空港第1ターミナル", shimbashi: "新橋", kawasaki: "京急川崎" }[dest];   // 川崎＝京急川崎（JR川崎への歩きは出さない）
  $("aList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.dep, "亀有駅", c.arr, goal, c.estimated ? "（目安）" : "")}
      <p class="note" style="margin:0">バス ${c.bus.route}（${c.bus.boarding}）→ ${c.bus.stop}で降りて京成線</p>
      ${legsHtml(c)}
      <p class="note">${c.safeBus ? `余裕を見るなら <b>${c.dep - c.safeBus.dep}分前の ${fmt(c.safeBus.dep)}発</b>のバス（${c.safeBus.route}、青砥 ${fmt(c.safeBus.aoto)}着）。` : ""}</p>
      ${c.wait >= 25 ? `<div class="warnbox">この時間帯は直通が少ない。${dest === "kawasaki" ? "品川や京急蒲田で京急線に乗り換える手もある（この画面では計算してへん）。" : "青砥で別の電車に乗り換える手もある（この画面では直通だけ計算）。"}</div>` : ""}
    </article>`).join("");
}

// ---- 各地から亀有へ ----
function renderHome() {
  const t = toMin($("hTime").value || "00:00");
  const from = $("hFrom").value;
  const rows = kameariCandidates(D[kind()], from, t, 6);
  const note = missingNote();
  if (!rows.length) { $("hList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  $("hList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.dep, c.legs[0].from, c.arr, "亀有")}
      <p class="note" style="margin:0"><b>${c.via}</b>（${c.arr - c.dep}分）${c.extra ? "・" + (c.kind === "bus" ? "バス経由で最速" : "JR経由で最速") : ""}</p>
      ${legsHtml(c)}
    </article>`).join("");
}

// ---- 帰り（新橋から最速）----
function renderHomeShimbashi() {
  const t = toMin($("hsTime").value || "00:00");
  const rows = kameariCandidates(D[kind()], "shimbashi", t, 6, OPTS).filter(c => !c.extra);
  const note = missingNote();
  if (!rows.length) { $("hsList").innerHTML = note + '<p class="empty">この時刻のあとの行き方が出えへん。</p>'; return; }
  $("hsList").innerHTML = note + rows.map((c, i) => `<article class="card${i === 0 ? " first" : ""}">
      ${headHtml(c.dep, "新橋", c.arr, "亀有")}
      <p class="note" style="margin:0"><b>${c.via}</b>（${c.arr - c.dep}分）</p>
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
  document.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => { OPTS[b.dataset.opt] = b.dataset.val === "1"; store.set("opt-" + b.dataset.opt, b.dataset.val); renderOpts(); renderShimbashi(); renderHomeShimbashi(); });
  renderOpts();
  $("ikiNow").onclick = () => { $("ikiTime").value = toInput(nowMin()); renderIki(); };
  $("kNow").onclick = () => { $("kTime").value = toInput(nowMin()); renderKaeri(); };
  $("kFromShinagawa").onclick = () => { kFrom = "shinagawa"; store.set("kFrom", kFrom); renderKaeri(); };
  $("kFromTokyo").onclick = () => { kFrom = "tokyo"; store.set("kFrom", kFrom); renderKaeri(); };
  for (const [id, v] of [["kModeSeated", "seated"], ["kModeFast", "fast"], ["kModeCheap", "cheap"]]) $(id).onclick = () => { kMode = v; store.set("kMode", v); renderKaeri(); };
  $("sNow").onclick = () => { $("sTime").value = toInput(nowMin()); renderShimbashi(); };
  $("sModeFast").onclick = () => { sMode = "fast"; store.set("sMode", sMode); renderShimbashi(); };
  $("sModeAoto").onclick = () => { sMode = "aoto"; store.set("sMode", sMode); renderShimbashi(); };
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

// ---- 版の表示（画面のいちばん下。「この版」が新しいか、ここで分かる）----
fetch("./version.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(v => {
  if (v) $("buildInfo").textContent = "この版：" + v.built + "（" + v.commit + "）";
}).catch(() => {});

// ---- 「最新版を取り直す」ボタン（表示が古いままのときの非常口）----
// 裏方（サービスワーカー）と保存してあるファイルを全部消してから、読み直す。
$("refreshBtn").onclick = async () => {
  $("refreshBtn").disabled = true; $("refreshBtn").textContent = "取り直し中…";
  try { if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } } catch (e) {}
  try { if ("caches" in self) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } } catch (e) {}
  location.replace(location.pathname + "?r=" + Date.now());   // 住所に印を付けて、ブラウザの一時保存を使わせない
};

// ---- ホーム画面用の仕組み（サービスワーカー＝電波が弱くても開けるようにする裏方）----
if ("serviceWorker" in navigator) {
  let regRef = null;
  // updateViaCache:"none" … sw.js は毎回サーバーに確かめに行く（ブラウザの一時保存を使わない）。これが無いと新しい版に気づくのが遅れる
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(reg => {
    regRef = reg;
    reg.update().catch(() => {});
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw && nw.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) $("updateBox").hidden = false;
      });
    });
  }).catch(() => {});
  // ホーム画面のアプリは、開き直しても読み直さへん（前の画面がそのまま残る）。前面に戻るたびに新しい版がないか確かめる
  document.addEventListener("visibilitychange", () => { if (!document.hidden && regRef) regRef.update().catch(() => {}); });
  // 新しい裏方に切り替わったら、1回だけ自動で読み直す（古い画面と新しい計算が混ざらんように）
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
  $("updateBtn").onclick = () => location.reload();
}
