# 本番へのデプロイ（Firebase Hosting ＋ Cloud Run）

画面（`apps/web`）を Firebase Hosting に、API（`services/api`）を Cloud Run に置く手順です。
Hosting の `/api/**` は Cloud Run の `api` に転送されるので、画面と API は同じオリジンで動きます（`firebase.json`）。

コマンドは PowerShell で、リポジトリ直下で実行します。
はじめての人は、先に [setup.md](setup.md) で gcloud にログインしておいてください。

プロジェクト ID・サイト名・サービスアカウントは、このリポジトリには書いていません。下の `<プロジェクトID>`・`<サイト名>`・`<サービスアカウント名>` は、自分の環境の値に置き換えてください。

## 今の構成

| もの | 置き場所 | 設定 |
|---|---|---|
| 画面 | Firebase Hosting | サイトを2つ（`firebase.json` の target `primary` と `secondary`）。中身は同じ |
| API | Cloud Run のサービス `api`（asia-northeast1） | 公開アクセス・最大 3 インスタンス・サービスアカウント `<サービスアカウント名>` |
| API のコンテナ | Artifact Registry `asia-northeast1-docker.pkg.dev/<プロジェクトID>/api/api` | タグは commit のハッシュ |
| Gemini | Vertex AI（Cloud Run の環境変数で指定） | `GOOGLE_GENAI_USE_VERTEXAI=true`・`GOOGLE_CLOUD_PROJECT=<プロジェクトID>`・`GOOGLE_CLOUD_LOCATION=global` |

- Hosting には、サイトが2つある。`firebase.json` の `hosting` に同じ設定を2つ並べ、デプロイ先は target（`primary`・`secondary`）で指している。実際のサイト名は `.firebaserc` に書く（コミットしない。下の「デプロイ先を設定する」）。`firebase deploy --only hosting` で両方に置かれる。設定を変えるときは、両方を同じに直す
- Cloud Run のサービス名は **`api`** から変えない。`firebase.json` の rewrite がこの名前を指している
- サービスアカウント `<サービスアカウント名>@<プロジェクトID>.iam.gserviceaccount.com` には、Agent Platform User（`roles/aiplatform.user`、旧名「Vertex AI ユーザー」）だけを付けている。鍵は作らない
- main に push しても、自動ではデプロイされない。更新するたびに、下の手順を実行する

## 必要なもの

| もの | 確認 |
|---|---|
| プロジェクトのオーナー、または Cloud Run・Artifact Registry・Firebase Hosting を扱える権限 | — |
| Google Cloud CLI でログイン済み（ADC も） | `gcloud auth application-default print-access-token` |
| Docker Desktop（起動しておく） | `docker info` |
| Firebase CLI | `npm install -g firebase-tools` → `firebase --version` |

- Firebase CLI は、`firebase login` をしなくても gcloud のログイン情報（ADC）で動く
- `gcloud config get-value project` がプロジェクト番号（数字）になっていると、一部のコマンドがエラーになる。下のコマンドは `--project` を付けている

## API を更新する（Cloud Run）

```powershell
$TAG = git rev-parse --short HEAD
$IMAGE = "asia-northeast1-docker.pkg.dev/<プロジェクトID>/api/api:$TAG"

# リポジトリ直下からビルドする（職業データが apps/web にあるため。送るファイルは .dockerignore で絞っている）
docker build --platform linux/amd64 --provenance=false -f services/api/Dockerfile -t $IMAGE .
docker push $IMAGE

gcloud run deploy api --project <プロジェクトID> --region asia-northeast1 --image $IMAGE
```

- サービスアカウント・環境変数・公開アクセス・最大インスタンス数は、前の設定がそのまま引き継がれる
- `docker push` が認証エラーになったら、`gcloud auth configure-docker asia-northeast1-docker.pkg.dev` を1回実行する
- 確かめる：デプロイした画面の `/api/health` が `"llm": "vertex"` を返す

## デプロイ先を設定する（最初の1回）

`firebase.json` はサイト名を持たず、target（`primary`・`secondary`）だけを書いている。
実際のプロジェクトとサイトは、コミットしない `.firebaserc` に書く。

```powershell
Copy-Item .firebaserc.example .firebaserc
```

`.firebaserc` の `<プロジェクトID>`・`<サイト名>`・`<2つ目のサイト名>` を自分の値にする。サイトが1つだけなら、`firebase.json` の `hosting` から `secondary` の設定を消し、`.firebaserc` の `secondary` の行も消す。
`firebase target` で、target とサイトの対応を確かめられる。

## 画面を更新する（Firebase Hosting）

```powershell
pnpm install

# .env.local に NEXT_PUBLIC_API_BASE があると、本番の画面が localhost の API を呼んでしまう。ビルドの間だけ外す
Rename-Item apps/web/.env.local .env.local.bak
pnpm --filter eureka-web build
Rename-Item apps/web/.env.local.bak .env.local

firebase deploy --only hosting
```

- プロジェクトとサイトは `.firebaserc` で決まる（下の「デプロイ先を設定する」）
- `.env.local` がないときは、`Rename-Item` の2行はとばす
- ビルドで `Can't resolve 'pixi.js'` のようなエラーが出たら、`pnpm install` をしていない
- 確かめる：画面でタグを選び、会話から職業カードまで進める。デプロイ前の版に戻すときは、Firebase コンソールの「Hosting」→「リリース履歴」から戻せる

## 最初の1回にやったこと（記録）

もう一度ゼロから作るときのために、残しておく。

1. Firebase コンソールで「Google Cloud プロジェクトに Firebase を追加」から `<プロジェクトID>` を選んだ（Google アナリティクスは無効）。請求先アカウントが付いているので、Blaze プランになる
2. Cloud Run Admin API・Cloud Build API・Artifact Registry API を有効にした
3. サービスアカウント `<サービスアカウント名>` を作り、Agent Platform User を付けた
4. Artifact Registry に Docker のリポジトリ `api`（asia-northeast1）を作った
   ```powershell
   gcloud artifacts repositories create api --project <プロジェクトID> --repository-format=docker --location=asia-northeast1
   gcloud auth configure-docker asia-northeast1-docker.pkg.dev
   ```
5. 上の手順でイメージを push し、Cloud Run に設定つきでデプロイした
   ```powershell
   gcloud run deploy api --project <プロジェクトID> --region asia-northeast1 --image $IMAGE `
     --service-account <サービスアカウント名>@<プロジェクトID>.iam.gserviceaccount.com `
     --no-allow-unauthenticated --max-instances 3 `
     --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=<プロジェクトID>,GOOGLE_CLOUD_LOCATION=global
   ```
6. Cloud Run の `api` の「セキュリティ」→「認証」で「公開アクセスを許可する」にした（Hosting から呼ぶために必要）
7. `firebase deploy --only hosting` で画面を置いた
8. 提出・発表用に、2つ目のサイトを追加した（`firebase hosting:sites:create <サイト名>`）

## 気をつけること

- **費用**：だれでも API を呼べるので、呼ばれた分だけ Gemini の費用がかかる。最大インスタンス数（3）で上限を抑えている。API も、同じ IP アドレスからは1分に60回、インスタンス全体では1分に600回までしか受け付けない（超えると 429。`services/api/app/ratelimit.py`）。Cloud コンソールの「お支払い」→「予算とアラート」で予算アラートを付けておく
- **待ち時間**：Hosting から Cloud Run への転送は 60 秒で打ち切られる。`/api/recommend` は待ち時間の上限が 60 秒なので、遅いモデルに変えるときは注意（2026-11 時点で約 14 秒）
- **鍵を作らない**：Cloud Run はサービスアカウントで Vertex AI を呼ぶ。サービスアカウントの鍵（JSON）や API キーは作らない
- **Content-Security-Policy**：`firebase.json` で、スクリプト・通信・画像などの読み込み元を同じオリジンだけにしている（`eval` も不可）。外のサイトのスクリプトやフォント、別オリジンの API を足すときは、ここも直す。直さないと、本番でだけ動かない（`pnpm dev` には効かない）
