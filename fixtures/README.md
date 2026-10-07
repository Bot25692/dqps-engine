Fixed, hand-authored demo data for September 1–20, 2026 (INR).

Three campaigns and three SKUs have one metric/inventory row per day. Court Sneaker sells its final five units on day 20; historical ROAS remains 4.8. Hoodie CTR drops 40% on day 20, yielding the single anomaly. The pending recommendation reallocates the sneaker budget to Premium Tee. Stock-protection profit assumes no future sneaker revenue during the stockout; receiver revenue uses beta 0.7. Logs and outcomes start empty because approval has not happened.

All JSON files contain arrays validated by the schemas in lib/types.ts. Driver contribution_pct, anomaly change_pct, and outcome error_pct use percentage points; margin_rate and confidence use fractions. Budgets and profit are INR. Move entries express before/after campaign budgets.

FixtureRepo accepts an optional fixture directory. Saves upsert by record ID (campaign state by campaign ID, confidence by recommendation type); action logs append with unique IDs. Changes are instance-local and in memory. resetDecisions restores the original seed, including the pending recommendation and empty logs/outcomes. Date filters are inclusive. Missing state/confidence returns null.

Run `pnpm typecheck` and `pnpm test` with Node 24 after `pnpm install`.

## Generated 45-day scenarios

Run from the repository with Node 24 (no added dependencies):

```powershell
node --experimental-strip-types scripts/seed.ts --seed 1 --out json
1..6 | ForEach-Object { node --experimental-strip-types scripts/seed.ts --seed $_ --out json }
node --experimental-strip-types scripts/check-seed.ts
node --experimental-strip-types --test tests/*.test.ts
```

`--seed` defaults to 1 (unsigned 32-bit integer); `--out` defaults to `json`.
Each `seed-N.json` contains all ten table arrays plus INR product prices, hidden
campaign truth, opening stock and planted event metadata. Existing table fixtures
are preserved. These bundled files are not automatically selected by FixtureRepo,
which continues to load its per-table JSON files.

Dates are fixed at August 24–October 7, 2026, independent of the system clock.
The generator uses Mulberry32, uniform +/-15% spend variation, a fixed weekday
pattern bounded by +/-10%, and uniform +/-6% revenue noise. Each campaign gets a
beta in [0.55, 0.8]. CTR and CPM determine impressions/clicks; CVR reconciles the
return curve with price-based AOV. Count rounding makes realized AOV slightly
variable. Hoodie CTR compounds down by 2.3% daily from day 22 (about 2%): exactly
2% would leave its day-45 rolling fatigue ratio around 0.775, missing the 0.75 rule.
Google CPM increases exactly 40% from day 36 on both Google campaigns.

Inventory snapshots are end-of-day. Opening stock funds all sales; there are no
restocks. Sneakers sell out on day 45 with ROAS near 4.8 and revenue bounded by
opening stock times price. Premium ends day 45 with 900 units (user-approved increase from 450). E1's manifest
start day is the actual stockout; low-runway warnings can occur earlier. E3 has a
manifest row for each affected campaign. Root `planted_events.json` describes the
most recent run; each seed file embeds its own manifest so runs do not lose labels.

**E5 receiver stock:** The user approved increasing Premium's final stock from
450 to 900 units so it can receive budget. Opening inventory increases accordingly;
sales, price, margin, budget and ROAS remain unchanged. The checker requires at least
7 days of stock after a full +40% budget uplift, using the fitted beta ceiling of
0.9 and the larger demand projection from the trailing 7-day sales average or the
latest day's revenue/spend anchor. This is a conservative eligibility check.
The checker evaluates independent event thresholds; there are no production
analysis detectors in this repository yet.

Database mode requires server environment variables `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, then `--out db`. The dedicated SeedRepo upserts six
source/state tables in FK order via PostgREST with a 3-second timeout per request.
It preserves unrelated rows and decisions. Writes are not one transaction; an
error identifies the failed table, and a rerun retries idempotently. Prices and
hidden truth stay in JSON metadata because the locked SQL/type contract has no
columns for them. JSON mode never imports this adapter or contacts Supabase.
Live database seeding has not been exercised; repository requests are mock-tested.

