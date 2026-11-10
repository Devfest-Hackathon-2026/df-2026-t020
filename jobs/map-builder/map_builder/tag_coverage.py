"""「好きなもの」タグごとに、対応しそうな職業の数と大分類の散らばりを粗く数える。

これは Gemini で対応付ける前の「タグとして成り立つか」の確認用。
- キーワード：職業名・別名・簡易説明文・どんな職業か に語が含まれるか
  （身近〜少し遠い仕事が拾える）
- 知識：教科系のタグは、job tag の「知識」の数値がしきい値以上の職業
  （意外な仕事も拾える）

使い方（jobs/map-builder で）:
  uv run python -m map_builder.tag_coverage \
      ../../.data/occupations.json ../../.data/tag_coverage.csv
"""

import collections
import csv
import json
import sys

from map_builder import tags

KEYWORDS = tags.KEYWORDS
KNOWLEDGE_TAGS = tags.SUBJECT_TAGS
KNOWLEDGE_THRESHOLD = tags.SUBJECT_THRESHOLD


def text_of(o):
    return " ".join([o["name"], *o["aliases"], o["summary"], o["what"]])


def main(src, out_csv):
    with open(src, encoding="utf-8") as f:
        occ = json.load(f)["occupations"]
    rows = []
    for tag, words in KEYWORDS.items():
        hits = [o for o in occ if any(w in text_of(o) for w in words)]
        rows.append((tag, "キーワード", hits))
    for tag, keys in KNOWLEDGE_TAGS.items():
        hits = [
            o for o in occ if any(o["knowledge"].get(k, 0) >= KNOWLEDGE_THRESHOLD for k in keys)
        ]
        rows.append((tag, f"知識≥{KNOWLEDGE_THRESHOLD}", hits))

    with open(out_csv, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["タグ", "数え方", "職業数", "大分類の数", "大分類の内訳", "職業の例"])
        for tag, how, hits in rows:
            majors = collections.Counter(o["major_name"] for o in hits)
            w.writerow(
                [
                    tag,
                    how,
                    len(hits),
                    len(majors),
                    "／".join(f"{k}:{v}" for k, v in majors.most_common()),
                    "、".join(o["name"] for o in hits[:12]),
                ]
            )
            print(f"{tag:<16} {how:<8} 職業{len(hits):>4}  大分類{len(majors):>2}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
