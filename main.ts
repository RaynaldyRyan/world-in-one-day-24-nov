// THE WORLD IN ONE DAY — Tuesday 24 November 2026
// A newspaper-style summary of the day's verified world news, drawn
// programmatically with a hand-made 5x8 bitmap font and a hand-written
// PNG encoder. Node standard library only, no network, fully deterministic.
//
// Locked story list: ../news-image-20261124-story-list.md
// Every main-area story was verified as happening, or first reported,
// on Tuesday 24 November 2026. Stories from other dates appear ONLY in
// the footer DATE CHECK strip, labelled with their real date.

import * as fs from "node:fs";
import * as path from "node:path";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------- palette
const CREAM: RGB = [247, 243, 232];
const INK: RGB = [20, 17, 15];
const ACCENT: RGB = [179, 64, 42];
const GREY: RGB = [138, 131, 120];
const LIGHT: RGB = [228, 220, 200];
const LAND: RGB = [216, 210, 196];

type RGB = [number, number, number];

const W = 1024;
const H = 1024;
const MARGIN = 24;
const CW = W - MARGIN * 2; // 976

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 3);

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(xx, yy, c);
  }
}

function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  fillRect(x, y, w, t, c);
}

function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  fillRect(x, y, t, h, c);
}

function outlineRect(x: number, y: number, w: number, h: number, c: RGB, t = 1): void {
  hline(x, y, w, c, t);
  hline(x, y + h - t, w, c, t);
  vline(x, y, h, c, t);
  vline(x + w - t, y, h, c, t);
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let xx = cx - dx; xx <= cx + dx; xx++) setPixel(xx, cy + dy, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    setPixel(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

// Bresenham line
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    fillRect(x, y, t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: [number, number, number, number][] = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(Math.round(ax + ((y - ay) * (bx - ax)) / (by - ay)));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      for (let x = lo; x <= hi; x++) setPixel(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- 5x8 font
// Each glyph: 8 rows of 5 bits. All text is rendered in capitals.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001", "00000"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110", "00000"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110", "00000"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110", "00000"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111", "00000"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000", "00000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111", "00000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001", "00000"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110", "00000"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100", "00000"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001", "00000"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111", "00000"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001", "00000"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001", "00000"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110", "00000"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000", "00000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101", "00000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001", "00000"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110", "00000"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100", "00000"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110", "00000"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100", "00000"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001", "00000"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001", "00000"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100", "00000"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110", "00000"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110", "00000"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111", "00000"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110", "00000"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010", "00000"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110", "00000"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110", "00000"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000", "00000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110", "00000"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000", "00000"],
  "—": ["00000", "00000", "00000", "11111", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010", "00000"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000", "00000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100", "00000"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000", "00000"],
  "•": ["00000", "00000", "01100", "01100", "01100", "00000", "00000", "00000"],
  "×": ["00000", "10001", "01010", "00100", "01010", "10001", "00000", "00000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111", "00000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110", "00000"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110", "00000"],
};

const BLANK = ["00000", "00000", "00000", "00000", "00000", "00000", "00000", "00000"];

function glyph(ch: string): string[] {
  const up = ch.toUpperCase();
  if (up === "’" || up === "‘") return FONT["'"];
  return FONT[up] ?? BLANK;
}

function textWidth(text: string, scale: number, tracking = 2): number {
  const t = text.toUpperCase();
  if (t.length === 0) return 0;
  return t.length * (5 * scale + tracking) - tracking;
}

function drawText(x: number, y: number, text: string, scale: number, c: RGB, tracking = 2): void {
  const t = text.toUpperCase();
  let cx = x;
  for (const ch of t) {
    const g = glyph(ch);
    for (let r = 0; r < 8; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 5 * scale + tracking;
  }
}

function drawTextCentered(cx: number, y: number, text: string, scale: number, c: RGB, tracking = 2): void {
  drawText(cx - Math.floor(textWidth(text, scale, tracking) / 2), y, text, scale, c, tracking);
}

function wrapText(text: string, maxWidth: number, scale: number, tracking = 2): string[] {
  const words = text.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale, tracking) <= maxWidth) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- illustration bands
// All scenes are flat duotone: ink + grey + one accent, drawn from primitives.

function bandGaza(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const base = y + h;
  // ruined skyline, ink
  fillRect(x + 8, base - 26, 34, 26, INK);
  fillRect(x + 48, base - 38, 26, 38, INK);
  fillRect(x + 80, base - 20, 40, 20, INK);
  fillRect(x + 126, base - 32, 22, 32, INK);
  // broken top on the tall block
  fillTriangle(x + 48, base - 38, x + 61, base - 48, x + 74, base - 38, INK);
  // smoke plume, grey
  fillCircle(x + 62, base - 52, 7, GREY);
  fillCircle(x + 70, base - 60, 9, GREY);
  fillCircle(x + 58, base - 68, 6, GREY);
  // one accent window
  fillRect(x + 14, base - 18, 8, 8, ACCENT);
  fillRect(x + 130, base - 24, 6, 6, ACCENT);
}

function bandKorea(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const base = y + h;
  // sea
  fillRect(x, base - 14, w, 14, GREY);
  // island hill, ink
  fillTriangle(x + 18, base - 14, x + 44, base - 34, x + 70, base - 14, INK);
  // jets: small ink triangles with accent trails
  fillTriangle(x + 96, y + 8, x + 110, y + 14, x + 96, y + 20, INK);
  fillTriangle(x + 118, y + 18, x + 132, y + 24, x + 118, y + 30, INK);
  line(x + 84, y + 14, x + 94, y + 14, ACCENT, 2);
  line(x + 106, y + 24, x + 116, y + 24, ACCENT, 2);
  // alert triangle, accent
  fillTriangle(x + w - 34, y + 6, x + w - 20, y + 6, x + w - 27, y + 26, ACCENT);
  fillRect(x + w - 28, y + 12, 2, 7, CREAM);
  fillRect(x + w - 28, y + 21, 2, 2, CREAM);
}

function bandMarkets(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const base = y + h - 6;
  const bw = 18;
  const gap = 10;
  const heights = [10, 16, 14, 24, 34];
  for (let i = 0; i < 5; i++) {
    const bx = x + 10 + i * (bw + gap);
    fillRect(bx, base - heights[i], bw, heights[i], i === 4 ? ACCENT : INK);
  }
  // rising arrow
  line(x + 12, base - 12, x + w - 12, base - 36, ACCENT, 3);
  fillTriangle(x + w - 12, base - 36, x + w - 26, base - 38, x + w - 14, base - 26, ACCENT);
}

function bandMoon(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  fillCircle(cx, cy, 15, INK);
  fillCircle(cx - 5, cy - 4, 3, GREY);
  fillCircle(cx + 5, cy + 5, 2, GREY);
  fillCircle(cx + 6, cy - 6, 2, GREY);
  // accent stars
  const stars: [number, number][] = [
    [x + 8, y + 6],
    [x + w - 10, y + 8],
    [x + w - 16, y + h - 8],
    [x + 12, y + h - 9],
  ];
  for (const [sx, sy] of stars) {
    fillRect(sx - 3, sy, 7, 1, ACCENT);
    fillRect(sx, sy - 3, 1, 7, ACCENT);
  }
}

function bandTravel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const roadY = y + h - 14;
  fillRect(x, roadY, w, 10, INK);
  for (let dx = x + 4; dx < x + w - 4; dx += 16) fillRect(dx, roadY + 4, 8, 2, CREAM);
  // cars
  fillRect(x + 14, roadY - 8, 22, 8, ACCENT);
  fillRect(x + 62, roadY - 8, 22, 8, INK);
  fillRect(x + 110, roadY - 8, 22, 8, INK);
  // plane above
  fillTriangle(x + 60, y + 4, x + 84, y + 10, x + 60, y + 16, INK);
  fillRect(x + 84, y + 8, 22, 3, INK);
  line(x + 58, y + 10, x + 46, y + 10, ACCENT, 2);
}

function bandLaptop(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  // laptop screen
  fillRect(x + 22, y + 4, w - 44, h - 14, INK);
  fillRect(x + 26, y + 8, w - 52, h - 22, CREAM);
  // rising chart inside the screen
  line(x + 30, y + h - 16, x + w - 30, y + 12, ACCENT, 2);
  fillRect(x + 30, y + h - 16, 3, 3, ACCENT);
  fillRect(x + w - 32, y + 10, 3, 3, ACCENT);
  // base
  fillRect(x + 14, y + h - 8, w - 28, 4, INK);
}

function bandGazaCity(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const base = y + h;
  fillRect(x + 6, base - 18, 30, 18, INK);
  fillRect(x + 42, base - 30, 24, 30, INK);
  fillRect(x + 72, base - 14, 44, 14, INK);
  fillRect(x + 122, base - 24, 20, 24, INK);
  fillCircle(x + 54, base - 34, 6, GREY);
  fillCircle(x + 60, base - 42, 8, GREY);
  fillRect(x + 12, base - 12, 6, 6, ACCENT);
  fillRect(x + 126, base - 18, 6, 6, ACCENT);
}

function bandBars(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, LIGHT);
  const base = y + h - 5;
  const heights = [8, 14, 20, 28];
  for (let i = 0; i < 4; i++) {
    const bx = x + 12 + i * 34;
    fillRect(bx, base - heights[i], 20, heights[i], i === 3 ? ACCENT : INK);
  }
}

// ---------------------------------------------------------------- content (locked list)
const LEADS = [
  {
    kicker: "LEAD 1 - GAZA",
    head: ["GAZA", "3 KILLED"],
    deck: ["KHAN YOUNIS OUTPOST HIT", "5 WOUNDED, MEDICS SAY"],
    band: bandGaza,
  },
  {
    kicker: "LEAD 2 - KOREA",
    head: ["JETS", "SPARK ALERT"],
    deck: ["RUSSIAN JETS IN SEOUL'S", "DEFENCE ZONE; ALERT 3 MIN"],
    band: bandKorea,
  },
  {
    kicker: "LEAD 3 - MARKETS",
    head: ["KOSPI", "+5.9% UP"],
    deck: ["SEOUL KOSPI +5.9% AS", "CHIP SHARES RALLY"],
    band: bandMarkets,
  },
];

const MEDIUMS = [
  {
    kicker: "SCIENCE",
    head: ["SUPERMOON", "PEAKS", "14:53 UTC"],
    deck: ["BEAVER MOON", "AT CLOSEST"],
    band: bandMoon,
  },
  {
    kicker: "UNITED STATES",
    head: ["81.5M", "SET TO", "TRAVEL"],
    deck: ["HOLIDAY WEEK", "BEGINS 24 NOV"],
    band: bandTravel,
    lookingAhead: true, // AAA 81.5M is a forecast (published 16 Nov) for 24-30 Nov
  },
  {
    kicker: "BUSINESS",
    head: ["DELL", "REPORTS", "AFTER BELL"],
    deck: ["EARNINGS DUE", "AFTER CLOSE"],
    band: bandLaptop,
    lookingAhead: true, // scheduled event: results after the bell on 24 Nov
  },
  {
    kicker: "GAZA",
    head: ["GAZA CITY", "MORE", "STRIKES"],
    deck: ["PALESTINIAN", "MEDIA REPORT"],
    band: bandGazaCity,
  },
  {
    kicker: "MARKETS",
    big: "+5.9%",
    sub: "KOSPI, SEOUL",
    deck: ["SK HYNIX +8.1%", "SAMSUNG +6.8%"],
    band: bandBars,
  },
];

const BRIEFS: string[] = [
  "KHAN YOUNIS: 3 KILLED",
  "GAZA CITY: STRIKE HIT",
  "ULLEUNG ALERT: 3 MIN",
  "SEOUL: JETS SCRAMBLED",
  "KOSPI +5.9% TO 4,988",
  "SK HYNIX +8.1% SEOUL",
  "SAMSUNG +6.8%",
  "SAMSUNG E-M +11.1%",
  "KOSDAQ +4.7%",
  "MOON PEAKS 14:53 UTC",
  "81.5M TRAVEL 24-30 NOV",
  "5.96M EXPECTED TO FLY",
  "DELL EARNINGS DUE",
  "MOONRISE BEST 23-24 NOV",
];

const DATECHECK: string[] = [
  "23 NOV: NVIDIA REINSTATES HUANG - FIFA NAMES 2031 HOSTS - O'HARE GROUND STOP",
  "23 NOV: DENMARK BACKS GHETTO LAW - UN AI SAFETY CALL - US SANCTIONS IRAN",
  "22-23 NOV: UKRAINE CLAIMS LIBYA SHIP SINKING - 450 SCHOOLS GET HOAX THREATS",
  "23 NOV: INDONESIA FIRE TOLL 24 - BANGLADESH PAY TALKS FAIL - LIBYA CONDEMNS",
];

// ---------------------------------------------------------------- draw the page
fillRect(0, 0, W, H, CREAM);

// Masthead
drawTextCentered(W / 2, 24, "THE WORLD IN ONE DAY", 9, INK, 2);
hline(MARGIN, 104, CW, INK, 3);
hline(MARGIN, 110, CW, ACCENT, 2);

// Date — larger than any story headline
drawTextCentered(W / 2, 118, "TUESDAY 24 NOVEMBER 2026", 7, INK, 2);
drawTextCentered(
  W / 2,
  182,
  "VERIFIED 24 NOVEMBER 2026 - SOURCES: REUTERS / AP / BBC",
  2,
  GREY,
  2
);
hline(MARGIN, 206, CW, INK, 2);

// Stat strip: 3 large numerals, each labelled
const STATS: [string, string][] = [
  ["3", "KILLED IN KHAN YOUNIS"],
  ["+5.9%", "KOSPI RISE IN SEOUL, 24 NOV"],
  ["81.5M", "EXPECTED TO TRAVEL 24-30 NOV"],
];
const cellW = CW / 3;
for (let i = 0; i < 3; i++) {
  const cx = MARGIN + cellW * i + cellW / 2;
  drawTextCentered(cx, 214, STATS[i][0], 6, i === 1 ? ACCENT : INK, 2);
  // index 2 label is 28 chars: tracking 1 keeps it inside its 325px cell
  // (tracking 2 would be 334px and bleed into the neighbouring stat)
  drawTextCentered(cx, 268, STATS[i][1], 2, INK, i === 2 ? 1 : 2);
  if (i > 0) vline(Math.round(MARGIN + cellW * i), 218, 62, GREY, 1);
}
hline(MARGIN, 292, CW, INK, 2);

// Lead zone: 3 large cards
const leadW = 312;
const leadGap = 20;
const leadY = 300;
const leadH = 240;
for (let i = 0; i < 3; i++) {
  const x = MARGIN + i * (leadW + leadGap);
  const y = leadY;
  outlineRect(x, y, leadW, leadH, INK, 2);
  const ix = x + 12; // inner left
  const iw = leadW - 24; // inner width
  // kicker with accent square
  fillRect(ix, y + 14, 10, 10, ACCENT);
  drawText(ix + 16, y + 12, LEADS[i].kicker, 2, INK, 2);
  // headline, scale 5, tracking 1
  let hy = y + 36;
  for (const ln of LEADS[i].head) {
    drawText(ix, hy, ln, 5, INK, 1);
    hy += 44;
  }
  // illustration band
  const by = y + 132;
  LEADS[i].band(ix, by, iw, 48);
  // deck, scale 2
  let dy = y + 192;
  for (const ln of LEADS[i].deck) {
    drawText(ix, dy, ln, 2, INK, 2);
    dy += 20;
  }
}

// Medium zone: 5 cards in one row
const medW = 184;
const medGap = 15;
const medY = 548;
const medH = 200;
for (let i = 0; i < 5; i++) {
  const x = MARGIN + i * (medW + medGap);
  const y = medY;
  outlineRect(x, y, medW, medH, INK, 1);
  const ix = x + 10;
  const iw = medW - 20;
  const m = MEDIUMS[i] as { kicker: string; head?: string[]; big?: string; sub?: string; deck: string[]; band: (x: number, y: number, w: number, h: number) => void; lookingAhead?: boolean };
  const la = m.lookingAhead === true;
  fillRect(ix, y + 12, 8, 8, ACCENT);
  if (la) {
    // Forecast/scheduled item: second kicker line flags it LOOKING AHEAD.
    // Kicker moved up 2px so the two 16px lines stack without touching.
    drawText(ix + 12, y + 8, MEDIUMS[i].kicker, 2, INK, 2);
    drawText(ix + 12, y + 24, "LOOKING AHEAD", 2, ACCENT, 2);
  } else {
    drawText(ix + 12, y + 10, MEDIUMS[i].kicker, 2, INK, 2);
  }
  if (m.big) {
    drawTextCentered(x + medW / 2, y + 30, m.big, 5, ACCENT, 1);
    drawTextCentered(x + medW / 2, y + 74, m.sub ?? "", 2, INK, 2);
    m.band(ix, y + 94, iw, 36);
    drawText(ix, y + 138, m.deck[0], 2, INK, 2);
    drawText(ix, y + 158, m.deck[1], 2, INK, 2);
  } else {
    // LOOKING AHEAD cards: headline/band/deck shift down 14px (tighter
    // 26px headline spacing) to make room for the second kicker line.
    const headY = la ? y + 44 : y + 30;
    const headStep = la ? 26 : 28;
    const bandY = la ? y + 124 : y + 114;
    const deckY = la ? y + 164 : y + 158;
    let hy = headY;
    for (const ln of m.head ?? []) {
      drawText(ix, hy, ln, 3, INK, 1);
      hy += headStep;
    }
    m.band(ix, bandY, iw, 36);
    drawText(ix, deckY, m.deck[0], 2, INK, 2);
    drawText(ix, deckY + 20, m.deck[1], 2, INK, 2);
  }
}

// Briefs + map zone
const briefY = 752;
drawText(MARGIN, briefY, "WORLD BRIEFS", 2, INK, 2);
hline(MARGIN, briefY + 20, 640, INK, 1);
const briefColW = 312;
const briefGap = 16;
for (let i = 0; i < 14; i++) {
  const col = i < 7 ? 0 : 1;
  const row = i % 7;
  const bx = MARGIN + col * (briefColW + briefGap);
  const by = briefY + 26 + row * 17;
  drawText(bx, by, String(i + 1).padStart(2, "0"), 2, ACCENT, 2);
  drawText(bx + 30, by, BRIEFS[i], 2, INK, 2);
}

// Schematic world map (right column)
const mapX0 = 680;
const mapX1 = 1000;
const mapY0 = 752;
drawText(mapX0, mapY0, "WHERE IT HAPPENED", 2, INK, 2);
hline(mapX0, mapY0 + 20, mapX1 - mapX0, INK, 1);
const mx0 = mapX0 + 8;
const my0 = mapY0 + 28;
const mw = mapX1 - mapX0 - 16; // 304
const mh = 100;
function lonLat(lon: number, lat: number): [number, number] {
  return [Math.round(mx0 + ((lon + 170) / 360) * mw), Math.round(my0 + ((75 - lat) / 130) * mh)];
}
function poly(points: [number, number][]): void {
  const pts = points.map(([lo, la]) => lonLat(lo, la));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    line(a[0], a[1], b[0], b[1], INK, 1);
  }
  // light fill: scanline fill of the polygon
  let minY = 1e9;
  let maxY = -1e9;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(Math.round(ax + ((y - ay) * (bx - ax)) / (by - ay)));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = xs[k]; x <= xs[k + 1]; x++) setPixel(x, y, LAND);
    }
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    line(a[0], a[1], b[0], b[1], INK, 1);
  }
}
poly([
  [-168, 66], [-140, 70], [-120, 72], [-95, 80], [-75, 73], [-60, 60], [-55, 47],
  [-70, 42], [-80, 32], [-97, 26], [-105, 20], [-115, 30], [-125, 40], [-125, 49],
  [-150, 60],
]);
poly([
  [-80, 10], [-60, 5], [-35, -8], [-40, -20], [-55, -35], [-70, -50], [-75, -30],
  [-80, -15],
]);
poly([
  [-10, 36], [0, 44], [10, 45], [20, 55], [30, 60], [30, 70], [10, 70], [0, 60],
  [-10, 50],
]);
poly([
  [-17, 15], [-10, 30], [10, 37], [30, 31], [35, 28], [43, 11], [51, 10], [40, -5],
  [35, -20], [20, -35], [12, -18], [9, 4], [-8, 5],
]);
poly([
  [40, 70], [60, 70], [90, 75], [120, 75], [160, 70], [180, 65], [170, 60],
  [160, 55], [140, 40], [130, 35], [120, 25], [105, 10], [100, 8], [90, 20],
  [80, 8], [70, 20], [60, 25], [50, 30], [40, 35], [40, 55],
]);
poly([
  [113, -22], [130, -12], [142, -11], [150, -22], [150, -37], [140, -38],
  [130, -32], [115, -35],
]);
// numbered dots matching brief numbers
function mapDot(briefNo: number, lon: number, lat: number): void {
  const [dx, dy] = lonLat(lon, lat);
  fillCircle(dx, dy, 8, ACCENT);
  circleOutline(dx, dy, 8, INK);
  const label = String(briefNo);
  drawText(dx - Math.floor(textWidth(label, 1, 1) / 2), dy - 4, label, 1, CREAM, 1);
}
mapDot(11, -100, 40); // USA — Thanksgiving travel
mapDot(1, 35, 31); // Gaza
mapDot(3, 127, 37); // Ulleung / Korea
mapDot(5, 127, 33); // Seoul markets (offset below the Korea dot)
drawText(mapX0, my0 + mh + 4, "DOTS MATCH BRIEF NUMBERS", 2, GREY, 2);

// DATE CHECK strip — stories from other dates, explicitly labelled
const dcY = 902;
fillRect(MARGIN, dcY, CW, 98, LIGHT);
outlineRect(MARGIN, dcY, CW, 98, INK, 1);
drawText(MARGIN + 10, dcY + 6, "DATE CHECK - NOT NEWS FROM 24 NOVEMBER", 2, ACCENT, 2);
let dcy = dcY + 28;
for (const ln of DATECHECK) {
  drawText(MARGIN + 10, dcy, ln, 2, INK, 2);
  dcy += 18;
}

// ---------------------------------------------------------------- write file
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "entry.png");
const png = encodePNG();
fs.writeFileSync(outPath, png);
const sha = createHash("sha256").update(png).digest("hex");
console.log(`wrote ${outPath} ${png.length} bytes sha256=${sha}`);
