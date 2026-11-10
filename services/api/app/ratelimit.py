"""Gemini を呼ぶ API の回数を抑える（費用と、いたずらへの備え）。

だれでも呼べる API なので、短い時間に呼びすぎたら 429 を返す。
- 呼び出し元（IP アドレス）ごとの上限：RATE_LIMIT_PER_MINUTE（既定 60 回／分。0 で止める）
- インスタンス全体の上限：RATE_LIMIT_GLOBAL_PER_MINUTE（既定 600 回／分。0 で止める）
  IP アドレスは X-Forwarded-For から読むので、偽ることができる。全体の上限は、そのときの備え。

数えた回数はメモリに持つ（データベースを使わない）。Cloud Run のインスタンスごとに数えるので、
全体では「上限 × インスタンスの数（最大 3）」まで通る。
共有の置き場（Redis など）を使わないので、インスタンスをまたいだ正確な数え方ではない。
"""

import os
import threading
import time
from collections import deque

from fastapi import HTTPException, Request

WINDOW_SECONDS = 60.0
DEFAULT_PER_CLIENT = 60
DEFAULT_GLOBAL = 600
# 覚えておく呼び出し元の数の上限（メモリを使いすぎないため。超えたら古い順に忘れる）
MAX_CLIENTS = 10_000


def _limit(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, default)))
    except ValueError:
        return default


def client_id(request: Request) -> str:
    """呼び出し元の IP アドレス。Hosting と Cloud Run の手前のプロキシが X-Forwarded-For に入れる"""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._clients: dict[str, deque[float]] = {}
        self._all: deque[float] = deque()

    def clear(self) -> None:
        with self._lock:
            self._clients.clear()
            self._all.clear()

    def allow(self, client: str, now: float | None = None) -> bool:
        """呼んでよければ数えて True。上限を超えていれば数えずに False"""
        per_client = _limit("RATE_LIMIT_PER_MINUTE", DEFAULT_PER_CLIENT)
        overall = _limit("RATE_LIMIT_GLOBAL_PER_MINUTE", DEFAULT_GLOBAL)
        now = time.monotonic() if now is None else now
        oldest = now - WINDOW_SECONDS
        with self._lock:
            while self._all and self._all[0] <= oldest:
                self._all.popleft()
            calls = self._clients.get(client)
            if calls is not None:
                while calls and calls[0] <= oldest:
                    calls.popleft()
            if overall and len(self._all) >= overall:
                return False
            if per_client and calls is not None and len(calls) >= per_client:
                return False
            if calls is None:
                if len(self._clients) >= MAX_CLIENTS:
                    # dict は入れた順に並ぶので、先頭がいちばん古い
                    self._clients.pop(next(iter(self._clients)))
                calls = self._clients[client] = deque()
            calls.append(now)
            self._all.append(now)
            return True


limiter = RateLimiter()


def check(request: Request) -> None:
    """FastAPI の依存関係。上限を超えていたら 429 を返す"""
    if not limiter.allow(client_id(request)):
        raise HTTPException(
            status_code=429,
            detail="アクセスが集中しています。少し待ってから、もう一度試してください。",
            headers={"Retry-After": str(int(WINDOW_SECONDS))},
        )
