import Link from "next/link";

/* ─── AlertCard component ────────────────────────────────────────────────────
   Enterprise signal card matching Manus UI design for STOCK RISK & OPPORTUNITY.
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
  index?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function AlertCard({
  sectionTrend,
  name,
  sku,
  platform,
  statusLabel,
  statusTrend,
  metrics,
  insight,
  index,
  ctaLabel,
  ctaHref,
}: AlertCardProps) {
  const isRisk = sectionTrend === "problem" || statusTrend === "problem";
  const cardIndex = index ?? (isRisk ? "01" : "02");

  const roasMetric = metrics.find((m) => m.label.toLowerCase() === "roas");
  const roasDisplay = roasMetric ? roasMetric.value : "—";

  const stockMetric = metrics.find(
    (m) =>
      m.label.toLowerCase().includes("runway") ||
      m.label.toLowerCase().includes("cover")
  );
  const stockDisplay = stockMetric ? stockMetric.value : "—";

  const marginMetric = metrics.find((m) =>
    m.label.toLowerCase().includes("margin")
  );
  const marginDisplay = marginMetric ? marginMetric.value : "—";

  return (
    <article className={`signal-card ${isRisk ? "signal-risk" : "signal-growth"}`}>
      <div className="signal-card-top">
        <span className="signal-badge">
          <span className={isRisk ? "risk-dot" : "growth-dot"} aria-hidden="true" />
          {statusLabel}
        </span>
        <span className="signal-index">{cardIndex}</span>
      </div>

      <div className="signal-title-row">
        <div>
          <p className="signal-product-meta">
            {sku} <span>·</span> {platform}
          </p>
          <h2>{name}</h2>
        </div>
        <span className="signal-roas">
          {roasDisplay}
          <small>ROAS</small>
        </span>
      </div>

      {isRisk ? (
        <div className="risk-statement">
          <span className="risk-mark" aria-hidden="true">
            <svg
              className="risk-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <span>
            <strong>{insight}</strong>
          </span>
        </div>
      ) : (
        <div className="growth-note">
          <span className="growth-mark" aria-hidden="true">
            <svg
              className="growth-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </span>
          <span>{insight}</span>
        </div>
      )}

      <div className="signal-metrics">
        <div>
          <span>Stock cover</span>
          <strong>{stockDisplay}</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong>{marginDisplay}</strong>
        </div>
      </div>

      {isRisk && (
        <div className="signal-bottom">
          <span>High ROAS ≠ automatically scale</span>
          {ctaHref && (
            <Link
              className="text-link"
              href={ctaHref}
            >
              {ctaLabel ?? "View Analysis"}{" "}
              <svg
                className="link-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
