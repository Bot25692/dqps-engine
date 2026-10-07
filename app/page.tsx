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
/* Gate G1: Functional Overview.                                               */
/* All metrics and series sourced cleanly from fixtures; no math in the UI.   */
export default async function OverviewPage() {
  await connection();
  const repo = await getRuntimeRepo();
  const { kpiStats, portfolioTimeSeries, attentionItem, opportunityItem } = overviewData(await repo.run(loadAnalysisInputs));
  /* Format display metrics for Court Sneaker alert */
  const attentionMetrics = [
    { label: "Platform", value: attentionItem.platform },
    {
      label: "ROAS",
      value: `${attentionItem.roas.toFixed(1)}×`,
      trend: "good" as const,
    },
    {
      label: "Inventory",
      value: `${attentionItem.inventoryUnits} units`,
      trend: "problem" as const,
    },
    {
      label: "Stock Runway",
      value: `${attentionItem.stockRunwayDays.toFixed(1)} days`,
      trend: "problem" as const,
    },
    {
      label: "Margin",
      value: `${attentionItem.marginPct}%`,
    },
  ];

  /* Format display metrics for Premium T-Shirt opportunity */
  const opportunityMetrics = [
    { label: "Platform", value: opportunityItem.platform },
    {
      label: "ROAS",
      value: `${opportunityItem.roas.toFixed(1)}×`,
      trend: "good" as const,
    },
    {
      label: "Inventory",
      value: `${opportunityItem.inventoryUnits} units`,
      trend: "good" as const,
    },
    {
      label: "Margin",
      value: `${opportunityItem.marginPct}%`,
      trend: "good" as const,
    },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Overview"
        subtitle="Day 45 · D2C Apparel & Footwear · 4 Platforms · 8 SKUs · INR"
        actions={
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: "var(--muted)",
              color: "var(--muted-foreground)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {repo.status.banner ?? `${repo.status.dataSource} mode`}
          </span>
        }
      />

      <MainContent className="space-y-8">
        {/* ── 1. KPI Summary ── */}
        <section aria-label="Key performance indicators">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Portfolio KPI Summary
          </h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

        {/* ── 2. Action Alerts (Needs Attention & Growth Opportunity) ── */}
        <section
          aria-label="Action alerts"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          {/* Needs Attention: Court Sneaker (E1) */}
          <AlertCard
            sectionLabel="Needs Attention"
            sectionTrend="problem"
            name={attentionItem.name}
            sku={attentionItem.sku}
            platform={attentionItem.platform}
            statusLabel={attentionItem.statusLabel}
            statusTrend={attentionItem.statusTrend}
            metrics={attentionMetrics}
            insight={attentionItem.insight}
            ctaLabel="View Analysis"
            ctaHref="/recommendations"
          />

          {/* Growth Opportunity: Premium T-Shirt (E5) */}
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
        </section>

        {/* ── 3. Portfolio Performance Chart ── */}
        <section aria-label="Portfolio performance">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-1">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Portfolio Performance (30-Day Trajectory)
            </h3>
            <span className="text-xs text-gray-400">
              D16 to D45 · Revenue, Contribution Profit & Ad Spend
            </span>
          </div>

          <div
            className="rounded-lg border bg-white p-5 shadow-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-900">
                Daily Revenue vs Contribution Profit
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Simulated advertising data. Contribution profit accounts for
                SKU margins and advertising expenses.
              </p>
            </div>

            <PortfolioChart data={portfolioTimeSeries} />
          </div>
        </section>
      </MainContent>
    </div>
  );
}
