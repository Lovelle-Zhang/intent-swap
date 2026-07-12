# ZenFix Policy Engine

**Status:** Canonical baseline
**Date:** 2026-07-12

## 1. Responsibility

The Policy Engine is a deterministic, versioned, side-effect-free decision service. It decides whether a normalized PayIntent is `allowed`, `needs_review`, or `blocked` and explains the decision with stable reason codes and human-readable details.

It does not parse free text, prepare funding, reserve budget, execute payment, approve a request, or write Ledger entries.

## 2. Inputs

Policy evaluation receives a server-built snapshot:

- authenticated `projectId`, environment, and actor scopes
- Project version and kill-switch state
- Agent identity, status, capabilities, and Policy binding
- immutable PayIntent and intent digest
- Merchant identity, trust state, payee details, category, and allowlist state
- Policy ID, version, checksum, effective window, and rules
- project/agent/merchant budget usage and active reservations from authoritative repositories
- Merchant `PaymentQuote`, when the payment rail requires one
- read-only `FundingPreflightQuote`, when source and settlement target differ
- quote sources, conservative rounding, fees, and expiry
- proposed final settlement target and rail
- optional `PolicyRecheckContext { approvalDecisionId, approvedScopeDigest, coveredReasonCodes }`
- current server time

Values from the request body are untrusted until resolved against project-scoped catalogs. Missing Agent, Merchant, Policy, quote, price, or required configuration fails closed; the engine never selects the first or demo record. Dependency/transport failures do not manufacture a terminal `blocked` PolicyDecision: the application records an evaluation error, remains `policy_evaluating` for bounded retry, and creates no downstream artifact. A non-retryable evaluation failure may end the PayRun as `failed`, still without authorization.

## 3. Output contract

A PolicyDecision contains:

- decision ID, Project, PayRun, Intent, and Policy references
- Policy version/checksum and engine version
- normalized input snapshot digest
- `allowed`, `needs_review`, or `blocked`
- ordered checks with stable reason code, outcome, and safe explanation
- risk level
- `evaluatedAt` and `validUntil`
- optional `authorizationBasis=approvalDecisionId` when a valid Approval covers the unchanged review reasons
- next action: `prepare_funding`, `request_approval`, or `stop`

Decision text may evolve; reason codes and their semantics are versioned API contracts.

## 4. Rule precedence

Rules evaluate in this order:

1. **Structural validity** — runtime schema, immutable intent, supported environment, expiry.
2. **Emergency controls** — global/environment/Project kill switch and execution mode.
3. **Identity and authorization** — API scope, Project, Agent status, Policy binding.
4. **Payee controls** — Merchant identity, payee address/domain, category, trust state, allow/block lists.
5. **Settlement controls** — final asset USDC, chain Base, approved rail, valid quote and fee ceiling.
6. **Hard limits** — per-transaction, project, agent, merchant, rail, daily/monthly, and absolute caps.
7. **Review rules** — new Merchant, ambiguous category, amount above approval threshold, unusual purpose.
8. **Evidence requirements** — required artifact/proof type and provider eligibility.

Any hard block wins. If no hard block exists, an uncovered review check yields `needs_review`. During an Approval-aware recheck, a valid Approval satisfies only the same reason codes within its unchanged scope digest; those covered reasons do not trigger another review. Any new review reason still yields `needs_review`. A snapshot with no hard block or uncovered review reason yields `allowed`.

## 5. Stable reason codes

Initial reason-code families include:

```text
input.invalid
intent.expired
environment.unsupported
execution.kill_switch_active
auth.scope_missing
agent.inactive
policy.missing_or_inactive
merchant.blocked
merchant.unknown
category.blocked
settlement.asset_not_allowed
settlement.chain_not_allowed
settlement.rail_not_allowed
quote.missing_or_expired
amount.transaction_limit_exceeded
amount.hard_limit_exceeded
budget.project_limit_exceeded
budget.agent_limit_exceeded
budget.merchant_limit_exceeded
approval.threshold_reached
artifact.proof_required
```

Messages must not disclose cross-project existence, secret configuration, or exploitable internal thresholds.

`dependency.unavailable` is an application evaluation-attempt error code, not a Policy outcome. It blocks progression but remains distinguishable from a business/risk `blocked` decision.

## 6. Amounts, quotes, and budgets

- Amounts use integer atomic units and an explicit Asset reference; Policy never compares JavaScript floating-point values.
- Rounding is conservative: requested spend and fees round upward for limit checks.
- `PaymentQuote` and `FundingPreflightQuote` are distinct types. Both record provider, asset pair/rail, integer amount, fees, timestamp, expiry, and configuration version.
- Expired or missing quotes cannot be treated as zero-cost or allowed.
- Budget usage comes from project-scoped Ledger and active reservations, not a mutable number embedded in Policy JSON.
- The pure Policy decision reports budget eligibility. The transition into `funding_preparing` reloads/revalidates eligibility and atomically creates the budget reservation with every aggregate CAS in one Unit of Work.
- Concurrent reservations use CAS/unique constraints so two individually valid requests cannot overspend the same limit.

### Quote and authorization sequence

```text
PayIntent
→ FundingScopeProposal.propose(intent, logical target)       # pure
→ FundingPreflightQuote.quote(scope)                         # read-only, no calldata/effect
→ Policy.evaluate(intent + payment/funding quote snapshot)
→ Approval when required
→ refresh quote + Approval-aware Policy recheck
→ atomic budget reservation + FundingPreparation
```

`FundingScopeProposal` and `FundingPreflightQuote` are Policy inputs inside the PayRun, not FundingPreparation and not authority to execute. The preflight adapter cannot return calldata, approval transactions, signer requests, or broadcast material. A change to recipient, chain, asset, spender, router/bridge, amount, fee ceiling, plan digest, or quote expiry requires fresh Policy evaluation and, when outside the approved scope, a new Approval.

## 7. Settlement target

For the current product baseline, Policy resolves the final payment target to USDC on Base. Funding sources such as ETH or SOL never change the payment asset.

The first pilot uses `environment=sandbox`, `executionAdapter=sandbox_simulated`, and logical `base + USDC` settlement evidence. It has no mainnet contract or transaction hash. A future on-chain environment requires an accepted Asset Registry configuration that pins chain ID, contract address, decimals, finality, and rail.

## 8. Approval semantics

`needs_review` creates an ApprovalRequest bound to the immutable decision scope. Human approval cannot override:

- active kill switch
- unsupported environment
- missing execution scope
- blocked Merchant/payee/category
- absolute hard limit
- invalid/expired intent
- unavailable or unverified settlement configuration

After approval and immediately before Funding, the application supplies `PolicyRecheckContext`, refreshes quotes, and re-evaluates current Policy, kill switch, Merchant state, spend/reservations, and approval expiry. A valid Approval consumes only its original covered reason codes; any bound-field change invalidates it, any new review reason creates a new ApprovalRequest, and any hard block wins.

The executor rechecks a strong-consistency kill-switch snapshot at every funding/payment worker claim and again immediately before each external submit. A control-plane error or changed switch blocks progression even when an older PolicyDecision/Approval remains valid.

Requester, approver, and executor identities come from authenticated subjects. Production modes require separation-of-duty rules; a request body cannot name its own reviewer.

## 9. Parser boundary

Natural-language or LLM parsing produces an untrusted candidate PayIntent. The server must:

1. validate its runtime schema and ranges
2. resolve Agent, Merchant, asset, chain, and rail through project-scoped registries
3. create an immutable normalized intent and digest
4. submit that intent to Policy

Prompt wording cannot authorize spend, establish Merchant trust, define a recurring mandate, or bypass a hard rule.

## 10. Versioning and replay

- Policy updates publish a new immutable version and checksum.
- Existing decisions retain the exact version and input digest used.
- Emergency block rules apply to queued but unexecuted work even if an older decision remains within its normal validity window.
- A decision is replayable: the same normalized snapshot, engine version, and Policy version produce the same checks and outcome.
- Unknown engine or Policy versions fail closed rather than approximate a prior behavior.

## 11. Fixed scenario expectations

| Scenario | Policy result | Downstream rule |
| --- | --- | --- |
| Allowed known Merchant within limits | `allowed` | Create FundingPreparation |
| New/ambiguous Merchant or review threshold | `needs_review` | Create ApprovalRequest; no Funding |
| Blocked Merchant, hard limit, or kill switch | `blocked` | Terminal; no Funding, Payment, or Proof |
| ETH/SOL funding source with USDC/Base target | evaluate spend normally | If allowed, FundingPreparation records mismatch; Policy target remains USDC/Base |

## 12. Policy Gate

Slice 2 and Slice 4 tests must prove:

- deterministic replay and stable reason ordering
- Approval-aware deterministic replay: unchanged covered reasons become `allowed` with authorization basis, while new reasons return to review
- hard block precedence over review and allow
- dependency failure creates no PolicyDecision and no authorization
- unknown/missing catalog entities fail closed
- amounts and rounding do not use floating point
- cross-project records are invisible
- concurrent budget reservations cannot overspend
- Approval cannot override absolute blocks
- Approval recheck observes Policy, budget, Merchant, quote, and kill-switch changes
- budget revalidation, reservation, and entry to Funding are atomic under concurrency
- `blocked` and `needs_review` create no funding or payment attempt
