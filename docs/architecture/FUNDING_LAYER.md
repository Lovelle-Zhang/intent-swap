# ZenFix Funding Preparation Layer

**Status:** Canonical baseline
**Date:** 2026-07-12

## 1. Boundary

Funding Preparation exists only to make a Policy-approved payment target available in a guarded environment, or to produce explicitly simulated preparation evidence in Sandbox. It is not a swap product, wallet, portfolio, trading route explorer, conditional-order system, or independent execution API.

The only entry is a legal PayRun transition after `PolicyDecision=allowed`, including a fresh Policy recheck after any required human approval.

```text
PayIntent
→ Policy target: USDC on Base
→ FundingPreparation
→ PaymentExecution
```

No Funding adapter may call Payment directly or mark the PayRun complete.

## 2. First-pilot semantics

The initial pilot uses:

```text
environment = sandbox
executionAdapter = sandbox_simulated
rolloutMode = sandbox_pilot
```

- final logical asset: USDC
- final logical chain family: Base
- decimals: 6
- payment rail: sandbox only
- evidence: `sandbox_funding_evidence`
- `realFundsAvailable=false`
- `realBridgeCapability=false`
- `transactionHash=null`
- on-chain chain ID and token contract: not applicable
- real swap, bridge, allowance write, wallet broadcast, and settlement: disabled

Funding mismatch scenarios explain an intended path such as `source-chain ETH → source-chain USDC → bridge → Base USDC` or the SOL equivalent. These are intent explanations, not currently executable routes. Because the repository has no Base bridge or SOL adapter, the system must not claim that real funding occurred. UI, Receipt, export, and webhook projections label the result `Simulation completed`; they cannot shorten `sandbox_prepared` to an unqualified “Funds prepared” or “Funding succeeded.”

## 3. FundingPreparation model

### Actions

```text
none
swap
bridge
swap_and_bridge
```

### Statuses

```text
requested
not_required
planned
sandbox_prepared
prepared
unsupported
failed
expired
```

Only `not_required`, `sandbox_prepared`, and future evidence-backed `prepared` may advance to Payment. `planned` describes a route but is not proof that funds are available.

### Required data

- project, PayRun, version, intent digest, and PolicyDecision reference
- approved plan/scope digest and idempotency key
- source asset/chain/account and requested atomic amount
- required USDC/Base target
- action and ordered route steps
- quote/provider/configuration references and expiry
- estimated fees and conservative minimum target amount
- sandbox or guarded evidence and verification method
- status, attempt history, and failure reason code

## 4. Ports

```text
FundingScopeProposal.propose(intent, logicalTarget) → ProposedFundingScope
FundingPreflightQuoteProvider.quote(proposedScope) → ReadOnlyFundingQuote
FundingPlanner.prepare(context, intent, allowedDecision) → FundingPreparation
TokenSpendAuthorization.prepareExact(approvedPlan) → UnsignedAuthorization       # future live only
FundingExecutionAdapter.prepare(approvedPlan) → PreparedFundingExecution         # future live only
FundingExecutionAdapter.submit(executionKey, prepared, authorizationEvidence) → SubmissionReference
FundingReconciler.reconcile(reference) → FundingOutcome
FundingCompletionVerifier.verify(outcome, target) → FundingEvidence
```

Scope proposal and planner are pure. A preflight quote is read-only, attached to the PayRun before Policy, and returns no calldata, signer request, authorization transaction, or broadcast material. Policy evaluates the proposal/quote; Approval binds its scope when required; a refreshed quote and Approval-aware Policy recheck occur before FundingPreparation.

Sandbox implements no `TokenSpendAuthorization`, signer, or real `FundingExecutionAdapter`. Future prepared execution binds recipient, atomic amount, asset contracts, chain IDs, spender, router/bridge, calldata hash, quote expiry, and approved scope hash and requires a live-money ADR.

## 5. Current repository extraction map

| Current file | Allowed migration use | Prohibited use |
| --- | --- | --- |
| `src/app/providers.tsx` | Retain in legacy deployment; extract identity-only concepts if needed | Inclusion of live transports, write hooks, or EIP-1193 signer in Hosted Sandbox |
| `src/config/tokens.ts` | Characterize schema and seed a legacy-only registry adapter | Sandbox target registry, unknown-chain fallback, or symbol-only asset identity |
| `src/app/api/swap-quote/route.ts` | Keep route legacy-only; extract read-only normalization into a new typed module | Reusing route or `quoteOnly` caller input as a Sandbox read-only guarantee; any tx/calldata/router/recipient output |
| `src/app/preview/page.tsx` | Reuse review presentation concepts | `sessionStorage` as intent, approval, or authorization source |
| `src/components/SwapPreviewCard.tsx` | Render immutable funding quote/projection | Own execution state or route around PayRun |
| `src/app/execute/page.tsx` | Characterize as legacy-only; future live ADR may approve specific mechanics | Any executable allowance/sign/send code in Sandbox; automatic page-load execution; 10x approval |
| `src/components/WalletButton.tsx` | Wallet display shell | Mainnet-hardcoded balance as funding fact |
| `src/app/subscribe/page.tsx` | No Sandbox reuse; legacy direct-mainnet USDT payment slated for retirement | Any payment outside PayRun |
| `src/app/activity/page.tsx` | Independent legacy recovery origin for Vault withdraw/cancel only | Hosted Sandbox inclusion or Ledger/Funding authority |
| `src/app/portfolio/page.tsx` | Legacy display only | Real-chain display balance as completion/funding proof |
| `src/components/TokenSearch.tsx` | Legacy discovery UI only | Funding asset allowlist or Policy registry |
| `src/lib/history.ts` | Legacy local-history compatibility only | AuditEvent, ExecutionProof, Receipt, or Ledger authority |
| `src/app/orders/page.tsx`, `src/app/history/page.tsx` | Legacy URL compatibility only | Canonical ZenFix route/status authority |
| `src/lib/errors.ts` | Typed adapter error presentation | Converting unknown outcomes into generic success/failure |

The quote compatibility route remains only in the independently built legacy deployment. New PayRun code calls a new, server-enforced read-only Funding preflight port rather than issuing an internal HTTP request to that route.

This map is pinned to baseline commit `f8a94f6`; changes to these legacy files require boundary and denylist re-review.

## 6. Excluded from the first pilot

These paths remain available only for legacy rollback and operational wind-down:

- `src/app/conditional-order/**`
- `src/app/api/orders/**`
- `src/app/providers.tsx`
- `src/components/WalletButton.tsx`
- `src/components/TokenSearch.tsx`
- `src/app/execute/**`
- `src/app/subscribe/**`
- `src/app/activity/**`
- `src/app/portfolio/**`
- `src/app/orders/**`
- `src/app/history/**`
- `src/lib/history.ts`
- `src/app/api/swap-quote/**`
- `src/app/api/cron/health-check/**`
- `src/hooks/useWebPush.ts`
- `public/sw.js`
- `src/lib/vault.ts`
- `monitor/**`
- `contracts/**`
- `tools/refresh-monitor-tunnel.sh`

They contain direct mainnet USDT transfer, wallet signing, executable calldata, Vault withdraw/cancel writes, real-chain reads, keeper/private-key behavior, deployed Vault references, weak email ownership, lowdb state, or legacy monitor/notification egress that do not satisfy PayRun Policy, CAS, idempotency, Proof, and Ledger invariants. `.github/workflows/health-check.yml` remains a legacy-operations workflow only and must be separated or retired before Hosted cutover.

`/activity` is a recovery exception only on the independent legacy origin until on-chain Vault balances and executable orders are resolved. `/subscribe` is not recovery and stops accepting new payment before cutover.

## 7. Sandbox physical isolation

Feature flags alone are insufficient because the repository currently contains live-chain paths.

Before a Hosted Sandbox claim:

- its build manifest and dependency scan prove that real funding/payment adapters, keeper code, manual execution, contract deployment, and direct swap execution are absent from the runtime artifact
- its server and browser chunks exclude the full denylist, live RPC domains, deployed Vault/router/payment addresses, payment constants, and transaction-write APIs
- no real private key, signer, mainnet write RPC, deployed Vault target, real bridge/payment credential, or real-rail egress is available
- sandbox adapters use distinct configuration, repositories, API-key namespace, and evidence format
- injecting a live credential or endpoint fails startup
- unavailable sandbox adapters fail closed and never fall back to legacy `/execute`, `/api/orders`, monitor, or Vault paths
- it uses `SandboxProviders` with no live transport, write hook, or signer; any quote RPC is method-allowlisted and denies broadcast/admin/raw-transaction methods
- `ZENFIX_DEPLOYMENT_PROFILE=hosted_sandbox` is a build-time boundary and rejects `ZENFIX_PRODUCT_SURFACE=legacy`

Until this Gate is implemented, ZenFix is a local development sandbox inside the migration branch.

## 8. Quote and asset safety

- Sandbox uses `LogicalSettlementTarget { chainFamily, asset, decimals }`. Any on-chain mode uses `OnChainAssetRef { environment, chainId, contractAddress, decimals, configVersion }`; symbol is display metadata.
- Unknown chain or asset is rejected. It never falls back to Ethereum defaults.
- Indicative prices, read-only preflight quotes, and future executable quotes are separate types.
- Read-only preflight quotes record amountAtomic, fees, slippage, proposed route, provider, configuration, expiry, and plan digest, but no transaction material. A future executable quote may add calldata digest only after a live-money ADR.
- Quote expiry or any material plan change requires Policy recheck and new Approval when applicable.
- Base gas ETH is modeled separately from the USDC payment amount.
- Real execution must use exact or narrowly bounded token allowance. The current `amount * 10` behavior is forbidden.

## 9. Base bridge gap

The current repository supports Ethereum, Arbitrum, and Linea swap concepts but has no Base chain registry, Base USDC configuration, Base bridge, SOL adapter, or end-to-end Base funding verification.

Therefore:

- `environment=sandbox` mismatch may be `sandbox_prepared` only with the explicit simulation fields in Section 2
- every testnet/live-capable request requiring Base conversion/bridge is `unsupported` before allowance, swap, sign, or broadcast
- a source-chain swap alone is not successful Funding Preparation
- RPC acceptance, transaction hash, or source receipt cannot prove Base USDC availability
- future guarded completion requires an authoritative target-USDC transfer proof reconciled with custody/reservation/balance evidence and configured finality; a client balance alone never suffices

## 10. Operational controls

Initial controls:

```text
ZENFIX_DEPLOYMENT_PROFILE=legacy
ZENFIX_PRODUCT_SURFACE=legacy
ZENFIX_EXECUTION_MODE=sandbox
ZENFIX_REAL_FUNDING_EXECUTION_ENABLED=0
```

Funding-specific rollout modes are server-side only:

```text
off → shadow_quote → sandbox_pilot → future_live_guarded
```

- `off` returns an explicit unavailable result.
- `shadow_quote` compares read-only quotes and creates no approval, allowance, swap, bridge, or payment side effect.
- `sandbox_pilot` produces sandbox Funding evidence only.
- `future_live_guarded` cannot exist until a new accepted ADR and all live-money gates pass.

No `NEXT_PUBLIC_` value controls Policy, funding execution, allowance, bridge, completion, or kill switch.

## 11. Failure and reconciliation

- Missing capability, quote, registry, adapter, or Policy evidence fails closed.
- Before an external call, persist an immutable prepared attempt with deterministic key.
- The adapter accepts the deterministic key before execution and supports lookup by that key if the initial provider response is lost; otherwise the rail is unsupported.
- Timeout or process crash after submission becomes `unknown` and triggers reconciliation by deterministic key plus stable provider/transaction reference.
- Retries reuse the same approved plan and provider idempotency identity.
- A changed route, spender, recipient, amount, asset, chain, calldata, or quote invalidates the prepared attempt and approval scope.
- Allowance or on-chain transaction cannot be software-rolled back. Compensation may revoke allowance or create a controlled recovery PayRun, with audit and Ledger evidence.

## 12. Legacy retirement Gate

Conditional-order, subscription, monitor, and Vault runtime paths can be retired only when:

1. `POST /api/orders`, monitor `POST /swap-orders`, and new `/subscribe` payments are disabled
2. legacy GET/DELETE and the independent recovery UI remain only as long as recovery requires them
3. every executable order records chain, Vault, nonce, deadline, and signature invalidation/expiry evidence
4. `cancelOrders()` confirmation or deadline expiry proves signatures cannot execute
5. on-chain balances/events, not lowdb, prove every user Vault balance is withdrawn or explicitly accounted for
6. keeper credentials are revoked/sealed and any residual contract-owner execution authority is accepted or eliminated
7. the new PayRun read model covers required operational history without treating local history as Ledger
8. old execution, notification, and tunnel/health routes have no required traffic
9. a traffic rollback and user-funds recovery runbook has been exercised

On-chain contracts cannot be deleted; retirement means no funds, valid orders, keeper traffic, or new application references.

## 13. Funding Layer Gate

Slice 9 cannot pass unless tests prove:

- Policy/Approval preconditions cannot be bypassed
- unknown chain/asset fails closed
- indicative quote cannot become executable
- exact plan digest binds quote and authorization
- forged client `not_required` cannot bypass server custody/reservation evidence
- Sandbox produces `sandbox_prepared` with explicit simulated fields, no real-chain write, and projection text `Simulation completed`
- every non-simulated environment reports a missing Base bridge as `unsupported` before any allowance/swap/sign/broadcast
- duplicate commands produce one logical attempt
- ambiguous submission is reconciled before retry
- completion evidence matches the configured USDC/Base target
- disabling the Funding route does not fall back to legacy execution
