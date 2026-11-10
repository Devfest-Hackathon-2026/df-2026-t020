// 診断の結果を、ブラウザ（localStorage）に残しておく入れ物。
// 「最初からやり直す」をしても、前の結果を「過去の結果」（/history）で見返せるようにする。
// 残すのはこの端末のブラウザの中だけで、サーバーには送らない。
// localStorage が使えないとき（プライベートブラウズなど）は、何も残さずに動く。
// 画面のコンポーネント（"use client"）からだけ使う。

import type { Turn } from "./conversation";
import type { Distance } from "./jobCards";
import { ROUNDS, type TagNode } from "./tags";

const KEY = "eureka.results";
/** 残す数の上限。古いものから消す */
const MAX_RESULTS = 20;

/** 結果で紹介した1枚。職業の中身は occupation_cards.json から id で引く */
export type SavedCard = {
  id: number;
  distance: Distance;
  reason?: { text: string; ai: boolean };
  link?: { tag: string; text: string; reviewed: boolean };
};

export type SavedResult = {
  /** 同じタグと会話の結果は1つにまとめる（あとから理由の1文が届いたら上書きする） */
  key: string;
  /** 残した日時（ISO 8601） */
  savedAt: string;
  /** 回ごとの選んだタグの名前（自由記述を含む） */
  tags: { label: string; names: string[] }[];
  history: Turn[];
  cards: SavedCard[];
  /** AI が仕事を選べず、データで選んだか */
  fallback: boolean;
};

export function loadResults(): SavedResult[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedResult[]) : [];
  } catch {
    return [];
  }
}

function store(results: readonly SavedResult[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(results));
  } catch {
    // 容量が足りない・使えないときは残さない
  }
}

/** 回ごとに、選んだタグの名前をまとめる */
export function tagsByRound(tags: readonly TagNode[]): SavedResult["tags"] {
  return ROUNDS.map((round) => ({
    label: round.label,
    names: tags.filter((t) => t.round === round.key).map((t) => t.name),
  })).filter((r) => r.names.length > 0);
}

/** 結果を残す。同じ key のものがあれば、日時はそのままで中身を上書きする */
export function saveResult(result: Omit<SavedResult, "savedAt">) {
  const results = loadResults();
  const same = results.find((r) => r.key === result.key);
  const next: SavedResult = { ...result, savedAt: same?.savedAt ?? new Date().toISOString() };
  store([next, ...results.filter((r) => r.key !== result.key)].slice(0, MAX_RESULTS));
}

export function deleteResult(key: string) {
  store(loadResults().filter((r) => r.key !== key));
}

export function clearResults() {
  store([]);
}
