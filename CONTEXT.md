# A.D.A.P.T. (Advertising Decision Automation for Profitable Targeting)

DataQuest 3.0. Problem: DQPS. Expansion is unconfirmed.

## What it does
- Autonomous D2C advertising decision engine.
- Unifies ad, sales, margin, and stock data.
- Detects performance shifts and diagnoses probable causes.
- Recommends profit-aware budget moves under stock constraints.
- Explains decisions in plain English and learns from outcomes.
- Ad data is simulated. No real ad APIs.
- Decision logic is in ALGORITHM.md. Follow it. From the v3 reference,
  add ONLY: total-sales runway, diminishing returns, four-factor ROAS
  breakdown, cause-to-action matrix, approval tiers. Nothing else.

## Stack
- Use only the stack listed here.
- Next.js + TypeScript. All application logic stays inside Next.js.
- UI: Tailwind + shadcn/ui. Charts: Recharts. Validation: zod.
- Supabase Postgres stores all data. Vercel hosts the application.
- Anomalies: rolling z-score rules. Isolation Forest only if the team
  agrees later.
- Budget optimiser: greedy reallocation by marginal return, from
  ALGORITHM.md. No solver library.
- LLM: Google AI Studio (Gemini) through an OpenAI-compatible client.
- LLM settings: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.

## Tables and columns
- campaigns: campaign_id, platform, name, audience_segment, daily_budget
- skus: sku_id, product_name, price, margin_pct
- ad_metrics_daily: date, campaign_id, sku_id, spend, impressions,
  clicks, conversions, revenue
- inventory_daily: date, sku_id, stock_level, units_sold
  (units_sold = total orders across ALL channels)
- anomalies: id, date, campaign_id, sku_id, metric, value, baseline,
  change_pct, severity, cause, confidence, evidence (json)
- recommendations: id, campaign_id, sku_id, action, previous_budget,
  new_budget, projected_profit_gain, confidence, reason, status,
  tier, p5_gain, p50_gain, p95_gain, priority
- action_log: id, recommendation_id, approved_at, predicted_gain
- outcomes: id, action_id, actual_gain, error, old_confidence,
  new_confidence
- model_state: platform, b0, bias, history_factor (json)
- View: unified_daily (all of the above joined on sku_id + date)

## Rules
- Every number shown comes from our code, never from the LLM.
- margin_pct is a number from 0 to 100 (40 means 40%).
- Rank recommendations by profit, not revenue.
- Never increase budget for a SKU with under 7 days of stock.
- Maximum budget increase per campaign per day: 50%.
- Runway uses inventory_daily.units_sold, never the sum of platform
  conversions (platforms double-count orders).
- Projected gain uses diminishing returns:
  revenue_new = revenue_old * (spend_new / spend_old) ^ 0.65
  profit_change = (margin_pct/100) * (revenue_new - revenue_old)
                  - (spend_new - spend_old)
- Currency: INR (₹).
- Colours: green good, red problem, amber warning.
- Add a plain-English comment above every major function.
- Do one small job at a time, each with a test using planted events.
- Shared types live in lib/types.ts. Do not change them without
  telling the group chat first.
- Secret keys stay in server code and environment settings.
- Never commit environment secrets. .env.example has placeholders only.
- Before suggesting any new library, say why it is needed, its size
  and serverless implications, and ask first.
- Update Current status after each step.

## Current status
- Created .env.example with six required variables and usage comments.
- Created .gitignore; environment files are ignored except .env.example.
- Created scripts/check-env.mjs for variable and Supabase access checks.
- Verified missing-variable failures. Live Supabase access is untested.
- Credentials are not configured. Application and database are not
  implemented.
- Created this context file and ALGORITHM.md.
- Still undecided: name expansion. Next: lib/types.ts, sample data,
  and each member's module.