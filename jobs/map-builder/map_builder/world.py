"""job tag と O*NET を1つの職業データ（occupations_world.json）にまとめる（Gemini は呼ばない）。

- onet_match で「同じ」と判定された O*NET の職業は追加しない（job tag 側に onet_codes として記録）
- 「近い」「なし」の O*NET の職業を、新しい職業として追加する（source="onet"）
- 知識の数値は尺度が違うので、「同じ」と判定された組を使って O*NET → job tag の尺度に換算する。
  知識の項目ごとに、平均と散らばりを job tag にそろえる1次式（標準化主軸回帰）を使う。
  ふつうの回帰（最小二乗）だと相関が弱いほど値が平均に縮み、
  O*NET の満点でも 2.5 に届かなくなるため。
  組が少ない項目は全項目まとめた式を使う。O*NET の IM と LV のうち、相関が高い方を使う。
  これで教科系タグの自動検査（tags.SUBJECT_THRESHOLD）を、両方の職業に同じ基準で使える

使い方（jobs/map-builder で）:
  uv run python -m map_builder.world ../../.data/occupations.json \\
      ../../.data/onet_occupations.json ../../.data/onet_match/onet_match_raw.jsonl \\
      ../../.data/occupations_world.json

  チームが onet_match_review.csv の「確認」列に NG と書いた職業は、
  --review でその CSV を渡すと除く。
"""

import argparse
import csv
import json
import math
import sys

from map_builder.occupations import MAJOR, knowledge_summary
from map_builder.onet import SOURCE as ONET_SOURCE
from map_builder.onet_match import load_raw

ADD_RELATIONS = ("近い", "なし")

# 載せない O*NET の職業（コード → 理由）。教育向けのアプリなので、賭け事の仕事は
# 「好きなもの」からのカードとして出さない
EXCLUDE_ONET = {
    "11-9071.00": "賭け事（Gambling Managers）",
    "33-9031.00": "賭け事（Gambling Surveillance Officers and Gambling Investigators）",
    "39-1013.00": "賭け事（First-Line Supervisors of Gambling Services Workers）",
    "39-3011.00": "賭け事（Gambling Dealers）",
    "39-3012.00": "賭け事（Gambling and Sports Book Writers and Runners）",
    "41-2012.00": "賭け事（Gambling Change Persons and Booth Cashiers）",
    "43-3041.00": "賭け事（Gambling Cage Workers）",
}


def fit_linear(pairs):
    """平均と散らばりをそろえる1次式 y = a*x + b（標準化主軸回帰）を当てはめ、(a, b, r) を返す。

    a = sign(r) * (y の標準偏差 / x の標準偏差)。尺度の換算に使う（個々の値の予測ではない）。
    """
    n = len(pairs)
    mx = sum(x for x, _ in pairs) / n
    my = sum(y for _, y in pairs) / n
    sxx = sum((x - mx) ** 2 for x, _ in pairs)
    syy = sum((y - my) ** 2 for _, y in pairs)
    sxy = sum((x - mx) * (y - my) for x, y in pairs)
    if sxx == 0 or syy == 0:
        return 0.0, my, 0.0
    r = sxy / math.sqrt(sxx * syy)
    a = math.copysign(math.sqrt(syy / sxx), r)
    return a, my - a * mx, r


def _fit(pairs):
    a, b, r = fit_linear(pairs)
    return {"a": round(a, 4), "b": round(b, 4), "r": round(r, 4), "pairs": len(pairs)}


def calibrate(jobtag_by_id, onet_by_code, matches, min_occupations=20, min_item_pairs=30):
    """「同じ」の組から、O*NET の知識の数値を job tag の尺度に換算する式を求める。"""
    same = [
        (onet_by_code[c], jobtag_by_id[m["match_id"]])
        for c, m in matches.items()
        if m["relation"] == "同じ" and c in onet_by_code and m["match_id"] in jobtag_by_id
    ]
    same = [(o, j) for o, j in same if j["knowledge"] and o["knowledge_im"]]
    if len(same) < min_occupations:
        raise ValueError(
            f"換算に使える「同じ」の組が {len(same)} 組しかありません"
            f"（{min_occupations} 組以上必要）。onet_match を先に最後まで実行してください"
        )

    def pairs_for(key, item=None):
        return [
            (o[key][k], j["knowledge"][k])
            for o, j in same
            for k in j["knowledge"]
            if k in o[key] and (item is None or k == item)
        ]

    compare = {s: _fit(pairs_for("knowledge_" + s.lower())) for s in ("IM", "LV")}
    best = max(compare, key=lambda s: compare[s]["r"])
    key = "knowledge_" + best.lower()
    items = {}
    for k in sorted({k for o, j in same for k in j["knowledge"] if k in o[key]}):
        p = pairs_for(key, k)
        if len(p) >= min_item_pairs:
            items[k] = _fit(p)
    return {
        "method": "項目ごとの標準化主軸回帰（組が少ない項目は全項目まとめた式）",
        "scale": best,
        **compare[best],
        "occupations": len(same),
        "items": items,
        "compare": compare,
    }


def convert(values, cal):
    out = {}
    for k, v in values.items():
        f = cal["items"].get(k, cal)
        out[k] = round(min(5.0, max(0.0, f["a"] * v + f["b"])), 3)
    return out


def onet_id(code):
    """O*NET-SOC コードから、変わらない数値IDを作る（例：15-1255.01 → 15125501）。"""
    return int(code.replace("-", "").replace(".", ""))


def read_rejected(review_csv):
    """確認CSVで「確認」列が NG の O*NET-SOC コード。"""
    if not review_csv:
        return set()
    with open(review_csv, encoding="utf-8-sig", newline="") as f:
        return {
            r["O*NET-SOC"]
            for r in csv.DictReader(f)
            if (r.get("確認（OK/NG/修正）") or "").strip().upper() == "NG"
        }


def build(jobtag_data, onet_data, matches, rejected=frozenset(), min_occupations=20):
    jobtag = jobtag_data["occupations"]
    jobtag_by_id = {o["id"]: o for o in jobtag}
    onet_by_code = {o["onet_code"]: o for o in onet_data["occupations"]}
    cal = calibrate(jobtag_by_id, onet_by_code, matches, min_occupations)

    same_codes = {}
    for c, m in matches.items():
        if m["relation"] == "同じ" and m["match_id"] in jobtag_by_id:
            same_codes.setdefault(m["match_id"], []).append(c)

    out = [
        {**o, "source": "jobtag", "onet_codes": sorted(same_codes.get(o["id"], []))} for o in jobtag
    ]

    added = 0
    for code in sorted(matches):
        m = matches[code]
        o = onet_by_code.get(code)
        if o is None or m["relation"] not in ADD_RELATIONS or code in rejected:
            continue
        if code in EXCLUDE_ONET:
            continue
        knowledge = convert(o[f"knowledge_{cal['scale'].lower()}"], cal)
        top, faculties = knowledge_summary(knowledge)
        out.append(
            {
                "id": onet_id(code),
                "name": m["name_ja"],
                "aliases": m["aliases_ja"] + [o["title"]],
                "major_code": m["major_code"],
                "major_name": MAJOR.get(m["major_code"], ""),
                "mhlw_code": "",
                "summary": m["summary_ja"],
                "what": m["what_ja"],
                "how_to_become": "",
                "conditions": "",
                "qualifications": [],
                "interest": {},
                "knowledge": knowledge,
                "top_knowledge": top,
                "related_faculties": faculties,
                "education": {},  # 米国の学歴データは日本の進路に当てはまらないので使わない
                "univ_ratio": None,
                "has_numeric": bool(knowledge),
                "source": "onet",
                "onet_code": code,
                "name_en": o["title"],
                "jp_presence": m["jp_presence"],
                "near_jobtag_id": m["match_id"] if m["relation"] == "近い" else None,
            }
        )
        added += 1

    ids = [o["id"] for o in out]
    if len(ids) != len(set(ids)):
        raise ValueError("職業IDが重複しています")
    meta = {
        "source": jobtag_data["meta"]["source"] + "／" + ONET_SOURCE,
        "sources": [jobtag_data["meta"]["source"], ONET_SOURCE],
        "count": len(out),
        "count_jobtag": len(jobtag),
        "count_onet_added": added,
        "count_onet_same": sum(len(v) for v in same_codes.values()),
        "count_onet_rejected": len(rejected & set(matches)),
        "count_onet_excluded": len(set(EXCLUDE_ONET) & set(matches)),
        "excluded_onet": EXCLUDE_ONET,
        "count_onet_unmatched": len(set(onet_by_code) - set(matches)),
        "knowledge_calibration": cal,
    }
    return {"meta": meta, "occupations": out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobtag", help="occupations.json（job tag）")
    ap.add_argument("onet", help="onet_occupations.json")
    ap.add_argument("matches", help="onet_match_raw.jsonl")
    ap.add_argument("out", help="出力（occupations_world.json）")
    ap.add_argument("--review", default="", help="onet_match_review.csv（NG の行を除く）")
    args = ap.parse_args()

    with open(args.jobtag, encoding="utf-8") as f:
        jobtag = json.load(f)
    with open(args.onet, encoding="utf-8") as f:
        onet = json.load(f)
    data = build(jobtag, onet, load_raw(args.matches), read_rejected(args.review))
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(
        json.dumps(
            {k: v for k, v in data["meta"].items() if k not in ("source", "sources")},
            ensure_ascii=False,
            indent=1,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
