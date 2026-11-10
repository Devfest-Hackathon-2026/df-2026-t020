"""Gemini の呼び出し口。

接続先は環境変数で決まる（google-genai が読む）。どれもなければ client() は None を返し、
呼び出し側は決まった文で代わりをする。
Gemini の設定がなくても、画面から API まで動かせるようにするため。

- Vertex AI: GOOGLE_GENAI_USE_VERTEXAI=true、GOOGLE_CLOUD_PROJECT、GOOGLE_CLOUD_LOCATION
  （認証は `gcloud auth application-default login` の ADC。鍵のファイルは作らない）
- Gemini API: GEMINI_API_KEY（または GOOGLE_API_KEY）
- REASON_LLM=off にすると、設定があっても使わない
"""

import logging
import os
from functools import cache
from typing import Any, Literal

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

Backend = Literal["vertex", "gemini-api", "template"]

# 教育向けのアプリなので、安全フィルタは既定より厳しくする（低い確率でも止める）
SAFETY_SETTINGS = [
    types.SafetySetting(category=category, threshold=types.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE)
    for category in (
        types.HarmCategory.HARM_CATEGORY_HARASSMENT,
        types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    )
]


# 既定のモデル（map-builder と同じ Gemini 4 Argon、Vertex AI の global）
DEFAULT_MODEL = "gemini-4-argon"


def recommend_model() -> str:
    """1,000職業から選ぶときのモデル。入力が長いので、変えたいときは GEMINI_RECOMMEND_MODEL で"""
    return os.environ.get("GEMINI_RECOMMEND_MODEL") or default_model()


def default_model() -> str:
    """会話・推薦・理由の1文で使うモデル。GEMINI_MODEL で変えられる。
    前の名前の GEMINI_FLASH_MODEL も、手元の .env に残っていれば使う"""
    return os.environ.get("GEMINI_MODEL") or os.environ.get("GEMINI_FLASH_MODEL") or DEFAULT_MODEL


def backend() -> Backend:
    if os.environ.get("REASON_LLM", "auto").lower() == "off":
        return "template"
    use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true")
    if use_vertex and os.environ.get("GOOGLE_CLOUD_PROJECT"):
        return "vertex"
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        return "gemini-api"
    return "template"


@cache
def client() -> genai.Client | None:
    if backend() == "template":
        return None
    try:
        # 応答が遅いときは待たずに決まった文へ切り替えるため、20 秒で打ち切る
        return genai.Client(http_options=types.HttpOptions(timeout=20_000))
    except Exception:
        # 設定が足りないときも API は止めず、決まった文で動かす（API の再起動まで）
        logger.exception("Gemini のクライアントを作れなかったので、決まった文で動かす")
        return None


def ask_json(
    prompt: str,
    *,
    system: str,
    schema: Any,
    model: str | None = None,
    temperature: float = 0.4,
    timeout_ms: int | None = None,
) -> Any | None:
    """構造化出力（JSON）で Gemini を1回呼び、読めた結果を返す。使えない・失敗したときは None"""
    gemini = client()
    if gemini is None:
        return None
    try:
        resp = gemini.models.generate_content(
            model=model or default_model(),
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_schema=schema,
                safety_settings=SAFETY_SETTINGS,
                temperature=temperature,
                http_options=types.HttpOptions(timeout=timeout_ms) if timeout_ms else None,
            ),
        )
    except Exception:
        logger.exception("Gemini の呼び出しに失敗した")
        return None
    return resp.parsed
