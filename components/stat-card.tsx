/* ─── StatCard component ──────────────────────────────────────────────────── */
/* Displays a single KPI metric in a card.                                     */
/* Colour follows CONTEXT.md: green = good, red = problem, amber = warning.   */
/* No real data yet — accepts static props. Business logic is in lib/analysis. */

type Trend = "good" | "problem" | "warning" | "neutral";

interface StatCardProps {
  /** KPI label */
  label: string;
  /** Formatted value string (e.g. "₹1,23,456" or "4.8x") */
  value: string;
  /** Optional change description (e.g. "+12% vs last week") */
  change?: string;
  /** Optional subtitle/secondary description */
  sub?: string;
  /** Semantic colour for the change indicator */
  trend?: Trend;
}

/* Map trend to CSS variable names defined in globals.css */
const trendColour: Record<Trend, string> = {
  good: "var(--color-good)",
  problem: "var(--color-problem)",
  warning: "var(--color-warning)",
  neutral: "var(--muted-foreground)",
};

export function StatCard({ label, value, change, sub, trend = "neutral" }: StatCardProps) {
  const secondaryText = sub ?? change;
  return (
    <div
      className="rounded-lg border bg-white px-5 py-4 shadow-sm"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        {value}
      </p>
      {secondaryText && (
        <p className="mt-1 text-xs font-medium" style={{ color: trendColour[trend] }}>
          {secondaryText}
        </p>
      )}
    </div>
  );
}
