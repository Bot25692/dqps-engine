"use client";

/**
 * RecommendationDetail — Client component for the Golden Path workflow.
 *
 * Renders:
 *   1. Diagnosis section (stock anomaly root cause)
 *   2. Recommendation card (Builder A optimizer output)
 *   3. Approve / Reject controls
 *   4. Simulate button (only after approval)
 *   5. Simulation result preview with predicted vs. actual
 *
 * All financial numbers come from Builder A's recommendation output.
 * No LLM-generated values. No hardcoded numbers.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Recommendation, Anomaly, Campaign, Sku } from "@/lib/types";
import type { SimulationResult } from "@/lib/simulation/types";

interface Props {
  recommendation: Recommendation | null;
  stockAnomalies: Anomaly[];
  campaigns: Campaign[];
  skus: Sku[];
}

type WorkflowStatus = "idle" | "registered" | "approved" | "rejected" | "simulating" | "simulated" | "error";

interface SimulateResponse {
  ok: boolean;
  status?: string;
  simulationResult?: SimulationResult;
  predictedGainPerDay?: number;
  predictedTotal?: number;
  actualGain?: number;
  errorPct?: number | null;
  confidenceUpdate?: {
    previousConfidence: number;
    accuracy: number;
    newConfidence: number;
  } | null;
  error?: string;
}

const SEED = 42; // Fixed demo seed for deterministic replay

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function RecommendationDetail({
  recommendation,
  stockAnomalies,
  campaigns,
  skus,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<WorkflowStatus>(recommendation?.status === "executed" ? "simulated" : recommendation?.status === "approved" ? "approved" : recommendation?.status === "rejected" ? "rejected" : "idle");
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rec = recommendation;
  const recId = rec?.id ?? "no-recommendation";

  // ── Build campaign lookup maps ──────────────────────────────────────────────
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
  const skuMap = new Map(skus.map((s) => [s.id, s]));

  // ── API calls ───────────────────────────────────────────────────────────────
  async function callDecide(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recommendationId: recId, action, ...extra }),
    });
    return res.json();
  }

  async function handleRegisterAndApprove() {
    setError(null);
    try {
      await callDecide("register");
      const res = await callDecide("approve");
      if (res.ok) {
        setStatus("approved");
      } else {
        setError(res.error ?? "Approval failed");
        setStatus("error");
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  async function handleReject() {
    setError(null);
    try {
      await callDecide("register");
      const res = await callDecide("reject");
      if (res.ok) {
        setStatus("rejected");
      } else {
        setError(res.error ?? "Rejection failed");
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSimulate() {
    if (!rec) return;
    setStatus("simulating");
    setError(null);

    try {
      const res: SimulateResponse = await callDecide("simulate", {
        seed: SEED,
      });

      setSimResult(res);
      setStatus(res.ok ? "simulated" : "error");
      if (!res.ok) setError(res.error ?? "Simulation failed");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  async function handleReset() {
    const result = await callDecide("reset");
    if (!result.ok) { setError(result.error ?? "Reset failed"); return; }
    router.refresh();
    setStatus("idle");
    setSimResult(null);
    setError(null);
  }

  // ── No recommendation ────────────────────────────────────────────────────────
  if (!rec) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
        <p className="font-medium">No pending recommendation</p>
        <p className="text-sm mt-1">Run analysis via POST /api/run-analysis to generate one.</p>
      </div>
    );
  }

  // ── Anomaly context ──────────────────────────────────────────────────────────
  const topAnomaly = stockAnomalies[0];

  return (
    <div className="space-y-6">
      {/* ── Diagnosis ─────────────────────────────────────────────────────── */}
      {topAnomaly && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-red-800">Stock Risk Detected</h3>
              <p className="text-sm text-red-700 mt-1">
                Campaign: <span className="font-mono">{topAnomaly.campaign_id}</span> —{" "}
                {topAnomaly.date}
              </p>
              <p className="text-sm text-red-700">
                Stock runway: <strong>{topAnomaly.observed.toFixed(1)} days</strong>{" "}
                (warning threshold: {topAnomaly.baseline.toFixed(0)} days)
              </p>
              {topAnomaly.drivers.length > 0 && (
                <div className="mt-2 space-y-1">
                  {topAnomaly.drivers.slice(0, 3).map((d) => (
                    <p key={d.name} className="text-xs text-red-600">
                      • {d.description}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded ${
                topAnomaly.severity === "critical"
                  ? "bg-red-200 text-red-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {topAnomaly.severity.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* ── Recommendation card ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Budget Reallocation Recommendation
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">ID: {rec.id}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Expected daily gain</p>
            <p className="text-2xl font-bold text-green-700">
              {formatINR(rec.expected_profit_gain_per_day)}
            </p>
            <p className="text-xs text-gray-400">Confidence: {formatPct(rec.confidence)}</p>
          </div>
        </div>

        <p className="text-sm text-gray-700 mb-4 border-l-4 border-blue-300 pl-3">
          {rec.explanation}
        </p>

        {/* Moves table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500 text-left">
                <th className="pb-2 pr-4 font-medium">Campaign</th>
                <th className="pb-2 pr-4 font-medium">Platform</th>
                <th className="pb-2 pr-4 font-medium">SKU</th>
                <th className="pb-2 pr-4 font-medium text-right">Old Budget/day</th>
                <th className="pb-2 pr-4 font-medium text-right">New Budget/day</th>
                <th className="pb-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rec.moves.map((move) => {
                const campaign = campaignMap.get(move.campaign_id);
                const sku = campaign ? skuMap.get(campaign.sku_id) : undefined;
                const isDonor = move.new_budget < move.old_budget;
                const delta = move.new_budget - move.old_budget;
                return (
                  <tr key={move.campaign_id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{campaign?.name ?? move.campaign_id}</td>
                    <td className="py-2 pr-4 text-gray-500 capitalize">{campaign?.platform ?? "—"}</td>
                    <td className="py-2 pr-4 text-gray-500">{sku?.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono">{formatINR(move.old_budget)}</td>
                    <td className="py-2 pr-4 text-right font-mono font-semibold">
                      {formatINR(move.new_budget)}
                    </td>
                    <td className="py-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          isDonor
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {isDonor ? `Donor (${formatINR(delta)}/day)` : `Receiver (+${formatINR(delta)}/day)`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Constraints */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rec.constraints_checked.map((rule) => (
            <span
              key={rule}
              className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono"
            >
              ✓ {rule}
            </span>
          ))}
        </div>
      </div>

      {/* ── Approval workflow ─────────────────────────────────────────────── */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {status === "error" && <button onClick={handleSimulate} className="text-blue-600 underline">Retry Simulated execution</button>}
      {status === "simulated" && !simResult && <div>Simulated outcome saved. <Link href="/learning" prefetch={false}>View Learning</Link> · <button onClick={handleReset}>Reset Demo</button></div>}

      {status === "idle" && (
        <div className="flex gap-3">
          <button
            onClick={handleRegisterAndApprove}
            className="px-4 py-2 bg-green-600 text-white rounded font-medium text-sm hover:bg-green-700 transition-colors"
          >
            ✓ Approve & Proceed to Simulation
          </button>
          <button
            onClick={handleReject}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            ✗ Reject
          </button>
        </div>
      )}

      {status === "approved" && (
        <div className="flex items-center gap-3">
          <div className="text-sm text-green-700 font-medium">
            ✓ Approved — ready to simulate
          </div>
          <button
            onClick={handleSimulate}
            className="px-4 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors"
          >
            ▶ Run 3-Day Simulation
          </button>
        </div>
      )}

      {status === "rejected" && (
        <div className="rounded border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
          Recommendation rejected. Simulation blocked.{" "}
          <button onClick={handleReset} className="text-blue-600 underline ml-1">
            Reset
          </button>
        </div>
      )}

      {status === "simulating" && (
        <div className="text-sm text-blue-600 animate-pulse">Running simulation…</div>
      )}

      {/* ── Simulation result ─────────────────────────────────────────────── */}
      {status === "simulated" && simResult?.simulationResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-4">
          <div className="flex items-start justify-between">
            <h3 className="font-semibold text-blue-900">3-Day Simulation Result</h3>
            <span className="text-xs text-blue-600 font-mono">seed={SEED}</span>
          </div>

          {/* Predicted vs Actual */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded p-3 border border-blue-100">
              <p className="text-xs text-gray-500">Predicted (3 days)</p>
              <p className="text-xl font-bold text-gray-800">
                {formatINR(simResult.predictedTotal ?? 0)}
              </p>
            </div>
            <div className="bg-white rounded p-3 border border-blue-100">
              <p className="text-xs text-gray-500">Actual Simulated</p>
              <p className="text-xl font-bold text-gray-800">
                {formatINR(simResult.actualGain ?? 0)}
              </p>
            </div>
            <div className="bg-white rounded p-3 border border-blue-100">
              <p className="text-xs text-gray-500">Prediction Error</p>
              <p
                className={`text-xl font-bold ${
                  Math.abs(simResult.errorPct ?? 0) < 10 ? "text-green-700" : "text-amber-600"
                }`}
              >
                {simResult.errorPct !== null && simResult.errorPct !== undefined
                  ? `${simResult.errorPct.toFixed(1)}%`
                  : "N/A"}
              </p>
            </div>
          </div>

          {/* Daily breakdown */}
          {simResult.simulationResult.moveResults.map((move) => {
            const campaign = campaignMap.get(move.receiverCampaignId);
            return (
              <div key={move.receiverCampaignId} className="bg-white rounded border border-blue-100 p-3">
                <p className="text-sm font-medium mb-2">
                  {campaign?.name ?? move.receiverCampaignId}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {move.days.map((day) => (
                    <div key={day.day} className="text-xs">
                      <p className="text-gray-500 font-medium">Day {day.day}</p>
                      <p>Revenue: <span className="font-mono">{formatINR(day.revenue)}</span></p>
                      <p>Spend: <span className="font-mono">{formatINR(day.spend)}</span></p>
                      <p>CP: <span className={`font-mono ${day.contributionProfit > 0 ? "text-green-700" : "text-red-600"}`}>{formatINR(day.contributionProfit)}</span></p>
                      <p>Inventory: <span className="font-mono">{day.inventoryUnits}</span> units</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Confidence update */}
          {simResult.confidenceUpdate && (
            <div className="bg-white rounded border border-blue-100 p-3 text-sm">
              <p className="font-medium mb-1 text-gray-800">Confidence Update (M5)</p>
              <div className="flex gap-4 text-gray-600">
                <span>Previous: {formatPct(simResult.confidenceUpdate.previousConfidence)}</span>
                <span>Accuracy: {formatPct(simResult.confidenceUpdate.accuracy)}</span>
                <span className="font-semibold text-blue-700">
                  New: {formatPct(simResult.confidenceUpdate.newConfidence)}
                </span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <Link
              href="/learning" prefetch={false}
              className="px-4 py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors"
            >
              View Learning →
            </Link>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors"
            >
              ↺ Reset Demo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
