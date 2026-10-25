# Problem Statement

## Who has the problem

**Growth and performance-marketing leads at direct-to-consumer (D2C) brands**, typically small teams running paid ads across several platforms (Meta, Google, TikTok, Amazon) with no data-science support. They split a daily budget across 10 or more campaigns and rebalance it by hand, using exports from each ad dashboard, a sales sheet and a stock sheet.

## The problem

Ad platforms tell marketers how *revenue* is doing. They do not tell them whether the next rupee of spend will earn *profit*. Four things go wrong when budgets are managed from ROAS dashboards:

1. **Spending on stock that is about to run out.** A product can show an excellent ROAS (4.8x) while only a day of inventory remains. The ads keep spending and the sale cannot be fulfilled.
2. **ROAS hides unprofitable spend.** A low-margin product can look healthy at 3x ROAS yet lose money at the margin. Break-even ROAS is `1 / margin_rate`, and it is different for every SKU.
3. **Slow diagnosis.** When ROAS drops, the cause is one of click-through rate, conversion rate, order value or CPM (the cost of reach), and each needs a different fix. Finding which one is a manual investigation.
4. **No feedback loop.** Teams rarely check whether last week's budget move actually paid off, so the same mistakes repeat.

## Why it matters

- Ad spend is usually a D2C brand's largest variable cost, so small allocation errors compound every day.
- Teams are small, and reconciling four data sources by hand is slow, so problems are caught days late.
- Optimising for ROAS rewards the wrong products. Optimising for **contribution profit** (revenue × margin − ad spend) is what the business actually needs.

## Our solution: A.D.A.P.T.

**A**dvertising **D**ecision **A**utomation for **P**rofitable **T**argeting turns the four data sources into one explained, human-approved budget decision:

**Detect → Diagnose → Decide → Approve → Simulate → Learn**

- **Detect** performance shifts using robust statistics (median and scaled MAD) and creative fatigue rules.
- **Diagnose** the probable cause by splitting a ROAS change into CTR, CVR, AOV and CPM contributions. Stock risk is always listed first.
- **Decide** with a profit-aware optimiser that moves budget to where marginal profit per rupee is highest, under hard guardrails (stock cover, per-move caps, platform floors, conserved total budget).
- **Approve**: a human always signs off, and every decision is logged.
- **Simulate** three days of outcomes and **Learn**: prediction error updates the confidence of future recommendations.

Every number shown comes from deterministic, tested code, never from a language model.

## Scope note

Ad data and execution are **simulated**. No real ad-platform APIs are connected. This is a decision-engine prototype, not a live trading system.
