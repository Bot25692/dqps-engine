import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";

/* ─── Campaigns page (/campaigns) ────────────────────────────────────────── */
/* Gate G0 shell — displays a static campaign table.                           */
/* Real data: ad_metrics_daily joined with campaigns (lib/db → Repo interface). */
/* Anomaly/fatigue flags come from lib/analysis — not implemented here.        */

/* Placeholder campaign rows drawn from CONTEXT.md §Scenario (Day 45 as-of). */
const placeholderCampaigns = [
  {
    id: "SNK-01-META",
    sku: "SNK-01",
    platform: "Meta",
    spend: 18000,
    roas: 4.8,
    runway: 2,
    flag: "stock-critical",
  },
  {
    id: "HOOD-01-META",
    sku: "HOOD-01",
    platform: "Meta",
    spend: 12000,
    roas: 3.6,
    runway: 14,
    flag: "fatigue",
  },
  {
    id: "TEE-BSC-TT",
    sku: "TEE-BSC",
    platform: "TikTok",
    spend: 14000,
    roas: 3.2,
    runway: 9,
    flag: "negative-margin",
  },
  {
    id: "TEE-PRM-META",
    sku: "TEE-PRM",
    platform: "Meta",
    spend: 10000,
    roas: 4.1,
    runway: 21,
    flag: "none",
  },
  {
    id: "CAMP-GOOG-01",
    sku: "MIX",
    platform: "Google",
    spend: 28000,
    roas: 3.9,
    runway: 11,
    flag: "cpm-spike",
  },
] as const;

/* Map flag to display label and colour */
type Flag = (typeof placeholderCampaigns)[number]["flag"];
const flagDisplay: Record<Flag, { label: string; color: string }> = {
  "stock-critical": { label: "Stock < 3d", color: "var(--color-problem)" },
  fatigue: { label: "CTR Fatigue", color: "var(--color-warning)" },
  "negative-margin": { label: "Neg. Margin", color: "var(--color-problem)" },
  "cpm-spike": { label: "CPM +40%", color: "var(--color-warning)" },
  none: { label: "—", color: "var(--muted-foreground)" },
};

export default function CampaignsPage() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Campaigns"
        subtitle="10 campaigns · 4 platforms · 8 SKUs · Day 45 as-of date"
      />
      <MainContent>
        <section aria-label="Campaign table">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Active Campaigns
          </h3>
          <div
            className="overflow-hidden rounded-lg border bg-white shadow-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <table className="min-w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}
                >
                  <th className="px-4 py-3 font-medium text-gray-600">Campaign</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Platform</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Daily Spend</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">ROAS</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Runway</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {placeholderCampaigns.map((c) => {
                  const fd = flagDisplay[c.flag];
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{c.id}</span>
                        <br />
                        <span className="text-xs text-gray-400">SKU: {c.sku}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{c.platform}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        ₹{c.spend.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-medium"
                          style={{
                            color: c.roas >= 1.64 ? "var(--color-good)" : "var(--color-problem)",
                          }}
                        >
                          {c.roas.toFixed(1)}×
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-medium"
                          style={{
                            color:
                              c.runway < 3
                                ? "var(--color-problem)"
                                : c.runway < 5
                                  ? "var(--color-warning)"
                                  : "var(--color-good)",
                          }}
                        >
                          {c.runway}d
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium" style={{ color: fd.color }}>
                          {fd.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Chart placeholder */}
        <section aria-label="Campaign trend chart" className="mt-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Campaign Trend (Chart Placeholder)
          </h3>
          <div
            className="rounded-lg border bg-white shadow-sm flex items-center justify-center h-48"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="text-sm text-gray-400">
              Recharts line chart (spend, ROAS, CTR over 45 days) — Gate G1
            </p>
          </div>
        </section>
      </MainContent>
    </div>
  );
}
