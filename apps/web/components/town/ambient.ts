// 街のにぎわい：道路の線・歩道・街灯・街路樹と、動くもの（車・電車・船・飛行機・雲）。
// 仕事とは関係のない遊びとして、海にクジラとイルカとヨット、空に気球と小さな飛行機もいる。
// 仕事の人とは別のものなので、押せない（eventMode は none のまま）。
import type { Container as PixiContainer, Graphics as PixiGraphics } from "pixi.js";
import { DISTRICTS, TOWN_H, TOWN_W, type TownBuilding } from "@/data/townModel";
import { HH, HW, iso, rng, shade, WORLD_W } from "./iso";

type Ctors = { Graphics: new () => PixiGraphics; Container: new () => PixiContainer };

/** タイルの向きの差 (dx, dy) を画面の差にする */
const rel = (dx: number, dy: number) => ({ x: (dx - dy) * HW, y: (dx + dy) * HH });

/** 足もとを (0, 0) にした小さな箱（車・電車・船） */
function localBox(g: PixiGraphics, lx: number, ly: number, h: number, color: number, z = 0) {
  const A = rel(-lx / 2, -ly / 2);
  const B = rel(lx / 2, -ly / 2);
  const C = rel(lx / 2, ly / 2);
  const D = rel(-lx / 2, ly / 2);
  const f = (...ps: { x: number; y: number }[]) => ps.flatMap((p) => [p.x, p.y]);
  const u = (p: { x: number; y: number }, k: number) => ({ x: p.x, y: p.y - k });
  g.poly(f(u(D, z), u(C, z), u(C, z + h), u(D, z + h))).fill(shade(color, 0.78));
  g.poly(f(u(C, z), u(B, z), u(B, z + h), u(C, z + h))).fill(shade(color, 0.92));
  g.poly(f(u(A, z + h), u(B, z + h), u(C, z + h), u(D, z + h))).fill(shade(color, 1.1));
  return { A, B, C, D };
}

/** 道の中心線（区画の境目）。島の外周は除く */
type Segment = { axis: "x" | "y"; at: number; from: number; to: number };

function roadSegments(): Segment[] {
  const seen = new Set<string>();
  const out: Segment[] = [];
  const add = (s: Segment) => {
    const onEdge = s.axis === "x" ? s.at <= 0 || s.at >= TOWN_H : s.at <= 0 || s.at >= TOWN_W;
    const key = `${s.axis}${s.at}:${s.from}-${s.to}`;
    if (onEdge || seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const { rect } of DISTRICTS) {
    const [x, y, w, d] = rect;
    add({ axis: "x", at: y, from: x, to: x + w });
    add({ axis: "x", at: y + d, from: x, to: x + w });
    add({ axis: "y", at: x, from: y, to: y + d });
    add({ axis: "y", at: x + w, from: y, to: y + d });
  }
  return out;
}

/** 地面に描くもの：道の色・歩道・区画の地面・道の中央線・線路 */
export function drawGround(ground: PixiGraphics) {
  const R = [iso(0, 0), iso(TOWN_W, 0), iso(TOWN_W, TOWN_H), iso(0, TOWN_H)] as const;
  ground.poly(R.flatMap((p) => [p.x, p.y])).fill(0x9da3a9);

  for (const district of DISTRICTS) {
    const [x, y, w, d] = district.rect;
    const quad = (k: number) => [iso(x + k, y + k), iso(x + w - k, y + k), iso(x + w - k, y + d - k), iso(x + k, y + d - k)].flatMap((p) => [p.x, p.y]);
    ground.poly(quad(0.38)).fill(0xe9e5dc);
    ground.poly(quad(0.46)).fill(0xdcd6cb);
    ground.poly(quad(0.52)).fill(0xece8e0);
    ground.poly(quad(0.92)).fill(shade(district.ground, 0.93));
    ground.poly(quad(1)).fill(district.ground);
    const alt = shade(district.ground, 0.965);
    for (let i = x + 1; i < x + w - 1; i++) {
      for (let j = y + 1; j < y + d - 1; j++) {
        if ((i + j) % 2) continue;
        const a = iso(i, j);
        const b = iso(i + 1, j);
        const c = iso(i + 1, j + 1);
        const dd = iso(i, j + 1);
        ground.poly([a.x, a.y, b.x, b.y, c.x, c.y, dd.x, dd.y]).fill(alt);
      }
    }
  }

  // 道の中央の点線
  for (const s of roadSegments()) {
    for (let t = s.from + 0.6; t < s.to - 0.6; t += 1) {
      const p = s.axis === "x" ? iso(t, s.at) : iso(s.at, t);
      const q = s.axis === "x" ? iso(t + 0.45, s.at) : iso(s.at, t + 0.45);
      ground.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1.6, color: 0xf4f1e8 });
    }
  }
  // 交差点の横断歩道
  const corners = new Set<string>();
  for (const { rect } of DISTRICTS) {
    const [x, y, w, d] = rect;
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + d], [x + w, y + d]] as const) {
      if (cx <= 0 || cy <= 0 || cx >= TOWN_W || cy >= TOWN_H) continue;
      corners.add(`${cx},${cy}`);
    }
  }
  for (const key of corners) {
    const [cx, cy] = key.split(",").map(Number) as [number, number];
    for (const [ax, ay] of [[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]] as const) {
      for (let k = -0.32; k <= 0.32; k += 0.16) {
        const along = ax !== 0;
        const p = along ? iso(cx + ax - 0.06, cy + k) : iso(cx + k, cy + ay - 0.06);
        const q = along ? iso(cx + ax + 0.06, cy + k) : iso(cx + k, cy + ay + 0.06);
        ground.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2.2, color: 0xf4f1e8 });
      }
    }
  }

  // 線路（島の奥の縁）
  const ry = -0.9;
  for (const off of [-0.12, 0.12]) {
    const p = iso(-1.4, ry + off);
    const q = iso(TOWN_W + 1.4, ry + off);
    ground.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1.4, color: 0x7a6f62 });
  }
  for (let t = -1.4; t < TOWN_W + 1.4; t += 0.35) {
    const p = iso(t, ry - 0.2);
    const q = iso(t, ry + 0.2);
    ground.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1.6, color: 0x9a8a72 });
  }
}

export type Ambient = { update: (dtSec: number, scale: number) => void };

export function buildAmbient(ctors: Ctors, objects: PixiContainer, sky: PixiContainer, buildings: TownBuilding[]): Ambient {
  const { Graphics, Container } = ctors;
  const r = rng(20261110);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)] as T;

  // ---- 街灯と街路樹（歩道に並べる） ----
  for (const { rect } of DISTRICTS) {
    const [x, y, w, d] = rect;
    const k = 0.66;
    const spots: [number, number][] = [];
    for (let t = x + 1.5; t < x + w - 1; t += 3) spots.push([t, y + k], [t, y + d - k]);
    for (let t = y + 1.5; t < y + d - 1; t += 3) spots.push([x + k, t], [x + w - k, t]);
    spots.forEach(([sx, sy], i) => {
      const g = new Graphics();
      const p = iso(sx, sy);
      g.position.set(p.x, p.y);
      if (i % 2 === 0) {
        g.ellipse(0, 0, 4, 2).fill({ color: 0x000000, alpha: 0.12 });
        g.rect(-1, -30, 2, 30).fill(0x5d6672);
        g.moveTo(0, -30).lineTo(5, -32).stroke({ width: 1.6, color: 0x5d6672 });
        g.ellipse(6, -31, 3.4, 1.8).fill(0xfff3c0).stroke({ width: 0.6, color: 0x5d6672 });
      } else {
        g.ellipse(0, 0, 8, 4).fill({ color: 0x000000, alpha: 0.12 });
        g.rect(-1.4, -12, 2.8, 12).fill(0x7a5a3a);
        const c = pick([0x6fa64a, 0x7bb35a, 0x5e9640]);
        g.circle(0, -18, 8).fill(c).circle(2.6, -20, 4.4).fill(shade(c, 1.15));
      }
      g.zIndex = sx + sy + 0.2;
      objects.addChild(g);
    });
  }

  // ---- 車（道の中心線の左右を行ったり来たり） ----
  const segments = roadSegments();
  type Car = { g: PixiGraphics; s: Segment; t: number; dir: 1 | -1; speed: number };
  const cars: Car[] = [];
  const carColors = [0xd6453d, 0x3f78c4, 0xf2c230, 0xf6f6f3, 0x2a9d8f, 0x33312e, 0xee8a3a, 0x86c1e6];
  const drawCar = (g: PixiGraphics, axis: "x" | "y", color: number) => {
    g.clear();
    const [lx, ly] = axis === "x" ? [0.62, 0.3] : [0.3, 0.62];
    g.ellipse(0, 0, 13, 6.5).fill({ color: 0x000000, alpha: 0.14 });
    localBox(g, lx, ly, 6, color, 1.5);
    localBox(g, lx * 0.55, ly * 0.85, 5, 0xcfe6f2, 7.5);
  };
  for (let i = 0; i < 46; i++) {
    const s = pick(segments);
    const g = new Graphics();
    const color = pick(carColors);
    drawCar(g, s.axis, color);
    objects.addChild(g);
    cars.push({ g, s, t: s.from + r() * (s.to - s.from), dir: r() < 0.5 ? 1 : -1, speed: 1.4 + r() * 1.2 });
  }

  // ---- 電車（島の奥の線路） ----
  const train = new Container();
  const trainCars: PixiGraphics[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new Graphics();
    localBox(g, 1.5, 0.42, 12, i === 0 ? 0x2a9d8f : 0xf6f6f3, 1);
    const side = rel(0, 0.21);
    g.rect(side.x - 22, side.y - 9.5, 44, 2.4).fill(0x2a9d8f);
    trainCars.push(g);
    train.addChild(g);
  }
  objects.addChild(train);
  let trainX = -6;

  // ---- 船（島の右手前と左手前の海） ----
  type Ship = { g: PixiGraphics; axis: "x" | "y"; at: number; t: number; dir: 1 | -1; speed: number; min: number; max: number };
  const ships: Ship[] = [];
  const shipDef: [axis: "x" | "y", at: number, min: number, max: number][] = [
    // 港に泊めた漁船と貨物船（data/town.ts の SEA_HOMES）の外側を通る
    ["y", TOWN_W + 7.5, -4, TOWN_H + 4],
    ["y", TOWN_W + 11.5, -4, TOWN_H + 4],
    ["x", TOWN_H + 3.6, -4, TOWN_W + 4],
  ];
  for (const [axis, at, min, max] of shipDef) {
    const g = new Graphics();
    const [lx, ly] = axis === "x" ? [2.2, 0.7] : [0.7, 2.2];
    localBox(g, lx, ly, 7, 0xd6453d, -2);
    localBox(g, lx * (axis === "x" ? 0.92 : 1), ly * (axis === "y" ? 0.92 : 1), 4, 0xf6f6f3, 5);
    localBox(g, lx * (axis === "x" ? 0.35 : 0.6), ly * (axis === "y" ? 0.35 : 0.6), 12, 0xf6f6f3, 9);
    const stack = rel(axis === "x" ? -0.3 : 0, axis === "y" ? -0.3 : 0);
    g.rect(stack.x - 2.5, stack.y - 30, 5, 10).fill(0xf2c230);
    objects.addChild(g);
    ships.push({ g, axis, at, t: min + r() * (max - min), dir: r() < 0.5 ? 1 : -1, speed: 0.5 + r() * 0.4, min, max });
  }

  // ---- 飛行機（滑走路から飛び立つ） ----
  const runway = buildings.find((b) => b.kind === "runway");
  const plane = new Graphics();
  const planeShadow = new Graphics();
  if (runway) {
    const pts = (list: [number, number][]) => list.flatMap(([dx, dy]) => [rel(dx, dy).x, rel(dx, dy).y]);
    planeShadow.ellipse(0, 0, 30, 12).fill({ color: 0x000000, alpha: 0.15 });
    plane.poly(pts([[-0.2, -1.1], [0.15, -1.1], [0.2, 1.1], [-0.15, 1.1]])).fill(0xdfe4ea);
    plane.poly(pts([[-1.2, -0.12], [1.1, -0.12], [1.3, 0], [1.1, 0.12], [-1.2, 0.12]])).fill(0xf8f9fa);
    plane.poly(pts([[-1.2, -0.35], [-0.95, -0.35], [-0.95, 0.35], [-1.2, 0.35]])).fill(0xdfe4ea);
    const tail = rel(-1.1, 0);
    plane.poly([tail.x, tail.y, tail.x + 6, tail.y + 3, tail.x + 4, tail.y - 14, tail.x - 1, tail.y - 14]).fill(0x3f78c4);
    plane.moveTo(rel(-0.8, 0).x, rel(-0.8, 0).y - 1).lineTo(rel(0.9, 0).x, rel(0.9, 0).y - 1).stroke({ width: 1.4, color: 0x3f78c4 });
    objects.addChild(planeShadow, plane);
  }
  let planeTime = 0;

  // ---- 海と空の遊び（仕事とは関係のない、にぎやかし） ----
  const SEA = 0x9fd3e3;

  // クジラ：港の先の海を、ゆっくり行ったり来たりする。ときどき潮を吹く
  const whale = new Container();
  const whaleBody = new Graphics();
  whaleBody.ellipse(2, 4, 56, 13).fill({ color: 0xffffff, alpha: 0.45 });
  whaleBody.ellipse(4, -8, 38, 19).fill(0x3d5a80);
  whaleBody.ellipse(-2, -17, 24, 8).fill(0x4f6f9a);
  whaleBody.ellipse(4, 9, 50, 11).fill(SEA);
  whaleBody.moveTo(-34, 1).quadraticCurveTo(-26, -3, -18, 1).quadraticCurveTo(-10, 5, -2, 1).stroke({ width: 1.6, color: 0xffffff, alpha: 0.8 });
  whaleBody.circle(29, -8, 2.6).fill(0xffffff).circle(29.8, -8, 1.3).fill(0x1f2d40);
  whaleBody.moveTo(40, -5).quadraticCurveTo(33, -1, 24, -2).stroke({ width: 1.4, color: 0x1f2d40 });
  const whaleTail = new Graphics();
  whaleTail.poly([4, 2, 0, -12, 10, -22, -2, -17, -15, -24, -8, -11, -6, 2]).fill(0x3d5a80);
  whaleTail.position.set(-46, 0);
  const whaleSpout = new Graphics();
  for (const dx of [-10, 0, 10]) whaleSpout.moveTo(0, 0).quadraticCurveTo(dx * 0.4, -18, dx, -26).stroke({ width: 2.4, color: 0xffffff });
  for (const [dx, dy] of [[-13, -22], [0, -31], [13, -22], [-6, -34], [7, -35]] as const) whaleSpout.circle(dx, dy, 2.2).fill(0xffffff);
  whaleSpout.position.set(16, -27);
  whale.addChild(whaleTail, whaleBody, whaleSpout);
  objects.addChild(whale);
  const whaleLane = { x: TOWN_W + 9.5, min: 34, max: 64 };
  let whaleY = 46;
  let whaleDir: 1 | -1 = 1;

  // イルカ：島の手前の海で、順番に飛びはねる
  type Dolphin = { g: PixiGraphics; splash: PixiGraphics; t: number; dir: 1 | -1; clock: number };
  const dolphins: Dolphin[] = [];
  const dolphinLane = { y: TOWN_H + 6.5, min: 6, max: 78 };
  for (let i = 0; i < 5; i++) {
    const g = new Graphics();
    g.poly([-11, 0, -19, -6, -15, 0, -19, 6]).fill(0x5f7f9f);
    g.ellipse(0, 0, 13, 4.6).fill(0x6f8fb0);
    g.ellipse(1, 1.8, 10, 2.4).fill(0xe3edf3);
    g.poly([-3, -4, 3, -10, 4, -3]).fill(0x5f7f9f);
    g.ellipse(13, 0.6, 4.2, 1.7).fill(0x6f8fb0);
    g.circle(8.5, -1.2, 0.9).fill(0x1f2d40);
    const splash = new Graphics();
    splash.ellipse(0, 0, 11, 4.5).stroke({ width: 2, color: 0xffffff });
    splash.circle(-7, -5, 1.8).fill(0xffffff).circle(6, -6, 1.6).fill(0xffffff).circle(0, -9, 1.5).fill(0xffffff);
    objects.addChild(splash, g);
    const group = i < 3 ? 0 : 1;
    dolphins.push({ g, splash, t: (group ? 52 : 18) + (i % 3) * 2.2, dir: group ? -1 : 1, clock: (i % 3) * 0.55 + group * 1.3 });
  }

  // ヨット：島の左手前の海
  const yacht = new Graphics();
  localBox(yacht, 1.5, 0.5, 5, 0xf6f6f3, -2);
  yacht.rect(-1, -40, 2, 38).fill(0x8a6a4a);
  yacht.poly([1, -40, 1, -8, 22, -8]).fill(0xffffff).poly([-1, -36, -1, -8, -15, -8]).fill(0xf28c8c);
  objects.addChild(yacht);
  let yachtX = 30;
  let yachtDir: 1 | -1 = 1;

  // 気球：島の手前を、ゆっくり流れる
  const balloon = new Graphics();
  const balloonShadow = new Graphics();
  balloonShadow.ellipse(0, 0, 20, 8).fill({ color: 0x1f3550, alpha: 0.12 });
  balloon.moveTo(-9, -4).lineTo(-5, 8).moveTo(9, -4).lineTo(5, 8).stroke({ width: 1, color: 0x6b5a3a });
  balloon.ellipse(0, -30, 27, 31).fill(0xe76f51);
  balloon.ellipse(0, -30, 18, 31).fill(0xf6d55c);
  balloon.ellipse(0, -30, 8, 31).fill(0x3caea3);
  balloon.ellipse(-9, -42, 6, 9).fill({ color: 0xffffff, alpha: 0.3 });
  balloon.roundRect(-6, 8, 12, 9, 2).fill(0x8a5a3c).rect(-6, 8, 12, 2.4).fill(0x6b4a2f);
  objects.addChild(balloonShadow, balloon);
  const balloonLane = { y: TOWN_H + 5, min: -10, max: TOWN_W + 12, alt: 150 };
  let balloonX = 20;

  // 小さな飛行機：島の奥の空を、旗を引いて横切る
  const flyer = new Graphics();
  flyer.moveTo(-16, 0).lineTo(-34, 2).stroke({ width: 0.8, color: 0x6b6862 });
  flyer.poly([-34, -6, -74, -2, -74, 10, -34, 8]).fill(0xffffff).stroke({ width: 1, color: 0xd6453d });
  for (let i = 0; i < 4; i++) flyer.circle(-42 - i * 8.5, 2 + i * 0.4, 2.6).fill([0xd6453d, 0xf2c230, 0x3f78c4, 0x3aa66a][i] ?? 0xd6453d);
  flyer.ellipse(0, 0, 17, 5).fill(0xd6453d);
  flyer.poly([-4, -2, 4, -2, 9, -15, -1, -15]).fill(0xf6f6f3).poly([-4, 2, 4, 2, 2, 12, -8, 12]).fill(0xe9e4d8);
  flyer.poly([-15, -1, -19, -10, -12, -3]).fill(0xd6453d);
  flyer.ellipse(11, -1.5, 4, 2).fill(0xcfe9f2).rect(17, -7, 1.6, 14).fill(0x4a4a52);
  objects.addChild(flyer);
  let flyerTime = 8;
  let seaTime = 0;

  // ---- 雲（引いて見ているときだけ） ----
  type Cloud = { g: PixiGraphics; shadow: PixiGraphics; x: number; y: number; speed: number };
  const clouds: Cloud[] = [];
  const shadows = new Container();
  sky.addChild(shadows);
  for (let i = 0; i < 9; i++) {
    const g = new Graphics();
    const shadow = new Graphics();
    const parts = 3 + Math.floor(r() * 3);
    for (let k = 0; k < parts; k++) {
      const ox = (k - parts / 2) * 38 + r() * 16;
      const oy = (r() - 0.5) * 16;
      const rx = 40 + r() * 26;
      g.ellipse(ox, oy, rx, rx * 0.55).fill({ color: 0xffffff, alpha: 0.92 });
      shadow.ellipse(ox, oy, rx, rx * 0.5).fill({ color: 0x1f3550, alpha: 0.07 });
    }
    shadows.addChild(shadow);
    sky.addChild(g);
    clouds.push({ g, shadow, x: r() * WORLD_W, y: 200 + r() * 1800, speed: 8 + r() * 8 });
  }

  return {
    update(dt, scale) {
      for (const c of cars) {
        c.t += c.dir * c.speed * dt;
        if (c.t > c.s.to - 0.3 || c.t < c.s.from + 0.3) {
          c.dir = c.dir === 1 ? -1 : 1;
          c.t = Math.max(c.s.from + 0.3, Math.min(c.s.to - 0.3, c.t));
        }
        const lane = c.dir * 0.2;
        const [tx, ty] = c.s.axis === "x" ? [c.t, c.s.at + lane] : [c.s.at - lane, c.t];
        const p = iso(tx, ty);
        c.g.position.set(p.x, p.y);
        c.g.zIndex = tx + ty + 0.1;
      }

      trainX += 3.2 * dt;
      if (trainX > TOWN_W + 10) trainX = -10;
      trainCars.forEach((g, i) => {
        const x = trainX - i * 1.6;
        const p = iso(x, -0.9);
        g.position.set(p.x, p.y);
        g.alpha = x < -1.4 || x > TOWN_W + 1.4 ? 0 : 1;
      });
      train.zIndex = -1;

      for (const s of ships) {
        s.t += s.dir * s.speed * dt;
        if (s.t > s.max || s.t < s.min) s.dir = s.dir === 1 ? -1 : 1;
        const [x, y] = s.axis === "x" ? [s.t, s.at] : [s.at, s.t];
        const p = iso(x, y);
        s.g.position.set(p.x, p.y);
        s.g.zIndex = x + y;
      }

      if (runway) {
        planeTime = (planeTime + dt) % 24;
        const startX = runway.x + 1.2;
        const endX = runway.x + runway.w - 0.6;
        const yy = runway.y + runway.d / 2;
        let x = startX;
        let alt = 0;
        let alpha = 1;
        if (planeTime > 6 && planeTime <= 12) {
          const k = (planeTime - 6) / 6;
          x = startX + (endX - startX) * k * k;
        } else if (planeTime > 12 && planeTime <= 18) {
          const k = (planeTime - 12) / 6;
          x = endX + k * 14;
          alt = k * k * 220;
          alpha = 1 - Math.max(0, k - 0.6) / 0.4;
        } else if (planeTime > 18) {
          alpha = 0;
        }
        const p = iso(x, yy);
        plane.position.set(p.x, p.y - 4 - alt);
        planeShadow.position.set(p.x + alt * 0.3, p.y);
        plane.alpha = alpha;
        planeShadow.alpha = alpha * Math.max(0, 1 - alt / 200);
        plane.zIndex = x + yy + 0.5 + alt;
        planeShadow.zIndex = x + yy;
      }

      seaTime += dt;
      // クジラ：6秒に1回、1.5秒だけ潮を吹く
      whaleY += whaleDir * 0.35 * dt;
      if (whaleY > whaleLane.max || whaleY < whaleLane.min) whaleDir = whaleDir === 1 ? -1 : 1;
      {
        const p = iso(whaleLane.x, whaleY);
        whale.position.set(p.x, p.y + Math.sin(seaTime * 1.3) * 1.5);
        // y が増えるほうへ進むときは、画面では左を向く
        whale.scale.set(whaleDir === 1 ? -1.7 : 1.7, 1.7);
        whale.zIndex = whaleLane.x + whaleY;
        const k = (seaTime % 6) / 1.5;
        whaleSpout.alpha = k < 1 ? Math.sin(k * Math.PI) : 0;
        whaleSpout.scale.set(0.6 + Math.min(k, 1) * 0.5);
        whaleTail.rotation = Math.sin(seaTime * 1.6) * 0.22;
      }

      // イルカ：2.6秒のうち1.1秒だけ、水の上に飛び出す
      for (const dl of dolphins) {
        dl.t += dl.dir * 2.4 * dt;
        if (dl.t > dolphinLane.max || dl.t < dolphinLane.min) dl.dir = dl.dir === 1 ? -1 : 1;
        dl.clock = (dl.clock + dt) % 2.6;
        const k = dl.clock / 1.1;
        const p = iso(dl.t, dolphinLane.y);
        const jumping = k < 1;
        dl.g.visible = jumping;
        dl.g.position.set(p.x, p.y - Math.sin(Math.min(k, 1) * Math.PI) * 38);
        dl.g.scale.set(dl.dir * 1.5, 1.5);
        // 進む向き（画面では右下か左上）に合わせて傾け、飛び出すときは上を、入るときは下を向く
        dl.g.rotation = (k * 2 - 1) * 0.95 * dl.dir + 0.46;
        dl.g.zIndex = dl.t + dolphinLane.y;
        // 水に入るとき・出るときのしぶき
        const edge = Math.min(Math.abs(k), Math.abs(k - 1));
        dl.splash.visible = edge < 0.22;
        dl.splash.alpha = 1 - edge / 0.22;
        dl.splash.position.set(p.x, p.y);
        dl.splash.zIndex = dl.g.zIndex - 0.01;
      }

      yachtX += yachtDir * 0.6 * dt;
      if (yachtX > TOWN_W - 6 || yachtX < 4) yachtDir = yachtDir === 1 ? -1 : 1;
      {
        const p = iso(yachtX, TOWN_H + 9.5);
        yacht.position.set(p.x, p.y + Math.sin(seaTime * 1.1 + 2) * 1.2);
        yacht.zIndex = yachtX + TOWN_H + 9.5;
      }

      balloonX += 0.45 * dt;
      if (balloonX > balloonLane.max) balloonX = balloonLane.min;
      {
        const p = iso(balloonX, balloonLane.y);
        const bob = Math.sin(seaTime * 0.7) * 6;
        balloon.position.set(p.x, p.y - balloonLane.alt - bob);
        balloonShadow.position.set(p.x, p.y);
        // 建物や人より手前に描く（選んだ人の重なり順 1e6 よりは奥）
        balloon.zIndex = 1e5;
        balloonShadow.zIndex = balloonX + balloonLane.y;
      }

      // 小さな飛行機：45秒に1回、島の奥を横切る
      flyerTime = (flyerTime + dt) % 45;
      {
        const x = -14 + flyerTime * 7;
        const p = iso(x, -5);
        flyer.visible = x < TOWN_W + 16;
        flyer.position.set(p.x, p.y - 120 + Math.sin(seaTime * 2) * 2);
        flyer.rotation = 0.46;
        flyer.zIndex = -2;
      }

      const cloudAlpha = Math.max(0, Math.min(0.9, (0.75 - scale) / 0.35));
      sky.visible = cloudAlpha > 0;
      for (const c of clouds) {
        c.x += c.speed * dt;
        if (c.x > WORLD_W + 200) c.x = -200;
        c.g.position.set(c.x, c.y);
        c.shadow.position.set(c.x + 40, c.y + 220);
        c.g.alpha = cloudAlpha;
        c.shadow.alpha = cloudAlpha;
      }
    },
  };
}
