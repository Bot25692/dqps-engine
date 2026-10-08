export const instant = false;

import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { loadAnalysisInputs, allocationState } from "@/lib/run-analysis";
import { RecommendationDetail } from "@/components/recommendations/recommendation-detail";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { workflowSnapshot } from "@/lib/integration/workflow-snapshot";
import { unsealSession } from "@/lib/session";

export default async function RecommendationsPage() {
  await connection();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("adapt_session")?.value;
  const currentDataset = cookieStore.get("adapt_dataset")?.value === "skincare" ? "skincare" : "apparel";
  const session = sessionCookie ? unsealSession(sessionCookie) : null;

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

  const snapshot = workflowSnapshot(recommendations, outcomes, session, currentDataset);
  const effectiveRec = snapshot.recommendations.find(r=>r.status === 'approved')
    ?? snapshot.recommendations.find(r=>r.status === 'pending') ?? snapshot.recommendations[0] ?? null;
  const effectiveOutcome = snapshot.outcomes.find(row=>row.recommendation_id === effectiveRec?.id) ?? null;

  const stockAnomalies = anomalies
    .filter((a) => a.metric === "stock_runway")
    .sort((a, b) => b.z_score - a.z_score)
    .slice(0, 5);

  const currentRunways = Object.fromEntries(
    allocationState(inputs).campaigns.map((c) => [
      c.id,
      Number.isFinite(c.sku.runway) ? c.sku.runway : null,
    ])
  );

  return (
    <>
        {repo.status.banner && <p role="status" className="host-notice">{repo.status.banner}</p>}
        <RecommendationDetail
          key={`${currentDataset}:${effectiveRec?.id}:${effectiveRec?.status}:${effectiveOutcome?.id ?? "none"}`}
          recommendation={effectiveRec}
          stockAnomalies={stockAnomalies}
          campaigns={campaigns}
          skus={skus}
          outcome={effectiveOutcome}
          currentRunways={currentRunways}
        />

    </>
  );
}
