# ADR-0002: PayRun Lifecycle Is the Only Execution Path

**Status:** Accepted
**Date:** 2026-07-12
**Owner:** ZenFix Architecture

## Context

Payment products often add policy, history, or receipts around an existing executor while leaving direct execution routes intact. That produces `Payment → Ledger` shortcuts and makes controls advisory instead of authoritative.

ZenFix differentiates itself by controlling the entire payment lifecycle.

## Decision

The only legal path is:

```text
Intent → Policy → [Approval iff needs_review] → Funding Preparation
→ Payment → Execution Proof → Ledger
```

- PayRun is the aggregate that owns lifecycle state.
- All write surfaces call the same application service and state machine.
- Approval always occurs before Funding and always triggers a fresh Policy evaluation.
- A `not_required` FundingPreparation is recorded when conversion is unnecessary.
- Payment success cannot complete a PayRun without verified ExecutionProof and Ledger commit.
- Legacy direct execute, direct USDT subscription payment, conditional-order, manual-exec, webhook, and callback routes cannot create canonical PayRun success.

## Security invariants

- Client-supplied status, policy decision, reviewer, proof, and transaction hash are untrusted.
- Blocked, denied, and pending-review runs have no Funding or downstream execution record. Intent/Approval/Policy expiry also ends before Funding; Funding plan/evidence expiry may retain FundingPreparation but never has Payment or ExecutionProof.
- Illegal transitions fail before external side effects.
- External callbacks trigger verification; they do not assign success.

## Rejected alternatives

- Keeping a direct executor and “backfilling” Ledger was rejected because it bypasses Policy and Funding evidence.
- Letting each API/UI flow orchestrate its own stages was rejected because behavior and failure handling diverge.
- Treating transaction hash as Proof was rejected because submission is not settlement or task completion.

## Failure behavior

Unknown state or missing stage evidence pauses or fails closed at the current stage. Ambiguous external outcome enters reconciliation. It never skips forward to keep a demo moving.

## Rollback

Domain/state-machine slices are additive before root cutover. Rollback reverts the slice or disables the new surface; it does not reclassify already observed financial outcomes.

## Verification

Table-driven transition tests cover every legal and illegal edge. Integration tests prove every API/SDK/UI command reaches the same service and that blocked/review paths produce no funding/payment/proof.
