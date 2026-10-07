/**
 * Builder-B-owned simulation types.
 *
 * These types live ONLY in lib/simulation/ and NEVER in lib/types.ts
 * (which is Builder A's contract). Do not import these from lib/analysis/.
 *
 * Integration point: when Builder A finalises lib/types.ts, the
 * ApprovedPlan.move shape must align with Builder A's RecommendationMove.
 * Until then, we define the minimal contract Builder B needs.
 */

// ---------------------------------------------------------------------------
// Input types (what Builder B receives from the recommendation layer)
// ---------------------------------------------------------------------------

/**
 * A single budget move from a donor campaign to a receiver campaign.
 * Builder A will populate real campaign IDs and amounts.
 * Builder B uses this shape for simulation input only.
 *
 * INTEGRATION POINT [A→B]: Builder A must produce objects matching this
 * interface when the recommendation engine is complete.
 */
export interface BudgetMove {
  /** Donor campaign identifier (Builder A owns the canonical ID list) */
  donorCampaignId: string;
  /** Receiver campaign identifier */
  receiverCampaignId: string;
  /** INR amount transferred per day */
  amountPerDay: number;
  /** beta_est from Builder A's regression — clamped 0.4–0.9 per CONTEXT */
  betaEst: number;
  /** Current daily revenue of the receiver campaign (INR) */
  receiverRevenue: number;
  /** Current daily spend of the receiver campaign (INR) */
  receiverSpend: number;
  /** Receiver's margin rate (fraction 0–1) */
  receiverMarginRate: number;
  /** Receiver's current inventory units */
  receiverInventoryUnits: number;
  /** Receiver's 7-day average daily units sold (for runway) */
  receiverAvgDailyUnitsSold: number;
}

/**
 * A plan that has been human-approved and is ready for simulation.
 * Passed to the simulation engine after the approval workflow confirms
 * human sign-off.
 */
export interface ApprovedPlan {
  /** Unique identifier for this recommendation run */
  recommendationId: string;
  /** Budget moves approved by the human operator */
  moves: BudgetMove[];
  /**
   * Wall-clock timestamp when the human clicked Approve.
   * Used to detect stale simulation requests (> 5 min → reject).
   */
  approvedAt: number; // Unix ms
}

// ---------------------------------------------------------------------------
// Simulation output types
// ---------------------------------------------------------------------------

/** Per-day outcome for one move's receiver campaign */
export interface SimDayResult {
  day: 1 | 2 | 3;
  /** Simulated revenue for this day (INR) */
  revenue: number;
  /** Actual spend including ramp (INR) */
  spend: number;
  /** Contribution profit = revenue × marginRate − spend */
  contributionProfit: number;
  /** Inventory units remaining end of day (never negative) */
  inventoryUnits: number;
  /** Hidden beta used this day (beta_est × factor; factor ∈ [0.8, 1.2]) */
  betaHidden: number;
  /** Multiplicative noise applied this day (1 ± 8%) */
  noiseFactor: number;
}

/** Full simulation output for one BudgetMove */
export interface MoveSimResult {
  donorCampaignId: string;
  receiverCampaignId: string;
  days: [SimDayResult, SimDayResult, SimDayResult];
  /** Total profit gain over 3 days vs baseline (INR) */
  totalGainVsBaseline: number;
  /**
   * Predicted total gain from the recommendation
   * (= expected gain × 3, per CONTEXT formula).
   * Supplied by Builder A in the move; echoed here for error calculation.
   *
   * INTEGRATION POINT [A→B]: Builder A must supply predictedGainPerDay.
   * Until then this field is 0 (tests exercise the calculation path only).
   */
  predictedTotalGain: number;
  /** Prediction error = (actual - predicted) / |predicted| (NaN if predicted = 0) */
  predictionError: number;
}

/** Complete simulation result for an entire approved plan */
export interface SimulationResult {
  recommendationId: string;
  seed: number;
  simulatedAt: number; // Unix ms
  moveResults: MoveSimResult[];
  /** Sum of totalGainVsBaseline across all moves (INR) */
  portfolioGain: number;
}

// ---------------------------------------------------------------------------
// Approval workflow types
// ---------------------------------------------------------------------------

export type ApprovalStatus =
  | "pending"   // recommendation created, awaiting human action
  | "approved"  // human clicked Approve — simulation may proceed
  | "rejected"  // human clicked Reject — simulation MUST NOT proceed
  | "simulated" // simulation completed successfully after approval
  | "stale";    // approval timestamp too old for safe simulation

export interface ApprovalRecord {
  recommendationId: string;
  status: ApprovalStatus;
  createdAt: number;
  actionAt?: number; // ms timestamp of approve/reject action
  simulatedAt?: number;
  simulationResult?: SimulationResult;
}

// ---------------------------------------------------------------------------
// API types (app/api/decide boundary)
// ---------------------------------------------------------------------------

export type DecideAction = "approve" | "reject" | "simulate";

export interface DecideRequest {
  recommendationId: string;
  action: DecideAction;
  /** Required only for simulate action */
  seed?: number;
}

export interface DecideResponse {
  ok: boolean;
  recommendationId: string;
  status: ApprovalStatus;
  simulationResult?: SimulationResult;
  error?: string;
}
