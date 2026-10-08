import type { CSSProperties, ReactNode } from "react";
import type { AccentTone, MetricViewModel } from "@/lib/presentation/manus-contracts";
import { Icon, type IconName } from "@/components/manus/ui/Icons";

const metricIcons: Record<string, IconName> = { revenue: "revenue", spend: "spend", "contribution-profit": "profit", "blended-roas": "roas" };

export function Eyebrow({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "copper" | "glacier" }) {
  return <p className={`eyebrow eyebrow-${tone}`}><span className="eyebrow-rule" />{children}</p>;
}

export function StatePill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "risk" | "opportunity" | "positive" | "warning" | "preview" }) {
  return <span className={`state-pill state-${tone}`}><span className="state-dot" />{children}</span>;
}

export function MetricTile({ metric, index = 0 }: { metric: MetricViewModel; index?: number }) {
  const iconName = metric.icon ? (metricIcons[metric.id] ?? "overview") : undefined;
  return <article className={`metric-tile metric-${metric.tone}`} style={{ "--metric-index": index } as CSSProperties}>
    <div className="metric-top"><span className="metric-label">{metric.label}</span>{iconName && <span className="metric-icon"><Icon name={iconName} /></span>}</div>
    <strong className="metric-value">{metric.displayValue}</strong>
    {metric.context && <span className="metric-context">{metric.context}</span>}
  </article>;
}

export function SurfaceHeading({ kicker, title, detail, trailing }: { kicker: string; title: string; detail?: string; trailing?: ReactNode }) {
  return <div className="surface-heading"><div><Eyebrow>{kicker}</Eyebrow><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{trailing && <div className="surface-heading-trailing">{trailing}</div>}</div>;
}

export function ToneValue({ children, tone = "neutral" }: { children: ReactNode; tone?: AccentTone }) {
  return <span className={`tone-value tone-${tone}`}>{children}</span>;
}
