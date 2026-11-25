import { env } from "./env.js";

export async function notify(body: Record<string, unknown>): Promise<void> {
  await fetch(`${env.apiUrl}/internal/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-secret": env.workerSecret,
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
