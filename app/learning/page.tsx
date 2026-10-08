export const instant = false;

import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";

import { LearningView } from "@/components/learning/learning-view";
import type { Outcome } from "@/lib/types";
import { connection } from "next/server";

export default async function LearningPage() {
  await connection();
  const repo = await getRuntimeRepo();
  const [outcomes, confidenceWeights, recommendations] = await Promise.all([
    repo.getOutcomes(),
    repo.getConfidence("budget_reallocation"),
    repo.getRecommendations(),
  ]);

  const latestOutcomes = (outcomes as Outcome[])
    .slice()
    .sort((a: Outcome, b: Outcome) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  const asOf =
    recommendations[0]?.created_at?.slice(0, 10) ??
    latestOutcomes[0]?.created_at?.slice(0, 10) ??
    "No analysis yet";

  return (
    <>
      <PageHeader
        title="Learning"
        subtitle={`Prediction accuracy and confidence tracking — as of ${asOf}`}
        eyebrow="CLOSED-LOOP SYSTEM"
      />
      <MainContent>
        {repo.status.banner && <p role="status">{repo.status.banner}</p>}
        <LearningView
          outcomes={latestOutcomes}
          currentConfidence={confidenceWeights?.weight ?? 0.75}
          recommendations={recommendations}
        />
      </MainContent>
    </>
  );
}
