import { z } from 'zod';
import { boundary } from '@/lib/simulation/boundary';
import { getRecord, restoreApproval } from '@/lib/simulation/approval-store';
import { mapRecommendationToSimulation, type CampaignEnrichment } from '@/lib/integration/adapter';
import { updateConfidence, computePredictionError } from '@/lib/integration/confidence';
import { getRuntimeRepo, withDecisionLock } from '@/lib/db/runtime-repo';
import { allocationState, loadAnalysisInputs, runAnalysis } from '@/lib/run-analysis';
import { revenue } from '@/lib/analysis/optimize';
import { OutcomeSchema, RecommendationSchema, type ActionLogEntry } from '@/lib/types';
import type { Repo } from '@/lib/db/repo';
import { sealSession, unsealSession } from '@/lib/session';

const RequestSchema = z.object({
  dataset: z.enum(['apparel', 'skincare']).optional(),
  recommendationId: z.string().min(1).optional(),
  action: z.enum(['register', 'approve', 'reject', 'simulate', 'reset']),
  seed: z.number().int().optional(),
  recommendation: RecommendationSchema.optional(),
}).refine(body => body.action === 'reset' || !!body.recommendationId);
const logged = new Set<string>();

// Stable IDs plus serialized actions keep duplicate clicks from creating duplicate logs.
async function logOnce(repo: Repo, recommendationId: string, action: ActionLogEntry['action']) {
  const id = `${recommendationId}:${action}`;
  if (logged.has(id) || (await repo.getActionLog()).some(entry => entry.id === id)) return;
  await repo.logAction({ id, recommendation_id: recommendationId,
    created_at: new Date().toISOString(), actor: action === 'executed' ? 'simulation' : 'human', action, note: '' });
  logged.add(id);
}

// Resolve all numerical inputs on the server; an approved ID never authorizes a client-supplied plan.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: 'Invalid decision request' }, { status: 400 });
  const cookieHeader = request.headers.get('cookie') || '';
  const matchDataset = cookieHeader.match(/adapt_dataset=([^;]+)/);
  const datasetKey = parsed.data.dataset || (matchDataset?.[1] === 'skincare' ? 'skincare' : 'apparel');

  return withDecisionLock(async () => {
    const { action, seed, recommendation } = parsed.data;
    const recommendationId = parsed.data.recommendationId ?? 'demo';
    const fail = (error: string, status = 409) => Response.json({ ok: false, recommendationId, error }, { status });
    try {
      const repo = await getRuntimeRepo(datasetKey);
      if (action === 'reset') {
        const activeIds = (await repo.getRecommendations()).map(rec => rec.id);
        await repo.resetDecisions();
        await runAnalysis(repo);
        boundary.reset(activeIds);
        for (const id of activeIds) for (const action of ['approved', 'rejected', 'executed']) logged.delete(`${id}:${action}`);
        return Response.json(
          { ok: true, recommendationId, status: 'reset' },
          { headers: { 'Set-Cookie': 'adapt_session=; Path=/; Max-Age=0; SameSite=Lax' } }
        );
      }
      let rec = (await repo.getRecommendations()).find(row => row.id === recommendationId);
      if (!rec) return fail('Unknown recommendation', 404);
      // Recover a human approval after a cold start, before enforcing the gate.
      // Only the authenticated cookie for this exact dataset and plan is eligible.
      const sessionToken = cookieHeader.match(/(?:^|;\s*)adapt_session=([^;]+)/)?.[1];
      const session = sessionToken ? unsealSession(sessionToken) : null;
      if (action === 'simulate' && rec.status === 'pending' && session?.dataset === datasetKey
          && session.recommendationId === rec.id && session.status === 'approved' && session.approvedAt) {
        restoreApproval(rec.id, Date.parse(session.approvedAt));
        rec = {...rec, status:'approved'};
        await repo.saveRecommendations([rec]);
        await logOnce(repo, rec.id, 'approved');
      }
      if (recommendation && (recommendation.id !== rec.id
        || JSON.stringify(recommendation.moves) !== JSON.stringify(rec.moves)
        || recommendation.expected_profit_gain_per_day !== rec.expected_profit_gain_per_day)) {
        return fail('Recommendation does not match the saved plan', 400);
      }
      if (action === 'register') {
        if (rec.status !== 'pending') return fail('Recommendation already has a decision');
        return Response.json(boundary.registerRecommendation(rec.id));
      }
      if (action === 'approve' || action === 'reject') {
        const status = action === 'approve' ? 'approved' : 'rejected';
        if (rec.status !== 'pending' && rec.status !== status) return fail('Conflicting decision');
        const result = action === 'approve' ? boundary.recordApprove(rec.id) : boundary.recordReject(rec.id);
        if (!result.ok) return Response.json(result, { status: 409 });
        await logOnce(repo, rec.id, status);
        // Keep the confidence used for this outcome in the recommendation snapshot.
        const weight = await repo.getConfidence(rec.type);
        await repo.saveRecommendations([{ ...rec, status, confidence: weight?.weight ?? .75 }]);
        const token = sealSession({
          dataset: datasetKey,
          recommendationId: rec.id,
          status,
          approvedAt: action === 'approve' ? new Date().toISOString() : undefined,
        });
        return Response.json(result, {
          headers: {
            'Set-Cookie': `adapt_session=${token}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly`,
          },
        });
      }
      if ((await repo.getOutcomes()).some(row => row.recommendation_id === rec.id)) {
        return fail('Recommendation already has a persisted outcome');
      }
      if (rec.status !== 'approved' && rec.status !== 'executed') return fail('Human approval is required');
      if (!getRecord(rec.id)) {
        let approval = (await repo.getActionLog()).filter(entry => entry.recommendation_id === rec.id)
          .find(entry => entry.action === 'approved' && entry.actor === 'human');
        if (!approval) {
          const cookieHeader = request.headers.get('cookie') || '';
          const match = cookieHeader.match(/adapt_session=([^;]+)/);
          if (match) {
            const session = unsealSession(match[1]);
            if (session && session.dataset === datasetKey && session.recommendationId === rec.id && session.status === 'approved' && session.approvedAt) {
              approval = { id: `${rec.id}:approved`, recommendation_id: rec.id, created_at: session.approvedAt, actor: 'human', action: 'approved', note: '' };
              await logOnce(repo, rec.id, 'approved');
            }
          }
        }
        if (!approval || (await repo.getActionLog()).some(entry => entry.action === 'rejected')) {
          return fail('Saved human approval unavailable. Reset the demo and approve again.');
        }
        restoreApproval(rec.id, Date.parse(approval.created_at));
      }
      // Reuse a completed result only to retry a failed persistence operation, never rerun it.
      let simulationResult = getRecord(rec.id)?.simulationResult;
      if (!simulationResult) {
        const state = allocationState(await repo.run(loadAnalysisInputs));
        const enrichment = new Map<string, CampaignEnrichment>(state.campaigns.map(c => [c.id, {
          campaign_id: c.id, sku_id: c.sku.id, revenue: revenue(c.daily_budget, c.curve), spend: c.daily_budget,
          margin_rate: c.sku.margin_rate, inventory_units: c.sku.units_on_hand,
          avg_daily_units_sold: c.sku.average_daily_units_sold * c.curve.r0
            / (state.campaigns.filter(other => other.sku.id === c.sku.id).reduce((sum, other) => sum + other.curve.r0, 0) || 1),
          beta_est: c.curve.beta,
        }]));
        const moves = mapRecommendationToSimulation(rec, enrichment);
        if (moves.length !== rec.moves.length || rec.expected_profit_gain_per_day <= 0) {
          return fail('Incomplete or invalid simulation inputs', 400);
        }
        const result = boundary.runApprovedSimulation({ recommendationId: rec.id, moves,
          approvedAt: getRecord(rec.id)?.actionAt ?? 0 }, seed ?? 42);
        if (!result.ok || !result.simulationResult) return Response.json(result, { status: 409 });
        simulationResult = result.simulationResult;
      }
      const predictedGainPerDay = rec.expected_profit_gain_per_day;
      const actualGain = simulationResult.portfolioGain;
      const errorFraction = computePredictionError(predictedGainPerDay, actualGain);
      const outcome = OutcomeSchema.parse({ id: `${rec.id}:outcome`, recommendation_id: rec.id,
        created_at: new Date(simulationResult.simulatedAt).toISOString(), predicted: predictedGainPerDay * 3,
        actual: actualGain, error_pct: errorFraction * 100, horizon_days: 3 });
      const confidenceUpdate = updateConfidence({ currentConfidence: rec.confidence, errorFraction });
      // saveOutcome is the completion marker. Repositories upsert this stable ID on retry.
      await repo.setConfidence({ recommendation_type: rec.type, weight: confidenceUpdate.newConfidence,
        updated_at: outcome.created_at });
      await repo.saveRecommendations([{ ...rec, status: 'executed' }]);
      await logOnce(repo, rec.id, 'executed');
      await repo.saveOutcome(outcome);
      const token = sealSession({
        dataset: datasetKey,
        recommendationId: rec.id,
        status: 'executed',
        outcome,
        confidence: { recommendation_type: rec.type, weight: confidenceUpdate.newConfidence },
        simulatedAt: outcome.created_at,
        predictedGainPerDay,
        predictedTotal: outcome.predicted,
        actualGain,
        errorPct: outcome.error_pct,
        confidenceUpdate,
      });
      return Response.json({ ok: true, recommendationId: rec.id, status: 'simulated', simulationResult,
        predictedGainPerDay, predictedTotal: outcome.predicted, actualGain,
        errorFraction, errorPct: outcome.error_pct, confidenceUpdate, outcome }, {
        headers: {
          'Set-Cookie': `adapt_session=${token}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly`,
        },
      });
    } catch {
      return fail('Decision could not be completed. Please retry.', 500);
    }
  }, datasetKey);
}
