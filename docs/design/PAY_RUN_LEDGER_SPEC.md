# PayRun Ledger Specification

**Status:** Active product model specification
**Scope:** User-facing history and explanation of Agent economic actions
**Canonical authority:** PayRun, evidence, Audit, and Ledger records defined by Architecture

## Definition

The **PayRun Ledger** is the user-facing record of Agent economic actions.

It is not transaction history. Transaction history starts with a transfer and
asks where money went. The PayRun Ledger starts with Agent intent and explains
the complete controlled action:

```text
why the Agent requested it
→ which Policy decided
→ whether a human Approval applied
→ what was executed
→ what Payment and task Proof exists
→ how the canonical Ledger recorded the outcome
```

“PayRun Ledger” is a product view. It does not replace the canonical balanced
`LedgerJournal`, append-only Audit, Payment evidence, ExecutionProof, or future
immutable Receipt.

## Required questions

Every PayRun Ledger record must let a user answer:

1. **Why did the Agent pay or stop?**
2. **Who allowed it?** Policy alone, or Policy plus a bound human Approval?
3. **Who was the intended Merchant/payee?**
4. **How much was requested and in which asset?**
5. **Which Policy version and decisive checks applied?**
6. **What Payment evidence and task Proof exists?**
7. **Did the controlled lifecycle complete?**
8. **How did the canonical Ledger record the result?**

If the lifecycle stopped before a later stage, the record must answer with an
explicit absence rather than an empty or inferred success.

## Record hierarchy

### Level 1 — Decision

- primary product status;
- Agent and Merchant;
- amount and asset;
- short reason;
- occurred or last-updated time.

### Level 2 — Authority and reason

- Agent purpose and PayIntent;
- Policy ID/version and decisive checks;
- Approval basis, reviewer, and scope when present;
- next action for a stopped or pending record.

### Level 3 — Execution

- Funding Preparation status and whether it was not required, simulated, or
  evidence-backed;
- Payment status and verified provider evidence;
- task/artifact Proof status and outcome;
- canonical Ledger journal status and balance result.

### Level 4 — Technical evidence

- PayRun and aggregate IDs;
- versions, digests, hashes, execution keys, and provider references;
- Audit sequence and Domain Outbox lineage;
- environment and provenance metadata.

Technical evidence remains accessible and copyable but must not dominate list
rows or the first screenful.

## List view

The default PayRun Ledger table or card list should expose:

| Field | Purpose |
| --- | --- |
| Status | Immediate decision or terminal outcome |
| Agent | Economic actor whose authority was evaluated |
| Purpose | Why the action was requested |
| Merchant | Intended payee or service provider |
| Amount | Human-readable amount with asset |
| Policy reason | Decisive allow, review, block, or failure explanation |
| Evidence summary | Separate Payment, Proof, and Ledger availability |
| Time | Creation or latest authoritative transition time, clearly labeled |

Default sorting is newest authoritative activity first. Filters may include
Agent, primary status, Merchant, Policy, environment, and time. A filter never
changes canonical records or hides the active environment label.

## Detail view

The detail view follows the canonical lifecycle:

1. Intent
2. Policy
3. Approval, only when required
4. Budget Reservation and Funding Preparation
5. Payment
6. Execution or artifact Proof
7. Ledger
8. Audit and event lineage

The lifecycle representation must show skipped or absent stages accurately.
Needs Review and Blocked records must not display Funding, Payment, Proof, or
Ledger as pending work when those artifacts are forbidden.

## Authority labels

The “Who allowed it?” answer must use one of these meanings:

- **Policy allowed:** deterministic Policy permitted the unchanged scope; no
  human Approval was required.
- **Policy allowed after Approval:** an authenticated human Approval covered
  the immutable scope, followed by the mandatory Policy recheck.
- **Not allowed:** Needs Review, Blocked, denied, expired, cancelled, or failed
  records must not name a downstream executor as authorization.

An automated allow must never be described as human self-approval.

## Evidence separation

The product must keep these statements separate:

- **Funding:** whether the required asset/chain was already matched, simulated,
  or evidence-backed.
- **Payment:** whether the payment rail accepted and completed the payment
  instruction.
- **Proof:** whether the purchased service or task produced a verified artifact
  and whether its outcome was positive or negative.
- **Ledger:** whether a balanced journal was committed for the observed result.
- **Audit:** who or what caused each controlled transition and why.

A hash or transaction reference is supporting evidence, not a status label.

## Sandbox presentation

Every Sandbox PayRun Ledger surface must persistently show
`SANDBOX / NO REAL FUNDS`. Simulated account roles, balanced journals, payment
references, and `sandbox_prepared` Funding prove only internal Sandbox
consistency. They must not be described as real funds, settlement, swaps, or
bridges.

## Corrections and history

Terminal PayRuns and canonical Ledger history are not edited to clean up the
story. A changed intent or financial correction is represented by a new
controlled PayRun and, where applicable, reversal/correction journal entries.
Future Receipt corrections append immutable versions with lineage.

The product view may connect these records through `supersedes`, correction,
or reversal relationships. It may not overwrite the earlier record.

## Read-model boundary

The PayRun Ledger should be built as a read projection over project-scoped
authorities. It may combine human-readable explanations, but it cannot assign
status, synthesize evidence, execute an Approval, retry a payment, or mutate a
PayRun.

PV-1's `PayRunExplanation` and `ValidationReceiptProjection` demonstrate this
read-only explanatory boundary. They are not the future canonical Receipt.

## Non-goals

This document does not implement a Ledger page, change accounting semantics,
define tax or production settlement, add a canonical Receipt, or authorize
Live Money. It does not rename transaction history in legacy surfaces or make
wallet activity a source of PayRun truth.
