# 亀有の達人

亀有発着の乗換案内。スマホのホーム画面に置いて使うウェブアプリ（PWA）。

- 行き：亀有 → 綾瀬で綾瀬始発・北綾瀬始発に乗り換え → 千代田線の駅
- 帰り：品川始発の常磐線（上野東京ライン）→ 北千住乗り換え／松戸折り返し → 亀有
- 時刻はすべて時刻表どおり。遅れは反映しない。

## フォルダの中身

| 場所 | 中身 |
|---|---|
| `index.html` `app.js` `engine.js` `styles.css` | 画面と計算。`engine.js` が計算の中身で、画面とテストの両方から使う |
| `data/` | 時刻表データ（路線ごとに別ファイル。各ファイルの `meta` に出典URL・取り込んだ日・版） |
| `tests/` | 答え合わせテスト（`npm test`）。`tests/fixtures/data-v1.json` は前の版の答え |
| `scripts/` | 公開用フォルダを組み立てる `build-site.mjs`、手元で試す `serve.mjs`、アイコンを作る `make-icons.py` |
| `.github/workflows/pages.yml` | テストが全部通ったときだけ GitHub Pages に公開する |
| `reference/` | 前の版（v1）のアプリ・データ・決まりごと |
| `CLAUDE.md` | 決まりごと・出典・更新のやり方のメモ |

## 手元で試す

```bash
npm test
```

```bash
node scripts/serve.mjs 8080
```
