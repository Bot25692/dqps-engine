export const instant = false;

import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { loadAnalysisInputs, getDatasetDates, allocationState } from "@/lib/run-analysis";
import { RecommendationDetail } from "@/components/recommendations/recommendation-detail";
import { connection } from "next/server";

export default async function RecommendationsPage() {
  await connection();
  // Fetch from fixture repo (server component — safe)
  const repo = await getRuntimeRepo();
  const [recommendations, anomalies, campaigns, skus, outcomes, inputs] =
    await Promise.all([
      repo.getRecommendations(),
      repo.getAnomalies(),
      repo.getCampaigns(),
      repo.getSkus(),
      repo.getOutcomes(),
      repo.run(loadAnalysisInputs),
    ]);

  const topRec =
    recommendations.find((r) => r.status === "pending") ??
    recommendations[0] ??
    null;

  const stockAnomalies = anomalies
    .filter((a) => a.metric === "stock_runway")
    .sort((a, b) => b.z_score - a.z_score)
    .slice(0, 5);

  const asOf = getDatasetDates(inputs.metrics, inputs.inventory).asOf;
  const currentRunways = Object.fromEntries(allocationState(inputs).campaigns.map(c => [c.id, Number.isFinite(c.sku.runway) ? c.sku.runway : null]));

  return (
    <>
      <PageHeader
        title="Recommendations"
        subtitle={`Budget reallocation recommendations — as of ${asOf}`}
        eyebrow="REALLOCATION ENGINE"
      />
      <MainContent>
        {repo.status.banner && <p role="status">{repo.status.banner}</p>}
        <RecommendationDetail
          key={`${topRec?.id}:${topRec?.status}`}
          recommendation={topRec}
          stockAnomalies={stockAnomalies}
          campaigns={campaigns}
          skus={skus}
          outcome={outcomes.find(row => row.recommendation_id === topRec?.id)}
          currentRunways={currentRunways}
        />
      </MainContent>
    </>
  );
}
