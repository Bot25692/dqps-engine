import { FixtureRepo, type Repo } from './repo';
import { assertServer, SupabaseRepo, type SupabaseClient } from './supabase-repo';

export const FALLBACK_BANNER = 'Showing saved demo data';
export const SUPABASE_TIMEOUT_MS = 3000;

export interface DataStatus {
  dataSource: 'fixtures' | 'supabase';
  isFallback: boolean;
  banner: string | null;
}

export type DataRepo = Repo & {
  readonly status: DataStatus;
  run<T>(operation: (repo: Repo) => Promise<T>): Promise<T>;
};

// Bound the whole operation, including response parsing and clients that ignore abort signals.
async function withDeadline<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Supabase timeout')), SUPABASE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Create one repository per request/session; after failure it stays on its own demo state.
// A timed-out remote write may already have committed; fallback does not imply rollback.
export function createRepo(options: {
  dataSource?: string;
  fixtureDirectory?: string;
  fixtureSeed?: number;
  client?: SupabaseClient;
} = {}): DataRepo {
  assertServer();

  const source = options.dataSource ?? process.env.DATA_SOURCE ?? 'fixtures';

  if (source !== 'fixtures' && source !== 'supabase') {
    throw new Error('DATA_SOURCE must be fixtures or supabase');
  }

  let fallback = false;
  let fixtures: Repo | undefined;
  let supabase: SupabaseRepo | undefined;

  const getFixtures = () => fixtures ??= new FixtureRepo(
    options.fixtureDirectory
      ?? { seed: options.fixtureSeed ?? 1 }
  );

  const status = (): DataStatus => ({
    dataSource: source === 'supabase' && !fallback ? 'supabase' : 'fixtures',
    isFallback: fallback,
    banner: fallback ? FALLBACK_BANNER : null,
  });

  const run = async <T>(operation: (repo: Repo) => Promise<T>): Promise<T> => {
    if (source === 'fixtures' || fallback) {
      return operation(getFixtures());
    }

    try {
      const result = await withDeadline(
        () => operation(supabase ??= new SupabaseRepo({ client: options.client }))
      );

      // Concurrent operations must not return live rows after another one activated demo mode.
      return fallback ? operation(getFixtures()) : result;
    } catch (e) {
      console.error('SUPABASE FALLBACK CAUSE:', e);
      supabase?.abort();
      fallback = true;
      return operation(getFixtures());
    }
  };

  // Forward every Repo method through the same policy, including future interface additions.
  return new Proxy({} as DataRepo, {
    get(_target, property) {
      if (property === 'status') return status;
      if (property === 'run') return run;

      if (
        typeof property !== 'string' ||
        !(property in FixtureRepo.prototype) ||
        property === 'constructor'
      ) {
        return undefined;
      }

      return (...args: unknown[]) => run(repo => {
        const method = Reflect.get(repo, property) as (...args: unknown[]) => Promise<unknown>;
        return method.apply(repo, args);
      });
    },
  });
}