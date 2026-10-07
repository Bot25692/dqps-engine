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

export const instant = false;

import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { createRepo } from "@/lib/db/data-source";
import { ANALYSIS_AS_OF } from "@/lib/run-analysis";
import { RecommendationDetail } from "@/components/recommendations/recommendation-detail";

export default async function RecommendationsPage() {
  // Fetch from fixture repo (server component — safe)
  const repo = createRepo();
  const [recommendations, anomalies, campaigns, skus, metrics, inventory] =
    await Promise.all([
      repo.getRecommendations(),
      repo.getAnomalies(),
      repo.getCampaigns(),
      repo.getSkus(),
      repo.getMetrics("2026-10-01", ANALYSIS_AS_OF),
      repo.getInventory("2026-10-01", ANALYSIS_AS_OF),
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
          metrics={metrics}
          inventory={inventory}
        />
      </MainContent>
    </>
  );
}
