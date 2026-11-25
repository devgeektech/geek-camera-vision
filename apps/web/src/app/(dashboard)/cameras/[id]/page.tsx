"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api, type CameraDto, type DetectionFile, type ZoneDto } from "@/lib/api";

export default function CameraDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [camera, setCamera] = useState<CameraDto | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [detections, setDetections] = useState<DetectionFile>({ frameAt: null, boxes: [], inferenceMs: null });
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showIds, setShowIds] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    void params.then((value) => setId(value.id));
    setZoom(1);
  }, [params]);

  useEffect(() => {
    if (!id) return;
    void api<CameraDto>(`/backend/api/cameras/${id}`).then(setCamera).catch((caught) => setError(caught.message));
    void api<ZoneDto[]>(`/backend/api/cameras/${id}/zones`).then(setZones).catch(() => undefined);
    let socket: Socket | undefined;
    const refresh = () => {
      setImageUrl(`/backend/api/cameras/${id}/latest?t=${Date.now()}`);
      void api<DetectionFile>(`/backend/api/cameras/${id}/detections`).then(setDetections).catch(() => undefined);
    };
    refresh();
    const keepMoving = setInterval(refresh, 700);
    const keepWatching = setInterval(() => {
      void fetch(`/backend/api/cameras/${id}/watch`, { method: "POST", credentials: "include" }).catch(() => undefined);
    }, 3000);
    void api<{ token: string }>("/backend/auth/socket-token").then(({ token }) => {
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:4000", { auth: { token } });
      socket.on("camera.frame", (body: { cameraId?: string }) => {
        if (body.cameraId === id) refresh();
      });
    }).catch(() => undefined);
    return () => {
      clearInterval(keepMoving);
      clearInterval(keepWatching);
      socket?.close();
    };
  }, [id]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const draw = () => {
      const frame = renderedFrame(image);
      canvas.width = image.clientWidth;
      canvas.height = image.clientHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const zone of zones) {
        if (!zone.enabled) continue;
        drawDesk(context, zone, frame);
      }
      if (!showBoxes) return;
      for (const box of detections.boxes) {
        const boxX = frame.x + box.x * frame.width;
        const boxY = frame.y + box.y * frame.height;
        const boxW = box.w * frame.width;
        const boxH = box.h * frame.height;
        context.lineJoin = "round";
        context.lineWidth = 4;
        context.strokeStyle = "rgba(0, 0, 0, 0.85)";
        context.strokeRect(boxX, boxY, boxW, boxH);
        context.lineWidth = 2;
        context.strokeStyle = "#3dff7a";
        context.strokeRect(boxX, boxY, boxW, boxH);
        if (showIds && box.trackId != null) {
          context.fillStyle = "#0f766e";
          context.font = "12px Segoe UI";
          context.fillText(String(box.trackId), frame.x + box.x * frame.width + 4, frame.y + box.y * frame.height + 14);
        }
      }
    };
    image.addEventListener("load", draw);
    window.addEventListener("resize", draw);
    const frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      image.removeEventListener("load", draw);
      window.removeEventListener("resize", draw);
    };
  }, [detections, imageUrl, showBoxes, showIds, full, zones, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 0.25 : -0.25);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoom, imageUrl]);

  function changeZoom(delta: number) {
    const viewport = viewportRef.current;
    const next = clampZoom(zoom + delta);
    if (!viewport || next === zoom) {
      setZoom(next);
      return;
    }
    const ratio = next / zoom;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    setZoom(next);
    requestAnimationFrame(() => {
      viewport.scrollLeft = centerX * ratio - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * ratio - viewport.clientHeight / 2;
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = viewport.scrollLeft;
    const startTop = viewport.scrollTop;
    viewport.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      viewport.scrollLeft = startLeft - (moveEvent.clientX - startX);
      viewport.scrollTop = startTop - (moveEvent.clientY - startY);
    };
    const up = () => {
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", up);
    };
    viewport.addEventListener("pointermove", move);
    viewport.addEventListener("pointerup", up);
  }

  async function toggleFullScreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement === stage) await document.exitFullscreen();
    else await stage.requestFullscreen();
  }

  async function capture() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/backend/api/cameras/${id}/test`, { method: "POST", credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "The camera connection failed." }));
        throw new Error(body.error);
      }
      const blob = await response.blob();
      setImageUrl(URL.createObjectURL(blob));
      const next = await api<CameraDto>(`/backend/api/cameras/${id}`);
      setCamera(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The camera connection failed.");
    } finally {
      setPending(false);
    }
  }

  if (!camera) return <p className="text-sm text-slate-600">Loading camera…</p>;

  return (
    <section>
      <p className="text-sm text-slate-500"><Link href="/cameras">Cameras</Link> / {camera.name}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{camera.name}</h1>
          <p className="mt-1 break-all text-sm text-slate-600">{camera.maskedUrl}</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-line bg-white px-4 py-2 text-sm" onClick={() => void toggleFullScreen()} type="button">{full ? "Exit full screen" : "Full screen"}</button>
          <button className="rounded-lg bg-teal px-4 py-2 text-sm text-white disabled:opacity-60" onClick={() => void capture()} disabled={pending} type="button">{pending ? "Capturing…" : "Capture still"}</button>
          <Link className="rounded-lg border border-line bg-white px-4 py-2 text-sm" href={`/cameras/${camera.id}/zones`}>Draw desks</Link>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">Status {camera.status}. {camera.lastError ?? "It detects people. It does not identify them."}</p>
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <div className="mt-4 flex gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showBoxes} onChange={(event) => setShowBoxes(event.target.checked)} /> Show people</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showIds} onChange={(event) => setShowIds(event.target.checked)} /> Show temporary ids</label>
        {detections.inferenceMs != null ? <span className="text-slate-500">{detections.inferenceMs} ms</span> : null}
      </div>
      <div ref={stageRef} className={`relative mt-4 bg-slate-900 ${full ? "" : "overflow-hidden rounded-2xl border border-line"}`}>
        {imageUrl ? (
          <div
            ref={viewportRef}
            className={`overflow-auto ${full ? "h-screen" : "max-h-[70vh]"} ${zoom > 1 ? "cursor-grab" : ""}`}
            onPointerDown={onPointerDown}
          >
            <div className="relative" style={{ width: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imageRef} src={imageUrl} alt="Latest frame from the office camera" className="block h-auto w-full" />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
          </div>
        ) : (
          <p className="p-8 text-sm text-slate-300">Capture a still to see this camera.</p>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-black/60 px-2 py-1 text-sm text-white">
          <button className="px-2 py-1" type="button" onClick={() => changeZoom(-0.25)} aria-label="Zoom out">−</button>
          <input className="w-24" type="range" min={1} max={4} step={0.25} value={zoom} aria-label="Zoom" onChange={(event) => changeZoom(Number(event.target.value) - zoom)} />
          <button className="px-2 py-1" type="button" onClick={() => changeZoom(0.25)} aria-label="Zoom in">+</button>
          <span className="w-10 text-center">{zoom.toFixed(1)}×</span>
        </div>
        <button className="absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-2 text-sm text-white" onClick={() => void toggleFullScreen()} type="button">{full ? "Exit full screen" : "Full screen"}</button>
      </div>
    </section>
  );
}

function clampZoom(value: number): number {
  return Math.min(4, Math.max(1, Math.round(value * 4) / 4));
}

function drawDesk(
  context: CanvasRenderingContext2D,
  zone: ZoneDto,
  frame: { x: number; y: number; width: number; height: number },
) {
  const points = zone.polygon;
  if (points.length < 3) return;
  context.beginPath();
  points.forEach((point, index) => {
    const x = frame.x + point.x * frame.width;
    const y = frame.y + point.y * frame.height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.lineJoin = "round";
  context.lineWidth = 5;
  context.strokeStyle = "rgba(0, 0, 0, 0.8)";
  context.stroke();
  context.lineWidth = 2.5;
  context.strokeStyle = "#ffb020";
  context.stroke();
  context.fillStyle = "#ffb020";
  context.globalAlpha = 0.14;
  context.fill();
  context.globalAlpha = 1;
  const centerX = frame.x + (points.reduce((sum, point) => sum + point.x, 0) / points.length) * frame.width;
  const centerY = frame.y + (points.reduce((sum, point) => sum + point.y, 0) / points.length) * frame.height;
  context.font = "12px Segoe UI";
  const textWidth = context.measureText(zone.name).width;
  context.fillStyle = "rgba(15, 23, 42, 0.45)";
  context.fillRect(centerX - textWidth / 2 - 4, centerY - 9, textWidth + 8, 16);
  context.fillStyle = "#ffffff";
  context.fillText(zone.name, centerX - textWidth / 2, centerY + 3);
}

function renderedFrame(image: HTMLImageElement): { x: number; y: number; width: number; height: number } {
  const elementWidth = image.clientWidth;
  const elementHeight = image.clientHeight;
  const naturalWidth = image.naturalWidth || elementWidth;
  const naturalHeight = image.naturalHeight || elementHeight;
  if (elementWidth === 0 || elementHeight === 0 || naturalWidth === 0 || naturalHeight === 0) {
    return { x: 0, y: 0, width: elementWidth, height: elementHeight };
  }
  const scale = Math.min(elementWidth / naturalWidth, elementHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return { x: (elementWidth - width) / 2, y: (elementHeight - height) / 2, width, height };
}
