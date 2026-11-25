import { z } from "zod";

export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const cameraInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().optional(),
  vendor: z.enum(["dahua", "generic"]).optional(),
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
  channel: z.number().int().min(1).max(256).optional(),
  subtype: z.number().int().min(0).max(1).optional(),
  path: z.string().max(500).nullable().optional(),
  transport: z.enum(["tcp", "udp"]).optional(),
  targetFps: z.number().int().min(1).max(10).optional(),
  confidence: z.number().min(0.05).max(0.95).optional(),
  anchor: z.enum(["foot", "center"]).optional(),
});

export const cameraPatchSchema = cameraInputSchema.partial().extend({
  password: z.string().max(256).optional(),
  username: z.string().min(1).max(128).optional(),
});

export const zoneInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  polygon: z.array(pointSchema).min(3).max(32),
  enabled: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
  occupyConfirmMs: z.number().int().min(1000).max(120000).nullable().optional(),
  vacantConfirmMs: z.number().int().min(1000).max(600000).nullable().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const socketEvents = {
  cameraHealth: "camera.health",
  occupancyUpdated: "occupancy.updated",
  sessionOpened: "session.opened",
  sessionClosed: "session.closed",
  frame: "camera.frame",
} as const;
