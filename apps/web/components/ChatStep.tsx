"use client";

// 2. 会話。1回ごとに「知る → 反応する → 考える」。
//   知る：世界の話と、知らないかもしれない仕事（API の /api/chat が Gemini でつくる）
//   反応：仕事ごとに「知らなかった／気になる／ピンとこない」
//   考える：見せた話を受けた問いに、選択肢か「その他」の一言で答える
// 答えるたびに、これまでの会話をまとめて送り、次の回か「おしまい（done）」をもらう。

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  cleanAnswer,
  fetchNextTurn,
  MAX_ANSWER_CHARS,
  REACTIONS,
  toggleReaction,
  type NextTurn,
  type Reaction,
  type Turn,
} from "@/data/conversation";
import { ApiError } from "@/data/api";
import type { TagNode } from "@/data/tags";
import { recallChat, rememberChat } from "@/data/visitMemory";
import GeminiThinking, { thinkingVariant } from "./GeminiThinking";
import styles from "./CareerFlow.module.css";

type Props = {
  tags: TagNode[];
  history: Turn[];
  onAnswer: (turn: Turn) => void;
  onUndo: () => void;
  onFinish: () => void;
  onBack: () => void;
};

/** API の返事。forTurns が今の答えの数と違えば、前の回への返事（読み込み中） */
type Loaded = { forTurns: number; next: NextTurn } | { forTurns: number; error: "busy" | "failed" };

/** いまの回で付けた反応。forTurns が違えば前の回のもの */
type Reactions = { forTurns: number; byJob: Record<string, Reaction[]> };

/** 覚えておいた回を引くための鍵（選んだタグとこれまでの答え） */
function chatKey(tags: readonly TagNode[], history: readonly Turn[]) {
  return JSON.stringify([tags.map((t) => t.id), history]);
}

export default function ChatStep({ tags, history, onAnswer, onUndo, onFinish, onBack }: Props) {
  // ほかのページから戻ってきたときは、覚えておいた回と反応をそのまま出す（API を呼び直さない）
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    const saved = recallChat(chatKey(tags, history));
    return saved && { forTurns: history.length, next: saved.next };
  });
  const [reactions, setReactions] = useState<Reactions | null>(() => {
    const saved = recallChat(chatKey(tags, history));
    return saved && { forTurns: history.length, byJob: saved.byJob };
  });
  const [other, setOther] = useState("");
  const [retry, setRetry] = useState(0);
  const headRef = useRef<HTMLHeadingElement>(null);

  // 親が渡す onFinish は毎回新しい関数なので、最新のものを参照だけする
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });

  const turns = history.length;

  useEffect(() => {
    const key = chatKey(tags, history);
    if (recallChat(key)) return;
    const controller = new AbortController();
    fetchNextTurn(tags, history, controller.signal)
      .then((next) => {
        if (next.done) finishRef.current();
        else {
          rememberChat({ key, next, byJob: {} });
          setLoaded({ forTurns: history.length, next });
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        // 429 は呼びすぎ。ほかは、つながらない・返事が遅すぎる・API の中の失敗
        const busy = e instanceof ApiError && e.status === 429;
        setLoaded({ forTurns: history.length, error: busy ? "busy" : "failed" });
      });
    return () => controller.abort();
  }, [tags, history, retry]);

  const current = loaded?.forTurns === turns ? loaded : null;
  const next = current && "next" in current ? current.next : null;
  const byJob = reactions?.forTurns === turns ? reactions.byJob : {};

  // 新しい回が出たら、読み上げ・キーボード操作のために先頭へ移る
  useEffect(() => {
    if (next) headRef.current?.focus();
  }, [next]);

  const react = (job: string, reaction: Reaction) => {
    const nextByJob = { ...byJob, [job]: toggleReaction(byJob[job] ?? [], reaction) };
    setReactions({ forTurns: turns, byJob: nextByJob });
    if (next) rememberChat({ key: chatKey(tags, history), next, byJob: nextByJob });
  };

  const answer = (text: string) => {
    if (!next) return;
    setOther("");
    onAnswer({
      question: next.question,
      options: next.options,
      answer: text,
      explore: next.explore && {
        title: next.explore.title,
        text: next.explore.text,
        jobs: next.explore.jobs.map((j) => ({ ...j, reactions: byJob[j.name] ?? [] })),
      },
    });
  };

  const submitOther = (e: FormEvent) => {
    e.preventDefault();
    const text = cleanAnswer(other);
    if (text) answer(text);
  };

  const maxTurns = next?.maxTurns ?? 6;

  return (
    <section className={styles.card} aria-labelledby="chat-head">
      <div className={styles.chatHead}>
        <span className={styles.count}>
          {turns + 1}回目（最大{maxTurns}回）
        </span>
      </div>

      {history.length > 0 && (
        <details className={styles.answers}>
          <summary>これまでの答え（{history.length}回）</summary>
          <ol className={styles.log}>
            {history.map((t, i) => (
              <li key={i}>
                <span className={styles.logQ}>{t.question}</span>
                <span className={styles.logA}>{t.answer}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {current && "error" in current ? (
        <div className={styles.error} role="alert">
          <p>
            {current.error === "busy"
              ? "アクセスが集中しています。少し待ってから、もう一度試してください。"
              : "読み込めませんでした。少し待ってから、もう一度試してください。"}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setRetry(retry + 1)}>
              もう一度試す
            </button>
            <button type="button" className={styles.secondary} onClick={onFinish}>
              とばして職業を見る
            </button>
          </div>
        </div>
      ) : !next ? (
        <GeminiThinking variant={thinkingVariant(turns)} />
      ) : (
        <>
          {next.explore && (
            <div className={styles.explore}>
              <span className={styles.stage}>知る</span>
              <h2 id="chat-head" ref={headRef} tabIndex={-1} className={styles.exploreTitle}>
                {next.explore.title}
              </h2>
              <p className={styles.exploreText}>{next.explore.text}</p>
              <ul className={styles.jobs}>
                {next.explore.jobs.map((job) => (
                  <li key={job.name} className={styles.job}>
                    <h3 className={styles.jobName}>{job.name}</h3>
                    <p className={styles.jobWhat}>{job.what}</p>
                    <div className={styles.reactions} role="group" aria-label={`${job.name}への反応`}>
                      {REACTIONS.map((reaction) => (
                        <button
                          key={reaction}
                          type="button"
                          className={styles.reaction}
                          aria-pressed={(byJob[job.name] ?? []).includes(reaction)}
                          onClick={() => react(job.name, reaction)}
                        >
                          {reaction}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.think}>
            <span className={styles.stage}>考える</span>
            <h2
              id={next.explore ? "chat-question" : "chat-head"}
              ref={next.explore ? undefined : headRef}
              tabIndex={-1}
              className={styles.question}
            >
              {next.question}
            </h2>
            <div className={styles.options}>
              {next.options.map((option) => (
                <button key={option} type="button" className={styles.option} onClick={() => answer(option)}>
                  {option}
                </button>
              ))}
            </div>
            <form className={styles.other} onSubmit={submitOther}>
              <label htmlFor="chat-other">その他（一言で）</label>
              <div className={styles.otherRow}>
                <input
                  id="chat-other"
                  type="text"
                  value={other}
                  maxLength={MAX_ANSWER_CHARS}
                  placeholder="自由記述"
                  autoComplete="off"
                  onChange={(e) => setOther(e.target.value)}
                />
                <button type="submit" className={styles.secondary} disabled={!cleanAnswer(other)}>
                  答える
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.link} onClick={turns > 0 ? onUndo : onBack}>
          {turns > 0 ? "ひとつ前にもどる" : "選んだタグを見直す"}
        </button>
        <button type="button" className={styles.secondary} disabled={turns === 0} onClick={onFinish}>
          ここまでで職業を見る
        </button>
      </div>
    </section>
  );
}
