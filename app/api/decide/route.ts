import { z } from 'zod';
import { boundary } from '@/lib/simulation/boundary';
import { getRecord } from '@/lib/simulation/approval-store';
import { mapRecommendationToSimulation, type CampaignEnrichment } from '@/lib/integration/adapter';
import { updateConfidence, computePredictionError } from '@/lib/integration/confidence';
import { getRuntimeRepo, withDecisionLock } from '@/lib/db/runtime-repo';
import { allocationState, loadAnalysisInputs, runAnalysis } from '@/lib/run-analysis';
import { revenue } from '@/lib/analysis/optimize';
import { OutcomeSchema, RecommendationSchema, type ActionLogEntry } from '@/lib/types';
import type { Repo } from '@/lib/db/repo';

const RequestSchema = z.object({
  recommendationId: z.string().min(1),
  action: z.enum(['register', 'approve', 'reject', 'simulate', 'reset']),
  seed: z.number().int().optional(),
  recommendation: RecommendationSchema.optional(),
});

const logged = new Set<string>();

// Stable IDs plus serialized actions keep duplicate clicks from creating duplicate logs.
async function logOnce(
  repo: Repo,
  recommendationId: string,
  action: ActionLogEntry['action']
) {
  const id = `${recommendationId}:${action}`;

  if (logged.has(id)) return;

  await repo.logAction({
    id,
    recommendation_id: recommendationId,
    created_at: new Date().toISOString(),
    actor: action === 'executed' ? 'simulation' : 'human',
    action,
    note: '',
  });

  logged.add(id);
}

// Resolve all numerical inputs on the server; an approved ID never authorizes a client-supplied plan.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'Invalid decision request' },
      { status: 400 }
    );
  }

  return withDecisionLock(async () => {
    const {
      recommendationId,
      action,
      seed,
      recommendation,
    } = parsed.data;

    const fail = (error: string, status = 409) =>
      Response.json(
        {
          ok: false,
          recommendationId,
          error,
        },
        { status }
      );

    try {
      const repo = await getRuntimeRepo();

      // RESET
      if (action === 'reset') {
        await repo.resetDecisions();
        await runAnalysis(repo);
        boundary.reset();
        logged.clear();

        return Response.json({
          ok: true,
          recommendationId,
          status: 'reset',
        });
      }

      // Find the saved recommendation from the server-side repository.
      const rec = (await repo.getRecommendations()).find(
        row => row.id === recommendationId
      );

      if (!rec) {
        return fail('Unknown recommendation', 404);
      }

      // If a recommendation was supplied by the client, make sure it exactly
      // matches the server-side saved recommendation.
      if (
        recommendation &&
        (
          recommendation.id !== rec.id ||
          JSON.stringify(recommendation.moves) !== JSON.stringify(rec.moves) ||
          recommendation.expected_profit_gain_per_day !==
            rec.expected_profit_gain_per_day
        )
      ) {
        return fail('Recommendation does not match the saved plan', 400);
      }

      // REGISTER
      if (action === 'register') {
        if (rec.status !== 'pending') {
          return fail('Recommendation already has a decision');
        }

        return Response.json(
          boundary.registerRecommendation(rec.id)
        );
      }

      // APPROVE / REJECT
      if (action === 'approve' || action === 'reject') {
        const status =
          action === 'approve'
            ? 'approved'
            : 'rejected';

        if (
          rec.status !== 'pending' &&
          rec.status !== status
        ) {
          return fail('Conflicting decision');
        }

        // Re-create the in-memory approval record from the
        // persisted recommendation before approving/rejecting.
        // This fixes the case where a request reaches a fresh
        // serverless instance after reset/register.
        boundary.registerRecommendation(rec.id);

        const result =
          action === 'approve'
            ? boundary.recordApprove(rec.id)
            : boundary.recordReject(rec.id);

        if (!result.ok) {
          return Response.json(result, { status: 409 });
        }

        await logOnce(repo, rec.id, status);

        // Keep the confidence used for this outcome in the recommendation snapshot.
        const weight = await repo.getConfidence(rec.type);

        await repo.saveRecommendations([
          {
            ...rec,
            status,
            confidence: weight?.weight ?? 0.75,
          },
        ]);

        return Response.json(result);
      }

      // Check whether this recommendation already has a persisted outcome.
      if (
        (await repo.getOutcomes()).some(
          row => row.recommendation_id === rec.id
        )
      ) {
        return fail(
          'Recommendation already has a persisted outcome'
        );
      }

      // Simulation requires human approval.
      if (
        rec.status !== 'approved' &&
        rec.status !== 'executed'
      ) {
        return fail('Human approval is required');
      }

      // Reuse a completed result only to retry a failed persistence
      // operation, never rerun it.
      let simulationResult =
        getRecord(rec.id)?.simulationResult;

      if (!simulationResult) {
        const state = allocationState(
          await repo.run(loadAnalysisInputs)
        );

        const enrichment =
          new Map<string, CampaignEnrichment>(
            state.campaigns.map(c => [
              c.id,
              {
                campaign_id: c.id,
                sku_id: c.sku.id,
                revenue: revenue(
                  c.daily_budget,
                  c.curve
                ),
                spend: c.daily_budget,
                margin_rate: c.sku.margin_rate,
                inventory_units: c.sku.units_on_hand,
                avg_daily_units_sold:
                  c.sku.average_daily_units_sold *
                  c.curve.r0 /
                  (
                    state.campaigns
                      .filter(
                        other =>
                          other.sku.id === c.sku.id
                      )
                      .reduce(
                        (sum, other) =>
                          sum + other.curve.r0,
                        0
                      ) || 1
                  ),
                beta_est: c.curve.beta,
              },
            ])
          );

        const moves = mapRecommendationToSimulation(
          rec,
          enrichment
        );

        if (
          moves.length !== rec.moves.length ||
          rec.expected_profit_gain_per_day <= 0
        ) {
          return fail(
            'Incomplete or invalid simulation inputs',
            400
          );
        }

        const result =
          boundary.runApprovedSimulation(
            {
              recommendationId: rec.id,
              moves,
              approvedAt:
                getRecord(rec.id)?.actionAt ??
                Date.now(),
            },
            seed ?? 42
          );

        if (
          !result.ok ||
          !result.simulationResult
        ) {
          return Response.json(
            result,
            { status: 409 }
          );
        }

        simulationResult =
          result.simulationResult;
      }

      // Calculate prediction error.
      const predictedGainPerDay =
        rec.expected_profit_gain_per_day;

      const actualGain =
        simulationResult.portfolioGain;

      const errorFraction =
        computePredictionError(
          predictedGainPerDay,
          actualGain
        );

      // Create the outcome record.
      const outcome = OutcomeSchema.parse({
        id: `${rec.id}:outcome`,
        recommendation_id: rec.id,
        created_at: new Date(
          simulationResult.simulatedAt
        ).toISOString(),
        predicted: predictedGainPerDay * 3,
        actual: actualGain,
        error_pct: errorFraction * 100,
        horizon_days: 3,
      });

      // Update confidence.
      const confidenceUpdate =
        updateConfidence({
          currentConfidence: rec.confidence,
          errorFraction,
        });

      // Save the updated confidence.
      await repo.setConfidence({
        recommendation_type: rec.type,
        weight: confidenceUpdate.newConfidence,
        updated_at: outcome.created_at,
      });

      // Save the updated confidence in the recommendation itself.
      await repo.saveRecommendations([
        {
          ...rec,
          status: 'executed',
          confidence: confidenceUpdate.newConfidence,
        },
      ]);

      await logOnce(
        repo,
        rec.id,
        'executed'
      );

      await repo.saveOutcome(outcome);

      return Response.json({
        ok: true,
        recommendationId: rec.id,
        status: 'simulated',
        simulationResult,
        predictedGainPerDay,
        predictedTotal: outcome.predicted,
        actualGain,
        errorFraction,
        errorPct: outcome.error_pct,
        confidenceUpdate,
      });

    } catch {
      return fail(
        'Decision could not be completed. Please retry.',
        500
      );
    }
  });
}