"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api, type LiveRow } from "@/lib/api";

const labels = { occupied: "Occupied", vacant: "Vacant", unknown: "Unknown" };

export default function LivePage() {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let socket: Socket | undefined;
    let closed = false;
    const load = () => api<LiveRow[]>("/backend/api/occupancy/current").then(setRows).catch((caught) => setError(caught.message));
    void load();
    void api<{ token: string }>("/backend/auth/socket-token").then(({ token }) => {
      if (closed) return;
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://127.0.0.1:4000", { auth: { token } });
      socket.on("occupancy.updated", load);
      socket.on("session.opened", load);
      socket.on("session.closed", load);
      socket.on("camera.health", load);
    }).catch(() => undefined);
    return () => {
      closed = true;
      socket?.close();
    };
  }, []);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Live desks</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">A dead camera is shown as Unknown, not as an empty desk. People are not identified.</p>
      {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line bg-white p-8 text-sm text-slate-600">No desks yet. Draw chairs on the camera picture first.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.deskZoneId} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{row.deskName}</h2>
                  <p className="text-sm text-slate-500">{row.cameraName}</p>
                </div>
                <StatusPill status={row.status} />
              </div>
              <p className="mt-4 text-sm text-slate-600">Camera {row.cameraStatus}{row.lastError ? ` · ${row.lastError}` : ""}</p>
              <SeatedLine startedAt={row.sessionStartedAt} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SeatedLine({ startedAt }: { startedAt: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) return <p className="mt-1 text-sm text-slate-600">No open visit</p>;
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const clock = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
  return <p className="mt-1 text-sm text-slate-600">Seated for {clock}</p>;
}

function StatusPill({ status }: { status: LiveRow["status"] }) {
  const tone = status === "occupied" ? "bg-teal text-white" : status === "vacant" ? "bg-slate-200 text-slate-800" : "bg-amber-100 text-amber-900";
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{labels[status]}</span>;
}
