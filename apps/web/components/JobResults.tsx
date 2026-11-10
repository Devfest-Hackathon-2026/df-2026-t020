"use client";

// 3. 職業カード。まず、会話の中で「気になる」を付けた仕事と、知らなかった仕事の数を出す（3b の材料）。
// 続けて、会話の内容と反応から、Gemini が1,000職業の一覧から選んだ仕事を出す（POST /api/recommend）。
// Gemini が選べなかったとき（API の返事が空・API につながらない）は、データでの選び方に切り替える：
// 選んだ趣味のタグから pickCardsで選び、理由の1文は POST /api/reasons からもらう。
// 出典の表示は職業データの利用条件なので、カードを出すときは必ず出す。
// 紹介した仕事のカードから、仕事の街のその人と、業界ページのその仕事へ移れる。
// 移ってもどってきたときに選び直さないよう、Gemini が選んだ仕事はメモリに覚えておく（data/visitMemory.ts）。
// 結果はブラウザにも残し、「最初からやり直す」のあとも「過去の結果」（/history）で見返せるようにする（data/resultHistory.ts）。

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchRecommend, shownJobs, type JobPick, type ShownJob, type Turn } from "@/data/conversation";
import { CARDS_URL, DISTANCES, majorName, pickCards, type CardsData, type Distance, type Occupation } from "@/data/jobCards";
import { industriesOf, industryJobHref, townJobHref } from "@/data/jobIndustries";
import { fetchReasons, reasonsKey, type Reason } from "@/data/reasons";
import type { TagNode } from "@/data/tags";
import { saveResult, tagsByRound } from "@/data/resultHistory";
import { recallPicks, rememberPicks, rememberRecommended } from "@/data/visitMemory";
import flow from "./CareerFlow.module.css";
import styles from "./JobList.module.css";

type Props = {
  tags: TagNode[];
  history: Turn[];
  onRetryChat: () => void;
  onRestart: () => void;
};

/** 画面に出す1枚 */
export type Shown = {
  occupation: Occupation;
  distance: Distance;
  reason?: Reason;
  /** データでの選び方のときだけ：職業データにある「好きなこと」とのつながり */
  link?: { tag: string; text: string; reviewed: boolean };
};

type Recommended = { status: "loading" } | { status: "ok"; picks: JobPick[] } | { status: "fallback" };

export const DISTANCE_NOTE: Record<Distance, string> = {
  身近: "好きなことと、そのままつながる仕事",
  少し遠い: "好きなことを、裏で支えている仕事",
  意外: "一見ちがうけれど、あなたの答えとつながる仕事",
};

export const DISTANCE_CLASS: Record<Distance, string | undefined> = {
  身近: styles.near,
  少し遠い: styles.mid,
  意外: styles.far,
};

export default function JobResults({ tags, history, onRetryChat, onRestart }: Props) {
  const [data, setData] = useState<CardsData | null>(null);
  const [cardsFailed, setCardsFailed] = useState(false);
  // 同じタグと会話で選んだ仕事を覚えていれば（ほかのページからもどってきたとき）、それをそのまま出す
  const picksKey = useMemo(() => JSON.stringify([tags.map((t) => [t.id, t.name]), history]), [tags, history]);
  const [recommended, setRecommended] = useState<Recommended>(() => {
    const picks = recallPicks(picksKey);
    return picks ? { status: "ok", picks } : { status: "loading" };
  });

  useEffect(() => {
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

  useEffect(() => {
    if (recallPicks(picksKey)) return;
    const controller = new AbortController();
    fetchRecommend(tags, history, controller.signal)
      .then((picks) => {
        if (picks.length > 0) rememberPicks(picksKey, picks);
        setRecommended(picks.length > 0 ? { status: "ok", picks } : { status: "fallback" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecommended({ status: "fallback" });
      });
    return () => controller.abort();
  }, [tags, history, picksKey]);

  // データでの選び方（Gemini が選べなかったとき）
  const fallbackCards = useMemo(
    () => (data && recommended.status === "fallback" ? pickCards(data, tags) : []),
    [data, recommended.status, tags],
  );
  const fallbackKey = useMemo(() => reasonsKey(tags, fallbackCards), [tags, fallbackCards]);
  const [fallbackReasons, setFallbackReasons] = useState<{ key: string; reasons: ReadonlyMap<number, Reason> } | null>(
    null,
  );
  useEffect(() => {
    if (fallbackCards.length === 0) return;
    const controller = new AbortController();
    fetchReasons(tags, fallbackCards, controller.signal)
      .then((reasons) => setFallbackReasons({ key: fallbackKey, reasons }))
      .catch(() => {
        if (!controller.signal.aborted) setFallbackReasons({ key: fallbackKey, reasons: new Map() });
      });
    return () => controller.abort();
  }, [fallbackKey, tags, fallbackCards]);

  const cards = useMemo<Shown[]>(() => {
    if (!data) return [];
    if (recommended.status === "ok") {
      const byId = new Map(data.occupations.map((o) => [o.id, o]));
      return recommended.picks.flatMap((p) => {
        const occupation = byId.get(p.occupationId);
        return occupation ? [{ occupation, distance: p.distance, reason: { text: p.reason, ai: true } }] : [];
      });
    }
    const reasons = fallbackReasons?.key === fallbackKey ? fallbackReasons.reasons : null;
    return fallbackCards.map((c) => ({
      occupation: c.occupation,
      distance: c.distance,
      reason: reasons?.get(c.occupation.id),
      link: { tag: c.link.tag, text: c.link.link, reviewed: c.link.reviewed },
    }));
  }, [data, recommended, fallbackCards, fallbackReasons, fallbackKey]);

  const loading = !cardsFailed && (!data || recommended.status === "loading");

  // 紹介した仕事を、仕事の街で光らせられるように覚えておく
  useEffect(() => {
    if (cards.length === 0) return;
    rememberRecommended(cards.map((c) => ({ id: c.occupation.id, reason: c.reason?.text, ai: c.reason?.ai })));
  }, [cards]);

  // 結果をブラウザに残す（同じタグと会話なら上書き。データで選んだときは、理由の1文が届いてから残す）
  const reasonsReady = recommended.status !== "fallback" || fallbackReasons?.key === fallbackKey;
  useEffect(() => {
    if (loading || cards.length === 0 || !reasonsReady) return;
    saveResult({
      key: picksKey,
      tags: tagsByRound(tags),
      history,
      cards: cards.map((c) => ({ id: c.occupation.id, distance: c.distance, reason: c.reason, link: c.link })),
      fallback: recommended.status === "fallback",
    });
  }, [loading, cards, reasonsReady, picksKey, tags, history, recommended.status]);

  // 会話で見せた仕事への反応
  const shown = useMemo(() => shownJobs(history), [history]);
  const liked = shown.filter((j) => j.reactions.includes("気になる"));
  const unknownCount = shown.filter((j) => j.reactions.includes("知らなかった")).length;
  const likedUnknown = liked.filter((j) => j.reactions.includes("知らなかった")).length;

  return (
    <section className={styles.card} aria-labelledby="job-results-title" aria-busy={loading}>
      <div className={styles.brand}>職業カード</div>
      <h1 id="job-results-title" className={styles.title}>
        あなたが出会った仕事と、ほかにもある仕事
      </h1>

      {shown.length > 0 && (
        <section className={flow.met} aria-labelledby="met-title">
          <h2 id="met-title" className={flow.metTitle}>
            会話で出会った仕事
          </h2>
          <p className={flow.stats}>
            見た仕事 <strong>{shown.length}</strong>件 ・ そのうち知らなかった <strong>{unknownCount}</strong>件 ・
            気になる <strong>{liked.length}</strong>件
            {likedUnknown > 0 && (
              <>
                （知らなかったけれど気になった仕事が <strong>{likedUnknown}</strong>件）
              </>
            )}
          </p>
          {liked.length > 0 ? (
            <ul className={styles.grid}>
              {liked.map((job) => (
                <MetJob key={job.name} job={job} data={data} />
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>「気になる」を付けた仕事はありませんでした。</p>
          )}
        </section>
      )}

      {history.length > 0 && (
        <details className={flow.answers}>
          <summary>あなたの答え（{history.length}問）</summary>
          <ol className={flow.log}>
            {history.map((t, i) => (
              <li key={i}>
                <span className={flow.logQ}>{t.question}</span>
                <span className={flow.logA}>{t.answer}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {cardsFailed ? (
        <p className={styles.empty}>職業カードを読み込めませんでした。ページを読み込み直してください。</p>
      ) : loading ? (
        <p className={`${styles.empty} ${flow.thinking}`} role="status">
          1,000の仕事の中から、あなたに紹介する仕事を選んでいます…（少し時間がかかります）
        </p>
      ) : cards.length === 0 ? (
        <p className={styles.empty}>紹介できる仕事が見つかりませんでした。別の好きなものも選んでみてください。</p>
      ) : (
        <>
          <h2 className={flow.metTitle}>ほかにも、こんな仕事があります</h2>
          <p className={styles.toTown}>
            <Link href="/map?show=recommended">仕事の街で、ここで紹介した仕事の人を光らせる</Link>
            <span>街のどこで働いているかと、まわりにいる仕事が見られます。</span>
          </p>
          {DISTANCES.map((distance) => {
            const group = cards.filter((c) => c.distance === distance);
            if (group.length === 0) return null;
            return (
              <div key={distance} className={styles.group}>
                <h2 className={styles.groupTitle}>
                  <span className={`${styles.badge} ${DISTANCE_CLASS[distance] ?? ""}`}>{distance}</span>
                  {DISTANCE_NOTE[distance]}
                </h2>
                <ul className={styles.grid}>
                  {group.map((card) => (
                    <JobCard
                      key={card.occupation.id}
                      card={card}
                      major={data ? majorName(data, card.occupation) : ""}
                      waiting={recommended.status === "fallback" && fallbackReasons?.key !== fallbackKey}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}

      {data && <Attribution data={data} />}

      <div className={flow.footer}>
        <span className={flow.footerLinks}>
          <button type="button" className={flow.link} onClick={onRestart}>
            最初からやり直す
          </button>
          <Link className={flow.link} href="/history">
            過去の結果を見る
          </Link>
        </span>
        <button type="button" className={flow.secondary} onClick={onRetryChat}>
          質問に答え直す
        </button>
      </div>
    </section>
  );
}

/**
 * 会話で「気になる」を付けた仕事。職業カードとつながっていれば（occupationId）、
 * 紹介した仕事と同じカードで、分野のタグと仕事の街・業界ページへのリンクを出す。
 * つながっていない仕事（前の版の結果）は、名前と説明だけを出す。
 */
export function MetJob({ job, data }: { job: ShownJob; data: CardsData | null }) {
  const occupation =
    job.occupationId != null ? data?.occupations.find((o) => o.id === job.occupationId) : undefined;
  const unknown = job.reactions.includes("知らなかった");
  if (data && occupation) {
    return (
      <JobCard
        card={{ occupation, distance: "身近", reason: { text: job.what, ai: true } }}
        major={majorName(data, occupation)}
        waiting={false}
        badge={unknown ? "はじめて知った" : undefined}
        reasonLabel="会話での説明"
      />
    );
  }
  return (
    <li className={styles.job}>
      <div className={styles.jobHead}>
        <h3 className={styles.jobName}>{job.name}</h3>
      </div>
      {unknown && <span className={flow.unknown}>はじめて知った</span>}
      <p className={styles.summary}>{job.what}</p>
    </li>
  );
}

/** 職業データの出典。カードを出すときは必ず出す（データの利用条件） */
export function Attribution({ data }: { data: CardsData }) {
  return (
    <div className={styles.attribution}>
      <p>{data.meta.attribution_ja}</p>
      <details>
        <summary>出典の詳しい内容</summary>
        <ul>
          {data.meta.sources.map((source) => (
            <li key={source}>
              <Linkified text={source} />
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** 文中の URL をリンクにする（O*NET のライセンスへのリンクを出すため） */
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s）)]+)/).map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function JobCard({
  card,
  major,
  waiting,
  badge,
  reasonLabel = "あなたとのつながり",
}: {
  card: Shown;
  major: string;
  waiting: boolean;
  /** 名前の下に出す印（「はじめて知った」など） */
  badge?: string;
  reasonLabel?: string;
}) {
  const { occupation: o, reason, link } = card;
  const abroad =
    o.jp_presence === "日本では少ない" ? "日本ではまだ少ない" : o.jp_presence === "日本にはほぼない" ? "海外の仕事" : null;

  return (
    <li className={styles.job}>
      <div className={styles.jobHead}>
        <h3 className={styles.jobName}>{o.name}</h3>
        {abroad && <span className={styles.abroad}>{abroad}</span>}
      </div>
      {badge && <span className={flow.unknown}>{badge}</span>}
      {major && <div className={styles.major}>{major}</div>}
      <p className={styles.summary}>{o.summary}</p>
      {reason ? (
        <div className={styles.reason}>
          <span className={styles.reasonLabel}>{reasonLabel}</span>
          <p>{reason.text}</p>
        </div>
      ) : waiting ? (
        <div className={`${styles.reason} ${styles.pending}`}>
          <span className={styles.reasonLabel}>あなたとのつながり</span>
          <p>考えています…</p>
        </div>
      ) : null}
      {link && (
        <div className={styles.link}>
          <span className={styles.linkTag}>{link.tag}</span>
          <p>{link.text}</p>
        </div>
      )}
      {/* この仕事を、仕事の街と業界ページで見る */}
      <div className={styles.places}>
        <span className={styles.placesLabel}>この仕事を見にいく</span>
        <ul>
          <li>
            <Link className={styles.town} href={townJobHref(o.id)}>
              仕事の街
            </Link>
          </li>
          {industriesOf(o.id).map(({ slug, name }) => (
            <li key={slug}>
              <Link href={industryJobHref(slug, o.id)}>{name}</Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
