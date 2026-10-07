import type { Campaign, InventoryRow, MetricRow, Sku } from '../types';
import type { AttentionItem, DailyPortfolioRow, KpiStat, OpportunityItem } from './g1-fixtures';

// Derive the existing Overview display from the same Repo snapshot used by analysis.
export function overviewData(data: { campaigns: Campaign[]; skus: Sku[]; metrics: MetricRow[]; inventory: InventoryRow[] }) {
  const skuMap = new Map(data.skus.map(sku => [sku.id, sku]));
  const campaignMap = new Map(data.campaigns.map(campaign => [campaign.id, campaign]));
  const dates = [...new Set(data.metrics.map(row => row.date))].sort();
  if (dates.length === 0) {
    throw new Error("No metrics found for the requested date range");
  }
  const latest = dates.at(-1)!;
  const daily = dates.map(date => {
    const rows = data.metrics.filter(row => row.date === date);
    return { day: date, revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      spend: rows.reduce((sum, row) => sum + row.spend, 0),
      profit: rows.reduce((sum, row) => sum + row.revenue * skuMap.get(campaignMap.get(row.campaign_id)!.sku_id)!.margin_rate - row.spend, 0) };
  });
  const current = daily.at(-1)!;
  const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const kpiStats: KpiStat[] = [
    { label: 'Revenue', value: inr(current.revenue), sub: `${latest} · all platforms`, trend: 'neutral' },
    { label: 'Ad Spend', value: inr(current.spend), sub: 'All platforms combined', trend: 'neutral' },
    { label: 'Contribution Profit', value: inr(current.profit), sub: 'SKU revenue × margin − spend', trend: current.profit >= 0 ? 'good' : 'problem' },
    { label: 'Blended ROAS', value: `${(current.spend ? current.revenue / current.spend : 0).toFixed(1)}×`, sub: 'Total revenue / total ad spend', trend: 'neutral' },
  ];
  // Stock runway uses seven end-of-day SKU rows, covering sales across all channels.
  const item = (skuId: string) => {
    const sku = skuMap.get(skuId)!;
    const campaigns = data.campaigns.filter(c => c.sku_id === skuId);
    const rows = data.metrics.filter(row => row.date === latest && campaigns.some(c => c.id === row.campaign_id));
    const spend = rows.reduce((sum, row) => sum + row.spend, 0);
    const stock = data.inventory.filter(row => row.sku_id === skuId && row.date <= latest).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
    const sold = stock.reduce((sum, row) => sum + row.units_sold, 0) / stock.length;
    const inventoryUnits = stock.at(-1)!.units_on_hand;
    return { id: sku.id, name: sku.name, sku: sku.id, platform: [...new Set(campaigns.map(c => c.platform))].join(', '),
      roas: spend ? rows.reduce((sum, row) => sum + row.revenue, 0) / spend : 0,
      marginPct: sku.margin_rate * 100, inventoryUnits, stockRunwayDays: sold ? inventoryUnits / sold : Infinity };
  };
  const sneaker = item('SNK-01'), premium = item('TEE-PRM');
  const attentionItem: AttentionItem = { ...sneaker, statusLabel: sneaker.stockRunwayDays < 5 ? 'STOCK RISK' : 'STOCK COVER',
    statusTrend: sneaker.stockRunwayDays < 5 ? 'problem' : 'neutral',
    insight: `${sneaker.inventoryUnits} units remain with ${sneaker.stockRunwayDays.toFixed(1)} days of all-channel stock cover. Stock risk takes priority over ROAS.` };
  const opportunityItem: OpportunityItem = { ...premium, statusLabel: 'OPPORTUNITY', statusTrend: 'good',
    insight: `${premium.marginPct.toFixed(0)}% margin, ${premium.inventoryUnits} units and ${premium.roas.toFixed(1)}× ROAS. The optimizer checks marginal profit and stock cover before recommending a transfer.` };
  return { kpiStats, portfolioTimeSeries: daily.slice(-30) as DailyPortfolioRow[], attentionItem, opportunityItem };
}
