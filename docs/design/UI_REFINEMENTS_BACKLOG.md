# ZenFix UI Refinements Backlog

**Status:** Deferred by architecture decision
**Owner:** Product Design and Frontend
**Earliest implementation slice:** Slice 8

## Policy

Architecture, lifecycle correctness, project isolation, tests, and rollback take priority over visual polish. This backlog is the single collection point for animation, visual refinement, design-system consolidation, and nonessential UI improvements during Slices 1–7.

Items in this file do not authorize implementation. Each item enters a later UI slice only with explicit acceptance criteria and a focused commit/PR/Gate.

## Product identity

| Item | Reason | Gate |
| --- | --- | --- |
| Replace DEX/swap-first copy with Agent Payment Control Layer language | Prevent product drift back to trading | Users can explain intent, policy reason, payment result, and proof |
| Keep wallet controls inside Funding context | Wallet is infrastructure, not product identity | No wallet/portfolio-first homepage or primary navigation |
| Remove token-first and route-first visual hierarchy from ZenFix surfaces | Funding must remain subordinate to Policy | Dashboard leads with Pay Runs, review, blocked spend, and evidence |

## Information architecture

| Item | Reason | Gate |
| --- | --- | --- |
| Define final AppShell navigation for Dashboard, Simulator, Agents, Policies, Approvals, Pay Runs, Receipt, and Developer Console | Establish predictable control-plane structure | Every navigation item maps to canonical read/write boundaries |
| Design a compact lifecycle strip | Make control sequence visible without becoming a trading route diagram | Shows Intent → Policy → Funding → Payment → Proof → Ledger in order |
| Clarify pending Review and blocked terminal states | Reduce operator ambiguity | Funding/payment actions are visibly unavailable before authorization |

## Dashboard and operational views

| Item | Reason | Gate |
| --- | --- | --- |
| Prioritize Pending Review, Blocked, Completed, and Recent Pay Runs | Reflect control-plane work | Metrics never imply wallet balance or trading performance |
| Add evidence-aware PayRun detail hierarchy | Make decisions auditable | Policy reasons, funding status, payment evidence, proof, and Ledger are readable without raw JSON |
| Add explicit Sandbox watermark and environment label | Prevent fake-live interpretation | Appears on Dashboard, Simulator, Receipt, Developers, and exports |

## Receipt and Ledger readability

| Item | Reason | Gate |
| --- | --- | --- |
| Design Receipt `v1` summary and evidence sections | Answer why, why allowed, what paid, and what happened | Human comprehension test passes |
| Add copy/export feedback without hiding failures | Improve operator confidence | Status is based on authoritative API response, not optimistic animation |
| Distinguish payment evidence from execution/artifact proof | Avoid treating tx hash as task completion | Separate labeled sections and states |

## Responsive and accessibility

| Item | Reason | Gate |
| --- | --- | --- |
| Validate laptop, tablet, and mobile layouts | Pilot users may review on multiple devices | No clipped lifecycle, tables, actions, or evidence fields |
| Keyboard and focus-order audit | Production accessibility | All core actions work without pointer input |
| Contrast, semantic labels, and status icon audit | Status cannot rely on color alone | Automated and manual accessibility checks pass |
| Reduced-motion behavior | Respect platform preference | No required information depends on animation |

## Motion and visual polish

The following remain deferred until the pre-launch Polish Gate:

- page transitions and list entrance motion
- micro-interactions and celebratory completion states
- refined typography scale and spacing rhythm
- elevation, border, surface, and color-token consolidation
- empty-state illustrations and nonessential iconography
- loading skeleton refinement

Motion must communicate state change, not simulate progress before authoritative confirmation.

## Polish Gate

Before public launch, the UI slice must verify:

1. product identity cannot be mistaken for DEX, wallet, or stablecoin application
2. lifecycle order is visible and cannot be bypassed from UI controls
3. pending Review and blocked states expose no payment action
4. Sandbox labeling is persistent and unambiguous
5. Receipt answers the Pilot success questions in plain language
6. responsive, keyboard, focus, contrast, and reduced-motion checks pass
7. loading, empty, error, timeout, retry, and stale-data states are designed
8. visual changes do not alter domain status or optimistic-complete a PayRun
