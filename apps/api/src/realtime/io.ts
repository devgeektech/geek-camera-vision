import { Server } from "socket.io";
import type { FastifyInstance } from "fastify";
import { verifySession } from "../auth.js";
import { env } from "../env.js";

export function attachSocket(app: FastifyInstance): Server {
  const io = new Server(app.server, {
    cors: { origin: env.webOrigin, credentials: true },
  });
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const cookie = socket.handshake.headers.cookie;
    const sessionCookie = cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("visionops_session="))?.split("=")[1];
    if (verifySession(token) || verifySession(sessionCookie ? decodeURIComponent(sessionCookie) : undefined)) {
      next();
      return;
    }
    next(new Error("Unauthorized"));
  });
  return io;
}
