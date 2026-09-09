# ZenFix PayRun — reference agent

A zero-dependency Node example of the full loop: an agent proposes a payment,
ZenFix decides against your policy, a human approves if needed, the agent
executes on its own rail, and ZenFix records — and, on Base Sepolia, **verifies
on-chain** — the result. ZenFix never holds your funds or keys.

`agent.mjs` is ~70 lines and copy-pasteable into a real agent. The four calls in
its client section (`submit`, `getRun`, `report`, `awaitReview`) are the whole API.

## Run it (2 minutes)

1. Sign in at https://intent-swap.app and create an API key on **API Keys**
   (the full `zfk_live_…` is shown once).
2. On **Policy**, allow the merchant your agent will pay (add `acme_api` to
   *Allowed merchants*), and set your limits/budget.
3. Run:

   ```bash
   ZENFIX_KEY=zfk_live_... node agent.mjs
   ```

You'll see the decision (`allowed` / `needs_review` / `blocked`); an allowed run
executes on a simulated rail and reports back. If it needs review, approve it on
the workspace **Overview** and the script continues.

## From zero to a *verified* payment (~15 minutes)

To prove execution really happened — not just self-reported — pay on Base
Sepolia and let ZenFix verify the transaction on-chain:

1. **Get test USDC.** Fund a wallet with Base Sepolia test USDC from a faucet
   (e.g. Circle's). The test USDC token is
   `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
2. **(Optional) Pin the payee.** On **Policy → Merchant payout addresses**, set
   `acme_api = 0x<the address you'll pay>`. Then verification requires the
   transfer to have gone to *that* address — the agent can't name another.
3. **Broadcast the payment.** Send the USDC amount your agent will report
   (≥ the authorized amount) to that address on Base Sepolia. Copy the tx hash.
4. **Run with the proof:**

   ```bash
   ZENFIX_KEY=zfk_live_... TX_HASH=0x<txhash> RECIPIENT=0x<payee> node agent.mjs
   ```

The report goes out on `rail: "base-sepolia"`; ZenFix reads the chain and
confirms the transfer succeeded, moved USDC, and paid at least the authorized
amount to the pinned address. An unverifiable claim is rejected (HTTP 422) and
the run stays awaiting execution. On success the Pay Run shows **Verified
on-chain**.

## What each outcome means

| outcome | do |
| --- | --- |
| `allowed` | execute on your rail, then `report` the proof |
| `needs_review` | poll `GET /api/v1/payruns/{id}` until approved, then execute + report |
| `blocked` | do not pay; `reasonCodes` explain why |

Full reference: https://intent-swap.app/api-docs
