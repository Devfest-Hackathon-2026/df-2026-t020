"""フロントエンド用の職業カードデータ（occupation_cards.json）を書き出す（Gemini は呼ばない）。

occupations_world.json（職業）と tag_map_raw.jsonl（タグの下書き）を1つにまとめ、
画面で使わない数値は落とす。タグごとの索引（by_tag）も付ける。
長い説明（仕事内容・就くには）は容量の7割を占めるので、別ファイルに分ける:
  occupation_cards.json    カード一覧用（1MB 未満。apps/web に置ける）
  occupation_details.json  {職業ID: {what, how_to_become, top_knowledge}}。カードを開いたときに読む

使い方（jobs/map-builder で）:
  uv run python -m map_builder.export_cards ../../.data/occupations_world.json \\
      ../../.data/tag_map_v2/tag_map_raw.jsonl ../../.data/occupation_cards.json \\
      --review ../../.data/tag_map_v2/tag_map_review.csv

  --review を渡すと、確認CSVの「確認」列が NG のタグを除き、OK・修正 のタグを確認済みにする。
"""

import argparse
import csv
import json
import sys
from collections import defaultdict
from datetime import UTC, datetime

from map_builder.occupations import MAJOR
from map_builder.tags import ALL_TAGS, HOBBY_TAGS, SUBJECT_TAGS

DISTANCES = ["身近", "少し遠い", "意外"]
ATTRIBUTION_JA = (
    "職業データ：職業情報提供サイト（job tag）の職業情報データベース（JILPT作成）を加工して作成／"
    "O*NET 31.0 Database（米国労働省 USDOL/ETA、CC BY 4.0）を翻訳・加工して作成"
)


def load_tag_map(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                r = json.loads(line)
                out[r["id"]] = r
    return out


def load_review(path):
    """{(職業ID, タグ): "OK" | "NG" | "修正"}。空欄は入れない。"""
    if not path:
        return {}
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            v = (r.get("確認（OK/NG/修正）") or "").strip().upper()
            if v and r.get("タグ"):
                out[(int(r["職業ID"]), r["タグ"])] = v
    return out


def card(o, tm, review):
    tags = []
    for t in (tm or {}).get("tags", []):
        status = review.get((o["id"], t["tag"]))
        if status == "NG":
            continue
        tags.append({**t, "reviewed": status in ("OK", "修正")})
    c = {
        "id": o["id"],
        "name": o["name"],
        "aliases": o["aliases"][:3],
        "source": o.get("source", "jobtag"),
        "jp_presence": o.get("jp_presence") or "日本にもある",
        "major_code": o["major_code"],  # 名前は meta.majors で引く（容量を減らすため）
        "summary": o["summary"],
        "related_faculties": o["related_faculties"],
        "familiarity": (tm or {}).get("familiarity"),
        "tagged": tm is not None,
        "tags": tags,
    }
    if c["source"] == "onet":
        c["onet_code"] = o["onet_code"]
        c["name_en"] = o["name_en"]
    return c


def build(world, tag_map, review=None):
    review = review or {}
    cards = [card(o, tag_map.get(o["id"]), review) for o in world["occupations"]]
    by_tag = {t: {d: [] for d in DISTANCES} for t in ALL_TAGS}
    for c in cards:
        for t in c["tags"]:
            by_tag[t["tag"]][t["distance"]].append(c["id"])
    counts = defaultdict(int)
    for c in cards:
        counts[c["source"]] += 1
    meta = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status": "draft",
        "attribution_ja": ATTRIBUTION_JA,
        "sources": world["meta"].get("sources", [world["meta"]["source"]]),
        "count": len(cards),
        "count_jobtag": counts["jobtag"],
        "count_onet": counts["onet"],
        "count_tagged": sum(c["tagged"] for c in cards),
        "count_tag_links": sum(len(c["tags"]) for c in cards),
        "count_reviewed_links": sum(t["reviewed"] for c in cards for t in c["tags"]),
        "tags": ALL_TAGS,
        "hobby_tags": HOBBY_TAGS,
        "subject_tags": list(SUBJECT_TAGS),
        "distances": DISTANCES,
        "majors": MAJOR,
    }
    details = {
        str(o["id"]): {
            "what": o["what"],
            "how_to_become": o.get("how_to_become", ""),
            "top_knowledge": o["top_knowledge"],
        }
        for o in world["occupations"]
    }
    return {"meta": meta, "occupations": cards, "by_tag": by_tag}, details


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("world", help="occupations_world.json（または occupations.json）")
    ap.add_argument("tag_map", help="tag_map_raw.jsonl")
    ap.add_argument("out", help="出力（occupation_cards.json）")
    ap.add_argument("--review", default="", help="tag_map_review.csv（NG を除き、OK を確認済みに）")
    args = ap.parse_args()
    with open(args.world, encoding="utf-8") as f:
        world = json.load(f)
    data, details = build(world, load_tag_map(args.tag_map), load_review(args.review))
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    details_path = args.out.replace("occupation_cards", "occupation_details")
    if details_path == args.out:
        details_path = args.out.removesuffix(".json") + "_details.json"
    with open(details_path, "w", encoding="utf-8") as f:
        json.dump(details, f, ensure_ascii=False, separators=(",", ":"))
    print(f"書き出し: {args.out} / {details_path}")
    m = data["meta"]
    print(json.dumps({k: m[k] for k in m if k.startswith("count")}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
