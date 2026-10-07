/**
 * Learning page — predicted vs actual simulated contribution profit.
 *
 * Data sources:
 *   - Outcomes from FixtureRepo (persisted after simulate)
 *   - Confidence weights from FixtureRepo
 *   - M5 confidence update formula (pure, from lib/integration/confidence.ts)
 *
 * No business logic inside this page. No hardcoded numbers.
 */

// Allow this route to block at prerender (it reads from the filesystem at request time).
// See: next.js docs — route-segment-config/instant.md
export const instant = false;

import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { ANALYSIS_AS_OF } from "@/lib/run-analysis";
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

  return (
    <>
      <PageHeader
        title="Learning"
        subtitle={`Prediction accuracy and confidence tracking — as of ${ANALYSIS_AS_OF}`}
      />
      <MainContent>
        <LearningView
          outcomes={latestOutcomes}
          currentConfidence={confidenceWeights?.weight ?? 0.75}
          recommendations={recommendations}
        />
      </MainContent>
    </>
  );
}
