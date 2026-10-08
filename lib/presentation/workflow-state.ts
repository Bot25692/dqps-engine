import type { Outcome, Recommendation } from '../types';

export type WorkflowStage = 'PENDING' | 'APPROVED' | 'SIMULATING' | 'COMPLETED' | 'LEARNED' | 'REJECTED';

/** A status label alone is not proof that simulation produced a saved outcome. */
export function hasCompletedOutcome(rec: Recommendation, outcome: Outcome): boolean {
  return rec.status === 'executed'
    && outcome.recommendation_id === rec.id
    && outcome.horizon_days === 3
    && [outcome.actual, outcome.predicted, outcome.error_pct].every(Number.isFinite);
}

/** Map the existing persisted domain contract to the explicit UI lifecycle. */
export function workflowStage(rec: Recommendation | null, outcome?: Outcome | null): WorkflowStage {
  if (!rec) return 'PENDING';
  if (rec.status === 'rejected') return 'REJECTED';
  if (outcome && hasCompletedOutcome(rec, outcome)) return 'COMPLETED';
  // An interrupted outcome save can leave executed status: allow safe server retry.
  if (rec.status === 'approved' || rec.status === 'executed') return 'APPROVED';
  return 'PENDING';
}
