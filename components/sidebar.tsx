"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Navigation items ────────────────────────────────────────────────────── */
const navItems = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    href: "/recommendations",
    label: "Recommendations",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 1.5L9.8 5.2L14 5.8L11 8.7L11.6 13L8 11L4.4 13L5 8.7L2 5.8L6.2 5.2L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 12L5 7L7 9L10 5L14 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 0"/>
      </svg>
    ),
  },
  {
    href: "/learning",
    label: "Learning",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M8 4.5V8.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
      className="flex flex-col shrink-0 h-full"
      style={{
        width: "var(--sidebar-width, 220px)",
        backgroundColor: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      {/* ── Brand ─────────────────────────────────────────────────────────── */}
      <div
        className="px-4 pt-5 pb-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {/* Product mark */}
        <div className="flex items-center gap-2 mb-3">
          {/* Orange square logo mark */}
          <div
            className="flex items-center justify-center rounded"
            style={{
              width: 28,
              height: 28,
              background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 11L7 3L11 11H3Z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <div>
            <p
              className="text-sm font-bold tracking-wider leading-none"
              style={{ color: "var(--text-primary)", letterSpacing: "0.12em" }}
            >
              A.D.A.P.T.
            </p>
          </div>
        </div>
        <p
          className="text-xs leading-snug"
          style={{ color: "var(--text-tertiary)", fontSize: "10px" }}
        >
          Advertising Decision Automation
          <br />
          for Profitable Targeting
        </p>
      </div>

      {/* ── Nav label ─────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-1">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-tertiary)", fontSize: "9px", letterSpacing: "0.15em" }}
        >
          Decision Workspace
        </p>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 pb-4 space-y-0.5" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 group"
              style={{
                backgroundColor: active ? "var(--brand-orange-glow)" : "transparent",
                color: active ? "var(--brand-orange)" : "var(--text-secondary)",
                border: active ? "1px solid rgba(249,115,22,0.2)" : "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              <span
                className="shrink-0 transition-colors"
                style={{
                  color: active ? "var(--brand-orange)" : "var(--text-tertiary)",
                }}
              >
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
              {active && (
                <span
                  className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--brand-orange)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Status footer ─────────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 text-xs"
        style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}
      >
        {/* Engine status */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: "var(--color-good)", boxShadow: "0 0 4px var(--color-good)" }}
          />
          <span style={{ color: "var(--color-good)", fontWeight: 500, fontSize: "10px" }}>
            Decision Engine Ready
          </span>
        </div>
        <p style={{ fontSize: "10px" }}>Active Baseline · INR · Multi-channel</p>
        <p style={{ fontSize: "10px", marginTop: 2 }}>DataQuest 3.0 · Team M.A.R.K.A.N.</p>
      </div>
    </aside>
  );
}
