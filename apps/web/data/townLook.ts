// 仕事の街のキャラクターの見た目を、決まりで選ぶ（Gemini の下書き data/townLooks.json がない職業の仮の見た目）。
// 仕事で決める部品（上着・帽子・アクセサリー・持ち物・連れている動物・乗り物・ポーズ）は職業名と説明の言葉と大分類から、
// 仕事と関係のない部品（体つき・肌・髪型・髪の色・下の服）は職業ごとに決まった乱数から選ぶ。
// 部品の id は data/townParts.json。ビルドのときだけ使う（data/town.ts から）。

import type { Occupation } from "./jobCards";
import type { Look } from "./townModel";
import catalog from "./townParts.json";

type Rule = [RegExp, string];

export const COLOR: Record<string, number> = Object.fromEntries(catalog.colors.map((c) => [c.id, parseInt(c.hex.slice(1), 16)]));
const FIXED: Record<string, string | undefined> = Object.fromEntries(
  [...catalog.parts.top, ...catalog.parts.bottom].flatMap((p) => ("fixed" in p && p.fixed ? [[p.id, p.fixed]] : [])),
);

const TOP_RULES: Rule[] = [
  [/クリーンルーム|半導体製造|原子力|防護服/, "spacesuit"],
  [/消防/, "coverall"],
  [/医師|医$|歯科医|獣医師|薬剤師|研究者|研究員|臨床検査|病理|放射線技師/, "whitecoat"],
  [/看護|保健師|助産|歯科衛生|理学療法|作業療法|言語聴覚|介護|ヘルパー|救急救命|リハビリ/, "scrubs"],
  [/調理|コック|シェフ|料理人|板前|パティシエ|パン|菓子|寿司|すし|そば|ラーメン/, "chefcoat"],
  [/警察|警備|刑務|自衛|海上保安|入国|税関|麻薬|検疫|パイロット|客室乗務|車掌|運転士|機長|航海士|船長|駅員/, "uniform"],
  [/工事|建設|大工|とび|鉄筋|左官|配管|土木|足場|重機|クレーン|測量|交通誘導/, "hivis"],
  [/整備|修理|溶接|組立|製造|オペレーター|工員|鋳造|プレス|塗装|機械|メカニック/, "coverall"],
  [/ホテル|旅館|フロント|コンシェルジュ|バーテンダー|ソムリエ|ブライダル|ウェイター|ホール/, "vest"],
  [/店員|販売|レジ|バリスタ|カフェ|美容師|理容|ネイル|エステ|花屋|保育|農/, "apron"],
  [/選手|コーチ|インストラクター|トレーナー|審判|体育|ダンサー/, "jersey"],
  [/神職|僧侶|茶道|華道|着付|女将|仲居|書道|落語|呉服|日本舞踊/, "kimono"],
  [/祭|イベント|縁日|法被/, "happi"],
  [/銀行|証券|保険|営業|弁護|会計|税理|コンサル|経営|管理職|議員|秘書|外交|公認|アナリスト|支店長/, "suit"],
  [/プログラ|エンジニア|デザイナー|クリエイター|Web|ゲーム|アニメ|イラスト|漫画|編集|記者|ライター|作家/, "hoodie"],
  [/教員|教師|講師|司書|学芸員|カウンセラー|相談員/, "cardigan"],
];
const MAJOR_TOP: Record<string, string[]> = {
  "01": ["suit"],
  "02": ["shirt", "polo"],
  "03": ["shirt", "suit", "cardigan"],
  "04": ["whitecoat", "scrubs"],
  "05": ["cardigan", "shirt"],
  "06": ["shirt", "cardigan", "suit"],
  "07": ["shirt", "vest", "polo"],
  "08": ["polo", "scrubs"],
  "09": ["apron", "polo", "tshirt"],
  "10": ["uniform"],
  "11": ["shirt", "tshirt"],
  "12": ["coverall"],
  "13": ["uniform", "polo"],
  "14": ["hivis", "coverall"],
  "15": ["coverall", "tshirt"],
};

const HAT_RULES: Rule[] = [
  [/消防/, "firehat"],
  [/調理|コック|シェフ|料理人|パティシエ|パン職人/, "chef"],
  [/食品製造|給食|惣菜|製菓|製パン|弁当|食肉|水産加工|ねり製品|豆腐|乳製品/, "hairnet"],
  [/鉱|トンネル|採掘|坑/, "lamphelmet"],
  [/警察|警備|刑務|入国|海上保安/, "police"],
  [/パイロット|機長|船長|航海士/, "pilot"],
  [/牧場|酪農|畜産|乗馬|厩舎|調教/, "cowboy"],
  [/稲|果樹|畑|野菜|農業|農家|茶園/, "straw"],
  [/画家|イラスト|漫画|芸術|彫刻|陶芸/, "beret"],
  [/大工|職人|寿司|そば|漁師|漁業|左官|とび/, "headband"],
  [/調査|フィールド|地質|自然保護|レンジャー|探検|発掘|考古/, "safari"],
];
const MAJOR_HAT: Record<string, string> = { "14": "helmet", "13": "cap" };

const ACC_RULES: Rule[] = [
  [/医師|看護|小児科|内科/, "stethoscope"],
  [/歯科|手術|食品|調理|感染|給食|クリーンルーム/, "mask"],
  [/化学|実験|溶接|研究|検査|分析/, "goggles"],
  [/オペレーター|コールセンター|管制|ディスパッチ|DJ|放送技術|音響/, "headset"],
  [/空港|航空整備|グランド|騒音|工場/, "earmuffs"],
  [/大工|電気工事|配管|設備|内装|整備/, "toolbelt"],
  [/会社員|社員|事務|エンジニア|プログラ|システム|研究員|IT/, "idcard"],
  [/ホテル|バーテン|ウェイター|ソムリエ|コンシェルジュ/, "bowtie"],
  [/客室乗務|ツアー|ガイド|案内|添乗/, "scarf"],
  [/配達|登山|調査|ガイド|フィールド|メッセンジャー/, "backpack"],
  [/清掃|介護|整備|溶接|解体|ごみ/, "gloves"],
  [/審判|体育|コーチ|監視|ライフセーバー/, "whistle"],
  [/警備|交通誘導|ボランティア|消防団/, "armband"],
  [/パイロット|ライフセーバー|スキー/, "sunglasses"],
];

const HELD_RULES: Rule[] = [
  [/管制|コールセンター|オペレーター（電話/, "none"],
  [/ドローン|空撮/, "drone"],
  [/ロボット|制御/, "robot"],
  [/プログラ|システム|ソフトウェア|データ|ネットワーク|セキュリティ|AI|IT|アプリ|Web/, "laptop"],
  [/デザイナー|UI|UX/, "tablet"],
  [/設計|建築士|製図|CAD|施工管理/, "blueprint"],
  [/測量|地図|地理|GIS/, "map"],
  [/会計|経理|税理|簿記|監査|保険数理|アクチュアリー/, "calculator"],
  [/弁護|裁判|司法|検察|法務|弁理/, "scale"],
  [/臨床検査|病理|細胞|微生物/, "microscope"],
  [/研究|実験|化学|薬|バイオ|醸造|発酵/, "flask"],
  [/検査|分析|品質/, "testtube"],
  [/鑑定|鑑識|考古|発掘/, "magnifier"],
  [/看護|介護|医療事務|ケアマネ/, "clipboard"],
  [/アナウンサー|司会|DJ|歌手|ボーカル|リポーター|声優|ナレーター/, "mic"],
  [/ギター|ミュージシャン|バンド|作曲|編曲/, "guitar"],
  [/指揮|オーケストラ/, "baton"],
  [/画家|イラスト|漫画|アニメーター/, "brush"],
  [/美術|絵画|色彩/, "palette"],
  [/カメラマン|写真|フォトグラファー/, "camera"],
  [/映像|放送|ディレクター|映画|動画/, "videocam"],
  [/テニス|バドミントン|卓球/, "racket"],
  [/選手|コーチ|サッカー|野球|バスケ|体育|スポーツ/, "ball"],
  [/整備|修理|メカニック/, "wrench"],
  [/大工|職人|建具|家具|宮大工/, "hammer"],
  [/電気工事|設備|配管|内装/, "drill"],
  [/土木|造園|植木|庭師/, "shovel"],
  [/清掃|ハウスクリーニング|用務/, "broom"],
  [/塗装|ペンキ/, "paintroller"],
  [/花屋|フラワー|フローリスト/, "bouquet"],
  [/園芸|植物|果樹|苗/, "seedling"],
  [/農|稲|畑|野菜/, "wateringcan"],
  [/美容師|理容|トリマー/, "scissors"],
  [/調理|料理|コック|シェフ|料理人/, "pan"],
  [/ウェイター|ホール|客室乗務|仲居/, "tray"],
  [/バリスタ|カフェ|喫茶/, "cup"],
  [/郵便/, "mail"],
  [/配達|配送|運送|倉庫|仕分け|引越|ピッキング|荷物/, "box"],
  [/ツアー|ガイド|添乗/, "flag"],
  [/イベント|誘導|応援/, "megaphone"],
  [/国際|外交|貿易|商社|通訳|翻訳/, "globe"],
  [/自然保護|レンジャー|野鳥|生態|観察/, "binoculars"],
  [/漁|水産|養殖/, "net"],
  [/飼育|獣医|酪農|畜産|動物/, "bucket"],
  [/販売|店員|スーパー|レジ|商品/, "basket"],
  [/教員|教師|講師|先生/, "pointer"],
  [/記者|ライター|編集|作家|インタビュー/, "pen"],
  [/司書|図書|学芸員|保育/, "book"],
  [/営業|経営|管理職|コンサル|秘書|銀行/, "briefcase"],
  [/事務|総務|人事|行政|公務員/, "document"],
  [/受付|窓口|相談/, "phone"],
];
const MAJOR_HELD: Record<string, string> = { "01": "briefcase", "06": "document" };

const COMPANION_RULES: Rule[] = [
  [/水族館/, "penguin"],
  [/動物園/, "giraffe"],
  [/犬|トリマー|ペット|ブリーダー|盲導/, "dog"],
  [/猫/, "cat"],
  [/牛|酪農|乳牛|肉牛/, "cow"],
  [/馬|競馬|厩舎|調教|乗馬|装蹄/, "horse"],
  [/羊|牧羊/, "sheep"],
  [/豚|養豚/, "pig"],
  [/鶏|養鶏|卵/, "chicken"],
  [/うさぎ|小動物/, "rabbit"],
  [/鳥|野鳥/, "bird"],
  [/魚|漁|水産|養殖|熱帯魚|アクアリウム/, "fishtank"],
  [/獣医|動物看護|動物/, "dog"],
  [/植物|花|果樹|園芸|造園|樹木|林業|森林|稲|野菜|農業|植物工場|茶/, "plant"],
];

const VEHICLE_RULES: Rule[] = [
  [/救急/, "ambulance"],
  [/消防/, "firetruck"],
  [/警察官|パトロール|交通機動/, "patrolcar"],
  [/バス/, "bus"],
  [/タクシー|ハイヤー/, "taxi"],
  [/トラック|運送|長距離|ダンプ|タンクローリー/, "truck"],
  [/フォークリフト|倉庫/, "forklift"],
  [/配達|宅配|デリバリー|郵便外務|集配/, "scooter"],
  [/メッセンジャー|自転車/, "bicycle"],
  [/トラクター|稲作|畑作|農業機械/, "tractor"],
  [/重機|ショベル|建設機械|解体|掘削/, "excavator"],
  [/引越|仕分け|搬送|ピッキング/, "cart"],
  [/介護|ヘルパー|介助|福祉施設/, "wheelchair"],
  [/運転|ドライバー|自動車販売|レンタカー|カーディーラー/, "car"],
];

const SKINS = [0xf6d7b8, 0xeec6a0, 0xe2b58c, 0xd9a77e, 0xb88660, 0x8f6345];
const HAIR_COLORS = [0x2f2420, 0x2f2420, 0x3b2a20, 0x5a3a24, 0x7a5233, 0xb08850, 0x9a9a9a];
const HAIRS = catalog.parts.hair.map((h) => h.id);
const TOP_COLORS = ["navy", "blue", "skyblue", "teal", "green", "red", "orange", "yellow", "purple", "pink", "gray", "brown", "beige", "black"];
const SUIT_COLORS = ["navy", "black", "gray"];
const SCRUB_COLORS = ["skyblue", "teal", "navy", "pink", "green"];
const WORK_COLORS = ["navy", "blue", "gray", "green", "orange", "beige"];
const BOTTOM_COLORS = ["navy", "black", "gray", "beige", "brown"];

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

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)] as T;
}

function first(rules: Rule[], text: string): string | undefined {
  return rules.find(([re]) => re.test(text))?.[1];
}

export function colorOf(id: string | undefined, fallback: number): number {
  return (id ? COLOR[id] : undefined) ?? fallback;
}

/** 仕事と関係なく、職業ごとに決まった乱数で選ぶ部品 */
export function personalParts(o: Occupation, top: string, r = rng(o.id * 7919 + 13)) {
  const job = `${o.name} ${o.summary}`;
  const bottom = /選手|コーチ|インストラクター|体育|ダンサー/.test(job)
    ? "shorts"
    : top === "hivis" || top === "coverall" || /工事|建設|整備|作業/.test(job)
      ? "workpants"
      : r() < 0.28
        ? "skirt"
        : r() < 0.3
          ? "jeans"
          : "pants";
  const fixedBottom = FIXED[bottom];
  return {
    body: Math.floor(r() * 3) as 0 | 1 | 2,
    skin: pick(r, SKINS),
    hair: r() < 0.06 ? "buzz" : pick(r, HAIRS.filter((h) => h !== "buzz")),
    hairColor: pick(r, HAIR_COLORS),
    bottom,
    bottomColor: colorOf(fixedBottom ?? pick(r, BOTTOM_COLORS), 0x2f4468),
  };
}

export function topColorFor(top: string, colorId: string | undefined, r: () => number): number {
  const fixed = FIXED[top];
  if (fixed) return colorOf(fixed, 0xf6f6f3);
  if (colorId) return colorOf(colorId, 0x3f78c4);
  const list = top === "suit" || top === "uniform" ? SUIT_COLORS : top === "scrubs" ? SCRUB_COLORS : top === "coverall" ? WORK_COLORS : TOP_COLORS;
  return colorOf(pick(r, list), 0x3f78c4);
}

/** 決まりによる仮の見た目 */
export function ruleLook(o: Occupation): Look {
  const text = `${o.name} ${o.aliases.join(" ")} ${o.summary}`;
  const r = rng(o.id);
  const top = first(TOP_RULES, text) ?? pick(r, MAJOR_TOP[o.major_code] ?? ["shirt"]);
  const hat = first(HAT_RULES, text) ?? MAJOR_HAT[o.major_code] ?? (o.major_code === "12" && r() < 0.5 ? "cap" : r() < 0.05 ? "beanie" : "none");
  const accessories = [...new Set(ACC_RULES.filter(([re]) => re.test(text)).map(([, id]) => id))].slice(0, 2);
  if (accessories.length < 2 && !accessories.includes("sunglasses") && r() < 0.14) accessories.push("glasses");
  const held = first(HELD_RULES, text) ?? MAJOR_HELD[o.major_code] ?? "none";
  let vehicle = first(VEHICLE_RULES, text) ?? "none";
  if (vehicle === "wheelchair" && r() < 0.5) vehicle = "none";
  const companion = vehicle === "none" ? (first(COMPANION_RULES, text) ?? "none") : "none";
  const pose = ["box", "tray", "basket", "bucket"].includes(held)
    ? "carry"
    : ["pointer", "flag", "megaphone", "map"].includes(held)
      ? "point"
      : ["wrench", "hammer", "drill", "brush", "microscope", "laptop", "pan", "scissors", "paintroller", "shovel", "broom"].includes(held)
        ? "work"
        : /接客|ホテル|案内|受付|ガイド|保育|フロント/.test(text) || r() < 0.08
          ? "wave"
          : "stand";
  return { ...personalParts(o, top), top, topColor: topColorFor(top, undefined, r), hat, accessories, held, companion, vehicle, pose };
}
