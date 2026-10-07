import Link from "next/link";

/* ─── AlertCard component ─────────────────────────────────────────────────── */
/* Displays a single campaign-level insight card — either a warning (stock    */
/* risk, anomaly) or an opportunity (receiver candidate).                      */
/* Colour-coded per CONTEXT.md: green = good, red = problem, amber = warning. */
/* No business logic inside — all values are pre-computed in the fixture layer.*/

type Trend = "good" | "problem" | "warning" | "neutral";

/* A single metric row shown inside the card */
interface Metric {
  label: string;
  value: string;
  trend?: Trend;
}

interface AlertCardProps {
  /** Section heading label (e.g. "Needs Attention") */
  sectionLabel: string;
  sectionTrend: Trend;
  /** Product / campaign name */
  name: string;
  sku: string;
  platform: string;
  /** Status badge text (e.g. "STOCK RISK", "OPPORTUNITY") */
  statusLabel: string;
  statusTrend: Trend;
  /** Metric rows to display in the card body */
  metrics: Metric[];
  /** Plain-English insight — never from the LLM at this gate */
  insight: string;
  /** If provided, renders a CTA link at the bottom */
  ctaLabel?: string;
  ctaHref?: string;
}

/* Map trend to CSS variable colour */
const trendColor: Record<Trend, string> = {
  good: "var(--color-good)",
  problem: "var(--color-problem)",
  warning: "var(--color-warning)",
  neutral: "var(--muted-foreground)",
};

/* Map trend to light background for badges */
const trendBg: Record<Trend, string> = {
  good: "#f0fdf4",
  problem: "#fef2f2",
  warning: "#fffbeb",
  neutral: "var(--muted)",
};

/* Map trend to border color for badges */
const trendBorder: Record<Trend, string> = {
  good: "#bbf7d0",
  problem: "#fecaca",
  warning: "#fde68a",
  neutral: "var(--border)",
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
  return (
    <div
      className="rounded-lg border bg-white shadow-sm overflow-hidden"
      style={{ borderColor: "var(--border)" }}
    >
      {/* ── Section label strip ── */}
      <div
        className="px-4 py-2 text-xs font-semibold uppercase tracking-widest"
        style={{
          backgroundColor: trendBg[sectionTrend],
          color: trendColor[sectionTrend],
          borderBottom: `1px solid var(--border)`,
        }}
      >
        {sectionLabel}
      </div>

      <div className="px-5 py-4">
        {/* ── Header row: name + status badge ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-gray-900">{name}</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              {sku} · {platform}
            </p>
          </div>
          <span
            className="shrink-0 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold tracking-wide"
            style={{
              backgroundColor: trendBg[statusTrend],
              color: trendColor[statusTrend],
              border: `1px solid ${trendBorder[statusTrend]}`,
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* ── Metric grid ── */}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label}>
              <dt className="text-xs text-gray-400">{m.label}</dt>
              <dd
                className="mt-0.5 text-sm font-semibold"
                style={{
                  color: m.trend ? trendColor[m.trend] : "var(--foreground)",
                }}
              >
                {m.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── Insight text ── */}
        <p className="mt-4 text-sm text-gray-600 leading-relaxed border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {insight}
        </p>

        {/* ── CTA link ── */}
        {ctaLabel && ctaHref && (
          <div className="mt-3">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
              style={{ color: "var(--primary)" }}
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
