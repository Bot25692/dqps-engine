import { describe, it, expect } from 'vitest';
import { sealSession } from '../session';
import { FixtureRepo } from '../db/repo';
import type { Outcome } from '../types';

describe('SSR Learning Page Serverless Hydration', () => {
  it('hydrates outcome from signed cookie without depending on localStorage or in-memory repo', async () => {
    // 1. Create a simulated outcome
    const mockOutcome: Outcome = {
      id: 'rec_ssr_test:outcome',
      recommendation_id: 'rec_ssr_test',
      created_at: '2026-03-31T12:00:00.000Z',
      predicted: 450,
      actual: 462,
      error_pct: 2.67,
      horizon_days: 3,
    };

    // 2. Generate cryptographically sealed session token
    const token = sealSession({
      recommendationId: 'rec_ssr_test',
      status: 'executed',
      outcome: mockOutcome,
      confidence: { recommendation_type: 'budget_reallocation', weight: 0.81 },
      simulatedAt: mockOutcome.created_at,
    });

    // 3. Simulate a fresh serverless instance with clean repo (0 outcomes in DB)
    const freshRepo = new FixtureRepo({ seed: 1, storageDir: null });
    const dbOutcomes = await freshRepo.getOutcomes();
    expect(dbOutcomes).toHaveLength(0); // Fresh cold start has no DB outcomes

    // 4. Simulate Server Component logic from app/learning/page.tsx
    const { unsealSession } = await import('../session');
    const session = unsealSession(token);
    expect(session).not.toBeNull();
    expect(session?.outcome).toBeDefined();

    let allOutcomes = dbOutcomes as Outcome[];
    if (session?.outcome && !allOutcomes.some(o => o.id === session.outcome!.id)) {
      allOutcomes = [session.outcome, ...allOutcomes];
    }

    const latestOutcomes = allOutcomes
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10);

    // 5. Verify that SSR has hydrated the outcome purely from the authenticated cookie
    expect(latestOutcomes).toHaveLength(1);
    expect(latestOutcomes[0].id).toBe('rec_ssr_test:outcome');
    expect(latestOutcomes[0].actual).toBe(462);
    expect(latestOutcomes[0].predicted).toBe(450);
  });
});
