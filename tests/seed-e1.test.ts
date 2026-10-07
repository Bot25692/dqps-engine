import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { generateSeed } from '../scripts/seed.ts';
import { checkFixture } from '../scripts/check.ts';

for (let seed = 1; seed <= 6; seed++) {
  test(`seed ${seed}: reproducible fixtures meet updated E1 and all eight checks`, async () => {
    const data = generateSeed(seed);
    assert.deepEqual(data, generateSeed(seed));
    assert.deepEqual(JSON.parse(await readFile(new URL(`../fixtures/seed-${seed}.json`, import.meta.url), 'utf8')), data);
    assert.deepEqual(checkFixture(data).filter(result => !result.passed), []);
    const stock = data.inventory.filter(row => row.sku_id === 'SNK-01');
    const average = stock.slice(-7).reduce((sum, row) => sum + row.units_sold, 0) / 7;
    // Integer stock rounding permits at most half a unit of error around 0.9 days.
    assert.ok(Math.abs(stock[44].units_on_hand / average - .9) <= .5 / average + 1e-12);
    let previous = data.opening_inventory['SNK-01'];
    for (const row of stock) {
      assert.equal(row.units_on_hand, previous - row.units_sold);
      assert.ok(row.units_on_hand >= 0);
      previous = row.units_on_hand;
    }
    const rows = data.metrics.filter(row => row.campaign_id === 'c-sneaker');
    for (const window of [rows, rows.slice(-4)]) {
      const roas = window.reduce((sum, row) => sum + row.revenue, 0) / window.reduce((sum, row) => sum + row.spend, 0);
      assert.ok(Math.abs(roas / 4.8 - 1) < .15, `SNK-01 ROAS ${roas}`);
    }
    assert.equal(data.inventory.find(row => row.sku_id === 'TEE-PRM' && row.date === data.as_of)!.units_on_hand, 900);
  });
}
