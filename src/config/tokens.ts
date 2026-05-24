import type { Hex } from "viem";

export interface ChainTokens {
  quoter: Hex;
  router: Hex;
  tokens: Record<string, Hex>;
}

// Single source of truth for per-chain token, router, and quoter addresses.
// "ETH" is the pseudo-address used by aggregators (0xEee…E) — actual swaps
// resolve it to WETH via resolveTokenAddress().
export const CHAIN_TOKENS: Record<number, ChainTokens> = {
  1: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    tokens: {
      ETH:  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    },
  },
  42161: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    tokens: {
      ETH:  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      DAI:  "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      ARB:  "0x912CE59144191C1204E64559FE8253a0e49E6548",
    },
  },
  59144: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    tokens: {
      ETH:  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      WETH: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f",
      USDC: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
      USDT: "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
      DAI:  "0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5",
      WBTC: "0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b2",
    },
  },
};

export const DECIMALS: Record<string, number> = {
  ETH: 18, WETH: 18, USDC: 6, USDT: 6, DAI: 18, WBTC: 8, ARB: 18,
};

export const HOP_TOKENS = ["WETH", "USDC", "USDT", "DAI"] as const;

export const TOKEN_ICONS: Record<string, string> = {
  ETH: "Ξ", WETH: "Ξ", USDC: "$", USDT: "₮", DAI: "◈", WBTC: "₿", ARB: "⬡",
};

export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  42161: "Arbitrum",
  59144: "Linea",
};

export const DEFAULT_CHAIN_ID = 1;

export function getChainTokens(chainId?: number): ChainTokens {
  return CHAIN_TOKENS[chainId ?? DEFAULT_CHAIN_ID] ?? CHAIN_TOKENS[DEFAULT_CHAIN_ID];
}

// Resolves a symbol to a contract address on the given chain. "ETH" is mapped
// to WETH because routers / quoters expect ERC20 addresses, not the pseudo 0xEee.
export function resolveTokenAddress(symbol: string, chainId?: number): Hex | undefined {
  const tokens = getChainTokens(chainId).tokens;
  return symbol === "ETH" ? tokens["WETH"] : tokens[symbol];
}

export function getTokenDecimals(symbol: string): number {
  return DECIMALS[symbol] ?? 18;
}
