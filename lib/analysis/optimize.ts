import type { Campaign, MetricRow, Move, Recommendation, Sku } from '../types';

// Fit only the thirty calendar days ending at the supplied as-of date (or latest observation).
const FIT_DAYS = 30, DAY_MS = 86_400_000;
// Elasticities outside this range are too aggressive; almost constant spend uses the default.
const MIN_BETA = .4, MAX_BETA = .9, DEFAULT_BETA = .7;
// Less than 1% standard deviation in log spend cannot reliably identify elasticity.
const MIN_LOG_VARIANCE = .01 ** 2;
// Stock below three days forces cuts; receivers must retain seven days after uplift.
const FORCE_DAYS = 3, COVER_DAYS = 7;
// Ordinary donors lose at most 30%, receivers gain at most 40%, and platforms retain 60%.
const DONOR_CAP = .30, RECEIVER_CAP = .40, PLATFORM_FLOOR = .60;
// Discretionary transfers use INR 500 and require more than five paise of marginal advantage.
const STEP = 500, MIN_ADVANTAGE = .05;
// Publish only plans earning at least INR 300 daily, with at most five changed campaigns.
const MIN_GAIN = 300, MAX_MOVES = 5;
// This absolute tolerance absorbs floating-point noise, not meaningful money or cover differences.
const EPS = 1e-7;

export interface StockSku extends Pick<Sku, 'id' | 'margin_rate'> {
  price: number;
  units_on_hand: number;
  average_daily_units_sold: number;
  // The caller computes runway from seven days of SKU sales across all channels.
  runway: number;
}

export interface Curve { beta: number; r0: number; s0: number; revenue_cap: number }
export interface AllocationCampaign extends Pick<Campaign, 'id' | 'platform' | 'daily_budget'> {
  curve: Curve;
  sku: StockSku;
  // Optional campaign minimum; zero allows a stock-forced pause when the platform floor permits it.
  floor?: number;
}
export interface AllocationState { campaigns: readonly AllocationCampaign[] }
export type ConstraintRule = 'budget conserved' | 'donor cap' | 'receiver cap' | 'platform floor'
  | 'receiver cover' | 'min gain' | 'max moves';
export interface AllocationPlan extends Pick<Recommendation, 'moves' | 'expected_profit_gain_per_day'> {
  // This is an analysis result, not a persisted Recommendation: that contract has string checks.
  constraints_checked: { rule: ConstraintRule; pass: boolean }[];
  held_back: number;
  // Keep a detached snapshot so guardrails can recompute the facts rather than trust pass flags.
  state: AllocationState;
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

// Regress positive daily observations in log space, anchoring at means including zero-activity days.
// Supply one campaign's series; missing days remain unknown rather than invented zero observations.
export function fitCurve(metrics: readonly Pick<MetricRow, 'campaign_id' | 'date' | 'spend' | 'revenue'>[],
  sku: Pick<StockSku, 'runway' | 'units_on_hand' | 'price'>, asOf?: string): Curve {
  if (!nonnegative(sku.units_on_hand) || !nonnegative(sku.price) || !(sku.runway >= 0)) {
    throw new Error('Invalid stock inputs');
  }
  if (metrics.some(row => !Number.isFinite(day(row.date)) || !nonnegative(row.spend) || !nonnegative(row.revenue))) {
    throw new Error('Invalid daily metrics');
  }
  if (new Set(metrics.map(row => row.campaign_id)).size > 1) throw new Error('Fit one campaign at a time');
  const end = asOf === undefined ? Math.max(...metrics.map(row => day(row.date))) : day(asOf);
  if (asOf !== undefined && !Number.isFinite(end)) throw new Error('Invalid as-of date');
  const rows = metrics.filter(row => day(row.date) > end - FIT_DAYS && day(row.date) <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(rows.map(row => row.date)).size !== rows.length) throw new Error('Duplicate daily metrics');
  const s0 = rows.length ? sum(rows.map(row => row.spend)) / rows.length : 0;
  const r0 = rows.length ? sum(rows.map(row => row.revenue)) / rows.length : 0;
  // Zero spend or revenue has no logarithm and cannot be a regression observation.
  const points = rows.filter(row => row.spend > 0 && row.revenue > 0)
    .map(row => ({ x: Math.log(row.spend), y: Math.log(row.revenue) }));
  let beta = DEFAULT_BETA;
  // A slope needs at least two observations with meaningfully different spend.
  if (points.length >= 2) {
    const x = sum(points.map(p => p.x)) / points.length, y = sum(points.map(p => p.y)) / points.length;
    const variance = sum(points.map(p => (p.x - x) ** 2));
    if (variance / points.length >= MIN_LOG_VARIANCE) {
      beta = Math.max(MIN_BETA, Math.min(MAX_BETA, sum(points.map(p => (p.x - x) * (p.y - y))) / variance));
    }
  }
  return { beta, r0, s0, revenue_cap: sku.runway < FORCE_DAYS ? sku.units_on_hand * sku.price : Infinity };
}

// Evaluate the anchored curve without inventing revenue for an unobserved spend baseline.
export function revenue(spend: number, curve: Curve): number {
  if (!nonnegative(spend)) throw new Error('Spend must be finite and nonnegative');
  if (spend === 0 || curve.s0 === 0 || curve.r0 === 0) return 0;
  return Math.min(curve.revenue_cap, curve.r0 * (spend / curve.s0) ** curve.beta);
}

// Compute the requested marginal-profit score per rupee using the stock-capped revenue estimate.
export function marginalProfit(spend: number, curve: Curve, marginRate: number): number {
  const value = revenue(spend, curve);
  if (curve.s0 === 0 || curve.r0 === 0 || marginRate === 0 || curve.revenue_cap === 0) return -1;
  if (spend === 0) return Infinity; // The power curve's right derivative diverges at zero.
  return marginRate * curve.beta * value / spend - 1;
}

// Reapply current inventory to supplied curves so stale fits cannot ignore stock protection.
function effectiveCurve(c: AllocationCampaign): Curve {
  return { ...c.curve, revenue_cap: c.sku.runway < FORCE_DAYS
    ? Math.min(c.curve.revenue_cap, c.sku.units_on_hand * c.sku.price) : c.curve.revenue_cap };
}

// Reject malformed state before optimization or verification, including inconsistent copies of a SKU.
function validateState(state: AllocationState): void {
  const ids = new Set<string>(), skus = new Map<string, StockSku>();
  for (const c of state.campaigns) {
    if (!c.id || ids.has(c.id) || !['meta', 'google', 'tiktok', 'amazon'].includes(c.platform)
      || !nonnegative(c.daily_budget) || !nonnegative(c.floor ?? 0) || (c.floor ?? 0) > c.daily_budget
      || !nonnegative(c.curve.r0) || !nonnegative(c.curve.s0)
      || !(c.curve.beta >= MIN_BETA && c.curve.beta <= MAX_BETA) || !(c.curve.revenue_cap >= 0)
      || !c.sku.id || !nonnegative(c.sku.price) || !nonnegative(c.sku.units_on_hand)
      || !nonnegative(c.sku.average_daily_units_sold) || !(c.sku.runway >= 0)
      || !(c.sku.margin_rate >= 0 && c.sku.margin_rate <= 1)) throw new Error('Invalid allocation state');
    ids.add(c.id);
    const previous = skus.get(c.sku.id);
    if (previous && (Object.keys(previous) as (keyof StockSku)[]).some(key => previous[key] !== c.sku[key])) {
      throw new Error('Inconsistent stock for shared SKU');
    }
    skus.set(c.sku.id, c.sku);
  }
}

// Count SKU-wide demand once, adding each campaign's positive uplift conservatively.
// Cuts do not manufacture stock cover for another campaign sharing the same SKU.
function receiverCover(campaigns: readonly AllocationCampaign[], budgets: readonly number[], sku: StockSku): number {
  let uplift = 1;
  for (let i = 0; i < campaigns.length; i++) {
    const c = campaigns[i];
    if (c.sku.id !== sku.id || budgets[i] <= c.daily_budget) continue;
    const before = revenue(c.daily_budget, effectiveCurve(c));
    if (before === 0) return 0; // Unknown uplift is ineligible, even when historical sales were zero.
    uplift += Math.max(0, revenue(budgets[i], effectiveCurve(c)) / before - 1);
  }
  const demand = sku.average_daily_units_sold * uplift;
  return demand > 0 ? sku.units_on_hand / demand : Infinity;
}

// Recompute all seven guardrails from budgets and the saved input snapshot.
function checks(state: AllocationState, budgets: readonly number[], held: number, gain: number): AllocationPlan['constraints_checked'] {
  const campaigns = state.campaigns;
  const changed = campaigns.filter((c, i) => budgets[i] !== c.daily_budget);
  return [
    { rule: 'budget conserved', pass: nonnegative(held) && Math.abs(sum(budgets) + held - sum(campaigns.map(c => c.daily_budget))) <= EPS },
    { rule: 'donor cap', pass: campaigns.every((c, i) => budgets[i] >= (c.floor ?? 0) - EPS
      && budgets[i] >= (c.sku.runway < FORCE_DAYS ? 0 : c.daily_budget * (1 - DONOR_CAP)) - EPS) },
    { rule: 'receiver cap', pass: campaigns.every((c, i) => budgets[i] <= c.daily_budget * (1 + RECEIVER_CAP) + EPS) },
    { rule: 'platform floor', pass: campaigns.every(c => sum(campaigns.map((p, i) => p.platform === c.platform ? budgets[i] : 0))
      >= PLATFORM_FLOOR * sum(campaigns.map(p => p.platform === c.platform ? p.daily_budget : 0)) - EPS) },
    { rule: 'receiver cover', pass: campaigns.every((c, i) => budgets[i] <= c.daily_budget
      || (c.sku.runway >= FORCE_DAYS && receiverCover(campaigns, budgets, c.sku) >= COVER_DAYS - EPS)) },
    // An empty result is a valid decision to make no recommendation, with zero gain and cash held.
    { rule: 'min gain', pass: Number.isFinite(gain) && (changed.length ? gain >= MIN_GAIN - EPS : gain === 0 && held === 0) },
    { rule: 'max moves', pass: changed.length <= MAX_MOVES },
  ];
}

// Compute daily contribution-profit change, including savings when money is held back.
function profitGain(campaigns: readonly AllocationCampaign[], budgets: readonly number[]): number {
  return sum(campaigns.map((c, i) => c.sku.margin_rate
    * (revenue(budgets[i], effectiveCurve(c)) - revenue(c.daily_budget, effectiveCurve(c))) - (budgets[i] - c.daily_budget)));
}

// Cut stock-forced donors first, then greedily transfer INR 500 while respecting every hard limit.
// The result has at most five changed campaigns; plans below the gain threshold become no-ops.
export function allocate(input: AllocationState): AllocationPlan {
  validateState(input);
  const campaigns = input.campaigns.map(c => ({ ...c, curve: { ...c.curve }, sku: { ...c.sku } }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const state = { campaigns };
  let budgets = campaigns.map(c => c.daily_budget), held = 0;
  const slotsFit = (next: number[]) => next.filter((b, i) => b !== campaigns[i].daily_budget).length <= MAX_MOVES;
  const platformFits = (next: number[]) => checks(state, next, 0, 0).find(c => c.rule === 'platform floor')!.pass;
  const receiverFits = (i: number, next: number[]) => {
    const c = campaigns[i];
    return c.sku.runway >= FORCE_DAYS && next[i] <= c.daily_budget * (1 + RECEIVER_CAP) + EPS
      && receiverCover(campaigns, next, c.sku) >= COVER_DAYS - EPS && slotsFit(next);
  };
  const marginal = (i: number) => marginalProfit(budgets[i], effectiveCurve(campaigns[i]), campaigns[i].sku.margin_rate);
  for (let i = 0; i < campaigns.length; i++) {
    const c = campaigns[i];
    if (c.sku.runway >= FORCE_DAYS) continue;
    const platformTotal = sum(campaigns.map((p, j) => p.platform === c.platform ? budgets[j] : 0));
    const platformMinimum = PLATFORM_FLOOR * sum(campaigns.map(p => p.platform === c.platform ? p.daily_budget : 0));
    const cut = Math.max(0, Math.min(budgets[i] - (c.floor ?? 0), platformTotal - platformMinimum));
    const next = [...budgets]; next[i] -= cut;
    if (slotsFit(next)) { budgets = next; held += cut; }
  }
  // Released stock budget is placed first; a residual below INR 500 remains explicitly held.
  // Require a positive finite-step gain as well as a positive marginal profit to avoid overshooting.
  while (true) {
    const receivers = campaigns.map((_, i) => i).filter(i => {
      const next = [...budgets]; next[i] += STEP;
      return receiverFits(i, next) && marginal(i) > 0;
    }).sort((a, b) => marginal(b) - marginal(a) || a - b);
    let nextBudgets: number[] | undefined, nextHeld = held;
    for (const receiver of receivers) {
      if (held + EPS >= STEP) {
        const next = [...budgets]; next[receiver] += STEP;
        if (profitGain(campaigns, next) > profitGain(campaigns, budgets) + EPS) {
          nextBudgets = next; nextHeld = Math.max(0, held - STEP); break;
        }
      }
      const donors = campaigns.map((_, i) => i).filter(i => i !== receiver)
        .sort((a, b) => marginal(a) - marginal(b) || a - b);
      for (const donor of donors) {
        const c = campaigns[donor], next = [...budgets];
        next[donor] -= STEP; next[receiver] += STEP;
        const minimum = Math.max(c.floor ?? 0, c.sku.runway < FORCE_DAYS ? 0 : c.daily_budget * (1 - DONOR_CAP));
        if (next[donor] < minimum - EPS || !slotsFit(next) || !platformFits(next)
          || !receiverFits(receiver, next) || marginal(receiver) - marginal(donor) <= MIN_ADVANTAGE) continue;
        if (profitGain(campaigns, next) <= profitGain(campaigns, budgets) + EPS) continue;
        nextBudgets = next; break;
      }
      if (nextBudgets) break;
    }
    if (nextBudgets) { budgets = nextBudgets; held = nextHeld; continue; }
    // With no positive eligible receiver, stop wasting spend on negative-marginal ordinary donors.
    if (!receivers.length) {
      const donors = campaigns.map((_, i) => i).sort((a, b) => marginal(a) - marginal(b) || a - b);
      for (const donor of donors) {
        const c = campaigns[donor], next = [...budgets]; next[donor] -= STEP;
        const minimum = Math.max(c.floor ?? 0, c.sku.runway < FORCE_DAYS ? 0 : c.daily_budget * (1 - DONOR_CAP));
        if (marginal(donor) >= 0 || next[donor] < minimum - EPS || !slotsFit(next) || !platformFits(next)
          || profitGain(campaigns, next) <= profitGain(campaigns, budgets) + EPS) continue;
        nextBudgets = next; held += STEP; break;
      }
    }
    if (!nextBudgets) break;
    budgets = nextBudgets;
  }
  let gain = profitGain(campaigns, budgets);
  if (gain < MIN_GAIN) { budgets = campaigns.map(c => c.daily_budget); held = 0; gain = 0; }
  const moves: Move[] = campaigns.flatMap((c, i) => budgets[i] === c.daily_budget ? [] : [{
    campaign_id: c.id, old_budget: c.daily_budget, new_budget: budgets[i],
    reason: budgets[i] > c.daily_budget ? 'Increase profitable spend with at least seven days of projected cover.'
      : c.sku.runway < FORCE_DAYS ? 'Protect stock below three days of cover.' : 'Release spend with lower marginal profit.',
  }]);
  const plan: AllocationPlan = { moves, expected_profit_gain_per_day: gain, held_back: held, state,
    constraints_checked: checks(state, budgets, held, gain) };
  assertGuardrails(plan);
  return plan;
}

// Verify the actual plan, including tampered amounts, profit claims, missing rules, and stale pass flags.
export function assertGuardrails(plan: AllocationPlan): void {
  validateState(plan.state);
  const campaigns = plan.state.campaigns, budgets = campaigns.map(c => c.daily_budget), seen = new Set<string>();
  for (const move of plan.moves) {
    const i = campaigns.findIndex(c => c.id === move.campaign_id);
    if (i < 0 || seen.has(move.campaign_id) || !nonnegative(move.new_budget)
      || move.old_budget !== budgets[i] || move.new_budget === move.old_budget || !move.reason) throw new Error('Invalid move');
    seen.add(move.campaign_id); budgets[i] = move.new_budget;
  }
  const gain = profitGain(campaigns, budgets);
  if (!Number.isFinite(plan.expected_profit_gain_per_day) || !Number.isFinite(gain)
    || Math.abs(gain - plan.expected_profit_gain_per_day) > EPS) throw new Error('Incorrect expected profit gain');
  const actual = checks(plan.state, budgets, plan.held_back, gain);
  if (plan.constraints_checked.length !== actual.length) throw new Error('Missing or duplicate guardrail checks');
  for (const check of actual) {
    const saved = plan.constraints_checked.filter(c => c.rule === check.rule);
    if (!check.pass || saved.length !== 1 || saved[0].pass !== true) throw new Error(`Guardrail failed: ${check.rule}`);
  }
}
