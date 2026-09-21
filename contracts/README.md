
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
