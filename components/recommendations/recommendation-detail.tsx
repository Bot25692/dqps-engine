"use client";

/**
 * RecommendationDetail — Client component for the Golden Path workflow.
 *
 * Implements Manus UI layout and visual architecture:
 *   - 2-Column layout:
 *     Left (Diagnosis): 01 WHY, 02 EVIDENCE, Decision Confidence
 *     Right (Decision): 03 DECISION (Donor card, Flow connector, Receiver list),
 *                       04 EXPECTED IMPACT, 05 GUARDRAILS
 *   - Post-Approval Simulation Result card (Predicted vs Actual, Error, Confidence after)
 *   - Persistent Human Approval bar with interactive state machine
 *
 * All financial numbers come from recommendation output and simulation engine.
 * No LLM-generated values. No hardcoded mock values.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecommendationsScreen } from "@/components/manus/recommendations/RecommendationsScreen";
import { recommendationView } from "@/lib/presentation/manus-adapters";
import type { Recommendation, Anomaly, Campaign, Sku, Outcome } from "@/lib/types";
import { presentOutcome } from "@/lib/integration/presentation";
import type { SimulationResult } from "@/lib/simulation/types";

interface Props {
  recommendation: Recommendation | null;
  stockAnomalies: Anomaly[];
  campaigns: Campaign[];
  skus: Sku[];
  outcome?: Outcome | null;
  currentRunways?: Record<string, number | null>;
}

type WorkflowStatus =
  | "idle"
  | "registered"
  | "approved"
  | "rejected"
  | "simulating"
  | "simulated"
  | "error";

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

const SEED = 42;


export function RecommendationDetail({
  recommendation,
  stockAnomalies,
  campaigns,
  skus,
  outcome,
  currentRunways = {},
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<WorkflowStatus>(
    recommendation?.status === "executed"
      ? "simulated"
      : recommendation?.status === "approved"
      ? "approved"
      : recommendation?.status === "rejected"
      ? "rejected"
      : "idle"
  );
  const [simResult, setSimResult] = useState<SimulateResponse | null>(outcome && recommendation ? presentOutcome(outcome, recommendation) : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAnalyze() {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/run-analysis', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Analysis failed');
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Analysis failed'); }
    finally { setBusy(false); }
  }

  const rec = recommendation;
  const recId = rec?.id ?? "no-recommendation";

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
      if (res.ok) setStatus("rejected");
      else setError(res.error ?? "Rejection failed");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSimulate() {
    if (!rec) return;
    setStatus("simulating");
    setError(null);
    try {
      const res: SimulateResponse = await callDecide("simulate", { seed: SEED });
      setSimResult(res);
      setStatus(res.ok ? "simulated" : "error");
      if (!res.ok) {
        setError(res.error ?? "Simulation failed");
      } else {
        try {
          const outcomeRecord = {
            id: `${rec.id}:outcome`,
            recommendation_id: rec.id,
            created_at: new Date(res.simulationResult?.simulatedAt || Date.now()).toISOString(),
            predicted: res.predictedTotal ?? rec.expected_profit_gain_per_day * 3,
            actual: res.actualGain ?? 0,
            error_pct: res.errorPct ?? 0,
            horizon_days: 3,
          };
          localStorage.setItem("adapt_client_outcome", JSON.stringify({
            outcome: outcomeRecord,
            confidenceUpdate: res.confidenceUpdate,
            simulationResult: res.simulationResult,
          }));
        } catch {}
        window.location.reload(); // Load the saved outcome and clear stale Learning snapshots.
      }
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  async function handleReset() {
    try {
      try {
        localStorage.removeItem("adapt_client_outcome");
        sessionStorage.removeItem("adapt_client_outcome");
      } catch {}
      const result = await callDecide("reset");
      if (!result.ok) {
        setError(result.error ?? "Reset failed");
        return;
      }
      window.location.reload(); // Reset invalidates every visited workflow page.
      setStatus("idle");
      setSimResult(null);
      setError(null);
    } catch (error) { setError(error instanceof Error ? error.message : 'Reset failed'); }
  }

  // Preserve the host lifecycle; Manus callbacks cannot create financial decisions.
  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  }
  // Approval updates locally before a server refresh; keep the progress ribbon
  // in sync with the same confirmed lifecycle state as the action controls.
  const presentationRec = rec ? {
    ...rec,
    status: status === 'simulated' ? 'executed' as const
      : status === 'approved' || status === 'simulating' ? 'approved' as const
      : status === 'rejected' ? 'rejected' as const : rec.status,
  } : null;
  const view = presentationRec ? recommendationView(presentationRec,stockAnomalies,campaigns,skus,currentRunways) : null;
  return <>
    <div className="host-toolbar"><span className="host-mode"><i/>Simulated execution only · INR</span><div><button className="action-secondary" onClick={handleAnalyze} disabled={busy || status !== 'idle'}>{busy?'Working…':'Run Analysis'}</button><button className="action-secondary" onClick={()=>runAction(handleReset)} disabled={busy}>Reset Demo</button></div></div>
    {error&&<p className="host-error" role="alert">{error}</p>}
    {!view?<section className="host-empty"><h1>No eligible recommendation</h1><p>Run Analysis to evaluate the selected dataset. The engine may find no move that meets every guardrail.</p></section>:<RecommendationsScreen data={view} handlers={{state:status==='simulated'?'simulated':status==='approved'||status==='simulating'?'approved':status==='rejected'?'rejected':'review',isBusy:busy||status==='simulating',onApprove:()=>runAction(handleRegisterAndApprove),onReject:()=>runAction(handleReject),onSimulate:()=>runAction(handleSimulate),actualDisplay:simResult?.actualGain==null?undefined:`₹${simResult.actualGain.toLocaleString('en-IN',{maximumFractionDigits:0})}`,confidenceAfterDisplay:simResult?.confidenceUpdate?`${(simResult.confidenceUpdate.newConfidence*100).toFixed(1)}%`:undefined,statusMessage:'Human approval is mandatory. No live advertising campaigns or budgets are modified.'}}/>}
  </>;
}
