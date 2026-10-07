"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>
      </svg>
    ),
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5M16 4v5M8 14h3M8 17h8"/>
      </svg>
    ),
  },
  {
    href: "/recommendations",
    label: "Recommendations",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z"/><path d="m4 12 8 4.3 8-4.3M4 16.5l8 4 8-4"/>
      </svg>
    ),
  },
  {
    href: "/learning",
    label: "Learning",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M9 7h6M9 11h6"/>
      </svg>
    ),
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 h-full select-none"
      style={{
        width: "var(--sidebar-width, 244px)",
        backgroundColor: "#0b0f14",
        borderRight: "1px solid var(--line)",
        padding: "24px 16px 16px",
      }}
      aria-label="Primary navigation"
    >
      {/* ── Brand Lockup ─────────────────────────────────────────────────── */}
      <Link href="/" className="flex items-center gap-3 px-1 min-h-[44px]">
        <span
          className="grid place-items-center w-9 h-9 rounded-xl text-[var(--orange-soft)]"
          style={{
            border: "1px solid rgba(239, 135, 87, 0.39)",
            background: "linear-gradient(145deg, rgba(239, 135, 87, 0.15), rgba(239, 135, 87, 0.03))",
          }}
          aria-hidden="true"
        >
          <svg width="22" height="22" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 4.5 32 30H4L18 4.5Z" />
            <path d="M11 19.5h14M14 15h8" />
          </svg>
        </span>
        <span className="flex flex-col">
          <strong className="font-display text-[15px] font-bold tracking-[0.09em] leading-tight text-[var(--text)]">
            A.D.A.P.T.
          </strong>
          <small className="text-[10px] text-[var(--text-muted)] tracking-[0.015em]">
            Decision Workspace
          </small>
        </span>
      </Link>

      <div className="h-px my-5" style={{ background: "linear-gradient(90deg, var(--line-strong), transparent)" }} />

      <p className="px-3 mb-2 font-mono text-[9px] text-[var(--text-faint)] tracking-[0.17em] uppercase">
        WORKSPACE
      </p>

      {/* ── Primary Navigation ───────────────────────────────────────────── */}
      <nav className="grid gap-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3 min-h-[42px] px-3 rounded-lg text-xs font-medium transition-all ${
                active
                  ? "text-[#ffd1b9] bg-gradient-to-r from-[rgba(239,135,87,0.12)] to-[rgba(239,135,87,0.03)] border border-[rgba(239,135,87,0.18)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.02)] border border-transparent"
              }`}
            >
              {active && (
                <span
                  className="absolute left-[-1px] top-2.5 bottom-2.5 w-[2px] rounded-r bg-[var(--orange)]"
                  aria-hidden="true"
                />
              )}
              <span className="grid place-items-center w-5 h-5 shrink-0">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* ── Concept Callout Note ─────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 p-3 rounded-xl mb-3"
        style={{
          border: "1px solid var(--line)",
          background: "linear-gradient(135deg, rgba(239, 135, 87, 0.07), rgba(14, 19, 26, 0.55))",
        }}
      >
        <span
          className="grid place-items-center w-6 h-6 rounded-lg text-[var(--orange-soft)] font-display text-sm shrink-0"
          style={{ background: "rgba(239, 135, 87, 0.11)" }}
          aria-hidden="true"
        >
          Δ
        </span>
        <div className="grid gap-0.5 text-[9px]">
          <strong className="text-[var(--text)] font-semibold leading-tight">
            High ROAS ≠ automatically scale
          </strong>
          <span className="text-[var(--text-muted)] leading-tight">
            Inventory still sets the limit.
          </span>
        </div>
      </div>

      {/* ── Footer Status ────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-2 pt-3 border-t border-[var(--line)] text-[9px] text-[var(--text-faint)]"
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--orange)] shadow-[0_0_0_3px_rgba(239,135,87,0.1)]" />
          <span>Standalone Prototype</span>
        </div>
        <span>Team M.A.R.K.A.N.</span>
      </div>
    </aside>
  );
}
