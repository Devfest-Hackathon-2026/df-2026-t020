# map-builder

職業カードのデータ（`apps/web/public/data/occupation_cards.json`）を作るバッチ。手元で動かす（デプロイはしない）。

- 技術：Python・Google Gen AI SDK・uv
- モデル：Vertex AI の Gemini（`--model` で指定する）
- 出力：`.data/` に途中の生成物と確認用 CSV。画面と API が読むカードの JSON は `apps/web/public/data/`、仕事の街のキャラクターの見た目は `apps/web/data/townLooks.json`（任意。下の「仕事の街のキャラクター」）

## 職業データと「好きなもの」タグ

ホームの1回目「好きなもの」で選んだタグから、本人がまだ知らない仕事のカードを
「身近 → 少し遠い → 意外」に分けて見せる。その対応表を、job tag の職業データから Gemini で下書きする。

| ファイル | 役割 |
|---|---|
| `map_builder/tags.py` | タグの定義（23個）。**タグを変えるときはここだけ直す** |
| `map_builder/occupations.py` | job tag の2つの CSV を結合し、`occupations.json` を作る |
| `map_builder/tag_coverage.py` | タグごとに対応しそうな職業の数と分野の散らばりを粗く数える（タグが成り立つかの確認用） |
| `map_builder/tag_map.py` | Gemini（構造化出力）で、職業ごとにタグ・距離・つながりの1文・知られやすさを下書きし、確認用 CSV を出す |
| `map_builder/onet.py` | O*NET 31.0 の CSV を読み、知識項目を job tag と同じ名前にそろえる |
| `map_builder/onet_match.py` | Gemini で O*NET の職業を日本語にし、job tag の同じ職業と照らし合わせる（確認用 CSV を出す） |
| `map_builder/world.py` | job tag と O*NET（job tag にない職業だけ）を `occupations_world.json` にまとめる。知識の数値は尺度を換算 |
| `map_builder/export_cards.py` | フロント用の `occupation_cards.json`（カード一覧、1MB 未満）と `occupation_details.json`（長い説明）を書き出す |
| `map_builder/gemini_call.py` | Gemini 呼び出しの共通部分（429・5xx の再試行、引数） |

### 元データの置き場所（コミットしない）

job tag の CSV と生成物は 1MB を超えるため、`.gitignore` 済みの `.data/` に置く。

1. https://shigoto.mhlw.go.jp/User/download から次の2つをダウンロード
   - 解説系ダウンロードデータ ver.7.01（csv）
   - 簡易版数値系ダウンロードデータ ver.7.00（csv）
2. リポジトリ直下の `.data/jobtag/` に置く

### 実行（`jobs/map-builder` で）

```bash
uv sync

# 1. 職業データを整える（Gemini は呼ばない）
uv run python -m map_builder.occupations \
    ../../.data/jobtag/IPD_DL_description_7_01.csv \
    ../../.data/jobtag/IPD_DL_numeric_7_00.csv \
    ../../.data/occupations.json

# 2. タグの対応状況を粗く確認（Gemini は呼ばない）
uv run python -m map_builder.tag_coverage ../../.data/occupations.json ../../.data/tag_coverage.csv

# 3. Gemini で下書き。まずプロンプトだけ確認する
uv run python -m map_builder.tag_map ../../.data/occupations.json ../../.data/tag_map \
    --model gemini-4-argon --dry-run --limit 20

# 4. 本実行（APIキーは使わない。ADC で認証）
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=<プロジェクトID>
uv run python -m map_builder.tag_map ../../.data/occupations.json ../../.data/tag_map \
    --model gemini-4-argon --limit 20      # まず20職業で試す。外せば全職業
```

- モデル：一括下書きは Gemini 4 Argon（`gemini-4-argon`、Vertex AI の global エンドポイント）
- 途中で止まっても、同じコマンドをもう一度実行すれば続きから処理する
- 出力：`.data/tag_map/tag_map_raw.jsonl`（Gemini の返答）と `.data/tag_map/tag_map_review.csv`（確認用）
- 確認：`tag_map_review.csv` の「確認（OK/NG/修正）」「修正メモ」を埋める
- 教科系タグ（英語・数学・理科・実験・歴史・社会）は、job tag の「仕事で使う知識」の数値が 2.5 以上でないと
  採用しない（Gemini の返答をスクリプトで機械的に検査する）

### データの注意点

- 職業数：解説系 556、簡易版数値系 518（数値がない職業がある）
- CSV は Shift_JIS（cp932）で、先頭に説明の行がある。列見出しの位置はファイルごとに違うので、
  「収録番号」「職業名」が並ぶ行を探して読む
- 学歴の比率は合計が1を超える職業が多く、複数回答とみられる。定義がはっきりしないので、
  「大卒」の比率だけを目安に使う
- 写真・動画は、job tag の利用規約で別途の使用許諾が必要なので使わない

### 出典表記（画面・提出物に載せる）

> 独立行政法人労働政策研究・研修機構（JILPT）作成「職業情報データベース 解説系ダウンロードデータ ver.7.01」
> 「同 簡易版数値系ダウンロードデータ ver.7.00」職業情報提供サイト（job tag）よりダウンロード
> （<https://shigoto.mhlw.go.jp/User/download>）を加工して作成

## 海外の職業を足す（O*NET）

job tag は米国の O*NET を手本に作られており、知識の項目が1対1で対応する。
そこで O*NET 31.0（CC BY 4.0）から、job tag にない職業だけを足す。

### 元データ

https://www.onetcenter.org/database.html の CSV 版から次の5つを `.data/onet/` に置く。

```powershell
$base="https://www.onetcenter.org/dl_files/database/db_31_0_csv"
"occupation_data","knowledge","task_statements","job_titles","job_zones" | % { Invoke-WebRequest "$base/$_.csv" -OutFile ".data\onet\$_.csv" }
```

### 実行（`jobs/map-builder` で）

```bash
# 1. O*NET を読む（Gemini は呼ばない）。詳しいデータがある923職業
uv run python -m map_builder.onet ../../.data/onet ../../.data/onet_occupations.json

# 2. 日本語化と job tag との照合（Gemini）。5職業ずつ、約185回
uv run python -m map_builder.onet_match ../../.data/occupations.json \
    ../../.data/onet_occupations.json ../../.data/onet_match --model gemini-4-argon --limit 5
uv run python -m map_builder.onet_match ../../.data/occupations.json \
    ../../.data/onet_occupations.json ../../.data/onet_match --model gemini-4-argon

# 3. まとめる（Gemini は呼ばない）。確認CSVで NG にした職業は --review で除く
uv run python -m map_builder.world ../../.data/occupations.json \
    ../../.data/onet_occupations.json ../../.data/onet_match/onet_match_raw.jsonl \
    ../../.data/occupations_world.json --review ../../.data/onet_match/onet_match_review.csv

# 4. 増えた職業にタグを付ける（job tag の分は済んでいるので、O*NET の分だけ処理される）
uv run python -m map_builder.tag_map ../../.data/occupations_world.json ../../.data/tag_map_v2 \
    --model gemini-4-argon
```

- 照合の結果は「同じ／近い／なし」。「同じ」は追加せず、job tag 側に `onet_codes` として記録する。
  同じ仕事が2枚のカードになるのを避けるため、迷ったら「同じ」寄りに判定させている
- 足した職業には `source: "onet"`、`jp_presence`（日本にもある／日本では少ない／日本にはほぼない）が付く。
  アプリでは「海外の仕事」などの表示に使う
- 知識の数値：job tag と O*NET は尺度が違う（job tag は平均1.2前後、O*NET の重要度 IM は1〜5）。
  「同じ」と判定された組を使い、知識の項目ごとに平均と散らばりをそろえる1次式（標準化主軸回帰）で換算する。
  ふつうの回帰だと値が平均に縮み、O*NET の満点でも教科タグの基準 2.5 に届かないため。
  確かめ：O*NET の通訳・翻訳者の「外国語」は換算後 4.77 で、job tag の翻訳者（4.77）と一致。
  式と相関係数は `occupations_world.json` の `meta.knowledge_calibration` に残る
- 賭け事の仕事（カジノなど7職業）は、教育向けのアプリなので載せない（`world.py` の `EXCLUDE_ONET`）
- 米国の学歴データ・就き方は日本の進路に当てはまらないので使わない（`education` は空、`how_to_become` は空）
- 出典表記は `meta.sources`（job tag と O*NET の両方）。O*NET は翻訳・加工した旨と、
  USDOL/ETA が加工内容を承認していない旨を必ず載せる

## フロント用に書き出す

```bash
uv run python -m map_builder.export_cards ../../.data/occupations_world.json \
    ../../.data/tag_map_v2/tag_map_raw.jsonl ../../.data/occupation_cards.json \
    --review ../../.data/tag_map_v2/tag_map_review.csv
```

- `occupation_cards.json`：全職業のカード（名前・1文の説明・タグ・つながりの1文・知られやすさ・学部系統など）と、
  タグ×距離ごとの職業IDの索引 `by_tag`。1MB 未満なので `apps/web/public/data/` に置ける
- `occupation_details.json`：`{職業ID: {what, how_to_become, top_knowledge}}`。長い説明（容量の7割）を分けたもの
- カードの大分類名は `meta.majors[major_code]` で引く（容量を減らすため、カードには `major_code` だけ）
- `--review` を渡すと、確認CSVで NG のタグを除き、OK・修正 のタグを `reviewed: true` にする
- 画面に出す出典文は `meta.attribution_ja`、正式な出典表記は `meta.sources`（どちらも表示が必須）

## 仕事の街のキャラクター

`apps/web` の仕事の街（`/map`）で、職業ごとに「街のどの区画にいるか」と「キャラクターの部品の組み合わせ」を Gemini で下書きする。
部品のカタログは `apps/web/data/townParts.json`（上着・帽子・アクセサリー・持ち物・動物・乗り物・ポーズ・色・区画）。
画面は、この下書きがない職業には決まりによる見た目（`apps/web/data/townLook.ts`）を使うので、実行しなくても街は動く。
このリポジトリには下書き（`townLooks.json`）を入れていないので、いまの画面はすべて決まりによる見た目で描いている。

```bash
# 1. プロンプトだけ確認（Gemini は呼ばない）
uv run python -m map_builder.town_look ../../.data/occupations_world.json \
    ../../apps/web/data/townParts.json ../../.data/town_look --model gemini-4-argon --dry-run --limit 20

# 2. 下書き（20職業ずつ、約50回。止まっても、もう一度実行すれば続きから）
uv run python -m map_builder.town_look ../../.data/occupations_world.json \
    ../../apps/web/data/townParts.json ../../.data/town_look --model gemini-4-argon

# 3. 確認CSV（../../.data/town_look/town_look_review.csv）を確認してから、画面用に書き出す（Gemini は呼ばない）
uv run python -m map_builder.town_look ../../.data/occupations_world.json \
    ../../apps/web/data/townParts.json ../../.data/town_look --export ../../apps/web/data/townLooks.json
```

- 確認CSVは1行＝1職業。「見た目（日本語）」と「根拠」を読み、部品の列（カタログの id）を直接書き換えてよい。
  「確認」列を NG にした職業は書き出さない（画面は仮の見た目になる）。OK・修正 は `reviewed: true` になる
- 書き換えた値がカタログにないと、書き出しは止まり、行番号と値を表示する
- 体つき・肌・髪型・髪の色・スカートかズボンかは、仕事と関係がないので Gemini に選ばせない
  （画面が職業ごとの乱数で決める。性別や見た目の思い込みを入れないため）
- 部品を増やすときは、`townParts.json` に足し、`apps/web/components/town/people.ts` に描き方を足してから、もう一度下書きする

