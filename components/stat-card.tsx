/* ─── StatCard component ────────────────────────────────────────────────────
   Enterprise KPI metric card matching Manus UI design.
   ─────────────────────────────────────────────────────────────────────────── */

type KpiTone = "orange" | "cyan" | "green" | "neutral";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  sub?: string;
  trend?: "good" | "problem" | "warning" | "neutral" | "info";
  tone?: KpiTone;
  staggerIndex?: number;
  icon?: React.ReactNode;
}

const defaultIcons: Record<string, string> = {
  revenue: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm4 4h.01M17 15h.01M9 10h6M9 14h6",
  spend: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  profit: "M5 7h14M5 12h14M5 17h14M8 4v16M16 4v16",
  roas: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v2M21 12h-2M12 21v-2M3 12h2",
};

function getIconPath(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("revenue")) return defaultIcons.revenue;
  if (l.includes("spend")) return defaultIcons.spend;
  if (l.includes("profit")) return defaultIcons.profit;
  return defaultIcons.roas;
}

function getTone(label: string, trend?: string): KpiTone {
  const l = label.toLowerCase();
  if (l.includes("revenue")) return "orange";
  if (l.includes("spend")) return "cyan";
  if (l.includes("profit")) return "green";
  if (trend === "good") return "green";
  return "neutral";
}

export function StatCard({
  label,
  value,
  sub,
  change,
  trend = "neutral",
  tone,
  staggerIndex = 0,
  icon,
}: StatCardProps) {
  const cardTone = tone ?? getTone(label, trend);
  const note = sub ?? change;
  const iconPath = getIconPath(label);

  return (
    <article
      className={`kpi-card kpi-${cardTone}`}
      style={{ "--stagger": staggerIndex } as React.CSSProperties}
    >
      <div className="kpi-top">
        <span className="kpi-label">{label.toUpperCase()}</span>
        <span className="kpi-icon" aria-hidden="true">
          {icon ?? (
            <svg
              className="kpi-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={iconPath} />
            </svg>
          )}
        </span>
      </div>
      <div className="kpi-value">{value}</div>
      {note && (
        <div className="kpi-note">
          <span className="note-line" aria-hidden="true" />
          <span>{note}</span>
        </div>
      )}
    </article>
  );
}
