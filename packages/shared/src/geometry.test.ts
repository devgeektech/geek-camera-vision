import { describe, expect, it } from "vitest";
import { anchorPoint, pointInPolygon } from "./geometry.js";

const square = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

describe("zones", () => {
  it("includes an interior point and a point on an edge", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.5, y: 0.2 }, square)).toBe(true);
  });

  it("excludes a point outside the polygon", () => {
    expect(pointInPolygon({ x: 0.1, y: 0.5 }, square)).toBe(false);
  });

  it("uses the bottom center as the foot anchor", () => {
    expect(anchorPoint({ x: 0.1, y: 0.2, w: 0.2, h: 0.4 }, "foot").y).toBeCloseTo(0.6);
    expect(anchorPoint({ x: 0.1, y: 0.2, w: 0.2, h: 0.4 }, "center").y).toBeCloseTo(0.4);
  });
});
