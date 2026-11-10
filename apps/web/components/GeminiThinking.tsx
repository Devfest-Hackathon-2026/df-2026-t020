// Gemini の返事を待つあいだに出す表示。ロボットがパソコンで作業する小さな絵（SVG と CSS だけで動かす）。
// 1回目はキーを打つだけ。2回目からは、回ごとに次の動きに替わる（variant で選ぶ）。
//   bulb   … ひらめいたように頭の上に電球が出る
//   ball   … 横から転がってきたボールを追いかけて、画面の外へ行って戻ってくる
//   lunch  … ロボットはいなくて、「お昼休憩中」の札と小さな人形だけが置いてある
//   rocket … 急にロケットのように上へ飛んでいき、また降りてくる
// 動きを減らす設定のときは止まった絵にする。絵は飾りなので読み上げには出さず、文だけを読ませる。

import styles from "./GeminiThinking.module.css";

export type ThinkingVariant = "basic" | "bulb" | "ball" | "lunch" | "rocket";

const EXTRAS: readonly ThinkingVariant[] = ["bulb", "ball", "lunch", "rocket"];

/** 何回目の読み込みか（0 から）で、出す動きを決める。1回目はいつもの絵、2回目からは順に替える */
export function thinkingVariant(turn: number): ThinkingVariant {
  if (turn <= 0) return "basic";
  return EXTRAS[(turn - 1) % EXTRAS.length] ?? "basic";
}

function Robot() {
  return (
    <g className={styles.robot}>
      {/* ロケットのときだけ見える炎 */}
      <path d="M52 76 q8 18 16 0 z" className={styles.flame} />
      {/* アンテナ */}
      <line x1="60" y1="10" x2="60" y2="20" className={styles.line} />
      <circle cx="60" cy="8" r="4" className={styles.lamp} />
      {/* 頭 */}
      <rect x="38" y="20" width="44" height="30" rx="9" className={styles.body} />
      <g className={styles.eyes}>
        <circle cx="52" cy="35" r="3.5" className={styles.eye} />
        <circle cx="68" cy="35" r="3.5" className={styles.eye} />
      </g>
      <circle cx="45" cy="43" r="2.5" className={styles.cheek} />
      <circle cx="75" cy="43" r="2.5" className={styles.cheek} />
      {/* 胴 */}
      <rect x="44" y="52" width="32" height="24" rx="6" className={styles.body} />
      {/* 腕（交互に上下してキーを打つ） */}
      <rect x="32" y="60" width="14" height="6" rx="3" className={`${styles.body} ${styles.armL}`} />
      <rect x="74" y="60" width="14" height="6" rx="3" className={`${styles.body} ${styles.armR}`} />
    </g>
  );
}

function Laptop() {
  return (
    <g>
      <path d="M30 72 h60 l8 14 h-76 z" className={styles.laptop} />
      <rect x="22" y="86" width="76" height="4" rx="2" className={styles.laptopBase} />
    </g>
  );
}

function Sparks() {
  return (
    <g className={styles.sparks}>
      <path d="M96 30 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" className={styles.spark} />
      <path d="M22 26 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z" className={styles.spark} />
    </g>
  );
}

function Bulb() {
  return (
    <g className={styles.bulb}>
      <g className={styles.rays}>
        <line x1="60" y1="-26" x2="60" y2="-32" />
        <line x1="45" y1="-20" x2="41" y2="-24" />
        <line x1="75" y1="-20" x2="79" y2="-24" />
        <line x1="40" y1="-8" x2="34" y2="-8" />
        <line x1="80" y1="-8" x2="86" y2="-8" />
      </g>
      <circle cx="60" cy="-10" r="10" className={styles.glass} />
      <rect x="55" y="-1" width="10" height="6" rx="1.5" className={styles.socket} />
    </g>
  );
}

function Ball() {
  return (
    <g className={styles.ball}>
      <g className={styles.ballSpin}>
        <circle cx="0" cy="83" r="7" className={styles.ballBody} />
        <path d="M-7 83 h14 M0 76 v14" className={styles.ballLine} />
      </g>
    </g>
  );
}

function Lunch() {
  return (
    <g>
      {/* 札 */}
      <g className={styles.sign}>
        <line x1="60" y1="50" x2="60" y2="72" className={styles.line} />
        <rect x="28" y="28" width="64" height="24" rx="4" className={styles.board} />
        <text x="60" y="44" textAnchor="middle" className={styles.signText}>
          お昼休憩中
        </text>
      </g>
      {/* 小さな人形（ロボットのミニチュア） */}
      <g className={styles.doll}>
        <rect x="78" y="58" width="12" height="10" rx="3" className={styles.body} />
        <rect x="80" y="68" width="8" height="6" rx="2" className={styles.body} />
        <circle cx="82" cy="63" r="1.2" className={styles.eye} />
        <circle cx="86" cy="63" r="1.2" className={styles.eye} />
        <line x1="84" y1="54" x2="84" y2="58" className={styles.line} />
      </g>
    </g>
  );
}

export default function GeminiThinking({ variant = "basic" }: { variant?: ThinkingVariant }) {
  return (
    <div className={`${styles.wrap} ${styles[`is_${variant}`] ?? ""}`} role="status">
      <svg className={styles.art} viewBox="-60 -40 240 135" aria-hidden="true">
        {variant === "lunch" ? <Lunch /> : <Robot />}
        <Laptop />
        {variant === "basic" && <Sparks />}
        {variant === "bulb" && <Bulb />}
        {variant === "ball" && <Ball />}
      </svg>
      <p className={styles.text}>Gemini思考中…</p>
    </div>
  );
}
