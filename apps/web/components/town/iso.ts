// 等角投影（2.5D）の座標の計算と、色の明るさの調整。
import { TOWN_H, TOWN_W } from "@/data/townModel";

/** タイル1枚の、画面での半分の幅・高さ（px） */
export const HW = 32;
export const HH = 16;
/** 街のまわりの余白（px）。上は高い建物のぶん広く */
const MARGIN = 200;
const MARGIN_TOP = 320;

export const WORLD_W = (TOWN_W + TOWN_H) * HW + MARGIN * 2;
export const WORLD_H = (TOWN_W + TOWN_H) * HH + MARGIN + MARGIN_TOP;

/** タイル座標 → 画面（ワールド）座標 */
export function iso(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * HW + TOWN_H * HW + MARGIN, y: (x + y) * HH + MARGIN_TOP };
}

/** 画面（ワールド）座標 → タイル座標（iso の逆） */
export function unIso(wx: number, wy: number): { x: number; y: number } {
  const diff = (wx - TOWN_H * HW - MARGIN) / HW;
  const sum = (wy - MARGIN_TOP) / HH;
  return { x: (sum + diff) / 2, y: (sum - diff) / 2 };
}

/** 色を明るく（f > 1）・暗く（f < 1）する */
export function shade(color: number, f: number): number {
  const ch = (shift: number) => {
    const v = (color >> shift) & 0xff;
    const out = f >= 1 ? v + (255 - v) * (f - 1) : v * f;
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 決まった種から 0〜1 の乱数を返す関数（mulberry32） */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
