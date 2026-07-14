# Dashboard Design References

**Status:** Active reference-direction record
**Scope:** Future ZenFix Control Center and operational surfaces
**Source context:** Confirmed July 10–14 product-research directions supplied for this baseline

## Purpose

ZenFix does not copy one reference product. It combines three familiar design
directions to express a new product category: an Agent Payment Control Layer.

These references describe pattern families, not licensed assets, exact screens,
brand systems, or permission to implement a Dashboard.

## Direction 1 — SaaS Dashboard

### Absorb

- stable left or top-level navigation;
- a focused overview with clear hierarchy;
- summary cards that answer distinct operational questions;
- sortable, filterable tables for recurring records;
- consistent list-to-detail navigation;
- responsive density, empty states, and error states; and
- predictable placement of environment and account context.

### Do not copy

- generic revenue, conversion, or vanity charts without an Agent-control use;
- interchangeable admin templates that hide the ZenFix product model;
- card grids where every metric has equal visual weight;
- settings-first navigation; or
- wallet balances presented as the product's primary KPI.

### ZenFix translation

Use SaaS structure to make Agents, Policies, Approvals, and PayRuns easy to
operate. The overview leads with decisions and exceptions, not financial market
performance.

## Direction 2 — Energy Analytics Control Center

### Absorb

- strong situational awareness;
- current system and Agent health;
- explicit environment, scope, and freshness;
- exception-first prioritization;
- meaningful risk and trust indicators;
- calm, high-density monitoring patterns; and
- drill-down from system signal to supporting evidence.

### Do not copy

- animated gauges or maps that imply precision the data does not provide;
- alarm density that makes routine operation feel continuously critical;
- a single unexplained health score;
- pseudo-live motion before authoritative updates; or
- physical-infrastructure metaphors that obscure Agent, Policy, and Merchant.

### ZenFix translation

Treat Agent economic authority as an operational system. Show whether Agents
are healthy, constrained, awaiting review, blocked, failed, or missing
evidence. “Live” always includes an authoritative observed time.

## Direction 3 — Workflow Automation Dashboard

### Absorb

- a clear ordered lifecycle;
- visible decision points and human handoffs;
- stage ownership and next action;
- stopped, failed, and completed paths;
- causal history; and
- expandable run-level diagnostics.

### Do not copy

- a general-purpose workflow canvas;
- arbitrary drag-and-drop execution graphs;
- clickable stage bypasses;
- optimistic progress animation disconnected from canonical state;
- retry-everything controls; or
- business rules hidden inside presentation configuration.

### ZenFix translation

Render the one canonical PayRun lifecycle so users can understand Intent,
Policy, Approval, Funding, Payment, Proof, and Ledger. The UI requests legal
application commands in future authorized work; it never owns transitions.

## Combined reference model

| Product need | Primary reference | ZenFix expression |
| --- | --- | --- |
| Find work and history | SaaS Dashboard | Agents, Pay Runs, Approvals, Policies, Evidence navigation |
| Understand current risk | Control Center | decision queue, Agent health, trust evidence, freshness |
| Explain how an action progressed | Workflow Dashboard | canonical lifecycle with reason and stage evidence |
| Establish trust | All three | decision first, evidence separation, Audit lineage, clear environment |

The combined experience should feel calm, operational, and accountable. It
must not feel like a crypto exchange, consumer wallet, trading terminal, or
generic automation builder.

## Visual direction

- Prefer restrained surfaces, clear typography, and semantic status accents.
- Use whitespace and grouping to separate authority from execution evidence.
- Use tables for comparable PayRuns and cards for prioritized summaries.
- Use compact lifecycle visuals only when they preserve canonical order.
- Keep hashes, IDs, and provider metadata secondary and expandable.
- Use motion only to explain an already confirmed state change.

This is a direction, not a finalized token or component system. Concrete
typography, spacing, component, and responsive decisions require future UI
work and the [Design Polish Gate](./DESIGN_POLISH_GATE.md).

## Evaluation question

Every future design proposal must answer:

> Does this pattern help a responsible human understand an Agent decision,
> its authority, its execution evidence, and its next action faster—without
> weakening canonical meaning or Sandbox safety?

If not, the reference pattern does not belong in ZenFix.

## Non-goals

This document does not reproduce any third-party screen, specify a Dashboard
implementation, authorize analytics collection, define a production design
system, or change the Architecture roadmap.
