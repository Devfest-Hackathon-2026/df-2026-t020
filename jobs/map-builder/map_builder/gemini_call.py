"""Vertex AI の Gemini を、429・5xx に備えて再試行しながら呼ぶ（tag_map / onet_match 共通）。

APIキーは使わない。ADC（gcloud auth application-default login）で認証する。
"""

import os
import random
import sys
import time

RETRYABLE_CODES = {429, 500, 502, 503, 504}


def retry_delay(err, attempt, base=10.0, cap=120.0):
    """次の再試行まで何秒待つか。

    429（混雑・クォータ超過）と 5xx は、1分単位の枠が空くまで長めに待つ（指数バックオフ＋ゆらぎ）。
    構造化出力が読めない等のそれ以外のエラーは、短く待ってすぐ再試行する。
    """
    code = getattr(err, "code", None)
    if code in RETRYABLE_CODES:
        delay = min(cap, base * (2**attempt))
        return delay + random.uniform(0, delay * 0.2)  # noqa: S311 待ち時間のゆらぎ用
    return 3.0


def add_gemini_args(ap):
    """Gemini を呼ぶコマンドに共通の引数。"""
    ap.add_argument("--model", required=True, help="Vertex AI のモデル名")
    ap.add_argument(
        "--project",
        default=os.environ.get("GOOGLE_CLOUD_PROJECT"),
        help="Google Cloud のプロジェクトID（省略時は環境変数 GOOGLE_CLOUD_PROJECT）",
    )
    ap.add_argument("--location", default=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
    ap.add_argument("--max-retries", type=int, default=6, help="1バッチあたりの最大試行回数")
    ap.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="バッチ間に空ける秒数（429が多いときは増やす）",
    )
    ap.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="1回の呼び出しで返答を待つ上限の秒数（超えたら再試行）",
    )
    ap.add_argument("--dry-run", action="store_true", help="Gemini を呼ばずにプロンプトだけ表示")


def require_project(ap, project):
    if not project:
        ap.error(
            "プロジェクトIDがありません。--project <プロジェクトID> を付けるか、"
            "環境変数 GOOGLE_CLOUD_PROJECT を設定してください"
            "（cmd: set GOOGLE_CLOUD_PROJECT=<ID>"
            ' / PowerShell: $env:GOOGLE_CLOUD_PROJECT="<ID>"）'
        )


def make_client(project, location, timeout_s=180):
    import warnings

    # SDK 内部の SyntaxWarning（動作には影響しない）を表示しない
    warnings.filterwarnings("ignore", category=SyntaxWarning, module=r"google\.genai")
    from google import genai
    from google.genai import types

    # 既定では待ち時間の上限がなく、返答が来ないと止まったままになるので上限を付ける
    return genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options=types.HttpOptions(timeout=timeout_s * 1000),
    )


def generate_parsed(client, model, contents, config, *, max_retries, label):
    """構造化出力（config.response_schema のモデル）を返す。すべて失敗したら None。"""
    for attempt in range(max_retries):
        start = time.monotonic()
        print(f"  {label} 送信（{attempt + 1}回目）…", flush=True)
        try:
            resp = client.models.generate_content(model=model, contents=contents, config=config)
            parsed = resp.parsed
            if parsed is None:
                raise ValueError("構造化出力を読めませんでした")
            print(f"  {label} 返答あり（{time.monotonic() - start:.0f}秒）", flush=True)
            return parsed
        except Exception as e:  # 一時的なエラーは待って再試行
            msg = str(e).split(". {", 1)[0] or type(e).__name__  # 長いJSON部分は省く
            msg += f"（{time.monotonic() - start:.0f}秒）"
            if attempt + 1 < max_retries:
                wait = retry_delay(e, attempt)
                print(
                    f"  {label} 失敗（{attempt + 1}回目）: {msg} → {wait:.0f}秒待って再試行",
                    file=sys.stderr,
                )
                time.sleep(wait)
            else:
                print(f"  {label} 失敗（{attempt + 1}回目）: {msg}", file=sys.stderr)
    return None
