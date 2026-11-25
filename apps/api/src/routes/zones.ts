import type { FastifyInstance } from "fastify";
import { prisma } from "@visionops/db";
import { zoneInputSchema } from "@visionops/shared";

export async function zoneRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/zones", async () => {
    const zones = await prisma.deskZone.findMany({
      include: { camera: { select: { id: true, name: true, channel: true } } },
      orderBy: [{ camera: { channel: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      cameraId: zone.cameraId,
      cameraName: zone.camera.name,
      channel: zone.camera.channel,
      polygon: zone.polygon,
      enabled: zone.enabled,
      color: zone.color,
      sortOrder: zone.sortOrder,
    }));
  });

  app.get("/api/cameras/:id/zones", async (request, reply) => {
    const { id } = request.params as { id: string };
    const camera = await prisma.camera.findUnique({ where: { id } });
    if (!camera) return reply.code(404).send({ error: "Camera not found." });
    return prisma.deskZone.findMany({ where: { cameraId: id }, orderBy: { sortOrder: "asc" } });
  });

  app.post("/api/cameras/:id/zones", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = zoneInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Draw at least three points inside the picture." });
    const camera = await prisma.camera.findUnique({ where: { id } });
    if (!camera) return reply.code(404).send({ error: "Camera not found." });
    try {
      const zone = await prisma.deskZone.create({
        data: {
          cameraId: id,
          name: parsed.data.name,
          polygon: parsed.data.polygon,
          enabled: parsed.data.enabled ?? true,
          color: parsed.data.color ?? "#0f766e",
          sortOrder: parsed.data.sortOrder ?? 0,
          occupyConfirmMs: parsed.data.occupyConfirmMs ?? null,
          vacantConfirmMs: parsed.data.vacantConfirmMs ?? null,
        },
      });
      return reply.code(201).send(zone);
    } catch {
      return reply.code(409).send({ error: "A desk with that name already exists on this camera." });
    }
  });

  app.patch("/api/zones/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = zoneInputSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Check the desk fields and try again." });
    const existing = await prisma.deskZone.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Desk not found." });
    const zone = await prisma.deskZone.update({ where: { id }, data: parsed.data });
    return zone;
  });

  app.delete("/api/zones/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.deskZone.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Desk not found." });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction([
          prisma.occupancyEvent.deleteMany({ where: { deskZoneId: id } }),
          prisma.occupancySession.deleteMany({ where: { deskZoneId: id } }),
          prisma.deskZone.delete({ where: { id } }),
        ]);
        return reply.code(204).send();
      } catch (error) {
        const missing = await prisma.deskZone.findUnique({ where: { id } });
        if (!missing) return reply.code(204).send();
        if (attempt === 2) {
          request.log.warn({ err: error }, "desk delete failed");
          return reply.code(409).send({ error: "Could not remove this desk. Try again." });
        }
      }
    }
    return reply.code(409).send({ error: "Could not remove this desk. Try again." });
  });
}
