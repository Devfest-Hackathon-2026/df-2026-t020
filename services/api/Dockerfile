# 公開 API（services/api）を Cloud Run で動かすためのコンテナ。
#
# ビルドはリポジトリのルートから行う（職業データが apps/web にあるため）。
#   docker build -f services/api/Dockerfile .
# Cloud Run の「リポジトリから継続的にデプロイ」でも、Dockerfile の場所に
# /services/api/Dockerfile を指定すれば、ルートからビルドされる。
# 入れるファイルはルートの .dockerignore で絞っている。

FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 依存だけ先に入れる（コードを変えても、このレイヤーは使い回される）
COPY services/api/pyproject.toml services/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY services/api/app ./app
# 画面と同じ職業データを API にも入れる（app/cards.py は CARDS_PATH を読む）
COPY apps/web/public/data/occupation_cards.json ./data/occupation_cards.json
ENV CARDS_PATH=/app/data/occupation_cards.json \
    PATH="/app/.venv/bin:$PATH"

# root で動かさない
RUN useradd --create-home --uid 10001 app
USER app

# Cloud Run は PORT（既定 8080）で待ち受けることを求める
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
