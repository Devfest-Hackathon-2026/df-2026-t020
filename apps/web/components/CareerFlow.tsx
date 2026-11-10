"use client";

// ホーム（/）の流れ：自分のことを選ぶ（好きなもの → 好きな関わり方 → 得意なこと → 大事にしたいこと）→ 選択肢で答える会話 → 職業カード。
// 状態はここで持ち、3つの画面は表示と入力だけを受け持つ。
// 選んだタグと会話は保存しない（ページを閉じると消える）。
// ただし、結果から仕事の街や業界ページを見にいって、もどってきたときに続きから見られるよう、
// ページを開いている間だけメモリに覚えておく（data/visitMemory.ts。読み込み直すと消える）。

import { useEffect, useMemo, useRef, useState } from "react";
import ChatStep from "@/components/ChatStep";
import HobbyPicker from "@/components/HobbyPicker";
import JobResults from "@/components/JobResults";
import type { Turn } from "@/data/conversation";
import { freeTag, NODES, ROUNDS, withDescendants, type RoundKey, type TagNode } from "@/data/tags";
import { START_OVER_EVENT, recallFlow, rememberFlow, rememberRecommended } from "@/data/visitMemory";
import styles from "./CareerFlow.module.css";

type Step = "hobby" | "chat" | "result";

const STEPS: { step: Step; label: string }[] = [
  { step: "hobby", label: "自分のこと" },
  { step: "chat", label: "質問に答える" },
  { step: "result", label: "職業に出会う" },
];

export default function CareerFlow() {
  // ほかのページからもどってきたときは、覚えておいた続きから始める
  const [step, setStep] = useState<Step>(() => recallFlow()?.step ?? "hobby");
  /** 自分のことを選ぶ画面の、何回目か（ROUNDS の添字） */
  const [round, setRound] = useState(() => recallFlow()?.round ?? 0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => recallFlow()?.selected ?? new Set());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<Turn[]>(() => recallFlow()?.history ?? []);
  /** 回ごとの自由記述（入力そのまま。得意なこと・大事にしたいことの回だけ） */
  const [freeTexts, setFreeTexts] = useState<Partial<Record<RoundKey, string>>>(() => recallFlow()?.freeTexts ?? {});

  useEffect(() => {
    rememberFlow({ step, round, selected, freeTexts, history });
  }, [step, round, selected, freeTexts, history]);

  // 選択が変わったときだけ作り直す（会話と推薦の呼び出しが、これを見て動く）。
  // 自由記述は、点の付かないタグ（freeTag）にして、その回の最後に足す
  const selectedTags = useMemo<TagNode[]>(
    () => [
      ...[...selected].flatMap((id) => NODES[id] ?? []),
      ...ROUNDS.flatMap((r) => freeTag(r.key, freeTexts[r.key] ?? "") ?? []),
    ],
    [selected, freeTexts],
  );

  const setFreeText = (key: RoundKey, text: string) => setFreeTexts((prev) => ({ ...prev, [key]: text }));

  const go = (next: Step) => {
    setStep(next);
    window.scrollTo(0, 0);
  };

  const toggle = (node: TagNode) => {
    if (node.free) {
      // 自由記述のタグは、外すと入力も消す
      setFreeText(node.round, "");
      return;
    }
    if (selected.has(node.id)) {
      // 外すときは、そこから増えた子孫の選択も外す
      const removed = new Set(withDescendants(node));
      setSelected(new Set([...selected].filter((id) => !removed.has(id))));
      setFresh(new Set());
    } else {
      setSelected(new Set([...selected, node.id]));
      setFresh(new Set(node.children.map((c) => c.id)));
    }
  };

  const restart = () => {
    setSelected(new Set());
    setFresh(new Set());
    setFreeTexts({});
    setHistory([]);
    setRound(0);
    rememberRecommended([]);
    go("hobby");
  };

  // ヘッダーのロゴが押されたら、最初の画面にもどる（ホームを開いたまま押したとき）
  const restartRef = useRef(restart);
  useEffect(() => {
    restartRef.current = restart;
  });
  useEffect(() => {
    const onStartOver = () => restartRef.current();
    window.addEventListener(START_OVER_EVENT, onStartOver);
    return () => window.removeEventListener(START_OVER_EVENT, onStartOver);
  }, []);

  const currentRound = ROUNDS[round];

  return (
    <div className={styles.flow}>
      <ol className={styles.steps} aria-label="進み具合">
        {STEPS.map((s, i) => (
          <li
            key={s.step}
            className={s.step === step ? styles.current : undefined}
            aria-current={s.step === step ? "step" : undefined}
          >
            <span className={styles.num}>{i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {step === "hobby" && currentRound && (
        <HobbyPicker
          round={currentRound}
          index={round}
          total={ROUNDS.length}
          selected={selected}
          selectedTags={selectedTags}
          fresh={fresh}
          onToggle={toggle}
          freeText={freeTexts[currentRound.key] ?? ""}
          onFreeText={(text) => setFreeText(currentRound.key, text)}
          onClear={() => {
            setSelected(new Set([...selected].filter((id) => NODES[id]?.round !== currentRound.key)));
            setFreeText(currentRound.key, "");
            setFresh(new Set());
          }}
          onNext={() => {
            setFresh(new Set());
            if (round < ROUNDS.length - 1) {
              setRound(round + 1);
              window.scrollTo(0, 0);
              return;
            }
            // 選び直したら、会話は最初から
            setHistory([]);
            go("chat");
          }}
          onPrev={
            round > 0
              ? () => {
                  setFresh(new Set());
                  setRound(round - 1);
                  window.scrollTo(0, 0);
                }
              : null
          }
        />
      )}

      {step === "chat" && (
        <ChatStep
          tags={selectedTags}
          history={history}
          onAnswer={(turn) => setHistory([...history, turn])}
          onUndo={() => setHistory(history.slice(0, -1))}
          onFinish={() => go("result")}
          onBack={() => go("hobby")}
        />
      )}

      {step === "result" && (
        <JobResults
          tags={selectedTags}
          history={history}
          onRetryChat={() => {
            setHistory([]);
            rememberRecommended([]);
            go("chat");
          }}
          onRestart={restart}
        />
      )}
    </div>
  );
}
