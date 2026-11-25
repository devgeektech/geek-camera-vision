import { fromZonedTime } from "date-fns-tz";
import type { ZoneStatus } from "./types.js";

export type TimeWindow = { startMs: number; endMs: number };

export function officeDayBounds(date: string, timeZone: string): TimeWindow {
  const start = fromZonedTime(`${date}T00:00:00`, timeZone);
  const end = fromZonedTime(`${addCivilDays(date, 1)}T00:00:00`, timeZone);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function businessBounds(date: string, timeZone: string, start: string, end: string): TimeWindow {
  return {
    startMs: fromZonedTime(`${date}T${normalizeClock(start)}`, timeZone).getTime(),
    endMs: fromZonedTime(`${date}T${normalizeClock(end)}`, timeZone).getTime(),
  };
}

export function intersectWindow(a: TimeWindow, b: TimeWindow | null): TimeWindow | null {
  if (!b) return a;
  const startMs = Math.max(a.startMs, b.startMs);
  const endMs = Math.min(a.endMs, b.endMs);
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

export function overlapMs(a: TimeWindow, b: TimeWindow): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

export const maxUnobservedGapMs = 12 * 60 * 60 * 1000;

export type ReportSession = { startedAtMs: number; endedAtMs: number | null };
export type ReportEvent = { occurredAtMs: number; status: ZoneStatus };

export function sessionSpans(session: ReportSession, events: ReportEvent[], nowMs: number, gapMs = maxUnobservedGapMs): TimeWindow[] {
  const hardEnd = session.endedAtMs ?? nowMs;
  const marks = [session.startedAtMs];
  for (const event of events) {
    if (event.status !== "occupied") continue;
    if (event.occurredAtMs < session.startedAtMs || event.occurredAtMs > hardEnd) continue;
    marks.push(event.occurredAtMs);
  }
  marks.sort((left, right) => left - right);
  const spans: TimeWindow[] = [];
  let startMs = marks[0]!;
  let endMs = marks[0]!;
  const closeSpan = (nextEnd: number) => {
    if (nextEnd > startMs) spans.push({ startMs, endMs: nextEnd });
  };
  for (const mark of marks.slice(1)) {
    if (mark - endMs <= gapMs) {
      endMs = mark;
      continue;
    }
    closeSpan(endMs);
    startMs = mark;
    endMs = mark;
  }
  closeSpan(hardEnd - endMs <= gapMs ? hardEnd : endMs);
  return spans;
}

export type DeskSummary = {
  occupiedMs: number;
  vacantMs: number;
  unknownMs: number;
  sessionCount: number;
  utilization: number | null;
};

export function summarizeDesk(input: {
  window: TimeWindow;
  nowMs: number;
  sessions: ReportSession[];
  events: ReportEvent[];
}): DeskSummary {
  const occupiedMs = input.sessions.reduce((total, session) => {
    return total + sessionSpans(session, input.events, input.nowMs).reduce((spanTotal, span) => spanTotal + overlapMs(input.window, span), 0);
  }, 0);

  const durations = statusDurations(input.events, input.window);
  const sessionCount = input.sessions.reduce((count, session) => {
    const seen = sessionSpans(session, input.events, input.nowMs).some((span) => overlapMs(input.window, span) > 0);
    return count + (seen ? 1 : 0);
  }, 0);
  const denominator = occupiedMs + durations.vacant;
  return {
    occupiedMs,
    vacantMs: durations.vacant,
    unknownMs: durations.unknown,
    sessionCount,
    utilization: denominator > 0 ? occupiedMs / denominator : null,
  };
}

export function statusDurations(events: ReportEvent[], window: TimeWindow): Record<ZoneStatus, number> {
  const sorted = [...events].sort((a, b) => a.occurredAtMs - b.occurredAtMs);
  let status: ZoneStatus = "unknown";
  let cursor = window.startMs;
  let started = false;
  const totals: Record<ZoneStatus, number> = { occupied: 0, vacant: 0, unknown: 0 };
  for (const event of sorted) {
    if (event.occurredAtMs <= window.startMs) continue;
    if (event.occurredAtMs >= window.endMs) break;
    if (!started) {
      cursor = event.occurredAtMs;
      status = event.status;
      started = true;
      continue;
    }
    totals[status] += event.occurredAtMs - cursor;
    cursor = event.occurredAtMs;
    status = event.status;
  }
  if (started) totals[status] += Math.max(0, window.endMs - cursor);
  return totals;
}

export function addCivilDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function normalizeClock(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}
