"""O*NET 31.0 Database（CSV版）を読み、知識項目を job tag と同じ名前にそろえた中間JSONを作る。

Gemini は呼ばない。日本語化と job tag との重複判定は onet_match、統合は world で行う。

使い方（jobs/map-builder で）:
  uv run python -m map_builder.onet ../../.data/onet ../../.data/onet_occupations.json

必要なファイル（.data/onet/ に置く。https://www.onetcenter.org/database.html の CSV 版）:
  occupation_data.csv, knowledge.csv, task_statements.csv, job_titles.csv, job_zones.csv

出典（CC BY 4.0。翻訳・加工した場合はその旨を示す）:
  O*NET 31.0 Database, U.S. Department of Labor, Employment and Training Administration (USDOL/ETA)
"""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

VERSION = "31.0"
SOURCE = (
    "This product includes information from the O*NET 31.0 Database by the U.S. Department "
    "of Labor, Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 "
    "license (https://creativecommons.org/licenses/by/4.0/). 日本語への翻訳・要約、職業分類の"
    "対応付け、数値の換算を行って作成。USDOL/ETA has not approved, endorsed, or tested these "
    "modifications. O*NET® is a trademark of USDOL/ETA."
)

FILES = {
    "occupation_data": "occupation_data.csv",
    "knowledge": "knowledge.csv",
    "tasks": "task_statements.csv",
    "job_titles": "job_titles.csv",
    "job_zones": "job_zones.csv",
}

# O*NET の知識33項目 → job tag の知識項目（occupations.KNOWLEDGE_TO_FACULTY の28項目）。
# job tag は O*NET を手本に作られており、項目は1対1で対応する。
# 学部に結びつけにくい5項目（Administrative, Customer and Personal Service, Transportation,
# Production and Processing, Public Safety and Security）は job tag 側と同じく使わない。
# 注意：O*NET の "English Language" は米国の母語（国語）なので「日本語の語彙・文法」に当てる。
# 教科タグ「英語」の根拠は "Foreign Language"（外国語の語彙・文法）。
KNOWLEDGE_EN_TO_JA = {
    "Administration and Management": "ビジネスと経営",
    "Economics and Accounting": "経済学・会計学",
    "Sales and Marketing": "販売・マーケティング",
    "Personnel and Human Resources": "人事労務管理",
    "Law and Government": "法律学、政治学",
    "Psychology": "心理学",
    "Sociology and Anthropology": "社会学",
    "Geography": "地理学",
    "Communications and Media": "コミュニケーションとメディア",
    "Education and Training": "教育訓練",
    "English Language": "日本語の語彙・文法",
    "Foreign Language": "外国語の語彙・文法",
    "History and Archeology": "歴史学・考古学",
    "Philosophy and Theology": "哲学・宗教学",
    "Fine Arts": "芸術",
    "Mathematics": "数学",
    "Physics": "物理学",
    "Chemistry": "化学",
    "Biology": "生物学",
    "Engineering and Technology": "工学",
    "Mechanical": "機械",
    "Building and Construction": "建築・建設",
    "Design": "設計",
    "Computers and Electronics": "コンピュータと電子工学",
    "Telecommunications": "通信技術",
    "Medicine and Dentistry": "医学・歯学",
    "Therapy and Counseling": "セラピーとカウンセリング",
    "Food Production": "農業・畜産業",
}

CODE = "O*NET-SOC Code"


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def to_float(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def load(dirpath, max_tasks=10, max_titles=12):
    """O*NET の CSV を読み、詳しいデータがある職業（Job Zone がある職業）だけを返す。"""
    d = Path(dirpath)
    missing = [name for name in FILES.values() if not (d / name).exists()]
    if missing:
        raise FileNotFoundError(f"{d} に次のファイルがありません: {', '.join(missing)}")

    base = {r[CODE]: r for r in read_csv(d / FILES["occupation_data"])}
    zones = {
        r[CODE]: int(float(r["Job Zone"]))
        for r in read_csv(d / FILES["job_zones"])
        if (r.get("Job Zone") or "").strip()
    }

    tasks = defaultdict(list)
    for r in read_csv(d / FILES["tasks"]):
        rank = 0 if (r.get("Task Type") or "").strip() == "Core" else 1
        tasks[r[CODE]].append((rank, r["Task"].strip()))

    titles = defaultdict(list)
    for r in read_csv(d / FILES["job_titles"]):
        t = (r.get("Job Title") or "").strip()
        if t and t not in titles[r[CODE]]:
            titles[r[CODE]].append(t)

    # 「Not Relevant」は LV の行に付くので、要素ごとに覚えて IM・LV の両方から除く
    rows = read_csv(d / FILES["knowledge"])
    not_relevant = {
        (r[CODE], r["Element Name"]) for r in rows if (r.get("Not Relevant") or "") == "Y"
    }
    know = defaultdict(lambda: {"IM": {}, "LV": {}})
    for r in rows:
        ja = KNOWLEDGE_EN_TO_JA.get(r["Element Name"])
        scale = r.get("Scale ID")
        if not ja or scale not in ("IM", "LV") or (r[CODE], r["Element Name"]) in not_relevant:
            continue
        v = to_float(r.get("Data Value"))
        if v is not None:
            know[r[CODE]][scale][ja] = v

    out = []
    for code in sorted(zones):
        if code not in base:
            continue
        b = base[code]
        k = know.get(code, {"IM": {}, "LV": {}})
        out.append(
            {
                "onet_code": code,
                "title": b["Title"].strip(),
                "description": b["Description"].strip(),
                "job_zone": zones[code],
                "job_titles": titles[code][:max_titles],
                # Core（中心的なタスク）を先に。同じ種類の中ではファイルの順
                "tasks": [t for _, t in sorted(tasks[code], key=lambda x: x[0])][:max_tasks],
                "knowledge_im": k["IM"],
                "knowledge_lv": k["LV"],
            }
        )
    meta = {
        "source": SOURCE,
        "version": VERSION,
        "count": len(out),
        "with_knowledge": sum(1 for o in out if o["knowledge_im"]),
    }
    return {"meta": meta, "occupations": out}


def main(argv=None):
    args = (argv if argv is not None else sys.argv)[1:]
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    src, out_path = args
    data = load(src)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in data["meta"].items() if k != "source"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
