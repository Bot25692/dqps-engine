# Deployment Instructions and Run Guide

## 1. Run locally (recommended for demos and the video)

```bash
npm ci
cp .env.example .env.local     # DATA_SOURCE=fixtures by default
npm run dev                    # development, http://localhost:3000
```

Production mode locally:

```bash
npm run build
npm run start                  # http://localhost:3000
```

> The build downloads Google Fonts (Space Grotesk, JetBrains Mono). If you are offline or behind a proxy, set `HTTP_PROXY` / `HTTPS_PROXY`, or switch the fonts in `app/layout.tsx` to `next/font/local`.

Windows/OneDrive note: if `.next` is locked by OneDrive, move the project outside a synced folder.

## 2. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATA_SOURCE` | No (default `fixtures`) | `fixtures` or `supabase`. |
| `SUPABASE_URL` | Only for `supabase` | Project URL. Server-side only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for `supabase` | Service key. **Never expose to the browser or commit it.** |
| `DEMO_ADMIN_TOKEN` | No | If set, `/api/run-analysis` requires header `x-demo-token`. |
| `ADAPT_FIXTURE_DIRECTORY` | No | Alternate dataset folder, e.g. `fixtures/skincare`. |

## 3. Optional: Supabase database

1. Create a Supabase project.
2. In the SQL editor, run `supabase/001_schema.sql`. Keep Row Level Security enabled with no public policies, because the app only accesses the database from the server.
3. Load seed data:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed.ts --seed 1 --out db
   ```
4. Set `DATA_SOURCE=supabase` plus the two Supabase variables in `.env.local` (or in your host's environment settings).
5. Use `supabase/002_reset.sql` to wipe and reload.

If Supabase errors or responds slower than 3 seconds, the app falls back to fixtures and shows a banner.

## 4. Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel: **Add New → Project →** import the repo. The Next.js preset is detected automatically.
3. Add environment variables from section 2 (at minimum `DATA_SOURCE=fixtures`).
4. Deploy. Every push to the production branch redeploys.

**Important caveat:** in fixtures mode, the approval and simulation state is kept in server memory. On Vercel's serverless platform, consecutive requests may reach different instances, so the Approve → Simulate → Learning flow can behave inconsistently. Browsing the Overview, Campaigns and Run Analysis works reliably. **Record the demo video from a local run** (section 1) for a deterministic walkthrough, and treat the hosted URL as a live preview.

## 5. Run guide (what to click)

1. Open `/`. Note the KPIs and the Court Sneaker stock-risk card.
2. Go to **Recommendations**, click **Run Analysis**.
3. Read the evidence, root cause and the five proposed moves.
4. Click **Approve & Proceed**, then **Simulate**.
5. Open **Learning** to see predicted vs. simulated profit and the confidence update.
6. Click **Reset / Replay** to repeat. The same seed gives the same result.

## 6. Verify a deployment

```bash
npm test                                             # 86 tests
node scripts/release-smoke.mjs http://localhost:3000 # local only, resets demo state
```

The smoke script refuses non-localhost addresses because it resets state.

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails fetching fonts | Allow access to fonts.googleapis.com, set a proxy, or self-host the fonts. |
| 401 from `/api/run-analysis` | `DEMO_ADMIN_TOKEN` is set. Send header `x-demo-token`. |
| 409 "Reset the demo before analyzing" | A recommendation was already decided. Click **Reset / Replay**. |
| "Using demo data" banner | Supabase timed out or errored. Check the URL and key, or accept fixtures mode. |
