import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../lib/types.ts';

export const tableSchemas = {
  skus: T.SkuSchema, campaigns: T.CampaignSchema,
  ad_metrics_daily: T.MetricRowSchema, inventory_daily: T.InventoryRowSchema,
  anomalies: T.AnomalySchema, recommendations: T.RecommendationSchema,
  action_log: T.ActionLogEntrySchema, outcomes: T.OutcomeSchema,
  campaign_state: T.CampaignStateSchema, confidence_weights: T.ConfidenceWeightSchema,
};

test('SQL columns match every table contract, with only the requested constraints_json extension', async () => {
  const sql = await readFile(new URL('../supabase/001_schema.sql', import.meta.url), 'utf8');
  const tables = [...sql.matchAll(/CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/g)];
  assert.deepEqual(tables.map(match => match[1]).sort(), Object.keys(tableSchemas).sort());
  for (const [table, schema] of Object.entries(tableSchemas)) {
    const body = tables.find(match => match[1] === table)![2];
    const columns = [...body.matchAll(/^  (\w+) (?:text|numeric|bigint|integer|date|timestamptz|jsonb)\b/gm)].map(match => match[1]);
    const expected = Object.keys(schema.shape);
    if (table === 'recommendations') expected.push('constraints_json');
    assert.deepEqual(columns.sort(), expected.sort(), table);
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`));
  }
  assert.doesNotMatch(sql, /CREATE\s+POLICY/i);
});
