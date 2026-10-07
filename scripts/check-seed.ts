import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixtureSchemas } from '../lib/db/repo.ts';
import type { SeedData } from './seed.ts';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2; };

// Verify the documented thresholds from observed data rather than planted labels.
export function checkSeed(data: SeedData) {
  for (const [name, schema] of Object.entries(fixtureSchemas)) schema.parse(data[name as keyof SeedData]);
  assert.equal(data.skus.length, 8);
  assert.equal(data.campaigns.length, 10);
  assert.equal(new Set(data.campaigns.map(c => c.platform)).size, 4);
  assert.equal(data.metrics.length, 450);
  assert.equal(data.inventory.length, 360);
  const rows = (id: string) => data.metrics.filter(m => m.campaign_id === id).sort((a, b) => a.date.localeCompare(b.date));
  for (const campaign of data.campaigns) {
    const ms = rows(campaign.id);
    assert.equal(new Set(ms.map(m => m.date)).size, 45);
    const truth = data.truth.find(t => t.campaign_id === campaign.id)!;
    assert.ok(truth.beta_true >= .55 && truth.beta_true <= .8);
    assert.ok(Math.max(...ms.map(m => m.spend)) / Math.min(...ms.map(m => m.spend)) > 1.2);
    for (const m of ms) {
      assert.ok(m.spend >= campaign.daily_budget * .85 - .01 && m.spend <= campaign.daily_budget * 1.15 + .01);
      assert.ok(m.orders <= m.clicks && m.clicks <= m.impressions);
      const identity = m.clicks / m.impressions * (m.orders / m.clicks) * (m.revenue / m.orders) * 1000 / (m.spend / m.impressions * 1000);
      assert.ok(Math.abs(identity - m.revenue / m.spend) < 1e-10);
    }
  }
  for (const product of data.products) {
    let stock = data.opening_inventory[product.id];
    const ids = new Set(data.campaigns.filter(c => c.sku_id === product.id).map(c => c.id));
    const inventory = data.inventory.filter(i => i.sku_id === product.id).sort((a, b) => a.date.localeCompare(b.date));
    assert.equal(new Set(inventory.map(i => i.date)).size, 45);
    for (const i of inventory) {
      const ms = data.metrics.filter(m => m.date === i.date && ids.has(m.campaign_id));
      assert.equal(i.units_sold, ms.reduce((s, m) => s + m.orders, 0));
      assert.equal(i.units_on_hand, stock - i.units_sold);
      if (product.id === 'SNK-01') assert.ok(ms.reduce((s, m) => s + m.revenue, 0) <= stock * product.price);
      stock = i.units_on_hand;
    }
  }
  const sneaker = rows('c-sneaker');
  const sneakerRoas = mean(sneaker.slice(-3).map(m => m.revenue / m.spend));
  assert.ok(Math.abs(sneakerRoas / 4.8 - 1) < .15, 'E1 ROAS near 4.8');
  assert.equal(data.inventory.find(i => i.sku_id === 'SNK-01' && i.date === data.as_of)!.units_on_hand, 0);
  const hoodie = rows('c-hoodie');
  const recent = hoodie.slice(-5), baseline = hoodie.slice(23, 37); // t-21 through t-8 inclusive
  const ctrRatio = mean(recent.map(m => m.clicks / m.impressions)) / mean(baseline.map(m => m.clicks / m.impressions));
  assert.ok(ctrRatio <= .75, `E2 fatigue CTR ${ctrRatio}`);
  assert.ok(Math.abs(mean(recent.map(m => m.impressions)) / mean(baseline.map(m => m.impressions)) - 1) <= .20, 'E2 stable impressions');
  // Last-three vs preceding-fourteen driver split: adverse CTR must dominate fatigue.
  const drivers = (id: string) => {
    const ms = rows(id);
    const aggregate = (start: number, end: number) => {
      const a = ms.slice(start, end).reduce((s, m) => ({ spend: s.spend + m.spend, revenue: s.revenue + m.revenue, impressions: s.impressions + m.impressions, clicks: s.clicks + m.clicks, orders: s.orders + m.orders }), { spend: 0, revenue: 0, impressions: 0, clicks: 0, orders: 0 });
      return { ctr: a.clicks / a.impressions, cpm: a.spend / a.impressions * 1000, cvr: a.orders / a.clicks, aov: a.revenue / a.orders };
    };
    const before = aggregate(28, 42), after = aggregate(42, 45);
    return Object.keys(before).map(k => { const key = k as keyof typeof before; return { key, adverse: Math.log(after[key] / before[key]) * (key === 'cpm' ? 1 : -1) }; }).sort((a, b) => b.adverse - a.adverse)[0].key;
  };
  assert.equal(drivers('c-hoodie'), 'ctr', 'E2 top driver');
  for (const c of data.campaigns.filter(c => c.platform === 'google')) {
    const ms = rows(c.id), cpms = ms.map(m => m.spend / m.impressions * 1000);
    const base = median(cpms.slice(21, 35));
    const mad = Math.max(1.4826 * median(cpms.slice(21, 35).map(x => Math.abs(x - base))), .03 * base);
    assert.ok(Math.abs(mean(cpms.slice(35)) / base - 1.4) < .001, 'E3 CPM +40%');
    assert.ok((cpms[35] - base) / mad >= 4.5, 'E3 single-day anomaly');
    assert.equal(drivers(c.id), 'cpm', 'E3 top driver');
  }
  const basic = rows('c-basic');
  const share = basic.reduce((s, m) => s + m.spend, 0) / data.metrics.reduce((s, m) => s + m.spend, 0);
  assert.ok(share >= .15 && share <= .20, 'E4 spend share');
  for (const [id, margin, sign] of [['c-basic', .18, -1], ['c-premium', .61, 1]] as const) {
    const roas = mean(rows(id).slice(-7).map(m => m.revenue / m.spend));
    const beta = data.truth.find(t => t.campaign_id === id)!.beta_true;
    assert.ok((margin * beta * roas - 1) * sign > 0, `${id} marginal profit`);
    assert.ok(Math.abs(roas / (id === 'c-basic' ? 3.4 : 4.1) - 1) < .15);
  }
  const premiumStock = data.inventory.find(i => i.sku_id === 'TEE-PRM' && i.date === data.as_of)!.units_on_hand;
  assert.deepEqual([...new Set(data.planted_events.map(e => e.id))], ['E1', 'E2', 'E3', 'E4', 'E5']);
  const premium = rows('c-premium');
  const premiumRunway = premiumStock / mean(premium.slice(-7).map(m => m.orders));
  // Use the maximum fitted beta, testing both recent demand and the latest return-curve anchor.
  const latest = premium.at(-1)!;
  const budget = data.campaigns.find(c => c.id === 'c-premium')!.daily_budget;
  const price = data.products.find(p => p.id === 'TEE-PRM')!.price;
  const projectedDailyUnits = Math.max(
    mean(premium.slice(-7).map(m => m.orders)) * 1.4 ** .9,
    latest.revenue / price * (budget * 1.4 / latest.spend) ** .9,
  );
  const premiumPostUpliftRunway = premiumStock / projectedDailyUnits;
  assert.ok(premiumPostUpliftRunway >= 7, 'E5 receiver must retain 7 days of cover after +40% budget uplift');
  return { seed: data.seed, sneakerRoas, fatigueCtrRatio: ctrRatio, basicSpendShare: share, premiumRunway, premiumPostUpliftRunway, premiumReceiverEligible: premiumPostUpliftRunway >= 7 };
}

// Check generated files by default, so CLI output is covered as well as generation.
async function main() {
  for (let seed = 1; seed <= 6; seed++) {
    const data = JSON.parse(await readFile(new URL(`../fixtures/seed-${seed}.json`, import.meta.url), 'utf8')) as SeedData;
    const report = checkSeed(data);
    console.log('PASS: accounting and event signals', report);

  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}


