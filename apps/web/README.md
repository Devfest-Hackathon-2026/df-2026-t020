# web

画面（フロントエンド）。Firebase Hosting で配信する。

- 技術：Next.js 16（App Router・`output: "export"` の静的書き出し）・React 19・CSS Modules
- 配信：`firebase.json` の `hosting.public` が `apps/web/out` を指す
- tsconfig：`tsconfig.base.json` を extends し、DOM・JSX・Next プラグイン・`@/*`（`apps/web/` 直下）だけ追加
- API：`/api/**` を同一オリジンで呼ぶ（Hosting が Cloud Run の `api` に rewrite）
- ホームは「自分のことをタグで選ぶ（4回）→ 選択肢で答える会話 → 職業カード」

## 開発

リポジトリ直下で依存関係を入れてから、`apps/web` で実行する。

```bash
pnpm install                 # リポジトリ直下で
cd apps/web
pnpm dev                     # http://localhost:3000
pnpm build                   # 静的書き出し → out/
pnpm exec next typegen && pnpm exec tsc --noEmit   # 型チェック
```

- 静的書き出しなので、サーバーで `searchParams` を読んだり、`cacheComponents`（PPR）を使ったりはできない

## 画面

全ページの上にヘッダー（Eureka）、左にサイドバー（ホーム・仕事の街・過去の結果・業界地図の一覧）を出す。

| パス | 内容 |
|---|---|
| `/` | 自分のこと（好きなもの・好きな関わり方・得意なこと・大事にしたいこと）を選ぶ → 会話（3〜6回。毎回「知る → 反応 → 考える」）→ 職業カード。選んだタグと会話は保存しない |
| `/history` | 過去の結果。診断の結果をブラウザ（localStorage）に残したものを、新しい順に見返す（`data/resultHistory.ts`） |
| `/map` | 仕事の街（業界地図の入口）。1,000件の仕事が「街のどこで働いているか」で区画に分かれて立つ2.5Dの地図。人を押すと職業カード。PixiJS で描く |
| `/map/[slug]` | 業界地図（`data/industries.ts` の業界ごと）。その業界の仕事を職業カードの一覧で出す |

- 会話の「知る」（世界の話と仕事3件）と「考える」（問いと選択肢）は API（`/api/chat`）が Gemini でつくる。仕事には「知らなかった／気になる／ピンとこない」を付けられる
- 結果は「会話で出会った仕事」（気になる仕事と、知らなかった仕事の数）と、API（`/api/recommend`）が会話と反応から1,000職業の中で選んだ仕事
- RIASEC の上位タイプは画面に出さず、API への入力にだけ使う
- Gemini が使えないときは、職業データから選んだ仕事と決まった3問、データでの選び方（`pickCards`）で最後まで動く

## タグの中身を変えるとき

- タグと重みは `data/tags.ts`。4回分のタグを `ROUNDS`（好きなもの・好きな関わり方・得意なこと・大事にしたいこと）に並べる。1つのタグは `["名前", "重み", [子タグ...]]` で、重み "R2A1" は R に2点・A に1点。子タグを持つのは好きなものの回だけ
- 好きなものの回のタグは、職業カードのタグ（`data/cardTags.ts`）と同じ名前にそろえる
- RIASEC のタイプ定義・採点（合計・上位3つ）は `data/riasec.ts`
- 画面は `components/CareerFlow.tsx`（流れ）・`HobbyPicker.tsx`（タグ選択）・`ChatStep.tsx`（会話）・`JobResults.tsx`（職業カード）

## 職業カード

- データは `public/data/occupation_cards.json`。`jobs/map-builder` の `export_cards.py` が書き出す生成物なので、手で直さず、書き出し直したものと置き換える
- ふだんは、API（`/api/recommend`）が選んだ職業 ID と理由の1文を、このデータと合わせて出す
- 代わりの道（Gemini が選べないとき）：興味タグと職業カードのタグ（23個）の対応 `data/cardTags.ts`、選び方 `data/jobCards.ts` の `pickCards`、理由の1文 `data/reasons.ts`（`/api/reasons`）
- カードを出すときは、出典（`meta.attribution_ja`）を必ず出す（データの利用条件）
- localhost で API を別に動かすときは、`.env.example` を `.env.local` にコピーして `pnpm dev` する（`NEXT_PUBLIC_API_BASE` に API のオリジンが入る）
