import assert from 'node:assert/strict';
const base = process.argv[2] ?? 'http://localhost:3220';
assert.ok(['localhost','127.0.0.1','::1'].includes(new URL(base).hostname), 'This destructive fixture smoke is local-only');
let id='demo';
async function action(action, expected=200, extra={}) {
 const r=await fetch(base+'/api/decide',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({recommendationId:id,action,seed:42,...extra})});
 const data=await r.json(); assert.equal(r.status,expected,JSON.stringify(data)); return data;
}
await action('reset');
const analysisResponse=await fetch(base+'/api/run-analysis',{method:'POST'}); assert.equal(analysisResponse.status,200);
const analysis=await analysisResponse.json(); assert.ok(analysis.topRecommendation); id=analysis.topRecommendation.id;
for(const path of ['/','/campaigns','/recommendations','/learning']) {
 const r=await fetch(base+path); assert.equal(r.status,200); const html=await r.text();
 assert.ok(!html.includes('Data temporarily unavailable'), path+' error state');
}
await action('simulate',409); await action('register'); await action('approve');
const result=await action('simulate'); assert.equal(result.predictedTotal,analysis.topRecommendation.expected_profit_gain_per_day*3);
assert.equal(result.actualGain,result.simulationResult.portfolioGain);
for(const move of result.simulationResult.moveResults) for(const day of move.days) { assert.ok(day.inventoryUnits>=0); assert.ok(Number.isFinite(day.contributionProfit)); }
const html=await (await fetch(base+'/learning')).text();
assert.ok(html.includes(String(result.actualGain))); assert.ok(!html.includes('No simulation outcomes yet'));
const reload=await (await fetch(base+'/recommendations')).text(); assert.ok(reload.includes(String(result.actualGain)),'persisted result survives reload');
await action('simulate',409);
await action('reset',200,{recommendationId:undefined}); await action('register'); await action('reject'); await action('simulate',409);
assert.ok((await (await fetch(base+'/learning')).text()).includes('No simulation outcomes yet'));
await action('reset'); await action('register'); await action('approve'); const replay=await action('simulate'); assert.equal(replay.actualGain,result.actualGain);
await action('reset');
console.log(JSON.stringify({result:'PASS',asOf:analysis.asOf,counts:analysis.counts,predicted:result.predictedTotal,actualSimulated:result.actualGain,errorPct:result.errorPct,confidence:result.confidenceUpdate},null,2));
