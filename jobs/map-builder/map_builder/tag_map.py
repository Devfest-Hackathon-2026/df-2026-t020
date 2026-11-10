"""職業ごとに「好きなもの」タグ・距離・つながりの1文・知られやすさを、
Gemini（Vertex AI）で一括下書きする。

準備:
  uv sync
  gcloud auth application-default login      # APIキーは使わない
  プロジェクトIDは --project で渡す（または環境変数 GOOGLE_CLOUD_PROJECT）

使い方（jobs/map-builder で）:
  # プロンプトだけ確認（Geminiを呼ばない）
  uv run python -m map_builder.tag_map ../../.data/occupations.json ../../.data/tag_map \
      --model <モデル名> --dry-run --limit 20
  # 本実行（途中で止まっても、もう一度実行すれば続きから）
  uv run python -m map_builder.tag_map ../../.data/occupations.json ../../.data/tag_map \
      --model <モデル名>

出力:
  out/tag_map_raw.jsonl   Gemini の返答（1行＝1職業）
  out/tag_map_review.csv  チーム確認用（1行＝1職業×1タグ）。「確認」「修正メモ」列を埋める
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
from map_builder.tags import ALL_TAGS, SUBJECT_TAGS, SUBJECT_THRESHOLD, subject_score

Tag = enum.Enum("Tag", {f"T{i}": t for i, t in enumerate(ALL_TAGS)}, type=str)


class Distance(enum.StrEnum):
    NEAR = "身近"
    MID = "少し遠い"
    FAR = "意外"


class TagLink(BaseModel):
    tag: Tag
    distance: Distance
    link: str = Field(
        description=(
            "そのタグの好きなものからこの仕事へのつながり。大学生が知っている身近なものから"
            "書き始める1文、60字以内。「〜する仕事です」で終えない"
        )
    )


class OccupationResult(BaseModel):
    id: int
    tags: list[TagLink] = Field(description="本当につながりがあるタグだけ。0〜4個")
    familiarity: int = Field(
        description="大学生にとっての知られやすさ。3=多くの大学生が知っている、2=名前は聞いたことがある、1=ほとんど知られていない"
    )


class BatchResult(BaseModel):
    results: list[OccupationResult]


SYSTEM_INSTRUCTION = f"""あなたは、大学生が「知らなかった仕事」に気づくためのアプリで、
職業データに「好きなもの」タグを付ける担当です。

## タグ（この中からだけ選ぶ）
{"、".join(ALL_TAGS)}

## 距離の定義
- 身近：そのタグから大学生が真っ先に思い浮かべる、表から見える仕事
  （例：ゲーム → ゲームクリエーター、料理・お菓子 → パティシエ）
- 少し遠い：好きなものを裏で支える仕事。言われれば「なるほど」と分かる
  （例：ゲーム → デバッグ作業、料理・お菓子 → 食品工場でみそやしょうゆを造る人）
- 意外：一見関係ないが、実際の仕事内容でつながっている仕事。
  大学生が「えっ、そこもつながるの？」と思う
  （例：ゲーム → ゲームの権利を守る弁理士、料理・お菓子 → 発酵を研究するバイオテクノロジー研究者）

## link（つながりの1文）の書き方
- 職業の説明ではなく、「そのタグの好きなもの」から「この仕事」へのつながりを書く
- 大学生が知っている身近なもの・場面から書き始める
- 「〜する仕事です」で終えない
- 良い例（料理・お菓子 × しょうゆ製造）：
  毎日の料理の味つけに使うしょうゆは、麹菌で何か月も発酵させて造られている
- 良い例（買い物 × 惣菜製造）：
  コンビニに並ぶお弁当やおかずは、この仕事の人が工場で調理して詰めている
- 悪い例：大豆と小麦に麹菌を加えて発酵・熟成させ、しょうゆを造る仕事です（職業の説明になっている）

## ルール
- 渡された職業の説明に書かれている仕事内容だけを根拠にする。書かれていない関係を作らない
- 無理に付けない。つながりが弱ければタグは0個でよい。1職業につき最大4個
- 職業ごとに、身近・少し遠いだけでなく「意外」なつながりがないか必ず検討する。
  ただし根拠は仕事内容に書かれていることに限り、説明できるものだけ付ける
- 教科系タグ（{"、".join(SUBJECT_TAGS)}）は、渡された「仕事で使う知識」の数値が
  {SUBJECT_THRESHOLD} 以上の項目に対応する場合だけ付ける
- link は大学生向けの言葉で1文、60字以内。誇張しない。年収や「将来安泰」などの評価は書かない
- 特定の性別・学歴の人に向いている、という書き方をしない
- 「日本での状況」が「日本では少ない」「日本にはほぼない」の職業は、
  日本でもよくある仕事のように書かない
"""


def occupation_prompt_block(o):
    knowledge = ", ".join(
        f"{k}:{v:.1f}" for k, v in sorted(o["knowledge"].items(), key=lambda kv: -kv[1])[:8]
    )
    what = o["what"][:800]
    return (
        f"### id={o['id']} {o['name']}\n"
        f"別名: {'、'.join(o['aliases'][:6]) or 'なし'}\n"
        f"分野: {o['major_name']}\n"
        + (
            f"日本での状況: {o.get('jp_presence', '')}（海外の職業データ O*NET より）\n"
            if o.get("source") == "onet"
            else ""
        )
        + f"説明: {o['summary']}\n"
        f"仕事内容: {what}\n"
        f"仕事で使う知識（0〜5）: {knowledge or 'データなし'}\n"
    )


def build_prompt(batch):
    return (
        "次の職業それぞれについて、タグ・距離・つながりの1文・知られやすさを返してください。"
        "id は入力と同じものを使い、全職業分を返してください。\n\n"
        + "\n".join(occupation_prompt_block(o) for o in batch)
    )


def validate(result: OccupationResult, occ):
    """ルール違反を落とし、落とした理由を返す（人の確認の手がかりにする）。"""
    kept, notes = [], []
    seen = set()
    for t in result.tags:
        tag = t.tag.value
        if tag in seen:
            notes.append(f"重複を削除:{tag}")
            continue
        if tag in SUBJECT_TAGS:
            score = subject_score(occ["knowledge"], tag)
            if score < SUBJECT_THRESHOLD:
                notes.append(f"知識の数値不足で削除:{tag}({score:.1f})")
                continue
        if len(t.link) > 80:
            notes.append(f"linkが長い:{tag}")
        seen.add(tag)
        kept.append(t)
    if len(kept) > 4:
        notes.append("5個以上のため先頭4個に制限")
        kept = kept[:4]
    fam = result.familiarity if result.familiarity in (1, 2, 3) else None
    if fam is None:
        notes.append(f"知られやすさが範囲外:{result.familiarity}")
    return kept, fam, notes


def write_review_csv(raw_path, occ_by_id, out_csv):
    with (
        open(raw_path, encoding="utf-8") as f,
        open(out_csv, "w", newline="", encoding="utf-8-sig") as g,
    ):
        w = csv.writer(g)
        w.writerow(
            [
                "職業ID",
                "職業名",
                "分野",
                "知られやすさ",
                "タグ",
                "距離",
                "つながり",
                "検証メモ",
                "確認（OK/NG/修正）",
                "修正メモ",
                "データ元",
            ]
        )
        for line in f:
            r = json.loads(line)
            o = occ_by_id[r["id"]]
            src = "O*NET" if o.get("source") == "onet" else "job tag"
            if not r["tags"]:
                w.writerow(
                    [
                        o["id"],
                        o["name"],
                        o["major_name"],
                        r["familiarity"],
                        "",
                        "",
                        "",
                        " / ".join(r["notes"]),
                        "",
                        "",
                        src,
                    ]
                )
            for t in r["tags"]:
                w.writerow(
                    [
                        o["id"],
                        o["name"],
                        o["major_name"],
                        r["familiarity"],
                        t["tag"],
                        t["distance"],
                        t["link"],
                        " / ".join(r["notes"]),
                        "",
                        "",
                        src,
                    ]
                )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("occupations")
    ap.add_argument("outdir")
    add_gemini_args(ap)
    ap.add_argument("--batch-size", type=int, default=20)
    ap.add_argument("--limit", type=int, default=0, help="先頭から何職業だけ処理するか（試し用）")
    ap.add_argument(
        "--ids",
        default="",
        help="処理する職業IDをカンマ区切りで指定（試し用。例：8,9,87,330）",
    )
    args = ap.parse_args()

    with open(args.occupations, encoding="utf-8") as f:
        occ = json.load(f)["occupations"]
    occ_by_id = {o["id"]: o for o in occ}
    if args.ids:
        wanted = [int(x) for x in args.ids.split(",") if x.strip()]
        missing = [i for i in wanted if i not in occ_by_id]
        if missing:
            ap.error(f"存在しない職業ID: {missing}")
        occ = [occ_by_id[i] for i in wanted]
    if args.limit:
        occ = occ[: args.limit]
    out = Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    raw_path = out / "tag_map_raw.jsonl"

    done = set()
    if raw_path.exists():
        with open(raw_path, encoding="utf-8") as f:
            done = {json.loads(line)["id"] for line in f}
    todo = [o for o in occ if o["id"] not in done]
    batches = [todo[i : i + args.batch_size] for i in range(0, len(todo), args.batch_size)]
    print(
        f"対象 {len(occ)} 職業 / 済み {len(done)} / 残り {len(todo)}（{len(batches)} 回呼び出し）"
    )

    if args.dry_run:
        print("---- system instruction ----\n" + SYSTEM_INSTRUCTION)
        if batches:
            print("---- 1回目のプロンプト ----\n" + build_prompt(batches[0]))
        print(
            "---- response schema ----\n"
            + json.dumps(BatchResult.model_json_schema(), ensure_ascii=False)[:1500]
        )
        return

    require_project(ap, args.project)
    from google.genai import types

    client = make_client(args.project, args.location, args.timeout)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=BatchResult,
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
            ids = {o["id"] for o in batch}
            for r in parsed.results:
                if r.id not in ids:
                    continue  # 入力にないidは捨てる
                kept, fam, notes = validate(r, occ_by_id[r.id])
                f.write(
                    json.dumps(
                        {
                            "id": r.id,
                            "familiarity": fam,
                            "notes": notes,
                            "tags": [
                                {"tag": t.tag.value, "distance": t.distance.value, "link": t.link}
                                for t in kept
                            ],
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                ids.discard(r.id)
            f.flush()
            print(
                f"バッチ{bi}/{len(batches)} 完了" + (f"（返答なし: {sorted(ids)}）" if ids else "")
            )

    write_review_csv(raw_path, occ_by_id, out / "tag_map_review.csv")
    print(f"確認用CSV: {out / 'tag_map_review.csv'}")

    with open(raw_path, encoding="utf-8") as f:
        done = {json.loads(line)["id"] for line in f}
    left = [o["id"] for o in occ if o["id"] not in done]
    if left:
        print(
            f"未処理 {len(left)} 職業（スキップしたバッチ: {skipped or 'なし'}）。"
            "同じコマンドをもう一度実行すると続きから処理します",
            file=sys.stderr,
        )
        sys.exit(1)
    print("全職業の下書きが完了しました")


if __name__ == "__main__":
    main()
