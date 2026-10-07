import path from 'path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { z } from 'zod';
import * as T from '../types.ts';

export interface Repo {
  getSkus(): Promise<T.Sku[]>;
  getCampaigns(): Promise<T.Campaign[]>;
  getMetrics(from: string, to: string): Promise<T.MetricRow[]>;
  getInventory(from: string, to: string): Promise<T.InventoryRow[]>;
  getAnomalies(): Promise<T.Anomaly[]>;
  getRecommendations(): Promise<T.Recommendation[]>;
  saveAnomalies(rows: T.Anomaly[]): Promise<void>;
  saveRecommendations(rows: T.Recommendation[]): Promise<void>;
  logAction(entry: T.ActionLogEntry): Promise<void>;
  saveOutcome(outcome: T.Outcome): Promise<void>;
  getCampaignState(campaignId: string): Promise<T.CampaignState | null>;
  setCampaignState(state: T.CampaignState): Promise<void>;
  getConfidence(type: T.ConfidenceWeight['recommendation_type']): Promise<T.ConfidenceWeight | null>;
  setConfidence(weight: T.ConfidenceWeight): Promise<void>;
  resetDecisions(): Promise<void>;
}

export const fixtureSchemas = {
  skus: z.array(T.SkuSchema), campaigns: z.array(T.CampaignSchema),
  metrics: z.array(T.MetricRowSchema), inventory: z.array(T.InventoryRowSchema),
  anomalies: z.array(T.AnomalySchema), recommendations: z.array(T.RecommendationSchema),
  action_log: z.array(T.ActionLogEntrySchema), outcomes: z.array(T.OutcomeSchema),
  campaign_state: z.array(T.CampaignStateSchema), confidence_weights: z.array(T.ConfidenceWeightSchema),
};
type Data = { [K in keyof typeof fixtureSchemas]: z.infer<(typeof fixtureSchemas)[K]> };

// Read and validate every JSON table before exposing a usable repository.
async function loadFixtures(directory: string): Promise<Data> {
  const entries = await Promise.all(Object.entries(fixtureSchemas).map(async ([name, schema]) =>
    [name, schema.parse(JSON.parse(await readFile(join(directory, `${name}.json`), 'utf8')))]
  ));
  return Object.fromEntries(entries) as Data;
}

// Read a seed bundle through the same table contracts, ignoring generator-only metadata.
async function loadSeedFixtures(seed: number): Promise<Data> {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Invalid fixture seed');
  const raw = JSON.parse(await readFile(new URL(`../../fixtures/seed-${seed}.json`, import.meta.url), 'utf8'));
  return Object.fromEntries(Object.entries(fixtureSchemas).map(([name, schema]) =>
    [name, schema.parse(raw[name])])) as Data;
}

// Apply inclusive ISO date bounds and reject reversed or malformed ranges.
function inRange<R extends { date: string }>(rows: R[], from: string, to: string): R[] {
  z.iso.date().parse(from);
  z.iso.date().parse(to);
  if (from > to) throw new RangeError('from must be on or before to');
  return rows.filter(row => row.date >= from && row.date <= to);
}

// Replace records by key; new records append in input order.
function upsert<R>(rows: R[], additions: R[], key: keyof R): R[] {
  const indexed = new Map(rows.map(row => [row[key], row]));
  for (const row of additions) indexed.set(row[key], structuredClone(row));
  return [...indexed.values()];
}

// Each instance owns in-memory decisions; source JSON is never overwritten.
export class FixtureRepo implements Repo {
  private readonly ready: Promise<Data>;
  private baseline!: Data;

  constructor(directory: string | { seed: number } = path.join(process.cwd(), 'fixtures'))  {
    this.ready = (typeof directory === 'string' ? loadFixtures(directory) : loadSeedFixtures(directory.seed)).then(data => {
      this.baseline = structuredClone(data);
      return data;
    });
  }

  // Return copies so callers cannot mutate repository state through reads.
  private async read<K extends keyof Data>(key: K): Promise<Data[K]> {
    return structuredClone((await this.ready)[key]);
  }

  async getSkus() { return this.read('skus'); }
  async getCampaigns() { return this.read('campaigns'); }
  async getMetrics(from: string, to: string) { return inRange(await this.read('metrics'), from, to); }
  async getInventory(from: string, to: string) { return inRange(await this.read('inventory'), from, to); }
  async getAnomalies() { return this.read('anomalies'); }
  async getRecommendations() { return this.read('recommendations'); }
  async getActionLog() { return this.read('action_log'); }
  async getOutcomes() { return this.read('outcomes'); }

  // Validate entire batches before updating records by ID.
  async saveAnomalies(rows: T.Anomaly[]) {
    const parsed = fixtureSchemas.anomalies.parse(rows);
    const data = await this.ready;
    data.anomalies = upsert(data.anomalies, parsed, 'id');
  }
  async saveRecommendations(rows: T.Recommendation[]) {
    const parsed = fixtureSchemas.recommendations.parse(rows);
    const data = await this.ready;
    data.recommendations = upsert(data.recommendations, parsed, 'id');
  }
  async logAction(entry: T.ActionLogEntry) {
    const parsed = T.ActionLogEntrySchema.parse(entry);
    const data = await this.ready;
    if (data.action_log.some(row => row.id === parsed.id)) throw new Error('Duplicate action ID');
    data.action_log.push(parsed);
  }
  async saveOutcome(outcome: T.Outcome) {
    const parsed = T.OutcomeSchema.parse(outcome);
    const data = await this.ready;
    data.outcomes = upsert(data.outcomes, [parsed], 'id');
  }
  async getCampaignState(campaignId: string) {
    return (await this.read('campaign_state')).find(row => row.campaign_id === campaignId) ?? null;
  }
  async setCampaignState(state: T.CampaignState) {
    const parsed = T.CampaignStateSchema.parse(state);
    const data = await this.ready;
    data.campaign_state = upsert(data.campaign_state, [parsed], 'campaign_id');
  }
  async getConfidence(type: T.ConfidenceWeight['recommendation_type']) {
    return (await this.read('confidence_weights')).find(row => row.recommendation_type === type) ?? null;
  }
  async setConfidence(weight: T.ConfidenceWeight) {
    const parsed = T.ConfidenceWeightSchema.parse(weight);
    const data = await this.ready;
    data.confidence_weights = upsert(data.confidence_weights, [parsed], 'recommendation_type');
  }

  // Restore all seeded decisions, logs, outcomes, budgets, and confidence weights.
  async resetDecisions() {
    const data = await this.ready;
    Object.assign(data, structuredClone(this.baseline));
  }
}
