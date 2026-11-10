# はじめての開発環境の準備（Windows）

手元（localhost）で画面と API を動かし、API から Vertex AI の Gemini を呼べるようにするまでの手順。
**最初の1回だけ**やればよい。コマンドは PowerShell で実行する。

鍵（サービスアカウントの JSON や API キー）は作らない。自分の Google アカウントでログインした情報（ADC）を使う。

## 0. 先にプロジェクトの管理者がやること

メンバーの Google アカウントを、使う Google Cloud プロジェクトに追加しておく。メンバーが自分でやる手順ではない。

| ロール | 何のため |
|---|---|
| Agent Platform User（`roles/aiplatform.user`。旧名「Vertex AI ユーザー」） | Gemini を呼ぶ |
| Service Usage ユーザー（`roles/serviceusage.serviceUsageConsumer`） | 手順 3 の `set-quota-project`（利用量をプロジェクトに付ける） |

```powershell
# 管理者が実行する（メールアドレスはメンバーの Google アカウント）
gcloud projects add-iam-policy-binding <プロジェクトID> --member="user:メンバー@gmail.com" --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding <プロジェクトID> --member="user:メンバー@gmail.com" --role="roles/serviceusage.serviceUsageConsumer"
```

コンソールの「IAM と管理」→「IAM」→「アクセスを許可」から追加してもよい。
Vertex AI API（`aiplatform.googleapis.com`）はプロジェクトで有効になっている前提。

## 1. ツールを入れる

| ツール | 入れ方 | 確認 |
|---|---|---|
| Node.js 22 以上 | https://nodejs.org/ から LTS を入れる | `node -v` |
| pnpm | `corepack enable`（`package.json` のバージョンが使われる） | `pnpm -v` |
| uv（Python の依存管理） | `winget install --id=astral-sh.uv -e` | `uv --version` |
| Google Cloud CLI | [インストーラ](https://cloud.google.com/sdk/docs/install)を実行し、画面の案内に従う | `gcloud --version` |

- 入れたあとは、**PowerShell を開き直す**（PATH が反映されるのは新しいウィンドウだけ）
- `corepack enable` で権限エラーが出たら、PowerShell を「管理者として実行」でやり直す

## 2. gcloud にログインして、プロジェクトを選ぶ

```powershell
gcloud init
```

- ブラウザが開くので、手順 0 で追加してもらった Google アカウントでログインする
- プロジェクトを聞かれたら、使うプロジェクト（`<プロジェクトID>`）を選ぶ
- これは **gcloud コマンド用**のログイン。プログラム（API）用のログインは次の手順で別にする

## 3. プログラム用のログイン（ADC）

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project <プロジェクトID>
```

- 1行目でまたブラウザが開く。手順 2 と同じアカウントでログインする
- ログイン情報は `%APPDATA%\gcloud\application_default_credentials.json` に保存される。**このファイルは人に渡さない・コミットしない**
- 1行目のあとに「quota project が見つからない」という警告が出ても、2行目を実行すれば直る

## 4. 動くか確かめる

```powershell
gcloud auth application-default print-access-token   # 長い文字列が出れば ADC は OK
```

続けて、ルートの README の「localhost で全体を動かす」の手順で API と画面を起動する。

- `services/api/.env` の `GOOGLE_CLOUD_PROJECT` を `<プロジェクトID>` にする
- http://localhost:8000/api/health が `"llm": "vertex"` なら、Gemini を呼ぶ設定になっている
- 画面でタグを選んで診断し、職業カードの「あなたとのつながり」が決まった文（「あなたが選んだ「…」とつながる仕事です。」）でなければ、Gemini まで通っている

## うまくいかないとき

API のターミナルにエラーが出る。

| エラー | 原因と直し方 |
|---|---|
| `403 PERMISSION_DENIED` | 手順 0 のロールが付いていない、または別のアカウントでログインしている。`gcloud auth list` でアカウントを確かめ、管理者に頼む |
| `404 NOT_FOUND`（モデル） | そのモデルがプロジェクトで使えない。`.env` の `GEMINI_MODEL` を変える（既定は `gemini-4-argon`） |
| `Could not automatically determine credentials` | 手順 3 をしていない。PowerShell を開き直してから API を起動し直す |
| quota project の警告・エラー | `gcloud auth application-default set-quota-project <プロジェクトID>` をもう一度 |
| `/api/health` が `"llm": "template"` | `services/api/.env` に `GOOGLE_GENAI_USE_VERTEXAI=true` と `GOOGLE_CLOUD_PROJECT` があるか確かめる |
| しばらく動いていたのに認証エラーになった | ログインの期限切れ。`gcloud auth application-default login` をやり直す |

## やらないこと

- サービスアカウントの鍵（JSON）を作る・ダウンロードする
- API キーを `.env` 以外に書く、`.env` をコミットする（`.gitignore` に入っている）
- `application_default_credentials.json` をチャットやリポジトリに貼る
