import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { industries } from "@/data/industries";
import { industryJobs, type IndustryJob } from "@/data/industryJobs";
import { industryJobHref, sourcePage, townJobHref } from "@/data/jobIndustries";
import ArrivedJob from "./ArrivedJob";
import IndustryIcon, { IconSprinkles } from "./IndustryIcon";
import JobFigure from "./JobFigure";
import { lookOf, toneProps } from "./industryLook";
import styles from "./page.module.css";

type Props = PageProps<"/map/[slug]">;

// 静的書き出しなので、全業界のページをビルド時に生成する
export const dynamicParams = false;

export function generateStaticParams() {
  return industries.map(({ slug }) => ({ slug }));
}

async function findIndustry(params: Props["params"]) {
  const { slug } = await params;
  return industries.find((industry) => industry.slug === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const industry = await findIndustry(params);
  return { title: industry ? `${industry.name} | Eureka` : "Eureka" };
}

// 業界のページ：どんな業界かの一言と、その業界の仕事（職業カード）を出す。
// 年収や将来性は出さない（職業カードの方針に合わせる）。
// 代表的な仕事（data/industries.ts の jobIds）も、AI が振り分けた仕事（下書き）も、区別せずに同じカードで1つの一覧に出す。
// 「代表的な仕事」のように一部の仕事を目立たせることはしない（見る人がそれに引っ張られるため）。
// 仕事の多い業界（data/industryFields.json に分野がある業界）は、一覧を分野ごとに区切る。
// 仕事は最初から全部出す（たたんで「ほかの○件を見る」で開く形にはしない）。
// どのカードにも、職業の大分類をタグで付ける。
// カードの上には、仕事の街でその仕事の人として立っているキャラクターを、業界の色の舞台に描く（JobFigure）。
// 仕事の街・診断の結果とは、リンクでつながる：カードから仕事の街のその人へ移れ、
// 向こうからは #job-<職業カードの id> で、そのカードまで移ってくる（ArrivedJob が目立たせる）。

export default async function IndustryPage({ params }: Props) {
  const industry = await findIndustry(params);
  if (!industry) notFound();

  const { jobs, fields, attribution, sources } = await industryJobs(industry);
  const look = lookOf(industry.slug);

  return (
    <div className={styles.page}>
      {/* 見出し：業界の色の面に、アイコンのステッカーと、ちらしたアイコン */}
      <header className={`${styles.hero} ${styles.tone}`} {...toneProps(look)}>
        <IconSprinkles className={styles.sprinkles} icon={look.icon} />
        <div className={styles.sticker}>
          <IndustryIcon icon={look.icon} size={46} strokeWidth={2} />
        </div>
        <div className={styles.heroText}>
          <div className={styles.brand}>業界地図</div>
          <h1 className={styles.title}>{industry.name}</h1>
          <p className={styles.description}>{industry.description}</p>
          {jobs.length > 0 && (
            <Link className={styles.toTown} href={`/map?ind=${industry.slug}`}>
              仕事の街で、この業界の人を光らせる
            </Link>
          )}
        </div>
      </header>
      <ArrivedJob />

      {/* 業界の色（分野の見出しの印に使う） */}
      <section className={`${styles.card} ${styles.tone}`} {...toneProps(look)}>
        {jobs.length > 0 ? (
          // 分野へのリンクは、この中を読んでいる間だけ画面の上に貼り付く
          <div>
            <h2 className={styles.sectionTitle}>
              {industry.common ? "仕事の一覧" : "この業界の仕事"}
              <span className={styles.count}>{jobs.length}件</span>
            </h2>

            {fields ? (
              <>
                {/* 分野へのリンク。押すと、その分野の見出しまで移る */}
                <ul className={styles.fieldIndex}>
                  {fields.map((field, i) => (
                    <li key={field.name}>
                      <a className={styles.fieldLink} href={`#field-${i}`}>
                        {field.name}
                        <span className={styles.fieldCount}>{field.jobs.length}</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {fields.map((field, i) => (
                  <div key={field.name} id={`field-${i}`} className={styles.field}>
                    <h2 className={styles.fieldTitle}>
                      {field.name}
                      <span className={styles.count}>{field.jobs.length}件</span>
                    </h2>
                    <JobGrid jobs={field.jobs} />
                  </div>
                ))}
              </>
            ) : (
              <JobGrid jobs={jobs} />
            )}
          </div>
        ) : (
          <p className={styles.empty}>この業界の仕事は、まだありません。</p>
        )}

        {jobs.length > 0 && (
          <div className={styles.attribution}>
            <p>{attribution}</p>
            <details>
              <summary>出典の詳しい内容</summary>
              <ul>
                {sources.map((source) => (
                  <li key={source}>
                    <Linkified text={source} />
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

function JobGrid({ jobs }: { jobs: IndustryJob[] }) {
  return (
    <ul className={styles.grid}>
      {jobs.map((job) => (
        <JobCard key={job.occupation.id} job={job} />
      ))}
    </ul>
  );
}

function JobCard({ job }: { job: IndustryJob }) {
  const { occupation: o, major, otherIndustries } = job;
  const abroad = o.jp_presence === "日本では少ない" ? "日本ではまだ少ない" : o.jp_presence === "日本にはほぼない" ? "海外の仕事" : null;

  return (
    <li className={styles.job} id={`job-${o.id}`}>
      {/* 絵：仕事の街のタイルの上に立つ、この仕事のキャラクター */}
      <div className={styles.art}>
        <span className={styles.tile} aria-hidden="true" />
        <span className={styles.figure}>
          <JobFigure look={job.look} />
        </span>
        {abroad && <span className={styles.abroad}>{abroad}</span>}
      </div>
      {/* 職業の大分類のタグ（絵の下の端に重ねる） */}
      {major && <span className={styles.tag}>{major}</span>}
      <h3 className={styles.jobName}>{o.name}</h3>
      <p className={styles.summary}>{o.summary}</p>
      {otherIndustries.length > 0 && (
        <div className={styles.others}>
          <span className={styles.othersLabel}>ほかの業界にも</span>
          <ul className={styles.otherList}>
            {otherIndustries.map(({ slug, name }) => {
              const other = lookOf(slug);
              return (
                <li key={slug}>
                  <Link className={`${styles.otherLink} ${styles.tone}`} href={industryJobHref(slug, o.id)} {...toneProps(other)}>
                    <span className={styles.chipIcon}>
                      <IndustryIcon icon={other.icon} size={12} strokeWidth={2.4} />
                    </span>
                    {name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Link className={styles.townLink} href={townJobHref(o.id)}>
        仕事の街で会う
      </Link>
      <a className={styles.sourceLink} href={sourcePage(o.id).href} target="_blank" rel="noopener noreferrer">
        {sourcePage(o.id).label}
      </a>
    </li>
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
