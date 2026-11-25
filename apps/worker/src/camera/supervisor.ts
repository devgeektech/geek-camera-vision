import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Camera, DeskZone } from "@visionops/db";
import { prisma } from "@visionops/db";
import {
  anchorPoint,
  buildRtspUrl,
  pointInPolygon,
  reconcileZoneState,
  stepOccupancy,
  stepTracker,
  type AnchorMode,
  type CameraVendor,
  type Point,
  type Track,
  type ZoneState,
} from "@visionops/shared";
import { env } from "../env.js";
import { detectPersons } from "../inference/session.js";
import { notify } from "../notify.js";
import { applyEffects, closeDisabledZone, closeUnobservedSessions } from "../occupancy/persist.js";
import { backoffDelay, startMjpegStream } from "./ffmpeg-stream.js";

type ZoneRow = DeskZone & { polygon: Point[] };

type Runtime = {
  cameraId: string;
  stop: () => void;
  tracks: Track[];
  nextTrackId: number;
  zones: Map<string, ZoneState>;
  busy: boolean;
  pending: Buffer | null;
  lastFrameAt: number;
  publishTail: Promise<void>;
  lastBeat: Map<string, number>;
  attempt: number;
  stopped: boolean;
};

const runtimes = new Map<string, Runtime>();
const liveFps = 10;

export function stopAllStreams(): void {
  for (const runtime of runtimes.values()) {
    runtime.stopped = true;
    runtime.stop();
  }
  runtimes.clear();
}

export async function supervise(): Promise<void> {
  await closeUnobservedSessions();
  await refreshCameras();
  setInterval(() => {
    void refreshCameras().catch((error) => console.error("camera refresh failed", error));
  }, 2_000);
  setInterval(() => {
    void markStale().catch((error) => console.error("health check failed", error));
  }, 2_000);
}

async function watchedCameraIds(): Promise<string[]> {
  try {
    const raw = await readFile(join(env.dataDir, "watch.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    return Object.entries(parsed)
      .filter(([, at]) => typeof at === "number" && now - at < env.watchTtlMs)
      .sort((left, right) => right[1] - left[1])
      .map(([id]) => id);
  } catch {
    return [];
  }
}

async function refreshCameras(): Promise<void> {
  const watched = await watchedCameraIds();
  const withDesks = await prisma.camera.findMany({
    where: { enabled: true, zones: { some: { enabled: true } } },
    include: { zones: true },
    orderBy: { channel: "asc" },
  });
  const watchedCameras = watched.length
    ? await prisma.camera.findMany({ where: { enabled: true, id: { in: watched } }, include: { zones: true } })
    : [];
  const cameras = [...withDesks];
  const seen = new Set(cameras.map((camera) => camera.id));
  const extra = watchedCameras.find((camera) => !seen.has(camera.id));
  if (extra) cameras.push(extra);
  const ids = new Set(cameras.map((camera) => camera.id));
  for (const [id, runtime] of runtimes) {
    if (!ids.has(id)) {
      runtime.stopped = true;
      runtime.stop();
      runtimes.delete(id);
      await setHealth(id, "offline", null);
    }
  }
  for (const camera of cameras) {
    if (runtimes.has(camera.id)) continue;
    const runtime = await createRuntime(camera);
    runtimes.set(camera.id, runtime);
    void runLoop(camera.id);
  }
}

async function createRuntime(camera: Camera & { zones: DeskZone[] }): Promise<Runtime> {
  const zones = new Map<string, ZoneState>();
  for (const zone of camera.zones) {
    const openSession = await prisma.occupancySession.findFirst({ where: { deskZoneId: zone.id, endedAt: null } });
    const latest = await prisma.occupancyEvent.findFirst({ where: { deskZoneId: zone.id }, orderBy: { occurredAt: "desc" } });
    zones.set(
      zone.id,
      reconcileZoneState({
        now: Date.now(),
        openSession: openSession ? { maxPersonCount: openSession.maxPersonCount } : null,
        latestStatus: latest ? (latest.status as ZoneState["status"]) : null,
      }),
    );
  }
  return {
    cameraId: camera.id,
    stop: () => undefined,
    tracks: [],
    nextTrackId: 1,
    zones,
    busy: false,
    pending: null,
    lastFrameAt: 0,
    publishTail: Promise.resolve(),
    lastBeat: new Map(),
    attempt: 0,
    stopped: false,
  };
}

async function runLoop(cameraId: string): Promise<void> {
  const runtime = runtimes.get(cameraId);
  if (!runtime) return;
  while (!runtime.stopped) {
    const camera = await prisma.camera.findUnique({ where: { id: cameraId }, include: { zones: true } });
    if (!camera || !camera.enabled) {
      runtime.stopped = true;
      break;
    }
    const url = buildRtspUrl({
      vendor: camera.vendor as CameraVendor,
      host: camera.host,
      port: camera.port,
      username: camera.username,
      password: camera.password,
      channel: camera.channel,
      subtype: camera.subtype,
      path: camera.path,
    });
    let stderr = "";
    const stream = startMjpegStream({
      ffmpegPath: env.ffmpegPath,
      url,
      transport: camera.transport === "udp" ? "udp" : "tcp",
      fps: Math.max(camera.targetFps, liveFps),
      onFrame: (jpeg) => {
        runtime.lastFrameAt = Date.now();
        const frame = Buffer.from(jpeg);
        runtime.publishTail = runtime.publishTail
          .then(() => publishLatest(camera.id, frame))
          .catch((error) => console.error("frame save failed", error instanceof Error ? error.message : error));
        void handleFrame(camera.id, frame);
      },
      onLog: (line) => {
        if (line) stderr = line.slice(0, 300);
      },
    });
    runtime.stop = stream.stop;
    const code = await stream.exited;
    if (runtime.stopped) break;
    const message = explain(stderr, code);
    await setHealth(camera.id, "error", message);
    await stepZones(camera.id, camera.zones as ZoneRow[], false, []);
    await sleep(backoffDelay(runtime.attempt));
    runtime.attempt = Math.min(runtime.attempt + 1, 3);
  }
}

async function handleFrame(cameraId: string, jpeg: Buffer): Promise<void> {
  const runtime = runtimes.get(cameraId);
  if (!runtime) return;
  if (runtime.busy) {
    runtime.pending = jpeg;
    return;
  }
  runtime.busy = true;
  let current: Buffer | null = jpeg;
  try {
    while (current && !runtime.stopped) {
      const camera = await prisma.camera.findUnique({ where: { id: cameraId }, include: { zones: true } });
      if (!camera) break;
      await processFrame(camera, current, runtime);
      current = runtime.pending;
      runtime.pending = null;
    }
  } catch (error) {
    console.error("frame processing failed", error instanceof Error ? error.message : error);
  } finally {
    runtime.busy = false;
  }
}

async function publishLatest(cameraId: string, jpeg: Buffer): Promise<void> {
  const dir = join(env.dataDir, cameraId);
  await mkdir(dir, { recursive: true });
  const finalPath = join(dir, "latest.jpg");
  const tempPath = join(dir, "latest.jpg.tmp");
  await writeFile(tempPath, jpeg);
  await rename(tempPath, finalPath);
}

async function processFrame(camera: Camera & { zones: DeskZone[] }, jpeg: Buffer, runtime: Runtime): Promise<void> {
  const dir = join(env.dataDir, camera.id);
  await mkdir(dir, { recursive: true });
  const detected = await detectPersons(jpeg, camera.confidence);
  const tracked = stepTracker(runtime.tracks, detected.boxes, runtime.nextTrackId, {
    iouThreshold: 0.3,
    maxMissed: 10,
    minHits: env.minTrackFrames,
  });
  runtime.tracks = tracked.tracks;
  runtime.nextTrackId = tracked.nextId;
  await writeFile(
    join(dir, "detections.json"),
    JSON.stringify({
      frameAt: new Date().toISOString(),
      frameWidth: detected.frameWidth,
      frameHeight: detected.frameHeight,
      inferenceMs: detected.inferenceMs,
      boxes: tracked.tracks.filter((track) => track.missed === 0).map((track) => ({ ...track.bbox, trackId: track.id, hits: track.hits })),
    }),
  );
  runtime.attempt = 0;
  runtime.lastFrameAt = Date.now();
  await setHealth(camera.id, "online", null);
  await stepZones(camera.id, camera.zones as ZoneRow[], true, tracked.confirmed, camera.anchor as AnchorMode, {
    occupyConfirmMs: env.occupyConfirmMs,
    vacantConfirmMs: env.vacantConfirmMs,
  });
  await notify({ type: "camera.frame", cameraId: camera.id, occurredAt: new Date().toISOString() });
}

async function stepZones(
  cameraId: string,
  zones: ZoneRow[],
  streamHealthy: boolean,
  confirmed: Array<{ x: number; y: number; w: number; h: number; trackId?: number }>,
  anchor: AnchorMode = "foot",
  overrides?: { occupyConfirmMs: number; vacantConfirmMs: number },
): Promise<void> {
  const runtime = runtimes.get(cameraId);
  if (!runtime) return;
  const now = Date.now();
  const assigned = peopleByDesk(confirmed, zones, anchor);
  for (const zone of zones) {
    if (!zone.enabled) {
      const closed = await closeDisabledZone(cameraId, zone.id, now);
      const current = runtime.zones.get(zone.id);
      if (closed && current) runtime.zones.set(zone.id, { ...current, sessionOpen: false, status: "unknown" });
      continue;
    }
    if (!runtime.zones.has(zone.id)) runtime.zones.set(zone.id, reconcileZoneState({ now, openSession: null, latestStatus: null }));
    const inside = assigned.get(zone.id) ?? [];
    const previous = runtime.zones.get(zone.id)!;
    const result = stepOccupancy(
      previous,
      { now, streamHealthy, personInside: inside.length > 0, personCount: inside.length },
      {
        occupyConfirmMs: zone.occupyConfirmMs ?? overrides?.occupyConfirmMs ?? env.occupyConfirmMs,
        vacantConfirmMs: zone.vacantConfirmMs ?? overrides?.vacantConfirmMs ?? env.vacantConfirmMs,
        disconnectGraceMs: env.disconnectGraceMs,
      },
    );
    runtime.zones.set(zone.id, result.state);
    await applyEffects({ cameraId, deskZoneId: zone.id, effects: result.effects });
    if (result.state.sessionOpen && result.state.status === "occupied") {
      const last = runtime.lastBeat.get(zone.id);
      if (last == null) runtime.lastBeat.set(zone.id, now);
      else if (now - last >= 60_000) {
        runtime.lastBeat.set(zone.id, now);
        await applyEffects({
          cameraId,
          deskZoneId: zone.id,
          effects: [{ type: "event", status: "occupied", reason: "still_present", personCount: result.state.maxPersonCount, at: now }],
        });
      }
    }
  }
}

async function markStale(): Promise<void> {
  const now = Date.now();
  for (const runtime of runtimes.values()) {
    if (runtime.lastFrameAt === 0 || now - runtime.lastFrameAt < env.unknownAfterMs) continue;
    const camera = await prisma.camera.findUnique({ where: { id: runtime.cameraId }, include: { zones: true } });
    if (!camera) continue;
    if (camera.status === "online") await setHealth(camera.id, "offline", "No recent frame.");
    await stepZones(camera.id, camera.zones as ZoneRow[], false, []);
  }
}

async function setHealth(cameraId: string, status: "online" | "offline" | "error", lastError: string | null): Promise<void> {
  const camera = await prisma.camera.findUnique({ where: { id: cameraId } });
  if (!camera) return;
  const changed = camera.status !== status || (camera.lastError ?? null) !== lastError;
  const frameIsFresh = camera.lastFrameAt != null && Date.now() - camera.lastFrameAt.getTime() < 1000;
  if (!changed && (status !== "online" || frameIsFresh)) return;
  await prisma.camera.update({
    where: { id: cameraId },
    data: { status, lastError, lastFrameAt: status === "online" ? new Date() : camera.lastFrameAt },
  });
  if (changed) {
    await notify({
      type: "camera.health",
      cameraId,
      cameraStatus: status,
      lastError,
      lastFrameAt: new Date().toISOString(),
    });
  }
}

function peopleByDesk(
  boxes: Array<{ x: number; y: number; w: number; h: number; trackId?: number }>,
  zones: ZoneRow[],
  anchor: AnchorMode,
): Map<string, Array<{ x: number; y: number; w: number; h: number; trackId?: number }>> {
  const desks = zones
    .filter((zone) => zone.enabled && Array.isArray(zone.polygon) && zone.polygon.length >= 3)
    .map((zone) => ({ id: zone.id, polygon: zone.polygon as Point[], center: centroid(zone.polygon as Point[]) }));
  const assigned = new Map<string, Array<{ x: number; y: number; w: number; h: number; trackId?: number }>>();
  for (const box of boxes) {
    let best: { id: string; distance: number } | null = null;
    const person = anchorPoint(box, "center");
    for (const desk of desks) {
      const footInside = pointInPolygon(anchorPoint(box, "foot"), desk.polygon);
      const centerInside = pointInPolygon(anchorPoint(box, "center"), desk.polygon);
      const selectedInside = pointInPolygon(anchorPoint(box, anchor), desk.polygon);
      if (!footInside && !centerInside && !selectedInside) continue;
      const distance = (person.x - desk.center.x) ** 2 + (person.y - desk.center.y) ** 2;
      if (!best || distance < best.distance) best = { id: desk.id, distance };
    }
    if (!best) continue;
    const current = assigned.get(best.id) ?? [];
    current.push(box);
    assigned.set(best.id, current);
  }
  return assigned;
}

function centroid(points: Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function explain(stderr: string, code: number | null): string {
  const text = stderr.toLowerCase();
  if (text.includes("401") || text.includes("403") || text.includes("unauthorized")) return "Authentication failed.";
  if (text.includes("404") || text.includes("not found")) return "Stream not found. Check the channel number.";
  if (text.includes("timed out") || text.includes("connection refused")) return "The recorder could not be reached.";
  if (text.includes("enoent")) return "FFmpeg is not installed.";
  return code === 0 ? "The camera stream ended." : "The camera connection failed.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}