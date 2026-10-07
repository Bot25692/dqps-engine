import type { Anomaly, Campaign, InventoryRow, MetricRow, Sku } from '../types';
import { driverImpact } from './rootcause';

export interface ReturnCurve {
  campaign_id: string;
  s0: number;
  r0: number;
  beta: number;
}

const DAY = 86_400_000;
// Stock below five days needs a warning; below three days requires a forced donor.
const STOCK_WARNING = 5, STOCK_FORCED = 3;
// Use seven complete calendar days of all-channel SKU sales, including the snapshot day.
const SALES_DAYS = 7;
// Compare each observation with the preceding fourteen days, excluding that observation.
const MAD_DAYS = 14;
// Scale MAD to normal-distribution standard-deviation units and floor it at 3% of the median.
const MAD_SCALE = 1.4826, MAD_FLOOR = .03;
// Moderate deviations need a 15% adverse change and three scaled deviations on two consecutive days.
const MODERATE_Z = 3, MIN_CHANGE = .15;
// A deviation of at least 4.5 scaled deviations is enough on a single day.
const EXTREME_Z = 4.5;
// Fatigue compares the last five days with days t-21 through t-8, both endpoints included.
const FATIGUE_DAYS = 5, BASELINE_START = 21, BASELINE_END = 8;
// CTR must fall by at least 25%, while mean impressions stay within 20% of their baseline.
const CTR_RATIO = .75, IMPRESSION_TOLERANCE = .20;
const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
// Allow only floating-point rounding error at inclusive boundaries, not a business-threshold relaxation.
const atLeast = (value: number, threshold: number) => value >= threshold
  || Math.abs(value - threshold) <= 8 * Number.EPSILON * Math.max(Math.abs(value), Math.abs(threshold));
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};

// Copy and order each series; duplicate dates are ambiguous and must be aggregated by the caller.
function series<T extends { date: string }>(rows: readonly T[], key: (row: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return [...groups.values()].map(group => {
    group.sort((a, b) => a.date.localeCompare(b.date));
    if (group.some((row, i) => i > 0 && row.date === group[i - 1].date)) {
      throw new Error('Duplicate date in a daily series');
    }
    return group;
  });
}

// Require complete calendar windows: missing days are unknown, not zero sales or adjacent observations.
function window<T extends { date: string }>(rows: readonly T[], end: number, length: number): T[] | undefined {
  const selected = rows.filter(row => day(row.date) > end - length && day(row.date) <= end);
  return selected.length === length ? selected : undefined;
}

// Undefined ratios (for example, CTR without impressions) cannot provide statistical evidence.
function value(row: MetricRow, metric: 'roas' | 'ctr' | 'cpm' | 'cvr'): number | undefined {
  const [numerator, denominator] = metric === 'roas' ? [row.revenue, row.spend]
    : metric === 'ctr' ? [row.clicks, row.impressions]
    : metric === 'cpm' ? [row.spend * 1000, row.impressions] : [row.orders, row.clicks];
  return denominator > 0 ? numerator / denominator : undefined;
}

// Build deterministic, schema-compatible events; change_pct is in percentage points.
function flag(detector: string, campaign_id: string, date: string, metric: Anomaly['metric'],
  baseline: number, observed: number, z_score = 0, severity: Anomaly['severity'] = 'warning'): Anomaly {
  return { id: `${detector}:${campaign_id}:${metric}:${date}`, campaign_id, date, metric,
    baseline, observed, z_score, change_pct: baseline === 0 ? 0 : (observed / baseline - 1) * 100,
    severity, drivers: [] };
}

// Collapse adjacent flagged dates by campaign and metric, retaining onset measurements and the worst severity.
// The contract has no end date; date always means the first flagged day, not the peak or confirmation day.
export function mergeConsecutiveFlags(flags: readonly Anomaly[]): Anomaly[] {
  const sorted = [...flags].sort((a, b) => a.campaign_id.localeCompare(b.campaign_id)
    || a.metric.localeCompare(b.metric) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const events: Anomaly[] = [];
  let lastDay = -Infinity;
  for (const current of sorted) {
    const previous = events.at(-1);
    if (previous && previous.campaign_id === current.campaign_id && previous.metric === current.metric
      && day(current.date) <= lastDay + 1) {
      if (current.severity === 'critical') previous.severity = 'critical';
    } else events.push({ ...current, drivers: current.drivers.map(driver => ({ ...driver })) });
    lastDay = day(current.date);
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// Detect low stock using SKU sales across all channels, then attach the risk to every campaign for that SKU.
export function stockRisk(campaigns: readonly Campaign[], inventory: readonly InventoryRow[]): Anomaly[] {
  const flags: Anomaly[] = [];
  for (const rows of series(inventory, row => row.sku_id)) {
    for (const row of rows) {
      const recent = window(rows, day(row.date), SALES_DAYS);
      if (!recent) continue;
      const sales = mean(recent.map(item => item.units_sold));
      // Without sales there is no finite runway, so do not manufacture a stock warning.
      if (sales === 0) continue;
      const runway = row.units_on_hand / sales;
      if (runway >= STOCK_WARNING) continue;
      for (const campaign of campaigns.filter(item => item.sku_id === row.sku_id)) {
        flags.push(flag('stock', campaign.id, row.date, 'stock_runway', STOCK_WARNING, runway, 0,
          runway < STOCK_FORCED ? 'critical' : 'warning'));
      }
    }
  }
  return mergeConsecutiveFlags(flags);
}

// Detect adverse robust deviations without letting today's value contaminate its own baseline.
export function madAnomalies(metrics: readonly MetricRow[]): Anomaly[] {
  const flags: Anomaly[] = [];
  for (const rows of series(metrics, row => row.campaign_id)) {
    for (const metric of ['roas', 'ctr', 'cpm', 'cvr'] as const) {
      let pending: Anomaly | undefined;
      for (const row of rows) {
        const history = window(rows, day(row.date) - 1, MAD_DAYS);
        const observed = value(row, metric);
        const values = history?.map(item => value(item, metric));
        if (!values || values.some(item => item === undefined) || observed === undefined) { pending = undefined; continue; }
        const baseline = median(values as number[]);
        const spread = Math.max(MAD_SCALE * median((values as number[]).map(item => Math.abs(item - baseline))), MAD_FLOOR * baseline);
        // A zero median has no meaningful relative change or positive MAD floor.
        if (baseline <= 0 || spread <= 0) { pending = undefined; continue; }
        const adverse = (observed - baseline) * (metric === 'cpm' ? 1 : -1);
        const z = adverse / spread;
        const candidate = flag('mad', row.campaign_id, row.date, metric, baseline, observed, Math.max(0, z),
          atLeast(z, EXTREME_Z) ? 'critical' : 'warning');
        const moderate = atLeast(z, MODERATE_Z) && atLeast(adverse / baseline, MIN_CHANGE);
        if (atLeast(z, EXTREME_Z)) flags.push(candidate);
        if (moderate && pending && day(row.date) - day(pending.date) === 1) flags.push(pending, candidate);
        pending = moderate ? candidate : undefined;
      }
    }
  }
  return mergeConsecutiveFlags(flags);
}

// Detect sustained CTR loss only when similar impression volume makes the comparison useful.
export function fatigue(metrics: readonly MetricRow[]): Anomaly[] {
  const flags: Anomaly[] = [];
  for (const rows of series(metrics, row => row.campaign_id)) {
    for (const row of rows) {
      const recent = window(rows, day(row.date), FATIGUE_DAYS);
      const history = window(rows, day(row.date) - BASELINE_END, BASELINE_START - BASELINE_END + 1);
      if (!recent || !history || [...recent, ...history].some(item => item.impressions <= 0)) continue;
      const baseline = mean(history.map(item => item.clicks / item.impressions));
      const observed = mean(recent.map(item => item.clicks / item.impressions));
      const impressionRatio = mean(recent.map(item => item.impressions)) / mean(history.map(item => item.impressions));
      if (baseline > 0 && atLeast(CTR_RATIO * baseline, observed)
        && atLeast(impressionRatio, 1 - IMPRESSION_TOLERANCE) && atLeast(1 + IMPRESSION_TOLERANCE, impressionRatio)) {
        flags.push(flag('fatigue', row.campaign_id, row.date, 'ctr', baseline, observed));
      }
    }
  }
  return mergeConsecutiveFlags(flags);
}

// Evaluate supplied curves at each observed spend; no fitting, database access, or hidden simulation truth.
// With positive margin, ROAS below 1/(margin*beta) is equivalent to negative marginal profit.
// Zero-margin SKUs have no finite break-even ROAS: baseline is zero and the driver records the loss.
export function profitLeak(metrics: readonly MetricRow[], campaigns: readonly Campaign[],
  skus: readonly Sku[], curves: readonly ReturnCurve[]): Anomaly[] {
  const flags: Anomaly[] = [];
  const curveMap = new Map(curves.map(curve => [curve.campaign_id, curve]));
  const skuMap = new Map(skus.map(sku => [sku.id, sku]));
  const campaignMap = new Map(campaigns.map(campaign => [campaign.id, campaign]));
  for (const curve of curves) {
    if (![curve.s0, curve.r0, curve.beta].every(Number.isFinite) || curve.s0 <= 0 || curve.r0 < 0 || curve.beta <= 0) {
      throw new Error(`Invalid return curve for ${curve.campaign_id}`);
    }
  }
  for (const row of metrics) {
    const curve = curveMap.get(row.campaign_id);
    const campaign = campaignMap.get(row.campaign_id);
    const sku = campaign && skuMap.get(campaign.sku_id);
    if (!curve || !sku || row.spend <= 0) continue;
    const roas = curve.r0 * (row.spend / curve.s0) ** curve.beta / row.spend;
    const marginal = sku.margin_rate * curve.beta * roas - 1;
    // Strictly below zero means the next rupee of advertising loses contribution profit; zero is not a leak.
    if (marginal < 0 && Number.isFinite(roas)) {
      const event = flag('profit', row.campaign_id, row.date, 'roas',
        sku.margin_rate > 0 ? 1 / (sku.margin_rate * curve.beta) : 0, roas);
      event.drivers = [{ name: 'negative_marginal_profit', contribution_pct: marginal * 100,
        impact: driverImpact(marginal * 100),
        description: `The next rupee of advertising loses ${(-marginal * 100).toFixed(1)}% in contribution profit.` }];
      flags.push(event);
    }
  }
  return mergeConsecutiveFlags(flags);
}
