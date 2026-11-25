"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Point = { x: number; y: number };

type DeskRow = {
  id: string;
  name: string;
  cameraId: string;
  cameraName: string;
  channel: number;
  polygon: Point[];
  enabled: boolean;
  color: string;
};

export default function DesksPage() {
  const [desks, setDesks] = useState<DeskRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function removeDesk(desk: DeskRow) {
    if (!window.confirm(`Remove ${desk.name}? Its visit history will be deleted.`)) return;
    setError("");
    setMessage("");
    try {
      await api(`/backend/api/zones/${desk.id}`, { method: "DELETE" });
      setDesks((current) => current.filter((item) => item.id !== desk.id));
      setMessage(`${desk.name} removed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the desk.");
    }
  }

  useEffect(() => {
    void api<DeskRow[]>("/backend/api/zones").then(setDesks).catch((caught) => setError(caught.message));
  }, []);

  const cameras = new Map<string, { cameraId: string; cameraName: string; channel: number; desks: DeskRow[] }>();
  for (const desk of desks) {
    const group = cameras.get(desk.cameraId) ?? { cameraId: desk.cameraId, cameraName: desk.cameraName, channel: desk.channel, desks: [] };
    group.desks.push(desk);
    cameras.set(desk.cameraId, group);
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Drawn desks</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">Every chair that has been drawn, with its name on the camera picture.</p>
      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-teal">{message}</p> : null}
      {desks.length === 0 ? <p className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-slate-600">No desks drawn yet.</p> : null}
      <div className="mt-6 space-y-8">
        {[...cameras.values()].map((camera) => (
          <article key={camera.cameraId}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{camera.cameraName}</h2>
                <p className="text-sm text-slate-500">{camera.desks.map((desk) => desk.name).join(" · ")}</p>
              </div>
              <Link className="text-sm text-teal" href={`/cameras/${camera.cameraId}/zones`}>Edit these desks</Link>
            </div>
            <DeskPicture cameraId={camera.cameraId} desks={camera.desks} />
            <ul className="mt-3 space-y-2">
              {camera.desks.map((desk) => (
                <li key={desk.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm">
                  <span>{desk.name}{desk.enabled ? "" : " · disabled"}</span>
                  <button className="text-red-700" type="button" onClick={() => void removeDesk(desk)}>Remove</button>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeskPicture({ cameraId, desks }: { cameraId: string; desks: DeskRow[] }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const draw = () => {
      canvas.width = image.clientWidth;
      canvas.height = image.clientHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const desk of desks) drawPolygon(context, desk.polygon, canvas.width, canvas.height, desk.name);
    };
    image.addEventListener("load", draw);
    window.addEventListener("resize", draw);
    draw();
    return () => {
      image.removeEventListener("load", draw);
      window.removeEventListener("resize", draw);
    };
  }, [desks]);

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-line bg-slate-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imageRef} src={`/backend/api/cameras/${cameraId}/latest?t=1`} alt="" className="block h-auto w-full" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}

function drawPolygon(context: CanvasRenderingContext2D, points: Point[], width: number, height: number, label: string) {
  if (points.length === 0) return;
  context.beginPath();
  points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  if (points.length > 2) context.closePath();
  context.lineJoin = "round";
  context.lineWidth = 5;
  context.strokeStyle = "rgba(0, 0, 0, 0.8)";
  context.stroke();
  context.lineWidth = 2.5;
  context.strokeStyle = "#ffb020";
  context.stroke();
  context.fillStyle = "#ffb020";
  context.globalAlpha = 0.18;
  if (points.length > 2) context.fill();
  context.globalAlpha = 1;
  context.font = "14px Segoe UI";
  context.fillText(label, points[0]!.x * width + 6, points[0]!.y * height + 18);
}
