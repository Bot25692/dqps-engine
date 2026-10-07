import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";

/* ─── Learning page (/learning) ──────────────────────────────────────────── */
/* Gate G0 shell — shows confidence weights and outcome history placeholders.  */
/* Real data: confidence_weights + outcomes tables (Builder A's DB / Repo).    */
/* Confidence update formula lives in lib/analysis (pure function).            */

/* Placeholder confidence weights per CONTEXT.md §Confidence:
   start 0.75, c = c + 0.3 × (accuracy − c), capped ±0.08, range 0.3–0.95. */
const placeholderWeights = [
  { type: "Budget Reallocation", confidence: 0.75, runs: 0, accuracy: null },
  { type: "Fatigue Detection", confidence: 0.75, runs: 0, accuracy: null },
  { type: "Anomaly Flagging", confidence: 0.75, runs: 0, accuracy: null },
  { type: "Stock Constraint", confidence: 0.75, runs: 0, accuracy: null },
] as const;

/* Format confidence as a percentage with bar width */
function confidencePct(c: number) {
  return Math.round(c * 100);
}

export default function LearningPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Learning"
        subtitle="Confidence weights · Prediction accuracy · Outcome history"
      />
      <MainContent>
        {/* ── Confidence weights ── */}
        <section aria-label="Confidence weights">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Confidence Weights
          </h3>
          <div
            className="rounded-lg border bg-white shadow-sm divide-y"
            style={{ borderColor: "var(--border)" }}
          >
            {placeholderWeights.map((w) => {
              const pct = confidencePct(w.confidence);
              return (
                <div key={w.type} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">{w.type}</span>
                    <span className="text-sm font-semibold text-gray-700">{pct}%</span>
                  </div>
                  {/* Confidence progress bar */}
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--muted)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          pct >= 80
                            ? "var(--color-good)"
                            : pct >= 50
                              ? "var(--color-warning)"
                              : "var(--color-problem)",
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    {w.runs === 0
                      ? "No runs yet — starts at 75%"
                      : `${w.runs} runs · Last accuracy: ${w.accuracy}`}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Formula: c = c + 0.3 × (accuracy − c) · step capped ±0.08 · range 0.30–0.95
          </p>
        </section>

        {/* ── Action log placeholder ── */}
        <section aria-label="Action log" className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Action Log
          </h3>
          <div
            className="rounded-lg border bg-white shadow-sm flex items-center justify-center h-32"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-sm text-gray-400">
              Approved decisions and 3-day outcome results appear here — Gate G2
            </p>
          </div>
        </section>

        {/* ── Prediction accuracy chart placeholder ── */}
        <section aria-label="Prediction accuracy chart" className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Prediction Accuracy Over Time (Chart Placeholder)
          </h3>
          <div
            className="rounded-lg border bg-white shadow-sm flex items-center justify-center h-48"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-sm text-gray-400">
              Recharts line chart (predicted vs actual profit gain) — Gate G2
            </p>
          </div>
        </section>
      </MainContent>
    </div>
  );
}
