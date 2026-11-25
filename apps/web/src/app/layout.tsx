import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Geek vision",
  icons: { icon: "/geek-logo.png" },
  description: "Workstation occupancy from the office camera",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
