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
import { useState, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getSnapshot(): string | null {
  try {
    return localStorage.getItem("adapt_client_outcome");
  } catch {
    return null;
  }
}
function getServerSnapshot(): string | null {
  return null;
}

interface Props {
  outcomes: Outcome[];
  currentConfidence: number;
  recommendations: Recommendation[];
}

export function LearningView({
  outcomes,
  currentConfidence,
  recommendations,
}: Props) {
  const [resetError, setResetError] = useState<string | null>(null);
  const clientStoreRaw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  let clientOutcome: Outcome | null = null;
  if (clientStoreRaw) {
    try {
      const parsed = JSON.parse(clientStoreRaw);
      if (parsed.outcome) clientOutcome = parsed.outcome;
    } catch {}
  }

  const recMap = new Map(recommendations.map((r) => [r.id, r]));

  const effectiveOutcomes = outcomes.length > 0
    ? outcomes
    : (clientOutcome && recMap.has(clientOutcome.recommendation_id) ? [clientOutcome] : []);
  async function handleReset() {
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
  }

  const view=learningView(effectiveOutcomes,recommendations,currentConfidence);
  return <><div className="host-toolbar"><span className="host-mode"><i/>Simulated outcomes · 3-day horizon</span><button className="action-secondary" onClick={handleReset}>Reset Demo</button></div>{resetError&&<p className="host-error" role="alert">{resetError}</p>}<LearningScreen data={view}/></>;
}
