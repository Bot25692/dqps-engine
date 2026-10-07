/* ─── Overview fixture data ───────────────────────────────────────────────── */
/* Static placeholder values for Gate G0 UI shell only.                        */
/* These will be replaced by Builder A's FixtureRepo / SupabaseRepo data.      */
/* NEVER import this file from lib/analysis — analysis functions are pure.     */

export const overviewStats = [
  {
    label: "Total Daily Spend",
    value: "₹84,000",
    change: "Across 4 platforms",
    trend: "neutral" as const,
  },
  {
    label: "Blended ROAS",
    value: "4.2×",
    change: "Break-even: 1.64× (margin 61%)",
    trend: "good" as const,
  },
  {
    label: "Contribution Profit",
    value: "₹2,18,500",
    change: "Revenue × margin − spend",
    trend: "good" as const,
  },
  {
    label: "Anomalies Detected",
    value: "3",
    change: "2 warnings · 1 critical",
    trend: "problem" as const,
  },
] as const;

export const platformSummary = [
  { platform: "Meta", spend: 32000, roas: 4.8, runway: 12 },
  { platform: "Google", spend: 28000, roas: 3.9, runway: 7 },
  { platform: "TikTok", spend: 14000, roas: 3.2, runway: 4 },
  { platform: "Amazon", spend: 10000, roas: 5.1, runway: 18 },
] as const;
