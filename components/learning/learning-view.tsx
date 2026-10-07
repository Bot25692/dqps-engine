"use client";

/**
 * LearningView — Predicted vs Actual simulated contribution profit + confidence.
 *
 * Implements M5:
 *   - Display predicted vs actual per recommendation
 *   - Show prediction error (%)
 *   - Show confidence trajectory
 *   - Reset/replay link
 *
 * All numbers come from Builder A's Outcome records + M4 simulation.
 * No hardcoded values.
 */

import type { Outcome, Recommendation } from "@/lib/types";
import { updateConfidence, computePredictionError } from "@/lib/integration/confidence";
import Link from "next/link";

interface Props {
  outcomes: Outcome[];
  currentConfidence: number;
  recommendations: Recommendation[];
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function LearningView({ outcomes, currentConfidence, recommendations }: Props) {
  const recMap = new Map(recommendations.map((r) => [r.id, r]));

  if (outcomes.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          <p className="font-medium">No simulation outcomes yet</p>
          <p className="text-sm mt-1">
            Approve and simulate a recommendation on the{" "}
            <Link href="/recommendations" className="text-blue-600 underline">
              Recommendations page
            </Link>
            , then return here to see predicted vs. actual results.
          </p>
        </div>

        {/* Confidence panel even without outcomes */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Current Confidence</h3>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-blue-700">
              {(currentConfidence * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500">
              <p>Budget reallocation model confidence</p>
              <p className="text-xs mt-0.5">Range: 30%–95% · Updates after each simulation</p>
            </div>
          </div>
        </div>

        <div className="rounded border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-medium mb-1">M5 Confidence Update Formula</p>
          <p className="font-mono text-xs">
            accuracy = max(0, 1 − |error|)
          </p>
          <p className="font-mono text-xs">
            c_new = c + 0.3 × (accuracy − c)   [step capped ±0.08, range 0.30–0.95]
          </p>
        </div>
      </div>
    );
  }

  // Compute confidence trajectory from outcomes
  let runningConfidence = currentConfidence;
  const trajectory = outcomes
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((outcome) => {
      const rec = recMap.get(outcome.recommendation_id);
      const errorFraction = outcome.error_pct / 100;
      const update = updateConfidence({
        currentConfidence: runningConfidence,
        errorFraction,
      });
      runningConfidence = update.newConfidence;
      return { outcome, rec, update, errorFraction };
    });

  const latestUpdate = trajectory.at(-1);

  return (
    <div className="space-y-6">
      {/* ── Confidence overview ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Starting Confidence</p>
          <p className="text-2xl font-bold text-gray-800">
            {(currentConfidence * 100).toFixed(1)}%
          </p>
        </div>
        {latestUpdate && (
          <>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500 mb-1">Latest Accuracy</p>
              <p className="text-2xl font-bold text-blue-700">
                {(latestUpdate.update.accuracy * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs text-blue-600 mb-1">Updated Confidence</p>
              <p className="text-2xl font-bold text-blue-900">
                {(latestUpdate.update.newConfidence * 100).toFixed(1)}%
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Outcome table ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Prediction vs. Simulation Outcomes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-500 text-left text-xs">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Recommendation</th>
                <th className="px-4 py-2 font-medium text-right">Predicted (3-day)</th>
                <th className="px-4 py-2 font-medium text-right">Actual</th>
                <th className="px-4 py-2 font-medium text-right">Error</th>
                <th className="px-4 py-2 font-medium text-right">Accuracy</th>
                <th className="px-4 py-2 font-medium text-right">Confidence →</th>
              </tr>
            </thead>
            <tbody>
              {trajectory.map(({ outcome, rec, update }) => {
                const isGoodError = Math.abs(outcome.error_pct) < 10;
                return (
                  <tr key={outcome.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {outcome.created_at.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {rec?.explanation?.slice(0, 60) ?? outcome.recommendation_id}
                      {(rec?.explanation?.length ?? 0) > 60 ? "…" : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatINR(outcome.predicted)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatINR(outcome.actual)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        isGoodError ? "text-green-700" : "text-amber-600"
                      }`}
                    >
                      {outcome.error_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {(update.accuracy * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-blue-700">
                      {(update.newConfidence * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Formula display ────────────────────────────────────────────────── */}
      <div className="rounded border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium mb-1">Confidence Update Formula (CONTEXT.md §Locked)</p>
        <p className="font-mono text-xs">accuracy = max(0, 1 − |error_fraction|)</p>
        <p className="font-mono text-xs">c_new = c + 0.3 × (accuracy − c)</p>
        <p className="text-xs mt-1 text-gray-400">Step capped ±0.08 · Range [0.30, 0.95]</p>
      </div>

      {/* ── Reset link ─────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <Link
          href="/recommendations"
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors"
        >
          ← Back to Recommendations
        </Link>
      </div>
    </div>
  );
}
