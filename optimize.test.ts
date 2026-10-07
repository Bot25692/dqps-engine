import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { allocate, assertGuardrails, fitCurve, marginalProfit, revenue } from '../lib/analysis/optimize.ts';
import type { AllocationCampaign, AllocationPlan, Curve, StockSku } from '../lib/analysis/optimize.ts';
import type { Campaign, InventoryRow, MetricRow } from '../lib/types.ts';
import { MoveSchema } from '../lib/types.ts';

const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const sku = (id: string, overrides: Partial<StockSku> = {}): StockSku => ({
  id, margin_rate: .5, price: 100, units_on_hand: 1000, average_daily_units_sold: 10, runway: 100, ...overrides,
});
const curve = (spend = 10000, roas = 4): Curve => ({ s0: spend, r0: spend * roas, beta: .7, revenue_cap: Infinity });
const campaign = (id: string, roas: number, overrides: Partial<AllocationCampaign> = {}): AllocationCampaign => ({
  id, platform: 'meta', daily_budget: 10000, curve: curve(10000, roas), sku: sku(id), ...overrides,
});
const date = (i: number) => new Date(Date.UTC(2026, 0, i)).toISOString().slice(0, 10);
const series = (beta: number) => Array.from({ length: 40 }, (_, i) => ({
  campaign_id: 'c', date: date(i + 1), spend: 1000 + i * 100, revenue: 5000 * ((1000 + i * 100) / 1000) ** beta,
}));

test('log regression uses the last 30 calendar days, clamps slopes, and anchors means', () => {
  for (const beta of [.1, .4, .65, .9, 1.2]) {
    const rows = series(beta), fitted = fitCurve(rows, sku('c'));
    close(fitted.beta, Math.max(.4, Math.min(.9, beta)));
    close(fitted.s0, rows.slice(10).reduce((s, r) => s + r.spend, 0) / 30);
    close(fitted.r0, rows.slice(10).reduce((s, r) => s + r.revenue, 0) / 30);
    close(revenue(fitted.s0, fitted), fitted.r0);
    assert.deepEqual(fitCurve([...rows].reverse(), sku('c')), fitted);
    assert.deepEqual(fitCurve(rows, sku('c'), date(30)), fitCurve(rows.slice(0, 30), sku('c')));
  }
  const rows = series(.8).map(r => ({ ...r, spend: 1000 }));
  assert.equal(fitCurve(rows, sku('c')).beta, .7);
  assert.equal(fitCurve(rows.map((r, i) => ({ ...r, spend: 1000 + i / 100 })), sku('c')).beta, .7);
  assert.equal(revenue(500, fitCurve([], sku('c'))), 0);
  const zeros = fitCurve(rows.map(r => ({ ...r, spend: 0, revenue: 0 })), sku('c'));
  assert.equal(marginalProfit(0, zeros, .5), -1);
  assert.throws(() => fitCurve([rows[0], rows[0]], sku('c')));
  assert.throws(() => fitCurve([{ ...rows[0], spend: NaN }], sku('c')));
  assert.throws(() => fitCurve([rows[0], { ...rows[1], campaign_id: 'other' }], sku('c')));
});

test('stock caps revenue strictly below three days and marginal scoring uses capped revenue', () => {
  const capped = fitCurve(series(.7), sku('c', { runway: 2, units_on_hand: 1, price: 100 }));
  assert.equal(revenue(10000, capped), 100);
  close(marginalProfit(10000, capped, .5), .5 * .7 * 100 / 10000 - 1);
  assert.equal(revenue(0, capped), 0);
  assert.equal(fitCurve(series(.7), sku('c', { runway: 3 })).revenue_cap, Infinity);
});

test('hand-calculated beta 0.7 marginal profits match the three hero products', () => {
  close(marginalProfit(30000, curve(30000, 4.8), .45), .512);
  close(marginalProfit(25000, curve(25000, 4.1), .61), .7507);
  close(marginalProfit(22000, curve(22000, 3.4), .18), -.5716);
});

// Independently verify published budgets, stock, caps, platform totals, and the profit formula.
function verify(plan: AllocationPlan): void {
  const campaigns = plan.state.campaigns;
  const budgets = campaigns.map(c => plan.moves.find(m => m.campaign_id === c.id)?.new_budget ?? c.daily_budget);
  close(budgets.reduce((s, b) => s + b, 0) + plan.held_back, campaigns.reduce((s, c) => s + c.daily_budget, 0));
  let gain = 0;
  for (let i = 0; i < campaigns.length; i++) {
    const c = campaigns[i], b = budgets[i];
    assert.ok(b >= (c.floor ?? 0) - 1e-7);
    assert.ok(b >= (c.sku.runway < 3 ? 0 : c.daily_budget * .7) - 1e-7);
    assert.ok(b <= c.daily_budget * 1.4 + 1e-7);
    const r = (s: number) => s === 0 || c.curve.s0 === 0 ? 0 : Math.min(c.curve.revenue_cap,
      c.sku.runway < 3 ? c.sku.units_on_hand * c.sku.price : Infinity, c.curve.r0 * (s / c.curve.s0) ** c.curve.beta);
    gain += c.sku.margin_rate * (r(b) - r(c.daily_budget)) - (b - c.daily_budget);
    if (b > c.daily_budget) {
      assert.ok(c.sku.units_on_hand / (c.sku.average_daily_units_sold * r(b) / r(c.daily_budget)) >= 7 - 1e-7);
    }
    const peers = campaigns.map((p, j) => ({ p, budget: budgets[j] })).filter(row => row.p.platform === c.platform);
    assert.ok(peers.reduce((s, row) => s + row.budget, 0) >= .6 * peers.reduce((s, row) => s + row.p.daily_budget, 0) - 1e-7);
  }
  close(gain, plan.expected_profit_gain_per_day);
  assert.ok(gain >= 0);
  assert.ok(plan.moves.length <= 5);
  assert.ok(!plan.moves.length || gain >= 300 - 1e-7);
  MoveSchema.array().parse(plan.moves);
  assert.equal(plan.constraints_checked.length, 7);
  assert.ok(plan.constraints_checked.every(c => c.pass));
  assertGuardrails(plan);
}

test('100 reproducible random states conserve cash, respect guardrails, and do not mutate inputs', () => {
  let seed = 712;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  let recommendations = 0;
  for (let run = 0; run < 100; run++) {
    const campaigns = Array.from({ length: 3 + Math.floor(random() * 10) }, (_, i) => {
      const budget = Math.floor(random() * 60000), demand = 1 + random() * 100, runway = random() * 30;
      return campaign(`c${i}`, 1, { daily_budget: budget,
        platform: (['meta', 'amazon', 'tiktok', 'google'] as const)[i % 4],
        floor: random() * budget * .3,
        curve: { ...curve(budget, random() * 8), beta: .4 + random() * .5 },
        sku: sku(`s${i}`, { average_daily_units_sold: demand, units_on_hand: demand * runway,
          runway, margin_rate: random(), price: 100 + random() * 1000 }),
      });
    });
    const state = { campaigns }, before = structuredClone(state), plan = allocate(state);
    verify(plan);
    assert.deepEqual(allocate(state), plan);
    assert.deepEqual(allocate({ campaigns: [...campaigns].reverse() }), plan);
    assert.deepEqual(state, before);
    recommendations += Number(plan.moves.length > 0);
  }
  assert.ok(recommendations > 50, 'Random test must exercise real recommendations, not only no-ops');
});

test('seed 1 day 45 cuts SNK-01 and gives Premium T-Shirt budget', async () => {
  const data = JSON.parse(await readFile(new URL('../fixtures/seed-1.json', import.meta.url), 'utf8')) as {
    as_of: string; campaigns: Campaign[]; metrics: MetricRow[]; inventory: InventoryRow[];
    products: { id: string; price: number; margin_rate: number }[];
  };
  const state = { campaigns: data.campaigns.map(c => {
    const product = data.products.find(p => p.id === c.sku_id)!;
    const inventory = data.inventory.filter(r => r.sku_id === c.sku_id && r.date <= data.as_of)
      .sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
    const average = inventory.reduce((s, r) => s + r.units_sold, 0) / 7;
    const stock = sku(product.id, { ...product, units_on_hand: inventory.at(-1)!.units_on_hand,
      average_daily_units_sold: average, runway: inventory.at(-1)!.units_on_hand / average });
    return { ...c, sku: stock, curve: fitCurve(data.metrics.filter(m => m.campaign_id === c.id), stock, data.as_of) };
  }) };
  const plan = allocate(state);
  verify(plan);
  const sneaker = plan.moves.find(m => state.campaigns.find(c => c.id === m.campaign_id)?.sku.id === 'SNK-01');
  const premium = plan.moves.find(m => state.campaigns.find(c => c.id === m.campaign_id)?.sku.id === 'TEE-PRM');
  assert.ok(sneaker && sneaker.new_budget < sneaker.old_budget);
  assert.ok(premium && premium.new_budget > premium.old_budget);
});

test('cash without a profitable home is held; small gains produce no recommendation', () => {
  const plan = allocate({ campaigns: [campaign('loss', 1)] });
  verify(plan);
  assert.equal(plan.moves[0].new_budget, 7000);
  assert.equal(plan.held_back, 3000);
  const noOp = allocate({ campaigns: [campaign('small', 1, { daily_budget: 100, curve: curve(100, 1) })] });
  assert.deepEqual(noOp.moves, []);
  assert.equal(noOp.held_back, 0);
  verify(allocate({ campaigns: [] }));
});

test('forced donors can exceed 30% but cannot breach campaign or platform floors', () => {
  const c = campaign('forced', 4, { sku: sku('forced', { runway: 0, units_on_hand: 0 }) });
  const plan = allocate({ campaigns: [c] });
  verify(plan);
  assert.equal(plan.moves[0].new_budget, 6000);
  assert.equal(allocate({ campaigns: [{ ...c, floor: 8000 }] }).moves[0].new_budget, 8000);
  const paused = allocate({ campaigns: [c, campaign('healthy', 4, { daily_budget: 30000, curve: curve(30000, 4) })] });
  verify(paused);
  assert.equal(paused.moves.find(m => m.campaign_id === 'forced')!.new_budget, 0);
});

test('receivers at seven days cannot take uplift, and shared SKUs cannot double-spend cover', () => {
  const stock = sku('shared', { units_on_hand: 80, average_daily_units_sold: 10, runway: 8 });
  const state = { campaigns: [campaign('donor', 1, { daily_budget: 40000, curve: curve(40000, 1) }),
    campaign('a', 8, { sku: stock }), campaign('b', 8, { sku: stock })] };
  const plan = allocate(state);
  verify(plan);
  const demandMultiplier = 1 + ['a', 'b'].reduce((total, id) => {
    const m = plan.moves.find(m => m.campaign_id === id);
    return total + (m ? (m.new_budget / m.old_budget) ** .7 - 1 : 0);
  }, 0);
  assert.ok(80 / (10 * demandMultiplier) >= 7 - 1e-7);
  const blocked = allocate({ campaigns: [campaign('donor', 1), campaign('receiver', 8, {
    sku: sku('receiver', { units_on_hand: 70, runway: 7 }),
  })] });
  assert.ok(!blocked.moves.some(m => m.campaign_id === 'receiver'));
});

test('guardrails reject tampered budgets, claimed gains, missing checks, and forged passing flags', () => {
  const plan = allocate({ campaigns: [campaign('loss', 1)] });
  for (const mutate of [
    (p: AllocationPlan) => { p.held_back += 1; },
    (p: AllocationPlan) => { p.expected_profit_gain_per_day += 1; },
    (p: AllocationPlan) => { p.constraints_checked.pop(); },
    (p: AllocationPlan) => { p.constraints_checked[0].pass = false; },
    (p: AllocationPlan) => { p.moves.push({ ...p.moves[0] }); },
    (p: AllocationPlan) => { p.moves[0].old_budget += 1; },
  ]) {
    const changed = structuredClone(plan); mutate(changed);
    assert.throws(() => assertGuardrails(changed));
  }
  const changed = structuredClone(plan);
  changed.moves[0].new_budget = 5000;
  changed.held_back = 5000;
  changed.expected_profit_gain_per_day = .5 * (revenue(5000, curve(10000, 1)) - 10000) + 5000;
  assert.throws(() => assertGuardrails(changed), /donor cap/);
});

test('optimizer imports neither database nor simulation code', async () => {
  const source = await readFile(new URL('../lib/analysis/optimize.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:import|require).*['"][^'"]*(?:db|simulation)/);
});
