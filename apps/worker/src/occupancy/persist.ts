import { prisma } from "@visionops/db";
import { maxUnobservedGapMs, type EngineEffect } from "@visionops/shared";
import { notify } from "../notify.js";

export async function closeUnobservedSessions(now = Date.now()): Promise<void> {
  const sessions = await prisma.occupancySession.findMany();
  for (const session of sessions) {
    const latest = await prisma.occupancyEvent.findFirst({
      where: {
        deskZoneId: session.deskZoneId,
        status: "occupied",
        occurredAt: { gte: session.startedAt, lte: session.endedAt ?? new Date(now) },
      },
      orderBy: { occurredAt: "desc" },
    });
    const lastMs = latest?.occurredAt.getTime() ?? session.startedAt.getTime();
    const recordedEnd = session.endedAt?.getTime() ?? now;
    if (recordedEnd - lastMs <= maxUnobservedGapMs) continue;
    const endedAt = new Date(lastMs);
    await prisma.occupancySession.update({
      where: { id: session.id },
      data: {
        endedAt,
        endReason: "worker_restart",
        durationSeconds: Math.max(0, Math.round((lastMs - session.startedAt.getTime()) / 1000)),
      },
    });
  }
}

export async function applyEffects(input: {
  cameraId: string;
  deskZoneId: string;
  effects: EngineEffect[];
}): Promise<void> {
  if (input.effects.length === 0) return;
  const emitted: Record<string, unknown>[] = [];
  await prisma.$transaction(async (tx) => {
    for (const effect of input.effects) {
      if (effect.type === "event") {
        await tx.occupancyEvent.create({
          data: {
            cameraId: input.cameraId,
            deskZoneId: input.deskZoneId,
            occurredAt: new Date(effect.at),
            status: effect.status,
            reason: effect.reason,
            personCount: effect.personCount,
          },
        });
        emitted.push({
          type: "occupancy.updated",
          cameraId: input.cameraId,
          deskZoneId: input.deskZoneId,
          status: effect.status,
          reason: effect.reason,
          personCount: effect.personCount,
          occurredAt: new Date(effect.at).toISOString(),
        });
      } else if (effect.type === "open_session") {
        const existing = await tx.occupancySession.findFirst({
          where: { deskZoneId: input.deskZoneId, endedAt: null },
        });
        if (!existing) {
          const session = await tx.occupancySession.create({
            data: {
              cameraId: input.cameraId,
              deskZoneId: input.deskZoneId,
              startedAt: new Date(effect.at),
              maxPersonCount: effect.personCount,
            },
          });
          emitted.push({
            type: "session.opened",
            cameraId: input.cameraId,
            deskZoneId: input.deskZoneId,
            sessionId: session.id,
            occurredAt: session.startedAt.toISOString(),
          });
        }
      } else if (effect.type === "close_session") {
        const open = await tx.occupancySession.findFirst({
          where: { deskZoneId: input.deskZoneId, endedAt: null },
        });
        if (open) {
          const endedAt = new Date(effect.at);
          const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - open.startedAt.getTime()) / 1000));
          await tx.occupancySession.update({
            where: { id: open.id },
            data: { endedAt, endReason: effect.reason, durationSeconds },
          });
          emitted.push({
            type: "session.closed",
            cameraId: input.cameraId,
            deskZoneId: input.deskZoneId,
            sessionId: open.id,
            reason: effect.reason,
            occurredAt: endedAt.toISOString(),
          });
        }
      } else if (effect.type === "update_max") {
        await tx.occupancySession.updateMany({
          where: { deskZoneId: input.deskZoneId, endedAt: null, maxPersonCount: { lt: effect.personCount } },
          data: { maxPersonCount: effect.personCount },
        });
      }
    }
  });
  for (const event of emitted) await notify(event);
}

export async function closeDisabledZone(cameraId: string, deskZoneId: string, at: number): Promise<boolean> {
  const open = await prisma.occupancySession.findFirst({ where: { deskZoneId, endedAt: null } });
  if (!open) return false;
  const endedAt = new Date(at);
  await prisma.occupancySession.update({
    where: { id: open.id },
    data: {
      endedAt,
      endReason: "zone_disabled",
      durationSeconds: Math.max(0, Math.round((endedAt.getTime() - open.startedAt.getTime()) / 1000)),
    },
  });
  await notify({
    type: "session.closed",
    cameraId,
    deskZoneId,
    sessionId: open.id,
    reason: "zone_disabled",
    occurredAt: endedAt.toISOString(),
  });
  return true;
}
