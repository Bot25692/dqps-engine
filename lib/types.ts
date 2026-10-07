import { z } from 'zod';

const id = z.string().min(1);
const money = z.number().finite().nonnegative();
const count = z.number().int().nonnegative();
const fraction = z.number().min(0).max(1);
const date = z.iso.date();
const timestamp = z.iso.datetime();

export const SkuSchema = z.strictObject({
  id, name: z.string().min(1), margin_rate: fraction,
});
export type Sku = z.infer<typeof SkuSchema>;

export const CampaignSchema = z.strictObject({
  id, name: z.string().min(1), sku_id: id,
  platform: z.enum(['meta', 'google', 'tiktok', 'amazon']), daily_budget: money,
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const MetricRowSchema = z.strictObject({
  campaign_id: id, date, spend: money, revenue: money,
  impressions: count, clicks: count, orders: count,
});
export type MetricRow = z.infer<typeof MetricRowSchema>;

// Inventory sales cover all channels; dates are end-of-day snapshots.
export const InventoryRowSchema = z.strictObject({
  sku_id: id, date, units_on_hand: count, units_sold: count,
});
export type InventoryRow = z.infer<typeof InventoryRowSchema>;

export const DriverSchema = z.strictObject({
  name: z.string().min(1), contribution_pct: z.number().finite(),
  impact: z.enum(['high', 'medium', 'low']), description: z.string().min(1),
});
export type Driver = z.infer<typeof DriverSchema>;

export const AnomalySchema = z.strictObject({
  id, campaign_id: id, date,
  metric: z.enum(['roas', 'ctr', 'cpm', 'cvr', 'aov', 'stock_runway']),
  baseline: z.number().finite(), observed: z.number().finite(),
  z_score: z.number().finite().nonnegative(), change_pct: z.number().finite(),
  severity: z.enum(['warning', 'critical']), drivers: z.array(DriverSchema),
});
export type Anomaly = z.infer<typeof AnomalySchema>;

// One move changes one campaign's daily budget, in INR.
export const MoveSchema = z.strictObject({
  campaign_id: id, old_budget: money, new_budget: money, reason: z.string().min(1),
});
export type Move = z.infer<typeof MoveSchema>;

export const RecommendationSchema = z.strictObject({
  id, created_at: timestamp, type: z.enum(['budget_reallocation', 'stock_protection', 'creative_refresh']),
  moves: z.array(MoveSchema).min(1).max(5),
  expected_profit_gain_per_day: z.number().finite(), confidence: fraction,
  constraints_checked: z.array(z.string().min(1)), explanation: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'executed']),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const ActionLogEntrySchema = z.strictObject({
  id, recommendation_id: id, created_at: timestamp, actor: z.string().min(1),
  action: z.enum(['approved', 'rejected', 'executed']), note: z.string(),
});
export type ActionLogEntry = z.infer<typeof ActionLogEntrySchema>;

// error_pct uses percentage points: 10 means 10%, unlike margin_rate.
export const OutcomeSchema = z.strictObject({
  id, recommendation_id: id, created_at: timestamp,
  predicted: z.number().finite(), actual: z.number().finite(),
  error_pct: z.number().finite(), horizon_days: z.number().int().positive(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const CampaignStateSchema = z.strictObject({
  campaign_id: id, daily_budget: money, status: z.enum(['active', 'paused']), updated_at: timestamp,
});
export type CampaignState = z.infer<typeof CampaignStateSchema>;

export const ConfidenceWeightSchema = z.strictObject({
  recommendation_type: RecommendationSchema.shape.type,
  weight: z.number().min(0.3).max(0.95), updated_at: timestamp,
});
export type ConfidenceWeight = z.infer<typeof ConfidenceWeightSchema>;
