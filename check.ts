import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SeedData } from './seed.ts';

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const labels = ['dates', 'nonnegative values', 'stock accounting / no SNK-01 restock',
  'E1: SNK-01 cover < 3 days by day 41', 'E2: HOOD-01 CTR down >= 35% by day 44',
  'E3: Google CPM up 35–45% from day 36', 'E4: TEE-BSC ROAS about 3.4',
  'E5: TEE-PRM cover >= 7 days after +40% budget'] as const;
export type CheckResult = { check: string; passed: boolean; detail: string };

// Reject negative or nonfinite numbers anywhere in the fixture, including opening stock.
function checkNumbers(value: unknown, path = 'fixture'): void {
  if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0, `${path} = ${value}`);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) checkNumbers(child, `${path}.${key}`);
  }
}

// Run every check independently so a failure never hides the remaining results.
export function checkFixture(data: SeedData): CheckResult[] {
  const date = (day: number) => {
    const end = Date.parse(`${data.as_of}T00:00:00Z`);
    return new Date(end - (45 - day) * 86400000).toISOString().slice(0, 10);
  };
  const inventory = (sku: string) => data.inventory.filter(row => row.sku_id === sku).sort((a, b) => a.date.localeCompare(b.date));
  const metrics = (sku: string) => {
    const ids = new Set(data.campaigns.filter(c => c.sku_id === sku).map(c => c.id));
    assert.ok(ids.size, `Missing campaigns for ${sku}`);
    return data.metrics.filter(row => ids.has(row.campaign_id));
  };
  const cover = (sku: string, day: number, uplift = 1) => {
    const rows = inventory(sku);
    const recent = rows.filter(row => row.date >= date(day - 6) && row.date <= date(day));
    assert.equal(recent.length, 7, `${sku}: missing seven-day sales window`);
    const demand = mean(recent.map(row => row.units_sold));
    assert.ok(demand > 0, `${sku}: sales average must be positive`);
    return rows.find(row => row.date === date(day))!.units_on_hand / (demand * uplift);
  };
  const checks: (() => string)[] = [
    () => {
      const expected = Array.from({ length: 45 }, (_, i) => date(i + 1));
      assert.ok(data.campaigns.length > 0 && data.skus.length > 0, 'Missing campaigns or SKUs');
      assert.equal(new Set(data.campaigns.map(c => c.id)).size, data.campaigns.length, 'Duplicate campaign');
      for (const campaign of data.campaigns) {
        assert.deepEqual(data.metrics.filter(row => row.campaign_id === campaign.id).map(row => row.date).sort(), expected, `${campaign.id}: expected exactly 45 consecutive dates`);
      }
      for (const sku of data.skus) assert.deepEqual(inventory(sku.id).map(row => row.date), expected, `${sku.id}: inventory dates`);
      assert.ok(data.metrics.every(row => data.campaigns.some(c => c.id === row.campaign_id)), 'Unknown campaign in metrics');
      assert.ok(data.inventory.every(row => data.skus.some(s => s.id === row.sku_id)), 'Unknown SKU in inventory');
      return '45 consecutive dates per campaign and SKU';
    },
    () => { checkNumbers(data); return 'All numeric values are finite and nonnegative'; },
    () => {
      assert.ok(data.skus.some(s => s.id === 'SNK-01'), 'Missing SNK-01');
      for (const sku of data.skus) {
        let stock = data.opening_inventory[sku.id];
        assert.ok(Number.isFinite(stock), `${sku.id}: missing opening stock`);
        const sales = metrics(sku.id);
        const rows = inventory(sku.id);
        assert.equal(rows.length, 45, `${sku.id}: missing inventory`);
        for (const row of rows) {
          assert.equal(row.units_sold, sales.filter(m => m.date === row.date).reduce((sum, m) => sum + m.orders, 0), `${sku.id} ${row.date}: sales disagree with orders`);
          assert.equal(row.units_on_hand, stock - row.units_sold, `${sku.id} ${row.date}: stock must fall by units_sold (fixtures have no restocks)`);
          stock = row.units_on_hand;
        }
      }
      return 'Opening stock and every daily balance match sales';
    },
    () => {
      const days = cover('SNK-01', 41);
      assert.ok(days < 3, `Day 41 cover = ${days.toFixed(3)} days; expected < 3`);
      return `Day 41 cover = ${days.toFixed(3)} days`;
    },
    () => {
      const rows = metrics('HOOD-01');
      const ctr = (start: number, end: number) => {
        const window = rows.filter(row => row.date >= date(start) && row.date <= date(end));
        const impressions = window.reduce((sum, row) => sum + row.impressions, 0);
        assert.ok(impressions > 0, 'Missing positive hoodie impressions');
        return window.reduce((sum, row) => sum + row.clicks, 0) / impressions;
      };
      const decline = 1 - ctr(44, 44) / ctr(8, 21);
      assert.ok(Number.isFinite(decline) && decline >= .35, `CTR decline = ${(decline * 100).toFixed(2)}%; expected >= 35%`);
      return `Day 44 vs days 8–21 CTR decline = ${(decline * 100).toFixed(2)}%`;
    },
    () => {
      const google = data.campaigns.filter(c => c.platform === 'google');
      assert.ok(google.length, 'Missing Google campaigns');
      for (const campaign of google) {
        const rows = data.metrics.filter(row => row.campaign_id === campaign.id);
        const before = rows.filter(row => row.date >= date(22) && row.date <= date(35));
        const baseline = before.reduce((sum, row) => sum + row.spend, 0) / before.reduce((sum, row) => sum + row.impressions, 0);
        for (let day = 36; day <= 45; day++) {
          const row = rows.find(row => row.date === date(day));
          assert.ok(row, `${campaign.id}: missing day ${day}`);
          const change = row.spend / row.impressions / baseline - 1;
          assert.ok(change >= .35 && change <= .45, `${campaign.id} day ${day}: CPM change = ${(change * 100).toFixed(2)}%`);
        }
      }
      return 'Every Google campaign, days 36–45 vs days 22–35';
    },
    () => {
      const rows = metrics('TEE-BSC');
      const roas = rows.reduce((sum, row) => sum + row.revenue, 0) / rows.reduce((sum, row) => sum + row.spend, 0);
      // "About" means within 15% of 3.4, matching the existing seed checker.
      assert.ok(Math.abs(roas / 3.4 - 1) <= .15, `ROAS = ${roas.toFixed(3)}; expected 3.4 +/- 15%`);
      return `45-day aggregate ROAS = ${roas.toFixed(3)} (3.4 +/- 15%)`;
    },
    () => {
      // Use the documented maximum fitted beta (0.9), without reading hidden truth.
      const days = cover('TEE-PRM', 45, 1.4 ** .9);
      assert.ok(days >= 7, `Post-uplift cover = ${days.toFixed(3)} days; expected >= 7`);
      return `Post-uplift cover = ${days.toFixed(3)} days (beta = 0.9)`;
    },
  ];
  return checks.map((check, i) => {
    try { return { check: labels[i], passed: true, detail: check() }; }
    catch (error) { return { check: labels[i], passed: false, detail: error instanceof Error ? error.message : String(error) }; }
  });
}

// Accept either a positional seed or --seed N; otherwise check all six fixtures.
export function parseSeeds(args: string[]): number[] {
  if (!args.length) return [1, 2, 3, 4, 5, 6];
  const value = args.length === 1 ? args[0] : args.length === 2 && args[0] === '--seed' ? args[1] : '';
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 0xffffffff) {
    throw new Error('Usage: node --experimental-strip-types scripts/check.ts [N | --seed N]');
  }
  return [Number(value)];
}

// Load files relative to this script and keep checking other seeds after any failure.
export async function main(args = process.argv.slice(2)): Promise<void> {
  for (const seed of parseSeeds(args)) {
    let results: CheckResult[];
    try {
      const data = JSON.parse(await readFile(new URL(`../fixtures/seed-${seed}.json`, import.meta.url), 'utf8')) as SeedData;
      results = checkFixture(data);
    } catch (error) {
      results = labels.map(check => ({ check, passed: false, detail: `Cannot load fixture: ${error instanceof Error ? error.message : String(error)}` }));
    }
    for (const result of results) {
      console.log(`${result.passed ? 'PASS' : 'FAIL'} seed ${seed} | ${result.check} | ${result.detail.replace(/\s+/g, ' ')}`);
      if (!result.passed) process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`FAIL | ${error.message}`); process.exitCode = 1; });
}
