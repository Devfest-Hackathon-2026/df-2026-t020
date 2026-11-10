// 職業カードの「好きなもの」タグ（occupation_cards.json の meta.tags）と、選んだタグとの対応。
// 職業カードのタグは jobs/map-builder の tags.py が元で、職業ごとのタグ付けはそちらで済んでいる。
// 1回目の「好きなもの」（data/tags.ts）は、このタグをそのまま並べたものなので、対応表はいらない。
// 「好きな関わり方」「得意なこと」「大事にしたいこと」は職業カードにはつながらず、RIASEC の点と Gemini への入力にだけ使う。

import type { TagNode } from "./tags";

/** 職業カードの「好きなもの」タグ（23個）。並びは「好きなもの」の画面に出す順 */
export const CARD_TAG_NAMES = [
  "ゲーム",
  "アニメ・マンガ",
  "音楽",
  "動画・写真（観る・撮る・配信）",
  "スポーツ",
  "推し活・ライブ",
  "ファッション",
  "コスメ・美容",
  "料理・お菓子",
  "旅行",
  "絵・デザイン",
  "スマホ・アプリ",
  "SNS",
  "買い物（コンビニ・ネット通販）",
  "電車・乗り物",
  "家・インテリア・まち",
  "動物・ペット",
  "自然・植物",
  "本・読書",
  "英語",
  "数学",
  "理科・実験",
  "歴史・社会",
] as const;

export type CardTag = (typeof CARD_TAG_NAMES)[number];

const isCardTag = (name: string): name is CardTag => (CARD_TAG_NAMES as readonly string[]).includes(name);

/** そのタグが表す職業カードのタグ。「好きなもの」のタグだけが、同じ名前のカードのタグにつながる（詳しいタグは親のものを受け継ぐ） */
export function cardTagsOf(node: TagNode): CardTag[] {
  return node.round === "thing" && isCardTag(node.root) ? [node.root] : [];
}

/**
 * 選んだタグから、職業カードのタグごとの重みを数える。
 * 重みは「そのカードのタグにつながる、選ばれたタグの数」。詳しいタグまで選んだ好きなものほど重くなり、その職業から先に出る。
 */
export function cardTagWeights(selected: readonly TagNode[]): Map<CardTag, number> {
  const weights = new Map<CardTag, number>();
  for (const node of selected) {
    for (const t of cardTagsOf(node)) weights.set(t, (weights.get(t) ?? 0) + 1);
  }
  return weights;
}
