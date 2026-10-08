export const instant = false;

import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { LearningView } from "@/components/learning/learning-view";
import { workflowSnapshot } from "@/lib/integration/workflow-snapshot";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { unsealSession } from "@/lib/session";

export default async function LearningPage() {
  await connection();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("adapt_session")?.value;
  const currentDataset = cookieStore.get("adapt_dataset")?.value === "skincare" ? "skincare" : "apparel";
  const session = sessionCookie ? unsealSession(sessionCookie) : null;

  const repo = await getRuntimeRepo(currentDataset);
  const [outcomes, confidenceWeights, recommendations] = await Promise.all([
    repo.getOutcomes(),
    repo.getConfidence("budget_reallocation"),
    repo.getRecommendations(),
  ]);

  const snapshot = workflowSnapshot(recommendations, outcomes, session, currentDataset);
  const latestOutcomes = snapshot.outcomes.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,10);
  const currentConfidence = latestOutcomes.length
    ? (session?.dataset === currentDataset && session.status === 'executed'
        ? (session.confidence?.weight ?? session.confidenceUpdate?.newConfidence)
        : undefined) ?? confidenceWeights?.weight ?? .75
    : .75;

  return (
    <>
      {repo.status.banner && <p role="status" className="host-notice">{repo.status.banner}</p>}
      <LearningView
        outcomes={latestOutcomes}
        currentConfidence={currentConfidence}
        recommendations={snapshot.recommendations}
      />
    </>
  );
}
