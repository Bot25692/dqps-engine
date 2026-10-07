"use client";

/* ─── StatCard component ────────────────────────────────────────────────────
   Premium dark KPI metric card.
   Semantic colour rules from CONTEXT.md: green=good, red=problem, amber=warning.
   No business logic — all values pre-computed upstream.
   ─────────────────────────────────────────────────────────────────────────── */

type Trend = "good" | "problem" | "warning" | "neutral" | "info";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  sub?: string;
  trend?: Trend;
  /** Optional top-left icon */
  icon?: React.ReactNode;
}

const trendToken: Record<Trend, { color: string; bg: string; border: string }> = {
  good:    { color: "var(--color-good)",    bg: "var(--color-good-dim)",    border: "var(--color-good-muted)" },
  problem: { color: "var(--color-problem)", bg: "var(--color-problem-dim)", border: "var(--color-problem-muted)" },
  warning: { color: "var(--color-warning)", bg: "var(--color-warning-dim)", border: "var(--color-warning-muted)" },
  info:    { color: "var(--color-info)",    bg: "var(--color-info-dim)",    border: "var(--color-info-muted)" },
  neutral: { color: "var(--text-secondary)",bg: "var(--bg-elevated)",       border: "var(--border-default)" },
};

export function StatCard({ label, value, change, sub, trend = "neutral", icon }: StatCardProps) {
  const t = trendToken[trend];
  const secondary = sub ?? change;
  return (
    <div
      className="rounded-lg px-4 py-4 flex flex-col gap-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
    >
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)", letterSpacing: "0.1em" }}
        >
          {label}
        </p>
        {icon && (
          <span style={{ color: "var(--text-tertiary)", opacity: 0.7 }}>{icon}</span>
        )}
      </div>

      {/* Primary value */}
      <p
        className="text-2xl font-bold leading-none font-mono-num"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>

      {/* Change / sub label */}
      {secondary && (
        <span
          className="inline-flex items-center self-start text-xs font-semibold rounded px-1.5 py-0.5"
          style={{
            color: t.color,
            backgroundColor: t.bg,
            border: `1px solid ${t.border}`,
          }}
        >
          {secondary}
        </span>
      )}
    </div>
  );
}
