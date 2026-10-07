"use client";

/**
 * LearningView — Predicted vs Actual simulated contribution profit + M5 confidence.
 *
 * Visualises:
 *   - Predict → Observe → Measure Error → Update Confidence loop
 *   - Predicted vs actual per recommendation
 *   - Prediction error %
 *   - Confidence trajectory (before → after)
 *   - Reset/replay link
 *
 * All numbers from Builder A's Outcome records + M4 simulation engine.
 * No hardcoded values.
 */

import type { Outcome, Recommendation } from "@/lib/types";
import { updateConfidence } from "@/lib/integration/confidence";
import Link from "next/link";

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

/* ─── Closed-loop step pill ───────────────────────────────────────────────── */
function LoopStep({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-semibold"
      style={{
        color: active ? "#ffffff" : "var(--text-secondary)",
        backgroundColor: active ? "var(--brand-orange)" : "var(--bg-elevated)",
        border: active ? "1px solid transparent" : "1px solid var(--border-default)",
      }}
    >
      {label}
    </span>
  );
}

export function LearningView({ outcomes, currentConfidence, recommendations }: Props) {
  const recMap = new Map(recommendations.map((r) => [r.id, r]));

  /* ── Closed-loop diagram ── */
  const loopSteps = ["Predict", "Approve & Simulate", "Observe", "Measure Error", "Update Confidence"];

  /* ── Empty state ── */
  if (outcomes.length === 0) {
    return (
      <div className="space-y-4">
        {/* Loop diagram */}
        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.12em" }}>
            A.D.A.P.T. Learning Loop
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {loopSteps.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <LoopStep label={step} />
                {i < loopSteps.length - 1 && (
                  <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>→</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Empty + confidence */}
        <div
          className="rounded-lg p-8 text-center"
          style={{ border: "1px dashed var(--border-strong)", backgroundColor: "var(--bg-surface)" }}
        >
          <div className="text-3xl mb-3" aria-hidden>📊</div>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>No simulation outcomes yet</p>
          <p className="text-sm mt-1.5" style={{ color: "var(--text-tertiary)" }}>
            Approve and simulate a recommendation on the{" "}
            <Link href="/recommendations" style={{ color: "var(--brand-orange)" }}>
              Recommendations page
            </Link>
            , then return here to see the closed loop in action.
          </p>
        </div>

        {/* Current confidence */}
        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderLeft: "3px solid var(--color-info)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-info)", fontSize: 10, letterSpacing: "0.12em" }}>
            Current Engine Confidence
          </p>
          <div className="flex items-end gap-4">
            <span className="text-3xl font-bold font-mono-num" style={{ color: "var(--text-primary)" }}>
              {fmtPct(currentConfidence)}
            </span>
            <p className="text-sm mb-0.5" style={{ color: "var(--text-secondary)" }}>
              Budget reallocation model · Range [0.30–0.95]
            </p>
          </div>
          <div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${currentConfidence * 100}%`, backgroundColor: "var(--color-info)" }}
            />
          </div>
        </div>

        {/* Formula */}
        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.12em" }}>
            M5 Confidence Update Formula (Locked — CONTEXT.md)
          </p>
          <p className="font-mono-num text-xs" style={{ color: "var(--text-secondary)" }}>
            accuracy = max(0, 1 − |error_fraction|)
          </p>
          <p className="font-mono-num text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            c_new = c + 0.3 × (accuracy − c)
          </p>
          <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
            Step capped ±0.08 · Range [0.30, 0.95]
          </p>
        </div>
      </div>
    );
  }

  /* ── Compute confidence trajectory ── */
  const trajectory = outcomes
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((outcome) => {
      const rec = recMap.get(outcome.recommendation_id);
      const errorFraction = outcome.error_pct / 100;
      const update = updateConfidence({ currentConfidence, errorFraction });
      return { outcome, rec, update };
    });

  return (
    <div className="space-y-4">
      {/* ── Loop diagram ── */}
      <div
        className="rounded-lg p-4"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.12em" }}>
          A.D.A.P.T. Learning Loop — Closed
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {loopSteps.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <LoopStep label={step} active />
              {i < loopSteps.length - 1 && (
                <span style={{ color: "var(--brand-orange)", fontSize: 12 }}>→</span>
              )}
            </span>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>
          The engine measured forecast error after simulation and recalibrated its confidence weight for future decisions.
        </p>
      </div>

      {/* ── Outcome trajectory table ── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
      >
        <div
          className="px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-elevated)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.12em" }}>
            Prediction vs Simulation Outcomes
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["Date", "Recommendation", "Predicted (3d)", "Actual Simulated", "Error", "Accuracy", "Confidence →"].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-tertiary)", letterSpacing: "0.1em", backgroundColor: "var(--bg-elevated)", fontSize: 10 }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trajectory.map(({ outcome, rec, update }, i) => {
                const isGoodError = Math.abs(outcome.error_pct) < 10;
                return (
                  <tr
                    key={outcome.id}
                    style={{
                      borderBottom: i < trajectory.length - 1 ? "1px solid var(--border-subtle)" : "none",
                      transition: "background-color 0.12s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                  >
                    <td className="px-4 py-3 font-mono-num text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {outcome.created_at.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)", maxWidth: 200 }}>
                      <span className="line-clamp-1">
                        {rec?.explanation?.slice(0, 55) ?? outcome.recommendation_id}
                        {(rec?.explanation?.length ?? 0) > 55 ? "…" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>
                      {fmtINR(outcome.predicted)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-semibold" style={{ color: "var(--color-good)" }}>
                      {fmtINR(outcome.actual)}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-mono-num font-semibold"
                      style={{ color: isGoodError ? "var(--color-good)" : "var(--color-warning)" }}
                    >
                      {outcome.error_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>
                      {fmtPct(update.accuracy)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold" style={{ color: "var(--color-info)" }}>
                      {fmtPct(update.newConfidence)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confidence summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className="rounded-lg p-4"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Current Confidence</p>
          <p className="text-2xl font-bold font-mono-num" style={{ color: "var(--text-primary)" }}>
            {fmtPct(currentConfidence)}
          </p>
          <div className="mt-2 h-1 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }}>
            <div
              className="h-1 rounded-full"
              style={{ width: `${currentConfidence * 100}%`, backgroundColor: "var(--color-info)" }}
            />
          </div>
        </div>
        {trajectory.length > 0 && (
          <>
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Last Prediction Error</p>
              <p
                className="text-2xl font-bold font-mono-num"
                style={{
                  color: Math.abs(trajectory[trajectory.length - 1].outcome.error_pct) < 10
                    ? "var(--color-good)"
                    : "var(--color-warning)",
                }}
              >
                {trajectory[trajectory.length - 1].outcome.error_pct.toFixed(1)}%
              </p>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            >
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)", fontSize: 10 }}>Updated Confidence</p>
              <p className="text-2xl font-bold font-mono-num" style={{ color: "var(--color-info)" }}>
                {fmtPct(trajectory[trajectory.length - 1].update.newConfidence)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Formula card ── */}
      <div
        className="rounded-lg p-4"
        style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)", fontSize: 10, letterSpacing: "0.12em" }}>
          M5 Confidence Update Formula (Locked — CONTEXT.md)
        </p>
        <div className="space-y-1.5">
          <p className="font-mono-num text-xs" style={{ color: "var(--text-secondary)" }}>
            accuracy = max(0, 1 − |error_fraction|)
          </p>
          <p className="font-mono-num text-xs" style={{ color: "var(--text-secondary)" }}>
            c_new = c + 0.3 × (accuracy − c)
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Step capped ±0.08 · Confidence clamped to [0.30, 0.95]
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            If accuracy drops (prediction was wrong), confidence decreases — the engine learns from its mistakes.
          </p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="flex gap-3">
        <Link
          href="/recommendations"
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
          ← Back to Recommendations
        </Link>
      </div>
    </div>
  );
}
