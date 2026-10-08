import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FixtureRepo } from '../db/repo';
import { loadAnalysisInputs, runAnalysis, allocationState } from '../run-analysis';
import { overviewView, campaignsView, recommendationView, learningView, inr } from '../presentation/manus-adapters';
import { LearningScreen } from '@/components/manus/learning/LearningScreen';
import { ProfitabilityChart } from '@/components/manus/overview/ProfitabilityChart';

describe('Manus integration presentation regressions',()=>{
  for(const dataset of ['apparel','skincare'] as const) {
    it(`${dataset}: supplies all observed chart points, dynamic names and real campaign budgets`,async()=>{
      const repo=dataset==='apparel'?new FixtureRepo({seed:1,storageDir:null}):new FixtureRepo('fixtures/skincare');
      const inputs=await loadAnalysisInputs(repo); const overview=overviewView(inputs);const campaigns=campaignsView(inputs);
      expect(overview.chart.series).toHaveLength(3);
      expect(overview.chart.series[0].points).toHaveLength(30);
      const day=overview.chart.xLabels.at(-1)!;
      expect(overview.chart.series[0].points.at(-1)!.value).toBe(inputs.metrics.filter(r=>r.date===day).reduce((sum,r)=>sum+r.revenue,0));
      expect(overview.signals[0].name).toBe(dataset==='apparel'?'Court Sneaker':'Gentle Foaming Cleanser');
      expect(campaigns.rows).toHaveLength(inputs.campaigns.length);
      for(const row of campaigns.rows) expect(row.dailyBudgetDisplay).toBe(inr(inputs.campaigns.find(c=>c.id===row.id)!.daily_budget));
      const chart=renderToStaticMarkup(createElement(ProfitabilityChart,{chart:overview.chart}));
      expect((chart.match(/class="legend-item"/g)||[])).toHaveLength(3);
      expect((chart.match(/class="chart-point"/g)||[])).toHaveLength(90);
    });
    it(`${dataset}: renders the existing recommendation without losing donors or receiver moves`,async()=>{
      const repo=dataset==='apparel'?new FixtureRepo({seed:1,storageDir:null}):new FixtureRepo('fixtures/skincare');
      const analysis=await runAnalysis(repo);const inputs=await loadAnalysisInputs(repo);const rec=analysis.topRecommendation!;
      const runways=Object.fromEntries(allocationState(inputs).campaigns.map(c=>[c.id,c.sku.runway]));
      const view=recommendationView(rec,await repo.getAnomalies(),inputs.campaigns,inputs.skus,runways);
      expect(view.donors.length+view.receivers.length).toBe(rec.moves.length);
      for(const move of [...view.donors,...view.receivers]) {const real=rec.moves.find(r=>r.campaign_id===move.id)!;expect(move.proposedBudgetDisplay).toBe(inr(real.new_budget));}
      expect(view.projectedThreeDayContributionProfitDisplay).toBe(inr(rec.expected_profit_gain_per_day*3));
      expect(view.guardrails.map(g=>g.id)).toEqual(rec.constraints_checked);
      for (const [status, activeStage] of [['approved', 'Simulate'], ['executed', 'Learn']] as const) {
        const transitioned = recommendationView({...rec, status}, [], inputs.campaigns, inputs.skus, runways);
        expect(transitioned.workflowStages.find(stage=>stage.state==='active')?.label).toBe(activeStage);
      }
    });
  }
  it('shows unavailable chart data without inventing a line',()=>{
    const view=overviewView({campaigns:[],skus:[],metrics:[],inventory:[]});
    expect(view.chart.series.every(s=>s.points.length===0)).toBe(true);
    expect(view.chart.periodLabel).toBe('No metrics');
  });
  it('shows actual signed outcome and applies existing confidence formula once',()=>{
    const view=learningView([{id:'outcome',recommendation_id:'rec',created_at:'2025-02-09T00:00:00.000Z',predicted:300,actual:-150,error_pct:-150,horizon_days:3}],[{id:'rec',confidence:.75,created_at:'2025-02-08T00:00:00.000Z',type:'budget_reallocation',moves:[],constraints_checked:[],expected_profit_gain_per_day:100,explanation:'Test snapshot',status:'executed'}],.67);
    expect(view.records[0].actualContributionProfitDisplay).toBe(inr(-150));
    expect(view.records[0].confidenceBeforeDisplay).toBe('75.0%');
    expect(view.records[0].confidenceAfterDisplay).toBe('67.0%');
    expect(view.records[0].accuracyDisplay).toBe('0.0%');
    const html=renderToStaticMarkup(createElement(LearningScreen,{data:view}));
    expect(html).toContain('Actual Simulated');expect(html).not.toContain('Approval shown locally');
  });
  it('empty learning has no fake actual or history',()=>{
    const view=learningView([],[],.75);
    expect(view.records).toEqual([]);expect(view.confidenceHistory).toEqual([]);
    expect(renderToStaticMarkup(createElement(LearningScreen,{data:view}))).toContain('No simulation outcomes yet');
  });
});
