"use client";

// 1. 自分のことを、4回に分けてタグで選ぶ（好きなもの → 好きな関わり方 → 得意なこと → 大事にしたいこと。data/tags.ts の ROUNDS）。
// 子タグを持つタグを選ぶと、詳しいタグが改行して下の段に出る（いまは好きなものの回だけ）。必要な数は第1階層のタグで数える。
// ここでは職業名も診断結果も出さない（知らない仕事に出会うのは、会話のあと）。

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { FREE_TEXT_MAX, ROUNDS, type Round, type TagNode } from "@/data/tags";
import styles from "./HobbyPicker.module.css";

type Props = {
  round: Round;
  /** 何回目か（0 から） */
  index: number;
  total: number;
  selected: ReadonlySet<string>;
  /** 選んだ順のタグ（すべての回） */
  selectedTags: TagNode[];
  /** 直前に増えた子タグ（弾むアニメーション） */
  fresh: ReadonlySet<string>;
  onToggle: (node: TagNode) => void;
  /** この回の自由記述（入力そのまま。round.freeText が null の回では使わない） */
  freeText: string;
  onFreeText: (text: string) => void;
  /** この回の選択（自由記述も）をすべて外す */
  onClear: () => void;
  onNext: () => void;
  /** ひとつ前の回にもどる。1回目では null */
  onPrev: (() => void) | null;
};

const pillColor = (node: TagNode) => ({ "--c": node.color }) as CSSProperties;

export default function HobbyPicker({
  round,
  index,
  total,
  selected,
  selectedTags,
  fresh,
  onToggle,
  freeText,
  onFreeText,
  onClear,
  onNext,
  onPrev,
}: Props) {
  // 選んだタグ（自由記述のタグも含む。外すボタンとして並べる）
  const chosen = selectedTags.filter((node) => node.round === round.key);
  const picked = chosen.filter((node) => !node.free);
  // 必要な数は第1階層のタグで数える（詳しいタグと自由記述は数えない）
  const left = round.min - picked.filter((node) => node.depth === 0).length;
  // 上限には自由記述も数える（API に送れる数と同じにして、送られないタグが出ないようにする）
  const full = round.max !== null && chosen.length >= round.max;
  const hasFree = chosen.some((node) => node.free);
  // 上限まで選んだら、自由記述はまだ書いていないときだけ書けなくする（書いたものは直せる）
  const freeLocked = full && !hasFree && freeText.trim() === "";
  const last = index === total - 1;
  const hasDetail = round.roots.some((node) => node.children.length > 0);

  /** タグを並べる。選んだタグに子があれば、改行して下の段に子を出す（孫も同じ） */
  const renderTags = (nodes: readonly TagNode[]): ReactNode =>
    nodes.map((node) => {
      const isSel = selected.has(node.id);
      const cls = [
        styles.pill,
        node.depth > 0 && styles.child,
        isSel && styles.sel,
        node.children.length > 0 && styles.parent,
        fresh.has(node.id) && styles.fresh,
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <Fragment key={node.id}>
          <button
            type="button"
            className={cls}
            style={pillColor(node)}
            aria-pressed={isSel}
            disabled={full && !isSel}
            title={node.children.length > 0 ? "選ぶと詳しいタグが出ます" : undefined}
            onClick={() => onToggle(node)}
          >
            {node.name}
          </button>
          {isSel && node.children.length > 0 && (
            <div className={styles.detail} style={pillColor(node)} role="group" aria-label={`${node.name}の詳しいタグ`}>
              {renderTags(node.children)}
            </div>
          )}
        </Fragment>
      );
    });

  return (
    <div className={styles.app}>
      <section className={styles.card}>
        <div className={styles.round}>
          {index + 1} / {total}　{round.label}
        </div>
        <h1 className={styles.title}>{round.title}</h1>
        <p className={styles.lead}>{round.lead}</p>
        <ul className={styles.notes}>
          <li>
            {round.max === null
              ? `${round.min}つ以上選んでください`
              : `${round.min}〜${round.max}つ選んでください`}
          </li>
          {hasDetail && <li>タップすると、その下に詳しいタグが出てきます（選ばなくても先へ進めます）</li>}
          <li>
            {total}つの質問（{ROUNDS.map((r) => r.label).join("・")}）に答えたら、いくつか質問します
          </li>
        </ul>
        <div className={styles.cloud}>{renderTags(round.roots)}</div>
        {round.freeText !== null && (
          <div className={styles.free}>
            <label htmlFor={`free-${round.key}`}>
              タグにないことでも記述してください（{FREE_TEXT_MAX}字まで・書いたものも{round.max}つに数えます）
            </label>
            <input
              id={`free-${round.key}`}
              type="text"
              value={freeText}
              maxLength={FREE_TEXT_MAX}
              disabled={freeLocked}
              placeholder={freeLocked ? `タグを${round.max}つ選んでいるので書けません。どれかを外すと書けます` : round.freeText}
              autoComplete="off"
              onChange={(e) => onFreeText(e.target.value)}
            />
          </div>
        )}
      </section>

      <aside className={styles.side}>
        <div className={`${styles.card} ${styles.sideCard}`}>
          <h2 className={styles.sideTitle}>
            選んだ{round.label} <small>{picked.length}個</small>
          </h2>
          <div className={styles.chosen}>
            {chosen.length > 0 ? (
              chosen.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={`${styles.pill} ${styles.sel} ${styles.chip}`}
                  style={pillColor(node)}
                  title="外す"
                  onClick={() => onToggle(node)}
                >
                  {node.name}
                </button>
              ))
            ) : (
              <span className={styles.empty}>まだ選ばれていません</span>
            )}
          </div>
          <button type="button" className={styles.go} disabled={left > 0} onClick={onNext}>
            {left > 0 ? `あと${left}個選んでください` : last ? "次へ：質問に答える" : "次へ"}
          </button>
          {onPrev && (
            <button type="button" className={styles.reset} onClick={onPrev}>
              ‹ ひとつ前にもどる
            </button>
          )}
          <button type="button" className={styles.reset} onClick={onClear}>
            この選択をすべて解除
          </button>
        </div>
      </aside>
    </div>
  );
}
