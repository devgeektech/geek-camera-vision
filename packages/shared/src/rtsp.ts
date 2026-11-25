import type { CameraConnection } from "./types.js";

export function buildRtspUrl(camera: CameraConnection): string {
  const user = encodeURIComponent(camera.username);
  const pass = encodeURIComponent(camera.password);
  const path = cameraPath(camera);
  return `rtsp://${user}:${pass}@${camera.host}:${camera.port}${path}`;
}

export function maskRtspUrl(camera: Omit<CameraConnection, "username" | "password"> & { username?: string }): string {
  return `rtsp://***@${camera.host}:${camera.port}${cameraPath(camera)}`;
}

export function cameraPath(camera: Pick<CameraConnection, "vendor" | "channel" | "subtype" | "path">): string {
  if (camera.vendor === "dahua") {
    return `/cam/realmonitor?channel=${camera.channel}&subtype=${camera.subtype}`;
  }
  const path = camera.path?.trim() || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function sanitizeLogText(value: string): string {
  return value.replace(/rtsp:\/\/[^\s]+/gi, "rtsp://***").replace(/password[=:]\s*\S+/gi, "password=***");
}
