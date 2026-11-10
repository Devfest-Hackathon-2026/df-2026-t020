import type { Metadata } from "next";
import ResultHistory from "@/components/ResultHistory";

export const metadata: Metadata = { title: "過去の結果 | Eureka" };

// 過去の結果：診断の結果をブラウザに残したものを、新しい順に見返す（data/resultHistory.ts）。
export default function HistoryPage() {
  return <ResultHistory />;
}
