import type { Repo } from './db/repo';
import { AnomalySchema, RecommendationSchema, type Recommendation } from './types';
import { stockRisk, madAnomalies, fatigue, profitLeak, mergeConsecutiveFlags } from './analysis/detect';
import { rootCause } from './analysis/rootcause';
import { fitCurve, allocate, assertGuardrails, type AllocationState } from './analysis/optimize';

// The demo's fixed 45-day window must not drift with the server's clock.
export const ANALYSIS_FROM = '2026-08-24';
export const ANALYSIS_AS_OF = '2026-10-07';

export function getDatasetDates(metrics: readonly { date: string }[], inventory: readonly { date: string }[]): { from: string; asOf: string } {
  const dates = [...metrics.map(m => m.date), ...inventory.map(i => i.date)].filter(Boolean);
  if (!dates.length) return { from: ANALYSIS_FROM, asOf: ANALYSIS_AS_OF };
  let minDate = dates[0], maxDate = dates[0];
  for (const d of dates) {
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  }
  return { from: minDate, asOf: maxDate };
}

export function calendarDaysEndingOn(asOf: string, count: number = 7): string[] {
  const result: string[] = [];
  const base = new Date(`${asOf}T00:00:00.000Z`);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

const SUPPORTED_PLATFORMS = new Set(['meta', 'google', 'tiktok', 'amazon']);

// Load all inputs in one repository operation so fallback can retry a coherent snapshot.
export async function loadAnalysisInputs(repo: Repo, from?: string, to?: string) {
  const queryFrom = from ?? '1970-01-01';
  const queryTo = to ?? '2099-12-31';
  const [skus, campaigns, metrics, inventory, confidence] = await Promise.all([
    repo.getSkus(), repo.getCampaigns(), repo.getMetrics(queryFrom, queryTo),
    repo.getInventory(queryFrom, queryTo), repo.getConfidence('budget_reallocation'),
  ]);
  return { skus, campaigns, metrics, inventory, confidence };
}
type Inputs = Awaited<ReturnType<typeof loadAnalysisInputs>>;

// Expose a safe, fixed failure message; underlying guardrail errors never reach HTTP clients.
export class AnalysisGuardrailError extends Error {
  constructor() { super('Analysis plan failed guardrail validation. No analysis rows were saved.'); }
}

// B_EXPLAIN_HOOK: replace this body with B's explain() later, retaining this template as fallback.
function explainRecommendation(plan: ReturnType<typeof allocate>): string {
  return `Adjust ${plan.moves.length} campaign budgets to increase expected contribution profit by INR ${plan.expected_profit_gain_per_day.toFixed(2)} per day, with INR ${plan.held_back.toFixed(2)} held back and all budget and stock guardrails satisfied.`;
}

// Fit campaign curves using current all-channel stock and price inferred from observed sales.
export function allocationState(inputs: Inputs, explicitAsOf?: string): AllocationState {
  const { skus, campaigns, metrics, inventory } = inputs;
  const asOf = explicitAsOf ?? getDatasetDates(metrics, inventory).asOf;
  const windowDays = calendarDaysEndingOn(asOf, 7);
  const windowStart = windowDays[0];

  return { campaigns: campaigns.map(campaign => {
    if (!SUPPORTED_PLATFORMS.has(campaign.platform)) {
      throw new Error(`Unsupported campaign platform: "${campaign.platform}". Supported platforms are meta, google, tiktok, amazon.`);
    }
    const sku = skus.find(row => row.id === campaign.sku_id);
    if (!sku) throw new Error(`Missing campaign SKU: ${campaign.sku_id}`);

    const recent = inventory.filter(row => row.sku_id === sku.id && row.date >= windowStart && row.date <= asOf);
    const snapshot = recent.find(row => row.date === asOf);
    const observedRecentDates = new Set(recent.map(row => row.date));

    if (!snapshot || observedRecentDates.size !== 7 || recent.length !== 7 || !windowDays.every(d => observedRecentDates.has(d))) {
      throw new Error(`Incomplete seven-day inventory for SKU ${sku.id}`);
    }

    const skuCampaigns = new Set(campaigns.filter(row => row.sku_id === sku.id).map(row => row.id));
    const sales = metrics.filter(row => skuCampaigns.has(row.campaign_id));
    const orders = sales.reduce((sum, row) => sum + row.orders, 0);

    const catalogPrice = (sku as { price?: unknown }).price;
    const hasCatalogPrice = typeof catalogPrice === 'number' && Number.isFinite(catalogPrice) && catalogPrice > 0;

    let price = 0;
    let isIneligible = false;

    if (orders > 0) {
      price = sales.reduce((sum, row) => sum + row.revenue, 0) / orders;
    } else if (hasCatalogPrice) {
      price = catalogPrice;
    } else {
      // Zero-order SKU without catalog price: mark ineligible for price-dependent optimization
      isIneligible = true;
      price = 0;
    }

    const average = recent.reduce((sum, row) => sum + row.units_sold, 0) / 7;
    const stock = {
      ...sku,
      price,
      units_on_hand: snapshot.units_on_hand,
      average_daily_units_sold: average,
      runway: average > 0 ? snapshot.units_on_hand / average : Infinity,
    };

    let curve: ReturnType<typeof fitCurve>;
    if (isIneligible) {
      curve = { beta: 0.7, r0: 0, s0: 0, revenue_cap: 0 };
    } else {
      curve = fitCurve(metrics.filter(row => row.campaign_id === campaign.id), stock, asOf);
    }

    return {
      ...campaign,
      sku: stock,
      curve,
      ...(isIneligible ? { floor: campaign.daily_budget } : {}),
    };
  }) };
}

// Run detectors, explain events, verify the allocation, then upsert only analysis tables.
// The allocator seam lets tests submit a broken plan to the real pre-save guardrail check.
export async function runAnalysis(repo: Repo, options: {
  inputs?: Inputs; allocatePlan?: typeof allocate; asOf?: string; from?: string;
} = {}) {
  const started = performance.now();
  const inputs = options.inputs ?? await loadAnalysisInputs(repo, options.from, options.asOf);
  const { skus, campaigns, metrics, inventory, confidence } = inputs;
  const datasetDates = getDatasetDates(metrics, inventory);
  const effectiveAsOf = options.asOf ?? datasetDates.asOf;

  // Anchor historical leak checks on each day's observation with the default elasticity,
  // rather than leaking the day-45 fit into earlier anomaly dates.
  const leaks = mergeConsecutiveFlags(metrics.flatMap(row => row.spend > 0
    ? profitLeak([row], campaigns, skus, [{ campaign_id: row.campaign_id,
      s0: row.spend, r0: row.revenue, beta: .7 }]) : []));
  const anomalies = AnomalySchema.array().parse([
    ...stockRisk(campaigns, inventory), ...madAnomalies(metrics), ...fatigue(metrics), ...leaks,
  ].map(anomaly => ({ ...anomaly, drivers: [
    ...rootCause(anomaly, campaigns, skus, metrics, inventory), ...anomaly.drivers,
  ] })).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)));
  const state = allocationState(inputs, effectiveAsOf);
  let plan: ReturnType<typeof allocate>;
  try {
    plan = (options.allocatePlan ?? allocate)(state);
    assertGuardrails(plan);
  } catch { throw new AnalysisGuardrailError(); }
  const recommendations: Recommendation[] = RecommendationSchema.array().parse(plan.moves.length ? [{
    id: `analysis:${effectiveAsOf}:budget_reallocation`, created_at: `${effectiveAsOf}T00:00:00.000Z`,
    type: 'budget_reallocation', moves: plan.moves,
    expected_profit_gain_per_day: plan.expected_profit_gain_per_day,
    confidence: confidence?.weight ?? .75,
    constraints_checked: plan.constraints_checked.map(check => check.rule),
    explanation: explainRecommendation(plan), status: 'pending',
  }] : []);
  // Both batches are validated before the first write. Stable IDs/timestamps make retries idempotent.
  await repo.saveAnomalies(anomalies);
  await repo.saveRecommendations(recommendations);
  return { asOf: effectiveAsOf, anomalies, recommendations, counts: { skus: skus.length, campaigns: campaigns.length,
    metrics: metrics.length, inventory: inventory.length, anomalies: anomalies.length,
    recommendations: recommendations.length }, topRecommendation: recommendations[0] ?? null,
    elapsedMs: performance.now() - started };
}
