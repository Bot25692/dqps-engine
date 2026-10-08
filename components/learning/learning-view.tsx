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
import { presentOutcome } from "@/lib/integration/presentation";
import Link from "next/link";
import { useState } from "react";

interface Props {
  outcomes: Outcome[];
  currentConfidence: number;
  recommendations: Recommendation[];
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function fmtPct(f: number): string {
  return `${(f * 100).toFixed(1)}%`;
}

export function LearningView({
  outcomes,
  currentConfidence,
  recommendations,
}: Props) {
  const [resetError, setResetError] = useState<string | null>(null);
  const recMap = new Map(recommendations.map((r) => [r.id, r]));

  const steps = [
    "Predict impact",
    "Approve & Simulate",
    "Observe outcome",
    "Measure error",
    "Update confidence",
  ];

  const hasOutcomes = outcomes.length > 0;

  /* ── Compute confidence trajectory ── */
  const trajectory = outcomes
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((outcome) => {
      const rec = recMap.get(outcome.recommendation_id);
      const update = presentOutcome(outcome, rec ?? { confidence: 0.75 } as Recommendation).confidenceUpdate;
      return { outcome, rec, update };
    });

  const latest = trajectory[trajectory.length - 1];

  async function handleReset() {
    setResetError(null);
    try {
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

  return (
    <div className="space-y-4">
      {resetError && <p role="alert">{resetError}</p>}
      {/* ── 1. Learning Steps Progress Header ── */}
      <section className="learning-steps" aria-label="Learning loop">
        {steps.map((step, index) => {
          const isComplete = hasOutcomes
            ? true
            : index === 0;
          const isCurrent = hasOutcomes ? index === 4 : index === 1;

          return (
            <div
              key={step}
              className={`learning-step ${isCurrent ? "is-current" : ""} ${
                isComplete ? "is-complete" : ""
              }`}
              style={{ "--step": index } as React.CSSProperties}
            >
              <span className="step-marker">
                {isComplete && hasOutcomes ? (
                  <svg
                    className="step-check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 11, height: 11 }}
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                ) : (
                  `0${index + 1}`
                )}
              </span>
              <span className="step-label">{step}</span>
              {index < steps.length - 1 && (
                <span className="step-connector" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </section>

      {/* ── 2. Observation State (Empty vs Active) ── */}
      {!hasOutcomes ? (
        <section className="empty-learning panel">
          <div className="empty-orbit" aria-hidden="true">
            <span className="orbit-ring ring-one" />
            <span className="orbit-ring ring-two" />
            <span className="orbit-center">
              <svg
                className="empty-book"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 22, height: 22 }}
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                <path d="M9 7h6M9 11h6" />
              </svg>
            </span>
            <span className="orbit-node node-one" />
            <span className="orbit-node node-two" />
            <span className="orbit-node node-three" />
          </div>

          <div className="empty-copy">
            <div className="panel-kicker">
              <span className="kicker-line" aria-hidden="true" />
              Closed-loop learning
            </div>
            <h2>No simulation outcomes yet.</h2>
            <p>
              Approve and simulate a recommendation to begin the existing learning
              loop. Confidence updates only after the outcome is measured.
            </p>
            <div>
              <Link
                href="/recommendations"
                className="button button-secondary"
              >
                Review recommendation{" "}
                <svg
                  className="button-arrow"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel learning-observation">
          <div className="observation-heading">
            <div>
              <div className="panel-kicker">
                <span className="kicker-line" aria-hidden="true" />
                Decision observed
              </div>
              <h2>Prediction vs simulation measured.</h2>
              <p>
                Three-day simulation state · deterministic outcome captured
              </p>
            </div>
            <span className="observation-tag">Closed Loop Active</span>
          </div>

          {/* Comparison Cards */}
          <div className="comparison-grid">
            <article className="comparison-card predicted-card">
              <span className="comparison-label">
                Predicted contribution-profit impact
              </span>
              <strong>+{fmtINR(latest.outcome.predicted)}</strong>
              <small>Engine-calculated · 3 days</small>
            </article>

            <article className="comparison-card actual-card">
              <span className="comparison-label">Actual simulated outcome</span>
              <strong>{fmtINR(latest.outcome.actual)}</strong>
              <small>Deterministic simulation · 3 days</small>
            </article>
          </div>

          {/* Confidence Comparison Bar */}
          <div className="confidence-comparison">
            <div>
              <span>Confidence before</span>
              <strong>{fmtPct(latest.update.previousConfidence)}</strong>
            </div>
            <span className="confidence-arrow" aria-hidden="true">
              →
            </span>
            <div>
              <span>Confidence after</span>
              <strong className="pending-value" style={{ color: "var(--cyan)" }}>
                {fmtPct(latest.update.newConfidence)}
              </strong>
            </div>
            <div className="error-value">
              <span>Measured error</span>
              <strong
                style={{
                  color:
                    Math.abs(latest.outcome.error_pct) < 10
                      ? "var(--green)"
                      : "var(--amber)",
                }}
              >
                {latest.outcome.error_pct.toFixed(1)}%
              </strong>
            </div>
          </div>

          <p className="measurement-note">
            The engine measured forecast error after simulation and recalibrated its
            confidence weight for future decisions.
          </p>
        </section>
      )}

      {/* ── 3. Outcome Trajectory Table (When Outcomes Exist) ── */}
      {hasOutcomes && (
        <section className="panel" style={{ padding: "18px 20px" }}>
          <div className="table-topline">
            <div>
              <div className="panel-kicker">
                <span className="kicker-line" aria-hidden="true" />
                Historical outcomes
              </div>
              <h2 style={{ margin: "6px 0 0", fontSize: 16 }}>
                Prediction vs Simulation History
              </h2>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="button button-secondary"
              style={{ padding: "5px 10px", fontSize: "10px" }}
            >
              Reset / Replay
            </button>
          </div>

          <div
            className="table-scroll"
            role="region"
            aria-label="Simulation outcomes table"
            tabIndex={0}
          >
            <table className="campaign-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Recommendation</th>
                  <th scope="col" className="numeric-col">Predicted (3d)</th>
                  <th scope="col" className="numeric-col">Actual</th>
                  <th scope="col" className="numeric-col">Error</th>
                  <th scope="col" className="numeric-col">Accuracy</th>
                  <th scope="col" className="numeric-col">New Confidence</th>
                </tr>
              </thead>
              <tbody>
                {trajectory.map(({ outcome, rec, update }, index) => {
                  const isGood = Math.abs(outcome.error_pct) < 10;
                  return (
                    <tr
                      key={outcome.id}
                      style={{ "--row-index": index } as React.CSSProperties}
                    >
                      <td>
                        <span className="row-indicator" aria-hidden="true" />
                        <span className="font-mono-num text-xs">
                          {outcome.created_at.slice(0, 10)}
                        </span>
                      </td>
                      <td>
                        <span className="campaign-name">
                          {rec?.explanation?.slice(0, 50) ?? outcome.recommendation_id}
                          {(rec?.explanation?.length ?? 0) > 50 ? "…" : ""}
                        </span>
                      </td>
                      <td className="numeric-col">
                        <span className="font-mono-num">
                          {fmtINR(outcome.predicted)}
                        </span>
                      </td>
                      <td className="numeric-col">
                        <span
                          className="font-mono-num font-semibold"
                          style={{ color: "var(--green)" }}
                        >
                          {fmtINR(outcome.actual)}
                        </span>
                      </td>
                      <td className="numeric-col">
                        <span
                          className="font-mono-num font-semibold"
                          style={{
                            color: isGood ? "var(--green)" : "var(--amber)",
                          }}
                        >
                          {outcome.error_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="numeric-col">
                        <span className="font-mono-num">
                          {fmtPct(update.accuracy)}
                        </span>
                      </td>
                      <td className="numeric-col">
                        <span
                          className="budget-value"
                          style={{ color: "var(--cyan)" }}
                        >
                          {fmtPct(update.newConfidence)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 4. Locked M5 Formula & Confidence Model Panel ── */}
      <section className="model-panel panel">
        <div className="model-heading">
          <div>
            <div className="panel-kicker">
              <span className="kicker-line" aria-hidden="true" />
              Confidence model
            </div>
            <h2>Budget reallocation learning model</h2>
          </div>
          <span className="model-confidence font-mono-num">
            {fmtPct(currentConfidence)}
          </span>
        </div>

        <div className="model-details">
          <div className="model-detail">
            <span>Confidence range</span>
            <strong>[0.30 – 0.95]</strong>
          </div>
          <div className="model-detail">
            <span>Update step</span>
            <strong>0.3 × (accuracy − c)</strong>
          </div>
          <div className="model-detail">
            <span>Maximum step</span>
            <strong>±0.08</strong>
          </div>
        </div>

        <div className="formula-block">
          <span>LOCKED M5 FORMULA</span>
          <code>accuracy = max(0, 1 − |error_fraction|)</code>
          <code>c_new = c + 0.3 × (accuracy − c)</code>
          <small>
            step cap ±0.08 <span>·</span> range [0.30, 0.95]
          </small>
        </div>
      </section>
    </div>
  );
}
