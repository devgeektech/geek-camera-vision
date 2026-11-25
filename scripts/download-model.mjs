import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const url = "https://huggingface.co/Kalray/yolov8/resolve/main/yolov8n.onnx";
const destination = new URL("../models/yolov8n.onnx", import.meta.url);

await mkdir(new URL("../models/", import.meta.url), { recursive: true });
const response = await fetch(url);
if (!response.ok || !response.body) {
  throw new Error(`Could not download the ONNX model (${response.status}).`);
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
console.log(`Saved ${destination.pathname}`);
