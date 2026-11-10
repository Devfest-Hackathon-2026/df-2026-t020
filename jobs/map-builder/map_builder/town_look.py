"""仕事の街（apps/web の /map）で、職業ごとに「街のどこにいるか」と
「キャラクターの部品の組み合わせ」を Gemini（Vertex AI）で一括下書きする。
部品は apps/web/data/townParts.json のカタログから選ばせる。

体つき・肌・髪型・髪の色・スカートかズボンかは、仕事と関係がないので選ばせない
（画面が職業ごとの乱数で決める。性別や見た目の思い込みを入れないため）。

準備:
  uv sync
  gcloud auth application-default login      # APIキーは使わない
  プロジェクトIDは --project で渡す（または環境変数 GOOGLE_CLOUD_PROJECT）

使い方（jobs/map-builder で）:
  # プロンプトだけ確認（Geminiを呼ばない）
  uv run python -m map_builder.town_look ../../.data/occupations_world.json \
      ../../apps/web/data/townParts.json ../../.data/town_look \
      --model <モデル名> --dry-run --limit 20
  # 本実行（途中で止まっても、もう一度実行すれば続きから）
  uv run python -m map_builder.town_look ../../.data/occupations_world.json \
      ../../apps/web/data/townParts.json ../../.data/town_look --model <モデル名>
  # 確認CSVを直したあと、画面用に書き出す（Gemini は呼ばない）
  uv run python -m map_builder.town_look ../../.data/occupations_world.json \
      ../../apps/web/data/townParts.json ../../.data/town_look \
      --export ../../apps/web/data/townLooks.json

出力:
  <outdir>/town_look_raw.jsonl   Gemini の返答（1行＝1職業）
  <outdir>/town_look_review.csv  チーム確認用（1行＝1職業）。
                                 部品の列は直接書き換えてよい（カタログの id）。
                                 「確認」列が NG の職業は書き出さない
                                 （画面は決まりによる仮の見た目になる）
  --export のパス                画面が読む townLooks.json
"""

import argparse
import csv
import enum
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from map_builder.gemini_call import (
    add_gemini_args,
    generate_parsed,
    make_client,
    require_project,
)

PART_KINDS = ("top", "hat", "accessory", "held", "companion", "vehicle", "pose")
MAX_ACCESSORIES = 2
CSV_COLUMNS = [
    "職業ID",
    "職業名",
    "区画",
    "上着",
    "上着の色",
    "帽子",
    "アクセサリー",
    "持ち物",
    "動物・植物",
    "乗り物",
    "ポーズ",
    "見た目（日本語）",
    "根拠",
    "検証メモ",
    "確認（OK/NG/修正）",
    "修正メモ",
]


def load_catalog(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def make_enum(name, ids):
    return enum.Enum(name, {f"V{i}": v for i, v in enumerate(ids)}, type=str)


def build_schema(catalog):
    """カタログの id だけを選べる構造化出力のモデルを作る。"""
    parts = catalog["parts"]
    District = make_enum("District", [d["id"] for d in catalog["districts"]])
    Color = make_enum("Color", [c["id"] for c in catalog["colors"]])
    E = {k: make_enum(k.capitalize(), [p["id"] for p in parts[k]]) for k in PART_KINDS}
    Top, Hat, Accessory, Held = E["top"], E["hat"], E["accessory"], E["held"]
    Companion, Vehicle, Pose = E["companion"], E["vehicle"], E["pose"]

    class LookResult(BaseModel):
        id: int
        district: District = Field(description="その仕事の人を、街のどの区画で見かけるか")
        top: Top = Field(description="仕事中に着ている上着")
        top_color: Color = Field(description="上着の色（白衣など色の決まった上着では無視される）")
        hat: Hat
        accessories: list[Accessory] = Field(description="仕事らしさが出るものだけ。0〜2個")
        held: Held = Field(description="手に持っているもの")
        companion: Companion = Field(description="そばにいる動物や植物。仕事で扱うときだけ")
        vehicle: Vehicle = Field(description="そばにある乗り物。仕事で運転・操作するときだけ")
        pose: Pose
        reason: str = Field(
            description="なぜこの見た目にしたか。仕事内容のどこからそう決めたか。40字以内"
        )

    class BatchResult(BaseModel):
        results: list[LookResult]

    return LookResult, BatchResult


def catalog_text(catalog):
    lines = ["## 区画（district。この中からだけ選ぶ）"]
    lines += [f"- {d['id']}：{d['ja']}（{d['desc']}）" for d in catalog["districts"]]
    lines.append("\n## 色（top_color）")
    lines.append("、".join(f"{c['id']}={c['ja']}" for c in catalog["colors"]))
    names = {
        "top": "上着（top）",
        "hat": "帽子（hat）",
        "accessory": "アクセサリー（accessories。0〜2個）",
        "held": "持ち物（held）",
        "companion": "そばにいる動物・植物（companion）",
        "vehicle": "そばにある乗り物（vehicle）",
        "pose": "ポーズ（pose）",
    }
    for k in PART_KINDS:
        lines.append(f"\n## {names[k]}")
        lines.append("、".join(f"{p['id']}={p['ja']}" for p in catalog["parts"][k]))
    return "\n".join(lines)


def system_instruction(catalog):
    return f"""あなたは、大学生が「知らなかった仕事」に気づくためのアプリで、
仕事の街（2.5Dの地図）に立つキャラクターの見た目を決める担当です。
1つの職業につき1人のキャラクターが街に立ちます。大学生がキャラクターを見て
「何の仕事だろう？」と興味を持ち、押して仕事を知るきっかけにします。

{catalog_text(catalog)}

## ルール
- 渡された職業の説明に書かれている仕事内容だけを根拠にする。仕事中の姿を描く
- その仕事らしさが一目で伝わる部品を選ぶ。ただし、同じ分野の仕事が全員同じ見た目にならないよう、
  仕事内容の違い（何を扱うか、どこで働くか）を部品の違いに出す
- 乗り物は、その仕事で運転・操作するときだけ。動物・植物は、その仕事で扱うときだけ。
  乗り物を選んだら、動物・植物は none にする（車いすの介助だけは例外）
- アクセサリーは自然なものだけ、0〜2個。なければ空にする
- 性別・年齢・人種を表す選び方をしない
  （体つき・肌・髪型・スカートかズボンかはアプリが乱数で決めるので、ここでは選ばない）
- 武器や危険な物を持たせない。けがや病気を連想させる姿にしない
- 区画は「その仕事の人を街のどこで見かけるか」で選ぶ。
  会社の事務のように、どこにでもある仕事は office
- 「日本での状況」が「日本では少ない」「日本にはほぼない」の職業も、仕事内容どおりの姿にする
- reason は40字以内。部品の名前ではなく、仕事内容のどこからそう決めたかを書く
"""


def occupation_block(o):
    what = (o.get("what") or "")[:500]
    return (
        f"### id={o['id']} {o['name']}\n"
        f"別名: {'、'.join(o.get('aliases', [])[:6]) or 'なし'}\n"
        f"分野: {o.get('major_name', '')}\n"
        + (
            f"日本での状況: {o.get('jp_presence', '')}（海外の職業データ O*NET より）\n"
            if o.get("source") == "onet"
            else ""
        )
        + f"説明: {o.get('summary', '')}\n"
        f"仕事内容: {what}\n"
    )


def build_prompt(batch):
    return (
        "次の職業それぞれについて、区画とキャラクターの部品を返してください。"
        "id は入力と同じものを使い、全職業分を返してください。\n\n"
        + "\n".join(occupation_block(o) for o in batch)
    )


def to_record(result):
    """構造化出力を、id の文字列だけの dict にする。"""
    return {
        "id": result.id,
        "district": result.district.value,
        "top": result.top.value,
        "top_color": result.top_color.value,
        "hat": result.hat.value,
        "accessories": [a.value for a in result.accessories],
        "held": result.held.value,
        "companion": result.companion.value,
        "vehicle": result.vehicle.value,
        "pose": result.pose.value,
        "reason": result.reason,
    }


def validate(rec, catalog):
    """ルール違反を直し、直した理由を notes に入れて返す（人の確認の手がかりにする）。"""
    ids = {k: {p["id"] for p in catalog["parts"][k]} for k in PART_KINDS}
    notes = []
    out = dict(rec)
    accs = []
    for a in rec.get("accessories", []):
        if a not in ids["accessory"]:
            notes.append(f"カタログにないアクセサリーを削除:{a}")
        elif a in accs:
            notes.append(f"重複を削除:{a}")
        else:
            accs.append(a)
    if len(accs) > MAX_ACCESSORIES:
        notes.append(f"アクセサリーが{len(accs)}個のため先頭{MAX_ACCESSORIES}個に制限")
        accs = accs[:MAX_ACCESSORIES]
    out["accessories"] = accs
    if (
        out.get("vehicle", "none") not in ("none", "wheelchair")
        and out.get("companion", "none") != "none"
    ):
        notes.append(f"乗り物があるので動物・植物を削除:{out['companion']}")
        out["companion"] = "none"
    if len(out.get("reason", "")) > 60:
        notes.append("根拠が長い")
    out["notes"] = notes
    return out


def describe(rec, catalog):
    """部品の id を日本語の説明にする（確認CSVで読みやすくするため）。"""
    ja = {k: {p["id"]: p["ja"] for p in catalog["parts"][k]} for k in PART_KINDS}
    color = {c["id"]: c["ja"] for c in catalog["colors"]}
    parts = [f"{color.get(rec['top_color'], '')}の{ja['top'].get(rec['top'], rec['top'])}"]
    if rec["hat"] != "none":
        parts.append(ja["hat"].get(rec["hat"], rec["hat"]))
    parts += [ja["accessory"].get(a, a) for a in rec["accessories"]]
    if rec["held"] != "none":
        parts.append(f"{ja['held'].get(rec['held'], rec['held'])}を持つ")
    if rec["companion"] != "none":
        parts.append(f"{ja['companion'].get(rec['companion'], rec['companion'])}と一緒")
    if rec["vehicle"] != "none":
        parts.append(f"{ja['vehicle'].get(rec['vehicle'], rec['vehicle'])}のそば")
    parts.append(ja["pose"].get(rec["pose"], rec["pose"]))
    return "、".join(parts)


def write_review_csv(raw_path, occ_by_id, catalog, out_csv):
    district_ja = {d["id"]: d["ja"] for d in catalog["districts"]}
    with (
        open(raw_path, encoding="utf-8") as f,
        open(out_csv, "w", newline="", encoding="utf-8-sig") as g,
    ):
        w = csv.writer(g)
        w.writerow(CSV_COLUMNS)
        for line in f:
            r = json.loads(line)
            o = occ_by_id.get(r["id"], {"name": "", "id": r["id"]})
            w.writerow(
                [
                    r["id"],
                    o["name"],
                    f"{r['district']}（{district_ja.get(r['district'], '')}）",
                    r["top"],
                    r["top_color"],
                    r["hat"],
                    " ".join(r["accessories"]),
                    r["held"],
                    r["companion"],
                    r["vehicle"],
                    r["pose"],
                    describe(r, catalog),
                    r.get("reason", ""),
                    " / ".join(r.get("notes", [])),
                    "",
                    "",
                ]
            )


def read_review_csv(path, catalog):
    """確認CSVを読み、NG 以外の職業の見た目を返す。

    書き換えられた部品がカタログにないときはエラーにする。
    """
    ids = {k: {p["id"] for p in catalog["parts"][k]} for k in PART_KINDS}
    districts = {d["id"] for d in catalog["districts"]}
    colors = {c["id"] for c in catalog["colors"]}
    looks, errors, counts = {}, [], {"OK": 0, "修正": 0, "未確認": 0, "NG": 0}
    with open(path, encoding="utf-8-sig") as f:
        for n, row in enumerate(csv.DictReader(f), start=2):
            status = (row.get("確認（OK/NG/修正）") or "").strip().upper()
            status = {"OK": "OK", "NG": "NG", "修正": "修正"}.get(status, "未確認")
            counts[status] += 1
            if status == "NG":
                continue
            rec = {
                "district": row["区画"].split("（", 1)[0].strip(),
                "top": row["上着"].strip(),
                "top_color": row["上着の色"].strip(),
                "hat": row["帽子"].strip() or "none",
                "accessories": row["アクセサリー"].split(),
                "held": row["持ち物"].strip() or "none",
                "companion": row["動物・植物"].strip() or "none",
                "vehicle": row["乗り物"].strip() or "none",
                "pose": row["ポーズ"].strip() or "stand",
            }
            bad = []
            if rec["district"] not in districts:
                bad.append(f"区画 {rec['district']}")
            if rec["top_color"] not in colors:
                bad.append(f"色 {rec['top_color']}")
            for k, col in (
                ("top", "top"),
                ("hat", "hat"),
                ("held", "held"),
                ("companion", "companion"),
                ("vehicle", "vehicle"),
                ("pose", "pose"),
            ):
                if rec[col] not in ids[k]:
                    bad.append(f"{k} {rec[col]}")
            bad += [f"accessory {a}" for a in rec["accessories"] if a not in ids["accessory"]]
            if len(rec["accessories"]) > MAX_ACCESSORIES:
                bad.append(f"アクセサリーが{len(rec['accessories'])}個（{MAX_ACCESSORIES}個まで）")
            if bad:
                errors.append(
                    f"{n}行目（職業ID {row['職業ID']}）：カタログにない値 → {', '.join(bad)}"
                )
                continue
            rec["reviewed"] = status in ("OK", "修正")
            looks[str(int(row["職業ID"]))] = rec
    return looks, errors, counts


def export(review_csv, catalog, out_path, model=""):
    looks, errors, counts = read_review_csv(review_csv, catalog)
    if errors:
        print("確認CSVに直す必要のある行があります（書き出しを中止）:", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return False
    data = {
        "meta": {
            "status": "draft",
            "note": (
                "仕事の街のキャラクターの区画と部品。"
                "Gemini の下書き。"
                "jobs/map-builder の town_look.py が書き出す生成物なので、"
                "直すときは確認CSVを直して書き出し直す"
            ),
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "model": model,
            "counts": counts,
        },
        "looks": looks,
    }
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(
        f"書き出し: {out_path}（{len(looks)}職業。"
        f"確認 OK {counts['OK']}・修正 {counts['修正']}・"
        f"未確認 {counts['未確認']}・NG {counts['NG']}）"
    )
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("occupations", help="occupations_world.json")
    ap.add_argument("catalog", help="apps/web/data/townParts.json")
    ap.add_argument("outdir")
    add_gemini_args(ap)
    ap.add_argument("--batch-size", type=int, default=20)
    ap.add_argument("--limit", type=int, default=0, help="先頭から何職業だけ処理するか（試し用）")
    ap.add_argument("--ids", default="", help="処理する職業IDをカンマ区切りで指定（試し用）")
    ap.add_argument(
        "--export",
        default="",
        help="確認CSVから画面用の townLooks.json を書き出す（Gemini は呼ばない）",
    )
    # --model は Gemini を呼ぶときだけ要る
    for action in ap._actions:
        if action.dest == "model":
            action.required = False
    args = ap.parse_args()

    catalog = load_catalog(args.catalog)
    out = Path(args.outdir)
    review_csv = out / "town_look_review.csv"
    if args.export:
        if not review_csv.exists():
            ap.error(f"確認CSVがありません: {review_csv}（先に Gemini で下書きしてください）")
        sys.exit(0 if export(review_csv, catalog, args.export, args.model or "") else 1)
    if not args.model:
        ap.error("--model を指定してください")

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
    out.mkdir(parents=True, exist_ok=True)
    raw_path = out / "town_look_raw.jsonl"

    done = set()
    if raw_path.exists():
        with open(raw_path, encoding="utf-8") as f:
            done = {json.loads(line)["id"] for line in f}
    todo = [o for o in occ if o["id"] not in done]
    batches = [todo[i : i + args.batch_size] for i in range(0, len(todo), args.batch_size)]
    print(
        f"対象 {len(occ)} 職業 / 済み {len(done)} / 残り {len(todo)}（{len(batches)} 回呼び出し）"
    )

    instruction = system_instruction(catalog)
    _, BatchResult = build_schema(catalog)
    if args.dry_run:
        print("---- system instruction ----\n" + instruction)
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
        system_instruction=instruction,
        response_mime_type="application/json",
        response_schema=BatchResult,
        temperature=0.4,
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
                f.write(json.dumps(validate(to_record(r), catalog), ensure_ascii=False) + "\n")
                ids.discard(r.id)
            f.flush()
            print(
                f"バッチ{bi}/{len(batches)} 完了" + (f"（返答なし: {sorted(ids)}）" if ids else "")
            )

    write_review_csv(raw_path, occ_by_id, catalog, review_csv)
    print(f"確認用CSV: {review_csv}")

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
    print("全職業の下書きが完了しました。確認CSVを確認してから --export で書き出してください")


if __name__ == "__main__":
    main()
