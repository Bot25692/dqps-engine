import { describe, it, expect } from 'vitest';
import { getRuntimeRepo } from '@/lib/db/runtime-repo';
import { loadAnalysisInputs } from '@/lib/run-analysis';
import { overviewData } from '@/lib/demo/overview-data';
import { buildCampaignRows } from '@/lib/demo/campaign-data';

describe('Multi-Dataset Switching & Isolation Verification', () => {
  it('loads distinct datasets for Apparel and Skincare with complete state isolation', async () => {
    // 1. Fetch Apparel dataset
    const apparelRepo = await getRuntimeRepo('apparel');
    const apparelInputs = await apparelRepo.run(loadAnalysisInputs);
    const apparelOverview = overviewData(apparelInputs);

    expect(apparelInputs.skus.length).toBe(8);
    expect(apparelInputs.campaigns.length).toBe(10);
    expect(apparelOverview.metadata.asOfDate).toBe('2026-10-07');
    expect(apparelOverview.attentionItem.name).toBe('Court Sneaker');

    // 2. Fetch Skincare dataset
    const skincareRepo = await getRuntimeRepo('skincare');
    const skincareInputs = await skincareRepo.run(loadAnalysisInputs);
    const skincareOverview = overviewData(skincareInputs);

    expect(skincareInputs.skus.length).toBe(2);
    expect(skincareInputs.campaigns.length).toBe(2);
    expect(skincareOverview.metadata.asOfDate).toBe('2025-02-08');
    expect(skincareOverview.attentionItem.name).toBe('Gentle Foaming Cleanser');

    // 3. Verify Campaign table counts and rows are distinct
    const apparelCampaigns = buildCampaignRows(
      apparelInputs.campaigns,
      apparelInputs.skus,
      apparelInputs.metrics,
      apparelInputs.inventory
    );
    const skincareCampaigns = buildCampaignRows(
      skincareInputs.campaigns,
      skincareInputs.skus,
      skincareInputs.metrics,
      skincareInputs.inventory
    );

    expect(apparelCampaigns).toHaveLength(10);
    expect(skincareCampaigns).toHaveLength(2);

    // 4. Test decision isolation: Mutating Skincare does not alter Apparel
    const initialApparelOutcomes = await apparelRepo.getOutcomes();
    const initialSkincareOutcomes = await skincareRepo.getOutcomes();

    const testOutcome = {
      id: 'test-skincare-outcome-1',
      recommendation_id: 'rec-skincare-test',
      created_at: new Date().toISOString(),
      predicted: 450,
      actual: 462,
      error_pct: 2.67,
      horizon_days: 3,
    };

    await skincareRepo.saveOutcome(testOutcome);

    // Verify Skincare has 1 outcome while Apparel still has 0
    const updatedSkincareOutcomes = await skincareRepo.getOutcomes();
    const updatedApparelOutcomes = await apparelRepo.getOutcomes();

    expect(updatedSkincareOutcomes.some(o => o.id === testOutcome.id)).toBe(true);
    expect(updatedApparelOutcomes).toEqual(initialApparelOutcomes);

    // Reset skincare repo decisions and verify apparel remains unaffected
    await skincareRepo.resetDecisions();
    expect(await skincareRepo.getOutcomes()).toEqual(initialSkincareOutcomes);
    expect(await apparelRepo.getOutcomes()).toEqual(initialApparelOutcomes);
  });

  it('routes HTTP /api/decide requests independently based on adapt_dataset cookie', async () => {
    const { POST: decideRoute } = await import('@/app/api/decide/route');
    const skincareRepo = await getRuntimeRepo('skincare');
    const recs = await skincareRepo.getRecommendations();
    expect(recs.length).toBeGreaterThan(0);
    const skincareRec = recs[0];

    // 1. Register first
    const registerReq = new Request('http://localhost/api/decide', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'adapt_dataset=skincare',
      },
      body: JSON.stringify({
        recommendationId: skincareRec.id,
        action: 'register',
      }),
    });
    const registerRes = await decideRoute(registerReq);
    expect(registerRes.status).toBe(200);

    // 2. Approve via HTTP POST with adapt_dataset=skincare cookie
    const approveReq = new Request('http://localhost/api/decide', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'adapt_dataset=skincare',
      },
      body: JSON.stringify({
        recommendationId: skincareRec.id,
        action: 'approve',
      }),
    });

    const approveRes = await decideRoute(approveReq);
    expect(approveRes.status).toBe(200);

    // Verify Skincare recommendation updated to approved
    const skincareRecsAfter = await skincareRepo.getRecommendations();
    const approvedRec = skincareRecsAfter.find(r => r.id === skincareRec.id);
    expect(approvedRec?.status).toBe('approved');

    // Verify Apparel recommendations remain intact (pending)
    const apparelRepo = await getRuntimeRepo('apparel');
    const apparelRecs = await apparelRepo.getRecommendations();
    expect(apparelRecs[0]?.status).toBe('pending');

    // Reset Skincare and verify
    const resetReq = new Request('http://localhost/api/decide', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'adapt_dataset=skincare',
      },
      body: JSON.stringify({ action: 'reset' }),
    });
    const resetRes = await decideRoute(resetReq);
    expect(resetRes.status).toBe(200);
  });
});
