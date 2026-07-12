# ADR-0001: Incremental Strangler Migration in `intent-swap`

**Status:** Accepted
**Date:** 2026-07-12
**Owner:** ZenFix Architecture

## Context

The current `intent-swap` repository is working software with wallet, quote, transaction, conditional-order, monitor, and deployed-contract behavior. ZenFix must become an Agent Payment Control Layer without destabilizing that working product or inheriting a demo reference implementation wholesale.

Three approaches were considered: incremental migration inside the repository, baseline replacement, and a parallel application.

## Decision

Use Incremental Strangler Migration inside the existing `intent-swap` repository.

- Keep Next.js 14, React 18, and the current project toolchain during product migration.
- Add canonical PayRun domain/application modules alongside legacy code.
- Add non-conflicting ZenFix routes before replacing the root surface.
- During Sandbox slices, extract only interfaces, characterization tests, wallet-identity reads, and read-only quote normalization behind ports. Calldata construction, token approval, signing, send, and live reconciliation implementations require a future live-money ADR and remain absent from the Sandbox artifact.
- Preserve legacy routes in the legacy artifact for rollback/recovery until each replacement passes its Gate.
- Switch the root only in Slice 10 through `ZENFIX_PRODUCT_SURFACE`.
- Keep every slice to one commit, one PR, and one Gate.

## Rejected alternatives

- **Baseline replacement:** rejected because it overwrites the primary codebase, combines framework/product change, and imports known security and persistence defects.
- **Parallel application:** rejected because it duplicates deployment, identity, data, and wallet capabilities and creates a later merge problem.
- **Large-bang refactor inside the repository:** rejected because it removes reliable rollback and mixes unrelated risk.

## Consequences

- Migration takes more slices but each change remains reviewable and rollback-safe.
- Legacy and ZenFix code coexist temporarily, so boundaries and route ownership must be explicit.
- New code cannot call legacy HTTP routes as if they were trusted domain services; it uses ports/adapters.
- Framework upgrades require a later independent ADR and slice.
- The same repository produces separate legacy and Hosted Sandbox release profiles; this is security packaging, not a parallel ZenFix application or second codebase. Shared source history does not permit shared signer, route manifest, IAM, secrets, or real-rail egress.

## Failure behavior

If a new adapter or route is unavailable, ZenFix fails closed. It does not fall back to direct legacy execution. Legacy users may continue through the unchanged legacy surface while `ZENFIX_PRODUCT_SURFACE=legacy`.

## Rollback

- Revert the single slice commit before root cutover.
- Before Hosted isolation, a local/migration profile may set `ZENFIX_PRODUCT_SURFACE=legacy` for presentation rollback.
- After Hosted isolation, switch traffic to the separately built legacy deployment or redeploy the preceding Sandbox artifact. `ZENFIX_PRODUCT_SURFACE` never reintroduces excluded real-chain modules into a Sandbox artifact.
- Do not delete legacy data or operational paths until the retirement Gate passes.

## Verification

Every slice proves clean Git scope, required tests, typecheck, production build, relevant smoke, and feature/deployment rollback. PR descriptions name the strangled legacy files and their retained rollback path.
