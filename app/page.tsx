import { overviewData } from "@/lib/demo/overview-data";
import { loadAnalysisData } from "@/lib/db/load-analysis-data";
import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const analysisData = await loadAnalysisData("2026-01-01", "2026-02-15");
  const data = await overviewData(analysisData);
  const stats = data?.kpiStats || [];

  return (
    <MainContent>
      <PageHeader subtitle="Real-time KPI metrics, active campaign allocations, and target performance." title="Decision Workspace Overview"/>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <div key={stat.label || idx} className="p-4 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-400 block uppercase">{stat.label}</span>
              <span className="text-2xl font-bold text-white mt-1 block">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    </MainContent>
  );
}
