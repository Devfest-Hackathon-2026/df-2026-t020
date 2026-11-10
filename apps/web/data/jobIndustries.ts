// 職業カードの id から、その仕事が出てくる業界を引く。画面（クライアント）からもビルドからも使える（node の API は使わない）。
// 業界の仕事は、data/industries.ts の jobIds（代表的な仕事）と data/industryOccupations.json（AI の振り分けの下書き）を合わせたもの。

import { industries, type Industry } from "./industries";
import draft from "./industryOccupations.json";

/** AI の振り分けの下書き：職業カードの id → 業界の slug */
const draftIndustries: Readonly<Record<string, readonly string[] | undefined>> = draft.occupations;

/** その職業がその業界の仕事か（代表的な仕事か、AI の振り分けにある） */
export function belongsTo(industry: Industry, id: number): boolean {
  return industry.jobIds.includes(id) || (draftIndustries[String(id)] ?? []).includes(industry.slug);
}

/** その職業が出てくる業界。サイドバーと同じ並び */
export function industriesOf(id: number): Industry[] {
  return industries.filter((industry) => belongsTo(industry, id));
}

/** 業界ページの中の、その仕事のカードへのリンク（開くと、そのカードまで移って目立たせる） */
export function industryJobHref(slug: string, id: number): string {
  return `/map/${slug}#job-${id}`;
}

/** 仕事の街の、その仕事の人へのリンク（開くと、その人のところへ飛んで職業カードを出す） */
export function townJobHref(id: number): string {
  return `/map?job=${id}`;
}

/**
 * その仕事を、元のデータのサイトでくわしく調べるためのリンク。
 * 職業カードの id は、job tag の職業なら job tag の番号、O*NET の職業なら O*NET のコードの数字8けた（53-7121.00 → 53712100）。
 */
export function sourcePage(id: number): { href: string; label: string } {
  const digits = String(id);
  if (digits.length < 8) {
    return { href: `https://shigoto.mhlw.go.jp/User/Occupation/Detail/${id}`, label: "job tag でくわしく見る" };
  }
  const code = `${digits.slice(0, 2)}-${digits.slice(2, 6)}.${digits.slice(6)}`;
  return { href: `https://www.onetonline.org/link/summary/${code}`, label: "O*NET でくわしく見る（英語）" };
}
