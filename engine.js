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
