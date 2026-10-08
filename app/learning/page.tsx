export const instant = false;

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
  const currentDataset = cookieStore.get("adapt_dataset")?.value === "skincare" ? "skincare" : "apparel";
  let cookieOutcome: Outcome | null = null;
  let cookieConfidence: number | null = null;
  if (sessionCookie) {
    const session = unsealSession(sessionCookie);
    if (session && (!session.dataset || session.dataset === currentDataset)) {
      if (session.outcome) cookieOutcome = session.outcome;
      if (session.confidence?.weight) cookieConfidence = session.confidence.weight;
    }
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

  return (
    <>
        {repo.status.banner && <p role="status" className="host-notice">{repo.status.banner}</p>}
        <LearningView
          outcomes={latestOutcomes}
          currentConfidence={currentConfidence}
          recommendations={recommendations}
        />

    </>
  );
}
