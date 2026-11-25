"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/live", label: "Live" },
  { href: "/cameras", label: "Cameras" },
  { href: "/desks", label: "Desks" },
  { href: "/reports", label: "Reports" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/backend/auth/me", { credentials: "include" }).then((response) => {
      if (!response.ok) window.location.href = "/login";
      else setReady(true);
    });
  }, []);

  async function logout() {
    await fetch("/backend/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  }

  if (!ready) {
    return <p className="p-8 text-sm text-slate-600">Loading Geek vision…</p>;
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="flex flex-col border-b border-line bg-white md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-4 py-5">
          <img src="/geek-logo.png" alt="" className="h-11 w-11" />
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">Geek vision</p>
            <p className="mt-0.5 text-xs text-slate-500">Office recorder</p>
          </div>
        </div>
        <nav className="flex gap-2 overflow-y-auto px-3 pb-4 md:block md:flex-1 md:px-3">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-teal text-white" : "text-slate-700 hover:bg-mist"}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-3 py-4">
          <button className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-slate-700 hover:bg-mist" type="button" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </aside>
      <div className="px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}
