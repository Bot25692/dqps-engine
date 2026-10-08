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
});
