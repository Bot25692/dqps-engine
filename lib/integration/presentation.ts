import type { Outcome, Recommendation } from '../types';
import { updateConfidence } from './confidence';

// Replay a saved outcome from its approval-time confidence, never the current weight.
export function presentOutcome(outcome: Outcome, recommendation: Recommendation) {
  return { ok: true, actualGain: outcome.actual, predictedTotal: outcome.predicted,
    errorPct: outcome.error_pct, confidenceUpdate: updateConfidence({
      currentConfidence: recommendation.confidence, errorFraction: outcome.error_pct / 100,
    }) };
}
