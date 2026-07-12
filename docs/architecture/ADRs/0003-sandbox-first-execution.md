# ADR-0003: Sandbox-First Execution with Physical Isolation

**Status:** Accepted
**Date:** 2026-07-12
**Owner:** ZenFix Architecture and Security

## Context

The repository contains real-chain RPCs, transaction calldata, deployed Vault addresses, keeper/private-key execution, and manual execution tools. An environment flag alone cannot make that runtime structurally safe for a ZenFix sandbox.

## Decision

ZenFix remains sandbox-only until a new live-rail ADR is accepted.

- The first pilot uses `environment=sandbox` with deterministic `executionAdapter=sandbox_simulated` funding/payment evidence, a logical USDC/Base target, and no real transaction hash.
- Sandbox and future live environments use separate runtime artifacts, IAM roles, credential stores, API-key namespaces, repositories, and network policies.
- A Hosted Sandbox artifact excludes real signer/provider wiring, keeper, raw transaction broadcast, manual execution, direct USDT subscription payment, Vault recovery writes, executable quote/calldata, contract deployment, and direct swap execution paths.
- The independently built legacy artifact retains recovery and rollback behavior on a separate origin; it cannot be activated inside the Hosted Sandbox artifact.
- The Sandbox runtime has no real private keys, mainnet write RPC permission, deployed Vault targets, real rail credentials, or real-rail egress.
- Injecting live credentials or endpoints into Sandbox fails startup.
- Until artifact isolation is implemented and verified, ZenFix is described only as a local development sandbox.

## Rejected alternatives

- A single `ZENFIX_EXECUTION_MODE=sandbox` check was rejected because forgotten branches and manual tools remain executable.
- Dummy transaction hashes were rejected because they blur simulated evidence with real settlement.
- Reusing the legacy keeper/monitor as a sandbox executor was rejected because it has real credentials, weak state semantics, and no PayRun lifecycle guard.

## Failure behavior

Missing sandbox adapter or unsupported bridge returns an explicit unavailable/unsupported result before any irreversible source-chain action. It never falls back to `/execute`, `/api/orders`, monitor, Vault, or a live adapter.

## Migration

Read-only preflight/shadow quotes may be attached to a PayRun before Policy while all execution flags remain off. They use a method-allowlisted proxy/provider that rejects write, broadcast, admin, and caller-supplied raw-transaction methods and return no calldata or transaction fields. Real funding and payment adapters require a separate build/deployment profile and accepted live-money decision.

## Rollback

Close new ZenFix intake and redeploy the preceding Sandbox artifact, or route users to the independently built legacy origin. Routine rollback preserves all newer Sandbox records; data restore is reserved for disaster recovery and requires reconciliation. Because the initial pilot produces no external financial side effect, it requires no financial compensation.

## Verification

- build artifact/import scan for excluded paths
- secret and configuration scan
- startup rejection of live credentials/endpoints
- egress-deny test
- no-real-transaction smoke
- explicit Sandbox simulation evidence test
- explicit unsupported Base bridge/no-write test for every non-simulated environment
