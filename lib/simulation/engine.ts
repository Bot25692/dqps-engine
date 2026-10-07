/** Hidden-world M4 simulator. Analysis must never import this module. */
import { makeRng, uniform } from './seeded-rng';
import type { ApprovedPlan, SimDayResult, SimulationResult } from './types';

// Apply the locked power curve, zeroing revenue at zero spend.
function predictRevenue(revenue: number, spend: number, next: number, beta: number): number {
  return spend > 0 && next > 0 ? revenue * (next / spend) ** beta : 0;
}

// Consume a SKU pool once per sale and cap realized revenue to fulfillable units.
function fulfill(pool: Map<string, number>, sku: string, revenue: number, demand: number) {
  const available = pool.get(sku)!;
  const estimated = Math.ceil(demand);
  const sold = Math.min(estimated, available);
  pool.set(sku, available - sold);
  return estimated > 0 ? revenue * sold / estimated : available > 0 ? revenue : 0;
}

// Simulate every changed campaign, including cuts, against a separate no-change stock world.
// Shared SKU pools prevent campaigns from independently selling the same inventory.
export function runSimulation(plan: ApprovedPlan, seed: number): SimulationResult {
  const rng = makeRng(seed);
  const actualStock = new Map<string, number>();
  const baselineStock = new Map<string, number>();
  const states = plan.moves.map(move => {
    const sku = move.receiverSkuId ?? move.receiverCampaignId;
    actualStock.set(sku, move.receiverInventoryUnits);
    baselineStock.set(sku, move.receiverInventoryUnits);
    return { move, sku, beta: move.betaEst * uniform(rng, .8, 1.2),
      noise: [uniform(rng, -.08, .08), uniform(rng, -.08, .08), uniform(rng, -.08, .08)],
      days: [] as SimDayResult[], gain: 0 };
  });
  for (let day = 1; day <= 3; day++) {
    for (const state of states) {
      const { move, sku, beta } = state;
      const spend = move.receiverSpend + move.amountPerDay * (day === 1 ? .5 : 1);
      const noiseFactor = 1 + state.noise[day - 1];
      const modeledRevenue = predictRevenue(move.receiverRevenue, move.receiverSpend, spend, beta) * noiseFactor;
      const demand = move.receiverAvgDailyUnitsSold * (move.receiverRevenue > 0 ? modeledRevenue / move.receiverRevenue : 0);
      const revenue = fulfill(actualStock, sku, modeledRevenue, demand);
      const baselineRevenue = fulfill(baselineStock, sku, move.receiverRevenue, move.receiverAvgDailyUnitsSold);
      const cp = revenue * move.receiverMarginRate - spend;
      state.gain += cp - (baselineRevenue * move.receiverMarginRate - move.receiverSpend);
      state.days.push({ day: day as 1 | 2 | 3, revenue: Math.round(revenue * 100) / 100,
        spend: Math.round(spend * 100) / 100, contributionProfit: Math.round(cp * 100) / 100,
        inventoryUnits: actualStock.get(sku)!, betaHidden: Math.round(beta * 10000) / 10000,
        noiseFactor: Math.round(noiseFactor * 10000) / 10000 });
    }
    // All campaigns sharing a SKU report the same end-of-day remaining stock.
    for (const state of states) state.days[day - 1].inventoryUnits = actualStock.get(state.sku)!;
  }
  const moveResults = states.map(({ move, days, gain }) => ({
    donorCampaignId: move.donorCampaignId, receiverCampaignId: move.receiverCampaignId,
    days: days as [SimDayResult, SimDayResult, SimDayResult], totalGainVsBaseline: Math.round(gain * 100) / 100,
    predictedTotalGain: 0, predictionError: NaN,
  }));
  return { recommendationId: plan.recommendationId, seed, simulatedAt: Date.now(), moveResults,
    portfolioGain: Math.round(moveResults.reduce((sum, move) => sum + move.totalGainVsBaseline, 0) * 100) / 100 };
}
