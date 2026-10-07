import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { loadAnalysisInputs } from "@/lib/run-analysis";
import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const repo = await getRuntimeRepo();
  const data = await repo.run(loadAnalysisInputs);

  const campaigns = data?.campaigns || [];
  const skus = data?.skus || [];

  const skuMap = new Map(skus.map((s: any) => [s.id, s]));

  return (
    <MainContent>
      <PageHeader subtitle="Manage ad spend allocations, ROAS targets, and campaign performance." title="Active Campaigns"/>
      <div className="p-6">
        <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-900/50">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 font-semibold">Campaign Name</th>
                <th className="px-4 py-3 font-semibold">Platform</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold text-right">Daily Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No active campaigns found.
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign: any) => {
                  const sku = skuMap.get(campaign.sku_id);
                  return (
                    <tr 
                      key={campaign.id} 
                      className="hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-white">{campaign.name}</td>
                      <td className="px-4 py-3">
                        <span className="capitalize px-2 py-0.5 rounded text-xs bg-slate-800 border border-slate-700 text-slate-300">
                          {campaign.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{sku?.name ?? campaign.sku_id ?? 'N/A'}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">
                        ₹{campaign.daily_budget?.toLocaleString() || "0"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainContent>
  );
}
