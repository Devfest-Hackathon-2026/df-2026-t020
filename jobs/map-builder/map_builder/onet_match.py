"""O*NET の職業ごとに、job tag に同じ職業があるかを判定し、日本語の名前と説明を下書きする。

Gemini（Vertex AI、構造化出力）で下書きする。
英語の説明を日本語に直す・job tag の職業と照らし合わせる、の両方を1回の呼び出しで行う。

使い方（jobs/map-builder で）:
  # プロンプトだけ確認（Gemini を呼ばない）
  uv run python -m map_builder.onet_match ../../.data/occupations.json \\
      ../../.data/onet_occupations.json ../../.data/onet_match --model <モデル名> --dry-run
  # 本実行（途中で止まっても、もう一度実行すれば続きから）
  uv run python -m map_builder.onet_match ../../.data/occupations.json \\
      ../../.data/onet_occupations.json ../../.data/onet_match --model <モデル名>

出力:
  onet_match_raw.jsonl    Gemini の返答（1行＝1職業）
  onet_match_review.csv   チーム確認用。「確認」「修正メモ」列を埋める
"""

import argparse
import csv
import enum
import json
import sys
import time
from pathlib import Path

from pydantic import BaseModel, Field

from map_builder.gemini_call import (
    add_gemini_args,
    generate_parsed,
    make_client,
    require_project,
)
from map_builder.occupations import MAJOR


class Relation(enum.StrEnum):
    SAME = "同じ"
    NEAR = "近い"
    NONE = "なし"


class Presence(enum.StrEnum):
    COMMON = "日本にもある"
    RARE = "日本では少ない"
    ABSENT = "日本にはほぼない"


MajorCode = enum.Enum("MajorCode", {f"M{k}": k for k in MAJOR}, type=str)


class MatchResult(BaseModel):
    code: str = Field(description="入力の O*NET-SOC コードをそのまま返す")
    relation: Relation
    match_id: int = Field(
        description="relation が「同じ」「近い」のとき、いちばん近い job tag の職業ID。"
        "「なし」のときは 0"
    )
    jp_presence: Presence
    name_ja: str = Field(
        description="日本語の職業名（20字以内）。日本で通じる呼び名があればそれを使う。"
        "日本にない仕事は、仕事内容が分かる訳語にする"
    )
    aliases_ja: list[str] = Field(description="日本語の別名やカタカナ表記。0〜3個")
    major_code: MajorCode = Field(description="厚生労働省編職業分類の大分類コード")
    summary_ja: str = Field(description="大学生向けの1文の説明。60字以内")
    what_ja: str = Field(
        description="仕事内容。説明とタスクをもとに、大学生に分かる日本語で300字以内。"
        "米国特有の制度・資格・機関名は一般的な言い方に直す"
    )


class BatchMatch(BaseModel):
    results: list[MatchResult]


def jobtag_catalog(jobtag_occ):
    lines = []
    for o in jobtag_occ:
        alias = f"（{'、'.join(o['aliases'][:3])}）" if o["aliases"] else ""
        lines.append(f"{o['id']}: {o['name']}{alias} / {o['major_name']}")
    return "\n".join(lines)


def system_instruction(jobtag_occ):
    majors = "\n".join(f"{k}: {v}" for k, v in MAJOR.items())
    return f"""あなたは、大学生が「知らなかった仕事」に気づくためのアプリで、
米国の職業データベース O*NET の職業を日本語にし、
日本の職業データ（job tag）と照らし合わせる担当です。

## relation（job tag との関係）
- 同じ：job tag に仕事内容がほぼ同じ職業がある。呼び名や細かさの違いだけで、
  大学生に別の仕事として見せる意味がない
- 近い：job tag に近い職業はあるが、扱う対象や専門がはっきり違い、別の仕事として見せる価値がある
- なし：job tag に対応する職業がない
迷ったら「同じ」寄りに判定する（同じ仕事が2枚のカードになるのを避けるため）。
match_id には、下の job tag 一覧の番号だけを使う。

## jp_presence（日本での状況）
- 日本にもある：日本でも同じ仕事が一般にある（名前が違っても仕事があればこれ）
- 日本では少ない：日本にもあるが、数が少ない・まだ新しい・海外の方が一般的
- 日本にはほぼない：米国の制度や事情に固有で、日本にはほぼない

## 日本語の書き方
- 英語の説明・タスクに書かれていることだけを根拠にする。書かれていない仕事内容を足さない
- 大学生に分かる言葉で書く。専門用語は短く言い換えるか、かっこで補う
- 年収、「将来安泰」などの評価は書かない。特定の性別・学歴の人に向いている、という書き方をしない

## 大分類（major_code）
{majors}

## job tag の職業一覧（id: 職業名（別名） / 大分類）
{jobtag_catalog(jobtag_occ)}
"""


def onet_prompt_block(o):
    tasks = "\n".join(f"- {t}" for t in o["tasks"][:8])
    return (
        f"### code={o['onet_code']} {o['title']}\n"
        f"Alternate titles: {', '.join(o['job_titles'][:8]) or 'none'}\n"
        f"Description: {o['description']}\n"
        f"Tasks:\n{tasks or '- none'}\n"
    )


def build_prompt(batch):
    return (
        "次の O*NET の職業それぞれについて、job tag との関係と日本語の名前・説明を返してください。"
        "code は入力と同じものを使い、全職業分を返してください。\n\n"
        + "\n".join(onet_prompt_block(o) for o in batch)
    )


def validate(r: MatchResult, jobtag_names):
    """ルール違反を直し、直した理由を返す（人の確認の手がかりにする）。"""
    notes = []
    relation = r.relation.value
    match_id = r.match_id or None
    if relation == Relation.NONE:
        match_id = None
    elif match_id not in jobtag_names:
        notes.append(f"job tag のIDが不正:{r.match_id}（「なし」として扱う）")
        relation, match_id = Relation.NONE.value, None
    if len(r.name_ja) > 30:
        notes.append("職業名が長い")
    if len(r.summary_ja) > 80:
        notes.append("説明が長い")
    if len(r.what_ja) > 400:
        notes.append("仕事内容が長い")
    return {
        "code": r.code,
        "relation": relation,
        "match_id": match_id,
        "match_name": jobtag_names.get(match_id, ""),
        "jp_presence": r.jp_presence.value,
        "name_ja": r.name_ja.strip(),
        "aliases_ja": [a.strip() for a in r.aliases_ja if a.strip()][:3],
        "major_code": r.major_code.value,
        "summary_ja": r.summary_ja.strip(),
        "what_ja": r.what_ja.strip(),
        "notes": notes,
    }


def load_raw(raw_path):
    """onet_match_raw.jsonl を {code: 結果} で返す（同じ code は後の行を優先）。"""
    out = {}
    if Path(raw_path).exists():
        with open(raw_path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    r = json.loads(line)
                    out[r["code"]] = r
    return out


def write_review_csv(raw_path, onet_by_code, out_csv):
    rows = load_raw(raw_path)
    with open(out_csv, "w", newline="", encoding="utf-8-sig") as g:
        w = csv.writer(g)
        w.writerow(
            [
                "O*NET-SOC",
                "英語名",
                "日本語名",
                "関係",
                "対応する job tag 職業",
                "日本での状況",
                "大分類",
                "説明",
                "仕事内容",
                "検証メモ",
                "確認（OK/NG/修正）",
                "修正メモ",
            ]
        )
        for code in sorted(rows):
            r = rows[code]
            o = onet_by_code.get(code, {})
            match = f"{r['match_id']}: {r['match_name']}" if r["match_id"] else ""
            w.writerow(
                [
                    code,
                    o.get("title", ""),
                    r["name_ja"],
                    r["relation"],
                    match,
                    r["jp_presence"],
                    MAJOR.get(r["major_code"], r["major_code"]),
                    r["summary_ja"],
                    r["what_ja"],
                    " / ".join(r["notes"]),
                    "",
                    "",
                ]
            )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobtag", help="occupations.json（job tag）")
    ap.add_argument("onet", help="onet_occupations.json（map_builder.onet の出力）")
    ap.add_argument("outdir")
    add_gemini_args(ap)
    ap.add_argument("--batch-size", type=int, default=5)
    ap.add_argument("--limit", type=int, default=0, help="先頭から何職業だけ処理するか（試し用）")
    ap.add_argument("--codes", default="", help="処理する O*NET-SOC コード（カンマ区切り。試し用）")
    args = ap.parse_args()

    with open(args.jobtag, encoding="utf-8") as f:
        jobtag_occ = [
            o for o in json.load(f)["occupations"] if o.get("source", "jobtag") == "jobtag"
        ]
    jobtag_names = {o["id"]: o["name"] for o in jobtag_occ}
    with open(args.onet, encoding="utf-8") as f:
        onet = json.load(f)["occupations"]
    onet_by_code = {o["onet_code"]: o for o in onet}
    if args.codes:
        wanted = [c.strip() for c in args.codes.split(",") if c.strip()]
        missing = [c for c in wanted if c not in onet_by_code]
        if missing:
            ap.error(f"存在しない O*NET-SOC コード: {missing}")
        onet = [onet_by_code[c] for c in wanted]
    if args.limit:
        onet = onet[: args.limit]

    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    raw_path = out / "onet_match_raw.jsonl"
    done = set(load_raw(raw_path))
    todo = [o for o in onet if o["onet_code"] not in done]
    batches = [todo[i : i + args.batch_size] for i in range(0, len(todo), args.batch_size)]
    print(
        f"対象 {len(onet)} 職業 / 済み {len(done & {o['onet_code'] for o in onet})}"
        f" / 残り {len(todo)}（{len(batches)} 回呼び出し）"
    )

    sys_inst = system_instruction(jobtag_occ)
    if args.dry_run:
        print("---- system instruction（job tag 一覧は先頭5行のみ表示） ----")
        head, _, catalog = sys_inst.partition("## job tag の職業一覧")
        print(head + "## job tag の職業一覧" + "\n".join(catalog.splitlines()[:6]) + "\n...")
        if batches:
            print("---- 1回目のプロンプト ----\n" + build_prompt(batches[0]))
        print(f"system instruction の長さ: {len(sys_inst)} 文字")
        return

    require_project(ap, args.project)
    from google.genai import types

    client = make_client(args.project, args.location, args.timeout)
    config = types.GenerateContentConfig(
        system_instruction=sys_inst,
        response_mime_type="application/json",
        response_schema=BatchMatch,
        temperature=0.2,
    )

    skipped = []
    with open(raw_path, "a", encoding="utf-8") as f:
        for bi, batch in enumerate(batches, 1):
            if bi > 1 and args.interval > 0:
                time.sleep(args.interval)
            parsed = generate_parsed(
                client,
                args.model,
                build_prompt(batch),
                config,
                max_retries=args.max_retries,
                label=f"バッチ{bi}",
            )
            if parsed is None:
                print(f"  バッチ{bi} をスキップ（次回の実行で再挑戦）", file=sys.stderr)
                skipped.append(bi)
                continue
            codes = {o["onet_code"] for o in batch}
            for r in parsed.results:
                if r.code not in codes:
                    continue  # 入力にない code は捨てる
                rec = validate(r, jobtag_names)
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                codes.discard(r.code)
            f.flush()
            print(
                f"バッチ{bi}/{len(batches)} 完了"
                + (f"（返答なし: {sorted(codes)}）" if codes else "")
            )

    write_review_csv(raw_path, onet_by_code, out / "onet_match_review.csv")
    print(f"確認用CSV: {out / 'onet_match_review.csv'}")
    left = [o["onet_code"] for o in onet if o["onet_code"] not in load_raw(raw_path)]
    if left:
        print(
            f"未処理 {len(left)} 職業（スキップしたバッチ: {skipped or 'なし'}）。"
            "同じコマンドをもう一度実行すると続きから処理します",
            file=sys.stderr,
        )
        sys.exit(1)
    print("全職業の照合と日本語化が完了しました")


if __name__ == "__main__":
    main()
