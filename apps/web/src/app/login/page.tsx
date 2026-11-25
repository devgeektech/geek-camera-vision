"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/backend/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      window.location.href = "/live";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-line bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-teal">VisionOps</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Desk occupancy for the office camera. People are not identified.</p>
        <label className="mt-6 block text-sm font-medium" htmlFor="username">Username</label>
        <input id="username" className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        <label className="mt-4 block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" type="password" className="mt-1 w-full rounded-lg border border-line px-3 py-2" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
        <button className="mt-6 w-full rounded-lg bg-teal px-4 py-2 font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
