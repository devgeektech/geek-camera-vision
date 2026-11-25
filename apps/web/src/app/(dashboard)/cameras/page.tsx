"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api, type CameraDto } from "@/lib/api";

const empty = {
  name: "",
  host: "192.168.1.245",
  port: 554,
  username: "",
  password: "",
  channel: 1,
  subtype: 1,
};

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraDto[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    setCameras(await api<CameraDto[]>("/backend/api/cameras"));
  }

  useEffect(() => {
    void load().catch((caught) => setError(caught.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/backend/api/cameras", { method: "POST", body: JSON.stringify({ ...form, vendor: "dahua", transport: "tcp" }) });
      setForm(empty);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the camera.");
    } finally {
      setPending(false);
    }
  }

  const channelTaken = cameras.some(
    (camera) => camera.host === form.host && camera.channel === Number(form.channel) && camera.subtype === Number(form.subtype),
  );

  return (
    <section>
      <h1 className="text-2xl font-semibold">Cameras</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">Reading the office recorder. Video is not stored. Channels 1–12 are on 192.168.1.245, using the substream.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {cameras.length === 0 ? <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-sm text-slate-600">No camera saved yet.</p> : null}
          {cameras.map((camera) => (
            <Link key={camera.id} href={`/cameras/${camera.id}`} className="block rounded-2xl border border-line bg-white p-5 hover:border-teal">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{camera.name}</h2>
                <span className="text-xs uppercase tracking-wide text-slate-500">{camera.status}</span>
              </div>
              <p className="mt-2 break-all text-sm text-slate-600">{camera.maskedUrl}</p>
              {camera.lastError ? <p className="mt-2 text-sm text-red-700">{camera.lastError}</p> : null}
            </Link>
          ))}
        </div>
        <form onSubmit={onSubmit} className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Add camera</h2>
          <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label="Host" value={form.host} onChange={(host) => setForm({ ...form, host })} />
          <Field label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} />
          <Field label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <label className="mt-3 block text-sm font-medium" htmlFor="channel">Channel</label>
          <input id="channel" className="mt-1 w-full rounded-lg border border-line px-3 py-2" type="number" min={1} value={form.channel} onChange={(event) => setForm({ ...form, channel: Number(event.target.value) })} />
          {form.name.trim() && channelTaken ? <p className="mt-2 text-sm text-red-700">Channel {form.channel} {form.subtype === 0 ? "main stream" : "substream"} is already saved. Use another channel number for the next camera.</p> : null}
          <label className="mt-3 block text-sm font-medium">Subtype</label>
          <select className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={form.subtype} onChange={(event) => setForm({ ...form, subtype: Number(event.target.value) })}>
            <option value={1}>1 · substream</option>
            <option value={0}>0 · main stream</option>
          </select>
          {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
          <button className="mt-4 w-full rounded-lg bg-teal px-4 py-2 text-white disabled:opacity-60" disabled={pending || !form.name.trim() || channelTaken} type="submit">{pending ? "Saving…" : "Save camera"}</button>
        </form>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  const id = label.toLowerCase();
  return (
    <>
      <label className="mt-3 block text-sm font-medium" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </>
  );
}
