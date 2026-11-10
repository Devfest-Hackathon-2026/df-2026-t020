// 業界地図の業界。年収や将来性は載せない（職業カードの方針に合わせる）。
// 15業界は、一言（description）と、その業界の代表的な仕事（jobIds）を、職業データ（job tag と O*NET）から取った。
// jobIds は job tag の職業の番号（job tag のページの URL の末尾の数字）で、職業カード（public/data/occupation_cards.json）の id と同じ。
// 残りの6業界は、15業界に収まらない職業のまとまりから足した。代表的な仕事は決めていないので jobIds は空にし、
// 仕事はすべて AI の振り分けから引く。
// それ以外の職業カードの業界は data/industryOccupations.json（AI の振り分けの下書き）にある。
// 業界ページは、この2つから職業カードを引き、区別せずに1つの一覧に出す（data/industryJobs.ts）。

export type Industry = {
  slug: string;
  name: string;
  /** どんなことをしている業界か（一言） */
  description: string;
  /** この業界の代表的な仕事の、job tag の職業の番号（＝職業カードの id） */
  jobIds: number[];
  /** 業界ではなく「どの業界にもある仕事」のまとまり */
  common?: true;
};

export const industries: Industry[] = [
  {
    slug: "agriculture",
    name: "農業・林業・漁業",
    description: "お米や野菜、木材、魚など、食べ物と自然の恵みを育てて届ける業界",
    // 稲作農業者 / 農業技術者
    jobIds: [504, 221],
  },
  {
    slug: "construction",
    name: "建設",
    description: "家やビル、道路や橋など、まちの形をつくる業界",
    // 建築設計技術者 / 建築施工管理技術者 / 電気工事士 / 太陽光発電の設計・施工
    jobIds: [20, 21, 46, 235],
  },
  {
    slug: "manufacturing",
    name: "ものづくり(メーカー)",
    description: "車や家電、食品、薬など、身の回りの「モノ」を設計してつくる業界",
    // 自動車技術者 / 自動運転開発エンジニア
    jobIds: [270, 528],
  },
  {
    slug: "energy",
    name: "エネルギー・水道",
    description: "電気・ガス・水を、毎日止まらずに家や会社へ届ける業界",
    // 電気工事士 / 発電所運転管理 / 太陽光発電の設計・施工
    jobIds: [46, 302, 235],
  },
  {
    slug: "environment",
    name: "環境・リサイクル",
    description: "ごみを処理して再利用したり、汚れた水や土をきれいにしたりして、自然と資源を守る業界",
    jobIds: [],
  },
  {
    slug: "it-media",
    name: "IT・通信・メディア",
    description: "アプリやネットの仕組み、ニュースや番組、ゲームをつくって届ける業界",
    // 自動運転開発エンジニア / プログラマー / データサイエンティスト / ゲームクリエーター / 新聞記者 / 翻訳者
    jobIds: [528, 313, 323, 330, 208, 87],
  },
  {
    slug: "logistics",
    name: "運輸・物流",
    description: "人やモノをトラック・鉄道・船・飛行機で運ぶ業界",
    // トラックドライバー / パイロット
    jobIds: [477, 189],
  },
  {
    slug: "repair",
    name: "整備・修理",
    description: "車やバイク、機械、家電などを点検・修理して、安全に長く使えるようにする業界",
    jobIds: [],
  },
  {
    slug: "trading-retail",
    name: "商社・お店",
    description: "世界や国内からモノを仕入れ、必要な会社やお客さんに売る業界",
    // 商社営業 / スーパー店長
    jobIds: [58, 55],
  },
  {
    slug: "fashion",
    name: "ファッション",
    description: "服や靴、バッグ、アクセサリーをデザインしてつくり、届ける業界",
    jobIds: [],
  },
  {
    slug: "finance",
    name: "金融・保険",
    description: "お金を預かる・貸す・増やすことや、もしもの備えを支える業界",
    // データサイエンティスト / 銀行・信用金庫の渉外担当 / ファイナンシャル・プランナー
    jobIds: [323, 454, 82],
  },
  {
    slug: "real-estate",
    name: "不動産",
    description: "家や土地、ビルを売る・貸す・管理する業界",
    // 住宅・不動産営業 / 不動産鑑定士
    jobIds: [59, 93],
  },
  {
    slug: "security",
    name: "警備・ビルメンテナンス",
    description: "建物やイベント会場を警備し、清掃や点検をして、安全で快適に保つ業界",
    jobIds: [],
  },
  {
    slug: "professional",
    name: "研究・専門サービス",
    description: "研究、法律、翻訳など、専門の知識そのものを仕事にする業界",
    // 農業技術者 / データサイエンティスト / 不動産鑑定士 / 翻訳者 / 通訳者 / 弁護士 / 医学研究者 / 大学教員
    jobIds: [221, 323, 93, 87, 88, 89, 390, 184],
  },
  {
    slug: "hospitality",
    name: "ホテル・飲食",
    description: "泊まる場所と食事で、人をもてなす業界",
    // ホテル・旅館のフロント / 西洋料理調理人（コック） / 通訳ガイド
    jobIds: [414, 99, 114],
  },
  {
    slug: "lifestyle",
    name: "旅行・美容・くらしのサービス",
    description: "旅行、美容、冠婚葬祭、娯楽など、毎日を楽しく整える業界",
    // 旅行会社カウンター係 / 通訳ガイド / 美容師
    jobIds: [109, 114, 116],
  },
  {
    slug: "entertainment",
    name: "エンタメ・スポーツ・芸術",
    description: "音楽や演劇、スポーツ、絵や工芸などで、人を楽しませたり感動させたりする業界",
    jobIds: [],
  },
  {
    slug: "animals",
    name: "動物・ペット",
    description: "ペットや動物の健康と暮らしを支え、動物とふれあえる場をつくる業界",
    jobIds: [],
  },
  {
    slug: "education",
    name: "教育",
    description: "学校や塾、大学で、人が学び育つのを支える業界",
    // 高等学校教員 / 大学教員
    jobIds: [183, 184],
  },
  {
    slug: "healthcare",
    name: "医療・福祉",
    description: "病気やけがを治し、お年寄りや支えが必要な人の生活を助ける業界",
    // 医学研究者 / 看護師 / 内科医 / 理学療法士 / 介護職員（施設介護員） / 保健師
    jobIds: [390, 156, 404, 167, 134, 160],
  },
  {
    slug: "public-service",
    name: "公務・国際",
    description: "国や市町村、国際機関で、社会のルールやしくみを動かす業界",
    // 通訳者 / 保健師 / 地方公務員（行政事務） / 外交官（外務公務員） / 国際公務員
    jobIds: [88, 160, 139, 150, 151],
  },
  {
    slug: "common",
    name: "どの業界にもある仕事",
    description: "事務・経理・人事・企画など、どの業界の会社や団体にもある仕事",
    jobIds: [],
    common: true,
  },
];
