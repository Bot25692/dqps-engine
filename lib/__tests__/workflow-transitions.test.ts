import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecommendationsScreen } from '@/components/manus/recommendations/RecommendationsScreen';
import { LearningView } from '@/components/learning/learning-view';
import { workflowStage } from '@/lib/presentation/workflow-state';
import { workflowSnapshot } from '@/lib/integration/workflow-snapshot';
import { recommendationView } from '@/lib/presentation/manus-adapters';
import { POST } from '@/app/api/decide/route';
import { getRuntimeRepo } from '@/lib/db/runtime-repo';
import { boundary } from '@/lib/simulation/boundary';
import { getRecord } from '@/lib/simulation/approval-store';
import { sealSession } from '@/lib/session';
import type { Outcome } from '@/lib/types';

const id = 'analysis:2026-10-07:budget_reallocation';
async function action(action: string, dataset = 'apparel', cookie = '') {
  return POST(new Request('http://localhost/api/decide', {method:'POST', headers:{cookie:`adapt_dataset=${dataset}; ${cookie}`}, body:JSON.stringify({action, recommendationId:id, seed:42})}));
}
beforeEach(async()=>{ await action('reset'); });

describe('Workflow transition regressions',()=>{
  it('approval exposes a dedicated simulation panel with no outcome or confidence change',async()=>{
    const repo = await getRuntimeRepo('apparel');
    await action('register'); expect((await action('approve')).status).toBe(200);
    const rec = (await repo.getRecommendations())[0];
    expect(workflowStage(rec)).toBe('APPROVED');
    expect(await repo.getOutcomes()).toEqual([]);
    expect((await repo.getConfidence(rec.type))?.weight).toBe(.75);
    const data = recommendationView(rec,[],await repo.getCampaigns(),await repo.getSkus(),{});
    const html = renderToStaticMarkup(createElement(RecommendationsScreen,{data,handlers:{state:'approved',workflowStage:'APPROVED',onApprove:()=>{},onReject:()=>{},onSimulate:()=>{}}}));
    expect(html).toContain('3-Day Simulation'); expect(html).toContain('Run 3-Day Simulation');
    expect(html).not.toContain('Actual Simulated contribution-profit outcome');
    expect(renderToStaticMarkup(createElement(LearningView,{outcomes:[],recommendations:[rec],currentConfidence:.75}))).toContain('No simulation completed yet');
  });
  it('executed status without a valid outcome remains recoverable, not completed',async()=>{
    const rec = {...(await (await getRuntimeRepo()).getRecommendations())[0], status:'executed' as const};
    expect(workflowStage(rec)).toBe('APPROVED');
    const outcome:Outcome={id:`${id}:outcome`,recommendation_id:id,predicted:10,actual:11,error_pct:10,horizon_days:3,created_at:new Date().toISOString()};
    expect(workflowStage(rec,outcome)).toBe('COMPLETED');
    expect(workflowStage({...rec,status:'pending'},outcome)).toBe('PENDING');
    expect(workflowSnapshot([{...rec,status:'pending'}],[outcome],null,'apparel').outcomes).toEqual([]);
    expect(workflowSnapshot([rec],[{...outcome,recommendation_id:'foreign'}],null,'apparel').outcomes).toEqual([]);
  });
  it('rejects foreign or incomplete cookie outcomes and preserves valid cold-start completion',async()=>{
    const rec=(await (await getRuntimeRepo()).getRecommendations())[0];
    const outcome:Outcome={id:`${id}:outcome`,recommendation_id:id,predicted:10,actual:11,error_pct:10,horizon_days:3,created_at:new Date().toISOString()};
    const session={dataset:'apparel' as const,recommendationId:id,status:'executed' as const,outcome,issuedAt:Date.now()};
    expect(workflowSnapshot([rec],[],session,'skincare').outcomes).toEqual([]);
    expect(workflowSnapshot([rec],[],{...session,status:'approved'},'apparel').outcomes).toEqual([]);
    expect(workflowSnapshot([rec],[],session,'apparel').outcomes).toEqual([outcome]);
  });
  it('recovers approved cold-start state only from the exact dataset authenticated cookie',async()=>{
    const token=sealSession({dataset:'apparel',recommendationId:id,status:'approved',approvedAt:new Date().toISOString()});
    boundary.reset();
    const response=await action('simulate','apparel',`adapt_session=${token}`);
    expect(response.status).toBe(200);
    expect(await (await getRuntimeRepo()).getOutcomes()).toHaveLength(1);
  });
  it('blocks wrong-dataset approval recovery',async()=>{
    const token=sealSession({dataset:'skincare',recommendationId:id,status:'approved',approvedAt:new Date().toISOString()});
    expect((await action('simulate','apparel',`adapt_session=${token}`)).status).toBe(409);
    expect(await (await getRuntimeRepo()).getOutcomes()).toEqual([]);
  });
  it('reset only clears approval state belonging to its dataset',async()=>{
    await action('register'); await action('approve');
    await action('reset','skincare');
    expect(getRecord(id)?.status).toBe('approved');
    expect((await action('simulate')).status).toBe(200);
  });
  it('simulating disables execution; completed renders the real result and error',async()=>{
    const repo=await getRuntimeRepo();
    await action('register');await action('approve');
    const rec=(await repo.getRecommendations())[0];
    const data=recommendationView(rec,[],await repo.getCampaigns(),await repo.getSkus(),{});
    const busy=renderToStaticMarkup(createElement(RecommendationsScreen,{data,handlers:{state:'approved',workflowStage:'SIMULATING',isBusy:true,onApprove:()=>{},onReject:()=>{},onSimulate:()=>{}}}));
    expect(busy).toContain('Running 3-Day Simulation…');expect(busy).toContain('Simulation in progress');
    const responses=await Promise.all([action('simulate'),action('simulate')]);
    expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
    const outcome=(await repo.getOutcomes())[0];
    const finalRec=(await repo.getRecommendations())[0];
    expect(workflowStage(finalRec,outcome)).toBe('COMPLETED');
    const html=renderToStaticMarkup(createElement(LearningView,{outcomes:[outcome],recommendations:[finalRec],currentConfidence:(await repo.getConfidence(rec.type))!.weight}));
    expect(html).toContain('data-workflow-stage="LEARNED"');expect(html).toContain('Actual Simulated');
    await action('reset');expect(await repo.getOutcomes()).toEqual([]);
    expect(workflowStage((await repo.getRecommendations())[0])).toBe('PENDING');
  });
});
