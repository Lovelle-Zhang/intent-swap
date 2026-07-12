import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAIN_TOKENS } from "@/config/tokens";

const viemMocks = vi.hoisted(() => {
  const simulateContract = vi.fn();
  return {
    simulateContract,
    createPublicClient: vi.fn(() => ({ simulateContract })),
  };
});

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: viemMocks.createPublicClient,
  };
});

import { POST } from "@/app/api/swap-quote/route";

const WALLET = "0x1111111111111111111111111111111111111111";

function request(body: unknown): NextRequest {
  return { json: async () => body } as NextRequest;
}

describe("legacy swap quote route", () => {
  beforeEach(() => {
    viemMocks.createPublicClient.mockClear();
    viemMocks.simulateContract.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Unexpected external fetch in test"))),
    );
  });

  it("rejects unsupported symbols before creating clients or fetching", async () => {
    const response = await POST(
      request({
        fromToken: "UNKNOWN",
        toToken: "USDC",
        amount: 1,
        quoteOnly: true,
        chainId: 1,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unsupported token" });
    expect(viemMocks.createPublicClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the six-decimal DeFiLlama estimate for quoteOnly", async () => {
    const weth = CHAIN_TOKENS[1].tokens.WETH;
    const usdc = CHAIN_TOKENS[1].tokens.USDC;
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          coins: {
            [`ethereum:${weth}`]: { price: 2000 },
            [`ethereum:${usdc}`]: { price: 1 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await POST(
      request({
        fromToken: "ETH",
        toToken: "USDC",
        amount: 2,
        quoteOnly: true,
        chainId: 1,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      amountOut: "4000.000000",
      toToken: "USDC",
      fromToken: "ETH",
      source: "price",
    });
    expect(viemMocks.createPublicClient).toHaveBeenCalledOnce();
    expect(viemMocks.simulateContract).not.toHaveBeenCalled();
  });

  it("returns no-liquidity when price and every simulated route fail", async () => {
    viemMocks.simulateContract.mockRejectedValue(new Error("no pool"));

    const response = await POST(
      request({
        fromToken: "ETH",
        toToken: "USDC",
        amount: 1,
        quoteOnly: true,
        chainId: 1,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No liquidity found for this pair",
    });
    expect(viemMocks.simulateContract).toHaveBeenCalled();
  });

  it("encodes the current single-hop ETH transaction response", async () => {
    viemMocks.simulateContract.mockImplementation(async ({ functionName }) => {
      if (functionName === "quoteExactInputSingle") {
        return { result: [1_900_000n, 0n, 0, 0n] };
      }
      throw new Error("no multihop pool");
    });

    const response = await POST(
      request({
        fromToken: "ETH",
        toToken: "USDC",
        amount: 1,
        slippagePref: "normal",
        walletAddress: WALLET,
        quoteOnly: false,
        chainId: 1,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      amountOut: "1.9",
      toAmount: "1.9",
      toToken: "USDC",
      fromToken: "ETH",
      route: ["ETH", "USDC"],
      hops: 1,
      chainId: 1,
      tx: {
        to: CHAIN_TOKENS[1].router,
        value: "1000000000000000000",
      },
    });
    expect(body.tx.data).toMatch(/^0x[0-9a-f]+$/i);
  });
});
