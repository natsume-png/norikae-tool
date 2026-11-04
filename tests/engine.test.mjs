// 亀有の達人 ― 答え合わせテスト。 npm test で動く。
// 1つでも落ちたら公開版は入れ替えへん（.github/workflows/pages.yml がそうなっている）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toMin, fmt, dayKind, DEST, ikiCandidates, kaeriCandidates } from "../engine.js";

const load = f => JSON.parse(readFileSync(new URL("../data/" + f, import.meta.url), "utf8"));
const iki = load("iki-ayase-v1.json");
const kaeri = load("kaeri-shinagawa-v1.json");
const holidays = load("holidays.json");
const v1 = JSON.parse(readFileSync(new URL("./fixtures/data-v1.json", import.meta.url), "utf8"));

// ---- 1. 答え合わせ（2026年10月版の時刻表で正しいと確認済みの5件）----
test("帰り 平日 品川15:35（普通）→北千住16:02着→16:06発 我孫子行き→亀有16:13、②松戸16:11着→16:19発→亀有16:25", () => {
  const c = kaeriCandidates(kaeri, "wd", toMin("15:35"), 1)[0];
  assert.equal(fmt(c.shinagawaDep), "15:35");
  assert.equal(c.type, "普通");
  assert.equal(fmt(c.kitasenjuArr), "16:02");
  assert.equal(fmt(c.chiyodaDep), "16:06");
  assert.equal(c.chiyodaDest, "我孫子行き");
  assert.equal(fmt(c.kameari1), "16:13");
  assert.equal(fmt(c.matsudoArr), "16:11");
  assert.equal(fmt(c.matsudoDep), "16:19");
  assert.equal(fmt(c.kameari2), "16:25");
});
test("帰り 平日 品川15:55（特別快速）→②松戸16:27着→16:28発→亀有16:34（ギリギリ）", () => {
  const c = kaeriCandidates(kaeri, "wd", toMin("15:55"), 1)[0];
  assert.equal(fmt(c.shinagawaDep), "15:55");
  assert.equal(c.typeName, "特別快速");
  assert.equal(fmt(c.matsudoArr), "16:27");
  assert.equal(fmt(c.matsudoDep), "16:28");
  assert.equal(fmt(c.kameari2), "16:34");
  assert.equal(c.tight2, true);
});
test("行き 平日 亀有8:49発→綾瀬8:56発（綾瀬始発・向ヶ丘遊園行き）", () => {
  const c = ikiCandidates(iki, "wd", toMin("8:49"), 11, 1)[0]; // 11 = 日比谷
  assert.equal(fmt(c.kameariDep), "8:49");
  assert.equal(fmt(c.ayaseDep), "8:56");
  assert.equal(c.origin, "綾瀬始発");
  assert.equal(c.dest, "向ヶ丘遊園");
});
test("行き 平日 亀有12:14発→綾瀬12:23発（北綾瀬始発・代々木上原行き）", () => {
  const c = ikiCandidates(iki, "wd", toMin("12:14"), 11, 1)[0];
  assert.equal(fmt(c.kameariDep), "12:14");
  assert.equal(fmt(c.ayaseDep), "12:23");
  assert.equal(c.origin, "北綾瀬始発");
  assert.equal(c.dest, "代々木上原");
});
test("行き 土休日 亀有7:49発→綾瀬8:09発（綾瀬始発）", () => {
  const c = ikiCandidates(iki, "hd", toMin("7:49"), 11, 1)[0];
  assert.equal(fmt(c.kameariDep), "7:49");
  assert.equal(fmt(c.ayaseDep), "8:09");
  assert.equal(c.origin, "綾瀬始発");
});
test("平日19:16〜21:02の亀有発は綾瀬で乗れる始発がなく、次は21:11", () => {
  for (const r of iki.wd) {
    const ka = toMin(r[0]);
    if (ka >= toMin("19:16") && ka <= toMin("21:02")) assert.equal(r[1], "21:11", r[0] + " の綾瀬発");
  }
});

// ---- 2. 時刻が駅の順に増えていくか（同じ電車・同じ行の中で）----
test("行き：亀有発の順に並び、綾瀬発は亀有発+4分以降", () => {
  for (const k of ["wd", "hd"]) {
    let prev = -1;
    for (const r of iki[k]) {
      const ka = toMin(r[0]), ay = toMin(r[1]);
      assert.ok(ka >= prev, `${k} ${r[0]} が順番どおりやない`);
      assert.ok(ay - ka >= 4, `${k} ${r[0]}→綾瀬${r[1]}：4分未満`);
      prev = ka;
    }
  }
});
test("帰り：品川発<北千住着<=千代田線発<亀有①、北千住着<松戸着<=松戸発<亀有②、品川発の順に並ぶ", () => {
  for (const k of ["wd", "hd"]) {
    let prev = -1;
    for (const c of kaeriCandidates(kaeri, k, 0, 999)) {
      const s = fmt(c.shinagawaDep);
      assert.ok(c.shinagawaDep >= prev, `${k} ${s} が順番どおりやない`);
      assert.ok(c.shinagawaDep < c.kitasenjuArr, `${k} ${s} 北千住着`);
      assert.ok(c.kitasenjuArr <= c.chiyodaDep, `${k} ${s} 千代田線発`);
      assert.ok(c.chiyodaDep < c.kameari1, `${k} ${s} 亀有①`);
      assert.ok(c.kitasenjuArr < c.matsudoArr, `${k} ${s} 松戸着`);
      assert.ok(c.matsudoArr <= c.matsudoDep, `${k} ${s} 松戸発`);
      assert.ok(c.matsudoDep < c.kameari2, `${k} ${s} 亀有②`);
      assert.ok(c.transfer1 >= 1 && c.transfer2 >= 1, `${k} ${s} 乗り換え1分未満`);
      prev = c.shinagawaDep;
    }
  }
});

// ---- 3. 前の版（v1）と大きく食い違わないか ----
test("帰り：前の版と同じ本数で、北千住・松戸の乗り換えが各行とも3分以内の違い", () => {
  for (const k of ["wd", "hd"]) {
    assert.equal(kaeri[k].length, v1.ret[k].length, k + " の本数");
    kaeri[k].forEach((r, i) => {
      const o = v1.ret[k][i];
      assert.equal(r[0], o[0], `${k} ${i}行目 品川発`);
      for (const col of [2, 3, 4, 5, 6, 7]) {
        const a = toMin(r[col]), b = toMin(o[col]);
        assert.ok(Math.abs(a - b) <= 3, `${k} 品川${r[0]} 列${col}: ${r[col]} と ${o[col]}`);
      }
    });
  }
});

// ---- 4. データの出典・取り込み日・版が書いてあるか ----
test("data/ の各ファイルに meta（出典URL・取り込んだ日・版）がある", () => {
  for (const [name, d] of [["iki", iki], ["kaeri", kaeri], ["holidays", holidays]]) {
    assert.ok(d.meta && d.meta.imported, name + ": imported");
    assert.ok(Array.isArray(d.meta.sources) && d.meta.sources.length, name + ": sources");
    for (const s of d.meta.sources) assert.ok(s.name && "url" in s && s.version, name + ": source " + JSON.stringify(s));
  }
});

// ---- 5. 平日／土休日の判定 ----
test("曜日・祝日・年末年始の判定", () => {
  assert.equal(dayKind(new Date(2026, 10, 4, 12), holidays), "wd"); // 2026-11-04 水
  assert.equal(dayKind(new Date(2026, 10, 7, 12), holidays), "hd"); // 土
  assert.equal(dayKind(new Date(2026, 10, 23, 12), holidays), "hd"); // 勤労感謝の日
  assert.equal(dayKind(new Date(2026, 11, 31, 12), holidays), "hd"); // 12/31
  assert.equal(dayKind(new Date(2026, 10, 9, 2), holidays), "hd"); // 月曜の深夜2時は日曜のダイヤ
  assert.equal(DEST.length, 18);
});
