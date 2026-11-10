# Eureka

「Eureka」は、DevFest GDGoC Japan Hackathon 2026 の作品です（カテゴリー：教育）。進路や仕事について悩んでいる大学生（学部生）が好きなことをタグで選び、Gemini との短い会話に答えると、約1,000件の職業データから、まだ知らないかもしれない仕事を職業カードで紹介する。紹介した仕事は、2.5Dの「仕事の街」と業界ページでも見られる。

## 構成

pnpm のモノレポ。フロントは TypeScript（pnpm ワークスペース）、バックエンドは Python（各ディレクトリで uv）。

```
.
├── apps/
│   └── web/              画面（Next.js 静的書き出し）→ Firebase Hosting
├── services/
│   └── api/              公開 API（FastAPI）→ Cloud Run
├── jobs/
│   └── map-builder/      職業カードのデータを作るバッチ（手元で動かす）
├── docs/
│   ├── architecture.md   アーキテクチャと設計の約束
│   ├── setup.md          はじめての開発環境の準備
│   └── deploy.md         本番へのデプロイ（Firebase Hosting ＋ Cloud Run）
├── firebase.json         Hosting の設定（/api/** → Cloud Run）
├── pnpm-workspace.yaml
└── tsconfig.base.json    TypeScript 共通設定（apps/web が extends する）
```

詳しくは [docs/architecture.md](docs/architecture.md) と各ディレクトリの README を参照。

## localhost で全体を動かす

画面（Next.js）と API（FastAPI）を別々に動かし、API から Vertex AI の Gemini を呼ぶ。Firebase Hosting と Cloud Run には置かない。

```bash
pnpm install                                    # リポジトリ直下で
gcloud auth application-default login           # Vertex AI を使うとき（最初の1回。詳しくは docs/setup.md）

# API（ターミナル1）
cd services/api
cp .env.example .env                            # GOOGLE_CLOUD_PROJECT を自分のプロジェクトにする
uv sync
uv run --env-file .env uvicorn app.main:app --reload --port 8000

# 画面（ターミナル2）
cd apps/web
cp .env.example .env.local                      # 画面から http://localhost:8000 の API を呼ぶ
pnpm dev                                        # http://localhost:3000
```

- 好きなことを選ぶ → 会話（3〜6回。毎回、Gemini が世界の話と知らないかもしれない仕事を見せ、反応と問いへの答えをもらう）→ 会話で気になった仕事と、Gemini が1,000職業から選んだ職業カード
- Gemini の設定がないときは、会話は職業データから選んだ仕事と決まった3問になり、職業カードは選んだ好きなことからデータで選ぶ。流れは最後まで動く
- 職業カードのデータ（`apps/web/public/data/occupation_cards.json`）は、`jobs/map-builder` で事前に作ったもの
- `pnpm` が見つからないときは、`corepack pnpm install`・`corepack pnpm dev` のように `corepack` を付けて動かす

## 本番（Firebase）にデプロイする

画面は Firebase Hosting、API は Cloud Run に置いている。main に push しても自動ではデプロイされないので、更新するときは [docs/deploy.md](docs/deploy.md) の手順を実行する。

## 必要なツール

- Node.js 22 以上・pnpm（`corepack enable` で `package.json` の `packageManager` のバージョンが使われる）
- [uv](https://docs.astral.sh/uv/)（Python の依存管理）
- Google Cloud CLI（`gcloud`）・Firebase CLI
- Docker Desktop（API を Cloud Run にデプロイするときだけ）

はじめての人は、ツールの入れ方と Google Cloud へのログイン（ADC）を [docs/setup.md](docs/setup.md) の順にやる。

## 秘密情報の扱い

API キーやサービスアカウントの鍵は作らない。Gemini は、手元では自分の Google アカウントのログイン情報（ADC）で、本番では Cloud Run のサービスアカウントで呼ぶ。

- 設定は `.env`（API）と `.env.local`（画面）に書き、コミットしない（`.gitignore` に入れてある）
- リポジトリには、値を入れていない `.env.example` だけを置いている

## ライセンス

[MIT License](LICENSE) です。ほかのライセンスにしたいときは、LICENSE を書き換えてください。
