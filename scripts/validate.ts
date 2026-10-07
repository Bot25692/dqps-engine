import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FixtureRepo } from '../lib/db/repo.ts';
import { stockRisk, madAnomalies, fatigue, profitLeak, mergeConsecutiveFlags } from '../lib/analysis/detect.ts';
import { rootCause } from '../lib/analysis/rootcause.ts';
import { allocate, assertGuardrails, type AllocationPlan, type ConstraintRule } from '../lib/analysis/optimize.ts';
import { ANALYSIS_FROM, ANALYSIS_AS_OF, loadAnalysisInputs, runAnalysis } from '../lib/run-analysis.ts';
import type { Anomaly, Campaign } from '../lib/types.ts';

const DAY_MS = 86_400_000;
const TOLERANCE_DAYS = 2;
type Detector = 'stockRisk' | 'fatigue' | 'madAnomalies' | 'profitLeak';
type EventId = 'E1' | 'E2' | 'E3' | 'E4';
interface GroundTruth {
  label: string;
  detector: Detector;
  startDay: number;
  campaignMatches: (campaign: Campaign) => boolean;
  metric: Anomaly['metric'];
}

// Fixed expectations come from the scenario, never from the detected dates.
// E4 is a persistent leak from day 1; E3 applies to every Google campaign.
const GROUND_TRUTH: Record<EventId, GroundTruth> = {
  E1: { label: 'SNK-01', detector: 'stockRisk', startDay: 41, metric: 'stock_runway',
    campaignMatches: c => c.sku_id === 'SNK-01' },
  E2: { label: 'HOOD-01 / Meta', detector: 'fatigue', startDay: 22, metric: 'ctr',
    campaignMatches: c => c.sku_id === 'HOOD-01' && c.platform === 'meta' },
  E3: { label: 'Google', detector: 'madAnomalies', startDay: 36, metric: 'cpm',
    campaignMatches: c => c.platform === 'google' },
  E4: { label: 'TEE-BSC / TikTok', detector: 'profitLeak', startDay: 1, metric: 'roas',
    campaignMatches: c => c.sku_id === 'TEE-BSC' && c.platform === 'tiktok' },
};
const REQUIRED_GUARDRAILS: readonly ConstraintRule[] = [
  'budget conserved', 'donor cap', 'receiver cap', 'platform floor',
  'receiver cover', 'min gain', 'max moves',
];
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const eventDay = (date: string) => 1 + (Date.parse(`${date}T00:00:00Z`)
  - Date.parse(`${ANALYSIS_FROM}T00:00:00Z`)) / DAY_MS;

// Translate only the two documented display labels; never infer a driver from its description.
function canonicalDriver(name: string | undefined): string | undefined {
  return name === 'Stock risk' ? 'stockRisk' : name === 'Margin' ? 'margin_rate' : name;
}

// Score fresh Seed 1 results while collecting all failures before returning a failing exit code.
export async function main(): Promise<void> {
  const started = performance.now();
  let passed = 0, failed = 0;
  const color = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
  const report = (ok: boolean, label: string, detail: string) => {
    if (ok) passed++; else failed++;
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`${color ? (ok ? '\x1b[32m' : '\x1b[31m') : ''}[${status}]${color ? '\x1b[0m' : ''} ${label}: ${detail}`);
  };
  console.log('\nA.D.A.P.T. — V1 Validation Harness | Seed 1 (synthetic)');
  console.log(`Window: ${ANALYSIS_FROM} through ${ANALYSIS_AS_OF} | onset tolerance: ±${TOLERANCE_DAYS} days\n`);

  try {
    const repo = new FixtureRepo({ seed: 1 });
    const inputs = await loadAnalysisInputs(repo);
    const { campaigns, skus, metrics, inventory } = inputs;
    let plan: AllocationPlan | undefined;
    // Use the actual production orchestration, including fitCurve and its pre-save guardrail check.
    // FixtureRepo saves only in memory. Capture the pure allocator's result for independent verification.
    const result = await runAnalysis(repo, { inputs, allocatePlan: state => {
      plan = allocate(state);
      return plan;
    } });

    // Retain detector provenance: MAD and fatigue both emit CTR, and MAD and leaks both emit ROAS.
    // These calls mirror the production historical leak policy (daily anchors, default beta).
    const detected: Record<Detector, Anomaly[]> = {
      stockRisk: stockRisk(campaigns, inventory),
      madAnomalies: madAnomalies(metrics),
      fatigue: fatigue(metrics),
      profitLeak: mergeConsecutiveFlags(metrics.flatMap(row => row.spend > 0
        ? profitLeak([row], campaigns, skus, [{ campaign_id: row.campaign_id,
          s0: row.spend, r0: row.revenue, beta: .7 }]) : [])),
    };
    const actualById = new Map(result.anomalies.map(anomaly => [anomaly.id, anomaly]));
    const matched = new Map<EventId, Anomaly[]>();
    const plantedCampaigns = new Set<string>();
    let recalled = 0;
    for (const id of Object.keys(GROUND_TRUTH) as EventId[]) {
      const truth = GROUND_TRUTH[id];
      const targets = campaigns.filter(truth.campaignMatches);
      const matches: Anomaly[] = [];
      const details: string[] = [];
      let foundAll = targets.length > 0;
      for (const campaign of targets) {
        plantedCampaigns.add(campaign.id);
        const candidates = detected[truth.detector]
          .filter(a => a.campaign_id === campaign.id && a.metric === truth.metric)
          .flatMap(a => actualById.has(a.id) ? [actualById.get(a.id)!] : []);
        const match = candidates.find(a => Math.abs(eventDay(a.date) - truth.startDay) <= TOLERANCE_DAYS);
        if (match) matches.push(match); else foundAll = false;
        details.push(`${campaign.id}: ${candidates.length ? candidates.map(a => `day ${eventDay(a.date)}`).join(', ') : 'not detected'}`);
      }
      matched.set(id, matches);
      if (foundAll) recalled++;
      report(foundAll, `${id} ${truth.label} / ${truth.detector}`,
        `expected day ${truth.startDay} ±${TOLERANCE_DAYS}; ${details.join('; ') || 'no matching campaigns in fixture'}`);
    }
    report(recalled === 4, 'Event recall', `${recalled}/4 (${(recalled / 4 * 100).toFixed(0)}%)`);
    // Count merged anomaly records, not distinct campaigns. Premium is not one of E1–E4.
    const falsePositives = result.anomalies.filter(a => !plantedCampaigns.has(a.campaign_id));
    report(falsePositives.length <= 3, 'False positives', `${falsePositives.length} (maximum 3)`);
    for (const anomaly of falsePositives) {
      console.log(`       ${anomaly.campaign_id} / ${anomaly.metric} / day ${eventDay(anomaly.date)} (${anomaly.id})`);
    }
    console.log(`       ${result.anomalies.length} merged anomalies. False positives use the requested campaign-based definition.\n`);

    for (const [id, expected] of [['E1', 'stockRisk'], ['E4', 'margin_rate']] as const) {
      const events = matched.get(id)!;
      const targets = campaigns.filter(GROUND_TRUTH[id].campaignMatches);
      // Inspect the persisted event's first driver at its onset, not a later, more favorable date.
      const correct = events.length > 0 && events.length === targets.length && events.every(event => {
        const fresh = rootCause(event, campaigns, skus, metrics, inventory);
        return canonicalDriver(event.drivers[0]?.name) === expected
          && canonicalDriver(fresh[0]?.name) === expected;
      });
      report(correct, `${id} primary driver`, `expected ${expected}; ${events.map(event =>
        `${event.campaign_id}: ${event.drivers[0]?.name ?? 'missing'}`).join('; ') || 'no event within onset window'}`);
    }

    const top = result.topRecommendation;
    report(Boolean(top), 'Top recommendation', top?.id ?? 'no recommendation generated');
    for (const rule of REQUIRED_GUARDRAILS) {
      const checks = plan?.constraints_checked.filter(check => check.rule === rule) ?? [];
      report(checks.length === 1 && checks[0].pass === true
        && top?.constraints_checked.filter(saved => saved === rule).length === 1,
      `Guardrail: ${rule}`, checks.length === 1 && checks[0].pass ? 'applied; recommendation record checked' : 'missing, duplicated, or failed');
    }
    try {
      if (!plan) throw new Error('No allocation plan generated');
      assertGuardrails(plan);
      report(true, 'Independent guardrail verification', 'assertGuardrails recomputed the plan successfully');
    } catch (error) {
      report(false, 'Independent guardrail verification', error instanceof Error ? error.message : String(error));
    }
    for (const [id, direction] of [['c-sneaker', 'decrease'], ['c-premium', 'increase']] as const) {
      const move = top?.moves.find(item => item.campaign_id === id);
      report(Boolean(move && (direction === 'decrease' ? move.new_budget < move.old_budget : move.new_budget > move.old_budget)),
        `${id} budget ${direction}`, move ? `${inr.format(move.old_budget)} → ${inr.format(move.new_budget)}` : 'no move');
    }
    const gain = top?.expected_profit_gain_per_day;
    report(gain !== undefined && Number.isFinite(gain) && gain >= 300, 'Expected profit gain per day',
      gain !== undefined && Number.isFinite(gain) ? `${inr.format(gain)}/day (minimum ₹300/day)` : 'missing or non-finite');
  } catch (error) {
    report(false, 'Pipeline execution', error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} checks passed, ${failed} failed`);
    console.log(`Total execution time: ${(performance.now() - started).toFixed(1)} ms`);
  }
  if (failed > 0) throw new Error(`Seed 1 validation failed (${failed} checks).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.exitCode = 1; });
}
