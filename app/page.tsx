import { overviewData } from "@/lib/demo/overview-data";
import { loadAnalysisData } from "@/lib/db/load-analysis-data";
import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { PortfolioChart } from "@/components/portfolio-chart";
import { ANALYSIS_FROM, ANALYSIS_AS_OF } from "@/lib/run-analysis";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const analysisData = await loadAnalysisData(ANALYSIS_FROM, ANALYSIS_AS_OF);
  const data = await overviewData(analysisData);
  const stats = data?.kpiStats || [];

  const getStockDays = (item: any) =>
    item?.stockRunwayDays ?? item?.stockCoverDays ?? item?.stock_cover ?? 0;

  return (
    <MainContent>
      <PageHeader
        subtitle="Real-time KPI metrics, active campaign allocations, and target performance."
        title="Decision Workspace Overview"
      />

      <div className="p-6 space-y-6">

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats.map((stat: any, idx: number) => (
            <div
              key={stat.label || idx}
              className="p-4 bg-slate-900 border border-slate-800 rounded-lg"
            >
              <span className="text-xs text-slate-400 block uppercase font-medium">
                {stat.label}
              </span>

              <span className="text-2xl font-bold text-white mt-1 block">
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        {/* Portfolio Performance Chart */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-lg">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-white">
              Portfolio Performance
            </h2>

            <p className="text-xs text-slate-400 mt-1">
              Revenue, contribution profit, and ad spend over time
            </p>
          </div>

          <PortfolioChart data={data.portfolioTimeSeries} />
        </div>

        {/* Highlight Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Stock Risk */}
          {data?.attentionItem && (
            <div className="p-5 bg-slate-900 border border-amber-500/30 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-white">
                  {data.attentionItem.name || "Court Sneaker"}
                </h3>

                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">
                  STOCK RISK
                </span>
              </div>

              <p className="text-xs text-slate-400 mb-4">
                {data.attentionItem.sku} · {data.attentionItem.platform}
              </p>

              <div className="grid grid-cols-3 gap-2 text-sm pt-2 border-t border-slate-800">
                <div>
                  <span className="text-xs text-slate-500 block">ROAS</span>
                  <span className="font-semibold text-white">
                    {data.attentionItem.roas}x
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">Margin</span>
                  <span className="font-semibold text-white">
                    {data.attentionItem.marginPct}%
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">
                    Stock cover
                  </span>

                  <span className="font-semibold text-amber-400">
                    {getStockDays(data.attentionItem)}d
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Opportunity */}
          {data?.opportunityItem && (
            <div className="p-5 bg-slate-900 border border-emerald-500/30 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-white">
                  {data.opportunityItem.name || "Premium T-Shirt"}
                </h3>

                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                  OPPORTUNITY
                </span>
              </div>

              <p className="text-xs text-slate-400 mb-4">
                {data.opportunityItem.sku} · {data.opportunityItem.platform}
              </p>

              <div className="grid grid-cols-3 gap-2 text-sm pt-2 border-t border-slate-800">
                <div>
                  <span className="text-xs text-slate-500 block">ROAS</span>
                  <span className="font-semibold text-white">
                    {data.opportunityItem.roas}x
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">Margin</span>
                  <span className="font-semibold text-white">
                    {data.opportunityItem.marginPct}%
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">
                    Stock cover
                  </span>

                  <span className="font-semibold text-emerald-400">
                    {getStockDays(data.opportunityItem)}d
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </MainContent>
  );
}