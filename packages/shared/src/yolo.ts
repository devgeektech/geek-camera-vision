import type { NormalizedBox } from "./types.js";

export type DecodeOptions = {
  confidence: number;
  iouThreshold: number;
  padX: number;
  padY: number;
  scale: number;
  frameWidth: number;
  frameHeight: number;
};

type PixelBox = NormalizedBox & { x1: number; y1: number; x2: number; y2: number };

export function decodeYoloV8(data: Float32Array, dims: readonly number[], options: DecodeOptions): NormalizedBox[] {
  if (dims.length !== 3 || dims[0] !== 1) {
    throw new Error("Unexpected YOLO output shape");
  }
  const [, first, second] = dims;
  const channelMajor = first < second;
  const numChannels = channelMajor ? first : second;
  const numAnchors = channelMajor ? second : first;
  if (numChannels < 5) throw new Error("Unexpected YOLO output shape");

  const at = (channel: number, anchor: number) =>
    channelMajor ? data[channel * numAnchors + anchor]! : data[anchor * numChannels + channel]!;

  const candidates: PixelBox[] = [];
  for (let i = 0; i < numAnchors; i++) {
    let bestClass = 0;
    let bestScore = asScore(at(4, i));
    for (let c = 1; c < numChannels - 4; c++) {
      const score = asScore(at(4 + c, i));
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestClass !== 0 || bestScore < options.confidence) continue;

    const cx = at(0, i);
    const cy = at(1, i);
    const bw = at(2, i);
    const bh = at(3, i);
    let x1 = cx - bw / 2;
    let y1 = cy - bh / 2;
    let x2 = cx + bw / 2;
    let y2 = cy + bh / 2;
    x1 = (x1 - options.padX) / options.scale;
    x2 = (x2 - options.padX) / options.scale;
    y1 = (y1 - options.padY) / options.scale;
    y2 = (y2 - options.padY) / options.scale;
    x1 = clamp(x1, 0, options.frameWidth);
    x2 = clamp(x2, 0, options.frameWidth);
    y1 = clamp(y1, 0, options.frameHeight);
    y2 = clamp(y2, 0, options.frameHeight);
    if (x2 - x1 < 1 || y2 - y1 < 1) continue;
    candidates.push({
      x1,
      y1,
      x2,
      y2,
      x: x1 / options.frameWidth,
      y: y1 / options.frameHeight,
      w: (x2 - x1) / options.frameWidth,
      h: (y2 - y1) / options.frameHeight,
      confidence: bestScore,
      classId: 0,
    });
  }

  return nms(candidates, options.iouThreshold).map(({ x1: _x1, y1: _y1, x2: _x2, y2: _y2, ...box }) => box);
}

export function iou(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const union = a.w * a.h + b.w * b.h - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

export function mergePersonBoxes(boxes: NormalizedBox[], iouThreshold = 0.45): NormalizedBox[] {
  const ordered = [...boxes].sort((left, right) => right.confidence - left.confidence);
  const kept: NormalizedBox[] = [];
  for (const box of ordered) {
    if (kept.some((other) => samePerson(box, other, iouThreshold))) continue;
    kept.push(box);
  }
  return kept;
}

function samePerson(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  iouThreshold: number,
): boolean {
  if (iou(a, b) >= iouThreshold) return true;
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const intersection = ix * iy;
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 && intersection / smaller >= 0.55;
}

function nms(boxes: PixelBox[], threshold: number): PixelBox[] {
  const ordered = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: PixelBox[] = [];
  for (const box of ordered) {
    const overlaps = kept.some((other) => pixelIou(box, other) >= threshold);
    if (!overlaps) kept.push(box);
  }
  return kept;
}

function pixelIou(a: PixelBox, b: PixelBox): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function asScore(value: number): number {
  if (value >= 0 && value <= 1) return value;
  return 1 / (1 + Math.exp(-value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
