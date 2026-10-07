"use server";

/**
 * GET /api/analysis — Server-side endpoint to fetch the latest recommendation.
 * Returns the top recommendation from the fixture repo (DATA_SOURCE=fixtures).
 *
 * This is a lightweight read-only route for the UI to poll.
 * Full re-run is via POST /api/run-analysis.
 */

import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { ANALYSIS_AS_OF } from "@/lib/run-analysis";
import { connection } from "next/server";

export async function GET(): Promise<Response> {
  await connection();
  try {
    const repo = await getRuntimeRepo();
    const [recommendations, anomalies, campaigns, skus] = await Promise.all([
      repo.getRecommendations(),
      repo.getAnomalies(),
      repo.getCampaigns(),
      repo.getSkus(),
    ]);

    const topRec = recommendations.find((r) => r.status === "pending") ?? recommendations[0] ?? null;

    // Find stock risk anomalies for the Court Sneaker
    const stockAnomalies = anomalies.filter(
      (a) => a.metric === "stock_runway" && a.severity === "critical"
    );

    return Response.json({
      ok: true,
      asOf: ANALYSIS_AS_OF,
      topRecommendation: topRec,
      stockAnomalies: stockAnomalies.slice(0, 3),
      campaigns,
      skus,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
