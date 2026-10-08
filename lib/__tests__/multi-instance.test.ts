import { describe, it, expect } from 'vitest';
import { FixtureRepo } from '../db/repo';
import { runAnalysis } from '../run-analysis';
import { POST as decideRoute } from '../../app/api/decide/route';
import { unsealSession } from '../session';
import type { Repo } from '../db/repo';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

describe('Multi-Instance Isolation and Workflow Lifecycle', () => {
  it('verifies complete lifecycle, idempotency, reset and brand dataset isolation', async () => {
    const dirA = join(tmpdir(), `adapt_test_store_A_${Date.now()}`);
    const dirB = join(tmpdir(), `adapt_test_store_B_${Date.now()}`);

    const previousRuntime = (globalThis as unknown as { adaptRuntime?: unknown }).adaptRuntime;

    try {
      // 1. Instance A: Sneaker Brand
      const repoA = new FixtureRepo({ seed: 1, storageDir: dirA });
      await runAnalysis(repoA);
      const recA = (await repoA.getRecommendations())[0];
      expect(recA).toBeDefined();

      const dataRepoA = Object.assign(repoA, {
        status: { dataSource: 'fixtures' as const, isFallback: false, banner: null },
        run: <T>(op: (r: Repo) => Promise<T>) => op(repoA),
      });
      (globalThis as unknown as { adaptRuntime?: unknown }).adaptRuntime = {
        repo: dataRepoA, queue: Promise.resolve(), ready: Promise.resolve(),
      };

      // Register
      const regRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST', body: JSON.stringify({ recommendationId: recA.id, action: 'register' }),
      }));
      expect(regRes.status).toBe(200);

      // Approve
      const appRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST', body: JSON.stringify({ recommendationId: recA.id, action: 'approve' }),
      }));
      expect(appRes.status).toBe(200);
      const appCookie = appRes.headers.get('set-cookie');
      expect(appCookie).toContain('adapt_session=');

      // Simulate
      const simRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST',
        headers: { Cookie: appCookie! },
        body: JSON.stringify({ recommendationId: recA.id, action: 'simulate', seed: 42 }),
      }));
      expect(simRes.status).toBe(200);
      const simData = await simRes.json();
      expect(simData.ok).toBe(true);
      expect(simData.status).toBe('simulated');
      expect(simData.confidenceUpdate).toBeDefined();

      const simCookie = simRes.headers.get('set-cookie')!;
      expect(simCookie).toContain('adapt_session=');
      const tokenMatch = simCookie.match(/adapt_session=([^;]+)/);
      const session = unsealSession(tokenMatch![1]);
      expect(session?.status).toBe('executed');
      expect(session?.outcome?.actual).toBeDefined();

      // Repeat simulation must fail with 409
      const repeatRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST',
        headers: { Cookie: simCookie },
        body: JSON.stringify({ recommendationId: recA.id, action: 'simulate', seed: 42 }),
      }));
      expect(repeatRes.status).toBe(409);

      // 2. Instance B: Skincare 2025 Dataset
      const repoB = new FixtureRepo({ directory: 'fixtures/skincare', storageDir: dirB });
      const analysisB = await runAnalysis(repoB);
      expect(analysisB.asOf).toBe('2025-02-08');

      // Brand B repository has NOT seen Brand A's outcomes
      expect(await repoB.getOutcomes()).toHaveLength(0);

      // 3. Reset Instance A
      const resetRes = await decideRoute(new Request('http://localhost/api/decide', {
        method: 'POST', body: JSON.stringify({ action: 'reset' }),
      }));
      expect(resetRes.status).toBe(200);
      expect(resetRes.headers.get('set-cookie')).toContain('Max-Age=0');
      expect(await repoA.getOutcomes()).toHaveLength(0);
    } finally {
      (globalThis as unknown as { adaptRuntime?: unknown }).adaptRuntime = previousRuntime;
      await rm(dirA, { recursive: true, force: true }).catch(() => {});
      await rm(dirB, { recursive: true, force: true }).catch(() => {});
    }
  });
});
