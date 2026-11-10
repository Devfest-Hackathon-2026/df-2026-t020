"use client";

// 仕事の街（/map）の画面。街そのものは townScene.ts（PixiJS）が描き、ここは上に重ねる案内・絞り込み・職業カードを持つ。
// 出会った仕事（押した人）は、このブラウザの localStorage にだけ残す（保存できないときは、開いている間だけ）。
// 診断の結果・業界ページとは、リンクでつながる：
//   /map?job=<職業カードの id>  その人のところへ飛んで、職業カードを出す
//   /map?ind=<業界の slug>      その業界の人を光らせる
//   /map?show=recommended       診断で紹介した仕事（data/visitMemory.ts が覚えている分）を光らせる

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { industryJobHref, sourcePage } from "@/data/jobIndustries";
import { DISTRICTS, type TownData, type TownPerson } from "@/data/townModel";
import { recallRecommended } from "@/data/visitMemory";
import type { TownController } from "./townScene";
import styles from "./TownView.module.css";

const MET_KEY = "eureka.town.met";

// 出会った仕事の id の一覧（JSON の文字列）を、localStorage と画面で共有する小さな入れ物
let metCache: string | null = null;
const metListeners = new Set<() => void>();
function readMet(): string {
  try {
    return localStorage.getItem(MET_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribeMet(listener: () => void) {
  metListeners.add(listener);
  return () => {
    metListeners.delete(listener);
  };
}
function metSnapshot() {
  metCache ??= readMet();
  return metCache;
}
function writeMet(ids: readonly number[]) {
  metCache = JSON.stringify(ids);
  try {
    localStorage.setItem(MET_KEY, metCache);
  } catch {
    // 保存できない環境では、開いている間だけ覚える
  }
  for (const listener of metListeners) listener();
}

type Filter = "" | "recommended" | `tag:${string}` | `ind:${string}`;

function matcher(filter: Filter, recommended: ReadonlySet<number>): ((p: TownPerson) => boolean) | null {
  if (filter === "recommended") return (p) => recommended.has(p.id);
  if (filter.startsWith("tag:")) {
    const tag = filter.slice(4);
    return (p) => p.tags.includes(tag);
  }
  if (filter.startsWith("ind:")) {
    const slug = filter.slice(4);
    return (p) => p.industries.includes(slug);
  }
  return null;
}

export default function TownView({ data }: { data: TownData }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<TownController | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("");
  const [introOpen, setIntroOpen] = useState(true);
  // 街の上に重ねたカードの幅（街の中で飛ぶとき、この分をよける）
  const insetLeft = introOpen ? 340 : 0;
  const insetRight = selectedId !== null ? 360 : 0;
  const insetsRef = useRef({ left: insetLeft, right: insetRight });
  useEffect(() => {
    insetsRef.current = { left: insetLeft, right: insetRight };
    if (ready) controllerRef.current?.setInsets(insetLeft, insetRight);
  }, [insetLeft, insetRight, ready]);

  const metRaw = useSyncExternalStore(subscribeMet, metSnapshot, () => "[]");
  const met = useMemo(() => new Set(JSON.parse(metRaw) as number[]), [metRaw]);
  const metRef = useRef(met);
  useEffect(() => {
    metRef.current = met;
  }, [met]);

  const byId = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data]);
  const industryName = useMemo(() => new Map(data.industries.map((i) => [i.slug, i.name])), [data]);
  const districtName = useMemo(() => new Map(DISTRICTS.map((d) => [d.id, d.name])), []);
  const selected = selectedId === null ? undefined : byId.get(selectedId);
  // 診断で紹介した仕事（この街にいる人の分だけ）。ページを読み込み直すと空になる
  const [recommended] = useState(() => recallRecommended().filter((job) => byId.has(job.id)));
  const recommendedIds = useMemo(() => new Set(recommended.map((job) => job.id)), [recommended]);
  const selectedReason = recommended.find((job) => job.id === selectedId);
  const match = useMemo(() => matcher(filter, recommendedIds), [filter, recommendedIds]);
  const matchCount = useMemo(() => (match ? data.people.filter(match).length : 0), [data, match]);

  // 街を作る（ブラウザでだけ）
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let controller: TownController | null = null;
    // 人を選ぶ：職業カードを出し、出会った仕事に足す
    const select = (id: number) => {
      setSelectedId(id);
      const now = metRef.current;
      if (!now.has(id)) writeMet([...now, id]);
    };
    import("./townScene")
      .then(({ createTownScene }) =>
        createTownScene(host, data, {
          met: metRef.current,
          insets: insetsRef.current,
          onSelect: select,
        }),
      )
      .then((c) => {
        if (cancelled) {
          c.destroy();
          return;
        }
        controller = c;
        controllerRef.current = c;
        setReady(true);
        // 診断の結果や業界ページから来たとき：リンクの指す人を選ぶ・光らせる
        const params = new URLSearchParams(window.location.search);
        const job = Number(params.get("job"));
        const industry = params.get("ind");
        if (params.has("job") && data.people.some((p) => p.id === job)) select(job);
        if (industry && data.industries.some((i) => i.slug === industry)) setFilter(`ind:${industry}`);
        else if (params.get("show") === "recommended" && recallRecommended().some((r) => data.people.some((p) => p.id === r.id))) {
          setFilter("recommended");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      controller?.destroy();
      controllerRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    if (ready) controllerRef.current?.setMet(met);
  }, [met, ready]);
  useEffect(() => {
    if (ready) controllerRef.current?.setHighlight(match);
  }, [match, ready]);
  // 選んだ人のところへ、職業カードをよけて寄る
  useEffect(() => {
    if (!ready) return;
    controllerRef.current?.setSelected(selectedId);
    if (selectedId !== null) controllerRef.current?.focus(selectedId);
  }, [selectedId, ready]);

  return (
    <div className={styles.town}>
      <h1 className={styles.srOnly}>仕事の街</h1>
      <div ref={hostRef} className={styles.canvas} />

      {!ready && !failed && <p className={styles.loading}>街をつくっています…</p>}
      {failed && (
        <p className={styles.loading}>
          この環境では街を表示できませんでした。<Link href="/map/agriculture">業界ごとの一覧</Link>から仕事を見られます。
        </p>
      )}

      {!introOpen && (
        <button type="button" className={styles.reopen} onClick={() => setIntroOpen(true)}>
          案内をひらく（出会った仕事 {met.size} / {data.people.length}）
        </button>
      )}
      <section className={styles.intro} aria-label="街の案内" hidden={!introOpen}>
        <button type="button" className={styles.fold} onClick={() => setIntroOpen(false)}>
          たたむ
        </button>
        <div className={styles.brand}>業界地図</div>
        <p className={styles.title}>仕事の街</p>
        <p className={styles.lead}>街を歩いて、まだ知らない仕事に出会おう。人を押すと、その仕事のことがわかります。</p>
        <p className={styles.counter}>
          出会った仕事 <strong>{met.size}</strong> / {data.people.length}
        </p>
        <label className={styles.filter}>
          <span>光らせる</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="">なし</option>
            {recommended.length > 0 && <option value="recommended">診断で紹介された仕事</option>}
            <optgroup label="好きなもの">
              {data.tags.map((tag) => (
                <option key={tag} value={`tag:${tag}`}>
                  {tag}
                </option>
              ))}
            </optgroup>
            <optgroup label="業界">
              {data.industries.map(({ slug, name }) => (
                <option key={slug} value={`ind:${slug}`}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {match && <p className={styles.hint}>{matchCount}人が光っています</p>}
        {recommended.length > 0 && (
          <p className={styles.hint}>
            <Link className={styles.back} href="/">
              診断の結果にもどる
            </Link>
          </p>
        )}
        <p className={styles.hint}>
          街を押すと、そこへ寄ります。ドラッグで移動、ホイールで拡大・縮小。名札のない人は、まだ出会っていない仕事です。
        </p>
      </section>

      <div className={styles.zoom} role="group" aria-label="拡大・縮小">
        <button type="button" onClick={() => controllerRef.current?.zoomBy(1.5)} aria-label="拡大する">
          ＋
        </button>
        <button type="button" onClick={() => controllerRef.current?.zoomBy(1 / 1.5)} aria-label="縮小する">
          −
        </button>
        <button type="button" className={styles.whole} onClick={() => controllerRef.current?.showAll()}>
          全体
        </button>
      </div>

      <nav className={styles.districts} aria-label="区画へ移動">
        {DISTRICTS.filter((d) => d.id !== "park").map((d) => (
          <button key={d.id} type="button" className={styles.chip} onClick={() => controllerRef.current?.flyTo(d.id)}>
            <span className={styles.swatch} style={{ background: `#${d.ground.toString(16).padStart(6, "0")}` }} />
            {d.name}
          </button>
        ))}
      </nav>

      {selected && (
        <aside className={styles.panel} aria-label="職業カード">
          <button type="button" className={styles.close} onClick={() => setSelectedId(null)} aria-label="閉じる">
            ×
          </button>
          <div className={styles.place}>
            {districtName.get(selected.district)}の「{selected.group}」の{selected.lift === undefined ? "あたり" : "船の上"}
          </div>
          <h2 className={styles.jobName}>{selected.name}</h2>
          <div className={styles.badges}>
            {selected.major && <span className={styles.tag}>{selected.major}</span>}
            {selected.presence !== "日本にもある" && (
              <span className={styles.abroad}>{selected.presence === "日本では少ない" ? "日本ではまだ少ない" : "海外の仕事"}</span>
            )}
          </div>
          <p className={styles.summary}>{selected.summary}</p>
          {selectedReason?.reason && (
            <div className={styles.reason}>
              <span className={styles.reasonLabel}>あなたとのつながり（診断の結果から）</span>
              <p>{selectedReason.reason}</p>
            </div>
          )}
          <button type="button" className={styles.link} onClick={() => controllerRef.current?.focus(selected.id)}>
            この人のところへ
          </button>
          <a
            className={styles.source}
            href={sourcePage(selected.id).href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {sourcePage(selected.id).label}
          </a>
          {selected.industries.length > 0 && (
            <div className={styles.others}>
              <span className={styles.othersLabel}>この仕事が出てくる業界（業界ページで、近い仕事と見くらべる）</span>
              <ul>
                {selected.industries.map((slug) => (
                  <li key={slug}>
                    <Link href={industryJobHref(slug, selected.id)}>{industryName.get(slug) ?? slug}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className={styles.attribution}>{data.attribution}</p>
        </aside>
      )}
    </div>
  );
}
