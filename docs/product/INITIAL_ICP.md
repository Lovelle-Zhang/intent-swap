# ZenFix Initial ICP

**Status:** Active product validation hypothesis
**Classification:** Product Validation Documentation
**Date:** 2026-07-12
**Owner:** Product

This document narrows the first market hypothesis. It does not override the
[Architecture Baseline](../architecture/ARCHITECTURE.md), the
[Domain Model](../architecture/DOMAIN_MODEL.md), the canonical lifecycle, or
any Accepted ADR. If product validation guidance conflicts with a normative
architecture document, the architecture document governs and implementation
stops until the conflict is resolved through the ADR process.

## 1. Product hypothesis

ZenFix is an Agent Payment Control Layer. The initial product bet is that teams
building autonomous Agents need more than a wallet transaction record: they
need to know why an Agent was allowed to spend, who was paid, which Policy
decided, how Funding was prepared, and what the paid service returned.

This ICP choice changes recruitment and investment order only. It does not
change the legal PayRun lifecycle:

```text
Intent -> Policy -> [Approval when required] -> Funding Preparation
-> Payment -> Execution Proof -> Ledger
```

## 2. Primary ICP

The first phase serves:

> Development teams that need autonomous Agents to purchase API access, data,
> or tool services.

A qualifying primary participant:

- is actively building or operating an autonomous Agent
- owns or materially influences the Agent workflow
- has a real or planned paid dependency such as an API, dataset, model,
  browser/tool service, or task provider
- currently uses manual approval, hard-coded limits, wallet logs, application
  logs, or ad hoc reconciliation to understand spend
- can evaluate a Sandbox integration without requiring live funds
- is responsible for at least one of implementation, operations, security, or
  payment-control decisions

The initial job to be done is:

> Let an Agent request a service purchase inside explicit rules, and let the
> responsible team understand the decision and outcome without reconstructing
> the story from wallet and application logs.

## 3. Secondary ICP

The secondary ICP is the **AI workflow builder**: a developer or product team
assembling Agent workflows for internal or customer use.

Secondary participants are relevant only when they can evaluate the same
controlled service-purchase workflow. A general interest in AI automation does
not qualify a participant for the first validation cohort.

## 4. Mapping to the canonical domain

The ICP language maps to existing canonical terms; it creates no alternate
payment model.

| Product-validation term | Canonical meaning |
| --- | --- |
| autonomous Agent | Project-scoped `Agent` requesting spend within capabilities and Policy |
| API, data, or tool provider | `Merchant` with an identity and trust classification |
| purchase request | immutable normalized `PayIntent` |
| allow, review, or block | deterministic `PolicyDecision` |
| source asset mismatch | `FundingPreparation` inside the PayRun lifecycle |
| service response or task result | verified `ExecutionProof`, separate from Payment evidence |
| human-readable story | read-only `PayRunExplanation`, never authority over canonical state |

Autonomous operation never means direct payment, self-approval, client-defined
Policy authority, or bypassing required Approval. A provider response, HTTP
`2xx`, transaction reference, or wallet display is not sufficient evidence of
PayRun completion.

## 5. Explicit first-phase exclusions

The first validation phase does **not** serve:

- consumer wallet users
- general crypto users
- enterprise finance replacement
- multi-chain payment users
- swap users

These exclusions are prioritization boundaries, not claims that the use cases
can never exist. They prevent the first experiment from drifting into a wallet,
DEX, treasury suite, payment aggregator, or broad financial platform.

## 6. Recruitment boundary

The Product Validation Checkpoint recruits five Agent developers or responsible
team leads. Each participant must satisfy the primary or secondary ICP and must
be able to discuss one concrete Agent workflow that may purchase an API, data,
or tool service.

The five-person cohort must not include:

- members of the ZenFix implementation team
- people who have already been taught the four scenario answers
- crypto users without an Agent purchasing workflow
- participants whose only need is swapping, bridging, or wallet management

## 7. Falsification signals

Use the thresholds in the [Pilot Validation Gate](./PILOT_VALIDATION_GATE.md)
as the falsification rules. The initial ICP is not validated when any of these
cohort results occurs:

- `trust_vs_wallet_log` fails its 4/5 threshold
- `sandbox_integration_intent` fails its 3/5 threshold
- `configuration_burden` fails its 4/5 acceptable-burden threshold
- `design_partner_intent` fails its 3/5 threshold
- explanation or Sandbox safety understanding fails the Product Gate

Those results trigger ICP or onboarding iteration under the
[Pilot Validation Gate](./PILOT_VALIDATION_GATE.md). They do not authorize an
Architecture change or a broader ICP by default.

## 8. Related product-validation documents

- [Pilot scenarios](./PILOT_SCENARIOS.md)
- [Trust metrics](./TRUST_METRICS.md)
- [Pilot validation gate](./PILOT_VALIDATION_GATE.md)
- [Migration roadmap](../roadmap/ZENFIX_MIGRATION_ROADMAP.md)
