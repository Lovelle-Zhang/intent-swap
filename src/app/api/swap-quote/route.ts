import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, encodeFunctionData, parseUnits, formatUnits } from "viem";
import { arbitrum } from "viem/chains";

// Uniswap V3 on Arbitrum
const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  ETH:  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  DAI:  "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
  ARB:  "0x912CE59144191C1204E64559FE8253a0e49E6548",
};

const DECIMALS: Record<string, number> = {
  ETH: 18, WETH: 18, USDC: 6, USDT: 6, DAI: 18, WBTC: 8, ARB: 18,
};

// ETH swap 需要先 wrap 成 WETH，或用 router 的 ETH 路径
function resolveToken(symbol: string): `0x${string}` {
  if (symbol === "ETH") return TOKEN_ADDRESSES["WETH"]; // Uniswap V3 用 WETH
  return TOKEN_ADDRESSES[symbol];
}

const QUOTER_ABI = [{
  name: "quoteExactInputSingle",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" },
    { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

const ROUTER_ABI = [{
  name: "exactInputSingle",
  type: "function",
  stateMutability: "payable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
    ],
  }],
  outputs: [{ name: "amountOut", type: "uint256" }],
}] as const;

const client = createPublicClient({ chain: arbitrum, transport: http() });

const FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

export async function POST(req: NextRequest) {
  try {
    const { fromToken, toToken, amount, slippagePref, walletAddress } = await req.json();

    const tokenIn = resolveToken(fromToken);
    const tokenOut = resolveToken(toToken);
    if (!tokenIn || !tokenOut) {
      return NextResponse.json({ error: `Unsupported token` }, { status: 400 });
    }

    const decimalsIn = DECIMALS[fromToken] ?? 18;
    const decimalsOut = DECIMALS[toToken] ?? 18;
    const amountIn = parseUnits(String(amount), decimalsIn);

    // 尝试不同 fee tier，取最优报价
    let bestAmountOut = BigInt(0);
    let bestFee = 3000;

    for (const fee of FEE_TIERS) {
      try {
        const result = await client.simulateContract({
          address: QUOTER_V2,
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: BigInt(0) }],
        });
        const out = result.result[0];
        if (out > bestAmountOut) {
          bestAmountOut = out;
          bestFee = fee;
        }
      } catch {
        // 该 fee tier 无流动性，跳过
      }
    }

    if (bestAmountOut === BigInt(0)) {
      return NextResponse.json({ error: "No liquidity found for this pair" }, { status: 400 });
    }

    const slippageMap = { low: 0.5, normal: 1, high: 3 };
    const slippage = slippageMap[slippagePref as keyof typeof slippageMap] ?? 1;
    const amountOutMinimum = (bestAmountOut * BigInt(Math.floor((100 - slippage) * 100))) / BigInt(10000);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min

    const calldata = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn,
        tokenOut,
        fee: bestFee,
        recipient: walletAddress as `0x${string}`,
        deadline,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: BigInt(0),
      }],
    });

    const isFromETH = fromToken === "ETH";

    return NextResponse.json({
      tx: {
        to: SWAP_ROUTER,
        data: calldata,
        value: isFromETH ? amountIn.toString() : "0",
      },
      toAmount: formatUnits(bestAmountOut, decimalsOut),
      toToken,
      fromToken,
      fee: bestFee,
      priceImpact: null, // 可后续计算
    });
  } catch (err) {
    console.error("swap-quote error:", err);
    return NextResponse.json({ error: "Failed to get swap quote" }, { status: 500 });
  }
}
