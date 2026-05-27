if (!globalThis.fetch) { const nf = require("node-fetch"); globalThis.fetch = nf.default || nf; globalThis.Headers = nf.Headers; globalThis.Request = nf.Request; globalThis.Response = nf.Response; }
// Manually trigger executeOnChain for one order, bypassing the cron crossing check
require("dotenv").config({ path: "/root/intent-swap-server/.env" });
const fs = require("fs");
const path = require("path");

const ORDER_ID = process.argv[2];
if (!ORDER_ID) { console.error("usage: node manual-exec.js <orderId>"); process.exit(1); }

const orders = JSON.parse(fs.readFileSync("/root/intent-swap-server/orders.json", "utf8")).orders;
const order = orders.find(o => o.id === ORDER_ID);
if (!order) { console.error("order not found"); process.exit(1); }
if (!order.exec) { console.error("order has no exec payload"); process.exit(1); }

const VAULT_ABI = JSON.parse(fs.readFileSync("/root/intent-swap-server/vault-abi.json", "utf8")).abi;
const VAULT_ADDRS = { 42161: "0x3e89119234c0635e861cce71efa274f1defd6818" };

(async () => {
  const { createWalletClient, createPublicClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { arbitrum } = await import("viem/chains");

  const e = order.exec;
  const pk = (process.env.KEEPER_PRIVATE_KEY || "").startsWith("0x") ? process.env.KEEPER_PRIVATE_KEY : "0x" + process.env.KEEPER_PRIVATE_KEY;
  const account = privateKeyToAccount(pk);
  const RPC = process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc";
  const wc = createWalletClient({ account, chain: arbitrum, transport: http(RPC) });
  const pc = createPublicClient({ chain: arbitrum, transport: http(RPC) });

  console.log("Keeper:", account.address);
  console.log("Vault:", VAULT_ADDRS[e.chainId]);

  const orderStruct = {
    user: e.user, tokenIn: e.tokenIn, tokenOut: e.tokenOut,
    amountIn: BigInt(e.amountIn),
    amountOutMinimum: BigInt(e.amountOutMinimum),
    path: e.path, isMultiHop: !!e.isMultiHop,
    nonce: BigInt(e.nonce), deadline: BigInt(e.deadline),
  };

  try {
    const sim = await pc.simulateContract({
      address: VAULT_ADDRS[e.chainId],
      abi: VAULT_ABI,
      functionName: "executeOrder",
      args: [orderStruct, e.signature],
      account,
    });
    console.log("simulation: OK");
    const hash = await wc.writeContract(sim.request);
    console.log("tx:", hash);
    const r = await pc.waitForTransactionReceipt({ hash });
    console.log("status:", r.status, "block:", r.blockNumber);
  } catch (err) {
    console.error("ERROR:", err.shortMessage || err.message);
    if (err.cause) console.error("cause:", err.cause.message || err.cause);
    process.exit(2);
  }
})();
