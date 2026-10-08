"use client";

/**
 * LearningView — Predicted vs Actual simulated contribution profit + M5 confidence.
 *
 * Implements Manus UI layout and visual architecture:
 *   - 5-step Learning loop progress header
 *   - Empty state: Orbit visual + callout
 *   - Active state: Decision observed panel with comparison grid & confidence comparison
 *   - Outcome trajectory table
 *   - Locked M5 formula panel
 *
 * All numbers from Outcome records + M4 simulation engine.
 * No hardcoded values.
 */

import type { Outcome, Recommendation } from "@/lib/types";
import { learningView } from "@/lib/presentation/manus-adapters";
import { LearningScreen } from "@/components/manus/learning/LearningScreen";
import { useRef, useState, useSyncExternalStore } from "react";
import { hasCompletedOutcome } from "@/lib/presentation/workflow-state";

interface Props {
  outcomes: Outcome[];
  currentConfidence: number;
  recommendations: Recommendation[];
  dataset?: string;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getClientSnapshot(): string | null {
  try {
    return localStorage.getItem("adapt_client_outcome");
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

export function LearningView({
  outcomes,
  currentConfidence,
  recommendations,
  dataset = "apparel",
}: Props) {
  const [resetError, setResetError] = useState<string | null>(null);
  const resetLock = useRef(false);
  const [resetting, setResetting] = useState(false);
  const rawClientStore = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  let clientRecord: {
    dataset?: string;
    recommendationId: string;
    outcome: Outcome;
    confidenceUpdate?: { newConfidence: number; accuracy: number; previousConfidence: number };
  } | null = null;

  if (rawClientStore) {
    try {
      const parsed = JSON.parse(rawClientStore);
      if (parsed.outcome && (!parsed.dataset || parsed.dataset === dataset)) {
        clientRecord = parsed;
      }
    } catch {}
  }

  // Server-validated outcomes
  const serverOutcomes = outcomes.filter(outcome =>
    recommendations.some(rec => hasCompletedOutcome(rec, outcome))
  );

  // Fall back to client storage if serverless cold-start had 0 outcomes
  const effectiveOutcomes = serverOutcomes.length > 0
    ? serverOutcomes
    : (clientRecord && recommendations.some(rec => rec.id === clientRecord.recommendationId)
        ? [clientRecord.outcome]
        : []);

  const effectiveConfidence = serverOutcomes.length > 0
    ? currentConfidence
    : (clientRecord?.confidenceUpdate?.newConfidence ?? currentConfidence);

  const effectiveRecs = recommendations.map(rec => {
    if (effectiveOutcomes.some(o => o.recommendation_id === rec.id)) {
      return { ...rec, status: 'executed' as const };
    }
    return rec;
  });

  async function handleReset() {
    if (resetLock.current) return;
    resetLock.current = true;
    setResetting(true);
    setResetError(null);
    try {
      try {
        localStorage.removeItem("adapt_client_outcome");
        sessionStorage.removeItem("adapt_client_outcome");
      } catch {}
      const response = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Reset failed');
      // Clear visited-route snapshots as well as the current Learning page.
      window.location.reload();
    } catch (error) { setResetError(error instanceof Error ? error.message : 'Reset failed'); }
    finally { resetLock.current = false; setResetting(false); }
  }

  const view = learningView(effectiveOutcomes, effectiveRecs, effectiveConfidence);
  const isApproved = effectiveRecs.some((r) => r.status === "approved");
  const isRejected = effectiveRecs.some((r) => r.status === "rejected");
  const decisionState = effectiveOutcomes.length > 0 ? "review" : isApproved ? "approved" : isRejected ? "rejected" : "review";

  return (
    <>
      <div className="host-toolbar">
        <span className="host-mode"><i />Simulated outcomes · 3-day horizon</span>
        <button className="action-secondary" onClick={handleReset} disabled={resetting}>
          {resetting ? 'Resetting…' : 'Reset Demo'}
        </button>
      </div>
      {resetError && <p className="host-error" role="alert">{resetError}</p>}
      <LearningScreen data={view} decisionState={decisionState} />
    </>
  );
}
