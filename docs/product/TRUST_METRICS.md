# ZenFix Trust Metrics

**Status:** Active product validation measurement definition
**Classification:** Product Validation Documentation
**Date:** 2026-07-12
**Owner:** Product Research

These metrics evaluate human comprehension, trust, and willingness to continue
with the product. They do not override the
[Architecture Baseline](../architecture/ARCHITECTURE.md), infer canonical
PayRun state, or establish security, Hosted Sandbox, or live-money readiness.

## 1. Measurement objective

For every displayed PayRun, the explanation must let a participant answer:

1. **Why?** Why did the PayRun advance, require review, or stop?
2. **Who gets paid?** Which Merchant/payee was requested?
3. **Which Policy?** Which Policy version and ordered checks decided?
4. **How was Funding prepared?** Was it not required, simulated, or unavailable?
5. **What Proof exists?** What Payment evidence and task/artifact proof exists?

The objective is correct understanding and correct action, not visual appeal or
general satisfaction.

## 2. Experiment units

Scenario-level records use:

```text
participantId + scenarioId + frozen PayRun ID/version
```

Each scenario record includes scenario order, Policy fixture version,
neutral-prompt version, facilitator, start/end timestamps, raw explanation,
scored result, and conceptual interventions.

Participant-level records use:

```text
participantId + studyVersion
```

They contain one final `trust_vs_wallet_log`, `configuration_burden`,
`sandbox_integration_intent`, and `design_partner_intent` result after all four
scenarios. Scenario and participant records remain linked by `participantId`.

Research identifiers and contact information remain outside PayRun financial
records. Metrics cannot be written as AuditEvent, PolicyDecision,
ExecutionProof, Ledger, Receipt, or canonical state.

## 3. Metric dictionary

### `explanation_correct`

Type: boolean per participant and scenario.

Score `true` only when the participant independently states every required
fact for that scenario:

| Scenario | Required facts |
| --- | --- |
| Allowed | identify the displayed Merchant/payee and Policy version; cite the decisive allowed checks; explain `not_required` Funding, Sandbox Payment evidence, verified service artifact Proof, completed Ledger, and no real funds |
| Needs Review | identify the displayed registered-new Merchant/payee and Policy version; cite the decisive review check; explain `pending_review`, absence of Funding/Payment/Proof/Ledger/canonical Receipt, and human review as next action |
| Blocked | identify the displayed existing Merchant/payee and Policy version; cite `merchant.unknown` in the ordered checks; explain `blocked`, no downstream stage, and no real funds |
| Funding Mismatch | identify the displayed Merchant/payee and Policy version; cite the allowed checks; explain synthetic ETH/Ethereum source, USDC/Base target, `sandbox_prepared` simulation, no real swap/bridge/funds, and later Sandbox Payment/Proof/Ledger |

Any statement that a real transaction, swap, bridge, funding movement, or live
payment occurred makes the scenario result incorrect.

### `time_to_explain_seconds`

Type: non-negative integer per participant and scenario.

- start: the frozen `PayRunExplanation` is fully rendered and the neutral task
  prompt is given
- stop: the participant finishes the first answer they identify as final
- pause: only for a documented external interruption unrelated to the product
- Gate threshold: the same at least 4/5 participants must score
  `explanation_correct=true` and `time_to_explain_seconds<=60` for each of
  Allowed, Needs Review, and Blocked

A coached correction does not reset the timer and does not convert an incorrect
answer into an independent pass.

### `trust_vs_wallet_log`

Type: integer comparison score:

```text
-2 = strongly trust wallet/manual log more
-1 = trust wallet/manual log more
 0 = equal trust
+1 = trust PayRun more
+2 = strongly trust PayRun more
```

After all four scenarios, the participant records this score once against the
frozen `wallet-log-comparator-v1`, which contains the same underlying facts for
every participant. A positive score counts as greater PayRun trust. Gate
threshold: at least 4/5 participants record a positive score.

PayRun-first and comparator-first presentation order alternates across the five
participants and is recorded. The comparator content and version do not change
between participants.

### `configuration_burden`

Type: integer perceived-burden score:

```text
1 = very light
2 = light
3 = acceptable
4 = heavy
5 = unacceptably heavy
```

Participants review the frozen minimum Policy configuration used by the four
fixtures; they do not use a Settings or Policy editor in this checkpoint. A
score of 1-3 counts as “not too burdensome.” Gate threshold: at least 4/5.

This metric measures perceived minimum configuration burden, not production
setup time or enterprise administration cost.

### `sandbox_integration_intent`

Type: boolean per participant.

Score `true` only when the participant agrees to test or integrate one concrete
Agent workflow with the ZenFix Sandbox, names an owner, and accepts a follow-up
within 14 days. General interest without a workflow, owner, and dated follow-up
is `false`. Gate threshold: at least 3/5.

### `design_partner_intent`

Type: boolean per participant.

Score `true` only after an explicit opt-in to ongoing design-partner work,
including at least two further feedback or integration sessions within 30 days.
Gate threshold: at least 3/5.

### `conceptual_intervention_count`

Type: non-negative integer per participant session, with one event record per
intervention:

```text
participantId + scenarioId + timestamp + interventionType
```

Increment when the facilitator explains a product concept, identifies the
correct field or reason, corrects an answer, or guides the participant through
the interpretation. Neutral task instructions and technical session recovery
do not count.

This is a protocol guardrail. Any scenario answered after a conceptual
intervention is scored `explanation_correct=false`, remains in the five-person
denominator, and cannot count toward independent explanation success.

## 4. Gate aggregation

The Product Validation Checkpoint is an AND Gate. Passing one strong metric
cannot compensate for a failed metric.

| Product question | Metric | Required result |
| --- | --- | --- |
| Can users explain the decision quickly? | `explanation_correct` + `time_to_explain_seconds` | The same 4/5 pass all three Allowed, Needs Review, and Blocked scenarios, each within 60 seconds |
| Do users avoid a dangerous Sandbox interpretation? | Scenario D `explanation_correct` | Safety veto: zero participants claim real swap, bridge, payment rail, or funds moved |
| Is the explanation more trustworthy than raw logs? | `trust_vs_wallet_log` | 4/5 positive participant-level scores against `wallet-log-comparator-v1` |
| Will teams try it? | `sandbox_integration_intent` | 3/5 true |
| Is minimum Policy setup acceptable? | `configuration_burden` | 4/5 score 1-3 |
| Will teams continue discovery? | `design_partner_intent` | 3/5 true |

Decision branches and evidence requirements are defined in the
[Pilot Validation Gate](./PILOT_VALIDATION_GATE.md).

## 5. Interpretation boundaries

- A high trust score is not Merchant `trustState` and cannot authorize spend.
- Correct explanation is not ExecutionProof.
- Integration intent is not API authentication or an execution command.
- Design-partner intent is not Approval.
- A participant statement is not Audit or Ledger evidence.
- Passing all metrics is not production, security, Hosted Sandbox, or
  live-money readiness.
- Metrics can change explanation copy and information hierarchy; they cannot
  change the canonical state machine without a separate Architecture decision.

## 6. Data quality rules

- Freeze the scenario, PayRun version, Policy version, neutral-prompt version,
  wallet-log comparator version, and scoring rubric before the first participant.
- Preserve raw answers alongside scored values.
- Do not silently rescore earlier participants after changing the rubric.
- Record missing data as missing, never as a passing default.
- Separate facilitator observation from participant self-report.
- Report all five participants, including failed and incomplete sessions.

The exact scenario contract is defined in
[Pilot Scenarios](./PILOT_SCENARIOS.md).
