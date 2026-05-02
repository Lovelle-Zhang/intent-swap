/**
 * Vault SDK — ConditionalSwapVault 前端交互工具
 * 用于 conditional-order 页面调用
 */

import { encodePacked, keccak256, encodeAbiParameters, parseAbiParameters, type Hex } from "viem";

// 已部署合约地址（部署后填入）
export const VAULT_ADDRESSES: Record<number, Hex> = {
  1:     "0x52a8fe40324621d310ede9bfd20396b82dfec0ee", // Ethereum Mainnet
  42161: "0x0000000000000000000000000000000000000000", // TODO: deploy to arbitrum
  59144: "0x0000000000000000000000000000000000000000", // TODO: deploy to linea
};

export const VAULT_ABI = [
  // Deposit
  {
    name: "deposit", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "depositETH", type: "function", stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  // Withdraw
  {
    name: "withdraw", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  // Cancel orders
  {
    name: "cancelOrders", type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [],
  },
  // Get nonce
  {
    name: "nonces", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  // Get deposit
  {
    name: "getUserDeposit", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }, { name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  // Get order digest
  {
    name: "getOrderDigest", type: "function", stateMutability: "view",
    inputs: [{ name: "order", type: "tuple", components: [
      { name: "user", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "path", type: "bytes" },
      { name: "isMultiHop", type: "bool" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]}],
    outputs: [{ type: "bytes32" }],
  },
  // Domain separator
  {
    name: "DOMAIN_SEPARATOR", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "bytes32" }],
  },
] as const;

export interface VaultOrder {
  user: Hex;
  tokenIn: Hex;
  tokenOut: Hex;
  amountIn: bigint;
  amountOutMinimum: bigint;
  path: Hex;
  isMultiHop: boolean;
  nonce: bigint;
  deadline: bigint;
}

// EIP-712 typed data for signing
export function buildOrderTypedData(order: VaultOrder, chainId: number, vaultAddress: Hex) {
  return {
    domain: {
      name: "ConditionalSwapVault",
      version: "1",
      chainId,
      verifyingContract: vaultAddress,
    },
    types: {
      Order: [
        { name: "user",              type: "address" },
        { name: "tokenIn",           type: "address" },
        { name: "tokenOut",          type: "address" },
        { name: "amountIn",          type: "uint256" },
        { name: "amountOutMinimum",  type: "uint256" },
        { name: "pathHash",          type: "bytes32" },
        { name: "isMultiHop",        type: "bool" },
        { name: "nonce",             type: "uint256" },
        { name: "deadline",          type: "uint256" },
      ],
    },
    primaryType: "Order" as const,
    message: {
      user:             order.user,
      tokenIn:          order.tokenIn,
      tokenOut:         order.tokenOut,
      amountIn:         order.amountIn,
      amountOutMinimum: order.amountOutMinimum,
      pathHash:         keccak256(order.path), // bytes → bytes32
      isMultiHop:       order.isMultiHop,
      nonce:            order.nonce,
      deadline:         order.deadline,
    },
  };
}

// 是否已部署（地址不是零地址）
export function isVaultDeployed(chainId: number): boolean {
  const addr = VAULT_ADDRESSES[chainId];
  return !!addr && addr !== "0x0000000000000000000000000000000000000000";
}

// 编码单步路径
export function encodeSingleHopPath(tokenIn: Hex, fee: number, tokenOut: Hex): Hex {
  return encodePacked(["address", "uint24", "address"], [tokenIn, fee, tokenOut]);
}
