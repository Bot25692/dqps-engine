-- Run explicitly with the server service role to reset the demo decisions.
BEGIN;

DELETE FROM public.action_log;
DELETE FROM public.outcomes;

-- Baseline budgets live in campaigns; all baseline campaigns are active.
INSERT INTO public.campaign_state (campaign_id, daily_budget, status, updated_at)
SELECT id, daily_budget, 'active', CURRENT_TIMESTAMP FROM public.campaigns
ON CONFLICT (campaign_id) DO UPDATE
SET daily_budget = EXCLUDED.daily_budget,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;

UPDATE public.recommendations SET status = 'pending';

INSERT INTO public.confidence_weights (recommendation_type, weight, updated_at)
VALUES ('budget_reallocation', 0.75, CURRENT_TIMESTAMP),
       ('stock_protection', 0.75, CURRENT_TIMESTAMP),
       ('creative_refresh', 0.75, CURRENT_TIMESTAMP)
ON CONFLICT (recommendation_type) DO UPDATE
SET weight = EXCLUDED.weight, updated_at = EXCLUDED.updated_at;

COMMIT;
