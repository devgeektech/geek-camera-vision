"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";

type Report = {
  date: string;
  timeZone: string;
  partial: boolean;
  businessHours: boolean;
  desks: Array<{
    cameraName: string;
    deskName: string;
    occupiedMs: number;
    vacantMs: number;
    unknownMs: number;
    utilization: number | null;
    sessionCount: number;
    measuredFrom: string | null;
  }>;
  visits: Array<{
    cameraName: string;
    deskName: string;
    startedAt: string;
    endedAt: string | null;
    durationMs: number;
  }>;
};

export default function ReportsPage() {
  const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const [businessHours, setBusinessHours] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams({ date, businessHours: String(businessHours) });
    void api<Report>(`/backend/api/reports/daily?${query}`).then(setReport).catch((caught) => setError(caught.message));
  }, [date, businessHours]);

  const chart = (report?.desks ?? []).map((desk) => ({
    name: desk.deskName,
    Occupied: Math.round(desk.occupiedMs / 60000),
    Vacant: Math.round(desk.vacantMs / 60000),
    Unknown: Math.round(desk.unknownMs / 60000),
  }));

  return (
    <section>
      <h1 className="text-2xl font-semibold">Daily occupancy</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">Desk occupancy for the office day, not employee productivity. Times use {report?.timeZone ?? "Asia/Kolkata"}.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">Date
          <input className="mt-1 block rounded-lg border border-line px-3 py-2" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={businessHours} onChange={(event) => setBusinessHours(event.target.checked)} />
          Business hours 09:00–18:00
        </label>
        <a className="rounded-lg border border-line bg-white px-4 py-2 text-sm" href={`/backend/api/reports/daily.csv?date=${date}&businessHours=${businessHours}`}>Download CSV</a>
      </div>
      {report?.partial ? <p className="mt-3 text-sm text-slate-500">Today is still in progress.</p> : null}
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <div className="mt-6 h-72 rounded-2xl border border-line bg-white p-4">
        {chart.length === 0 ? <p className="text-sm text-slate-600">No desks to chart yet.</p> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis unit="m" />
              <Tooltip />
              <Bar dataKey="Occupied" fill="#0f766e" />
              <Bar dataKey="Vacant" fill="#94a3b8" />
              <Bar dataKey="Unknown" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Desk</th>
              <th className="px-4 py-3 font-medium">Occupied</th>
              <th className="px-4 py-3 font-medium">Vacant</th>
              <th className="px-4 py-3 font-medium">Unknown</th>
              <th className="px-4 py-3 font-medium">Utilization</th>
                <th className="px-4 py-3 font-medium">Visits</th>
                <th className="px-4 py-3 font-medium">Counting from</th>
              </tr>
            </thead>
            <tbody>
              {(report?.desks ?? []).map((desk) => (
                <tr key={`${desk.cameraName}-${desk.deskName}`} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{desk.deskName}</td>
                  <td className="px-4 py-3">{formatDuration(desk.occupiedMs)}</td>
                  <td className="px-4 py-3">{formatDuration(desk.vacantMs)}</td>
                  <td className="px-4 py-3">{formatDuration(desk.unknownMs)}</td>
                  <td className="px-4 py-3">{desk.utilization == null ? "—" : `${Math.round(desk.utilization * 100)}%`}</td>
                  <td className="px-4 py-3">{desk.sessionCount}</td>
                  <td className="px-4 py-3">{desk.measuredFrom ? formatClock(desk.measuredFrom, report?.timeZone) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="mt-8 text-lg font-semibold">Visits</h2>
        <p className="mt-1 text-sm text-slate-600">Each time someone sat down and later left. An open visit is still in the chair.</p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Desk</th>
                <th className="px-4 py-3 font-medium">Camera</th>
                <th className="px-4 py-3 font-medium">Sat down</th>
                <th className="px-4 py-3 font-medium">Left</th>
                <th className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {(report?.visits ?? []).length === 0 ? (
                <tr><td className="px-4 py-3 text-slate-500" colSpan={5}>No visits in this period.</td></tr>
              ) : (report?.visits ?? []).map((visit) => (
                <tr key={`${visit.deskName}-${visit.startedAt}`} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{visit.deskName}</td>
                  <td className="px-4 py-3">{visit.cameraName}</td>
                  <td className="px-4 py-3">{formatClock(visit.startedAt, report?.timeZone)}</td>
                  <td className="px-4 py-3">{visit.endedAt ? formatClock(visit.endedAt, report?.timeZone) : "Still seated"}</td>
                  <td className="px-4 py-3">{formatDuration(visit.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </section>
  );
}

function formatClock(value: string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDuration(ms: number): string {
  if (ms > 0 && ms < 60_000) return "<1m";
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
