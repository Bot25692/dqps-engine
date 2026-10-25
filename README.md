# A.D.A.P.T. — Advertising Decision Automation for Profitable Targeting

> An autonomous decision engine that tells D2C brands **where to move their ad budget to earn more profit**, explains why, waits for human approval, simulates the result, and learns from it.

Built by **Team M.A.R.K.A.N.** for the DQPS problem statement. Licensed under [MIT](./LICENSE).

- Problem statement: [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md)
- Deployment and run guide: [DEPLOYMENT.md](./DEPLOYMENT.md)

## The problem in one paragraph

D2C marketers split daily ad budgets across Meta, Google, TikTok and Amazon using ROAS dashboards. ROAS ignores margin and stock, so budget keeps flowing to products that are nearly sold out or that lose money at the margin. A.D.A.P.T. unifies ad, sales, margin and inventory data and optimises **contribution profit**, not ROAS.

## What it does

| Stage | What happens |
|---|---|
| **Detect** | Flags adverse performance shifts (median + scaled-MAD z-scores) and creative fatigue (5-day CTR vs. a prior baseline). |
| **Diagnose** | Splits a ROAS change into CTR, CVR, AOV and CPM drivers using `ROAS = CTR × CVR × AOV × 1000 / CPM`. Stock risk is listed first whenever cover is under 5 days. |
| **Decide** | Reallocates budget toward the highest marginal profit per rupee, subject to guardrails. |
| **Approve** | A human approves or rejects. Every decision is logged. |
| **Simulate** | A 3-day hidden-world simulation (noise, 1-day ramp, stock limits) produces an "actual" result. |
| **Learn** | Prediction error updates the confidence of future recommendations. |

### Guardrails (enforced in code and tests)

- Contribution profit = `revenue × margin_rate − ad spend`. Break-even ROAS = `1 / margin_rate` per SKU.
- Stock under 5 days of cover is a warning. Under 3 days the campaign is a forced donor. Receivers must keep 7 days of cover after projected uplift.
- Receiver cap +40% of daily budget. Donor cap −30% (up to −100% when stock-forced). Each platform keeps at least 60% of its current spend.
- Total budget is conserved. Money with no profitable home is held back.
- A move is recommended only if the expected gain is at least ₹300/day, with at most 5 moves per plan.
- `lib/analysis` is pure (arrays in, arrays out) and must never import `lib/simulation`. A test enforces this.

## Demo result (seeded dataset, as-of 2026-10-07)

Seeded D2C apparel brand: 4 platforms, 8 SKUs, 10 campaigns, 45 days. The engine produces one plan with five moves:

| Campaign | Daily budget (₹) | Reason |
|---|---|---|
| Court Sneaker (Meta) | 30,000 → 8,800 | Stock cover below 3 days. High ROAS is irrelevant if units are gone. |
| Premium T-Shirt (Amazon) | 25,000 → 35,000 | 61% margin, stock cover is healthy. |
| Everyday Hoodie (Meta) | 12,000 → 16,500 | Positive marginal profit, enough stock. |
| Jogger (Google) | 10,000 → 14,000 | Positive marginal profit, enough stock. |
| Bag (Meta) | 4,000 → 5,500 | Positive marginal profit, enough stock. |

Expected gain is **₹8,516 per day**, with ₹1,200 held back because it had no profitable home.

After approval, the simulation runs. In the smoke test (seed 42) it predicted a 3-day gain of ₹25,549, the simulated outcome was ₹74,505, and the large error (191.6%) correctly lowered model confidence from 0.75 to 0.67. We show this honestly rather than tuning it away.

## Tech stack

Next.js (App Router) + TypeScript · Tailwind CSS · Recharts · Zod · Vitest · Supabase Postgres (optional) · Vercel.

All logic runs in API routes and pure TypeScript functions. There is no Python service and no external solver.

## Quick start

**Requirements:** Node.js 20 or newer (tested on 22) and npm. Internet access at build time (fonts load from Google Fonts).

```bash
git clone https://github.com/Bot25692/dqps-engine.git
cd dqps-engine
npm ci
cp .env.example .env.local      # defaults to DATA_SOURCE=fixtures, so no database needed
npm run dev
```

Open http://localhost:3000.

## Usage (the golden path)

1. **Overview** (`/`): KPIs, 30-day portfolio chart, and the campaigns that need attention (stock risk, growth opportunities).
2. **Recommendations** (`/recommendations`): click **Run Analysis**. Review the evidence, root cause, and proposed moves with guardrails checked.
3. Click **Approve & Proceed**, then **Simulate** to see predicted vs. simulated 3-day profit.
4. **Learning** (`/learning`): see the saved outcome and the updated confidence.
5. **Reset / Replay** at any time to start over. The same seed always replays the same result.

### API

| Endpoint | Purpose |
|---|---|
| `POST /api/run-analysis` | Runs detect → diagnose → decide and returns the top recommendation. If `DEMO_ADMIN_TOKEN` is set, send header `x-demo-token`. |
| `POST /api/decide` | Body `{ "recommendationId", "action", "seed" }` where `action` is `register`, `approve`, `reject`, `simulate` or `reset`. |
| `GET /api/analysis` | Returns the current analysis state. |

## Testing

```bash
npm test                 # 86 tests (Vitest)
npx tsc --noEmit         # type check
npm run lint

# End-to-end HTTP smoke test (start the app first; localhost only, resets demo state)
npm run dev -- --port 3220
node scripts/release-smoke.mjs http://localhost:3220
```

## Project structure

```
app/                  Pages (overview, campaigns, recommendations, learning) and API routes
components/           UI components
lib/analysis/         Pure functions: detect.ts, rootcause.ts, optimize.ts
lib/simulation/       Seeded simulator and human-approval state machine
lib/integration/      Adapters, confidence update, presentation
lib/db/               Repo interface: fixtures and Supabase implementations
lib/types.ts          The shared data contract
fixtures/             Seeded demo data (seed-1 default; skincare = independent test dataset)
supabase/             001_schema.sql, 002_reset.sql
scripts/              seed.ts (data generator), release-smoke.mjs
```

## Limitations (stated plainly)

- Ad data and execution are **simulated**. No real ad-platform APIs are connected.
- In fixtures mode, demo state is **process-local**. It survives requests within one Node process, but not restarts or multiple serverless instances. See [DEPLOYMENT.md](./DEPLOYMENT.md).
- Live Supabase mode is implemented but has not been verified under distributed load.
- Explanations are generated from templates by deterministic code. No language model is used.

## License

[MIT](./LICENSE) © 2026 Team M.A.R.K.A.N.
