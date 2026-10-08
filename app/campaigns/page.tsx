import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { connection } from "next/server";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { loadAnalysisInputs } from "@/lib/run-analysis";
import { buildCampaignRows } from "@/lib/demo/campaign-data";

export const instant = false;

/* ─── Format helpers ─────────────────────────────────────────────────────── */
function fmtINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/* ─── Build campaign rows from fixture data ──────────────────────────────── */
export default async function CampaignsPage() {
  await connection();
  const repo = await getRuntimeRepo();
  const { campaigns, skus, metrics, inventory } = await repo.run(
    loadAnalysisInputs
  );
  const rows = buildCampaignRows(campaigns, skus, metrics, inventory);
  const criticalCount = rows.filter((r) => r.flag !== "none").length;

  const platforms = new Set(campaigns.map((c) => c.platform)).size;
  const dates = [...new Set(metrics.map((m) => m.date))].sort();
  const asOf = dates.at(-1) ?? "No metrics";
  const dayCount = dates.length;

  const subtitle =
    `${campaigns.length} campaigns · ${platforms} platform${
          platforms === 1 ? "" : "s"
        } · INR · ${dayCount ? `Day ${dayCount} (as-of ${asOf})` : `as-of ${asOf}`}`;

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle={subtitle}
        eyebrow="CAMPAIGN PORTFOLIO"
        actions={
          criticalCount > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                color: "#ef9991",
                backgroundColor: "rgba(237,125,117,0.12)",
                border: "1px solid rgba(237,125,117,0.25)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: "var(--red)",
                  boxShadow: "0 0 4px var(--red)",
                }}
              />
              {criticalCount} flagged
            </span>
          ) : null
        }
      />

      <MainContent>
        {repo.status.banner && <p role="status">{repo.status.banner}</p>}
        <section className="panel campaigns-panel">
          <div className="table-topline">
            <div>
              <div className="panel-kicker">
                <span className="kicker-line" aria-hidden="true" />
                Portfolio allocation
              </div>
              <h2>Active campaigns</h2>
            </div>
            <span className="table-count">{rows.length} campaigns</span>
          </div>

          <div
            className="table-scroll"
            role="region"
            aria-label="Campaign portfolio table"
            tabIndex={0}
          >
            <table className="campaign-table">
              <thead>
                <tr>
                  <th scope="col">Campaign name</th>
                  <th scope="col">Platform</th>
                  <th scope="col">SKU</th>
                  <th scope="col" className="numeric-col">Avg Spend</th>
                  <th scope="col" className="numeric-col">ROAS</th>
                  <th scope="col" className="numeric-col">Stock Runway</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="numeric-col">Daily budget</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, index) => {
                  const pKey = r.campaign.platform.toLowerCase();
                  const isCritical = r.flag === "stock-critical";
                  const isLow = r.flag === "stock-low";

                  return (
                    <tr
                      key={r.campaign.id}
                      style={{ "--row-index": index } as React.CSSProperties}
                    >
                      <td data-label="Campaign name">
                        <span className="row-indicator" aria-hidden="true" />
                        <span className="campaign-name">{r.campaign.name}</span>
                      </td>

                      <td data-label="Platform">
                        <span className={`platform-badge platform-${pKey}`}>
                          <span aria-hidden="true" />
                          {r.campaign.platform}
                        </span>
                      </td>

                      <td data-label="SKU">
                        <span className="sku-name">{r.sku.id}</span>
                      </td>

                      <td data-label="Avg Spend" className="numeric-col">
                        <span className="font-mono-num" style={{ color: "var(--text-secondary)" }}>
                          {fmtINR(r.avgDailySpend)}
                        </span>
                      </td>

                      <td data-label="ROAS" className="numeric-col">
                        <span
                          className="font-mono-num font-semibold"
                          style={{
                            color: r.roas >= r.breakEvenRoas ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {r.roas.toFixed(1)}×
                        </span>
                      </td>

                      <td data-label="Stock Runway" className="numeric-col">
                        <span
                          className="font-mono-num font-semibold"
                          style={{
                            color:
                              isCritical
                                ? "var(--amber)"
                                : isLow
                                ? "var(--amber)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {r.stockRunwayDays > 90
                            ? "Ample"
                            : `${r.stockRunwayDays.toFixed(1)} d`}
                        </span>
                      </td>

                      <td data-label="Status">
                        {isCritical ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold"
                            style={{
                              color: "#e8bf72",
                              backgroundColor: "rgba(228,179,90,0.1)",
                              border: "1px solid rgba(228,179,90,0.3)",
                              fontSize: 9,
                            }}
                          >
                            <span className="risk-dot" style={{ width: 5, height: 5 }} />
                            STOCK RISK
                          </span>
                        ) : isLow ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold"
                            style={{
                              color: "var(--amber)",
                              backgroundColor: "rgba(228,179,90,0.08)",
                              border: "1px solid rgba(228,179,90,0.2)",
                              fontSize: 9,
                            }}
                          >
                            LOW STOCK
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                            style={{
                              color: "var(--text-faint)",
                              fontSize: 9,
                            }}
                          >
                            {r.flag === 'negative-margin' ? 'NEGATIVE PROFIT' : 'ACTIVE'}
                          </span>
                        )}
                      </td>

                      <td data-label="Daily budget" className="numeric-col">
                        <span className="budget-value">
                          {fmtINR(r.campaign.daily_budget)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-caption">
            <span className="caption-dot" aria-hidden="true" />
            <span>Daily budgets & performance metrics · INR</span>
          </div>
        </section>
      </MainContent>
    </>
  );
}
