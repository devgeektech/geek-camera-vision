import type { FastifyInstance } from "fastify";
import { prisma } from "@visionops/db";
import type { Server } from "socket.io";
import { socketEvents } from "@visionops/shared";

type InternalBody = {
  type: string;
  cameraId?: string;
  deskZoneId?: string;
  status?: string;
  reason?: string;
  personCount?: number;
  occurredAt?: string;
  sessionId?: string;
  lastError?: string | null;
  lastFrameAt?: string | null;
  cameraStatus?: string;
};

export function internalRoutes(io: Server) {
  return async function register(app: FastifyInstance): Promise<void> {
    app.post("/internal/events", async (request, reply) => {
      const body = request.body as InternalBody;
      if (body.type === "camera.health" && body.cameraId) {
        await prisma.camera.update({
          where: { id: body.cameraId },
          data: {
            status: body.cameraStatus ?? "offline",
            lastError: body.lastError ?? null,
            lastFrameAt: body.lastFrameAt ? new Date(body.lastFrameAt) : undefined,
          },
        }).catch(() => null);
        io.emit(socketEvents.cameraHealth, body);
      } else if (body.type === "occupancy.updated") {
        io.emit(socketEvents.occupancyUpdated, body);
      } else if (body.type === "session.opened") {
        io.emit(socketEvents.sessionOpened, body);
      } else if (body.type === "session.closed") {
        io.emit(socketEvents.sessionClosed, body);
      } else if (body.type === "camera.frame") {
        io.emit(socketEvents.frame, body);
      } else {
        return reply.code(400).send({ error: "Unknown event." });
      }
      return { ok: true };
    });
  };
}
