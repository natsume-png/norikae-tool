// 亀有の達人 ― 答え合わせテスト。 npm test で動く。
// 1つでも落ちたら公開版は入れ替えへん（.github/workflows/pages.yml がそうなっている）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { toMin, fmt, dayKind, DEST, ikiCandidates, kaeriCandidates, isTime, runsNormally } from "../engine.js";

const load = f => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url), "utf8"));
const KINDS = { wd: "weekday", hd: "holiday" };
const D = {};
for (const [kind, k] of Object.entries(KINDS)) {
  D[kind] = {
    jrUp: load(`jr-joban-local-up-${k}.json`),
    jrDown: load(`jr-joban-local-down-${k}.json`),
    shinagawa: load(`jr-shinagawa-joban-${k}.json`),
    ayase: load(`ekitan-metro-chiyoda-ayase-${k}.json`),
    transfers: load("transfers.json"),
  };
}
const holidays = load("holidays.json");
const v1 = JSON.parse(readFileSync(new URL("./fixtures/data-v1.json", import.meta.url), "utf8"));
const HIBIYA = DEST.findIndex(d => d[0] === "日比谷");

// ---- 1. 答え合わせ（2026年10月版で正しいと確認済みの5件。版が変わったら新しい時刻表で確かめ直す）----
test("帰り 平日 品川15:35（普通）→北千住16:02着→16:06発 我孫子行き→亀有16:13、②松戸16:11着→16:19発→亀有16:25", () => {
  const c = kaeriCandidates(D.wd, toMin("15:35"), 1)[0];
  assert.equal(fmt(c.shinagawaDep), "15:35");
  assert.equal(c.typeName, "普通");
  assert.equal(fmt(c.kitasenjuArr), "16:02");
  assert.equal(fmt(c.chiyodaDep), "16:06");
  assert.equal(c.chiyodaDest, "我孫子行き");
  assert.equal(fmt(c.kameari1), "16:13");
  assert.equal(fmt(c.matsudoArr), "16:11");
  assert.equal(fmt(c.matsudoDep), "16:19");
  assert.equal(fmt(c.kameari2), "16:25");
});
test("帰り 平日 品川15:55（特別快速）→②松戸16:27着→16:28発→亀有16:34（ギリギリ）", () => {
  const c = kaeriCandidates(D.wd, toMin("15:55"), 1)[0];
  assert.equal(fmt(c.shinagawaDep), "15:55");
  assert.equal(c.typeName, "特別快速");
  assert.equal(fmt(c.matsudoArr), "16:27");
  assert.equal(fmt(c.matsudoDep), "16:28");
  assert.equal(fmt(c.kameari2), "16:34");
  assert.equal(c.tight2, true);
  assert.ok(c.missed2 && fmt(c.missed2.dep) === "16:38" && fmt(c.missed2.arr) === "16:44", JSON.stringify(c.missed2));
});
test("乗り換えは北千住・松戸が1分以上、ほかは2分以上。5分以内なら「間に合わなかったら次」が付く", () => {
  for (const kind of ["wd", "hd"]) {
    for (const c of kaeriCandidates(D[kind], 0, 9999)) {
      if (c.kameari1 !== null) { assert.ok(c.transfer1 >= 1, `${kind} ${fmt(c.shinagawaDep)} ①${c.transfer1}分`); if (c.transfer1 <= 5) assert.ok(c.missed1 === null || c.missed1.dep > c.chiyodaDep); }
      if (c.kameari2 !== null) { assert.ok(c.transfer2 >= 1, `${kind} ${fmt(c.shinagawaDep)} ②${c.transfer2}分`); if (c.transfer2 <= 5) assert.ok(c.missed2 === null || c.missed2.dep > c.matsudoDep); }
    }
  }
  // 品川15:35: 北千住16:02着→16:06発（4分）→ 間に合わなかったら次は 16:16発→亀有16:23
  const c = kaeriCandidates(D.wd, toMin("15:35"), 1)[0];
  assert.equal(c.transfer1, 4);
  assert.ok(c.missed1 && fmt(c.missed1.dep) === "16:16" && fmt(c.missed1.arr) === "16:23", JSON.stringify(c.missed1));
});
test("行き 平日 亀有8:49発→綾瀬8:56発（綾瀬始発・向ヶ丘遊園行き）", () => {
  const c = ikiCandidates(D.wd, toMin("8:49"), HIBIYA, 1)[0];
  assert.equal(fmt(c.kameariDep), "8:49");
  assert.equal(fmt(c.ayaseDep), "8:56");
  assert.equal(c.origin, "綾瀬始発");
  assert.equal(c.dest, "向ヶ丘遊園");
});
test("行き 平日 亀有12:14発→綾瀬12:23発（北綾瀬始発・代々木上原行き）", () => {
  const c = ikiCandidates(D.wd, toMin("12:14"), HIBIYA, 1)[0];
  assert.equal(fmt(c.kameariDep), "12:14");
  assert.equal(fmt(c.ayaseDep), "12:23");
  assert.equal(c.origin, "北綾瀬始発");
  assert.equal(c.dest, "代々木上原");
});
test("行き 土休日 亀有7:49発→綾瀬8:09発（綾瀬始発）", () => {
  const c = ikiCandidates(D.hd, toMin("7:49"), HIBIYA, 1)[0];
  assert.equal(fmt(c.kameariDep), "7:49");
  assert.equal(fmt(c.ayaseDep), "8:09");
  assert.equal(c.origin, "綾瀬始発");
});
test("平日19:16〜21:02の亀有発は綾瀬で乗れる始発がなく、次は21:11", () => {
  const rows = ikiCandidates(D.wd, toMin("19:16"), HIBIYA, 999).filter(c => c.kameariDep <= toMin("21:02"));
  assert.ok(rows.length >= 20, "この時間帯の亀有発が少なすぎる: " + rows.length);
  for (const c of rows) assert.equal(fmt(c.ayaseDep), "21:11", fmt(c.kameariDep) + " 発の綾瀬始発");
});

// ---- 2. 時刻が駅の順に増えていくか ----
test("行き：亀有発の順に並び、綾瀬着は亀有発+3〜4分、綾瀬発（始発）は綾瀬着以降", () => {
  for (const kind of ["wd", "hd"]) {
    let prev = -1;
    for (const c of ikiCandidates(D[kind], 0, 0, 9999)) {
      const s = fmt(c.kameariDep);
      assert.ok(c.kameariDep >= prev, `${kind} ${s} が順番どおりやない`);
      assert.ok(c.ayaseArr - c.kameariDep >= 3 && c.ayaseArr - c.kameariDep <= 4, `${kind} ${s} 綾瀬着 ${fmt(c.ayaseArr)}`);
      if (c.ayaseDep !== null) assert.ok(c.ayaseDep >= c.ayaseArr, `${kind} ${s} 綾瀬発 ${fmt(c.ayaseDep)} が着より前`);
      prev = c.kameariDep;
    }
  }
});
test("帰り：品川発<北千住着<=千代田線発<亀有①、北千住着<松戸着<=松戸発<亀有②、乗り換えは1分以上", () => {
  for (const kind of ["wd", "hd"]) {
    let prev = -1, n = 0;
    for (const c of kaeriCandidates(D[kind], 0, 9999)) {
      const s = fmt(c.shinagawaDep);
      n++;
      assert.ok(c.shinagawaDep >= prev, `${kind} ${s} が順番どおりやない`);
      assert.ok(c.shinagawaDep < c.kitasenjuArr, `${kind} ${s} 北千住着`);
      assert.ok(c.kitasenjuArr < c.matsudoArr, `${kind} ${s} 松戸着`);
      if (c.kameari1 !== null) {
        assert.ok(c.kitasenjuArr < c.chiyodaDep && c.chiyodaDep < c.kameari1, `${kind} ${s} ①`);
        assert.ok(c.transfer1 >= 1, `${kind} ${s} ①乗り換え`);
      }
      if (c.kameari2 !== null) {
        assert.ok(c.matsudoArr < c.matsudoDep && c.matsudoDep < c.kameari2, `${kind} ${s} ②`);
        assert.ok(c.transfer2 >= 1, `${kind} ${s} ②乗り換え`);
      }
      prev = c.shinagawaDep;
    }
    assert.ok(n >= 40, `${kind} の品川始発（普通・快速・特快）が少なすぎる: ${n}`);
  }
});
test("JRの表：同じ電車の時刻が駅の順に増えていく", () => {
  for (const kind of ["wd", "hd"]) {
    for (const [name, d] of [["上り", D[kind].jrUp], ["下り", D[kind].jrDown]]) {
      for (const t of d.trains) {
        let prev = -1;
        for (const st of d.stations) {
          const v = t.times[st] ?? t.times[st + "着"];
          if (!isTime(v)) continue;
          const m = toMin(v);
          assert.ok(m >= prev, `${kind} ${name} ${t.no} ${st} ${v} が前の駅より早い`);
          prev = m;
        }
      }
    }
    for (const t of D[kind].shinagawa.trains) {
      let prev = -1;
      for (const s of t.stops) for (const v of [s.arr, s.dep]) {
        if (!v) continue;
        assert.ok(toMin(v) >= prev, `${kind} 品川${t.shinagawaDep} ${s.station} ${v}`);
        prev = toMin(v);
      }
    }
  }
});

// ---- 3. 前の版（v1）と大きく食い違わないか ----
// 前の版は「北千住着＝発車時刻」「松戸着＝北千住発＋7〜9分の推定」で計算していた。今の版は公式の着時刻を使うので、
// 数分の違いは正しい方向の違い。ここで見るのは「列がずれた」「全然違う電車を拾った」のような大きな食い違いだけ。
function diffs(kind) {
  const rows = kaeriCandidates(D[kind], 0, 9999);
  const byDep = new Map(rows.map(c => [fmt(c.shinagawaDep), c]));
  const out = { missing: [], far: [], same: 0, changed: [] };
  for (const o of v1.ret[kind]) {
    const c = byDep.get(fmt(toMin(o[0])));
    if (!c) { out.missing.push(o[0]); continue; }
    const est = o[5].includes("推");   // 前の版で松戸着が推定だった行（快速）は、ずれが大きくてもよい
    const pairs = [["北千住着", c.kitasenjuArr, o[2], 4], ["千代田線発", c.chiyodaDep, o[3], 12], ["亀有①", c.kameari1, o[4], 12], ["松戸着", c.matsudoArr, o[5], est ? 8 : 4], ["松戸発", c.matsudoDep, o[6], est ? 14 : 12], ["亀有②", c.kameari2, o[7], est ? 14 : 12]];
    const bad = pairs.filter(([, a, b, tol]) => a === null || Math.abs(a - toMin(b)) > tol);
    const small = pairs.filter(([, a, b]) => a !== null && a !== toMin(b));
    const line = `${o[0]}: ${pairs.map(([n, a, b]) => n + " " + (a === null ? "—" : fmt(a)) + "(前:" + b.replace(/[^\d:]/g, "") + ")").join(" ")}`;
    if (bad.length) out.far.push(line);
    else if (small.length) { out.changed.push(line); out.same++; }
    else out.same++;
  }
  return out;
}
test("帰り：前の版と品川始発の本数が同じで、北千住着・松戸着は4分以内、亀有着は12分以内の違い", () => {
  for (const kind of ["wd", "hd"]) {
    const d = diffs(kind);
    const total = v1.ret[kind].length;
    console.log(`  ${kind}: 前の版 ${total} 行のうち、同じか小さな違い ${d.same}、品川発が無い ${d.missing.length} ${JSON.stringify(d.missing)}、大きな違い ${d.far.length} ${JSON.stringify(d.far)}`);
    console.log(`  ${kind}: 小さな違い（着時刻が正確になった分）: ${d.changed.length} 行\n    ${d.changed.join("\n    ")}`);
    assert.ok(d.missing.length <= 2, `${kind}: 前の版にあった品川発が無い: ${d.missing}`);
    assert.equal(d.far.length, 0, `${kind}: 大きな違い ${d.far.join(" / ")}`);
  }
});
test("行き 平日：前の版の各行（亀有発→綾瀬の始発）と9割以上一致", () => {
  let same = 0, bad = [];
  for (const [ka, ay] of v1.iki.wd) {
    const c = ikiCandidates(D.wd, toMin(ka), HIBIYA, 1)[0];
    if (c && fmt(c.kameariDep) === fmt(toMin(ka)) && c.ayaseDep !== null && fmt(c.ayaseDep) === fmt(toMin(ay))) same++;
    else bad.push(`${ka}→${ay} が ${c ? fmt(c.kameariDep) + "→" + (c.ayaseDep === null ? "なし" : fmt(c.ayaseDep)) : "無"}`);
  }
  console.log(`  wd 行き: 一致 ${same}/${v1.iki.wd.length}、違い ${JSON.stringify(bad)}`);
  assert.ok(same >= v1.iki.wd.length * 0.9, "前の版と合う行が少なすぎる");
});

// ---- 4. データの出典・取り込み日・版が書いてあるか ----
test("data/ の各ファイルに meta（出典URL・取り込んだ日・版）がある", () => {
  const files = readdirSync(new URL("../data/", import.meta.url)).filter(f => f.endsWith(".json"));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const d = load(f);
    assert.ok(d.meta && d.meta.imported, f + ": imported");
    assert.ok(Array.isArray(d.meta.sources) && d.meta.sources.length, f + ": sources");
    for (const s of d.meta.sources) assert.ok(s.name && "url" in s && s.version, f + ": source " + JSON.stringify(s));
  }
});

// ---- 5. 平日／土休日の判定など ----
test("曜日・祝日・年末年始の判定", () => {
  assert.equal(dayKind(new Date(2026, 10, 4, 12), holidays), "wd"); // 2026-11-04 水
  assert.equal(dayKind(new Date(2026, 10, 7, 12), holidays), "hd"); // 土
  assert.equal(dayKind(new Date(2026, 10, 23, 12), holidays), "hd"); // 勤労感謝の日
  assert.equal(dayKind(new Date(2026, 11, 31, 12), holidays), "hd"); // 12/31
  assert.equal(dayKind(new Date(2026, 10, 9, 2), holidays), "hd"); // 月曜の深夜2時は日曜のダイヤ
  assert.equal(DEST.length, 18);
  assert.equal(runsNormally("平日"), true);
  assert.equal(runsNormally("１２月２９～３１日運転"), false);
});

// ---- 6. 新橋・青砥経由 ----
import { shimbashiCandidates, aotoCandidates } from "../engine.js";
import { existsSync } from "node:fs";
const loadOpt = f => existsSync(new URL("../data/" + f, import.meta.url)) ? load(f) : null;
const transfers = load("transfers.json"), bus = load("bus-shuttle-seven.json"), busKeisei = load("bus-keiseibus-kameari.json");
function fullData(k) {
  return {
    ...D[k === "weekday" ? "wd" : "hd"], transfers, bus, busKeisei, dayKind: k,
    jrRapidUp: load(`jr-joban-rapid-up-${k}.json`), yamanote: load(`jr-yamanote-outer-${k}.json`), keihin: load(`jr-keihintohoku-south-${k}.json`),
    kitasenjuUp: loadOpt(`ekitan-metro-chiyoda-kitasenju-up-${k}.json`), hibiyaKitasenju: loadOpt(`ekitan-metro-hibiya-kitasenju-${k}.json`),
    hibiyaGinza: loadOpt(`ekitan-metro-hibiya-ginza-${k}.json`), hibiyaHigashiginza: loadOpt(`ekitan-metro-hibiya-higashiginza-${k}.json`),
    ginzaGinza: loadOpt(`ekitan-metro-ginza-ginza-shibuya-${k}.json`), ginzaShimbashiShibuya: loadOpt(`ekitan-metro-ginza-shimbashi-shibuya-${k}.json`),
    ginzaTameike: loadOpt(`ekitan-metro-ginza-tameike-asakusa-${k}.json`), ginzaShimbashiAsakusa: loadOpt(`ekitan-metro-ginza-shimbashi-asakusa-${k}.json`),
    asakusaHigashiginza: loadOpt(`ekitan-toei-asakusa-higashiginza-nishimagome-${k}.json`), asakusaShimbashi: loadOpt(`ekitan-toei-asakusa-shimbashi-nishimagome-${k}.json`),
    keiseiAotoUp: loadOpt(`ekitan-keisei-oshiage-aoto-up-${k}.json`), keiseiAotoDown: loadOpt(`ekitan-keisei-main-aoto-down-${k}.json`),
    keikyuKawasaki: loadOpt(`ekitan-keikyu-kawasaki-down-${k}.json`), airportMain: loadOpt(`ekitan-keisei-main-airport2-down-${k}.json`), airportSA: loadOpt(`ekitan-keisei-sa-airport2-down-${k}.json`),
  };
}
test("新橋：各候補の時刻が順に増え、乗り換えの分数を守り、30〜70分で着く（平日・土休日）", () => {
  for (const k of ["weekday", "holiday"]) {
    const data = fullData(k);
    for (const t of ["6:30", "8:00", "9:30", "12:14", "15:00", "17:30", "20:00", "22:30"]) {
      const rows = shimbashiCandidates(data, toMin(t), 3);
      assert.ok(rows.length >= 1, `${k} ${t}: 候補なし`);
      let prevArr = -1;
      for (const c of rows) {
        assert.ok(c.arr >= prevArr, `${k} ${t}: 早い順やない`);
        prevArr = c.arr;
        let cur = c.legs[0].dep;
        for (const l of c.legs) {
          assert.ok(l.dep >= cur, `${k} ${t} ${c.via}: ${l.from} 発 ${fmt(l.dep)} が前より早い`);
          assert.ok(l.arr >= l.dep, `${k} ${t} ${c.via}: ${l.from}→${l.to} 着が発より早い`);
          cur = l.arr;
        }
        const total = c.arr - c.dep;
        assert.ok(total >= 25 && total <= 75, `${k} ${t} ${c.via}: 所要 ${total} 分は変`);
        for (let i = 1; i < c.legs.length; i++) {
          const l = c.legs[i];
          if (l.walk) continue;
          assert.equal(l.gap, l.dep - c.legs[i - 1].arr);
          if (!l.afterWalk) assert.ok(l.gap >= l.tmin && l.gap >= 1, `${k} ${t} ${c.via}: ${l.from} の乗り換え ${l.gap} 分 < ${l.tmin}`);
          if (!l.afterWalk && !["北千住", "松戸", "綾瀬"].includes(l.from)) assert.ok(l.gap >= 2, `${k} ${t} ${c.via}: ${l.from} は2分以上のはず`);
          if (l.gap <= 5 && l.ifMissed) assert.ok(l.ifMissed.dep > l.dep && l.ifMissed.arr >= c.arr, `${k} ${t} ${c.via}: 間に合わなかったときの次が変`);
        }
      }
    }
  }
});
// 山手線と京浜東北線は同じホームなので「先に来たほう」に乗る。間に合わなかったときの次も、両方の線のうち早いほう（夏目さん 2026-11-05）
const SAME_PLATFORM = ["日暮里", "上野", "西日暮里"];
function jrBoth(data, tables, a, b) {   // 2つの線の表から「a発→b」を1つの一覧に
  const out = [];
  for (const [name, table] of tables) for (const t of table.trains) {
    if (!runsNormally(t.days) || !isTime(t.times[a])) continue;
    const arr = t.times[b] || t.times[b + "着"];
    if (!isTime(arr)) continue;
    out.push({ name, dep: toMin(t.times[a]), arr: toMin(arr) });
  }
  return out.sort((x, y) => x.dep - y.dep || x.arr - y.arr);
}
test("新橋 行き：日暮里・上野・西日暮里では山手線と京浜東北線の先に来たほうに乗り、間に合わなかったときの次も両方の線から探す", () => {
  const data = fullData("weekday");
  const tables = [["山手線 外回り", data.yamanote], ["京浜東北線 南行", data.keihin]];
  let checked = 0, altOther = 0;
  for (const t of ["7:00", "8:00", "9:30", "12:14", "15:00", "17:30", "20:00"]) {
    const rows = shimbashiCandidates(data, toMin(t), 10);
    assert.ok(rows.every(c => !/で山手線 外回り$|で京浜東北線 南行$/.test(c.via)), `${t}: 線ごとに別の候補になっとる`);
    for (const c of rows) {
      const i = c.legs.findIndex(l => SAME_PLATFORM.includes(l.from) && l.to === "新橋");
      if (i < 0) continue;
      const l = c.legs[i], prev = c.legs[i - 1];
      const both = jrBoth(data, tables, l.from, "新橋").filter(x => x.dep >= prev.arr + l.tmin);
      assert.ok(["山手線 外回り", "京浜東北線 南行"].includes(l.line), `${t} ${c.via}: 線の名前が変 ${l.line}`);
      // 乗る電車＝両方の線のうち、いちばん早く新橋に着くもの
      const bestArr = Math.min(...both.map(x => x.arr));
      assert.equal(l.arr, bestArr, `${t} ${c.via}: ${l.from} で先に着く電車に乗ってへん`);
      if (l.ifMissed) {
        const next = both.filter(x => x.dep > l.dep);
        const nextBest = Math.min(...next.map(x => x.arr));
        assert.equal(l.ifMissed.arr, nextBest, `${t} ${c.via}: 間に合わなかったときの次が、両方の線のうち早いほうやない`);
        assert.ok(l.ifMissed.line, "次の電車の線の名前が無い");
        if (l.ifMissed.line !== l.line) altOther++;
      }
      checked++;
    }
  }
  assert.ok(checked >= 5, `確かめた区間が少ない: ${checked}`);
  assert.ok(altOther >= 1, "「次は別の線」になる例が1つも無い（山手線と京浜東北線が混ざってへん？）");
});
test("新橋 帰り：新橋からの山手線内回りと京浜東北線北行も1つの一覧（先に来たほう）", () => {
  const data = homeData("weekday");
  const tables = [["山手線 内回り", data.yamanoteInner], ["京浜東北線 北行", data.keihinNorth]];
  let checked = 0;
  for (const t of ["8:00", "12:14", "17:30", "21:00"]) {
    const rows = kameariCandidates(data, "shimbashi", toMin(t), 10);
    assert.ok(rows.every(c => !/^山手線 内回り|^京浜東北線 北行/.test(c.via)), `${t}: 線ごとに別の候補になっとる`);
    for (const c of rows) {
      const l = c.legs[0];
      if (l.from !== "新橋" || !SAME_PLATFORM.includes(l.to)) continue;
      const both = jrBoth(data, tables, "新橋", l.to).filter(x => x.dep >= toMin(t));
      assert.equal(l.arr, Math.min(...both.map(x => x.arr)), `${t} ${c.via}: 新橋で先に着く電車に乗ってへん`);
      assert.ok(/^(山手線 内回り|京浜東北線 北行)（新橋から）$/.test(l.line), `${t}: 線の名前が変 ${l.line}`);
      checked++;
    }
  }
  assert.ok(checked >= 3, `確かめた区間が少ない: ${checked}`);
});
test("新橋：初期値では青砥経由のバスと東京メトロ経由は出ない。「はい」にすると出ることがある", () => {
  const data = fullData("weekday");
  for (const t of ["8:00", "12:14", "17:30"]) {
    for (const c of shimbashiCandidates(data, toMin(t), 10)) assert.equal(c.kind, "jr", `${t}: ${c.via}`);
    for (const c of kameariCandidates(homeData("weekday"), "shimbashi", toMin(t), 10)) assert.equal(c.kind, "jr", `${t}: ${c.via}`);
  }
  const all = shimbashiCandidates(data, toMin("12:14"), 20, { bus: true, metro: true });
  assert.ok(all.some(c => c.kind === "metro") && all.some(c => c.kind === "bus"), "はい にしても出えへん");
  const allBack = kameariCandidates(homeData("weekday"), "shimbashi", toMin("12:14"), 20, { bus: true, metro: true });
  // 帰りの東京メトロ経由（銀座線・浅草線→日比谷線→千代田線）は乗り換え2回やけど、「はい」にしたときだけは出す
  assert.ok(allBack.some(c => c.kind === "metro") && allBack.some(c => c.kind === "bus"), "帰り: はい にしても出えへん");
});
test("新橋 平日：亀有8:00発なら、北千住から上野東京ライン直通（8:12発）で新橋8:36着が1位", () => {
  const c = shimbashiCandidates(fullData("weekday"), toMin("8:00"), 1)[0];
  assert.equal(fmt(c.arr), "8:36");
  assert.match(c.via, /上野東京ライン/);
});
test("青砥経由 平日：バス→青砥→京成の3つの行き先で候補が出て、バス着＋歩き以降の電車に乗る", () => {
  const data = fullData("weekday");
  const walk = transfers.transfers.find(x => x.id === "aoto-bus-to-keisei").minutes;
  const t1 = aotoCandidates(data, toMin("12:14"), "narita1", 1)[0], t2 = aotoCandidates(data, toMin("12:14"), "narita", 1)[0];
  assert.equal(t1.arr - t2.arr, 3, "第1ターミナル着は第2・3ターミナル発+3分の目安");
  assert.equal(t1.legs[t1.legs.length - 1].to, "成田空港第1ターミナル");
  for (const dest of ["narita", "narita1", "shimbashi", "kawasaki"]) {
    const rows = aotoCandidates(data, toMin("12:14"), dest, 3);
    assert.ok(rows.length >= 2, dest + ": 候補が少ない");
    for (const c of rows) {
      assert.equal(c.legs[0].from, "亀有駅");
      assert.ok(c.train.dep >= c.bus.arr + walk, dest + ": 歩きの分を守ってへん");
      assert.equal(walk, 3);
      assert.ok(c.arr > c.train.dep, dest + ": 着が発より前");
      if (dest === "narita") assert.match(c.legs[c.legs.length - 1].line, /本線経由|スカイアクセス線経由/);
      if (dest === "kawasaki") assert.equal(c.legs[c.legs.length - 1].to, "京急川崎");   // 川崎＝京急川崎。JR川崎への歩きは出さない
    }
  }
  const c = aotoCandidates(data, toMin("12:14"), "shimbashi", 1)[0];
  assert.equal(c.bus.route, "新小58");            // 12:14 の次のバスは12:15発の新小58（→青砥駅東交差点12:22着）。同時刻の新小53は青砥駅入口12:28着で遅い
  assert.equal(fmt(c.bus.dep), "12:15");
  assert.equal(fmt(c.bus.arr), "12:22");
  assert.equal(c.bus.stop, "青砥駅東交差点");
  assert.equal(fmt(c.safeBus.dep), "12:13"); // 余裕を見るなら1本前（シャトル☆セブン 12:13）
  const c2 = aotoCandidates(data, toMin("12:49"), "shimbashi", 1)[0];
  assert.equal(c2.bus.route, "シャトル☆セブン 特急"); assert.equal(fmt(c2.bus.dep), "12:50"); assert.equal(fmt(c2.bus.arr), "12:56");
});
test("シャトル☆セブンの時刻表：亀有発の順に並び、青砥駅東交差点まで5〜6分", () => {
  let prev = -1;
  for (const t of bus.trips) {
    const d = toMin(t.kameariDep), a = toMin(t.aotoHigashiArr);
    assert.ok(d > prev, t.kameariDep + " の順番");
    assert.ok(a - d >= 5 && a - d <= 6, t.kameariDep + " の所要 " + (a - d));
    prev = d;
  }
  assert.equal(bus.trips.length, 39);
});

// ---- 7. 各地から亀有へ帰る（新橋・川崎・成田空港）----
import { kameariCandidates, transferCount } from "../engine.js";
function homeData(k) {
  return {
    transfers, bus, busKeisei, dayKind: k,
    jrRapidDown: load(`jr-joban-rapid-down-${k}.json`), jrDown: load(`jr-joban-local-down-${k}.json`), jrUp: load(`jr-joban-local-up-${k}.json`),
    yamanoteInner: load(`jr-yamanote-inner-${k}.json`), keihinNorth: load(`jr-keihintohoku-north-${k}.json`), tokaidoUp: load(`jr-tokaido-up-${k}.json`), utlNorth: load(`jr-utl-north-${k}.json`),
    keiyoDown: load(`jr-keiyo-down-${k}.json`), musashinoUp: load(`jr-musashino-up-${k}.json`),
    ginzaShimbashiAsakusa: loadOpt(`ekitan-metro-ginza-shimbashi-asakusa-${k}.json`), ginzaGinzaAsakusa: loadOpt(`ekitan-metro-ginza-ginza-asakusa-${k}.json`),
    hibiyaGinzaUp: loadOpt(`ekitan-metro-hibiya-ginza-up-${k}.json`), hibiyaHigashiginzaUp: loadOpt(`ekitan-metro-hibiya-higashiginza-up-${k}.json`), hibiyaMinamisenjuUp: loadOpt(`ekitan-metro-hibiya-minamisenju-up-${k}.json`),
    asakusaShimbashiOshiage: loadOpt(`ekitan-toei-asakusa-shimbashi-oshiage-${k}.json`), asakusaHigashiginzaOshiage: loadOpt(`ekitan-toei-asakusa-higashiginza-oshiage-${k}.json`),
    keiseiAotoDown: loadOpt(`ekitan-keisei-main-aoto-down-${k}.json`), keiseiAotoUpMain: loadOpt(`ekitan-keisei-main-aoto-up-${k}.json`), keiseiAotoUp: loadOpt(`ekitan-keisei-oshiage-aoto-up-${k}.json`),
    keiseiTateishiDown: loadOpt(`ekitan-keisei-oshiage-tateishi-down-${k}.json`), keiseiNipporiUp: loadOpt(`ekitan-keisei-main-nippori-up-${k}.json`),
    airport1MainUp: loadOpt(`ekitan-keisei-main-airport1-up-${k}.json`), airport1SAUp: loadOpt(`ekitan-keisei-sa-airport1-up-${k}.json`),
    airport2MainUp: loadOpt(`ekitan-keisei-main-airport2-up-${k}.json`), airport2SAUp: loadOpt(`ekitan-keisei-sa-airport2-up-${k}.json`),
    keikyuKawasakiUp: loadOpt(`ekitan-keikyu-kawasaki-up-${k}.json`),
  };
}
test("亀有へ帰る：新橋・川崎・成田空港から候補が出て、時刻が順に増え、乗り換えの分数を守る", () => {
  for (const k of ["weekday", "holiday"]) {
    const data = homeData(k);
    for (const origin of ["shimbashi", "kawasaki", "narita1", "narita2"]) {
      for (const t of ["7:00", "10:00", "13:30", "18:00", "21:30"]) {
        const rows = kameariCandidates(data, origin, toMin(t), 3);
        if (k === "holiday" && origin !== "shimbashi" && origin !== "kawasaki") continue; // 土休日の京成データはまだ無い
        assert.ok(rows.length >= 1, `${k} ${origin} ${t}: 候補なし`);
        for (const c of rows) {
          let cur = c.legs[0].dep;
          for (const l of c.legs) {
            assert.ok(l.dep >= cur, `${k} ${origin} ${t} ${c.via}: ${l.from} 発 ${fmt(l.dep)} が前より早い`);
            assert.ok(l.arr >= l.dep, `${k} ${origin} ${t} ${c.via}: ${l.from}→${l.to} 着が発より前`);
            cur = l.arr;
          }
          assert.equal(c.legs[c.legs.length - 1].to.replace("駅", ""), "亀有");
          for (let i = 1; i < c.legs.length; i++) {
            const l = c.legs[i];
            if (l.walk) continue;
            if (!l.afterWalk) assert.ok(l.gap >= l.tmin && l.gap >= 1, `${k} ${origin} ${t} ${c.via}: ${l.from} の乗り換え ${l.gap} 分 < ${l.tmin}`);
            if (!l.afterWalk && !["北千住", "松戸", "綾瀬"].includes(l.from)) assert.ok(l.gap >= 2, `${k} ${origin} ${t} ${c.via}: ${l.from} は2分以上のはず`);
            if (l.gap <= 5 && l.ifMissed) assert.ok(l.ifMissed.dep > l.dep && l.ifMissed.arr >= c.arr, `${k} ${origin} ${t} ${c.via}: 間に合わなかったときの次が変`);
          }
        }
      }
    }
    // 川崎は JR とバスの両方が出る
    const kw = kameariCandidates(data, "kawasaki", toMin("10:00"), 3);
    assert.ok(kw.some(c => c.kind === "jr"), k + " 川崎: JR経由が無い");
    if (data.keikyuKawasakiUp) assert.ok(kw.some(c => c.kind === "bus"), k + " 川崎: バス経由が無い");
  }
});
test("亀有へ帰る 平日：新橋12:14なら常磐線直通12:23発→北千住12:44着→千代田線12:46発→亀有12:52", () => {
  const rows = kameariCandidates(homeData("weekday"), "shimbashi", toMin("12:14"), 3);
  const c = rows.find(c => c.via.startsWith("常磐線（上野東京ライン直通）"));
  assert.ok(c, "直通の候補が無い");
  assert.equal(fmt(c.legs[0].dep), "12:23");
  assert.equal(fmt(c.legs[0].arr), "12:44");
  assert.equal(fmt(c.legs[1].dep), "12:46");
  assert.equal(fmt(c.arr), "12:52");
});
test("京成バス 新小53・新小52乙・新小58：亀有駅発と青砥側の発を突き合わせた所要分が妥当（新小53は12〜13分、新小52乙10〜12分、新小58は7〜8分）", () => {
  const want = { shinko53: [12, 13], shinko52otsu: [10, 12], shinko58: [7, 8] };
  for (const r of busKeisei.routes) {
    if (!r.trips) continue;
    for (const [k, list] of Object.entries(r.trips)) {
      let prev = -1;
      for (const t of list) {
        assert.ok(toMin(t.dep) > prev, `${r.name} ${k} ${t.dep} の順番`);
        assert.ok(t.travel >= want[r.id][0] && t.travel <= want[r.id][1], `${r.name} ${k} ${t.dep} の所要 ${t.travel}`);
        prev = toMin(t.dep);
      }
    }
    for (const [k, list] of Object.entries(r.tripsToKameari)) {
      let prev = -1;
      for (const t of list) { assert.ok(toMin(t.dep) > prev, `${r.name} 亀有駅行き ${k} ${t.dep} の順番`); prev = toMin(t.dep); }
    }
  }
  assert.equal(busKeisei.routes.find(r => r.id === "shinko53").trips.weekday.length, 76);
  assert.equal(busKeisei.routes.find(r => r.id === "shinko58").trips.weekday.length, 72);
});
test("シャトル☆セブン 亀有駅行き：青砥駅東交差点発の順に並び、亀有駅まで10〜14分", () => {
  let prev = -1;
  for (const t of bus.tripsToKameari) {
    const d = toMin(t.aotoHigashiDep), a = toMin(t.kameariArr);
    assert.ok(d > prev, t.aotoHigashiDep + " の順番");
    assert.ok(a - d >= 10 && a - d <= 14, t.aotoHigashiDep + " の所要 " + (a - d));
    prev = d;
  }
  assert.equal(bus.tripsToKameari.length, 36);
});

// ---- 乗り換え1回まで・川崎＝京急川崎・東京から（夏目さん 2026-11-05）----
test("乗り換えは1回まで：新橋（行き・帰り）と川崎（行き・帰り）。綾瀬の同じホームでの乗り換えは数えない", () => {
  const data = fullData("weekday"), home = homeData("weekday");
  for (const t of ["7:00", "8:00", "12:14", "17:30", "21:00"]) {
    // 「東京メトロ経由＝はい」で出る東京メトロ経由だけは2回でもよい（わざわざ選んだもの）。それ以外は1回まで
    for (const c of shimbashiCandidates(data, toMin(t), 10, { bus: true, metro: true })) assert.ok(transferCount(c) <= (c.kind === "metro" ? 2 : 1), `行き新橋 ${t} ${c.via}: 乗り換え ${transferCount(c)} 回`);
    for (const c of kameariCandidates(home, "shimbashi", toMin(t), 10, { bus: true, metro: true })) assert.ok(transferCount(c) <= (c.kind === "metro" ? 2 : 1), `帰り新橋 ${t} ${c.via}: 乗り換え ${transferCount(c)} 回`);
    for (const c of shimbashiCandidates(data, toMin(t), 10, { bus: true, metro: false })) assert.ok(transferCount(c) <= 1, `行き新橋（メトロなし） ${t} ${c.via}: 乗り換え ${transferCount(c)} 回`);
    for (const c of kameariCandidates(home, "shimbashi", toMin(t), 10, { bus: true, metro: false })) assert.ok(transferCount(c) <= 1, `帰り新橋（メトロなし） ${t} ${c.via}: 乗り換え ${transferCount(c)} 回`);
    for (const c of kameariCandidates(home, "kawasaki", toMin(t), 10)) assert.ok(transferCount(c) <= 1, `帰り川崎 ${t} ${c.via}: 乗り換え ${transferCount(c)} 回`);
    for (const c of aotoCandidates(data, toMin(t), "kawasaki", 3)) assert.ok(transferCount(c) <= 1, `行き川崎 ${t}: 乗り換え ${transferCount(c)} 回`);
  }
  // 「乗り換え2回」の形（北千住で快速→日暮里で山手線、など）は出ない
  for (const c of shimbashiCandidates(data, toMin("8:00"), 10)) assert.ok(!/快速 → (日暮里|上野)で/.test(c.via), c.via);
  // 綾瀬止まりの電車でも（綾瀬の乗り換えは数えないので）候補が出る
  assert.ok(shimbashiCandidates(data, toMin("12:14"), 3).length >= 1);
});
test("川崎は京急川崎：青砥からは1本で行ける電車だけ、JR川崎への歩きは出さない。帰りのJR経由はJR川崎から", () => {
  const data = fullData("weekday"), home = homeData("weekday");
  const kawasakiNos = new Set(data.keikyuKawasaki.trains.map(t => t.trainNo));
  for (const t of ["8:00", "12:14", "17:30"]) {
    const rows = aotoCandidates(data, toMin(t), "kawasaki", 3);
    assert.ok(rows.length >= 1, `${t}: 候補なし`);
    for (const c of rows) {
      const last = c.legs[c.legs.length - 1];
      assert.equal(last.to, "京急川崎");
      assert.ok(!last.walk && !c.legs.some(l => l.walk && /川崎/.test(l.to)), `${t}: 歩きが残っとる`);
      assert.ok(kawasakiNos.has(c.train.trainNo), `${t}: 青砥から1本で行けへん電車 ${c.train.trainNo}`);
    }
    for (const c of kameariCandidates(home, "kawasaki", toMin(t), 10)) {
      assert.ok(["JR川崎", "京急川崎"].includes(c.legs[0].from), c.via);
      assert.ok(!c.legs.some(l => l.walk && /川崎/.test(l.from + l.to)), `${t} ${c.via}: 川崎の歩きが残っとる`);
    }
  }
});
test("東京から亀有：京葉線→武蔵野線直通（東京始発）で新松戸、常磐線各駅停車で亀有。乗り換え1回、50〜85分", () => {
  for (const k of ["weekday", "holiday"]) {
    const home = homeData(k);
    for (const t of ["6:00", "9:00", "12:14", "15:00", "18:00", "21:00"]) {
      const rows = kameariCandidates(home, "tokyo", toMin(t), 3);
      assert.ok(rows.length >= 1, `${k} ${t}: 候補なし`);
      let prevArr = -1;
      for (const c of rows) {
        assert.ok(c.arr >= prevArr); prevArr = c.arr;
        assert.equal(c.legs.length, 2, c.via);
        assert.equal(c.legs[0].from, "東京"); assert.equal(c.legs[0].to, "新松戸"); assert.match(c.legs[0].line, /京葉線→武蔵野線直通/);
        assert.equal(c.legs[1].from, "新松戸"); assert.equal(c.legs[1].to, "亀有");
        assert.ok(c.legs[1].gap >= 2, `${k} ${t}: 新松戸の乗り換え ${c.legs[1].gap} 分`);
        assert.equal(transferCount(c), 1);
        assert.ok(c.arr - c.dep >= 50 && c.arr - c.dep <= 85, `${k} ${t} ${c.via}: 所要 ${c.arr - c.dep} 分`);
        assert.ok(c.legs[0].dep >= toMin(t));
      }
    }
  }
  // 答え合わせ（JR東日本 2611版）：平日 東京6:02発（府中本町行き）→西船橋6:31→新松戸6:47
  const c = kameariCandidates(homeData("weekday"), "tokyo", toMin("6:00"), 1)[0];
  assert.equal(fmt(c.legs[0].dep), "6:02"); assert.equal(fmt(c.legs[0].arr), "6:47");
});
