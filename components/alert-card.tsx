import Link from "next/link";

/* ─── AlertCard component ────────────────────────────────────────────────────
   Dark enterprise insight card for STOCK RISK / OPPORTUNITY signals.
   Semantic colours: red=problem/critical, green=good/opportunity, amber=warning.
   No business logic — values pre-computed upstream.
   ─────────────────────────────────────────────────────────────────────────── */

type Trend = "good" | "problem" | "warning" | "neutral" | "info";

interface Metric {
  label: string;
  value: string;
  trend?: Trend;
  mono?: boolean;
}

interface AlertCardProps {
  sectionLabel: string;
  sectionTrend: Trend;
  name: string;
  sku: string;
  platform: string;
  statusLabel: string;
  statusTrend: Trend;
  metrics: Metric[];
  insight: string;
  ctaLabel?: string;
  ctaHref?: string;
}

const trendToken: Record<Trend, { color: string; bg: string; border: string; strip: string }> = {
  good:    { color: "var(--color-good)",    bg: "var(--color-good-dim)",    border: "var(--color-good-muted)",    strip: "#22c55e" },
  problem: { color: "var(--color-problem)", bg: "var(--color-problem-dim)", border: "var(--color-problem-muted)", strip: "#ef4444" },
  warning: { color: "var(--color-warning)", bg: "var(--color-warning-dim)", border: "var(--color-warning-muted)", strip: "#f59e0b" },
  info:    { color: "var(--color-info)",    bg: "var(--color-info-dim)",    border: "var(--color-info-muted)",    strip: "#22d3ee" },
  neutral: { color: "var(--text-secondary)",bg: "var(--bg-elevated)",       border: "var(--border-default)",      strip: "#475569" },
};

export function AlertCard({
  sectionLabel,
  sectionTrend,
  name,
  sku,
  platform,
  statusLabel,
  statusTrend,
  metrics,
  insight,
  ctaLabel,
  ctaHref,
}: AlertCardProps) {
  const st = trendToken[sectionTrend];
  const badge = trendToken[statusTrend];

  return (
    <div
      className="rounded-lg overflow-hidden flex flex-col"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: `1px solid var(--border-subtle)`,
        borderLeft: `3px solid ${st.strip}`,
      }}
    >
      {/* ── Section label strip ────────────────────────────────────────── */}
      <div
        className="px-4 py-1.5 flex items-center gap-2"
        style={{
          backgroundColor: st.bg,
          borderBottom: `1px solid var(--border-subtle)`,
        }}
      >
        {/* Pulse dot for critical alerts */}
        {sectionTrend === "problem" && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: st.strip, boxShadow: `0 0 6px ${st.strip}` }}
          />
        )}
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: st.color, letterSpacing: "0.12em" }}
        >
          {sectionLabel}
        </span>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-4 flex-1 flex flex-col gap-4">
        {/* Header: name + status badge */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4
              className="text-base font-semibold leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {name}
            </h4>
            <p
              className="text-xs mt-0.5 font-mono-num"
              style={{ color: "var(--text-tertiary)" }}
            >
              {sku} · {platform}
            </p>
          </div>
          <span
            className="shrink-0 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold tracking-wide"
            style={{
              color: badge.color,
              backgroundColor: badge.bg,
              border: `1px solid ${badge.border}`,
              letterSpacing: "0.08em",
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Metric grid */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {metrics.map((m) => {
            const mt = m.trend ? trendToken[m.trend] : null;
            return (
              <div key={m.label}>
                <dt
                  className="text-xs uppercase tracking-wide"
                  style={{ color: "var(--text-tertiary)", fontSize: "10px", letterSpacing: "0.08em" }}
                >
                  {m.label}
                </dt>
                <dd
                  className={`mt-0.5 text-sm font-semibold ${m.mono ? "font-mono-num" : ""}`}
                  style={{ color: mt ? mt.color : "var(--text-primary)" }}
                >
                  {m.value}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* Insight */}
        <p
          className="text-sm leading-relaxed border-t pt-3"
          style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
        >
          {insight}
        </p>

        {/* CTA */}
        {ctaLabel && ctaHref && (
          <div>
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold rounded px-3 py-1.5 transition-all duration-150"
              style={{
                color: "#ffffff",
                backgroundColor: "var(--brand-orange)",
                border: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#ea580c";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 12px rgba(249,115,22,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "var(--brand-orange)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
              }}
            >
              {ctaLabel}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
