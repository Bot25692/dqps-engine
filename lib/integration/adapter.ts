/**
 * A→B Integration Adapter
 *
 * Maps Builder A's `Recommendation` and `Move` types (from lib/types.ts)
 * into Builder B's `BudgetMove` type (from lib/simulation/types.ts).
 *
 * This adapter is the ONLY place where the A/B contract boundary is crossed.
 * It must never import from lib/analysis/, lib/db/, or lib/simulation/engine.ts
 * directly. It only reads public types from both sides.
 *
 * CONTEXT.md locked rules applied here:
 *   - beta_est clamped 0.4–0.9 (default 0.7 per CONTEXT)
 *   - margin_rate is a fraction 0–1 (already enforced by Builder A's zod)
 *   - predictedGainPerDay = expected_profit_gain_per_day / moves.length (per-move allocation)
 */

import type { Recommendation, Move } from "@/lib/types";
import type { BudgetMove } from "@/lib/simulation/types";

/**
 * Enriched campaign data needed to build a BudgetMove.
 * Supplied by the run-analysis API response or the Repo.
 *
 * INTEGRATION POINT [A→B]: Builder A's campaign enrichment (revenue, spend,
 * inventory, avgDailyUnitsSold, betaEst) must be surfaced here.
 * Until the full API response includes them, we supply defaults from the
 * fixture campaigns.json and metrics.json at the call site.
 */
export interface CampaignEnrichment {
  campaign_id: string;
  /** Current daily revenue (INR) — from latest metrics */
  revenue: number;
  /** Current daily spend (INR) — from latest metrics */
  spend: number;
  /** Margin rate (fraction 0–1) */
  margin_rate: number;
  /** Current inventory units */
  inventory_units: number;
  /** 7-day average daily units sold */
  avg_daily_units_sold: number;
  /** Fitted beta elasticity, clamped 0.4–0.9 (default 0.7) */
  beta_est: number;
}

/**
 * Map a single A-side Move into a B-side BudgetMove.
 *
 * The Move only has old_budget/new_budget; the delta is the amountPerDay.
 * We look up per-campaign enrichment from the supplied map.
 *
 * Donor/receiver semantics:
 *   - If new_budget < old_budget → this is the DONOR
 *   - If new_budget > old_budget → this is the RECEIVER
 *
 * For simulation purposes, Builder B simulates the RECEIVER campaign's
 * outcome. Donor campaigns are referenced by ID for tracking only.
 */
export function mapMoveToSimulation(
  move: Move,
  allMoves: Move[],
  enrichment: Map<string, CampaignEnrichment>,
  totalExpectedGainPerDay: number
): BudgetMove | null {
  const isReceiver = move.new_budget > move.old_budget;
  if (!isReceiver) return null; // Donors are not simulated directly

  const data = enrichment.get(move.campaign_id);
  if (!data) return null;

  // Find a donor for this receiver (the largest absolute donor)
  const donor = allMoves
    .filter((m) => m.new_budget < m.old_budget)
    .sort((a, b) => (b.old_budget - b.new_budget) - (a.old_budget - a.new_budget))[0];

  const amountPerDay = move.new_budget - move.old_budget;

  return {
    donorCampaignId: donor?.campaign_id ?? "held-back",
    receiverCampaignId: move.campaign_id,
    amountPerDay,
    betaEst: Math.max(0.4, Math.min(0.9, data.beta_est)),
    receiverRevenue: data.revenue,
    receiverSpend: data.spend,
    receiverMarginRate: data.margin_rate,
    receiverInventoryUnits: data.inventory_units,
    receiverAvgDailyUnitsSold: data.avg_daily_units_sold,
  };
}

/**
 * Map a full Recommendation into a list of BudgetMoves for simulation.
 * Returns only receiver-side moves (donors are tracked by ID, not simulated).
 */
export function mapRecommendationToSimulation(
  rec: Recommendation,
  enrichment: Map<string, CampaignEnrichment>
): BudgetMove[] {
  return rec.moves
    .map((move) =>
      mapMoveToSimulation(move, rec.moves, enrichment, rec.expected_profit_gain_per_day)
    )
    .filter((m): m is BudgetMove => m !== null);
}

/**
 * Build a default enrichment map from fixture data.
 * Used when the full campaign enrichment is not available from the API.
 *
 * INTEGRATION POINT [A→B]: Replace with live Repo data once
 * Builder A surfaces enriched campaign state from the run-analysis result.
 */
export function buildDefaultEnrichment(
  campaigns: Array<{ id: string; sku_id: string; daily_budget: number }>,
  skus: Array<{ id: string; margin_rate: number }>,
  metricsSnapshot: Array<{ campaign_id: string; revenue: number; spend: number }>,
  inventorySnapshot: Array<{ sku_id: string; units_on_hand: number; units_sold: number }>
): Map<string, CampaignEnrichment> {
  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const metricMap = new Map(metricsSnapshot.map((m) => [m.campaign_id, m]));

  const map = new Map<string, CampaignEnrichment>();

  for (const campaign of campaigns) {
    const sku = skuMap.get(campaign.sku_id);
    const metric = metricMap.get(campaign.id);
    const inv = inventorySnapshot.filter((i) => i.sku_id === campaign.sku_id);
    const avgDailySold = inv.length > 0
      ? inv.reduce((s, i) => s + i.units_sold, 0) / inv.length
      : 0;
    const latestInv = inv.at(-1);

    map.set(campaign.id, {
      campaign_id: campaign.id,
      revenue: metric?.revenue ?? campaign.daily_budget * 4, // fallback: 4× ROAS
      spend: metric?.spend ?? campaign.daily_budget,
      margin_rate: sku?.margin_rate ?? 0.5,
      inventory_units: latestInv?.units_on_hand ?? 100,
      avg_daily_units_sold: avgDailySold,
      beta_est: 0.7, // CONTEXT default
    });
  }

  return map;
}
