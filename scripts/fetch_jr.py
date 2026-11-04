#!/usr/bin/env python3
"""JR東日本の「デジタル時刻表」（縦の時刻表）を取り込んで data/ に JSON で保存する。

使い方:
  python3 scripts/fetch_jr.py            # 全部取り込む
  python3 scripts/fetch_jr.py --check    # 今の時刻表の版（例: 2611）を表示するだけ
  python3 scripts/fetch_jr.py 642d1      # 指定した表だけ

出典: https://timetables.jreast.co.jp/ （駅の一覧ページ → デジタル時刻表）。
版（例 2611 = 2026年11月版）は亀有駅の一覧ページ（list0507.html）のリンクから読み取る。
外部ライブラリは使わない（標準の urllib と正規表現だけ）。
"""
import json, re, sys, html, time, datetime, urllib.request, subprocess, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://timetables.jreast.co.jp/"
LIST_PAGE = BASE + "timetable/list0507.html"   # 亀有駅の一覧ページ（版の番号を読む用）

# 取り込む表：コード → (ファイル名, 題名)
TABLES = {
    "641u1": ("jr-joban-local-up-weekday.json",   "常磐線各駅停車・千代田線 上り（取手→綾瀬→代々木上原。JR直通列車のみ）平日"),
    "641u2": ("jr-joban-local-up-holiday.json",   "常磐線各駅停車・千代田線 上り（取手→綾瀬→代々木上原。JR直通列車のみ）土休日"),
    "641d1": ("jr-joban-local-down-weekday.json", "常磐線各駅停車・千代田線 下り（代々木上原→綾瀬→取手。JR直通列車のみ）平日"),
    "641d2": ("jr-joban-local-down-holiday.json", "常磐線各駅停車・千代田線 下り（代々木上原→綾瀬→取手。JR直通列車のみ）土休日"),
    "642d1": ("jr-joban-rapid-down-weekday.json", "常磐線・常磐線（快速） 下り（品川・上野→取手）平日"),
    "642d2": ("jr-joban-rapid-down-holiday.json", "常磐線・常磐線（快速） 下り（品川・上野→取手）土休日"),
    "642u1": ("jr-joban-rapid-up-weekday.json",   "常磐線・常磐線（快速） 上り（取手→上野・品川）平日"),
    "642u2": ("jr-joban-rapid-up-holiday.json",   "常磐線・常磐線（快速） 上り（取手→上野・品川）土休日"),
    "630d1": ("jr-yamanote-outer-weekday.json",   "山手線 外回り（日暮里・上野→東京→新橋→品川方面）平日"),
    "630d2": ("jr-yamanote-outer-holiday.json",   "山手線 外回り（日暮里・上野→東京→新橋→品川方面）土休日"),
    "623u1": ("jr-keihintohoku-north-weekday.json", "京浜東北線 北行（横浜→川崎→品川→東京→上野→大宮）平日"),
    "623u2": ("jr-keihintohoku-north-holiday.json", "京浜東北線 北行（横浜→川崎→品川→東京→上野→大宮）土休日"),
    "630u1": ("jr-yamanote-inner-weekday.json",   "山手線 内回り（品川→新橋→東京→上野→日暮里→西日暮里→池袋）平日"),
    "630u2": ("jr-yamanote-inner-holiday.json",   "山手線 内回り（品川→新橋→東京→上野→日暮里→西日暮里→池袋）土休日"),
    "101u1": ("jr-tokaido-up-weekday.json",       "東海道線 上り（熱海・小田原→横浜→川崎→品川→新橋→東京）平日"),
    "101u2": ("jr-tokaido-up-holiday.json",       "東海道線 上り（熱海・小田原→横浜→川崎→品川→新橋→東京）土休日"),
    "295u1": ("jr-utl-north-weekday.json",        "上野東京ライン 北行（東海道線→品川→東京→上野→宇都宮線・高崎線）平日"),
    "295u2": ("jr-utl-north-holiday.json",        "上野東京ライン 北行（東海道線→品川→東京→上野→宇都宮線・高崎線）土休日"),
    "623d1": ("jr-keihintohoku-south-weekday.json", "京浜東北線 南行（大宮→上野・東京→横浜）平日"),
    "623d2": ("jr-keihintohoku-south-holiday.json", "京浜東北線 南行（大宮→上野・東京→横浜）土休日"),
    "624d1": ("jr-keiyo-down-weekday.json",       "京葉線 下り（東京→西船橋・蘇我。武蔵野線直通列車は西船橋まで）平日"),
    "624d2": ("jr-keiyo-down-holiday.json",       "京葉線 下り（東京→西船橋・蘇我。武蔵野線直通列車は西船橋まで）土休日"),
    "708u1": ("jr-musashino-up-weekday.json",     "武蔵野線 上り（海浜幕張・西船橋→新松戸→府中本町。東京からの直通は列車番号と西船橋発で京葉線の表と結ぶ）平日"),
    "708u2": ("jr-musashino-up-holiday.json",     "武蔵野線 上り（海浜幕張・西船橋→新松戸→府中本町。東京からの直通は列車番号と西船橋発で京葉線の表と結ぶ）土休日"),
}


def get(url, retries=3):
    """ページを取る。環境の HTTPS プロキシ設定（環境変数）はそのまま使う。失敗したら curl でもう一度。"""
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
            try:
                out = subprocess.run(["curl", "-sSL", "-m", "40", url], capture_output=True, check=True).stdout
                return out.decode("utf-8", "replace")
            except Exception as e2:
                last = e2
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"取得できへん: {url}: {last}")


def current_version():
    """一覧ページのリンク（../2611/timetable-v/641u1.html）から版の番号を読む。"""
    t = get(LIST_PAGE)
    m = re.search(r'\.\./(\d{4})/timetable-v/641u1\.html', t)
    if not m:
        raise RuntimeError("一覧ページに版の番号が見つからへん（ページの作りが変わったかも）")
    return m.group(1)


def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


def norm_time(s):
    """'0436' → '4:36'。'レ'（通過）→ 'pass'。空 → None。それ以外は原文のまま。"""
    s = s.strip()
    if s == "":
        return None
    if re.fullmatch(r'\d{4}', s):
        return f"{int(s[:2])}:{s[2:]}"
    if s == "レ":
        return "pass"
    return s


IS_TIME = re.compile(r'\d{1,2}:\d{2}$')


def to_min(t):
    h, m = t.split(":")
    h = int(h)
    if h < 4:
        h += 24
    return h * 60 + int(m)


def merge_split_columns(trains):
    """JRとメトロの境（綾瀬）で2つの列に分かれている直通列車を1つにまとめる。
    JRの表では、直通列車は「綾瀬までの列（この先は『＝』）」と「綾瀬からの列（手前は『┐』）」に分かれて隣り合って載る。
    隣り合う2列で、前の列に『＝』、後ろの列に『┐』があり、綾瀬の時刻が0〜5分差（綾瀬での停車）なら同じ列車とみなす。
    """
    out = []
    i = 0
    while i < len(trains):
        a = trains[i]
        b = trains[i + 1] if i + 1 < len(trains) else None
        if b and "＝" in a["times"].values() and "┐" in b["times"].values():
            ta, tb = a["times"].get("綾瀬"), b["times"].get("綾瀬")
            if ta and tb and IS_TIME.match(ta) and IS_TIME.match(tb) and 0 <= to_min(tb) - to_min(ta) <= 5:
                times = {k: v for k, v in a["times"].items() if v not in ("＝", "┐")}
                if ta != tb:
                    times["綾瀬着"] = ta          # 前の列の綾瀬は到着、後ろの列の綾瀬が発車
                for k, v in b["times"].items():
                    if v not in ("＝", "┐"):
                        times[k] = v
                merged = dict(a)
                merged["times"] = times
                merged["dest"] = b["dest"]
                merged["destArr"] = b["destArr"]
                merged["next"] = b["next"]
                if b["no"] != a["no"]:
                    merged["no"] = a["no"] + "/" + b["no"]
                merged["merged"] = True
                if a.get("platform") or b.get("platform"):
                    merged["platform"] = {**(a.get("platform") or {}), **(b.get("platform") or {})}
                out.append(merged)
                i += 2
                continue
        out.append(a)
        i += 1
    return out


def parse_table(page, code, version, url):
    tbl = re.search(r'<table class="paper_table">(.*?)</table>', page, re.S)
    if not tbl:
        raise RuntimeError(f"{code}: 時刻表の表が見つからへん")
    rows = re.findall(r'<tr([^>]*)>(.*?)</tr>', tbl.group(1), re.S)
    header = {}
    stations = []        # [(駅名, 着/発)]
    station_rows = []    # 各駅の時刻の配列
    for attrs, body in rows:
        cls = re.search(r'class="([^"]*)"', attrs)
        cls = cls.group(1) if cls else ""
        ths = re.findall(r'<th[^>]*>(.*?)</th>', body, re.S)
        tds = [strip(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', body, re.S)]
        th1 = strip(ths[0]) if ths else ""
        th2 = strip(ths[1]) if len(ths) > 1 else ""
        if cls.startswith("tableTr_"):
            header[cls.replace("tableTr_", "")] = tds
        elif th1:
            if th2 in ("着", "発"):
                stations.append((th1, th2))
                station_rows.append(tds)
            else:
                header["platform:" + th1] = tds   # 「上野番線」など
    n = len(header.get("trainNumber", []))
    heading = re.search(r'<div class="timetable-daydetail-heading[^"]*">\s*<h2>(.*?)</h2>', page, re.S)
    day = re.search(r'<h3 class="(weekday|holiday)">(.*?)</h3>', page)
    trains = []
    for i in range(n):
        times = {}
        last_station = None
        for (st, kind), row in zip(stations, station_rows):
            v = norm_time(row[i]) if i < len(row) else None
            if v is None:
                continue
            key = st + ("着" if kind == "着" else "")
            times[key] = v
            if IS_TIME.match(v):
                last_station = st
        end = header.get("end", [""] * n)[i]
        m_end = re.match(r'(\S+)\s*(\d{4})?', end) if end else None
        dest = m_end.group(1) if m_end else last_station
        dest_arr = norm_time(m_end.group(2)) if (m_end and m_end.group(2)) else None
        train = {
            "no": header.get("trainNumber", [""] * n)[i],
            "type": header.get("trainName", [""] * n)[i],
            "days": header.get("operatingDay", [""] * n)[i],
            "facility": header.get("facility", [""] * n)[i],
            "dest": dest,
            "destArr": dest_arr,
            "next": header.get("next", [""] * n)[i],
            "times": times,
        }
        for k, v in header.items():
            if k.startswith("platform:") and v[i]:
                train.setdefault("platform", {})[k.split(":", 1)[1]] = v[i].strip("()")
        trains.append(train)
    trains = merge_split_columns(trains)
    return {
        "meta": {
            "title": TABLES[code][1] if code in TABLES else code,
            "heading": strip(heading.group(1)) if heading else "",
            "day": day.group(2) if day else "",
            "sources": [{"name": "JR東日本 デジタル時刻表 " + code, "url": url, "version": version}],
            "imported": datetime.date.today().isoformat(),
            "note": "times の値は時刻表どおりの発車時刻（『着』が付く駅だけ到着時刻）。'pass' は通過、'||' は経由しない区間。days は運転日（全日／平日／土休日／日付限定）。日付限定の列車は計算から外す。merged=true は JR とメトロで2列に分かれていた直通列車を1つにまとめたもの（no は JR側/メトロ側の列車番号）。",
        },
        "stations": [s for s, _ in stations],
        "stationKinds": [k for _, k in stations],
        "trains": trains,
    }


def main(argv):
    if "--check" in argv:
        print(current_version())
        return 0
    want = [a for a in argv if not a.startswith("--")] or list(TABLES)
    version = current_version()
    print("JR東日本 時刻表の版:", version)
    out_dir = os.path.join(ROOT, "data")
    os.makedirs(out_dir, exist_ok=True)
    for code in want:
        url = f"{BASE}{version}/timetable-v/{code}.html"
        page = get(url)
        data = parse_table(page, code, version, url)
        fname = TABLES[code][0] if code in TABLES else f"jr-{code}.json"
        path = os.path.join(out_dir, fname)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=0)
        print(f"  {code} → data/{fname}: 列車 {len(data['trains'])} 本、駅 {len(data['stations'])}")
        time.sleep(1.5)   # サイトに負荷をかけへんように間を空ける
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
