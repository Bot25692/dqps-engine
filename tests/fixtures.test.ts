import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FixtureRepo, fixtureSchemas } from '../lib/db/repo.ts';
import { SkuSchema, OutcomeSchema, DriverSchema, MoveSchema } from '../lib/types.ts';

test('every JSON fixture passes its exact table schema', async () => {
  const directory = new URL('../fixtures/', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.json') && name !== 'analysis.json' && !/^seed-\d+\.json$/.test(name)).sort();
  assert.deepEqual(files, Object.keys(fixtureSchemas).map(key => `${key}.json`).sort());
  for (const [name, schema] of Object.entries(fixtureSchemas)) {
    schema.parse(JSON.parse(await readFile(new URL(`${name}.json`, directory), 'utf8')));
  }
});

test('scenario has 3 campaigns, 20 complete days, one stockout, anomaly and recommendation', async () => {
  const repo = new FixtureRepo();
  const skus = await repo.getSkus();
  const campaigns = await repo.getCampaigns();
  const metrics = await repo.getMetrics('2026-09-01', '2026-09-20');
  const inventory = await repo.getInventory('2026-09-01', '2026-09-20');
  assert.equal(campaigns.length, 3);
  assert.equal(metrics.length, 60);
  assert.equal(inventory.length, 60);
  for (const campaign of campaigns) {
    assert.ok(skus.some(sku => sku.id === campaign.sku_id));
    assert.equal(new Set(metrics.filter(row => row.campaign_id === campaign.id).map(row => row.date)).size, 20);
  }
  for (const sku of skus) {
    assert.equal(new Set(inventory.filter(row => row.sku_id === sku.id).map(row => row.date)).size, 20);
  }
  assert.equal(inventory.filter(row => row.units_on_hand === 0).length, 1);
  assert.equal((await repo.getAnomalies()).length, 1);
  assert.equal((await repo.getRecommendations()).length, 1);
  const [plan] = await repo.getRecommendations();
  assert.equal(plan.moves.reduce((sum, move) => sum + move.new_budget - move.old_budget, 0), 0);
  const receiver = campaigns.find(row => row.id === 'c-premium')!;
  const sku = skus.find(row => row.id === receiver.sku_id)!;
  const latest = metrics.find(row => row.campaign_id === receiver.id && row.date === '2026-09-20')!;
  const gain = sku.margin_rate * latest.revenue * (Math.pow(3500 / latest.spend, 0.7) - 1);
  assert.ok(Math.abs(plan.expected_profit_gain_per_day - gain) < 0.01);
  assert.equal((await repo.getMetrics('2026-09-20', '2026-09-20')).length, 3);
  assert.equal((await repo.getInventory('2026-10-01', '2026-10-02')).length, 0);
  await assert.rejects(repo.getMetrics('2026-09-20', '2026-09-01'), RangeError);
  await assert.rejects(repo.getInventory('invalid', '2026-09-20'));
});

test('writes validate, upsert, isolate instances and reset to seed state', async () => {
  const repo = new FixtureRepo();
  const [recommendation] = await repo.getRecommendations();
  const [anomaly] = await repo.getAnomalies();
  recommendation.status = 'approved';
  assert.equal((await repo.getRecommendations())[0].status, 'pending');
  await repo.saveRecommendations([recommendation]);
  await repo.saveAnomalies([{...anomaly, severity:'warning'}]);
  await repo.logAction({id:'action-1',recommendation_id:recommendation.id,created_at:'2026-09-20T19:00:00Z',actor:'demo-user',action:'approved',note:''});
  await repo.saveOutcome({id:'outcome-1',recommendation_id:recommendation.id,created_at:'2026-09-23T19:00:00Z',predicted:3000,actual:2700,error_pct:-10,horizon_days:3});
  await repo.setCampaignState({campaign_id:'c-sneaker',daily_budget:0,status:'paused',updated_at:'2026-09-20T19:00:00Z'});
  await repo.setConfidence({recommendation_type:'stock_protection',weight:0.8,updated_at:'2026-09-23T19:00:00Z'});
  assert.equal((await repo.getCampaignState('c-sneaker'))?.daily_budget, 0);
  assert.equal((await repo.getConfidence('stock_protection'))?.weight, 0.8);
  assert.equal((await repo.getRecommendations()).length, 1);
  assert.equal((await repo.getActionLog()).length, 1);
  assert.equal((await repo.getOutcomes()).length, 1);
  assert.equal((await new FixtureRepo().getRecommendations())[0].status, 'pending');
  await assert.rejects(repo.setCampaignState({campaign_id:'c-sneaker',daily_budget:-1,status:'active',updated_at:'2026-09-20T19:00:00Z'}));
  await repo.resetDecisions();
  assert.equal((await repo.getRecommendations())[0].status, 'pending');
  assert.equal((await repo.getAnomalies())[0].severity, 'critical');
  assert.equal((await repo.getActionLog()).length, 0);
  assert.equal((await repo.getOutcomes()).length, 0);
  assert.equal((await repo.getCampaignState('c-sneaker'))?.daily_budget, 1000);
  assert.equal((await repo.getConfidence('stock_protection'))?.weight, 0.75);
  assert.equal(await repo.getCampaignState('missing'), null);
});

test('contract bounds reject percentages as margin fractions and invalid values', () => {
  for (const margin_rate of [0, 0.61, 1]) SkuSchema.parse({id:'sku',name:'SKU',margin_rate});
  for (const margin_rate of [-0.1, 61, NaN, Infinity]) {
    assert.equal(SkuSchema.safeParse({id:'sku',name:'SKU',margin_rate}).success, false);
  }
  assert.equal(OutcomeSchema.safeParse({id:'o',recommendation_id:'r',created_at:'2026-09-23T19:00:00Z',predicted:1,actual:1,error_pct:0,horizon_days:0}).success, false);
  DriverSchema.parse({name:'CTR',contribution_pct:120,impact:'high',description:'CTR explains 120% of the ROAS decline.'});
  assert.equal(MoveSchema.safeParse({campaign_id:'c',old_budget:10,new_budget:-1,reason:'bad'}).success, false);
});

