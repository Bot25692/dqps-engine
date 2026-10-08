import type { Outcome, Recommendation } from '../types';
import type { SessionPayload } from '../session';
import { hasCompletedOutcome } from '../presentation/workflow-state';

/** Reconcile authenticated cold-start recovery with the active dataset's Repo.
 * Local browser data and unpaired fixture outcomes are never completion evidence.
 */
export function workflowSnapshot(recommendations: Recommendation[], outcomes: Outcome[], session: SessionPayload | null, dataset: string) {
  const activeSession = session?.dataset === dataset ? session : null;
  const recs = recommendations.map(rec => {
    if (rec.status !== 'pending' || activeSession?.recommendationId !== rec.id) return rec;
    if (activeSession.status === 'executed' && !activeSession.outcome) return rec;
    return {...rec, status:activeSession.status,
      confidence:activeSession.confidenceUpdate?.previousConfidence ?? rec.confidence};
  });
  const eligible = outcomes.filter(outcome => recs.some(rec => hasCompletedOutcome(rec, outcome)));
  if (activeSession?.status === 'executed' && activeSession.outcome
      && recs.some(rec => hasCompletedOutcome(rec, activeSession.outcome!))
      && !eligible.some(row => row.id === activeSession.outcome!.id)) {
    eligible.push(activeSession.outcome);
  }
  return {recommendations:recs, outcomes:eligible};
}
