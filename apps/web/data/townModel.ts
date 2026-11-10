// 仕事の街（/map）の型と区画。クライアントからも読むので、node の API は使わない。
// 街は等角投影（2.5D）のタイルで描く。座標の単位はタイルで、x が右下、y が左下に進む。
// 区画は業界ではなく「その仕事を街のどこで見かけるか」で分ける。区画への振り分けは data/town.ts。

export const TOWN_W = 80;
export const TOWN_H = 70;

export type DistrictId =
  | "farm"
  | "ranch"
  | "stage"
  | "resort"
  | "school"
  | "media"
  | "energy"
  | "build"
  | "office"
  | "shops"
  | "factory"
  | "lab"
  | "hospital"
  | "port"
  | "townhall"
  | "park";

export type District = {
  id: DistrictId;
  name: string;
  /** 区画の範囲 [x, y, 幅, 奥行き]（タイル）。隣の区画との間の1タイルは道になる */
  rect: readonly [number, number, number, number];
  /** 地面の色 */
  ground: number;
};

// 並びはサイドバーから飛ぶときの順（街の左上から）
export const DISTRICTS: readonly District[] = [
  { id: "farm", name: "農村・森", rect: [0, 0, 17, 15], ground: 0xcfe3a3 },
  { id: "energy", name: "発電所・リサイクル", rect: [17, 0, 25, 11], ground: 0xdfe6d2 },
  { id: "factory", name: "工場地帯", rect: [42, 0, 25, 34], ground: 0xe4ddd3 },
  { id: "port", name: "港・空港・駅", rect: [67, 0, 13, 34], ground: 0xd5e2e6 },
  { id: "ranch", name: "牧場・動物園", rect: [0, 15, 17, 11], ground: 0xd8eab0 },
  { id: "build", name: "工事現場", rect: [17, 11, 25, 12], ground: 0xeadcc4 },
  { id: "stage", name: "劇場・スタジアム", rect: [0, 26, 17, 12], ground: 0xf3dcc3 },
  { id: "office", name: "オフィス街", rect: [17, 23, 25, 31], ground: 0xdfe2e8 },
  { id: "lab", name: "研究学園", rect: [42, 34, 25, 10], ground: 0xd9e7f0 },
  { id: "townhall", name: "役所・警察・消防", rect: [67, 34, 13, 20], ground: 0xe3e6d6 },
  { id: "resort", name: "観光地・ホテル", rect: [0, 38, 17, 11], ground: 0xf6e2c8 },
  { id: "hospital", name: "病院・福祉", rect: [42, 44, 25, 26], ground: 0xf2e3e8 },
  { id: "school", name: "学校", rect: [0, 49, 17, 11], ground: 0xf0e6b8 },
  { id: "shops", name: "商店街", rect: [17, 54, 25, 16], ground: 0xf6dad3 },
  { id: "park", name: "公園", rect: [67, 54, 13, 16], ground: 0xc6e0a2 },
  { id: "media", name: "テレビ局・スタジオ", rect: [0, 60, 17, 10], ground: 0xe6dcef },
];

export type BuildingKind =
  | "tower"
  | "office"
  | "shop"
  | "house"
  | "factory"
  | "warehouse"
  | "hospital"
  | "school"
  | "townhall"
  | "lab"
  | "stadium"
  | "dome"
  | "hotel"
  | "ferris"
  | "antenna"
  | "crane"
  | "container"
  | "frame"
  | "windmill"
  | "solar"
  | "tree"
  | "field"
  | "pond"
  | "barn"
  | "silo"
  | "greenhouse"
  | "scarecrow"
  | "tractor"
  | "paddock"
  | "zoo"
  | "gastank"
  | "pylon"
  | "station"
  | "runway"
  | "lighthouse"
  | "concert"
  | "stall"
  | "billboard"
  | "fountain"
  | "vending"
  | "dish"
  | "firestation"
  | "police"
  | "pool"
  | "temple"
  | "torii"
  | "onsen"
  | "helipad"
  | "track"
  // ここから下は、分野ごとの「その仕事が集まる建物」として足したもの
  | "bank"
  | "court"
  | "clinic"
  | "pharmacy"
  | "carehome"
  | "nursery"
  | "library"
  | "tvstation"
  | "datacenter"
  | "restaurant"
  | "cafe"
  | "salon"
  | "market"
  | "postoffice"
  | "garage"
  | "chapel"
  | "coolingtower"
  | "oilrig"
  | "mine"
  | "terminal"
  | "workshop"
  | "observatory"
  | "hangar"
  | "fishingboat"
  | "cargoship";

/** 地面に貼る平らなもの（人や建物より先に描く） */
export const FLAT_KINDS: ReadonlySet<BuildingKind> = new Set(["field", "pond", "solar", "runway", "pool", "onsen", "helipad", "track"]);

/**
 * 建物の本体（箱）の高さ（px）：[いちばん低いとき, 乱数で足す幅]。
 * 描くとき（components/town/draw.ts）と、その後ろに立つ人が隠れるかを調べるとき（data/town.ts）の両方で使う。
 */
const BODY_HEIGHT: Partial<Record<BuildingKind, readonly [number, number]>> = {
  tower: [100, 80],
  office: [46, 34],
  hotel: [90, 30],
  shop: [26, 8],
  house: [20, 6],
  barn: [30, 0],
  factory: [30, 10],
  warehouse: [26, 0],
  hospital: [66, 0],
  school: [40, 0],
  townhall: [52, 0],
  lab: [34, 10],
  greenhouse: [26, 0],
  firestation: [42, 0],
  police: [40, 0],
  temple: [22, 0],
  bank: [38, 0],
  court: [44, 0],
  clinic: [34, 6],
  pharmacy: [26, 4],
  carehome: [24, 0],
  nursery: [22, 0],
  library: [36, 0],
  tvstation: [50, 14],
  datacenter: [40, 10],
  restaurant: [26, 6],
  cafe: [22, 4],
  salon: [26, 4],
  market: [28, 0],
  postoffice: [30, 0],
  garage: [24, 0],
  chapel: [28, 0],
  terminal: [30, 0],
  workshop: [22, 4],
  observatory: [26, 0],
  hangar: [30, 0],
};

/** 建物の本体の高さ（px）。u は、その建物の乱数（seed）の最初の値（0〜1） */
export function bodyHeight(kind: BuildingKind, u: number): number {
  const [base, spread] = BODY_HEIGHT[kind] ?? [0, 0];
  return base + u * spread;
}

/** 本体の上に載る屋根の分と、箱では描かない建物が、後ろの人を隠す高さ（px）。細い塔や木、柵、低い物は入れない（人を隠しきらない） */
const COVER_EXTRA: Partial<Record<BuildingKind, number>> = {
  house: 10,
  barn: 12,
  temple: 12,
  dome: 44,
  stadium: 22,
  gastank: 56,
  station: 28,
  carehome: 10,
  nursery: 10,
  chapel: 14,
  workshop: 10,
  coolingtower: 70,
  mine: 30,
  observatory: 18,
  hangar: 12,
};

/** 看板を出す高さに足す分（px）。本体の上に、屋根や飾りが出ている建物 */
const SIGN_EXTRA: Partial<Record<BuildingKind, number>> = {
  windmill: 110,
  ferris: 112,
  crane: 130,
  antenna: 172,
  pylon: 122,
  lighthouse: 122,
  silo: 54,
  frame: 54,
  tree: 30,
  container: 16,
  concert: 64,
  stall: 30,
  billboard: 72,
  dish: 46,
  zoo: 44,
  paddock: 18,
  torii: 40,
  temple: 26,
  school: 34,
  firestation: 30,
  factory: 56,
  barn: 20,
  house: 18,
  hotel: 16,
  townhall: 34,
  tower: 30,
  office: 14,
  greenhouse: 16,
  hospital: 4,
  police: 8,
  bank: 24,
  court: 34,
  pharmacy: 32,
  carehome: 12,
  nursery: 12,
  library: 16,
  tvstation: 36,
  datacenter: 8,
  restaurant: 30,
  cafe: 28,
  salon: 6,
  market: 18,
  chapel: 46,
  coolingtower: 100,
  oilrig: 106,
  mine: 38,
  terminal: 58,
  workshop: 12,
  observatory: 40,
  hangar: 14,
  fishingboat: 70,
  cargoship: 80,
};

/** 船の甲板の高さ（px）。船に乗る人は、この高さに立つ */
export const DECK_HEIGHT: Partial<Record<BuildingKind, number>> = { fishingboat: 15, cargoship: 22 };

/** 建物の上に出す看板の高さ（px）。建物のいちばん上より少し上 */
export function signHeight(kind: BuildingKind, u: number): number {
  return Math.max(coverHeight(kind, u), bodyHeight(kind, u) + (SIGN_EXTRA[kind] ?? 0), 12) + 12;
}

/** その建物が、後ろに立つ人を隠す高さ（px）。0 なら隠さない */
export function coverHeight(kind: BuildingKind, u: number): number {
  return bodyHeight(kind, u) + (COVER_EXTRA[kind] ?? 0);
}

export type TownBuilding = {
  kind: BuildingKind;
  /** 敷地の左奥の角（タイル） */
  x: number;
  y: number;
  /** 敷地の幅・奥行き（タイル） */
  w: number;
  d: number;
  /** 色や高さを決める乱数の種 */
  seed: number;
  /** その仕事が集まる建物のときの、看板の文字（分野の名前。「歯科」「食品・飲料」など） */
  label?: string;
};

/**
 * キャラクターの見た目（部品の組み合わせ）。部品の id は data/townParts.json のカタログ。
 * 仕事で決める部品（上着・帽子・アクセサリー・持ち物・連れている動物・乗り物・ポーズ）と、
 * 仕事と関係なく乱数で決める部品（体つき・肌・髪型・髪の色・下の服）に分けている（見た目の思い込みを入れないため）
 */
export type Look = {
  /** 0 細め、1 ふつう、2 がっしり */
  body: 0 | 1 | 2;
  skin: number;
  hair: string;
  hairColor: number;
  top: string;
  topColor: number;
  bottom: string;
  bottomColor: number;
  hat: string;
  accessories: string[];
  held: string;
  companion: string;
  vehicle: string;
  pose: string;
};

export type TownPerson = {
  /** 職業カードの id */
  id: number;
  name: string;
  summary: string;
  /** 職業の大分類の名前 */
  major: string;
  presence: "日本にもある" | "日本では少ない" | "日本にはほぼない";
  /** よく知られている仕事（知られやすさ3）。それ以外は、出会うまで名札が「？」 */
  known: boolean;
  /** 職業カードの「好きなもの」タグ */
  tags: string[];
  /** この仕事が出てくる業界の slug（data/industries.ts） */
  industries: string[];
  district: DistrictId;
  /** 街の中で、この仕事が集まる建物の看板の文字（分野の名前） */
  group: string;
  /** 立っている場所（タイル。少しずらしてある） */
  x: number;
  y: number;
  /** 船の甲板など、地面より高いところに立つときの高さ（px） */
  lift?: number;
  /** 重なり順を決めなおすとき（船の上の人は、船より手前に描く） */
  depth?: number;
  look: Look;
  /** 見た目と区画が Gemini の下書き（data/townLooks.json）から来たか。false は決まりによる仮のもの */
  drafted: boolean;
};

export type TownData = {
  buildings: TownBuilding[];
  people: TownPerson[];
  industries: { slug: string; name: string }[];
  tags: string[];
  /** 職業カードの出典（利用条件なので、カードを出すときは必ず出す） */
  attribution: string;
  sources: string[];
};
