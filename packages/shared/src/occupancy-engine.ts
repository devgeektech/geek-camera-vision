import type { EventReason, ZoneStatus } from "./types.js";

export type ZoneState = {
  status: ZoneStatus;
  lastPositiveAt: number | null;
  occupyPendingSince: number | null;
  vacantPendingSince: number | null;
  unhealthySince: number | null;
  sessionOpen: boolean;
  maxPersonCount: number;
};

export type EngineConfig = {
  occupyConfirmMs: number;
  vacantConfirmMs: number;
  disconnectGraceMs: number;
};

export type EngineInput = {
  now: number;
  streamHealthy: boolean;
  personInside: boolean;
  personCount: number;
};

export type EngineEffect =
  | { type: "event"; status: ZoneStatus; reason: EventReason; personCount: number; at: number }
  | { type: "open_session"; at: number; personCount: number }
  | { type: "close_session"; at: number; reason: EventReason }
  | { type: "update_max"; personCount: number };

export function initialZoneState(): ZoneState {
  return {
    status: "unknown",
    lastPositiveAt: null,
    occupyPendingSince: null,
    vacantPendingSince: null,
    unhealthySince: null,
    sessionOpen: false,
    maxPersonCount: 0,
  };
}

export function reconcileZoneState(input: {
  now: number;
  openSession: { maxPersonCount: number } | null;
  latestStatus: ZoneStatus | null;
}): ZoneState {
  const state = initialZoneState();
  if (input.openSession) {
    return {
      ...state,
      status: "occupied",
      sessionOpen: true,
      maxPersonCount: input.openSession.maxPersonCount,
      lastPositiveAt: input.now,
    };
  }
  if (input.latestStatus && input.latestStatus !== "occupied") {
    return { ...state, status: input.latestStatus };
  }
  return state;
}

export function stepOccupancy(previous: ZoneState, input: EngineInput, config: EngineConfig): { state: ZoneState; effects: EngineEffect[] } {
  const state: ZoneState = { ...previous };
  const effects: EngineEffect[] = [];

  if (!input.streamHealthy) {
    state.occupyPendingSince = null;
    state.vacantPendingSince = null;
    if (state.unhealthySince == null) state.unhealthySince = input.now;
    if (state.status !== "unknown") {
      state.status = "unknown";
      effects.push({
        type: "event",
        status: "unknown",
        reason: "camera_disconnected",
        personCount: 0,
        at: input.now,
      });
    }
    if (state.sessionOpen && input.now - state.unhealthySince >= config.disconnectGraceMs) {
      state.sessionOpen = false;
      state.maxPersonCount = 0;
      effects.push({ type: "close_session", at: input.now, reason: "camera_disconnected" });
    }
    return { state, effects };
  }

  const restored = state.unhealthySince != null;
  state.unhealthySince = null;

  if (input.personInside) {
    state.lastPositiveAt = input.now;
    state.vacantPendingSince = null;
    if (state.status === "occupied") {
      if (input.personCount > state.maxPersonCount) {
        state.maxPersonCount = input.personCount;
        effects.push({ type: "update_max", personCount: input.personCount });
      }
      return { state, effects };
    }
    if (state.occupyPendingSince == null) state.occupyPendingSince = input.now;
    if (input.now - state.occupyPendingSince >= config.occupyConfirmMs) {
      state.status = "occupied";
      state.occupyPendingSince = null;
      state.maxPersonCount = Math.max(input.personCount, 1);
      effects.push({
        type: "event",
        status: "occupied",
        reason: "person_confirmed",
        personCount: state.maxPersonCount,
        at: input.now,
      });
      if (!state.sessionOpen) {
        state.sessionOpen = true;
        effects.push({ type: "open_session", at: input.now, personCount: state.maxPersonCount });
      }
    }
    return { state, effects };
  }

  state.occupyPendingSince = null;
  const emptyFor = state.lastPositiveAt == null ? Number.POSITIVE_INFINITY : input.now - state.lastPositiveAt;

  if (state.status === "occupied") {
    if (emptyFor >= config.vacantConfirmMs) {
      closeAsVacant(state, effects, input.now, "absent_confirmed");
    }
    return { state, effects };
  }

  if (state.status === "unknown") {
    const confirmedEmpty =
      state.lastPositiveAt == null
        ? started(state, "vacantPendingSince", input.now) >= config.vacantConfirmMs
        : emptyFor >= config.vacantConfirmMs;
    if (confirmedEmpty) {
      state.vacantPendingSince = null;
      state.status = "vacant";
      effects.push({
        type: "event",
        status: "vacant",
        reason: restored ? "camera_restored" : "absent_confirmed",
        personCount: 0,
        at: input.now,
      });
      if (state.sessionOpen) {
        state.sessionOpen = false;
        state.maxPersonCount = 0;
        effects.push({ type: "close_session", at: input.now, reason: "absent_confirmed" });
      }
    }
    return { state, effects };
  }

  state.vacantPendingSince = null;
  return { state, effects };
}

function started(state: ZoneState, key: "vacantPendingSince", now: number): number {
  if (state[key] == null) state[key] = now;
  return now - state[key]!;
}

function closeAsVacant(state: ZoneState, effects: EngineEffect[], now: number, reason: EventReason): void {
  state.status = "vacant";
  state.maxPersonCount = 0;
  effects.push({ type: "event", status: "vacant", reason, personCount: 0, at: now });
  if (state.sessionOpen) {
    state.sessionOpen = false;
    effects.push({ type: "close_session", at: now, reason });
  }
}
