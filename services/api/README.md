# api

公開 API（FastAPI）。ホーム画面の「好きなこと → 会話 → 職業カード」を受け持つ。
Cloud Run（サービス）で動かし、Firebase Hosting の `/api/**` rewrite から呼ばれる。localhost では、画面から直接呼ぶ。

- 技術：Python・FastAPI・google-genai（Vertex AI の Gemini 4 Argon。`GEMINI_MODEL` で変えられる）・uv
- パス：Hosting の rewrite はパスをそのまま転送するので、ルートは `/api` から始める
- データ：画面と同じ `apps/web/public/data/occupation_cards.json` を読む（環境変数 `CARDS_PATH` で変えられる）
- 会話は保存しない。画面が毎回、これまでの会話（問い・選択肢・答え）をまとめて送る

## エンドポイント

| パス | 内容 |
|---|---|
| `GET /api/health` | 動いているかと、Gemini の接続先（`vertex`・`gemini-api`・`template`） |
| `POST /api/chat` | 好きなこと・RIASEC の上位・これまでの会話から、次の「知る（世界の話と仕事）」と問い・選択肢か、終わり（`done`）を返す |
| `POST /api/recommend` | 会話の内容から、Gemini が1,000職業の一覧から9件（身近・少し遠い・意外を3件ずつ）選び、理由の1文を付けて返す |
| `POST /api/reasons` | 画面がデータで選んだ職業カードに、理由の1文を付ける（`/api/recommend` が空のときの代わりの道） |

### 会話（`POST /api/chat`）

1回ごとに「知る（世界の話と仕事）→ 反応 → 考える（問い）」の組を返す。
知らない仕事は質問できないので、問いの前に、必ず関係する業界やトレンドと仕事を見せる。これを会話の毎回で行う。

```json
{
  "interests": ["宇宙", "Webサイト制作"],
  "strengths": ["手先が器用"],
  "values": ["なぞを解き明かしたい"],
  "riasec": ["I", "C"],
  "cardTags": ["理科・実験", "スマホ・アプリ"],
  "history": [
    {
      "explore": {
        "title": "…", "text": "…",
        "jobs": [{ "name": "録音エンジニア", "what": "…", "occupationId": 213, "reactions": ["知らなかった", "気になる"] }]
      },
      "question": "…", "options": ["…", "…"], "answer": "データから新しいことがわかる"
    }
  ]
}
```

```json
{
  "done": false,
  "explore": { "title": "…", "text": "…", "jobs": [{ "name": "…", "what": "…" }] },
  "question": "…", "options": ["…", "…", "…"],
  "turn": 1, "maxTurns": 6, "source": "gemini"
}
```

- 回ごとの視点（`app/chat.py` の `PERSPECTIVES`）：好きなことの裏側 → 世の中の変化（AI・人口減少など）→ 掛け合わせ → 反応をもとに広げる
- 「知る」の話と仕事の説明は Gemini の知識で書く。出典を付けられないので、数字・統計・年・会社名は書かせない
- 見せる仕事は、職業データの候補（`candidates`。まだ見せていない90件。好きなことにつながる仕事を半分まで、残りはほかの分野から散らす。よく知られた仕事は入れない）から、Gemini に番号（`occupation_id`）で選ばせる。職業名は職業データのものを使い、`jobs[].occupationId` で返す。画面はこれで、職業カードと仕事の街・業界ページへのリンクを出す
- すべて日本語で書かせる。API でも確かめ、英語の文・選択肢・理由は使わない
- 毎回、前の回と違う業界を見せ、「ピンとこない」の方向は続けない。選択肢の1つは別の方向に広げる答えにする
- 少なくとも3回は続け、6回で必ず終える（`MIN_TURNS`・`MAX_TURNS`）。その間は Gemini が「材料がそろった」と判断したら終える
- 反応は「知らなかった」「気になる」「ピンとこない」。次の回と推薦で、Gemini が方向を決める材料にする
- `strengths`（得意なこと）と `values`（大事にしたいこと）は任意で、それぞれ3個まで（タグと同じ文字の決まり）。Gemini には別々に渡す。得意なことは「その力が意外な業界でも活きる場面」、大事にしたいことは「やりがいや問いの方向」を考える材料にし、「向いている」とは決めつけない。`/api/recommend` も同じで、結果を使い回す判定にも入れている
- RIASEC の上位は、画面には出さず Gemini への参考情報にだけ使う
- Gemini が使えない・決まりに合わない返事のときは、`cardTags` を手がかりに職業データ（`by_tag` の少し遠い・意外、知られていない順）から仕事を選び、決まった問い（`FALLBACK`）で続ける。最低の回数まで答えていれば、そこで終える
- 答え（選択肢か「その他」の一言）は40字まで。改行と山かっこは受け付けない

### 職業の推薦（`POST /api/recommend`）

入力は `/api/chat` と同じ。

```json
{ "jobs": [{ "occupationId": 313, "distance": "身近", "reason": "…" }], "source": "gemini" }
```

- 1,000職業の一覧（ID・職業名・分野コード・知られやすさ・説明の先頭40字。約6万字）を毎回プロンプトに入れる
- 会話で見せた仕事への反応を渡し、「気になる」の方向を重く、「ピンとこない」の方向を軽く扱わせる。会話で見せた仕事は選ばせない（画面には別に出す）
- 有名な職業に寄らないよう、知られやすさ3の職業は全体で3件まで、同じ分野は3件まで、と指示している
- 返ってきた ID は一覧と照らして確かめる（ない ID・重複・長すぎる理由は落とす）。使えるものが3件未満なら `jobs` を空で返し、画面がデータでの選び方に切り替える
- 待ち時間の上限は60秒。同じ会話には前の結果を返す
- モデルは `GEMINI_RECOMMEND_MODEL`（省略時は `GEMINI_MODEL` と同じ）

### カードの理由（`POST /api/reasons`）

`POST /api/reasons` の例：

```json
{
  "interests": ["ゲーム", "ゲーム実況", "語学"],
  "cards": [
    { "occupationId": 313, "tag": "ゲーム", "interests": ["ゲーム実況", "ゲーム"] },
    { "occupationId": 114, "tag": "英語", "interests": ["語学"] }
  ]
}
```

```json
{
  "reasons": [
    { "occupationId": 313, "text": "…", "ai": true },
    { "occupationId": 114, "text": "…", "ai": true }
  ],
  "source": "gemini"
}
```

- どの仕事を見せるかは、画面がデータから決める。API は、決まったカードに1文を添えるだけ
- 1文は Gemini がつくる。Gemini の設定がないとき、呼び出しに失敗したとき、長すぎる文が返ったときは、決まった文（「あなたが選んだ「…」とつながる仕事です。」）を返す。`ai` は、そのカードの文を Gemini がつくったか
- 同じ選び方には、前につくった文を返す（Gemini を何度も呼ばない）
- タグの名前は、20字までの記号のない語だけを受け付ける（Gemini に長い文を渡さないため）
- 教育向けのアプリなので、Gemini の安全フィルタは既定より厳しくしている

## localhost で動かす

Vertex AI を使うときは、先に `gcloud auth application-default login` でログインしておく。プロジェクトで Vertex AI API（`aiplatform.googleapis.com`）が有効になっている必要がある。

```bash
cd services/api
cp .env.example .env     # GOOGLE_CLOUD_PROJECT を自分のプロジェクトにする
uv sync
uv run --env-file .env uvicorn app.main:app --reload --port 8000
```

- http://localhost:8000/api/health が `"llm": "vertex"` なら、Gemini を呼ぶ設定になっている
- 画面から呼ぶときは、`apps/web` で `.env.example` を `.env.local` にコピーしてから `pnpm dev` する
