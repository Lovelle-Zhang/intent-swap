import { mainnet, arbitrum, linea } from "wagmi/chains";

export const CHAIN_LABELS: Record<number, string> = {
  [mainnet.id]: "Ethereum · Uniswap V3",
  [arbitrum.id]: "Arbitrum · Uniswap V3",
  [linea.id]: "Linea · Izumi Finance",
};

export const DEFAULT_CHAIN_LABEL = CHAIN_LABELS[mainnet.id];

export const SWAP_EXAMPLES = [
  "Swap 0.1 ETH to USDC",
  "500 USDC to ARB, low slippage",
  "Convert all my DAI to WETH",
];

export const CONDITIONAL_EXAMPLES = [
  "When ETH drops to $2200, buy 0.1 ETH with USDC",
  "If ETH rises above $3000, sell 0.05 ETH",
  "When BTC drops below $95k, buy 0.001 WBTC",
  "If ARB reaches $0.8, swap 500 USDC to ARB",
];

export const FX_EXAMPLES = [
  "Exchange 1000 USDC to EURC",
  "When USD/EUR reaches 1.12, swap 2000 USDC",
  "Convert all my USDC to GBPT",
];

export const FX_PAIRS = [
  { from: "USDC", to: "EURC", label: "USD → EUR" },
  { from: "USDC", to: "GBPT", label: "USD → GBP" },
  { from: "EURC", to: "USDC", label: "EUR → USD" },
  { from: "GBPT", to: "USDC", label: "GBP → USD" },
  { from: "EURC", to: "GBPT", label: "EUR → GBP" },
  { from: "USDC", to: "EURT", label: "USD → EUR (T)" },
] as const;

export const MAX_INTENT_LENGTH = 500;

export const LOADING_STEPS = [
  "Reading your intent...",
  "Fetching token prices...",
  "Finding best route...",
  "Almost there...",
];

export const PLACEHOLDERS = {
  swap: "e.g. Swap 0.1 ETH to USDC",
  swapWithHint: (hint: string) => `Swap with ${hint}...`,
  conditional: "e.g. When ETH drops to $2200, buy 0.1 ETH with USDC",
  fx: "e.g. Exchange 1000 USDC to EURC",
};
