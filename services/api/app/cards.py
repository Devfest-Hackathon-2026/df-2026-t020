"""職業カードのデータ（apps/web/public/data/occupation_cards.json）を読む。

JSON は jobs/map-builder の export_cards.py が書き出す生成物で、画面と同じファイルを読む。
置き場所は環境変数 CARDS_PATH で変えられる（コンテナに入れるときなど）。
"""

import json
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any


def default_path() -> Path:
    """リポジトリの中で動かすときの置き場所。

    コンテナでは階層が浅く、リポジトリのルートがないので、CARDS_PATH があるときは呼ばない
    """
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "apps" / "web" / "public" / "data" / "occupation_cards.json"


@dataclass(frozen=True)
class Cards:
    occupations: dict[int, dict[str, Any]]
    # 職業カードの「好きなもの」タグ（meta.tags）
    tags: frozenset[str]
    # 大分類のコード → 名前（meta.majors）
    majors: dict[str, str]
    # タグ → 距離 → 職業ID（by_tag）
    by_tag: dict[str, dict[str, list[int]]]

    def link(self, occupation_id: int, tag: str) -> dict[str, Any] | None:
        """その職業の、そのタグとのつながり。なければ None"""
        occupation = self.occupations.get(occupation_id)
        if occupation is None:
            return None
        return next((t for t in occupation["tags"] if t["tag"] == tag), None)


@cache
def load() -> Cards:
    env_path = os.environ.get("CARDS_PATH")
    path = Path(env_path) if env_path else default_path()
    data = json.loads(path.read_text(encoding="utf-8"))
    return Cards(
        occupations={o["id"]: o for o in data["occupations"]},
        tags=frozenset(data["meta"]["tags"]),
        majors=dict(data["meta"].get("majors") or {}),
        by_tag=dict(data.get("by_tag") or {}),
    )
