import type { Anomaly, Campaign, Outcome, Recommendation, Sku } from '../types';
import { overviewData } from '../demo/overview-data';
import { buildCampaignRows } from '../demo/campaign-data';
import { presentOutcome } from '../integration/presentation';
import type { OverviewViewModel, CampaignsViewModel, RecommendationViewModel, LearningViewModel, BudgetMoveViewModel } from './manus-contracts';

export const inr = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
type Inputs = Parameters<typeof overviewData>[0];

// Map observed portfolio rows to display values and chart geometry, without fitting or allocating.
export function overviewView(inputs: Inputs): OverviewViewModel {
  const view = overviewData(inputs);
  const rows = view.portfolioTimeSeries;
  const allValues = rows.flatMap(row => [row.revenue, row.spend, row.profit]);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(1, ...allValues);
  const series = ([['revenue','Revenue','glacier'],['profit','Contribution profit','profit'],['spend','Ad spend','copper']] as const).map(([id,label,tone]) => ({id,label,tone,points:rows.map(row=>({xLabel:row.day,value:row[id],displayValue:inr(row[id])}))}));
  const signals = [view.attentionItem,view.opportunityItem].filter(item=>item.id !== 'NONE').map((item,index)=>({id:item.id,kind:index===0?'risk' as const:'opportunity' as const,name:item.name,sku:item.sku,platform:item.platform,roasDisplay:`${item.roas.toFixed(2)}×`,stockCoverDisplay:Number.isFinite((item as {stockRunwayDays?:number}).stockRunwayDays)?`${(item as {stockRunwayDays?:number}).stockRunwayDays!.toFixed(2)} days`:'No recent sales',marginDisplay:`${item.marginPct.toFixed(0)}%`,summary:item.insight}));
  return { metrics:view.kpiStats.map((stat,index)=>({id:['revenue','spend','contribution-profit','blended-roas'][index],label:stat.label,displayValue:stat.value,context:stat.sub,tone:stat.trend==='problem'?'critical':index===2?'profit':'neutral',icon:'metric'})),chart:{title:'Profitability, over time.',subtitle:`${rows.length}-day financial trend across active channels`,periodLabel:rows.length?`${rows[0].day} — ${rows.at(-1)!.day}`:'No metrics',minValue,maxValue,yTicks:Array.from({length:5},(_,i)=>{const value=minValue+(maxValue-minValue)*i/4;return {value,label:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',notation:'compact',maximumFractionDigits:1}).format(value)};}),xLabels:rows.map(r=>r.day),series},signals,keyMessage:`${view.metadata.asOfDate} · ${view.metadata.campaignCount} campaigns · ${view.metadata.platformCount} platforms. Every decision considers margin, diminishing returns and stock.` };
}

// Keep the existing campaign metric helper as the source of financial presentation.
export function campaignsView(inputs: Inputs): CampaignsViewModel {
  return {rows:buildCampaignRows(inputs.campaigns,inputs.skus,inputs.metrics,inputs.inventory).map(row=>({id:row.campaign.id,name:row.campaign.name,platform:row.campaign.platform,sku:row.sku.id,dailyBudgetDisplay:inr(row.campaign.daily_budget),budgetValue:row.campaign.daily_budget,roasDisplay:`${row.roas.toFixed(2)}×`,spendDisplay:inr(row.avgDailySpend),runwayDisplay:Number.isFinite(row.stockRunwayDays)?`${row.stockRunwayDays.toFixed(1)} days`:'No recent sales',statusLabel:row.flag==='none'?'Within thresholds':row.flag==='negative-margin'?'Negative profit':'Stock risk',statusTone:row.flag==='none'?'neutral':row.flag==='negative-margin'?'risk':'warning'}))};
}

// Translate the saved engine decision into Manus display props. Never generate a budget move.
export function recommendationView(rec: Recommendation, anomalies: Anomaly[], campaigns: Campaign[], skus: Sku[], runways: Record<string,number|null>): RecommendationViewModel {
  const donorMoves=rec.moves.filter(m=>m.new_budget<m.old_budget);
  const receivers=rec.moves.filter(m=>m.new_budget>m.old_budget);
  const first=donorMoves[0]??rec.moves[0];
  const anomaly=anomalies.find(a=>a.campaign_id===first.campaign_id)??anomalies[0];
  const campaign=campaigns.find(c=>c.id===first.campaign_id);
  const sku=skus.find(s=>s.id===campaign?.sku_id);
  const moveView=(move:Recommendation['moves'][number]):BudgetMoveViewModel=>{const c=campaigns.find(c=>c.id===move.campaign_id);const s=skus.find(s=>s.id===c?.sku_id);return {id:move.campaign_id,name:c?.name??move.campaign_id,platform:c?.platform??'Unavailable',campaignId:move.campaign_id,sku:c?.sku_id??'Unavailable',marginDisplay:s?percent(s.margin_rate):undefined,currentBudgetDisplay:inr(move.old_budget),proposedBudgetDisplay:inr(move.new_budget),changeDisplay:`${move.new_budget>=move.old_budget?'+':'−'}${inr(Math.abs(move.new_budget-move.old_budget))} / day`};};
  const active=rec.status==='executed'?6:rec.status==='approved'?4:3;
  return {asOfDisplay:rec.created_at.slice(0,10),detectedAtDisplay:anomaly?.date??'Unavailable',campaignName:sku?.name??campaign?.name??first.campaign_id,campaignId:first.campaign_id,sku:campaign?.sku_id??'Unavailable',platform:campaign?.platform??'Unavailable',diagnosisLabel:anomaly?'Stock risk':'Profit opportunity',runwayDisplay:anomaly?`${anomaly.observed.toFixed(1)} days`:'Unavailable',currentRunwayDisplay:runways[first.campaign_id]==null?'Unavailable':`${runways[first.campaign_id]!.toFixed(1)} days`,warningThresholdDisplay:anomaly?`${anomaly.baseline.toFixed(0)} days`:'Unavailable',zScoreDisplay:anomaly?`${anomaly.z_score.toFixed(2)}σ`:'Not applicable',evidence:anomaly?.drivers[0]?.description??rec.explanation,donor:moveView(first),donors:donorMoves.map(moveView),receivers:receivers.map(moveView),adjustedBudgetsDisplay:String(rec.moves.length),heldBackDisplay:inr(rec.moves.reduce((sum,m)=>sum+m.old_budget-m.new_budget,0)),expectedDailyContributionProfitDisplay:inr(rec.expected_profit_gain_per_day),projectedThreeDayContributionProfitDisplay:inr(rec.expected_profit_gain_per_day*3),guardrails:rec.constraints_checked.map(label=>({id:label,label:label.replaceAll('_',' '),state:'satisfied'})),confidenceDisplay:percent(rec.confidence),confidenceTrackPositionPercent:Math.max(0,Math.min(100,(rec.confidence-.3)/.65*100)),confidenceBand:rec.confidence>=.8?'HIGH':rec.confidence>=.6?'MEDIUM':'LOW',confidenceRangeDisplay:'[0.30–0.95]',confidenceStepCapDisplay:'±0.08',workflowStages:['Detect','Diagnose','Decide','Approve','Simulate','Measure','Learn'].map((label,index)=>({id:label,label,state:index<active?'complete':index===active?'active':'pending'}))};
}

// Present persisted observations using the existing M5 helper, never current confidence as a second update.
export function learningView(outcomes: Outcome[], recommendations: Recommendation[], currentConfidence: number): LearningViewModel {
  const records=[...outcomes].sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(outcome=>{const rec=recommendations.find(r=>r.id===outcome.recommendation_id);const update=presentOutcome(outcome,rec??{confidence:.75} as Recommendation).confidenceUpdate;return {id:outcome.id,periodDisplay:`${outcome.created_at.slice(0,10)} · ${outcome.horizon_days} simulated days`,predictedContributionProfitDisplay:inr(outcome.predicted),actualContributionProfitDisplay:inr(outcome.actual),errorDisplay:`${outcome.error_pct.toFixed(1)}%`,accuracyDisplay:percent(update.accuracy),confidenceBeforeDisplay:percent(update.previousConfidence),confidenceAfterDisplay:percent(update.newConfidence),after:update.newConfidence,before:update.previousConfidence};});
  return {modelName:'Budget reallocation',currentConfidenceDisplay:percent(currentConfidence),confidenceNumericValue:currentConfidence,confidenceRangeLabel:'[0.30–0.95]',confidenceRangeMin:.3,confidenceRangeMax:.95,formulaAccuracy:'accuracy = max(0, 1 − |error|)',formulaConfidence:'c = c + 0.3 × (accuracy − c)',stepCapDisplay:'Step capped at ±0.08',flowSteps:['Predict impact','Approve & Simulate','Observe outcome','Measure error','Update confidence'],pendingPredictionDisplay:recommendations[0]?inr(recommendations[0].expected_profit_gain_per_day*3):undefined,pendingPeriodDisplay:'Predicted incremental contribution profit · 3 days',records,confidenceHistory:records.length?[{label:'Before',value:records[0].before,displayValue:records[0].confidenceBeforeDisplay},...records.map((r,i)=>({label:`Run ${i+1}`,value:r.after,displayValue:r.confidenceAfterDisplay}))]:[]};
}
