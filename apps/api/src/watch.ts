import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env.js";

const watchPath = () => join(env.dataDir, "watch.json");

export async function markCameraWatched(cameraId: string): Promise<void> {
  await mkdir(env.dataDir, { recursive: true });
  const now = Date.now();
  let current: Record<string, number> = {};
  try {
    current = JSON.parse(await readFile(watchPath(), "utf8")) as Record<string, number>;
  } catch {
    current = {};
  }
  for (const [id, at] of Object.entries(current)) {
    if (now - at > 60_000) delete current[id];
  }
  current[cameraId] = now;
  await writeFile(watchPath(), JSON.stringify(current));
}
