/**
 * M4 Simulation & Approval Tests
 *
 * Covers all required test scenarios from the task spec:
 *   1.  Deterministic replay (same seed → same result)
 *   2.  3-day horizon (exactly 3 SimDayResults per move)
 *   3.  Hidden beta factor within [0.8, 1.2]
 *   4.  8% noise bound (noiseFactor within [0.92, 1.08])
 *   5.  Day-1 50% ramp (effective spend on day 1 = baseline + 50% delta)
 *   6.  Inventory never negative
 *   7.  Reject cannot simulate
 *   8.  Simulation requires approval
 *   9.  Duplicate/conflicting action protection
 *   10. Reset/replay behavior
 *   11. Analysis → simulation isolation (lib/analysis never imports lib/simulation)
 *   12. Stale approval rejection (>5 min TTL)
 *   13. Multiple moves in one plan are all simulated
 *   14. portfolioGain is the sum of move gains
 *   15. Invalid plan input is rejected before engine runs
 *   16. Pending recommendation blocks simulation
 *   17. Already-simulated recommendation blocks duplicate simulate
 *   18. Register is idempotent
 *   19. Approve is idempotent
 *   20. Reject is idempotent
 *   21. Cannot approve a rejected recommendation
 *   22. Cannot reject after approval
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeRng, uniform } from "../seeded-rng";
import { runSimulation } from "../engine";
import { boundary } from "../boundary";
import {
  registerPending,
  approve,
  reject,
  guardSimulate,
  markSimulated,
  resetStore,
} from "../approval-store";
import type { ApprovedPlan, BudgetMove } from "../types";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// ── Test fixtures ─────────────────────────────────────────────────────────────

/** Minimal valid budget move for testing */
const MOVE_A: BudgetMove = {
  donorCampaignId: "SNK-01-META",
  receiverCampaignId: "TEE-PRM-AMAZON",
  amountPerDay: 5000,
  betaEst: 0.7,
  receiverRevenue: 80000,
  receiverSpend: 20000,
  receiverMarginRate: 0.61,
  receiverInventoryUnits: 450,
  receiverAvgDailyUnitsSold: 10,
};

const MOVE_B: BudgetMove = {
  donorCampaignId: "HOOD-01-META",
  receiverCampaignId: "TEE-PRM-GOOGLE",
  amountPerDay: 3000,
  betaEst: 0.6,
  receiverRevenue: 50000,
  receiverSpend: 15000,
  receiverMarginRate: 0.5,
  receiverInventoryUnits: 200,
  receiverAvgDailyUnitsSold: 5,
};

function makePlan(
  id: string,
  moves: BudgetMove[] = [MOVE_A],
  approvedAt = Date.now()
): ApprovedPlan {
  return { recommendationId: id, moves, approvedAt };
}

// ── 1. SEEDED RNG TESTS ───────────────────────────────────────────────────────

describe("SeededRNG", () => {
  it("produces same sequence for same seed", () => {
    const rng1 = makeRng(42);
    const rng2 = makeRng(42);
    for (let i = 0; i < 20; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it("produces different sequences for different seeds", () => {
    const rng1 = makeRng(1);
    const rng2 = makeRng(2);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it("all values are in [0, 1)", () => {
    const rng = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("uniform() stays within [min, max)", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const v = uniform(rng, 0.8, 1.2);
      expect(v).toBeGreaterThanOrEqual(0.8);
      expect(v).toBeLessThan(1.2);
    }
  });
});

// ── 2. ENGINE TESTS ───────────────────────────────────────────────────────────

describe("SimulationEngine", () => {
  // ── TEST 1: Deterministic replay ────────────────────────────────────────────
  it("TEST-1: same plan + same seed → identical result", () => {
    const plan = makePlan("rec-01");
    const r1 = runSimulation(plan, 12345);
    const r2 = runSimulation(plan, 12345);
    expect(r1).toEqual(r2);
  });

  it("TEST-1b: different seed → different result", () => {
    const plan = makePlan("rec-01");
    const r1 = runSimulation(plan, 1);
    const r2 = runSimulation(plan, 2);
    expect(r1.moveResults[0].days[0].revenue).not.toBe(
      r2.moveResults[0].days[0].revenue
    );
  });

  // ── TEST 2: 3-day horizon ──────────────────────────────────────────────────
  it("TEST-2: exactly 3 SimDayResults per move", () => {
    const plan = makePlan("rec-02");
    const result = runSimulation(plan, 42);
    expect(result.moveResults).toHaveLength(1);
    expect(result.moveResults[0].days).toHaveLength(3);
    expect(result.moveResults[0].days.map((d) => d.day)).toEqual([1, 2, 3]);
  });

  // ── TEST 3: Hidden beta factor within [0.8, 1.2] ──────────────────────────
  it("TEST-3: betaHidden is within [betaEst*0.8, betaEst*1.2] for every move+day", () => {
    for (let seed = 0; seed < 50; seed++) {
      const plan = makePlan("rec-03", [MOVE_A, MOVE_B]);
      const result = runSimulation(plan, seed);
      for (const move of result.moveResults) {
        for (const day of move.days) {
          const betaEst =
            move.receiverCampaignId === MOVE_A.receiverCampaignId
              ? MOVE_A.betaEst
              : MOVE_B.betaEst;
          expect(day.betaHidden).toBeGreaterThanOrEqual(betaEst * 0.8 - 1e-9);
          expect(day.betaHidden).toBeLessThanOrEqual(betaEst * 1.2 + 1e-9);
        }
      }
    }
  });

  // ── TEST 4: 8% noise bound ─────────────────────────────────────────────────
  it("TEST-4: noiseFactor stays within [0.92, 1.08] for every day", () => {
    for (let seed = 0; seed < 100; seed++) {
      const result = runSimulation(makePlan("rec-04"), seed);
      for (const day of result.moveResults[0].days) {
        expect(day.noiseFactor).toBeGreaterThanOrEqual(0.92 - 1e-9);
        expect(day.noiseFactor).toBeLessThanOrEqual(1.08 + 1e-9);
      }
    }
  });

  // ── TEST 5: Day-1 50% ramp ─────────────────────────────────────────────────
  it("TEST-5: Day-1 spend = baseline + 50% of amountPerDay", () => {
    const result = runSimulation(makePlan("rec-05"), 0);
    const day1 = result.moveResults[0].days[0];
    const expected = MOVE_A.receiverSpend + MOVE_A.amountPerDay * 0.5;
    expect(day1.spend).toBeCloseTo(expected, 2);
  });

  it("TEST-5b: Day-2 spend = baseline + 100% of amountPerDay", () => {
    const result = runSimulation(makePlan("rec-05b"), 0);
    const day2 = result.moveResults[0].days[1];
    const expected = MOVE_A.receiverSpend + MOVE_A.amountPerDay;
    expect(day2.spend).toBeCloseTo(expected, 2);
  });

  // ── TEST 6: Inventory never negative ──────────────────────────────────────
  it("TEST-6: inventoryUnits never goes below 0", () => {
    // Use a move with very low inventory to stress this
    const lowStockMove: BudgetMove = {
      ...MOVE_A,
      receiverInventoryUnits: 2,
      receiverAvgDailyUnitsSold: 5,
    };
    for (let seed = 0; seed < 50; seed++) {
      const result = runSimulation(makePlan("rec-06", [lowStockMove]), seed);
      for (const day of result.moveResults[0].days) {
        expect(day.inventoryUnits).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("TEST-6b: inventory depletes monotonically (never increases)", () => {
    const result = runSimulation(makePlan("rec-06b"), 0);
    const days = result.moveResults[0].days;
    expect(days[0].inventoryUnits).toBeGreaterThanOrEqual(days[1].inventoryUnits);
    expect(days[1].inventoryUnits).toBeGreaterThanOrEqual(days[2].inventoryUnits);
  });

  // ── Multi-move: portfolioGain is sum of move gains ─────────────────────────
  it("TEST-13: portfolioGain equals sum of individual move gains", () => {
    const plan = makePlan("rec-13", [MOVE_A, MOVE_B]);
    const result = runSimulation(plan, 777);
    const manualSum = result.moveResults.reduce(
      (s, m) => s + m.totalGainVsBaseline,
      0
    );
    expect(result.portfolioGain).toBeCloseTo(manualSum, 1);
  });

  // ── Multi-move: all moves simulated ───────────────────────────────────────
  it("TEST-13b: all moves produce results", () => {
    const plan = makePlan("rec-13b", [MOVE_A, MOVE_B]);
    const result = runSimulation(plan, 1);
    expect(result.moveResults).toHaveLength(2);
    expect(result.moveResults[0].receiverCampaignId).toBe(MOVE_A.receiverCampaignId);
    expect(result.moveResults[1].receiverCampaignId).toBe(MOVE_B.receiverCampaignId);
  });
});

// ── 3. APPROVAL STORE TESTS ───────────────────────────────────────────────────

describe("ApprovalStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // ── TEST 8: Simulation requires approval ───────────────────────────────────
  it("TEST-8: guardSimulate blocks pending recommendation", () => {
    registerPending("rec-pending");
    const guard = guardSimulate("rec-pending");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.status).toBe("pending");
  });

  // ── TEST 7: Reject cannot simulate ────────────────────────────────────────
  it("TEST-7: guardSimulate blocks rejected recommendation", () => {
    registerPending("rec-rej");
    reject("rec-rej");
    const guard = guardSimulate("rec-rej");
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.status).toBe("rejected");
      expect(guard.error).toMatch(/rejected/i);
    }
  });

  it("TEST-7b: cannot re-approve a rejected recommendation", () => {
    registerPending("rec-rej2");
    reject("rec-rej2");
    const result = approve("rec-rej2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rejected/i);
  });

  // ── TEST 9: Duplicate/conflicting action protection ────────────────────────
  it("TEST-9a: approve is idempotent", () => {
    registerPending("rec-idem");
    approve("rec-idem");
    const second = approve("rec-idem");
    expect(second.ok).toBe(true); // idempotent — returns existing approved
    if (second.ok) expect(second.record.status).toBe("approved");
  });

  it("TEST-9b: reject is idempotent", () => {
    registerPending("rec-idem2");
    reject("rec-idem2");
    const second = reject("rec-idem2");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.record.status).toBe("rejected");
  });

  it("TEST-9c: cannot reject after approval", () => {
    registerPending("rec-conf");
    approve("rec-conf");
    const result = reject("rec-conf");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/approved/i);
  });

  it("TEST-17: guardSimulate blocks already-simulated recommendation", () => {
    registerPending("rec-dup");
    approve("rec-dup");
    const fakeResult = runSimulation(makePlan("rec-dup"), 0);
    markSimulated("rec-dup", fakeResult);
    const guard = guardSimulate("rec-dup");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.status).toBe("simulated");
  });

  // ── TEST 18: Register idempotent ───────────────────────────────────────────
  it("TEST-18: registerPending is idempotent", () => {
    const r1 = registerPending("rec-reg");
    const r2 = registerPending("rec-reg");
    expect(r1.recommendationId).toBe(r2.recommendationId);
    expect(r1.status).toBe("pending");
    expect(r2.status).toBe("pending");
  });

  // ── Stale approval ─────────────────────────────────────────────────────────
  it("TEST-12: stale approval (>5 min) blocks simulation", () => {
    registerPending("rec-stale");
    // Manually set approved with old timestamp
    const record = registerPending("rec-stale2");
    void record;
    registerPending("rec-stale3");
    approve("rec-stale3");
    // Override actionAt to be 6 minutes ago
    const staleId = "rec-stale4";
    registerPending(staleId);
    approve(staleId);

    // Simulate the store having an old actionAt
    // We use the internal store via the exported functions; mock Date.now
    const FIVE_MIN_ONE_SEC = 5 * 60 * 1000 + 1000;
    const realNow = Date.now;
    // Approve 6 min ago by advancing the clock at simulation time
    vi.spyOn(Date, "now").mockReturnValue(realNow() + FIVE_MIN_ONE_SEC);
    try {
      const guard = guardSimulate(staleId);
      // The approval happened < FIVE_MIN_ONE_SEC ago from the real clock,
      // but Date.now is mocked to be 6 min ahead → stale
      expect(guard.ok).toBe(false);
      if (!guard.ok && guard.status) {
        expect(["stale", "approved"]).toContain(guard.status);
      }
    } finally {
      vi.spyOn(Date, "now").mockRestore();
    }
  });
});

// ── 4. BOUNDARY TESTS ─────────────────────────────────────────────────────────

describe("SimulationBoundary", () => {
  beforeEach(() => {
    boundary.reset();
  });

  // ── TEST 7: Reject cannot simulate via boundary ────────────────────────────
  it("TEST-7c: reject via boundary blocks simulate", () => {
    boundary.registerRecommendation("b-rej");
    boundary.recordReject("b-rej");
    const result = boundary.runApprovedSimulation(makePlan("b-rej"), 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rejected/i);
  });

  // ── TEST 8: Simulate requires approval via boundary ────────────────────────
  it("TEST-8b: simulate fails without prior approval", () => {
    boundary.registerRecommendation("b-pend");
    const result = boundary.runApprovedSimulation(makePlan("b-pend"), 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/approved|approval/i);
  });

  it("TEST-8c: approve then simulate succeeds", () => {
    boundary.registerRecommendation("b-ok");
    boundary.recordApprove("b-ok");
    const result = boundary.runApprovedSimulation(makePlan("b-ok"), 42);
    expect(result.ok).toBe(true);
    expect(result.status).toBe("simulated");
    expect(result.simulationResult).toBeDefined();
  });

  // ── TEST 15: Invalid plan rejected before engine runs ─────────────────────
  it("TEST-15: invalid plan rejected at boundary (zod)", () => {
    boundary.registerRecommendation("b-invalid");
    boundary.recordApprove("b-invalid");
    const badPlan = { recommendationId: "b-invalid", moves: [] }; // empty moves
    const result = boundary.runApprovedSimulation(badPlan, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it("TEST-15b: betaEst out of range rejected by zod", () => {
    boundary.registerRecommendation("b-beta");
    boundary.recordApprove("b-beta");
    const badMove = { ...MOVE_A, betaEst: 1.5 }; // out of [0.4, 0.9]
    const plan = makePlan("b-beta", [badMove]);
    const result = boundary.runApprovedSimulation(plan, 0);
    expect(result.ok).toBe(false);
  });

  // ── TEST 10: Reset/replay behavior ────────────────────────────────────────
  it("TEST-10: reset clears state and allows fresh replay", () => {
    boundary.registerRecommendation("b-reset");
    boundary.recordApprove("b-reset");
    boundary.runApprovedSimulation(makePlan("b-reset"), 1);
    // After reset, same ID can be re-registered
    boundary.reset();
    boundary.registerRecommendation("b-reset");
    boundary.recordApprove("b-reset");
    const result = boundary.runApprovedSimulation(makePlan("b-reset"), 1);
    expect(result.ok).toBe(true);
  });

  // ── TEST 1: Deterministic replay via boundary ──────────────────────────────
  it("TEST-1c: boundary produces identical results for same seed after reset", () => {
    boundary.registerRecommendation("b-det1");
    boundary.recordApprove("b-det1");
    const r1 = boundary.runApprovedSimulation(makePlan("b-det1"), 999);

    boundary.reset();
    boundary.registerRecommendation("b-det1");
    boundary.recordApprove("b-det1");
    const r2 = boundary.runApprovedSimulation(makePlan("b-det1"), 999);

    expect(r1.simulationResult?.portfolioGain).toBe(
      r2.simulationResult?.portfolioGain
    );
    expect(r1.simulationResult?.moveResults[0].days).toEqual(
      r2.simulationResult?.moveResults[0].days
    );
  });
});

// ── 5. ANALYSIS → SIMULATION ISOLATION TEST ───────────────────────────────────

describe("IsolationRule: lib/analysis must not import lib/simulation", () => {
  it("TEST-11: no file in lib/analysis/ imports from lib/simulation/", () => {
    const analysisDir = join(process.cwd(), "lib", "analysis");

    // Builder A hasn't created lib/analysis/ yet — that's fine.
    // When it exists, none of its files may import simulation.
    if (!existsSync(analysisDir)) {
      // Not yet created by Builder A — isolation trivially satisfied
      expect(true).toBe(true);
      return;
    }

    const tsFiles: string[] = [];
    function collectTs(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) collectTs(full);
        else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          tsFiles.push(full);
        }
      }
    }
    collectTs(analysisDir);

    const violations: string[] = [];
    for (const file of tsFiles) {
      const content = readFileSync(file, "utf8");
      // Match any import/require from lib/simulation
      if (/from\s+['"].*lib\/simulation/.test(content) ||
          /require\s*\(\s*['"].*lib\/simulation/.test(content)) {
        violations.push(file);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `ISOLATION VIOLATION: lib/analysis imports lib/simulation in:\n${violations.join("\n")}`
      );
    }
    expect(violations).toHaveLength(0);
  });
});
