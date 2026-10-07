import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixtureSchemas } from '../lib/db/repo.ts';
import type { Campaign, MetricRow, InventoryRow } from '../lib/types.ts';

export const products = [
  { id: 'SNK-01', name: 'Court Sneaker', price: 3499, margin_rate: .45 },
  { id: 'TEE-PRM', name: 'Premium T-Shirt', price: 1299, margin_rate: .61 },
  { id: 'TEE-BSC', name: 'Basic Graphic Tee', price: 699, margin_rate: .18 },
  { id: 'HOOD-01', name: 'Everyday Hoodie', price: 2199, margin_rate: .50 },
  { id: 'JOG-01', name: 'Jogger', price: 1799, margin_rate: .48 },
  { id: 'CAP-01', name: 'Cap', price: 599, margin_rate: .45 },
  { id: 'BAG-01', name: 'Bag', price: 1499, margin_rate: .52 },
  { id: 'SOCK-3P', name: 'Socks 3-Pack', price: 499, margin_rate: .42 },
];

// Mulberry32 provides repeatable randomness without global state or dependencies.
function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, state | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const money = (n: number) => Math.round(n * 100) / 100;

// Generate observations first, then inventory with no sneaker restocks and 900 final premium units.
export function generateSeed(seed = 1) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be an integer from 0 to 4294967295');
  const random = randomGenerator(seed);
  const definitions: [string, string, Campaign['platform'], number, number][] = [
    ['c-sneaker', 'SNK-01', 'meta', 30000, 4.8],
    ['c-premium', 'TEE-PRM', 'amazon', 25000, 4.1],
    ['c-basic', 'TEE-BSC', 'tiktok', 22000, 3.4],
    ['c-hoodie', 'HOOD-01', 'meta', 12000, 4.2],
    ['c-jogger', 'JOG-01', 'google', 10000, 6.0],
    ['c-cap', 'CAP-01', 'meta', 7000, 3.0],
    ['c-bag', 'BAG-01', 'amazon', 8000, 3.2],
    ['c-socks', 'SOCK-3P', 'tiktok', 5000, 3.0],
    ['c-cap-google', 'CAP-01', 'google', 4000, 3.5],
    ['c-bag-meta', 'BAG-01', 'meta', 4000, 3.2],
  ];
  const campaigns = definitions.map(([id, sku_id, platform, daily_budget]) => ({
    id, sku_id, platform, daily_budget, name: `${products.find(p => p.id === sku_id)!.name} ${platform}`,
  }));
  const truth = definitions.map(([campaign_id, sku, , s0, roas]) => ({
    campaign_id, s0, r0: s0 * roas, beta_true: .55 + random() * .25,
    ctr: .025, cpm: 180, aov: products.find(p => p.id === sku)!.price,
  }));
  const metrics: MetricRow[] = [];
  const dates = Array.from({ length: 45 }, (_, i) => new Date(Date.UTC(2026, 7, 24 + i)).toISOString().slice(0, 10));
  for (let d = 0; d < 45; d++) {
    // Monday through Sunday, bounded +/-10%; demand noise is uniform +/-6%.
    const weekday = [1.10, .94, .96, .98, 1, 1.02, 1.10][new Date(dates[d]).getUTCDay()];
    for (const campaign of campaigns) {
      const t = truth.find(t => t.campaign_id === campaign.id)!;
      const spend = money(t.s0 * (.85 + .30 * random()));
      const demand = weekday * (.94 + .12 * random());
      // A 2.3% daily decay (about 2%) crosses the rolling fatigue threshold at day 45.
      const fatigue = campaign.id === 'c-hoodie' && d >= 21 ? .977 ** (d - 20) : 1;
      const auction = campaign.platform === 'google' && d >= 35 ? 1.4 : 1;
      const revenue = money(t.r0 * (spend / t.s0) ** t.beta_true * demand * fatigue / auction);
      const impressions = Math.round(spend / (t.cpm * auction) * 1000);
      const clicks = Math.round(impressions * t.ctr * fatigue);
      // CVR absorbs diminishing returns and demand; rounding leaves AOV close to the SKU price.
      const cvr = revenue / t.aov / clicks;
      const orders = Math.round(clicks * cvr);
      metrics.push({ campaign_id: campaign.id, date: dates[d], spend, revenue, impressions, clicks, orders });
    }
  }
  // Stock-limited delivery after day 41 reduces volume, not advertising efficiency.
  // Scale spend and revenue together to retain ROAS; consume no extra random draws.
  for (const row of metrics.filter(m => m.campaign_id === 'c-sneaker' && m.date >= dates[41])) {
    row.spend = money(row.spend * .45);
    row.revenue = money(row.revenue * .45);
    row.impressions = Math.round(row.impressions * .45);
    row.clicks = Math.round(row.clicks * .45);
  }
  const inventory: InventoryRow[] = [];
  const opening_inventory: Record<string, number> = {};
  for (const product of products) {
    const ids = new Set(campaigns.filter(c => c.sku_id === product.id).map(c => c.id));
    const daily = dates.map(date => metrics.filter(m => m.date === date && ids.has(m.campaign_id)).reduce((s, m) => s + m.orders, 0));
    // Round UP for sneaker units so revenue never exceeds opening units times price, even on the last day.
    if (product.id === 'SNK-01') {
      metrics.filter(m => ids.has(m.campaign_id)).forEach((m, d) => { m.orders = Math.ceil(m.revenue / product.price); daily[d] = m.orders; });
    }
    // User-approved E5 stock increase: 900 units covers +40% budget even at fitted beta's 0.9 ceiling.
    // Leave about 0.9 days of sneaker cover, rounded to a whole stock unit.
    const recentDailySales = daily.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const finalStock = product.id === 'SNK-01' ? Math.round(recentDailySales * .9) : product.id === 'TEE-PRM' ? 900 : Math.ceil(recentDailySales * 25);
    let stock = daily.reduce((a, b) => a + b, 0) + finalStock;
    opening_inventory[product.id] = stock;
    daily.forEach((units_sold, d) => {
      stock -= units_sold;
      inventory.push({ sku_id: product.id, date: dates[d], units_on_hand: stock, units_sold });
    });
  }
  const event = (id: string, campaign: string, start_day: number, expected_detector: string, expected_top_driver: string) => ({ seed, id, campaign, start_day, expected_detector, expected_top_driver });
  const planted_events = [
    event('E1', 'c-sneaker', 41, 'stock_runway', 'stock'),
    event('E2', 'c-hoodie', 22, 'fatigue', 'ctr'),
    ...campaigns.filter(c => c.platform === 'google').map(c => event('E3', c.id, 36, 'cpm', 'cpm')),
    event('E4', 'c-basic', 1, 'negative_marginal_profit', 'margin_rate'),
    event('E5', 'c-premium', 1, 'positive_marginal_profit', 'margin_rate'),
  ];
  const updated_at = `${dates[44]}T00:00:00Z`;
  const tables = {
    skus: products.map(({ price, ...sku }) => sku), campaigns, metrics, inventory,
    anomalies: [], recommendations: [], action_log: [], outcomes: [],
    campaign_state: campaigns.map(c => ({ campaign_id: c.id, daily_budget: c.daily_budget, status: 'active' as const, updated_at })),
    confidence_weights: (['budget_reallocation', 'stock_protection', 'creative_refresh'] as const).map(recommendation_type => ({ recommendation_type, weight: .75, updated_at })),
  };
  for (const [name, schema] of Object.entries(fixtureSchemas)) schema.parse(tables[name as keyof typeof tables]);
  return { seed, currency: 'INR', as_of: dates[44], products, truth, opening_inventory, planted_events, ...tables };
}
export type SeedData = ReturnType<typeof generateSeed>;

// Parse strictly so a typo cannot accidentally select database mode.
export function parseArgs(args: string[]) {
  let seed = 1;
  let out: 'json' | 'db' = 'json';
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (seen.has(key) || value === undefined) throw new Error('Usage: seed.ts [--seed N] [--out json|db]');
    seen.add(key);
    if (key === '--seed' && /^\d+$/.test(value)) seed = Number(value);
    else if (key === '--out' && (value === 'json' || value === 'db')) out = value;
    else throw new Error('Usage: seed.ts [--seed N] [--out json|db]');
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
  return { seed, out };
}

// JSON execution never loads the database adapter or reads credentials.
export async function main(args = process.argv.slice(2)) {
  const { seed, out } = parseArgs(args);
  const data = generateSeed(seed);
  if (out === 'db') {
    const { SeedRepo } = await import('../lib/db/seed-repo.ts');
    await new SeedRepo().saveSeed(data);
  } else {
    await mkdir(new URL('../fixtures/', import.meta.url), { recursive: true });
    await writeFile(new URL(`../fixtures/seed-${seed}.json`, import.meta.url), JSON.stringify(data, null, 2) + '\n');
  }
  await writeFile(new URL('../planted_events.json', import.meta.url), JSON.stringify(data.planted_events, null, 2) + '\n');
  console.log(`Seed ${seed}: 45 days, ${data.campaigns.length} campaigns, output ${out}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}


