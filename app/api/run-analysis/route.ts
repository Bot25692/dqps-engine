import { getRuntimeRepo, withDecisionLock } from '@/lib/db/runtime-repo';
import { ANALYSIS_AS_OF, AnalysisGuardrailError, loadAnalysisInputs, runAnalysis } from '@/lib/run-analysis';

// Authorize before touching data; return only computed results or sanitized errors.
export async function POST(request: Request): Promise<Response> {
  const started = performance.now();
  const token = process.env.DEMO_ADMIN_TOKEN;
  if (token && request.headers.get('x-demo-token') !== token) {
    return Response.json({ error: 'Unauthorized: a valid x-demo-token header is required.' }, { status: 401 });
  }
  try {
    return await withDecisionLock(async () => {
    const repo = await getRuntimeRepo();
    if ((await repo.getRecommendations()).some(rec => rec.status !== 'pending')) {
      return Response.json({ error: 'Reset the demo before analyzing a decided recommendation.' }, { status: 409 });
    }
    const inputs = await repo.run(loadAnalysisInputs);
    // Guardrail failures stay outside the repository's fallback/retry boundary.
    const result = await runAnalysis(repo, { inputs });
    return Response.json({ asOf: result.asOf ?? ANALYSIS_AS_OF, counts: result.counts,
      topRecommendation: result.topRecommendation, elapsedMs: performance.now() - started,
      ...repo.status });
    });
  } catch (error) {
    return Response.json({ error: error instanceof AnalysisGuardrailError ? error.message
      : 'Analysis could not be completed. Please retry.' }, { status: error instanceof AnalysisGuardrailError ? 422 : 500 });
  }
}
