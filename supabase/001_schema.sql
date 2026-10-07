BEGIN;

CREATE TABLE public.skus (
  id text PRIMARY KEY CHECK (length(id) > 0),
  name text NOT NULL CHECK (length(name) > 0),
  margin_rate numeric NOT NULL CHECK (margin_rate BETWEEN 0 AND 1)
);

-- Campaign budgets are the immutable demo baseline; decisions change campaign_state.
CREATE TABLE public.campaigns (
  id text PRIMARY KEY CHECK (length(id) > 0),
  name text NOT NULL CHECK (length(name) > 0),
  sku_id text NOT NULL REFERENCES public.skus(id),
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'amazon')),
  daily_budget numeric NOT NULL CHECK (daily_budget >= 0 AND daily_budget < 'Infinity'::numeric)
);

CREATE TABLE public.ad_metrics_daily (
  campaign_id text NOT NULL REFERENCES public.campaigns(id),
  date date NOT NULL,
  spend numeric NOT NULL CHECK (spend >= 0 AND spend < 'Infinity'::numeric),
  revenue numeric NOT NULL CHECK (revenue >= 0 AND revenue < 'Infinity'::numeric),
  impressions bigint NOT NULL CHECK (impressions >= 0),
  clicks bigint NOT NULL CHECK (clicks >= 0),
  orders bigint NOT NULL CHECK (orders >= 0),
  PRIMARY KEY (campaign_id, date)
);
CREATE INDEX ad_metrics_daily_date_idx ON public.ad_metrics_daily (date);

CREATE TABLE public.inventory_daily (
  sku_id text NOT NULL REFERENCES public.skus(id),
  date date NOT NULL,
  units_on_hand bigint NOT NULL CHECK (units_on_hand >= 0),
  units_sold bigint NOT NULL CHECK (units_sold >= 0),
  PRIMARY KEY (sku_id, date)
);
CREATE INDEX inventory_daily_date_idx ON public.inventory_daily (date);

CREATE TABLE public.anomalies (
  id text PRIMARY KEY CHECK (length(id) > 0),
  campaign_id text NOT NULL REFERENCES public.campaigns(id),
  date date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('roas', 'ctr', 'cpm', 'cvr', 'aov', 'stock_runway')),
  baseline numeric NOT NULL CHECK (baseline > '-Infinity'::numeric AND baseline < 'Infinity'::numeric),
  observed numeric NOT NULL CHECK (observed > '-Infinity'::numeric AND observed < 'Infinity'::numeric),
  z_score numeric NOT NULL CHECK (z_score >= 0 AND z_score < 'Infinity'::numeric),
  change_pct numeric NOT NULL CHECK (change_pct > '-Infinity'::numeric AND change_pct < 'Infinity'::numeric),
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  drivers jsonb NOT NULL CHECK (jsonb_typeof(drivers) = 'array')
);

CREATE TABLE public.recommendations (
  id text PRIMARY KEY CHECK (length(id) > 0),
  created_at timestamptz NOT NULL,
  type text NOT NULL CHECK (type IN ('budget_reallocation', 'stock_protection', 'creative_refresh')),
  moves jsonb NOT NULL CHECK (jsonb_typeof(moves) = 'array' AND jsonb_array_length(moves) BETWEEN 1 AND 5),
  expected_profit_gain_per_day numeric NOT NULL CHECK (expected_profit_gain_per_day > '-Infinity'::numeric AND expected_profit_gain_per_day < 'Infinity'::numeric),
  confidence numeric NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  constraints_checked text[] NOT NULL,
  -- Additional requested storage; constraints_checked remains the TypeScript contract.
  constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation text NOT NULL CHECK (length(explanation) > 0),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executed'))
);

CREATE TABLE public.action_log (
  id text PRIMARY KEY CHECK (length(id) > 0),
  recommendation_id text NOT NULL REFERENCES public.recommendations(id),
  created_at timestamptz NOT NULL,
  actor text NOT NULL CHECK (length(actor) > 0),
  action text NOT NULL CHECK (action IN ('approved', 'rejected', 'executed')),
  note text NOT NULL
);

CREATE TABLE public.outcomes (
  id text PRIMARY KEY CHECK (length(id) > 0),
  recommendation_id text NOT NULL REFERENCES public.recommendations(id),
  created_at timestamptz NOT NULL,
  predicted numeric NOT NULL CHECK (predicted > '-Infinity'::numeric AND predicted < 'Infinity'::numeric),
  actual numeric NOT NULL CHECK (actual > '-Infinity'::numeric AND actual < 'Infinity'::numeric),
  error_pct numeric NOT NULL CHECK (error_pct > '-Infinity'::numeric AND error_pct < 'Infinity'::numeric),
  horizon_days integer NOT NULL CHECK (horizon_days > 0)
);

CREATE TABLE public.campaign_state (
  campaign_id text PRIMARY KEY REFERENCES public.campaigns(id),
  daily_budget numeric NOT NULL CHECK (daily_budget >= 0 AND daily_budget < 'Infinity'::numeric),
  status text NOT NULL CHECK (status IN ('active', 'paused')),
  updated_at timestamptz NOT NULL
);

CREATE TABLE public.confidence_weights (
  recommendation_type text PRIMARY KEY CHECK (recommendation_type IN ('budget_reallocation', 'stock_protection', 'creative_refresh')),
  weight numeric NOT NULL DEFAULT 0.75 CHECK (weight BETWEEN 0.3 AND 0.95),
  updated_at timestamptz NOT NULL
);

-- No policies: ordinary roles cannot access rows. Supabase service_role bypasses RLS.
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confidence_weights ENABLE ROW LEVEL SECURITY;

COMMIT;
