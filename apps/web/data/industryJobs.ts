// 業界ページに出す職業カード。ビルドのときに public/data/occupation_cards.json を読み、その業界のカードだけをページに埋め込む
// （静的書き出しなので、業界ページを開くたびにブラウザで 1,000 件の JSON を読み込まない）。
// node:fs を使うので、サーバーコンポーネントからだけ使う。
//   - 業界の仕事：data/industries.ts の jobIds（代表的な仕事）と data/industryOccupations.json（AI の振り分けの下書き）を合わせたもの。
//     どちらから来た仕事も区別せず、日本にある仕事・よく知られている仕事を先にし、同じ大分類の仕事が続かないように並べる
//   - 分野：仕事の多い業界は、data/industryFields.json（下書き）の分野ごとに区切る

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Industry } from "./industries";
import fieldsJson from "./industryFields.json";
import { belongsTo, industriesOf } from "./jobIndustries";
import { majorName, type CardsData, type Occupation } from "./jobCards";
import { townLooks } from "./town";
import type { Look } from "./townModel";

const CARDS_FILE = path.join(process.cwd(), "public", "data", "occupation_cards.json");

let cards: Promise<CardsData> | undefined;

function loadCards(): Promise<CardsData> {
  cards ??= readFile(CARDS_FILE, "utf8").then((text) => JSON.parse(text) as CardsData);
  return cards;
}

/** 分野の下書き：業界の slug → 分野（ページに出す順） */
const fieldData: Readonly<Record<string, readonly { name: string; ids: readonly number[] }[] | undefined>> =
  fieldsJson.industries;

export type IndustryJob = {
  occupation: Occupation;
  /** 職業の大分類の名前（カードにタグで出す） */
  major: string;
  /** 同じ仕事が出てくる、ほかの業界 */
  otherIndustries: Industry[];
  /** 仕事の街（/map）での、この仕事のキャラクターの見た目。カードの絵に使う */
  look: Look;
};

export type JobField = {
  /** 分野の名前（食品・飲料など） */
  name: string;
  jobs: IndustryJob[];
};

export type IndustryJobs = {
  /** その業界の仕事。並び順は arrange */
  jobs: IndustryJob[];
  /** jobs を分野ごとに区切ったもの。data/industryFields.json に分野がある業界だけ */
  fields?: JobField[];
  /** 職業カードの出典（利用条件なので、カードを出すときは必ず出す） */
  attribution: string;
  sources: string[];
};

const PRESENCE_ORDER: Record<Occupation["jp_presence"], number> = {
  日本にもある: 0,
  日本では少ない: 1,
  日本にはほぼない: 2,
};

/** 並べる順位（小さいほど先）：日本にある仕事 → よく知られている仕事 */
function rankOf(o: Occupation): number {
  return PRESENCE_ORDER[o.jp_presence] * 10 - (o.familiarity ?? 0);
}

/** 並び順を保ったまま、key が同じものをまとめる */
function groupBy<T, K>(items: readonly T[], key: (item: T) => K): T[][] {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return [...groups.values()];
}

/**
 * 業界の仕事の並び順。日本にある仕事・よく知られている仕事を先にする。
 * 同じ順位の中では大分類を順に回して1件ずつ取り、同じ大分類の仕事が続かないようにする
 */
function arrange(occupations: readonly Occupation[]): Occupation[] {
  const sorted = [...occupations].sort((a, b) => rankOf(a) - rankOf(b) || a.id - b.id);
  return groupBy(sorted, rankOf).flatMap((sameRank) => {
    const queues = groupBy(sameRank, (o) => o.major_code);
    const rounds = Math.max(...queues.map((queue) => queue.length));
    return Array.from({ length: rounds }, (_, round) => queues.flatMap((queue) => queue[round] ?? [])).flat();
  });
}

/**
 * 業界の仕事を、data/industryFields.json の分野ごとに区切る。分野がない業界は undefined。
 * どの分野にも入っていない仕事があれば、ページから消えないようにビルドを止める
 */
function splitIntoFields(industry: Industry, occupations: readonly Occupation[]) {
  const fields = fieldData[industry.slug];
  if (!fields) return undefined;
  const assigned = new Set(fields.flatMap((field) => field.ids));
  const missing = occupations.filter((o) => !assigned.has(o.id));
  if (missing.length > 0) {
    const list = missing.map((o) => `${o.id} ${o.name}`).join("、");
    throw new Error(`data/industryFields.json：「${industry.name}」のどの分野にも入っていない仕事があります（${list}）`);
  }
  return fields.map(({ name, ids }) => ({ name, occupations: occupations.filter((o) => ids.includes(o.id)) }));
}

export async function industryJobs(industry: Industry): Promise<IndustryJobs> {
  const data = await loadCards();
  const lookOf = await townLooks();

  const toJob = (occupation: Occupation): IndustryJob => ({
    occupation,
    major: majorName(data, occupation),
    otherIndustries: industriesOf(occupation.id).filter((other) => other.slug !== industry.slug),
    look: lookOf(occupation),
  });

  const occupations = data.occupations.filter((o) => belongsTo(industry, o.id));
  const jobs = arrange(occupations).map(toJob);
  const fields = splitIntoFields(industry, occupations)?.map(({ name, occupations: inField }) => ({
    name,
    jobs: arrange(inField).map(toJob),
  }));

  return {
    jobs,
    fields,
    attribution: data.meta.attribution_ja,
    sources: data.meta.sources,
  };
}
