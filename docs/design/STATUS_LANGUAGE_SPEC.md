# ZenFix Status Language Specification

**Status:** Active product language baseline
**Scope:** Primary user-facing status vocabulary and semantic color
**Canonical authority:** The PayRun state machine remains unchanged and visible where required.

## Purpose

ZenFix uses one consistent primary language across overview cards, tables,
detail pages, alerts, and receipt-style projections. A primary status is a
comprehension label; it cannot create, rename, collapse, or advance a canonical
state.

## Primary statuses

| Label | Meaning | Canonical relationship | User implication |
| --- | --- | --- | --- |
| **Allowed** | Current Policy permits the evaluated immutable scope | `PolicyDecision.outcome=allowed`; often associated with `policy_allowed` before later stages | Authorized to proceed through the controlled lifecycle; not yet paid or completed |
| **Needs Review** | Policy requires an eligible human decision | `pending_review` with a pending ApprovalRequest | No Funding, Payment, Proof, or Ledger exists; human review is the next action |
| **Blocked** | Policy has made a terminal risk/business block decision | `blocked` | The PayRun stopped and no downstream execution exists |
| **Failed** | A controlled stage ended with authoritative failure semantics | `failed` | The user needs the failure stage, reason, effect boundary, and recovery guidance |
| **Completed** | The controlled lifecycle and balanced Ledger commit finished | `completed` | Policy, Funding, Payment, Proof, Ledger, and Audit evidence exists; task outcome may still be negative |

## Semantic color tokens

The following values establish direction and consistent meaning. Future
implementation must verify accessible contrast in its actual typography,
surface, focus, hover, and disabled contexts.

| Status | Text | Surface | Border | Semantic intent |
| --- | --- | --- | --- | --- |
| Allowed | `#166534` | `#F0FDF4` | `#86EFAC` | Permission and controlled continuation |
| Needs Review | `#92400E` | `#FFFBEB` | `#FCD34D` | Attention and human decision required |
| Blocked | `#991B1B` | `#FEF2F2` | `#FCA5A5` | Policy stop; no continuation |
| Failed | `#9F1239` | `#FFF1F2` | `#FDA4AF` | Operational failure requiring explanation or recovery |
| Completed | `#1E3A8A` | `#EFF6FF` | `#93C5FD` | Controlled lifecycle finished with evidence |

Color is never the only signal. Every instance uses the exact text label and,
where compactness requires it, a stable icon or shape. Blocked and Failed must
remain distinguishable in words and explanations even if rendered without
color.

## Usage rules

### Allowed

- Use for an allowed Policy decision, not as a synonym for success.
- Do not show a checkmark that implies Payment or task completion.
- Pair with the decisive Policy reason and the next controlled stage.
- When a human Approval was required, explain “Policy allowed after Approval”
  and retain the authenticated Approval basis.

### Needs Review

- Use exactly `Needs Review`, not `Pending`, `Waiting`, or `Attention` as the
  primary label.
- Name the Policy reason, Approval scope, expiry, and eligible next action.
- Never expose Funding, Payment, Retry, or Execute actions from this state.

### Blocked

- Use for canonical Policy `blocked`, not for dependency errors, missing data,
  or a human denial.
- Explain the stable reason without leaking protected configuration.
- Do not imply that changing the client UI can bypass the decision.

### Failed

- State which stage failed and whether an external effect was attempted or
  authoritatively ruled out.
- Do not convert timeout, unknown outcome, or reconciliation into Failed until
  canonical evidence allows it.
- Recovery copy must describe the actual safe path, not a generic “try again.”

### Completed

- Use only for canonical `completed` after balanced Ledger commit.
- Explain that lifecycle completion is distinct from a positive task outcome.
- Keep Payment evidence and task Proof separate.
- In Sandbox, pair with `SANDBOX / NO REAL FUNDS`; never imply settlement.

## Other canonical states

The five primary labels are not an exhaustive replacement for canonical
states. In-progress and other terminal states such as `approved`,
`funding_preparing`, `payment_unknown`, `denied`, `expired`, `cancelled`, or
`ledger_recording` retain their exact canonical meaning.

When such a state is visible:

- show a plain-language stage label and the canonical value in details;
- explain its reason, freshness, and next action;
- do not silently map it to one of the five primary statuses; and
- do not add a new primary status without updating this specification and
  reconciling it with Architecture.

## Copy pattern

Every status presentation should be able to form this sentence:

> **[Primary or stage status]** because **[authoritative reason]**. Next:
> **[safe action or “no action required”]**.

Examples:

- **Allowed** because the Merchant, amount, Agent capability, and evidence
  requirements passed Policy v3. Next: prepare Funding.
- **Needs Review** because the Merchant is new to this Project. Next: eligible
  human review; no payment has been attempted.
- **Blocked** because the Merchant trust state is unknown. Next: no downstream
  action is available for this PayRun.
- **Completed** because verified Sandbox Payment, task Proof, and balanced
  Sandbox Ledger evidence were committed. No real funds moved.

## Forbidden language

- `Success` when the canonical meaning is only Allowed or Payment succeeded.
- `Approved` for a Policy-only automatic allow.
- `Pending` without naming the stage and owner of the next action.
- `Completed` before Ledger commit.
- `Settled`, `funded`, `swapped`, or `bridged` for Sandbox simulation.
- Provider-specific labels as the only user-facing status.

## Non-goals

This specification does not alter the state machine, define component tokens,
implement a theme, or decide how future canonical states transition. It does
not make a color palette evidence of accessibility without implementation-
specific testing.
