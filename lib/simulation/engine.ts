/**
 * Deterministic hidden-world simulation engine.
 *
 * Implements the locked simulation rules from CONTEXT.md §Locked rules:
 *   - Horizon: 3 days
 *   - Hidden beta: beta_true = beta_est × factor, factor ∈ [0.8, 1.2]
 *   - Noise: ±8% multiplicative per day
 *   - Day-1 ramp: 50% of the budget change takes effect on day 1
 *   - Inventory: never goes negative
 *   - Deterministic: same seed → same result
 *
 * ISOLATION RULE: This file MUST NEVER be imported from lib/analysis/.
 * A test in __tests__/simulation.test.ts enforces this.
 *
 * The engine knows nothing about the database, UI, or Builder A's
 * recommendation logic. It only receives pre-validated BudgetMove inputs.
 */

import { makeRng, uniform } from "./seeded-rng";
import type {
  ApprovedPlan,
  BudgetMove,
  MoveSimResult,
  SimDayResult,
  SimulationResult,
} from "./types";

// ── Locked constants (CONTEXT.md §Locked rules) ──────────────────────────────

/** Simulation horizon in days */
const HORIZON = 3 as const;

/** Hidden beta factor range [min, max] */
const BETA_FACTOR_MIN = 0.8;
const BETA_FACTOR_MAX = 1.2;

/** Noise magnitude (symmetric, applied as ±NOISE_PCT) */
const NOISE_PCT = 0.08;

/** Day-1 budget ramp: only 50% of the new spend is active on day 1 */
const DAY1_RAMP = 0.5;

// ── Revenue model ─────────────────────────────────────────────────────────────

/**
 * Predict daily revenue using the power-law return curve from CONTEXT.md:
 *   revenue(s) = r0 × (s / s0) ^ beta
 *
 * r0  = baseline revenue at baseline spend s0
 * s   = new spend
 * beta = fitted elasticity (clamped 0.4–0.9 by Builder A; hidden factor applied here)
 */
function predictRevenue(
  baselineRevenue: number,
  baselineSpend: number,
  newSpend: number,
  betaHidden: number
): number {
  if (baselineSpend <= 0) return baselineRevenue;
  return baselineRevenue * Math.pow(newSpend / baselineSpend, betaHidden);
}

// ── Per-move simulation ───────────────────────────────────────────────────────

/**
 * Simulate one BudgetMove over 3 days using a shared RNG state.
 * The RNG must be advanced consistently so multi-move plans remain
 * deterministic regardless of move order.
 */
function simulateMove(
  move: BudgetMove,
  rng: () => number
): MoveSimResult {
  // Draw the hidden beta factor once per move (shared across all 3 days)
  const factor = uniform(rng, BETA_FACTOR_MIN, BETA_FACTOR_MAX);
  const betaHidden = move.betaEst * factor;

  const newSpend = move.receiverSpend + move.amountPerDay;
  const days: SimDayResult[] = [];
  let inventoryUnits = move.receiverInventoryUnits;
  let totalActualGain = 0;

  for (let d = 1; d <= HORIZON; d++) {
    // Day 1 ramp: only 50% of the budget increase is active
    const effectiveDeltaSpend =
      d === 1 ? move.amountPerDay * DAY1_RAMP : move.amountPerDay;
    const effectiveSpend = move.receiverSpend + effectiveDeltaSpend;

    // Predict revenue with hidden beta
    const predictedRevenue = predictRevenue(
      move.receiverRevenue,
      move.receiverSpend,
      effectiveSpend,
      betaHidden
    );

    // Apply ±8% multiplicative noise (draw each day)
    const noiseRaw = uniform(rng, -NOISE_PCT, NOISE_PCT);
    const noiseFactor = 1 + noiseRaw;
    const noisyRevenue = predictedRevenue * noiseFactor;

    // Estimate units sold from revenue and average order value proxy
    // Proxy: average daily units sold stays proportional to revenue gain
    const revenueGainRatio =
      move.receiverRevenue > 0 ? noisyRevenue / move.receiverRevenue : 1;
    const estimatedUnitsSold = Math.ceil(
      move.receiverAvgDailyUnitsSold * revenueGainRatio
    );

    // Inventory: never goes negative
    const unitsSold = Math.min(estimatedUnitsSold, inventoryUnits);
    inventoryUnits = Math.max(0, inventoryUnits - unitsSold);

    const cp = noisyRevenue * move.receiverMarginRate - effectiveSpend;

    // Baseline contribution profit (no budget change)
    const baselineCp =
      move.receiverRevenue * move.receiverMarginRate - move.receiverSpend;
    totalActualGain += cp - baselineCp;

    days.push({
      day: d as 1 | 2 | 3,
      revenue: Math.round(noisyRevenue * 100) / 100,
      spend: Math.round(effectiveSpend * 100) / 100,
      contributionProfit: Math.round(cp * 100) / 100,
      inventoryUnits,
      betaHidden: Math.round(betaHidden * 10000) / 10000,
      noiseFactor: Math.round(noiseFactor * 10000) / 10000,
    });
  }

  const roundedGain = Math.round(totalActualGain * 100) / 100;

  return {
    donorCampaignId: move.donorCampaignId,
    receiverCampaignId: move.receiverCampaignId,
    days: days as [SimDayResult, SimDayResult, SimDayResult],
    totalGainVsBaseline: roundedGain,
    // INTEGRATION POINT [A→B]: predictedGainPerDay will come from Builder A's
    // recommendation output. Using 0 until that contract is finalised.
    predictedTotalGain: 0,
    predictionError: NaN,
  };
}

// ── Public simulation entry point ─────────────────────────────────────────────

/**
 * Run the deterministic 3-day simulation for an approved plan.
 *
 * This is the only public function in the engine. It must only be called
 * from lib/simulation/boundary.ts — never directly from pages or analysis.
 *
 * @param plan  The human-approved plan (validated by the approval workflow)
 * @param seed  32-bit integer seed for reproducibility
 * @returns     SimulationResult containing per-move outcomes and portfolio total
 */
export function runSimulation(
  plan: ApprovedPlan,
  seed: number
): SimulationResult {
  const rng = makeRng(seed);

  const moveResults = plan.moves.map((move) => simulateMove(move, rng));

  const portfolioGain = Math.round(
    moveResults.reduce((sum, m) => sum + m.totalGainVsBaseline, 0) * 100
  ) / 100;

  return {
    recommendationId: plan.recommendationId,
    seed,
    simulatedAt: Date.now(),
    moveResults,
    portfolioGain,
  };
}
