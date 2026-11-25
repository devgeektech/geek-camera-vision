import type { Camera } from "@visionops/db";
import { maskRtspUrl } from "@visionops/shared";

export function toCameraDto(camera: Camera) {
  return {
    id: camera.id,
    name: camera.name,
    enabled: camera.enabled,
    vendor: camera.vendor,
    host: camera.host,
    port: camera.port,
    username: camera.username,
    channel: camera.channel,
    subtype: camera.subtype,
    path: camera.path,
    transport: camera.transport,
    targetFps: camera.targetFps,
    confidence: camera.confidence,
    anchor: camera.anchor,
    status: camera.status,
    lastFrameAt: camera.lastFrameAt,
    lastError: camera.lastError,
    createdAt: camera.createdAt,
    updatedAt: camera.updatedAt,
    passwordSet: camera.password.length > 0,
    maskedUrl: maskRtspUrl({
      vendor: camera.vendor === "generic" ? "generic" : "dahua",
      host: camera.host,
      port: camera.port,
      channel: camera.channel,
      subtype: camera.subtype,
      path: camera.path,
    }),
  };
}
