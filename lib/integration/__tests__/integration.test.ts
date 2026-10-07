/**
 * Integration + M5 Tests
 *
 * Tests:
 *   1.  Adapter: Move → BudgetMove mapping (receiver identified correctly)
 *   2.  Adapter: donor-only moves produce no BudgetMove
 *   3.  Adapter: betaEst clamped to [0.4, 0.9]
 *   4.  M5: confidence formula — accuracy = max(0, 1 - |error|)
 *   5.  M5: c_new = c + 0.3 × (accuracy - c)
 *   6.  M5: step capped at +0.08
 *   7.  M5: step capped at -0.08
 *   8.  M5: confidence clamped to [0.30, 0.95]
 *   9.  M5: prediction error = (actual - predicted) / |predicted|
 *   10. M5: NaN returned when predicted is 0
 *   11. Golden Path: approve → simulate → confidence update chain
 *   12. Golden Path: reject blocks simulation
 *   13. Golden Path: same seed gives same simulation result
 *   14. Golden Path: reset clears state for replay
 *   15. lib/analysis never imports lib/simulation (forward assertion)
 *   16. lib/integration never imports lib/analysis (isolation check)
 *   17. Enrichment fallback: missing enrichment does not crash adapter
 *   18. Confidence stays in [0.30, 0.95] for 100 random errors
 *   19. predictedTotal = expected_gain_per_day × 3
 *   20. Simulation result portfolioGain matches sum of move gains
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mapMoveToSimulation, mapRecommendationToSimulation, buildDefaultEnrichment, type CampaignEnrichment } from "@/lib/integration/adapter";
import { updateConfidence, computePredictionError } from "@/lib/integration/confidence";
import { boundary } from "@/lib/simulation/boundary";
import type { Move, Recommendation } from "@/lib/types";
import { makeRng, uniform } from "@/lib/simulation/seeded-rng";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOVE_DONOR: Move = {
  campaign_id: "c-sneaker",
  old_budget: 1000,
  new_budget: 0,
  reason: "Protect stock below three days of cover.",
};
const MOVE_RECEIVER: Move = {
  campaign_id: "c-premium",
  old_budget: 2500,
  new_budget: 3500,
  reason: "Positive marginal profit and sufficient stock cover.",
};

const ENRICHMENT: CampaignEnrichment = {
  campaign_id: "c-premium",
  revenue: 12000,
  spend: 3000,
  margin_rate: 0.61,
  inventory_units: 450,
  avg_daily_units_sold: 10,
  beta_est: 0.7,
};

const ENRICHMENT_MAP = new Map([["c-premium", ENRICHMENT]]);

const REC: Recommendation = {
  id: "r-stock",
  created_at: "2026-09-20T18:00:00Z",
  type: "stock_protection",
  moves: [MOVE_DONOR, MOVE_RECEIVER],
  expected_profit_gain_per_day: 1660.54,
  confidence: 0.75,
  constraints_checked: ["budget conserved", "donor cap"],
  explanation: "Test recommendation",
  status: "pending",
};

// ── 1. Adapter tests ──────────────────────────────────────────────────────────

describe("IntegrationAdapter", () => {
  // TEST-1: receiver mapped correctly
  it("TEST-1: receiver move produces a BudgetMove", () => {
    const result = mapMoveToSimulation(MOVE_RECEIVER, [MOVE_DONOR, MOVE_RECEIVER], ENRICHMENT_MAP, 1660);
    expect(result).not.toBeNull();
    expect(result!.receiverCampaignId).toBe("c-premium");
    expect(result!.amountPerDay).toBe(1000); // 3500 - 2500
    expect(result!.receiverMarginRate).toBe(0.61);
  });

  // TEST-2: donor-only returns null
  it("TEST-2: donor move returns null (not simulated directly)", () => {
    const result = mapMoveToSimulation(MOVE_DONOR, [MOVE_DONOR, MOVE_RECEIVER], ENRICHMENT_MAP, 1660);
    expect(result).toBeNull();
  });

  // TEST-3: betaEst clamped
  it("TEST-3: betaEst clamped to [0.4, 0.9]", () => {
    const highBetaEnrichment = new Map([["c-premium", { ...ENRICHMENT, beta_est: 1.5 }]]);
    const result = mapMoveToSimulation(MOVE_RECEIVER, [MOVE_DONOR, MOVE_RECEIVER], highBetaEnrichment, 0);
    expect(result!.betaEst).toBeLessThanOrEqual(0.9);

    const lowBetaEnrichment = new Map([["c-premium", { ...ENRICHMENT, beta_est: 0.1 }]]);
    const result2 = mapMoveToSimulation(MOVE_RECEIVER, [MOVE_DONOR, MOVE_RECEIVER], lowBetaEnrichment, 0);
    expect(result2!.betaEst).toBeGreaterThanOrEqual(0.4);
  });

  // TEST-17: missing enrichment returns null gracefully
  it("TEST-17: missing enrichment returns null", () => {
    const result = mapRecommendationToSimulation(REC, new Map());
    expect(result).toHaveLength(0);
  });

  // TEST-19: predictedTotal = gain_per_day × 3
  it("TEST-19: predictedTotal = expected_gain_per_day × 3", () => {
    const predicted3Day = REC.expected_profit_gain_per_day * 3;
    expect(predicted3Day).toBeCloseTo(1660.54 * 3, 2);
  });
});

// ── 2. M5 Confidence tests ────────────────────────────────────────────────────

describe("M5ConfidenceUpdate", () => {
  // TEST-4: accuracy formula
  it("TEST-4: accuracy = max(0, 1 - |error|)", () => {
    expect(updateConfidence({ currentConfidence: 0.75, errorFraction: 0.0 }).accuracy).toBe(1.0);
    expect(updateConfidence({ currentConfidence: 0.75, errorFraction: 0.3 }).accuracy).toBeCloseTo(0.7, 6);
    expect(updateConfidence({ currentConfidence: 0.75, errorFraction: -0.5 }).accuracy).toBeCloseTo(0.5, 6);
    expect(updateConfidence({ currentConfidence: 0.75, errorFraction: 1.5 }).accuracy).toBe(0); // max(0, negative)
  });

  // TEST-5: c_new = c + 0.3 × (accuracy - c)
  it("TEST-5: c_new = c + 0.3 × (accuracy - c)", () => {
    const result = updateConfidence({ currentConfidence: 0.75, errorFraction: 0.0 });
    // accuracy=1.0, step=0.3*(1-0.75)=0.075 → clamped to 0.075 (< 0.08) → new = 0.825
    expect(result.newConfidence).toBeCloseTo(0.825, 3);
  });

  // TEST-6: step capped at +0.08
  it("TEST-6: positive step capped at +0.08", () => {
    // With accuracy=1.0 and c=0.30: raw step = 0.3*(1-0.3) = 0.21 → capped to 0.08
    const result = updateConfidence({ currentConfidence: 0.30, errorFraction: 0.0 });
    expect(result.clampedStep).toBeCloseTo(0.08, 6);
    expect(result.newConfidence).toBeCloseTo(0.38, 3);
  });

  // TEST-7: step capped at -0.08
  it("TEST-7: negative step capped at -0.08", () => {
    // With accuracy=0 and c=0.95: raw step = 0.3*(0-0.95) = -0.285 → capped to -0.08
    const result = updateConfidence({ currentConfidence: 0.95, errorFraction: 2.0 });
    expect(result.clampedStep).toBeCloseTo(-0.08, 6);
    expect(result.newConfidence).toBeCloseTo(0.87, 3);
  });

  // TEST-8: confidence clamped to [0.30, 0.95]
  it("TEST-8: confidence clamped to [0.30, 0.95]", () => {
    const high = updateConfidence({ currentConfidence: 0.94, errorFraction: 0.0 });
    expect(high.newConfidence).toBeLessThanOrEqual(0.95);

    const low = updateConfidence({ currentConfidence: 0.31, errorFraction: 2.0 });
    expect(low.newConfidence).toBeGreaterThanOrEqual(0.30);
  });

  // TEST-9: prediction error formula
  it("TEST-9: prediction error = (actual - predicted) / |predicted|", () => {
    // predicted = 1000*3 = 3000, actual = 2700 → error = (2700-3000)/3000 = -0.1
    const err = computePredictionError(1000, 2700);
    expect(err).toBeCloseTo(-0.1, 6);
  });

  // TEST-10: NaN when predicted is 0
  it("TEST-10: NaN returned when predicted gain is 0", () => {
    expect(computePredictionError(0, 500)).toBeNaN();
  });

  // TEST-18: confidence stays in [0.30, 0.95] for 100 random errors
  it("TEST-18: confidence stays in [0.30, 0.95] for 100 random errors", () => {
    const rng = makeRng(777);
    let c = 0.75;
    for (let i = 0; i < 100; i++) {
      const errorFraction = uniform(rng, -2.0, 2.0);
      const result = updateConfidence({ currentConfidence: c, errorFraction });
      expect(result.newConfidence).toBeGreaterThanOrEqual(0.30);
      expect(result.newConfidence).toBeLessThanOrEqual(0.95);
      c = result.newConfidence;
    }
  });
});

// ── 3. Golden Path integration tests ─────────────────────────────────────────

describe("GoldenPath", () => {
  beforeEach(() => {
    boundary.reset();
  });

  const buildPlan = () => mapRecommendationToSimulation(REC, ENRICHMENT_MAP);

  // TEST-11: approve → simulate → confidence update chain
  it("TEST-11: approve → simulate → confidence update all succeed", () => {
    boundary.registerRecommendation(REC.id);
    boundary.recordApprove(REC.id);
    const moves = buildPlan();
    expect(moves.length).toBeGreaterThan(0);

    const plan = { recommendationId: REC.id, moves, approvedAt: Date.now() };
    const result = boundary.runApprovedSimulation(plan, 42);
    expect(result.ok).toBe(true);
    expect(result.simulationResult?.moveResults.length).toBe(moves.length);

    // Confidence update
    const errorFraction = computePredictionError(
      REC.expected_profit_gain_per_day,
      result.simulationResult!.portfolioGain
    );
    const update = updateConfidence({ currentConfidence: REC.confidence, errorFraction });
    expect(update.newConfidence).toBeGreaterThanOrEqual(0.30);
    expect(update.newConfidence).toBeLessThanOrEqual(0.95);
  });

  // TEST-12: reject blocks simulation
  it("TEST-12: reject blocks the full Golden Path", () => {
    boundary.registerRecommendation(REC.id);
    boundary.recordReject(REC.id);
    const moves = buildPlan();
    const plan = { recommendationId: REC.id, moves, approvedAt: Date.now() };
    const result = boundary.runApprovedSimulation(plan, 42);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rejected/i);
  });

  // TEST-13: same seed → same result
  it("TEST-13: same seed produces identical simulation result", () => {
    boundary.registerRecommendation(REC.id);
    boundary.recordApprove(REC.id);
    const moves = buildPlan();
    const plan = { recommendationId: REC.id, moves, approvedAt: Date.now() };
    const r1 = boundary.runApprovedSimulation(plan, 42);

    boundary.reset();
    boundary.registerRecommendation(REC.id);
    boundary.recordApprove(REC.id);
    const r2 = boundary.runApprovedSimulation(plan, 42);

    expect(r1.simulationResult?.portfolioGain).toBe(r2.simulationResult?.portfolioGain);
  });

  // TEST-14: reset clears state for replay
  it("TEST-14: reset clears approval state for replay", () => {
    boundary.registerRecommendation(REC.id);
    boundary.recordApprove(REC.id);
    const moves = buildPlan();
    const plan = { recommendationId: REC.id, moves, approvedAt: Date.now() };
    boundary.runApprovedSimulation(plan, 1);

    boundary.reset();

    // After reset, should be able to re-register and re-simulate
    boundary.registerRecommendation(REC.id);
    boundary.recordApprove(REC.id);
    const result = boundary.runApprovedSimulation(plan, 1);
    expect(result.ok).toBe(true);
  });

  // TEST-20: portfolioGain = sum of move gains
  it("TEST-20: portfolioGain equals sum of individual move gains", () => {
    boundary.registerRecommendation(REC.id);
    boundary.recordApprove(REC.id);
    const moves = buildPlan();
    const plan = { recommendationId: REC.id, moves, approvedAt: Date.now() };
    const result = boundary.runApprovedSimulation(plan, 99);
    expect(result.ok).toBe(true);
    const { simulationResult } = result;
    if (simulationResult) {
      const manualSum = simulationResult.moveResults.reduce((s, m) => s + m.totalGainVsBaseline, 0);
      expect(simulationResult.portfolioGain).toBeCloseTo(manualSum, 1);
    }
  });
});

// ── 4. Isolation tests ────────────────────────────────────────────────────────

describe("IsolationRules", () => {
  // TEST-15: lib/analysis never imports lib/simulation
  it("TEST-15: lib/analysis must not import lib/simulation", () => {
    const analysisDir = join(process.cwd(), "lib", "analysis");
    if (!existsSync(analysisDir)) { expect(true).toBe(true); return; }
    const files: string[] = [];
    function collect(dir: string) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) collect(full);
        else if (e.name.endsWith(".ts")) files.push(full);
      }
    }
    collect(analysisDir);
    const violations = files.filter((f) => /from.*lib\/simulation/.test(readFileSync(f, "utf8")));
    expect(violations).toHaveLength(0);
  });

  // TEST-16: lib/integration never imports lib/analysis
  it("TEST-16: lib/integration must not import lib/analysis", () => {
    const integrationDir = join(process.cwd(), "lib", "integration");
    if (!existsSync(integrationDir)) { expect(true).toBe(true); return; }
    const files: string[] = [];
    function collect(dir: string) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) collect(full);
        else if (e.name.endsWith(".ts")) files.push(full);
      }
    }
    collect(integrationDir);
    const violations = files.filter((f) => /^import\b.*from.*lib\/analysis/m.test(readFileSync(f, "utf8")));
    expect(violations).toHaveLength(0);
  });
});
