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

  if (!ready) {
    return <p className="p-8 text-sm text-slate-600">Loading VisionOps…</p>;
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-white md:border-b-0 md:border-r">
        <div className="px-5 py-6">
          <p className="text-sm font-semibold text-teal">VisionOps</p>
          <p className="mt-1 text-xs text-slate-500">Channels 1–12 · office recorder</p>
        </div>
        <nav className="flex gap-2 px-3 pb-4 md:block md:px-3">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-teal text-white" : "text-slate-700 hover:bg-mist"}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="px-4 py-6 md:px-8">{children}</div>
    </div>
  );
}
