import type { Point } from "./types.js";

const EDGE_EPSILON = 1e-6;

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  if (onBoundary(point, polygon)) return true;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 0.0) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function anchorPoint(
  box: { x: number; y: number; w: number; h: number },
  mode: "foot" | "center",
): Point {
  if (mode === "center") {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }
  return { x: box.x + box.w / 2, y: box.y + box.h };
}

function onBoundary(point: Point, polygon: Point[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (distanceToSegment(point, a, b) <= EDGE_EPSILON) return true;
  }
  return false;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
