import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { prisma } from "@visionops/db";
import { loginSchema } from "@visionops/shared";
import { clearSessionCookie, loginAllowed, passwordsMatch, readSession, setSessionCookie, signSession } from "./auth.js";
import { env } from "./env.js";
import { cameraRoutes } from "./routes/cameras.js";
import { internalRoutes } from "./routes/internal.js";
import { occupancyRoutes } from "./routes/occupancy.js";
import { reportRoutes } from "./routes/reports.js";
import { zoneRoutes } from "./routes/zones.js";
import { attachSocket } from "./realtime/io.js";

const app = Fastify({
  logger: {
    level: env.logLevel,
    redact: ["req.headers.authorization", "req.headers.cookie", "password", "rtspUrl"],
  },
});

await app.register(cookie);
await app.register(cors, { origin: env.webOrigin, credentials: true });

app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true };
});

app.post("/auth/login", async (request, reply) => {
  const ip = request.ip;
  if (!loginAllowed(ip)) return reply.code(429).send({ error: "Too many sign-in attempts. Wait a minute." });
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Enter a username and password." });
  const usernameOk = passwordsMatch(parsed.data.username, env.adminUsername);
  const passwordOk = passwordsMatch(parsed.data.password, env.adminPassword);
  if (!usernameOk || !passwordOk) return reply.code(401).send({ error: "Those credentials were not accepted." });
  const token = signSession(parsed.data.username);
  setSessionCookie(reply, token);
  return { ok: true, token };
});

app.post("/auth/logout", async (_request, reply) => {
  clearSessionCookie(reply);
  return { ok: true };
});

app.get("/auth/me", async (request, reply) => {
  const user = readSession(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  return { username: user };
});

app.get("/auth/socket-token", async (request, reply) => {
  const user = readSession(request);
  if (!user) return reply.code(401).send({ error: "Unauthorized" });
  return { token: signSession(user) };
});

app.addHook("onRequest", async (request, reply) => {
  const url = request.url.split("?")[0] ?? "";
  if (url === "/health" || url === "/auth/login") return;
  if (url.startsWith("/auth/")) return;
  if (url.startsWith("/internal")) {
    const secret = request.headers["x-worker-secret"];
    if (secret !== env.workerSecret) return reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  if (!readSession(request)) return reply.code(401).send({ error: "Unauthorized" });
});

await app.register(cameraRoutes);
await app.register(zoneRoutes);
await app.register(occupancyRoutes);
await app.register(reportRoutes);

const io = attachSocket(app);
await app.register(internalRoutes(io));

await seedCamera();

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

function cameraChannels(): number[] {
  const raw = process.env.CAMERA_CHANNELS?.trim();
  if (!raw) {
    const single = Number(process.env.CAMERA_CHANNEL ?? 8);
    return Number.isInteger(single) && single > 0 ? [single] : [];
  }
  const channels: number[] = [];
  for (const part of raw.split(",")) {
    const piece = part.trim();
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(piece);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let channel = low; channel <= high; channel += 1) channels.push(channel);
    } else if (/^\d+$/.test(piece)) {
      channels.push(Number(piece));
    }
  }
  return [...new Set(channels)];
}

async function seedCamera(): Promise<void> {
  const host = process.env.CAMERA_HOST;
  const username = process.env.CAMERA_USERNAME;
  const password = process.env.CAMERA_PASSWORD;
  if (!host || !username || !password) return;
  const subtype = Number(process.env.CAMERA_SUBTYPE ?? 1);
  const port = Number(process.env.CAMERA_PORT ?? 554);
  for (const channel of cameraChannels()) {
    const name = `Channel ${channel}`;
    const existing = await prisma.camera.findFirst({ where: { host, channel, subtype } });
    if (!existing) {
      await prisma.camera.create({
        data: { name, host, port, username, password, channel, subtype, vendor: "dahua", transport: "tcp" },
      });
      continue;
    }
    if (existing.username !== username || existing.password !== password || existing.port !== port || existing.name !== name) {
      await prisma.camera.update({
        where: { id: existing.id },
        data: { username, password, port, name },
      });
    }
  }
}
