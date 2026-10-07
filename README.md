Fixed, hand-authored demo data for September 1–20, 2026 (INR).

Three campaigns and three SKUs have one metric/inventory row per day. Court Sneaker sells its final five units on day 20; historical ROAS remains 4.8. Hoodie CTR drops 40% on day 20, yielding the single anomaly. The pending recommendation reallocates the sneaker budget to Premium Tee. Stock-protection profit assumes no future sneaker revenue during the stockout; receiver revenue uses beta 0.7. Logs and outcomes start empty because approval has not happened.

All JSON files contain arrays validated by the schemas in lib/types.ts. Driver contribution_pct, anomaly change_pct, and outcome error_pct use percentage points; margin_rate and confidence use fractions. Budgets and profit are INR. Move entries express before/after campaign budgets.

FixtureRepo accepts an optional fixture directory. Saves upsert by record ID (campaign state by campaign ID, confidence by recommendation type); action logs append with unique IDs. Changes are instance-local and in memory. resetDecisions restores the original seed, including the pending recommendation and empty logs/outcomes. Date filters are inclusive. Missing state/confidence returns null.

Run `pnpm typecheck` and `pnpm test` with Node 24 after `pnpm install`.
