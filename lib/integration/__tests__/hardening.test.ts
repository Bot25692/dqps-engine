import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/decide/route';
import { getRuntimeRepo } from '@/lib/db/runtime-repo';
import { FixtureRepo } from '@/lib/db/repo';
import { boundary } from '@/lib/simulation/boundary';
import { allocationState, loadAnalysisInputs } from '@/lib/run-analysis';
import { mapMoveToSimulation } from '@/lib/integration/adapter';
import { updateConfidence } from '@/lib/integration/confidence';
import { runSimulation } from '@/lib/simulation/engine';
import type { BudgetMove } from '@/lib/simulation/types';

const id = 'analysis:2026-10-07:budget_reallocation';
async function decide(action: string, extra: Record<string, unknown> = {}) {
  const response = await POST(new Request('http://localhost/api/decide', { method: 'POST',
    body: JSON.stringify({ recommendationId: id, action, seed: 42, ...extra }) }));
  return { status: response.status, data: await response.json() };
}
async function approve() { await decide('register'); expect((await decide('approve')).status).toBe(200); }

beforeEach(async () => { vi.restoreAllMocks(); expect((await decide('reset')).status).toBe(200); });
describe('Persisted Golden Path', () => {
  it('logs duplicate approval clicks only once', async () => {
    const log = vi.spyOn(FixtureRepo.prototype, 'logAction');
    await decide('register');
    const results = await Promise.all([decide('approve'), decide('approve')]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0].action).toBe('approved');
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(0);
  });
  it('persists approved outcome and locked confidence exactly once', async () => {
    await approve();
    const result = await decide('simulate');
    expect(result.status).toBe(200);
    const repo = await getRuntimeRepo();
    const outcomes = await repo.getOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].actual).toBe(result.data.simulationResult.portfolioGain);
    expect(outcomes[0].predicted).toBe(result.data.predictedGainPerDay * 3);
    expect(outcomes[0].error_pct).toBeCloseTo((outcomes[0].actual-outcomes[0].predicted)/Math.abs(outcomes[0].predicted)*100);
    const expected = updateConfidence({ currentConfidence: .75, errorFraction: outcomes[0].error_pct/100 });
    expect((await repo.getConfidence('budget_reallocation'))?.weight).toBe(expected.newConfidence);
    expect((await decide('simulate')).status).toBe(409);
    expect(await repo.getOutcomes()).toEqual(outcomes);
    expect((await repo.getConfidence('budget_reallocation'))?.weight).toBe(expected.newConfidence);
  });
  it('reject never saves an outcome or allows approval', async () => {
    await decide('register'); expect((await decide('reject')).status).toBe(200);
    expect((await decide('approve')).status).toBe(409);
    expect((await decide('simulate')).status).toBe(409);
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(0);
  });
  it('blocks unapproved and invalid requests', async () => {
    expect((await decide('simulate')).status).toBe(409);
    await approve();
    expect((await decide('simulate', { seed: 1.5 })).status).toBe(400);
    const rec = (await (await getRuntimeRepo()).getRecommendations())[0];
    expect((await decide('simulate', { recommendation: { ...rec, expected_profit_gain_per_day: 999999 } })).status).toBe(400);
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(0);
  });
  it('failed simulation does not save an outcome', async () => {
    await approve();
    vi.spyOn(boundary, 'runApprovedSimulation').mockReturnValueOnce({ ok: false, recommendationId: id, status: 'approved', error: 'test failure' });
    expect((await decide('simulate')).status).toBe(409);
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(0);
  });
  it('serializes concurrent duplicate simulation requests', async () => {
    await approve();
    const results = await Promise.all([decide('simulate'), decide('simulate')]);
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(1);
  });
  it('retries a failed outcome save without rerunning simulation or compounding confidence', async () => {
    await approve();
    const simulation = vi.spyOn(boundary, 'runApprovedSimulation');
    vi.spyOn(FixtureRepo.prototype, 'saveOutcome').mockRejectedValueOnce(new Error('write failed'));
    expect((await decide('simulate')).status).toBe(500);
    const repo = await getRuntimeRepo();
    expect(await repo.getOutcomes()).toHaveLength(0);
    const confidence = await repo.getConfidence('budget_reallocation');
    expect((await decide('simulate')).status).toBe(200);
    expect(simulation).toHaveBeenCalledTimes(1);
    expect(await repo.getConfidence('budget_reallocation')).toEqual(confidence);
    expect(await repo.getOutcomes()).toHaveLength(1);
  });
  it('reset clears outcomes and confidence and replays deterministically', async () => {
    await approve(); const first = await decide('simulate');
    await decide('reset');
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(0);
    expect((await (await getRuntimeRepo()).getConfidence('budget_reallocation'))?.weight ?? .75).toBe(.75);
    await approve(); const second = await decide('simulate');
    expect(second.data.actualGain).toBe(first.data.actualGain);
  });
  it('maps the existing fitted A beta into every simulated campaign', async () => {
    const state = allocationState(await loadAnalysisInputs(await getRuntimeRepo()));
    const spy = vi.spyOn(boundary, 'runApprovedSimulation');
    await approve(); expect((await decide('simulate')).status).toBe(200);
    const plan = spy.mock.calls[0][0] as { moves: BudgetMove[] };
    for (const move of plan.moves) expect(move.betaEst).toBe(state.campaigns.find(c => c.id === move.receiverCampaignId)?.curve.beta);
    expect(plan.moves.some(m => m.amountPerDay < 0)).toBe(true);
  });
});
describe('Simulation financial boundaries', () => {
  const move: BudgetMove = { donorCampaignId: 'd', receiverCampaignId: 'r', receiverSkuId: 'sku', amountPerDay: 40,
    betaEst: .7, receiverRevenue: 100, receiverSpend: 100, receiverMarginRate: .6,
    receiverInventoryUnits: 1, receiverAvgDailyUnitsSold: 10 };
  it('caps shared stock and stops revenue after depletion', () => {
    const result = runSimulation({ recommendationId: id, approvedAt: Date.now(), moves: [move, { ...move, receiverCampaignId: 'r2' }] }, 42);
    expect(result.moveResults[0].days[0].revenue).toBeLessThan(100);
    expect(result.moveResults[1].days.every(d => d.revenue === 0)).toBe(true);
    expect(result.moveResults.every(m => m.days.every(d => d.inventoryUnits === 0))).toBe(true);
  });
  it('keeps the locked beta fallback and clamps supplied beta', () => {
    const change = { campaign_id: 'r', old_budget: 100, new_budget: 140, reason: 'test' };
    const enrichment = { campaign_id: 'r', revenue: 100, spend: 100, margin_rate: .6, inventory_units: 100, avg_daily_units_sold: 10, beta_est: NaN };
    expect(mapMoveToSimulation(change, [change], new Map([['r', enrichment]]), 300)?.betaEst).toBe(.7);
    expect(mapMoveToSimulation(change, [change], new Map([['r', { ...enrichment, beta_est: 2 }]]), 300)?.betaEst).toBe(.9);
  });
});
