# ZenFix Pilot Scenarios

**Status:** Active product validation fixtures
**Classification:** Product Validation Documentation
**Date:** 2026-07-12
**Owner:** Product and Domain

These scenarios add research amounts, Merchant classifications, and explanation
requirements to the existing fixed fixtures. They do not override the
[canonical PayRun state machine](../architecture/PAYRUN_STATE_MACHINE.md), the
[Domain Model](../architecture/DOMAIN_MODEL.md), the
[Policy Engine](../architecture/POLICY_ENGINE.md), or the
[Funding Layer](../architecture/FUNDING_LAYER.md).

## 1. Shared constraints

All four scenarios:

- use `environment=sandbox`, `executionAdapter=sandbox_simulated`, and
  `rolloutMode=sandbox_pilot`
- use a project-scoped Agent, Merchant fixture, Policy version, and PayRun
- represent USDC as integer atomic units with `decimals=6`
- use logical USDC/Base as the Policy-resolved settlement target
- originate from the real canonical Sandbox Control Loop, not hard-coded UI
  state
- include committed AuditEvent and Domain Outbox references required by the
  current transition
- display `SANDBOX / NO REAL FUNDS`
- never expose a real signer, real wallet transport, real settlement
  credential, or real transaction hash

Amounts in these fixtures are experiment inputs, not global product limits.
The frozen Policy version determines the result and ordered checks.

## 2. Validation read model

The validation surface consumes a non-authoritative read model named
`PayRunExplanation`:

```text
PayRunExplanation {
  projectId
  payRunId
  payRunVersion
  environment
  canonicalStatus
  intent: purpose, Merchant, amountAtomic, asset, target
  policy: Policy ID, version, decision, ordered checks, explanation
  funding: status, action, route, simulation label, evidence reference
  payment: status, adapter, evidence type/reference, observed outcome,
           verification method
  proof: status, artifact type, reference, checksum, verification
  ledger: status, journal reference
  nextAction
  canonicalReceiptAvailable
  realFundsMoved
}
```

A receipt-style renderer may be called `ValidationReceiptProjection`. It is not
the canonical immutable `Receipt` introduced by the Architecture roadmap in
Slice 7. The projection cannot assign status, synthesize missing evidence, or
advance a PayRun. In particular, `pending_review` and `blocked` have
`canonicalReceiptAvailable=false`.

Every explanation must answer:

1. Why did the PayRun advance or stop?
2. Who is the Merchant/payee?
3. Which Policy version and ordered checks decided?
4. How was Funding prepared, and was it simulated?
5. What Payment and task Proof exists?

## 3. Display labels are not states

The validation page may use concise display copy, but it must preserve the
canonical state value alongside that copy.

| Display label | Canonical state represented |
| --- | --- |
| `created` | `intent_recorded` |
| `policy_allowed` | `policy_allowed` |
| `funding_prepared` | `funding_prepared` |
| `payment_executing` | `payment_executing` |
| `proof_pending` | `proof_collecting` |
| `completed` | `completed` |

`created` and `proof_pending` are product copy only. They do not create new
canonical states or legal transitions.

## 4. Scenario A — Allowed

### Fixture

- Merchant: registered, known, and allowed by the frozen Policy
- purpose: purchase an API, data, or tool-service result
- amount: `0.42 USDC`
- `amountAtomic="420000"`
- Policy result: `allowed`

The Sandbox has an authoritative deterministic reservation for the exact
logical target, so Funding records `action=none` and
`status=not_required`. This still creates a FundingPreparation; Policy never
jumps directly to Payment.

### Canonical trace

```text
intent_recorded
-> policy_evaluating
-> policy_allowed
-> funding_preparing
-> funding_prepared
-> payment_executing
-> payment_succeeded
-> proof_collecting
-> proof_collected
-> ledger_recording
-> completed
```

### Required output

- Sandbox PaymentExecution reports authoritative simulated success
- ExecutionProof contains artifact type, reference, checksum, and verified
  status for the purchased service result
- a balanced Sandbox Ledger journal commits before `completed`
- `realFundsMoved=false` and no real transaction hash exists
- `canonicalReceiptAvailable=false` until the unchanged Slice 7 Receipt work;
  the checkpoint shows only the validation projection
- no ApprovalRequest exists

The explanation must not equate `completed` with a positive task outcome;
`completed` means the controlled lifecycle and Ledger posting completed.

## 5. Scenario B — Needs Review

### Fixture

- Merchant: registered inside the Project with `trustState=new`
- purpose: purchase an API, data, or tool-service result
- amount: `0.44 USDC`
- `amountAtomic="440000"`
- Policy result: `needs_review`
- pending ApprovalRequest semantics are recorded as required by the canonical
  state, but no Approval workflow is implemented for this product checkpoint

The frozen Policy keeps `0.42 USDC` and `0.44 USDC` in the same amount-rule
band. Scenario B differs from Scenario A because of Merchant trust state, not
because an undocumented amount threshold changed.

### Canonical trace

```text
intent_recorded
-> policy_evaluating
-> pending_review
```

The validation scenario stops at `pending_review`.

### Required absence

While pending, the scenario has no:

- FundingPreparation or Funding adapter call
- PaymentExecution or Payment adapter call
- ExecutionProof or artifact-provider call
- Ledger journal
- canonical Receipt
- approval, reject, or automatic-continuation action on the validation page

The page displays `PayRunExplanation` or its
`ValidationReceiptProjection` renderer with
`canonicalReceiptAvailable=false`, `realFundsMoved=false`, and a next action
that accurately says human review is required.

This stopped research view does not replace the canonical Slice 4 Review tests
for approve/recheck/complete and reject paths.

## 6. Scenario C — Blocked

### Fixture

- Merchant fixture exists and resolves within the same Project
- Merchant `trustState=unknown`
- it is not a missing Merchant repository record
- purpose: purchase an API, data, or tool-service result
- amount: `8 USDC`
- `amountAtomic="8000000"`
- Policy result: `blocked`
- primary stable reason: `merchant.unknown`

The frozen Policy fixture makes Merchant trust the authoritative block reason;
the amount is recorded as scenario context and must not create an undocumented
second explanation.

### Canonical trace

```text
intent_recorded
-> policy_evaluating
-> blocked
```

### Required absence

The blocked PayRun has no ApprovalRequest, FundingPreparation, PaymentExecution,
ExecutionProof, Ledger journal, canonical Receipt, or downstream adapter call.
Its explanation records the Policy version, ordered checks, stable block reason,
`canonicalReceiptAvailable=false`, and `realFundsMoved=false`.

A Merchant that cannot be resolved at all remains the separate fail-closed
catalog/dependency case defined by the Policy Engine; it is not this fixture.

## 7. Scenario D — Funding Mismatch

### Fixture

- Merchant ID, payee, purpose, Policy ID/version, target amount, and required
  artifact: exactly the same frozen values used by Scenario A
- target amount: `0.42 USDC`
- `amountAtomic="420000"`
- synthetic Sandbox funding source: ETH on Ethereum
- required logical settlement target: USDC on Base
- Policy result: `allowed`

Only the funding source differs from Scenario A. The source is a deterministic
Sandbox fixture, not a connected-wallet balance or client assertion.

### FundingPreparation

```text
action=swap_and_bridge
status=sandbox_prepared
transactionHash=null
realFundsAvailable=false
realBridgeCapability=false
displayLabel="Simulation completed"
```

The ordered route may explain a proposed source-chain conversion and bridge to
Base USDC. It is simulation evidence only. No allowance, signature, swap,
bridge, broadcast, or source/target chain transaction occurs.

### Canonical trace

```text
intent_recorded
-> policy_evaluating
-> policy_allowed
-> funding_preparing
-> funding_prepared
-> payment_executing
-> payment_succeeded
-> proof_collecting
-> proof_collected
-> ledger_recording
-> completed
```

After the explicitly simulated FundingPreparation, the scenario continues the
full Sandbox lifecycle through Sandbox Payment, verified task Proof, balanced
Sandbox Ledger, and `completed`. Downstream Sandbox stages do not retroactively
turn the Funding simulation into real funding evidence.

The checkpoint still uses `canonicalReceiptAvailable=false` until the unchanged
Slice 7 Receipt work; completion is rendered through the non-authoritative
validation projection.

### Forbidden claims

The page, explanation, and research script must not say:

- real ETH was held, approved, swapped, or bridged
- real USDC became available on Base
- a real payment rail moved funds
- a transaction hash proves Funding
- Funding was unqualifiedly “prepared” or “succeeded”

The required wording is `Simulation completed`, with
`realFundsMoved=false` and persistent `SANDBOX / NO REAL FUNDS` labeling.

## 8. Scenario contract Gate

Before the product study, automated Slice 4 tests must prove the exact canonical
traces, required artifacts, forbidden artifacts, and absence of downstream
adapter calls for Review and Blocked. The read-only surface must prove that its
status and evidence come from the same project-scoped records rather than
client state.

User-research scoring is defined separately in
[Trust Metrics](./TRUST_METRICS.md). It cannot replace these technical tests.
