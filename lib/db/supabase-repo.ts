import { z } from 'zod';
import { fixtureSchemas, type Repo } from './repo';
import * as T from '../types';


export type SupabaseClient = typeof fetch;
type Table = 'skus' | 'campaigns' | 'ad_metrics_daily' | 'inventory_daily' |
  'anomalies' | 'recommendations' | 'action_log' | 'outcomes' | 'campaign_state' | 'confidence_weights';

// Reject browser execution before reading any server credentials.
export function assertServer() {
  if ('window' in globalThis) throw new Error('Database access is server-only');
}

// Validate the inclusive date range before issuing any requests.
export function validateRange(from: string, to: string) {
  z.iso.date().parse(from);
  z.iso.date().parse(to);
  if (from > to) throw new RangeError('from must be on or before to');
}

// Postgres returns timezone offsets; the shared contract uses UTC ISO timestamps.
function normalizeRow(row: Record<string, unknown>) {
  const result = { ...row };
  for (const field of ['created_at', 'updated_at']) {
    if (typeof result[field] === 'string') result[field] = new Date(result[field]).toISOString();
  }
  return result;
}

// Access Supabase PostgREST exclusively from server code, with an injectable HTTP client.
export class SupabaseRepo implements Repo {
  private readonly url: string;
  private readonly key: string;
  private readonly client: SupabaseClient;
  private readonly controller = new AbortController();

  constructor(options: { url?: string; serviceKey?: string; client?: SupabaseClient } = {}) {
    assertServer();
    const url = options.url ?? process.env.SUPABASE_URL;
    const key = options.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    this.url = url;
    this.key = key;
    this.client = options.client ?? fetch;
  }

  // Stop pending requests and prevent later steps of a failed operation from issuing writes.
  abort() { this.controller.abort(); }

  // Keep credentials in request headers and omit backend error bodies from exceptions.
  private async request(table: Table, query: URLSearchParams, init: RequestInit = {}) {
    this.controller.signal.throwIfAborted();
    const url = new URL(`/rest/v1/${table}`, this.url);
    url.search = query.toString();
    const response = await this.client(url, {
      ...init, signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(3000)]),
      headers: {
        apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Supabase ${table} request failed (${response.status})`);
    return response;
  }

  // Read deterministic pages so date ranges are not silently truncated by the API row limit.
  private async read<S extends z.ZodObject>(table: Table, schema: S, order: string, filters: [string, string][] = []): Promise<z.infer<S>[]> {
    const rows: unknown[] = [];
    for (let offset = 0; ; ) {
      const query = new URLSearchParams([
        ['select', Object.keys(schema.shape).join(',')], ['order', order],
        ['offset', String(offset)], ['limit', '500'], ...filters,
      ]);
      const response = await this.request(table, query, { headers: { Prefer: 'count=exact' } });
      const page = z.array(z.record(z.string(), z.unknown())).parse(await response.json());
      rows.push(...page.map(normalizeRow));
      offset += page.length;
      const total = response.headers.get('content-range')?.split('/')[1];
      if (page.length === 0 || (total && total !== '*' ? offset >= Number(total) : page.length < 500)) break;
    }
    return z.array(schema).parse(rows);
  }

  // Validate before writing; upserts use the table's primary key, while actions are inserts.
  private async write(table: Table, rows: unknown[], upsert = true) {
    if (!rows.length) return;
    await this.request(table, new URLSearchParams(), {
      method: 'POST', body: JSON.stringify(rows),
      headers: { Prefer: upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal' },
    });
  }

  async getSkus() { return this.read('skus', T.SkuSchema, 'id'); }
  async getCampaigns() { return this.read('campaigns', T.CampaignSchema, 'id'); }
  async getMetrics(from: string, to: string) {
    validateRange(from, to);
    return this.read('ad_metrics_daily', T.MetricRowSchema, 'date,campaign_id', [['date', `gte.${from}`], ['date', `lte.${to}`]]);
  }
  async getInventory(from: string, to: string) {
    validateRange(from, to);
    return this.read('inventory_daily', T.InventoryRowSchema, 'date,sku_id', [['date', `gte.${from}`], ['date', `lte.${to}`]]);
  }
  async getAnomalies() { return this.read('anomalies', T.AnomalySchema, 'id'); }
  async getRecommendations() { return this.read('recommendations', T.RecommendationSchema, 'id'); }
  async saveAnomalies(rows: T.Anomaly[]) { await this.write('anomalies', fixtureSchemas.anomalies.parse(rows)); }
  async saveRecommendations(rows: T.Recommendation[]) { await this.write('recommendations', fixtureSchemas.recommendations.parse(rows)); }
  async logAction(entry: T.ActionLogEntry) { await this.write('action_log', [T.ActionLogEntrySchema.parse(entry)], false); }
  async saveOutcome(outcome: T.Outcome) { await this.write('outcomes', [T.OutcomeSchema.parse(outcome)]); }
  async getCampaignState(campaignId: string) {
    return (await this.read('campaign_state', T.CampaignStateSchema, 'campaign_id', [['campaign_id', `eq.${campaignId}`]]))[0] ?? null;
  }
  async setCampaignState(state: T.CampaignState) { await this.write('campaign_state', [T.CampaignStateSchema.parse(state)]); }
  async getConfidence(type: T.ConfidenceWeight['recommendation_type']) {
    return (await this.read('confidence_weights', T.ConfidenceWeightSchema, 'recommendation_type', [['recommendation_type', `eq.${type}`]]))[0] ?? null;
  }
  async setConfidence(weight: T.ConfidenceWeight) { await this.write('confidence_weights', [T.ConfidenceWeightSchema.parse(weight)]); }

  // Mirror 002_reset.sql in FK order. REST operations are not a single transaction.
  async resetDecisions() {
    const campaigns = await this.getCampaigns();
    for (const table of ['action_log', 'outcomes'] as const) {
      await this.request(table, new URLSearchParams({ id: 'not.is.null' }), { method: 'DELETE' });
    }
    const updated_at = new Date().toISOString();
    await this.write('campaign_state', campaigns.map(row => ({ campaign_id: row.id, daily_budget: row.daily_budget, status: 'active', updated_at })));
    await this.request('recommendations', new URLSearchParams({ id: 'not.is.null' }), { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) });
    await this.write('confidence_weights', T.RecommendationSchema.shape.type.options.map(recommendation_type => ({ recommendation_type, weight: 0.75, updated_at })));
  }
}
