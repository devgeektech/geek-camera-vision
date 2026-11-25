import { existsSync } from "node:fs";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import { decodeYoloV8, mergePersonBoxes, type NormalizedBox } from "@visionops/shared";
import { env } from "../env.js";
import { letterboxJpeg, type Letterbox } from "./letterbox.js";

let sessionPromise: Promise<ort.InferenceSession | null> | null = null;
let warned = false;

async function getSession(): Promise<ort.InferenceSession | null> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      if (!existsSync(env.modelPath)) {
        if (!warned) {
          warned = true;
          console.warn(`YOLO model not found at ${env.modelPath}. Person detection stays off until the file is added.`);
        }
        return null;
      }
      return ort.InferenceSession.create(env.modelPath, {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all",
      });
    })();
  }
  return sessionPromise;
}

let inferenceGate: Promise<void> = Promise.resolve();

export async function detectPersons(jpeg: Buffer, confidence: number): Promise<{
  boxes: NormalizedBox[];
  inferenceMs: number | null;
  frameWidth: number;
  frameHeight: number;
}> {
  const turn = inferenceGate.then(() => detectPersonsNow(jpeg, confidence));
  inferenceGate = turn.then(
    () => undefined,
    () => undefined,
  );
  return turn;
}

async function detectPersonsNow(jpeg: Buffer, confidence: number): Promise<{
  boxes: NormalizedBox[];
  inferenceMs: number | null;
  frameWidth: number;
  frameHeight: number;
}> {
  const meta = await sharp(jpeg).metadata();
  const frameWidth = meta.width ?? 640;
  const frameHeight = meta.height ?? 640;
  const session = await getSession();
  if (!session) return { boxes: [], inferenceMs: null, frameWidth, frameHeight };
  const started = Date.now();
  const found: NormalizedBox[] = [];
  for (const region of closeUps(frameWidth, frameHeight)) {
    const crop = region.x === 0 && region.w === frameWidth
      ? jpeg
      : await sharp(jpeg).extract({ left: region.x, top: region.y, width: region.w, height: region.h }).jpeg().toBuffer();
    const prepared = await letterboxJpeg(crop);
    const boxes = await readPersons(session, prepared, confidence);
    for (const box of boxes) {
      found.push({
        ...box,
        x: clamp01((region.x + box.x * region.w) / frameWidth),
        y: clamp01((region.y + box.y * region.h) / frameHeight),
        w: Math.max(0, (box.w * region.w) / frameWidth),
        h: Math.max(0, (box.h * region.h) / frameHeight),
      });
    }
  }
  return { boxes: mergePersonBoxes(found), inferenceMs: Date.now() - started, frameWidth, frameHeight };
}

async function readPersons(session: ort.InferenceSession, prepared: Letterbox, confidence: number): Promise<NormalizedBox[]> {
  const inputName = session.inputNames[0];
  if (!inputName) throw new Error("The ONNX model has no input.");
  const results = await session.run({ [inputName]: new ort.Tensor("float32", prepared.data, [1, 3, 640, 640]) });
  const outputName = session.outputNames[0];
  const output = outputName ? results[outputName] : undefined;
  if (!output) throw new Error("The ONNX model returned no output.");
  return decodeYoloV8(output.data as Float32Array, output.dims, {
    confidence,
    iouThreshold: 0.45,
    padX: prepared.padX,
    padY: prepared.padY,
    scale: prepared.scale,
    frameWidth: prepared.frameWidth,
    frameHeight: prepared.frameHeight,
  });
}

function closeUps(width: number, height: number): Array<{ x: number; y: number; w: number; h: number }> {
  if (width <= 960) return [{ x: 0, y: 0, w: width, h: height }];
  const tileW = Math.min(width, Math.round(width * 0.62));
  const starts = [...new Set([0, Math.max(0, width - tileW)])];
  return starts.map((x) => ({ x, y: 0, w: tileW, h: height }));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
