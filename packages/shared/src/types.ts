export type ZoneStatus = "occupied" | "vacant" | "unknown";

export type CameraVendor = "dahua" | "generic";
export type AnchorMode = "foot" | "center";
export type CameraTransport = "tcp" | "udp";
export type CameraHealth = "online" | "offline" | "error";

export type Point = { x: number; y: number };

export type NormalizedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  classId: number;
  trackId?: number;
};

export type CameraConnection = {
  vendor: CameraVendor;
  host: string;
  port: number;
  username: string;
  password: string;
  channel: number;
  subtype: number;
  path?: string | null;
};

export const zoneStatuses = ["occupied", "vacant", "unknown"] as const;
export const eventReasons = [
  "person_confirmed",
  "absent_confirmed",
  "camera_disconnected",
  "camera_restored",
  "inference_error",
  "worker_restart",
  "still_present",
  "zone_disabled",
] as const;

export type EventReason = (typeof eventReasons)[number];
