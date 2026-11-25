import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createJpegParser, sanitizeLogText } from "@visionops/shared";

const BACKOFF_MS = [1000, 2000, 5000, 10000];

export function backoffDelay(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 10000;
}

export function startMjpegStream(options: {
  ffmpegPath: string;
  url: string;
  transport: "tcp" | "udp";
  fps: number;
  onFrame: (jpeg: Buffer) => void;
  onLog: (line: string) => void;
}): { stop: () => void; exited: Promise<number | null> } {
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-rtsp_transport",
    options.transport,
    "-i",
    options.url,
    "-an",
    "-vf",
    `fps=${options.fps}`,
    "-f",
    "image2pipe",
    "-q:v",
    "5",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  ];
  const child = spawn(options.ffmpegPath, args, { shell: false, windowsHide: true });
  const parse = createJpegParser(options.onFrame);
  child.stdout.on("data", (chunk: Buffer) => parse(chunk));
  child.stderr.on("data", (chunk: Buffer) => options.onLog(sanitizeLogText(chunk.toString()).trim()));
  const exited = new Promise<number | null>((resolve) => {
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code));
  });
  return {
    stop: () => stopChild(child),
    exited,
  };
}

function stopChild(child: ChildProcessWithoutNullStreams): void {
  if (child.killed || child.exitCode !== null) return;
  child.kill();
}
