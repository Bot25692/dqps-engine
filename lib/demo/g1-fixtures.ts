/* ─── G1 fixture data ─────────────────────────────────────────────────────── */
/* All values for the Gate G1 Overview page.                                   */
/* Grounded in CONTEXT.md §Scenario: Day 45 as-of, 4 platforms, 8 SKUs, INR.  */
/* Formulas used to derive numbers (no calculation happens in React):          */
/*   Contribution profit = revenue × margin_rate − ad spend                   */
/*   ROAS = revenue / spend                                                    */
/*   Break-even ROAS = 1 / margin_rate  →  1/0.61 ≈ 1.64                     */
/* NEVER import this file from lib/analysis — analysis functions are pure.     */

/* ─── KPI strip ──────────────────────────────────────────────────────────── */
/* These four values appear in the four stat cards at the top of Overview.    */

export type Trend = "good" | "problem" | "warning" | "neutral";

export interface KpiStat {
  label: string;
  value: string;
  /** Secondary line shown below the value */
  sub: string;
  trend: Trend;
}

export const kpiStats: KpiStat[] = [
  {
    label: "Revenue",
    value: "₹3,52,800",
    sub: "Day 45 · all platforms",
    trend: "neutral",
  },
  {
    label: "Ad Spend",
    value: "₹84,000",
    sub: "4 platforms combined",
    trend: "neutral",
  },
  {
    label: "Contribution Profit",
    // revenue × blended_margin − spend  =  352800 × 0.61 − 84000 = 131208
    // using rounded scenario figure to match brand story
    value: "₹1,31,208",
    sub: "Revenue × margin − spend",
    trend: "good",
  },
  {
    label: "Blended ROAS",
    // revenue / spend = 352800 / 84000 ≈ 4.2
    value: "4.2×",
    sub: "Break-even: 1.64× (margin 61%)",
    trend: "good",
  },
];

/* ─── Portfolio time-series (30-day daily totals) ─────────────────────────── */
/* Used by the Recharts area/line chart.                                       */
/* day 1–45 in the scenario; we show the last 30 (days 16–45).                */
/* Spend is flat. Revenue has gentle growth then shows E3/E4 effects day 36+. */

export interface DailyPortfolioRow {
  /** "Day N" label for x-axis */
  day: string;
  /** Total revenue across all platforms that day, INR */
  revenue: number;
  /** Total ad spend that day, INR */
  spend: number;
  /** Contribution profit = revenue × 0.61 − spend */
  profit: number;
}

/* Helper — kept here, not in a React component (pure data). */
function row(dayN: number, revenue: number, spend: number): DailyPortfolioRow {
  return {
    day: `D${dayN}`,
    revenue,
    spend,
    profit: Math.round(revenue * 0.61 - spend),
  };
}

export const portfolioTimeSeries: DailyPortfolioRow[] = [
  // Days 16-35: stable growth period
  row(16, 298000, 82000),
  row(17, 301000, 82500),
  row(18, 305000, 83000),
  row(19, 308000, 83000),
  row(20, 311000, 83000),
  row(21, 315000, 83500),
  // E2 starts day 22: Hoodie CTR begins decaying on Meta — mild at first
  row(22, 318000, 84000),
  row(23, 316000, 84000),
  row(24, 314000, 84000),
  row(25, 312000, 84000),
  row(26, 313000, 84000),
  row(27, 315000, 84000),
  row(28, 317000, 84000),
  row(29, 319000, 84000),
  row(30, 322000, 84000),
  row(31, 325000, 84000),
  row(32, 328000, 84000),
  row(33, 330000, 84000),
  row(34, 333000, 84000),
  row(35, 336000, 84000),
  // E3 day 36: Google CPM spikes +40% — revenue dips despite same spend
  row(36, 330000, 84000),
  row(37, 325000, 84000),
  row(38, 322000, 84000),
  row(39, 320000, 84000),
  // E4 visible: TEE-BSC negative margin pulls blended profit down
  row(40, 318000, 84000),
  row(41, 316000, 84000),
  row(42, 348000, 84000), // TEE-PRM Amazon growth partially offsets
  row(43, 350000, 84000),
  row(44, 351000, 84000),
  // Day 45: as-of day
  row(45, 352800, 84000),
];

/* ─── Needs Attention: Court Sneaker (E1) ─────────────────────────────────── */
/* CONTEXT.md §Scenario E1: stock runs out, ROAS stays near 4.8.              */
/* Key insight: high ROAS ≠ keep scaling when inventory cannot support demand. */

export interface AttentionItem {
  id: string;
  name: string;
  sku: string;
  platform: string;
  roas: number;
  marginPct: number;       // displayed as % (margin_rate × 100)
  inventoryUnits: number;
  /** Stock runway in days (units_on_hand / 7-day avg sales) */
  stockRunwayDays: number;
  statusLabel: string;
  statusTrend: Trend;
  /** One-sentence explanation of why this needs attention */
  insight: string;
}

export const attentionItem: AttentionItem = {
  id: "E1",
  name: "Court Sneaker",
  sku: "SNK-01",
  platform: "Meta",
  roas: 4.8,
  marginPct: 45,
  inventoryUnits: 4,
  stockRunwayDays: 0.6,   // < 1 day — forced donor per CONTEXT.md thresholds
  statusLabel: "STOCK RISK",
  statusTrend: "problem",
  insight:
    "High ROAS does not mean we should continue scaling when inventory cannot support demand. With only 4 units remaining (<1 day of stock runway), continuing spend will drive orders that cannot be fulfilled. Budget should be protected.",
};

/* ─── Growth Opportunity: Premium T-Shirt (E5) ────────────────────────────── */
/* CONTEXT.md §Scenario E5: margin 0.61, 450 units, ROAS ~4.1. Receiver.     */
/* The optimizer (Gate G2) will calculate the recommended budget transfer.     */

export interface OpportunityItem {
  id: string;
  name: string;
  sku: string;
  platform: string;
  roas: number;
  marginPct: number;
  inventoryUnits: number;
  statusLabel: string;
  statusTrend: Trend;
  /** Why this is an opportunity (no budget figure — optimizer decides that) */
  insight: string;
}

export const opportunityItem: OpportunityItem = {
  id: "E5",
  name: "Premium T-Shirt",
  sku: "TEE-PRM",
  platform: "Amazon",
  roas: 4.1,
  marginPct: 61,
  inventoryUnits: 450,
  statusLabel: "OPPORTUNITY",
  statusTrend: "good",
  insight:
    "Healthy 61% margin combined with ample stock depth (450 units) and strong 4.1× ROAS. Prime candidate for growth reallocation without risk of stockout. Recommended budget transfer will be generated by the optimizer.",
};
