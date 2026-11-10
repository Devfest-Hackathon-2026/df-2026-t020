// キャラクターの絵（people.ts）を、PixiJS を使わずに <canvas> の 2D で描くためのペン。
// people.ts は PixiJS の Graphics の書き方（図形を置いてから fill・stroke）で描くので、同じ名前のメソッドを 2D の描画に置きかえる。
// 業界ページの職業カードのように、小さな絵をたくさん出す場所で使う（PixiJS は読み込まない）。
import type { Graphics } from "pixi.js";

type Paint = number | { color: number; alpha?: number };
type Line = { width: number; color: number; alpha?: number };

const css = (color: number, alpha = 1) => `rgba(${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}, ${alpha})`;

/** people.ts が使うメソッドだけを持つペン。Graphics として渡せる */
export function canvasPen(ctx: CanvasRenderingContext2D): Graphics {
  // fill・stroke のあとに図形を置いたら、新しい形として描きはじめる（続けて stroke すると、同じ形のふちを描く）
  let done = true;
  const begin = () => {
    if (!done) return;
    ctx.beginPath();
    done = false;
  };
  const pen = {
    rect(x: number, y: number, w: number, h: number) {
      begin();
      ctx.rect(x, y, w, h);
      return pen;
    },
    roundRect(x: number, y: number, w: number, h: number, radius = 0) {
      begin();
      const r = Math.max(0, Math.min(radius, w / 2, h / 2));
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      return pen;
    },
    circle(x: number, y: number, r: number) {
      begin();
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      return pen;
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      begin();
      ctx.moveTo(x + rx, y);
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      return pen;
    },
    poly(points: number[]) {
      begin();
      for (let i = 0; i + 1 < points.length; i += 2) {
        if (i === 0) ctx.moveTo(points[i] as number, points[i + 1] as number);
        else ctx.lineTo(points[i] as number, points[i + 1] as number);
      }
      ctx.closePath();
      return pen;
    },
    moveTo(x: number, y: number) {
      begin();
      ctx.moveTo(x, y);
      return pen;
    },
    lineTo(x: number, y: number) {
      begin();
      ctx.lineTo(x, y);
      return pen;
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      begin();
      ctx.quadraticCurveTo(cx, cy, x, y);
      return pen;
    },
    arc(x: number, y: number, r: number, start: number, end: number, counterclockwise = false) {
      begin();
      ctx.arc(x, y, r, start, end, counterclockwise);
      return pen;
    },
    fill(paint: Paint) {
      ctx.fillStyle = typeof paint === "number" ? css(paint) : css(paint.color, paint.alpha);
      ctx.fill();
      done = true;
      return pen;
    },
    stroke(line: Line) {
      ctx.lineWidth = line.width;
      ctx.strokeStyle = css(line.color, line.alpha);
      ctx.stroke();
      done = true;
      return pen;
    },
  };
  return pen as unknown as Graphics;
}
