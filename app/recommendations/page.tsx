import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";

/* ─── Recommendations page (/recommendations) ─────────────────────────────── */
/* Gate G0 shell — no recommendation logic, no optimizer, no LLM.              */
/* Real content: up to 5 profit-aware budget moves (lib/analysis → app/api/decide). */
export default function RecommendationsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Recommendations"
        subtitle="Profit-aware budget moves · Up to 5 per run · ≥ ₹300/day expected gain"
      />
      <MainContent>
        {/* Placeholder: move list */}
        <section aria-label="Pending recommendations">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pending Moves
          </h3>
          <div
            className="rounded-lg border bg-white shadow-sm divide-y"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Placeholder rows — replaced by real data in Gate G1/G2 */}
            {[
              {
                id: "REC-001",
                from: "TikTok / TEE-BSC",
                to: "Meta / TEE-PRM",
                amount: "₹4,200/day",
                reason: "Marginal profit negative (E4). Receiver has positive margin.",
                status: "Pending approval",
              },
              {
                id: "REC-002",
                from: "Google (all)",
                to: "Hold",
                amount: "₹8,400/day ↓",
                reason: "CPM +40% from day 36 (E3). Reduce to 60% floor.",
                status: "Pending approval",
              },
              {
                id: "REC-003",
                from: "Meta / HOOD-01",
                to: "Hold",
                amount: "₹9,600/day ↓ 30%",
                reason: "CTR fatigue detected from day 22 (E2). Flag new creative.",
                status: "Pending approval",
              },
            ].map((rec) => (
              <div key={rec.id} className="flex items-start justify-between px-5 py-4 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{rec.id}</span>
                    <span className="text-sm font-medium text-gray-900">{rec.from}</span>
                    <span className="text-gray-400 text-xs">→</span>
                    <span className="text-sm font-medium text-gray-900">{rec.to}</span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--color-warning)" }}
                    >
                      {rec.amount}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{rec.reason}</p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  {rec.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Placeholder: explanation panel */}
        <section aria-label="LLM explanation" className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Plain-English Explanation
          </h3>
          <div
            className="rounded-lg border bg-white shadow-sm p-5"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-sm text-gray-400 italic">
              LLM-generated or template explanation renders here — Gate G2.
              Numbers always come from the pipeline, never from the LLM.
            </p>
          </div>
        </section>
      </MainContent>
    </div>
  );
}
