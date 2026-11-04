// 亀有の達人 ― 計算の中身（画面とは切り離した純粋な計算だけ）
// ブラウザ（app.js）と、テスト（tests/）の両方から同じものを使う。
// 時刻表そのもの（data/ の JSON）を読んで、その場で乗り換えを計算する。

// ---- 時刻の扱い ----
// "H:MM" / "HH:MM" → 0:00 からの分。深夜 0〜3 時台は翌日扱い（+24時間）で、終電まで順番が崩れないようにする。
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
// 駅名と、綾瀬発車からの所要分（平日昼の目安、±1分）
export const DEST = [["北千住", 4], ["町屋", 7], ["西日暮里", 10], ["千駄木", 11], ["根津", 14], ["湯島", 15], ["新御茶ノ水", 18], ["大手町", 20], ["二重橋前", 21], ["日比谷", 23], ["霞ケ関", 26], ["国会議事堂前", 27], ["赤坂", 29], ["乃木坂", 31], ["表参道", 34], ["明治神宮前", 36], ["代々木公園", 38], ["代々木上原", 39]];
const DEST_INDEX = Object.fromEntries(DEST.map((d, i) => [d[0], i]));
// 駅名の表記ゆれ（駅探は「向ケ丘遊園」、小田急の正式は「向ヶ丘遊園」）
export function stationName(s) { return (s || "").replace("向ケ丘遊園", "向ヶ丘遊園"); }
// その電車（行先 dest）が、千代田線の destIndex 番目の駅まで行くか。千代田線の途中駅止まりだけ落とす。小田急直通などは行く。
export function reaches(dest, destIndex) {
  if (!dest) return true;
  const i = DEST_INDEX[dest.replace(/行き?$/, "")];
  return i === undefined ? true : i >= destIndex;
}

// ---- 行き（亀有 → 綾瀬で綾瀬始発・北綾瀬始発に乗り換え） ----
// data = { jrUp: JR 常磐線各停 上り（亀有発・綾瀬の時刻）, ayase: 駅探 綾瀬駅 代々木上原方面の全列車 }
// depMin: 亀有を出る時刻（分）。destIndex: DEST の番号。
export function ikiCandidates(data, depMin, destIndex, limit = 3) {
  const [destName, destMin] = DEST[destIndex];
  // 綾瀬を出る始発（JRから来る電車＝prefix "A" は除く）
  const starts = data.ayase.trains
    .filter(t => !t.prefix)
    .map(t => ({ time: toMin(t.time), origin: t.start ? "綾瀬始発" : "北綾瀬始発", type: t.type === "普通" ? "" : t.type, dest: stationName(t.dest) }))
    .sort((a, b) => a.time - b.time);
  // JRの表には綾瀬の「発」しか無いので、綾瀬着は「亀有発+4分」（それより早い発があればその時刻）とする
  const jr = data.jrUp.trains
    .filter(t => runsNormally(t.days) && isTime(t.times["亀有"]) && isTime(t.times["綾瀬"]))
    .map(t => { const ka = toMin(t.times["亀有"]); return { ka, ay: Math.min(toMin(t.times["綾瀬着"] || t.times["綾瀬"]), ka + 4), through: isTime(t.times[destName]) ? toMin(t.times[destName]) : null, dest: t.dest }; })
    .sort((a, b) => a.ka - b.ka);
  const out = [];
  for (const t of jr) {
    if (t.ka < depMin) continue;
    const s = starts.find(s => s.time >= t.ay && reaches(s.dest, destIndex));
    out.push({
      kameariDep: t.ka, ayaseArr: t.ay,
      ayaseDep: s ? s.time : null, origin: s ? s.origin : "", type: s ? s.type : "", dest: s ? s.dest : "",
      wait: s ? s.time - t.ka : null,
      destName, destArr: s ? s.time + destMin : null,
      throughArr: t.through,            // そのまま乗ったときの着（JR直通が目的地まで行く場合だけ）
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---- 帰り（品川始発 → 北千住乗り換え／松戸折り返し） ----
// data = { shinagawa: 品川始発の各列車（停車駅の着発）, jrDown: 千代田線→常磐線各停 下り（北千住発→亀有）, jrUp: 常磐線各停 上り（松戸発→亀有） }
const TYPE_NAME = { "": "普通", "快": "快速", "特快": "特別快速" };
export function kaeriCandidates(data, arrMin, limit = 3) {
  const down = data.jrDown.trains
    .filter(t => runsNormally(t.days) && isTime(t.times["北千住"]) && isTime(t.times["亀有"]))
    .map(t => ({ dep: toMin(t.times["北千住"]), kameari: toMin(t.times["亀有"]), dest: t.dest, no: t.no }))
    .sort((a, b) => a.dep - b.dep);
  const up = data.jrUp.trains
    .filter(t => runsNormally(t.days) && isTime(t.times["松戸"]) && isTime(t.times["亀有"]))
    .map(t => ({ dep: toMin(t.times["松戸"]), kameari: toMin(t.times["亀有"]), no: t.no }))
    .sort((a, b) => a.dep - b.dep);
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
    const c1 = down.find(d => d.dep >= ksArr + 1);     // 乗り換え1分以上
    const c2 = up.find(u => u.dep >= mtArr + 1);
    out.push({
      shinagawaDep: sd, type: t.type, typeName: TYPE_NAME[t.type], shinagawaPlatform: st["品川"] && st["品川"].platform,
      kitasenjuArr: ksArr, kitasenjuPlatform: ks.platform,
      chiyodaDep: c1 ? c1.dep : null, chiyodaDest: c1 ? c1.dest + "行き" : "", kameari1: c1 ? c1.kameari : null,
      transfer1: c1 ? c1.dep - ksArr : null, tight1: !!c1 && c1.dep - ksArr <= 1,
      matsudoArr: mtArr, matsudoDep0: toMin(mt.dep || mt.arr), matsudoPlatform: mt.platform,
      matsudoDep: c2 ? c2.dep : null, kameari2: c2 ? c2.kameari : null,
      transfer2: c2 ? c2.dep - mtArr : null, tight2: !!c2 && c2.dep - mtArr <= 1,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// =====================================================================
// 新橋・青砥（バス＋京成）
// =====================================================================
// 乗り換え分数の表（data/transfers.json）から id で引く。無ければ fallback。
export function transferMin(transfers, id, fallback = 3) {
  const t = (transfers && transfers.transfers || []).find(x => x.id === id);
  return t ? t.minutes : fallback;
}
export function transferInfo(transfers, id) {
  return (transfers && transfers.transfers || []).find(x => x.id === id) || { minutes: 3, confirmed: false, source: "未確認" };
}
const after = (list, t) => list.find(x => x.dep >= t);
// 駅探の駅時刻表 → 列車番号 → 発車時刻（分）
function byTrainNo(ek) {
  const m = new Map();
  for (const t of (ek && ek.trains) || []) if (t.trainNo && !m.has(t.trainNo)) m.set(t.trainNo, toMin(t.time));
  return m;
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

// ---- 最速で新橋 ----
// data: { jrUp, jrRapidUp, yamanote, keihin, ayase, kitasenjuUp, hibiyaKitasenju, hibiyaGinza, hibiyaHigashiginza,
//         ginzaGinza, ginzaShimbashiShibuya, ginzaTameike, ginzaShimbashiAsakusa, asakusaHigashiginza, asakusaShimbashi,
//         keiseiAotoUp, bus, transfers }   （無いものは null でよい。その経路は計算しない）
// 返り値: 候補の配列（新橋に早く着く順、最大 limit 件）。各候補 = { arr, via, legs:[{line, from, dep, to, arr, note}], transfers:[{station, minutes, confirmed}], estimated }
export function shimbashiCandidates(data, depMin, limit = 3) {
  const tr = data.transfers;
  const T = id => transferMin(tr, id);
  const tInfo = (station, id) => ({ station, ...transferInfo(tr, id) });
  const out = [];
  const push = (via, legs, transfers, estimated = false) => {
    const arr = legs[legs.length - 1].arr;
    if (arr === null || arr === undefined) return;
    out.push({ arr, via, legs, transfers, estimated, dep: legs[0].dep });
  };

  // --- 亀有発の各停（JR直通の電車は北千住・西日暮里・国会議事堂前の時刻を持つ）---
  const starts = ((data.ayase && data.ayase.trains) || []).filter(t => !t.prefix)
    .map(t => ({ dep: toMin(t.time), origin: t.start ? "綾瀬始発" : "北綾瀬始発", dest: stationName(t.dest), trainNo: t.trainNo }))
    .sort((a, b) => a.dep - b.dep);
  const ksUpMap = byTrainNo(data.kitasenjuUp);
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
  const yamNippori = jrLegs(data.yamanote, "日暮里", "新橋");
  const yamNishi = jrLegs(data.yamanote, "西日暮里", "新橋");
  const yamUeno = jrLegs(data.yamanote, "上野", "新橋");
  const keiNippori = jrLegs(data.keihin, "日暮里", "新橋");
  const keiNishi = jrLegs(data.keihin, "西日暮里", "新橋");
  const keiUeno = jrLegs(data.keihin, "上野", "新橋");
  const hibiya = ((data.hibiyaKitasenju && data.hibiyaKitasenju.trains) || []).map(t => ({ dep: toMin(t.time), trainNo: t.trainNo, dest: t.dest })).sort((a, b) => a.dep - b.dep);
  const hibGinza = byTrainNo(data.hibiyaGinza), hibHigashi = byTrainNo(data.hibiyaHigashiginza);
  const ginzaFromGinza = ((data.ginzaGinza && data.ginzaGinza.trains) || []).map(t => ({ dep: toMin(t.time), trainNo: t.trainNo })).sort((a, b) => a.dep - b.dep);
  const ginzaShimbashiShibuya = byTrainNo(data.ginzaShimbashiShibuya);
  const ginzaFromTameike = ((data.ginzaTameike && data.ginzaTameike.trains) || []).map(t => ({ dep: toMin(t.time), trainNo: t.trainNo })).sort((a, b) => a.dep - b.dep);
  const ginzaShimbashiAsakusa = byTrainNo(data.ginzaShimbashiAsakusa);
  const asakusaFromHigashi = ((data.asakusaHigashiginza && data.asakusaHigashiginza.trains) || []).map(t => ({ dep: toMin(t.time), trainNo: t.trainNo })).sort((a, b) => a.dep - b.dep);
  const asakusaShimbashi = byTrainNo(data.asakusaShimbashi);

  for (const t of jr) {
    // 北千住に着く時刻（直通ならそのまま。綾瀬止まりなら綾瀬で始発に乗り換え）
    let ksArr = t.kitasenju, legs0 = [{ line: "常磐線各駅停車（千代田線直通）", from: "亀有", dep: t.ka, to: "北千住", arr: t.kitasenju }];
    let nishi = t.nishinippori, kokkai = t.kokkai, estimated = false;
    if (ksArr === null && t.ayase !== null) {
      const s = starts.find(s => s.dep >= t.ayase && s.dest !== "北千住" && s.dest !== "町屋");
      if (s) {
        ksArr = ksUpMap.get(s.trainNo) ?? (s.dep + 4);
        legs0 = [{ line: "常磐線各駅停車", from: "亀有", dep: t.ka, to: "綾瀬", arr: t.ayase }, { line: "千代田線（" + s.origin + "）", from: "綾瀬", dep: s.dep, to: "北千住", arr: ksArr }];
        nishi = s.dep + 10; kokkai = s.dep + 27; estimated = true;
      }
    }
    if (ksArr !== null) {
      // (a) 北千住 → 上野東京ライン直通で新橋
      const a = after(rapidDirect, ksArr + T("kitasenju-chiyoda-to-jr"));
      if (a) push("北千住で常磐線快速（上野東京ライン直通）", [...legs0, { line: "常磐線 " + a.type + "（上野東京ライン直通・" + a.dest + "行き）", from: "北千住", dep: a.dep, to: "新橋", arr: a.arr }], [tInfo("北千住", "kitasenju-chiyoda-to-jr")], estimated);
      // (b) 北千住 → 快速 → 日暮里／上野 → 山手線・京浜東北線
      const b = after(rapidNippori, ksArr + T("kitasenju-chiyoda-to-jr"));
      if (b) {
        for (const [st, arrAt, tid, lists] of [["日暮里", b.arr, "nippori-jr-to-yamanote", [["山手線 外回り", yamNippori], ["京浜東北線 南行", keiNippori]]], ["上野", b.上野, "ueno-jr-to-yamanote", [["山手線 外回り", yamUeno], ["京浜東北線 南行", keiUeno]]]]) {
          if (arrAt === null || arrAt === undefined) continue;
          for (const [name, list] of lists) {
            const y = after(list, arrAt + T(tid));
            if (y) push(`北千住で快速 → ${st}で${name}`, [...legs0, { line: "常磐線 " + b.type, from: "北千住", dep: b.dep, to: st, arr: arrAt }, { line: name, from: st, dep: y.dep, to: "新橋", arr: y.arr }], [tInfo("北千住", "kitasenju-chiyoda-to-jr"), tInfo(st, tid)], estimated);
          }
        }
      }
      // (d) 北千住 → 日比谷線 → 銀座（銀座線）／東銀座（浅草線）
      const h = after(hibiya, ksArr + T("kitasenju-chiyoda-to-hibiya"));
      if (h) {
        const gArr = hibGinza.get(h.trainNo), eArr = hibHigashi.get(h.trainNo);
        if (gArr !== undefined) {
          const g = after(ginzaFromGinza, gArr + T("ginza-hibiya-to-ginza"));
          const sArr = g && ginzaShimbashiShibuya.get(g.trainNo);
          if (g && sArr !== undefined) push("北千住で日比谷線 → 銀座で銀座線", [...legs0, { line: "日比谷線（" + h.dest + "行き）", from: "北千住", dep: h.dep, to: "銀座", arr: gArr }, { line: "銀座線（渋谷方面）", from: "銀座", dep: g.dep, to: "新橋", arr: sArr }], [tInfo("北千住", "kitasenju-chiyoda-to-hibiya"), tInfo("銀座", "ginza-hibiya-to-ginza")], estimated);
        }
        if (eArr !== undefined) {
          const g = after(asakusaFromHigashi, eArr + T("higashiginza-hibiya-to-asakusa"));
          const sArr = g && asakusaShimbashi.get(g.trainNo);
          if (g && sArr !== undefined) push("北千住で日比谷線 → 東銀座で都営浅草線", [...legs0, { line: "日比谷線（" + h.dest + "行き）", from: "北千住", dep: h.dep, to: "東銀座", arr: eArr }, { line: "都営浅草線（西馬込方面）", from: "東銀座", dep: g.dep, to: "新橋", arr: sArr }], [tInfo("北千住", "kitasenju-chiyoda-to-hibiya"), tInfo("東銀座", "higashiginza-hibiya-to-asakusa")], estimated);
        }
      }
    }
    // (c) 西日暮里 → 山手線・京浜東北線
    if (nishi !== null) {
      const first = legs0.length === 1 ? [{ ...legs0[0], to: "西日暮里", arr: nishi }] : [legs0[0], { ...legs0[1], to: "西日暮里", arr: nishi }];
      for (const [name, list] of [["山手線 外回り", yamNishi], ["京浜東北線 南行", keiNishi]]) {
        const y = after(list, nishi + T("nishinippori-chiyoda-to-jr"));
        if (y) push(`西日暮里で${name}`, [...first, { line: name, from: "西日暮里", dep: y.dep, to: "新橋", arr: y.arr }], [tInfo("西日暮里", "nishinippori-chiyoda-to-jr")], estimated);
      }
    }
    // (e) 国会議事堂前 → 溜池山王（銀座線）
    if (kokkai !== null) {
      const first = legs0.length === 1 ? [{ ...legs0[0], to: "国会議事堂前", arr: kokkai }] : [legs0[0], { ...legs0[1], to: "国会議事堂前", arr: kokkai }];
      const g = after(ginzaFromTameike, kokkai + T("kokkai-chiyoda-to-tameike"));
      const sArr = g && ginzaShimbashiAsakusa.get(g.trainNo);
      if (g && sArr !== undefined) push("国会議事堂前から溜池山王で銀座線", [...first, { line: "銀座線（浅草方面）", from: "溜池山王", dep: g.dep, to: "新橋", arr: sArr }], [tInfo("国会議事堂前→溜池山王", "kokkai-chiyoda-to-tameike")], estimated);
    }
  }
  // (f) バス → 青砥 → 京成押上線・都営浅草線直通で新橋
  for (const c of aotoCandidates(data, depMin, "shimbashi", 2)) push("バスで青砥 → 京成・都営浅草線直通", c.legs, c.transfers, false);

  // 早く着く順。同じ着時刻なら出発が遅い（待ちが少ない）ほう。同じ経路の重複は落とす
  out.sort((a, b) => a.arr - b.arr || b.dep - a.dep);
  const seen = new Set(), res = [];
  for (const c of out) {
    const key = c.via + "@" + c.arr;
    if (seen.has(key)) continue;
    seen.add(key); res.push(c);
    if (res.length >= limit) break;
  }
  return res;
}

// ---- 青砥経由（亀有駅からバス → 青砥駅で京成線） ----
// dest: "narita"（成田空港第2・3ターミナル）| "shimbashi"（新橋）| "kawasaki"（京急川崎→JR川崎）
// data: { bus, keiseiAotoUp, keiseiAotoDown, asakusaShimbashi, keikyuKawasaki, airportMain, airportSA, transfers }
export function aotoCandidates(data, depMin, dest, limit = 3) {
  const tr = data.transfers;
  const walk = transferInfo(tr, "aoto-bus-to-keisei");
  const trips = ((data.bus && data.bus.trips) || []).map(t => ({ dep: toMin(t.kameariDep), aoto: toMin(t.aotoHigashiArr), service: t.service, busDest: t.dest })).sort((a, b) => a.dep - b.dep);
  const up = ((data.keiseiAotoUp && data.keiseiAotoUp.trains) || []).map(t => ({ dep: toMin(t.time), type: t.type, typeNote: t.typeNote, dest: t.dest, trainNo: t.trainNo, start: t.start })).sort((a, b) => a.dep - b.dep);
  const down = ((data.keiseiAotoDown && data.keiseiAotoDown.trains) || []).map(t => ({ dep: toMin(t.time), type: t.type, typeNote: t.typeNote, dest: t.dest, trainNo: t.trainNo, start: t.start })).sort((a, b) => a.dep - b.dep);
  const shimbashi = byTrainNo(data.asakusaShimbashi), kawasaki = byTrainNo(data.keikyuKawasaki);
  const airMain = byTrainNo(data.airportMain), airSA = byTrainNo(data.airportSA);
  const out = [];
  let i = -1;
  for (const b of trips) {
    i++;
    if (b.dep < depMin) continue;
    const ready = b.aoto + walk.minutes;
    const prev = trips[i - 1] && trips[i - 1].dep >= depMin - 60 ? trips[i - 1] : null;
    const busLeg = { line: "京成バス シャトル☆セブン " + b.service + "（" + b.busDest + "行き）南口1番のりば", from: "亀有駅", dep: b.dep, to: "青砥駅東交差点", arr: b.aoto };
    let train = null, legs = null, tail = [];
    if (dest === "shimbashi") {
      train = up.find(x => x.dep >= ready && shimbashi.has(x.trainNo));
      if (train) tail = [{ line: "京成押上線→都営浅草線直通 " + train.type + "（" + train.dest + "行き）" + (train.typeNote ? "・" + train.typeNote : ""), from: "青砥", dep: train.dep, to: "新橋", arr: shimbashi.get(train.trainNo) }];
    } else if (dest === "kawasaki") {
      train = up.find(x => x.dep >= ready && kawasaki.has(x.trainNo));
      if (train) {
        const kArr = kawasaki.get(train.trainNo), w = transferInfo(tr, "kawasaki-keikyu-to-jr");
        tail = [{ line: "京成押上線→都営浅草線→京急線直通 " + train.type + "（" + train.dest + "行き）", from: "青砥", dep: train.dep, to: "京急川崎", arr: kArr },
                { line: "歩き（" + (w.confirmed ? "" : "未確認・") + w.minutes + "分）", from: "京急川崎", dep: kArr, to: "JR川崎駅", arr: kArr + w.minutes }];
      }
    } else { // narita
      train = down.find(x => x.dep >= ready && x.dest === "成田空港" && x.type !== "スカイライナー" && x.type !== "イブニングライナー" && (airMain.has(x.trainNo) || airSA.has(x.trainNo)));
      if (train) {
        const sa = train.type === "アクセス特急";
        const arr = sa ? airSA.get(train.trainNo) : (airMain.get(train.trainNo) ?? airSA.get(train.trainNo));
        tail = [{ line: "京成" + (sa ? "成田スカイアクセス線経由 " : "本線経由 ") + train.type + "（成田空港行き）", from: "青砥", dep: train.dep, to: "成田空港第2・3ターミナル", arr }];
      }
    }
    if (!train) continue;
    legs = [busLeg, { line: "歩き（" + (walk.confirmed ? "" : "未確認・") + walk.minutes + "分）", from: "青砥駅東交差点", dep: b.aoto, to: "青砥駅ホーム", arr: ready }, ...tail];
    out.push({
      arr: legs[legs.length - 1].arr, dep: b.dep, via: "バスで青砥 → 京成線",
      legs, transfers: [{ station: "青砥", ...walk }],
      bus: b, train, safeBus: prev ? { dep: prev.dep, aoto: prev.aoto } : null,   // 余裕を見るなら1本前のバス
      wait: train.dep - ready,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// =====================================================================
// 各地から亀有へ帰る（新橋・川崎・成田空港）
// =====================================================================
// data に要るもの（無いものは null でよい）:
//  JR: jrRapidDown(642d 常磐線快速 下り), jrDown(641d 千代田線→各停 下り), jrUp(641u 各停 上り),
//      yamanoteInner(630u), keihinNorth(623u), tokaidoUp(101u), utlNorth(295u)
//  駅探: ginzaShimbashiAsakusa(銀座線 新橋 浅草方面), ginzaGinzaAsakusa(銀座 浅草方面),
//        hibiyaGinzaUp, hibiyaHigashiginzaUp, hibiyaMinamisenjuUp(北千住着の目安用),
//        asakusaShimbashiOshiage(浅草線 新橋 押上方面), asakusaHigashiginzaOshiage,
//        keiseiAotoDown(青砥 本線下り: 押上線から直通してくる電車の青砥発), keiseiAotoUpMain(青砥 上野方面), keiseiAotoUp(青砥 押上線上り),
//        keiseiTateishiDown(京成立石 青砥方面: 青砥止まりの着の目安), keiseiNipporiUp(日暮里 上野方面),
//        airport1MainUp, airport1SAUp, airport2MainUp, airport2SAUp, keikyuKawasakiUp
//  bus(tripsToKameari), transfers
export function kameariCandidates(data, origin, depMin, limit = 3) {
  const tr = data.transfers;
  const T = id => transferMin(tr, id);
  const tInfo = (station, id) => ({ station, ...transferInfo(tr, id) });
  const out = [];
  const push = (via, kind, legs, transfers, estimated = false) => {
    const arr = legs[legs.length - 1].arr;
    if (arr === null || arr === undefined) return;
    out.push({ arr, via, kind, legs, transfers, estimated, dep: legs[0].dep });
  };

  // ---- 共通：JRの駅（品川・新橋・東京・上野・日暮里）に着いてから亀有へ ----
  const rapidFrom = {};
  for (const st of ["品川", "新橋", "東京", "上野", "日暮里"]) rapidFrom[st] = jrLegs(data.jrRapidDown, st, "北千住", ["松戸"]).filter(x => x.type !== "特急" && !/^特/.test(x.type) || x.type === "特別快速");
  const chiyodaKitasenju = jrLegs(data.jrDown, "北千住", "亀有");
  const chiyodaNishinippori = jrLegs(data.jrDown, "西日暮里", "亀有");
  const localMatsudo = jrLegs(data.jrUp, "松戸", "亀有");
  function fromJrStation(st, at, legs0, transfers0, estimated) {
    if (st === "西日暮里") {
      const c = after(chiyodaNishinippori, at + T("nishinippori-jr-to-chiyoda"));
      if (c) push(legs0.length ? legs0[0].line.split("（")[0] + " → 西日暮里で千代田線" : "西日暮里で千代田線", "jr", [...legs0, { line: "千代田線（" + c.dest + "行き）", from: "西日暮里", dep: c.dep, to: "亀有", arr: c.arr }], [...transfers0, tInfo("西日暮里", "nishinippori-jr-to-chiyoda")], estimated);
      return;
    }
    const tid = { "品川": "shinagawa-tokaido-to-joban", "新橋": "shimbashi-jr-to-joban", "東京": "tokyo-jr-to-joban", "上野": "ueno-jr-to-joban", "日暮里": "nippori-jr-to-joban" }[st];
    const r = after(rapidFrom[st] || [], at + (legs0.length ? T(tid) : 0));
    if (!r) return;
    const head = legs0.length ? legs0[0].line.split("（")[0] + ` → ${st}で常磐線` : "常磐線（上野東京ライン直通）";
    const leg1 = { line: "常磐線 " + r.type + "（" + r.dest + "行き）", from: st, dep: r.dep, to: "北千住", arr: r.arr };
    const trs = legs0.length ? [...transfers0, tInfo(st, tid)] : [...transfers0];
    const c1 = after(chiyodaKitasenju, r.arr + T("kitasenju-jr-to-chiyoda"));
    if (c1) push(head + " → 北千住で千代田線", "jr", [...legs0, leg1, { line: "千代田線（" + c1.dest + "行き）", from: "北千住", dep: c1.dep, to: "亀有", arr: c1.arr }], [...trs, tInfo("北千住", "kitasenju-jr-to-chiyoda")], estimated);
    if (r.松戸 !== null) {
      const c2 = after(localMatsudo, r.松戸 + T("matsudo-jr-to-local"));
      if (c2) push(head + " → 松戸で各駅停車に折り返し", "jr", [...legs0, { ...leg1, to: "松戸", arr: r.松戸 }, { line: "常磐線各駅停車 上り", from: "松戸", dep: c2.dep, to: "亀有", arr: c2.arr }], [...trs, tInfo("松戸", "matsudo-jr-to-local")], estimated);
    }
  }
  // ---- 共通：青砥に着いてからバスで亀有駅へ ----
  const busTrips = ((data.bus && data.bus.tripsToKameari) || []).map(b => ({ dep: toMin(b.aotoHigashiDep), arr: toMin(b.kameariArr), service: b.service, origin: b.origin })).sort((a, b) => a.dep - b.dep);
  function fromAoto(at, legs0, transfers0, estimated) {
    const walk = transferInfo(tr, "aoto-keisei-to-bus");
    const b = after(busTrips, at + walk.minutes);
    if (!b) return;
    push(legs0[0].line.split("（")[0] + " → 青砥からバス", "bus", [...legs0, { line: "歩き（" + (walk.confirmed ? "" : "未確認・") + walk.minutes + "分）", from: "青砥", dep: at, to: "青砥駅東交差点 バス停", arr: at + walk.minutes }, { line: "京成バス シャトル☆セブン " + b.service + "（" + b.origin + "から来る亀有駅行き）", from: "青砥駅東交差点", dep: b.dep, to: "亀有駅", arr: b.arr }], [...transfers0, { station: "青砥", ...walk }], estimated);
  }
  // 青砥に着く時刻：押上線から来る電車は、本線下りの青砥発（直通）か、青砥止まりなら京成立石発+3分（目安）
  const aotoDownMap = byTrainNo(data.keiseiAotoDown), tateishiMap = byTrainNo(data.keiseiTateishiDown);
  const aotoArrFromOshiage = t => aotoDownMap.has(t.trainNo) ? [aotoDownMap.get(t.trainNo), false] : (tateishiMap.has(t.trainNo) ? [tateishiMap.get(t.trainNo) + 3, true] : [null, false]);

  const ekList = d => ((d && d.trains) || []).map(t => ({ dep: toMin(t.time), type: t.type, typeNote: t.typeNote, dest: t.dest, trainNo: t.trainNo })).sort((a, b) => a.dep - b.dep);

  if (origin === "shimbashi") {
    fromJrStation("新橋", depMin, [], [], false);
    // 山手線内回り・京浜東北線北行で 上野・日暮里・西日暮里へ
    for (const [name, table] of [["山手線 内回り", data.yamanoteInner], ["京浜東北線 北行", data.keihinNorth]]) {
      for (const st of ["上野", "日暮里", "西日暮里"]) {
        const y = after(jrLegs(table, "新橋", st), depMin);
        if (y) fromJrStation(st, y.arr, [{ line: name + "（新橋から）", from: "新橋", dep: y.dep, to: st, arr: y.arr }], [], false);
      }
    }
    // 銀座線→銀座→日比谷線／浅草線→東銀座→日比谷線 → 北千住 → 千代田線
    const minamiMap = byTrainNo(data.hibiyaMinamisenjuUp);
    for (const [name, list, stMap, st, hibList, tid1, tid2] of [
      ["銀座線（浅草方面）", ekList(data.ginzaShimbashiAsakusa), byTrainNo(data.ginzaGinzaAsakusa), "銀座", ekList(data.hibiyaGinzaUp), "ginza-ginza-to-hibiya", null],
      ["都営浅草線（押上方面）", ekList(data.asakusaShimbashiOshiage), byTrainNo(data.asakusaHigashiginzaOshiage), "東銀座", ekList(data.hibiyaHigashiginzaUp), "higashiginza-asakusa-to-hibiya", null]]) {
      const g = after(list, depMin);
      const gArr = g && stMap.get(g.trainNo);
      if (!g || gArr === undefined) continue;
      const h = after(hibList.filter(x => x.dest === "北千住" || !["南千住", "中目黒", "六本木", "広尾", "霞ケ関", "八丁堀", "上野"].includes(x.dest)), gArr + T(tid1));
      if (!h || !minamiMap.has(h.trainNo)) continue;
      const ksArr = minamiMap.get(h.trainNo) + 2;
      const c = after(chiyodaKitasenju, ksArr + T("kitasenju-hibiya-to-chiyoda"));
      if (c) push(`${name.split("（")[0]} → ${st}で日比谷線 → 北千住で千代田線`, "metro", [
        { line: name + "（新橋から）", from: "新橋", dep: g.dep, to: st, arr: gArr },
        { line: "日比谷線（" + h.dest + "行き）", from: st, dep: h.dep, to: "北千住", arr: ksArr },
        { line: "千代田線（" + c.dest + "行き）", from: "北千住", dep: c.dep, to: "亀有", arr: c.arr }],
        [tInfo(st, tid1), tInfo("北千住", "kitasenju-hibiya-to-chiyoda")], true);
    }
    // 浅草線→押上線直通で青砥→バス
    for (const t of ekList(data.asakusaShimbashiOshiage).filter(x => x.dep >= depMin && x.dest !== "押上").slice(0, 3)) {
      const [aArr, est] = aotoArrFromOshiage(t);
      if (aArr === null) continue;
      fromAoto(aArr, [{ line: "都営浅草線→京成押上線直通 " + t.type + "（" + t.dest + "行き）", from: "新橋", dep: t.dep, to: "青砥", arr: aArr }], [], est);
    }
  }

  if (origin === "kawasaki") {
    // JR: 東海道線上り・上野東京ライン北行・京浜東北線北行で 品川／新橋／東京／上野／日暮里／西日暮里 へ
    for (const [name, table, stations] of [["東海道線 上り", data.tokaidoUp, ["品川", "新橋", "東京", "上野"]], ["上野東京ライン 北行", data.utlNorth, ["品川", "新橋", "東京", "上野"]], ["京浜東北線 北行", data.keihinNorth, ["品川", "新橋", "東京", "上野", "日暮里", "西日暮里"]]]) {
      for (const st of stations) {
        const y = after(jrLegs(table, "川崎", st).filter(x => !/^特急|^快速 |踊り子|湘南/.test(x.type) && x.type !== "特急"), depMin);
        if (y) fromJrStation(st, y.arr, [{ line: name + " " + y.type + "（" + y.dest + "行き）", from: "川崎", dep: y.dep, to: st, arr: y.arr }], [], false);
      }
    }
    // 京急：京急川崎から都営浅草線・京成押上線直通で青砥→バス
    for (const t of ekList(data.keikyuKawasakiUp).filter(x => x.dep >= depMin && ["青砥", "京成高砂", "印旛日本医大", "成田空港", "印西牧の原", "芝山千代田", "京成佐倉", "京成成田"].includes(x.dest)).slice(0, 3)) {
      const [aArr, est] = aotoArrFromOshiage(t);
      if (aArr === null) continue;
      fromAoto(aArr, [{ line: "京急線→都営浅草線→京成押上線直通 " + t.type + "（" + t.dest + "行き）", from: "京急川崎", dep: t.dep, to: "青砥", arr: aArr }], [], est);
    }
  }

  if (origin === "narita1" || origin === "narita2") {
    const stName = origin === "narita1" ? "成田空港第1ターミナル" : "成田空港第2・3ターミナル";
    const mainList = ekList(origin === "narita1" ? data.airport1MainUp : data.airport2MainUp).filter(x => !/ライナー/.test(x.type));
    const saList = ekList(origin === "narita1" ? data.airport1SAUp : data.airport2SAUp).filter(x => !/ライナー/.test(x.type));
    const aotoUpMain = byTrainNo(data.keiseiAotoUpMain), aotoUpOshiage = byTrainNo(data.keiseiAotoUp), nipporiMap = byTrainNo(data.keiseiNipporiUp);
    for (const [name, list] of [["京成本線経由", mainList], ["成田スカイアクセス線経由", saList]]) {
      for (const t of list.filter(x => x.dep >= depMin).slice(0, 4)) {
        const aArr = aotoUpMain.get(t.trainNo) ?? aotoUpOshiage.get(t.trainNo);
        const leg = { line: "京成 " + name + " " + t.type + "（" + t.dest + "行き）", from: stName, dep: t.dep, to: "青砥", arr: aArr };
        if (aArr !== undefined) fromAoto(aArr, [leg], [], false);
        const nArr = nipporiMap.get(t.trainNo);
        if (nArr !== undefined) fromJrStation("日暮里", nArr, [{ ...leg, to: "日暮里", arr: nArr }], [], false);
      }
    }
  }

  // 早く着く順。同じ着時刻なら出発が遅いほう、同じなら乗り換えが少ないほう。同じ出発・同じ着の候補は1つにまとめる
  out.sort((a, b) => a.arr - b.arr || b.dep - a.dep || a.legs.length - b.legs.length);
  const seen = new Set(), res = [];
  for (const c of out) {
    const key = c.dep + "@" + c.arr;
    if (seen.has(key)) continue;
    seen.add(key); res.push(c);
    if (res.length >= limit) break;
  }
  // 川崎・成田は「JR経由」と「バス経由」の両方を必ず1つは見せる
  for (const kind of ["jr", "bus"]) {
    if (!res.some(c => c.kind === kind)) {
      const best = out.find(c => c.kind === kind);
      if (best) res.push({ ...best, extra: true });
    }
  }
  return res;
}
