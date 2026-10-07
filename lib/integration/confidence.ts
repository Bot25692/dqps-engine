/**
 * Locked confidence update formula — M5.
 *
 * From CONTEXT.md §Locked rules:
 *   - Confidence: start 0.75 per recommendation type.
 *   - c = c + 0.3 × (accuracy - c)
 *   - accuracy = max(0, 1 - |error|)
 *   - Step capped at ±0.08
 *   - Range [0.30, 0.95]
 *
 * Where:
 *   error = prediction_error (from Outcome.error_pct / 100, i.e. as a fraction)
 *
 * NOTE: CONTEXT says error_pct uses percentage points (10 means 10%).
 * This function accepts error as a fraction (0.10 for 10%).
 *
 * This is a pure function — no side effects, no database.
 * Call it after simulation completes and store the result via Repo.setConfidence().
 */

export interface ConfidenceUpdateInput {
  /** Current confidence value in [0.30, 0.95] */
  currentConfidence: number;
  /**
   * Prediction error as a fraction (not percentage points).
   * error = (actual - predicted) / |predicted| per CONTEXT.
   * Pass Outcome.error_pct / 100.
   */
  errorFraction: number;
}

export interface ConfidenceUpdateResult {
  previousConfidence: number;
  accuracy: number;
  rawStep: number;
  clampedStep: number;
  newConfidence: number;
}

const STEP_WEIGHT = 0.3;
const MAX_STEP = 0.08;
const MIN_CONFIDENCE = 0.30;
const MAX_CONFIDENCE = 0.95;

/**
 * Apply the locked confidence update formula.
 *
 * @param input  Current confidence and prediction error fraction
 * @returns      Full update breakdown for transparency
 */
export function updateConfidence(input: ConfidenceUpdateInput): ConfidenceUpdateResult {
  const { currentConfidence, errorFraction } = input;

  // accuracy = max(0, 1 - |error|)
  const accuracy = Math.max(0, 1 - Math.abs(errorFraction));

  // c_new = c + 0.3 × (accuracy - c)
  const rawStep = STEP_WEIGHT * (accuracy - currentConfidence);

  // Step capped at ±0.08
  const clampedStep = Math.max(-MAX_STEP, Math.min(MAX_STEP, rawStep));

  // Clamp to [0.30, 0.95]
  const newConfidence = Math.max(
    MIN_CONFIDENCE,
    Math.min(MAX_CONFIDENCE, currentConfidence + clampedStep)
  );

  return {
    previousConfidence: currentConfidence,
    accuracy,
    rawStep,
    clampedStep,
    newConfidence: Math.round(newConfidence * 10000) / 10000,
  };
}

/**
 * Compute the prediction error fraction from a simulation result.
 *
 * From CONTEXT.md:
 *   Prediction error = (actual - predicted) / |predicted| over the 3-day horizon.
 *   Predicted = expected_profit_gain_per_day × 3
 *
 * @param predictedGainPerDay  Expected daily gain from recommendation (Builder A)
 * @param actualGainOver3Days  Simulated total gain over 3 days (Builder B)
 * @returns error fraction (may be negative if actual < predicted)
 */
export function computePredictionError(
  predictedGainPerDay: number,
  actualGainOver3Days: number
): number {
  const predicted = predictedGainPerDay * 3;
  if (Math.abs(predicted) < 1e-9) return NaN; // Cannot compute error with zero prediction
  return (actualGainOver3Days - predicted) / Math.abs(predicted);
}
