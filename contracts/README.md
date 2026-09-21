# DisbursementVault — M1 PoC ("B with teeth")

Proves ZenFix's core mechanic on-chain: an agent/disburser can move money **only inside a
scoped envelope** the funder granted — right token, allow-listed recipients, per-tx & daily
caps, before expiry. Anything outside **reverts**. The funder stays **non-custodial**
(`revoke` / `withdraw` any time). ZenFix never holds the keys.

- `src/DisbursementVault.sol` — the credential + enforcement (~110 lines incl. docs).
- `test/DisbursementVault.t.sol` — the 7 "teeth" money-shots + guards.

## Run

```bash
# one-time: install Foundry (https://getfoundry.sh) and the std lib
curl -L https://foundry.paradigm.xyz | bash && foundryup
forge install foundry-rs/forge-std --no-commit   # into contracts/lib (gitignored)

forge test -vv
```

## What it deliberately skips (see the PoC spec)

Single disburser key (no 2-of-2 co-sign), no delay/cancel window, standalone vault (production
migrates the rules to a module on the funder's OWN account — ERC-7579 / Spend Permissions),
Base Sepolia only. This PoC demonstrates the enforcement semantics, not the production topology.

## M2b — deploy + wire the real chain

Deploy a vault (run by the **funder**, with their own key):

```bash
git clone --depth 1 https://github.com/foundry-rs/forge-std lib/forge-std  # if not present
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url https://sepolia.base.org --private-key $OWNER_KEY --broadcast
```

Then fund it (send Base Sepolia USDC to the printed address) and `grant(disburser, [recipients], perTxCap, dailyCap, expiry)`.

The ZenFix backend disburses through `src/features/disburse/viem-chain.ts`, which reads:

- `ZENFIX_DISBURSER_PRIVATE_KEY` — the disburser's signing key (**a dedicated testnet-only key**; set it in your env, never in code)
- `ZENFIX_BASE_SEPOLIA_RPC` — optional RPC override (defaults to `https://sepolia.base.org`)

`createViemDisburseChain()` then plugs into the same `disburse()` orchestrator the unit tests exercise — the policy gate and the on-chain teeth, now on real Base Sepolia.
