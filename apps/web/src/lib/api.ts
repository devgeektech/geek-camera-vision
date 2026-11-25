export class ApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401 && !path.includes("/auth/login")) {
    window.location.href = "/login";
    throw new ApiError("Unauthorized");
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const body = type.includes("json") ? await response.json().catch(() => null) : null;
    throw new ApiError(body?.error ?? body?.message ?? "The request failed.");
  }
  if (type.includes("json")) return response.json() as Promise<T>;
  return response.text() as Promise<T>;
}

export type CameraDto = {
  id: string;
  name: string;
  enabled: boolean;
  vendor: "dahua" | "generic";
  host: string;
  port: number;
  username: string;
  channel: number;
  subtype: number;
  path: string | null;
  transport: "tcp" | "udp";
  targetFps: number;
  confidence: number;
  anchor: "foot" | "center";
  status: "online" | "offline" | "error";
  lastFrameAt: string | null;
  lastError: string | null;
  maskedUrl: string;
  passwordSet: boolean;
};

export type ZoneDto = {
  id: string;
  cameraId: string;
  name: string;
  polygon: { x: number; y: number }[];
  enabled: boolean;
  color: string;
  sortOrder: number;
};

export type LiveRow = {
  deskZoneId: string;
  deskName: string;
  color: string;
  cameraId: string;
  cameraName: string;
  cameraStatus: string;
  lastError: string | null;
  status: "occupied" | "vacant" | "unknown";
  reason: string | null;
  personCount: number;
  since: string | null;
  sessionStartedAt: string | null;
};

export type DetectionFile = {
  frameAt: string | null;
  frameWidth?: number;
  frameHeight?: number;
  inferenceMs: number | null;
  boxes: Array<{ x: number; y: number; w: number; h: number; confidence: number; trackId?: number; hits?: number }>;
};
