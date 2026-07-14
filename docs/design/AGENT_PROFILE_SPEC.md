# Agent Profile Specification

**Status:** Active product model specification
**Scope:** Future Agent-facing product surfaces only
**Implementation:** Not authorized by this document

## Purpose

The Agent Profile is the primary product record through which a human manager
understands an Agent's purpose, authority, risk posture, and economic history.
It is not a wallet profile, credential store, or alternate domain aggregate.

This specification defines the user-facing model. Existing canonical Agent,
Project, Policy, Approval, PayRun, and kill-switch contracts remain the source
of truth. Any future schema change requires its own Architecture-authorized
Slice.

## Product identity

An Agent Profile answers:

- Who or what is this Agent?
- Who is responsible for it?
- What work is it meant to perform?
- Which systems and Merchants may it use?
- How much may it spend, under which Policy and Approval rules?
- Is it currently safe and permitted to operate?
- What economic actions has it attempted or completed?

## Required fields

| Field | Product meaning | Display rule |
| --- | --- | --- |
| Agent ID | Stable project-scoped identity | Shortened by default; full value available in technical details |
| Name | Human-recognizable label | Primary title; never replaces Agent ID as authority |
| Owner / Human Manager | Authenticated person or team responsible for the Agent | Show identity and responsibility; do not imply approver authority automatically |
| Purpose | Plain-language description of the work the Agent performs | Lead with user value, not runtime implementation |
| Capability | Actions the Agent is authorized to request | Group by meaningful capability; show blocked or missing capability explicitly |
| Allowed Systems | APIs, tools, datasets, or workflow systems the Agent may use | Show scope and source Policy; never expose credentials |
| Allowed Merchants | Project-resolved Merchant set or category constraints | Show trust state and Policy relationship, not only payee identifiers |
| Spending Limits | Per-action and period limits relevant to the Agent | Use canonical atomic money projected into human-readable amounts; include asset and period |
| Approval Rules | Conditions that require human review and who is eligible to review | Distinguish requester, approver, and executor roles |
| Risk Level | Current risk classification derived from authoritative controls | Explain factors and freshness; never present an unexplained score |
| Emergency Pause | Most restrictive applicable control and its reason | Make effect and scope clear; fail closed when control state is unavailable |
| PayRun History | Project-scoped economic action history for the Agent | Link to PayRun Ledger records, not wallet transaction history |

## Profile header

The first screenful prioritizes:

1. Agent name and purpose
2. current operating state and risk explanation
3. responsible owner or human manager
4. Policy binding and spending authority
5. outstanding Needs Review or Blocked PayRuns

Agent ID, versions, digests, and provider references belong in a collapsed or
secondary technical section.

## Authority and responsibility

The profile must not blur these roles:

- **Owner / Human Manager:** accountable for configuration and operation.
- **Requester:** Agent or authenticated actor that initiated a PayRun.
- **Approver:** authenticated human allowed to decide a review request.
- **Executor:** service or worker that performs an authorized external step.

Ownership does not automatically grant Approval authority. A requester cannot
approve its own request, and a service executor cannot act as a human approver.
Future UI must surface these separations when they affect an action.

## Capability and allowed-system model

Capabilities describe permitted intents, not credentials or direct execution
methods. Each capability should show:

- a plain-language name and purpose;
- the allowed system or Merchant scope;
- the governing Policy and version;
- required evidence or artifact type;
- spending and Approval conditions; and
- whether the capability is active, restricted, or unavailable under current
  controls.

The interface must not imply that an allowed capability guarantees a future
PayRun will be allowed. Every PayRun receives a fresh deterministic Policy
evaluation using current context.

## Spending limits and Approval rules

Limits must be presented as control rules, not wallet balances. The profile may
show the limit, applicable time window, current authoritative usage, and active
reservation impact when those projections exist. It must not estimate
available spend from client state.

Approval rules must state:

- what condition triggers review;
- the scope an Approval binds;
- when the Approval expires;
- which authenticated roles are eligible to decide; and
- that any material scope change requires Policy re-evaluation and, when
  necessary, a new Approval.

## Risk level

Risk is explanatory, not decorative. A risk presentation must include:

- the authoritative source and evaluated time;
- the factors that materially influence the result;
- the applicable Project, Agent, Merchant, and Policy scope; and
- the action the user should take, when one exists.

Risk color alone is insufficient. A label and explanation are mandatory.

## Emergency Pause

Emergency Pause is a future product control over accepted kill-switch
semantics, not a new Agent status. The product model must show:

- whether a restrictive control currently prevents new work;
- the scope of the control;
- who activated it and why, when authorized for display;
- when the control state was last verified; and
- what happens to new, reserved, submitted, or ambiguous work.

The UI must never promise that pause retracts an already submitted external
effect. Unknown outcomes remain subject to reconciliation.

## PayRun History

The profile's history is a filtered view of the
[PayRun Ledger](./PAY_RUN_LEDGER_SPEC.md). Each row leads with decision,
reason, Merchant, amount, and time. It must preserve links to Policy, Approval,
Payment, Proof, Ledger, and Audit evidence without copying those authorities
into the Agent Profile.

## Empty, stale, and unavailable states

- No PayRuns: explain that no economic action has been recorded; do not insert
  demo history.
- Missing configuration: identify the missing control and prevent an implied
  allow.
- Stale projection: show last verified time and withhold freshness claims.
- Unavailable authority: show unavailable and fail closed; do not substitute a
  cached or cross-project record without an approved contract.

## Non-goals

This specification does not define Agent creation forms, credentials, API
keys, wallet connections, live balances, authentication, a Policy editor,
Approval execution, or Dashboard implementation. It does not add or rename a
canonical Agent or PayRun state.
