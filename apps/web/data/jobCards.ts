// 職業カード（public/data/occupation_cards.json）の型と、見せるカードの選び方。
// JSON は jobs/map-builder の export_cards.py が書き出す生成物なので、手で直さない。
// 選び方：どの仕事を見せるかは Gemini ではなくアプリがデータから決める。
//   1. 選んだタグごとに by_tag から候補を集める
//   2. 身近 → 少し遠い → 意外 の順に出す
//   3. 同じ距離の中では、知られていない（familiarity が低い）職業を先にする
//   4. 同じ分野（major_code）のカードが続かないように散らす

import { cardTagWeights, type CardTag } from "./cardTags";
import type { TagNode } from "./tags";

export const CARDS_URL = "/data/occupation_cards.json";

export const DISTANCES = ["身近", "少し遠い", "意外"] as const;
export type Distance = (typeof DISTANCES)[number];

export type CardLink = {
  tag: CardTag;
  distance: Distance;
  /** なぜ好きなものとつながるか（60字以内） */
  link: string;
  /** false は Gemini の下書き */
  reviewed: boolean;
};

export type Occupation = {
  id: number;
  name: string;
  aliases: string[];
  source: "jobtag" | "onet";
  jp_presence: "日本にもある" | "日本では少ない" | "日本にはほぼない";
  /** 大分類のコード。名前は meta.majors で引く（majorName） */
  major_code: string;
  summary: string;
  related_faculties: string[];
  /** 大学生にとっての知られやすさ（3＝よく知られている）。タグ未付与は null */
  familiarity: 1 | 2 | 3 | null;
  tagged: boolean;
  tags: CardLink[];
};

export type CardsData = {
  meta: {
    status: string;
    /** 画面に出す出典文（利用条件なので必須） */
    attribution_ja: string;
    sources: string[];
    tags: string[];
    /** 大分類のコード → 名前 */
    majors: Record<string, string>;
  };
  occupations: Occupation[];
  by_tag: Record<string, Partial<Record<Distance, number[]>>>;
};

export type PickedCard = {
  occupation: Occupation;
  distance: Distance;
  /** カードに出すつながり（選んだタグのうち、いちばん重いタグのもの） */
  link: CardLink;
};

/** 職業の大分類の名前。カードには major_code だけが入っている（export_cards.py が容量を減らすため） */
export function majorName(data: CardsData, o: Occupation): string {
  return data.meta.majors[o.major_code] ?? "";
}

/** 距離ごとに出すカードの数の上限 */
export const PER_DISTANCE = 4;

const familiarityRank = (o: Occupation) => o.familiarity ?? 4;

/**
 * 選んだ興味タグから、見せる職業カードを選ぶ。
 * 対応する職業カードのタグがなければ空の配列を返す。
 */
export function pickCards(
  data: CardsData,
  selected: readonly TagNode[],
  perDistance = PER_DISTANCE,
  /** 選ばない職業（会話の中でもう見せた仕事。同じカードを2回出さないため） */
  exclude: ReadonlySet<number> = new Set(),
): PickedCard[] {
  const weights = cardTagWeights(selected);
  // 重いタグ（多く選ばれたタグ）から順に回す
  const tags = [...weights.keys()].sort((a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0));
  const byId = new Map(data.occupations.map((o) => [o.id, o]));

  // 職業ごとに、カードに出すつながりを1つ決める：重いタグ → 近い距離 の順
  const linkOf = (o: Occupation): CardLink | undefined =>
    o.tags
      .filter((t) => weights.has(t.tag))
      .sort(
        (a, b) =>
          (weights.get(b.tag) ?? 0) - (weights.get(a.tag) ?? 0) ||
          DISTANCES.indexOf(a.distance) - DISTANCES.indexOf(b.distance),
      )[0];

  const picked: PickedCard[] = [];
  const used = new Set<number>(exclude);

  for (const distance of DISTANCES) {
    // タグごとの候補（知られていない順）
    const queues = tags.map((tag) =>
      (data.by_tag[tag]?.[distance] ?? [])
        .flatMap((id) => byId.get(id) ?? [])
        .filter((o) => linkOf(o)?.distance === distance)
        .sort((a, b) => familiarityRank(a) - familiarityRank(b) || a.id - b.id),
    );

    // タグを順番に回して1件ずつ取る。直前と同じ分野は、できるだけ避ける
    const inThisDistance: PickedCard[] = [];
    let lastMajor = picked.at(-1)?.occupation.major_code;
    let progressed = true;
    while (inThisDistance.length < perDistance && progressed) {
      progressed = false;
      for (const queue of queues) {
        if (inThisDistance.length >= perDistance) break;
        const rest = queue.filter((o) => !used.has(o.id));
        const next = rest.find((o) => o.major_code !== lastMajor) ?? rest[0];
        const link = next && linkOf(next);
        if (!next || !link) continue;
        used.add(next.id);
        inThisDistance.push({ occupation: next, distance, link });
        lastMajor = next.major_code;
        progressed = true;
      }
    }
    picked.push(...inThisDistance);
  }
  return picked;
}
