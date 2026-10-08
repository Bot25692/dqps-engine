export const instant = false;

import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";

import { LearningView } from "@/components/learning/learning-view";
import type { Outcome } from "@/lib/types";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { unsealSession } from "@/lib/session";

export default async function LearningPage() {
  await connection();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("adapt_session")?.value;
  let cookieOutcome: Outcome | null = null;
  let cookieConfidence: number | null = null;
  if (sessionCookie) {
    const session = unsealSession(sessionCookie);
    if (session?.outcome) cookieOutcome = session.outcome;
    if (session?.confidence?.weight) cookieConfidence = session.confidence.weight;
  }

  const repo = await getRuntimeRepo();
  const [outcomes, confidenceWeights, recommendations] = await Promise.all([
    repo.getOutcomes(),
    repo.getConfidence("budget_reallocation"),
    repo.getRecommendations(),
  ]);

  let allOutcomes = outcomes as Outcome[];
  if (cookieOutcome && !allOutcomes.some(o => o.id === cookieOutcome!.id)) {
    allOutcomes = [cookieOutcome, ...allOutcomes];
  }

  const latestOutcomes = allOutcomes
    .slice()
    .sort((a: Outcome, b: Outcome) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  const currentConfidence = cookieConfidence ?? confidenceWeights?.weight ?? 0.75;

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
          currentConfidence={currentConfidence}
          recommendations={recommendations}
        />
      </MainContent>
    </>
  );
}
