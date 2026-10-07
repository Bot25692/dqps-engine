"use client";

/**
 * RecommendationDetail — Client component for the Golden Path workflow.
 *
 * Renders:
 *   1. Diagnosis — stock anomaly root cause from Builder A's detect/rootcause
 *   2. Budget Move — donor → receiver budget flow, clearly visualised
 *   3. Expected Impact — engine-calculated contribution-profit gain
 *   4. Guardrails — constraints_checked from the optimizer
 *   5. Confidence — current decision confidence
 *   6. Human Control — Approve & Simulate / Reject (human approval mandatory)
 *   7. Simulation result — 3-day deterministic outcome
 *   8. M5 Confidence update
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

const SEED = 42;

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
function fmtPct(f: number): string {
  return `${(f * 100).toFixed(1)}%`;
}

/* ─── Section wrapper ─────────────────────────────────────────────────────── */
function Section({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderLeft: `3px solid ${accent ?? "var(--border-strong)"}`,
      }}
    >
      <div
        className="px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-elevated)" }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: accent ?? "var(--text-tertiary)", letterSpacing: "0.12em" }}
        >
          {title}
        </p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/* ─── Metric chip ─────────────────────────────────────────────────────────── */
function MetricChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded p-3 flex flex-col gap-0.5"
      style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
    >
      <span style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span className="font-semibold font-mono-num" style={{ color: color ?? "var(--text-primary)", fontSize: 15 }}>
        {value}
      </span>
    </div>
  );
}

export function RecommendationDetail({ recommendation, stockAnomalies, campaigns, skus }: Props) {
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
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (res.ok) setStatus("approved");
      else { setError(res.error ?? "Approval failed"); setStatus("error"); }
    } catch (e) { setError(String(e)); setStatus("error"); }
  }

  async function handleReject() {
    setError(null);
    try {
      await callDecide("register");
      const res = await callDecide("reject");
      if (res.ok) setStatus("rejected");
      else setError(res.error ?? "Rejection failed");
    } catch (e) { setError(String(e)); }
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
    } catch (e) { setError(String(e)); setStatus("error"); }
  }

  async function handleReset() {
    const result = await callDecide("reset");
    if (!result.ok) { setError(result.error ?? "Reset failed"); return; }
    router.refresh();
    setStatus("idle");
    setSimResult(null);
    setError(null);
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  if (!rec) {
    return (
      <div
        className="rounded-lg p-10 text-center"
        style={{
          border: "1px dashed var(--border-strong)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <div className="text-3xl mb-3" aria-hidden>🔍</div>
        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>No pending recommendation</p>
        <p className="text-sm mt-1.5" style={{ color: "var(--text-tertiary)" }}>
          Run analysis via <code className="font-mono-num text-xs px-1 py-0.5 rounded" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--color-info)" }}>POST /api/run-analysis</code> to generate one.
        </p>
      </div>
    );
  }

  /* ── Anomaly context ─────────────────────────────────────────────────────── */
  const topAnomaly = stockAnomalies[0];

  /* ── Identify donor / receiver moves ─────────────────────────────────────── */
  const donorMoves = rec.moves.filter((m) => m.new_budget < m.old_budget);
  const receiverMoves = rec.moves.filter((m) => m.new_budget > m.old_budget);
  const totalReleased = donorMoves.reduce((s, m) => s + (m.old_budget - m.new_budget), 0);

  return (
    <div className="space-y-4">

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1: Diagnosis
          ═══════════════════════════════════════════════════════════════════════ */}
      {topAnomaly && (
        <Section title="1 · Diagnosis — Root Cause" accent="var(--color-problem)">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            {/* Left: anomaly details */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{
                    color: topAnomaly.severity === "critical" ? "var(--color-problem)" : "var(--color-warning)",
                    backgroundColor: topAnomaly.severity === "critical" ? "var(--color-problem-dim)" : "var(--color-warning-dim)",
                    border: `1px solid ${topAnomaly.severity === "critical" ? "var(--color-problem-muted)" : "var(--color-warning-muted)"}`,
                    letterSpacing: "0.08em",
                  }}
                >
                  {topAnomaly.severity.toUpperCase()}
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Stock Risk Detected
                </span>
              </div>

              <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                Campaign <code className="font-mono-num text-xs px-1 rounded" style={{ backgroundColor: "var(--bg-elevated)", color: "var(--color-info)" }}>{topAnomaly.campaign_id}</code> on {topAnomaly.date}
              </p>

              {/* Key evidence chips */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                <MetricChip
                  label="Stock Runway"
                  value={`${topAnomaly.observed.toFixed(1)} days`}
                  color="var(--color-problem)"
                />
                <MetricChip
                  label="Warning Threshold"
                  value={`${topAnomaly.baseline.toFixed(0)} days`}
                  color="var(--color-warning)"
                />
                <MetricChip
                  label="Z-Score"
                  value={`${topAnomaly.z_score.toFixed(2)}σ`}
                  color="var(--text-secondary)"
                />
              </div>

              {/* Root cause drivers */}
              {topAnomaly.drivers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                    Root Cause Evidence
                  </p>
                  {topAnomaly.drivers.slice(0, 4).map((d) => (
                    <div key={d.name} className="flex items-start gap-2">
                      <span style={{ color: "var(--color-problem)", fontSize: 10, marginTop: 3 }}>●</span>
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{d.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: paradox callout */}
            <div
              className="rounded-lg p-3 sm:w-52 shrink-0"
              style={{
                backgroundColor: "var(--brand-orange-glow)",
                border: "1px solid rgba(249,115,22,0.2)",
              }}
            >
              <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--brand-orange)" }}>
                ⚡ The Paradox
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {campaignMap.get(topAnomaly.campaign_id)?.name ?? topAnomaly.campaign_id} has strong ad performance — but remaining inventory cannot sustain current demand.
              </p>
              <p className="text-xs mt-2 font-semibold" style={{ color: "var(--brand-orange)" }}>
                A.D.A.P.T. optimises contribution profit, not just ROAS.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: Budget Move
          ═══════════════════════════════════════════════════════════════════════ */}
      <Section title="2 · Budget Move — Donor → Receiver" accent="var(--color-info)">
        <div className="space-y-3">
          {/* Type + explanation */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <span
                className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded mb-2"
                style={{
                  color: "var(--color-info)",
                  backgroundColor: "var(--color-info-dim)",
                  border: "1px solid var(--color-info-muted)",
                  letterSpacing: "0.06em",
                }}
              >
                {rec.type.replace(/_/g, " ").toUpperCase()}
              </span>
              {rec.explanation && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {rec.explanation}
                </p>
              )}
            </div>
          </div>

          {/* Donor rows */}
          {donorMoves.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-problem)", fontSize: 10, letterSpacing: "0.1em" }}>
                Donor (budget released)
              </p>
              <div className="space-y-2">
                {donorMoves.map((m) => {
                  const camp = campaignMap.get(m.campaign_id);
                  const sku = camp ? skuMap.get(camp.sku_id) : null;
                  const delta = m.old_budget - m.new_budget;
                  return (
                    <div
                      key={m.campaign_id}
                      className="flex items-center gap-3 rounded p-3"
                      style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                          {camp?.name ?? m.campaign_id}
                        </p>
                        <p className="text-xs font-mono-num" style={{ color: "var(--text-tertiary)" }}>
                          {m.campaign_id}{sku ? ` · SKU ${sku.id}` : ""}
                        </p>
                        {m.reason && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {m.reason}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="font-mono-num text-sm line-through" style={{ color: "var(--text-tertiary)" }}>
                            {fmtINR(m.old_budget)}
                          </span>
                          <span style={{ color: "var(--text-tertiary)" }}>→</span>
                          <span className="font-mono-num font-semibold text-sm" style={{ color: "var(--color-problem)" }}>
                            {fmtINR(m.new_budget)}
                          </span>
                        </div>
                        <p className="text-xs font-mono-num mt-0.5" style={{ color: "var(--color-problem)" }}>
                          −{fmtINR(delta)}/day released
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Flow indicator */}
          {donorMoves.length > 0 && receiverMoves.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-1">
              <div className="h-px flex-1" style={{ backgroundColor: "var(--border-subtle)" }} />
              <span
                className="text-xs font-semibold px-3 py-1 rounded-full font-mono-num"
                style={{
                  color: "var(--color-info)",
                  backgroundColor: "var(--color-info-dim)",
                  border: "1px solid var(--color-info-muted)",
                }}
              >
                ↓ {fmtINR(totalReleased)}/day reallocated ↓
              </span>
              <div className="h-px flex-1" style={{ backgroundColor: "var(--border-subtle)" }} />
            </div>
          )}

          {/* Receiver rows */}
          {receiverMoves.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-good)", fontSize: 10, letterSpacing: "0.1em" }}>
                Receiver (budget added)
              </p>
              <div className="space-y-2">
                {receiverMoves.map((m) => {
                  const camp = campaignMap.get(m.campaign_id);
                  const sku = camp ? skuMap.get(camp.sku_id) : null;
                  const delta = m.new_budget - m.old_budget;
                  return (
                    <div
                      key={m.campaign_id}
                      className="flex items-center gap-3 rounded p-3"
                      style={{ backgroundColor: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                          {camp?.name ?? m.campaign_id}
                        </p>
                        <p className="text-xs font-mono-num" style={{ color: "var(--text-tertiary)" }}>
                          {m.campaign_id}{sku ? ` · SKU ${sku.id} · margin ${fmtPct(sku.margin_rate)}` : ""}
                        </p>
                        {m.reason && (
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {m.reason}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="font-mono-num text-sm" style={{ color: "var(--text-tertiary)" }}>
                            {fmtINR(m.old_budget)}
                          </span>
                          <span style={{ color: "var(--text-tertiary)" }}>→</span>
                          <span className="font-mono-num font-semibold text-sm" style={{ color: "var(--color-good)" }}>
                            {fmtINR(m.new_budget)}
                          </span>
                        </div>
                        <p className="text-xs font-mono-num mt-0.5" style={{ color: "var(--color-good)" }}>
                          +{fmtINR(delta)}/day added
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3: Expected Impact + Guardrails + Confidence (side by side)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Expected Impact */}
        <div
          className="rounded-lg p-4 sm:col-span-1"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "3px solid var(--color-good)",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-good)", fontSize: 10, letterSpacing: "0.12em" }}>
            Expected Impact
          </p>
          <p
            className="text-3xl font-bold font-mono-num"
            style={{ color: "var(--color-good)" }}
          >
            {fmtINR(rec.expected_profit_gain_per_day)}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            contribution-profit gain / day
          </p>
          <div
            className="mt-3 pt-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <p className="text-xs font-semibold font-mono-num" style={{ color: "var(--text-secondary)" }}>
              3-day projected: {fmtINR(rec.expected_profit_gain_per_day * 3)}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
              Engine-calculated · not an LLM estimate
            </p>
          </div>
        </div>

        {/* Guardrails */}
        <div
          className="rounded-lg p-4 sm:col-span-1"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "3px solid var(--brand-orange)",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--brand-orange)", fontSize: 10, letterSpacing: "0.12em" }}>
            Guardrails Checked
          </p>
          <div className="space-y-1.5">
            {rec.constraints_checked.map((rule) => (
              <div key={rule} className="flex items-center gap-2">
                <span style={{ color: "var(--color-good)", fontSize: 11 }}>✓</span>
                <span
                  className="text-xs font-mono-num"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {rule}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Confidence */}
        <div
          className="rounded-lg p-4 sm:col-span-1"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderLeft: "3px solid var(--color-info)",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-info)", fontSize: 10, letterSpacing: "0.12em" }}>
            Decision Confidence
          </p>
          {/* Confidence gauge */}
          <div className="mb-2">
            <div className="flex items-end justify-between mb-1">
              <span className="text-3xl font-bold font-mono-num" style={{ color: "var(--text-primary)" }}>
                {fmtPct(rec.confidence)}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded font-semibold"
                style={{
                  color: rec.confidence >= 0.7 ? "var(--color-good)" : "var(--color-warning)",
                  backgroundColor: rec.confidence >= 0.7 ? "var(--color-good-dim)" : "var(--color-warning-dim)",
                  border: `1px solid ${rec.confidence >= 0.7 ? "var(--color-good-muted)" : "var(--color-warning-muted)"}`,
                }}
              >
                {rec.confidence >= 0.8 ? "HIGH" : rec.confidence >= 0.6 ? "MEDIUM" : "LOW"}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${rec.confidence * 100}%`,
                  backgroundColor: rec.confidence >= 0.7 ? "var(--color-good)" : "var(--color-warning)",
                }}
              />
            </div>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Updated by M5 learning loop after each simulation
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Range [0.30 – 0.95] · step capped ±0.08
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4: Human Approval
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderLeft: "3px solid var(--text-tertiary)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.12em" }}>
            Human Approval Required
          </p>
          <span
            className="text-xs px-2 py-0.5 rounded font-semibold"
            style={{
              color: "var(--brand-orange)",
              backgroundColor: "var(--brand-orange-glow)",
              border: "1px solid rgba(249,115,22,0.2)",
            }}
          >
            No autonomous execution
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div
            className="rounded p-3 mb-3 text-sm"
            style={{
              backgroundColor: "var(--color-problem-dim)",
              border: "1px solid var(--color-problem-muted)",
              color: "var(--color-problem)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── IDLE: Approve & Simulate / Reject ── */}
        {status === "idle" && (
          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handleRegisterAndApprove}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm transition-all duration-150"
              style={{
                color: "#ffffff",
                backgroundColor: "var(--brand-orange)",
                border: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "#ea580c";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 14px rgba(249,115,22,0.35)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--brand-orange)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              <span>✓</span>
              Approve & Proceed
            </button>
            <button
              onClick={handleReject}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded font-medium text-sm transition-all duration-150"
              style={{
                color: "var(--text-secondary)",
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--color-problem)"; (e.currentTarget as HTMLElement).style.color = "var(--color-problem)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            >
              <span>✕</span>
              Reject
            </button>
          </div>
        )}

        {/* ── APPROVED: Simulate ── */}
        {status === "approved" && (
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: "var(--color-good)" }}
            >
              <span>✓</span> Approved — ready to simulate
            </div>
            <button
              onClick={handleSimulate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded font-semibold text-sm transition-all duration-150"
              style={{
                color: "#ffffff",
                backgroundColor: "var(--brand-orange)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "#ea580c";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 14px rgba(249,115,22,0.35)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--brand-orange)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              ▶ Approve & Simulate (3-Day)
            </button>
          </div>
        )}

        {/* ── SIMULATING ── */}
        {status === "simulating" && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-info)" }}>
            <span className="inline-block w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-info)", borderTopColor: "transparent" }} />
            Running 3-day deterministic simulation (seed={SEED})…
          </div>
        )}

        {/* ── REJECTED ── */}
        {status === "rejected" && (
          <div className="flex items-center gap-3">
            <div
              className="rounded p-3 text-sm flex-1"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
            >
              Recommendation rejected. Simulation blocked — human approval is required before any simulation can run.
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded text-sm font-medium transition-colors"
              style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)"; }}
            >
              ↺ Reset
            </button>
          </div>
        )}

        {/* ── ERROR retry ── */}
        {status === "error" && (
          <button onClick={handleSimulate} className="text-sm underline" style={{ color: "var(--color-info)" }}>
            Retry simulation
          </button>
        )}

        {/* ── SIMULATED but no result ── */}
        {status === "simulated" && !simResult && (
          <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            Simulation outcome saved.{" "}
            <Link href="/learning" prefetch={false} style={{ color: "var(--color-info)" }}>
              View Learning →
            </Link>
            <button onClick={handleReset} style={{ color: "var(--text-tertiary)" }}>Reset</button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5: Simulation Result
          ═══════════════════════════════════════════════════════════════════════ */}
      {status === "simulated" && simResult?.simulationResult && (
        <Section title="5 · 3-Day Simulation Result" accent="var(--color-good)">
          <div className="space-y-4">
            {/* Top-level outcome metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div
                className="rounded p-3"
                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                  Predicted (3-day)
                </p>
                <p className="text-xl font-bold font-mono-num" style={{ color: "var(--text-primary)" }}>
                  {fmtINR(simResult.predictedTotal ?? 0)}
                </p>
              </div>
              <div
                className="rounded p-3"
                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                  Actual Simulated
                </p>
                <p className="text-xl font-bold font-mono-num" style={{ color: "var(--color-good)" }}>
                  {fmtINR(simResult.actualGain ?? 0)}
                </p>
              </div>
              <div
                className="rounded p-3"
                style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                  Prediction Error
                </p>
                <p
                  className="text-xl font-bold font-mono-num"
                  style={{
                    color: Math.abs(simResult.errorPct ?? 0) < 10
                      ? "var(--color-good)"
                      : "var(--color-warning)",
                  }}
                >
                  {simResult.errorPct !== null && simResult.errorPct !== undefined
                    ? `${simResult.errorPct.toFixed(1)}%`
                    : "N/A"}
                </p>
              </div>
            </div>

            {/* Per-move daily breakdown */}
            {simResult.simulationResult.moveResults.map((move) => {
              const camp = campaignMap.get(move.receiverCampaignId);
              return (
                <div
                  key={move.receiverCampaignId}
                  className="rounded p-3"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <p
                    className="text-sm font-semibold mb-3"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {camp?.name ?? move.receiverCampaignId}
                    <span className="ml-2 text-xs font-normal font-mono-num" style={{ color: "var(--text-tertiary)" }}>
                      seed={SEED}
                    </span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {move.days.map((day) => (
                      <div
                        key={day.day}
                        className="rounded p-2.5 text-xs"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <p className="font-semibold mb-1.5" style={{ color: "var(--text-secondary)", fontSize: 10 }}>
                          Day {day.day}
                        </p>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-tertiary)" }}>Revenue</span>
                            <span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{fmtINR(day.revenue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-tertiary)" }}>Spend</span>
                            <span className="font-mono-num" style={{ color: "var(--color-warning)" }}>{fmtINR(day.spend)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-tertiary)" }}>Contribution P.</span>
                            <span
                              className="font-mono-num font-semibold"
                              style={{ color: day.contributionProfit > 0 ? "var(--color-good)" : "var(--color-problem)" }}
                            >
                              {fmtINR(day.contributionProfit)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--text-tertiary)" }}>Inventory</span>
                            <span className="font-mono-num" style={{ color: "var(--text-secondary)" }}>{day.inventoryUnits}u</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* M5 Confidence update preview */}
            {simResult.confidenceUpdate && (
              <div
                className="rounded p-3"
                style={{
                  backgroundColor: "var(--color-info-dim)",
                  border: "1px solid var(--color-info-muted)",
                }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--color-info)", fontSize: 10, letterSpacing: "0.1em" }}>
                  M5 CONFIDENCE UPDATE
                </p>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <div>
                    <span style={{ color: "var(--text-tertiary)" }}>Previous: </span>
                    <span className="font-mono-num font-semibold" style={{ color: "var(--text-secondary)" }}>
                      {fmtPct(simResult.confidenceUpdate.previousConfidence)}
                    </span>
                  </div>
                  <span style={{ color: "var(--text-tertiary)" }}>→</span>
                  <div>
                    <span style={{ color: "var(--text-tertiary)" }}>Accuracy: </span>
                    <span className="font-mono-num font-semibold" style={{ color: "var(--text-secondary)" }}>
                      {fmtPct(simResult.confidenceUpdate.accuracy)}
                    </span>
                  </div>
                  <span style={{ color: "var(--text-tertiary)" }}>→</span>
                  <div>
                    <span style={{ color: "var(--text-tertiary)" }}>New: </span>
                    <span className="font-mono-num font-bold text-base" style={{ color: "var(--color-info)" }}>
                      {fmtPct(simResult.confidenceUpdate.newConfidence)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-1">
              <Link
                href="/learning"
                prefetch={false}
                className="inline-flex items-center gap-2 px-4 py-2 rounded font-semibold text-sm transition-all duration-150"
                style={{ color: "#ffffff", backgroundColor: "var(--brand-orange)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#ea580c";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 0 12px rgba(249,115,22,0.3)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "var(--brand-orange)";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
                }}
              >
                View Learning →
              </Link>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded text-sm font-medium transition-colors"
                style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-orange)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)"; }}
              >
                ↺ Reset Demo
              </button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
