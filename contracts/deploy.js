/**
 * 部署 ConditionalSwapVault 到 Ethereum / Arbitrum / Linea
 *
 *   node contracts/compile.js                       # 先编译
 *   node contracts/deploy.js --network arbitrum     # 再部署
 *
 * 环境变量（.env.local）：
 *   DEPLOYER_PRIVATE_KEY=0x...   私钥（owner，部署后可调 setKeeper）
 *   KEEPER_ADDRESS=0x...         允许调用 executeOrder 的地址（monitor 钱包）
 *                                临时可设为 DEPLOYER 自己，部署后再 setKeeper
 *
 * ⚠️ Linea 用的是 Izumi 不是 Uniswap V3，合约硬编码了 V3 ISwapRouter，
 *    Linea 链上 swap 会 revert —— 部 Linea 前需要先做 Izumi 适配。
 */

const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { mainnet, arbitrum, linea } = require("viem/chains");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

// ─── 编译产物 ──────────────────────────────────────────────────────────────

const ARTIFACT_PATH = path.join(__dirname, "artifacts", "ConditionalSwapVault.json");
if (!fs.existsSync(ARTIFACT_PATH)) {
  console.error(`Missing ${ARTIFACT_PATH}. Run: node contracts/compile.js`);
  process.exit(1);
}
const ARTIFACT = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));

// Uniswap V3 SwapRouter — same address on Ethereum + Arbitrum
const UNIV3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
// iZiSwap (Izumi) Swap router on Linea
const IZUMI_ROUTER_LINEA = "0x032b241De86a8660f1Ae0691a4760B426EA246d7";

// dexType: 0 = Uniswap V3, 1 = iZiSwap/Izumi
const CHAINS = {
  mainnet:  { chain: mainnet,  rpc: "https://rpc.ankr.com/eth",      explorer: "https://etherscan.io",   router: UNIV3_ROUTER,        dexType: 0 },
  arbitrum: { chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc",  explorer: "https://arbiscan.io",    router: UNIV3_ROUTER,        dexType: 0 },
  linea:    { chain: linea,    rpc: "https://rpc.linea.build",       explorer: "https://lineascan.build", router: IZUMI_ROUTER_LINEA, dexType: 1 },
};

async function deploy() {
  const network = process.argv.find((a) => a.startsWith("--network="))?.split("=")[1]
    ?? process.argv[process.argv.indexOf("--network") + 1]
    ?? "arbitrum"; // 默认 Arbitrum（gas 更低）

  const config = CHAINS[network];
  if (!config) throw new Error(`Unknown network: ${network}`);

  let privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const keeperAddress = process.env.KEEPER_ADDRESS;
  if (!privateKey || !keeperAddress) {
    console.error("Missing DEPLOYER_PRIVATE_KEY or KEEPER_ADDRESS in .env.local");
    process.exit(1);
  }
  if (!privateKey.startsWith("0x")) privateKey = "0x" + privateKey; // normalize

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpc) });
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpc) });

  console.log(`Deploying ConditionalSwapVault to ${network}...`);
  console.log(`  Deployer: ${account.address}`);
  console.log(`  Keeper:   ${keeperAddress}`);
  console.log(`  Router:   ${config.router} (dexType ${config.dexType === 1 ? "1 = iZiSwap" : "0 = Uniswap V3"})`);
  console.log(`  Compiler: ${ARTIFACT.compiler}`);

  // 部署前先查余额，避免空钱包白白等
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`  Balance:  ${Number(balance) / 1e18} ETH on ${network}`);
  if (balance === 0n) {
    console.error("Deployer has 0 ETH — top up the wallet before retrying.");
    process.exit(1);
  }

  const hash = await walletClient.deployContract({
    abi: ARTIFACT.abi,
    bytecode: ARTIFACT.bytecode,
    args: [config.router, keeperAddress, config.dexType],
  });

  console.log(`  Tx: ${hash}`);
  console.log("  Waiting for receipt...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`\n✅ ConditionalSwapVault deployed at: ${receipt.contractAddress}`);
  console.log(`   Explorer: ${config.explorer}/address/${receipt.contractAddress}`);

  console.log(`\nNext steps:`);
  console.log(`  1. Update VAULT_ADDRESSES[${config.chain.id}] in src/lib/vault.ts`);
  console.log(`  2. (optional) If KEEPER_ADDRESS was set to deployer, run setKeeper() to point at the monitor wallet`);
  console.log(`  3. Verify on ${config.explorer} (use compiler ${ARTIFACT.compiler}, optimizer enabled, 200 runs)`);

  return receipt.contractAddress;
}

deploy().catch(console.error);
