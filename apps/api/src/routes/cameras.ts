import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma } from "@visionops/db";
import { cameraInputSchema, cameraPatchSchema, type CameraTransport, type CameraVendor } from "@visionops/shared";
import { env } from "../env.js";
import { captureSnapshot } from "../snapshot.js";
import { toCameraDto } from "../serialize.js";
import { markCameraWatched } from "../watch.js";

export async function cameraRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/cameras", async () => {
    const cameras = await prisma.camera.findMany({ orderBy: [{ channel: "asc" }, { subtype: "asc" }] });
    return cameras.map(toCameraDto);
  });

  app.get("/api/cameras/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const camera = await prisma.camera.findUnique({ where: { id } });
    if (!camera) return reply.code(404).send({ error: "Camera not found." });
    await markCameraWatched(id);
    return toCameraDto(camera);
  });

  app.post("/api/cameras", async (request, reply) => {
    const parsed = cameraInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Check the camera fields and try again." });
    try {
      const camera = await prisma.camera.create({ data: cameraData(parsed.data) });
      return reply.code(201).send(toCameraDto(camera));
    } catch (error) {
      return reply.code(409).send({ error: duplicateCameraMessage(error, parsed.data) });
    }
  });

  app.patch("/api/cameras/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = cameraPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Check the camera fields and try again." });
    const existing = await prisma.camera.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Camera not found." });
    const data = cameraData({ ...existing, ...parsed.data, password: parsed.data.password || existing.password });
    try {
      const camera = await prisma.camera.update({ where: { id }, data });
      return toCameraDto(camera);
    } catch (error) {
      return reply.code(409).send({ error: duplicateCameraMessage(error, { ...existing, ...parsed.data }) });
    }
  });

  app.delete("/api/cameras/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const events = await prisma.occupancyEvent.count({ where: { cameraId: id } });
    if (events > 0) return reply.code(409).send({ error: "This camera has history. Disable it instead of deleting it." });
    await prisma.camera.delete({ where: { id } }).catch(() => null);
    return reply.code(204).send();
  });

  app.post("/api/cameras/:id/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const camera = await prisma.camera.findUnique({ where: { id } });
    if (!camera) return reply.code(404).send({ error: "Camera not found." });
    await markCameraWatched(id);
    try {
      const image = await captureSnapshot(
        {
          vendor: camera.vendor as CameraVendor,
          host: camera.host,
          port: camera.port,
          username: camera.username,
          password: camera.password,
          channel: camera.channel,
          subtype: camera.subtype,
          path: camera.path,
        },
        camera.transport as CameraTransport,
      );
      const dir = join(env.dataDir, camera.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "latest.jpg"), image);
      await prisma.camera.update({
        where: { id },
        data: { status: "online", lastFrameAt: new Date(), lastError: null },
      });
      return reply.header("content-type", "image/jpeg").send(image);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The camera connection failed.";
      await prisma.camera.update({ where: { id }, data: { status: "error", lastError: message } });
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/cameras/:id/watch", async (request, reply) => {
    const { id } = request.params as { id: string };
    const camera = await prisma.camera.findUnique({ where: { id }, select: { id: true } });
    if (!camera) return reply.code(404).send({ error: "Camera not found." });
    await markCameraWatched(id);
    return { ok: true };
  });

  app.get("/api/cameras/:id/latest", async (request, reply) => {
    const { id } = request.params as { id: string };
    await markCameraWatched(id);
    const { readFile } = await import("node:fs/promises");
    try {
      const image = await readFile(join(env.dataDir, id, "latest.jpg"));
      return reply.header("content-type", "image/jpeg").header("cache-control", "no-store").send(image);
    } catch {
      return reply.code(404).send({ error: "No snapshot yet." });
    }
  });

  app.get("/api/cameras/:id/detections", async (request, reply) => {
    const { id } = request.params as { id: string };
    await markCameraWatched(id);
    const { readFile } = await import("node:fs/promises");
    try {
      const raw = await readFile(join(env.dataDir, id, "detections.json"), "utf8");
      return reply.header("cache-control", "no-store").send(JSON.parse(raw));
    } catch {
      return { frameAt: null, boxes: [], inferenceMs: null };
    }
  });
}

function duplicateCameraMessage(
  error: unknown,
  input: { name?: string; host?: string; channel?: number; subtype?: number },
): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
  const target = JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target ?? "");
  if (code === "P2002" && target.includes("name")) {
    return `A camera named "${input.name}" already exists.`;
  }
  if (code === "P2002") {
    const channel = input.channel ?? 3;
    const stream = (input.subtype ?? 1) === 0 ? "main stream" : "substream";
    return `Channel ${channel} ${stream} is already saved for ${input.host}. Enter a different channel number.`;
  }
  return "The camera could not be saved.";
}

function cameraData(input: {
  name: string;
  enabled?: boolean;
  vendor?: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  channel?: number;
  subtype?: number;
  path?: string | null;
  transport?: string;
  targetFps?: number;
  confidence?: number;
  anchor?: string;
}) {
  return {
    name: input.name,
    enabled: input.enabled ?? true,
    vendor: input.vendor ?? "dahua",
    host: input.host,
    port: input.port ?? 554,
    username: input.username,
    password: input.password,
    channel: input.channel ?? 3,
    subtype: input.subtype ?? 1,
    path: input.path ?? null,
    transport: input.transport ?? "tcp",
    targetFps: input.targetFps ?? 2,
    confidence: input.confidence ?? 0.45,
    anchor: input.anchor ?? "foot",
  };
}
