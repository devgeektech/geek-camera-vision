import { describe, expect, it } from "vitest";
import { initialZoneState, reconcileZoneState, stepOccupancy } from "./occupancy-engine.js";

const config = { occupyConfirmMs: 8000, vacantConfirmMs: 45000, disconnectGraceMs: 60000 };

describe("occupancy engine", () => {
  it("does not open a session for a walk-past shorter than the occupy delay", () => {
    let state = initialZoneState();
    state = stepOccupancy(state, { now: 0, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    const result = stepOccupancy(
      state,
      { now: 7000, streamHealthy: true, personInside: false, personCount: 0 },
      config,
    );
    expect(result.effects.some((effect) => effect.type === "open_session")).toBe(false);
    expect(result.state.sessionOpen).toBe(false);
  });

  it("opens one session after a confirmed sit", () => {
    let state = initialZoneState();
    state = stepOccupancy(state, { now: 0, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    const result = stepOccupancy(
      state,
      { now: 8000, streamHealthy: true, personInside: true, personCount: 1 },
      config,
    );
    expect(result.state.status).toBe("occupied");
    expect(result.effects.map((effect) => effect.type)).toEqual(["event", "open_session"]);
  });

  it("keeps the same session through a ten second camera blip", () => {
    let state = initialZoneState();
    state = stepOccupancy(state, { now: 0, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    state = stepOccupancy(state, { now: 8000, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    const dropped = stepOccupancy(
      state,
      { now: 9000, streamHealthy: false, personInside: false, personCount: 0 },
      config,
    );
    expect(dropped.state.status).toBe("unknown");
    expect(dropped.state.sessionOpen).toBe(true);
    const back = stepOccupancy(
      dropped.state,
      { now: 19000, streamHealthy: true, personInside: true, personCount: 1 },
      config,
    );
    const confirmed = stepOccupancy(
      back.state,
      { now: 27000, streamHealthy: true, personInside: true, personCount: 1 },
      config,
    );
    expect(confirmed.state.sessionOpen).toBe(true);
    expect(confirmed.effects.some((effect) => effect.type === "open_session")).toBe(false);
    expect(confirmed.state.status).toBe("occupied");
  });

  it("closes a session only after the vacant delay", () => {
    let state = initialZoneState();
    state = stepOccupancy(state, { now: 0, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    state = stepOccupancy(state, { now: 8000, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    const early = stepOccupancy(
      state,
      { now: 20000, streamHealthy: true, personInside: false, personCount: 0 },
      config,
    );
    expect(early.state.status).toBe("occupied");
    const closed = stepOccupancy(
      early.state,
      { now: 8000 + 45000, streamHealthy: true, personInside: false, personCount: 0 },
      config,
    );
    expect(closed.state.status).toBe("vacant");
    expect(closed.effects.some((effect) => effect.type === "close_session")).toBe(true);
  });

  it("closes the session after the disconnect grace", () => {
    let state = initialZoneState();
    state = stepOccupancy(state, { now: 0, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    state = stepOccupancy(state, { now: 8000, streamHealthy: true, personInside: true, personCount: 1 }, config).state;
    state = stepOccupancy(state, { now: 9000, streamHealthy: false, personInside: false, personCount: 0 }, config).state;
    const closed = stepOccupancy(
      state,
      { now: 9000 + 60000, streamHealthy: false, personInside: false, personCount: 0 },
      config,
    );
    expect(closed.state.sessionOpen).toBe(false);
    expect(closed.effects.some((effect) => effect.type === "close_session" && effect.reason === "camera_disconnected")).toBe(true);
  });

  it("rehydrates an open session without creating a new one", () => {
    const state = reconcileZoneState({ now: 5000, openSession: { maxPersonCount: 1 }, latestStatus: "occupied" });
    expect(state.sessionOpen).toBe(true);
    expect(state.status).toBe("occupied");
  });
});
