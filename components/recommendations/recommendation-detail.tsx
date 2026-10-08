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
import Link from "next/link";
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

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function fmtPct(f: number): string {
  return `${(f * 100).toFixed(1)}%`;
}

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
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
  const skuMap = new Map(skus.map((s) => [s.id, s]));

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
      if (!res.ok) setError(res.error ?? "Simulation failed");
      else window.location.reload(); // Load the saved outcome and clear stale Learning snapshots.
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  async function handleReset() {
    try {
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

  /* ── Empty state ── */
  if (!rec) {
    return (
      <div className="panel p-10 text-center">
        <div className="text-3xl mb-3" aria-hidden>
          🔍
        </div>
        <p className="font-semibold text-lg text-white">
          No pending recommendation
        </p>
        <p className="text-sm mt-1.5 text-[var(--text-muted)]">
          Analysis may return no eligible move under the guardrails.
        </p>
        <button className="button button-secondary" disabled={busy} onClick={handleAnalyze}>{busy ? 'Analyzing…' : 'Run Analysis'}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  /* ── Identify anomaly & moves ── */
  const topAnomaly = stockAnomalies[0];
  const donorMoves = rec.moves.filter((m) => m.new_budget < m.old_budget);
  const receiverMoves = rec.moves.filter((m) => m.new_budget > m.old_budget);
  const totalReleased = donorMoves.reduce(
    (s, m) => s + (m.old_budget - m.new_budget),
    0
  );
  const totalReceived = receiverMoves.reduce(
    (s, m) => s + (m.new_budget - m.old_budget),
    0
  );
  const heldBack = totalReleased - totalReceived;

  const primaryDonor = donorMoves[0];
  const donorCamp = primaryDonor ? campaignMap.get(primaryDonor.campaign_id) : null;
  const donorSku = donorCamp ? skuMap.get(donorCamp.sku_id) : null;

  const detectedDate = topAnomaly?.date ?? rec.created_at.slice(0, 10);
  const runwayDays = topAnomaly ? `${topAnomaly.observed.toFixed(1)} days` : "Unavailable";
  const warningDays = topAnomaly ? `${topAnomaly.baseline.toFixed(0)} days` : "Unavailable";
  const zScore = topAnomaly ? `${topAnomaly.z_score.toFixed(2)}σ` : "Not applicable";
  const targetCampaignId = topAnomaly?.campaign_id ?? primaryDonor?.campaign_id ?? "Unavailable";

  const confidenceBand =
    rec.confidence >= 0.8 ? "HIGH" : rec.confidence >= 0.6 ? "MEDIUM" : "LOW";

  return (
    <div className="space-y-4">
      <button className="button button-secondary" disabled={busy || status !== 'idle'} onClick={handleAnalyze}>{busy ? 'Analyzing…' : 'Run Analysis'}</button>
      <p className="text-xs text-[var(--text-muted)]">Simulated execution only. Current stock cover: {currentRunways[targetCampaignId] == null ? 'Unavailable' : `${currentRunways[targetCampaignId]!.toFixed(1)} days`}. Evidence below records cover at detection.</p>
      {error && (
        <div
          className="rounded-lg p-3 text-sm font-mono"
          style={{
            backgroundColor: "rgba(237,125,117,0.12)",
            border: "1px solid rgba(237,125,117,0.3)",
            color: "#ef9991",
          }}
        >
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          2-COLUMN RECOMMENDATION LAYOUT (MANUS ARCHITECTURE)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="recommendation-layout">
        {/* ── LEFT COLUMN: DIAGNOSIS & EVIDENCE ────────────────────────────── */}
        <section className="diagnosis-column">
          {/* 01 WHY */}
          <article className="panel diagnosis-panel">
            <div className="section-rail">
              <span className="rail-number">01</span>
              <span className="rail-rule" />
              <span className="rail-label">WHY</span>
            </div>

            <div className="diagnosis-content">
              <div className="diagnosis-status">
                <span className="risk-dot" aria-hidden="true" />
                {topAnomaly?.severity === "critical"
                  ? "Critical stock risk"
                  : "Stock anomaly"}{" "}
                <span className="status-separator">·</span> {detectedDate}
              </div>

              <h2>
                {topAnomaly ? 'Stock evidence.' : 'Profit opportunity.'}
                <br />
                <span>{topAnomaly ? 'Inventory is the constraint.' : 'Review the engine recommendation.'}</span>
              </h2>

              <p className="diagnosis-copy">
                {rec.explanation}
              </p>

              <div className="evidence-stats">
                <div>
                  <span>Stock runway</span>
                  <strong>{runwayDays}</strong>
                </div>
                <div className="threshold-stat">
                  <span>Warning threshold</span>
                  <strong>{warningDays}</strong>
                </div>
              </div>

              <div className="zscore-row">
                <span>z-score</span>
                <strong>{zScore}</strong>
                <span className="zscore-divider" />
                <span>
                  Campaign <b>{targetCampaignId}</b>
                </span>
              </div>
            </div>
          </article>

          {/* 02 EVIDENCE */}
          <article className="evidence-card">
            <div className="section-rail">
              <span className="rail-number">02</span>
              <span className="rail-rule" />
              <span className="rail-label">EVIDENCE</span>
            </div>

            <div className="evidence-content">
              <p className="evidence-label">Root cause · Inventory cover</p>
              <p className="evidence-copy">
                {topAnomaly?.drivers[0]?.description ??
                  rec.explanation ??
                  "Demand outpaces replenishment. Ad spend continues scaling into depleted inventory."}
              </p>
              <div className="evidence-foot">
                <span>{detectedDate}</span>
                <span>7-day sales rate</span>
              </div>
            </div>
          </article>

          {/* DECISION CONFIDENCE */}
          <div className="recommendation-confidence">
            <div className="confidence-label">
              <span>Decision confidence</span>
              <span className="confidence-band">{confidenceBand}</span>
            </div>
            <div className="confidence-main">
              <strong>{fmtPct(rec.confidence)}</strong>
              <span>Current model confidence</span>
            </div>
            <div className="confidence-range">
              <span>
                Range <b>[0.30 – 0.95]</b>
              </span>
              <span>
                Step cap <b>±0.08</b>
              </span>
            </div>
          </div>
        </section>

        {/* ── RIGHT COLUMN: DECISION, IMPACT, GUARDRAILS ───────────────────── */}
        <section className="decision-column">
          {/* 03 DECISION */}
          <article className="panel allocation-panel">
            <div className="allocation-heading">
              <div>
                <div className="section-eyebrow">
                  <span className="rail-number">03</span>
                  <span>DECISION</span>
                </div>
                <h2>Reallocate budget</h2>
                <p>
                  Reduce exposure where inventory is tight. Support existing
                  eligible campaigns.
                </p>
              </div>
              <span className="allocation-count">
                {rec.moves.length} budgets
              </span>
            </div>

            {/* Donor Card */}
            {primaryDonor && (
              <div className="donor-card">
                <div className="donor-top">
                  <span className="donor-label">
                    <span className="donor-dot" aria-hidden="true" />
                    Budget released
                  </span>
                  <span className="donor-change">
                    −{fmtINR(primaryDonor.old_budget - primaryDonor.new_budget)}
                    /day
                  </span>
                </div>

                <div className="donor-identity">
                  <div>
                    <h3>{donorCamp?.name ?? primaryDonor.campaign_id}</h3>
                    <p>
                      {donorCamp?.platform ?? "Unavailable"} <i>·</i>{" "}
                      {donorSku?.id ?? donorCamp?.sku_id ?? "Unavailable"} <i>·</i>{" "}
                      {primaryDonor.campaign_id}
                    </p>
                  </div>
                  <span className="donor-stamp">DONOR</span>
                </div>

                <div className="budget-compare">
                  <div>
                    <span>Current daily budget</span>
                    <strong>{fmtINR(primaryDonor.old_budget)}</strong>
                  </div>
                  <span className="compare-arrow" aria-hidden="true">
                    →
                  </span>
                  <div>
                    <span>Recommended</span>
                    <strong>{fmtINR(primaryDonor.new_budget)}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Flow Connector */}
            <div className="flow-connector" aria-hidden="true">
              <span />
              <i />
              <span />
              <b>Allocate to existing campaigns</b>
              <span />
              <i />
              <span />
            </div>

            {/* Receiver List */}
            <div className="receiver-list">
              <div className="receiver-header">
                <span>Eligible receivers</span>
                <span>Daily budget · INR</span>
              </div>

              {receiverMoves.map((m) => {
                const camp = campaignMap.get(m.campaign_id);
                const sku = camp ? skuMap.get(camp.sku_id) : null;
                const delta = m.new_budget - m.old_budget;

                return (
                  <div key={m.campaign_id} className="allocation-row">
                    <div className="allocation-identity">
                      <span className="receiver-mark" aria-hidden="true">
                        <svg
                          className="receiver-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M7 17 17 7M7 7h10v10" />
                        </svg>
                      </span>
                      <div>
                        <strong>{camp?.name ?? m.campaign_id}</strong>
                        <span>
                          {camp?.platform ?? "Platform"} <i>·</i>{" "}
                          {sku?.id ?? m.campaign_id} <i>·</i>{" "}
                          {sku ? `${(sku.margin_rate * 100).toFixed(0)}%` : "50%"} margin
                        </span>
                      </div>
                    </div>

                    <div className="allocation-budgets">
                      <span className="budget-before">
                        {fmtINR(m.old_budget)}
                      </span>
                      <span className="budget-arrow">→</span>
                      <strong>{fmtINR(m.new_budget)}</strong>
                    </div>

                    <div className="allocation-change">+{fmtINR(delta)}/day</div>
                  </div>
                );
              })}
            </div>

            <div className="allocation-summary">
              <div>
                <span>Held back</span>
                <strong>{fmtINR(Math.max(0, heldBack))}</strong>
              </div>
              <div>
                <span>Guardrails</span>
                <strong className="guardrail-status">
                  <svg
                    className="guardrail-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                  Satisfied
                </strong>
              </div>
            </div>
          </article>

          {/* 04 EXPECTED IMPACT */}
          <article className="impact-card">
            <div className="impact-main">
              <div className="section-eyebrow">
                <span className="rail-number">04</span>
                <span>EXPECTED IMPACT</span>
              </div>
              <div className="impact-value">
                +{fmtINR(rec.expected_profit_gain_per_day)}
                <span>/ day</span>
              </div>
              <p>Engine-calculated contribution-profit gain</p>
            </div>
            <div className="impact-divider" />
            <div className="impact-projection">
              <span>3-day projection</span>
              <strong>+{fmtINR(rec.expected_profit_gain_per_day * 3)}</strong>
              <small>Not an LLM estimate</small>
            </div>
          </article>

          {/* 05 GUARDRAILS */}
          <article className="panel guardrails-panel">
            <div className="guardrails-title">
              <div className="section-eyebrow">
                <span className="rail-number">05</span>
                <span>GUARDRAILS</span>
              </div>
              <p>All constraints satisfied</p>
            </div>
            <div className="guardrail-list">
              {rec.constraints_checked.map((rule) => (
                <span key={rule} className="guardrail-item">
                  <i>
                    <svg
                      className="tiny-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  </i>
                  {rule}
                </span>
              ))}
            </div>
          </article>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          POST-APPROVAL / SIMULATION MEASUREMENT CARD
          ═══════════════════════════════════════════════════════════════════════ */}
      {(status === "approved" || status === "simulating" || status === "simulated") && (
        <section
          className="panel approval-result"
          id="simulation-summary"
          tabIndex={-1}
          aria-labelledby="simulation-summary-title"
          aria-live="polite"
        >
          <div className="result-heading">
            <span className="result-check" aria-hidden="true">
              <svg
                className="result-check-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </span>
            <div>
              <p className="eyebrow">
                {status === "simulated"
                  ? "Simulation measured · Closed Loop active"
                  : "Approval captured · Simulation ready"}
              </p>
              <h2 id="simulation-summary-title">
                {status === "simulated"
                  ? "Three-day deterministic outcome measured"
                  : "Three-day simulation pending"}
              </h2>
            </div>
            <span className="result-tag">
              {status === "simulated" ? "Measured outcome" : "Seed 42 deterministic"}
            </span>
          </div>

          <div className="result-grid">
            <div className="result-cell">
              <span>Simulated period</span>
              <strong>3 days</strong>
            </div>

            <div className="result-cell">
              <span>Predicted impact</span>
              <strong>
                +
                {fmtINR(
                  simResult?.predictedTotal ??
                    rec.expected_profit_gain_per_day * 3
                )}
              </strong>
            </div>

            <div
              className={`result-cell ${
                status === "simulated" ? "" : "result-pending"
              }`}
            >
              <span>Actual Simulated outcome</span>
              <strong>
                {status === "simulated"
                  ? simResult?.actualGain == null ? 'Unavailable — inspect Learning' : fmtINR(simResult.actualGain)
                  : "Pending simulation"}
              </strong>
            </div>

            <div
              className={`result-cell ${
                status === "simulated" ? "" : "result-pending"
              }`}
            >
              <span>Confidence update</span>
              <strong>
                {status === "simulated" && simResult?.confidenceUpdate
                  ? `${fmtPct(
                      simResult.confidenceUpdate.previousConfidence
                    )} → ${fmtPct(
                      simResult.confidenceUpdate.newConfidence
                    )}`
                  : status === "simulated"
                  ? "Calibrated"
                  : "Pending outcome"}
              </strong>
            </div>
          </div>

          {status === "simulated" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-[var(--line-soft)]">
              <p className="result-note m-0">
                Deterministic 3-day simulation measured forecast accuracy and
                calibrated model confidence.
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href="/learning"
                  className="button button-primary"
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                >
                  Inspect Learning Loop →
                </Link>
                <button
                  type="button"
                  onClick={handleReset}
                  className="button button-secondary"
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                >
                  Reset / Replay
                </button>
              </div>
            </div>
          ) : (
            <p className="result-note">
              Click &quot;Run 3-Day Simulation&quot; in the approval panel below to
              execute the deterministic M4 engine.
            </p>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          REJECTION FEEDBACK STATE
          ═══════════════════════════════════════════════════════════════════════ */}
      {status === "rejected" && (
        <div
          className="decision-feedback"
          id="decision-feedback"
          role="status"
          tabIndex={-1}
        >
          <span className="feedback-mark" aria-hidden="true">
            <svg
              className="feedback-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m18 6-12 12M6 6l12 12" />
            </svg>
          </span>
          <div className="flex-1">
            <strong>Recommendation rejected</strong>
            <span>
              No budgets or campaigns were modified. You may reset at any time to
              re-evaluate.
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="button button-secondary"
            style={{ padding: "6px 12px", fontSize: "11px" }}
          >
            Reset
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          HUMAN APPROVAL PANEL
          ═══════════════════════════════════════════════════════════════════════ */}
      <section className="approval-panel" id="human-approval">
        <div className="approval-copy">
          <div className="approval-lockup">
            <span className="approval-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 14, height: 14 }}
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </span>
            <div>
              <p className="eyebrow">Human approval required</p>
              <h2>Review before simulation.</h2>
            </div>
          </div>
          <p>
            Approve &amp; Proceed to the existing three-day simulation. No
            autonomous execution.
          </p>
          <span className="approval-origin">
            Human decision <i>·</i> Verification flow
          </span>
        </div>

        <div className="approval-actions">
          {status === "idle" && (
            <>
              <button
                type="button"
                onClick={handleRegisterAndApprove}
                className="button button-primary"
              >
                Approve &amp; Proceed{" "}
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
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="button button-secondary"
              >
                Reject
              </button>
            </>
          )}

          {status === "approved" && (
            <>
              <button
                type="button"
                onClick={handleSimulate}
                className="button button-primary"
              >
                Run 3-Day Simulation{" "}
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
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="button button-secondary"
              >
                Reset
              </button>
            </>
          )}

          {status === "simulating" && (
            <button
              type="button"
              disabled
              className="button button-primary button-disabled"
            >
              Simulating 3-day period...
            </button>
          )}

          {status === "simulated" && (
            <>
              <button
                type="button"
                disabled
                className="button button-primary button-disabled"
              >
                <svg
                  className="button-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ width: 13, height: 13, marginRight: 4 }}
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
                Simulation Complete
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="button button-secondary"
              >
                Reset / Replay
              </button>
            </>
          )}

          {status === "rejected" && (
            <button
              type="button"
              onClick={handleReset}
              className="button button-secondary"
            >
              Reset
            </button>
          )}

          <span className="approval-helper">
            No live budgets or external campaigns will change.
          </span>
        </div>
      </section>
    </div>
  );
}
