#!/usr/bin/env bash
# 「時刻表を更新して」の一発実行。
#   1. JR東日本（縦の時刻表、品川始発の各列車）と駅探（東京メトロ・都営・京成・京急）を取り込み直す
#   2. 答え合わせテストを流す（1つでも落ちたら、ここで止まる＝公開用の変更をしない）
#   3. 何が変わったかを git の差分で表示する
# 使い方:  bash scripts/update_timetables.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/3 取り込み =="
python3 scripts/fetch_jr.py
python3 scripts/fetch_jr_shinagawa.py
python3 scripts/fetch_ekitan.py

echo "== 2/3 答え合わせテスト =="
if ! npm test --silent 2>&1 | tail -15; then
  echo "!! テストが落ちた。公開用の変更はせず、data/ の差分を確認すること（git diff --stat data/）"
  exit 1
fi

echo "== 3/3 変わったファイル =="
git status --short data/ | sed 's/^/  /'
python3 scripts/check_updates.py --diff-only || true
echo "テストは全部通った。commit → push すれば、公開の自動処理が走る。"
