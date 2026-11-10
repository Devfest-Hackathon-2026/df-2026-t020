"use client";

// 過去の結果（/history）。診断の結果は data/resultHistory.ts がブラウザ（localStorage）に残している。
// 「最初からやり直す」をしても、ここで前の結果を見返せる。新しいものを上に出し、いちばん新しい結果だけ開いておく。
// 職業の中身は、残した id で occupation_cards.json から引く（カードを出すので、出典も必ず出す）。

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { shownJobs } from "@/data/conversation";
import { CARDS_URL, DISTANCES, majorName, type CardsData } from "@/data/jobCards";
import { clearResults, deleteResult, loadResults, type SavedResult } from "@/data/resultHistory";
import flow from "./CareerFlow.module.css";
import { Attribution, DISTANCE_CLASS, DISTANCE_NOTE, JobCard, MetJob, type Shown } from "./JobResults";
import styles from "./JobList.module.css";
import own from "./ResultHistory.module.css";

const DATE = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

// localStorage の中身を、消したときに描き直せるように購読する
const listeners = new Set<() => void>();
let snapshot: SavedResult[] | null = null;
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
function getSnapshot() {
  snapshot ??= loadResults();
  return snapshot;
}
const EMPTY: SavedResult[] = [];
function changed() {
  snapshot = null;
  listeners.forEach((l) => l());
}

export default function ResultHistory() {
  const results = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const [data, setData] = useState<CardsData | null>(null);
  const [cardsFailed, setCardsFailed] = useState(false);

  useEffect(() => {
    // ほかのページで結果が増えていることがあるので、開くたびに読み直す
    changed();
    let alive = true;
    fetch(CARDS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json() as Promise<CardsData>;
      })
      .then((json) => alive && setData(json))
      .catch(() => alive && setCardsFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={flow.flow}>
      <section className={styles.card} aria-labelledby="history-title">
        <div className={styles.brand}>過去の結果</div>
        <h1 id="history-title" className={styles.title}>
          これまでに出会った仕事
        </h1>
        <p className={own.lead}>
          結果は、この端末のブラウザにだけ残しています（新しいものから20件まで）。ほかの人や、ほかの端末からは見えません。
        </p>

        {results.length === 0 ? (
          <p className={styles.empty}>
            まだ結果がありません。<Link href="/">ホーム</Link>で、好きなことを選んで質問に答えてみてください。
          </p>
        ) : (
          <>
            <ol className={own.list}>
              {results.map((result, i) => (
                <li key={result.key}>
                  <Entry result={result} data={data} cardsFailed={cardsFailed} open={i === 0} />
                </li>
              ))}
            </ol>
            {data && <Attribution data={data} />}
            <div className={flow.footer}>
              <button
                type="button"
                className={flow.link}
                onClick={() => {
                  if (window.confirm("残している結果をすべて消します。よろしいですか？")) {
                    clearResults();
                    changed();
                  }
                }}
              >
                すべて消す
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Entry({
  result,
  data,
  cardsFailed,
  open,
}: {
  result: SavedResult;
  data: CardsData | null;
  cardsFailed: boolean;
  open: boolean;
}) {
  const liked = shownJobs(result.history).filter((j) => j.reactions.includes("気になる"));
  const byId = new Map(data?.occupations.map((o) => [o.id, o]));
  const cards: Shown[] = result.cards.flatMap((c) => {
    const occupation = byId.get(c.id);
    return occupation ? [{ occupation, distance: c.distance, reason: c.reason, link: c.link }] : [];
  });
  const things = result.tags[0]?.names ?? [];

  return (
    <details className={own.entry} open={open}>
      <summary className={own.summary}>
        <time dateTime={result.savedAt}>{DATE.format(new Date(result.savedAt))}</time>
        <span className={own.things}>{things.join("・")}</span>
      </summary>

      <div className={own.body}>
        <dl className={own.tags}>
          {result.tags.map((round) => (
            <div key={round.label}>
              <dt>{round.label}</dt>
              <dd>{round.names.join("、")}</dd>
            </div>
          ))}
        </dl>

        {liked.length > 0 && (
          <section className={flow.met}>
            <h2 className={flow.metTitle}>会話で「気になる」を付けた仕事</h2>
            <ul className={styles.grid}>
              {liked.map((job) => (
                <MetJob key={job.name} job={job} data={data} />
              ))}
            </ul>
          </section>
        )}

        {result.history.length > 0 && (
          <details className={flow.answers}>
            <summary>あなたの答え（{result.history.length}問）</summary>
            <ol className={flow.log}>
              {result.history.map((t, i) => (
                <li key={i}>
                  <span className={flow.logQ}>{t.question}</span>
                  <span className={flow.logA}>{t.answer}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        <h2 className={flow.metTitle}>紹介した仕事</h2>
        {cardsFailed ? (
          <p className={styles.empty}>職業カードを読み込めませんでした。ページを読み込み直してください。</p>
        ) : !data ? (
          <p className={styles.empty}>読み込んでいます…</p>
        ) : (
          DISTANCES.map((distance) => {
            const group = cards.filter((c) => c.distance === distance);
            if (group.length === 0) return null;
            return (
              <div key={distance} className={styles.group}>
                <h3 className={styles.groupTitle}>
                  <span className={`${styles.badge} ${DISTANCE_CLASS[distance] ?? ""}`}>{distance}</span>
                  {DISTANCE_NOTE[distance]}
                </h3>
                <ul className={styles.grid}>
                  {group.map((card) => (
                    <JobCard
                      key={card.occupation.id}
                      card={card}
                      major={majorName(data, card.occupation)}
                      waiting={false}
                    />
                  ))}
                </ul>
              </div>
            );
          })
        )}

        <button
          type="button"
          className={`${flow.link} ${own.delete}`}
          onClick={() => {
            deleteResult(result.key);
            changed();
          }}
        >
          この結果を消す
        </button>
      </div>
    </details>
  );
}
