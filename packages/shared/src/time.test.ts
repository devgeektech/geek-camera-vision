import { describe, expect, it } from "vitest";
import { businessBounds, intersectWindow, officeDayBounds, summarizeDesk } from "./time.js";

describe("daily occupancy", () => {
  it("splits a session that crosses midnight", () => {
    const day = officeDayBounds("2026-11-03", "UTC");
    const next = officeDayBounds("2026-11-04", "UTC");
    const session = { startedAtMs: Date.parse("2026-11-03T23:00:00Z"), endedAtMs: Date.parse("2026-11-04T01:00:00Z") };
    const first = summarizeDesk({ window: day, nowMs: Date.parse("2026-11-05T00:00:00Z"), sessions: [session], events: [] });
    const second = summarizeDesk({ window: next, nowMs: Date.parse("2026-11-05T00:00:00Z"), sessions: [session], events: [] });
    expect(first.occupiedMs).toBe(60 * 60 * 1000);
    expect(second.occupiedMs).toBe(60 * 60 * 1000);
  });

  it("does not carry an older vacant reading into today's report", () => {
    const startMs = 1_000_000;
    const summary = summarizeDesk({
      window: { startMs, endMs: startMs + 3 * 60 * 60 * 1000 },
      nowMs: startMs + 3 * 60 * 60 * 1000,
      sessions: [{ startedAtMs: startMs + 2 * 60 * 60 * 1000, endedAtMs: null }],
      events: [
        { occurredAtMs: startMs - 86_400_000, status: "vacant" },
        { occurredAtMs: startMs + 2 * 60 * 60 * 1000, status: "occupied" },
      ],
    });
    expect(summary.vacantMs).toBe(0);
    expect(summary.unknownMs).toBe(0);
    expect(summary.occupiedMs).toBe(60 * 60 * 1000);
  });

  it("does not call the time before the first reading unknown", () => {
    const summary = summarizeDesk({
      window: { startMs: 0, endMs: 100_000 },
      nowMs: 100_000,
      sessions: [{ startedAtMs: 80_000, endedAtMs: null }],
      events: [
        { occurredAtMs: 50_000, status: "vacant" },
        { occurredAtMs: 80_000, status: "occupied" },
      ],
    });
    expect(summary.unknownMs).toBe(0);
    expect(summary.vacantMs).toBe(30_000);
    expect(summary.occupiedMs).toBe(20_000);
  });

  it("keeps unknown time out of the utilization denominator", () => {
    const window = { startMs: 0, endMs: 100_000 };
    const summary = summarizeDesk({
      window,
      nowMs: 100_000,
      sessions: [{ startedAtMs: 0, endedAtMs: 40_000 }],
      events: [
        { occurredAtMs: 0, status: "occupied" },
        { occurredAtMs: 40_000, status: "unknown" },
        { occurredAtMs: 70_000, status: "vacant" },
      ],
    });
    expect(summary.unknownMs).toBe(30_000);
    expect(summary.vacantMs).toBe(30_000);
    expect(summary.utilization).toBeCloseTo(40_000 / (40_000 + 30_000));
  });

  it("clips an open session at now inside business hours", () => {
    const day = officeDayBounds("2026-11-03", "Asia/Kolkata");
    const hours = businessBounds("2026-11-03", "Asia/Kolkata", "09:00", "18:00");
    const window = intersectWindow(day, hours)!;
    const now = hours.startMs + 2 * 60 * 60 * 1000;
    const summary = summarizeDesk({
      window: { startMs: window.startMs, endMs: Math.min(window.endMs, now) },
      nowMs: now,
      sessions: [{ startedAtMs: hours.startMs, endedAtMs: null }],
      events: [{ occurredAtMs: hours.startMs, status: "occupied" }],
    });
    expect(summary.occupiedMs).toBe(2 * 60 * 60 * 1000);
    expect(summary.sessionCount).toBe(1);
  });

  it("does not fill this morning from a visit left open while the server was off", () => {
    const start = Date.parse("2026-11-25T03:30:00Z");
    const now = start + (3 * 60 + 43) * 60 * 1000;
    const summary = summarizeDesk({
      window: { startMs: start, endMs: now },
      nowMs: now,
      sessions: [{ startedAtMs: Date.parse("2026-11-23T06:56:22Z"), endedAtMs: null }],
      events: [{ occurredAtMs: Date.parse("2026-11-23T06:56:22Z"), status: "occupied" }],
    });
    expect(summary.occupiedMs).toBe(0);
    expect(summary.sessionCount).toBe(0);
  });

  it("does not keep a close that was written days after the last reading", () => {
    const start = Date.parse("2026-11-25T03:30:00Z");
    const now = start + 4 * 60 * 60 * 1000;
    const summary = summarizeDesk({
      window: { startMs: start, endMs: now },
      nowMs: now,
      sessions: [{ startedAtMs: Date.parse("2026-11-23T07:41:21Z"), endedAtMs: Date.parse("2026-11-25T07:11:48Z") }],
      events: [
        { occurredAtMs: Date.parse("2026-11-23T07:41:21Z"), status: "occupied" },
        { occurredAtMs: Date.parse("2026-11-25T07:11:48Z"), status: "vacant" },
      ],
    });
    expect(summary.occupiedMs).toBe(0);
  });

  it("still counts a sit that started this morning", () => {
    const start = Date.parse("2026-11-25T03:30:00Z");
    const sat = start + 60 * 60 * 1000;
    const now = sat + 2 * 60 * 60 * 1000;
    const summary = summarizeDesk({
      window: { startMs: start, endMs: now },
      nowMs: now,
      sessions: [{ startedAtMs: sat, endedAtMs: null }],
      events: [{ occurredAtMs: sat, status: "occupied" }],
    });
    expect(summary.occupiedMs).toBe(2 * 60 * 60 * 1000);
    expect(summary.sessionCount).toBe(1);
  });
});
