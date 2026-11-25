"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type CameraDto, type ZoneDto } from "@/lib/api";

type Point = { x: number; y: number };

export default function ZonesPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [camera, setCamera] = useState<CameraDto | null>(null);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [name, setName] = useState("Desk 1");
  const [anchor, setAnchor] = useState<"foot" | "center">("foot");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void params.then((value) => setId(value.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    void api<CameraDto>(`/backend/api/cameras/${id}`).then((value) => {
      setCamera(value);
      setAnchor(value.anchor);
    });
    void api<ZoneDto[]>(`/backend/api/cameras/${id}/zones`).then(setZones).catch((caught) => setError(caught.message));
  }, [id]);

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
      for (const zone of zones) drawPolygon(context, zone.polygon, canvas.width, canvas.height, zone.name);
      if (points.length > 0) drawPolygon(context, points, canvas.width, canvas.height, name);
    };
    image.addEventListener("load", draw);
    draw();
    return () => image.removeEventListener("load", draw);
  }, [zones, points, name]);

  function addPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setPoints((current) => [...current, { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }]);
  }

  async function saveZone() {
    setError("");
    setMessage("");
    try {
      const created = await api<ZoneDto>(`/backend/api/cameras/${id}/zones`, {
        method: "POST",
        body: JSON.stringify({ name, polygon: points }),
      });
      setZones((current) => [...current, created]);
      setPoints([]);
      setName(`Desk ${zones.length + 2}`);
      setMessage("Desk saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the desk.");
    }
  }

  async function saveAnchor(next: "foot" | "center") {
    setAnchor(next);
    await api(`/backend/api/cameras/${id}`, { method: "PATCH", body: JSON.stringify({ anchor: next }) });
  }

  async function disableZone(zone: ZoneDto) {
    const updated = await api<ZoneDto>(`/backend/api/zones/${zone.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !zone.enabled }) });
    setZones((current) => current.map((item) => (item.id === zone.id ? updated : item)));
  }

  async function removeZone(zone: ZoneDto) {
    if (!window.confirm(`Remove ${zone.name}? Its visit history will be deleted.`)) return;
    setError("");
    setMessage("");
    try {
      await api(`/backend/api/zones/${zone.id}`, { method: "DELETE" });
      setZones((current) => current.filter((item) => item.id !== zone.id));
      setMessage(`${zone.name} removed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the desk.");
    }
  }

  if (!camera) return <p className="text-sm text-slate-600">Loading desks…</p>;

  return (
    <section>
      <p className="text-sm text-slate-500"><Link href={`/cameras/${camera.id}`}>{camera.name}</Link> / Desks</p>
      <h1 className="mt-2 text-2xl font-semibold">Draw the chairs that count</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">Click the corners of a chair. Keep the corridor outside the shape. These coordinates stay aligned with the camera picture.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Desk name
          <input className="mt-1 block rounded-lg border border-line px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="text-sm font-medium">Anchor
          <select className="mt-1 block rounded-lg border border-line px-3 py-2" value={anchor} onChange={(event) => void saveAnchor(event.target.value as "foot" | "center")}>
            <option value="foot">Foot point</option>
            <option value="center">Box center</option>
          </select>
        </label>
        <button className="rounded-lg border border-line bg-white px-3 py-2 text-sm" type="button" onClick={() => setPoints((current) => current.slice(0, -1))}>Undo point</button>
        <button className="rounded-lg border border-line bg-white px-3 py-2 text-sm" type="button" onClick={() => setPoints([])}>Clear</button>
        <button className="rounded-lg bg-teal px-3 py-2 text-sm text-white disabled:opacity-60" type="button" disabled={points.length < 3 || name.trim().length === 0} onClick={() => void saveZone()}>Save desk</button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-teal">{message}</p> : null}
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-slate-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imageRef} src={`/backend/api/cameras/${camera.id}/latest?t=1`} alt="Snapshot used to draw desks" className="block w-full h-auto" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-crosshair" onClick={addPoint} />
      </div>
      <ul className="mt-4 space-y-2">
        {zones.map((zone) => (
          <li key={zone.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm">
            <span>{zone.name} · {zone.polygon.length} points · {zone.enabled ? "enabled" : "disabled"}</span>
            <span className="flex gap-4">
              <button className="text-teal" type="button" onClick={() => void disableZone(zone)}>{zone.enabled ? "Disable" : "Enable"}</button>
              <button className="text-red-700" type="button" onClick={() => void removeZone(zone)}>Remove</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
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
  context.globalAlpha = 0.15;
  if (points.length > 2) context.fill();
  context.globalAlpha = 1;
  context.fillText(label, points[0]!.x * width + 6, points[0]!.y * height + 16);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
