import type { Outcome, Recommendation } from '../types';
import type { SessionPayload } from '../session';
import { hasCompletedOutcome } from '../presentation/workflow-state';

/** Reconcile authenticated cold-start recovery with the active dataset's Repo.
 * Local browser data and unpaired fixture outcomes are never completion evidence.
 */
export function workflowSnapshot(
  recommendations: Recommendation[],
  outcomes: Outcome[],
  session: SessionPayload | null,
  dataset: string
) {
  const activeSession = session?.dataset === dataset ? session : null;

  const recs = recommendations.map(rec => {
    // 1. If activeSession has executed this recommendation with an outcome, reconcile it
    if (activeSession?.recommendationId === rec.id && activeSession.status === 'executed' && activeSession.outcome) {
      return {
        ...rec,
        status: 'executed' as const,
        confidence: activeSession.confidenceUpdate?.previousConfidence ?? rec.confidence,
      };
    }
    // 2. If activeSession has recorded approval
    if (activeSession?.recommendationId === rec.id && activeSession.status === 'approved' && rec.status === 'pending') {
      return {
        ...rec,
        status: 'approved' as const,
      };
    }
    return rec;
  });

  const eligibleMap = new Map<string, Outcome>();
  for (const outcome of outcomes) {
    if (recs.some(rec => hasCompletedOutcome(rec, outcome))) {
      eligibleMap.set(outcome.id, outcome);
    }
  }

  if (activeSession?.status === 'executed' && activeSession.outcome) {
    const o = activeSession.outcome;
    if (recs.some(rec => hasCompletedOutcome(rec, o))) {
      eligibleMap.set(o.id, o);
    }
  }

  return { recommendations: recs, outcomes: Array.from(eligibleMap.values()) };
}
