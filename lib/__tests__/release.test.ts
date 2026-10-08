import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlertCard } from '@/components/alert-card';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/decide/route';
import { getRuntimeRepo } from '@/lib/db/runtime-repo';
import { boundary } from '@/lib/simulation/boundary';
import { overviewData } from '@/lib/demo/overview-data';
import { buildCampaignRows } from '@/lib/demo/campaign-data';
import { presentOutcome } from '@/lib/integration/presentation';
import { FixtureRepo } from '@/lib/db/repo';
import { loadAnalysisInputs, runAnalysis, allocationState } from '@/lib/run-analysis';
import { assertGuardrails, allocate } from '@/lib/analysis/optimize';

const id = 'analysis:2026-10-07:budget_reallocation';
async function decide(action: string, extra: Record<string, unknown> = {}) {
  return POST(new Request('http://localhost/api/decide', { method: 'POST', body: JSON.stringify({action, recommendationId: id, seed: 42, ...extra}) }));
}
beforeEach(async () => { vi.restoreAllMocks(); await decide('reset'); });

describe('Release regressions', () => {
  it('accepts Learning reset payload without a recommendation ID', async () => {
    const response = await decide('reset', { recommendationId: undefined });
    expect(response.status).toBe(200);
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(0);
  });
  it('still requires an ID for actions other than reset', async () => {
    expect((await decide('approve', {recommendationId: undefined})).status).toBe(400);
  });
  it('restores approval from the server log after the approval Map is lost', async () => {
    await decide('register'); await decide('approve'); boundary.reset();
    expect((await decide('simulate')).status).toBe(200);
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(1);
  });
  it('does not fabricate a human approval from recommendation status alone', async () => {
    const repo=await getRuntimeRepo(); const rec=(await repo.getRecommendations())[0];
    await repo.saveRecommendations([{...rec,status:'approved'}]); boundary.reset();
    expect((await decide('simulate')).status).toBe(409);
    expect(await repo.getOutcomes()).toHaveLength(0);
  });
  it('does not renew expired persisted approval after a cold boundary', async () => {
    await decide('register'); await decide('approve'); boundary.reset();
    const now=Date.now(); const clock=vi.spyOn(Date,'now').mockReturnValue(now+301000);
    try { expect((await decide('simulate')).status).toBe(409); }
    finally { clock.mockRestore(); }
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(0);
  });
  it('rejection survives loss of the approval Map', async () => {
    await decide('register'); await decide('reject'); boundary.reset();
    expect((await decide('simulate')).status).toBe(409);
  });
  it('saved outcome presentation retains actual profit and updates confidence once', async () => {
    await decide('register'); await decide('approve'); const result=await (await decide('simulate')).json();
    const repo=await getRuntimeRepo(); const rec=(await repo.getRecommendations())[0]; const outcome=(await repo.getOutcomes())[0];
    const view=presentOutcome(outcome,rec);
    expect(view.actualGain).toBe(result.actualGain);
    expect(view.confidenceUpdate.previousConfidence).toBe(.75);
    expect(view.confidenceUpdate.newConfidence).toBe((await repo.getConfidence(rec.type))!.weight);
  });
  it('Overview is safe with no metrics and invents neither dates nor margin', () => {
    const empty=overviewData({campaigns:[],skus:[],metrics:[],inventory:[]});
    expect(empty.portfolioTimeSeries).toHaveLength(0); expect(empty.metadata.asOfDate).toBe('No metrics');
    expect(()=>overviewData({campaigns:[],skus:[],inventory:[],metrics:[{campaign_id:'missing',date:'2025-02-08',spend:10,revenue:30,clicks:1,impressions:10,orders:1}]})).toThrow('Missing SKU');
  });
  it('stock signals rank observed risk instead of preferring a named hero', () => {
    const data={skus:[{id:'SNK-01',name:'Healthy',margin_rate:.4},{id:'OTHER',name:'At risk',margin_rate:.6}], campaigns:[], metrics:[], inventory:[{sku_id:'SNK-01',date:'2025-02-08',units_on_hand:1000,units_sold:10},{sku_id:'OTHER',date:'2025-02-08',units_on_hand:4,units_sold:20}]};
    const result=overviewData(data);
    expect(result.attentionItem.id).toBe('OTHER');
  });
  it('risk presentation does not assert a strong return for arbitrary ROAS', () => {
    const html=renderToStaticMarkup(createElement(AlertCard,{sectionLabel:'Risk',sectionTrend:'problem',name:'Test',sku:'TEST',platform:'meta',statusLabel:'STOCK RISK',statusTrend:'problem',metrics:[{label:'ROAS',value:'0.2'}],insight:'Observed stock risk.'}));
    expect(html).toContain('Observed stock risk.'); expect(html).not.toContain('Strong media return');
  });
  it('Campaign flags use the SKU break-even threshold, not universal ROAS', () => {
    const rows=buildCampaignRows([{id:'c',name:'Test',sku_id:'s',platform:'meta',daily_budget:100}],[{id:'s',name:'Test',margin_rate:.2}],[{campaign_id:'c',date:'2025-02-08',spend:100,revenue:400,clicks:10,impressions:100,orders:2}],[]);
    expect(rows[0].breakEvenRoas).toBe(5); expect(rows[0].flag).toBe('negative-margin');
  });
  it('Campaigns refuses invented margin for missing SKU', () => {
    expect(()=>buildCampaignRows([{id:'c',name:'Missing',sku_id:'missing',platform:'meta',daily_budget:100}],[],[],[])).toThrow('Missing SKU');
  });
  it('skincare fixture passes the actual pipeline, guardrails and presentation', async () => {
    const repo=new FixtureRepo('fixtures/skincare');
    const result=await runAnalysis(repo); const inputs=await loadAnalysisInputs(repo);
    expect(result.asOf).toBe('2025-02-08'); expect(result.topRecommendation).not.toBeNull();
    expect(()=>assertGuardrails(allocate(allocationState(inputs)))).not.toThrow();
    const view=overviewData(inputs); expect(view.metadata.asOfDate).toBe('2025-02-08');
    expect(view.attentionItem.name).toBe('Gentle Foaming Cleanser');
    expect(buildCampaignRows(inputs.campaigns,inputs.skus,inputs.metrics,inputs.inventory)).toHaveLength(2);
  });
  it('persists decisions and outcomes across independent FixtureRepo instances via storage overlay', async () => {
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { rm } = await import('node:fs/promises');
    const testDir = join(tmpdir(), `adapt_test_overlay_${Date.now()}`);
    try {
      const repoA = new FixtureRepo({ seed: 1, storageDir: testDir });
      const rec = (await repoA.getRecommendations())[0] ?? {
        id: 'rec_overlay_test', created_at: '2026-03-31T00:00:00.000Z', type: 'budget_reallocation',
        moves: [{ campaign_id: 'c1', old_budget: 100, new_budget: 80, reason: 'reallocation test' }], expected_profit_gain_per_day: 100, confidence: 0.75, constraints_checked: [],
        explanation: 'test', status: 'pending',
      };
      await repoA.saveRecommendations([{ ...rec, status: 'executed' }]);
      await repoA.saveOutcome({
        id: 'rec_overlay_test:outcome', recommendation_id: rec.id, created_at: '2026-03-31T00:00:00.000Z',
        predicted: 300, actual: 310, error_pct: 3.3, horizon_days: 3,
      });

      // Independent instance B reading the same storage directory
      const repoB = new FixtureRepo({ seed: 1, storageDir: testDir });
      const outcomesB = await repoB.getOutcomes();
      expect(outcomesB).toHaveLength(1);
      expect(outcomesB[0].actual).toBe(310);
      const recB = (await repoB.getRecommendations()).find(r => r.id === rec.id);
      expect(recB?.status).toBe('executed');

      // Reset on instance B cleans the overlay
      await repoB.resetDecisions();
      const repoC = new FixtureRepo({ seed: 1, storageDir: testDir });
      expect(await repoC.getOutcomes()).toHaveLength(0);
    } finally {
      await rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });
  it('POST /api/decide sets adapt_session cookie on approval and simulation and clears on reset', async () => {
    await decide('register');
    const approveRes = await decide('approve');
    const approveCookie = approveRes.headers.get('set-cookie');
    expect(approveCookie).toBeTruthy();
    expect(approveCookie).toContain('adapt_session=');
    expect(approveCookie).toContain('Max-Age=86400');

    const simRes = await decide('simulate');
    const simCookie = simRes.headers.get('set-cookie');
    expect(simCookie).toBeTruthy();
    expect(simCookie).toContain('adapt_session=');
    expect(simCookie).toContain('HttpOnly');
    const tokenMatch = simCookie!.match(/adapt_session=([^;]+)/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];

    const { unsealSession } = await import('../session');
    const unsealed = unsealSession(token);
    expect(unsealed).toBeTruthy();
    expect(unsealed?.status).toBe('executed');
    expect(unsealed?.outcome?.predicted).toBeGreaterThan(0);
    expect(unsealed?.outcome?.actual).toBeDefined();

    // Tampered token must fail cryptographic authentication
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(unsealSession(tampered)).toBeNull();

    const resetRes = await decide('reset');
    const resetCookie = resetRes.headers.get('set-cookie');
    expect(resetCookie).toBeTruthy();
    expect(resetCookie).toContain('Max-Age=0');
  });
});
