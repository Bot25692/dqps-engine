# ALGORITHM.md: A.D.A.P.T. Decision Engine (MVP)

DataQuest 3.0, problem DQPS. This is the single source of truth for decision logic.
Grain is **daily**. Money is **INR (₹)**. Follow `CONTEXT.md` for stack and rules.

**Built from:** the team's original 5-phase algorithm (v2) plus exactly five ideas from the v3 reference:
1. Runway from **total** sales (not summed platform conversions)
2. **Diminishing returns** for every profit projection
3. **Four-factor ROAS breakdown** to explain *why* ROAS moved
4. **Cause-to-action matrix** (different causes need different actions)
5. **Approval tiers**

Nothing else from v3 is in scope (see section 16).

**Who owns what**

| File | Owner | Phases |
|---|---|---|
| `lib/metrics.ts` | Member 3 | 1 |
| `lib/detect.ts` | Member 3 | 2 |
| `lib/diagnose.ts` | Member 3 | 3, 4 |
| `lib/recommend.ts` | Member 4 | 5, 6, 7, 8, 9 |
| `lib/explain.ts`, `lib/learn.ts` | Member 6 | 10, 11 |

---

## 0. Notation

| Symbol | Meaning |
|---|---|
| S | daily ad spend of a campaign (₹/day) |
| R | daily revenue of a campaign (₹/day) |
| m | `margin_pct / 100` (margin_pct is 0 to 100) |
| b | spend elasticity of revenue, starts at **0.65** per platform |
| MM | marginal profit multiplier: profit earned by the next rupee. **1.0 = break-even** |
| runway | days of stock left at current total sales speed |

## 1. Constants

```
WINDOW_DAYS            = 7      # recent window for metrics
BASELINE_DAYS          = 14     # baseline window for detection
Z_CRIT                 = 2.5
MIN_EFFECT_PCT         = 15
MIN_CONVERSIONS_7D     = 30     # no discretionary cut/scale below this
PERSISTENCE_DAYS       = 2

SAFETY_STOCK_UNITS     = 5
CRITICAL_RUNWAY_DAYS   = 3      # stock-protection trigger
MIN_SCALE_RUNWAY_DAYS  = 7      # CONTEXT rule: never scale under 7 days of stock
MIN_SCALE_MARGIN_PCT   = 30

ELASTICITY_B0          = 0.65   # per platform, learned (section 13)
ELASTICITY_BOUNDS      = [0.30, 0.90]
SCALE_MM               = 1.10   # scale only if next rupee returns >= 1.10x
CUT_MM                 = 1.00   # cut if next rupee returns < 1.00x
MAX_INCREASE_PCT       = 50     # CONTEXT rule
MAX_CUT_PCT            = 50     # discretionary cuts only
PAUSE_CUT              = 1.00
THROTTLE_CUT           = 0.70

PROJECTION_DAYS        = 7
MC_SAMPLES             = 200
WEIGHT_MARGIN=35  WEIGHT_EFFICIENCY=40  WEIGHT_RUNWAY=25
```

---

## 2. Inputs and outputs

**Inputs** (tables from `CONTEXT.md`): `campaigns`, `skus`, `ad_metrics_daily`, `inventory_daily`.

**Outputs:** `unified_daily` rows with metrics, `anomalies` (with cause, confidence, evidence),
`recommendations`, `action_log`, `outcomes`, and a KPI summary.

---

## 3. Phase 1: Unify and compute economics

```
FOR EACH campaign c, FOR EACH day d:
    join ad_metrics_daily + skus + inventory_daily ON sku_id, date
    ROAS      = IF spend > 0 THEN revenue / spend ELSE 0
    m         = margin_pct / 100
    BE_ROAS   = IF m > 0 THEN 1 / m ELSE 999          # break-even ROAS
    NetProfit = revenue * m - spend
    CTR = clicks / impressions        CVR = conversions / clicks
    AOV = revenue / conversions       CPM = 1000 * spend / impressions
    CPA = spend / conversions
    (use safe division: any zero denominator gives 0, never an error)
```

**Runway per SKU (idea 1: total sales, not platform conversions)**

```
FOR EACH sku s on day d:
    avg_daily_units = MAX( MEAN(inventory_daily.units_sold, last 7 days), 0.1 )
    usable_stock    = MAX( stock_level - SAFETY_STOCK_UNITS, 0 )
    runway_days     = usable_stock / avg_daily_units
```

`units_sold` is the total across all channels. Never use the sum of platform conversions: Meta and
Google both claim the same order, which would double-count sales and halve the runway.

**Campaign vector (7-day window, ratio of sums, not mean of ratios)**

```
S = SUM(spend)/7    R = SUM(revenue)/7    ROAS = R / S
MM0 = b * ROAS * m                  # marginal multiplier at current spend
Opportunity_Score = WEIGHT_MARGIN     * m
                  + WEIGHT_EFFICIENCY * MIN(1, ROAS / (2 * BE_ROAS))
                  + WEIGHT_RUNWAY     * MIN(1, runway_days / 14)
```

Opportunity_Score is for display and tie-breaking. Scale decisions use MM.

---

## 4. Phase 2: Detect anomalies

```
FOR EACH campaign c AND metric IN [ROAS, CVR, CPA]:
    baseline = the BASELINE_DAYS before the day, EXCLUDING the day itself (shift by 1)
    z        = (value_today - mean(baseline)) / std(baseline)    # need >= 7 baseline days
    change   = (value_today - mean(baseline)) / mean(baseline) * 100

    FLAG a day IF
        (metric is ROAS or CVR AND z <= -Z_CRIT) OR (metric is CPA AND z >= +Z_CRIT)
        AND ABS(change) >= MIN_EFFECT_PCT
        AND flagged on PERSISTENCE_DAYS consecutive days

FAST PATH (no persistence needed):
    stock_level == 0 AND spend > 0          -> flag as HARD_STOCKOUT
    runway_days <= CRITICAL_RUNWAY_DAYS     -> flag as LOW_STOCK
```

Merge consecutive flagged days into one **event** (start date, end date) so the UI shows one alert per problem.

Severity: `|z| >= 4` high, `>= 3` medium, otherwise low. Hard stockout is always critical.

---

## 5. Phase 3: Explain why (idea 3: four-factor breakdown)

ROAS is exactly the product of four things:

```
ROAS = CTR * CVR * AOV * 1000 / CPM
```

For each anomaly, compare `now` (last 3 days) with `base` (the BASELINE_DAYS before), using ratio of sums:

```
d_CTR = LN(CTR_now / CTR_base)
d_CVR = LN(CVR_now / CVR_base)
d_AOV = LN(AOV_now / AOV_base)
d_CPM = -LN(CPM_now / CPM_base)          # higher cost hurts ROAS
Total = d_CTR + d_CVR + d_AOV + d_CPM    # equals LN(ROAS_now / ROAS_base), exactly

Factor_Share[k] = d_k / Total
```

Factors whose sign matches `Total` are **drivers**. Factors with the opposite sign are **offsets**.
Report the top 2 or 3 drivers, for example:
*"ROAS fell 41%: conversion 60%, creative CTR 25%, auction cost 10%, offset by order value +5%."*

If `Total` is near zero, skip the breakdown.

---

## 6. Phase 4: Find the cause inside each factor

```
e = evidence strength between 0 and 1

CTR factor:
    CREATIVE_FATIGUE     e = MIN(1, |z_CTR| / 3) * (IF CTR fell on >= 5 of the last 7 days THEN 1 ELSE 0.5)
CPM factor:
    AUCTION_PRESSURE     e = MIN(1, z_CPM / 3) * (IF CPM rose >10% on >= half of other campaigns of the
                                                  same platform THEN 1 ELSE 0.5)
CVR factor:
    STOCK_CONSTRAINT     e = CLAMP(1 - runway_days / CRITICAL_RUNWAY_DAYS, 0, 1)      # 1.0 when stock is 0
    (other CVR drops are UNEXPLAINED_CVR in the MVP)
AOV factor:
    UNEXPLAINED_AOV      # price history is not in the MVP
Profit check:
    UNPROFITABLE_MARGIN  e = 1 IF ROAS_7d < BE_ROAS ELSE 0

Cause_Share = Factor_Share * e
Remainder   = UNEXPLAINED (shown honestly, never forced into a cause)
Final shares sum to 100%. cause = top share. confidence_diag = e of the top cause.
cause = "unknown" if confidence_diag < 0.4.
```

Always store the evidence (the numbers used) so the UI and LLM can show them.
Store the runner-up cause too.

---

## 7. Phase 5: Cause-to-action matrix (idea 4)

The engine may only recommend what fits the cause.

| Cause | Action | Type |
|---|---|---|
| HARD_STOCKOUT | PAUSE ads, alert ops to restock | Budget + alert |
| STOCK_CONSTRAINT / LOW_STOCK | THROTTLE ads, alert ops | Budget + alert |
| CREATIVE_FATIGUE | ROTATE_CREATIVE; fund replacement from the test reserve | Non-budget (trim only if MM0 < 1.0) |
| AUCTION_PRESSURE | Move budget to platforms with better MM | Budget |
| UNPROFITABLE_MARGIN | REDUCE to the break-even spend, margin and pricing review | Budget + alert |
| UNEXPLAINED / unknown | MAINTAIN and flag for human review | None |

---

## 8. Phase 6: Classify each campaign (precedence order)

```
FOR EACH campaign:
    CASE 1  stock_level == 0 AND spend > 0                           -> PAUSE      (cut 100%)
    CASE 2  (runway_days <= CRITICAL_RUNWAY_DAYS OR stock_level <= SAFETY_STOCK_UNITS)
            AND spend > 0                                             -> THROTTLE   (cut 70%)
    CASE 3  conversions_7d >= MIN_CONVERSIONS_7D AND MM0 < CUT_MM     -> REDUCE     (see below)
    CASE 4  conversions_7d >= MIN_CONVERSIONS_7D
            AND MM0 >= SCALE_MM
            AND runway_days >= MIN_SCALE_RUNWAY_DAYS
            AND margin_pct >= MIN_SCALE_MARGIN_PCT
            AND no open anomaly with cause in [HARD_STOCKOUT, STOCK_CONSTRAINT, UNPROFITABLE_MARGIN]
                                                                      -> ELIGIBLE_FOR_SCALE
    CASE 5  otherwise                                                 -> MAINTAIN
```

**REDUCE uses the curve, not a flat 50%.** Reduce to the spend where the next rupee breaks even:

```
S_target(T) = S0 * ( b * ROAS * m / T ) ^ ( 1 / (1 - b) )
REDUCE: S_new = MAX( S_target(CUT_MM), S0 * (1 - MAX_CUT_PCT/100) )
```

Examples: `ROAS*m = 1.4` gives about 24% cut. `ROAS*m = 0.8` (losing on average) hits the 50% cap.

---

## 9. Phase 7: Reallocate (idea 2: diminishing returns)

**Step 1: harvest.** Collect the cuts into a pool.

```
Pool = 0
FOR EACH campaign classed PAUSE, THROTTLE or REDUCE:
    S_new = 0 (PAUSE) | S0 * (1 - 0.70) (THROTTLE) | per section 8 (REDUCE)
    Pool += S0 - S_new
```

**Step 2: scale capacity.** For each ELIGIBLE_FOR_SCALE campaign, the cap is the smallest of three limits:

```
Cap_hurdle = S_target(SCALE_MM) - S0                 # stop when the next rupee falls to SCALE_MM
Cap_jump   = S0 * MAX_INCREASE_PCT / 100
Cap_stock  = see below

Capacity = MAX( 0, MIN(Cap_hurdle, Cap_jump, Cap_stock) )
```

**Stock cap (shared by all campaigns of one SKU):**

```
U0           = campaign conversions per day (ad-driven units)
extra_units  = usable_stock / MIN_SCALE_RUNWAY_DAYS - avg_daily_units - already_allocated_extra[sku]
IF extra_units <= 0:  Cap_stock = 0
ELSE:                 x_max = (1 + extra_units / U0) ^ (1/b) - 1
                      Cap_stock = S0 * x_max
after funding x:      already_allocated_extra[sku] += U0 * ((1 + x/S0)^b - 1)
```

This keeps the post-scale runway at 7 days or more, so we never promote a product into a stockout.

**Step 3: allocate (greedy by highest marginal return).**

```
SORT eligible campaigns by MM0 DESCENDING
FOR EACH campaign in that order:
    give = MIN(Pool, Capacity)
    S_new = S0 + give ; Pool -= give
IF Pool > 0:  Cash_Reserve = Pool   # unspent, returned to working capital
```

**Step 4: guardrails (all must hold, or drop the offending add and recompute).**

```
Total_New_Spend <= Total_Old_Spend                    # reallocation only, no net-new in the MVP
Every increase  <= MAX_INCREASE_PCT of that campaign
No add to any SKU with runway_days < MIN_SCALE_RUNWAY_DAYS
Package_Gain (section 10) > 0, else remove the lowest-MM add
```

---

## 10. Phase 8: Projected profit (one formula everywhere)

```
R_new = R0 * (S_new / S0) ^ b
dProfit_per_day = m * (R_new - R0) - (S_new - S0)       # used for scale AND budget cuts of profitable ads

Stock-driven cuts (PAUSE / THROTTLE) are supply-bound, so revenue is not lost (the same stock sells either way):
Waste_Avoided = (S0 - S_new) * MAX(0, PROJECTION_DAYS - runway_days)

Package_Gain = SUM( dProfit_per_day * PROJECTION_DAYS )   for REDUCE and SCALE campaigns
             + SUM( Waste_Avoided )                        for PAUSE and THROTTLE campaigns
```

Always show **profit**, never revenue.

---

## 11. Phase 9: Confidence interval and priority

```
REPEAT MC_SAMPLES times:
    ROAS0_i = ROAS * (1 + Normal(0, 0.10))
    b_i     = Uniform(b - 0.15, b + 0.15) clamped to ELASTICITY_BOUNDS
    recompute Package_Gain_i with ROAS0_i and b_i

P5, P50, P95 = percentiles of Package_Gain_i
p_pos        = share of samples with Package_Gain_i > 0

Confidence = p_pos * history_factor[action_type]       # history_factor starts at 1.0 (section 13)
Urgency    = 3 (stock) | 2 (data or guardrail) | 1 (optimisation)
Priority   = P50 * Confidence * Urgency                # sort recommendations descending
```

---

## 12. Phase 10: Approval tiers (idea 5) and execution

| Tier | When | Behaviour |
|---|---|---|
| **A** | PAUSE or THROTTLE for stock (protective, reversible) | One-click Approve (can be auto-executed if enabled) |
| **B** | Budget moves within limits, Confidence >= 60% | One-click Approve |
| **C** | Confidence < 60%, or any change > 25% of a platform's budget | Explicit confirm showing risks |

**Directive text (plain business language):**

> "Throttle [Campaign A] ([Platform]) by ₹[cut]/day: [SKU] has only [runway] days of stock.
> Move ₹[add]/day to [Campaign B]. Expected profit +₹[P50] over 7 days (range ₹[P5] to ₹[P95])
> at [Confidence]% confidence."

**Execute on Approve (mock ad API):**

```
1. Revalidate: if the data used is older than 1 day OR the SKU's stock state changed, rerun Phases 1 to 9 for it and show the diff.
2. Apply CUTS first and confirm. Then apply ADDS, limited to the confirmed pool.
3. Use recommendation id as the idempotency key (a double click must not apply twice).
4. Write action_log: recommendation_id, approved_at, predicted_gain.
5. Global kill switch: a single flag that blocks all execution.
```

---

## 13. Phase 11: Learn from outcomes

```
After approval, simulate PROJECTION_DAYS forward (mock outcome).
    Simulator uses a hidden true elasticity b_true = 0.55 (so the engine starts slightly optimistic)
    plus Normal(0, 0.10) noise.

actual_gain   = formula from section 10 using b_true and the noise
Tolerance     = MAX( 1% of the campaign's daily net profit, ₹100 )
Scaled_Error  = (actual_gain - predicted_gain) / MAX( |predicted_gain|, Tolerance )

Bias[platform] = 0.8 * Bias[platform] + 0.2 * Scaled_Error          # EWMA, per platform

AFTER at least 3 evaluations for that platform (demo setting):
    IF Bias < -0.25:  b0[platform] = b0[platform] * 0.95            # we over-predicted
    IF Bias > +0.25:  b0[platform] = b0[platform] * 1.03            # we under-predicted
    b0[platform] = CLAMP(b0[platform], 0.30, 0.90)

history_factor[action_type]:
    IF |Scaled_Error| > 0.25:  hf = MAX(0.3, hf * (1 - 0.3 * MIN(1, |Scaled_Error|)))
    ELSE:                      hf = MIN(1.0, hf * 1.05)

Write outcomes: action_id, actual_gain, error, old_confidence, new_confidence
```

The Learning tab must show predicted vs. actual and old vs. new confidence.

**KPIs (from our own tables):**

| KPI | Formula |
|---|---|
| Wasted spend avoided | SUM of Waste_Avoided from approved stock actions |
| Total net profit | SUM(revenue * m - spend) |
| Blended ROAS | SUM(revenue) / SUM(spend) |
| Stockout days on promoted SKUs | count of days with stock 0 and spend > 0 (target 0) |
| Directional hit-rate | share of evaluated actions with actual_gain > 0 |
| Decision accuracy | 100 * (1 - MEDIAN( MIN(1, \|Scaled_Error\|) )) over the last 30 evaluations |

---

## 14. Worked example (check your code against these numbers)

Campaign A (shoes): spend ₹6,000/day, runway **1.2 days**. Campaign B (bag): ROAS 5.0, margin 40%, spend ₹10,000/day, runway 22 days, 120 conversions in 7 days.

| Step | Calculation | Result |
|---|---|---|
| A class | runway 1.2 <= 3 | THROTTLE |
| A cut | 6,000 x 0.70 | ₹4,200/day into the pool |
| B MM0 | 0.65 x 5.0 x 0.40 | 1.30 (>= 1.10, eligible) |
| B caps | hurdle +61% (₹6,117), jump +50% (₹5,000), stock cap large | capacity ₹5,000 |
| B allocation | MIN(pool 4,200, capacity 5,000) | +₹4,200, new spend ₹14,200 |
| B revenue | 50,000 x (14,200 / 10,000)^0.65 | ₹62,794 (+₹12,794) |
| B profit | 0.40 x 12,794 - 4,200 | about **₹917/day** |
| A waste avoided | 4,200 x (7 - 1.2) | **₹24,360** |
| Package gain (7 days) | 917.6 x 7 + 24,360 | about **₹30,800** |

If you used plain average ROAS with no diminishing returns, B's gain would be overstated:
the straight-line version gives 0.40 x 21,000 - 4,200 = ₹4,200/day. The curve gives about ₹917/day.

---

## 15. Tests (use the planted events from the data generator)

| Planted event | Must happen |
|---|---|
| Hero SKU stock reaches 0 near day 35 | Anomaly flagged; cause STOCKOUT; class PAUSE or THROTTLE; Tier A; alert to ops |
| One campaign's CTR declines from day 20 | Cause CREATIVE_FATIGUE; action ROTATE_CREATIVE |
| A low-margin SKU with ROAS x margin < 1 | Class REDUCE, never ELIGIBLE_FOR_SCALE |
| Strong in-stock SKU (ROAS 5, margin 40%) | Receives budget, within the 50% cap |

**Invariants (assert in code, run on every cycle):**

- No recommendation adds budget to a SKU with runway under 7 days.
- No increase exceeds 50% of that campaign's spend.
- Total new spend is at most total old spend.
- Package_Gain is shown as profit, and every displayed number comes from our code, never from the LLM.
- The four-factor shares sum to the total (within rounding).
- Safe division everywhere: zero spend, zero clicks and zero conversions never crash.

---

## 16. Out of scope (do not build)

Reconciliation factors and attribution maturity, block-bootstrap intervals, Benjamini-Hochberg FDR,
Thompson sampling and opportunity-scoring of never-run cells, difference-in-differences or synthetic control,
hourly telemetry, learning-phase and cooldown rules, net-new budget requests, and any solver library.
List them as the roadmap in the pitch.

## 17. Known simplifications (say these honestly to the judges)

- Elasticity `b = 0.65` is a starting assumption per platform. The learning loop adjusts it, but with 45 days of synthetic data, treat it as illustrative.
- Platform-reported conversions are used for ROAS. In production they would be reconciled against store orders.
- Stock-driven savings assume no restock inside the 7-day horizon.
- The outcome is simulated, not measured from a real ad account.
