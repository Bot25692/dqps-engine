/**
 * Recommendations page — wires Builder A's real recommendation output.
 *
 * Data flow:
 *   Fixture data (fixtures/*.json) → FixtureRepo → /api/analysis GET
 *   → RecommendationsClient displays recommendation + Approve/Reject controls
 *   → Approve/Reject → POST /api/decide
 *   → Approved → Simulate → POST /api/decide { action: "simulate" }
 *   → Simulation result → /learning page
 *
 * No business logic in this file. All numbers from code.
 */


import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { ANALYSIS_AS_OF } from "@/lib/run-analysis";
import { RecommendationDetail } from "@/components/recommendations/recommendation-detail";
import { connection } from "next/server";

export default async function RecommendationsPage() {
  await connection();
  // Fetch from fixture repo (server component — safe)
  const repo = await getRuntimeRepo();
  const [recommendations, anomalies, campaigns, skus] =
    await Promise.all([
      repo.getRecommendations(),
      repo.getAnomalies(),
      repo.getCampaigns(),
      repo.getSkus(),
    ]);

  const topRec =
    recommendations.find((r) => r.status === "pending") ??
    recommendations[0] ??
    null;

  const stockAnomalies = anomalies
    .filter((a) => a.metric === "stock_runway")
    .sort((a, b) => b.z_score - a.z_score)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Recommendations"
        subtitle={`Budget reallocation recommendations — as of ${ANALYSIS_AS_OF}`}
      />
      <MainContent>
        <RecommendationDetail
          recommendation={topRec}
          stockAnomalies={stockAnomalies}
          campaigns={campaigns}
          skus={skus}
        />
      </MainContent>
    </>
  );
}
