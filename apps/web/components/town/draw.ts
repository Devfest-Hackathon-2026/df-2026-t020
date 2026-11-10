// 建物とキャラクターの描き方。画像は使わず、図形の組み合わせで描く（素材のライセンスが要らない）。
import type { Graphics } from "pixi.js";
import { bodyHeight, DECK_HEIGHT, TOWN_W, type BuildingKind, type TownBuilding } from "@/data/townModel";
import { HH, HW, iso, rng, shade } from "./iso";

type Point = { x: number; y: number };
const up = (p: Point, h: number): Point => ({ x: p.x, y: p.y - h });
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const flat = (...ps: Point[]) => ps.flatMap((p) => [p.x, p.y]);
const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;

/** 敷地の4つの角（地面）。A 奥、B 右、C 手前、D 左 */
function corners(x: number, y: number, w: number, d: number, inset: number) {
  return {
    A: iso(x + inset, y + inset),
    B: iso(x + w - inset, y + inset),
    C: iso(x + w - inset, y + d - inset),
    D: iso(x + inset, y + d - inset),
  };
}

/** 箱（建物の本体）。見える3面を描き、角を返す */
function box(g: Graphics, x: number, y: number, w: number, d: number, h: number, color: number, inset = 0.14) {
  const { A, B, C, D } = corners(x, y, w, d, inset);
  g.poly(flat(D, C, up(C, h), up(D, h))).fill(shade(color, 0.78));
  g.poly(flat(C, B, up(B, h), up(C, h))).fill(shade(color, 0.9));
  g.poly(flat(up(A, h), up(B, h), up(C, h), up(D, h))).fill(shade(color, 1.1));
  return { A, B, C, D };
}

/** 箱の2つの面に、窓の帯を引く */
function windows(g: Graphics, c: ReturnType<typeof corners>, h: number, color: number, step = 12) {
  for (let k = 10; k < h - 6; k += step) {
    g.moveTo(lerp(c.D, c.C, 0.12).x, lerp(c.D, c.C, 0.12).y - k)
      .lineTo(lerp(c.D, c.C, 0.88).x, lerp(c.D, c.C, 0.88).y - k)
      .moveTo(lerp(c.C, c.B, 0.12).x, lerp(c.C, c.B, 0.12).y - k)
      .lineTo(lerp(c.C, c.B, 0.88).x, lerp(c.C, c.B, 0.88).y - k)
      .stroke({ width: 3, color });
  }
}

/** 四角すいの屋根 */
function roof(g: Graphics, c: ReturnType<typeof corners>, h: number, rh: number, color: number) {
  const top = { x: (c.A.x + c.C.x) / 2, y: (c.A.y + c.C.y) / 2 - h - rh };
  g.poly(flat(up(c.D, h), up(c.C, h), top)).fill(shade(color, 0.85));
  g.poly(flat(up(c.C, h), up(c.B, h), top)).fill(color);
}

function center(b: TownBuilding): Point {
  return iso(b.x + b.w / 2, b.y + b.d / 2);
}

/** 回り続ける部品（風車の羽根、観覧車の輪） */
export type Spinner = { g: Graphics; speed: number };

/**
 * 建物を描く。回る部品は make で別の Graphics を作って返す（呼び出し側で同じ場所に置いて回す）
 */
export function drawBuilding(g: Graphics, b: TownBuilding, make: () => Graphics): Spinner[] {
  const r = rng(b.seed);
  const { x, y, w, d } = b;
  const kind: BuildingKind = b.kind;
  const spinners: Spinner[] = [];

  switch (kind) {
    case "tower": {
      const h = bodyHeight("tower", r());
      const color = pick(r, [0x9fb3c8, 0x8aa1b8, 0xb5c3cf, 0x7d8fa6, 0xa9b8c9]);
      const c = box(g, x, y, w, d, h, color);
      windows(g, c, h, 0xe8f1f8, 10);
      // 屋上は、建物ごとに変える：アンテナ、屋上の庭、一段細い上の階、ヘリポート
      const t = up(lerp(c.A, c.C, 0.5), h);
      const v = r();
      if (v < 0.28) {
        g.rect(t.x - 1, t.y - 28, 2, 28).fill(0x8d99ae).circle(t.x, t.y - 29, 2.6).fill(0xd6453d);
      } else if (v < 0.52) {
        const i = corners(x, y, w, d, 0.42);
        g.poly(flat(up(i.A, h), up(i.B, h), up(i.C, h), up(i.D, h))).fill(0x8bbd5a);
        g.circle(t.x - 8, t.y - 6, 6).fill(0x5e9640).circle(t.x + 9, t.y - 3, 5).fill(0x6fa64a);
      } else if (v < 0.78) {
        const s = boxAt(g, x + 0.5, y + 0.5, w - 1, d - 1, h, 18, color);
        panel(g, s.D, s.C, 0.1, 0.9, 6, 12, 0xe8f1f8);
        panel(g, s.C, s.B, 0.1, 0.9, 6, 12, 0xe8f1f8);
      } else {
        g.ellipse(t.x, t.y, 18, 9).stroke({ width: 2, color: 0xffffff });
        g.rect(t.x - 5, t.y - 4, 2, 8).fill(0xffffff).rect(t.x + 3, t.y - 4, 2, 8).fill(0xffffff).rect(t.x - 5, t.y - 1, 10, 2).fill(0xffffff);
      }
      break;
    }
    case "office": {
      const h = bodyHeight("office", r());
      const color = pick(r, [0xc9ccd3, 0xb8c4d6, 0xd6cfc4, 0xc4cfc8]);
      const c = box(g, x, y, w, d, h, color);
      windows(g, c, h, 0xf3f6fa);
      // 屋上は、建物ごとに変える：水のタンク、機械、看板
      const v = r();
      if (v < 0.3) {
        const t = up(lerp(c.A, c.C, 0.4), h);
        g.rect(t.x - 6, t.y - 12, 12, 12).fill(0xd9dde2).ellipse(t.x, t.y, 6, 3).fill(0xd9dde2).ellipse(t.x, t.y - 12, 6, 3).fill(0xeef0f2);
      } else if (v < 0.6) {
        boxAt(g, x + 0.45, y + 0.45, 0.5, 0.5, h, 6, 0xc9cfd6);
        boxAt(g, x + 1.05, y + 0.6, 0.45, 0.45, h, 5, 0xc9cfd6);
      } else if (v < 0.8) {
        boxAt(g, x + 0.3, y + d - 0.6, w - 0.6, 0.14, h, 12, pick(r, [0x3f78c4, 0xd6453d, 0x2a9d8f, 0xf28c28]));
      }
      break;
    }
    case "hotel": {
      const h = bodyHeight("hotel", r());
      const c = box(g, x, y, w, d, h, pick(r, [0xf1e3c6, 0xe9d6c0, 0xf3ece0]));
      windows(g, c, h, 0x9cc3d6, 11);
      const t = up(lerp(c.A, c.C, 0.5), h);
      g.roundRect(t.x - 16, t.y - 16, 32, 10, 3).fill(0xd6453d);
      break;
    }
    case "shop": {
      const h = bodyHeight("shop", r());
      const c = box(g, x, y, w, d, h, pick(r, [0xf7efe4, 0xf3e1d4, 0xfbf3d6, 0xe8efe6]));
      const awning = pick(r, [0xe76f51, 0x2a9d8f, 0xf4a261, 0x5e81ac, 0xd4537e]);
      g.poly(flat(up(c.D, h - 4), up(c.C, h - 4), up(c.C, h - 12), up(c.D, h - 12))).fill(shade(awning, 0.85));
      g.poly(flat(up(c.C, h - 4), up(c.B, h - 4), up(c.B, h - 12), up(c.C, h - 12))).fill(awning);
      const door = lerp(c.D, c.C, 0.5);
      g.poly(flat(lerp(c.D, c.C, 0.4), lerp(c.D, c.C, 0.6), up(lerp(c.D, c.C, 0.6), 14), up(lerp(c.D, c.C, 0.4), 14))).fill(0x8a6a4a);
      void door;
      break;
    }
    case "house": {
      const h = bodyHeight("house", r());
      const c = box(g, x, y, w, d, h, pick(r, [0xf7f3ea, 0xf1e6d2, 0xe9eef2]), 0.3);
      roof(g, c, h, 16, pick(r, [0xc0503f, 0x4f6d8f, 0x8a5a3c, 0x6a8f4f]));
      panel(g, c.D, c.C, 0.4, 0.6, 0, 11, 0x8a6a4a);
      if (r() < 0.45) panel(g, c.C, c.B, 0.3, 0.6, 7, 14, 0xa8d0e6);
      break;
    }
    case "barn": {
      const h = bodyHeight("barn", 0);
      const c = box(g, x, y, w, d, h, 0xb8443a, 0.2);
      roof(g, c, h, 18, 0x7a2e28);
      const l = lerp(c.D, c.C, 0.35);
      const rr = lerp(c.D, c.C, 0.65);
      g.poly(flat(l, rr, up(rr, 20), up(l, 20))).fill(0x7a2e28).stroke({ width: 1.6, color: 0xffffff });
      break;
    }
    case "factory": {
      const h = bodyHeight("factory", r());
      const color = pick(r, [0xb9b4aa, 0xa9b1b8, 0xc2b8a3]);
      const c = box(g, x, y, w, d, h, color);
      // のこぎり屋根
      for (let t = 0.1; t < 0.9; t += 0.25) {
        const p = up(lerp(c.A, c.B, t), h);
        const q = up(lerp(c.D, c.C, t), h);
        g.poly(flat(p, q, up(q, 10), up(p, 10))).fill(shade(color, 1.18));
      }
      // 煙突と煙
      const s = box(g, x + 0.15, y + 0.15, 0.45, 0.45, h + 46, 0x9a5b4b, 0);
      const top = up(lerp(s.A, s.C, 0.5), h + 52);
      g.circle(top.x + 4, top.y - 6, 7).fill({ color: 0xffffff, alpha: 0.7 });
      g.circle(top.x + 12, top.y - 16, 9).fill({ color: 0xffffff, alpha: 0.5 });
      break;
    }
    case "warehouse": {
      const h = bodyHeight("warehouse", 0);
      const c = box(g, x, y, w, d, h, pick(r, [0xc9b98f, 0xb7c4c8, 0xd2c6b0]));
      g.poly(flat(lerp(c.D, c.C, 0.3), lerp(c.D, c.C, 0.7), up(lerp(c.D, c.C, 0.7), 18), up(lerp(c.D, c.C, 0.3), 18))).fill(0x7c858c);
      break;
    }
    case "hospital": {
      const h = bodyHeight("hospital", 0);
      const c = box(g, x, y, w, d, h, 0xf5f6f7);
      windows(g, c, h, 0xa8d0e6);
      const m = up(lerp(c.C, c.B, 0.5), h * 0.62);
      g.rect(m.x - 4, m.y - 12, 8, 24).fill(0xd6453d).rect(m.x - 12, m.y - 4, 24, 8).fill(0xd6453d);
      break;
    }
    case "school": {
      const h = bodyHeight("school", 0);
      const c = box(g, x, y, w, d, h, 0xf2e6c9);
      windows(g, c, h, 0x9cc3d6);
      const t = box(g, x + w / 2 - 0.4, y + d / 2 - 0.4, 0.8, 0.8, h + 30, 0xe9d7ad, 0);
      const k = up(lerp(t.D, t.C, 0.5), h + 18);
      g.circle(k.x, k.y, 6).fill(0xffffff).stroke({ width: 1.5, color: 0x6b5a3a });
      break;
    }
    case "townhall": {
      const h = bodyHeight("townhall", 0);
      const c = box(g, x, y, w, d, h, 0xd9d4c7);
      windows(g, c, h, 0xf5f2ea);
      const t = up(lerp(c.A, c.C, 0.5), h);
      g.moveTo(t.x, t.y).lineTo(t.x, t.y - 34).stroke({ width: 2, color: 0x555555 });
      g.rect(t.x, t.y - 34, 18, 11).fill(0xffffff).circle(t.x + 9, t.y - 28.5, 3.2).fill(0xd6453d);
      break;
    }
    case "lab": {
      const h = bodyHeight("lab", r());
      const c = box(g, x, y, w, d, h, pick(r, [0xeef3f6, 0xe4edf2]));
      windows(g, c, h, 0x7fb3d5, 9);
      break;
    }
    case "dome": {
      const m = center(b);
      const rx = (w + d) * HW * 0.32;
      g.ellipse(m.x, m.y, rx, rx / 2).fill(0xc9c3b8);
      g.rect(m.x - rx, m.y - 16, rx * 2, 16).fill(0xe2ddd3);
      g.ellipse(m.x, m.y - 16, rx, rx / 2).fill(0xece8e0);
      g.ellipse(m.x, m.y - 18, rx * 0.92, rx * 0.8).fill(0xf6f4ef);
      g.ellipse(m.x - rx * 0.3, m.y - 30, rx * 0.25, rx * 0.18).fill({ color: 0xffffff, alpha: 0.8 });
      break;
    }
    case "stadium": {
      const m = center(b);
      const rx = w * HW * 0.95;
      g.ellipse(m.x, m.y + 4, rx, rx / 2).fill(0xb9b2a6);
      g.rect(m.x - rx, m.y - 18, rx * 2, 22).fill(0xd8d2c6);
      g.ellipse(m.x, m.y - 18, rx, rx / 2).fill(0xe9e4da);
      g.ellipse(m.x, m.y - 16, rx * 0.72, rx * 0.34).fill(0x6fb35a);
      g.ellipse(m.x, m.y - 16, rx * 0.36, rx * 0.17).stroke({ width: 2, color: 0xffffff });
      break;
    }
    case "ferris": {
      const m = center(b);
      const hub = { x: m.x, y: m.y - 62 };
      g.moveTo(m.x - 18, m.y).lineTo(hub.x, hub.y).lineTo(m.x + 18, m.y).stroke({ width: 3, color: 0x7d8fa6 });
      const wheel = make();
      wheel.position.set(hub.x, hub.y);
      wheel.circle(0, 0, 44).stroke({ width: 3, color: 0xe76f51 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        wheel.moveTo(0, 0).lineTo(Math.cos(a) * 44, Math.sin(a) * 44).stroke({ width: 1.5, color: 0xd9d4c7 });
        wheel.roundRect(Math.cos(a) * 44 - 5, Math.sin(a) * 44 - 4, 10, 8, 2).fill([0xf4a261, 0x2a9d8f, 0x5e81ac, 0xd4537e][i % 4]);
      }
      wheel.circle(0, 0, 4).fill(0x555555);
      spinners.push({ g: wheel, speed: 0.15 });
      break;
    }
    case "antenna": {
      const m = center(b);
      const h = 170;
      for (let k = 0; k < 6; k++) {
        const y0 = m.y - (h / 6) * k;
        const y1 = m.y - (h / 6) * (k + 1);
        const w0 = 10 - k * 1.4;
        const w1 = 10 - (k + 1) * 1.4;
        g.poly([m.x - w0, y0, m.x + w0, y0, m.x + w1, y1, m.x - w1, y1]).fill(k % 2 ? 0xffffff : 0xd6453d);
      }
      g.circle(m.x, m.y - h - 4, 4).fill(0xd6453d);
      break;
    }
    case "crane": {
      const m = center(b);
      const h = 120 + r() * 30;
      const dir = r() < 0.5 ? -1 : 1;
      g.rect(m.x - 3, m.y - h, 6, h).fill(0xe9b949);
      g.moveTo(m.x - 26 * dir, m.y - h).lineTo(m.x + 80 * dir, m.y - h).stroke({ width: 5, color: 0xe9b949 });
      g.rect(m.x - 30 * dir - 6, m.y - h - 2, 12, 10).fill(0x7d8fa6);
      g.moveTo(m.x + 60 * dir, m.y - h).lineTo(m.x + 60 * dir, m.y - h + 50).stroke({ width: 1, color: 0x444444 });
      g.rect(m.x + 60 * dir - 4, m.y - h + 50, 8, 6).fill(0x444444);
      break;
    }
    case "container": {
      box(g, x, y, w, d, 14, pick(r, [0xd1495b, 0x00798c, 0xedae49, 0x30638e, 0x66a182]), 0.1);
      break;
    }
    case "frame": {
      const h = 50;
      const c = corners(x, y, w, d, 0.2);
      const color = 0xd98c3a;
      for (const p of [c.A, c.B, c.C, c.D]) g.moveTo(p.x, p.y).lineTo(p.x, p.y - h).stroke({ width: 2.5, color });
      for (const k of [h / 2, h]) {
        g.poly(flat(up(c.A, k), up(c.B, k), up(c.C, k), up(c.D, k))).stroke({ width: 2, color });
      }
      g.poly(flat(up(c.A, h / 2), up(c.B, h / 2), up(c.C, h / 2), up(c.D, h / 2))).fill({ color: 0xbdb6aa, alpha: 0.6 });
      break;
    }
    case "windmill": {
      const m = center(b);
      const h = 96;
      g.poly([m.x - 3, m.y, m.x + 3, m.y, m.x + 1.5, m.y - h, m.x - 1.5, m.y - h]).fill(0xf4f4f2);
      const blades = make();
      blades.position.set(m.x, m.y - h);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        blades.poly([0, 0, Math.cos(a - 0.08) * 40, Math.sin(a - 0.08) * 40, Math.cos(a) * 44, Math.sin(a) * 44, Math.cos(a + 0.06) * 40, Math.sin(a + 0.06) * 40]).fill(0xffffff);
      }
      blades.circle(0, 0, 3.5).fill(0xb4b2a9);
      spinners.push({ g: blades, speed: 0.9 + r() * 0.5 });
      break;
    }
    case "tree": {
      const m = iso(x + 0.5, y + 0.5);
      g.ellipse(m.x, m.y, 12, 6).fill({ color: 0x000000, alpha: 0.12 });
      g.rect(m.x - 2, m.y - 14, 4, 14).fill(0x7a5a3a);
      if (r() < 0.35) {
        const c = pick(r, [0x3f7d4a, 0x4c8a52]);
        g.poly([m.x - 13, m.y - 10, m.x + 13, m.y - 10, m.x, m.y - 44]).fill(c);
        g.poly([m.x, m.y - 10, m.x + 13, m.y - 10, m.x, m.y - 44]).fill(shade(c, 0.85));
      } else {
        // たまに、桜と、色づいた木
        const c = pick(r, [0x6fa64a, 0x5e9640, 0x7bb35a, 0x8bbd5a, 0x6fa64a, 0x7bb35a, 0x5e9640, 0x8bbd5a, 0xf2b5c8, 0xe8a03a]);
        g.circle(m.x, m.y - 24, 13).fill(c);
        g.circle(m.x + 4, m.y - 27, 7).fill(shade(c, 1.15));
      }
      break;
    }
    case "field": {
      const c = corners(x, y, w, d, 0.08);
      const color = pick(r, [0x9cc56a, 0xd9c26a, 0x88b95a, 0xb9d27a]);
      g.poly(flat(c.A, c.B, c.C, c.D)).fill(color);
      for (let t = 0.15; t < 1; t += 0.17) {
        const p = lerp(c.A, c.D, t);
        const q = lerp(c.B, c.C, t);
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1.5, color: shade(color, 0.82) });
      }
      break;
    }
    case "pond": {
      const m = center(b);
      const rx = (w + d) * HW * 0.4;
      g.ellipse(m.x, m.y, rx, rx * 0.5).fill(0xd8c99a);
      g.ellipse(m.x, m.y, rx * 0.88, rx * 0.42).fill(0x7cc0d8);
      g.ellipse(m.x - rx * 0.3, m.y - rx * 0.08, rx * 0.25, rx * 0.07).fill({ color: 0xffffff, alpha: 0.5 });
      break;
    }
    case "solar": {
      const c = corners(x, y, w, d, 0.12);
      g.poly(flat(up(c.A, 6), up(c.B, 6), up(c.C, 2), up(c.D, 2))).fill(0x30507a);
      g.moveTo(lerp(up(c.A, 6), up(c.D, 2), 0.5).x, lerp(up(c.A, 6), up(c.D, 2), 0.5).y)
        .lineTo(lerp(up(c.B, 6), up(c.C, 2), 0.5).x, lerp(up(c.B, 6), up(c.C, 2), 0.5).y)
        .stroke({ width: 1, color: 0x8fb0d8 });
      break;
    }
    default:
      drawLandmark(g, b, r, make, spinners);
  }
  return spinners;
}

/** 建物の重なり順の基準（敷地の手前の角ほど手前） */
export function buildingDepth(b: TownBuilding): number {
  return b.x + b.w + b.y + b.d - 1;
}

/** タイルの中心（キャラクターの足もと） */
export function personPoint(x: number, y: number) {
  return iso(x, y);
}

export { HH, HW };

// ---------- 区画ごとの目印の建物 ----------

function drawLandmark(g: Graphics, b: TownBuilding, r: () => number, make: () => Graphics, spinners: Spinner[]) {
  const { x, y, w, d } = b;
  const m = center(b);
  switch (b.kind) {
    case "silo": {
      const p = iso(x + 0.5, y + 0.5);
      g.ellipse(p.x, p.y, 12, 6).fill(shade(0xb9b4aa, 0.8));
      g.rect(p.x - 12, p.y - 46, 24, 46).fill(0xd6d1c4);
      g.rect(p.x, p.y - 46, 12, 46).fill(0xc2bcae);
      g.ellipse(p.x, p.y - 46, 12, 6).fill(0xb8443a);
      g.ellipse(p.x, p.y - 50, 8, 5).fill(0xa33a32);
      break;
    }
    case "greenhouse": {
      const c = corners(x, y, w, d, 0.15);
      const h = bodyHeight("greenhouse", 0);
      g.poly(flat(c.D, c.C, up(c.C, h), up(c.D, h))).fill({ color: 0xbfe6d6, alpha: 0.85 });
      g.poly(flat(c.C, c.B, up(c.B, h), up(c.C, h))).fill({ color: 0xd6f0e6, alpha: 0.85 });
      const ridgeA = up(lerp(c.A, c.D, 0.5), h + 14);
      const ridgeB = up(lerp(c.B, c.C, 0.5), h + 14);
      g.poly(flat(up(c.D, h), up(c.C, h), ridgeB, ridgeA)).fill({ color: 0xe8f7f0, alpha: 0.9 });
      for (let t = 0.2; t < 1; t += 0.2) {
        const p = lerp(c.D, c.C, t);
        g.moveTo(p.x, p.y).lineTo(p.x, p.y - h).stroke({ width: 0.8, color: 0xffffff });
        const q = lerp(c.C, c.B, t);
        g.moveTo(q.x, q.y).lineTo(q.x, q.y - h).stroke({ width: 0.8, color: 0xffffff });
      }
      for (let t = 0.15; t < 0.9; t += 0.18) {
        const p = lerp(c.D, c.C, t);
        g.circle(p.x + 3, p.y - 6, 4).fill(0x6fa64a);
      }
      break;
    }
    case "scarecrow": {
      const p = iso(x + 0.5, y + 0.5);
      g.moveTo(p.x, p.y).lineTo(p.x, p.y - 30).moveTo(p.x - 10, p.y - 22).lineTo(p.x + 10, p.y - 22).stroke({ width: 2, color: 0x8a5a3c });
      g.rect(p.x - 5, p.y - 24, 10, 10).fill(0x5e81ac);
      g.circle(p.x, p.y - 30, 4.5).fill(0xf3e7c4).ellipse(p.x, p.y - 33, 9, 2.4).fill(0xe3c26a).ellipse(p.x, p.y - 35, 4.6, 3).fill(0xd8b45a);
      break;
    }
    case "tractor": {
      const p = iso(x + 0.5, y + 0.5);
      g.ellipse(p.x, p.y, 16, 6).fill({ color: 0x000000, alpha: 0.12 });
      g.roundRect(p.x - 12, p.y - 16, 20, 10, 2).fill(0xd6453d).rect(p.x - 10, p.y - 28, 11, 12).fill({ color: 0xd8ecf6, alpha: 0.85 }).stroke({ width: 1.4, color: 0xd6453d });
      g.circle(p.x - 8, p.y - 6, 7).fill(0x2c2c2a).circle(p.x - 8, p.y - 6, 3).fill(0xf2c230).circle(p.x + 7, p.y - 4, 4).fill(0x2c2c2a);
      break;
    }
    case "paddock":
    case "zoo": {
      const c = corners(x, y, w, d, 0.12);
      const fence = b.kind === "zoo" ? 0x7d8f6a : 0xf3ece0;
      const posts = [c.A, c.B, c.C, c.D];
      for (let i = 0; i < 4; i++) {
        const p = posts[i] as Point;
        const q = posts[(i + 1) % 4] as Point;
        for (const k of [4, 9]) g.moveTo(p.x, p.y - k).lineTo(q.x, q.y - k).stroke({ width: 1.4, color: fence });
        for (let t = 0; t < 1; t += 0.2) {
          const s = lerp(p, q, t);
          g.moveTo(s.x, s.y).lineTo(s.x, s.y - 11).stroke({ width: 1.6, color: shade(fence, 0.8) });
        }
      }
      if (b.kind === "paddock") {
        animal(g, "cow", lerp(c.A, c.C, 0.35));
        animal(g, "sheep", lerp(c.A, c.C, 0.6));
        animal(g, "sheep", lerp(c.B, c.D, 0.45));
      } else {
        g.circle(m.x + 18, m.y - 24, 12).fill(0x6fa64a).rect(m.x + 16, m.y - 14, 4, 14).fill(0x7a5a3a);
        animal(g, "elephant", lerp(c.A, c.C, 0.62));
        animal(g, "giraffe", lerp(c.A, c.C, 0.38));
      }
      break;
    }
    case "gastank": {
      const rr = (w + d) * HW * 0.26;
      g.ellipse(m.x, m.y, rr, rr / 2).fill({ color: 0x000000, alpha: 0.12 });
      for (const dx of [-rr * 0.6, rr * 0.6]) g.moveTo(m.x + dx, m.y).lineTo(m.x + dx * 0.7, m.y - rr).stroke({ width: 2, color: 0x8d99ae });
      g.circle(m.x, m.y - rr - 6, rr).fill(0xeef0f2);
      g.circle(m.x + rr * 0.25, m.y - rr - 6, rr * 0.82).fill(0xf8f9fa);
      g.ellipse(m.x, m.y - rr - 6, rr, rr * 0.18).stroke({ width: 1.2, color: 0x3f78c4 });
      break;
    }
    case "pylon": {
      const p = iso(x + 0.5, y + 0.5);
      const h = 120;
      g.poly([p.x - 10, p.y, p.x + 10, p.y, p.x + 2, p.y - h, p.x - 2, p.y - h]).stroke({ width: 1.4, color: 0x8d99ae });
      for (let k = 1; k < 6; k++) {
        const yy = p.y - (h / 6) * k;
        const ww = 10 - (8 / 6) * k;
        g.moveTo(p.x - ww, yy).lineTo(p.x + ww, yy + h / 6).stroke({ width: 0.8, color: 0x8d99ae });
      }
      for (const yy of [h * 0.72, h * 0.88]) g.moveTo(p.x - 18, p.y - yy).lineTo(p.x + 18, p.y - yy).stroke({ width: 1.6, color: 0x8d99ae });
      break;
    }
    case "station": {
      const c = box(g, x, y, w, d, 28, 0xe9e2d4, 0.1);
      g.poly(flat(up(c.A, 28), up(c.B, 28), up(c.C, 28), up(c.D, 28))).fill(0x6b7f94);
      const s = up(lerp(c.D, c.C, 0.5), 20);
      g.roundRect(s.x - 22, s.y - 6, 44, 11, 3).fill(0x2a9d8f);
      for (let t = 0.1; t < 0.9; t += 0.16) {
        const p = lerp(c.D, c.C, t);
        g.poly(flat(p, lerp(c.D, c.C, t + 0.08), up(lerp(c.D, c.C, t + 0.08), 12), up(p, 12))).fill(0x9fd0e6);
      }
      break;
    }
    case "runway": {
      const c = corners(x, y, w, d, 0.05);
      g.poly(flat(c.A, c.B, c.C, c.D)).fill(0x6e747b);
      const a = lerp(c.A, c.D, 0.5);
      const bb = lerp(c.B, c.C, 0.5);
      for (let t = 0.04; t < 0.96; t += 0.06) {
        const p = lerp(a, bb, t);
        const q = lerp(a, bb, t + 0.03);
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 2.4, color: 0xffffff });
      }
      for (const t of [0.02, 0.98]) {
        const p = lerp(c.A, c.B, t);
        const q = lerp(c.D, c.C, t);
        g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 3, color: 0xf2c230 });
      }
      break;
    }
    case "lighthouse": {
      const p = iso(x + 0.5, y + 0.5);
      g.ellipse(p.x, p.y, 13, 6).fill(0xb9b2a6);
      const h = 110;
      for (let k = 0; k < 5; k++) {
        const y0 = p.y - (h / 5) * k;
        const y1 = p.y - (h / 5) * (k + 1);
        const w0 = 10 - k * 1.1;
        const w1 = 10 - (k + 1) * 1.1;
        g.poly([p.x - w0, y0, p.x + w0, y0, p.x + w1, y1, p.x - w1, y1]).fill(k % 2 ? 0xd6453d : 0xffffff);
      }
      g.rect(p.x - 6, p.y - h - 12, 12, 12).fill(0xfff3a0).rect(p.x - 7.5, p.y - h - 14, 15, 3).fill(0x444444).poly([p.x - 7, p.y - h - 14, p.x + 7, p.y - h - 14, p.x, p.y - h - 22]).fill(0xd6453d);
      const beam = make();
      beam.position.set(p.x, p.y - h - 6);
      beam.poly([0, 0, 90, -10, 90, 10]).fill({ color: 0xfff7c0, alpha: 0.35 });
      spinners.push({ g: beam, speed: 0.6 });
      break;
    }
    case "concert": {
      const c = box(g, x, y, w, d, 12, 0x3a3836, 0.15);
      const top = 62;
      for (const p of [c.A, c.B, c.D]) g.moveTo(p.x, p.y - 12).lineTo(p.x, p.y - top).stroke({ width: 2, color: 0x8d99ae });
      g.moveTo(c.D.x, c.D.y - top).lineTo(c.A.x, c.A.y - top).lineTo(c.B.x, c.B.y - top).stroke({ width: 3, color: 0x8d99ae });
      const lights = [0xd6453d, 0xf2c230, 0x3f78c4, 0xe889a8, 0x2a9d8f];
      for (let i = 0; i < 5; i++) {
        const p = lerp(c.D, c.A, (i + 0.5) / 5);
        g.circle(p.x, p.y - top + 4, 3).fill(lights[i] ?? 0xffffff);
        g.poly([p.x - 2, p.y - top + 6, p.x + 2, p.y - top + 6, p.x + 10, p.y - 14, p.x - 6, p.y - 14]).fill({ color: lights[i] ?? 0xffffff, alpha: 0.18 });
      }
      g.rect(c.B.x - 10, c.B.y - 34, 8, 22).fill(0x2c2c2a).rect(c.D.x + 2, c.D.y - 34, 8, 22).fill(0x2c2c2a);
      break;
    }
    case "stall": {
      const c = corners(x, y, 1, 1, 0.18);
      const h = 18;
      for (const p of [c.A, c.B, c.C, c.D]) g.moveTo(p.x, p.y).lineTo(p.x, p.y - h).stroke({ width: 1.4, color: 0x8a5a3c });
      g.poly(flat(c.D, c.C, up(c.C, 7), up(c.D, 7))).fill(0xc9a26a);
      const col = pick(r, [0xd6453d, 0x2a9d8f, 0xf28c28, 0x3f78c4]);
      const apex = up(lerp(c.A, c.C, 0.5), h + 10);
      g.poly(flat(up(c.D, h), up(c.C, h), apex)).fill(col);
      g.poly(flat(up(c.C, h), up(c.B, h), apex)).fill(shade(col, 1.2));
      g.circle(lerp(c.D, c.C, 0.3).x, lerp(c.D, c.C, 0.3).y - 9, 2.2).fill(0xf2c230).circle(lerp(c.D, c.C, 0.6).x, lerp(c.D, c.C, 0.6).y - 9, 2.2).fill(0xd6453d);
      break;
    }
    case "billboard": {
      const p = iso(x + 0.5, y + 0.5);
      g.rect(p.x - 1.5, p.y - 50, 3, 50).fill(0x8d99ae);
      const col = pick(r, [0xe889a8, 0x3f78c4, 0xf2c230, 0x2a9d8f, 0xd6453d]);
      g.poly([p.x - 22, p.y - 72, p.x + 22, p.y - 61, p.x + 22, p.y - 40, p.x - 22, p.y - 51]).fill(col);
      g.poly([p.x - 16, p.y - 64, p.x + 6, p.y - 58.5, p.x + 6, p.y - 54, p.x - 16, p.y - 59.5]).fill(0xffffff);
      g.circle(p.x + 13, p.y - 52, 4).fill(0xffffff);
      break;
    }
    case "fountain": {
      const rx = (w + d) * HW * 0.3;
      g.ellipse(m.x, m.y, rx, rx / 2).fill(0xd9d4c7);
      g.ellipse(m.x, m.y - 4, rx, rx / 2).fill(0xe8e4da);
      g.ellipse(m.x, m.y - 4, rx * 0.84, rx * 0.4).fill(0x8fcde3);
      g.rect(m.x - 3, m.y - 22, 6, 18).fill(0xe8e4da);
      const spray = make();
      spray.position.set(m.x, m.y - 24);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        spray.circle(Math.cos(a) * 9, Math.sin(a) * 4 - 4, 2.2).fill({ color: 0xffffff, alpha: 0.75 });
      }
      spinners.push({ g: spray, speed: 0.8 });
      break;
    }
    case "vending": {
      const c = box(g, x + 0.25, y + 0.3, 0.5, 0.35, 26, pick(r, [0xd6453d, 0x3f78c4, 0xf2f2f2]), 0);
      const f = lerp(c.D, c.C, 0.5);
      g.rect(f.x - 6, f.y - 22, 9, 8).fill(0xd8ecf6);
      break;
    }
    case "dish": {
      const p = iso(x + 0.5, y + 0.5);
      g.rect(p.x - 2, p.y - 22, 4, 22).fill(0x8d99ae);
      g.ellipse(p.x, p.y - 30, 16, 10).fill(0xf4f4f2).stroke({ width: 1, color: 0xc9cfd6 });
      g.ellipse(p.x - 1, p.y - 31, 11, 6).fill(0xe2e6ea);
      g.moveTo(p.x, p.y - 30).lineTo(p.x + 9, p.y - 44).stroke({ width: 1.2, color: 0x8d99ae });
      g.circle(p.x + 9, p.y - 45, 2).fill(0xd6453d);
      break;
    }
    case "firestation": {
      const h = bodyHeight("firestation", 0);
      const c = box(g, x, y, w, d, h, 0xd6453d);
      for (const t of [0.15, 0.55]) {
        g.poly(flat(lerp(c.D, c.C, t), lerp(c.D, c.C, t + 0.32), up(lerp(c.D, c.C, t + 0.32), 22), up(lerp(c.D, c.C, t), 22))).fill(0xf2f2f2);
        for (let k = 6; k < 22; k += 5) g.moveTo(lerp(c.D, c.C, t).x, lerp(c.D, c.C, t).y - k).lineTo(lerp(c.D, c.C, t + 0.32).x, lerp(c.D, c.C, t + 0.32).y - k).stroke({ width: 0.8, color: 0xc9c9c9 });
      }
      const t = box(g, x + w - 0.7, y + 0.1, 0.6, 0.6, h + 28, 0xe9e4d8, 0);
      const s = up(lerp(t.A, t.C, 0.5), h + 28);
      g.circle(s.x, s.y - 3, 3).fill(0xf2c230);
      g.roundRect(lerp(c.C, c.B, 0.5).x - 12, lerp(c.C, c.B, 0.5).y - h + 6, 24, 8, 2).fill(0xffffff);
      break;
    }
    case "police": {
      const h = bodyHeight("police", 0);
      const c = box(g, x, y, w, d, h, 0xeef1f4);
      g.poly(flat(up(c.D, 16), up(c.C, 16), up(c.C, 22), up(c.D, 22))).fill(0x2f4468);
      g.poly(flat(up(c.C, 16), up(c.B, 16), up(c.B, 22), up(c.C, 22))).fill(0x3f5a88);
      windows(g, c, h, 0x9fc3dd, 9);
      const top = up(lerp(c.A, c.C, 0.5), h);
      g.rect(top.x - 5, top.y - 6, 10, 5).fill(0xd6453d);
      g.circle(lerp(c.C, c.B, 0.5).x, lerp(c.C, c.B, 0.5).y - h + 10, 5).fill(0xf2c230);
      break;
    }
    case "pool": {
      const c = corners(x, y, w, d, 0.12);
      g.poly(flat(c.A, c.B, c.C, c.D)).fill(0xe8e2d4);
      const i = corners(x, y, w, d, 0.32);
      g.poly(flat(i.A, i.B, i.C, i.D)).fill(0x6ccbe6);
      g.moveTo(lerp(i.A, i.D, 0.5).x, lerp(i.A, i.D, 0.5).y).lineTo(lerp(i.B, i.C, 0.5).x, lerp(i.B, i.C, 0.5).y).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
      g.circle(lerp(c.D, c.C, 0.5).x, lerp(c.D, c.C, 0.5).y - 2, 3).fill(0xd6453d);
      break;
    }
    case "onsen": {
      const rx = (w + d) * HW * 0.34;
      g.ellipse(m.x, m.y, rx, rx / 2).fill(0x8a8378);
      g.ellipse(m.x, m.y - 1, rx * 0.86, rx * 0.4).fill(0xa8d8d0);
      for (let i = 0; i < 4; i++) g.circle(m.x - rx * 0.4 + i * rx * 0.28, m.y - 14 - (i % 2) * 6, 6 + (i % 2) * 2).fill({ color: 0xffffff, alpha: 0.55 });
      g.poly([m.x + rx * 0.7, m.y - 2, m.x + rx * 0.95, m.y - 6, m.x + rx * 0.9, m.y + 4]).fill(0x6b6458);
      break;
    }
    case "temple": {
      const h = bodyHeight("temple", 0);
      const c = box(g, x, y, w, d, h, 0xc9a274, 0.25);
      const top = { x: (c.A.x + c.C.x) / 2, y: (c.A.y + c.C.y) / 2 - h - 24 };
      const e = corners(x, y, w, d, 0.02);
      g.poly(flat(up(e.D, h), up(e.C, h), top)).fill(0x4a4a52);
      g.poly(flat(up(e.C, h), up(e.B, h), top)).fill(0x5d5d66);
      g.circle(top.x, top.y, 3).fill(0xc9a43a);
      break;
    }
    case "torii": {
      const p = iso(x + 0.5, y + 0.5);
      g.rect(p.x - 14, p.y - 34, 3.4, 34).fill(0xd6453d).rect(p.x + 10.6, p.y - 34, 3.4, 34).fill(0xd6453d);
      g.rect(p.x - 18, p.y - 38, 36, 4).fill(0x2c2c2a).rect(p.x - 15, p.y - 30, 30, 3).fill(0xd6453d);
      break;
    }
    case "helipad": {
      const c = corners(x, y, w, d, 0.15);
      g.poly(flat(c.A, c.B, c.C, c.D)).fill(0x7d848c);
      const rx = (w + d) * HW * 0.3;
      g.ellipse(m.x, m.y, rx, rx / 2).stroke({ width: 2, color: 0xffffff });
      g.poly([m.x - 10, m.y - 5, m.x - 6, m.y - 7, m.x + 4, m.y - 2, m.x + 8, m.y - 4, m.x + 12, m.y - 2, m.x + 2, m.y + 3, m.x - 2, m.y + 5, m.x - 6, m.y + 3, m.x, m.y]).fill(0xffffff);
      break;
    }
    case "track": {
      const rx = w * HW * 0.85;
      g.ellipse(m.x, m.y, rx, rx / 2).fill(0xc95b45);
      g.ellipse(m.x, m.y, rx * 0.84, rx * 0.4).stroke({ width: 1, color: 0xffffff });
      g.ellipse(m.x, m.y, rx * 0.7, rx * 0.33).fill(0x7bb35a);
      break;
    }
    default:
      drawHome(g, b, r);
  }
}

// ---------- 分野ごとの「その仕事が集まる建物」 ----------

type Corners = ReturnType<typeof corners>;

/** 地面から z の高さに載せた箱（屋上の看板や機械、船の上の部屋）。載せた高さでの角を返す */
function boxAt(g: Graphics, x: number, y: number, w: number, d: number, z: number, h: number, color: number): Corners {
  const c = corners(x, y, w, d, 0);
  const A = up(c.A, z);
  const B = up(c.B, z);
  const C = up(c.C, z);
  const D = up(c.D, z);
  g.poly(flat(D, C, up(C, h), up(D, h))).fill(shade(color, 0.78));
  g.poly(flat(C, B, up(B, h), up(C, h))).fill(shade(color, 0.9));
  g.poly(flat(up(A, h), up(B, h), up(C, h), up(D, h))).fill(shade(color, 1.1));
  return { A, B, C, D };
}

/** 切妻屋根（棟は x の向き）。左手前に屋根の斜面、右手前に三角の壁が見える */
function gable(g: Graphics, c: Corners, h: number, rh: number, color: number, wall: number) {
  const ra = up(lerp(c.A, c.D, 0.5), h + rh);
  const rb = up(lerp(c.B, c.C, 0.5), h + rh);
  g.poly(flat(up(c.A, h), up(c.B, h), rb, ra)).fill(shade(color, 0.8));
  g.poly(flat(up(c.C, h), up(c.B, h), rb)).fill(shade(wall, 0.9));
  g.poly(flat(up(c.D, h), up(c.C, h), rb, ra)).fill(color);
}

/** 壁の上の四角（扉、窓、帯）。p→q が壁の下の辺、t0〜t1 が横の位置、z0〜z1 が高さ */
function panel(g: Graphics, p: Point, q: Point, t0: number, t1: number, z0: number, z1: number, color: number) {
  const a = lerp(p, q, t0);
  const b = lerp(p, q, t1);
  g.poly(flat(up(a, z0), up(b, z0), up(b, z1), up(a, z1))).fill(color);
}

/** 見えている2つの壁（左手前、右手前）に、同じ帯を引く */
function band(g: Graphics, c: Corners, z0: number, z1: number, color: number) {
  panel(g, c.D, c.C, 0, 1, z0, z1, shade(color, 0.85));
  panel(g, c.C, c.B, 0, 1, z0, z1, color);
}

function cross(g: Graphics, p: Point, s: number, color: number) {
  g.rect(p.x - s / 3, p.y - s, (s * 2) / 3, s * 2).fill(color).rect(p.x - s, p.y - s / 3, s * 2, (s * 2) / 3).fill(color);
}

function heart(g: Graphics, p: Point, s: number, color: number) {
  g.circle(p.x - s / 2, p.y - s / 2, s * 0.56).fill(color).circle(p.x + s / 2, p.y - s / 2, s * 0.56).fill(color);
  g.poly([p.x - s, p.y - s * 0.3, p.x + s, p.y - s * 0.3, p.x, p.y + s * 0.9]).fill(color);
}

function steam(g: Graphics, p: Point) {
  g.circle(p.x + 3, p.y - 6, 5).fill({ color: 0xffffff, alpha: 0.7 });
  g.circle(p.x + 9, p.y - 14, 7).fill({ color: 0xffffff, alpha: 0.5 });
}

function drawHome(g: Graphics, b: TownBuilding, r: () => number) {
  const { x, y, w, d } = b;
  const m = center(b);
  switch (b.kind) {
    case "bank": {
      const h = bodyHeight("bank", 0);
      const c = box(g, x, y, w, d, h, 0xe9e3d3);
      for (const [p, q] of [[c.D, c.C], [c.C, c.B]] as const) {
        for (const t of [0.14, 0.38, 0.62, 0.86]) panel(g, p, q, t - 0.045, t + 0.045, 0, h - 8, 0xfaf7ef);
      }
      band(g, c, h - 8, h - 3, 0xc9bfa6);
      panel(g, c.D, c.C, 0.44, 0.56, 0, 14, 0x6b5a3a);
      // 屋上のコイン
      const t = up(lerp(c.A, c.C, 0.5), h);
      g.rect(t.x - 1, t.y - 4, 2, 4).fill(0x8d99ae);
      g.circle(t.x, t.y - 13, 9).fill(0xf2c230).stroke({ width: 1.6, color: 0xb8860b });
      g.rect(t.x - 1, t.y - 18, 2, 10).fill(0xb8860b).rect(t.x - 4, t.y - 15, 8, 1.6).fill(0xb8860b).rect(t.x - 4, t.y - 12, 8, 1.6).fill(0xb8860b);
      break;
    }
    case "court": {
      const h = bodyHeight("court", 0);
      const c = box(g, x, y, w, d, h, 0xdcd6c8);
      for (const [p, q] of [[c.D, c.C], [c.C, c.B]] as const) {
        for (const t of [0.12, 0.31, 0.5, 0.69, 0.88]) panel(g, p, q, t - 0.035, t + 0.035, 4, h - 6, 0xf6f3ea);
      }
      band(g, c, 0, 4, 0xc9c1af);
      roof(g, c, h, 16, 0xb5ad9b);
      // てんびん
      const t = up(lerp(c.A, c.C, 0.5), h + 16);
      g.moveTo(t.x, t.y).lineTo(t.x, t.y - 16).moveTo(t.x - 10, t.y - 14).lineTo(t.x + 10, t.y - 14).stroke({ width: 1.8, color: 0x8a6d1f });
      for (const dx of [-10, 10]) g.poly([t.x + dx - 5, t.y - 7, t.x + dx + 5, t.y - 7, t.x + dx, t.y - 14]).stroke({ width: 1, color: 0x8a6d1f }).ellipse(t.x + dx, t.y - 7, 5, 2).fill(0xd9b24a);
      break;
    }
    case "clinic": {
      const h = bodyHeight("clinic", r());
      const c = box(g, x, y, w, d, h, 0xf7f9fa);
      windows(g, c, h, 0xa8d8d0, 11);
      panel(g, c.D, c.C, 0.38, 0.62, 0, 15, 0x7fb8c9);
      band(g, c, h - 5, h, pick(r, [0x2a9d8f, 0x5e9bd8, 0xe889a8]));
      const s = up(lerp(c.C, c.B, 0.5), h * 0.55);
      g.circle(s.x, s.y, 11).fill(0xffffff);
      cross(g, s, 7, 0x2a9d8f);
      break;
    }
    case "pharmacy": {
      const h = bodyHeight("pharmacy", r());
      const c = box(g, x, y, w, d, h, 0xfafafa);
      band(g, c, h - 8, h, 0x3aa66a);
      panel(g, c.D, c.C, 0.1, 0.56, 4, h - 11, 0xcfe9f2);
      panel(g, c.D, c.C, 0.66, 0.86, 0, 14, 0x8fc1dd);
      panel(g, c.C, c.B, 0.15, 0.85, 4, h - 11, 0xdaf0f6);
      const t = up(lerp(c.A, c.C, 0.5), h);
      g.rect(t.x - 1, t.y - 10, 2, 10).fill(0x8d99ae);
      g.roundRect(t.x - 11, t.y - 31, 22, 22, 5).fill(0x3aa66a);
      cross(g, { x: t.x, y: t.y - 20 }, 7, 0xffffff);
      break;
    }
    case "carehome": {
      const h = bodyHeight("carehome", 0);
      const wall = 0xf6e7d4;
      const c = box(g, x, y, w, d, h, wall, 0.1);
      gable(g, c, h, 10, 0xd98c5f, wall);
      for (const t of [0.1, 0.34, 0.74]) panel(g, c.D, c.C, t, t + 0.16, 8, 17, 0xa8d0e6);
      panel(g, c.D, c.C, 0.54, 0.68, 0, 14, 0x8a6a4a);
      // 入口のスロープと手すり
      const p = lerp(c.D, c.C, 0.61);
      g.moveTo(p.x - 12, p.y + 3).lineTo(p.x - 12, p.y - 6).lineTo(p.x + 6, p.y + 3).stroke({ width: 1.4, color: 0x8d99ae });
      heart(g, up(lerp(c.C, c.B, 0.5), h * 0.62), 6, 0xe889a8);
      break;
    }
    case "nursery": {
      const h = bodyHeight("nursery", 0);
      const wall = 0xffe9a8;
      const c = box(g, x, y, w, d, h, wall, 0.12);
      gable(g, c, h, 10, 0xf28c8c, wall);
      const colors = [0xd6453d, 0x3f78c4, 0x3aa66a, 0xf28c28];
      colors.forEach((color, i) => {
        const p = up(lerp(c.D, c.C, 0.14 + i * 0.24), 12);
        g.circle(p.x, p.y, 4.4).fill(0xffffff).circle(p.x, p.y, 3).fill(color);
      });
      panel(g, c.C, c.B, 0.38, 0.62, 0, 13, 0x8a6a4a);
      const s = up(lerp(c.C, c.B, 0.5), h + 3);
      g.circle(s.x, s.y, 4.5).fill(0xf2c230);
      // すべり台
      const q = lerp(c.D, c.C, 0.5);
      g.moveTo(q.x - 20, q.y + 10).lineTo(q.x - 20, q.y - 4).stroke({ width: 1.6, color: 0x3f78c4 });
      g.moveTo(q.x - 20, q.y - 4).lineTo(q.x - 6, q.y + 10).stroke({ width: 3, color: 0xf2c230 });
      break;
    }
    case "library": {
      const h = bodyHeight("library", 0);
      const c = box(g, x, y, w, d, h, 0xb86f52);
      for (const [p, q] of [[c.D, c.C], [c.C, c.B]] as const) {
        for (const t of [0.1, 0.33, 0.56, 0.79]) panel(g, p, q, t, t + 0.11, 8, h - 8, 0xf6eeda);
      }
      band(g, c, h - 4, h, 0x9a5a42);
      // 屋上に積んだ本
      boxAt(g, x + 0.5, y + 0.5, w - 1, d - 1.1, h, 5, 0x3f78c4);
      boxAt(g, x + 0.62, y + 0.56, w - 1.15, d - 1.2, h + 5, 5, 0xf2c230);
      boxAt(g, x + 0.54, y + 0.62, w - 1.2, d - 1.28, h + 10, 5, 0xd6453d);
      break;
    }
    case "tvstation": {
      const h = bodyHeight("tvstation", r());
      const c = box(g, x, y, w, d, h, 0x86a9c9);
      windows(g, c, h, 0xdcecf7, 9);
      // 壁の大きな画面
      panel(g, c.C, c.B, 0.16, 0.84, h * 0.42, h * 0.84, 0x2c2c2a);
      [0xf2c230, 0x2a9d8f, 0xd4537e, 0xd6453d, 0x3f78c4].forEach((color, i) => panel(g, c.C, c.B, 0.2 + i * 0.12, 0.2 + (i + 1) * 0.12, h * 0.47, h * 0.79, color));
      // 屋上のアンテナとパラボラ
      const t = up(lerp(c.A, c.C, 0.34), h);
      for (let k = 0; k < 5; k++) g.rect(t.x - 1.5, t.y - 6 * (k + 1), 3, 6).fill(k % 2 ? 0xffffff : 0xd6453d);
      g.circle(t.x, t.y - 32, 2.4).fill(0xd6453d);
      const s = up(lerp(c.A, c.C, 0.68), h);
      g.rect(s.x - 1.5, s.y - 8, 3, 8).fill(0x8d99ae);
      g.ellipse(s.x, s.y - 13, 13, 8).fill(0xf4f4f2).stroke({ width: 1, color: 0xc9cfd6 }).ellipse(s.x - 1, s.y - 14, 9, 5).fill(0xe2e6ea);
      break;
    }
    case "datacenter": {
      const h = bodyHeight("datacenter", r());
      const c = box(g, x, y, w, d, h, 0x5d6672);
      for (const [p, q] of [[c.D, c.C], [c.C, c.B]] as const) {
        for (let k = 8; k < h - 4; k += 8) {
          for (let i = 1; i < 10; i++) {
            const s = up(lerp(p, q, i / 10), k);
            g.circle(s.x, s.y, 1.3).fill((i + k / 8) % 3 ? 0x7be0a0 : 0x7fc4ff);
          }
        }
      }
      // 屋上の冷やす機械
      boxAt(g, x + 0.4, y + 0.4, 0.6, 0.6, h, 7, 0xc9cfd6);
      boxAt(g, x + 1.1, y + 0.55, 0.5, 0.5, h, 6, 0xc9cfd6);
      break;
    }
    case "restaurant": {
      const h = bodyHeight("restaurant", r());
      const c = box(g, x, y, w, d, h, pick(r, [0xfbf1dc, 0xf7e3cf, 0xf3ead8]));
      const stripe = pick(r, [0xd6453d, 0x2a9d8f, 0xe07a3a]);
      for (const [p, q] of [[c.D, c.C], [c.C, c.B]] as const) {
        for (let i = 0; i < 6; i++) panel(g, p, q, i / 6, (i + 1) / 6, h - 13, h - 5, i % 2 ? 0xffffff : stripe);
      }
      panel(g, c.D, c.C, 0.4, 0.6, 0, 14, 0x8a5a3c);
      panel(g, c.C, c.B, 0.2, 0.8, 5, h - 15, 0xcfe9f2);
      // 煙突と湯気
      const s = boxAt(g, x + 0.35, y + 0.35, 0.4, 0.4, h, 12, 0x9a5b4b);
      steam(g, up(lerp(s.A, s.C, 0.5), 14));
      // 皿の看板
      const t = up(lerp(c.A, c.C, 0.62), h);
      g.rect(t.x - 1, t.y - 9, 2, 9).fill(0x8d99ae);
      g.circle(t.x, t.y - 18, 10).fill(0xffffff).stroke({ width: 2, color: stripe }).circle(t.x, t.y - 18, 4.5).fill(0xf4a261);
      break;
    }
    case "cafe": {
      const h = bodyHeight("cafe", r());
      const c = box(g, x, y, w, d, h, pick(r, [0xc9a27a, 0xd9b99a, 0xb8926a]));
      band(g, c, h - 11, h - 4, pick(r, [0x3f7d4a, 0x7a4a2f, 0x2f6f8f]));
      panel(g, c.D, c.C, 0.1, 0.5, 5, h - 13, 0xfdf3d6);
      panel(g, c.D, c.C, 0.6, 0.82, 0, 14, 0x6b4a2f);
      panel(g, c.C, c.B, 0.2, 0.8, 5, h - 13, 0xfdf3d6);
      // カップの看板
      const t = up(lerp(c.A, c.C, 0.5), h);
      g.circle(t.x + 8, t.y - 9, 3.6).stroke({ width: 1.8, color: 0xffffff });
      g.roundRect(t.x - 8, t.y - 15, 15, 13, 3).fill(0xffffff).stroke({ width: 1, color: 0x8a6a4a });
      g.ellipse(t.x - 0.5, t.y - 14, 5.5, 1.8).fill(0x6b4a2f);
      g.moveTo(t.x - 3, t.y - 19).quadraticCurveTo(t.x - 6, t.y - 23, t.x - 3, t.y - 27).moveTo(t.x + 3, t.y - 19).quadraticCurveTo(t.x, t.y - 23, t.x + 3, t.y - 27).stroke({ width: 1.4, color: 0xffffff });
      break;
    }
    case "salon": {
      const h = bodyHeight("salon", r());
      const c = box(g, x, y, w, d, h, pick(r, [0xf8dbe3, 0xe3e0f5, 0xdff0ea]));
      band(g, c, h - 6, h, 0xd4537e);
      panel(g, c.D, c.C, 0.1, 0.58, 4, h - 9, 0xd8f0f6);
      panel(g, c.D, c.C, 0.68, 0.88, 0, 14, 0x9a6a7a);
      panel(g, c.C, c.B, 0.2, 0.8, 4, h - 9, 0xd8f0f6);
      // サインポール
      const p = c.C;
      g.rect(p.x - 3, p.y - 28, 6, 24).fill(0xffffff);
      for (let k = 0; k < 4; k++) g.poly([p.x - 3, p.y - 7 - k * 6, p.x + 3, p.y - 10 - k * 6, p.x + 3, p.y - 7 - k * 6, p.x - 3, p.y - 4 - k * 6]).fill(k % 2 ? 0x3f78c4 : 0xd6453d);
      g.rect(p.x - 4, p.y - 31, 8, 3).fill(0x8d99ae).rect(p.x - 4, p.y - 4, 8, 4).fill(0x8d99ae);
      break;
    }
    case "market": {
      const h = bodyHeight("market", 0);
      const c = box(g, x, y, w, d, h, 0xf6f6f3, 0.1);
      band(g, c, h - 9, h, 0xf28c28);
      panel(g, c.D, c.C, 0.05, 0.95, 3, 14, 0xcfe9f2);
      panel(g, c.C, c.B, 0.08, 0.92, 3, 14, 0xdaf0f6);
      panel(g, c.D, c.C, 0.44, 0.56, 0, 14, 0x8fc1dd);
      // 屋上の看板
      const s = boxAt(g, x + w / 2 - 0.9, y + d / 2 - 0.1, 1.8, 0.25, h, 16, 0xd6453d);
      const t = up(lerp(s.D, s.C, 0.5), 8);
      g.ellipse(t.x - 9, t.y + 4, 4.5, 4).fill(0xffffff).ellipse(t.x, t.y, 4.5, 4).fill(0xf2c230).ellipse(t.x + 9, t.y - 4, 4.5, 4).fill(0xffffff);
      break;
    }
    case "postoffice": {
      const h = bodyHeight("postoffice", 0);
      const c = box(g, x, y, w, d, h, 0xf7efe0, 0.24);
      band(g, c, h - 7, h, 0xd6453d);
      for (const t of [0.1, 0.66]) panel(g, c.D, c.C, t, t + 0.24, 9, 19, 0xcfe9f2);
      panel(g, c.D, c.C, 0.42, 0.58, 0, 14, 0x8a5a3c);
      // 〒
      const s = up(lerp(c.C, c.B, 0.5), h * 0.48);
      g.roundRect(s.x - 10, s.y - 10, 20, 20, 4).fill(0xd6453d);
      g.rect(s.x - 6, s.y - 6, 12, 2.2).fill(0xffffff).rect(s.x - 5, s.y - 1.5, 10, 2.2).fill(0xffffff).rect(s.x - 1.1, s.y - 1.5, 2.2, 9).fill(0xffffff);
      // ポスト
      boxAt(g, x + w - 0.3, y + d - 0.3, 0.24, 0.24, 0, 13, 0xd6453d);
      break;
    }
    case "garage": {
      const h = bodyHeight("garage", 0);
      const c = box(g, x, y, w, d, h, pick(r, [0xaab4bd, 0xb9b4aa, 0x9fb3c8]));
      band(g, c, h - 6, h, 0xf2c230);
      for (const t of [0.08, 0.54]) {
        panel(g, c.D, c.C, t, t + 0.38, 0, 16, 0xe9ecef);
        for (const k of [4, 8, 12]) g.moveTo(lerp(c.D, c.C, t).x, lerp(c.D, c.C, t).y - k).lineTo(lerp(c.D, c.C, t + 0.38).x, lerp(c.D, c.C, t + 0.38).y - k).stroke({ width: 0.8, color: 0xb4bcc4 });
      }
      // 積んだタイヤ
      const p = lerp(c.C, c.B, 0.3);
      for (let k = 0; k < 3; k++) g.ellipse(p.x + 4, p.y - 2 - k * 5, 7, 3.5).fill(0x2c2c2a).ellipse(p.x + 4, p.y - 3 - k * 5, 3, 1.5).fill(0x8d99ae);
      break;
    }
    case "chapel": {
      const h = bodyHeight("chapel", 0);
      const wall = 0xfaf8f2;
      const c = box(g, x, y, w, d, h, wall, 0.2);
      gable(g, c, h, 16, 0x6f86a6, wall);
      panel(g, c.C, c.B, 0.4, 0.6, 0, 14, 0x8a6a4a);
      const s = up(lerp(c.C, c.B, 0.5), h + 1);
      g.circle(s.x, s.y, 4.5).fill(0xf2c230).stroke({ width: 1, color: 0xffffff });
      for (const t of [0.2, 0.5, 0.8]) panel(g, c.D, c.C, t - 0.05, t + 0.05, 8, 20, 0x9cc3d6);
      // 鐘の塔
      const t = boxAt(g, x + 0.25, y + d - 0.95, 0.6, 0.6, 0, h + 22, 0xf3efe6);
      const top = up(lerp(t.A, t.C, 0.5), h + 36);
      g.poly(flat(up(t.D, h + 22), up(t.C, h + 22), top)).fill(shade(0x6f86a6, 0.85));
      g.poly(flat(up(t.C, h + 22), up(t.B, h + 22), top)).fill(0x6f86a6);
      const bell = up(lerp(t.D, t.C, 0.5), h + 12);
      g.rect(bell.x - 4, bell.y - 5, 8, 9).fill(0x4a5868).circle(bell.x, bell.y, 3).fill(0xf2c230);
      heart(g, { x: top.x, y: top.y - 6 }, 4, 0xe889a8);
      break;
    }
    case "coolingtower": {
      const rr = (w + d) * HW * 0.24;
      const H = 70;
      g.ellipse(m.x, m.y, rr * 1.1, rr * 0.55).fill({ color: 0x000000, alpha: 0.12 });
      g.ellipse(m.x, m.y, rr, rr / 2).fill(0xcfcabf);
      g.poly([m.x - rr, m.y, m.x - rr * 0.62, m.y - H * 0.6, m.x - rr * 0.76, m.y - H, m.x + rr * 0.76, m.y - H, m.x + rr * 0.62, m.y - H * 0.6, m.x + rr, m.y]).fill(0xe2ded5);
      g.poly([m.x + rr * 0.2, m.y, m.x + rr * 0.12, m.y - H * 0.6, m.x + rr * 0.16, m.y - H, m.x + rr * 0.76, m.y - H, m.x + rr * 0.62, m.y - H * 0.6, m.x + rr, m.y]).fill(0xcfcabf);
      g.ellipse(m.x, m.y - H, rr * 0.76, rr * 0.3).fill(0xb5b0a6);
      g.ellipse(m.x, m.y - H, rr * 0.6, rr * 0.22).fill(0x8f8a80);
      g.circle(m.x - 4, m.y - H - 8, 10).fill({ color: 0xffffff, alpha: 0.75 });
      g.circle(m.x + 8, m.y - H - 20, 13).fill({ color: 0xffffff, alpha: 0.6 });
      g.circle(m.x + 24, m.y - H - 34, 15).fill({ color: 0xffffff, alpha: 0.4 });
      break;
    }
    case "oilrig": {
      const p = iso(x + 0.5, y + 0.5);
      const H = 84;
      g.ellipse(p.x, p.y, 20, 9).fill({ color: 0x000000, alpha: 0.12 });
      g.poly([p.x - 12, p.y, p.x + 12, p.y, p.x + 3, p.y - H, p.x - 3, p.y - H]).stroke({ width: 1.8, color: 0x4a4a52 });
      for (let k = 0; k < 5; k++) {
        const y0 = p.y - (H / 5) * k;
        const y1 = p.y - (H / 5) * (k + 1);
        const w0 = 12 - (9 / 5) * k;
        const w1 = 12 - (9 / 5) * (k + 1);
        g.moveTo(p.x - w0, y0).lineTo(p.x + w1, y1).moveTo(p.x + w0, y0).lineTo(p.x - w1, y1).stroke({ width: 1, color: 0x4a4a52 });
      }
      g.rect(p.x - 6, p.y - H - 3, 12, 3).fill(0x4a4a52);
      g.poly([p.x - 5, p.y - H - 3, p.x + 5, p.y - H - 3, p.x + 1, p.y - H - 20]).fill(0xf28c28);
      g.poly([p.x - 2.5, p.y - H - 3, p.x + 2.5, p.y - H - 3, p.x, p.y - H - 12]).fill(0xfff3a0);
      // ポンプとドラム缶
      g.rect(p.x + 12, p.y - 9, 3, 11).fill(0x2c2c2a);
      g.moveTo(p.x + 5, p.y - 6).lineTo(p.x + 23, p.y - 13).stroke({ width: 3.2, color: 0xd6453d });
      g.circle(p.x + 23, p.y - 12, 3.6).fill(0x2c2c2a);
      g.rect(p.x - 21, p.y - 9, 10, 11).fill(0x3f78c4).ellipse(p.x - 16, p.y + 2, 5, 2.4).fill(0x3f78c4).ellipse(p.x - 16, p.y - 9, 5, 2.4).fill(0x6fa3e0);
      break;
    }
    case "mine": {
      const c = corners(x, y, w, d, 0.08);
      const top = up(lerp(c.A, c.C, 0.42), 36);
      g.poly(flat(c.A, c.B, c.C, c.D)).fill(0x9a8468);
      g.poly(flat(c.D, c.C, top)).fill(0x8f7a5e);
      g.poly(flat(c.C, c.B, top)).fill(0xa8916f);
      g.poly(flat(up(lerp(c.D, top, 0.72), 0), up(lerp(c.C, top, 0.72), 0), top)).fill(0xb9a888);
      // 坑道の入口とトロッコ
      const e = lerp(c.D, c.C, 0.5);
      g.roundRect(e.x - 9, e.y - 20, 18, 18, 8).fill(0x2c2622).stroke({ width: 2.2, color: 0xc9a26a });
      const q = lerp(c.D, c.C, 0.86);
      g.moveTo(e.x, e.y - 2).lineTo(q.x + 4, q.y + 2).stroke({ width: 1.2, color: 0x6b5a3a });
      g.roundRect(q.x - 6, q.y - 9, 13, 8, 1.5).fill(0x5d6672);
      g.circle(q.x - 3, q.y - 10, 2.4).fill(0xf2c230).circle(q.x + 2, q.y - 11, 2.6).fill(0xd9b24a).circle(q.x + 5, q.y - 9.5, 2).fill(0xf2c230);
      g.circle(q.x - 3, q.y, 2).fill(0x2c2c2a).circle(q.x + 4, q.y, 2).fill(0x2c2c2a);
      // つるはし
      const s = lerp(c.C, c.B, 0.4);
      g.moveTo(s.x, s.y - 2).lineTo(s.x + 6, s.y - 16).stroke({ width: 1.8, color: 0x8a5a3c });
      g.moveTo(s.x, s.y - 17).quadraticCurveTo(s.x + 7, s.y - 21, s.x + 13, s.y - 14).stroke({ width: 2.2, color: 0x5d6672 });
      break;
    }
    case "terminal": {
      const h = bodyHeight("terminal", 0);
      // 管制塔（建物の奥の角から立つ）
      boxAt(g, x + 0.3, y + 0.3, 0.7, 0.7, 0, h + 34, 0xe9edf0);
      const c = box(g, x, y, w, d, h, 0xdfeaf0, 0.1);
      windows(g, c, h, 0x8fc1dd, 8);
      band(g, c, h - 3, h, 0xffffff);
      panel(g, c.D, c.C, 0.42, 0.58, 0, 13, 0x4f6d8f);
      boxAt(g, x + 0.12, y + 0.12, 1.06, 1.06, h + 34, 10, 0x4f6d8f);
      const cap = boxAt(g, x + 0.06, y + 0.06, 1.18, 1.18, h + 44, 3, 0xffffff);
      const t = up(lerp(cap.A, cap.C, 0.5), 3);
      g.rect(t.x - 0.8, t.y - 9, 1.6, 9).fill(0x8d99ae).circle(t.x, t.y - 10, 2.4).fill(0xd6453d);
      break;
    }
    case "workshop": {
      const h = bodyHeight("workshop", r());
      const wall = pick(r, [0xdcc6a6, 0xcfd8c4, 0xd9cbd6, 0xe6d9b8]);
      const c = box(g, x, y, w, d, h, wall, 0.16);
      gable(g, c, h, 10, pick(r, [0x8a6a4a, 0x5e7f8f, 0xa85d4a]), wall);
      panel(g, c.D, c.C, 0.3, 0.7, 0, 15, 0x5a4634);
      panel(g, c.D, c.C, 0.08, 0.22, 8, 16, 0xcfe9f2);
      // 丸い看板（絵の具のパレット）
      const s = up(lerp(c.C, c.B, 0.5), h * 0.7);
      g.circle(s.x, s.y, 9).fill(0xfbf3dc).stroke({ width: 1.2, color: 0x8a6a4a });
      g.circle(s.x - 4, s.y - 2, 2.2).fill(0xd6453d).circle(s.x + 1, s.y - 4.5, 2.2).fill(0xf2c230).circle(s.x + 4.5, s.y, 2.2).fill(0x3f78c4).circle(s.x, s.y + 4, 2.2).fill(0x3aa66a);
      break;
    }
    case "observatory": {
      const h = bodyHeight("observatory", 0);
      const c = box(g, x, y, w, d, h, 0xf1f3f5, 0.22);
      panel(g, c.D, c.C, 0.42, 0.58, 0, 13, 0x6b7f94);
      band(g, c, h - 4, h, 0xc9cfd6);
      const t = up(lerp(c.A, c.C, 0.5), h);
      g.ellipse(t.x, t.y, 30, 15).fill(0xd3d8de);
      g.ellipse(t.x, t.y - 9, 28, 24).fill(0xe9edf0);
      g.ellipse(t.x - 9, t.y - 18, 9, 7).fill({ color: 0xffffff, alpha: 0.8 });
      g.poly([t.x + 3, t.y - 32, t.x + 12, t.y - 29, t.x + 17, t.y - 5, t.x + 7, t.y - 2]).fill(0x4a5868);
      g.moveTo(t.x + 10, t.y - 16).lineTo(t.x + 26, t.y - 36).stroke({ width: 4.5, color: 0x8d99ae });
      g.circle(t.x + 26, t.y - 36, 3).fill(0xcfe9f2);
      break;
    }
    case "hangar": {
      const h = bodyHeight("hangar", 0);
      const wall = 0xb9c4cc;
      const c = box(g, x, y, w, d, h, wall, 0.1);
      gable(g, c, h, 12, 0x8fa3b3, wall);
      // 開いた大きな扉と、中の飛行機
      panel(g, c.C, c.B, 0.1, 0.9, 0, h - 5, 0x3f4a58);
      const p = lerp(c.C, c.B, 0.5);
      g.rect(p.x - 17, p.y - 11, 34, 2.6).fill(0xdfe4ea);
      g.ellipse(p.x, p.y - 10, 8, 6.5).fill(0xf8f9fa).ellipse(p.x, p.y - 12, 4.5, 2.4).fill(0x8fc1dd);
      g.rect(p.x - 1, p.y - 22, 2, 8).fill(0x3f78c4);
      for (const t of [0.15, 0.4, 0.65]) panel(g, c.D, c.C, t, t + 0.14, 12, 20, 0xdcecf7);
      // 吹き流し
      const s = c.D;
      g.rect(s.x - 1, s.y - 34, 2, 34).fill(0x8d99ae);
      g.poly([s.x, s.y - 34, s.x - 16, s.y - 30, s.x - 16, s.y - 26, s.x, s.y - 27]).fill(0xf28c28);
      g.poly([s.x - 6, s.y - 32.5, s.x - 11, s.y - 31.2, s.x - 11, s.y - 26.6, s.x - 6, s.y - 26.9]).fill(0xffffff);
      break;
    }
    case "fishingboat":
    case "cargoship":
      drawShip(g, b);
      break;
  }
}

/** 港に泊めた船。人が甲板（DECK_HEIGHT の高さ）に立つ。船尾が奥、船首が手前 */
function drawShip(g: Graphics, b: TownBuilding) {
  const { x, y, w, d } = b;
  const fishing = b.kind === "fishingboat";
  const deck = DECK_HEIGHT[b.kind] ?? 16;
  const keel = -12;
  const hull = fishing ? 0xf6f6f3 : 0x2f4468;
  const shape: Point[] = [
    iso(x + 0.2, y + 0.25),
    iso(x + w - 0.2, y + 0.25),
    iso(x + w - 0.05, y + d * 0.72),
    iso(x + w / 2, y + d),
    iso(x + 0.05, y + d * 0.72),
  ];
  // 水ぎわの白い波
  g.poly(flat(...shape.map((p) => up(p, keel)))).stroke({ width: 5, color: 0xffffff, alpha: 0.55 });
  // 岸からわたす板
  const ym = y + d * 0.24;
  const shore = TOWN_W + 1.5;
  g.poly(flat(iso(shore, ym - 0.22), iso(shore, ym + 0.22), up(iso(x + 0.25, ym + 0.22), deck), up(iso(x + 0.25, ym - 0.22), deck))).fill(0xb08a5a).stroke({ width: 1, color: 0x7a5a3a });
  // 船体（見えない面も描いて、あとから甲板でふさぐ）
  const light = [0.7, 0.94, 0.94, 0.8, 0.8];
  shape.forEach((p, i) => {
    const q = shape[(i + 1) % shape.length] as Point;
    g.poly(flat(up(p, keel), up(q, keel), up(q, deck), up(p, deck))).fill(shade(hull, light[i] ?? 0.8));
    const [z0, z1, color] = fishing ? [deck - 6, deck - 2, 0x3f78c4] : [keel, keel + 7, 0xb8443a];
    g.poly(flat(up(p, z0), up(q, z0), up(q, z1), up(p, z1))).fill(shade(color, light[i] ?? 0.8));
  });
  g.poly(flat(...shape.map((p) => up(p, deck)))).fill(fishing ? 0xdccba6 : 0x8a9a7a).stroke({ width: 2.5, color: fishing ? 0xffffff : 0x4f6d8f });

  if (fishing) {
    // かじを取る部屋
    const cab = boxAt(g, x + 0.75, y + 0.5, 1.5, 1.3, deck, 18, 0xffffff);
    panel(g, cab.D, cab.C, 0.1, 0.9, 8, 14, 0x7fb3d5);
    panel(g, cab.C, cab.B, 0.1, 0.9, 8, 14, 0x9cc3d6);
    boxAt(g, x + 0.65, y + 0.4, 1.7, 1.5, deck + 18, 3, 0x3f78c4);
    // マストと、魚を集める明かり、大漁旗
    const mast = up(iso(x + w / 2, y + 1.95), deck);
    const bow = up(iso(x + w / 2, y + d - 0.5), deck);
    g.rect(mast.x - 1.2, mast.y - 52, 2.4, 52).fill(0x6b5a3a);
    g.rect(bow.x - 1, bow.y - 20, 2, 20).fill(0x6b5a3a);
    g.moveTo(mast.x, mast.y - 50).lineTo(bow.x, bow.y - 20).stroke({ width: 1, color: 0x4a4a52 });
    for (let i = 1; i < 6; i++) {
      const p = lerp({ x: mast.x, y: mast.y - 50 }, { x: bow.x, y: bow.y - 20 }, i / 6);
      g.circle(p.x, p.y + 3, 3).fill(0xfff3a0).stroke({ width: 0.8, color: 0xd9b24a });
    }
    g.poly([mast.x, mast.y - 52, mast.x + 22, mast.y - 46, mast.x + 22, mast.y - 32, mast.x, mast.y - 38]).fill(0xd6453d);
    g.circle(mast.x + 11, mast.y - 42, 5).fill(0xf2c230);
    g.poly([mast.x, mast.y - 40.5, mast.x + 22, mast.y - 34.5, mast.x + 22, mast.y - 32, mast.x, mast.y - 38]).fill(0x3f78c4);
    // 魚の入った箱と、たたんだ網
    for (const [dx, dy] of [[0.3, 0.52], [0.3, 0.64]] as const) {
      const crate = boxAt(g, x + dx, y + d * dy, 0.55, 0.5, deck, 5, 0x5e9bd8);
      const p = up(lerp(crate.A, crate.C, 0.5), 6);
      g.ellipse(p.x - 2, p.y, 5, 2).fill(0xdfe6ea).ellipse(p.x + 3, p.y + 1, 5, 2).fill(0xc9d6de);
    }
    const net = up(iso(x + 0.6, y + d * 0.42), deck);
    g.ellipse(net.x, net.y - 3, 9, 5).fill(0x3aa66a).ellipse(net.x + 2, net.y - 6, 6, 3.5).fill(0x6fbf8a);
    g.circle(net.x - 6, net.y - 5, 2.4).fill(0xf28c28).circle(net.x + 8, net.y - 3, 2.4).fill(0xf28c28);
  } else {
    // 船橋とえんとつ
    const bridge = boxAt(g, x + 0.4, y + 0.45, w - 0.8, 1.8, deck, 26, 0xf6f6f3);
    panel(g, bridge.D, bridge.C, 0.06, 0.94, 8, 13, 0x7fb3d5);
    panel(g, bridge.D, bridge.C, 0.06, 0.94, 17, 22, 0x7fb3d5);
    panel(g, bridge.C, bridge.B, 0.08, 0.92, 17, 22, 0x9cc3d6);
    const top = boxAt(g, x + 0.3, y + 0.7, w - 0.6, 1.3, deck + 26, 10, 0xffffff);
    panel(g, top.D, top.C, 0.04, 0.96, 3, 8, 0x4f6d8f);
    panel(g, top.C, top.B, 0.06, 0.94, 3, 8, 0x5f7fa3);
    boxAt(g, x + w / 2 - 0.3, y + 0.75, 0.6, 0.6, deck + 36, 16, 0xd6453d);
    boxAt(g, x + w / 2 - 0.3, y + 0.75, 0.6, 0.6, deck + 52, 4, 0x2c2c2a);
    // 甲板の左側に積んだコンテナ
    const colors = [0xd1495b, 0x00798c, 0xedae49, 0x30638e, 0x66a182, 0xe07a3a];
    for (let j = 0; j < 5; j++) {
      const stack = 1 + ((j * 7 + 1) % 3 > 0 ? 1 : 0);
      for (let k = 0; k < stack; k++) boxAt(g, x + 0.28, y + d * 0.3 + j * 1.02, 0.95, 0.9, deck + k * 12, 12, colors[(j * 2 + k) % colors.length] ?? 0xd1495b);
    }
    // 船首の旗
    const bow = up(iso(x + w / 2, y + d - 0.6), deck);
    g.rect(bow.x - 1, bow.y - 26, 2, 26).fill(0x8d99ae);
    g.poly([bow.x, bow.y - 26, bow.x + 14, bow.y - 22, bow.x, bow.y - 17]).fill(0xf2c230);
    // 浮き輪
    const ring = up(lerp(shape[1] as Point, shape[2] as Point, 0.45), deck - 9);
    g.circle(ring.x, ring.y, 4.5).fill(0xffffff).stroke({ width: 2, color: 0xd6453d }).circle(ring.x, ring.y, 1.8).fill(shade(hull, 0.94));
  }
}

function animal(g: Graphics, kind: "cow" | "sheep" | "elephant" | "giraffe", p: Point) {
  switch (kind) {
    case "cow":
      g.ellipse(p.x, p.y - 7, 9, 5).fill(0xffffff).stroke({ width: 0.5, color: 0x9a9a9a }).circle(p.x - 2, p.y - 8, 2).fill(0x2c2c2a);
      g.ellipse(p.x - 11, p.y - 9, 3.4, 2.8).fill(0xffffff).stroke({ width: 0.5, color: 0x9a9a9a });
      g.rect(p.x - 6, p.y - 3, 1.6, 4).fill(0xdddddd).rect(p.x + 4, p.y - 3, 1.6, 4).fill(0xdddddd);
      break;
    case "sheep":
      for (const [dx, dy] of [[-4, -6], [0, -8], [4, -6], [0, -4]] as const) g.circle(p.x + dx, p.y + dy, 3.4).fill(0xf6f3ec);
      g.ellipse(p.x - 8, p.y - 7, 2.6, 2.2).fill(0x3a3632);
      break;
    case "elephant":
      g.ellipse(p.x, p.y - 12, 13, 9).fill(0x9aa3ab);
      g.rect(p.x - 9, p.y - 6, 4, 6).fill(0x8a939b).rect(p.x + 5, p.y - 6, 4, 6).fill(0x8a939b);
      g.circle(p.x - 13, p.y - 16, 6).fill(0x9aa3ab).ellipse(p.x - 10, p.y - 16, 4, 6).fill(0xa9b1b8);
      g.moveTo(p.x - 18, p.y - 14).quadraticCurveTo(p.x - 21, p.y - 6, p.x - 18, p.y - 2).stroke({ width: 2.4, color: 0x9aa3ab });
      break;
    case "giraffe":
      g.rect(p.x - 6, p.y - 10, 1.8, 10).fill(0xe0b04a).rect(p.x + 4, p.y - 10, 1.8, 10).fill(0xe0b04a);
      g.ellipse(p.x, p.y - 13, 8, 4.6).fill(0xf0c45a);
      g.poly([p.x - 7, p.y - 14, p.x - 4, p.y - 14, p.x - 8, p.y - 40, p.x - 10, p.y - 40]).fill(0xf0c45a);
      g.ellipse(p.x - 10, p.y - 41, 3.6, 2.2).fill(0xf0c45a);
      for (const [dx, dy] of [[-2, -14], [3, -12], [-7, -24], [-8, -32]] as const) g.circle(p.x + dx, p.y + dy, 1.2).fill(0xb07a2a);
      break;
  }
}
