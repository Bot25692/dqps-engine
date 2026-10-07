import { describe, expect, it } from 'vitest';
import type { Repo } from '@/lib/db/repo';
import * as T from '@/lib/types';
import {
  allocationState,
  calendarDaysEndingOn,
  getDatasetDates,
  loadAnalysisInputs,
  runAnalysis,
} from '@/lib/run-analysis';
import { overviewData } from '@/lib/demo/overview-data';
import { mapRecommendationToSimulation, type CampaignEnrichment } from '@/lib/integration/adapter';
import { runSimulation } from '@/lib/simulation/engine';
import { computePredictionError, updateConfidence } from '@/lib/integration/confidence';

/**
 * Lightweight in-memory repository for dataset independence testing
 */
class MemoryRepo implements Repo {
  skus: T.Sku[] = [];
  campaigns: T.Campaign[] = [];
  metrics: T.MetricRow[] = [];
  inventory: T.InventoryRow[] = [];
  anomalies: T.Anomaly[] = [];
  recommendations: T.Recommendation[] = [];
  actionLogs: T.ActionLogEntry[] = [];
  outcomes: T.Outcome[] = [];
  campaignStates = new Map<string, T.CampaignState>();
  confidenceWeights = new Map<string, T.ConfidenceWeight>();

  constructor(initial?: {
    skus?: T.Sku[];
    campaigns?: T.Campaign[];
    metrics?: T.MetricRow[];
    inventory?: T.InventoryRow[];
  }) {
    if (initial?.skus) this.skus = structuredClone(initial.skus);
    if (initial?.campaigns) this.campaigns = structuredClone(initial.campaigns);
    if (initial?.metrics) this.metrics = structuredClone(initial.metrics);
    if (initial?.inventory) this.inventory = structuredClone(initial.inventory);
  }

  async getSkus() { return structuredClone(this.skus); }
  async getCampaigns() { return structuredClone(this.campaigns); }
  async getMetrics(from: string, to: string) {
    return structuredClone(this.metrics.filter(m => m.date >= from && m.date <= to));
  }
  async getInventory(from: string, to: string) {
    return structuredClone(this.inventory.filter(i => i.date >= from && i.date <= to));
  }
  async getAnomalies() { return structuredClone(this.anomalies); }
  async getRecommendations() { return structuredClone(this.recommendations); }
  async getOutcomes() { return structuredClone(this.outcomes); }
  async saveAnomalies(rows: T.Anomaly[]) { this.anomalies = structuredClone(rows); }
  async saveRecommendations(rows: T.Recommendation[]) { this.recommendations = structuredClone(rows); }
  async logAction(entry: T.ActionLogEntry) { this.actionLogs.push(structuredClone(entry)); }
  async saveOutcome(outcome: T.Outcome) { this.outcomes.push(structuredClone(outcome)); }
  async getCampaignState(campaignId: string) { return this.campaignStates.get(campaignId) ?? null; }
  async setCampaignState(state: T.CampaignState) { this.campaignStates.set(state.campaign_id, structuredClone(state)); }
  async getConfidence(type: T.ConfidenceWeight['recommendation_type']) {
    return this.confidenceWeights.get(type) ?? { recommendation_type: type, weight: 0.75, updated_at: '2025-01-01T00:00:00Z' };
  }
  async setConfidence(weight: T.ConfidenceWeight) { this.confidenceWeights.set(weight.recommendation_type, structuredClone(weight)); }
  async resetDecisions() {
    this.outcomes = [];
    this.actionLogs = [];
    this.recommendations = [];
    this.anomalies = [];
  }
}

/**
 * Helper to generate consecutive ISO calendar dates
 */
function generateDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const base = new Date(`${startDate}T00:00:00.000Z`);
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

describe('Dataset Independence & Dynamic Bounds', () => {
  it('correctly calculates calendar days ending on asOf date across leap and non-leap years', () => {
    // 2026 normal year
    const days2026 = calendarDaysEndingOn('2026-10-07', 7);
    expect(days2026).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ]);

    // 2025 non-leap month boundary: March 3
    const days2025 = calendarDaysEndingOn('2025-03-03', 7);
    expect(days2025).toEqual([
      '2025-02-25', '2025-02-26', '2025-02-27', '2025-02-28', '2025-03-01', '2025-03-02', '2025-03-03',
    ]);

    // 2024 leap year: March 3
    const days2024 = calendarDaysEndingOn('2024-03-03', 7);
    expect(days2024).toEqual([
      '2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02', '2024-03-03',
    ]);
  });

  it('dynamically derives from and asOf dates from arbitrary dataset observations', () => {
    const metrics = [
      { date: '2025-05-10', campaign_id: 'c1', spend: 100, revenue: 300, impressions: 1000, clicks: 50, orders: 5 },
      { date: '2025-04-01', campaign_id: 'c1', spend: 100, revenue: 300, impressions: 1000, clicks: 50, orders: 5 },
    ];
    const inventory = [
      { date: '2025-05-15', sku_id: 's1', units_on_hand: 100, units_sold: 10 },
      { date: '2025-03-20', sku_id: 's1', units_on_hand: 120, units_sold: 5 },
    ];

    const bounds = getDatasetDates(metrics, inventory);
    expect(bounds.from).toBe('2025-03-20');
    expect(bounds.asOf).toBe('2025-05-15');
  });

  it('runs complete analysis and Golden Path on an arbitrary Skincare brand in 2025', async () => {
    // 35 days in early 2025
    const dates = generateDates('2025-01-05', 35);
    const asOf = dates.at(-1)!;

    const skus: T.Sku[] = [
      { id: 'SKN-SERUM-01', name: 'Vitamin C Glow Serum', margin_rate: 0.70 },
      { id: 'SKN-CLEANSE-02', name: 'Gentle Foaming Cleanser', margin_rate: 0.55 },
    ];

    const campaigns: T.Campaign[] = [
      { id: 'cmp-serum-meta', name: 'Serum - Meta Scale', sku_id: 'SKN-SERUM-01', platform: 'meta', daily_budget: 12000 },
      { id: 'cmp-cleanse-google', name: 'Cleanser - Google Search', sku_id: 'SKN-CLEANSE-02', platform: 'google', daily_budget: 8000 },
    ];

    // Metrics: Serum is highly profitable with high elasticity and ample stock
    // Cleanser has low stock runway (<3 days) forcing a cut
    const metrics: T.MetricRow[] = [];
    const inventory: T.InventoryRow[] = [];

    for (const d of dates) {
      // Serum metrics
      metrics.push({
        campaign_id: 'cmp-serum-meta', date: d,
        spend: 12000, revenue: 48000,
        impressions: 40000, clicks: 1200, orders: 40,
      });
      // Cleanser metrics
      metrics.push({
        campaign_id: 'cmp-cleanse-google', date: d,
        spend: 8000, revenue: 16000,
        impressions: 20000, clicks: 600, orders: 20,
      });

      // Inventory: Serum ample stock (1000 units), Cleanser low stock (4 units on asOf, sold 10/day -> 0.4 day runway)
      inventory.push({
        sku_id: 'SKN-SERUM-01', date: d,
        units_on_hand: 1000, units_sold: 40,
      });
      inventory.push({
        sku_id: 'SKN-CLEANSE-02', date: d,
        units_on_hand: d === asOf ? 4 : 50, units_sold: 10,
      });
    }

    const repo = new MemoryRepo({ skus, campaigns, metrics, inventory });
    const analysisResult = await runAnalysis(repo);

    expect(analysisResult.asOf).toBe(asOf);
    expect(analysisResult.counts.skus).toBe(2);
    expect(analysisResult.counts.campaigns).toBe(2);
    expect(analysisResult.recommendations.length).toBeGreaterThan(0);

    const rec = analysisResult.topRecommendation!;
    expect(rec.id).toBe(`analysis:${asOf}:budget_reallocation`);
    expect(rec.created_at).toBe(`${asOf}T00:00:00.000Z`);
    expect(rec.status).toBe('pending');

    // Donor: Cleanser cut to protect stock; Receiver: Serum increased
    const donorMove = rec.moves.find(m => m.campaign_id === 'cmp-cleanse-google');
    const receiverMove = rec.moves.find(m => m.campaign_id === 'cmp-serum-meta');
    expect(donorMove).toBeDefined();
    expect(donorMove!.new_budget).toBeLessThan(donorMove!.old_budget);
    expect(receiverMove).toBeDefined();
    expect(receiverMove!.new_budget).toBeGreaterThan(receiverMove!.old_budget);

    // Verify Simulation Adapter & Engine end-to-end with this dataset
    const inputs = await loadAnalysisInputs(repo);
    const state = allocationState(inputs);
    const enrichment = new Map<string, CampaignEnrichment>(state.campaigns.map(c => [c.id, {
      campaign_id: c.id, sku_id: c.sku.id,
      revenue: c.daily_budget * 4,
      spend: c.daily_budget,
      margin_rate: c.sku.margin_rate,
      inventory_units: c.sku.units_on_hand,
      avg_daily_units_sold: c.sku.average_daily_units_sold,
      beta_est: c.curve.beta,
    }]));

    const simMoves = mapRecommendationToSimulation(rec, enrichment);
    expect(simMoves).toHaveLength(rec.moves.length);

    const simResult = runSimulation({
      recommendationId: rec.id,
      moves: simMoves,
      approvedAt: Date.now(),
    }, 1234);
    expect(simResult.moveResults).toHaveLength(2);
    expect(simResult.portfolioGain).toBeDefined();

    // Verify Confidence update
    const errorFraction = computePredictionError(rec.expected_profit_gain_per_day, simResult.portfolioGain);
    const confidenceUpdate = updateConfidence({ currentConfidence: rec.confidence, errorFraction });
    expect(confidenceUpdate.newConfidence).toBeGreaterThanOrEqual(0.30);
    expect(confidenceUpdate.newConfidence).toBeLessThanOrEqual(0.95);
  });

  it('handles zero-order SKUs safely without crashing, marking them ineligible', async () => {
    const dates = generateDates('2025-06-01', 10);
    const asOf = dates.at(-1)!;

    const skus: T.Sku[] = [
      { id: 'ZERO-ORD-SKU', name: 'New Launch Brand New Item', margin_rate: 0.60 },
      { id: 'NORMAL-SKU', name: 'Regular Established Item', margin_rate: 0.50 },
    ];

    const campaigns: T.Campaign[] = [
      { id: 'cmp-zero', name: 'Zero Order Campaign', sku_id: 'ZERO-ORD-SKU', platform: 'meta', daily_budget: 3000 },
      { id: 'cmp-norm', name: 'Normal Campaign', sku_id: 'NORMAL-SKU', platform: 'google', daily_budget: 5000 },
    ];

    const metrics: T.MetricRow[] = [];
    const inventory: T.InventoryRow[] = [];

    for (const d of dates) {
      // Zero-order SKU had spend but 0 orders and 0 revenue
      metrics.push({
        campaign_id: 'cmp-zero', date: d,
        spend: 3000, revenue: 0,
        impressions: 5000, clicks: 100, orders: 0,
      });
      // Normal SKU had orders
      metrics.push({
        campaign_id: 'cmp-norm', date: d,
        spend: 5000, revenue: 15000,
        impressions: 10000, clicks: 300, orders: 15,
      });

      inventory.push({
        sku_id: 'ZERO-ORD-SKU', date: d,
        units_on_hand: 50, units_sold: 0,
      });
      inventory.push({
        sku_id: 'NORMAL-SKU', date: d,
        units_on_hand: 200, units_sold: 15,
      });
    }

    const repo = new MemoryRepo({ skus, campaigns, metrics, inventory });
    const inputs = await loadAnalysisInputs(repo);

    // AllocationState must NOT throw 'Cannot estimate SKU price without orders'
    const state = allocationState(inputs);
    expect(state.campaigns).toHaveLength(2);

    const zeroCampaign = state.campaigns.find(c => c.id === 'cmp-zero')!;
    expect(zeroCampaign.sku.price).toBe(0);
    expect(zeroCampaign.curve.revenue_cap).toBe(0);
    expect(zeroCampaign.curve.r0).toBe(0);
    // Budget is protected with floor = daily_budget
    expect(zeroCampaign.floor).toBe(3000);

    // Run full analysis
    const result = await runAnalysis(repo);
    expect(result.asOf).toBe(asOf);

    // Zero campaign must NEVER be a receiver
    if (result.topRecommendation) {
      const zeroMove = result.topRecommendation.moves.find(m => m.campaign_id === 'cmp-zero');
      if (zeroMove) {
        expect(zeroMove.new_budget).toBeLessThanOrEqual(zeroMove.old_budget);
      }
    }
  });

  it('uses catalog price when available on zero-order SKU', async () => {
    const dates = generateDates('2025-06-01', 8);

    // SKU with explicit catalog price
    const skus = [
      { id: 'CAT-PRICED-SKU', name: 'Catalog Priced Item', margin_rate: 0.60, price: 799 },
    ] as unknown as T.Sku[];

    const campaigns: T.Campaign[] = [
      { id: 'cmp-cat', name: 'Catalog Campaign', sku_id: 'CAT-PRICED-SKU', platform: 'meta', daily_budget: 2000 },
    ];

    const metrics: T.MetricRow[] = dates.map(d => ({
      campaign_id: 'cmp-cat', date: d,
      spend: 2000, revenue: 0, impressions: 2000, clicks: 50, orders: 0,
    }));

    const inventory: T.InventoryRow[] = dates.map(d => ({
      sku_id: 'CAT-PRICED-SKU', date: d,
      units_on_hand: 100, units_sold: 0,
    }));

    const repo = new MemoryRepo({ skus, campaigns, metrics, inventory });
    const inputs = await loadAnalysisInputs(repo);
    const state = allocationState(inputs);

    const c = state.campaigns[0];
    expect(c.sku.price).toBe(799);
  });

  it('rejects incomplete seven-day inventory history explicitly', async () => {
    const dates = generateDates('2025-07-01', 7);

    const skus: T.Sku[] = [{ id: 'SKU-GAP', name: 'Gap Item', margin_rate: 0.50 }];
    const campaigns: T.Campaign[] = [{ id: 'cmp-gap', name: 'Gap Cmp', sku_id: 'SKU-GAP', platform: 'meta', daily_budget: 1000 }];

    const metrics: T.MetricRow[] = dates.map(d => ({
      campaign_id: 'cmp-gap', date: d, spend: 1000, revenue: 2000, impressions: 1000, clicks: 50, orders: 5,
    }));

    // Missing day 3 (only 6 inventory rows instead of 7)
    const incompleteDates = dates.filter((_, idx) => idx !== 2);
    const inventory: T.InventoryRow[] = incompleteDates.map(d => ({
      sku_id: 'SKU-GAP', date: d, units_on_hand: 50, units_sold: 5,
    }));

    const repo = new MemoryRepo({ skus, campaigns, metrics, inventory });
    const inputs = await loadAnalysisInputs(repo);

    expect(() => allocationState(inputs)).toThrow('Incomplete seven-day inventory for SKU SKU-GAP');
  });

  it('rejects unsupported platforms clearly with supported list', async () => {
    const dates = generateDates('2025-08-01', 7);

    const skus: T.Sku[] = [{ id: 'SKU-PINT', name: 'Pinterest Item', margin_rate: 0.50 }];
    const campaigns = [
      { id: 'cmp-pint', name: 'Pinterest Ad', sku_id: 'SKU-PINT', platform: 'pinterest', daily_budget: 1000 },
    ] as unknown as T.Campaign[];

    const metrics: T.MetricRow[] = dates.map(d => ({
      campaign_id: 'cmp-pint', date: d, spend: 1000, revenue: 2000, impressions: 1000, clicks: 50, orders: 5,
    }));
    const inventory: T.InventoryRow[] = dates.map(d => ({
      sku_id: 'SKU-PINT', date: d, units_on_hand: 50, units_sold: 5,
    }));

    const repo = new MemoryRepo({ skus, campaigns, metrics, inventory });
    const inputs = await loadAnalysisInputs(repo);

    expect(() => allocationState(inputs)).toThrow(
      'Unsupported campaign platform: "pinterest". Supported platforms are meta, google, tiktok, amazon.'
    );
  });

  it('derives Overview data dynamically for non-standard SKUs and returns metadata', () => {
    const dates = generateDates('2025-09-01', 14);
    const latest = dates.at(-1)!;

    const skus: T.Sku[] = [
      { id: 'BEAUTY-LIPSTICK', name: 'Matte Red Lipstick', margin_rate: 0.75 },
      { id: 'BEAUTY-FOUNDATION', name: 'Liquid Foundation', margin_rate: 0.60 },
    ];

    const campaigns: T.Campaign[] = [
      { id: 'cmp-lip', name: 'Lipstick Meta', sku_id: 'BEAUTY-LIPSTICK', platform: 'meta', daily_budget: 4000 },
      { id: 'cmp-fnd', name: 'Foundation Google', sku_id: 'BEAUTY-FOUNDATION', platform: 'google', daily_budget: 6000 },
    ];

    const metrics: T.MetricRow[] = [];
    const inventory: T.InventoryRow[] = [];

    for (const d of dates) {
      metrics.push({
        campaign_id: 'cmp-lip', date: d, spend: 4000, revenue: 20000, impressions: 10000, clicks: 500, orders: 25,
      });
      metrics.push({
        campaign_id: 'cmp-fnd', date: d, spend: 6000, revenue: 12000, impressions: 8000, clicks: 300, orders: 10,
      });

      // Lipstick has ample stock (500 units / 25 daily = 20 days)
      inventory.push({ sku_id: 'BEAUTY-LIPSTICK', date: d, units_on_hand: 500, units_sold: 25 });
      // Foundation has low stock runway (12 units / 10 daily = 1.2 days)
      inventory.push({ sku_id: 'BEAUTY-FOUNDATION', date: d, units_on_hand: 12, units_sold: 10 });
    }

    const overview = overviewData({ campaigns, skus, metrics, inventory });

    // Attention item should dynamically pick Foundation due to stock risk (<5 days)
    expect(overview.attentionItem.id).toBe('BEAUTY-FOUNDATION');
    expect(overview.attentionItem.statusLabel).toBe('STOCK RISK');
    expect(overview.attentionItem.stockRunwayDays).toBeCloseTo(1.2);

    // Opportunity item should dynamically pick Lipstick (ample stock >= 7 days, 75% margin, 5.0x ROAS)
    expect(overview.opportunityItem.id).toBe('BEAUTY-LIPSTICK');
    expect(overview.opportunityItem.statusLabel).toBe('OPPORTUNITY');
    expect(overview.opportunityItem.roas).toBeCloseTo(5.0);

    // Metadata should be accurate
    expect(overview.metadata).toEqual({
      asOfDate: latest,
      platformCount: 2,
      skuCount: 2,
      campaignCount: 2,
      dayCount: 14,
    });
  });

  it('zero-order SKU protection does not prevent valid reallocations between other SKUs in the portfolio', async () => {
    const dates = generateDates('2025-10-01', 14);
    const asOf = dates.at(-1)!;

    const skus: T.Sku[] = [
      { id: 'SKU-DONOR', name: 'Low Stock Donor Item', margin_rate: 0.50 },
      { id: 'SKU-RECEIVER', name: 'High Margin Receiver Item', margin_rate: 0.70 },
      { id: 'SKU-ZERO', name: 'Zero Order Protected Item', margin_rate: 0.60 },
    ];

    const campaigns: T.Campaign[] = [
      { id: 'cmp-donor', name: 'Donor Campaign', sku_id: 'SKU-DONOR', platform: 'meta', daily_budget: 10000 },
      { id: 'cmp-receiver', name: 'Receiver Campaign', sku_id: 'SKU-RECEIVER', platform: 'google', daily_budget: 10000 },
      { id: 'cmp-zero', name: 'Zero Order Campaign', sku_id: 'SKU-ZERO', platform: 'tiktok', daily_budget: 5000 },
    ];

    const metrics: T.MetricRow[] = [];
    const inventory: T.InventoryRow[] = [];

    for (const d of dates) {
      metrics.push({ campaign_id: 'cmp-donor', date: d, spend: 10000, revenue: 20000, impressions: 20000, clicks: 500, orders: 20 });
      metrics.push({ campaign_id: 'cmp-receiver', date: d, spend: 10000, revenue: 50000, impressions: 30000, clicks: 1000, orders: 50 });
      // Zero order campaign has spend but 0 revenue and 0 orders
      metrics.push({ campaign_id: 'cmp-zero', date: d, spend: 5000, revenue: 0, impressions: 5000, clicks: 100, orders: 0 });

      // Donor has very low stock (10 units, sold 20/day -> 0.5 days runway)
      inventory.push({ sku_id: 'SKU-DONOR', date: d, units_on_hand: d === asOf ? 10 : 100, units_sold: 20 });
      // Receiver has ample stock (1000 units, sold 50/day -> 20 days runway)
      inventory.push({ sku_id: 'SKU-RECEIVER', date: d, units_on_hand: 1000, units_sold: 50 });
      // Zero-order SKU has units on hand
      inventory.push({ sku_id: 'SKU-ZERO', date: d, units_on_hand: 100, units_sold: 0 });
    }

    const repo = new MemoryRepo({ skus, campaigns, metrics, inventory });
    const analysis = await runAnalysis(repo);

    expect(analysis.recommendations).toHaveLength(1);
    const rec = analysis.recommendations[0];

    // Verify donor is cut and receiver is increased
    const donorMove = rec.moves.find(m => m.campaign_id === 'cmp-donor');
    const receiverMove = rec.moves.find(m => m.campaign_id === 'cmp-receiver');
    const zeroMove = rec.moves.find(m => m.campaign_id === 'cmp-zero');

    expect(donorMove).toBeDefined();
    expect(donorMove!.new_budget).toBeLessThan(donorMove!.old_budget);
    expect(receiverMove).toBeDefined();
    expect(receiverMove!.new_budget).toBeGreaterThan(receiverMove!.old_budget);

    // Zero-order campaign was NOT modified
    expect(zeroMove).toBeUndefined();
  });

  it('executes full Golden Path via HTTP POST /api/decide with arbitrary 2025 dataset', async () => {
    const { POST: decideRoute } = await import('@/app/api/decide/route');
    const dates = generateDates('2025-02-01', 20);
    const asOf = dates.at(-1)!;

    const skus: T.Sku[] = [
      { id: 'ARBITRARY-SKU-1', name: 'Alpha Brand Product', margin_rate: 0.65 },
      { id: 'ARBITRARY-SKU-2', name: 'Beta Brand Product', margin_rate: 0.50 },
    ];
    const campaigns: T.Campaign[] = [
      { id: 'cmp-alpha', name: 'Alpha Campaign', sku_id: 'ARBITRARY-SKU-1', platform: 'meta', daily_budget: 10000 },
      { id: 'cmp-beta', name: 'Beta Campaign', sku_id: 'ARBITRARY-SKU-2', platform: 'google', daily_budget: 10000 },
    ];
    const metrics: T.MetricRow[] = [];
    const inventory: T.InventoryRow[] = [];

    for (const d of dates) {
      metrics.push({ campaign_id: 'cmp-alpha', date: d, spend: 10000, revenue: 45000, impressions: 30000, clicks: 800, orders: 45 });
      metrics.push({ campaign_id: 'cmp-beta', date: d, spend: 10000, revenue: 15000, impressions: 20000, clicks: 400, orders: 15 });
      inventory.push({ sku_id: 'ARBITRARY-SKU-1', date: d, units_on_hand: 800, units_sold: 45 });
      inventory.push({ sku_id: 'ARBITRARY-SKU-2', date: d, units_on_hand: d === asOf ? 5 : 60, units_sold: 15 });
    }

    const testRepo = new MemoryRepo({ skus, campaigns, metrics, inventory });
    await runAnalysis(testRepo);

    const rec = (await testRepo.getRecommendations())[0];
    expect(rec).toBeDefined();
    expect(rec.id).toBe(`analysis:${asOf}:budget_reallocation`);

    // Attach to adaptRuntime
    const previousRuntime = (globalThis as unknown as { adaptRuntime?: unknown }).adaptRuntime;
    const testDataRepo = Object.assign(testRepo, {
      status: { dataSource: 'fixtures' as const, isFallback: false, banner: null },
      run: <T>(op: (r: Repo) => Promise<T>) => op(testRepo),
    });
    (globalThis as unknown as { adaptRuntime?: unknown }).adaptRuntime = {
      repo: testDataRepo,
      queue: Promise.resolve(),
      ready: Promise.resolve(),
    };

    try {
      // 1. Register
      const regRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST',
        body: JSON.stringify({ recommendationId: rec.id, action: 'register' }),
      }));
      expect(regRes.status).toBe(200);

      // 2. Approve
      const appRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST',
        body: JSON.stringify({ recommendationId: rec.id, action: 'approve' }),
      }));
      expect(appRes.status).toBe(200);

      // 3. Simulate
      const simRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST',
        body: JSON.stringify({ recommendationId: rec.id, action: 'simulate', seed: 42 }),
      }));
      expect(simRes.status).toBe(200);
      const simData = await simRes.json();
      expect(simData.ok).toBe(true);
      expect(simData.status).toBe('simulated');
      expect(simData.simulationResult).toBeDefined();
      expect(simData.confidenceUpdate).toBeDefined();

      // Verify outcomes persisted
      const outcomes = await testRepo.getOutcomes();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].recommendation_id).toBe(rec.id);

      // 4. Reset
      const resetRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST',
        body: JSON.stringify({ recommendationId: rec.id, action: 'reset' }),
      }));
      expect(resetRes.status).toBe(200);
      expect(await testRepo.getOutcomes()).toHaveLength(0);
    } finally {
      (globalThis as unknown as { adaptRuntime?: unknown }).adaptRuntime = previousRuntime;
    }
  });
});
