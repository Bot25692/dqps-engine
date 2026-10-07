// Run with: node --experimental-strip-types scripts/check-schema.ts <path-to-pglite/dist/index.js>
// PGlite runs real PostgreSQL in WASM; use a temporary install, not a production dependency.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { fixtureSchemas } from './lib/db/repo';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const schema = await readFile(new URL('../supabase/001_schema.sql', import.meta.url), 'utf8');
const reset = await readFile(new URL('../supabase/002_reset.sql', import.meta.url), 'utf8');
const names: Record<string, string> = { metrics: 'ad_metrics_daily', inventory: 'inventory_daily' };

// Read actual database rows to compare immutable tables before and after resets.
async function rows(table: string) {
  return (await db.query(`SELECT * FROM public.${table} ORDER BY 1, 2`)).rows;
}

try {
  await db.exec(schema);
  await db.exec(reset); // Empty database must work too.
  for (const [fixture, validator] of Object.entries(fixtureSchemas)) {
    const table = names[fixture] ?? fixture;
    const columns = (await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['public', table])).rows.map((row: { column_name: string }) => row.column_name);
    const expected = Object.keys(validator.element.shape);
    if (table === 'recommendations') expected.push('constraints_json');
    assert.deepEqual(columns.sort(), expected.sort(), table);
    const data = validator.parse(JSON.parse(await readFile(new URL(`../fixtures/${fixture}.json`, import.meta.url), 'utf8')));
    for (const row of data) {
      const keys = Object.keys(row);
      const values = Object.entries(row).map(([key, value]) => ['drivers', 'moves'].includes(key) ? JSON.stringify(value) : value);
      await db.query(`INSERT INTO public.${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`, values);
    }
  }
  const protectedTables = ['skus', 'campaigns', 'ad_metrics_daily', 'inventory_daily', 'anomalies'];
  const before = await Promise.all(protectedTables.map(rows));
  await db.exec(`
    UPDATE public.campaign_state SET daily_budget = 0, status = 'paused';
    DELETE FROM public.campaign_state WHERE campaign_id = 'c-premium';
    UPDATE public.confidence_weights SET weight = 0.9;
    UPDATE public.recommendations SET status = 'executed';
    INSERT INTO public.action_log SELECT 'test-action', id, now(), 'tester', 'executed', '' FROM public.recommendations LIMIT 1;
    INSERT INTO public.outcomes SELECT 'test-outcome', id, now(), 100, 90, -10, 3 FROM public.recommendations LIMIT 1;
  `);
  await db.exec(reset);
  await db.exec(reset); // Repeat safely.
  assert.deepEqual(await Promise.all(protectedTables.map(rows)), before);
  assert.equal((await rows('action_log')).length, 0);
  assert.equal((await rows('outcomes')).length, 0);
  assert.ok((await rows('recommendations')).every((row: {status: string}) => row.status === 'pending'));
  assert.equal((await db.query(`SELECT * FROM public.campaigns c LEFT JOIN public.campaign_state s ON s.campaign_id = c.id WHERE s.campaign_id IS NULL OR s.daily_budget <> c.daily_budget OR s.status <> 'active'`)).rows.length, 0);
  const weights = await rows('confidence_weights');
  assert.equal(weights.length, 3);
  assert.ok(weights.every((row: {weight: string}) => Number(row.weight) === 0.75));
  assert.equal((await db.query(`SELECT * FROM pg_tables WHERE schemaname = 'public' AND rowsecurity`)).rows.length, 10);
  assert.equal((await db.query(`SELECT * FROM pg_policies WHERE schemaname = 'public'`)).rows.length, 0);
  await assert.rejects(db.exec(`INSERT INTO public.skus VALUES ('invalid', 'Invalid', 61)`));
  await assert.rejects(db.exec(`INSERT INTO public.ad_metrics_daily SELECT * FROM public.ad_metrics_daily LIMIT 1`));
  await db.exec(`CREATE ROLE schema_reader; GRANT USAGE ON SCHEMA public TO schema_reader; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO schema_reader; SET ROLE schema_reader;`);
  for (const table of [...protectedTables, 'recommendations', 'action_log', 'outcomes', 'campaign_state', 'confidence_weights']) {
    assert.equal((await rows(table)).length, 0, `${table} must hide rows from ordinary roles`);
  }
  await assert.rejects(db.exec(`INSERT INTO public.skus VALUES ('blocked', 'Blocked', 0.5)`));
  console.log('PASS: empty PostgreSQL schema/reset, exact columns, fixtures, reset preservation, constraints, and RLS.');
} finally {
  await db.close();
}
