"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Navigation items ────────────────────────────────────────────────────── */
/* Each item maps to a top-level App Router route (Builder B owns app/ pages). */
const navItems = [
  {
    href: "/",
    label: "Overview",
    /* Unicode icon substitutes until lucide-react is added (post-G0). */
    icon: "◎",
    description: "Performance dashboard",
  },
  {
    href: "/recommendations",
    label: "Recommendations",
    icon: "▲",
    description: "Budget move suggestions",
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: "⊞",
    description: "Campaign performance",
  },
  {
    href: "/learning",
    label: "Learning",
    icon: "◈",
    description: "Confidence & outcomes",
  },
] as const;

/* ─── Sidebar component ───────────────────────────────────────────────────── */
/* Fixed left-hand navigation. Active route is highlighted via usePathname.    */
export function Sidebar() {
  const pathname = usePathname();

  /* Determine whether the current path matches a nav item's href.
     Root "/" is an exact match only; other paths use startsWith. */
  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className="flex flex-col w-56 shrink-0 h-full"
      style={{ backgroundColor: "var(--sidebar-bg)", color: "var(--sidebar-fg)" }}
    >
      {/* ── Brand header ── */}
      <div className="px-4 py-5 border-b" style={{ borderColor: "#1e293b" }}>
        <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--sidebar-muted)" }}>
          DataQuest 3.0
        </p>
        <h1 className="text-lg font-bold leading-tight mt-0.5" style={{ color: "var(--sidebar-fg)" }}>
          A.D.A.P.T.
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--sidebar-muted)" }}>
          Ad Decision Engine
        </p>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-2 py-4 space-y-0.5" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? "var(--sidebar-accent)" : "transparent",
                color: active ? "#ffffff" : "var(--sidebar-fg)",
              }}
              aria-current={active ? "page" : undefined}
            >
              <span className="text-base w-5 shrink-0 text-center" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Footer status ── */}
      <div className="px-4 py-4 border-t text-xs" style={{ borderColor: "#1e293b", color: "var(--sidebar-muted)" }}>
        <div className="flex items-center gap-2">
          {/* Green dot = app is running */}
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <span>Gate G0 — Shell</span>
        </div>
        <p className="mt-1">Day 45 · INR · Fixtures</p>
      </div>
    </aside>
  );
}
