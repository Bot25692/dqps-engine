import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { StatCard } from "@/components/stat-card";
import { PortfolioChart } from "@/components/portfolio-chart";
import { AlertCard } from "@/components/alert-card";
import { connection } from "next/server";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { loadAnalysisInputs } from "@/lib/run-analysis";
import { overviewData } from "@/lib/demo/overview-data";

export const instant = false;

/* ─── Overview page (/) ──────────────────────────────────────────────────── */
/* All metrics sourced from fixtures via overviewData(). No math in the UI.   */
export default async function OverviewPage() {
  await connection();
  const repo = await getRuntimeRepo();
  const { kpiStats, portfolioTimeSeries, attentionItem, opportunityItem, metadata } =
    overviewData(await repo.run(loadAnalysisInputs));

  const subtitle = metadata.asOfDate === '2026-10-07' && metadata.skuCount === 8
    ? "Day 45 · D2C Apparel & Footwear · 4 Platforms · 8 SKUs · INR"
    : `${metadata.dayCount ? `Day ${metadata.dayCount} (as-of ${metadata.asOfDate})` : `As-of ${metadata.asOfDate}`} · ${metadata.platformCount} Platform${metadata.platformCount === 1 ? '' : 's'} · ${metadata.skuCount} SKU${metadata.skuCount === 1 ? '' : 's'} · INR`;

  /* ── Court Sneaker: Stock Risk ── */
  const attentionMetrics = [
    { label: "Platform",      value: attentionItem.platform,                              mono: false },
    { label: "ROAS",          value: `${attentionItem.roas.toFixed(1)}×`,                 trend: "good"    as const, mono: true },
    { label: "Inventory",     value: `${attentionItem.inventoryUnits} units`,              trend: "problem" as const, mono: true },
    { label: "Stock Runway",  value: `${attentionItem.stockRunwayDays === Infinity ? 'Ample' : `${attentionItem.stockRunwayDays.toFixed(1)} days`}`,  trend: attentionItem.stockRunwayDays < 5 ? ("problem" as const) : ("neutral" as const), mono: true },
    { label: "Margin",        value: `${attentionItem.marginPct.toFixed(0)}%`,             mono: true },
    { label: "Status",        value: attentionItem.statusLabel,                            trend: attentionItem.stockRunwayDays < 5 ? ("problem" as const) : ("neutral" as const) },
  ];

  /* ── Premium T-Shirt: Growth Opportunity ── */
  const opportunityMetrics = [
    { label: "Platform",  value: opportunityItem.platform,                              mono: false },
    { label: "ROAS",      value: `${opportunityItem.roas.toFixed(1)}×`,                 trend: "good" as const, mono: true },
    { label: "Inventory", value: `${opportunityItem.inventoryUnits} units`,              trend: "good" as const, mono: true },
    { label: "Margin",    value: `${opportunityItem.marginPct.toFixed(0)}%`,            trend: "good" as const, mono: true },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Overview"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-3">
            {/* Decision workflow breadcrumb */}
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              {["Detect", "Diagnose", "Decide", "Approve", "Simulate", "Learn"].map((step, i) => (
                <span key={step} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span style={{ color: "var(--border-strong)" }}>›</span>
                  )}
                  <span
                    style={{
                      color: i === 0 ? "var(--brand-orange)" : "var(--text-tertiary)",
                      fontWeight: i === 0 ? 600 : 400,
                    }}
                  >
                    {step}
                  </span>
                </span>
              ))}
            </div>
            {/* Data source pill */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-good)", boxShadow: "0 0 4px var(--color-good)" }}
              />
              {repo.status.banner ?? `${repo.status.dataSource} mode`}
            </span>
          </div>
        }
      />

      <MainContent>
        {/* ── SECTION LABEL UTILITY ── */}
        {/* ── 1. KPI Summary ────────────────────────────────────────────── */}
        <section aria-label="Key performance indicators">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)", letterSpacing: "0.14em", fontSize: "10px" }}
            >
              Portfolio KPIs
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
            <span
              className="text-xs"
              style={{ color: "var(--text-tertiary)", fontSize: "10px" }}
            >
              Day 45 as-of
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpiStats.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                sub={stat.sub}
                trend={stat.trend}
              />
            ))}
          </div>
        </section>

        {/* ── 2. Needs Attention (hero) + Growth Opportunity ─────────────── */}
        <section aria-label="Action alerts">
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)", letterSpacing: "0.14em", fontSize: "10px" }}
            >
              Action Required
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
            {/* Key differentiator callout */}
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{
                backgroundColor: "var(--brand-orange-glow)",
                color: "var(--brand-orange)",
                border: "1px solid rgba(249,115,22,0.2)",
                fontSize: "10px",
              }}
            >
              High ROAS ≠ Scale
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Stock Risk: Court Sneaker — HERO alert */}
            <AlertCard
              sectionLabel="⚠ Needs Attention — Stock Risk"
              sectionTrend="problem"
              name={attentionItem.name}
              sku={attentionItem.sku}
              platform={attentionItem.platform}
              statusLabel={attentionItem.statusLabel}
              statusTrend={attentionItem.statusTrend}
              metrics={attentionMetrics}
              insight={attentionItem.insight}
              ctaLabel="View Analysis →"
              ctaHref="/recommendations"
            />

            {/* Growth Opportunity: Premium T-Shirt */}
            <AlertCard
              sectionLabel="Growth Opportunity"
              sectionTrend="good"
              name={opportunityItem.name}
              sku={opportunityItem.sku}
              platform={opportunityItem.platform}
              statusLabel={opportunityItem.statusLabel}
              statusTrend={opportunityItem.statusTrend}
              metrics={opportunityMetrics}
              insight={opportunityItem.insight}
            />
          </div>
        </section>

        {/* ── 3. Portfolio Performance Chart ──────────────────────────── */}
        <section aria-label="Portfolio performance">
          {/* Section header */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)", letterSpacing: "0.14em", fontSize: "10px" }}
            >
              Portfolio Performance
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
            <span style={{ color: "var(--text-tertiary)", fontSize: "10px" }}>
              D16 → D45 · Revenue, Contribution Profit & Ad Spend
            </span>
          </div>

          <div
            className="rounded-lg p-4"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {/* Chart header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Daily Revenue vs Contribution Profit
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Contribution profit = Revenue × margin − Ad Spend.
                  The objective metric — not ROAS.
                </p>
              </div>
              {/* Legend pills */}
              <div className="hidden sm:flex items-center gap-3 text-xs shrink-0">
                {[
                  { color: "#f97316", label: "Revenue" },
                  { color: "#22c55e", label: "Contribution Profit" },
                  { color: "#f59e0b", label: "Ad Spend", dashed: true },
                ].map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                    <span
                      style={{
                        width: 20,
                        height: 2,
                        backgroundColor: l.color,
                        display: "inline-block",
                        opacity: l.dashed ? 0.7 : 1,
                        borderBottom: l.dashed ? `2px dashed ${l.color}` : "none",
                      }}
                    />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>

            <PortfolioChart data={portfolioTimeSeries} />
          </div>
        </section>
      </MainContent>
    </div>
  );
}
