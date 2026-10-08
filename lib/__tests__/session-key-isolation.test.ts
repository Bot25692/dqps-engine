import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Production session key isolation', () => {
  it('never shares a metadata-derived key between unconfigured instances', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADAPT_SESSION_SECRET', '');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'public-deployment');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'public-commit');
    vi.stubEnv('VERCEL_URL', 'public.example.test');
    vi.resetModules();
    const first = await import('../session');
    const token = first.sealSession({recommendationId:'test', status:'approved'});
    expect(first.unsealSession(token)?.status).toBe('approved');
    vi.resetModules();
    const second = await import('../session');
    expect(second.unsealSession(token)).toBeNull();
  });

  it('preserves cross-instance sessions with an explicitly configured secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADAPT_SESSION_SECRET', 'test-only-explicit-session-secret');
    vi.resetModules();
    const first = await import('../session');
    const token = first.sealSession({recommendationId:'test', status:'approved'});
    vi.resetModules();
    const second = await import('../session');
    expect(second.unsealSession(token)?.status).toBe('approved');
  });
});
