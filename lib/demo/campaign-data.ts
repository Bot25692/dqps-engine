import type { Campaign, Sku, MetricRow, InventoryRow } from '../types';

// Derive presentation rows from observed metrics and SKU inventory.
interface CampaignRow {
  campaign: Campaign;
  sku: Sku;
  avgDailySpend: number;
  avgDailyRevenue: number;
  roas: number;
  breakEvenRoas: number;
  stockRunwayDays: number;
  inventoryUnits: number;
  flag: "stock-critical" | "stock-low" | "negative-margin" | "none";
}

export function buildCampaignRows(
  campaigns: Campaign[],
  skus: Sku[],
  metrics: MetricRow[],
  inventory: InventoryRow[]
): CampaignRow[] {
  const skuMap = new Map(skus.map((s) => [s.id, s]));

  // Latest 7-day metric window per campaign
  const dates = [...new Set(metrics.map((m) => m.date))].sort();
  const last7Dates = new Set(dates.slice(-7));

  return campaigns
    .map((c) => {
      const sku = skuMap.get(c.sku_id);
      if (!sku) throw new Error('Missing SKU margin for campaign');
      const recentMetrics = metrics.filter(
        (m) => m.campaign_id === c.id && last7Dates.has(m.date)
      );
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
      const avgDailySold =
        skuInventory.slice(0, 7).reduce((s, i) => s + i.units_sold, 0) / 7;
      const stockRunwayDays =
        avgDailySold > 0 ? inventoryUnits / avgDailySold : Infinity;

      // Break-even ROAS = 1 / margin_rate
      const breakEvenRoas = 1 / sku.margin_rate;
      const flag: CampaignRow["flag"] =
        stockRunwayDays < 3
          ? "stock-critical"
          : stockRunwayDays < 5
          ? "stock-low"
          : roas < breakEvenRoas
          ? "negative-margin"
          : "none";

      return {
        campaign: c,
        sku,
        avgDailySpend,
        avgDailyRevenue,
        roas,
        breakEvenRoas,
        stockRunwayDays,
        inventoryUnits,
        flag,
      };
    })
    .sort((a, b) => {
      // Critical first, then by spend descending
      const urgency = {
        "stock-critical": 0,
        "stock-low": 1,
        "negative-margin": 2,
        none: 3,
      };
      if (urgency[a.flag] !== urgency[b.flag])
        return urgency[a.flag] - urgency[b.flag];
      return b.avgDailySpend - a.avgDailySpend;
    });
}
