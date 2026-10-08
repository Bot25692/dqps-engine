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
import { workflowStage, type WorkflowStage } from "@/lib/presentation/workflow-state";
import { presentOutcome } from "@/lib/integration/presentation";
import type { SimulationResult } from "@/lib/simulation/types";

interface Props {
  recommendation: Recommendation | null;
  stockAnomalies: Anomaly[];
  campaigns: Campaign[];
  skus: Sku[];
  outcome?: Outcome | null;
  currentRunways?: Record<string, number | null>;
  dataset?: string;
}

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
  outcome?: Outcome;
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
  dataset = "apparel",
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<WorkflowStage>(workflowStage(recommendation, outcome));
  const [simResult, setSimResult] = useState<SimulateResponse | null>(workflowStage(recommendation, outcome) === 'COMPLETED' && outcome && recommendation ? presentOutcome(outcome, recommendation) : null);
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
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.error ?? result.message ?? 'Decision request failed');
    return result;
  }

  async function handleRegisterAndApprove() {
    setError(null);
    try {
      await callDecide("register");
      const res = await callDecide("approve");
      if (res.ok) {
        setStatus("APPROVED");
        router.refresh();
      } else {
        setError(res.error ?? "Approval failed");
        
      }
    } catch (e) {
      setError(String(e));
      
    }
  }

  async function handleReject() {
    setError(null);
    try {
      await callDecide("register");
      const res = await callDecide("reject");
      if (res.ok) setStatus("REJECTED");
      else setError(res.error ?? "Rejection failed");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSimulate() {
    if (!rec || status !== 'APPROVED') return;
    setStatus('SIMULATING');
    setError(null);
    try {
      const res: SimulateResponse = await callDecide('simulate', { seed: SEED });
      if (![res.actualGain, res.predictedTotal, res.errorPct, res.confidenceUpdate?.newConfidence].every(value => typeof value === 'number' && Number.isFinite(value))) {
        throw new Error('Simulation response is incomplete. Reload to recover the saved outcome.');
      }
      setSimResult(res);
      setStatus('COMPLETED');
      try {
        const outcomeRecord: Outcome = res.outcome ?? {
          id: `${rec.id}:outcome`,
          recommendation_id: rec.id,
          created_at: new Date().toISOString(),
          predicted: res.predictedTotal!,
          actual: res.actualGain!,
          error_pct: res.errorPct!,
          horizon_days: 3,
        };
        localStorage.setItem("adapt_client_outcome", JSON.stringify({
          dataset,
          recommendationId: rec.id,
          outcome: outcomeRecord,
          confidenceUpdate: res.confidenceUpdate,
        }));
      } catch {}
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('APPROVED');
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
      setStatus("PENDING");
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
    status: status === 'COMPLETED' ? 'executed' as const
      : status === 'APPROVED' || status === 'SIMULATING' ? 'approved' as const
      : status === 'REJECTED' ? 'rejected' as const : rec.status,
  } : null;
  const view = presentationRec ? recommendationView(presentationRec,stockAnomalies,campaigns,skus,currentRunways) : null;
  return <>
    <div className="host-toolbar"><span className="host-mode"><i/>Simulated execution only · INR</span><div><button className="action-secondary" onClick={handleAnalyze} disabled={busy || status !== 'PENDING'}>{busy?'Working…':'Run Analysis'}</button><button className="action-secondary" onClick={()=>runAction(handleReset)} disabled={busy}>Reset Demo</button></div></div>
    {error&&<p className="host-error" role="alert">{error}</p>}
    {!view?<section className="host-empty"><h1>No eligible recommendation</h1><p>Run Analysis to evaluate the selected dataset. The engine may find no move that meets every guardrail.</p></section>:<RecommendationsScreen data={view} handlers={{state:status==='COMPLETED'?'simulated':status==='APPROVED'||status==='SIMULATING'?'approved':status==='REJECTED'?'rejected':'review',workflowStage:status,isBusy:busy||status==='SIMULATING',onApprove:()=>runAction(handleRegisterAndApprove),onReject:()=>runAction(handleReject),onSimulate:()=>runAction(handleSimulate),actualDisplay:simResult?.actualGain==null?undefined:`₹${simResult.actualGain.toLocaleString('en-IN',{maximumFractionDigits:0})}`,errorDisplay:simResult?.errorPct==null?undefined:`${simResult.errorPct.toFixed(1)}%`,confidenceAfterDisplay:simResult?.confidenceUpdate?`${(simResult.confidenceUpdate.newConfidence*100).toFixed(1)}%`:undefined,statusMessage:'Human approval is mandatory. No live advertising campaigns or budgets are modified.'}}/>}
  </>;
}
