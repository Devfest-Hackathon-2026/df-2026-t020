// RIASEC（ホランド理論）の6タイプの定義と採点。

import type { TagNode } from "./tags";

export const ORDER = ["R", "I", "A", "S", "E", "C"] as const;
export type TypeCode = (typeof ORDER)[number];
export type Weights = Partial<Record<TypeCode, number>>;
export type Scores = Record<TypeCode, number>;

export type RiasecType = {
  name: string;
  /** globals.css のトークン名（--type-R など） */
  color: string;
  desc: string;
  jobs: string;
};

export const TYPES: Record<TypeCode, RiasecType> = {
  R: {
    name: "現実的",
    color: "var(--type-R)",
    desc: "手や体、道具を使って、目に見えるものを動かしたり作ったりするのが好き。",
    jobs: "整備士・調理師・建築・農業・技術職",
  },
  I: {
    name: "研究的",
    color: "var(--type-I)",
    desc: "「なぜ？」を考えるのが好き。調べたり分析したりして、しくみを理解したい。",
    jobs: "研究者・エンジニア・医療技術・データ分析",
  },
  A: {
    name: "芸術的",
    color: "var(--type-A)",
    desc: "自分の感性で表現するのが好き。決まった型より、自由に生み出すことに惹かれる。",
    jobs: "デザイナー・ライター・映像制作・音楽",
  },
  S: {
    name: "社会的",
    color: "var(--type-S)",
    desc: "人の役に立つこと、教えたり支えたりすることにやりがいを感じる。",
    jobs: "教員・看護・福祉・カウンセラー・保育",
  },
  E: {
    name: "企業的",
    color: "var(--type-E)",
    desc: "人を動かしたり、目標に向かって挑戦したりするのが好き。",
    jobs: "営業・企画・経営・広報・マーケティング",
  },
  C: {
    name: "慣習的",
    color: "var(--type-C)",
    desc: "決まった手順でコツコツ正確に進めたり、情報を整理したりするのが得意。",
    jobs: "事務・経理・品質管理・図書館・データ管理",
  },
};

/** 診断できる最小のタグ数 */
export const MIN_TAGS = 3;

const emptyScores = (): Scores => ({ R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 });

/**
 * 1つの第1階層のタグの下にある詳しいタグ（子孫）から入る点の上限（全タイプの合計）。
 * 深く選ぶほど点が膨らまないよう、選んだ詳しいタグの点の合計がこれを超えたら、比率を保ったまま縮める。
 * 例：「スポーツをする」（R1）と「大会に出る」（E1）を両方選ぶと、R と E に 0.5 点ずつ。
 */
export const DETAIL_BUDGET = 1;

/**
 * 詳しいタグ全体から入る点の上限（全タイプの合計）。好きなものを多く選ぶ人ほど点が増えないようにする。
 * 2回目（関わり方）は最大10点、3回目・4回目は最大6点ずつなので、詳しいタグは補助にとどめる。
 */
export const DETAIL_TOTAL_BUDGET = 3;

/** 同点とみなす差（詳しいタグを縮めると端数が出るため） */
const EPSILON = 1e-9;

const total = (w: Weights) => ORDER.reduce((sum, code) => sum + (w[code] ?? 0), 0);

/**
 * 選ばれたタグの重みを、タイプごとに合計する。sources は各タイプに点を入れたタグ。
 * 第1階層のタグはそのまま足す。詳しいタグは、同じ第1階層の木ごとに DETAIL_BUDGET 点までに縮め、
 * さらに全体で DETAIL_TOTAL_BUDGET 点までに縮めて足す。
 * selfScores は得意なこと・大事にしたいことから入った点だけ。同点のときの順番に使う（topTypes）。
 */
export function score(tags: TagNode[]) {
  const scores = emptyScores();
  const selfScores = emptyScores();
  const sources: Record<TypeCode, TagNode[]> = { R: [], I: [], A: [], S: [], E: [], C: [] };

  // 木ごとの、詳しいタグの点の合計
  const detailTotal = new Map<string, number>();
  for (const tag of tags) {
    if (tag.depth > 0) detailTotal.set(tag.root, (detailTotal.get(tag.root) ?? 0) + total(tag.w));
  }
  const treeFactor = (root: string) => {
    const sum = detailTotal.get(root) ?? 0;
    return sum > DETAIL_BUDGET ? DETAIL_BUDGET / sum : 1;
  };
  // 木ごとに縮めたあとの、詳しいタグ全体の点
  const allDetails = [...detailTotal].reduce((sum, [root, t]) => sum + t * treeFactor(root), 0);
  const totalFactor = allDetails > DETAIL_TOTAL_BUDGET ? DETAIL_TOTAL_BUDGET / allDetails : 1;

  for (const tag of tags) {
    const factor = tag.depth > 0 ? treeFactor(tag.root) * totalFactor : 1;
    const self = tag.round === "good" || tag.round === "value";
    for (const code of ORDER) {
      const w = tag.w[code];
      if (w) {
        scores[code] += w * factor;
        if (self) selfScores[code] += w * factor;
        sources[code].push(tag);
      }
    }
  }
  return { scores, selfScores, sources };
}

/**
 * 得点の高い順に上位3タイプ（ホランドコード）。0点のタイプは含めない。
 * 同点は、得意なこと・大事にしたいことの点（selfScores）が高い方を先にし、それも同じなら R→I→A→S→E→C の順。
 * 点は2点単位なので同点はよく起きる。決まった順だけで決めると R・I・A に寄るため、本人の自己評価で分ける。
 */
export function topTypes(scores: Scores, selfScores?: Scores): TypeCode[] {
  const cmp = (x: number, y: number) => (Math.abs(x - y) < EPSILON ? 0 : y - x);
  return [...ORDER]
    .sort(
      (a, b) =>
        cmp(scores[a], scores[b]) ||
        (selfScores ? cmp(selfScores[a], selfScores[b]) : 0) ||
        ORDER.indexOf(a) - ORDER.indexOf(b),
    )
    .slice(0, 3)
    .filter((code) => scores[code] > EPSILON);
}
