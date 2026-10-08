# Independent skincare test fixture

Synthetic test data for dataset-independence verification, not merchant records or financial forecasts.

Two products/campaigns across Meta and Google; 35 historical days from 2025-01-05 through 2025-02-08. Inventory decreases by recorded daily unit sales. Final stocks are 1,000 serum units and four cleanser units. The decision, outcome, action, campaign-state and confidence tables begin empty.

Use only in an isolated local test server:

```powershell
$env:DATA_SOURCE='fixtures'
$env:ADAPT_FIXTURE_DIRECTORY='fixtures/skincare'
npm run dev -- --port 3221
```

Then run `node scripts/release-smoke.mjs http://localhost:3221` in another terminal. The smoke script mutates/resets local demo state and refuses non-localhost destinations. All recommendation amounts and outcomes must come from the existing engine. Do not use these inputs as asserted business facts.

For original seed-1 data, remove ADAPT_FIXTURE_DIRECTORY from the server environment. `fixtures/seed-1.json` is a bundle, not a directory.
