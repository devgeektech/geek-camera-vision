import { config } from "dotenv";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
config({ path: resolve(repoRoot, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function fromRoot(value: string | undefined, fallback: string): string {
  const raw = value ?? fallback;
  return isAbsolute(raw) ? raw : resolve(repoRoot, raw);
}

export const env = {
  apiUrl: process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000",
  workerSecret: required("WORKER_SHARED_SECRET"),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  modelPath: fromRoot(process.env.MODEL_PATH, "models/yolov8n.onnx"),
  dataDir: fromRoot(process.env.DATA_DIR, "data"),
  logLevel: process.env.LOG_LEVEL ?? "info",
  occupyConfirmMs: Number(process.env.OCCUPY_CONFIRM_MS ?? 8000),
  vacantConfirmMs: Number(process.env.VACANT_CONFIRM_MS ?? 45000),
  unknownAfterMs: Number(process.env.UNKNOWN_AFTER_MS ?? 10000),
  disconnectGraceMs: Number(process.env.DISCONNECT_GRACE_MS ?? 60000),
  minTrackFrames: Number(process.env.MIN_TRACK_FRAMES ?? 3),
  maxLiveCameras: Number(process.env.MAX_LIVE_CAMERAS ?? 1),
  watchTtlMs: Number(process.env.WATCH_TTL_MS ?? 20000),
};
