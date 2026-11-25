import { describe, expect, it } from "vitest";
import { stepTracker } from "./tracker.js";
import type { NormalizedBox } from "./types.js";

const box = (x: number): NormalizedBox => ({ x, y: 0.2, w: 0.2, h: 0.4, confidence: 0.8, classId: 0 });

describe("tracker", () => {
  it("requires three hits before a detection is confirmed and keeps the id", () => {
    const options = { iouThreshold: 0.3, maxMissed: 10, minHits: 3 };
    let tracks: ReturnType<typeof stepTracker>["tracks"] = [];
    let nextId = 1;
    let confirmed: Array<NormalizedBox & { trackId: number }> = [];
    for (let i = 0; i < 3; i++) {
      const stepped = stepTracker(tracks, [box(0.1)], nextId, options);
      tracks = stepped.tracks;
      nextId = stepped.nextId;
      confirmed = stepped.confirmed;
    }
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]?.trackId).toBe(1);

    const missed = stepTracker(tracks, [], nextId, options);
    const returned = stepTracker(missed.tracks, [box(0.11)], missed.nextId, options);
    expect(returned.confirmed[0]?.trackId).toBe(1);
  });
});
