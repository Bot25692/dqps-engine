# A.D.A.P.T. validation

Window: 2026-08-24 through 2026-10-07. Seed 1 is the tuning baseline; seeds 2–6 are synthetic evaluation data.

Recall uses the original Seed 1 detector, campaign, metric, and onset definitions (±2 days). E3 requires all Google campaigns to match.

False positives count merged anomaly records on campaigns without E1–E4 planted events. Guardrails must pass both the recorded checks and independent assertGuardrails verification. Profit gains are expected INR per day.

| Seed | Total anomalies | E1–E4 recalled (recall) | False positives | Guardrails | Expected profit gain / day |
| --- | ---: | ---: | ---: | :---: | ---: |
| 1 (baseline) | 29 | 3/4 (75.0%) | 14 | PASS | ₹8,516.26 |
| 2 (synthetic) | 22 | 3/4 (75.0%) | 10 | PASS | ₹11,134.62 |
| 3 (synthetic) | 25 | 3/4 (75.0%) | 11 | PASS | ₹14,312.39 |
| 4 (synthetic) | 21 | 3/4 (75.0%) | 9 | PASS | ₹14,148.60 |
| 5 (synthetic) | 24 | 3/4 (75.0%) | 12 | PASS | ₹14,340.71 |
| 6 (synthetic) | 28 | 3/4 (75.0%) | 14 | PASS | ₹8,551.69 |
| **All 6 seeds (totals)** | 149 | 18/24 (75.0%) | 70 | 6/6 passed | ₹71,004.27 |

**Synthetic seeds 2–6 averages:** recall 75.0%; false positives 11.20 per seed; expected profit gain ₹12,497.60/day per seed.

N/A indicates an unavailable measurement; aggregates requiring that measurement are also N/A.

**FAIL — 96 checks passed, 24 failed.**

## Detailed checks

### Seed 1

- **PASS** E1 SNK-01 / stockRisk: expected day 41 ±2; c-sneaker: day 39
- **FAIL** E2 HOOD-01 / Meta / fatigue: expected day 22 ±2; c-hoodie: day 40
- **PASS** E3 Google / madAnomalies: expected day 36 ±2; c-jogger: day 36; c-cap-google: day 36
- **PASS** E4 TEE-BSC / TikTok / profitLeak: expected day 1 ±2; c-basic: day 1
- **FAIL** Event recall: 3/4 (75%)
- **FAIL** False positives: 14 (maximum 3)
  - c-cap / roas / day 1 (profit:c-cap:roas:2026-08-24)
  - c-socks / roas / day 1 (profit:c-socks:roas:2026-08-24)
  - c-cap / roas / day 7 (profit:c-cap:roas:2026-08-30)
  - c-socks / roas / day 8 (profit:c-socks:roas:2026-08-31)
  - c-cap / roas / day 15 (profit:c-cap:roas:2026-09-07)
  - c-socks / roas / day 15 (profit:c-socks:roas:2026-09-07)
  - c-cap / roas / day 22 (profit:c-cap:roas:2026-09-14)
  - c-cap / roas / day 24 (profit:c-cap:roas:2026-09-16)
  - c-cap / roas / day 27 (profit:c-cap:roas:2026-09-19)
  - c-cap / roas / day 29 (profit:c-cap:roas:2026-09-21)
  - c-socks / roas / day 35 (profit:c-socks:roas:2026-09-27)
  - c-cap / roas / day 36 (profit:c-cap:roas:2026-09-28)
  - c-socks / roas / day 42 (profit:c-socks:roas:2026-10-04)
  - c-cap / roas / day 43 (profit:c-cap:roas:2026-10-05)
- **PASS** E1 primary driver: expected stockRisk; c-sneaker: Stock risk
- **FAIL** E4 primary driver: expected margin_rate; c-basic: negative_marginal_profit
- **PASS** Top recommendation: analysis:2026-10-07:budget_reallocation
- **PASS** Guardrail: budget conserved: applied; recommendation record checked
- **PASS** Guardrail: donor cap: applied; recommendation record checked
- **PASS** Guardrail: receiver cap: applied; recommendation record checked
- **PASS** Guardrail: platform floor: applied; recommendation record checked
- **PASS** Guardrail: receiver cover: applied; recommendation record checked
- **PASS** Guardrail: min gain: applied; recommendation record checked
- **PASS** Guardrail: max moves: applied; recommendation record checked
- **PASS** Independent guardrail verification: assertGuardrails recomputed the plan successfully
- **PASS** c-sneaker budget decrease: ₹30,000.00 → ₹8,800.00
- **PASS** c-premium budget increase: ₹25,000.00 → ₹35,000.00
- **PASS** Expected profit gain per day: ₹8,516.26/day (minimum ₹300/day)

### Seed 2

- **PASS** E1 SNK-01 / stockRisk: expected day 41 ±2; c-sneaker: day 39
- **FAIL** E2 HOOD-01 / Meta / fatigue: expected day 22 ±2; c-hoodie: day 40
- **PASS** E3 Google / madAnomalies: expected day 36 ±2; c-jogger: day 36; c-cap-google: day 36
- **PASS** E4 TEE-BSC / TikTok / profitLeak: expected day 1 ±2; c-basic: day 1
- **FAIL** Event recall: 3/4 (75%)
- **FAIL** False positives: 10 (maximum 3)
  - c-cap / roas / day 1 (profit:c-cap:roas:2026-08-24)
  - c-socks / roas / day 1 (profit:c-socks:roas:2026-08-24)
  - c-cap / roas / day 8 (profit:c-cap:roas:2026-08-31)
  - c-socks / roas / day 14 (profit:c-socks:roas:2026-09-06)
  - c-cap / roas / day 15 (profit:c-cap:roas:2026-09-07)
  - c-cap / roas / day 22 (profit:c-cap:roas:2026-09-14)
  - c-cap / roas / day 29 (profit:c-cap:roas:2026-09-21)
  - c-cap / roas / day 36 (profit:c-cap:roas:2026-09-28)
  - c-cap / roas / day 39 (profit:c-cap:roas:2026-10-01)
  - c-cap / roas / day 43 (profit:c-cap:roas:2026-10-05)
- **PASS** E1 primary driver: expected stockRisk; c-sneaker: Stock risk
- **FAIL** E4 primary driver: expected margin_rate; c-basic: negative_marginal_profit
- **PASS** Top recommendation: analysis:2026-10-07:budget_reallocation
- **PASS** Guardrail: budget conserved: applied; recommendation record checked
- **PASS** Guardrail: donor cap: applied; recommendation record checked
- **PASS** Guardrail: receiver cap: applied; recommendation record checked
- **PASS** Guardrail: platform floor: applied; recommendation record checked
- **PASS** Guardrail: receiver cover: applied; recommendation record checked
- **PASS** Guardrail: min gain: applied; recommendation record checked
- **PASS** Guardrail: max moves: applied; recommendation record checked
- **PASS** Independent guardrail verification: assertGuardrails recomputed the plan successfully
- **PASS** c-sneaker budget decrease: ₹30,000.00 → ₹8,800.00
- **PASS** c-premium budget increase: ₹25,000.00 → ₹35,000.00
- **PASS** Expected profit gain per day: ₹11,134.62/day (minimum ₹300/day)

### Seed 3

- **PASS** E1 SNK-01 / stockRisk: expected day 41 ±2; c-sneaker: day 39
- **FAIL** E2 HOOD-01 / Meta / fatigue: expected day 22 ±2; c-hoodie: day 40
- **PASS** E3 Google / madAnomalies: expected day 36 ±2; c-jogger: day 36; c-cap-google: day 36
- **PASS** E4 TEE-BSC / TikTok / profitLeak: expected day 1 ±2; c-basic: day 1
- **FAIL** Event recall: 3/4 (75%)
- **FAIL** False positives: 11 (maximum 3)
  - c-cap / roas / day 1 (profit:c-cap:roas:2026-08-24)
  - c-socks / roas / day 1 (profit:c-socks:roas:2026-08-24)
  - c-socks / roas / day 7 (profit:c-socks:roas:2026-08-30)
  - c-cap / roas / day 8 (profit:c-cap:roas:2026-08-31)
  - c-cap / roas / day 13 (profit:c-cap:roas:2026-09-05)
  - c-cap / roas / day 22 (profit:c-cap:roas:2026-09-14)
  - c-socks / roas / day 28 (profit:c-socks:roas:2026-09-20)
  - c-cap / roas / day 29 (profit:c-cap:roas:2026-09-21)
  - c-socks / roas / day 35 (profit:c-socks:roas:2026-09-27)
  - c-cap / roas / day 36 (profit:c-cap:roas:2026-09-28)
  - c-cap / roas / day 43 (profit:c-cap:roas:2026-10-05)
- **PASS** E1 primary driver: expected stockRisk; c-sneaker: Stock risk
- **FAIL** E4 primary driver: expected margin_rate; c-basic: negative_marginal_profit
- **PASS** Top recommendation: analysis:2026-10-07:budget_reallocation
- **PASS** Guardrail: budget conserved: applied; recommendation record checked
- **PASS** Guardrail: donor cap: applied; recommendation record checked
- **PASS** Guardrail: receiver cap: applied; recommendation record checked
- **PASS** Guardrail: platform floor: applied; recommendation record checked
- **PASS** Guardrail: receiver cover: applied; recommendation record checked
- **PASS** Guardrail: min gain: applied; recommendation record checked
- **PASS** Guardrail: max moves: applied; recommendation record checked
- **PASS** Independent guardrail verification: assertGuardrails recomputed the plan successfully
- **PASS** c-sneaker budget decrease: ₹30,000.00 → ₹8,800.00
- **PASS** c-premium budget increase: ₹25,000.00 → ₹35,000.00
- **PASS** Expected profit gain per day: ₹14,312.39/day (minimum ₹300/day)

### Seed 4

- **PASS** E1 SNK-01 / stockRisk: expected day 41 ±2; c-sneaker: day 39
- **FAIL** E2 HOOD-01 / Meta / fatigue: expected day 22 ±2; c-hoodie: day 40
- **PASS** E3 Google / madAnomalies: expected day 36 ±2; c-jogger: day 36; c-cap-google: day 36
- **PASS** E4 TEE-BSC / TikTok / profitLeak: expected day 1 ±2; c-basic: day 1
- **FAIL** Event recall: 3/4 (75%)
- **FAIL** False positives: 9 (maximum 3)
  - c-cap / roas / day 1 (profit:c-cap:roas:2026-08-24)
  - c-socks / roas / day 1 (profit:c-socks:roas:2026-08-24)
  - c-cap / roas / day 5 (profit:c-cap:roas:2026-08-28)
  - c-cap / roas / day 8 (profit:c-cap:roas:2026-08-31)
  - c-cap / roas / day 14 (profit:c-cap:roas:2026-09-06)
  - c-cap / roas / day 22 (profit:c-cap:roas:2026-09-14)
  - c-cap / roas / day 29 (profit:c-cap:roas:2026-09-21)
  - c-cap / roas / day 35 (profit:c-cap:roas:2026-09-27)
  - c-cap / roas / day 43 (profit:c-cap:roas:2026-10-05)
- **PASS** E1 primary driver: expected stockRisk; c-sneaker: Stock risk
- **FAIL** E4 primary driver: expected margin_rate; c-basic: negative_marginal_profit
- **PASS** Top recommendation: analysis:2026-10-07:budget_reallocation
- **PASS** Guardrail: budget conserved: applied; recommendation record checked
- **PASS** Guardrail: donor cap: applied; recommendation record checked
- **PASS** Guardrail: receiver cap: applied; recommendation record checked
- **PASS** Guardrail: platform floor: applied; recommendation record checked
- **PASS** Guardrail: receiver cover: applied; recommendation record checked
- **PASS** Guardrail: min gain: applied; recommendation record checked
- **PASS** Guardrail: max moves: applied; recommendation record checked
- **PASS** Independent guardrail verification: assertGuardrails recomputed the plan successfully
- **PASS** c-sneaker budget decrease: ₹30,000.00 → ₹8,800.00
- **PASS** c-premium budget increase: ₹25,000.00 → ₹35,000.00
- **PASS** Expected profit gain per day: ₹14,148.60/day (minimum ₹300/day)

### Seed 5

- **PASS** E1 SNK-01 / stockRisk: expected day 41 ±2; c-sneaker: day 39
- **FAIL** E2 HOOD-01 / Meta / fatigue: expected day 22 ±2; c-hoodie: day 40
- **PASS** E3 Google / madAnomalies: expected day 36 ±2; c-jogger: day 36; c-cap-google: day 36
- **PASS** E4 TEE-BSC / TikTok / profitLeak: expected day 1 ±2; c-basic: day 1
- **FAIL** Event recall: 3/4 (75%)
- **FAIL** False positives: 12 (maximum 3)
  - c-cap / roas / day 1 (profit:c-cap:roas:2026-08-24)
  - c-socks / roas / day 1 (profit:c-socks:roas:2026-08-24)
  - c-socks / roas / day 7 (profit:c-socks:roas:2026-08-30)
  - c-cap / roas / day 14 (profit:c-cap:roas:2026-09-06)
  - c-cap / roas / day 22 (profit:c-cap:roas:2026-09-14)
  - c-socks / roas / day 22 (profit:c-socks:roas:2026-09-14)
  - c-cap / roas / day 29 (profit:c-cap:roas:2026-09-21)
  - c-socks / roas / day 29 (profit:c-socks:roas:2026-09-21)
  - c-socks / roas / day 35 (profit:c-socks:roas:2026-09-27)
  - c-cap / roas / day 36 (profit:c-cap:roas:2026-09-28)
  - c-socks / roas / day 42 (profit:c-socks:roas:2026-10-04)
  - c-cap / roas / day 43 (profit:c-cap:roas:2026-10-05)
- **PASS** E1 primary driver: expected stockRisk; c-sneaker: Stock risk
- **FAIL** E4 primary driver: expected margin_rate; c-basic: negative_marginal_profit
- **PASS** Top recommendation: analysis:2026-10-07:budget_reallocation
- **PASS** Guardrail: budget conserved: applied; recommendation record checked
- **PASS** Guardrail: donor cap: applied; recommendation record checked
- **PASS** Guardrail: receiver cap: applied; recommendation record checked
- **PASS** Guardrail: platform floor: applied; recommendation record checked
- **PASS** Guardrail: receiver cover: applied; recommendation record checked
- **PASS** Guardrail: min gain: applied; recommendation record checked
- **PASS** Guardrail: max moves: applied; recommendation record checked
- **PASS** Independent guardrail verification: assertGuardrails recomputed the plan successfully
- **PASS** c-sneaker budget decrease: ₹30,000.00 → ₹8,800.00
- **PASS** c-premium budget increase: ₹25,000.00 → ₹35,000.00
- **PASS** Expected profit gain per day: ₹14,340.71/day (minimum ₹300/day)

### Seed 6

- **PASS** E1 SNK-01 / stockRisk: expected day 41 ±2; c-sneaker: day 39
- **FAIL** E2 HOOD-01 / Meta / fatigue: expected day 22 ±2; c-hoodie: day 40
- **PASS** E3 Google / madAnomalies: expected day 36 ±2; c-jogger: day 36; c-cap-google: day 36
- **PASS** E4 TEE-BSC / TikTok / profitLeak: expected day 1 ±2; c-basic: day 1
- **FAIL** Event recall: 3/4 (75%)
- **FAIL** False positives: 14 (maximum 3)
  - c-cap / roas / day 1 (profit:c-cap:roas:2026-08-24)
  - c-socks / roas / day 1 (profit:c-socks:roas:2026-08-24)
  - c-cap / roas / day 4 (profit:c-cap:roas:2026-08-27)
  - c-cap / roas / day 8 (profit:c-cap:roas:2026-08-31)
  - c-socks / roas / day 14 (profit:c-socks:roas:2026-09-06)
  - c-cap / roas / day 15 (profit:c-cap:roas:2026-09-07)
  - c-cap / roas / day 22 (profit:c-cap:roas:2026-09-14)
  - c-socks / roas / day 22 (profit:c-socks:roas:2026-09-14)
  - c-cap / roas / day 26 (profit:c-cap:roas:2026-09-18)
  - c-cap / roas / day 29 (profit:c-cap:roas:2026-09-21)
  - c-socks / roas / day 35 (profit:c-socks:roas:2026-09-27)
  - c-cap / roas / day 36 (profit:c-cap:roas:2026-09-28)
  - c-socks / roas / day 42 (profit:c-socks:roas:2026-10-04)
  - c-cap / roas / day 43 (profit:c-cap:roas:2026-10-05)
- **PASS** E1 primary driver: expected stockRisk; c-sneaker: Stock risk
- **FAIL** E4 primary driver: expected margin_rate; c-basic: negative_marginal_profit
- **PASS** Top recommendation: analysis:2026-10-07:budget_reallocation
- **PASS** Guardrail: budget conserved: applied; recommendation record checked
- **PASS** Guardrail: donor cap: applied; recommendation record checked
- **PASS** Guardrail: receiver cap: applied; recommendation record checked
- **PASS** Guardrail: platform floor: applied; recommendation record checked
- **PASS** Guardrail: receiver cover: applied; recommendation record checked
- **PASS** Guardrail: min gain: applied; recommendation record checked
- **PASS** Guardrail: max moves: applied; recommendation record checked
- **PASS** Independent guardrail verification: assertGuardrails recomputed the plan successfully
- **PASS** c-sneaker budget decrease: ₹30,000.00 → ₹8,800.00
- **PASS** c-premium budget increase: ₹25,000.00 → ₹35,000.00
- **PASS** Expected profit gain per day: ₹8,551.69/day (minimum ₹300/day)
