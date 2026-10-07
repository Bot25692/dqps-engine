import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSeed, parseArgs } from '../scripts/seed.ts';
import { checkSeed } from '../scripts/check-seed.ts';

for (let seed = 1; seed <= 6; seed++) {
  test(`seed ${seed} meets event signal and accounting targets`, () => {
    const data = generateSeed(seed);
    checkSeed(data);
    assert.deepEqual(data, generateSeed(seed));
    assert.notDeepEqual(data.metrics, generateSeed(seed + 1).metrics);
  });
}
test('CLI defaults and invalid options', () => {
  assert.deepEqual(parseArgs([]), { seed: 1, out: 'json' });
  assert.deepEqual(parseArgs(['--out', 'db', '--seed', '6']), { seed: 6, out: 'db' });
  for (const args of [['--seed', '-1'], ['--seed', '1.5'], ['--seed', '4294967296'], ['--out', 'oops'], ['--seed'], ['--unknown', '1'], ['--seed', '1', '--seed', '2']]) assert.throws(() => parseArgs(args));
});

test('JSON mode writes reproducible files without network access', async () => {
  const { main } = await import('../scripts/seed.ts');
  const { readFile } = await import('node:fs/promises');
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('JSON mode attempted network access'); };
  try {
    await main(['--seed', '1', '--out', 'json']);
    const data = JSON.parse(await readFile(new URL('../fixtures/seed-1.json', import.meta.url), 'utf8'));
    assert.deepEqual(data, generateSeed(1));
    const events = JSON.parse(await readFile(new URL('../planted_events.json', import.meta.url), 'utf8'));
    assert.deepEqual(events, data.planted_events);
  } finally { globalThis.fetch = fetchBefore; }
});

test('database repository upserts tables in FK order and fails visibly on errors', async () => {
  const { SeedRepo } = await import('../lib/db/seed-repo.ts');
  const fetchBefore = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls: string[] = [];
  process.env.SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Prefer, 'resolution=merge-duplicates,return=minimal');
    assert.ok(JSON.parse(init?.body as string).length > 0);
    return new Response(null, { status: 201 });
  };
  try {
    await new SeedRepo().saveSeed(generateSeed(1));
    assert.deepEqual(calls.map(u => new URL(u).pathname.split('/').pop()), ['skus', 'campaigns', 'ad_metrics_daily', 'inventory_daily', 'campaign_state', 'confidence_weights']);
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(new SeedRepo().saveSeed(generateSeed(1)), /skus failed \(403\)/);
    delete process.env.SUPABASE_URL;
    await assert.rejects(new SeedRepo().saveSeed(generateSeed(1)), /requires SUPABASE_URL/);
  } finally {
    globalThis.fetch = fetchBefore;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});


test('E5 rejects the former 450-unit stock level after projected uplift', () => {
  const data = generateSeed(1);
  data.opening_inventory['TEE-PRM'] -= 450;
  for (const row of data.inventory.filter(i => i.sku_id === 'TEE-PRM')) row.units_on_hand -= 450;
  assert.throws(() => checkSeed(data), /E5 receiver must retain 7 days/);
});
