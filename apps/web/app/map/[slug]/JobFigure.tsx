"use client";

import { useEffect, useRef } from "react";
import { canvasPen } from "@/components/town/canvasPen";
import { drawPerson, personHitArea } from "@/components/town/people";
import type { Look } from "@/data/townModel";

/** 絵の大きさ（CSS の px）と、足もとの位置。page.module.css の .figure・.tile と合わせる */
const WIDTH = 200;
const HEIGHT = 128;
const FOOT_Y = 106;

// 職業カードの絵：仕事の街（/map）で、その仕事の人として立っているキャラクターを描く。
// 飾りなので、読み上げには出さない（職業の名前と説明は、カードの文字にある）。
export default function JobFigure({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    // 連れている動物や乗り物、高い帽子も入る大きさにする。人はいつも真ん中に立つ
    const area = personHitArea(look);
    const scale = Math.min(2.6, (WIDTH / 2 - 4) / -area.x, (WIDTH / 2 - 4) / (area.x + area.w), (FOOT_Y - 4) / (area.h - 2));
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, (WIDTH / 2) * ratio, FOOT_Y * ratio);
    drawPerson(canvasPen(ctx), look);
  }, [look]);

  return <canvas ref={ref} aria-hidden="true" style={{ width: WIDTH, height: HEIGHT }} />;
}
