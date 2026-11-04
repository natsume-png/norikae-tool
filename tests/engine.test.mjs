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
