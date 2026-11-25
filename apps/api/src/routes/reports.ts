import type { FastifyInstance } from "fastify";
import { prisma } from "@visionops/db";
import { businessBounds, intersectWindow, officeDayBounds, sessionSpans, summarizeDesk, type ZoneStatus } from "@visionops/shared";
import { env } from "../env.js";

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/reports/daily", async (request, reply) => {
    const date = readDate(request.query as { date?: string });
    if (!date) return reply.code(400).send({ error: "Choose a valid date." });
    const businessHours = (request.query as { businessHours?: string }).businessHours !== "false";
    return buildDaily(date, businessHours);
  });

  app.get("/api/reports/daily.csv", async (request, reply) => {
    const date = readDate(request.query as { date?: string });
    if (!date) return reply.code(400).send({ error: "Choose a valid date." });
    const businessHours = (request.query as { businessHours?: string }).businessHours !== "false";
    const report = await buildDaily(date, businessHours);
    const lines = [
      "date,camera,desk,occupied_seconds,vacant_seconds,unknown_seconds,utilization_pct,session_count,counting_from",
      ...report.desks.map((desk) =>
        [
          date,
          csv(desk.cameraName),
          csv(desk.deskName),
          Math.round(desk.occupiedMs / 1000),
          Math.round(desk.vacantMs / 1000),
          Math.round(desk.unknownMs / 1000),
          desk.utilization == null ? "" : (desk.utilization * 100).toFixed(1),
          desk.sessionCount,
          desk.measuredFrom ?? "",
        ].join(","),
      ),
      "",
      "visit_camera,visit_desk,started_at,ended_at,duration_seconds",
      ...report.visits.map((visit) =>
        [csv(visit.cameraName), csv(visit.deskName), visit.startedAt, visit.endedAt ?? "", Math.round(visit.durationMs / 1000)].join(","),
      ),
    ];
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="occupancy-${date}.csv"`)
      .send(lines.join("\n"));
  });
}

async function buildDaily(date: string, businessHours: boolean) {
  const day = officeDayBounds(date, env.officeTz);
  const hours = businessHours ? businessBounds(date, env.officeTz, env.businessStart, env.businessEnd) : null;
  const window = intersectWindow(day, hours);
  const now = Date.now();
  const effective = window
    ? { startMs: window.startMs, endMs: Math.min(window.endMs, date === todayInOffice() ? now : window.endMs) }
    : null;
  const zones = await prisma.deskZone.findMany({ include: { camera: true }, orderBy: [{ cameraId: "asc" }, { sortOrder: "asc" }] });
  const desks = [];
  const visits = [];
  for (const zone of zones) {
    if (!effective || effective.endMs <= effective.startMs) {
      desks.push(emptyDesk(zone.camera.name, zone.name));
      continue;
    }
    const [sessions, events] = await Promise.all([
      prisma.occupancySession.findMany({
        where: {
          deskZoneId: zone.id,
          startedAt: { lt: new Date(effective.endMs) },
          OR: [{ endedAt: null }, { endedAt: { gt: new Date(effective.startMs) } }],
        },
        orderBy: { startedAt: "asc" },
      }),
      prisma.occupancyEvent.findMany({
        where: { deskZoneId: zone.id, occurredAt: { lt: new Date(effective.endMs) } },
        orderBy: { occurredAt: "asc" },
      }),
    ]);
    const summary = summarizeDesk({
      window: effective,
      nowMs: now,
      sessions: sessions.map((session) => ({ startedAtMs: session.startedAt.getTime(), endedAtMs: session.endedAt?.getTime() ?? null })),
      events: events.map((event) => ({ occurredAtMs: event.occurredAt.getTime(), status: event.status as ZoneStatus })),
    });
    const firstReading = events.find((event) => event.occurredAt.getTime() >= effective.startMs);
    desks.push({
      cameraName: zone.camera.name,
      deskName: zone.name,
      ...summary,
      measuredFrom: firstReading ? firstReading.occurredAt.toISOString() : null,
    });
    for (const session of sessions) {
      const spans = sessionSpans(
        { startedAtMs: session.startedAt.getTime(), endedAtMs: session.endedAt?.getTime() ?? null },
        events.map((event) => ({ occurredAtMs: event.occurredAt.getTime(), status: event.status as ZoneStatus })),
        now,
      );
      for (const span of spans) {
        const startMs = Math.max(span.startMs, effective.startMs);
        const endMs = Math.min(span.endMs, effective.endMs);
        const durationMs = Math.max(0, endMs - startMs);
        if (durationMs <= 0) continue;
        const stillOpen = session.endedAt == null && span.endMs >= now - 5_000;
        visits.push({
          cameraName: zone.camera.name,
          deskName: zone.name,
          startedAt: new Date(startMs).toISOString(),
          endedAt: stillOpen ? null : new Date(endMs).toISOString(),
          durationMs,
        });
      }
    }
  }
  visits.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return {
    date,
    timeZone: env.officeTz,
    businessHours,
    partial: date === todayInOffice(),
    desks,
    visits,
  };
}

function emptyDesk(cameraName: string, deskName: string) {
  return { cameraName, deskName, occupiedMs: 0, vacantMs: 0, unknownMs: 0, sessionCount: 0, utilization: null, measuredFrom: null as string | null };
}

function readDate(query: { date?: string }): string | null {
  if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) return query.date;
  return todayInOffice();
}

function todayInOffice(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.officeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

function csv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
