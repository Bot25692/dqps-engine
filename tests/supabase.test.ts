import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureRepo } from '../lib/db/repo.ts';
import { SupabaseRepo, type SupabaseClient } from '../lib/db/supabase-repo.ts';
import { createRepo, FALLBACK_BANNER } from '../lib/db/data-source.ts';
import { loadAnalysisData } from '../lib/db/load-analysis-data.ts';

const from = '2026-09-01';
const to = '2026-09-20';
const credentials = { url: 'https://example.supabase.co', serviceKey: 'test-server-key' };

// Use temporary server environment values without requiring real credentials or a database.
function configure(t: TestContext) {
  const original = { ...process.env };
  process.env.SUPABASE_URL = credentials.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = credentials.serviceKey;
  process.env.DATA_SOURCE = 'supabase';
  t.after(() => { process.env = original; });
}

test('Supabase error falls back to a coherent fixture dataset and exposes the banner', async t => {
  configure(t);
  let calls = 0;
  const client: SupabaseClient = async input => {
    calls++;
    return new URL(String(input)).pathname.endsWith('/skus')
      ? Response.json([{ id: 'live', name: 'Live SKU', margin_rate: 0.5 }])
      : new Response('backend error', { status: 503 });
  };
  const repo = createRepo({ client });
  const result = await loadAnalysisData(from, to, repo);
  assert.equal(result.isFallback, true);
  assert.equal(result.banner, FALLBACK_BANNER);
  assert.equal(result.dataSource, 'fixtures');
  assert.deepEqual(result.skus, await new FixtureRepo().getSkus());
  assert.equal(result.metrics.length, 60);
  const before = calls;
  await repo.getCampaigns();
  assert.equal(calls, before);
});

test('a hung mocked client falls back exactly at the three-second deadline', async t => {
  configure(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals: AbortSignal[] = [];
  const repo = createRepo({ client: async (_input, init) => {
    signals.push(init!.signal!);
    return new Promise<Response>(() => {});
  } });
  let settled = false;
  const pending = loadAnalysisData(from, to, repo).then(value => { settled = true; return value; });
  await Promise.resolve();
  t.mock.timers.tick(2999);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(repo.status.isFallback, false);
  t.mock.timers.tick(1);
  const result = await pending;
  assert.equal(result.isFallback, true);
  assert.equal(result.banner, 'Showing saved demo data');
  assert.equal(result.metrics.length, 60);
  assert.equal(signals.length, 4);
  assert.ok(signals.every(signal => signal.aborted));
});

test('successful Supabase load stays live and uses inclusive date filters', async t => {
  configure(t);
  const fixture = new FixtureRepo();
  const data: Record<string, unknown> = {
    skus: await fixture.getSkus(), campaigns: await fixture.getCampaigns(),
    ad_metrics_daily: await fixture.getMetrics(from, to), inventory_daily: await fixture.getInventory(from, to),
  };
  const repo = createRepo({ client: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1)!;
    assert.equal(new Headers(init?.headers).get('apikey'), credentials.serviceKey);
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${credentials.serviceKey}`);
    if (table.endsWith('_daily')) assert.deepEqual(url.searchParams.getAll('date'), [`gte.${from}`, `lte.${to}`]);
    return Response.json(data[table]);
  } });
  const result = await loadAnalysisData(from, to, repo);
  assert.equal(result.isFallback, false);
  assert.equal(result.banner, null);
  assert.equal(result.dataSource, 'supabase');
  assert.deepEqual(result.metrics, data.ad_metrics_daily);
});

test('fixtures mode never contacts Supabase; missing credentials fall back', async t => {
  configure(t);
  const repo = createRepo({ dataSource: 'fixtures', client: async () => { throw new Error('must not call'); } });
  assert.equal((await loadAnalysisData(from, to, repo)).isFallback, false);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = createRepo();
  assert.ok((await missing.getSkus()).length);
  assert.equal(missing.status.isFallback, true);
  await assert.rejects(loadAnalysisData(to, from, repo), RangeError);
});

test('all Repo methods map to schema tables and writes use insert/upsert semantics', async () => {
  const fixture = new FixtureRepo();
  const [anomaly] = await fixture.getAnomalies();
  const [recommendation] = await fixture.getRecommendations();
  const state = (await fixture.getCampaignState('c-sneaker'))!;
  const weight = (await fixture.getConfidence('stock_protection'))!;
  const tables: Record<string, unknown[]> = {
    skus: await fixture.getSkus(), campaigns: await fixture.getCampaigns(),
    ad_metrics_daily: await fixture.getMetrics(from, to), inventory_daily: await fixture.getInventory(from, to),
    anomalies: [anomaly], recommendations: [{ ...recommendation, created_at: '2026-09-20T18:00:00+00:00' }],
    campaign_state: [state], confidence_weights: [weight],
  };
  const writes: { table: string; method: string; body: unknown; prefer: string | null }[] = [];
  const repo = new SupabaseRepo({ ...credentials, client: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1)!;
    if (!init?.method) {
      if (table === 'recommendations') assert.equal(url.searchParams.get('select')?.includes('constraints_json'), false);
      return Response.json(tables[table]);
    }
    writes.push({ table, method: init.method, body: init.body ? JSON.parse(String(init.body)) : null, prefer: new Headers(init.headers).get('Prefer') });
    return new Response(null, { status: 204 });
  } });
  assert.deepEqual(await repo.getSkus(), tables.skus);
  assert.deepEqual(await repo.getCampaigns(), tables.campaigns);
  assert.deepEqual(await repo.getMetrics(from, to), tables.ad_metrics_daily);
  assert.deepEqual(await repo.getInventory(from, to), tables.inventory_daily);
  assert.deepEqual(await repo.getAnomalies(), tables.anomalies);
  assert.equal((await repo.getRecommendations())[0].created_at, '2026-09-20T18:00:00.000Z');
  assert.equal((await repo.getCampaignState(state.campaign_id))?.campaign_id, state.campaign_id);
  assert.equal((await repo.getConfidence(weight.recommendation_type))?.weight, weight.weight);
  await repo.saveAnomalies([anomaly]);
  await repo.saveRecommendations([recommendation]);
  await repo.logAction({ id: 'a', recommendation_id: recommendation.id, created_at: recommendation.created_at, actor: 'user', action: 'approved', note: '' });
  await repo.saveOutcome({ id: 'o', recommendation_id: recommendation.id, created_at: recommendation.created_at, predicted: 1, actual: 1, error_pct: 0, horizon_days: 3 });
  await repo.setCampaignState(state);
  await repo.setConfidence(weight);
  assert.deepEqual(writes.map(row => row.table), ['anomalies', 'recommendations', 'action_log', 'outcomes', 'campaign_state', 'confidence_weights']);
  assert.equal(writes[2].prefer, 'return=minimal');
  assert.ok(writes.filter(row => row.table !== 'action_log').every(row => row.prefer?.includes('merge-duplicates')));
  writes.length = 0;
  await repo.resetDecisions();
  assert.deepEqual(writes.map(row => [row.table, row.method]), [
    ['action_log', 'DELETE'], ['outcomes', 'DELETE'], ['campaign_state', 'POST'],
    ['recommendations', 'PATCH'], ['confidence_weights', 'POST'],
  ]);
});

test('pagination respects the server count even when its page cap is smaller', async () => {
  const offsets: string[] = [];
  const repo = new SupabaseRepo({ ...credentials, client: async input => {
    const offset = new URL(String(input)).searchParams.get('offset')!;
    offsets.push(offset);
    return Response.json([{ id: `sku-${offset}`, name: 'SKU', margin_rate: 0.5 }], { headers: { 'content-range': `${offset}-${offset}/2` } });
  } });
  assert.equal((await repo.getSkus()).length, 2);
  assert.deepEqual(offsets, ['0', '1']);
});

test('rejected client promises and failed writes activate fallback', async t => {
  configure(t);
  const repo = createRepo({ client: async () => { throw new Error('network down'); } });
  const state = (await new FixtureRepo().getCampaignState('c-sneaker'))!;
  await repo.setCampaignState({ ...state, daily_budget: 0, status: 'paused' });
  assert.equal(repo.status.isFallback, true);
  assert.equal((await repo.getCampaignState(state.campaign_id))?.daily_budget, 0);
});
