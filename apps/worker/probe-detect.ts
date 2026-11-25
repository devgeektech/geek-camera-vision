import { readFile } from "node:fs/promises";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { decodeYoloV8, iou, type NormalizedBox } from "@visionops/shared";
import { letterboxJpeg } from "./src/inference/letterbox.js";

const jpegPath = "d:/camera-vision/data/cmwj4ai7k0002vr1o09kqic9n/latest.jpg";
const modelPath = "d:/camera-vision/models/yolov8n.onnx";
const jpeg = await readFile(jpegPath);
const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
const inputName = session.inputNames[0]!;
const outputName = session.outputNames[0]!;

async function runTensor(data: Float32Array) {
  const results = await session.run({ [inputName]: new ort.Tensor("float32", data, [1, 3, 640, 640]) });
  const output = results[outputName]!;
  return { data: output.data as Float32Array, dims: output.dims as number[] };
}

function personScores(data: Float32Array, dims: readonly number[], options: { padX: number; padY: number; scale: number; frameWidth: number; frameHeight: number }, minScore: number): NormalizedBox[] {
  const [, first, second] = dims;
  const channelMajor = first! < second!;
  const numChannels = channelMajor ? first! : second!;
  const numAnchors = channelMajor ? second! : first!;
  const at = (channel: number, anchor: number) => (channelMajor ? data[channel * numAnchors + anchor]! : data[anchor * numChannels + channel]!);
  const scoreOf = (value: number) => (value >= 0 && value <= 1 ? value : 1 / (1 + Math.exp(-value)));
  const boxes: NormalizedBox[] = [];
  for (let i = 0; i < numAnchors; i++) {
    const person = scoreOf(at(4, i));
    if (person < minScore) continue;
    let bestOther = 0;
    for (let c = 1; c < numChannels - 4; c++) bestOther = Math.max(bestOther, scoreOf(at(4 + c, i)));
    const cx = at(0, i);
    const cy = at(1, i);
    const bw = at(2, i);
    const bh = at(3, i);
    let x1 = (cx - bw / 2 - options.padX) / options.scale;
    let x2 = (cx + bw / 2 - options.padX) / options.scale;
    let y1 = (cy - bh / 2 - options.padY) / options.scale;
    let y2 = (cy + bh / 2 - options.padY) / options.scale;
    x1 = Math.max(0, Math.min(options.frameWidth, x1));
    x2 = Math.max(0, Math.min(options.frameWidth, x2));
    y1 = Math.max(0, Math.min(options.frameHeight, y1));
    y2 = Math.max(0, Math.min(options.frameHeight, y2));
    if (x2 - x1 < 1 || y2 - y1 < 1) continue;
    boxes.push({
      x: x1 / options.frameWidth,
      y: y1 / options.frameHeight,
      w: (x2 - x1) / options.frameWidth,
      h: (y2 - y1) / options.frameHeight,
      confidence: person,
      classId: bestOther > person ? 1 : 0,
    });
  }
  const ordered = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: NormalizedBox[] = [];
  for (const box of ordered) {
    if (kept.some((other) => iou(box, other) >= 0.45)) continue;
    kept.push(box);
  }
  return kept;
}

function brief(boxes: NormalizedBox[]) {
  return boxes
    .map((box) => `${box.confidence.toFixed(2)}@${box.x.toFixed(2)},${box.y.toFixed(2)} ${box.w.toFixed(2)}x${box.h.toFixed(2)} c${box.classId}`)
    .join(" | ");
}

const prepared = await letterboxJpeg(jpeg);
const full = await runTensor(prepared.data);
for (const confidence of [0.45, 0.35, 0.25]) {
  const boxes = decodeYoloV8(full.data, full.dims, { confidence, iouThreshold: 0.45, ...prepared });
  console.log(`argmax ${confidence}: ${boxes.length}`);
  console.log(brief(boxes));
}
const people = personScores(full.data, full.dims, prepared, 0.25);
console.log(`person-score 0.25: ${people.length} lost-to-other=${people.filter((box) => box.classId === 1).length}`);
console.log(brief(people));

const meta = await sharp(jpeg).metadata();
const width = meta.width ?? 1280;
const height = meta.height ?? 720;
const overlap = 0.2;
const tileW = Math.round(width / 2 + width * overlap / 2);
const tileH = Math.round(height / 2 + height * overlap / 2);
const tiles: NormalizedBox[] = [];
for (const left of [0, width - tileW]) {
  for (const top of [0, height - tileH]) {
    const crop = await sharp(jpeg).extract({ left: Math.max(0, left), top: Math.max(0, top), width: tileW, height: tileH }).jpeg().toBuffer();
    const tile = await letterboxJpeg(crop);
    const output = await runTensor(tile.data);
    const found = decodeYoloV8(output.data, output.dims, { confidence: 0.35, iouThreshold: 0.45, ...tile });
    for (const box of found) {
      tiles.push({
        x: (left + box.x * tileW) / width,
        y: (top + box.y * tileH) / height,
        w: (box.w * tileW) / width,
        h: (box.h * tileH) / height,
        confidence: box.confidence,
        classId: 0,
      });
    }
  }
}
const merged: NormalizedBox[] = [];
for (const box of [...tiles].sort((a, b) => b.confidence - a.confidence)) {
  if (merged.some((other) => iou(box, other) >= 0.45)) continue;
  merged.push(box);
}
console.log(`tiles 0.35: ${merged.length}`);
console.log(brief(merged));
