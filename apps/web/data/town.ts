// 仕事の街（/map）のデータを、ビルドのときに作る。node:fs を使うので、サーバーコンポーネントからだけ使う。
//   - 区画：その仕事の業界と分野（data/industryOccupations.json・data/industryFields.json。どちらも AI の下書き）から、
//     「街のどこで見かけるか」をルールで決める（DEFAULT_DISTRICT と FIELD_DISTRICT）
//   - まとまり：同じ区画の中で、同じ分野の仕事を1つのまとまりにする。まとまりごとに「その仕事が集まる建物」を1つ置き
//     （HOMES。銀行、歯科、薬局、テレビ局など）、看板に分野の名前を出し、その仕事の人を建物の前に立たせる。
//     漁業と船の仕事は、港の海に泊めた船（SEA_HOMES）に乗せる
//   - 並べる順：集まる建物と目印 → 人 → 残りに散らす建物（区画ごとに決まった乱数。ビルドのたびに同じ街になる）。
//     人は、手前の建物に隠れない場所に立たせる（canSee）。散らす建物は、人を隠す場所には置かない
//   - 見た目：大分類で服と帽子、職業名と説明の言葉で持ち物と連れている動物を決める（LOOK_RULES）
// 将来は、区画と見た目も Gemini に下書きさせる（jobs/map-builder の town_look.py）。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { industries } from "./industries";
import fieldsJson from "./industryFields.json";
import draft from "./industryOccupations.json";
import type { CardsData, Occupation } from "./jobCards";
import { personalParts, ruleLook, topColorFor } from "./townLook";
import {
  coverHeight,
  DECK_HEIGHT,
  DISTRICTS,
  FLAT_KINDS,
  TOWN_W,
  type BuildingKind,
  type District,
  type DistrictId,
  type Look,
  type TownBuilding,
  type TownData,
  type TownPerson,
} from "./townModel";
import catalog from "./townParts.json";

const CARDS_FILE = path.join(process.cwd(), "public", "data", "occupation_cards.json");
/** Gemini の下書き（jobs/map-builder の town_look.py が書き出す）。なければ決まりによる仮の見た目だけで作る */
const LOOKS_FILE = path.join(process.cwd(), "data", "townLooks.json");

/** Gemini の下書き1件（id はカタログの部品） */
type DraftLook = {
  district?: string;
  top?: string;
  top_color?: string;
  hat?: string;
  accessories?: string[];
  held?: string;
  companion?: string;
  vehicle?: string;
  pose?: string;
};

const PART_IDS = Object.fromEntries(Object.entries(catalog.parts).map(([k, list]) => [k, new Set(list.map((p) => p.id))])) as Record<
  keyof typeof catalog.parts,
  Set<string>
>;
const DISTRICT_IDS = new Set(catalog.districts.map((d) => d.id));

async function loadDraftLooks(): Promise<Record<string, DraftLook>> {
  try {
    const json = JSON.parse(await readFile(LOOKS_FILE, "utf8")) as { looks?: Record<string, DraftLook> };
    return json.looks ?? {};
  } catch {
    return {};
  }
}

/** Gemini の下書きを、カタログにある部品だけ採り入れる（ない部品は決まりによる仮の見た目のまま） */
function mergeLook(o: Occupation, base: Look, draft: DraftLook | undefined): Look {
  if (!draft) return base;
  const ok = (kind: keyof typeof catalog.parts, id: string | undefined) => (id && PART_IDS[kind].has(id) ? id : undefined);
  const top = ok("top", draft.top) ?? base.top;
  const r = rng(o.id + 1);
  const personal = personalParts(o, top);
  const vehicle = ok("vehicle", draft.vehicle) ?? base.vehicle;
  return {
    ...base,
    bottom: top === base.top ? base.bottom : personal.bottom,
    bottomColor: top === base.top ? base.bottomColor : personal.bottomColor,
    top,
    topColor: draft.top || draft.top_color ? topColorFor(top, draft.top_color, r) : base.topColor,
    hat: ok("hat", draft.hat) ?? base.hat,
    accessories: (draft.accessories ?? []).filter((a) => PART_IDS.accessory.has(a)).slice(0, 2),
    held: ok("held", draft.held) ?? base.held,
    vehicle,
    companion: vehicle !== "none" && vehicle !== "wheelchair" ? "none" : (ok("companion", draft.companion) ?? base.companion),
    pose: ok("pose", draft.pose) ?? base.pose,
  };
}


/** 業界ごとの区画（分野で決まらないとき） */
const DEFAULT_DISTRICT: Record<string, DistrictId> = {
  common: "office",
  finance: "office",
  "real-estate": "office",
  security: "office",
  "it-media": "office",
  professional: "office",
  "trading-retail": "shops",
  fashion: "shops",
  hospitality: "shops",
  lifestyle: "shops",
  entertainment: "stage",
  education: "school",
  healthcare: "hospital",
  "public-service": "townhall",
  manufacturing: "factory",
  repair: "factory",
  logistics: "port",
  construction: "build",
  energy: "energy",
  environment: "energy",
  agriculture: "farm",
  animals: "ranch",
};

/** 業界の分野ごとの区画（「業界/分野」→ 区画）。DEFAULT_DISTRICT より優先 */
const FIELD_DISTRICT: Record<string, DistrictId> = {
  "it-media/テレビ・ラジオ・動画": "media",
  "it-media/新聞・出版": "media",
  "it-media/アニメ・ゲーム・イラスト": "media",
  "it-media/芸能・音楽": "media",
  "entertainment/美術・アニメ・文章": "media",
  "hospitality/ホテル・旅館・観光案内": "resort",
  "lifestyle/旅行・観光": "resort",
  "lifestyle/遊園地・レジャー施設": "resort",
  "lifestyle/結婚式・お葬式・宗教": "resort",
  "lifestyle/リラクゼーション・温浴": "resort",
  "lifestyle/スポーツ・趣味を教える": "stage",
  "education/スポーツ・野外活動": "stage",
  "lifestyle/ペット・動物": "ranch",
  "agriculture/畜産・酪農": "ranch",
  "agriculture/漁業・養殖": "port",
  "repair/車・バイク・自転車": "port",
  "repair/飛行機・船・重機": "port",
  "public-service/空港・港・出入国": "port",
  "public-service/ごみ・水道・まちの設備": "energy",
  "public-service/自然・動物を守る": "farm",
  "environment/自然を守る": "farm",
  "environment/環境の調査・政策": "lab",
  "public-service/図書館・記録・学び": "school",
  "healthcare/保育・子ども": "school",
  "education/大学・専門学校・研究": "lab",
  "professional/生き物・医薬の研究": "lab",
  "professional/物理・化学・宇宙の研究": "lab",
  "professional/地球・環境": "lab",
  "professional/農林水産・動物": "lab",
  "professional/建設・ものづくりの技術": "lab",
  "professional/人文・社会・ことば": "lab",
};

/**
 * 公園で見かける仕事（職業カードの id → 公園の中のまとまりの名前）。業界や分野で決まる区画より先に見る。
 * 職業カードの説明に、公園・庭・木の手入れ・野外での活動が出てくる仕事だけを入れている。
 * まとまりの名前は、仕事の街の看板だけで使う（業界ページの分野とは別）
 */
const PARK_JOBS: Record<number, string> = {
  222: "庭と木の手入れ", // 造園工
  17101200: "庭と木の手入れ", // ランドスケープアーキテクト
  37301300: "庭と木の手入れ", // 樹木剪定士（アーボリスト）
  19103103: "自然の案内と保護", // パーク・ナチュラリスト
  501: "自然の案内と保護", // 自然保護官（レンジャー）
  219: "外で教える仕事", // アウトドアインストラクター
  39903200: "外で教える仕事", // レクリエーション指導員
  226: "外で教える仕事", // 犬訓練士
};

/**
 * 区画ごとの建物。landmarks は先に置く目印の建物（[種類, 幅, 奥行き, 置く場所 x, y]。場所は区画の内側の左奥から数えたタイル、
 * 負の数は右・手前の端から。省略すると空いている場所）、fill は残りに散らす建物（[種類, 重み]）、density は建物に使う面積の割合
 */
type Landmark = [BuildingKind, number, number, number?, number?];
type Theme = {
  landmarks: Landmark[];
  fill: [BuildingKind, number][];
  density: number;
};

const THEMES: Record<DistrictId, Theme> = {
  farm: {
    landmarks: [["barn", 2, 2], ["silo", 1, 1], ["greenhouse", 2, 2], ["greenhouse", 2, 2], ["scarecrow", 1, 1], ["tractor", 1, 1]],
    fill: [["field", 5], ["tree", 3], ["house", 1], ["scarecrow", 0.4]],
    density: 0.5,
  },
  ranch: { landmarks: [["paddock", 3, 3], ["zoo", 3, 3], ["barn", 2, 2], ["pond", 2, 2]], fill: [["tree", 4], ["silo", 0.5]], density: 0.45 },
  stage: { landmarks: [["stadium", 3, 3], ["concert", 3, 2], ["dome", 2, 2]], fill: [["tree", 2], ["stall", 1.5], ["billboard", 0.6]], density: 0.45 },
  resort: {
    landmarks: [["ferris", 2, 2], ["hotel", 2, 2], ["pool", 2, 2], ["temple", 2, 2], ["torii", 1, 1], ["onsen", 2, 2]],
    fill: [["hotel", 1], ["tree", 2], ["shop", 1]],
    density: 0.48,
  },
  school: { landmarks: [["school", 3, 2], ["track", 3, 2]], fill: [["tree", 3], ["house", 1]], density: 0.38 },
  media: { landmarks: [["antenna", 1, 1], ["dish", 1, 1], ["billboard", 1, 1]], fill: [["office", 2], ["tower", 1], ["tree", 1], ["dish", 0.4]], density: 0.42 },
  energy: {
    landmarks: [["windmill", 1, 1], ["windmill", 1, 1], ["windmill", 1, 1], ["gastank", 2, 2], ["gastank", 2, 2], ["pylon", 1, 1], ["pylon", 1, 1]],
    fill: [["solar", 3], ["factory", 1], ["tree", 1], ["pylon", 0.5]],
    density: 0.5,
  },
  build: { landmarks: [["crane", 1, 1], ["crane", 1, 1]], fill: [["frame", 3], ["house", 1], ["container", 1]], density: 0.42 },
  office: { landmarks: [["fountain", 2, 2]], fill: [["tower", 3], ["office", 3], ["tree", 1], ["vending", 0.4]], density: 0.42 },
  shops: { landmarks: [], fill: [["shop", 4], ["stall", 2], ["cafe", 0.8], ["restaurant", 0.8], ["vending", 0.5], ["house", 1], ["tree", 1], ["billboard", 0.3]], density: 0.42 },
  factory: { landmarks: [], fill: [["factory", 4], ["warehouse", 2], ["workshop", 0.8], ["gastank", 0.5], ["container", 1], ["tree", 0.5]], density: 0.45 },
  lab: { landmarks: [["dome", 2, 2], ["dish", 1, 1], ["greenhouse", 2, 2]], fill: [["lab", 3], ["tree", 2]], density: 0.4 },
  hospital: { landmarks: [["hospital", 3, 3], ["helipad", 2, 2]], fill: [["office", 1], ["tree", 2], ["house", 1]], density: 0.32 },
  port: {
    landmarks: [
      ["station", 4, 1, 2, 0],
      ["runway", 11, 2, 0, -3],
      ["hangar", 3, 2, 0, -8],
      ["terminal", 3, 2, 5, -8],
      ["lighthouse", 1, 1, -1, 3],
      ["crane", 1, 1, -1, 17],
      ["crane", 1, 1, -1, 23],
    ],
    fill: [["container", 4], ["warehouse", 2]],
    density: 0.48,
  },
  townhall: { landmarks: [["townhall", 3, 2], ["firestation", 2, 2], ["police", 2, 2]], fill: [["office", 1], ["tree", 2]], density: 0.4 },
  park: { landmarks: [["pond", 3, 2], ["fountain", 2, 2], ["stall", 1, 1], ["vending", 1, 1]], fill: [["tree", 1]], density: 0.4 },
};

/** 1x1 の建物（それ以外は SIZES にあるものを除いて 2x2。field は 2x2〜3x2） */
const SMALL: ReadonlySet<BuildingKind> = new Set([
  "tree",
  "container",
  "windmill",
  "crane",
  "antenna",
  "silo",
  "scarecrow",
  "tractor",
  "pylon",
  "stall",
  "billboard",
  "vending",
  "dish",
  "torii",
  "oilrig",
]);

/** 1x1 でも 2x2 でもない建物の、敷地の幅・奥行き */
const SIZES: Partial<Record<BuildingKind, readonly [number, number]>> = {
  hospital: [3, 3],
  stadium: [3, 3],
  zoo: [3, 3],
  paddock: [3, 3],
  school: [3, 2],
  townhall: [3, 2],
  market: [3, 2],
  terminal: [3, 2],
  concert: [3, 2],
  track: [3, 2],
  hangar: [3, 2],
  station: [4, 1],
};

function sizeOf(kind: BuildingKind): readonly [number, number] {
  return SIZES[kind] ?? (SMALL.has(kind) ? [1, 1] : [2, 2]);
}

/**
 * まとまり（「業界/分野」。分野のない業界は業界の slug）ごとの、その仕事が集まる建物。
 * ここにないまとまりは、区画ごとの DEFAULT_HOME になる
 */
const HOMES: Record<string, BuildingKind> = {
  // 工場地帯
  "manufacturing/化学・薬・素材": "gastank",
  "manufacturing/金属・機械": "factory",
  "manufacturing/食品・飲料": "factory",
  "manufacturing/工芸・デザイン": "workshop",
  "manufacturing/木・紙・印刷": "warehouse",
  "manufacturing/どの工場にもある仕事": "office",
  "manufacturing/服・繊維": "workshop",
  "manufacturing/電気・電子": "lab",
  "manufacturing/乗り物": "hangar",
  "manufacturing/精密機器・医療機器": "lab",
  "repair/家電・機械・設備": "garage",
  "repair/時計・カメラ・楽器・鍵": "workshop",
  // 工事現場
  "construction/設計・計画・管理": "office",
  "construction/建物の骨組み": "frame",
  "construction/内装・仕上げ": "house",
  "construction/屋根・窓・外まわり": "house",
  "construction/道路・鉄道・土木": "crane",
  "construction/水道・空調・機械の設備": "warehouse",
  "construction/重機・クレーン": "crane",
  "construction/解体・省エネ・環境": "frame",
  "construction/測量・調査・検査": "container",
  "construction/電気・通信の工事": "pylon",
  "construction/庭・緑": "greenhouse",
  // 港・空港・駅
  "logistics/鉄道・駅": "station",
  "logistics/バス・タクシー・車": "garage",
  "logistics/飛行機・空港": "terminal",
  "logistics/トラック・配達": "warehouse",
  "logistics/荷物の積み下ろし": "crane",
  "logistics/倉庫・仕分け・こん包": "warehouse",
  "logistics/物流・交通の計画": "office",
  "logistics/郵便": "postoffice",
  "public-service/空港・港・出入国": "office",
  "repair/車・バイク・自転車": "garage",
  "repair/飛行機・船・重機": "hangar",
  // 発電所・リサイクル
  "energy/太陽光・風力・省エネ": "windmill",
  "energy/石油・ガス": "oilrig",
  "energy/水力・地熱・バイオマス": "gastank",
  "energy/発電所・送電・電気設備": "pylon",
  "energy/水道・下水": "silo",
  "energy/原子力": "coolingtower",
  "energy/鉱山・採掘": "mine",
  "environment/ごみ・リサイクル": "warehouse",
  "environment/水・土・空気の浄化": "lab",
  "public-service/ごみ・水道・まちの設備": "container",
  // 観光地・ホテル
  "hospitality/ホテル・旅館・観光案内": "hotel",
  "lifestyle/結婚式・お葬式・宗教": "chapel",
  "lifestyle/遊園地・レジャー施設": "ferris",
  "lifestyle/リラクゼーション・温浴": "onsen",
  "lifestyle/旅行・観光": "shop",
  // オフィス街
  "it-media/ソフトウェア・システム開発": "tower",
  "it-media/ITの運用・セキュリティ": "datacenter",
  "it-media/通信": "antenna",
  "it-media/データ・地図・センサー": "datacenter",
  "it-media/広告・Web": "billboard",
  "professional/広告・デザイン": "billboard",
  "professional/数学・データ": "lab",
  "professional/法律・会計・知的財産": "court",
  "professional/コンサルティング・調査": "tower",
  "finance/銀行・ローン": "bank",
  "finance/証券・投資": "tower",
  "finance/保険": "office",
  "finance/分析・リスク・検査": "bank",
  "real-estate": "house",
  "common/経営・企画": "tower",
  "common/広報・マーケティング": "billboard",
  "common/購買・調達": "warehouse",
  // 商店街
  "trading-retail/スーパー・コンビニ・デパート": "market",
  "trading-retail/車・バイク・自転車": "garage",
  "trading-retail/商社・貿易・仕入れ": "office",
  "trading-retail/ネット通販・商品企画": "warehouse",
  "trading-retail/薬・メガネ・補聴器": "pharmacy",
  "trading-retail/パン・お菓子・食品の店": "cafe",
  "trading-retail/営業・訪問販売": "stall",
  "trading-retail/カメラ・時計・楽器の修理": "workshop",
  "hospitality/料理をつくる": "restaurant",
  "hospitality/お店の接客・運営": "restaurant",
  "hospitality/カフェ・バー・飲み物": "cafe",
  "lifestyle/美容・理容・メイク": "salon",
  "lifestyle/家事・くらしのサービス": "house",
  fashion: "salon",
  // 牧場・動物園
  animals: "zoo",
  "agriculture/畜産・酪農": "paddock",
  "lifestyle/ペット・動物": "house",
  // テレビ局・スタジオ
  "it-media/テレビ・ラジオ・動画": "tvstation",
  "it-media/新聞・出版": "library",
  "it-media/アニメ・ゲーム・イラスト": "workshop",
  "it-media/芸能・音楽": "concert",
  "entertainment/美術・アニメ・文章": "workshop",
  // 研究学園
  "professional/地球・環境": "dish",
  "professional/生き物・医薬の研究": "lab",
  "professional/人文・社会・ことば": "library",
  "professional/物理・化学・宇宙の研究": "observatory",
  "professional/建設・ものづくりの技術": "lab",
  "professional/農林水産・動物": "greenhouse",
  "education/大学・専門学校・研究": "school",
  // 劇場・スタジアム
  "entertainment/スポーツ・競馬": "stadium",
  "entertainment/イベント・舞台の裏方": "stall",
  "entertainment/演劇・ダンス・芸能": "dome",
  "entertainment/音楽": "concert",
  "lifestyle/スポーツ・趣味を教える": "track",
  "education/スポーツ・野外活動": "pool",
  // 学校
  "education/学校の先生": "school",
  "education/塾・語学・習い事": "office",
  "education/学校を支える仕事": "house",
  "education/図書館・博物館": "library",
  "education/保育園・幼稚園・学童": "nursery",
  "education/大人の学び・キャリア": "office",
  "healthcare/保育・子ども": "nursery",
  "public-service/図書館・記録・学び": "library",
  // 役所・警察・消防
  "public-service/裁判・検察・刑務所": "court",
  "public-service/役所・政治・まちづくり": "townhall",
  "public-service/警察・取り締まり": "police",
  "public-service/福祉・保健・NPO": "carehome",
  "public-service/消防・救急・防災": "firestation",
  "public-service/自衛隊・海上保安": "hangar",
  // 病院・福祉
  "healthcare/医師": "hospital",
  "healthcare/リハビリ・からだのケア": "clinic",
  "healthcare/介護・福祉": "carehome",
  "healthcare/看護・保健": "clinic",
  "healthcare/検査・医療機器": "lab",
  "healthcare/病院の事務・運営": "office",
  "healthcare/心のケア": "house",
  "healthcare/歯科": "clinic",
  "healthcare/薬・治験・研究": "pharmacy",
  // 公園
  "park/庭と木の手入れ": "greenhouse",
  "park/自然の案内と保護": "house",
  "park/外で教える仕事": "track",
  // 農村・森
  "agriculture/植物工場・農業の技術": "greenhouse",
  "agriculture/森林・木材・造園": "warehouse",
  "agriculture/米・野菜・果物・花": "barn",
  "agriculture/経営・出荷・市場": "silo",
  "public-service/自然・動物を守る": "house",
  "environment/自然を守る": "house",
};

/** HOMES にないまとまりの、その仕事が集まる建物（区画ごと） */
const DEFAULT_HOME: Record<DistrictId, BuildingKind> = {
  farm: "barn",
  ranch: "barn",
  stage: "dome",
  resort: "hotel",
  school: "house",
  media: "office",
  energy: "factory",
  build: "container",
  office: "office",
  shops: "shop",
  factory: "factory",
  lab: "lab",
  hospital: "clinic",
  port: "warehouse",
  townhall: "office",
  park: "fountain",
};

/** 海に泊めた船に乗るまとまり（港の区画にいるときだけ）：[船の種類, 島の右の端から船までのタイル, 船の y, 幅, 奥行き] */
const SEA_HOMES: Record<string, readonly [BuildingKind, number, number, number, number]> = {
  "agriculture/漁業・養殖": ["fishingboat", 2.2, 4, 3, 6],
  "logistics/船・港・貿易": ["cargoship", 2.2, 15, 3, 10],
};
/** 船のまとまりのうち、甲板に立つ仕事（職業名にこの言葉がある仕事）。それ以外は、船のそばの岸に立つ */
const SEA_WORDS = /船|航海|漁|水産|養殖|海|潜水/;

/** 決まった種から 0〜1 の乱数を返す関数（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const draftIndustries: Readonly<Record<string, readonly string[] | undefined>> = draft.occupations;
const fieldData: Readonly<Record<string, readonly { name: string; ids: readonly number[] }[] | undefined>> =
  fieldsJson.industries;
const industryName = new Map(industries.map((industry) => [industry.slug, industry.name]));

/** その職業が出てくる業界（代表的な仕事として挙げた業界が先、AI の振り分けが後） */
function industriesOf(id: number): string[] {
  const listed = industries.filter((industry) => industry.jobIds.includes(id)).map((industry) => industry.slug);
  return [...new Set([...listed, ...(draftIndustries[String(id)] ?? [])])];
}

const fieldOf = (id: number, slug: string) => fieldData[slug]?.find((f) => f.ids.includes(id))?.name;

function districtOf(id: number, slugs: readonly string[]): DistrictId {
  if (PARK_JOBS[id]) return "park";
  // 動物の業界にも出てくる仕事は、牧場・動物園に置く（研究や医療の業界が先でも）
  if (slugs.includes("animals")) return "ranch";
  const primary = slugs[0];
  if (!primary) return "office";
  const field = fieldOf(id, primary);
  return (field && FIELD_DISTRICT[`${primary}/${field}`]) || DEFAULT_DISTRICT[primary] || "office";
}

/** その仕事が入るまとまり（同じ区画の、同じ分野）。label は看板に出す名前 */
function groupOf(id: number, slugs: readonly string[], district: DistrictId): { key: string; label: string } {
  const park = PARK_JOBS[id];
  if (district === "park" && park) return { key: `park/${park}`, label: park };
  const primary = slugs[0];
  if (!primary) return { key: "common", label: "いろいろな仕事" };
  if (district === "ranch" && slugs.includes("animals")) return { key: "animals", label: industryName.get("animals") ?? "動物" };
  const field = fieldOf(id, primary);
  if (field) return { key: `${primary}/${field}`, label: field };
  return { key: primary, label: industryName.get(primary) ?? "いろいろな仕事" };
}

/** タイル1枚の、画面での半分の幅・高さ（px）。components/town/iso.ts の HW・HH と同じ */
const HW = 32;
const HH = 16;

/** 後ろの人を隠す建物：敷地（本体の箱）と、隠す高さをタイルの数に直したもの、重なり順 */
type Cover = { x0: number; x1: number; y0: number; y1: number; reach: number; depth: number };

function coverOf(b: TownBuilding): Cover | undefined {
  if (FLAT_KINDS.has(b.kind)) return undefined;
  const height = coverHeight(b.kind, rng(b.seed)());
  if (height <= 0) return undefined;
  // 本体の箱は、敷地より少し内側に描く（components/town/draw.ts の box の inset）
  const inset = 0.14;
  return {
    x0: b.x + inset,
    x1: b.x + b.w - inset,
    y0: b.y + inset,
    y1: b.y + b.d - inset,
    reach: height / (HH * 2),
    // components/town/draw.ts の buildingDepth と同じ
    depth: b.x + b.w + b.y + b.d - 1,
  };
}

/** 人の体のうち、見えていてほしい点（足もとから、右へ dx・上へ up。px）：頭、胸、両肩 */
const BODY_POINTS: readonly (readonly [number, number])[] = [
  [0, 40],
  [0, 22],
  [-8, 28],
  [8, 28],
];

/**
 * (x, y) に立つ人が、手前の建物に隠れずに見えるか。
 * 画面で上へ h px の点は、タイルでは (-h/32, -h/32) の方向なので、体の点から (s, s) だけ手前へ進んだところに
 * 建物の敷地があり、s が建物の高さの分より小さければ、その点は建物に隠れる
 */
function canSee(x: number, y: number, covers: readonly Cover[]): boolean {
  // 人の重なり順（components/town/townScene.ts の zIndex と同じ）
  const depth = x + y + 0.5;
  for (const c of covers) {
    if (c.depth <= depth) continue;
    for (const [dx, up] of BODY_POINTS) {
      const qx = x + dx / (HW * 2) - up / (HH * 2);
      const qy = y - dx / (HW * 2) - up / (HH * 2);
      const from = Math.max(0, c.x0 - qx, c.y0 - qy);
      const to = Math.min(c.reach, c.x1 - qx, c.y1 - qy);
      if (from <= to) return false;
    }
  }
  return true;
}

type Job = { o: Occupation; slugs: string[] };
/** 同じ分野の仕事のまとまり。home はその仕事が集まる建物、deck は船に乗るときの甲板の高さ（px） */
type Group = { key: string; label: string; jobs: Job[]; home?: TownBuilding; deck?: number };
type Spot = { x: number; y: number; lift?: number; depth?: number };
type Placed = { job: Job; group: Group; spot: Spot };

/** 1つの区画を並べている途中の様子 */
type Plan = {
  district: District;
  theme: Theme;
  /** 区画の内側（外周の1マスは道。隣の区画と合わせて道幅2マス） */
  x0: number;
  y0: number;
  w: number;
  d: number;
  random: () => number;
  /** 建物か人が使っているマス */
  used: Set<string>;
  buildings: TownBuilding[];
  groups: Group[];
};

const tileKey = (x: number, y: number) => `${x},${y}`;

function makePlan(district: District, jobs: readonly Job[]): Plan {
  const [rx, ry, rw, rd] = district.rect;
  const byKey = new Map<string, Group>();
  for (const job of jobs) {
    const { key, label } = groupOf(job.o.id, job.slugs, district.id);
    const group = byKey.get(key) ?? { key, label, jobs: [] };
    group.jobs.push(job);
    byKey.set(key, group);
  }
  return {
    district,
    theme: THEMES[district.id],
    x0: rx + 1,
    y0: ry + 1,
    w: rw - 2,
    d: rd - 2,
    random: rng(hash(district.id)),
    used: new Set(),
    buildings: [],
    // 人の多いまとまりから、場所を決める
    groups: [...byKey.values()].sort((a, b) => b.jobs.length - a.jobs.length || a.key.localeCompare(b.key)),
  };
}

function fits(plan: Plan, x: number, y: number, bw: number, bd: number): boolean {
  if (x < plan.x0 || y < plan.y0 || x + bw > plan.x0 + plan.w || y + bd > plan.y0 + plan.d) return false;
  for (let i = x; i < x + bw; i++) for (let j = y; j < y + bd; j++) if (plan.used.has(tileKey(i, j))) return false;
  return true;
}

function put(plan: Plan, kind: BuildingKind, x: number, y: number, bw: number, bd: number, label?: string): TownBuilding {
  for (let i = x; i < x + bw; i++) for (let j = y; j < y + bd; j++) plan.used.add(tileKey(i, j));
  const building: TownBuilding = { kind, x, y, w: bw, d: bd, seed: Math.floor(plan.random() * 1e9), ...(label ? { label } : {}) };
  plan.buildings.push(building);
  return building;
}

/** 区画の内側の、乱数で選んだ空いている場所に建物を置く。置けなければ undefined */
function putAnywhere(plan: Plan, kind: BuildingKind, bw: number, bd: number, tries: number): TownBuilding | undefined {
  for (let t = 0; t < tries; t++) {
    const x = plan.x0 + Math.floor(plan.random() * (plan.w - bw + 1));
    const y = plan.y0 + Math.floor(plan.random() * (plan.d - bd + 1));
    if (fits(plan, x, y, bw, bd)) return put(plan, kind, x, y, bw, bd);
  }
  return undefined;
}

/** そのまとまりの人が立つのに要る広さ（建物の中心からの、おおよその半径。タイル） */
const roomFor = (group: Group) => 1.1 * Math.sqrt(group.jobs.length) + 1.2;

/**
 * まとまりごとに、その仕事が集まる建物を置く。続けて、区画の目印の建物も置く。
 * 区画の目印に同じ種類の建物があれば、それをそのまとまりの建物にする（病院の区画の病院は、医師のまとまりの建物になる）
 */
function placeHomes(plan: Plan) {
  const { x0, y0, w, d } = plan;
  const centers: { x: number; y: number; room: number }[] = [];
  const settle = (group: Group, home: TownBuilding) => {
    group.home = home;
    centers.push({ x: home.x + home.w / 2, y: home.y + home.d / 2, room: roomFor(group) });
  };
  const kindOf = (group: Group) => HOMES[group.key] ?? DEFAULT_HOME[plan.district.id];
  const waiting = () => plan.groups.filter((group) => !group.home);

  // 船：島の外の海に置く（区画のマスは使わない）
  if (plan.district.id === "port") {
    for (const group of plan.groups) {
      const sea = SEA_HOMES[group.key];
      if (!sea) continue;
      const [kind, off, y, bw, bd] = sea;
      const boat: TownBuilding = { kind, x: TOWN_W + off, y, w: bw, d: bd, seed: Math.floor(plan.random() * 1e9), label: group.label };
      plan.buildings.push(boat);
      group.home = boat;
      group.deck = DECK_HEIGHT[kind] ?? 0;
    }
  }

  // 置く場所が決まっている目印を先に置く。同じ種類の建物を待っているまとまりがあれば、そのまとまりの建物にする
  const loose: Landmark[] = [];
  for (const landmark of plan.theme.landmarks) {
    const [kind, bw, bd, fx, fy] = landmark;
    if (fx === undefined || fy === undefined) {
      loose.push(landmark);
      continue;
    }
    const x = fx >= 0 ? x0 + fx : x0 + w + fx;
    const y = fy >= 0 ? y0 + fy : y0 + d + fy;
    if (!fits(plan, x, y, bw, bd)) continue;
    const group = waiting().find((g) => kindOf(g) === kind);
    const building = put(plan, kind, x, y, bw, bd, group?.label);
    if (group) settle(group, building);
  }

  // 残りのまとまりの建物を、ほかのまとまりと離して置く（まとまりごとに、人が立つ広さを空ける）
  for (const group of waiting()) {
    const kind = kindOf(group);
    const index = loose.findIndex(([k]) => k === kind);
    const [bw, bd] = index >= 0 ? [(loose[index] as Landmark)[1], (loose[index] as Landmark)[2]] : sizeOf(kind);
    if (index >= 0) loose.splice(index, 1);
    const room = roomFor(group);
    let best: { x: number; y: number } | undefined;
    let bestScore = -Infinity;
    for (let x = x0; x <= x0 + w - bw; x++) {
      for (let y = y0; y <= y0 + d - bd; y++) {
        if (!fits(plan, x, y, bw, bd)) continue;
        let gap = 6;
        for (const c of centers) gap = Math.min(gap, Math.hypot(x + bw / 2 - c.x, y + bd / 2 - c.y) - c.room - room);
        // 建物の手前（画面の下）に、人が立つマスが残る場所を選ぶ
        const front = Math.min(3, x0 + w - (x + bw), y0 + d - (y + bd));
        const score = gap * 2 + front * 0.8 + plan.random() * 0.6;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    if (best) settle(group, put(plan, kind, best.x, best.y, bw, bd, group.label));
  }

  // どのまとまりの建物にもならなかった目印
  for (const [kind, bw, bd] of loose) putAnywhere(plan, kind, bw, bd, 200);
}

/** マスの中心から、建物の敷地までの遠さ（タイル）。建物の奥（画面の上）側は、遠いものとして数える */
function distanceTo(home: TownBuilding, x: number, y: number): number {
  const dx = Math.max(home.x - x, 0, x - (home.x + home.w));
  const dy = Math.max(home.y - y, 0, y - (home.y + home.d));
  const behind = x + y < home.x + home.y + (home.w + home.d) / 2;
  return Math.hypot(dx, dy) + (behind ? 2.5 : 0);
}

/**
 * 人が立つ場所を決める。まとまりごとに、その仕事が集まる建物に近い、手前の建物に隠れないマスを選ぶ。
 * 見えるマスが足りないときだけ、建物に隠れるマスも使う（hidden がその数）
 */
function placePeople(plan: Plan, covers: readonly Cover[]): { placed: Placed[]; hidden: number } {
  const { x0, y0, w, d, random } = plan;
  const placed: Placed[] = [];
  let hidden = 0;

  // 空いているマスの中で少しずらした場所と、そこが建物に隠れないか
  type Tile = { x: number; y: number; px: number; py: number; seen: boolean };
  const tiles: Tile[] = [];
  for (let x = x0; x < x0 + w; x++) {
    for (let y = y0; y < y0 + d; y++) {
      if (plan.used.has(tileKey(x, y))) continue;
      let px = x + 0.3 + random() * 0.4;
      let py = y + 0.3 + random() * 0.4;
      let seen = canSee(px, py, covers);
      // 隠れるときは、同じマスの中で場所を変えて何度か試す（マスの端のほうなら見えることがある）
      for (let t = 0; t < 8 && !seen; t++) {
        const tx = x + 0.15 + random() * 0.7;
        const ty = y + 0.15 + random() * 0.7;
        if (canSee(tx, ty, covers)) {
          px = tx;
          py = ty;
          seen = true;
        }
      }
      tiles.push({ x, y, px, py, seen });
    }
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    const tmp = tiles[i] as Tile;
    tiles[i] = tiles[k] as Tile;
    tiles[k] = tmp;
  }

  const taken = new Set<string>();
  const has = (x: number, y: number) => taken.has(tileKey(x, y));
  /** まわりの8マスに人がいる */
  const crowded = (t: Tile) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((i || j) && has(t.x + i, t.y + j)) return true;
    return false;
  };
  /** すぐ手前か、すぐ奥に人がいる（画面で上下に重なる） */
  const stacked = (t: Tile) => has(t.x + 1, t.y + 1) || has(t.x - 1, t.y - 1);

  const queues = plan.groups.map((group) => {
    let jobs = group.jobs;
    const home = group.home;
    if (home && group.deck !== undefined) {
      // 船に乗る人を、甲板に2列で並べる。船の仕事でない人（通関士など）は、船のそばの岸に立つ
      const aboard = jobs.filter((job) => SEA_WORDS.test(job.o.name));
      jobs = jobs.filter((job) => !SEA_WORDS.test(job.o.name));
      const rows = Math.ceil(aboard.length / 2);
      aboard.forEach((job, i) => {
        const row = Math.floor(i / 2);
        // 甲板の右側に立つ（左側には、積み荷や網を描く。components/town/draw.ts の drawShip）
        const x = home.x + home.w * (i % 2 ? 0.8 : 0.52);
        const y = home.y + home.d * 0.36 + (rows > 1 ? (row / (rows - 1)) * home.d * 0.42 : home.d * 0.2) + (i % 2 ? 0.25 : 0);
        // 船の絵より手前に描く
        const depth = home.x + home.w + home.y + home.d - 1 + 0.2 + (x + y - home.x - home.y) * 0.01;
        placed.push({ job, group, spot: { x, y, lift: group.deck, depth } });
      });
    }
    const near = home ? tiles.map((t) => ({ t, far: distanceTo(home, t.x + 0.5, t.y + 0.5) })).sort((a, b) => a.far - b.far) : tiles.map((t) => ({ t, far: 0 }));
    return { group, jobs: [...jobs], near, limit: 1.4 * Math.sqrt(jobs.length) + 2.5 };
  });

  // まとまりごとに1人ずつ、順番に場所を取る（人の多いまとまりが、まわりのマスを先に取りきらないように）
  for (let left = true; left; ) {
    left = false;
    for (const q of queues) {
      const job = q.jobs.shift();
      if (!job) continue;
      left = true;
      const free = q.near.filter(({ t }) => !has(t.x, t.y));
      const choice =
        free.find(({ t, far }) => t.seen && far <= q.limit && !crowded(t)) ??
        free.find(({ t, far }) => t.seen && far <= q.limit * 1.5 && !stacked(t)) ??
        free.find(({ t }) => t.seen && !stacked(t)) ??
        free.find(({ t }) => t.seen) ??
        free[0];
      if (!choice) throw new Error(`仕事の街：${plan.district.name}に人が立つ場所が足りません`);
      if (!choice.t.seen) hidden++;
      taken.add(tileKey(choice.t.x, choice.t.y));
      placed.push({ job, group: q.group, spot: { x: choice.t.px, y: choice.t.py } });
    }
  }

  // 人の立つマスと、そのすぐ手前のマスには、あとから建物を置かない
  for (const key of taken) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    plan.used.add(key);
    plan.used.add(tileKey(x + 1, y + 1));
  }
  return { placed, hidden };
}

/** 高い建物を置くと人が隠れる場所で、代わりに置く低い建物 */
const LOWER: Partial<Record<BuildingKind, BuildingKind>> = { tower: "office", hotel: "office", office: "shop" };

/**
 * 残りの空いているマスに、区画らしい建物を散らす。人や、その仕事が集まる建物の入口を隠す場所には置かない。
 * 高い建物は、後ろに人のいない場所（区画の奥の端など）を探して置き、なければ低い建物に替える
 */
function fillDistrict(plan: Plan, watch: readonly Spot[]) {
  const { theme, random } = plan;
  const budget = Math.floor(plan.w * plan.d * theme.density);
  let usedArea = plan.buildings.reduce((sum, b) => sum + (b.x < TOWN_W ? b.w * b.d : 0), 0);
  const total = theme.fill.reduce((sum, [, weight]) => sum + weight, 0);
  const near = watch.filter((s) => s.x > plan.x0 - 12 && s.x < plan.x0 + plan.w + 2 && s.y > plan.y0 - 12 && s.y < plan.y0 + plan.d + 2);

  /** その種類の建物を、置ける場所を乱数の順に探して置く */
  const place = (kind: BuildingKind, bw: number, bd: number): boolean => {
    const spots: [number, number][] = [];
    for (let x = plan.x0; x <= plan.x0 + plan.w - bw; x++) for (let y = plan.y0; y <= plan.y0 + plan.d - bd; y++) spots.push([x, y]);
    for (let i = spots.length - 1; i > 0; i--) {
      const k = Math.floor(random() * (i + 1));
      const tmp = spots[i] as [number, number];
      spots[i] = spots[k] as [number, number];
      spots[k] = tmp;
    }
    for (const [x, y] of spots) {
      if (!fits(plan, x, y, bw, bd)) continue;
      const seed = Math.floor(random() * 1e9);
      const cover = coverOf({ kind, x, y, w: bw, d: bd, seed });
      if (cover && near.some((s) => Math.abs(s.x - x) < 12 && Math.abs(s.y - y) < 12 && !canSee(s.x, s.y, [cover]))) continue;
      for (let i = x; i < x + bw; i++) for (let j = y; j < y + bd; j++) plan.used.add(tileKey(i, j));
      plan.buildings.push({ kind, x, y, w: bw, d: bd, seed });
      return true;
    }
    return false;
  };

  while (usedArea < budget) {
    let pick = random() * total;
    let kind: BuildingKind | undefined = theme.fill.find(([, weight]) => (pick -= weight) < 0)?.[0] ?? "tree";
    const [bw, bd] = kind === "field" ? (random() < 0.5 ? [3, 2] : [2, 2]) : sizeOf(kind);
    if (usedArea + bw * bd > budget) break;
    while (kind && !place(kind, bw, bd)) kind = LOWER[kind];
    // 置けなかったときも、その分の広さは使ったことにする（木ばかりで埋めずに、広場として残す）
    usedArea += bw * bd;
  }
}

/** 職業カードから、仕事の街でのキャラクターの見た目を返す関数を作る（業界ページの職業カードの絵にも使う） */
export async function townLooks(): Promise<(o: Occupation) => Look> {
  const drafts = await loadDraftLooks();
  return (o) => mergeLook(o, ruleLook(o), drafts[String(o.id)]);
}

export async function buildTown(): Promise<TownData> {
  const data = JSON.parse(await readFile(CARDS_FILE, "utf8")) as CardsData;
  const drafts = await loadDraftLooks();

  const byDistrict = new Map<DistrictId, Job[]>();
  for (const o of data.occupations) {
    const slugs = industriesOf(o.id);
    const draftDistrict = drafts[String(o.id)]?.district;
    const district = draftDistrict && DISTRICT_IDS.has(draftDistrict) ? (draftDistrict as DistrictId) : districtOf(o.id, slugs);
    const list = byDistrict.get(district) ?? [];
    list.push({ o, slugs });
    byDistrict.set(district, list);
  }

  // 1. 街じゅうの「その仕事が集まる建物」と目印を置く
  const plans = DISTRICTS.map((district) => makePlan(district, byDistrict.get(district.id) ?? []));
  for (const plan of plans) placeHomes(plan);

  // 2. 人を、建物に隠れない場所に立たせる（となりの区画の高い建物に隠れることもあるので、街じゅうの建物で調べる）
  const covers = plans.flatMap((plan) => plan.buildings).flatMap((b) => coverOf(b) ?? []);
  const placed: (Placed & { district: DistrictId })[] = [];
  for (const plan of plans) {
    const result = placePeople(plan, covers);
    // 建物を足したり高くしたりして、見える場所が足りなくなったときに気づけるようにする
    if (result.hidden > 0) console.warn(`仕事の街：${plan.district.name}で、${result.hidden}人が建物の後ろに隠れています（見える場所が足りません）`);
    for (const p of result.placed) placed.push({ ...p, district: plan.district.id });
  }

  // 3. 残りのマスに建物を散らす。地面に立つ人と、その仕事が集まる建物の入口が隠れないようにする
  const watch: Spot[] = [
    ...placed.filter((p) => p.spot.lift === undefined).map((p) => p.spot),
    ...plans.flatMap((plan) => plan.groups).flatMap((group) => (group.home && group.home.x < TOWN_W ? [{ x: group.home.x + group.home.w - 0.2, y: group.home.y + group.home.d - 0.2 }] : [])),
  ];
  for (const plan of plans) fillDistrict(plan, watch);

  const round = (v: number) => Math.round(v * 100) / 100;
  const people: TownPerson[] = placed.map(({ job: { o, slugs }, group, spot, district }) => ({
    id: o.id,
    name: o.name,
    summary: o.summary,
    major: data.meta.majors[o.major_code] ?? "",
    presence: o.jp_presence,
    known: o.familiarity === 3,
    tags: o.tags.map((t) => t.tag),
    industries: slugs,
    district,
    group: group.label,
    x: round(spot.x),
    y: round(spot.y),
    ...(spot.lift !== undefined ? { lift: spot.lift } : {}),
    ...(spot.depth !== undefined ? { depth: round(spot.depth) } : {}),
    look: mergeLook(o, ruleLook(o), drafts[String(o.id)]),
    drafted: drafts[String(o.id)] !== undefined,
  }));

  return {
    buildings: plans.flatMap((plan) => plan.buildings),
    people,
    industries: industries.map(({ slug, name }) => ({ slug, name })),
    tags: data.meta.tags,
    attribution: data.meta.attribution_ja,
    sources: data.meta.sources,
  };
}
