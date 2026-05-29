# ConditionalSwapVault — Security Notes

Last reviewed: 2026-05-29. This is a self-review, **not** a third-party audit.

## Deployed contracts (all source-verified on explorers)

| Chain | Address | DEX | Owner / Keeper | Verified |
|---|---|---|---|---|
| Ethereum | [`0x52a8fe40324621d310ede9bfd20396b82dfec0ee`](https://etherscan.io/address/0x52a8fe40324621d310ede9bfd20396b82dfec0ee) | Uniswap V3 | `0x3febb4cf…2147ea` (legacy key) | ✅ |
| Arbitrum | [`0x3e89119234c0635e861cce71efa274f1defd6818`](https://arbiscan.io/address/0x3e89119234c0635e861cce71efa274f1defd6818) | Uniswap V3 | `0x0f10A63a…155D17` | ✅ |
| Linea | [`0x568b8946697ac7e2c6bb1f1be9e5946e9c800097`](https://lineascan.build/address/0x568b8946697ac7e2c6bb1f1be9e5946e9c800097) | iZiSwap (dexType=1) | `0x0f10A63a…155D17` | ✅ |

Compiler: `v0.8.35+commit.47b9dedd`, optimizer enabled (200 runs).

## Core safety property

> Funds can only leave the vault via **(a)** the depositor's own `withdraw`, or **(b)** `executeOrder` carrying the user's valid EIP-712 signature, with swap output hardcoded to `order.user`.

**Owner/keeper compromise does NOT allow theft.** There is no owner-withdraw function; the keeper cannot forge user signatures; and the swap `recipient` is always `order.user`. A malicious/compromised keeper can at most execute orders the user actually signed, at a price within the user-signed `amountOutMinimum` — bounded griefing, not theft. This is why the legacy Ethereum owner key (exposed during early deploy setup) is low-risk, and Mainnet is excluded from auto-execute anyway.

## Reviewed attack surface

- **Reentrancy** — `withdraw` and `executeOrder` follow checks-effects-interactions (state mutated before external calls). No reentrancy guard, but not needed given ordering.
- **Signature replay** — blocked by `executedOrders[digest]` + per-user `nonce` + a chain-scoped `DOMAIN_SEPARATOR` (chainId + contract address), so a signature can't replay across chains or be reused.
- **Signature malleability** — dedup is keyed on the message `digest`, not the signature, so a malleable variant still hits `executedOrders[digest]`.
- **path token vs `order.tokenIn` mismatch** — `approve` only grants the router `order.tokenIn`; if `order.path`'s input token differs, the router has zero allowance for it and the swap reverts. No way to spend another user's commingled token.
- **Deposit accounting invariant** — `sum(deposits[*][token]) <= vault balance(token)` holds for standard tokens.

## Latent items (fix on NEXT deploy only — not worth redeploying for)

1. **Fee-on-transfer tokens**: `deposit` credits the full `amount`, but such tokens deliver less, over-crediting the depositor. The current token whitelist (USDC/USDT/DAI/WBTC/WETH/ARB) has none, and the API-layer whitelist blocks others, so not exploitable today. Fix: credit `balanceAfter - balanceBefore`.
2. **`_recover` doesn't reject `address(0)`**: ecrecover returns 0 on a bad signature; `signer == order.user` already blocks it for real users, but add `require(signer != address(0))` for defense-in-depth.
3. **`keeperFeeBps`** is dead code (set, never used in any transfer).

## Why the 3 vaults aren't "unified" to one source version

They were deployed from different revisions (Ethereum oldest; Arbitrum 2-arg pre-`dexType`; Linea 3-arg with `dexType`), but are **interoperable at runtime** — every function the monitor/frontend calls is identical across versions; only the constructor differs and it runs once at deploy. Redeploying Arbitrum just to match the current source buys nothing functional and costs deposit migration + owner/keeper re-rotation + re-verification. The repo source is the canonical current version; the deployed Arbitrum vault is an earlier compatible one. Only redeploy when a functional change is needed (e.g. enabling Mainnet auto-execute → deploy a fresh Mainnet vault with owner = `0x0f10…155D17`).
