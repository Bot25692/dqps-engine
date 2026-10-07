import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DriverSchema } from '../lib/types.ts';
import type { Campaign, InventoryRow, MetricRow, Sku } from '../lib/types.ts';
import { driverImpact, rootCause } from '../lib/analysis/rootcause.ts';
import { generateSeed } from '../scripts/seed.ts';

const date = (i: number) => new Date(Date.UTC(2026, 0, i)).toISOString().slice(0, 10);
const campaign: Campaign = { id: 'c', name: 'Campaign', sku_id: 'sku', platform: 'meta', daily_budget: 100 };
const sku: Sku = { id: 'sku', name: 'SKU', margin_rate: .5 };
const event = { campaign_id: 'c', date: date(17) };
const rows = (): MetricRow[] => Array.from({ length: 17 }, (_, i) => ({
  campaign_id: 'c', date: date(i + 1), spend: 100, revenue: 500, impressions: 10000, clicks: 1000, orders: 100,
}));
const stock = (cover: number): InventoryRow[] => Array.from({ length: 7 }, (_, i) => ({
  sku_id: 'sku', date: date(11 + i), units_on_hand: cover * 10, units_sold: 10,
}));
const explain = (metrics = rows(), inventory: InventoryRow[] = [], margin = .5) =>
  rootCause(event, [campaign], [{ ...sku, margin_rate: margin }], metrics, inventory);
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('seed 1: stock risk, CTR, CPM, and margin lead E1 through E4', () => {
  const data = generateSeed(1);
  for (const [id, expected] of [['E1', 'Stock risk'], ['E2', 'CTR'], ['E3', 'CPM'], ['E4', 'Margin']]) {
    const planted = data.planted_events.filter(row => row.id === id);
    assert.ok(planted.length > 0);
    for (const item of planted) {
      const drivers = rootCause({ campaign_id: item.campaign, date: data.as_of },
        data.campaigns, data.skus, data.metrics, data.inventory);
      DriverSchema.array().parse(drivers);
      assert.equal(drivers[0]?.name, expected, `${id}: ${item.campaign}`);
    }
  }
});

test('signed log shares sum to 100, flip CPM, and keep offsetting effects', () => {
  const data = rows();
  // CTR halves, CPM rises 25%, and AOV doubles: ROAS falls 20% overall.
  data.slice(14).forEach(row => { row.clicks *= .5; row.orders *= .5; row.spend *= 1.25; });
  const drivers = explain(data);
  assert.deepEqual(drivers.map(row => row.name), ['CTR', 'CPM', 'CVR', 'AOV']);
  const byName = Object.fromEntries(drivers.map(row => [row.name, row]));
  close(byName.CTR.contribution_pct, Math.log(.5) / Math.log(.8) * 100);
  close(byName.CPM.contribution_pct, 100);
  close(byName.AOV.contribution_pct, Math.log(2) / Math.log(.8) * 100);
  close(drivers.reduce((sum, row) => sum + row.contribution_pct, 0), 100);
  assert.equal(byName.AOV.impact, 'high');
  assert.match(byName.AOV.description, /offsetting/);
});

test('uses ratios of totals over exact windows, ignores future rows and other campaigns', () => {
  const data = rows();
  data[14].clicks = 200;
  data[14].orders = 20;
  data[14].revenue = 100;
  data[15].clicks = 500;
  data[15].orders = 50;
  data[15].revenue = 250;
  const result = explain(data);
  close(result[0].contribution_pct, 100);
  assert.equal(result[0].name, 'CTR');
  assert.deepEqual(explain([...data, { ...data[0], date: date(18), revenue: 1 },
    { ...data[0], campaign_id: 'other', revenue: 1 }]), result);
  // Changing volume on one day changes the aggregate ratios, not an unweighted daily average.
  data[14].impressions *= 10;
  const weighted = explain(data);
  const expectedCtrDelta = Math.log((1700 / 120000) / .1);
  close(weighted.find(row => row.name === 'CTR')!.contribution_pct, expectedCtrDelta / Math.log(850 / 1500) * 100);
});

test('skips splits below 0.10 log change in either direction and accepts larger changes', () => {
  for (const delta of [-.099, .099, -.10, .10, -.101, .101]) {
    const data = rows();
    data.slice(14).forEach(row => { row.revenue *= Math.exp(delta); });
    assert.equal(explain(data).length, Math.abs(delta) < .1 ? 0 : 4);
  }
  assert.deepEqual(explain(), []);
});

test('impact boundaries include 50% as high and 20% as medium', () => {
  for (const sign of [-1, 1]) {
    assert.equal(driverImpact(sign * 50), 'high');
    assert.equal(driverImpact(sign * 49.999), 'medium');
    assert.equal(driverImpact(sign * 20), 'medium');
    assert.equal(driverImpact(sign * 19.999), 'low');
  }
});

test('stock leads even with unchanged ROAS, margin loss, or missing metric history', () => {
  assert.deepEqual(explain(rows(), stock(5)), []);
  assert.equal(explain(rows(), stock(4.9))[0].name, 'Stock risk');
  assert.deepEqual(explain(rows(), stock(2), .1).map(row => row.name), ['Stock risk', 'Margin']);
  assert.equal(explain([], stock(2))[0].name, 'Stock risk');
  assert.deepEqual(explain(rows(), stock(2).slice(1)), []);
  assert.deepEqual(explain(rows(), stock(0).map(row => ({ ...row, units_sold: 0 }))), []);
  assert.deepEqual(explain(rows(), [], .2), []); // Exactly break-even is not a margin loss.
  assert.equal(explain(rows(), [], 0)[0].name, 'Margin');
});

test('missing dates, zero activity, and duplicate dates never produce misleading log shares', () => {
  const data = rows();
  data.slice(14).forEach(row => { row.revenue *= .5; });
  assert.deepEqual(explain(data.filter((_, i) => i !== 4)), []);
  for (const key of ['clicks', 'orders', 'impressions', 'spend', 'revenue'] as const) {
    const zero = data.map(row => ({ ...row, [key]: 0 }));
    assert.ok(explain(zero).every(driver => driver.name === 'Margin'));
    DriverSchema.array().parse(explain(zero));
  }
  assert.throws(() => explain([...data, data[0]]), /Duplicate date/);
});

test('analysis is pure, order-independent, and does not import database or simulation code', async () => {
  const data = generateSeed(1);
  const before = structuredClone(data);
  const anomaly = { campaign_id: 'c-hoodie', date: data.as_of };
  const expected = rootCause(anomaly, data.campaigns, data.skus, data.metrics, data.inventory);
  assert.deepEqual(rootCause(anomaly, [...data.campaigns].reverse(), [...data.skus].reverse(),
    [...data.metrics].reverse(), [...data.inventory].reverse()), expected);
  assert.deepEqual(data, before);
  const source = await readFile(new URL('../lib/analysis/rootcause.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:from\s*|import\s*\()["'][^"']*(?:db\/|simulation\/)/);
});
