import type { Metadata } from "next";
import TownView from "@/components/town/TownView";
import { buildTown } from "@/data/town";

export const metadata: Metadata = { title: "仕事の街 | Eureka" };

// 仕事の街：1,000件の仕事が、街のどこで働いているかで区画に分かれて立っている2.5Dの地図。
// 街のデータはビルドのときに作る（data/town.ts）。描くのはブラウザ（components/town）。
export default async function TownPage() {
  const data = await buildTown();
  return <TownView data={data} />;
}
