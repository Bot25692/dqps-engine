import { createRepo, type DataRepo } from './data-source';
import { runAnalysis } from '../run-analysis';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export type DatasetId = 'apparel' | 'skincare';

type Runtime = { repo: DataRepo; ready?: Promise<void>; queue: Promise<unknown> };
const shared = globalThis as typeof globalThis & {
  adaptRuntime?: Runtime;
  adaptRuntimes?: Partial<Record<DatasetId, Runtime>>;
};

// Keep in-memory Repos across route/page bundles and requests, keyed by dataset.
// Backward-compatible with existing test suites that set globalThis.adaptRuntime directly.
function runtime(datasetKey: DatasetId = 'apparel'): Runtime {
  if (shared.adaptRuntime && datasetKey === 'apparel') {
    return shared.adaptRuntime;
  }
  const runtimes = shared.adaptRuntimes ??= {};
  return runtimes[datasetKey] ??= {
    repo: createRepo({
      fixtureSeed: datasetKey === 'skincare' ? undefined : (process.env.ADAPT_FIXTURE_DIRECTORY ? undefined : 1),
      fixtureDirectory: datasetKey === 'skincare'
        ? join(process.cwd(), 'fixtures', 'skincare')
        : (process.env.ADAPT_FIXTURE_DIRECTORY || undefined),
      storageDir: process.env.ADAPT_STORAGE_DIR
        ? join(/*turbopackIgnore: true*/ process.env.ADAPT_STORAGE_DIR, datasetKey)
        : join(tmpdir(), 'adapt_store', datasetKey),
    }),
    queue: Promise.resolve(),
  };
}

// Generate Builder A's actual recommendation once per dataset repo.
export async function getRuntimeRepo(datasetId?: string): Promise<DataRepo> {
  let selected = datasetId;
  if (!selected) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      selected = cookieStore.get('adapt_dataset')?.value;
    } catch {
      // Ignored outside Next.js request context (tests, build, scripts)
    }
  }
  const key: DatasetId = selected === 'skincare' ? 'skincare' : 'apparel';
  const state = runtime(key);
  if (!(await state.repo.getRecommendations()).length) {
    await runAnalysis(state.repo);
  }
  return state.repo;
}

// Serialize decision/reset mutations per dataset so replayed requests cannot race a pending outcome write.
export function withDecisionLock<T>(operation: () => Promise<T>, datasetId?: string): Promise<T> {
  const key: DatasetId = datasetId === 'skincare' ? 'skincare' : 'apparel';
  const state = runtime(key);
  const result = state.queue.then(operation, operation);
  state.queue = result.then(() => undefined, () => undefined);
  return result;
}
