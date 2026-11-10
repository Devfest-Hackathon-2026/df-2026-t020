// 診断（ホーム）の途中と結果を、仕事の街や業界ページへ移ってもどってきても続きから見られるように覚えておく入れ物。
// 覚えるのはブラウザのメモリの中だけ（localStorage などには保存しない）。ページを読み込み直すか閉じると消える。
// 画面のコンポーネント（"use client"）からだけ使う。

import type { JobPick, NextTurn, Reaction, Turn } from "./conversation";
import type { RoundKey } from "./tags";

/** ホームの流れ（components/CareerFlow.tsx）の状態 */
export type FlowMemory = {
  step: "hobby" | "chat" | "result";
  round: number;
  selected: ReadonlySet<string>;
  freeTexts: Partial<Record<RoundKey, string>>;
  history: Turn[];
};

let flow: FlowMemory | null = null;

export function recallFlow(): FlowMemory | null {
  return flow;
}

export function rememberFlow(next: FlowMemory | null) {
  flow = next;
}

/** 会話の画面でいま出している回（/api/chat の返事）と、その回で付けた反応。
 *  同じタグと答えなら、もどってきたときに作り直さない */
type ChatMemory = { key: string; next: NextTurn; byJob: Record<string, Reaction[]> };
let chat: ChatMemory | null = null;

export function recallChat(key: string): ChatMemory | null {
  return chat?.key === key ? chat : null;
}

export function rememberChat(next: ChatMemory) {
  chat = next;
}

/** Gemini が選んだ仕事（/api/recommend の返事）。同じタグと会話なら、もどってきたときに選び直さない */
let picks: { key: string; picks: JobPick[] } | null = null;

export function recallPicks(key: string): JobPick[] | null {
  return picks?.key === key ? picks.picks : null;
}

export function rememberPicks(key: string, next: JobPick[]) {
  picks = { key, picks: next };
}

/** 診断の結果で紹介した仕事（職業カードの id と、あなたとのつながりの1文）。仕事の街で光らせるのに使う */
export type RecommendedJob = {
  id: number;
  reason?: string;
  /** つながりの1文を AI がつくったか */
  ai?: boolean;
};

let recommended: readonly RecommendedJob[] = [];

export function recallRecommended(): readonly RecommendedJob[] {
  return recommended;
}

export function rememberRecommended(next: readonly RecommendedJob[]) {
  recommended = next;
}

/** ヘッダーのロゴを押したときに送る合図。ホームを開いていれば、CareerFlow が最初の画面にもどる */
export const START_OVER_EVENT = "eureka:start-over";

/** 診断の途中を忘れて、ホームを最初の画面から始める（ヘッダーのロゴから呼ぶ） */
export function startOver() {
  flow = null;
  chat = null;
  recommended = [];
  window.dispatchEvent(new Event(START_OVER_EVENT));
}
