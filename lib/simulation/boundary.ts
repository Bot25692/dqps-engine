/**
 * Public boundary for the simulation layer.
 *
 * All calls to the simulation engine MUST go through this file.
 * lib/analysis/ must NEVER import anything from lib/simulation/.
 * A test in __tests__/simulation.test.ts enforces this isolation rule.
 *
 * This boundary:
 *   1. Validates inputs with zod before they reach the engine
 *   2. Enforces the human-approval requirement
 *   3. Guards against invalid/stale/duplicate simulation requests
 *   4. Returns typed results without leaking internal engine details
 *
 * Usage from app/api/decide/route.ts:
 *   import { boundary } from "@/lib/simulation/boundary";
 *   const result = await boundary.simulate(plan, seed);
 */

import { z } from "zod";
import { runSimulation } from "./engine";
import {
  approve,
  guardSimulate,
  markSimulated,
  registerPending,
  reject,
  resetStore,
} from "./approval-store";
import type {
  ApprovedPlan,
  DecideResponse,
  SimulationResult,
} from "./types";

// ── Input validation schemas ──────────────────────────────────────────────────

const BudgetMoveSchema = z.object({
  receiverSkuId: z.string().min(1).optional(),
  donorCampaignId: z.string().min(1),
  receiverCampaignId: z.string().min(1),
  amountPerDay: z.number().finite().refine(value => value !== 0),
  // betaEst clamped 0.4–0.9 by Builder A; we enforce the range here too
  betaEst: z.number().min(0.4).max(0.9),
  receiverRevenue: z.number().nonnegative(),
  receiverSpend: z.number().nonnegative(),
  receiverMarginRate: z.number().min(0).max(1),
  receiverInventoryUnits: z.number().nonnegative().int(),
  receiverAvgDailyUnitsSold: z.number().nonnegative(),
}).refine(move => move.receiverSpend + move.amountPerDay >= 0, 'Budget cannot become negative');

const ApprovedPlanSchema = z.object({
  recommendationId: z.string().min(1),
  moves: z.array(BudgetMoveSchema).min(1).max(5), // CONTEXT: at most 5 moves
  approvedAt: z.number().positive(),
}).refine(plan => new Set(plan.moves.map(move => move.receiverCampaignId)).size === plan.moves.length,
  'Duplicate campaign move').refine(plan => plan.moves.every(move => !move.receiverSkuId
    || plan.moves.every(other => other.receiverSkuId !== move.receiverSkuId
      || other.receiverInventoryUnits === move.receiverInventoryUnits)), 'Inconsistent shared inventory');

// ── Boundary functions ────────────────────────────────────────────────────────

/**
 * Register a new recommendation as pending.
 * Call this when Builder A's recommendation engine produces a new plan.
 *
 * INTEGRATION POINT [A→B]: Builder A's run-analysis API route should call
 * this (or the Repo equivalent) immediately after persisting the recommendation.
 */
function registerRecommendation(recommendationId: string): DecideResponse {
  const record = registerPending(recommendationId);
  return {
    ok: true,
    recommendationId,
    status: record.status,
  };
}

/**
 * Record a human Approve action.
 * The simulation cannot run until this is called for the recommendation.
 */
function recordApprove(recommendationId: string): DecideResponse {
  const result = approve(recommendationId);
  if (!result.ok) {
    return {
      ok: false,
      recommendationId,
      status: "pending",
      error: result.error,
    };
  }
  return {
    ok: true,
    recommendationId,
    status: result.record.status,
  };
}

/**
 * Record a human Reject action.
 * After this, simulation is permanently blocked for this recommendation.
 */
function recordReject(recommendationId: string): DecideResponse {
  const result = reject(recommendationId);
  if (!result.ok) {
    return {
      ok: false,
      recommendationId,
      status: "pending",
      error: result.error,
    };
  }
  return {
    ok: true,
    recommendationId,
    status: result.record.status,
  };
}

/**
 * Run the deterministic 3-day simulation for an approved plan.
 *
 * Guards enforced before execution:
 *   - Plan must be in APPROVED state
 *   - Approval must not be stale (>5 min)
 *   - Rejected plans are unconditionally blocked
 *   - Duplicate simulation requests are detected and blocked
 *   - Inputs are validated with zod before reaching the engine
 *
 * @param rawPlan  Unvalidated plan object (validated here before engine call)
 * @param seed     32-bit seed for deterministic replay
 */
function runApprovedSimulation(
  rawPlan: unknown,
  seed: number
): DecideResponse {
  // 1. Validate inputs
  const parseResult = ApprovedPlanSchema.safeParse(rawPlan);
  if (!parseResult.success) {
    return {
      ok: false,
      recommendationId: (rawPlan as Record<string, unknown>)?.recommendationId as string ?? "unknown",
      status: "pending",
      error: `Invalid plan: ${parseResult.error.message}`,
    };
  }
  const plan = parseResult.data as ApprovedPlan;

  // 2. Enforce approval gate
  const guard = guardSimulate(plan.recommendationId);
  if (!guard.ok) {
    return {
      ok: false,
      recommendationId: plan.recommendationId,
      status: guard.status ?? "pending",
      error: guard.error,
    };
  }

  // 3. Run engine (pure, no side effects)
  let result: SimulationResult;
  try {
    result = runSimulation(plan, seed);
  } catch (err) {
    return {
      ok: false,
      recommendationId: plan.recommendationId,
      status: "approved",
      error: `Simulation engine error: ${String(err)}`,
    };
  }

  // 4. Mark as simulated (persists result in store)
  markSimulated(plan.recommendationId, result);

  return {
    ok: true,
    recommendationId: plan.recommendationId,
    status: "simulated",
    simulationResult: result,
  };
}

/**
 * Reset all demo state.
 * Allows deterministic replay from scratch (e.g. "Reset Demo" button).
 * In production this is a no-op; state lives in Builder A's tables.
 */
function reset(): void {
  resetStore();
}

// ── Exported boundary object ──────────────────────────────────────────────────

export const boundary = {
  registerRecommendation,
  recordApprove,
  recordReject,
  runApprovedSimulation,
  reset,
};
