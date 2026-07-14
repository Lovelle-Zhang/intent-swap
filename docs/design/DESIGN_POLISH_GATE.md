# ZenFix Design Polish Gate

**Status:** Active future UI acceptance gate
**Scope:** Product comprehension, hierarchy, accessibility, and evidentiary honesty
**Authority boundary:** This Gate supplements but never replaces Architecture, Slice, security, Hosted, or Live Money Gates.

## Gate purpose

The Design Polish Gate determines whether a ZenFix product surface is clear,
coherent, and safe enough to ship for its authorized environment. It is not a
visual-taste review. A surface fails when it obscures authority, evidence,
state, or safety—even if it looks polished.

## 1. The 60-second understanding principle

For a representative PayRun, a target user must independently identify within
60 seconds:

1. the decision or outcome;
2. why it happened;
3. the Agent and intended Merchant;
4. the amount and governing Policy;
5. whether human Approval applied;
6. Funding status;
7. separate Payment and task Proof status;
8. Ledger result and the safe next action; and
9. whether the environment moved real funds.

The Product Validation protocol and thresholds remain defined in
`docs/product/`. A design review cannot substitute internal familiarity or a
facilitator explanation for independent comprehension.

## 2. Information hierarchy Gate

A conforming surface uses this order:

1. Decision
2. Reason
3. Execution
4. Technical Evidence

Pass criteria:

- decision and reason are visible without expanding technical detail;
- Policy authority appears before Funding route mechanics;
- required next action has a clear owner;
- IDs, hashes, versions, and provider references remain available but
  subordinate; and
- dense tables preserve the same priority in default columns and narrow
  layouts.

## 3. Product identity Gate

The surface must be recognizable as an Agent Payment Control Layer.

It fails if:

- wallet balance, connected address, token, chain, price, swap, or route is the
  primary hero or navigation;
- users describe the product primarily as a wallet, DEX, bridge, or ordinary
  payment terminal;
- Agent purpose, Policy, and evidence are harder to find than transaction
  mechanics; or
- trading-terminal patterns create a false expectation of manual execution.

## 4. Status-language Gate

- Primary labels follow the [Status Language Specification](./STATUS_LANGUAGE_SPEC.md).
- Canonical states remain accurate and accessible.
- Status never relies on color alone.
- Allowed is not shown as paid or completed.
- Needs Review and Blocked expose no forbidden execution action.
- Completed appears only after balanced Ledger commit.
- Unknown, stale, timeout, and reconciliation states are not converted into
  optimistic success or generic failure.

## 5. Evidence-explanation Gate

Every evidence claim names its authority and limitation:

- Policy explains authorization.
- Approval identifies the authenticated human and immutable scope when used.
- Funding explains `not_required`, simulated, or evidence-backed preparation.
- Payment evidence explains the rail outcome.
- ExecutionProof explains the purchased task or artifact outcome.
- Ledger explains the balanced accounting record.
- Audit explains actor, action, reason, and version lineage.

Payment, Proof, Ledger, Audit, Outbox, and Receipt cannot substitute for one
another. Missing evidence is displayed as missing. A raw hash is not accepted
as a human explanation.

## 6. Technical-detail Gate

Technical detail is useful when it supports investigation. It must:

- retain full values without breaking layout;
- default to shortened or collapsed display where appropriate;
- identify field meaning and source;
- be keyboard reachable and readable; and
- avoid exposing secrets, credentials, or cross-project information.

The default experience must not require users to parse JSON, UUIDs, hashes,
atomic values, or provider codes to understand the decision.

## 7. Sandbox and environment Gate

Every Sandbox page, detail, export, and receipt-style projection shows
`SANDBOX / NO REAL FUNDS` persistently.

It fails if any presentation implies:

- real funds were available or moved;
- a real swap or bridge occurred;
- a Sandbox payment reference proves settlement;
- a balanced Sandbox journal is production accounting; or
- the product is Hosted, Production, or Live Money ready without its
  independent Gate.

## 8. Interaction and control Gate

For every state-changing action in a future authorized surface:

- the action maps to one application command and legal state transition;
- scope, actor, consequences, and evidence requirements are clear;
- loading does not imply success;
- stale version and idempotent replay behavior is designed;
- error, timeout, unknown, and recovery states are explicit; and
- destructive or irreversible consequences receive appropriate confirmation.

A read-only surface must have no mutation route, server action, hidden writer,
or control-loop invocation.

## 9. Accessibility and responsive Gate

Required validation includes:

- keyboard-only completion of all authorized tasks;
- logical focus order and visible focus;
- semantic headings, landmarks, tables, labels, and status announcements;
- text and non-text contrast in every state;
- no information conveyed by color, hover, motion, or pointer alone;
- reduced-motion support;
- zoom and reflow without clipped decisions or actions; and
- laptop, tablet, and mobile layouts preserving the decision hierarchy.

Automated checks support but do not replace manual keyboard, screen-reader,
contrast, and responsive review.

## 10. Content and recovery Gate

The surface includes reviewed content for:

- loading;
- empty;
- no-results;
- stale data;
- permission denied;
- dependency unavailable;
- version conflict;
- unknown external outcome;
- terminal failure; and
- partial projection or evidence unavailability.

Copy states what is known, what is not known, whether an external effect may
have occurred, and what safe action is available.

## 11. Validation evidence

Before a future UI work unit passes this Gate, its PR or release evidence must
include:

- exact surface and environment scope;
- mapping to Product Principles and Status Language;
- representative Allowed, Needs Review, Blocked, Failed, Completed, empty,
  stale, and error states applicable to that work unit;
- responsive screenshots or equivalent visual evidence;
- keyboard and accessibility results;
- proof that displayed status comes from canonical read models;
- proof that refresh/retry does not create unauthorized mutation; and
- the relevant Product Validation or usability result when required.

Not every work unit must manufacture domain fixtures it does not own. It must
test every public behavior it introduces and document explicitly deferred
states.

## Blocking failures

Any one of the following blocks acceptance:

- a user cannot explain the decision and reason within the applicable 60-second
  validation protocol;
- Product identity is mistaken for wallet, swap, or trading;
- status or evidence meaning conflicts with Architecture;
- Payment and task Proof are conflated;
- Needs Review or Blocked presents an execution path;
- technical metadata obscures the primary explanation;
- Sandbox appears to move real funds;
- critical information depends only on color or motion; or
- the surface mutates state outside its authorized application boundary.

## Non-goals

This Gate does not authorize Dashboard implementation, change any canonical
state, establish a production token system, pass Product Validation, or confer
Hosted, Production, Security, or Live Money readiness.
