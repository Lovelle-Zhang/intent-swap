# ZenFix Command Center Information Architecture

**Status:** Active future-product information architecture
**Product name:** ZenFix Control Center
**Implementation:** Deferred to an Architecture-authorized UI work unit

## Purpose

The ZenFix Control Center is the future operating surface for teams managing
Agent economic activity. It combines the scanability of a SaaS Dashboard, the
situational awareness of a Control Center, and the causal clarity of a
workflow system.

This document defines navigation and hierarchy only. It does not implement a
Dashboard, introduce a data source, add a route, or change any Slice.

## Three design inputs

### A. SaaS Dashboard

Absorb predictable navigation, overview cards, filters, tables, detail pages,
and responsive density. Use these patterns to make recurring operations easy
to scan.

Do not absorb generic vanity metrics, decorative charts, or account settings
that are unrelated to Agent payment control.

### B. Control Center

Absorb current operating status, Agent health, trust indicators, exception
queues, freshness, and environment awareness.

“Live” means the latest authoritative version with a visible observed time. It
does not promise real-time streaming, a websocket, or immediate consistency
unless a future implementation explicitly provides those contracts.

### C. Workflow

Absorb the ordered controlled lifecycle:

```text
Intent → Policy → Approval when required → Funding → Payment → Proof → Ledger
```

Use the workflow to explain why an action advanced or stopped. Do not turn it
into a clickable bypass, a generic automation builder, or an optimistic
progress animation.

## Global information hierarchy

### Level 1 — Decision

Show the current decision or outcome first:

- Allowed
- Needs Review
- Blocked
- Failed
- Completed

The user should understand what happened or what needs attention without
opening technical detail.

### Level 2 — Reason

Explain the decisive Policy checks, Approval basis, Agent purpose, Merchant,
amount, risk, and next action.

### Level 3 — Execution

Show Funding, Payment, Proof, and Ledger as separate stages with explicit
status and absence semantics.

### Level 4 — Technical Evidence

Expose canonical states, IDs, versions, hashes, provider references, Audit
sequence, Outbox lineage, and provenance. Keep this accessible but visually
subordinate.

## Proposed top-level navigation

| Area | User question | Primary contents |
| --- | --- | --- |
| Command Center | What needs attention now? | Decisions, exceptions, Agent health, recent PayRuns, environment |
| Agents | Which Agent has what authority? | Agent Profiles, purpose, owner, capabilities, limits, risk, history |
| Pay Runs | What economic actions happened and why? | PayRun Ledger, filters, lifecycle detail, evidence |
| Approvals | What requires a human decision? | Scoped review queue and separation-of-duties context; future implementation |
| Policies | Which rules govern Agent spend? | Policy versions, limits, Merchant/system scope, decision explanations |
| Evidence | What proves payment and task outcome? | Payment evidence, ExecutionProof, Ledger, future Receipts, Audit lineage |
| Developer | How is the Sandbox integration behaving? | Project/environment, integration diagnostics, future API/webhook surfaces |

Wallet, Swap, Bridge, Tokens, and Portfolio are not top-level ZenFix
navigation. Funding mechanics appear only inside relevant PayRun or controlled
configuration context.

## Command Center overview

The default overview follows this order:

1. **Environment and safety banner** — especially `SANDBOX / NO REAL FUNDS`.
2. **Decision queue** — Needs Review, Blocked, Failed, and stale/unknown work
   ordered by required attention.
3. **Agent health** — active authority, restrictive controls, risk explanation,
   and last authoritative update.
4. **Operational summary** — Allowed and Completed trends with counts, not
   wallet balances or trading performance.
5. **Recent PayRun Ledger** — Agent, purpose, Merchant, amount, decision,
   evidence availability, and time.
6. **Trust and evidence health** — missing Proof, reconciliation, Ledger, Audit,
   or freshness problems.

Overview cards are entry points into authoritative lists. A card count must
have a defined scope, time window, environment, and freshness timestamp.

## Agent health

Agent health is a control summary, not a gamified score. It may combine:

- current Agent status and Policy binding;
- Project, Agent, Merchant, and rail restrictions;
- emergency controls;
- unresolved Needs Review, Blocked, Failed, or unknown outcomes;
- missing or stale evidence; and
- last verified time.

Every indicator includes a text label and explanation. Color alone is not a
trust signal. Unknown or unavailable state cannot appear healthy.

## Trust indicators

Trust is earned by clarity and evidence. Useful indicators include:

- Policy version and decisive checks;
- authenticated Approval identity and bound scope;
- Funding simulation or evidence label;
- separate Payment and task Proof verification;
- balanced Ledger status;
- complete Audit lineage; and
- environment and data freshness.

Avoid a single unexplained “trust score.” If a composite is ever introduced,
its factors, source, and limitations must be visible.

## PayRun workflow presentation

The lifecycle strip is descriptive and state-aware:

- completed stages show authoritative evidence;
- the current stage shows its decision, reason, and next action;
- absent forbidden stages are labeled as not created, not merely dimmed;
- unknown or reconciliation states remain unresolved;
- technical references expand from their owning stage.

Needs Review stops before Reservation/Funding. Blocked stops after Policy.
Completed requires Policy, Funding, Payment, Proof, Ledger, and Audit evidence
as defined by Architecture.

## Tables and cards

Use cards for small, prioritized summaries and tables for comparable records.
Do not reproduce the same metric in multiple cards without a distinct user
question. Tables should support keyboard navigation, deterministic sorting,
clear empty states, and column prioritization on smaller screens.

The default density favors the 60-second comprehension goal. Technical columns
are optional or expandable; decision, reason, Agent, Merchant, amount, and time
are not.

## Detail-page pattern

Every major detail page uses a common sequence:

1. identity and primary status;
2. plain-language summary and next action;
3. governing Policy or control;
4. execution/evidence sections;
5. history, provenance, and technical metadata.

This consistency allows a user to move between Agent, PayRun, Approval, Policy,
and Evidence without relearning the hierarchy.

## Responsive and accessibility boundary

- Status always has text and, when useful, an icon in addition to color.
- Keyboard order follows visual and causal hierarchy.
- Collapsed technical detail remains reachable without pointer-only controls.
- Narrow layouts preserve decision and reason before secondary columns.
- Motion may explain an observed state change but never claim progress before
  authoritative confirmation.

## Non-goals

This IA does not authorize routes, components, mutations, Approval execution,
Policy editing, API keys, webhooks, Hosted access, analytics infrastructure,
or Live Money. It does not define the root cutover or alter Architecture Slice
5 or Slice 8.
