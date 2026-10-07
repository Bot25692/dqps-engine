/**
 * POST /api/decide — Builder B's approval + simulation workflow endpoint.
 *
 * This is the server-side handler for the human-in-the-loop workflow:
 *   Recommendation → Human Approve/Reject → Simulate
 *
 * Actions:
 *   "approve"  — Record human approval. No simulation yet.
 *   "reject"   — Record human rejection. Simulation permanently blocked.
 *   "simulate" — Run deterministic simulation (only if previously approved).
 *
 * Security guards (all enforced by lib/simulation/boundary.ts):
 *   - Reject NEVER permits simulation
 *   - Simulation requires confirmed approval
 *   - Stale approvals (>5 min) are rejected
 *   - Duplicate simulation requests are blocked
 *   - All inputs are zod-validated before reaching the engine
 *
 * Builder A ownership: lib/analysis/, lib/db/, lib/types.ts, app/api/run-analysis/
 * This route owns ONLY: the approval/simulate workflow.
 *
 * INTEGRATION POINT [A→B]: When Builder A's recommendation engine is ready,
 * run-analysis should register the new recommendation ID via
 * boundary.registerRecommendation() before returning to the client.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { boundary } from "@/lib/simulation/boundary";

// ── Request schema ─────────────────────────────────────────────────────────────

const DecideRequestSchema = z.object({
  recommendationId: z.string().min(1, "recommendationId is required"),
  action: z.enum(["approve", "reject", "simulate", "register"]),
  /** Required for simulate action */
  seed: z.number().int().optional(),
  /** Required for simulate action — the plan to execute */
  plan: z.unknown().optional(),
});

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate request shape
  const parsed = DecideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.message },
      { status: 400 }
    );
  }

  const { recommendationId, action, seed, plan } = parsed.data;

  // Route to appropriate workflow step
  switch (action) {
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
      if (plan === undefined) {
        return Response.json(
          {
            ok: false,
            recommendationId,
            error: "plan is required for simulate action",
          },
          { status: 400 }
        );
      }

      const effectiveSeed = typeof seed === "number" ? seed : Date.now();
      const result = boundary.runApprovedSimulation(plan, effectiveSeed);
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }

    default: {
      return Response.json(
        { ok: false, error: `Unknown action: ${action}` },
        { status: 400 }
      );
    }
  }
}

// Only POST is defined — GET/PUT/DELETE return 405 automatically per Next.js docs
