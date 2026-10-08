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

  const subtitle =
    `${
          metadata.dayCount
            ? `Day ${metadata.dayCount} (as-of ${metadata.asOfDate})`
            : `As-of ${metadata.asOfDate}`
        } · ${metadata.platformCount} Platform${
          metadata.platformCount === 1 ? "" : "s"
        } · ${metadata.skuCount} SKU${
          metadata.skuCount === 1 ? "" : "s"
        } · INR`;

  const startDate = portfolioTimeSeries[0]?.day ?? "No metrics";
  const endDate = portfolioTimeSeries.at(-1)?.day ?? "No metrics";

  /* ── Court Sneaker: Stock Risk ── */
  const attentionMetrics = [
    { label: "Platform", value: attentionItem.platform, mono: false },
    {
      label: "ROAS",
      value: `${attentionItem.roas.toFixed(1)}×`,
      trend: "good" as const,
      mono: true,
    },
    {
      label: "Inventory",
      value: `${attentionItem.inventoryUnits} units`,
      trend: "problem" as const,
      mono: true,
    },
    {
      label: "Stock Runway",
      value: `${
        attentionItem.stockRunwayDays === Infinity
          ? "Ample"
          : `${attentionItem.stockRunwayDays.toFixed(1)} days`
      }`,
      trend:
        attentionItem.stockRunwayDays < 5
          ? ("problem" as const)
          : ("neutral" as const),
      mono: true,
    },
    {
      label: "Margin",
      value: `${attentionItem.marginPct.toFixed(0)}%`,
      mono: true,
    },
    {
      label: "Status",
      value: attentionItem.statusLabel,
      trend:
        attentionItem.stockRunwayDays < 5
          ? ("problem" as const)
          : ("neutral" as const),
    },
  ];

  /* ── Premium T-Shirt: Growth Opportunity ── */
  const oppStockDays = (opportunityItem as { stockRunwayDays?: number }).stockRunwayDays;
  const oppStockDisplay =
    oppStockDays != null && oppStockDays !== Infinity
      ? `${oppStockDays.toFixed(1)} days`
      : `${opportunityItem.inventoryUnits} units`;

  const opportunityMetrics = [
    { label: "Platform", value: opportunityItem.platform, mono: false },
    {
      label: "ROAS",
      value: `${opportunityItem.roas.toFixed(1)}×`,
      trend: "good" as const,
      mono: true,
    },
    {
      label: "Inventory",
      value: `${opportunityItem.inventoryUnits} units`,
      trend: "good" as const,
      mono: true,
    },
    {
      label: "Margin",
      value: `${opportunityItem.marginPct.toFixed(0)}%`,
      trend: "good" as const,
      mono: true,
    },
    {
      label: "Stock cover",
      value: oppStockDisplay,
      trend: "good" as const,
      mono: true,
    },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={subtitle}
        eyebrow="PORTFOLIO INTELLIGENCE"
        actions={
          <div className="flex items-center gap-3">
            {/* Decision workflow breadcrumb */}
            <div
              className="hidden xl:flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-faint)" }}
            >
              {[
                "Detect",
                "Diagnose",
                "Decide",
                "Approve",
                "Simulate",
                "Learn",
              ].map((step, i) => (
                <span key={step} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span style={{ color: "var(--line-strong)" }}>›</span>
                  )}
                  <span
                    style={{
                      color:
                        i === 0 ? "var(--orange)" : "var(--text-faint)",
                      fontWeight: i === 0 ? 600 : 400,
                    }}
                  >
                    {step}
                  </span>
                </span>
              ))}
            </div>
          </div>
        }
      />

      <MainContent>
        {repo.status.banner && <p role="status">{repo.status.banner}</p>}
        {/* ── 1. KPI Summary ────────────────────────────────────────────── */}
        <section className="kpi-grid" aria-label="Portfolio performance">
          {kpiStats.map((stat, index) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              sub={stat.sub}
              trend={stat.trend}
              staggerIndex={index}
            />
          ))}
        </section>

        {/* ── 2. Performance Panel & Signal Stack (2-Column Grid) ───────── */}
        <section className="overview-grid" aria-label="Performance and Signals">
          {/* Left: Portfolio Performance Chart */}
          <article className="panel performance-panel">
            <div className="panel-heading chart-heading">
              <div>
                <div className="panel-kicker">
                  <span className="kicker-line" aria-hidden="true" />
                  Portfolio performance
                </div>
                <h2>Profitability, over time</h2>
                <p>Revenue, contribution profit and ad spend</p>
              </div>
              <span className="date-range">
                {startDate} <span>—</span> {endDate}
              </span>
            </div>

            <div className="chart-wrap">
              <PortfolioChart data={portfolioTimeSeries} />
            </div>

            <div className="chart-legend">
              <span>
                <i className="legend-dot revenue-dot" />
                Revenue
              </span>
              <span>
                <i className="legend-dot profit-dot" />
                Contribution profit
              </span>
              <span>
                <i className="legend-dot spend-dot" />
                Ad spend
              </span>
            </div>

            <div className="chart-footnote">
              Portfolio Performance <span>·</span> Contribution profit = Revenue × margin − Ad Spend
            </div>
          </article>

          {/* Right: Signal Stack */}
          <aside className="signal-stack" aria-label="Campaign signals">
            {/* Stock Risk: Court Sneaker (or dynamic attention item) */}
            <AlertCard
              sectionLabel="Stock risk"
              sectionTrend="problem"
              name={attentionItem.name}
              sku={attentionItem.sku}
              platform={attentionItem.platform}
              statusLabel={attentionItem.statusLabel}
              statusTrend={attentionItem.statusTrend}
              metrics={attentionMetrics}
              insight={attentionItem.insight}
              index="01"
              ctaLabel="View Analysis"
              ctaHref="/recommendations"
            />

            {/* Growth Opportunity: Premium T-Shirt (or dynamic opportunity item) */}
            <AlertCard
              sectionLabel="Opportunity"
              sectionTrend="good"
              name={opportunityItem.name}
              sku={opportunityItem.sku}
              platform={opportunityItem.platform}
              statusLabel={opportunityItem.statusLabel}
              statusTrend={opportunityItem.statusTrend}
              metrics={opportunityMetrics}
              insight={opportunityItem.insight}
              index="02"
            />
          </aside>
        </section>
      </MainContent>
    </>
  );
}
