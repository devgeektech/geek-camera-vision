import { iou } from "./yolo.js";
import type { NormalizedBox } from "./types.js";

export type Track = {
  id: number;
  bbox: NormalizedBox;
  hits: number;
  missed: number;
};

export type TrackerOptions = {
  iouThreshold: number;
  maxMissed: number;
  minHits: number;
};

export type ConfirmedDetection = NormalizedBox & { trackId: number };

export function stepTracker(
  tracks: Track[],
  detections: NormalizedBox[],
  nextId: number,
  options: TrackerOptions,
): { tracks: Track[]; nextId: number; confirmed: ConfirmedDetection[] } {
  const pairs: Array<{ iou: number; trackIndex: number; detectionIndex: number }> = [];
  tracks.forEach((track, trackIndex) => {
    detections.forEach((detection, detectionIndex) => {
      const score = iou(track.bbox, detection);
      if (score >= options.iouThreshold) pairs.push({ iou: score, trackIndex, detectionIndex });
    });
  });
  pairs.sort((a, b) => b.iou - a.iou);

  const matchedTracks = new Set<number>();
  const matchedDetections = new Set<number>();
  const nextTracks: Track[] = tracks.map((track) => ({ ...track, bbox: { ...track.bbox } }));

  for (const pair of pairs) {
    if (matchedTracks.has(pair.trackIndex) || matchedDetections.has(pair.detectionIndex)) continue;
    matchedTracks.add(pair.trackIndex);
    matchedDetections.add(pair.detectionIndex);
    const detection = detections[pair.detectionIndex]!;
    const track = nextTracks[pair.trackIndex]!;
    track.bbox = { ...detection, trackId: track.id };
    track.hits += 1;
    track.missed = 0;
  }

  for (let i = 0; i < nextTracks.length; i++) {
    if (matchedTracks.has(i)) continue;
    nextTracks[i]!.missed += 1;
  }

  const surviving = nextTracks.filter((track) => track.missed <= options.maxMissed);
  detections.forEach((detection, index) => {
    if (matchedDetections.has(index)) return;
    surviving.push({
      id: nextId,
      bbox: { ...detection, trackId: nextId },
      hits: 1,
      missed: 0,
    });
    nextId += 1;
  });

  const confirmed = surviving
    .filter((track) => track.hits >= options.minHits && track.missed === 0)
    .map((track) => ({ ...track.bbox, trackId: track.id }));

  return { tracks: surviving, nextId, confirmed };
}
