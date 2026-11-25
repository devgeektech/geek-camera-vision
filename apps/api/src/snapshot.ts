import { spawn } from "node:child_process";
import { buildRtspUrl, sanitizeLogText, type CameraConnection, type CameraTransport } from "@visionops/shared";
import { env } from "./env.js";

export function captureSnapshot(camera: CameraConnection, transport: CameraTransport = "tcp"): Promise<Buffer> {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    transport,
    "-i",
    buildRtspUrl(camera),
    "-an",
    "-frames:v",
    "1",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(env.ffmpegPath, args, { shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The camera did not respond in time."));
    }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = sanitizeLogText(`${stderr}${chunk.toString()}`.slice(-2000));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(error.message.includes("ENOENT") ? "FFmpeg is not installed." : "Could not start FFmpeg."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const image = Buffer.concat(stdout);
      if (code === 0 && image.length > 0) {
        resolve(image);
        return;
      }
      reject(new Error(explainFfmpeg(stderr)));
    });
  });
}

export function explainFfmpeg(stderr: string): string {
  const text = stderr.toLowerCase();
  if (text.includes("401") || text.includes("403") || text.includes("unauthorized") || text.includes("auth")) {
    return "Authentication failed.";
  }
  if (text.includes("404") || text.includes("not found")) {
    return "Stream not found. Check the channel number.";
  }
  if (text.includes("timed out") || text.includes("connection refused") || text.includes("no route") || text.includes("error number -")) {
    return "The recorder could not be reached.";
  }
  return "The camera connection failed.";
}
