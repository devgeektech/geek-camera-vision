import type { FastifyInstance } from "fastify";
import { prisma } from "@visionops/db";

export async function occupancyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/occupancy/current", async () => {
    const zones = await prisma.deskZone.findMany({
      where: { enabled: true },
      include: { camera: true },
      orderBy: [{ cameraId: "asc" }, { sortOrder: "asc" }],
    });
    const openSessions = await prisma.occupancySession.findMany({ where: { endedAt: null } });
    const openByZone = new Map(openSessions.map((session) => [session.deskZoneId, session]));
    const rows = [];
    for (const zone of zones) {
      const latest = await prisma.occupancyEvent.findFirst({
        where: { deskZoneId: zone.id },
        orderBy: { occurredAt: "desc" },
      });
      const session = openByZone.get(zone.id);
      rows.push({
        deskZoneId: zone.id,
        deskName: zone.name,
        color: zone.color,
        cameraId: zone.cameraId,
        cameraName: zone.camera.name,
        cameraStatus: zone.camera.status,
        lastError: zone.camera.lastError,
        status: latest?.status ?? "unknown",
        reason: latest?.reason ?? null,
        personCount: latest?.personCount ?? 0,
        since: latest?.occurredAt ?? null,
        sessionStartedAt: session?.startedAt ?? null,
      });
    }
    return rows;
  });

  app.get("/api/sessions", async (request) => {
    const query = request.query as { from?: string; to?: string; deskZoneId?: string };
    return prisma.occupancySession.findMany({
      where: {
        deskZoneId: query.deskZoneId,
        startedAt: query.to ? { lt: new Date(query.to) } : undefined,
        OR: query.from ? [{ endedAt: null }, { endedAt: { gt: new Date(query.from) } }] : undefined,
      },
      orderBy: { startedAt: "desc" },
      take: 500,
      include: { deskZone: { select: { name: true } }, camera: { select: { name: true } } },
    });
  });
}
