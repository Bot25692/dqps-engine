import { createRepo, type DataRepo } from './data-source';
import { runAnalysis } from '../run-analysis';

type Runtime = { repo: DataRepo; ready?: Promise<void>; queue: Promise<unknown> };
const shared = globalThis as typeof globalThis & { adaptRuntime?: Runtime };

// Keep the demo's existing in-memory Repo across route/page bundles and requests.
// This is process-local demo state; durable deployments use the Supabase Repo.
function runtime(): Runtime {
  return shared.adaptRuntime ??= { repo: createRepo({ fixtureSeed: 1 }), queue: Promise.resolve() };
}

// Generate Builder A's actual recommendation once, rather than showing legacy fixture claims.
export async function getRuntimeRepo(): Promise<DataRepo> {
  const state = runtime();
  state.ready ??= (async () => {
    if (!(await state.repo.getRecommendations()).length) await runAnalysis(state.repo);
  })().catch(error => { state.ready = undefined; throw error; });
  await state.ready;
  return state.repo;
}

// Serialize decision/reset mutations so replayed requests cannot race a pending outcome write.
export function withDecisionLock<T>(operation: () => Promise<T>): Promise<T> {
  const state = runtime();
  const result = state.queue.then(operation, operation);
  state.queue = result.then(() => undefined, () => undefined);
  return result;
}
