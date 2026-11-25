import { describe, expect, it } from "vitest";
import { buildRtspUrl, maskRtspUrl, sanitizeLogText } from "./rtsp.js";

describe("rtsp url", () => {
  it("percent-encodes an @ in the password and keeps the query string intact", () => {
    const url = buildRtspUrl({
      vendor: "dahua",
      host: "192.168.1.245",
      port: 554,
      username: "admin",
      password: "p@ss",
      channel: 3,
      subtype: 1,
    });
    expect(url).toBe("rtsp://admin:p%40ss@192.168.1.245:554/cam/realmonitor?channel=3&subtype=1");
  });

  it("masks credentials", () => {
    expect(
      maskRtspUrl({ vendor: "dahua", host: "192.168.1.245", port: 554, channel: 3, subtype: 1 }),
    ).toBe("rtsp://***@192.168.1.245:554/cam/realmonitor?channel=3&subtype=1");
  });

  it("strips rtsp urls from log text", () => {
    expect(sanitizeLogText("failed rtsp://admin:secret@192.168.1.245:554/cam")).toBe("failed rtsp://***");
  });
});
