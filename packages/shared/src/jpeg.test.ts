import { describe, expect, it } from "vitest";
import { createJpegParser } from "./jpeg.js";

describe("jpeg demux", () => {
  it("extracts a frame split across chunks and ignores leading noise", () => {
    const frames: Buffer[] = [];
    const push = createJpegParser((frame) => frames.push(frame));
    const jpeg = Buffer.from([0xff, 0xd8, 0x00, 0x11, 0xff, 0xd9]);
    push(Buffer.concat([Buffer.from([0x01, 0x02]), jpeg.subarray(0, 3)]));
    push(jpeg.subarray(3));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(jpeg);
  });
});
