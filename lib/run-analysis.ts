import type { Repo } from './db/repo.ts';
import { AnomalySchema, RecommendationSchema, type Recommendation } from './types.ts';
import { stockRisk, madAnomalies, fatigue, profitLeak, mergeConsecutiveFlags } from './analysis/detect.ts';
import { rootCause } from './analysis/rootcause.ts';
import { fitCurve, allocate, assertGuardrails, type AllocationState } from './analysis/optimize.ts';

// The demo's fixed 45-day window must not drift with the server's clock.
export const ANALYSIS_FROM = '2026-08-24';
export const ANALYSIS_AS_OF = '2026-10-07';

// Load all inputs in one repository operation so fallback can retry a coherent snapshot.
export async function loadAnalysisInputs(repo: Repo) {
  const [skus, campaigns, metrics, inventory, confidence] = await Promise.all([
    repo.getSkus(), repo.getCampaigns(), repo.getMetrics(ANALYSIS_FROM, ANALYSIS_AS_OF),
    repo.getInventory(ANALYSIS_FROM, ANALYSIS_AS_OF), repo.getConfidence('budget_reallocation'),
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
function allocationState({ skus, campaigns, metrics, inventory }: Inputs): AllocationState {
  return { campaigns: campaigns.map(campaign => {
    const sku = skus.find(row => row.id === campaign.sku_id);
    if (!sku) throw new Error('Missing campaign SKU');
    const recent = inventory.filter(row => row.sku_id === sku.id && row.date >= '2026-10-01'
      && row.date <= ANALYSIS_AS_OF);
    const snapshot = recent.find(row => row.date === ANALYSIS_AS_OF);
    if (!snapshot || new Set(recent.map(row => row.date)).size !== 7 || recent.length !== 7) {
      throw new Error('Incomplete seven-day inventory');
    }
    const skuCampaigns = new Set(campaigns.filter(row => row.sku_id === sku.id).map(row => row.id));
    const sales = metrics.filter(row => skuCampaigns.has(row.campaign_id));
    const orders = sales.reduce((sum, row) => sum + row.orders, 0);
    if (orders === 0) throw new Error('Cannot estimate SKU price without orders');
    const average = recent.reduce((sum, row) => sum + row.units_sold, 0) / 7;
    const stock = { ...sku, price: sales.reduce((sum, row) => sum + row.revenue, 0) / orders,
      units_on_hand: snapshot.units_on_hand, average_daily_units_sold: average,
      runway: average > 0 ? snapshot.units_on_hand / average : Infinity };
    return { ...campaign, sku: stock,
      curve: fitCurve(metrics.filter(row => row.campaign_id === campaign.id), stock, ANALYSIS_AS_OF) };
  }) };
}

// Run detectors, explain events, verify the allocation, then upsert only analysis tables.
// The allocator seam lets tests submit a broken plan to the real pre-save guardrail check.
export async function runAnalysis(repo: Repo, options: {
  inputs?: Inputs; allocatePlan?: typeof allocate;
} = {}) {
  const started = performance.now();
  const inputs = options.inputs ?? await loadAnalysisInputs(repo);
  const { skus, campaigns, metrics, inventory, confidence } = inputs;
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
  const state = allocationState(inputs);
  let plan: ReturnType<typeof allocate>;
  try {
    plan = (options.allocatePlan ?? allocate)(state);
    assertGuardrails(plan);
  } catch { throw new AnalysisGuardrailError(); }
  const recommendations: Recommendation[] = RecommendationSchema.array().parse(plan.moves.length ? [{
    id: `analysis:${ANALYSIS_AS_OF}:budget_reallocation`, created_at: `${ANALYSIS_AS_OF}T00:00:00.000Z`,
    type: 'budget_reallocation', moves: plan.moves,
    expected_profit_gain_per_day: plan.expected_profit_gain_per_day,
    confidence: confidence?.weight ?? .75,
    constraints_checked: plan.constraints_checked.map(check => check.rule),
    explanation: explainRecommendation(plan), status: 'pending',
  }] : []);
  // Both batches are validated before the first write. Stable IDs/timestamps make retries idempotent.
  await repo.saveAnomalies(anomalies);
  await repo.saveRecommendations(recommendations);
  return { anomalies, recommendations, counts: { skus: skus.length, campaigns: campaigns.length,
    metrics: metrics.length, inventory: inventory.length, anomalies: anomalies.length,
    recommendations: recommendations.length }, topRecommendation: recommendations[0] ?? null,
    elapsedMs: performance.now() - started };
}
