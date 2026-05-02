/**
 * 部署 ConditionalSwapVault 到 Ethereum Mainnet / Arbitrum / Linea
 *
 * 使用方法：
 * node contracts/deploy.js --network mainnet
 * node contracts/deploy.js --network arbitrum
 *
 * 环境变量（.env.local）：
 * DEPLOYER_PRIVATE_KEY=0x...
 * KEEPER_ADDRESS=0x...（后端服务器的钱包地址，用于调用 executeOrder）
 *
 * 安装依赖：
 * npm install viem dotenv
 */

const { createWalletClient, createPublicClient, http, parseGwei } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { mainnet, arbitrum, linea } = require("viem/chains");
const { readFileSync } = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

// ─── 合约字节码占位（需要 solc 编译后填入）─────────────────────────────────
// 生产部署时使用 `npx hardhat compile` 或 `forge build` 生成 bytecode
// 这里提供部署脚手架，bytecode 需单独填入
const PLACEHOLDER_BYTECODE = "0x"; // TODO: replace with compiled bytecode

// Uniswap V3 SwapRouter 地址（各链相同）
const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

const CHAINS = {
  mainnet: { chain: mainnet, rpc: "https://rpc.ankr.com/eth" },
  arbitrum: { chain: arbitrum, rpc: "https://arb1.arbitrum.io/rpc" },
  linea: { chain: linea, rpc: "https://rpc.linea.build" },
};

async function deploy() {
  const network = process.argv.find((a) => a.startsWith("--network="))?.split("=")[1]
    ?? process.argv[process.argv.indexOf("--network") + 1]
    ?? "arbitrum"; // 默认 Arbitrum（gas 更低）

  const config = CHAINS[network];
  if (!config) throw new Error(`Unknown network: ${network}`);

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const keeperAddress = process.env.KEEPER_ADDRESS;
  if (!privateKey || !keeperAddress) {
    console.error("Missing DEPLOYER_PRIVATE_KEY or KEEPER_ADDRESS in .env.local");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpc) });
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpc) });

  console.log(`Deploying ConditionalSwapVault to ${network}...`);
  console.log(`  Deployer: ${account.address}`);
  console.log(`  Keeper:   ${keeperAddress}`);
  console.log(`  Router:   ${SWAP_ROUTER}`);

  // ABI 构造函数
  const constructorAbi = [{
    type: "constructor",
    inputs: [
      { name: "_swapRouter", type: "address" },
      { name: "_keeper", type: "address" },
    ],
  }];

  const hash = await walletClient.deployContract({
    abi: constructorAbi,
    bytecode: PLACEHOLDER_BYTECODE,
    args: [SWAP_ROUTER, keeperAddress],
  });

  console.log(`  Tx: ${hash}`);
  console.log("  Waiting for receipt...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`\n✅ ConditionalSwapVault deployed at: ${receipt.contractAddress}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Update VAULT_ADDRESS in .env.local`);
  console.log(`  2. Update VAULT_ADDRESS in src/lib/vault.ts`);
  console.log(`  3. Update backend server.js with vault address`);
  console.log(`  4. Verify contract on Etherscan: https://etherscan.io/address/${receipt.contractAddress}`);

  return receipt.contractAddress;
}

deploy().catch(console.error);
