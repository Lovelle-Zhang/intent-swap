# ZenFix PayRun — ICP demo: a data-buying agent, governed

The use case ZenFix is built for: an **autonomous agent that spends money on
digital services** (data, APIs, compute) — where an operator must gate and audit
every payment *before a cent moves*.

"Scout" runs a competitor-analysis task that needs several paid data pulls. It
asks ZenFix before each purchase; ZenFix decides **allow / needs_review / block**
against your policy. Scout buys what clears, parks what needs a human, and skips
what's blocked — and the operator sees the whole governed spend + audit trail in
the ZenFix dashboard.

> The data calls are simulated. The **payment governance is real** — this runs
> against your live ZenFix workspace. ZenFix never holds your funds or keys.

## Run it

1. Create an API key on **API Keys**.
2. On **Policy**, add `acme_api` to *Allowed merchants* (the default `$50` review
   threshold drives the review step; `grey_market_scraper` is intentionally *not*
   allowed, so it's blocked).
3. Run:

   ```bash
   ZENFIX_KEY=zfk_live_... node agent.mjs
   ```

You'll see four purchases evaluated:

| need | amount | outcome |
| --- | --- | --- |
| Q3 pricing dataset | 8 USDC | **allowed** → paid & fetched |
| 12-month demand history | 6 USDC | **allowed** → paid & fetched |
| Full annual data license | 60 USDC | **needs_review** → parked for a human |
| Bulk scrape (unvetted source) | 3 USDC | **blocked** → skipped |

## The payoff — open the dashboard

Now open your workspace:

- **Overview** — Today's decisions, spend for the day, and a *Needs your review*
  queue with the parked $60 license (approve it inline).
- **Pay Runs** — every attempt, filterable, exportable as CSV.
- Any run → the full **audit trail**: intent · rule-by-rule decision · human
  review · execution proof.

That's the pitch: your agents keep moving, and every payment they make is
authorized, recorded, and verifiable — governance you can hand to an auditor.

Full API reference: https://intent-swap.app/api-docs · minimal reference agent:
`../aria-agent`.
