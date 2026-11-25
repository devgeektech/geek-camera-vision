import { describe, expect, it } from "vitest";
import { decodeYoloV8, mergePersonBoxes } from "./yolo.js";

describe("yolo postprocess", () => {
  it("keeps a person box and maps it back through the letterbox", () => {
    const anchors = 8;
    const channels = 6;
    const data = new Float32Array(channels * anchors);
    const set = (channel: number, anchor: number, value: number) => {
      data[channel * anchors + anchor] = value;
    };
    set(0, 0, 320);
    set(1, 0, 320);
    set(2, 0, 100);
    set(3, 0, 200);
    set(4, 0, 0.9);
    set(5, 0, 0.01);
    set(0, 1, 100);
    set(1, 1, 100);
    set(2, 1, 40);
    set(3, 1, 40);
    set(4, 1, 0.1);
    set(5, 1, 0.95);

    const boxes = decodeYoloV8(data, [1, channels, anchors], {
      confidence: 0.45,
      iouThreshold: 0.45,
      padX: 0,
      padY: 0,
      scale: 1,
      frameWidth: 640,
      frameHeight: 640,
    });

    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.classId).toBe(0);
    expect(boxes[0]?.confidence).toBeCloseTo(0.9);
    expect(boxes[0]?.x).toBeCloseTo((320 - 50) / 640);
    expect(boxes[0]?.y).toBeCloseTo((320 - 100) / 640);
  });

  it("suppresses an overlapping weaker person box", () => {
    const anchors = 8;
    const channels = 5;
    const data = new Float32Array(channels * anchors);
    const set = (channel: number, anchor: number, value: number) => {
      data[channel * anchors + anchor] = value;
    };
    for (const anchor of [0, 1]) {
      set(0, anchor, 200);
      set(1, anchor, 200);
      set(2, anchor, 80);
      set(3, anchor, 160);
    }
    set(4, 0, 0.92);
    set(4, 1, 0.6);
    const boxes = decodeYoloV8(data, [1, channels, anchors], {
      confidence: 0.45,
      iouThreshold: 0.45,
      padX: 0,
      padY: 0,
      scale: 1,
      frameWidth: 640,
      frameHeight: 640,
    });
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.confidence).toBeCloseTo(0.92);
  });

  it("joins a small box that sits inside a stronger box for the same person", () => {
    const boxes = mergePersonBoxes([
      { x: 0.56, y: 0.51, w: 0.04, h: 0.09, confidence: 0.51, classId: 0 },
      { x: 0.5, y: 0.4, w: 0.2, h: 0.4, confidence: 0.8, classId: 0 },
      { x: 0.8, y: 0.5, w: 0.1, h: 0.3, confidence: 0.7, classId: 0 },
    ]);
    expect(boxes).toHaveLength(2);
    expect(boxes.map((box) => box.confidence)).toEqual([0.8, 0.7]);
  });
});
