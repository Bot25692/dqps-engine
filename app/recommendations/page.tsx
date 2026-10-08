export const instant = false;

import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { loadAnalysisInputs, getDatasetDates, allocationState } from "@/lib/run-analysis";
import { RecommendationDetail } from "@/components/recommendations/recommendation-detail";
import { connection } from "next/server";
import { cookies } from "next/headers";
import type { Outcome, Recommendation } from "@/lib/types";
import { unsealSession } from "@/lib/session";

export default async function RecommendationsPage() {
  await connection();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("adapt_session")?.value;
  let cookieOutcome: Outcome | null = null;
  let cookieRecStatus: string | null = null;
  let cookieConfidence: number | null = null;
  if (sessionCookie) {
    const session = unsealSession(sessionCookie);
    if (session?.outcome) cookieOutcome = session.outcome;
    if (session?.status) cookieRecStatus = session.status;
    if (session?.confidence?.weight) cookieConfidence = session.confidence.weight;
  }

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

  let effectiveRec = topRec;
  if (effectiveRec && cookieRecStatus && effectiveRec.status === "pending") {
    effectiveRec = {
      ...effectiveRec,
      status: cookieRecStatus as Recommendation["status"],
      confidence: cookieConfidence ?? effectiveRec.confidence,
    };
  }

  const effectiveOutcome =
    outcomes.find((row) => row.recommendation_id === effectiveRec?.id) ??
    (cookieOutcome && cookieOutcome.recommendation_id === effectiveRec?.id
      ? cookieOutcome
      : null);

  const stockAnomalies = anomalies
    .filter((a) => a.metric === "stock_runway")
    .sort((a, b) => b.z_score - a.z_score)
    .slice(0, 5);

  const asOf = getDatasetDates(inputs.metrics, inputs.inventory).asOf;
  const currentRunways = Object.fromEntries(
    allocationState(inputs).campaigns.map((c) => [
      c.id,
      Number.isFinite(c.sku.runway) ? c.sku.runway : null,
    ])
  );

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
          key={`${effectiveRec?.id}:${effectiveRec?.status}`}
          recommendation={effectiveRec}
          stockAnomalies={stockAnomalies}
          campaigns={campaigns}
          skus={skus}
          outcome={effectiveOutcome}
          currentRunways={currentRunways}
        />
      </MainContent>
    </>
  );
}
