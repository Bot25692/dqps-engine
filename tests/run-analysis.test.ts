import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { FixtureRepo } from '../lib/db/repo.ts';
import { allocate } from '../lib/analysis/optimize.ts';
import { AnalysisGuardrailError, runAnalysis } from '../lib/run-analysis.ts';
import { AnomalySchema, RecommendationSchema } from '../lib/types.ts';
import { POST } from '../app/api/run-analysis/route.ts';

test('seed 1 runs twice under three seconds, keeps identical rows, and moves SNK-01 money to TEE-PRM', async t => {
  const repo = new FixtureRepo({ seed: 1 });
  for (const method of ['logAction', 'saveOutcome', 'getCampaignState', 'setCampaignState', 'setConfidence', 'resetDecisions'] as const) {
    t.mock.method(repo, method, () => { throw new Error(`Forbidden access: ${method}`); });
  }
  const first = await runAnalysis(repo);
  const saved = { anomalies: await repo.getAnomalies(), recommendations: await repo.getRecommendations() };
  const second = await runAnalysis(repo);
  assert.ok(first.elapsedMs < 3000, `Cold pipeline: ${first.elapsedMs}ms`);
  assert.ok(second.elapsedMs < 3000, `Warm pipeline: ${second.elapsedMs}ms`);
  t.diagnostic(`Cold ${first.elapsedMs.toFixed(1)}ms; warm ${second.elapsedMs.toFixed(1)}ms`);
  assert.equal(first.counts.campaigns, 10);
  assert.equal(first.counts.metrics, 450);
  assert.deepEqual(await repo.getAnomalies(), saved.anomalies);
  assert.deepEqual(await repo.getRecommendations(), saved.recommendations);
  assert.deepEqual(second.anomalies, first.anomalies);
  assert.deepEqual(second.recommendations, first.recommendations);
  assert.equal(new Set(saved.anomalies.map(row => row.id)).size, saved.anomalies.length);
  assert.equal(saved.recommendations.length, 1);
  assert.ok(first.anomalies.some(row => row.drivers.length > 0));
  const campaigns = await repo.getCampaigns();
  const moves = first.topRecommendation!.moves;
  const donor = moves.find(move => campaigns.find(c => c.id === move.campaign_id)?.sku_id === 'SNK-01');
  const receiver = moves.find(move => campaigns.find(c => c.id === move.campaign_id)?.sku_id === 'TEE-PRM');
  assert.ok(donor && donor.new_budget < donor.old_budget);
  assert.ok(receiver && receiver.new_budget > receiver.old_budget);
  assert.equal(first.topRecommendation!.confidence, .75);
});

test('a broken plan never calls either save method, even with existing rows', async t => {
  const repo = new FixtureRepo({ seed: 1 });
  await runAnalysis(repo);
  const before = [await repo.getAnomalies(), await repo.getRecommendations()];
  const anomalies = t.mock.method(repo, 'saveAnomalies');
  const recommendations = t.mock.method(repo, 'saveRecommendations');
  await assert.rejects(runAnalysis(repo, { allocatePlan: state => {
    const plan = allocate(state);
    plan.moves[0].new_budget += 100000;
    return plan;
  } }), AnalysisGuardrailError);
  assert.equal(anomalies.mock.callCount(), 0);
  assert.equal(recommendations.mock.callCount(), 0);
  assert.deepEqual([await repo.getAnomalies(), await repo.getRecommendations()], before);
});

test('confidence uses the stored type weight and defaults only when absent', async t => {
  const repo = new FixtureRepo({ seed: 1 });
  t.mock.method(repo, 'getConfidence', async (type: string) => {
    assert.equal(type, 'budget_reallocation');
    return { recommendation_type: type, weight: .87, updated_at: '2026-10-07T00:00:00Z' };
  });
  assert.equal((await runAnalysis(repo)).topRecommendation!.confidence, .87);
  t.mock.method(repo, 'getConfidence', async () => null);
  assert.equal((await runAnalysis(repo)).topRecommendation!.confidence, .75);
});

test('an empty valid plan saves anomalies but no recommendation', async () => {
  const result = await runAnalysis(new FixtureRepo({ seed: 1 }), { allocatePlan: state => ({
    state, moves: [], held_back: 0, expected_profit_gain_per_day: 0,
    constraints_checked: allocate(state).constraints_checked,
  }) });
  assert.equal(result.topRecommendation, null);
  assert.equal(result.counts.recommendations, 0);
});

test('POST enforces the optional token before reads and returns a safe summary', async t => {
  const original = { ...process.env };
  t.after(() => { process.env = original; });
  process.env.DATA_SOURCE = 'fixtures';
  process.env.DEMO_ADMIN_TOKEN = 'private-demo-token';
  const reads = t.mock.method(FixtureRepo.prototype, 'getSkus');
  for (const headers of [new Headers(), new Headers({ 'x-demo-token': 'wrong' })]) {
    const response = await POST(new Request('http://localhost/api/run-analysis', { method: 'POST', headers }));
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /private-demo-token|stack/);
  }
  assert.equal(reads.mock.callCount(), 0);
  const request = () => new Request('http://localhost/api/run-analysis', {
    method: 'POST', headers: { 'x-demo-token': 'private-demo-token' },
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.counts.metrics, 450);
  assert.ok(summary.elapsedMs < 3000);
  RecommendationSchema.parse(summary.topRecommendation);
  delete process.env.DEMO_ADMIN_TOKEN;
  assert.equal((await POST(new Request('http://localhost/api/run-analysis', { method: 'POST' }))).status, 200);
  t.mock.method(FixtureRepo.prototype, 'getSkus', async () => { throw new Error('secret-key raw-stack'); });
  const failed = await POST(request());
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /secret-key|raw-stack|stack/);
});

test('POST reports guardrail rejection without saving either analysis table', async t => {
  const original = { ...process.env };
  t.after(() => { process.env = original; });
  process.env.DATA_SOURCE = 'fixtures';
  delete process.env.DEMO_ADMIN_TOKEN;
  const campaigns = await new FixtureRepo({ seed: 1 }).getCampaigns();
  campaigns[0].daily_budget = -1;
  t.mock.method(FixtureRepo.prototype, 'getCampaigns', async () => campaigns);
  const anomalies = t.mock.method(FixtureRepo.prototype, 'saveAnomalies');
  const recommendations = t.mock.method(FixtureRepo.prototype, 'saveRecommendations');
  const response = await POST(new Request('http://localhost/api/run-analysis', { method: 'POST' }));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: new AnalysisGuardrailError().message });
  assert.equal(anomalies.mock.callCount(), 0);
  assert.equal(recommendations.mock.callCount(), 0);
});

test('POST honors DATA_SOURCE and falls back to the 45-day seed on database failure', async t => {
  const original = { ...process.env };
  t.after(() => { process.env = original; });
  process.env.DATA_SOURCE = 'supabase';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-service-key';
  delete process.env.DEMO_ADMIN_TOKEN;
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('private-service-key'); });
  const response = await POST(new Request('http://localhost/api/run-analysis', { method: 'POST' }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(fetch.mock.callCount() > 0);
  assert.equal(result.dataSource, 'fixtures');
  assert.equal(result.isFallback, true);
  assert.equal(result.banner, 'Showing saved demo data');
  assert.equal(result.counts.metrics, 450);
  assert.doesNotMatch(JSON.stringify(result), /private-service-key/);
});

test('exported analysis matches the shared pipeline and exact public contracts', async () => {
  const exported = JSON.parse(await readFile(new URL('../fixtures/analysis.json', import.meta.url), 'utf8'));
  AnomalySchema.array().parse(exported.anomalies);
  RecommendationSchema.array().parse(exported.recommendations);
  const result = await runAnalysis(new FixtureRepo({ seed: 1 }));
  assert.deepEqual(exported, { anomalies: result.anomalies, recommendations: result.recommendations });
});
