import { createRepo } from '../../../lib/db/data-source.ts';
import { ANALYSIS_AS_OF, AnalysisGuardrailError, loadAnalysisInputs, runAnalysis } from '../../../lib/run-analysis.ts';

export const runtime = 'nodejs';

// Authorize before touching data; return only computed results or sanitized errors.
export async function POST(request: Request): Promise<Response> {
  const started = performance.now();
  const token = process.env.DEMO_ADMIN_TOKEN;
  if (token && request.headers.get('x-demo-token') !== token) {
    return Response.json({ error: 'Unauthorized: a valid x-demo-token header is required.' }, { status: 401 });
  }
  try {
    const repo = createRepo({ fixtureSeed: 1 });
    const inputs = await repo.run(loadAnalysisInputs);
    // Guardrail failures stay outside the repository's fallback/retry boundary.
    const result = await runAnalysis(repo, { inputs });
    return Response.json({ asOf: ANALYSIS_AS_OF, counts: result.counts,
      topRecommendation: result.topRecommendation, elapsedMs: performance.now() - started,
      ...repo.status });
  } catch (error) {
    return Response.json({ error: error instanceof AnalysisGuardrailError ? error.message
      : 'Analysis could not be completed. Please retry.' }, { status: error instanceof AnalysisGuardrailError ? 422 : 500 });
  }
}
