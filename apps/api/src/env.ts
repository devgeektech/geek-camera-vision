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
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  adminUsername: required("ADMIN_USERNAME"),
  adminPassword: required("ADMIN_PASSWORD"),
  sessionSecret: required("SESSION_SECRET"),
  workerSecret: required("WORKER_SHARED_SECRET"),
  officeTz: process.env.OFFICE_TZ ?? "Asia/Kolkata",
  businessStart: process.env.BUSINESS_HOURS_START ?? "09:00",
  businessEnd: process.env.BUSINESS_HOURS_END ?? "18:00",
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  dataDir: fromRoot(process.env.DATA_DIR, "data"),
  logLevel: process.env.LOG_LEVEL ?? "info",
};
