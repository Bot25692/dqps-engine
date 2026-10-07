# A.D.A.P.T. final engineering hardening

Date: 2026-10-08. Base: 6f2c08d. Branch: integration-golden-path.

## Defects and corrections

- Completed simulations never reached Repo.saveOutcome. The route now persists an Outcome with stable recommendation-derived ID, three-day predicted/actual contribution profit and percentage-point error.
- Per-request fixture repositories discarded state and exposed different legacy/canonical datasets. A shared process-local runtime uses canonical seed 1 and Builder A analysis. Overview, analysis API, recommendations and Learning read that state. Request-time rendering prevents stale build-time snapshots.
- Client-provided recommendation amounts, enrichment and confidence could influence execution. The server now resolves the saved recommendation and derives inputs from the existing A allocation state. Mismatched submitted plans are rejected.
- Duplicate requests could race writes. Decisions, analysis and reset are serialized. Stable action IDs and outcome existence checks prevent repeat writes. Completed simulation results are retained for a failed-save retry; confidence uses the approval snapshot so retry does not compound it.
- Actual gain formerly covered only receivers while predicted gain covered every changed campaign. M4 now processes signed donor and receiver changes. Realized and baseline revenue are capped by fulfillable units; changed campaigns sharing a SKU use one stock pool.
- Learning reapplied confidence updates starting from already-updated confidence. It now uses the recommendation's approval-time snapshot for history and persisted current confidence for the headline.
- Overview displayed unsupported G1 financial strings. It now derives metrics and chart data from the same Repo snapshot, preserving markup/style.
- Reanalysis could overwrite decided recommendations. It is blocked until Reset Demo.
- Interrupted UI wiring was incomplete; repaired imports, removed client numerical inputs, restored saved workflow state and retry/reset access.
- Existing deterministic simulation test intermittently compared timestamps one millisecond apart. Its clock is fixed locally; every original assertion/test remains.

## Persistence and approval

Only an existing approved recommendation can execute. Pending, rejected, unknown, invalid and failed simulations do not create outcomes. saveOutcome is the completion marker after confidence, execution status and action log writes. Failed outcome writes can retry the cached simulation result, without rerunning it or incrementally updating confidence again. Outcome IDs are stable and the existing Repo upsert semantics are retained. Reset restores fixture baseline, regenerates A analysis and clears approval/action state. No Repo methods or shared domain types were added.

This is not a database transaction: earlier writes may be visible if a later write fails, and a retry completes the operation. Fixture state, action tracking, cached simulation and serialization are process-local. They survive requests in one Node process, not process restarts or independently scaled serverless instances. Live Supabase/distributed transactional behavior was not tested or claimed.

## Beta decision

Fitted beta is integrated by exporting/reusing A's existing allocationState, which already calls fitCurve. No new modeling subsystem or optimizer changes. Example seed-1 values: Court Sneaker 0.9; Premium T-Shirt 0.5914630552880505. The adapter retains [0.4, 0.9] clamping and locked 0.7 fallback for unavailable/nonfinite beta. Historical detection's intentional 0.7 remains unchanged.

## Verification

- npm test -- --reporter=dot: 63/63 passed across three files (32 existing simulation, 20 existing integration, 11 new hardening tests).
- New coverage: successful persistence and exact M5 confidence; rejection; pending/invalid/tampered requests; engine failure; concurrent duplicate simulation; duplicate approval logging; failed-save retry; reset/replay; fitted beta mapping; fallback/clamp; shared-stock depletion/revenue cap.
- npx tsc --noEmit: exit 0, zero errors.
- npm run lint: exit 0, zero errors, two existing warnings: unused buildDefaultEnrichment import in integration.test.ts and unused price in scripts/seed.ts.
- npm run build: successful production build with all dynamic Golden Path routes. .next contains an existing OneDrive reparse/file-lock EPERM; automatic review blocked recursive cleanup. Verification used temporary distDir build/, then restored next.config.ts and tsconfig.json. No configuration change is committed. Default .next rebuild remains subject to the local filesystem lock.
- HTTP smoke on next start port 3217: Overview, recommendations and Learning return 200; run-analysis returns A plan; pending simulation 409; register/approve/simulate succeed; Learning contains saved actual outcome; analysis reflects executed status; duplicate simulation and reanalysis return 409; reject creates no outcome; reset clears Learning; same-seed replay matches. Server stopped after test. This was an HTTP/server-rendered smoke, not browser click automation.
- Smoke seed 42: predicted 3-day gain INR 25548.787717579573; actual Simulated INR 74505.17; error 191.61919862340312%; accuracy 0; confidence 0.75 -> 0.67. Values are engine results; large error is displayed honestly.
- Real A moves: Court Sneaker 30000 -> 8800; Premium T-Shirt 25000 -> 35000; bag Meta 4000 -> 5500; hoodie 12000 -> 16500; jogger 10000 -> 14000. No amounts are hardcoded into UI.
- Isolation tests pass; lib/analysis, optimizer logic, lib/types.ts, dependencies and protected branches are unchanged.

## Changed files

- CONTEXT.md (status only)
- app/api/analysis/route.ts
- app/api/decide/route.ts
- app/api/run-analysis/route.ts
- app/learning/page.tsx
- app/page.tsx
- app/recommendations/page.tsx
- components/learning/learning-view.tsx
- components/recommendations/recommendation-detail.tsx
- lib/db/runtime-repo.ts (new shared runtime; existing Repo interface)
- lib/demo/overview-data.ts (new computed presentation data)
- lib/integration/adapter.ts
- lib/integration/__tests__/hardening.test.ts (new)
- lib/run-analysis.ts (export existing allocationState only)
- lib/simulation/boundary.ts
- lib/simulation/engine.ts
- lib/simulation/types.ts (B-only signed-change/shared-stock metadata)
- lib/simulation/__tests__/simulation.test.ts (clock stabilization only)
- ADAPT-hardening-report.md (this report)

## Remaining limitations

No blocker found for the verified single-process fixture demo. Cross-instance durable execution requires transactional/distributed coordination and verification of the existing Supabase deployment; this scope did not introduce that infrastructure. The simulation models changed campaigns; unchanged campaigns' competing SKU demand is not separately simulated. The fixture prediction and hidden stock-constrained outcome can differ substantially, as this smoke demonstrates. Default local build output remains affected by a OneDrive filesystem lock; production compilation itself was verified in alternate output. No UI redesign, new dependencies, LLM work or numerical guardrail changes.
