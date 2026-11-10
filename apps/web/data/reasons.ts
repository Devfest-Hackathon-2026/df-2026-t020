// 職業カードに添える「あなたに関係ある理由」の1文を、API（services/api の POST /api/reasons）からもらう。
// 1文は API が Gemini Flash でつくる。Gemini が使えないときは、API が決まった文を返す。
// API が動いていないとき（静的ファイルだけで開いたときなど）は、1文なしでカードだけ出す。
// いまは、Gemini が職業を選べなかったとき（/api/recommend が空）の代わりの道でだけ使う。

import { postJson } from "./api";
import { cardTagsOf } from "./cardTags";
import type { PickedCard } from "./jobCards";
import { interestNames, type TagNode } from "./tags";

/** API が受け付ける数の上限（services/api の ReasonsRequest と同じ） */
const MAX_INTERESTS = 40;
const MAX_CARD_INTERESTS = 10;

export type Reason = {
  text: string;
  /** Gemini がつくった文か。false は API の決まった文 */
  ai: boolean;
};

type ReasonsResponse = {
  reasons: { occupationId: number; text: string; ai: boolean }[];
};

/** そのカードのタグにつながる好きなもの（詳しいタグを先に）と、選んだ好きな関わり方の名前 */
function interestsFor(selected: readonly TagNode[], card: PickedCard): string[] {
  const things = selected
    .filter((node) => cardTagsOf(node).includes(card.link.tag))
    .sort((a, b) => b.depth - a.depth);
  const ways = selected.filter((node) => node.round === "way");
  return [...things, ...ways].map((node) => node.name).slice(0, MAX_CARD_INTERESTS);
}

/** 選び方とカードが同じなら同じ値になる。届いた1文が、いま出ているカードのものかを確かめるのに使う */
export function reasonsKey(selected: readonly TagNode[], cards: readonly PickedCard[]): string {
  const tags = selected.map((node) => node.id).join(",");
  const picked = cards.map((card) => `${card.occupation.id}:${card.link.tag}`).join(",");
  return `${tags}|${picked}`;
}

/** 職業ID → 理由の1文 */
export async function fetchReasons(
  selected: readonly TagNode[],
  cards: readonly PickedCard[],
  signal?: AbortSignal,
): Promise<Map<number, Reason>> {
  const body = {
    // 「好きなこと」は好きなもの と 好きな関わり方（得意なこと・大事にしたいことは送らない）
    interests: interestNames(selected, MAX_INTERESTS),
    cards: cards.map((card) => ({
      occupationId: card.occupation.id,
      tag: card.link.tag,
      interests: interestsFor(selected, card),
    })),
  };
  const json = await postJson<ReasonsResponse>("/api/reasons", body, signal);
  return new Map(json.reasons.map((r) => [r.occupationId, { text: r.text, ai: r.ai }]));
}
