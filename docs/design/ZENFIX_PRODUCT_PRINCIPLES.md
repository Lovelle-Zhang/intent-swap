# ZenFix Product Principles

**Status:** Active product design baseline
**Scope:** Product identity, experience priorities, and future UI decisions
**Architecture authority:** The accepted Architecture and ADRs remain normative for domain and execution behavior.

## Design authority

The seven documents linked at the end of this file jointly form the ZenFix
Product Design Baseline. Future product and UI proposals must use this suite as
their single design reference and identify any deliberate exception during
review.

This design authority is subordinate to accepted Architecture for domain,
state, security, persistence, and execution semantics. Existing design
backlogs are planning inputs, not parallel authority, and cannot override this
baseline or authorize implementation.

## Product definition

ZenFix is an **Agent Payment Control Layer**. It lets a responsible team define
how an Agent may spend, understand every decision, and verify what happened
after a payment attempt.

The core product object is the **Agent**, not a wallet. A wallet, rail, asset,
chain, quote, or funding route may support a PayRun, but none defines the
product or owns its navigation.

The primary product story is:

```text
Agent intent
→ Policy decision
→ human Approval when required
→ controlled execution
→ Payment and task Proof
→ Ledger and Audit evidence
```

This product story is a presentation of the canonical lifecycle. It does not
replace or shorten the lifecycle defined by Architecture.

## What ZenFix is not

### ZenFix is not a wallet

A wallet answers what account holds or signed something. ZenFix answers which
Agent requested an economic action, why it was permitted or stopped, what
scope applied, and what evidence was committed.

Wallet connection, balances, addresses, and signing controls must remain
subordinate to Funding or future live-rail setup. They must not become the
homepage, primary navigation, or main measure of product value.

### ZenFix is not a Swap product

Swap and bridge mechanics are possible Funding Preparation details. They are
never the primary workflow, product identity, or success outcome. A route
diagram must not outrank the Policy decision or imply that a simulated route
moved real funds.

### ZenFix is not an ordinary payment tool

An ordinary payment tool can stop at payee, amount, and transfer status.
ZenFix must also explain Agent purpose, Policy authority, Approval basis,
execution outcome, task Proof, Ledger treatment, and Audit lineage.

### ZenFix is not a transaction terminal

Token tickers, chain selectors, price movement, routing, balances, and raw
hashes must not dominate the interface. Technical evidence remains available,
but only after the decision and its meaning are clear.

## Primary user and job

The first user is a developer, operator, or responsible team lead managing an
Agent that may purchase API access, data, model usage, or tool services.

Their job is:

> Let an Agent request a service purchase inside explicit rules, then
> understand the decision and outcome without reconstructing the story from
> wallet, application, and provider logs.

Autonomy does not mean self-approval or direct payment. It means predictable
operation inside authority that a human team can inspect and govern.

## Four product design principles

### 1. Decision first

Every overview, list row, detail page, alert, and receipt-style projection must
lead with:

1. the current decision or outcome;
2. the reason;
3. the next required action, if any.

IDs, hashes, rails, chains, and timestamps are supporting detail. A user must
not parse execution internals to discover whether a PayRun was allowed,
requires review, was blocked, failed, or completed.

### 2. Evidence first

Claims must be linked to authoritative evidence. Payment evidence and task or
artifact Proof must be shown as separate concepts. A transaction reference,
provider response, HTTP success, or balanced Sandbox journal cannot by itself
prove that the purchased task completed or that real settlement occurred.

Where evidence is absent, the interface says it is absent. It does not infer,
manufacture, or decorate an optimistic success.

### 3. Policy first

Policy is the authority that permits, reviews, or blocks Agent spend. Product
surfaces must make the Policy version, decisive checks, limits, and Approval
basis understandable before presenting Funding or Payment mechanics.

“Decision first” defines visual priority; “Policy first” defines authority.
The decision is shown first because it is what the user needs to understand,
and its explanation must immediately expose the governing Policy.

### 4. Auditability first

Every important product statement must be traceable to versioned, project-
scoped records. History is append-only where Architecture requires it. The
interface must preserve actor, time, reason, version, and evidence lineage
without turning raw technical metadata into the primary experience.

Corrections add new controlled records; they do not rewrite settled history.

## Experience rules

- Use plain-language decisions before canonical and provider-specific detail.
- Preserve canonical status and evidence meaning; display copy cannot invent a
  state or transition.
- Keep Policy, Approval, Funding, Payment, Proof, Ledger, Audit, and Receipt
  responsibilities visually distinct.
- Make stopped paths explicit: Needs Review and Blocked expose no downstream
  execution action.
- Identify Sandbox continuously as `SANDBOX / NO REAL FUNDS` and never imply
  real swap, bridge, payment, settlement, or funds availability.
- Treat missing, stale, unknown, or conflicting evidence as a visible problem,
  not an implicit success.
- Design for the 60-second comprehension Gate before adding density, motion,
  or customization.

## Decision hierarchy for future UI work

When requirements compete, use this order:

1. Architecture correctness and safety
2. decision comprehension
3. evidence and auditability
4. operator actionability
5. information density
6. visual polish and motion

No visual improvement may weaken a Policy boundary, hide an absent artifact,
collapse distinct evidence types, or imply live-money readiness.

## Explicit non-goals

This baseline does not implement a Dashboard, change the PayRun Domain, add a
state, authorize a route, define a production design system, or establish
Hosted or Live Money readiness. It governs future product and UI proposals;
each implementation remains subject to its Architecture Slice and Gate.

## Related design specifications

- [Agent Profile Specification](./AGENT_PROFILE_SPEC.md)
- [PayRun Ledger Specification](./PAY_RUN_LEDGER_SPEC.md)
- [Command Center Information Architecture](./COMMAND_CENTER_INFORMATION_ARCHITECTURE.md)
- [Status Language Specification](./STATUS_LANGUAGE_SPEC.md)
- [Dashboard Design References](./DASHBOARD_DESIGN_REFERENCES.md)
- [Design Polish Gate](./DESIGN_POLISH_GATE.md)
