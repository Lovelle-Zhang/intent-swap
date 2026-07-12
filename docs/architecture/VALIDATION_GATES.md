# Validation Gate Boundary

**Status:** Operational validation policy
**Recorded:** 2026-07-12
**Architecture relationship:** This document does not override the Architecture Baseline, canonical PayRun lifecycle, Security Gate, Hosted Sandbox Gate, or Live Money Gate.

## Decision

Vercel Preview is deployment feedback, not architecture validation.

- Vercel Preview remains visible on pull requests so deployment configuration, provider compatibility, and preview-environment failures can be investigated.
- Vercel Preview is informational in the GitHub merge policy and is not a required Architecture merge check.
- The GitHub Actions `Safety net` workflow, job `verify`, is the only required automated merge validation after that workflow exists on the protected target branch.
- A required check must not be configured before its workflow exists on the target branch. Doing so would create an impossible merge gate for the earlier stacked pull requests.

## Gate responsibilities

| Signal | Responsibility | Merge policy |
| --- | --- | --- |
| `Safety net / verify` | Install dependencies, lint, typecheck, tests, production build, and legacy smoke checks | Sole required automated check once available on the target branch |
| Vercel Preview | Deployment and preview-environment feedback | Informational; investigate failures without treating them as Architecture validation |
| Architecture review | Domain boundaries, lifecycle invariants, ADR compliance, scope, and rollback | Human review required for Architecture changes |
| Deployment/release review | Whether a specific artifact is deployable or releasable | Separate from Architecture acceptance |

An informational Vercel failure does not make a docs-only Architecture change invalid. A Vercel failure on a deployment-affecting change must still be investigated and resolved before that artifact is promoted or released.

## Current repository state

The 2026-07-12 repository audit found:

- no branch protection on `main`
- no branch protection on `codex/ops-healthcheck`, the base of the Architecture pull request
- no repository rulesets
- Vercel reported as an external status context, not a required status check
- the `Safety net` workflow first appears in Slice 1, after the Architecture Baseline commit

Therefore no GitHub setting change is required to make Vercel informational: it already is informational. The `verify` check becomes the sole required automated validation only after Slice 1 is present on the protected target branch.

## Change control

Branch protection or repository rulesets must preserve this separation:

1. require `Safety net / verify` after the workflow is available on the target branch
2. do not require the Vercel status context for Architecture acceptance
3. keep Vercel feedback visible for deployment triage
4. do not weaken the Architecture, Security, Hosted Sandbox, or Live Money Gates
