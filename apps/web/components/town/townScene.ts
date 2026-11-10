// 仕事の街を PixiJS で描き、操作を受け付ける。React からは createTownScene だけを呼ぶ。
// pixi.js と pixi-viewport はブラウザでだけ読み込む（静的書き出しのビルドで読まない）。
import type { Container, Graphics, Text, Texture } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { DISTRICTS, FLAT_KINDS, signHeight, TOWN_H, TOWN_W, type DistrictId, type TownData, type TownPerson } from "@/data/townModel";
import { buildAmbient, drawGround } from "./ambient";
import { buildingDepth, drawBuilding, type Spinner } from "./draw";
import { drawPerson, personHitArea } from "./people";
import { iso, rng, unIso, WORLD_H, WORLD_W } from "./iso";

/** キャラクターの大きさ（people.ts の図の倍率） */
const PERSON_SCALE = 1.2;
/** 名札を出す拡大率（これより引くと名札は出さない） */
const TAG_SCALE = 0.7;
/** まだ出会っていない人の「？」を出す拡大率。名札より寄ってから、まばらに出す */
const MYSTERY_SCALE = 0.9;
/** 「？」1つが場所を取る広さ（画面の px）。この中には、ほかの「？」も名札も出さない */
const MYSTERY_ROOM = { w: 96, h: 64 };
/** これより引いて見ているときに街を押すと、押した区画の全体が見えるところまで寄る */
const OVERVIEW_SCALE = 0.5;
/** 街を押して寄るときの、1回の倍率と、寄る上限 */
const CLICK_ZOOM = 1.7;
const CLICK_MAX_SCALE = 1.5;
/** 選んだ人を描く順（どの建物よりも手前） */
const SELECTED_DEPTH = 1e6;
/** 人を押したとき・人へ飛ぶときに、ここまでは寄る */
const PERSON_SCALE_MIN = 1.05;
/** 区画の名前を出す拡大率（これより寄ると消す） */
const LABEL_SCALE = 0.95;
/** 建物の看板（分野の名前）を出す拡大率と、引いて見ているときに看板を大きくする上限 */
const SIGN_SCALE = 0.5;
const SIGN_GROW = 1.7;

/** 人を描く順（奥から手前）。船の上の人は、船より手前になるように data/town.ts が depth を決めている */
const depthOf = (person: TownPerson) => person.depth ?? person.x + person.y + 0.5;

export type TownController = {
  /** 当てはまる人だけを光らせる（null で全員を元に戻す） */
  setHighlight: (match: ((p: TownPerson) => boolean) | null) => void;
  /** 区画へ飛ぶ */
  flyTo: (district: DistrictId) => void;
  /** 人へ飛ぶ */
  focus: (id: number) => void;
  /** いま見ている真ん中のまま、拡大・縮小する（factor > 1 で拡大） */
  zoomBy: (factor: number) => void;
  /** 街の全体を見せる */
  showAll: () => void;
  /** 出会った仕事（名札を「？」から職業名にする） */
  setMet: (ids: ReadonlySet<number>) => void;
  setSelected: (id: number | null) => void;
  /** 画面の左右に重ねているカードの幅（px）。飛ぶときは、その分をよけて真ん中に置く */
  setInsets: (left: number, right: number) => void;
  destroy: () => void;
};

/** 建物の上の看板。x・y は吹き出しの先（街の座標）、w・h は等倍のときの大きさ */
type SignView = { c: Container; x: number; y: number; w: number; h: number; people: number; shown: boolean };

type PersonView = {
  person: TownPerson;
  root: Container;
  baseY: number;
  phase: number;
  ring: Graphics;
  pick: Graphics;
  bubble: Container;
  tag?: Container;
  tagText?: Text;
  /** 光らせたときに頭上に立てるピン（引いて見ても同じ大きさ） */
  beacon?: Graphics;
  /** 名札・「？」を出す順（小さいほど先）。場所ではなく id から決めて、街の中でかたよらないようにする */
  order: number;
  /** いまの拡大率で、名札か「？」を出す人か（重なる分は出さない。layoutLabels が決める） */
  labeled: boolean;
};

export async function createTownScene(
  host: HTMLElement,
  data: TownData,
  handlers: { onSelect: (id: number) => void; met: ReadonlySet<number>; insets: { left: number; right: number } },
): Promise<TownController> {
  const PIXI = await import("pixi.js");
  const { Viewport: ViewportClass } = await import("pixi-viewport");
  const { Application, Container, Graphics, Text, Sprite, Rectangle } = PIXI;

  const app = new Application();
  await app.init({
    resizeTo: host,
    background: 0x9fd3e3,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  host.appendChild(app.canvas);
  app.canvas.setAttribute("aria-hidden", "true");

  const font = getComputedStyle(document.body).fontFamily || "sans-serif";

  const viewport: Viewport = new ViewportClass({
    screenWidth: host.clientWidth,
    screenHeight: host.clientHeight,
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    events: app.renderer.events,
    passiveWheel: false,
    ignoreWheelFromOtherElements: true,
  });
  app.stage.addChild(viewport);
  viewport
    .drag()
    .pinch()
    .wheel({ smooth: 4 })
    .decelerate({ friction: 0.92 })
    .clampZoom({ minScale: 0.16, maxScale: 2.6 })
    .clamp({ left: -400, right: WORLD_W + 400, top: -300, bottom: WORLD_H + 300, underflow: "center" });

  // ---- 地面：海の波、島、道、区画 ----
  const ground = new Graphics();
  viewport.addChild(ground);
  const waves = rngWaves();
  for (const [wx, wy] of waves) ground.moveTo(wx, wy).quadraticCurveTo(wx + 10, wy - 6, wx + 20, wy).quadraticCurveTo(wx + 30, wy + 6, wx + 40, wy).stroke({ width: 2, color: 0xc4e6f0 });

  const e = 1.6;
  const I = [iso(-e, -e), iso(TOWN_W + e, -e), iso(TOWN_W + e, TOWN_H + e), iso(-e, TOWN_H + e)] as const;
  const cliff = 22;
  ground.poly([I[3].x, I[3].y, I[2].x, I[2].y, I[2].x, I[2].y + cliff, I[3].x, I[3].y + cliff]).fill(0xbfa77a);
  ground.poly([I[2].x, I[2].y, I[1].x, I[1].y, I[1].x, I[1].y + cliff, I[2].x, I[2].y + cliff]).fill(0xa98f63);
  ground.poly(I.flatMap((p) => [p.x, p.y])).fill(0xeadfbf);
  drawGround(ground);

  // ---- 建物と人（奥から手前の順に重ねる） ----
  const flats = new Graphics();
  viewport.addChild(flats);
  const objects = new Container();
  objects.sortableChildren = true;
  viewport.addChild(objects);
  const spinners: Spinner[] = [];

  for (const b of data.buildings) {
    if (FLAT_KINDS.has(b.kind)) {
      drawBuilding(flats, b, () => new Graphics());
      continue;
    }
    const g = new Graphics();
    g.zIndex = buildingDepth(b);
    const parts: Graphics[] = [];
    const s = drawBuilding(g, b, () => {
      const part = new Graphics();
      parts.push(part);
      return part;
    });
    const holder = new Container();
    holder.zIndex = g.zIndex;
    holder.addChild(g, ...parts);
    objects.addChild(holder);
    spinners.push(...s);
  }

  // 「？」の吹き出し（全員で同じ絵を使う）
  const bubbleTexture: Texture = (() => {
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 18, 16, 8).fill(0xffffff).stroke({ width: 1, color: 0xb4b2a9 });
    bg.poly([7, 15.5, 11, 15.5, 9, 19]).fill(0xffffff);
    const q = new Text({ text: "？", style: { fontFamily: font, fontSize: 12, fontWeight: "800", fill: 0x6b6862 } });
    q.anchor.set(0.5);
    q.position.set(9, 8.5);
    c.addChild(bg, q);
    return app.renderer.generateTexture({ target: c, resolution: 3 });
  })();

  const views: PersonView[] = [];
  const byId = new Map<number, PersonView>();
  let met = new Set(handlers.met);
  let selected: number | null = null;
  let highlight: ((p: TownPerson) => boolean) | null = null;
  /** ポインターが乗っている人（名札か「？」を必ず出す） */
  let hovered: number | null = null;
  const personRoots = new Set<Container>();
  let insets = { ...handlers.insets };
  /** 動きを減らす設定のときは、飛ぶ動きを付けずにすぐ移る */
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const duration = (ms: number) => (reduced.matches ? 1 : ms);
  /** 重ねたカードをよけた、見えている部分の真ん中に (x, y) が来る中心 */
  const centerFor = (x: number, y: number, scale: number) => ({ x: x - (insets.left - insets.right) / 2 / scale, y });

  for (const person of data.people) {
    const foot = iso(person.x, person.y);
    // 船の甲板に立つ人は、その高さの分だけ上に描く
    const p = { x: foot.x, y: foot.y - (person.lift ?? 0) };
    const root = new Container();
    root.position.set(p.x, p.y);
    root.zIndex = depthOf(person);
    const ring = new Graphics();
    ring.ellipse(0, 0, 13, 6.5).fill({ color: 0xffd23f, alpha: 0.85 }).stroke({ width: 2, color: 0xf0a500 });
    ring.visible = false;
    const pick = new Graphics();
    pick.ellipse(0, 0, 14, 7).stroke({ width: 3, color: 0xd6453d });
    pick.visible = false;
    const body = new Graphics();
    drawPerson(body, person.look);
    const bubble = new Sprite(bubbleTexture);
    bubble.anchor.set(0.5, 1);
    bubble.position.set(0, -44);
    bubble.visible = false;
    root.addChild(ring, pick, body, bubble);
    root.eventMode = "static";
    root.cursor = "pointer";
    const hit = personHitArea(person.look);
    body.scale.set(PERSON_SCALE);
    ring.scale.set(PERSON_SCALE);
    pick.scale.set(PERSON_SCALE);
    root.hitArea = new Rectangle(hit.x * PERSON_SCALE, hit.y * PERSON_SCALE, hit.w * PERSON_SCALE, hit.h * PERSON_SCALE);
    root.on("pointertap", () => handlers.onSelect(person.id));
    root.on("pointerover", () => {
      root.scale.set(1.12);
      hovered = person.id;
      queueLod();
    });
    root.on("pointerout", () => {
      root.scale.set(1);
      if (hovered === person.id) hovered = null;
      queueLod();
    });
    objects.addChild(root);
    const view: PersonView = {
      person,
      root,
      baseY: p.y,
      phase: (person.id % 97) / 97 * Math.PI * 2,
      ring,
      pick,
      bubble,
      order: Math.imul(person.id + 1, 0x9e3779b1) >>> 0,
      labeled: false,
    };
    views.push(view);
    byId.set(person.id, view);
    personRoots.add(root);
  }
  /** 名札・「？」を置いていく順（layoutLabels がこの順に、空いていれば置く） */
  const labelOrder = [...views].sort((a, b) => a.order - b.order);

  // ---- にぎわい（街灯・街路樹・車・電車・船・飛行機・雲） ----
  const sky = new Container();
  viewport.addChild(sky);
  const ambient = buildAmbient({ Graphics, Container }, objects, sky, data.buildings);

  // ---- 看板：その仕事が集まる建物の上に、分野の名前を出す ----
  const signs = new Container();
  viewport.addChild(signs);
  const groupPeople = new Map<string, number>();
  for (const person of data.people) groupPeople.set(person.group, (groupPeople.get(person.group) ?? 0) + 1);
  const signViews: SignView[] = [];
  for (const b of data.buildings) {
    if (!b.label) continue;
    const p = iso(b.x + b.w / 2, b.y + b.d / 2);
    const y = p.y - signHeight(b.kind, rng(b.seed)());
    const c = new Container();
    const t = new Text({ text: b.label, style: { fontFamily: font, fontSize: 11, fontWeight: "800", fill: 0xffffff }, resolution: 2 });
    t.anchor.set(0.5, 1);
    t.position.set(0, -8);
    const w = t.width + 14;
    const h = t.height + 11;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h, w, h - 5, 5).fill({ color: 0x3a3530, alpha: 0.92 });
    bg.poly([-4.5, -5.5, 4.5, -5.5, 0, 0]).fill({ color: 0x3a3530, alpha: 0.92 });
    c.addChild(bg, t);
    c.position.set(p.x, y);
    c.visible = false;
    signs.addChild(c);
    signViews.push({ c, x: p.x, y, w, h, people: groupPeople.get(b.label) ?? 0, shown: false });
  }
  // 人の多い分野の看板から、場所を取る
  signViews.sort((a, b) => b.people - a.people);

  // ---- 名札と区画の名前（建物より手前に出す） ----
  const tags = new Container();
  viewport.addChild(tags);
  const labels = new Container();
  viewport.addChild(labels);
  const labelViews: Container[] = [];
  for (const district of DISTRICTS) {
    const [x, y, w, d] = district.rect;
    const c = iso(x + w / 2, y + d / 2);
    const text = new Text({
      text: district.name,
      style: { fontFamily: font, fontSize: 22, fontWeight: "800", fill: 0x2f2b26, stroke: { color: 0xffffff, width: 6, join: "round" } },
      resolution: 2,
    });
    text.anchor.set(0.5);
    text.position.set(c.x, c.y);
    labels.addChild(text);
    labelViews.push(text);
  }

  const beacons = new Container();
  viewport.addChild(beacons);
  function ensureBeacon(v: PersonView) {
    if (v.beacon) return v.beacon;
    const g = new Graphics();
    g.poly([-5.5, -13, 5.5, -13, 0, 0]).fill(0xf0a500);
    g.circle(0, -17, 8.5).fill(0xffc93c).stroke({ width: 2, color: 0x9a6a00 });
    g.circle(0, -17, 3.2).fill(0xffffff);
    g.position.set(v.root.x, v.baseY - 48);
    beacons.addChild(g);
    v.beacon = g;
    return g;
  }

  const tagLabel = (v: PersonView) => (v.person.known || met.has(v.person.id) ? v.person.name : "？");

  function ensureTag(v: PersonView) {
    if (v.tag) return v.tag;
    const c = new Container();
    const t = new Text({ text: tagLabel(v), style: { fontFamily: font, fontSize: 12, fontWeight: "700", fill: 0x2f2b26 }, resolution: 2 });
    t.anchor.set(0.5, 1);
    const bg = new Graphics();
    c.addChild(bg, t);
    c.position.set(v.root.x, v.baseY - 50);
    tags.addChild(c);
    v.tag = c;
    v.tagText = t;
    redrawTag(v);
    return c;
  }

  function redrawTag(v: PersonView) {
    if (!v.tag || !v.tagText) return;
    v.tagText.text = tagLabel(v);
    const bg = v.tag.children[0] as Graphics;
    const w = v.tagText.width + 12;
    bg.clear().roundRect(-w / 2, -v.tagText.height - 3, w, v.tagText.height + 4, 7).fill(0xffffff).stroke({ width: 1, color: 0xc9c4ba });
  }

  // ---- 名札と「？」を、重ならない分だけ出す ----
  // 全員に出すと「？」が画面を埋めるので、出す順（選んだ人 → 出会った仕事 → よく知られた仕事 → 「？」）に、
  // 空いている場所にだけ置く。街の座標で決めるので、動かしても同じ人に出たままになる（拡大率が変わったときだけ決め直す）。
  const isNamed = (v: PersonView) => v.person.known || met.has(v.person.id);
  /** 名札の下の端。光らせているときは、頭上のピンの上に出す */
  const tagBottom = (v: PersonView, inv: number) => v.baseY - 50 - (highlight === null ? 0 : 27 * Math.min(inv, 4) * 0.9);
  let labelsFor = -1;
  let labelsDirty = true;
  function layoutLabels(scale: number) {
    labelsFor = scale;
    labelsDirty = false;
    for (const v of views) v.labeled = false;
    for (const s of signViews) s.shown = false;
    if (scale < SIGN_SCALE) return;
    const inv = 1 / scale;
    const tagScale = Math.min(inv, 1.3);
    const cell = 120 * inv;
    const grid = new Map<number, [number, number, number, number][]>();
    const key = (cx: number, cy: number) => cx * 4096 + cy;
    /** (x0, y0)-(x1, y1) がどの名札とも重ならなければ、そこを取って true を返す */
    const take = (x0: number, y0: number, x1: number, y1: number) => {
      const cx0 = Math.floor(x0 / cell);
      const cx1 = Math.floor(x1 / cell);
      const cy0 = Math.floor(y0 / cell);
      const cy1 = Math.floor(y1 / cell);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          for (const [a0, b0, a1, b1] of grid.get(key(cx, cy)) ?? []) {
            if (x0 < a1 && a0 < x1 && y0 < b1 && b0 < y1) return false;
          }
        }
      }
      const box: [number, number, number, number] = [x0, y0, x1, y1];
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const k = key(cx, cy);
          const list = grid.get(k);
          if (list) list.push(box);
          else grid.set(k, [box]);
        }
      }
      return true;
    };
    const place = (v: PersonView) => {
      if (v.labeled) return;
      if (highlight !== null && !highlight(v.person)) return;
      if (isNamed(v)) {
        // 名札の大きさ（文字数から見積もる）に、まわりの余白を足す
        const w = (v.person.name.length * 12 + 12) * tagScale + 8 * inv;
        const h = 20 * tagScale + 6 * inv;
        const bottom = tagBottom(v, inv);
        v.labeled = take(v.root.x - w / 2, bottom - h, v.root.x + w / 2, bottom);
      } else if (highlight === null && scale >= MYSTERY_SCALE) {
        // 光らせているときは、頭上のピンが目印になるので「？」は出さない
        const w = MYSTERY_ROOM.w * inv;
        const h = MYSTERY_ROOM.h * inv;
        const bottom = v.baseY - 44;
        v.labeled = take(v.root.x - w / 2, bottom - h, v.root.x + w / 2, bottom);
      }
    };
    const named = scale >= TAG_SCALE;
    const chosen = selected === null ? undefined : byId.get(selected);
    if (chosen && named) place(chosen);
    // 区画の名前が出ているうちは、その場所を空けておく
    if (scale < LABEL_SCALE) {
      const k = Math.min(inv * 0.85, 4.2);
      for (const district of DISTRICTS) {
        const [x, y, w, d] = district.rect;
        const c = iso(x + w / 2, y + d / 2);
        take(c.x - (district.name.length * 11 + 8) * k, c.y - 16 * k, c.x + (district.name.length * 11 + 8) * k, c.y + 16 * k);
      }
    }
    const grow = Math.min(inv, SIGN_GROW);
    for (const s of signViews) {
      const w = s.w * grow + 6 * inv;
      s.shown = take(s.x - w / 2, s.y - s.h * grow - 3 * inv, s.x + w / 2, s.y);
    }
    if (!named) return;
    for (const v of labelOrder) if (met.has(v.person.id)) place(v);
    for (const v of labelOrder) if (v.person.known) place(v);
    for (const v of labelOrder) place(v);
  }

  // ---- 拡大率と見えている範囲に合わせて、名札と区画の名前を出し分ける ----
  let lodQueued = false;
  /** 街を片付けたあと（予約済みの描き直しが動いても、何もしない） */
  let destroyed = false;
  function updateLod() {
    lodQueued = false;
    if (destroyed) return;
    const scale = viewport.scale.x;
    const bounds = viewport.getVisibleBounds();
    const inv = 1 / scale;
    if (labelsDirty || Math.abs(scale / labelsFor - 1) > 0.04) layoutLabels(scale);
    for (const v of views) {
      const inView = bounds.contains(v.root.x, v.baseY);
      // ポインターが乗っている人には、拡大率に関係なく出す
      const show = inView && (v.labeled || v.person.id === hovered);
      const named = isNamed(v);
      if (show && named) {
        const tag = ensureTag(v);
        tag.visible = true;
        tag.scale.set(Math.min(inv, 1.3));
        tag.y = tagBottom(v, inv);
      } else if (v.tag) {
        v.tag.visible = false;
      }
      v.bubble.visible = show && !named;
      // 「？」は、引いて見ていても読める大きさにする
      if (v.bubble.visible) v.bubble.scale.set(Math.min(Math.max(inv, 0.75), 1.4));
    }
    for (const v of views) if (v.beacon?.visible) v.beacon.scale.set(Math.min(inv, 4) * 0.9);
    for (const s of signViews) {
      s.c.visible = s.shown && bounds.contains(s.x, s.y);
      if (s.c.visible) s.c.scale.set(Math.min(inv, SIGN_GROW));
    }
    const labelAlpha = scale >= LABEL_SCALE ? 0 : Math.min(1, (LABEL_SCALE - scale) / 0.25);
    for (const label of labelViews) {
      label.alpha = labelAlpha;
      label.visible = labelAlpha > 0;
      label.scale.set(Math.min(inv * 0.85, 4.2));
    }
  }
  function queueLod() {
    if (lodQueued) return;
    lodQueued = true;
    requestAnimationFrame(updateLod);
  }
  viewport.on("moved", queueLod);
  viewport.on("zoomed", queueLod);

  // ---- 飛ぶ・寄る ----
  const availWidth = () => Math.max(200, host.clientWidth - insets.left - insets.right);
  const fly = (x: number, y: number, scale: number, ms: number) =>
    viewport.animate({ position: centerFor(x, y, scale), scale, time: duration(ms), ease: "easeInOutSine", removeOnInterrupt: true });
  /** 街の全体が、左右のカードをよけて入る拡大率 */
  const overviewScale = () => Math.min(availWidth() / (WORLD_W * 0.86), host.clientHeight / (WORLD_H * 0.86));

  function flyToDistrict(id: DistrictId) {
    const district = DISTRICTS.find((dd) => dd.id === id);
    if (!district) return;
    const [x, y, w, d] = district.rect;
    const c = iso(x + w / 2, y + d / 2);
    const span = Math.max((w + d) * 32, 600);
    // 名札が出る倍率までは寄る
    fly(c.x, c.y, Math.min(1.1, Math.max(TAG_SCALE + 0.05, availWidth() / span)), 700);
  }

  // 街（人ではないところ）を押したら、そこへ寄る。
  // 引いて全体を見ているときは、押した区画の全体が見えるところまで。それより寄っているときは、押した場所を真ん中にして一段寄る
  viewport.on("clicked", (e) => {
    for (let t = e.event.target as Container | null; t; t = t.parent) if (personRoots.has(t)) return;
    const scale = viewport.scale.x;
    if (scale < OVERVIEW_SCALE) {
      const tile = unIso(e.world.x, e.world.y);
      const district = DISTRICTS.find(({ rect: [x, y, w, d] }) => tile.x >= x && tile.x < x + w && tile.y >= y && tile.y < y + d);
      if (district) {
        flyToDistrict(district.id);
        return;
      }
    }
    const next = Math.max(scale, Math.min(CLICK_MAX_SCALE, Math.max(scale * CLICK_ZOOM, TAG_SCALE + 0.05)));
    fly(e.world.x, e.world.y, next, 450);
  });

  // ---- 動き：人が小さく弾む、風車と観覧車が回る ----
  let time = 0;
  app.ticker.add((ticker) => {
    time += ticker.deltaMS / 1000;
    for (const s of spinners) s.g.rotation += s.speed * (ticker.deltaMS / 1000);
    ambient.update(Math.min(ticker.deltaMS / 1000, 0.1), viewport.scale.x);
    if (viewport.scale.x < 0.45) return;
    const bounds = viewport.getVisibleBounds();
    for (const v of views) {
      if (!bounds.contains(v.root.x, v.baseY)) continue;
      v.root.y = v.baseY - Math.abs(Math.sin(time * 2.2 + v.phase)) * 1.6;
    }
  });

  // ---- 大きさが変わったとき ----
  const onResize = () => {
    viewport.resize(host.clientWidth, host.clientHeight, WORLD_W, WORLD_H);
    queueLod();
  };
  app.renderer.on("resize", onResize);

  // 最初は街の全体を、左右のカードをよけて見せる
  {
    const scale = overviewScale();
    viewport.setZoom(scale, true);
    const c = centerFor(WORLD_W / 2, WORLD_H / 2 + 60, scale);
    viewport.moveCenter(c.x, c.y);
  }
  updateLod();

  const applyHighlight = () => {
    for (const v of views) {
      const on = highlight !== null && highlight(v.person);
      v.ring.visible = on;
      v.root.alpha = highlight === null || on ? 1 : 0.22;
      if (on) ensureBeacon(v).visible = true;
      else if (v.beacon) v.beacon.visible = false;
    }
    labelsDirty = true;
    queueLod();
  };

  return {
    setHighlight(match) {
      highlight = match;
      applyHighlight();
    },
    flyTo: flyToDistrict,
    focus(id) {
      const v = byId.get(id);
      if (!v) return;
      fly(v.root.x, v.baseY - 20, Math.max(viewport.scale.x, PERSON_SCALE_MIN), 600);
    },
    zoomBy(factor) {
      const scale = Math.min(2.6, Math.max(overviewScale() * 0.9, viewport.scale.x * factor));
      // いま見えている部分（カードをよけた分）の真ん中を、そのまま真ん中に置く
      const now = viewport.scale.x;
      const x = viewport.center.x + (insets.left - insets.right) / 2 / now;
      fly(x, viewport.center.y, scale, 300);
    },
    showAll() {
      fly(WORLD_W / 2, WORLD_H / 2 + 60, overviewScale(), 700);
    },
    setMet(ids) {
      met = new Set(ids);
      for (const v of views) redrawTag(v);
      labelsDirty = true;
      queueLod();
    },
    setInsets(left, right) {
      insets = { left, right };
    },
    setSelected(id) {
      if (selected !== null) {
        const prev = byId.get(selected);
        if (prev) {
          prev.pick.visible = false;
          prev.root.zIndex = depthOf(prev.person);
        }
      }
      selected = id;
      if (id !== null) {
        const v = byId.get(id);
        if (v) {
          v.pick.visible = true;
          // 選んだ人は、手前の建物に隠れないように、いちばん手前に描く
          v.root.zIndex = SELECTED_DEPTH;
        }
      }
      labelsDirty = true;
      queueLod();
    },
    destroy() {
      destroyed = true;
      app.renderer.off("resize", onResize);
      app.destroy({ removeView: true }, { children: true, texture: true });
    },
  };
}

/** 海の波の位置（島のまわり） */
function rngWaves(): [number, number][] {
  const out: [number, number][] = [];
  let a = 12345;
  const r = () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
  for (let i = 0; i < 160; i++) {
    const x = r() * WORLD_W;
    const y = r() * WORLD_H;
    out.push([x, y]);
  }
  return out;
}
