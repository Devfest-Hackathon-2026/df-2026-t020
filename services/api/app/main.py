"""公開 API。パスはすべて /api から始める（Firebase Hosting の rewrite と同じ形）。

- POST /api/chat：趣味を選んだあとの会話。毎回「知る（世界の話と仕事）」と「問いと選択肢」の組か、
  終わり（done）を返す
- POST /api/recommend：会話の内容から、紹介する職業を Gemini が1,000職業の一覧から選ぶ
- POST /api/reasons：画面がデータで選んだ職業カードに、理由の1文を付ける
  （Gemini が使えず /api/recommend が空のとき、画面はこちらに切り替える）
API は会話を保存しない。画面が毎回、これまでの会話をまとめて送る。
Gemini を呼ぶ3つは、短い時間に呼びすぎると 429 を返す（app/ratelimit.py）。
localhost で画面（pnpm dev）から呼ぶときは、
環境変数 ALLOWED_ORIGINS に画面のオリジンを入れる（CORS）。
Hosting の rewrite から呼ぶときは同じオリジンなので、ALLOWED_ORIGINS は要らない。
"""

import logging
import os
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

from app import cards, chat, llm, ratelimit, reasons, recommend

logging.basicConfig(level=logging.INFO)

# タグの名前。長い文や記号は受け付けない（Gemini に渡す入力を短い語だけにするため）
TagName = Annotated[str, StringConstraints(min_length=1, max_length=20, pattern=r"^[\w・ー（）]+$")]


# 会話の答え（選択肢か、「その他」に書いた一言）。改行と山かっこは受け付けない
Answer = Annotated[str, StringConstraints(min_length=1, max_length=40, pattern=r"^[^\n\r<>{}]+$")]
# 画面が送り返す問いと選択肢（API が返したもの）
QuestionText = Annotated[str, StringConstraints(min_length=1, max_length=120)]
OptionText = Annotated[str, StringConstraints(min_length=1, max_length=40)]
# 画面が送り返す「知る」の中身（API が返したもの）
ShortText = Annotated[str, StringConstraints(min_length=1, max_length=60)]
LongText = Annotated[str, StringConstraints(min_length=1, max_length=200)]
# 職業データのタグ（「動画・写真（観る・撮る・配信）」のような名前がある）
CardTagName = Annotated[
    str, StringConstraints(min_length=1, max_length=30, pattern=r"^[\w・ー（）]+$")
]
RiasecCode = Literal["R", "I", "A", "S", "E", "C"]
# 得意なこと・大事にしたいことは、それぞれ3個まで選べる
MAX_SELF_TAGS = 3


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CardRef(CamelModel):
    occupation_id: int
    # 職業カードのタグ（つながりの元）
    tag: TagName
    # 選んだ好きなことのうち、このカードにつながるもの
    interests: list[TagName] = Field(default_factory=list, max_length=10)


class ReasonsRequest(CamelModel):
    interests: list[TagName] = Field(min_length=1, max_length=40)
    cards: list[CardRef] = Field(min_length=1, max_length=12)


class ReasonOut(CamelModel):
    occupation_id: int
    text: str
    # Gemini がつくった文か（False は決まった文）
    ai: bool


class ReasonsResponse(CamelModel):
    reasons: list[ReasonOut]
    source: reasons.Source


class JobIn(CamelModel):
    name: ShortText
    what: LongText
    # 職業カードの id（API が返したもの。前の版の画面からは来ない）
    occupation_id: int | None = None
    # 利用者がこの仕事に付けた反応
    reactions: list[chat.Reaction] = Field(default_factory=list, max_length=3)


class ExploreIn(CamelModel):
    title: ShortText
    text: LongText
    jobs: list[JobIn] = Field(default_factory=list, max_length=chat.JOBS_PER_TURN)


class TurnIn(CamelModel):
    question: QuestionText
    options: list[OptionText] = Field(default_factory=list, max_length=5)
    answer: Answer
    explore: ExploreIn | None = None

    def to_turn(self) -> chat.Turn:
        explore = None
        if self.explore:
            explore = chat.Explore(
                self.explore.title,
                self.explore.text,
                tuple(
                    chat.Job(j.name, j.what, tuple(dict.fromkeys(j.reactions)), j.occupation_id)
                    for j in self.explore.jobs
                ),
            )
        return chat.Turn(self.question, tuple(self.options), self.answer.strip(), explore)


class ConversationIn(CamelModel):
    # 選んだ趣味のタグ
    interests: list[TagName] = Field(min_length=1, max_length=40)
    # 趣味のタグから出した RIASEC の上位（画面には出さず、Gemini への入力にだけ使う）
    riasec: list[RiasecCode] = Field(default_factory=list, max_length=3)
    history: list[TurnIn] = Field(default_factory=list, max_length=chat.MAX_TURNS)
    # 好きなことに対応する職業データのタグ（Gemini が使えないとき、見せる仕事を選ぶのに使う）
    card_tags: list[CardTagName] = Field(default_factory=list, max_length=30)
    # 得意なこと・大事にしたいこと（任意。今の画面は送らないので、省略時は空）
    strengths: list[TagName] = Field(default_factory=list, max_length=MAX_SELF_TAGS)
    values: list[TagName] = Field(default_factory=list, max_length=MAX_SELF_TAGS)

    def context(self) -> chat.Context:
        return chat.Context(
            interests=tuple(dict.fromkeys(self.interests)),
            riasec=tuple(dict.fromkeys(self.riasec)),
            history=tuple(t.to_turn() for t in self.history),
            card_tags=tuple(dict.fromkeys(self.card_tags)),
            strengths=tuple(dict.fromkeys(self.strengths)),
            values=tuple(dict.fromkeys(self.values)),
        )


class JobOut(CamelModel):
    name: str
    what: str
    occupation_id: int | None = None


class ExploreOut(CamelModel):
    title: str
    text: str
    jobs: list[JobOut]


class ChatOut(CamelModel):
    done: bool
    # 知る：世界の話と仕事（問いの前に出す）。Gemini が使えずデータに仕事がないときは null
    explore: ExploreOut | None
    question: str
    options: list[str]
    # 答えた数と、問いの最大の数（画面の進み具合の表示に使う）
    turn: int
    max_turns: int
    source: Literal["gemini", "template"]


class PickOut(CamelModel):
    occupation_id: int
    distance: recommend.Distance
    reason: str


class RecommendOut(CamelModel):
    # 空なら、画面はデータでの選び方（pickCards と /api/reasons）に切り替える
    jobs: list[PickOut]
    source: Literal["gemini", "template"]


def create_app() -> FastAPI:
    app = FastAPI(title="Eureka API")

    origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )

    # Gemini を呼ぶ3つは、呼びすぎを止める（app/ratelimit.py）
    limited = [Depends(ratelimit.check)]

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "llm": llm.backend(), "model": llm.default_model()}

    @app.post(
        "/api/chat",
        response_model=ChatOut,
        response_model_by_alias=True,
        dependencies=limited,
    )
    def post_chat(req: ConversationIn) -> ChatOut:
        ctx = req.context()
        nxt = chat.next_turn(ctx)
        explore = None
        if nxt.explore:
            explore = ExploreOut(
                title=nxt.explore.title,
                text=nxt.explore.text,
                jobs=[
                    JobOut(name=j.name, what=j.what, occupation_id=j.occupation_id)
                    for j in nxt.explore.jobs
                ],
            )
        return ChatOut(
            done=nxt.done,
            explore=explore,
            question=nxt.question,
            options=list(nxt.options),
            turn=len(ctx.history),
            max_turns=chat.MAX_TURNS,
            source=nxt.source,
        )

    @app.post(
        "/api/recommend",
        response_model=RecommendOut,
        response_model_by_alias=True,
        dependencies=limited,
    )
    def post_recommend(req: ConversationIn) -> RecommendOut:
        picks, source = recommend.recommend(req.context())
        return RecommendOut(
            jobs=[
                PickOut(occupation_id=p.occupation_id, distance=p.distance, reason=p.reason)
                for p in picks
            ],
            source=source,
        )

    @app.post(
        "/api/reasons",
        response_model=ReasonsResponse,
        response_model_by_alias=True,
        dependencies=limited,
    )
    def post_reasons(req: ReasonsRequest) -> ReasonsResponse:
        data = cards.load()
        items: list[reasons.CardInput] = []
        for card in req.cards:
            if card.tag not in data.tags:
                raise HTTPException(
                    status_code=422, detail=f"職業カードのタグではありません：{card.tag}"
                )
            if data.link(card.occupation_id, card.tag) is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"職業とタグのつながりが見つかりません：{card.occupation_id}",
                )
            items.append(reasons.CardInput(card.occupation_id, card.tag, tuple(card.interests)))
        result, source = reasons.make_reasons(tuple(dict.fromkeys(req.interests)), items)
        return ReasonsResponse(
            reasons=[
                ReasonOut(occupation_id=r.occupation_id, text=r.text, ai=r.ai) for r in result
            ],
            source=source,
        )

    return app


app = create_app()
