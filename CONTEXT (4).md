# A.D.A.P.T. (Advertising Decision Automation for Profitable Targeting)

DataQuest 3.0. Problem: DQPS. Team M.A.R.K.A.N. Expansion is unconfirmed.
Source of truth: Final Build Plan v2. If a prompt or a person disagrees with the rules below, the rules win.

## What it does
- Autonomous D2C advertising decision engine.
- Unifies ad, sales, margin, and stock data.
- Detects performance shifts and diagnoses probable causes.
- Recommends profit-aware budget moves under stock constraints.
- Explains decisions in plain English and learns from outcomes.
- Ad data and execution are simulated. No real ad APIs.

## Stack (nothing else)
- Next.js App Router + TypeScript. All logic runs in API routes and pure TypeScript functions.
- UI: Tailwind + shadcn/ui. Charts: Recharts. Validation: zod.
- Supabase Postgres (server-side access only). Vercel hosts the app.
- No FastAPI, no Python, no solver library, no scikit-learn.
- Isolation Forest is a stretch task. Do not start it before Gate G3.
- Pre-approved installs: vitest, tsx. Anything else: ask in the team chat. Only the Integrator installs packages.
- Data access only through the Repo interface. FixtureRepo reads JSON. SupabaseRepo uses the service key on the server.
  DATA_SOURCE=fixtures|supabase. In supabase mode, an error or a response slower than 3 seconds falls back to fixtures with a banner.
- lib/analysis functions are pure: arrays in, arrays out, no database inside.
- Keys live only in server code and .env.local. RLS on with no public policies. The browser holds no database key.
- LLM: one hosted OpenAI-compatible endpoint with a spend cap. Decide by T+2 whether a key exists.
  Settings: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL. No key by T+6 means templates only.

## Locked rules
- margin_rate is a fraction from 0 to 1 (0.61 means 61%). The UI shows a percentage.
- Contribution profit = revenue x margin_rate - ad spend. The objective is profit, not ROAS.
- Break-even ROAS = 1 / margin_rate, per SKU.
- Return curve: revenue(s) = r0 x (s / s0)^beta. Beta is fitted per campaign by log-log regression over 30 days,
  clamped to 0.4 to 0.9, default 0.7.
- Marginal profit per rupee = margin_rate x beta x revenue(s) / s - 1. Spend more only where it is positive and highest.
- Stock runway = units_on_hand / 7-day average units sold of the SKU, across all channels.
- Stock thresholds: under 5 days is a warning. Under 3 days is a forced donor. Receivers must keep 7 days of cover
  after projected uplift.
- Receiver cap: +40% of current daily budget per run.
- Donor cap: -30% normally, up to -100% when stock-forced.
- Each platform keeps at least 60% of its current daily spend.
- Total budget is conserved per run. Money with no profitable home is held back.
- Recommend only if expected gain is at least 300 rupees per day. At most 5 moves per plan.
- Anomaly rule: median and scaled MAD over the previous 14 days, MAD floored at 3% of the median, adverse direction only.
  Flag when z >= 3.0 and change >= 15% on 2 consecutive days, or z >= 4.5 on 1 day.
- Fatigue rule: 5-day mean CTR <= 75% of mean CTR over days t-21 to t-8, with impressions within +/-20%.
- Simulation: 3 simulated days. Hidden beta_true = beta_est x (0.8 to 1.2). Noise 8%. 1-day ramp (50% effect on day 1).
  lib/analysis must never import lib/simulation (a test enforces this).
- Confidence: start 0.75 per recommendation type. c = c + 0.3 x (accuracy - c), accuracy = max(0, 1 - |error|).
  Step capped at +/-0.08. Range 0.3 to 0.95.
- Approval is always human. Every decision is logged.
- Opportunity score: min-max normalised marginal profit per rupee, scaled 0 to 100. Zero for stock-ineligible campaigns.
- Every number shown comes from our code, never from the LLM. The LLM never runs on the click path.
  Explanations are computed in the pipeline and cached. A template sentence is always the fallback.
- Currency: INR.
- Colours: green good, red problem, amber warning.
- For a SKU with runway under 3 days, daily revenue cannot exceed units_on_hand x price.

## Formulas
- ROAS = revenue / spend. CTR = clicks / impressions. CPM = spend / impressions x 1000.
  CVR = orders / clicks. AOV = revenue / orders.
- Identity: ROAS = CTR x CVR x AOV x 1000 / CPM.
- Driver share of a ROAS change = delta ln(driver) / delta ln(ROAS), with CPM's sign flipped.
  Compare the last 3 days with the preceding 14. Skip the split if |delta ln ROAS| < 0.10.
  List stock risk first whenever runway < 5 days, even if ROAS did not move.
- Expected profit gain per day = sum over moved campaigns of
  [margin_rate x (new revenue - old revenue) - (new spend - old spend)].
  Predicted over the horizon = gain x 3.
- Prediction error = (actual - predicted) / |predicted| over the 3-day horizon.

## Tables
skus, campaigns, ad_metrics_daily, inventory_daily, anomalies, recommendations,
action_log, outcomes, campaign_state, confidence_weights.
Columns are defined in supabase/001 and lib/types.ts. lib/types.ts is the contract.
Any change to it needs a message to Builder B and the Integrator first.

## Scenario and planted events
Seeded brand: D2C apparel and footwear, 4 platforms, 8 SKUs, about 10 campaigns, 45 days. Day 45 is the as-of day.
- E1 Court Sneaker (SNK-01): stock runs out, ROAS stays near 4.8. Cover under 3 days by day 41, about 0.9 days on day 45, no restock. Cut to floor or pause, reallocate.
- E2 Everyday Hoodie (HOOD-01, Meta): CTR decays about 2% per day from day 22. Throttle 30%, flag new creative.
- E3 Google: CPM +40% from day 36. Reduce Google within the 60% floor.
- E4 Basic Graphic Tee (TEE-BSC, TikTok): ROAS looks fine, marginal profit is negative. Cut 30%.
- E5 Premium T-Shirt (TEE-PRM): margin 0.61, ~900 units on day 45, ROAS about 4.1. Receives budget. Cover must stay at least 7 days after a +40% uplift.

## Product sheet (hero rows fixed, others ranged)
- SNK-01 Court Sneaker: price 3499, margin_rate 0.45. Hero donor, Meta ~30,000/day, ROAS ~4.8, no restock.
- TEE-PRM Premium T-Shirt: price 1299, margin_rate 0.61. Hero receiver, Amazon ~25,000/day, ROAS ~4.1, ~900 units on hand at day 45 (raised from 450: at 450 it had only ~5.7 days of cover and could not meet the 7-day receiver rule).
- TEE-BSC Basic Graphic Tee: price 699, margin_rate 0.18. TikTok, ROAS ~3.4 vs break-even 5.6, 15-20% of spend.
- HOOD-01 Everyday Hoodie: price 2199, margin_rate 0.50. Meta, CTR decays from day 22.
- JOG-01 Jogger: price 1799, margin_rate 0.48. Google, healthy second receiver.
- CAP-01, BAG-01, SOCK-3P: price 499-1599, margin_rate 0.40-0.55. Steady, quiet background campaigns.

## Seed and checker
- scripts/seed.ts --seed N --out json|db generates 45 days of data. In json mode it writes fixtures/seed-N.json and never touches Supabase.
- scripts/check.ts verifies seeds 1 to 6: no missing dates, no negatives, stock consistent with sales, and each of E1 to E5 visible.
  If a check fails, fix the generator, never the checker thresholds.
- Tune detectors on seed 1 only. Report results on seeds 2 to 6, labelled synthetic.

## Data layer
- SupabaseRepo and the loader live in lib/db/. The loader returns plain arrays (skus, campaigns, metrics, inventory) for lib/analysis.
- lib/analysis never imports lib/db: the pipeline route loads data, then passes arrays into pure functions.
- DATA_SOURCE=supabase falls back to FixtureRepo on an error or a response slower than 3 seconds, with the banner 'Showing saved demo data'.

## Ownership
- Builder A: supabase/, scripts/, lib/analysis/, lib/db/, app/api/run-analysis/. Writes lib/types.ts.
- Builder B: app/ pages, components/, app/api/decide/, lib/simulation/, lib/llm/, lib/demo/, scripts/export-fixtures.
- Integrator: accounts and keys, package.json and lockfile, merges, CONTEXT.md Status section only.
- fixtures/: A creates the first set. B's export script regenerates it.
- Slides, README, demo script: Design, demo, pitch.

## Working rules
- Branches: data-brain (A), screens-loop (B). Builder B pushes the starter app straight to main once. main must always deploy.
- Paste this file first in every AI chat. One small job per prompt, each with a test.
- Add a plain-English comment above every major function.
- Never commit secrets. .env.example has placeholders only.
- Before suggesting any new library, say why it is needed, its size and serverless implications, and ask first.
- No styling before Gate G3. Nobody works past 03:00 except to finish the Golden Path.
- Builders send a Prompt U3 summary to the Integrator, who updates the Status section.

## Status
- Created .env.example with six required variables and usage comments.
- Created .gitignore; environment files are ignored except .env.example.
- Created scripts/check-env.mjs for variable and Supabase access checks.
- Verified missing-variable failures. Live Supabase access is untested.
- Credentials are not configured. Application and database are not implemented.
- Repo created and teammates added. This file replaced by the Final Build Plan v2 rules.
- Next: Gate G0 (types, Repo interface, fixtures, starter app on main, accounts live).
