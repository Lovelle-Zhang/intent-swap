-- Optional per-workspace notification webhook. When set, ZenFix best-effort
-- POSTs an advisory nudge to this URL when a Pay Run enters pending_review, so
-- the owner (or their Slack/PagerDuty/backend) learns a run needs a decision.
-- The webhook carries no secret: the receiver verifies the truth by calling the
-- read API (GET /api/v1/payruns/{id}) with its own key. NULL/'' = disabled.
ALTER TABLE public.policies
  ADD COLUMN notify_webhook_url text;
