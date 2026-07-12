import { describe, expect, it } from "vitest";

import {
  CHAIN_NAMES,
  CHAIN_TOKENS,
  DEFAULT_CHAIN_ID,
  HOP_TOKENS,
  getChainTokens,
  getTokenDecimals,
  resolveTokenAddress,
} from "@/config/tokens";

describe("legacy token configuration", () => {
  it("defaults omitted and unknown chain ids to Ethereum", () => {
    expect(DEFAULT_CHAIN_ID).toBe(1);
    expect(getChainTokens()).toBe(CHAIN_TOKENS[1]);
    expect(getChainTokens(8453)).toBe(CHAIN_TOKENS[1]);
  });

  it("pins the supported legacy chains and hop order", () => {
    expect(Object.keys(CHAIN_TOKENS).map(Number)).toEqual([1, 42161, 59144]);
    expect(CHAIN_NAMES).toEqual({
      1: "Ethereum",
      42161: "Arbitrum",
      59144: "Linea",
    });
    expect(HOP_TOKENS).toEqual(["WETH", "USDC", "USDT", "DAI"]);
  });

  it("maps native ETH to chain-specific WETH", () => {
    expect(resolveTokenAddress("ETH", 1)).toBe(CHAIN_TOKENS[1].tokens.WETH);
    expect(resolveTokenAddress("ETH", 42161)).toBe(CHAIN_TOKENS[42161].tokens.WETH);
    expect(resolveTokenAddress("ETH", 59144)).toBe(CHAIN_TOKENS[59144].tokens.WETH);
  });

  it("keeps token symbols case-sensitive and returns undefined when absent", () => {
    expect(resolveTokenAddress("USDC", 1)).toBe(CHAIN_TOKENS[1].tokens.USDC);
    expect(resolveTokenAddress("usdc", 1)).toBeUndefined();
    expect(resolveTokenAddress("ARB", 1)).toBeUndefined();
    expect(resolveTokenAddress("ARB", 42161)).toBe(CHAIN_TOKENS[42161].tokens.ARB);
  });

  it("uses configured decimals and falls back unknown symbols to 18", () => {
    expect(getTokenDecimals("USDC")).toBe(6);
    expect(getTokenDecimals("WBTC")).toBe(8);
    expect(getTokenDecimals("UNKNOWN")).toBe(18);
    expect(getTokenDecimals("usdc")).toBe(18);
  });
});
