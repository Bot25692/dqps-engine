import { PageHeader } from "@/components/page-header";
import { MainContent } from "@/components/main-content";
import { connection } from "next/server";
import { getRuntimeRepo } from "@/lib/db/runtime-repo";
import { loadAnalysisInputs } from "@/lib/run-analysis";
import type { Campaign, Sku, MetricRow, InventoryRow } from "@/lib/types";

export const instant = false;

/* ─── Platform badge colours ─────────────────────────────────────────────── */
const platformStyle: Record<string, { color: string; bg: string; border: string; label: string }> = {
  meta:    { color: "#818cf8", bg: "rgba(129,140,248,0.1)", border: "rgba(129,140,248,0.25)", label: "Meta" },
  google:  { color: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.25)",  label: "Google" },
  tiktok:  { color: "#fb7185", bg: "rgba(251,113,133,0.1)", border: "rgba(251,113,133,0.25)", label: "TikTok" },
  amazon:  { color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.25)",  label: "Amazon" },
};

/* ─── Format helpers ─────────────────────────────────────────────────────── */
function fmtINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

/* ─── Build campaign rows from fixture data ──────────────────────────────── */
interface CampaignRow {
  campaign: Campaign;
  sku: Sku;
  avgDailySpend: number;
  avgDailyRevenue: number;
  roas: number;
  stockRunwayDays: number;
  inventoryUnits: number;
  flag: "stock-critical" | "stock-low" | "negative-margin" | "none";
}

function buildCampaignRows(
  campaigns: Campaign[],
  skus: Sku[],
  metrics: MetricRow[],
  inventory: InventoryRow[],
): CampaignRow[] {
  const skuMap = new Map(skus.map((s) => [s.id, s]));

  // Latest 7-day metric window per campaign
  const dates = [...new Set(metrics.map((m) => m.date))].sort();
  const last7Dates = new Set(dates.slice(-7));

  return campaigns.map((c) => {
    const sku = skuMap.get(c.sku_id)!;
    const recentMetrics = metrics.filter((m) => m.campaign_id === c.id && last7Dates.has(m.date));
    const totalSpend = recentMetrics.reduce((s, m) => s + m.spend, 0);
    const totalRevenue = recentMetrics.reduce((s, m) => s + m.revenue, 0);
    const days = recentMetrics.length || 1;
    const avgDailySpend = totalSpend / days;
    const avgDailyRevenue = totalRevenue / days;
    const roas = avgDailySpend > 0 ? avgDailyRevenue / avgDailySpend : 0;

    // Latest inventory snapshot for this SKU
    const skuInventory = inventory
      .filter((inv) => inv.sku_id === c.sku_id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const latestInv = skuInventory[0];
    const inventoryUnits = latestInv?.units_on_hand ?? 0;
    const avgDailySold = skuInventory.slice(0, 7).reduce((s, i) => s + i.units_sold, 0) / 7;
    const stockRunwayDays = avgDailySold > 0 ? inventoryUnits / avgDailySold : 999;

    // Break-even ROAS = 1 / margin_rate
    const breakEvenRoas = sku ? 1 / sku.margin_rate : 2;
    const flag: CampaignRow["flag"] =
      stockRunwayDays < 3 ? "stock-critical" :
      stockRunwayDays < 5 ? "stock-low" :
      roas < breakEvenRoas ? "negative-margin" : "none";

    return {
      campaign: c,
      sku: sku ?? { id: c.sku_id, name: c.sku_id, margin_rate: 0.5 },
      avgDailySpend,
      avgDailyRevenue,
      roas,
      stockRunwayDays,
      inventoryUnits,
      flag,
    };
  }).sort((a, b) => {
    // Critical first, then by spend descending
    const urgency = { "stock-critical": 0, "stock-low": 1, "negative-margin": 2, none: 3 };
    if (urgency[a.flag] !== urgency[b.flag]) return urgency[a.flag] - urgency[b.flag];
    return b.avgDailySpend - a.avgDailySpend;
  });
}

const flagConfig: Record<CampaignRow["flag"], { label: string; color: string; bg: string; border: string } | null> = {
  "stock-critical": { label: "STOCK RISK",      color: "var(--color-problem)", bg: "var(--color-problem-dim)", border: "var(--color-problem-muted)" },
  "stock-low":      { label: "STOCK LOW",        color: "var(--color-warning)", bg: "var(--color-warning-dim)", border: "var(--color-warning-muted)" },
  "negative-margin":{ label: "SUB-BREAKEVEN",   color: "var(--color-warning)", bg: "var(--color-warning-dim)", border: "var(--color-warning-muted)" },
  "none":           null,
};

export default async function CampaignsPage() {
  await connection();
  const repo = await getRuntimeRepo();
  const { campaigns, skus, metrics, inventory } = await repo.run(loadAnalysisInputs);
  const rows = buildCampaignRows(campaigns, skus, metrics, inventory);
  const criticalCount = rows.filter((r) => r.flag !== "none").length;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Campaigns"
        subtitle={`${campaigns.length} campaigns · 4 platforms · INR · Day 45 as-of`}
        actions={
          criticalCount > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                color: "var(--color-problem)",
                backgroundColor: "var(--color-problem-dim)",
                border: "1px solid var(--color-problem-muted)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "var(--color-problem)", boxShadow: "0 0 4px var(--color-problem)" }}
              />
              {criticalCount} flagged
            </span>
          ) : null
        }
      />

      <MainContent>
        {/* Section label */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-tertiary)", letterSpacing: "0.14em", fontSize: "10px" }}
          >
            Campaign Portfolio Matrix
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: "var(--border-subtle)" }} />
          <span style={{ color: "var(--text-tertiary)", fontSize: "10px" }}>
            7-day average · sorted by urgency
          </span>
        </div>

        {/* Campaign table */}
        <section aria-label="Campaign table">
          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {["Campaign", "Platform", "Daily Spend", "Daily Revenue", "ROAS", "Stock Runway", "Margin", "Flag"].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{
                        color: "var(--text-tertiary)",
                        letterSpacing: "0.1em",
                        backgroundColor: "var(--bg-elevated)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const plt = platformStyle[row.campaign.platform] ?? platformStyle.meta;
                  const fc = flagConfig[row.flag];
                  const breakEvenRoas = 1 / row.sku.margin_rate;
                  const roasGood = row.roas >= breakEvenRoas;
                  const runwayColor =
                    row.stockRunwayDays < 3
                      ? "var(--color-problem)"
                      : row.stockRunwayDays < 5
                        ? "var(--color-warning)"
                        : "var(--color-good)";
                  const isHighlighted = row.flag === "stock-critical";

                  return (
                    <tr
                      key={row.campaign.id}
                      style={{
                        borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        backgroundColor: isHighlighted ? "rgba(239,68,68,0.04)" : "transparent",
                        transition: "background-color 0.12s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          isHighlighted ? "rgba(239,68,68,0.04)" : "transparent";
                      }}
                    >
                      {/* Campaign name */}
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                          {row.campaign.name}
                        </p>
                        <p className="text-xs mt-0.5 font-mono-num" style={{ color: "var(--text-tertiary)" }}>
                          {row.campaign.id} · SKU {row.sku.id}
                        </p>
                      </td>

                      {/* Platform badge */}
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
                          style={{
                            color: plt.color,
                            backgroundColor: plt.bg,
                            border: `1px solid ${plt.border}`,
                            letterSpacing: "0.05em",
                          }}
                        >
                          {plt.label}
                        </span>
                      </td>

                      {/* Daily Spend */}
                      <td className="px-4 py-3 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>
                        {row.avgDailySpend > 0 ? fmtINR(row.avgDailySpend) : "—"}
                      </td>

                      {/* Daily Revenue */}
                      <td className="px-4 py-3 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>
                        {row.avgDailyRevenue > 0 ? fmtINR(row.avgDailyRevenue) : "—"}
                      </td>

                      {/* ROAS */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-semibold font-mono-num"
                          style={{ color: roasGood ? "var(--color-good)" : "var(--color-problem)" }}
                        >
                          {row.roas > 0 ? `${row.roas.toFixed(2)}×` : "—"}
                        </span>
                        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          B/E: {breakEvenRoas.toFixed(2)}×
                        </p>
                      </td>

                      {/* Stock Runway */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-semibold font-mono-num"
                          style={{ color: runwayColor }}
                        >
                          {row.stockRunwayDays < 900 ? `${row.stockRunwayDays.toFixed(1)}d` : "∞"}
                        </span>
                        <p className="text-xs font-mono-num" style={{ color: "var(--text-tertiary)" }}>
                          {row.inventoryUnits} units
                        </p>
                      </td>

                      {/* Margin */}
                      <td className="px-4 py-3 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>
                        {fmtPct(row.sku.margin_rate)}
                      </td>

                      {/* Flag */}
                      <td className="px-4 py-3">
                        {fc ? (
                          <span
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold"
                            style={{
                              color: fc.color,
                              backgroundColor: fc.bg,
                              border: `1px solid ${fc.border}`,
                              letterSpacing: "0.06em",
                            }}
                          >
                            {fc.label}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Table footnote */}
          <p
            className="mt-2 text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            ROAS = Revenue ÷ Ad Spend · Break-even ROAS = 1 ÷ margin_rate · Runway = Inventory ÷ Avg daily units sold · All values from fixture data
          </p>
        </section>
      </MainContent>
    </div>
  );
}
