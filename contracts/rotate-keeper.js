/**
 * 把 ConditionalSwapVault 的 keeper + owner 切到新钱包。
 *
 *   node contracts/rotate-keeper.js --network mainnet
 *   node contracts/rotate-keeper.js --network arbitrum
 *
 * 环境变量（.env.local）：
 *   DEPLOYER_PRIVATE_KEY=0x...   旧钱包（当前 owner）的私钥
 *   NEW_OWNER_ADDRESS=0x...      新钱包地址
 *
 * 执行：setKeeper(new) 然后 transferOwnership(new)。setKeeper 先做，
 * 这样万一 transferOwnership 出问题也不会卡住 keeper 切换。
 */

const { createWalletClient, createPublicClient, http, getAddress } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { mainnet, arbitrum, linea } = require("viem/chains");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

const ARTIFACT_PATH = path.join(__dirname, "artifacts", "ConditionalSwapVault.json");
const ARTIFACT = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));

const VAULTS = {
  mainnet:  { addr: "0x52a8fe40324621d310ede9bfd20396b82dfec0ee", chain: mainnet,  rpc: "https://ethereum.publicnode.com", explorer: "https://etherscan.io" },
  arbitrum: { addr: "0x3e89119234c0635e861cce71efa274f1defd6818", chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc",  explorer: "https://arbiscan.io" },
};

async function rotate() {
  const network = process.argv.find((a) => a.startsWith("--network="))?.split("=")[1]
    ?? process.argv[process.argv.indexOf("--network") + 1];
  const config = VAULTS[network];
  if (!config) { console.error(`Unknown network: ${network}. Use mainnet or arbitrum.`); process.exit(1); }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const newOwnerRaw = process.env.NEW_OWNER_ADDRESS;
  if (!privateKey || !newOwnerRaw) {
    console.error("Missing DEPLOYER_PRIVATE_KEY or NEW_OWNER_ADDRESS in .env.local");
    process.exit(1);
  }
  const newOwner = getAddress(newOwnerRaw);

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpc) });
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpc) });

  // 读当前状态
  const [currentOwner, currentKeeper, balance] = await Promise.all([
    publicClient.readContract({ address: config.addr, abi: ARTIFACT.abi, functionName: "owner" }),
    publicClient.readContract({ address: config.addr, abi: ARTIFACT.abi, functionName: "keeper" }),
    publicClient.getBalance({ address: account.address }),
  ]);

  console.log(`Rotating ${network} vault ${config.addr}`);
  console.log(`  Caller (signer):  ${account.address}  (balance: ${Number(balance)/1e18} ETH)`);
  console.log(`  Current owner:    ${currentOwner}`);
  console.log(`  Current keeper:   ${currentKeeper}`);
  console.log(`  New owner+keeper: ${newOwner}`);

  if (currentOwner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(`\nSigner is not the current owner. Cannot proceed.`);
    process.exit(1);
  }
  if (currentOwner === newOwner && currentKeeper === newOwner) {
    console.log(`\nAlready rotated to ${newOwner}. Nothing to do.`);
    return;
  }
  if (balance === 0n) {
    console.error(`\nSigner has 0 ETH on ${network}. Top up before retrying.`);
    process.exit(1);
  }

  // 1) setKeeper
  if (currentKeeper.toLowerCase() !== newOwner.toLowerCase()) {
    console.log(`\n→ setKeeper(${newOwner})`);
    const hash = await walletClient.writeContract({
      address: config.addr, abi: ARTIFACT.abi, functionName: "setKeeper", args: [newOwner],
    });
    console.log(`  Tx: ${hash}`);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") { console.error("  setKeeper failed"); process.exit(1); }
    console.log(`  ✅ setKeeper confirmed`);
  } else {
    console.log(`\n→ keeper already ${newOwner}, skip`);
  }

  // 2) transferOwnership
  if (currentOwner.toLowerCase() !== newOwner.toLowerCase()) {
    console.log(`\n→ transferOwnership(${newOwner})`);
    const hash = await walletClient.writeContract({
      address: config.addr, abi: ARTIFACT.abi, functionName: "transferOwnership", args: [newOwner],
    });
    console.log(`  Tx: ${hash}`);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") { console.error("  transferOwnership failed"); process.exit(1); }
    console.log(`  ✅ transferOwnership confirmed`);
  }

  console.log(`\nDone. Verify at ${config.explorer}/address/${config.addr}#readContract`);
}

rotate().catch((e) => { console.error(e); process.exit(1); });
