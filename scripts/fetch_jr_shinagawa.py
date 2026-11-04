#!/usr/bin/env python3
"""品川駅の「上野東京ライン(常磐線)」の駅時刻表から、品川始発の各列車の詳細ページ（停車駅ごとの着・発・番線）を
取り込んで data/jr-shinagawa-joban-{weekday,holiday}.json に保存する。帰り（品川始発→北千住／松戸）の元データ。

使い方:
  python3 scripts/fetch_jr_shinagawa.py          # 平日・土休日の両方
  python3 scripts/fetch_jr_shinagawa.py weekday  # 平日だけ

出典: https://timetables.jreast.co.jp/timetable/list0788.html （品川駅の一覧ページ）→ 上野東京ライン(常磐線) 平日／土曜・休日
      → 各時刻のリンク先（列車の停車駅一覧ページ）
サイトに負荷をかけへんように、1ページごとに1秒あける（列車は1日あたり50本ほど）。
"""
import json, re, sys, html, time, datetime, os
from urllib.parse import urljoin

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_jr import get, strip  # 同じ取り方・文字の掃除を使う

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://timetables.jreast.co.jp/"
LIST_PAGE = BASE + "timetable/list0788.html"
OUT = {"weekday": "jr-shinagawa-joban-weekday.json", "holiday": "jr-shinagawa-joban-holiday.json"}


def find_station_pages():
    """一覧ページから「上野東京ライン(常磐線)」の平日・土休日の駅時刻表URLを探す。"""
    t = get(LIST_PAGE)
    t2 = re.sub(r'<a [^>]*href="([^"]*)"[^>]*>', r'[\1]', t)
    t2 = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t2)))
    m = re.search(r'常磐線[^\[]*\[([^\]]*tt0788/\d+\.html)\]\s*平日\s*\[([^\]]*tt0788/\d+\.html)\]\s*土曜・休日', t2)
    if not m:
        raise RuntimeError("品川の一覧ページに常磐線の駅時刻表のリンクが見つからへん")
    ver = re.search(r'/(\d{4})/timetable/', m.group(1)).group(1)
    return ver, {"weekday": urljoin(LIST_PAGE, m.group(1)), "holiday": urljoin(LIST_PAGE, m.group(2))}


def parse_station_page(page, url):
    """駅時刻表ページ → [(時, 分, 種別, 行先の略, 列車ページURL)]"""
    out = []
    for hour, body in re.findall(r'<tr id="time_(\d+)">(.*?)</tr>', page, re.S):
        for div in re.findall(r'<div class="timetable_time"(.*?)</div>', body, re.S):
            train = re.search(r'data-train="([^"]*)"', div).group(1)
            dest = re.search(r'data-dest="([^"]*)"', div).group(1)
            misc = re.search(r'data-misc="([^"]*)"', div).group(1)   # ◆=運転日注意（日付限定）
            href = re.search(r'href="([^"]*)"', div).group(1)
            minute = re.search(r'<span class="minute">(?:<span class="sp">)?(\d+)', div).group(1)
            out.append((int(hour), int(minute), train, dest, misc, urljoin(url, href)))
    return out


def parse_train_page(page, url):
    """列車の停車駅一覧ページ → {種別, 行先, 運転日, stops:[{station, arr, dep, platform}]}"""
    head = re.search(r'<main.*?<table', page, re.S)
    head_txt = strip(head.group(0)) if head else ""
    name = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
    days = re.search(r'<th>運転日</th>\s*<td[^>]*>(.*?)</td>', page, re.S)
    stops = []
    for row in re.findall(r'<tr class="time">(.*?)</tr>', page, re.S):
        st = strip(re.search(r'<th class="time">(.*?)</th>', row, re.S).group(1))
        times = re.findall(r'(\d{1,2}:\d{2})\s*(着|発)', row)
        arr = next((t for t, k in times if k == "着"), None)
        dep = next((t for t, k in times if k == "発"), None)
        pl = re.search(r'<td class="platform">(.*?)</td>', row, re.S)
        pl = strip(pl.group(1)) if pl else ""
        pl = pl.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
        stops.append({"station": st, "arr": arr, "dep": dep, "platform": pl or None})
    return {
        "name": strip(name.group(1)) if name else "",
        "days": strip(days.group(1)) if days else "",
        "stops": stops,
        "url": url,
    }


def fmt(h, m):
    return f"{h}:{m:02d}"


def main(argv):
    kinds = [a for a in argv if a in OUT] or list(OUT)
    ver, pages = find_station_pages()
    print("JR東日本 時刻表の版:", ver)
    for kind in kinds:
        url = pages[kind]
        page = get(url)
        entries = parse_station_page(page, url)
        trains = []
        for h, m, train, dest, misc, turl in entries:
            info = parse_train_page(get(turl), turl)
            time.sleep(1)
            first = info["stops"][0] if info["stops"] else {}
            trains.append({
                "shinagawaDep": fmt(h, m),
                "type": train.replace("無印", "").replace(",", ""),   # 例: '特,ひ' → '特ひ'（特急ひたち）
                "destMark": dest.replace("無印", ""),
                "misc": misc,                                          # '◆' は運転日注意（日付限定）
                "name": info["name"],
                "days": info["days"],
                "origin": first.get("station"),
                "stops": info["stops"],
                "url": turl,
            })
            print(f"  {kind} {fmt(h, m)} {info['name']} 停車駅 {len(info['stops'])}")
        data = {
            "meta": {
                "title": "品川発 上野東京ライン(常磐線) の各列車の停車駅と着発時刻 " + ("平日" if kind == "weekday" else "土休日"),
                "sources": [{"name": "JR東日本 時刻表 品川駅 上野東京ライン(常磐線)（各列車の停車駅一覧ページ）", "url": url, "version": ver}],
                "imported": datetime.date.today().isoformat(),
                "note": "stops の arr=着, dep=発（時刻表どおり）。platform=番線。type は駅時刻表の印（空=普通、快=快速、特快=特別快速、特ひ/特と=特急）、misc の ◆ は運転日注意（日付限定）。name は列車ページの題名。days は運転日。",
            },
            "trains": trains,
        }
        path = os.path.join(ROOT, "data", OUT[kind])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=0)
        print(f"→ data/{OUT[kind]}: {len(trains)} 本")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
