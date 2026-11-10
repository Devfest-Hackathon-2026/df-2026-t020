// 自分のことを選ぶタグ。4回に分けて聞く（ROUNDS）。
// 1つのタグは [名前, 重み, 子タグ?] の形で書く。重み "R2A1" は R に2点、A に1点。
// 子タグは親を選ぶと、改行して下の段に出る（HobbyPicker）。いまは1回目（好きなもの）だけが子タグ（詳しいタグ）を持つ。
//
// 「好きなこと」を、対象（名詞）と関わり方（動詞）の2つに分けて聞く。
//   1回目 好きなもの（THINGS）      … 名詞。職業カードの「好きなもの」タグ（cardTags.ts の CARD_TAG_NAMES）そのもの。
//                                    職業カードを選ぶのと、Gemini に好きなこととして渡すのに使う。第1階層には RIASEC の点を付けない。
//                                    詳しいタグ（DETAILS）を持ち、点はごく小さく付ける（深く選んでも点が大きく変わらないように）
//   2回目 好きな関わり方（WAYS）     … 動詞。どの対象にも使える関わり方（「作る」は R、「しくみを調べる」は I）。RIASEC の点に使う
//   3回目 得意なこと（GOOD）         … 人からほめられること、自分でできると思うこと
//   4回目 大事にしたいこと（VALUE）  … こうありたいという姿
// ホランドの SDS が「活動・有能感・職業」の3つの角度から同じ6タイプを聞くのにならう。
// 「職業」は、選ぶ段階で職業名を出さない決まりがあるので「大事にしたいこと」に置きかえた。
// 得点は4回分を合計する（riasec.ts の score）。点のほとんどは2〜4回目から入る。
//
// - 2〜4回目は、どのタイプも同じ数（関わり方と大事にしたいことは3個、得意なことは2個）にそろえ、主タイプに2点だけ付ける
// - 得意なこと・大事にしたいことには自由記述の欄もある（freeTag）。タグを1個以上選んだうえでの追加で、点は付かない。
//   API に送れるのは3個までなので、自由記述も3個に数える（書くと、タグは2個まで）
// - タイプが続かないよう R→I→A→S→E→C の順に交互に並べる
// - 選ばれにくいタイプ（とくに C）は、数ではなく「選びたくなる言い方」でそろえる（「ルールを守る」のような言い方はしない）
// - 1つのタグには1つの活動だけを書く。「・」や「や」で2つ以上をつなげない（関わり方の「道具や機械を使う」は1つの活動とみなす）
// - タグの名前はすべての回を通して重複させない（API に名前で送るため）

import { CARD_TAG_NAMES, type CardTag } from "./cardTags";
import { ORDER, type TypeCode, type Weights } from "./riasec";

type RawTag = readonly [name: string, weights: string, children?: readonly RawTag[]];

/** 何回目の質問か */
export type RoundKey = "thing" | "way" | "good" | "value";

/**
 * 1回目の詳しいタグ。好きなものを選ぶと下の段に出る。選ばなくても先へ進める。
 * Gemini に「好きなこと」として渡して、見せる仕事を具体的にするのが目的。職業カードとのつながりは親から受け継ぐ。
 * 選び方の基準：
 * - ジャンルではなく「その好きなものとの関わり方」で書く
 * - どの好きなものにも「楽しむ側」（観る・遊ぶ・行く）と「作る・支える側」（作る・競う・ふるまう・調べる）の両方を入れる。
 *   作る・支える側が職業につながるので、ここを抜かさない
 * - 数はそろえない。好きなものの広さに合わせて3〜6個（ゲームや動画は多く、英語や数学は少なく）。数合わせのタグは入れない
 * - 職業の側から逆算して、職業はあるのに指すタグがなかった方向（運転する・建てる・食べ物の工場・物流）も入れる
 * - 点は、タイプとの結びつきがはっきりしたものにだけ1点（楽しむ側はすべて0点）。1点のタグは、どのタイプも7個にそろえる。
 *   そろえるため、あとから足した「乗り物を運転する」「家を建てる」などは0点にしている（Gemini への手がかりとして使う）
 * 点の上限は riasec.ts の DETAIL_BUDGET（好きなもの1つごとに1点）と DETAIL_TOTAL_BUDGET（詳しいタグ全体で3点）。
 */
const DETAILS: Readonly<Record<CardTag, readonly RawTag[]>> = {
  ゲーム: [
    ["ゲームで遊ぶ", ""], ["ゲーム実況を観る", ""], ["ストーリーを楽しむ", ""],
    ["攻略法を調べる", ""], ["大会を運営する", "E1"], ["ゲームを作る", "I1"],
  ],
  "アニメ・マンガ": [["アニメを観る", ""], ["マンガを読む", ""], ["作品を考察する", "I1"], ["キャラクターを描く", "A1"]],
  音楽: [["音楽を聴く", ""], ["カラオケ", ""], ["楽器を弾く", ""], ["プレイリストを作る", "C1"], ["作曲する", "A1"], ["音響機材をいじる", "R1"]],
  "動画・写真（観る・撮る・配信）": [
    ["動画を観る", ""], ["映画を観る", ""], ["お笑いを観る", ""], ["写真を撮る", ""],
    ["動画を編集する", "A1"], ["配信する", "E1"],
  ],
  スポーツ: [["スポーツ観戦", ""], ["ダンス", ""], ["スポーツをする", "R1"], ["試合に出る", "E1"], ["マネージャーをする", "S1"]],
  "推し活・ライブ": [["ライブに行く", ""], ["推しを応援する", ""], ["ファンと交流する", ""], ["グッズを集める", "C1"]],
  ファッション: [["古着", ""], ["コーデを考える", "A1"], ["服を作る", "R1"], ["服を選んであげる", "S1"]],
  "コスメ・美容": [["メイク", ""], ["スキンケア", ""], ["ネイル", ""], ["成分を調べる", ""], ["人にメイクする", "S1"]],
  "料理・お菓子": [["食べ歩き", ""], ["カフェ巡り", ""], ["お菓子作り", ""], ["料理を作る", ""], ["料理をふるまう", "S1"], ["食べ物ができるまでを知る", ""]],
  旅行: [["国内旅行", ""], ["海外旅行", ""], ["旅の計画を立てる", "C1"], ["旅先を案内する", "S1"]],
  "絵・デザイン": [["美術館に行く", ""], ["手芸", ""], ["デザインを考える", ""], ["イラストを描く", "A1"]],
  "スマホ・アプリ": [["アプリを使いこなす", ""], ["ガジェット", ""], ["プログラミング", "I1"], ["電子工作", "R1"]],
  SNS: [["SNSを見る", ""], ["写真を投稿する", ""], ["友だちとつながる", ""], ["SNSで発信する", "E1"]],
  "買い物（コンビニ・ネット通販）": [["ネット通販", ""], ["コンビニの新商品", ""], ["お得に買う", "C1"], ["フリマアプリ", "E1"], ["荷物が届くしくみを知る", ""]],
  "電車・乗り物": [["電車に乗る", ""], ["飛行機", ""], ["時刻表を見る", "C1"], ["車をいじる", "R1"], ["乗り物を運転する", ""]],
  "家・インテリア・まち": [["街歩き", ""], ["建物を見る", ""], ["部屋づくり", "A1"], ["DIY", "R1"], ["家を建てる", ""]],
  "動物・ペット": [["動物園に行く", ""], ["水族館に行く", ""], ["動物の世話をする", "S1"], ["生き物の生態を調べる", "I1"]],
  "自然・植物": [["キャンプ", ""], ["星空", ""], ["天気を調べる", ""], ["植物を育てる", "R1"]],
  "本・読書": [["小説を読む", ""], ["図書館に行く", ""], ["読んだ本を記録する", "C1"], ["物語を書く", "A1"], ["おすすめの本を紹介する", "E1"]],
  英語: [["洋楽", ""], ["海外ドラマ", ""], ["英会話", "S1"]],
  数学: [["グラフを読む", ""], ["問題を解く", "I1"], ["計算する", "C1"]],
  "理科・実験": [["宇宙", ""], ["体のしくみ", ""], ["実験する", "I1"]],
  "歴史・社会": [["ニュースを見る", ""], ["お城めぐり", ""], ["歴史を調べる", "I1"], ["社会問題を話し合う", "E1"]],
};

/** 1回目：好きなもの。職業カードのタグをそのまま並べる（第1階層には点を付けない） */
const THINGS: readonly RawTag[] = CARD_TAG_NAMES.map((name) => [name, "", DETAILS[name]] as const);

/** 2回目：好きな関わり方 */
const WAYS: readonly RawTag[] = [
  ["手を動かして作る", "R2"],
  ["しくみを調べる", "I2"],
  ["自分の作品をつくる", "A2"],
  ["人に教える", "S2"],
  ["企画する", "E2"],
  ["集めて整理する", "C2"],
  ["体を動かす", "R2"],
  ["謎を解く", "I2"],
  ["見た目を工夫する", "A2"],
  ["人の世話をする", "S2"],
  ["みんなに広める", "E2"],
  ["記録をつける", "C2"],
  ["道具や機械を使う", "R2"],
  ["くらべて分析する", "I2"],
  ["想像をふくらませる", "A2"],
  ["お客さんをもてなす", "S2"],
  ["人にすすめる", "E2"],
  ["細かいところをチェックする", "C2"],
];

/** 3回目：得意なこと */
const GOOD: readonly RawTag[] = [
  ["手先が器用", "R2"],
  ["筋道を立てて考えられる", "I2"],
  ["アイデアが浮かぶ", "A2"],
  ["話を聞くのがうまい", "S2"],
  ["人前で話せる", "E2"],
  ["ミスが少ない", "C2"],
  ["体力がある", "R2"],
  ["調べものが得意", "I2"],
  ["センスがいいと言われる", "A2"],
  ["気配りができる", "S2"],
  ["みんなをまとめられる", "E2"],
  ["コツコツ続けられる", "C2"],
];

/**
 * 4回目：大事にしたいこと
 * 「人の役に立ちたい」は誰でも選びたくなり、1つのタグにすると S に偏る。点を下げるのではなく、
 * 「どうやって役に立ちたいか」に分解して、6タイプそれぞれの言い方にする（3巡目）。
 * S の中も「人助け」と1語でまとめず、地域の役に立つ・成長を支える・心に寄りそう、に分ける。
 * 職業の側から逆算して、点検（細かいところをチェックする）・接客（お客さんをもてなす）・販売（人にすすめる）・
 * 安全を守る・職人（プロの腕をみがきたい）・地域のように、仕事に多いのに言い表せなかった中身を入れている。
 */
const VALUE: readonly RawTag[] = [
  ["形に残るものを作りたい", "R2"],
  ["なぞを解き明かしたい", "I2"],
  ["自分らしさを出したい", "A2"],
  ["地域の役に立ちたい", "S2"],
  ["大きな目標に挑戦したい", "E2"],
  ["安心して長く働きたい", "C2"],
  ["プロの腕をみがきたい", "R2"],
  ["専門知識を深めたい", "I2"],
  ["新しいものを生み出したい", "A2"],
  ["人の成長を支えたい", "S2"],
  ["自分で決めて動きたい", "E2"],
  ["正確に仕上げたい", "C2"],
  // ---- 3巡目：役に立ち方を、タイプごとに分けたもの ----
  ["人の安全を守りたい", "R2"],
  ["研究で誰かの役に立ちたい", "I2"],
  ["作品で人を元気にしたい", "A2"],
  ["心に寄りそいたい", "S2"],
  ["世の中の困りごとを解決したい", "E2"],
  ["みんなを裏で支えたい", "C2"],
];

/** 第1階層に順に割り当てる色。子・孫タグは親の色を受け継ぐ */
const PALETTE = ["#5b7fa6", "#6a9a7b", "#8a7aa8", "#b97a8c", "#c19a5b", "#5a9a9a", "#b8735e", "#6f8596", "#8e9a5e", "#9a7f9e"];

export type TagNode = {
  id: string;
  name: string;
  w: Weights;
  color: string;
  depth: number;
  round: RoundKey;
  parentId: string | null;
  /** 第1階層の祖先の名前（第1階層なら自分の名前）。タグの名前は重複しないので、木を見分けるのに使う */
  root: string;
  children: TagNode[];
  /** 自由記述から作ったタグか（freeTag）。点は付かず、必要な数にも数えない（上限には数える） */
  free?: boolean;
};

function parseWeights(s: string): Weights {
  const w: Weights = {};
  for (const [, code, value] of s.matchAll(/([RIASEC])(\d)/g)) {
    if (code && (ORDER as readonly string[]).includes(code)) w[code as TypeCode] = Number(value);
  }
  return w;
}

/** id → タグ */
export const NODES: Record<string, TagNode> = {};
let seq = 0;

function build(list: readonly RawTag[], round: RoundKey, parent: TagNode | null): TagNode[] {
  return list.map(([name, weights, kids], i) => {
    const node: TagNode = {
      id: `t${seq++}`,
      name,
      w: parseWeights(weights),
      color: parent?.color ?? PALETTE[i % PALETTE.length] ?? "#5b7fa6",
      depth: parent ? parent.depth + 1 : 0,
      round,
      parentId: parent?.id ?? null,
      root: parent?.root ?? name,
      children: [],
    };
    NODES[node.id] = node;
    node.children = kids ? build(kids, round, node) : [];
    return node;
  });
}

export type Round = {
  key: RoundKey;
  /** 進み具合に出す短い名前 */
  label: string;
  title: string;
  lead: string;
  /** 次へ進むのに必要な数 */
  min: number;
  /** 選べる数の上限。null は上限なし */
  max: number | null;
  /** 自由記述の入力欄に出す例。null なら入力欄を出さない。自由記述は必要な数には数えないが、上限には数える */
  freeText: string | null;
  /** 第1階層のタグ */
  roots: TagNode[];
};

/**
 * 4回の質問。この順に聞く。
 * 好きな関わり方は5個まで（最大10点）。得意なこと・大事にしたいことは、API が受け取る数（services/api の MAX_SELF_TAGS）と
 * 同じ3個まで（最大6点ずつ）。自由記述もこの3個に数える。
 */
export const ROUNDS: readonly Round[] = [
  {
    key: "thing",
    label: "好きなもの",
    title: "好きなものは？",
    lead: "興味があるものを選んでください",
    min: 3,
    max: null,
    freeText: null,
    roots: build(THINGS, "thing", null),
  },
  {
    key: "way",
    label: "好きな関わり方",
    title: "どんな風に取り組みたい？",
    lead: "好きなものにどう関わりたい",
    min: 3,
    // 上限なしだと、この回の点（1個2点）が得意なこと・大事にしたいこと（最大6点ずつ）を押し流すので、5個まで
    max: 5,
    freeText: null,
    roots: build(WAYS, "way", null),
  },
  {
    key: "good",
    label: "得意なこと",
    title: "得意なことは？",
    lead: "人からほめられたことや、自分でできると思うことを選びます",
    min: 1,
    max: 3,
    freeText: "例：初対面の人ともすぐ話せる",
    roots: build(GOOD, "good", null),
  },
  {
    key: "value",
    label: "大事にしたいこと",
    title: "大事にしたいことは？",
    lead: "あなたの理想を教えてください",
    min: 1,
    max: 3,
    freeText: "例：家族との時間を大切にしたい",
    roots: build(VALUE, "value", null),
  },
];

/** 1回目（好きなもの）の第1階層のタグ */
export const ROOTS: TagNode[] = ROUNDS[0]?.roots ?? [];

/** その回で選んだタグだけ */
export const tagsOf = (tags: readonly TagNode[], round: RoundKey): TagNode[] =>
  tags.filter((node) => node.round === round);

/** 「好きなこと」のタグ（好きなもの と 好きな関わり方）。API に「好きなこと」（interests）として送る */
export const likeTags = (tags: readonly TagNode[]): TagNode[] =>
  tags.filter((node) => node.round === "thing" || node.round === "way");

/**
 * Gemini に「好きなこと」として送る名前を、上限まで。選んだ順ではなく、
 * 好きな関わり方 → 好きなもの（第1階層）→ 詳しいタグ の順に並べてから切る。
 * 好きなものと詳しいタグをたくさん選んでも、関わり方が切り落とされないようにするため。
 */
export function interestNames(tags: readonly TagNode[], max: number): string[] {
  const likes = likeTags(tags);
  const rank = (node: TagNode) => (node.round === "way" ? 0 : node.depth === 0 ? 1 : 2);
  const ordered = likes.map((node, i) => ({ node, i })).sort((a, b) => rank(a.node) - rank(b.node) || a.i - b.i);
  return [...new Set(ordered.map(({ node }) => node.name))].slice(0, max);
}

/** 「好きなもの」のタグだけ。職業カードのタグとして使う */
export const thingTags = (tags: readonly TagNode[]): TagNode[] => tagsOf(tags, "thing");

/** 自由記述の長さの上限（services/api の TagName と同じ20字） */
export const FREE_TEXT_MAX = 20;

/**
 * 自由記述を、API がタグの名前として受け付ける形（文字・数字・「・」「ー」「（）」だけ、20字まで）にそろえる。
 * 句読点や空白などは「・」に置きかえる。空なら空文字。
 */
export function cleanFreeText(text: string): string {
  return text
    .replace(/[^\p{L}\p{Nd}_・ー（）]+/gu, "・")
    .replace(/^・+|・+$/g, "")
    .slice(0, FREE_TEXT_MAX)
    .replace(/・+$/, "");
}

/** 自由記述から、その回のタグを作る。空なら null。点は付けない */
export function freeTag(round: RoundKey, text: string): TagNode | null {
  const name = cleanFreeText(text);
  if (!name) return null;
  return { id: `free-${round}`, name, w: {}, color: "#7a8494", depth: 0, round, parentId: null, root: name, children: [], free: true };
}

/** そのタグと子孫の id */
export function withDescendants(node: TagNode): string[] {
  return [node.id, ...node.children.flatMap(withDescendants)];
}
