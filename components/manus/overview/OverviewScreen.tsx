import Link from "next/link";
import type { OverviewViewModel } from "@/lib/presentation/manus-contracts";
import { Icon } from "@/components/manus/ui/Icons";
import { Eyebrow, MetricTile, StatePill } from "@/components/manus/ui/Primitives";
import { ProfitabilityChart } from "@/components/manus/overview/ProfitabilityChart";

export function OverviewScreen({ data }: { data: OverviewViewModel }) {
  const risk = data.signals.find((signal) => signal.kind === "risk");
  const opportunity = data.signals.find((signal) => signal.kind === "opportunity");
  return <div className="page-stack overview-page">
    <section className="overview-intro">
      <div className="overview-intro-copy">
        <Eyebrow tone="copper">Decision intelligence / portfolio</Eyebrow>
        <h1>High ROAS <span>≠</span><br />automatically scale.</h1>
        <p>Performance earns attention. Inventory decides how far it can go.</p>
      </div>
      <div className="overview-intro-note"><span className="note-index">A / 01</span><span className="note-rule" /><p>{data.keyMessage}</p></div>
    </section>

    <section className="metrics-ribbon" aria-label="Portfolio metrics">
      {data.metrics.map((metric, index) => <MetricTile key={metric.id} metric={metric} index={index} />)}
    </section>

    <section className="overview-composition">
      <ProfitabilityChart chart={data.chart} />
      <div className="signal-column">
        {risk && <article className="signal-feature signal-feature-risk">
          <div className="signal-topline"><StatePill tone="risk">Stock risk</StatePill><span className="signal-code">01 / INVENTORY</span></div>
          <div className="signal-title-block"><div><span className="signal-identifier">{risk.sku} <i>·</i> {risk.platform}</span><h2>{risk.name}</h2></div><div className="signal-roas"><strong>{risk.roasDisplay}</strong><span>ROAS</span></div></div>
          <p className="signal-summary"><span className="signal-summary-rule" />{risk.summary}</p>
          <div className="signal-data"><div><span>Stock cover</span><strong>{risk.stockCoverDisplay}</strong></div><div><span>Margin</span><strong>{risk.marginDisplay}</strong></div></div>
          <div className="signal-footer"><span>High ROAS ≠ scale</span><Link href="/recommendations" className="analysis-link">View Analysis <Icon name="arrow" /></Link></div>
        </article>}
        {opportunity && <article className="signal-feature signal-feature-opportunity">
          <div className="signal-topline"><StatePill tone="opportunity">Opportunity</StatePill><span className="signal-code">02 / PERFORMANCE</span></div>
          <div className="signal-title-block"><div><span className="signal-identifier">{opportunity.sku} <i>·</i> {opportunity.platform}</span><h2>{opportunity.name}</h2></div><div className="signal-roas"><strong>{opportunity.roasDisplay}</strong><span>ROAS</span></div></div>
          <p className="signal-summary"><span className="signal-summary-rule" />{opportunity.summary}</p>
          <div className="signal-data"><div><span>Stock cover</span><strong>{opportunity.stockCoverDisplay}</strong></div><div><span>Margin</span><strong>{opportunity.marginDisplay}</strong></div></div>
        </article>}
      </div>
    </section>
    <div className="overview-lower-note"><span className="lower-note-mark">Δ</span><p><strong>Profit before pace.</strong> A strong media return is not a signal to scale when inventory is the constraint.</p><span className="lower-note-route">DETECT → DIAGNOSE → DECIDE</span></div>
  </div>;
}
