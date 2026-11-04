// 亀有の達人 ― 計算の中身（画面とは切り離した純粋な計算だけ）
// ブラウザ（app.js）と、テスト（tests/）の両方から同じものを使う。
// 時刻表そのもの（data/ の JSON）を読んで、その場で乗り換えを計算する。
//
// 決まり（夏目さん、2026-11-05）:
//  - 乗り換えは2分で計算する（data/transfers.json）。ただし北千住の常磐線⇄千代田線と松戸の快速→各停はダッシュで1分。
//  - 綾瀬で始発に乗り換えるのは同じホームの向かい側なので0分（「亀有発+4分（＝綾瀬着）以降の始発」）。
//  - 画面には実際の「乗り換え何分」を出す。決めた最低分数ちょうどなら「ギリギリ」。5分以内なら「間に合わなかったら次は何分」も出す。

// ---- 時刻の扱い ----
export function toMin(t) {
  t = String(t).replace(/[^0-9:]/g, "");
  let [h, mi] = t.split(":").map(Number);
  if (h < 4) h += 24;
  return h * 60 + mi;
}
export function fmt(x) {
  x = ((x % 1440) + 1440) % 1440;
  return Math.floor(x / 60) + ":" + String(x % 60).padStart(2, "0");
}
export function toInput(x) {
  x = ((x % 1440) + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0");
}
const IS_TIME = /^\d{1,2}:\d{2}$/;
export const isTime = v => typeof v === "string" && IS_TIME.test(v);
export const SHOW_NEXT = 5;  // この分数以内の乗り換えは「間に合わなかったら次」を出す
// 「ギリギリ」＝その乗り換えに決めた最低分数（1分か2分）ちょうど以下。綾瀬（0分）はギリギリにしない
export const isTight = (gap, tmin) => tmin >= 1 && gap <= tmin;

// ---- 平日／土休日の判定 ----
export function dayKind(date, holidays) {
  const d = new Date(date.getTime());
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  const ymd = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const md = ymd.slice(5);
  const hol = d.getDay() === 0 || d.getDay() === 6 ||
    (holidays.holidays || []).includes(ymd) ||
    (holidays.yearEndNewYear || []).includes(md);
  return hol ? "hd" : "wd";
}

// JR の表の「運転日」。全日／平日／土休日はふつうに走る。日付限定（例「11/3」「◆」）は計算から外す。
export function runsNormally(days) {
  return ["", "全日", "平日", "土曜・休日", "土休日", "土曜・休日運転", "平日運転", "全日運転"].includes((days || "").trim());
}

// ---- 千代田線の駅 ----
export const DEST = [["北千住", 4], ["町屋", 7], ["西日暮里", 10], ["千駄木", 11], ["根津", 14], ["湯島", 15], ["新御茶ノ水", 18], ["大手町", 20], ["二重橋前", 21], ["日比谷", 23], ["霞ケ関", 26], ["国会議事堂前", 27], ["赤坂", 29], ["乃木坂", 31], ["表参道", 34], ["明治神宮前", 36], ["代々木公園", 38], ["代々木上原", 39]];
const DEST_INDEX = Object.fromEntries(DEST.map((d, i) => [d[0], i]));
export function stationName(s) { return (s || "").replace("向ケ丘遊園", "向ヶ丘遊園"); }
export function reaches(dest, destIndex) {
  if (!dest) return true;
  const i = DEST_INDEX[dest.replace(/行き?$/, "")];
  return i === undefined ? true : i >= destIndex;
}

// ---- 乗り換え分数（data/transfers.json）----
export function transferInfo(transfers, id) {
  return (transfers && transfers.transfers || []).find(x => x.id === id) || { id, minutes: 2, confirmed: true, source: "乗り換えはすべて2分（夏目さんの決まり）" };
}
export function transferMin(transfers, id) { return transferInfo(transfers, id).minutes; }

// ---- 共通の小道具 ----
// t 以降に出る電車（バス）のうち、いちばん早く着くもの（速い電車が後から出て追い抜く場合に対応）。同じ着なら出発が遅いほう。
// 着時刻（arr）が無い一覧のときは、最初に出るもの。
const after = (list, t) => {
  let best = null;
  for (const x of list) {
    if (x.dep < t) continue;
    if (x.arr === undefined || x.arr === null) return x;
    if (!best || x.arr < best.arr || (x.arr === best.arr && x.dep > best.dep)) best = x;
    if (x.dep >= best.arr) break;   // これより後に出るものは、もう best より早く着けへん
  }
  return best;
};
const nextAfter = (list, dep) => after(list, dep + 1);
// 駅探の駅時刻表 → 列車番号 → 発車時刻（分）
function byTrainNo(ek) {
  const m = new Map();
  for (const t of (ek && ek.trains) || []) if (t.trainNo && !m.has(t.trainNo)) m.set(t.trainNo, toMin(t.time));
  return m;
}
// 駅探の駅時刻表 → 乗る駅の発と、着く駅（arrMap で列車番号から引く）の一覧
function ekRide(ek, arrMap, filter = () => true) {
  return ((ek && ek.trains) || [])
    .map(t => ({ dep: toMin(t.time), arr: arrMap ? arrMap.get(t.trainNo) : undefined, type: t.type, typeNote: t.typeNote, dest: stationName(t.dest), trainNo: t.trainNo, start: t.start }))
    .filter(x => (arrMap ? x.arr !== undefined : true) && filter(x))
    .sort((a, b) => a.dep - b.dep);
}
// JR の表から「駅A発→駅B」の一覧（両方の時刻がある列車だけ）
function jrLegs(table, a, b, extra = []) {
  return ((table && table.trains) || [])
    .filter(t => runsNormally(t.days) && isTime(t.times[a]) && (isTime(t.times[b]) || isTime(t.times[b + "着"])))
    .map(t => {
      const o = { dep: toMin(t.times[a]), arr: toMin(t.times[b] || t.times[b + "着"]), type: t.type, dest: t.dest, no: t.no };
      for (const e of extra) o[e] = isTime(t.times[e]) ? toMin(t.times[e]) : null;
      return o;
    })
    .sort((x, y) => x.dep - y.dep);
}
// 同じホームから出る2つの線（例：山手線と京浜東北線）を1つの一覧にまとめる（先に来たほうに乗る。lineName に線の名前）
const eitherLine = (...lists) => lists.flatMap(([name, l]) => l.map(x => ({ ...x, lineName: name }))).sort((a, b) => a.dep - b.dep || a.arr - b.arr);
const notLtdExp = x => !/特急|ライナー|踊り子|湘南|サフィール|寝台/.test(x.type) || x.type === "特別快速";

// ---- 経路をつなぐ道具 ----
// spec（区間の決め方）の種類:
//   乗る:   { list, tmin, line, from, to }   list=[{dep,arr,...}] を時刻順に。tmin=前の区間の着から最低あける分。line は文字列か (x)=>文字列
//   歩く:   { walk: 分, line, from, to }
//   決め打ち: { x: {dep,arr,...}, line, from, to }（最初の電車がもう決まっているとき）
// force={i, after}: i 番目の区間を「after より後の電車」にする（間に合わなかったときの計算用）
export function chain(start, specs, force = null) {
  let t = start;
  const legs = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    if (s.walk !== undefined) {
      legs.push({ line: s.line, from: s.from, to: s.to, dep: t, arr: t + s.walk, walk: true, minutes: s.walk });
      t += s.walk;
      continue;
    }
    let x = s.x;
    if (!x) {
      let th = i === 0 ? t : t + (s.tmin ?? 0);
      if (force && force.i === i) th = Math.max(th, force.after + 1);
      x = after(s.list, th);
      if (!x) return null;
    }
    if (x.arr === undefined || x.arr === null) return null;
    legs.push({ line: typeof s.line === "function" ? s.line(x) : s.line, from: s.from, to: s.to, dep: x.dep, arr: x.arr, tmin: i === 0 ? 0 : (s.tmin ?? 0), x, noMiss: !!s.noMiss });
    t = x.arr;
  }
  return legs;
}
// 候補を仕上げる：各乗り換えの実際の分数（gap）と、5分以内なら「間に合わなかったら次」（ifMissed）を付ける
export function finish(start, specs, info = {}) {
  const legs = chain(start, specs);
  if (!legs) return null;
  for (let i = 1; i < legs.length; i++) {
    const l = legs[i];
    if (l.walk) continue;
    l.gap = l.dep - legs[i - 1].arr;
    l.afterWalk = !!legs[i - 1].walk;
    l.tight = !l.afterWalk && isTight(l.gap, l.tmin);
    if (l.gap <= SHOW_NEXT && !l.noMiss) {   // 綾瀬の始発（向かい側のホーム）は「間に合わない」ことがないので付けない
      const alt = chain(start, specs, { i, after: l.dep });
      // line: 次の電車が「2つの線をまとめた一覧」（山手線か京浜東北線）のものなら、その線の名前（別の線なら画面に添える）
      const ax = (alt && alt[i].x) || {};
      l.ifMissed = alt ? { dep: alt[i].dep, arr: alt[alt.length - 1].arr, to: alt[alt.length - 1].to, line: ax.lineName || null, dest: ax.dest || null, route: ax.route || null } : null;
    }
  }
  return { ...info, legs, dep: legs[0].dep, arr: legs[legs.length - 1].arr };
}

// =====================================================================
// 行き（亀有 → 綾瀬で綾瀬始発・北綾瀬始発に乗り換え）
// =====================================================================
export function ikiCandidates(data, depMin, destIndex, limit = 3) {
  const [destName, destMin] = DEST[destIndex];
  const starts = data.ayase.trains
    .filter(t => !t.prefix)
    .map(t => ({ time: toMin(t.time), origin: t.start ? "綾瀬始発" : "北綾瀬始発", type: t.type === "普通" ? "" : t.type, dest: stationName(t.dest) }))
    .sort((a, b) => a.time - b.time);
  const ayaseMin = transferMin(data.transfers, "ayase-jr-to-start");
  const jr = data.jrUp.trains
    .filter(t => runsNormally(t.days) && isTime(t.times["亀有"]) && isTime(t.times["綾瀬"]))
    .map(t => { const ka = toMin(t.times["亀有"]); return { ka, ay: Math.min(toMin(t.times["綾瀬着"] || t.times["綾瀬"]), ka + 4), through: isTime(t.times[destName]) ? toMin(t.times[destName]) : null, dest: t.dest }; })
    .sort((a, b) => a.ka - b.ka);
  const out = [];
  for (const t of jr) {
    if (t.ka < depMin) continue;
    const ok = s => reaches(s.dest, destIndex);
    const s = starts.find(s => s.time >= t.ay + ayaseMin && ok(s));
    const gap = s ? s.time - t.ay : null;
    const next = null;   // 綾瀬は同じホームの向かい側なので「間に合わなかったら」は出さない（夏目さん）
    out.push({
      kameariDep: t.ka, ayaseArr: t.ay,
      ayaseDep: s ? s.time : null, origin: s ? s.origin : "", type: s ? s.type : "", dest: s ? s.dest : "",
      wait: s ? s.time - t.ka : null, gap, tight: s ? isTight(gap, ayaseMin) : false,
      destName, destArr: s ? s.time + destMin : null,
      ifMissed: next ? { dep: next.time, arr: next.time + destMin, origin: next.origin, type: next.type, dest: next.dest } : null,
      throughArr: t.through,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// =====================================================================
// 帰り（品川始発 → 北千住乗り換え／松戸折り返し）
// =====================================================================
const TYPE_NAME = { "": "普通", "快": "快速", "特快": "特別快速" };
export function kaeriCandidates(data, arrMin, limit = 3) {
  const t1 = transferMin(data.transfers, "kitasenju-jr-to-chiyoda"), t2 = transferMin(data.transfers, "matsudo-jr-to-local");
  const down = jrLegs(data.jrDown, "北千住", "亀有");
  const up = jrLegs(data.jrUp, "松戸", "亀有");
  const out = [];
  const trains = data.shinagawa.trains.slice().sort((a, b) => toMin(a.shinagawaDep) - toMin(b.shinagawaDep));
  for (const t of trains) {
    if (!(t.type in TYPE_NAME)) continue;        // 特急（ひたち・ときわ）は除く
    if (t.misc && t.misc.includes("◆")) continue;  // 日付限定
    const sd = toMin(t.shinagawaDep);
    if (sd < arrMin) continue;
    const st = Object.fromEntries(t.stops.map(s => [s.station, s]));
    const ks = st["北千住"], mt = st["松戸"];
    if (!ks || !mt) continue;
    const ksArr = toMin(ks.arr || ks.dep), mtArr = toMin(mt.arr || mt.dep);
    const c1 = after(down, ksArr + t1), c2 = after(up, mtArr + t2);
    const g1 = c1 ? c1.dep - ksArr : null, g2 = c2 ? c2.dep - mtArr : null;
    const n1 = c1 && g1 <= SHOW_NEXT ? nextAfter(down, c1.dep) : null;
    const n2 = c2 && g2 <= SHOW_NEXT ? nextAfter(up, c2.dep) : null;
    out.push({
      shinagawaDep: sd, type: t.type, typeName: TYPE_NAME[t.type], shinagawaPlatform: st["品川"] && st["品川"].platform,
      kitasenjuArr: ksArr, kitasenjuPlatform: ks.platform,
      chiyodaDep: c1 ? c1.dep : null, chiyodaDest: c1 ? c1.dest + "行き" : "", kameari1: c1 ? c1.arr : null,
      transfer1: g1, tight1: !!c1 && isTight(g1, t1), missed1: n1 ? { dep: n1.dep, arr: n1.arr, dest: n1.dest + "行き" } : null,
      matsudoArr: mtArr, matsudoDep0: toMin(mt.dep || mt.arr), matsudoPlatform: mt.platform,
      matsudoDep: c2 ? c2.dep : null, kameari2: c2 ? c2.arr : null,
      transfer2: g2, tight2: !!c2 && isTight(g2, t2), missed2: n2 ? { dep: n2.dep, arr: n2.arr } : null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// =====================================================================
// 最速で新橋
// =====================================================================
// 乗り換えの回数。綾瀬の同じホームでの乗り換え（noMiss）と歩きは数えない（歩きは前後の乗り物で1回の乗り換え）
export function transferCount(c) { return c.legs.filter(l => !l.walk && !l.noMiss).length - 1; }
function pickTop(out, limit, keyFn = c => c.dep + "@" + c.arr) {
  out.sort((a, b) => a.arr - b.arr || b.dep - a.dep || a.legs.length - b.legs.length);
  const seen = new Set(), res = [];
  for (const c of out) {
    const key = keyFn(c);
    if (seen.has(key)) continue;
    seen.add(key); res.push(c);
    if (res.length >= limit) break;
  }
  return res;
}

// opts: { bus: 都営浅草線→青砥経由→バスを含めるか, metro: 東京メトロ（銀座線・浅草線・日比谷線）経由を含めるか }。どちらも初期値は含めない（夏目さん）
export function shimbashiCandidates(data, depMin, limit = 3, opts = {}) {
  const tr = data.transfers;
  const T = id => transferMin(tr, id);
  const out = [];
  const add = (via, specs, extra = {}) => { const c = finish(depMin, specs, { via, kind: "jr", ...extra }); if (c) out.push(c); };

  // 亀有発の各停（JR直通の電車は北千住・西日暮里・国会議事堂前の時刻を持つ）
  const starts = ((data.ayase && data.ayase.trains) || []).filter(t => !t.prefix)
    .map(t => ({ dep: toMin(t.time), origin: t.start ? "綾瀬始発" : "北綾瀬始発", dest: stationName(t.dest), trainNo: t.trainNo }))
    .sort((a, b) => a.dep - b.dep);
  const ksUpMap = byTrainNo(data.kitasenjuUp);
  const ayaseMin = transferMin(tr, "ayase-jr-to-start");
  const jr = ((data.jrUp && data.jrUp.trains) || [])
    .filter(t => runsNormally(t.days) && isTime(t.times["亀有"]))
    .map(t => ({
      ka: toMin(t.times["亀有"]), ayase: isTime(t.times["綾瀬"]) ? Math.min(toMin(t.times["綾瀬着"] || t.times["綾瀬"]), toMin(t.times["亀有"]) + 4) : null,
      kitasenju: isTime(t.times["北千住"]) ? toMin(t.times["北千住"]) : null,
      nishinippori: isTime(t.times["西日暮里"]) ? toMin(t.times["西日暮里"]) : null,
      kokkai: isTime(t.times["国会議事堂前"]) ? toMin(t.times["国会議事堂前"]) : null,
      dest: t.dest,
    }))
    .filter(t => t.ka >= depMin).sort((a, b) => a.ka - b.ka).slice(0, 4);

  const rapidDirect = jrLegs(data.jrRapidUp, "北千住", "新橋");
  const rapidNippori = jrLegs(data.jrRapidUp, "北千住", "日暮里", ["上野"]);
  const rapidUeno = jrLegs(data.jrRapidUp, "北千住", "上野");
  const yam = st => jrLegs(data.yamanote, st, "新橋"), kei = st => jrLegs(data.keihin, st, "新橋");
  const hibiya = ekRide(data.hibiyaKitasenju, null);
  const hibGinza = byTrainNo(data.hibiyaGinza), hibHigashi = byTrainNo(data.hibiyaHigashiginza);
  const hibiyaToGinza = ekRide(data.hibiyaKitasenju, hibGinza), hibiyaToHigashi = ekRide(data.hibiyaKitasenju, hibHigashi);
  const ginzaFromGinza = ekRide(data.ginzaGinza, byTrainNo(data.ginzaShimbashiShibuya));
  const ginzaFromTameike = ekRide(data.ginzaTameike, byTrainNo(data.ginzaShimbashiAsakusa));
  const asakusaFromHigashi = ekRide(data.asakusaHigashiginza, byTrainNo(data.asakusaShimbashi));
  const lineName = (name, x) => name + (x.type ? " " + x.type : "") + (x.dest ? "（" + x.dest + "行き）" : "");

  for (const t of jr) {
    // 亀有→北千住（直通ならそのまま。綾瀬止まりなら綾瀬で始発に乗り換え）
    let legs0, estimated = false, nishi = t.nishinippori, kokkai = t.kokkai, ksArr = t.kitasenju;
    if (ksArr !== null) legs0 = [{ x: { dep: t.ka, arr: t.kitasenju }, line: "常磐線各駅停車（千代田線直通）", from: "亀有", to: "北千住" }];
    else if (t.ayase !== null) {
      const sl = starts.filter(s => s.dest !== "北千住" && s.dest !== "町屋").map(s => ({ dep: s.dep, arr: ksUpMap.get(s.trainNo) ?? (s.dep + 4), origin: s.origin, dest: s.dest }));
      legs0 = [{ x: { dep: t.ka, arr: t.ayase }, line: "常磐線各駅停車", from: "亀有", to: "綾瀬" }, { list: sl, tmin: ayaseMin, noMiss: true, line: x => "千代田線（" + x.origin + "・" + x.dest + "行き）", from: "綾瀬", to: "北千住" }];
      const s = after(sl, t.ayase + ayaseMin);
      if (!s) continue;
      ksArr = s.arr; nishi = s.dep + 10; kokkai = s.dep + 27; estimated = true;
    } else continue;
    const stopAt = (st, arr) => legs0.length === 1 ? [{ ...legs0[0], x: { dep: t.ka, arr }, to: st }] : [legs0[0], { ...legs0[1], list: legs0[1].list.map(x => ({ ...x, arr: x.dep + (st === "西日暮里" ? 10 : 27) })), to: st }];
    // (a) 北千住 → 上野東京ライン直通で新橋
    add("北千住で常磐線快速（上野東京ライン直通）", [...legs0, { list: rapidDirect, tmin: T("kitasenju-chiyoda-to-jr"), line: x => "常磐線 " + x.type + "（上野東京ライン直通・" + x.dest + "行き）", from: "北千住", to: "新橋" }], { estimated });
    // (b) 北千住 → 快速 → 日暮里／上野 → 山手線外回り・京浜東北線南行
    //     山手線外回りと京浜東北線南行は同じホームなので、1つの一覧にして「先に来たほう」に乗る（間に合わなかったら次も、両方の線から探す。夏目さん 2026-11-05）
    const either = st => eitherLine(["山手線 外回り", yam(st)], ["京浜東北線 南行", kei(st)]);
    for (const [st, list] of [["日暮里", rapidNippori], ["上野", rapidUeno]]) {
      const tid = st === "日暮里" ? "nippori-jr-to-yamanote" : "ueno-jr-to-yamanote";
      add(`北千住で快速 → ${st}で山手線か京浜東北線`, [...legs0, { list, tmin: T("kitasenju-chiyoda-to-jr"), line: x => "常磐線 " + x.type, from: "北千住", to: st }, { list: either(st), tmin: T(tid), line: x => x.lineName, from: st, to: "新橋" }], { estimated });
    }
    // (c) 西日暮里 → 山手線外回り・京浜東北線南行（同じホーム。先に来たほう）
    if (nishi !== null) add("西日暮里で山手線か京浜東北線", [...stopAt("西日暮里", nishi), { list: either("西日暮里"), tmin: T("nishinippori-chiyoda-to-jr"), line: x => x.lineName, from: "西日暮里", to: "新橋" }], { estimated });
    // (d) 北千住 → 日比谷線 → 銀座（銀座線）／東銀座（浅草線）【東京メトロ経由】
    if (opts.metro) {
      add("北千住で日比谷線 → 銀座で銀座線", [...legs0, { list: hibiyaToGinza, tmin: T("kitasenju-chiyoda-to-hibiya"), line: x => "日比谷線（" + x.dest + "行き）", from: "北千住", to: "銀座" }, { list: ginzaFromGinza, tmin: T("ginza-hibiya-to-ginza"), line: "銀座線（渋谷方面）", from: "銀座", to: "新橋" }], { estimated, kind: "metro" });
      add("北千住で日比谷線 → 東銀座で都営浅草線", [...legs0, { list: hibiyaToHigashi, tmin: T("kitasenju-chiyoda-to-hibiya"), line: x => "日比谷線（" + x.dest + "行き）", from: "北千住", to: "東銀座" }, { list: asakusaFromHigashi, tmin: T("higashiginza-hibiya-to-asakusa"), line: "都営浅草線（西馬込方面）", from: "東銀座", to: "新橋" }], { estimated, kind: "metro" });
      // (e) 国会議事堂前 → 溜池山王（銀座線）
      if (kokkai !== null) add("国会議事堂前から溜池山王で銀座線", [...stopAt("国会議事堂前", kokkai), { list: ginzaFromTameike, tmin: T("kokkai-chiyoda-to-tameike"), line: "銀座線（浅草方面）", from: "溜池山王", to: "新橋" }], { estimated, kind: "metro" });
    }
  }
  // (f) バス → 青砥 → 京成押上線・都営浅草線直通で新橋【青砥経由】
  if (opts.bus) for (const c of aotoCandidates(data, depMin, "shimbashi", 2)) out.push({ ...c, via: "バスで青砥 → 京成・都営浅草線直通", kind: "bus" });
  // 新橋へは乗り換え1回まで（夏目さん 2026-11-05。綾瀬の同じホームでの乗り換えは数えない）
  return pickTop(out.filter(c => transferCount(c) <= 1), limit);
}

// =====================================================================
// 青砥経由（亀有駅からバス → 青砥駅で京成線）
// =====================================================================
// 亀有駅→青砥のバス（シャトル☆セブン＋新小53・新小52乙・新小58）を1つの一覧にする。kind は "weekday"|"holiday"
export function busesToAoto(data) {
  const kind = data.dayKind === "holiday" ? "holiday" : "weekday";
  const tr = data.transfers;
  const out = [];
  for (const t of (data.bus && data.bus.trips) || []) {
    out.push({ dep: toMin(t.kameariDep), arr: toMin(t.aotoHigashiArr), route: "シャトル☆セブン " + t.service, busDest: t.dest, boarding: "南口1番のりば", stop: "青砥駅東交差点", walk: transferInfo(tr, "aoto-bus-to-keisei") });
  }
  for (const r of (data.busKeisei && data.busKeisei.routes) || []) {
    if (!r.viaAoto || !r.trips) continue;
    const walkId = r.alightStop === "青砥駅入口" ? "aoto-iriguchi-walk" : "aoto-bus-to-keisei";
    for (const t of r.trips[kind] || []) {
      out.push({ dep: toMin(t.dep), arr: toMin(t.arr), route: r.name, busDest: r.dest, boarding: r.boarding.replace("亀有駅 ", ""), stop: r.alightStop, walk: transferInfo(tr, walkId), mark: t.mark });
    }
  }
  return out.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
}
// 青砥→亀有駅のバス。バス停ごとにまとめる { "青砥駅東交差点": [...], "青砥駅入口": [...] }
export function busesFromAoto(data) {
  const kind = data.dayKind === "holiday" ? "holiday" : "weekday";
  const by = { "青砥駅東交差点": [], "青砥駅入口": [] };
  for (const b of (data.bus && data.bus.tripsToKameari) || []) {
    by["青砥駅東交差点"].push({ dep: toMin(b.aotoHigashiDep), arr: toMin(b.kameariArr), route: "シャトル☆セブン " + b.service, origin: b.origin + "から来る", est: false });
  }
  for (const r of (data.busKeisei && data.busKeisei.routes) || []) {
    if (!r.viaAoto || !r.tripsToKameari || !by[r.alightStop]) continue;
    for (const t of r.tripsToKameari[kind] || []) by[r.alightStop].push({ dep: toMin(t.dep), arr: toMin(t.arr), route: r.name, origin: "", est: !!t.estimated });
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  return by;
}

export function aotoCandidates(data, depMin, dest, limit = 3) {
  const tr = data.transfers;
  const trips = busesToAoto(data);
  const shimbashi = byTrainNo(data.asakusaShimbashi), kawasaki = byTrainNo(data.keikyuKawasaki);
  const airMain = byTrainNo(data.airportMain), airSA = byTrainNo(data.airportSA);
  let list, line, to, tail = [];
  if (dest === "shimbashi") {
    list = ekRide(data.keiseiAotoUp, shimbashi); to = "新橋";
    line = x => "京成押上線→都営浅草線直通 " + x.type + "（" + x.dest + "行き）" + (x.typeNote ? "・" + x.typeNote : "");
  } else if (dest === "kawasaki") {
    // 川崎＝京急川崎（夏目さん 2026-11-05）。JR川崎への歩きは出さない。青砥から1本で行ける電車だけ（京急川崎の時刻表に同じ列車番号があるもの）
    list = ekRide(data.keiseiAotoUp, kawasaki); to = "京急川崎";
    line = x => "京成押上線→都営浅草線→京急線直通 " + x.type + "（" + x.dest + "行き）";
  } else {
    // 成田空港第2・3ターミナル（空港第2ビル駅）の着は、その駅の発時刻で代用。第1ターミナル（成田空港駅）は終点で着時刻が無いので
    // 「空港第2ビル発＋3分」の目安（上り方向の時刻表で、成田空港発→空港第2ビル発の差がほぼ3分なのを確認）
    const T1 = dest === "narita1";
    const trains = ((data.keiseiAotoDown && data.keiseiAotoDown.trains) || []);
    list = trains.map(t => { const a = t.type === "アクセス特急" ? airSA.get(t.trainNo) : (airMain.get(t.trainNo) ?? airSA.get(t.trainNo)); return { dep: toMin(t.time), type: t.type, dest: t.dest, trainNo: t.trainNo, sa: t.type === "アクセス特急", arr: a === undefined ? undefined : a + (T1 ? 3 : 0), est: T1 }; })
      .filter(x => x.dest === "成田空港" && !/ライナー/.test(x.type) && x.arr !== undefined).sort((a, b) => a.dep - b.dep);
    to = T1 ? "成田空港第1ターミナル" : "成田空港第2・3ターミナル";
    line = x => "京成" + (x.sa ? "成田スカイアクセス線経由 " : "本線経由 ") + x.type + "（成田空港行き）" + (T1 ? "・第1ターミナル着は第2・3ターミナル発＋3分の目安" : "");
  }
  const out = [];
  let i = -1;
  for (const b of trips) {
    i++;
    if (b.dep < depMin) continue;
    // 余裕を見るなら1本前：それより前に出て、青砥にも先に着くバス
    const prev = trips.slice(0, i).reverse().find(p => p.dep < b.dep && p.arr <= b.arr) || null;
    const specs = [
      { x: b, line: "京成バス " + b.route + "（" + b.busDest + "行き）" + b.boarding, from: "亀有駅", to: b.stop },
      { walk: b.walk.minutes, line: "歩き（" + b.walk.minutes + "分" + (b.walk.confirmed ? "" : "・未確認") + "）", from: b.stop, to: "青砥駅ホーム" },
      { list, tmin: 0, line, from: "青砥", to },
      ...tail,
    ];
    const c = finish(depMin, specs, { via: "バスで青砥 → 京成線", kind: "bus", bus: b, safeBus: prev ? { dep: prev.dep, aoto: prev.arr, route: prev.route } : null, estimated: dest === "narita1" });
    if (!c) continue;
    c.train = c.legs[2].x;
    c.wait = c.legs[2].dep - c.legs[1].arr;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

// =====================================================================
// 各地から亀有へ帰る（新橋・川崎・成田空港）
// =====================================================================
// opts は新橋からのときだけ使う: { bus: 都営浅草線→青砥経由→バスを含めるか, metro: 東京メトロ（銀座線・浅草線・日比谷線）経由を含めるか }
export function kameariCandidates(data, origin, depMin, limit = 3, opts = {}) {
  const tr = data.transfers;
  const T = id => transferMin(tr, id);
  const out = [];
  const add = (via, kind, specs, extra = {}) => { const c = finish(depMin, specs, { via, kind, ...extra }); if (c) out.push(c); };

  // ---- 共通：JRの駅（品川・新橋・東京・上野・日暮里）に着いてから亀有へ ----
  const rapidFrom = {};
  for (const st of ["品川", "新橋", "東京", "上野", "日暮里"]) rapidFrom[st] = jrLegs(data.jrRapidDown, st, "北千住", ["松戸"]).filter(notLtdExp);
  const chiyodaKitasenju = jrLegs(data.jrDown, "北千住", "亀有");
  const chiyodaNishinippori = jrLegs(data.jrDown, "西日暮里", "亀有");
  const localMatsudo = jrLegs(data.jrUp, "松戸", "亀有");
  const TID = { "品川": "shinagawa-tokaido-to-joban", "新橋": "shimbashi-jr-to-joban", "東京": "tokyo-jr-to-joban", "上野": "ueno-jr-to-joban", "日暮里": "nippori-jr-to-joban" };
  function viaJr(st, specs0, headName, kind = "jr", extra = {}) {
    const first = specs0.length === 0;
    if (st === "西日暮里") {
      add((headName ? headName + " → " : "") + "西日暮里で千代田線", kind, [...specs0, { list: chiyodaNishinippori, tmin: T("nishinippori-jr-to-chiyoda"), line: x => "千代田線（" + x.dest + "行き）", from: "西日暮里", to: "亀有" }], extra);
      return;
    }
    const head = headName ? headName + ` → ${st}で常磐線` : "常磐線（上野東京ライン直通）";
    const tid = first ? 0 : T(TID[st]);
    const rapid = { list: rapidFrom[st] || [], tmin: tid, line: x => "常磐線 " + x.type + "（" + x.dest + "行き）", from: st, to: "北千住" };
    add(head + " → 北千住で千代田線", kind, [...specs0, rapid, { list: chiyodaKitasenju, tmin: T("kitasenju-jr-to-chiyoda"), line: x => "千代田線（" + x.dest + "行き）", from: "北千住", to: "亀有" }], extra);
    const rapidM = { ...rapid, list: rapid.list.filter(x => x.松戸 !== null).map(x => ({ ...x, arr: x.松戸 })), to: "松戸" };
    add(head + " → 松戸で各駅停車に折り返し", kind, [...specs0, rapidM, { list: localMatsudo, tmin: T("matsudo-jr-to-local"), line: "常磐線各駅停車 上り", from: "松戸", to: "亀有" }], extra);
  }
  // ---- 共通：青砥に着いてからバスで亀有駅へ（青砥駅東交差点＝シャトル☆セブン・新小58、青砥駅入口＝新小53・新小52乙）----
  const busBy = busesFromAoto(data);
  const busSpecsList = Object.entries(busBy).filter(([, l]) => l.length).map(([stop, l]) => {
    const w = transferInfo(tr, stop === "青砥駅入口" ? "aoto-iriguchi-walk" : "aoto-keisei-to-bus");
    return [{ walk: w.minutes, line: "歩き（" + w.minutes + "分" + (w.confirmed ? "" : "・未確認") + "）", from: "青砥", to: stop + " バス停" }, { list: l, tmin: 0, line: x => "京成バス " + x.route + "（" + x.origin + "亀有駅行き）" + (x.est ? "・着は目安" : ""), from: stop, to: "亀有駅" }];
  });
  // add() の代わり：バス停ごとに候補を作る
  const addBus = (via, specs0, extra = {}) => { for (const bs of busSpecsList) add(via, "bus", [...specs0, ...bs], extra); };
  // 青砥に着く時刻：押上線から来る電車は、本線下りの青砥発（直通）か、青砥止まりなら京成立石発+3分（目安）
  const aotoDownMap = byTrainNo(data.keiseiAotoDown), tateishiMap = byTrainNo(data.keiseiTateishiDown);
  const toAoto = ek => ((ek && ek.trains) || []).map(t => {
    const no = t.trainNo;
    const est = !aotoDownMap.has(no) && tateishiMap.has(no);
    return { dep: toMin(t.time), arr: aotoDownMap.has(no) ? aotoDownMap.get(no) : (tateishiMap.has(no) ? tateishiMap.get(no) + 3 : undefined), type: t.type, dest: stationName(t.dest), trainNo: no, est };
  }).filter(x => x.arr !== undefined).sort((a, b) => a.dep - b.dep);

  if (origin === "shimbashi") {
    viaJr("新橋", [], "");
    // 山手線内回りと京浜東北線北行は新橋で同じホームなので、1つの一覧にして「先に来たほう」に乗る（夏目さん 2026-11-05）
    for (const st of ["上野", "日暮里", "西日暮里"]) {
      const list = eitherLine(["山手線 内回り", jrLegs(data.yamanoteInner, "新橋", st)], ["京浜東北線 北行", jrLegs(data.keihinNorth, "新橋", st)]);
      viaJr(st, [{ list, line: x => x.lineName + "（新橋から）", from: "新橋", to: st }], "山手線か京浜東北線");
    }
    // 銀座線→銀座→日比谷線／浅草線→東銀座→日比谷線 → 北千住（南千住発+2分の目安）→ 千代田線【東京メトロ経由】
    if (opts.metro) {
      const minamiMap = byTrainNo(data.hibiyaMinamisenjuUp);
      const hibToKitasenju = ek => ekRide(ek, null).filter(x => minamiMap.has(x.trainNo)).map(x => ({ ...x, arr: minamiMap.get(x.trainNo) + 2 }));
      for (const [name, list, st, hibList, tid] of [
        ["銀座線", ekRide(data.ginzaShimbashiAsakusa, byTrainNo(data.ginzaGinzaAsakusa)), "銀座", hibToKitasenju(data.hibiyaGinzaUp), "ginza-ginza-to-hibiya"],
        ["都営浅草線", ekRide(data.asakusaShimbashiOshiage, byTrainNo(data.asakusaHigashiginzaOshiage)), "東銀座", hibToKitasenju(data.hibiyaHigashiginzaUp), "higashiginza-asakusa-to-hibiya"]]) {
        add(`${name} → ${st}で日比谷線 → 北千住で千代田線`, "metro", [
          { list, line: name + "（新橋から）", from: "新橋", to: st },
          { list: hibList, tmin: T(tid), line: x => "日比谷線（" + x.dest + "行き）", from: st, to: "北千住" },
          { list: chiyodaKitasenju, tmin: T("kitasenju-hibiya-to-chiyoda"), line: x => "千代田線（" + x.dest + "行き）", from: "北千住", to: "亀有" }], { estimated: true });
      }
    }
    // 浅草線→押上線直通で青砥→バス【青砥経由】
    if (opts.bus) {
      const list = toAoto(data.asakusaShimbashiOshiage).filter(x => x.dest !== "押上");
      addBus("都営浅草線→京成押上線直通 → 青砥からバス", [{ list, line: x => "都営浅草線→京成押上線直通 " + x.type + "（" + x.dest + "行き）", from: "新橋", to: "青砥" }], { estimated: !!(after(list, depMin) || {}).est });
    }
  }

  if (origin === "kawasaki") {
    for (const [name, table, stations] of [["東海道線 上り", data.tokaidoUp, ["品川", "新橋", "東京", "上野"]], ["上野東京ライン 北行", data.utlNorth, ["品川", "新橋", "東京", "上野"]], ["京浜東北線 北行", data.keihinNorth, ["品川", "新橋", "東京", "上野", "日暮里", "西日暮里"]]]) {
      for (const st of stations) viaJr(st, [{ list: jrLegs(table, "川崎", st).filter(notLtdExp), line: x => name + " " + x.type + "（" + x.dest + "行き）", from: "JR川崎", to: st }], name);
    }
    const list = toAoto(data.keikyuKawasakiUp).filter(x => ["青砥", "京成高砂", "印旛日本医大", "成田空港", "印西牧の原", "芝山千代田", "京成佐倉", "京成成田"].includes(x.dest));
    addBus("京急→都営浅草線→京成押上線直通 → 青砥からバス", [{ list, line: x => "京急線→都営浅草線→京成押上線直通 " + x.type + "（" + x.dest + "行き）", from: "京急川崎", to: "青砥" }], { estimated: !!(after(list, depMin) || {}).est });
  }

  if (origin === "tokyo") {
    // 東京 → 京葉線・武蔵野線直通（東京始発なのでずっと座れる）→ 新松戸 → 常磐線各駅停車 上り → 亀有（夏目さん 2026-11-05）
    // 京葉線下りの表は東京〜西船橋、武蔵野線上りの表は西船橋〜新松戸。同じ列車番号で西船橋の発時刻も同じものを1本の電車として結ぶ。
    // 新松戸の「着」は時刻表の発車時刻で代用。西船橋で乗り換える行き方（乗り換え2回）は出さない。
    const mus = new Map();
    for (const t of (data.musashinoUp && data.musashinoUp.trains) || []) if (runsNormally(t.days) && isTime(t.times["西船橋"]) && isTime(t.times["新松戸"])) mus.set(t.no + "@" + t.times["西船橋"], toMin(t.times["新松戸"]));
    const direct = ((data.keiyoDown && data.keiyoDown.trains) || [])
      .filter(t => runsNormally(t.days) && isTime(t.times["東京"]) && isTime(t.times["西船橋"]) && mus.has(t.no + "@" + t.times["西船橋"]))
      .map(t => ({ dep: toMin(t.times["東京"]), arr: mus.get(t.no + "@" + t.times["西船橋"]), type: t.type, dest: t.dest, no: t.no }))
      .sort((a, b) => a.dep - b.dep);
    const localShinmatsudo = jrLegs(data.jrUp, "新松戸", "亀有");
    for (const x of direct.filter(x => x.dep >= depMin).slice(0, limit + 2)) {
      add("京葉線→武蔵野線直通で新松戸 → 常磐線各駅停車（ずっと座れる）", "jr", [
        { x, line: "京葉線→武蔵野線直通 " + x.type + "（" + x.dest + "行き）", from: "東京", to: "新松戸" },
        { list: localShinmatsudo, tmin: T("shinmatsudo-musashino-to-joban"), line: x => "常磐線各駅停車 上り（" + x.dest + "行き）", from: "新松戸", to: "亀有" }], { seated: true });
    }
  }

  if (origin === "narita1" || origin === "narita2") {
    const stName = origin === "narita1" ? "成田空港第1ターミナル" : "成田空港第2・3ターミナル";
    const aotoUpMain = byTrainNo(data.keiseiAotoUpMain), aotoUpOshiage = byTrainNo(data.keiseiAotoUp), nipporiMap = byTrainNo(data.keiseiNipporiUp);
    const aotoMap = new Map([...aotoUpOshiage, ...aotoUpMain]);
    for (const [name, ek] of [["京成本線経由", origin === "narita1" ? data.airport1MainUp : data.airport2MainUp], ["成田スカイアクセス線経由", origin === "narita1" ? data.airport1SAUp : data.airport2SAUp]]) {
      const noLiner = x => !/ライナー/.test(x.type);
      const lineK = x => "京成 " + name + " " + x.type + "（" + x.dest + "行き）";
      addBus(`${name} → 青砥からバス`, [{ list: ekRide(ek, aotoMap, noLiner), line: lineK, from: stName, to: "青砥" }]);
      viaJr("日暮里", [{ list: ekRide(ek, nipporiMap, noLiner), line: lineK, from: stName, to: "日暮里" }], "京成 " + name);
    }
  }

  for (const c of out) if (c.kind === "bus" && c.legs[c.legs.length - 1].x && c.legs[c.legs.length - 1].x.est) c.estimated = true;
  // 新橋・川崎（・東京）からは乗り換え1回まで（夏目さん 2026-11-05）。成田空港は従来どおり
  const pool = ["shimbashi", "kawasaki", "tokyo"].includes(origin) ? out.filter(c => transferCount(c) <= 1) : out;
  const res = pickTop(pool, limit);
  // 川崎・成田は「JR経由」と「バス経由」の両方を必ず1つは見せる（新橋は選択肢しだい、東京はJRだけ）
  for (const kind of (origin === "shimbashi" || origin === "tokyo" ? [] : ["jr", "bus"])) {
    if (!res.some(c => c.kind === kind)) {
      const best = pool.find(c => c.kind === kind);
      if (best) res.push({ ...best, extra: true });
    }
  }
  return res;
}
