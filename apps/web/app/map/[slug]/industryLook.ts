// 業界ページの見た目：業界ごとの色（OKLCH の色相）とアイコン。
// アイコンは 24×24 の線画（サイドバーのアイコンと同じく、塗らずに線で描く）。path の d を並べる。
// 色は page.module.css の .tone が --hue・--chroma から作る。ふだんは濃い丸に白い線で、
// tone: "light" の業界は明るい丸に濃い線にする（黄〜黄緑は暗くすると濁るので必ずこちら。
// ほかの色相でも、近い色の業界と見分けやすくするために使う）。
// 業界を足したときにここへ足し忘れても、ページは FALLBACK の見た目で出る。

import type { CSSProperties } from "react";

export type IndustryLook = {
  /** OKLCH の色相（0〜360） */
  hue: number;
  /** OKLCH の彩度。省くと 0.13 */
  chroma?: number;
  /** 濃い丸の明るさ（OKLCH の L）。省くと 0.6 */
  lightness?: number;
  /** 明るい丸に濃い線で描く */
  tone?: "light";
  /** アイコンの path（viewBox 0 0 24 24、線画） */
  icon: string[];
};

const LOOKS: Record<string, IndustryLook> = {
  // 芽
  agriculture: {
    hue: 140,
    icon: [
      "M12 21v-8",
      "M12 13c0-4.4 3-7.5 7.5-7.5 0 4.4-3 7.5-7.5 7.5z",
      "M12 15.5c0-3.3-2.5-5.5-6.5-5.5 0 3.3 2.5 5.5 6.5 5.5z",
      "M6 21h12",
    ],
  },
  // クレーン
  construction: {
    hue: 92,
    chroma: 0.15,
    tone: "light",
    icon: ["M8 21V3", "M4 6.5h16", "M4 6.5 8 3l12 3.5", "M17 6.5v5", "M17 11.5a1.6 1.6 0 1 1-1.6 1.6", "M5 21h6"],
  },
  // 工場
  manufacturing: {
    hue: 240,
    icon: ["M3 21V10.5l5 3.5v-3.5l5 3.5v-3.5l5 3.5V4h3v17z", "M6.5 17.5h1.5", "M11 17.5h1.5"],
  },
  // いなずま
  energy: {
    hue: 205,
    chroma: 0.1,
    tone: "light",
    icon: ["M13 2.5 5 13.5h6l-1 8 8-11h-6z"],
  },
  // 葉と、ひと回りする矢印
  environment: {
    hue: 165,
    chroma: 0.11,
    tone: "light",
    icon: [
      "M19.5 12a7.5 7.5 0 1 1-2.2-5.3",
      "M17.8 2.8v4.4h-4.4",
      "M9 15.5c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6z",
      "M9 15.5l3-3",
    ],
  },
  // 画面と再生ボタン
  "it-media": {
    hue: 268,
    icon: [
      "M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5z",
      "M12 16v4",
      "M8.5 20h7",
      "M10.5 7.5v5l4-2.5z",
    ],
  },
  // トラック
  logistics: {
    hue: 58,
    icon: [
      "M2.5 6h11v10.5h-11z",
      "M13.5 9.5H17l3.5 3.5v3.5h-7",
      "M8.3 17.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0z",
      "M18.8 17.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0z",
    ],
  },
  // スパナ
  repair: {
    hue: 225,
    chroma: 0.06,
    icon: [
      "M14.6 4.3a4.6 4.6 0 0 0-5.4 6.2l-5.6 5.6a1.9 1.9 0 0 0 2.7 2.7l5.6-5.6a4.6 4.6 0 0 0 6.2-5.4l-2.8 2.8-2.5-.4-.4-2.5z",
    ],
  },
  // 買い物ぶくろ
  "trading-retail": {
    hue: 38,
    icon: ["M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z", "M9 10.5V7a3 3 0 0 1 6 0v3.5"],
  },
  // Tシャツ
  fashion: {
    hue: 352,
    icon: [
      "M9 3.5 4 6l-1.5 4 3 1.2L7 10v10.5h10V10l1.5 1.2 3-1.2L20 6l-5-2.5c-.5 1.5-1.7 2.3-3 2.3S9.5 5 9 3.5z",
    ],
  },
  // 円のコイン
  finance: {
    hue: 182,
    icon: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "M8.5 7l3.5 5 3.5-5", "M12 12v5.5", "M9 12.5h6", "M9 15h6"],
  },
  // ビル
  "real-estate": {
    hue: 125,
    chroma: 0.14,
    tone: "light",
    icon: [
      "M4.5 21V6.5L11 3.5V21",
      "M11 10h8.5v11",
      "M2.5 21h19",
      "M7.5 8.5h.5",
      "M7.5 12h.5",
      "M7.5 15.5h.5",
      "M14.5 13.5h1.5",
      "M14.5 17h1.5",
    ],
  },
  // たて
  security: {
    hue: 285,
    chroma: 0.09,
    tone: "light",
    icon: ["M12 3 19 6v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6z", "M9 12l2 2 4-4"],
  },
  // フラスコ
  professional: {
    hue: 305,
    icon: [
      "M9.5 3h5",
      "M10.5 3v6L5.2 18.5A1.7 1.7 0 0 0 6.7 21h10.6a1.7 1.7 0 0 0 1.5-2.5L13.5 9V3",
      "M7.6 15h8.8",
    ],
  },
  // 料理のふた（クローシュ）
  hospitality: {
    hue: 30,
    chroma: 0.1,
    tone: "light",
    icon: ["M4.5 17a7.5 7.5 0 0 1 15 0", "M3 17h18", "M12 9.5V7.5", "M10.5 7.5h3", "M5.5 20h13"],
  },
  // スーツケース
  lifestyle: {
    hue: 345,
    chroma: 0.09,
    tone: "light",
    icon: [
      "M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z",
      "M9 7V4.5h6V7",
      "M8 7v13",
      "M16 7v13",
    ],
  },
  // 星
  entertainment: {
    hue: 330,
    icon: ["M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"],
  },
  // 足あと
  animals: {
    hue: 70,
    chroma: 0.14,
    tone: "light",
    icon: [
      "M12 12.5c-2.8 0-5 2.6-5 4.8 0 1.6 1.3 2.4 2.7 2.4.9 0 1.5-.4 2.3-.4s1.4.4 2.3.4c1.4 0 2.7-.8 2.7-2.4 0-2.2-2.2-4.8-5-4.8z",
      "M7.1 10.5a1.6 1.9 0 1 1-3.2 0 1.6 1.9 0 0 1 3.2 0z",
      "M11.1 6.5a1.6 1.9 0 1 1-3.2 0 1.6 1.9 0 0 1 3.2 0z",
      "M16.1 6.5a1.6 1.9 0 1 1-3.2 0 1.6 1.9 0 0 1 3.2 0z",
      "M20.1 10.5a1.6 1.9 0 1 1-3.2 0 1.6 1.9 0 0 1 3.2 0z",
    ],
  },
  // ひらいた本
  education: {
    hue: 240,
    chroma: 0.09,
    tone: "light",
    icon: ["M12 6.5C10 5 7 4.5 3 5v13.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5z", "M12 6.5V20"],
  },
  // ハートと十字
  healthcare: {
    hue: 18,
    icon: [
      "M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8 2.5c0 5.9-8 10.6-8 10.6z",
      "M12 10.8v5",
      "M9.5 13.3h5",
    ],
  },
  // 柱のある建物
  "public-service": {
    hue: 258,
    lightness: 0.48,
    icon: ["M3.5 9 12 4l8.5 5z", "M6.5 11.5v6", "M10.2 11.5v6", "M13.8 11.5v6", "M17.5 11.5v6", "M4 20.5h16"],
  },
  // かばん
  common: {
    hue: 60,
    chroma: 0.025,
    icon: [
      "M3.5 9A1.5 1.5 0 0 1 5 7.5h14A1.5 1.5 0 0 1 20.5 9v9.5A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z",
      "M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5",
      "M3.5 13h17",
    ],
  },
};

const FALLBACK: IndustryLook = LOOKS.common!;

export function lookOf(slug: string): IndustryLook {
  return LOOKS[slug] ?? FALLBACK;
}

/** .tone を付けた要素に渡す、色の元になる値 */
export function toneProps(look: IndustryLook): { style: CSSProperties; "data-tone"?: "light" } {
  const style = {
    "--hue": look.hue,
    "--chroma": look.chroma ?? 0.13,
    ...(look.lightness ? { "--lightness": look.lightness } : {}),
  } as CSSProperties;
  return look.tone ? { style, "data-tone": look.tone } : { style };
}
