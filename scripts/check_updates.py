#!/usr/bin/env python3
"""週1回の定期チェック用。時刻表が変わっていないかを公式サイトで確かめて報告する（データは書き換えない）。

見に行く先:
  1. JR東日本: 亀有駅の一覧ページから時刻表の版（例 2611）を読み、data/ の JR ファイルの版と比べる
  2. 駅探（東京メトロ・都営・京成・京急）: 今日のダイヤの駅時刻表を取り直し、data/ に入っている同じ曜日種別のファイルと
     列車の本数・時刻を比べる（曜日種別が違うファイルしか無いときは「比べられない」と報告）
  3. 京成バス: 公式サイトの新着情報 RSS（更新情報の配信）から、最近の「ダイヤ改正」「時刻」などの告知を拾う
  4. git の差分（--diff-only のときだけ。update_timetables.sh の後で使う）

使い方:
  python3 scripts/check_updates.py           # 1〜3 を実行して報告（終了コード 0=変化なし、2=変化あり、1=エラー）
  python3 scripts/check_updates.py --diff-only
"""
import json, re, sys, os, html, time, datetime, subprocess, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_jr, fetch_ekitan

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
BUS_FEEDS = ["https://www.keiseibus.co.jp/category/rosen/feed/", "https://www.keiseibus.co.jp/feed/"]
# 題名に「地域の言葉」のどれかが入っていて、かつ「内容の言葉」のどれかが入っている告知だけ拾う
BUS_AREA = ["京成バス東京", "シャトル", "環七", "葛飾営業所", "金町営業所", "江戸川営業所", "亀有", "青砥", "新小52", "新小53", "新小58"]
BUS_TOPIC = ["ダイヤ改正", "時刻", "運賃", "停留所", "のりば", "乗り場", "経路", "廃止", "運行"]


def load(f):
    with open(os.path.join(DATA, f), encoding="utf-8") as fp:
        return json.load(fp)


def check_jr(report):
    cur = fetch_jr.current_version()
    stored = set()
    for f in glob.glob(os.path.join(DATA, "jr-*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for s in d["meta"]["sources"]:
            stored.add(s.get("version", "").split("（")[0])
    same = stored == {cur}
    report["jr"] = {"siteVersion": cur, "dataVersions": sorted(stored), "changed": not same}
    print(f"[JR東日本] サイトの版 {cur} / data の版 {sorted(stored)} → {'変わっている！' if not same else '同じ'}")
    return not same


def check_ekitan(report):
    changed = False
    details = []
    for name, (code, d, direction, title) in fetch_ekitan.TARGETS.items():
        url = f"{fetch_ekitan.BASE}{code}/d{d}"
        try:
            p = fetch_ekitan.parse(fetch_ekitan.get(url), direction)
        except Exception as e:
            details.append({"name": name, "error": str(e)})
            print(f"[駅探] {name}: 取得できへん（{e}）")
            continue
        time.sleep(1.5)
        fname = f"ekitan-{name}-{p['dayKind']}.json"
        path = os.path.join(DATA, fname)
        if not os.path.exists(path):
            details.append({"name": name, "dayKind": p["dayKind"], "status": "新しい曜日種別（data に無い）"})
            print(f"[駅探] {name}: {p['day']}ダイヤの保存がまだ無い（{len(p['trains'])}本）→ 取り込めば増える")
            changed = True
            continue
        old = json.load(open(path, encoding="utf-8"))
        a = [(t["time"], t["type"], t["dest"], t["trainNo"]) for t in old["trains"]]
        b = [(t["time"], t["type"], t["dest"], t["trainNo"]) for t in p["trains"]]
        if a != b:
            diff = len(set(a) ^ set(b))
            details.append({"name": name, "dayKind": p["dayKind"], "status": f"違い {diff} 件"})
            print(f"[駅探] {name}（{p['day']}）: 変わっている！ 違い {diff} 件（{len(a)}本→{len(b)}本）")
            changed = True
        else:
            details.append({"name": name, "dayKind": p["dayKind"], "status": "同じ"})
            print(f"[駅探] {name}（{p['day']}）: 同じ（{len(b)}本）")
    report["ekitan"] = details
    return changed


def check_bus(report):
    items = []
    since = datetime.date.today() - datetime.timedelta(days=10)
    for url in BUS_FEEDS:
        try:
            xml = fetch_ekitan.get(url)
        except Exception as e:
            print(f"[京成バス] RSS が読めへん: {url} ({e})")
            continue
        for item in re.findall(r"<item>(.*?)</item>", xml, re.S):
            t = html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", re.search(r"<title>(.*?)</title>", item, re.S).group(1))).strip()
            link = re.search(r"<link>(.*?)</link>", item, re.S).group(1).strip()
            pub = re.search(r"<pubDate>(.*?)</pubDate>", item, re.S)
            pub = pub.group(1).strip() if pub else ""
            try:
                pd = datetime.datetime.strptime(pub[:25], "%a, %d %b %Y %H:%M:%S").date()
            except Exception:
                pd = None
            if any(k in t for k in BUS_AREA) and any(k in t for k in BUS_TOPIC) and (pd is None or pd >= since):
                if not any(i["link"] == link for i in items):
                    items.append({"title": t, "link": link, "date": str(pd)})
        time.sleep(1.5)
    report["bus"] = items
    if items:
        print("[京成バス] 最近の気になる告知:")
        for i in items:
            print(f"  - {i['date']} {i['title']}\n    {i['link']}")
    else:
        print("[京成バス] 最近10日の告知に、時刻表に関わりそうなものは無し")
    return bool(items)


def git_diff():
    out = subprocess.run(["git", "diff", "--stat", "--", "data/"], cwd=ROOT, capture_output=True, text=True).stdout
    print(out.strip() or "data/ に差分なし")


def main(argv):
    if "--diff-only" in argv:
        git_diff()
        return 0
    report = {"checked": datetime.date.today().isoformat()}
    changed = False
    try:
        changed |= check_jr(report)
    except Exception as e:
        print("[JR東日本] 確認できへん:", e)
        report["jr"] = {"error": str(e)}
    changed |= check_ekitan(report)
    changed |= check_bus(report)
    with open(os.path.join(ROOT, "last-check.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("\n結果:", "変化あり → scripts/update_timetables.sh を実行して取り込み直す" if changed else "変化なし")
    return 2 if changed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
