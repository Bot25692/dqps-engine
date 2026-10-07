import type { Anomaly, Campaign, Driver, InventoryRow, MetricRow, Sku } from '../types';

const DAY = 86_400_000;
// Compare the last three calendar days with the fourteen days immediately before them.
const RECENT_DAYS = 3, BASELINE_DAYS = 14;
// Changes smaller than 0.10 in log ROAS are too small for a stable contribution split.
const MIN_LOG_CHANGE = .10;
// Under five days of cover takes priority over every advertising driver.
const STOCK_WARNING_DAYS = 5;
// Runway uses seven calendar days of SKU sales across all channels.
const SALES_DAYS = 7;

// Allow only floating-point rounding error at inclusive boundaries, not a business-threshold relaxation.
const atLeast = (value: number, threshold: number) => value >= threshold
  || Math.abs(value - threshold) <= 8 * Number.EPSILON * Math.max(Math.abs(value), Math.abs(threshold));

// Impact measures magnitude, so offsetting drivers retain their signed share but can have high impact.
export function driverImpact(contributionPct: number): Driver['impact'] {
  // A magnitude of at least 50% is high; at least 20% but below 50% is medium.
  return atLeast(Math.abs(contributionPct), 50) ? 'high' : atLeast(Math.abs(contributionPct), 20) ? 'medium' : 'low';
}

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;

// Missing calendar days are unknown; duplicates are ambiguous and cannot be silently double-counted.
function window<T extends { date: string }>(rows: readonly T[], end: number, length: number): T[] | undefined {
  const selected = rows.filter(row => day(row.date) > end - length && day(row.date) <= end);
  if (new Set(selected.map(row => row.date)).size !== selected.length) throw new Error('Duplicate date in a daily series');
  return selected.length === length ? selected.sort((a, b) => a.date.localeCompare(b.date)) : undefined;
}

// Ratios of totals preserve the ROAS identity even when daily traffic and spend differ.
function aggregate(rows: readonly MetricRow[]) {
  const totals = rows.reduce((sum, row) => ({
    spend: sum.spend + row.spend, revenue: sum.revenue + row.revenue,
    impressions: sum.impressions + row.impressions, clicks: sum.clicks + row.clicks, orders: sum.orders + row.orders,
  }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, orders: 0 });
  // Logarithms require strictly positive inputs; zero activity cannot support a driver split.
  if (!Object.values(totals).every(value => Number.isFinite(value) && value > 0)) return undefined;
  const CTR = totals.clicks / totals.impressions;
  const CVR = totals.orders / totals.clicks;
  const AOV = totals.revenue / totals.orders;
  const CPM = totals.spend * 1000 / totals.impressions;
  return { CTR, CVR, AOV, CPM, ROAS: CTR * CVR * AOV * 1000 / CPM };
}

// Explain a campaign at the anomaly date, never using future rows or changing the caller's data.
// Stock and margin are independent risk signals: their zero contribution_pct means no ROAS share is assigned.
export function rootCause(anomaly: Pick<Anomaly, 'campaign_id' | 'date'>,
  campaigns: readonly Campaign[], skus: readonly Sku[], metrics: readonly MetricRow[],
  inventory: readonly InventoryRow[]): Driver[] {
  const campaign = campaigns.find(row => row.id === anomaly.campaign_id);
  const sku = skus.find(row => row.id === campaign?.sku_id);
  if (!campaign || !sku) return [];
  const end = day(anomaly.date);
  const drivers: Driver[] = [];
  const sales = window(inventory.filter(row => row.sku_id === sku.id), end, SALES_DAYS);
  if (sales) {
    const average = sales.reduce((sum, row) => sum + row.units_sold, 0) / SALES_DAYS;
    const snapshot = sales.find(row => row.date === anomaly.date)!;
    // No sales means no finite runway; do not invent a stock-out rate.
    const runway = average > 0 ? snapshot.units_on_hand / average : Infinity;
    if (runway < STOCK_WARNING_DAYS) drivers.push({ name: 'Stock risk', contribution_pct: 0, impact: 'high',
      description: `Stock covers ${runway.toFixed(1)} days at the seven-day sales rate, below five days.` });
  }

  const rows = metrics.filter(row => row.campaign_id === campaign.id);
  const recentRows = window(rows, end, RECENT_DAYS);
  if (!recentRows) return drivers;
  const spend = recentRows.reduce((sum, row) => sum + row.spend, 0);
  const revenue = recentRows.reduce((sum, row) => sum + row.revenue, 0);
  // Below zero contribution profit means margin cannot cover advertising, even with stable ROAS.
  if (spend > 0 && revenue * sku.margin_rate - spend < 0) {
    const lossPct = (1 - revenue * sku.margin_rate / spend) * 100;
    drivers.push({ name: 'Margin', contribution_pct: 0, impact: driverImpact(lossPct),
      description: `At ${(sku.margin_rate * 100).toFixed(1)}% margin, contribution profit loses ${lossPct.toFixed(1)}% of ad spend over the last three days.` });
  }

  const baselineRows = window(rows, end - RECENT_DAYS, BASELINE_DAYS);
  const recent = aggregate(recentRows);
  const baseline = baselineRows && aggregate(baselineRows);
  if (!recent || !baseline) return drivers;
  const deltaRoas = Math.log(recent.ROAS) - Math.log(baseline.ROAS);
  if (!atLeast(Math.abs(deltaRoas), MIN_LOG_CHANGE)) return drivers;
  const split = (['CTR', 'CVR', 'AOV', 'CPM'] as const).map(name => {
    const delta = Math.log(recent[name]) - Math.log(baseline[name]);
    const contribution_pct = (name === 'CPM' ? -delta : delta) / deltaRoas * 100;
    return { name, contribution_pct, impact: driverImpact(contribution_pct),
      description: `${name} ${delta >= 0 ? 'rose' : 'fell'} ${Math.abs(Math.expm1(delta) * 100).toFixed(1)}%, ${contribution_pct >= 0 ? 'explaining' : 'offsetting'} ${Math.abs(contribution_pct).toFixed(1)}% of the ROAS ${deltaRoas > 0 ? 'increase' : 'decline'} versus the preceding fourteen days.` };
  });
  // Rank supporting shares first and offsetting shares last; do not clamp or renormalize signed contributions.
  split.sort((a, b) => b.contribution_pct - a.contribution_pct);
  return [...drivers, ...split];
}
