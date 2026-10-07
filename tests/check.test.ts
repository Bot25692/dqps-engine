import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkFixture, parseSeeds } from '../scripts/check.ts';
import type { SeedData } from '../scripts/seed.ts';

const fixture = JSON.parse(await readFile(new URL('../fixtures/seed-1.json', import.meta.url), 'utf8')) as SeedData;

test('CLI selects all seeds, a positional seed, or --seed', () => {
  assert.deepEqual(parseSeeds([]), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseSeeds(['3']), [3]);
  assert.deepEqual(parseSeeds(['--seed', '6']), [6]);
  for (const args of [['-1'], ['1.5'], ['--seed'], ['--other', '2'], ['1', '2'], ['4294967296']]) {
    assert.throws(() => parseSeeds(args), /Usage/);
  }
});

test('checks reject corrupted dates, values, stock and every event independently', () => {
  const cases: [number, (data: SeedData) => void][] = [
    [0, d => { d.metrics[0].date = d.metrics[10].date; }],
    [1, d => { d.metrics[0].spend = -1; }],
    [2, d => { d.inventory[0].units_on_hand += 1; }],
    [3, d => { for (const row of d.inventory.filter(r => r.sku_id === 'SNK-01')) row.units_on_hand += 10000; }],
    [4, d => { for (const row of d.metrics.filter(r => r.campaign_id === 'c-hoodie')) row.clicks = row.impressions * .025; }],
    [5, d => { for (const row of d.metrics.filter(r => r.campaign_id === 'c-jogger')) row.impressions = row.spend / .18; }],
    [6, d => { for (const row of d.metrics.filter(r => r.campaign_id === 'c-basic')) row.revenue = row.spend; }],
    [7, d => { for (const row of d.inventory.filter(r => r.sku_id === 'TEE-PRM')) row.units_on_hand = 450; }],
  ];
  for (const [index, mutate] of cases) {
    const data = structuredClone(fixture);
    mutate(data);
    const results = checkFixture(data);
    assert.equal(results.length, 8);
    assert.equal(results[index].passed, false, results[index].check);
  }
});

test('CLI reports every check and exits nonzero for a missing fixture', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/check.ts', import.meta.url)), '4294967295'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim().split('\n').length, 8);
  assert.match(result.stdout, /FAIL seed 4294967295/);
});
