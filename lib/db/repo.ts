import { readFile, writeFile, mkdir, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import * as T from '../types';

export interface Repo {
  getSkus(): Promise<T.Sku[]>;
  getCampaigns(): Promise<T.Campaign[]>;
  getMetrics(from: string, to: string): Promise<T.MetricRow[]>;
  getInventory(from: string, to: string): Promise<T.InventoryRow[]>;
  getAnomalies(): Promise<T.Anomaly[]>;
  getRecommendations(): Promise<T.Recommendation[]>;
  getOutcomes(): Promise<T.Outcome[]>;
  getActionLog(): Promise<T.ActionLogEntry[]>;
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
  const raw = JSON.parse(await readFile(join(process.cwd(), 'fixtures', `seed-${seed}.json`), 'utf8'));
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

export type FixtureRepoInit =
  | string
  | { seed?: number; directory?: string; storageDir?: string | null };

// Each instance owns in-memory decisions with optional disk overlay persistence across serverless container recycling.
export class FixtureRepo implements Repo {
  private readonly ready: Promise<Data>;
  private baseline!: Data;
  private readonly storageDir: string | null;
  private readonly directory?: string;
  private readonly seed?: number;

  constructor(options: FixtureRepoInit = join(process.cwd(), 'fixtures')) {
    let dir: string | undefined;
    let seed: number | undefined;
    let storage: string | null | undefined;

    if (typeof options === 'string') {
      dir = options;
    } else {
      dir = options.directory;
      seed = options.seed;
      storage = options.storageDir;
    }

    this.directory = dir;
    this.seed = seed;
    this.storageDir = storage === null ? null : (storage ?? (process.env.ADAPT_STORAGE_DIR || null));

    const loader = seed !== undefined ? loadSeedFixtures(seed) : loadFixtures(dir ?? join(process.cwd(), 'fixtures'));
    this.ready = loader.then(async data => {
      this.baseline = structuredClone(data);
      if (this.storageDir) {
        try {
          const content = await readFile(this.getOverlayPath(), 'utf8');
          const overlay = JSON.parse(content);
          if (Array.isArray(overlay.anomalies)) data.anomalies = upsert(data.anomalies, fixtureSchemas.anomalies.parse(overlay.anomalies), 'id');
          if (Array.isArray(overlay.recommendations)) data.recommendations = upsert(data.recommendations, fixtureSchemas.recommendations.parse(overlay.recommendations), 'id');
          if (Array.isArray(overlay.action_log)) {
            const parsed = fixtureSchemas.action_log.parse(overlay.action_log);
            for (const item of parsed) {
              if (!data.action_log.some(r => r.id === item.id)) data.action_log.push(item);
            }
          }
          if (Array.isArray(overlay.outcomes)) data.outcomes = upsert(data.outcomes, fixtureSchemas.outcomes.parse(overlay.outcomes), 'id');
          if (Array.isArray(overlay.campaign_state)) data.campaign_state = upsert(data.campaign_state, fixtureSchemas.campaign_state.parse(overlay.campaign_state), 'campaign_id');
          if (Array.isArray(overlay.confidence_weights)) data.confidence_weights = upsert(data.confidence_weights, fixtureSchemas.confidence_weights.parse(overlay.confidence_weights), 'recommendation_type');
        } catch {
          // No overlay file yet or read error - keep baseline
        }
      }
      return data;
    });
  }

  private getOverlayPath(): string {
    const key = this.seed !== undefined ? `seed-${this.seed}` : (this.directory ? this.directory.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default');
    return join(this.storageDir!, `overlay-${key}.json`);
  }

  private async persistOverlay(data: Data): Promise<void> {
    if (!this.storageDir) return;
    try {
      await mkdir(this.storageDir, { recursive: true });
      const target = this.getOverlayPath();
      const tmp = `${target}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      const payload = {
        anomalies: data.anomalies,
        recommendations: data.recommendations,
        action_log: data.action_log,
        outcomes: data.outcomes,
        campaign_state: data.campaign_state,
        confidence_weights: data.confidence_weights,
      };
      await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
      await rename(tmp, target);
    } catch {
      // Graceful fallback if storage write fails
    }
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
    await this.persistOverlay(data);
  }
  async saveRecommendations(rows: T.Recommendation[]) {
    const parsed = fixtureSchemas.recommendations.parse(rows);
    const data = await this.ready;
    data.recommendations = upsert(data.recommendations, parsed, 'id');
    await this.persistOverlay(data);
  }
  async logAction(entry: T.ActionLogEntry) {
    const parsed = T.ActionLogEntrySchema.parse(entry);
    const data = await this.ready;
    if (data.action_log.some(row => row.id === parsed.id)) throw new Error('Duplicate action ID');
    data.action_log.push(parsed);
    await this.persistOverlay(data);
  }
  async saveOutcome(outcome: T.Outcome) {
    const parsed = T.OutcomeSchema.parse(outcome);
    const data = await this.ready;
    data.outcomes = upsert(data.outcomes, [parsed], 'id');
    await this.persistOverlay(data);
  }
  async getCampaignState(campaignId: string) {
    return (await this.read('campaign_state')).find(row => row.campaign_id === campaignId) ?? null;
  }
  async setCampaignState(state: T.CampaignState) {
    const parsed = T.CampaignStateSchema.parse(state);
    const data = await this.ready;
    data.campaign_state = upsert(data.campaign_state, [parsed], 'campaign_id');
    await this.persistOverlay(data);
  }
  async getConfidence(type: T.ConfidenceWeight['recommendation_type']) {
    return (await this.read('confidence_weights')).find(row => row.recommendation_type === type) ?? null;
  }
  async setConfidence(weight: T.ConfidenceWeight) {
    const parsed = T.ConfidenceWeightSchema.parse(weight);
    const data = await this.ready;
    data.confidence_weights = upsert(data.confidence_weights, [parsed], 'recommendation_type');
    await this.persistOverlay(data);
  }

  // Restore all seeded decisions, logs, outcomes, budgets, and confidence weights.
  async resetDecisions() {
    const data = await this.ready;
    Object.assign(data, structuredClone(this.baseline));
    if (this.storageDir) {
      try {
        await unlink(this.getOverlayPath());
      } catch {}
    }
  }
}
