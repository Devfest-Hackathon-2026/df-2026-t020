// キャラクターを部品の組み合わせで描く。部品の id は data/townParts.json のカタログ。
// 足もとが (0, 0)。右手の位置に持ち物、左側に連れている動物か乗り物を置く。
// 画像素材は使わず図形で描く（素材のライセンスが要らない）。部品を足すときは、カタログとこのファイルの両方に足す。
import type { Graphics } from "pixi.js";
import type { Look } from "@/data/townModel";
import { shade } from "./iso";

const INK = 0x3a3632;
const WHITE = 0xf8f8f6;
/** 全身を覆う上着（下の服を描かない） */
const FULL_BODY = new Set(["coverall", "dress", "kimono", "spacesuit", "whitecoat"]);

type Hand = { x: number; y: number };

export function drawPerson(g: Graphics, look: Look) {
  const sw = [4.8, 5.5, 6.4][look.body] ?? 5.5;
  // 連れている動物・乗り物（左側。人より先に描く）
  if (look.vehicle !== "none" && look.vehicle !== "wheelchair") drawVehicle(g, look.vehicle);
  else if (look.companion !== "none") drawCompanion(g, look.companion);

  g.ellipse(0, 0, 9, 4.2).fill({ color: 0x000000, alpha: 0.16 });
  if (look.accessories.includes("backpack")) g.roundRect(-sw - 2.5, -19, 6, 10, 2).fill(0x6b5a48);
  drawBackHair(g, look);
  drawLegs(g, look, sw);
  drawTop(g, look, sw);
  const hand = drawArms(g, look, sw);
  drawHead(g, look);
  drawHat(g, look);
  for (const a of look.accessories) drawAccessory(g, a, look, sw, hand);
  drawHeld(g, look.held, hand, look.pose);
  if (look.vehicle === "wheelchair") drawWheelchair(g);
}

// ---------- 体 ----------

function drawLegs(g: Graphics, look: Look, sw: number) {
  const shoe = 0x2f2c29;
  if (look.top === "coverall" || look.top === "spacesuit") {
    const c = look.top === "spacesuit" ? WHITE : look.topColor;
    g.rect(-sw + 1.2, -8, sw - 1.4, 7.5).fill(shade(c, 0.92)).rect(0.2, -8, sw - 1.4, 7.5).fill(shade(c, 0.92));
    g.rect(-sw + 1, -1.2, sw - 1, 1.6).fill(shoe).rect(0.2, -1.2, sw - 1, 1.6).fill(shoe);
    return;
  }
  if (look.top === "dress" || look.top === "kimono" || look.top === "whitecoat") {
    // 裾の下の脚（白衣は下の服も見える）
    const c = look.top === "whitecoat" ? look.bottomColor : look.skin;
    g.rect(-3.2, -6, 2.4, 6).fill(c).rect(0.8, -6, 2.4, 6).fill(c);
    g.rect(-3.4, -1.2, 2.8, 1.6).fill(shoe).rect(0.6, -1.2, 2.8, 1.6).fill(shoe);
    return;
  }
  const c = look.top === "scrubs" ? look.topColor : look.bottomColor;
  switch (look.bottom) {
    case "skirt":
      g.rect(-3, -4, 2.2, 4).fill(look.skin).rect(0.8, -4, 2.2, 4).fill(look.skin);
      g.poly([-sw + 0.8, -8.5, sw - 0.8, -8.5, sw + 0.8, -3.5, -sw - 0.8, -3.5]).fill(c);
      break;
    case "shorts":
      g.rect(-3.2, -5, 2.4, 5).fill(look.skin).rect(0.8, -5, 2.4, 5).fill(look.skin);
      g.rect(-sw + 1, -8.5, sw * 2 - 2, 4).fill(c);
      break;
    default: {
      g.rect(-sw + 1.2, -8.5, sw - 1.4, 8).fill(c).rect(0.2, -8.5, sw - 1.4, 8).fill(c);
      if (look.bottom === "workpants") g.rect(-sw + 1.6, -5.5, 2, 2).fill(shade(c, 0.8)).rect(sw - 3.6, -5.5, 2, 2).fill(shade(c, 0.8));
      if (look.bottom === "jeans") g.moveTo(0, -8.5).lineTo(0, -1).stroke({ width: 0.6, color: shade(c, 0.75) });
    }
  }
  g.rect(-sw + 1, -1.2, sw - 1, 1.6).fill(shoe).rect(0.2, -1.2, sw - 1, 1.6).fill(shoe);
}

function torso(g: Graphics, sw: number, color: number, bottom = -8) {
  g.roundRect(-sw, -19, sw * 2, 19 + bottom + 0.5, 3.2).fill(color);
}

function drawTop(g: Graphics, look: Look, sw: number) {
  const c = look.topColor;
  switch (look.top) {
    case "tshirt":
      torso(g, sw, c);
      g.arc(0, -19, 2.2, 0, Math.PI).fill(look.skin);
      break;
    case "shirt":
      torso(g, sw, c);
      g.poly([-2.6, -19, 0, -16, 2.6, -19]).fill(WHITE).moveTo(0, -16).lineTo(0, -9).stroke({ width: 0.6, color: shade(c, 0.7) });
      break;
    case "polo":
      torso(g, sw, c);
      g.poly([-2.4, -19, 0, -17, 2.4, -19]).fill(shade(c, 1.25)).rect(-0.5, -17, 1, 3).fill(shade(c, 0.75));
      break;
    case "hoodie":
      torso(g, sw, c);
      g.roundRect(-3, -12.5, 6, 3, 1).fill(shade(c, 0.85));
      g.moveTo(-1.2, -19).lineTo(-1.2, -15).moveTo(1.2, -19).lineTo(1.2, -15).stroke({ width: 0.6, color: WHITE });
      break;
    case "suit":
      torso(g, sw, c);
      g.poly([-2.8, -19, 0, -13, 2.8, -19]).fill(WHITE);
      g.poly([-0.8, -18, 0.8, -18, 1.2, -13, 0, -11.8, -1.2, -13]).fill(0xb03a3a);
      break;
    case "cardigan":
      torso(g, sw, 0xf3f1ec);
      g.roundRect(-sw, -19, sw - 1, 11.5, 3).fill(c).roundRect(1, -19, sw - 1, 11.5, 3).fill(c);
      g.circle(0.6, -15, 0.6).fill(shade(c, 0.6)).circle(0.6, -12, 0.6).fill(shade(c, 0.6));
      break;
    case "vest":
      torso(g, sw, WHITE);
      g.poly([-sw, -18, -1.5, -18, 0, -11, -sw, -9]).fill(c).poly([sw, -18, 1.5, -18, 0, -11, sw, -9]).fill(c);
      break;
    case "apron":
      torso(g, sw, 0xf3f1ec);
      g.roundRect(-sw + 1.4, -16.5, sw * 2 - 2.8, 13, 1.5).fill(c);
      g.moveTo(-sw + 1.6, -16.5).lineTo(-2, -19).moveTo(sw - 1.6, -16.5).lineTo(2, -19).stroke({ width: 0.8, color: c });
      break;
    case "whitecoat":
      g.roundRect(-sw - 0.5, -19, sw * 2 + 1, 15, 2.5).fill(WHITE).stroke({ width: 0.6, color: 0xcfcfcf });
      g.poly([-2.6, -19, 0, -14, 2.6, -19]).fill(0x86c1e6);
      g.moveTo(0, -14).lineTo(0, -4.5).stroke({ width: 0.6, color: 0xc9c9c9 });
      g.rect(sw - 3.2, -12, 2, 2).fill(0x86c1e6);
      break;
    case "scrubs":
      torso(g, sw, c);
      g.poly([-2.4, -19, 0, -15.5, 2.4, -19]).fill(look.skin);
      g.rect(-sw + 1.2, -14, 2.4, 2).fill(shade(c, 0.85));
      break;
    case "coverall":
      torso(g, sw, c);
      g.poly([-2.6, -19, 0, -16.5, 2.6, -19]).fill(shade(c, 1.2));
      g.rect(-sw, -10.5, sw * 2, 1.4).fill(shade(c, 0.7)).rect(1, -16, 2.6, 2.4).fill(shade(c, 0.85));
      break;
    case "hivis":
      torso(g, sw, 0x5d6672);
      g.roundRect(-sw, -18.5, sw * 2, 11, 2.5).fill(0xf28c28);
      g.rect(-sw, -15, sw * 2, 1.2).fill(0xe8e8e8).rect(-sw, -11.5, sw * 2, 1.2).fill(0xe8e8e8);
      g.poly([-2, -19, 0, -16, 2, -19]).fill(0x5d6672);
      break;
    case "uniform":
      torso(g, sw, c);
      g.poly([-2.4, -19, 0, -15.5, 2.4, -19]).fill(WHITE);
      g.circle(-1.4, -13.5, 0.7).fill(0xf2c230).circle(-1.4, -11, 0.7).fill(0xf2c230).circle(1.4, -13.5, 0.7).fill(0xf2c230).circle(1.4, -11, 0.7).fill(0xf2c230);
      g.rect(-sw, -19, 2.6, 1.2).fill(0xf2c230).rect(sw - 2.6, -19, 2.6, 1.2).fill(0xf2c230);
      break;
    case "chefcoat":
      torso(g, sw, WHITE);
      g.roundRect(-sw, -19, sw * 2, 11.5, 3).stroke({ width: 0.5, color: 0xcfcfcf });
      for (const y of [-16, -13.5, -11]) g.circle(-1.5, y, 0.6).fill(0x9a9a9a).circle(1.5, y, 0.6).fill(0x9a9a9a);
      g.rect(-2.5, -19.5, 5, 1.2).fill(0xd6453d);
      break;
    case "jersey":
      torso(g, sw, c);
      g.rect(-sw, -19, sw * 2, 1.2).fill(WHITE).rect(-1.4, -16, 2.8, 5).fill(WHITE).rect(-0.5, -15, 1, 3).fill(c);
      break;
    case "happi":
      torso(g, sw, c);
      g.poly([-sw + 1.5, -19, 0, -10, sw - 1.5, -19, sw - 3, -19, 0, -12.5, -sw + 3, -19]).fill(WHITE);
      g.rect(-sw, -10, sw * 2, 1.6).fill(shade(c, 0.6));
      break;
    case "kimono":
      g.roundRect(-sw, -19, sw * 2, 14, 3).fill(c);
      g.poly([-2.8, -19, 1.5, -13, 2.8, -19, 1, -19, 0.6, -15.5, -1, -19]).fill(WHITE);
      g.rect(-sw, -13, sw * 2, 2.6).fill(shade(c, 0.6));
      break;
    case "dress":
      g.roundRect(-sw + 0.4, -19, sw * 2 - 0.8, 9, 3).fill(c);
      g.poly([-sw + 0.4, -11, sw - 0.4, -11, sw + 2, -4.5, -sw - 2, -4.5]).fill(c);
      g.arc(0, -19, 2.2, 0, Math.PI).fill(look.skin);
      break;
    case "spacesuit":
      torso(g, sw, WHITE);
      g.roundRect(-sw, -19, sw * 2, 11.5, 3).stroke({ width: 0.6, color: 0xc9cfd6 });
      g.moveTo(0, -18).lineTo(0, -9).stroke({ width: 0.8, color: 0x9fb3c8 });
      break;
    default:
      torso(g, sw, c);
  }
  if (FULL_BODY.has(look.top)) return;
}

/** 腕。ポーズで形が変わる。右手の位置を返す（持ち物を置く場所） */
function drawArms(g: Graphics, look: Look, sw: number): Hand {
  const sleeve = sleeveColor(look);
  const hand = look.accessories.includes("gloves") ? 0xf2c230 : look.skin;
  const arm = (x1: number, y1: number, x2: number, y2: number) => {
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.6, color: sleeve, cap: "round" });
    g.circle(x2, y2, 1.6).fill(hand);
  };
  switch (look.pose) {
    case "wave":
      arm(-sw - 0.6, -17.5, -sw - 1.2, -10);
      arm(sw + 0.6, -17.5, sw + 4.5, -26);
      return { x: sw + 4.5, y: -26 };
    case "work":
      arm(-sw - 0.4, -17.5, -2.5, -11);
      arm(sw + 0.4, -17.5, 3.5, -11.5);
      return { x: 3.5, y: -11.5 };
    case "carry":
      arm(-sw - 0.4, -17.5, -3, -12);
      arm(sw + 0.4, -17.5, 3, -12);
      return { x: 0, y: -12 };
    case "point":
      arm(-sw - 0.6, -17.5, -sw - 1.2, -10);
      arm(sw + 0.6, -17.5, sw + 9, -18.5);
      return { x: sw + 9, y: -18.5 };
    default:
      arm(-sw - 0.6, -17.5, -sw - 1.2, -10);
      arm(sw + 0.6, -17.5, sw + 1.2, -10);
      return { x: sw + 1.2, y: -10 };
  }
}

function sleeveColor(look: Look): number {
  switch (look.top) {
    case "whitecoat":
    case "chefcoat":
    case "spacesuit":
      return WHITE;
    case "vest":
    case "apron":
      return 0xf3f1ec;
    case "hivis":
      return 0x5d6672;
    case "tshirt":
    case "polo":
    case "jersey":
    case "scrubs":
      return look.topColor;
    default:
      return look.topColor;
  }
}

// ---------- 頭 ----------

function drawBackHair(g: Graphics, look: Look) {
  if (look.top === "spacesuit") return;
  const h = look.hairColor;
  switch (look.hair) {
    case "long":
      g.roundRect(-5.8, -27, 11.6, 12, 4).fill(h);
      break;
    case "ponytail":
      g.ellipse(-5.6, -22, 2.4, 4.4).fill(h);
      break;
    case "bun":
      g.circle(0, -30.5, 2.8).fill(h);
      break;
  }
}

function drawHead(g: Graphics, look: Look) {
  if (look.top === "spacesuit") {
    g.circle(0, -24, 6.4).fill(WHITE).stroke({ width: 0.6, color: 0xc9cfd6 });
    g.roundRect(-3.8, -26.5, 7.6, 5, 2).fill(look.skin);
    g.circle(-1.6, -24.2, 0.7).fill(INK).circle(1.6, -24.2, 0.7).fill(INK);
    return;
  }
  g.circle(0, -24, 5.4).fill(look.skin);
  const h = look.hairColor;
  switch (look.hair) {
    case "buzz":
      g.ellipse(0, -27, 5.2, 2.6).fill({ color: h, alpha: 0.75 });
      break;
    case "side":
      g.ellipse(0, -27.2, 5.6, 3).fill(h).poly([-5.5, -26.5, 2, -26.5, -4.5, -23]).fill(h);
      break;
    case "bob":
      g.ellipse(0, -26.8, 5.9, 3.4).fill(h).rect(-5.9, -26.8, 2.2, 6).fill(h).rect(3.7, -26.8, 2.2, 6).fill(h);
      break;
    case "curly":
      for (const [x, y] of [[-4, -27], [-1.5, -28.6], [1.5, -28.6], [4, -27], [-5, -24.5], [5, -24.5]] as const) g.circle(x, y, 2.2).fill(h);
      break;
    case "long":
      g.ellipse(0, -27, 5.8, 3.2).fill(h).rect(-5.8, -27, 1.8, 7).fill(h).rect(4, -27, 1.8, 7).fill(h);
      break;
    default:
      g.ellipse(0, -27, 5.6, 3).fill(h);
  }
  g.circle(-1.8, -23.8, 0.65).fill(INK).circle(1.8, -23.8, 0.65).fill(INK);
  g.circle(-3, -22.2, 0.9).fill({ color: 0xf08a8a, alpha: 0.35 }).circle(3, -22.2, 0.9).fill({ color: 0xf08a8a, alpha: 0.35 });
}

function drawHat(g: Graphics, look: Look) {
  switch (look.hat) {
    case "helmet":
    case "firehat":
    case "lamphelmet": {
      const c = look.hat === "firehat" ? 0xd6453d : look.hat === "lamphelmet" ? 0xe9e4d8 : 0xf2c230;
      g.ellipse(0, -27.4, 6.4, 4.2).fill(c).rect(-7.4, -27, 14.8, 1.8).fill(shade(c, 0.8));
      if (look.hat === "lamphelmet") g.circle(0, -29.5, 1.6).fill(0xfff3a0).stroke({ width: 0.5, color: 0x777777 });
      if (look.hat === "firehat") g.rect(-1, -31, 2, 3).fill(0xf2c230);
      break;
    }
    case "cap":
      g.ellipse(0, -27.6, 5.8, 3.2).fill(look.topColor === WHITE ? 0x3f78c4 : shade(look.topColor, 0.85)).rect(0, -27, 7.5, 1.6).fill(0x2c2c2a);
      break;
    case "police":
      g.rect(-5.8, -32, 11.6, 5).fill(0x1f3550).rect(-6.6, -27.4, 13.2, 1.8).fill(0x111f30).circle(0, -29.5, 1.1).fill(0xf2c230);
      break;
    case "pilot":
      g.ellipse(0, -30, 6.4, 2.6).fill(0x1f3550).rect(-5.6, -30, 11.2, 3).fill(0x1f3550).rect(-6.4, -27.4, 12.8, 1.6).fill(0x111111).rect(-2, -30, 4, 1).fill(0xf2c230);
      break;
    case "straw":
      g.ellipse(0, -26.4, 9.6, 2.6).fill(0xe3c26a).ellipse(0, -28.6, 4.8, 3.2).fill(0xd8b45a).rect(-4.6, -28, 9.2, 1.2).fill(0xd6453d);
      break;
    case "chef":
      g.rect(-4.4, -35, 8.8, 8.5).fill(WHITE).circle(-2.6, -35.5, 3.4).fill(WHITE).circle(2.6, -35.5, 3.4).fill(WHITE).circle(0, -37, 3.4).fill(WHITE);
      g.rect(-4.4, -28, 8.8, 1.4).stroke({ width: 0.5, color: 0xcfcfcf });
      break;
    case "hairnet":
      g.ellipse(0, -27.6, 6.2, 3.8).fill(WHITE).stroke({ width: 0.5, color: 0xcfcfcf });
      break;
    case "beret":
      g.ellipse(-0.8, -28.4, 6.2, 2.8).fill(look.topColor === WHITE ? 0x7d5ba6 : shade(look.topColor, 0.8)).circle(-0.8, -31.2, 0.9).fill(0x333333);
      break;
    case "headband":
      g.rect(-5.6, -27.6, 11.2, 2.2).fill(WHITE).poly([5.2, -27.4, 8, -29, 8, -25.6]).fill(WHITE);
      break;
    case "beanie":
      g.ellipse(0, -27.6, 5.9, 4).fill(0x7d5ba6).rect(-5.9, -27, 11.8, 2).fill(0x5e4482).circle(0, -31.8, 1.6).fill(0xe8e2f0);
      break;
    case "cowboy":
      g.ellipse(0, -27, 10, 2.4).fill(0x9c6b3d).roundRect(-4.6, -32.6, 9.2, 5.8, 2).fill(0x8a5a2b).rect(-4.6, -28.4, 9.2, 1.2).fill(0x5a3a1c);
      break;
    case "safari":
      g.ellipse(0, -27, 8.4, 2.2).fill(0xc9b98f).ellipse(0, -29.2, 5, 3.4).fill(0xd8c8a0).rect(-5, -28.6, 10, 1).fill(0x8a7a5a);
      break;
  }
}

// ---------- アクセサリー ----------

function drawAccessory(g: Graphics, id: string, look: Look, sw: number, hand: Hand) {
  void hand;
  switch (id) {
    case "glasses":
      g.circle(-1.9, -23.8, 1.6).stroke({ width: 0.7, color: 0x333333 }).circle(1.9, -23.8, 1.6).stroke({ width: 0.7, color: 0x333333 });
      break;
    case "sunglasses":
      g.roundRect(-3.8, -25, 3.4, 2.2, 0.8).fill(0x222222).roundRect(0.4, -25, 3.4, 2.2, 0.8).fill(0x222222);
      break;
    case "mask":
      g.roundRect(-3.4, -22.6, 6.8, 3.6, 1.2).fill(0xf4f6f8).stroke({ width: 0.4, color: 0xc9cfd6 });
      break;
    case "headset":
      g.arc(0, -25, 6.2, Math.PI, 0).stroke({ width: 1.2, color: 0x333333 });
      g.circle(-5.8, -24, 1.6).fill(0x333333).circle(5.8, -24, 1.6).fill(0x333333);
      g.moveTo(5.8, -23).lineTo(2.5, -20.4).stroke({ width: 0.9, color: 0x333333 });
      break;
    case "earmuffs":
      g.arc(0, -25, 6.4, Math.PI, 0).stroke({ width: 1.3, color: 0x555555 });
      g.circle(-6, -24, 2.4).fill(0xe0592b).circle(6, -24, 2.4).fill(0xe0592b);
      break;
    case "goggles":
      g.rect(-5.6, -27.4, 11.2, 1.2).fill(0x333333).roundRect(-4.6, -28.4, 4, 3, 1).fill(0x9fd0f0).roundRect(0.6, -28.4, 4, 3, 1).fill(0x9fd0f0);
      break;
    case "stethoscope":
      g.moveTo(-2.6, -19).quadraticCurveTo(-3, -13, 0, -12.5).quadraticCurveTo(2.6, -13, 2.6, -19).stroke({ width: 0.8, color: 0x555555 });
      g.circle(0.8, -12, 1.2).fill(0x9a9a9a);
      break;
    case "idcard":
      g.moveTo(-2, -19).lineTo(0, -14).lineTo(2, -19).stroke({ width: 0.6, color: 0x3f78c4 });
      g.rect(-1.6, -14, 3.2, 3.6).fill(WHITE).stroke({ width: 0.4, color: 0x9a9a9a });
      break;
    case "bowtie":
      g.poly([-2.6, -19.6, 0, -18.6, -2.6, -17.4]).fill(0xd6453d).poly([2.6, -19.6, 0, -18.6, 2.6, -17.4]).fill(0xd6453d);
      break;
    case "scarf":
      g.poly([-3.2, -19.4, 3.2, -19.4, 0, -16.6]).fill(0xd6453d).poly([0.6, -18, 2.6, -14, 1, -14]).fill(0xd6453d);
      break;
    case "toolbelt":
      g.rect(-sw, -9.8, sw * 2, 1.6).fill(0x6b4a2b).rect(-sw - 0.6, -9.6, 2.6, 3.2).fill(0x8a5a3c).rect(sw - 2, -9.6, 2.6, 3.2).fill(0x8a5a3c);
      break;
    case "armband":
      g.rect(-sw - 1.8, -16.5, 2.6, 2).fill(0xf2c230);
      break;
    case "whistle":
      g.moveTo(-2, -19).lineTo(0, -15).lineTo(2, -19).stroke({ width: 0.5, color: 0xd6453d });
      g.roundRect(-1, -15.4, 2.6, 1.6, 0.6).fill(0xc9cfd6);
      break;
    case "gloves":
    case "backpack":
      break; // 手と背中は別のところで描く
  }
  void look;
}

// ---------- 持ち物 ----------

function drawHeld(g: Graphics, id: string, h: Hand, pose: string) {
  const { x, y } = h;
  switch (id) {
    case "none":
      return;
    case "laptop":
      g.poly([x - 6, y + 1, x + 4, y + 1, x + 6, y + 3.5, x - 4, y + 3.5]).fill(0x4a4a4a);
      g.poly([x - 5, y + 1, x + 3, y + 1, x + 2, y - 5, x - 6, y - 5]).fill(0x9fd0f0);
      return;
    case "tablet":
      g.roundRect(x - 1, y - 7, 6, 8, 1).fill(0x333333).rect(x - 0.2, y - 6.2, 4.4, 6.2).fill(0xbfe3f5);
      return;
    case "clipboard":
      g.rect(x - 1, y - 7, 6, 8).fill(0xb07a4a).rect(x - 0.2, y - 6, 4.4, 6.4).fill(WHITE).rect(x + 0.8, y - 7.6, 2.4, 1.4).fill(0x9a9a9a);
      return;
    case "phone":
      g.roundRect(x - 1, y - 5, 3, 5, 0.8).fill(0x333333);
      return;
    case "briefcase":
      g.roundRect(x - 3, y, 7, 5, 1).fill(0x4a3324).rect(x - 0.5, y - 1.2, 2, 1.4).fill(0x4a3324);
      return;
    case "document":
      g.rect(x - 1, y - 6, 5, 7).fill(WHITE).stroke({ width: 0.4, color: 0xb4b2a9 });
      g.moveTo(x, y - 4).lineTo(x + 3, y - 4).moveTo(x, y - 2.5).lineTo(x + 3, y - 2.5).stroke({ width: 0.4, color: 0x9a9a9a });
      return;
    case "book":
      g.rect(x - 1, y - 6, 6, 8).fill(0x4f6d8f).rect(x, y - 5.4, 1.2, 7).fill(WHITE);
      return;
    case "pen":
      g.rect(x - 1, y - 5, 4.4, 6).fill(WHITE).stroke({ width: 0.4, color: 0xb4b2a9 }).moveTo(x + 3, y - 7).lineTo(x + 5, y - 1).stroke({ width: 1, color: 0x3f78c4 });
      return;
    case "blueprint":
      g.rect(x - 2, y - 8, 9, 7).fill(0x3f78c4).moveTo(x - 1, y - 6).lineTo(x + 5, y - 6).moveTo(x + 1, y - 7).lineTo(x + 1, y - 2).stroke({ width: 0.5, color: WHITE });
      return;
    case "calculator":
      g.roundRect(x - 1, y - 6, 5, 7, 1).fill(0x555555).rect(x - 0.2, y - 5.2, 3.4, 1.6).fill(0xbfe3b0);
      return;
    case "flask":
      g.poly([x, y - 9, x + 3, y - 9, x + 3, y - 5, x + 6, y + 1, x - 3, y + 1, x, y - 5]).fill(0xe8f4f8).poly([x - 1.8, y - 2, x + 4.8, y - 2, x + 6, y + 1, x - 3, y + 1]).fill(0x6fcf97);
      return;
    case "testtube":
      g.roundRect(x, y - 9, 2.4, 9, 1.2).fill(0xe8f4f8).roundRect(x, y - 4, 2.4, 4, 1.2).fill(0xe0592b);
      return;
    case "magnifier":
      g.moveTo(x, y).lineTo(x + 3, y - 3).stroke({ width: 1.4, color: 0x6b4a2b }).circle(x + 4.6, y - 4.6, 2.6).fill({ color: 0xbfe3f5, alpha: 0.7 }).stroke({ width: 1, color: 0x555555 });
      return;
    case "microscope":
      g.rect(x + 1, y + 2, 7, 1.6).fill(0x555555).rect(x + 4, y - 7, 1.8, 9).fill(0x777777).rect(x + 2.4, y - 9, 4.6, 2.4).fill(0x333333).rect(x + 3.2, y - 2, 4, 1).fill(0x9a9a9a);
      return;
    case "mic":
      g.moveTo(x, y).lineTo(x - 1, y - 5).stroke({ width: 1.4, color: 0x333333 }).circle(x - 1.2, y - 6.2, 1.8).fill(0x777777);
      return;
    case "guitar":
      g.ellipse(x - 2, y + 1, 4, 3.2).fill(0xc0763a).rect(x - 1, y - 9, 1.6, 9).fill(0x6b4423).circle(x - 2, y + 1, 1).fill(0x3a2a1a);
      return;
    case "baton":
      g.moveTo(x, y).lineTo(x + 6, y - 7).stroke({ width: 0.9, color: WHITE });
      return;
    case "brush":
      g.moveTo(x, y).lineTo(x + 5, y - 9).stroke({ width: 1.4, color: 0x8a5a3c }).circle(x + 5.3, y - 9.6, 1.6).fill(0xd4537e);
      return;
    case "palette":
      g.ellipse(x + 1, y - 2, 4.6, 3.4).fill(0xe6c99a).circle(x - 1, y - 3, 0.9).fill(0xd6453d).circle(x + 1.4, y - 4, 0.9).fill(0x3f78c4).circle(x + 3, y - 2, 0.9).fill(0xf2c230);
      return;
    case "camera":
      g.roundRect(x - 2, y - 6, 8, 5.6, 1.4).fill(0x333333).circle(x + 2, y - 3.2, 2).fill(0x9fd0f0);
      return;
    case "videocam":
      g.roundRect(x - 2, y - 9, 10, 6, 1.4).fill(0x333333).poly([x + 8, y - 8, x + 11, y - 9.5, x + 11, y - 2.5, x + 8, y - 4]).fill(0x555555).circle(x + 1, y - 10, 1.6).fill(0xd6453d);
      return;
    case "ball":
      g.circle(x + 1, y + 2, 3.4).fill(WHITE).stroke({ width: 0.7, color: 0x333333 }).circle(x + 1, y + 2, 1.2).fill(0x333333);
      return;
    case "racket":
      g.moveTo(x, y).lineTo(x + 3, y - 4).stroke({ width: 1.2, color: 0x333333 }).ellipse(x + 5, y - 7.5, 3, 4).stroke({ width: 1, color: 0x3f78c4 });
      return;
    case "wrench":
      g.moveTo(x, y).lineTo(x + 6, y - 8).stroke({ width: 1.8, color: 0x8d99ae }).circle(x + 6.4, y - 8.6, 1.8).stroke({ width: 1.4, color: 0x8d99ae });
      return;
    case "hammer":
      g.moveTo(x, y + 1).lineTo(x + 3, y - 7).stroke({ width: 1.4, color: 0x8a5a3c }).rect(x + 0.4, y - 9.4, 6, 2.6).fill(0x666666);
      return;
    case "drill":
      g.roundRect(x - 1, y - 6, 8, 4, 1.2).fill(0xf28c28).rect(x, y - 2.5, 2.6, 4.5).fill(0x333333).rect(x + 7, y - 4.6, 3.6, 1).fill(0x9a9a9a);
      return;
    case "shovel":
      g.moveTo(x, y - 8).lineTo(x + 1, y + 4).stroke({ width: 1.2, color: 0x8a5a3c }).poly([x - 1.4, y + 3, x + 3.4, y + 3, x + 1, y + 8]).fill(0x8d99ae);
      return;
    case "broom":
      g.moveTo(x, y - 9).lineTo(x - 1, y + 4).stroke({ width: 1, color: 0x8a5a3c }).poly([x - 4, y + 7, x + 2, y + 7, x, y + 2, x - 2, y + 2]).fill(0xd8c070);
      return;
    case "wateringcan":
      g.roundRect(x - 1, y - 3, 6, 5, 1.4).fill(0x5e9a4a).moveTo(x + 5, y - 1).lineTo(x + 9, y - 4).stroke({ width: 1.2, color: 0x5e9a4a });
      return;
    case "seedling":
      g.poly([x - 1, y - 2, x + 4, y - 2, x + 3.4, y + 2, x - 0.4, y + 2]).fill(0xb5653c).ellipse(x, y - 4.4, 2, 1.1).fill(0x5e9640).ellipse(x + 3, y - 5, 2, 1.1).fill(0x6fa64a);
      return;
    case "scissors":
      g.moveTo(x, y - 6).lineTo(x + 4, y).moveTo(x + 4, y - 6).lineTo(x, y).stroke({ width: 1, color: 0x8d99ae }).circle(x, y + 0.8, 1).stroke({ width: 0.8, color: 0xd6453d }).circle(x + 4, y + 0.8, 1).stroke({ width: 0.8, color: 0xd6453d });
      return;
    case "pan":
      g.ellipse(x + 3, y - 1, 4, 1.8).fill(0x333333).moveTo(x - 1, y - 1).lineTo(x - 5, y).stroke({ width: 1.2, color: 0x333333 }).ellipse(x + 3, y - 1.6, 1.6, 0.8).fill(0xf2c230);
      return;
    case "tray":
      g.ellipse(x + 1, y - 1, 5, 1.6).fill(0xb4b2a9).roundRect(x - 1, y - 5, 2.4, 4, 0.6).fill(0x8a5a3c).roundRect(x + 2, y - 4.6, 2, 3.6, 0.6).fill(0xf2c230);
      return;
    case "cup":
      g.roundRect(x - 1, y - 4, 3.4, 4, 0.8).fill(WHITE).stroke({ width: 0.4, color: 0x9a9a9a }).arc(x + 2.6, y - 2, 1.2, -Math.PI / 2, Math.PI / 2).stroke({ width: 0.6, color: 0x9a9a9a });
      return;
    case "box":
      g.rect(x - 5, y - 6, 10, 7).fill(0xc9a26a).rect(x - 5, y - 6, 10, 1.4).fill(0xb48a52).rect(x - 1, y - 6, 2, 7).fill({ color: 0xe8d3a8, alpha: 0.8 });
      return;
    case "mail":
      g.rect(x - 1, y - 5, 6, 4).fill(WHITE).stroke({ width: 0.4, color: 0x9a9a9a }).poly([x - 1, y - 5, x + 2, y - 3, x + 5, y - 5]).stroke({ width: 0.4, color: 0xd6453d });
      return;
    case "flag":
      g.moveTo(x, y + 2).lineTo(x, y - 12).stroke({ width: 0.9, color: 0x555555 }).poly([x, y - 12, x + 7, y - 10, x, y - 8]).fill(0xf2c230);
      return;
    case "megaphone":
      g.poly([x, y - 3, x + 3, y - 4, x + 8, y - 7, x + 8, y + 1, x + 3, y - 2, x, y - 1.6]).fill(WHITE).stroke({ width: 0.5, color: 0xd6453d });
      return;
    case "scale":
      g.moveTo(x + 2, y + 1).lineTo(x + 2, y - 9).moveTo(x - 2, y - 8).lineTo(x + 6, y - 8).stroke({ width: 0.9, color: 0xc9a43a });
      g.arc(x - 2, y - 5, 1.8, 0, Math.PI).stroke({ width: 0.8, color: 0xc9a43a }).arc(x + 6, y - 5, 1.8, 0, Math.PI).stroke({ width: 0.8, color: 0xc9a43a });
      return;
    case "map":
      g.poly([x - 2, y - 7, x + 2, y - 6, x + 6, y - 7, x + 6, y, x + 2, y + 1, x - 2, y]).fill(0xf3e7c4).moveTo(x + 2, y - 6).lineTo(x + 2, y + 1).stroke({ width: 0.4, color: 0xb4a07a });
      g.circle(x + 4, y - 3, 0.9).fill(0xd6453d);
      return;
    case "globe":
      g.circle(x + 1, y - 4, 3.6).fill(0x5fa8d3).ellipse(x, y - 5, 1.6, 1).fill(0x6fa64a).rect(x, y, 2, 1.6).fill(0x8a5a3c);
      return;
    case "binoculars":
      g.roundRect(-3.6, -25.6, 3.2, 3.2, 1).fill(0x333333).roundRect(0.4, -25.6, 3.2, 3.2, 1).fill(0x333333);
      return;
    case "net":
      g.moveTo(x, y + 2).lineTo(x + 4, y - 8).stroke({ width: 1, color: 0x8a5a3c }).ellipse(x + 5, y - 10, 3.4, 2.4).fill({ color: 0xffffff, alpha: 0.5 }).stroke({ width: 0.8, color: 0x555555 });
      return;
    case "bouquet":
      g.poly([x - 1, y + 2, x + 3, y + 2, x + 1, y - 2]).fill(0x8bbd5a).circle(x - 0.6, y - 3.4, 1.6).fill(0xe889a8).circle(x + 2.6, y - 3.6, 1.6).fill(0xf2c230).circle(x + 1, y - 5.4, 1.6).fill(0xd6453d);
      return;
    case "bucket":
      g.poly([x - 2, y - 1, x + 4, y - 1, x + 3.2, y + 5, x - 1.2, y + 5]).fill(0x8d99ae).arc(x + 1, y - 1, 3, Math.PI, 0).stroke({ width: 0.6, color: 0x555555 });
      return;
    case "basket":
      g.poly([x - 3, y - 1, x + 5, y - 1, x + 4, y + 4, x - 2, y + 4]).fill(0xd6453d).arc(x + 1, y - 1, 3.6, Math.PI, 0).stroke({ width: 0.8, color: 0xa33a32 });
      g.circle(x, y - 1.6, 1.2).fill(0xf2c230).circle(x + 2.4, y - 1.8, 1.2).fill(0x6fa64a);
      return;
    case "robot":
      g.roundRect(x - 1, y - 7, 6, 5, 1.2).fill(0xc9cfd6).rect(x - 0.4, y - 2, 4.8, 4).fill(0x9fb3c8).circle(x + 1, y - 4.6, 0.8).fill(0x3f78c4).circle(x + 3, y - 4.6, 0.8).fill(0x3f78c4);
      g.moveTo(x + 2, y - 7).lineTo(x + 2, y - 9).stroke({ width: 0.6, color: 0x555555 }).circle(x + 2, y - 9.4, 0.7).fill(0xd6453d);
      return;
    case "drone":
      g.rect(x + 2, y - 20, 6, 2).fill(0x333333).ellipse(x + 1, y - 21, 3, 0.8).fill({ color: 0x777777, alpha: 0.6 }).ellipse(x + 9, y - 21, 3, 0.8).fill({ color: 0x777777, alpha: 0.6 });
      g.roundRect(x - 1, y - 5, 4, 5, 1).fill(0x555555);
      return;
    case "paintroller":
      g.moveTo(x, y + 1).lineTo(x + 2, y - 7).stroke({ width: 1, color: 0x555555 }).roundRect(x, y - 10, 7, 3, 1.2).fill(0x86c1e6);
      return;
    case "pointer":
      g.moveTo(x, y).lineTo(x + 8, y - 6).stroke({ width: 0.9, color: 0x8a5a3c });
      return;
    case "syringe":
      g.rect(x, y - 5, 5.4, 2).fill({ color: 0xe8f4f8, alpha: 0.95 }).stroke({ width: 0.4, color: 0x9a9a9a }).moveTo(x + 5.4, y - 4).lineTo(x + 8, y - 4).stroke({ width: 0.5, color: 0x777777 });
      return;
  }
  void pose;
}

// ---------- 連れている動物 ----------

function drawCompanion(g: Graphics, id: string) {
  const x = -17;
  switch (id) {
    case "dog":
    case "cat": {
      const c = id === "dog" ? 0xb07a4a : 0x8a8a8a;
      g.ellipse(x, 0, 7, 2.4).fill({ color: 0x000000, alpha: 0.12 });
      g.ellipse(x, -4, 6.5, 3.6).fill(c).circle(x - 6, -7.5, 3.4).fill(c).circle(x - 7, -8, 0.6).fill(INK);
      if (id === "dog") g.ellipse(x - 4.6, -8.2, 1.4, 2.6).fill(shade(c, 0.7));
      else g.poly([x - 8.5, -10, x - 7.5, -13, x - 6, -10]).fill(c).poly([x - 5.5, -10, x - 4, -13, x - 3.5, -9.5]).fill(c);
      g.rect(x + 5, -7, 3.5, 1.4).fill(c);
      return;
    }
    case "cow":
      g.ellipse(x - 4, 0, 11, 3).fill({ color: 0x000000, alpha: 0.12 });
      g.rect(x - 11, -6, 2, 6).fill(0xe8e8e8).rect(x + 2, -6, 2, 6).fill(0xe8e8e8);
      g.ellipse(x - 4, -8, 10, 5.5).fill(WHITE).stroke({ width: 0.6, color: 0x9a9a9a });
      g.circle(x - 6, -9, 2.4).fill(0x2c2c2a).circle(x, -7, 1.8).fill(0x2c2c2a);
      g.ellipse(x - 14, -11, 3.6, 3).fill(WHITE).stroke({ width: 0.6, color: 0x9a9a9a }).ellipse(x - 15.5, -9.5, 1.8, 1.2).fill(0xf4b6b6);
      return;
    case "horse":
      g.ellipse(x - 4, 0, 11, 3).fill({ color: 0x000000, alpha: 0.12 });
      g.rect(x - 11, -7, 2, 7).fill(0x6b4423).rect(x + 2, -7, 2, 7).fill(0x6b4423);
      g.ellipse(x - 4, -10, 10, 5).fill(0x8a5a2b);
      g.poly([x - 12, -12, x - 16, -22, x - 12, -24, x - 9, -14]).fill(0x8a5a2b).rect(x - 12, -22, 2, 8).fill(0x3a2a1a);
      return;
    case "sheep":
      g.ellipse(x - 2, 0, 8, 2.4).fill({ color: 0x000000, alpha: 0.12 });
      for (const [dx, dy] of [[-6, -6], [-2, -8], [2, -6], [-2, -4], [-6, -3], [2, -3]] as const) g.circle(x + dx, dy - 1, 3).fill(0xf4f1ea);
      g.ellipse(x - 10, -7, 2.6, 2.2).fill(0x3a3632);
      return;
    case "pig":
      g.ellipse(x - 2, 0, 8, 2.4).fill({ color: 0x000000, alpha: 0.12 });
      g.ellipse(x - 2, -5, 7.4, 4.4).fill(0xf2b6c0).ellipse(x - 9, -6, 2.2, 1.8).fill(0xe08a9a).poly([x - 6, -9, x - 4, -11, x - 3.5, -8.5]).fill(0xe08a9a);
      return;
    case "chicken":
      g.ellipse(x, -4, 4.6, 3.6).fill(WHITE).stroke({ width: 0.4, color: 0xcfcfcf }).circle(x - 3.6, -7.4, 2.2).fill(WHITE).poly([x - 4, -9.8, x - 3, -11, x - 2.4, -9.6]).fill(0xd6453d).poly([x - 5.8, -7.6, x - 7.2, -7, x - 5.8, -6.6]).fill(0xf2c230);
      return;
    case "rabbit":
      g.ellipse(x, -3.6, 4.6, 3.4).fill(WHITE).stroke({ width: 0.4, color: 0xcfcfcf }).circle(x - 3.4, -6.4, 2.4).fill(WHITE);
      g.ellipse(x - 4.2, -11, 0.9, 3).fill(WHITE).ellipse(x - 2.6, -11, 0.9, 3).fill(WHITE).circle(x - 4.2, -6.6, 0.5).fill(0xd6453d);
      return;
    case "bird":
      g.circle(6, -21, 2.6).fill(0x7cc0d8).poly([8.4, -21, 10.6, -20, 8.4, -19.4]).fill(0xf2c230);
      return;
    case "fishtank":
      g.rect(x - 7, -10, 12, 9).fill({ color: 0x7cc0d8, alpha: 0.8 }).stroke({ width: 0.8, color: 0x5a7a8a });
      g.ellipse(x - 3, -6, 2.4, 1.2).fill(0xf28b3c).poly([x - 0.6, -6, x + 1.4, -7.2, x + 1.4, -4.8]).fill(0xf28b3c);
      return;
    case "penguin":
      g.ellipse(x, -5, 3.6, 5.4).fill(0x2c2c2a).ellipse(x - 0.6, -4.4, 2.4, 4).fill(WHITE).poly([x - 3.4, -8, x - 5, -7.4, x - 3.4, -7]).fill(0xf2c230);
      return;
    case "giraffe":
      g.ellipse(x - 4, 0, 9, 2.6).fill({ color: 0x000000, alpha: 0.12 });
      g.rect(x - 9, -9, 1.8, 9).fill(0xe0b04a).rect(x + 1, -9, 1.8, 9).fill(0xe0b04a);
      g.ellipse(x - 4, -11, 8, 4.4).fill(0xf0c45a);
      g.poly([x - 11, -12, x - 8, -12, x - 11, -36, x - 13, -36]).fill(0xf0c45a);
      g.ellipse(x - 13, -37, 3.4, 2.2).fill(0xf0c45a);
      for (const [dx, dy] of [[-6, -12], [-2, -10], [1, -12], [-11, -20], [-12, -28]] as const) g.circle(x + dx, dy, 1.2).fill(0xb07a2a);
      return;
    case "plant":
      g.poly([x - 4, -6, x + 4, -6, x + 3, 0, x - 3, 0]).fill(0xb5653c);
      g.ellipse(x - 3, -10, 3.2, 1.8).fill(0x5e9640).ellipse(x + 3, -11, 3.2, 1.8).fill(0x6fa64a).rect(x - 0.5, -12, 1, 6).fill(0x4c7a34);
      return;
  }
}

// ---------- 乗り物（横から見た形） ----------

function wheels(g: Graphics, xs: number[], y = -2.4, r = 2.8) {
  for (const x of xs) g.circle(x, y, r).fill(0x2c2c2a).circle(x, y, r * 0.4).fill(0x9a9a9a);
}

function drawVehicle(g: Graphics, id: string) {
  const x = -32;
  g.ellipse(x + 2, 1, 17, 4.4).fill({ color: 0x000000, alpha: 0.13 });
  switch (id) {
    case "car":
    case "taxi":
    case "patrolcar": {
      const body = id === "taxi" ? 0xf2c230 : id === "patrolcar" ? WHITE : 0x5e81ac;
      g.roundRect(x - 12, -12, 26, 9.5, 3).fill(body);
      if (id === "patrolcar") g.roundRect(x - 12, -7.5, 26, 5, 2).fill(0x2c2c2a);
      g.roundRect(x - 6, -19, 15, 8, 3).fill(id === "patrolcar" ? 0x2c2c2a : body);
      g.rect(x - 4, -17, 5, 5).fill(0xd8ecf6).rect(x + 2.5, -17, 5, 5).fill(0xd8ecf6);
      if (id === "taxi") g.rect(x - 1, -22, 6, 3).fill(0xd6453d);
      if (id === "patrolcar") g.rect(x - 1, -21.5, 3, 2.5).fill(0xd6453d).rect(x + 2, -21.5, 3, 2.5).fill(0x3f78c4);
      wheels(g, [x - 6, x + 8]);
      return;
    }
    case "truck":
      g.rect(x - 16, -22, 20, 19).fill(WHITE).stroke({ width: 0.5, color: 0xcfcfcf }).rect(x - 14, -18, 16, 3).fill(0x2a9d8f);
      g.roundRect(x + 4, -15, 10, 12, 2).fill(0x2a9d8f).rect(x + 8, -13, 5, 4.5).fill(0xd8ecf6);
      wheels(g, [x - 10, x + 9]);
      return;
    case "bus":
      g.roundRect(x - 22, -22, 40, 19, 4).fill(0x3f9a6a).rect(x - 22, -8, 40, 2.4).fill(0xf2c230);
      for (let i = 0; i < 5; i++) g.rect(x - 19 + i * 7, -19, 5, 6).fill(0xd8ecf6);
      wheels(g, [x - 14, x + 10], -2.4, 3.2);
      return;
    case "ambulance":
      g.roundRect(x - 16, -20, 30, 17, 3).fill(WHITE).stroke({ width: 0.5, color: 0xcfcfcf });
      g.rect(x - 16, -11, 30, 2.4).fill(0xd6453d).rect(x - 6, -18, 2, 6).fill(0xd6453d).rect(x - 8, -16, 6, 2).fill(0xd6453d);
      g.rect(x + 6, -18, 6, 5).fill(0xd8ecf6).rect(x - 2, -23, 4, 3).fill(0xd6453d);
      wheels(g, [x - 9, x + 8]);
      return;
    case "firetruck":
      g.roundRect(x - 20, -18, 36, 15, 3).fill(0xd6453d).rect(x + 6, -16, 7, 5).fill(0xd8ecf6);
      g.moveTo(x - 18, -21).lineTo(x + 4, -21).stroke({ width: 1.4, color: 0xd9d4c7 });
      for (let i = 0; i < 6; i++) g.moveTo(x - 17 + i * 4, -22).lineTo(x - 17 + i * 4, -19.5).stroke({ width: 0.8, color: 0xd9d4c7 });
      wheels(g, [x - 12, x + 9]);
      return;
    case "forklift":
      g.roundRect(x - 6, -14, 14, 11, 2).fill(0xf2c230).rect(x - 3, -22, 1.4, 8).fill(0x333333).rect(x + 5, -22, 1.4, 8).fill(0x333333).rect(x - 3, -22, 9.4, 1.2).fill(0x333333);
      g.rect(x - 12, -18, 1.6, 16).fill(0x555555).rect(x - 16, -4, 6, 1.4).fill(0x555555).rect(x - 16, -10, 6, 5).fill(0xc9a26a);
      wheels(g, [x - 3, x + 6], -2.4, 2.6);
      return;
    case "bicycle":
      g.circle(x - 6, -4, 4).stroke({ width: 1, color: 0x333333 }).circle(x + 6, -4, 4).stroke({ width: 1, color: 0x333333 });
      g.moveTo(x - 6, -4).lineTo(x - 1, -10).lineTo(x + 4, -10).lineTo(x + 6, -4).moveTo(x - 1, -10).lineTo(x, -4).stroke({ width: 1.2, color: 0x3f78c4 });
      return;
    case "scooter":
      g.circle(x - 7, -3.4, 3.2).fill(0x2c2c2a).circle(x + 7, -3.4, 3.2).fill(0x2c2c2a);
      g.roundRect(x - 9, -10, 16, 5, 2).fill(0xd6453d).rect(x + 5, -16, 1.4, 8).fill(0x555555).rect(x - 11, -18, 8, 8).fill(0xf2c230);
      return;
    case "tractor":
      g.roundRect(x - 10, -13, 18, 9, 2).fill(0x5e9a4a).rect(x - 8, -22, 10, 9).fill({ color: 0xd8ecf6, alpha: 0.8 }).stroke({ width: 1, color: 0x5e9a4a });
      g.circle(x - 7, -5, 6).fill(0x2c2c2a).circle(x - 7, -5, 2.4).fill(0xf2c230).circle(x + 7, -3, 3.4).fill(0x2c2c2a).circle(x + 7, -3, 1.4).fill(0xf2c230);
      return;
    case "excavator":
      g.rect(x - 14, -6, 20, 4).fill(0x444444).roundRect(x - 12, -16, 14, 10, 2).fill(0xf2c230).rect(x - 9, -14, 5, 5).fill(0xd8ecf6);
      g.moveTo(x + 1, -14).lineTo(x + 10, -24).lineTo(x + 16, -12).stroke({ width: 2.4, color: 0xe0a92a }).poly([x + 13, -12, x + 19, -12, x + 17, -7]).fill(0x666666);
      return;
    case "cart":
      g.rect(x - 4, -6, 16, 2).fill(0x8d99ae).moveTo(x + 12, -6).lineTo(x + 14, -16).stroke({ width: 1, color: 0x8d99ae });
      g.rect(x - 2, -14, 9, 8).fill(0xc9a26a).rect(x - 2, -14, 9, 1.4).fill(0xb48a52);
      wheels(g, [x - 1, x + 9], -1.8, 1.8);
      return;
  }
}

/** 車いすは人の前に置く（押している形） */
function drawWheelchair(g: Graphics) {
  const x = 15;
  g.circle(x, -5, 5).stroke({ width: 1.2, color: 0x555555 }).circle(x + 6, -2, 2).stroke({ width: 1, color: 0x555555 });
  g.moveTo(x - 4, -16).lineTo(x - 2, -8).lineTo(x + 7, -8).lineTo(x + 7, -4).stroke({ width: 1.4, color: 0x3f78c4 });
  g.moveTo(x - 4, -16).lineTo(x - 7, -16).stroke({ width: 1.2, color: 0x555555 });
}

/** 押せる範囲（乗り物や動物も含める） */
export function personHitArea(look: Look): { x: number; y: number; w: number; h: number } {
  const left = look.vehicle === "bus" ? -56 : look.vehicle !== "none" && look.vehicle !== "wheelchair" ? -50 : look.companion !== "none" ? -34 : -12;
  const right = look.vehicle === "wheelchair" ? 24 : look.pose === "point" ? 18 : 12;
  const top = look.companion === "giraffe" ? -48 : look.hat === "chef" ? -42 : -38;
  return { x: left, y: top, w: right - left, h: -top + 4 };
}
