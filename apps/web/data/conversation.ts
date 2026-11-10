// 趣味を選んだあとの会話（POST /api/chat）と、会話のあとの職業の推薦（POST /api/recommend）。
// 会話の1回は「知る（世界の話と仕事）→ 仕事への反応 → 考える（問いに答える）」の組。
// API は会話を保存しないので、画面が毎回これまでの会話（見せた仕事と反応を含む）をまとめて送る。
// RIASEC の上位タイプは画面には出さず、Gemini への入力にだけ使う。
// タグは4回（好きなもの・好きな関わり方・得意なこと・大事にしたいこと）に分けて選ぶ。上位タイプは点の付いたタグから出す。
// 「好きなこと」（interests）は好きなものと好きな関わり方から、職業データのタグ（cardTags）は好きなものだけから作る。
// 得意なこと（strengths）と大事にしたいこと（values）は、Gemini に別々に渡すために分けて送る。
// API が受け取る数は3個まで（services/api の MAX_SELF_TAGS）。画面でも自由記述を含めて3個までしか選べないが、念のため3個に絞る。

import { postJson } from "./api";
import { cardTagWeights } from "./cardTags";
import type { Distance } from "./jobCards";
import { score, topTypes } from "./riasec";
import { interestNames, tagsOf, thingTags, type TagNode } from "./tags";

/** 会話の中で見せた仕事への反応 */
export const REACTIONS = ["知らなかった", "気になる", "ピンとこない"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** 知る：問いの前に見せる世界の話と仕事（Gemini の知識で書く。出典はない） */
export type Explore = {
  title: string;
  text: string;
  jobs: { name: string; what: string; occupationId?: number | null }[];
};

/** 見せた仕事と、それに付けた反応 */
export type ShownJob = {
  name: string;
  what: string;
  reactions: Reaction[];
  /** 職業カードの id（API が職業データから選んだ仕事）。前の版の結果にはない */
  occupationId?: number | null;
};

/** 答えた1回 */
export type Turn = {
  question: string;
  options: string[];
  /** 選んだ選択肢か、「その他」に書いた一言 */
  answer: string;
  explore: { title: string; text: string; jobs: ShownJob[] } | null;
};

export type NextTurn = {
  /** true なら会話はおしまい（職業カードへ進む） */
  done: boolean;
  /** Gemini が使えず、データにも仕事がないときは null */
  explore: Explore | null;
  question: string;
  options: string[];
  /** 答えた数 */
  turn: number;
  maxTurns: number;
  /** "template" は Gemini が使えず、決まった問いを返したとき */
  source: "gemini" | "template";
};

export type JobPick = {
  occupationId: number;
  distance: Distance;
  /** なぜこの仕事を紹介するのか（Gemini がつくった1文） */
  reason: string;
};

type RecommendResponse = {
  /** 空なら、Gemini が選べなかった。画面はデータでの選び方に切り替える */
  jobs: JobPick[];
  source: "gemini" | "template";
};

/** API が受け付ける長さ（services/api の main.py と同じ） */
export const MAX_ANSWER_CHARS = 40;
const MAX_INTERESTS = 40;
/** 推薦は1,000職業を読むので長く待つ（API の上限は60秒。Hosting から Cloud Run への転送も60秒で切れる） */
const RECOMMEND_TIMEOUT_MS = 65_000;
/** 得意なこと・大事にしたいことを送る数の上限（services/api の MAX_SELF_TAGS と同じ） */
const MAX_SELF_TAGS = 3;

/**
 * その回のタグの名前を、上限まで。自由記述（本人のことば）を先に、次に詳しいタグ（深いもの）、同じ深さなら選んだ順。
 * 画面では自由記述も3個に数えるので、ふつうは全部送られる。
 */
function selfTags(selected: readonly TagNode[], round: "good" | "value"): string[] {
  return tagsOf(selected, round)
    .map((node, i) => ({ node, i }))
    .sort((a, b) => Number(!!b.node.free) - Number(!!a.node.free) || b.node.depth - a.node.depth || a.i - b.i)
    .map(({ node }) => node.name)
    .slice(0, MAX_SELF_TAGS);
}

/** 「その他」に書いた一言を、API が受け付ける形にそろえる。空なら null */
export function cleanAnswer(text: string): string | null {
  const cleaned = text.replace(/[\r\n<>{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER_CHARS);
  return cleaned || null;
}

function payload(selected: readonly TagNode[], history: readonly Turn[]) {
  const points = score([...selected]);
  return {
    interests: interestNames(selected, MAX_INTERESTS),
    strengths: selfTags(selected, "good"),
    values: selfTags(selected, "value"),
    riasec: topTypes(points.scores, points.selfScores),
    // 職業データのタグ。Gemini が使えないとき、API がデータから見せる仕事を選ぶのに使う
    cardTags: [...cardTagWeights(thingTags(selected)).keys()],
    history,
  };
}

/** 会話で見せた仕事の全部（見せた順） */
export function shownJobs(history: readonly Turn[]): ShownJob[] {
  return history.flatMap((t) => t.explore?.jobs ?? []);
}

/** 反応の切り替え。「気になる」と「ピンとこない」は同時に付けない */
export function toggleReaction(current: readonly Reaction[], reaction: Reaction): Reaction[] {
  if (current.includes(reaction)) return current.filter((r) => r !== reaction);
  const opposite: Partial<Record<Reaction, Reaction>> = { 気になる: "ピンとこない", ピンとこない: "気になる" };
  return [...current.filter((r) => r !== opposite[reaction]), reaction];
}

export function fetchNextTurn(selected: readonly TagNode[], history: readonly Turn[], signal?: AbortSignal) {
  return postJson<NextTurn>("/api/chat", payload(selected, history), signal);
}

export async function fetchRecommend(
  selected: readonly TagNode[],
  history: readonly Turn[],
  signal?: AbortSignal,
): Promise<JobPick[]> {
  const json = await postJson<RecommendResponse>(
    "/api/recommend",
    payload(selected, history),
    signal,
    RECOMMEND_TIMEOUT_MS,
  );
  return json.jobs;
}
