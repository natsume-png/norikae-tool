#!/usr/bin/env python3
"""駅探（ekitan.com）の駅時刻表を取り込んで data/ に JSON で保存する。
東京メトロ・都営・京成・京急の公式サイトは自動の読み取りを断る（403 など）ので、駅探のクエリなしページを使う。

使い方:
  python3 scripts/fetch_ekitan.py            # 全部
  python3 scripts/fetch_ekitan.py metro-chiyoda-ayase   # 名前で指定

注意（robots.txt に合わせた決まり）:
  - 「?」付きのURL（?dw= で平日・土休日を切り替える、列車の詳細ページ）は robots.txt で禁止されているので使わない。
  - クエリなしのページは「取得した日（日本時間）」のダイヤが返る。平日に取れば平日、土曜に取れば土曜、休日に取れば休日のデータになる。
    保存先のファイル名は、そのページに表示されている曜日種別（平日／土曜／休日）で決める。
  - 1ページごとに 1.5 秒あける。
"""
import json, re, sys, html, time, datetime, os, urllib.request, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://ekitan.com/timetable/railway/line-station/"

# 名前 → (路線駅コード, 方面番号, 取り込む方面名, 題名)
TARGETS = {
    "metro-chiyoda-ayase":        ("276-1", 2, "代々木上原方面", "東京メトロ千代田線 綾瀬駅 代々木上原方面（綾瀬始発・北綾瀬始発・JR直通の全列車）"),
    "metro-chiyoda-kitasenju-down": ("276-2", 1, "綾瀬方面", "東京メトロ千代田線 北千住駅 綾瀬方面（我孫子・取手・柏・松戸行きが亀有に止まる）"),
    "metro-chiyoda-kitasenju-up": ("276-2", 2, "代々木上原方面", "東京メトロ千代田線 北千住駅 代々木上原方面"),
    "metro-hibiya-kitasenju":     ("273-0", 1, "中目黒方面", "東京メトロ日比谷線 北千住駅 中目黒方面"),
    "metro-ginza-ginza-shibuya":  ("277-10", 2, "渋谷方面", "東京メトロ銀座線 銀座駅 渋谷方面（新橋へ向かう側）"),
    "metro-ginza-tameike-asakusa": ("277-13", 1, "浅草方面", "東京メトロ銀座線 溜池山王駅 浅草方面（新橋へ向かう側）"),
    "metro-ginza-shimbashi-shibuya": ("277-11", 2, "渋谷方面", "東京メトロ銀座線 新橋駅 渋谷方面（銀座から来る電車の新橋発）"),
    "metro-ginza-shimbashi-asakusa": ("277-11", 1, "浅草方面", "東京メトロ銀座線 新橋駅 浅草方面（溜池山王から来る電車の新橋発）"),
    "toei-asakusa-shimbashi-nishimagome": ("222-9", 1, "西馬込方面", "都営浅草線 新橋駅 西馬込方面（押上・青砥から来る電車の新橋発）"),
    "toei-asakusa-higashiginza-nishimagome": ("222-10", 1, "西馬込方面", "都営浅草線 東銀座駅 西馬込方面（新橋へ向かう側）"),
    "keisei-oshiage-aoto-up":     ("258-5", 1, "泉岳寺方面", "京成押上線 青砥駅 押上・都営浅草線方面（上り）"),
    "keisei-main-aoto-down":      ("254-8", 2, "成田空港方面", "京成本線 青砥駅 成田空港方面（下り。アクセス特急・スカイライナーはスカイアクセス線経由）"),
    "keikyu-kawasaki-down":       ("250-14", 2, "浦賀方面", "京急本線 京急川崎駅 浦賀方面（品川側から来る電車の京急川崎発）"),
}
DAYKIND = {"平日": "weekday", "土曜": "saturday", "休日": "holiday"}


def get(url, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
            try:
                return subprocess.run(["curl", "-sSL", "-m", "40", url], capture_output=True, check=True).stdout.decode("utf-8", "replace")
            except Exception as e2:
                last = e2
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"取得できへん: {url}: {last}")


def parse(page, want_direction):
    tabs = re.findall(r'<li class="ek-direction_tab[^"]*"[^>]*data-ek-direction_name="([^"]*)"', page)
    tables = re.findall(r'<table class="search-result-data ek-search-result">(.*?)</table>', page, re.S)
    if len(tabs) != len(tables):
        raise RuntimeError(f"方面タブ {len(tabs)} と表 {len(tables)} の数が合わへん")
    if want_direction not in tabs:
        raise RuntimeError(f"方面 {want_direction} が見つからへん（{tabs}）")
    tbl = tables[tabs.index(want_direction)]
    day = re.search(r'<th class="select-day">(.*?)</th>', tbl).group(1).strip()
    dm = re.search(r'[?&]dt=(\d{8})', tbl)
    date = dm.group(1) if dm else ""
    weekday = re.search(r'<span class="ek-weekday">(.*?)</span>', page)
    attrs = {}
    for key in ("station_name", "line_name"):
        m = re.search(r'data-ek-' + key + r'="([^"]*)"', page)
        attrs[key] = html.unescape(m.group(1)) if m else ""
    trains = []
    for hour, body in re.findall(r'<tr class="ek-hour_line">\s*<td>(\d+)</td>(.*?)</tr>', tbl, re.S):
        for li in re.findall(r'<li class="ek-tooltip[^"]*ek-train-tooltip"(.*?)</li>', body, re.S):
            tr_type = re.search(r'data-tr-type="([^"]*)"', li).group(1)
            dest = re.search(r'data-dest="([^"]*)"', li).group(1)
            start = re.search(r'data-start="([^"]*)"', li).group(1)
            tx = re.search(r'[?&]tx=([^&"]*)', li).group(1)
            minute = re.search(r'<span class="time-min[^"]*"[^>]*>\s*(\d+)\s*</span>', li).group(1)
            third = tx.split("-")[-1]
            m = re.match(r'([A-Z]*)(.*)', third)
            typ, _, note = tr_type.partition(":")
            trains.append({
                "time": f"{int(hour)}:{minute}",
                "type": html.unescape(typ), "typeNote": html.unescape(note),
                "dest": html.unescape(dest),
                "start": start == "当駅始発",
                "tx": tx, "prefix": m.group(1), "trainNo": m.group(2),
            })
    return {
        "day": day, "dayKind": DAYKIND.get(day, day), "date": date, "weekday": weekday.group(1) if weekday else "",
        "station": attrs.get("station_name", ""), "line": attrs.get("line_name", ""), "direction": want_direction,
        "trains": trains,
    }


def fetch_one(name):
    code, d, direction, title = TARGETS[name]
    url = f"{BASE}{code}/d{d}"
    page = get(url)
    p = parse(page, direction)
    fname = f"ekitan-{name}-{p['dayKind']}.json"
    data = {
        "meta": {
            "title": title + "　" + p["day"],
            "sources": [{"name": f"駅探 {p['station']}駅 {p['line']} {direction}", "url": url,
                         "version": f"{p['date'][:4]}-{p['date'][4:6]}-{p['date'][6:]}{p['weekday']} 表示分（{p['day']}ダイヤ）"}],
            "imported": datetime.date.today().isoformat(),
            "dayKind": p["dayKind"],
            "note": "time は発車時刻。start=true はこの駅が始発。prefix は駅探の列車IDの英字（千代田線 綾瀬：A=JRから直通。空=メトロ線内始発）。trainNo は列車番号。typeNote は種別の補足（例: 都営浅草線内通過）。",
        },
        "station": p["station"], "line": p["line"], "direction": direction,
        "trains": p["trains"],
    }
    path = os.path.join(ROOT, "data", fname)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    print(f"  {name}: {p['station']} {p['line']} {direction} {p['day']}（{p['date']}{p['weekday']}）列車 {len(p['trains'])} 本 → data/{fname}")
    return fname


def main(argv):
    names = [a for a in argv if a in TARGETS] or list(TARGETS)
    for n in names:
        fetch_one(n)
        time.sleep(1.5)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
