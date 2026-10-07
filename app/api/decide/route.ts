/**
 * POST /api/decide — Builder B's approval + simulation + M5 confidence workflow.
 *
 * Full Golden Path:
 *   Recommendation → Human Approve/Reject → Simulate → Confidence Update
 *
 * Actions:
 *   "register"  — Register a recommendation as pending (called by run-analysis)
 *   "approve"   — Record human approval
 *   "reject"    — Record human rejection (simulation permanently blocked)
 *   "simulate"  — Run deterministic simulation (only after approval)
 *   "reset"     — Clear demo state for replay
 *
 * Integration with Builder A:
 *   - Accepts a full Recommendation object + campaign enrichment on simulate
 *   - Maps Move → BudgetMove via lib/integration/adapter.ts
 *   - Replaces predictedGainPerDay = 0 with actual expected_profit_gain_per_day
 *   - Computes prediction error using lib/integration/confidence.ts
 *   - Returns confidence update alongside simulation result
 *
 * Builder A ownership: lib/analysis/, lib/db/, lib/types.ts, app/api/run-analysis/
 * This route owns ONLY: the approval/simulate/confidence workflow.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { boundary } from "@/lib/simulation/boundary";
import {
  mapRecommendationToSimulation,
  buildDefaultEnrichment,
  type CampaignEnrichment,
} from "@/lib/integration/adapter";
import {
  updateConfidence,
  computePredictionError,
} from "@/lib/integration/confidence";
import type { ApprovedPlan } from "@/lib/simulation/types";
import type { Recommendation } from "@/lib/types";

// ── Request schema ─────────────────────────────────────────────────────────────

const CampaignEnrichmentSchema = z.object({
  campaign_id: z.string().min(1),
  revenue: z.number().nonnegative(),
  spend: z.number().nonnegative(),
  margin_rate: z.number().min(0).max(1),
  inventory_units: z.number().int().nonnegative(),
  avg_daily_units_sold: z.number().nonnegative(),
  beta_est: z.number().min(0.4).max(0.9),
});

const DecideRequestSchema = z.object({
  recommendationId: z.string().min(1),
  action: z.enum(["register", "approve", "reject", "simulate", "reset"]),
  seed: z.number().int().optional(),
  /**
   * For simulate: the full Recommendation object from Builder A.
   * Must match the Recommendation schema from lib/types.ts.
   */
  recommendation: z.unknown().optional(),
  /**
   * For simulate: per-campaign enrichment (revenue, spend, inventory, beta).
   * INTEGRATION POINT [A→B]: Builder A should include this in the run-analysis
   * response. Until then, the client may supply it from local fixture data.
   */
  enrichment: z.array(CampaignEnrichmentSchema).optional(),
  /**
   * Current confidence to update after simulation.
   * From the recommendation's confidence field.
   */
  currentConfidence: z.number().min(0.3).max(0.95).optional(),
});

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DecideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const { recommendationId, action, seed, recommendation, enrichment, currentConfidence } = parsed.data;

  switch (action) {
    case "reset": {
      boundary.reset();
      return Response.json({ ok: true, recommendationId, status: "reset" });
    }

    case "register": {
      const result = boundary.registerRecommendation(recommendationId);
      return Response.json(result, { status: result.ok ? 200 : 400 });
    }

    case "approve": {
      const result = boundary.recordApprove(recommendationId);
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }

    case "reject": {
      const result = boundary.recordReject(recommendationId);
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }

    case "simulate": {
      if (!recommendation) {
        return Response.json(
          { ok: false, recommendationId, error: "recommendation is required for simulate action" },
          { status: 400 }
        );
      }

      // Validate the Recommendation shape from Builder A
      const rec = recommendation as Recommendation;
      if (!rec.id || !Array.isArray(rec.moves) || rec.moves.length === 0) {
        return Response.json(
          { ok: false, recommendationId, error: "Invalid recommendation object" },
          { status: 400 }
        );
      }

      // Build enrichment map — from supplied enrichment or fallback to minimal defaults
      const enrichmentMap = new Map<string, CampaignEnrichment>(
        (enrichment ?? []).map((e) => [e.campaign_id, e])
      );

      // Map A's moves to B's BudgetMoves
      const budgetMoves = mapRecommendationToSimulation(rec, enrichmentMap);

      if (budgetMoves.length === 0) {
        return Response.json(
          {
            ok: false,
            recommendationId,
            error: "No receiver moves found in recommendation — cannot simulate",
          },
          { status: 400 }
        );
      }

      const effectiveSeed = typeof seed === "number" ? seed : Date.now();

      const approvedPlan: ApprovedPlan = {
        recommendationId,
        moves: budgetMoves,
        approvedAt: Date.now(),
      };

      const result = boundary.runApprovedSimulation(approvedPlan, effectiveSeed);

      if (!result.ok || !result.simulationResult) {
        return Response.json(result, { status: 409 });
      }

      // M5: Compute prediction error and update confidence
      const predictedGainPerDay = rec.expected_profit_gain_per_day;
      const actualGain = result.simulationResult.portfolioGain;
      const errorFraction = computePredictionError(predictedGainPerDay, actualGain);

      let confidenceUpdate = null;
      if (!isNaN(errorFraction) && typeof currentConfidence === "number") {
        confidenceUpdate = updateConfidence({
          currentConfidence,
          errorFraction,
        });
      }

      return Response.json(
        {
          ...result,
          predictedGainPerDay,
          predictedTotal: predictedGainPerDay * 3,
          actualGain,
          errorFraction: isNaN(errorFraction) ? null : errorFraction,
          errorPct: isNaN(errorFraction) ? null : errorFraction * 100,
          confidenceUpdate,
        },
        { status: 200 }
      );
    }

    default: {
      return Response.json({ ok: false, error: `Unknown action` }, { status: 400 });
    }
  }
}
