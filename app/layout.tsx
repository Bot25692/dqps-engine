import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

/* ─── App metadata ────────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  title: "A.D.A.P.T. — Advertising Decision Automation for Profitable Targeting",
  description:
    "Autonomous D2C advertising decision engine. DataQuest 3.0 — Team M.A.R.K.A.N.",
};

/* ─── Root layout ─────────────────────────────────────────────────────────── */
/* All pages share a two-column shell: a fixed sidebar + a scrollable main area. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex antialiased">
        {/* Fixed-width sidebar navigation */}
        <Sidebar />

        {/* Main content area — scrollable, full height */}
        <div className="flex flex-col flex-1 min-w-0 overflow-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
