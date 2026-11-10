"""job tag の解説系・簡易版数値系CSVを結合し、アプリ用の職業JSONを作る。

使い方（jobs/map-builder で）:
  uv run python -m map_builder.occupations \
      ../../.data/jobtag/IPD_DL_description_7_01.csv \
      ../../.data/jobtag/IPD_DL_numeric_7_00.csv \
      ../../.data/occupations.json

出典（加工して作成）:
  独立行政法人労働政策研究・研修機構（JILPT）作成
  「職業情報データベース 解説系ダウンロードデータ ver.7.01」
  「職業情報データベース 簡易版数値系ダウンロードデータ ver.7.00」
  職業情報提供サイト（job tag）よりダウンロード（https://shigoto.mhlw.go.jp/User/download）を加工して作成
"""

import csv
import io
import json
import sys

# 厚生労働省編職業分類（2022年改定）の大分類
MAJOR = {
    "01": "管理的職業",
    "02": "研究・技術の職業",
    "03": "法務・経営・文化芸術等の専門的職業",
    "04": "医療・看護・保健の職業",
    "05": "保育・教育の職業",
    "06": "事務的職業",
    "07": "販売・営業の職業",
    "08": "福祉・介護の職業",
    "09": "サービスの職業",
    "10": "警備・保安の職業",
    "11": "農林漁業の職業",
    "12": "製造・修理・塗装・製図等の職業",
    "13": "配送・輸送・機械運転の職業",
    "14": "建設・土木・電気工事の職業",
    "15": "運搬・清掃・包装・選別等の職業",
}

# 知識項目 → 学べる学部系統（ルート比較の材料。チームで確認する）
KNOWLEDGE_TO_FACULTY = {
    "ビジネスと経営": "経済・経営・商",
    "経済学・会計学": "経済・経営・商",
    "販売・マーケティング": "経済・経営・商",
    "人事労務管理": "経済・経営・商",
    "法律学、政治学": "法・政治",
    "心理学": "心理（文・教育・人間科学）",
    "社会学": "社会",
    "地理学": "社会・地理",
    "コミュニケーションとメディア": "社会・メディア",
    "教育訓練": "教育",
    "日本語の語彙・文法": "文（日本語・日本文学）",
    "外国語の語彙・文法": "外国語・国際",
    "歴史学・考古学": "文（史学）",
    "哲学・宗教学": "文（哲学）",
    "芸術": "芸術",
    "数学": "理（数学）",
    "物理学": "理・工",
    "化学": "理・工・薬",
    "生物学": "理・農・医療系",
    "工学": "工",
    "機械": "工（機械）",
    "建築・建設": "工（建築・土木）",
    "設計": "工・芸術（デザイン）",
    "コンピュータと電子工学": "情報・工（電気電子）",
    "通信技術": "情報・工（電気電子）",
    "医学・歯学": "医・歯",
    "セラピーとカウンセリング": "看護・保健・リハビリ",
    "農業・畜産業": "農",
}

SOURCE = (
    "独立行政法人労働政策研究・研修機構（JILPT）作成"
    "「職業情報データベース 解説系ダウンロードデータ ver.7.01」"
    "「同 簡易版数値系ダウンロードデータ ver.7.00」"
    "職業情報提供サイト（job tag）よりダウンロード"
    "（https://shigoto.mhlw.go.jp/User/download）を加工して作成"
)

EDU_KEYS = [
    "高卒未満",
    "高卒",
    "専門学校卒",
    "短大卒",
    "高専卒",
    "大卒",
    "修士課程卒（修士と同等の専門職学位を含む）",
    "博士課程卒",
]


def read_rows(path):
    with open(path, "rb") as f:
        raw = f.read()
    for enc in ("utf-8-sig", "cp932"):
        try:
            return list(csv.reader(io.StringIO(raw.decode(enc))))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"文字コードを判定できません: {path}")


def find_header(rows):
    """「収録番号」「職業名」が並ぶ行を列見出しとみなす（行位置はファイルごとに違う）。"""
    for i, r in enumerate(rows):
        if "収録番号" in r and "職業名" in r:
            return i
    raise ValueError("列見出し行が見つかりません")


def to_float(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def load_description(path):
    rows = read_rows(path)
    h = find_header(rows)
    hdr = rows[h]
    col = {name: i for i, name in enumerate(hdr) if name}
    out = {}
    for r in rows[h + 2 :]:  # 見出しの次の行は識別コード
        if len(r) < len(hdr) or not r[col["収録番号"]].strip():
            continue
        no = int(r[col["収録番号"]])
        aliases = [r[i] for name, i in col.items() if name.startswith("別名") and r[i].strip()]
        quals = [r[i] for name, i in col.items() if name.startswith("関連資格") and r[i].strip()]
        main_code = r[col["主な厚労省編職業分類"]].strip()
        major = main_code.split("_")[0] if main_code else ""
        out[no] = {
            "id": no,
            "name": r[col["職業名"]].strip(),
            "aliases": aliases,
            "major_code": major,
            "major_name": MAJOR.get(major, ""),
            "mhlw_code": main_code,
            "summary": r[col["簡易説明文"]].strip(),
            "what": r[col["どんな職業か"]].strip(),
            "how_to_become": r[col["就くには"]].strip(),
            "conditions": r[col["労働条件の特徴"]].strip(),
            "qualifications": quals,
        }
    return out


def load_numeric(path):
    rows = read_rows(path)
    h = find_header(rows)
    hdr = rows[h]
    col = {name: i for i, name in enumerate(hdr) if name}
    riasec = ["現実的", "研究的", "芸術的", "社会的", "企業的", "慣習的"]
    out = {}
    for r in rows[h + 2 :]:
        if len(r) < 3 or not r[col["収録番号"]].strip():
            continue
        no = int(r[col["収録番号"]])
        knowledge = {}
        for k in KNOWLEDGE_TO_FACULTY:
            v = to_float(r[col[k]]) if k in col else None
            flag = r[col[k + "_無関係フラグ"]].strip() if (k + "_無関係フラグ") in col else ""
            if v is not None and flag != "1":
                knowledge[k] = v
        edu = {k: to_float(r[col[k]]) for k in EDU_KEYS if k in col}
        edu = {k: v for k, v in edu.items() if v is not None}
        out[no] = {
            "interest": {
                k: v for k in riasec if k in col and (v := to_float(r[col[k]])) is not None
            },
            "knowledge": knowledge,
            "education": edu,
        }
    return out


def knowledge_summary(knowledge, n=5):
    """知識の上位 n 項目と、そこから導く学部系統（重複なし）を返す。O*NET の職業にも使う。"""
    top = [k for k, _ in sorted(knowledge.items(), key=lambda kv: -kv[1])[:n]]
    faculties = []
    for k in top:
        f = KNOWLEDGE_TO_FACULTY[k]
        if f not in faculties:
            faculties.append(f)
    return top, faculties


def build(desc_path, num_path):
    """2つのCSVを読み、{"meta": ..., "occupations": [...]} を返す。"""
    desc = load_description(desc_path)
    num = load_numeric(num_path)
    occupations = []
    for no, d in sorted(desc.items()):
        n = num.get(no, {})
        edu = n.get("education", {})
        # 学歴は合計が1を超える職業があり、複数回答の比率とみられる
        # （定義は xlsx 版の第2シートで要確認）。
        # そのため合算せず、「大卒」の比率だけを目安として使う。
        univ = edu.get("大卒") if edu else None
        top_knowledge, faculties = knowledge_summary(n.get("knowledge", {}))
        occupations.append(
            {
                **d,
                "interest": n.get("interest", {}),
                "knowledge": n.get("knowledge", {}),
                "top_knowledge": top_knowledge,
                "related_faculties": faculties,
                "education": edu,
                "univ_ratio": round(univ, 3) if univ is not None else None,
                "has_numeric": no in num,
            }
        )
    meta = {
        "source": SOURCE,
        "count": len(occupations),
        "with_numeric": sum(o["has_numeric"] for o in occupations),
    }
    return {"meta": meta, "occupations": occupations}


def main(argv=None):
    args = (argv if argv is not None else sys.argv)[1:]
    if len(args) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    desc_path, num_path, out_path = args
    data = build(desc_path, num_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(json.dumps(data["meta"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
