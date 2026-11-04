// 亀有の達人 ― 計算の中身（画面とは切り離した純粋な計算だけ）
// ブラウザ（app.js）と、テスト（tests/）の両方から同じものを使う。

// ---- 時刻の扱い ----
// "H:MM" / "HH:MM" → 0:00 からの分。深夜 0〜3 時台は翌日扱い（+24時間）で、終電まで順番が崩れないようにする。
export function toMin(t) {
  t = String(t).replace(/[^0-9:]/g, "");
  let [h, mi] = t.split(":").map(Number);
  if (h < 4) h += 24;
  return h * 60 + mi;
}
// 分 → "H:MM"
export function fmt(x) {
  x = ((x % 1440) + 1440) % 1440;
  return Math.floor(x / 60) + ":" + String(x % 60).padStart(2, "0");
}
// 分 → <input type=time> 用の "HH:MM"
export function toInput(x) {
  x = ((x % 1440) + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0");
}

// ---- 平日／土休日の判定 ----
// date: Date。深夜 0〜3 時台は前の日のダイヤとして扱う。
// holidays: data/holidays.json の中身 { holidays:[...], yearEndNewYear:[...] }
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

// ---- 行き（亀有 → 綾瀬で始発に乗り換え） ----
// 千代田線の駅と、綾瀬発車からの所要分（平日昼の目安、±1分）
export const DEST = [["北千住", 4], ["町屋", 7], ["西日暮里", 10], ["千駄木", 11], ["根津", 14], ["湯島", 15], ["新御茶ノ水", 18], ["大手町", 20], ["二重橋前", 21], ["日比谷", 23], ["霞ケ関", 26], ["国会議事堂前", 27], ["赤坂", 29], ["乃木坂", 31], ["表参道", 34], ["明治神宮前", 36], ["代々木公園", 38], ["代々木上原", 39]];
// 途中駅止まりの印（この駅より先へは行かない）
export const TERM = { "霞": "霞ケ関", "明": "明治神宮前" };
// 行先の略 → 正式な駅名
export const DESTNAME = { "": "代々木上原", "成": "成城学園前", "向": "向ヶ丘遊園", "明": "明治神宮前", "相": "相模大野", "伊": "伊勢原", "唐": "唐木田", "霞": "霞ケ関", "本": "本厚木" };

// iki: data/iki-ayase-v1.json の中身。kind: "wd"|"hd"。depMin: 亀有を出る時刻（分）。destIndex: DEST の番号。
// 返り値: 候補の配列（早い順、最大 limit 件）
export function ikiCandidates(iki, kind, depMin, destIndex, limit = 3) {
  const [destName, destMin] = DEST[destIndex];
  const out = [];
  for (const r of iki[kind]) {
    const ka = toMin(r[0]);
    if (ka < depMin) continue;
    const mark = r[2] || "";
    const term = mark.slice(-1);
    if (TERM[term]) {
      const ti = DEST.findIndex(x => x[0] === TERM[term]);
      if (destIndex > ti) continue; // その電車は目的地まで行かへん
    }
    const ay = toMin(r[1]);
    let origin, type = "", dest;
    if (kind === "hd") {
      origin = mark.includes("●") ? "綾瀬始発" : "北綾瀬始発";
      dest = "";
    } else {
      type = mark.includes("急行") ? "急行" : mark.includes("準急") ? "準急" : "";
      origin = (iki.kitaWd || []).includes(r[1]) ? "北綾瀬始発" : "綾瀬始発";
      dest = DESTNAME[mark.replace(/急行|準急/, "")] || "";
    }
    out.push({
      kameariDep: ka, ayaseDep: ay, origin, type, dest,
      wait: ay - ka,              // 亀有発から綾瀬発までの分（移動4分込み）
      destName, destArr: ay + destMin,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---- 帰り（品川始発 → 北千住乗り換え／松戸折り返し） ----
// kaeri: data/kaeri-shinagawa-v1.json の中身。arrMin: 品川に着く時刻（分）。
export function kaeriCandidates(kaeri, kind, arrMin, limit = 3) {
  const out = [];
  for (const r of kaeri[kind]) {
    const sd = toMin(r[0]);
    if (sd < arrMin) continue;
    const [, typ, ksa, chi, k1, mta, mtd, k2] = r;
    const chiT = chi.match(/\d+:\d+/)[0];
    const chiD = chi.replace(/[\d:]/g, "");
    const chiDest = { "柏": "柏行き", "我": "我孫子行き", "取": "取手行き", "松": "松戸行き", "": "亀有方面" }[chiD] || "";
    const est = mta.includes("推");
    const t1 = toMin(chiT) - toMin(ksa), t2 = toMin(mtd) - toMin(mta);
    out.push({
      shinagawaDep: sd, type: typ, typeName: { "普通": "普通", "快速": "快速", "特快": "特別快速" }[typ] || typ,
      kitasenjuArr: toMin(ksa), chiyodaDep: toMin(chiT), chiyodaDest: chiDest,
      kameari1: toMin(k1), transfer1: t1, tight1: t1 <= 1,
      matsudoArr: toMin(mta), matsudoEst: est, matsudoDep: toMin(mtd),
      kameari2: toMin(k2), transfer2: t2, tight2: t2 <= 1,
    });
    if (out.length >= limit) break;
  }
  return out;
}
