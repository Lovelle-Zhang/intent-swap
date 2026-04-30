import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, fallback, encodeFunctionData, parseUnits, formatUnits } from "viem";
import { arbitrum, linea } from "viem/chains";

// ─── 链配置 ────────────────────────────────────────────────────────────────

const CHAIN_CONFIG: Record<number, {
  quoter: `0x${string}`;
  router: `0x${string}`;
  tokens: Record<string, `0x${string}`>;
  rpcUrls: string[];
}> = {
  // Arbitrum One
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
    rpcUrls: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com", "https://arbitrum.llamarpc.com"],
  },
  // Linea Mainnet
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
    rpcUrls: ["https://rpc.linea.build", "https://linea.drpc.org"],
  },
};

const DEFAULT_CHAIN_ID = 59144; // Linea 作为默认（用户资产在这里）

const DECIMALS: Record<string, number> = {
  ETH: 18, WETH: 18, USDC: 6, USDT: 6, DAI: 18, WBTC: 8, ARB: 18,
};

function getChainConfig(chainId?: number) {
  const id = chainId ?? DEFAULT_CHAIN_ID;
  return { id, ...CHAIN_CONFIG[id] ?? CHAIN_CONFIG[DEFAULT_CHAIN_ID] };
}

function getViemChain(chainId: number) {
  return chainId === 42161 ? arbitrum : linea;
}

function resolveToken(symbol: string, tokens: Record<string, `0x${string}`>): `0x${string}` {
  if (symbol === "ETH") return tokens["WETH"];
  return tokens[symbol];
}

// DeFiLlama 价格估算（无 API key，无速率限制）
async function getPriceQuote(fromToken: string, toToken: string, amount: number): Promise<string | null> {
  try {
    const fromAddr = fromToken === "ETH" ? TOKEN_ADDRESSES["WETH"] : TOKEN_ADDRESSES[fromToken];
    const toAddr = toToken === "ETH" ? TOKEN_ADDRESSES["WETH"] : TOKEN_ADDRESSES[toToken];
    if (!fromAddr || !toAddr) return null;

    const url = `https://coins.llama.fi/prices/current/arbitrum:${fromAddr},arbitrum:${toAddr}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const fromPrice = data.coins[`arbitrum:${fromAddr}`]?.price;
    const toPrice = data.coins[`arbitrum:${toAddr}`]?.price;
    if (!fromPrice || !toPrice) return null;

    return ((amount * fromPrice) / toPrice).toFixed(6);
  } catch {
    return null;
  }
}

const QUOTER_ABI = [{
  name: "quoteExactInputSingle",
  type: "function",
  stateMutability: "nonpayable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ]}],
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
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "amountIn", type: "uint256" },
    { name: "amountOutMinimum", type: "uint256" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ]}],
  outputs: [{ name: "amountOut", type: "uint256" }],
}] as const;

const client = createPublicClient({
  chain: arbitrum,
  transport: fallback([
    http("https://arb1.arbitrum.io/rpc"),
    http("https://arbitrum-one.publicnode.com"),
    http("https://arbitrum.llamarpc.com"),
    http(),
  ]),
});

const FEE_TIERS = [500, 3000, 10000];

export async function POST(req: NextRequest) {
  try {
    const { fromToken, toToken, amount, slippagePref, walletAddress, quoteOnly, chainId: reqChainId } = await req.json();

    const chain = getChainConfig(reqChainId);
    const tokenIn = resolveToken(fromToken, chain.tokens);
    const tokenOut = resolveToken(toToken, chain.tokens);
    if (!tokenIn || !tokenOut) {
      return NextResponse.json({ error: "Unsupported token" }, { status: 400 });
    }

    // 动态创建对应链的 client
    const chainClient = createPublicClient({
      chain: getViemChain(chain.id),
      transport: fallback(chain.rpcUrls.map((url) => http(url))),
    });

    const decimalsIn = DECIMALS[fromToken] ?? 18;
    const decimalsOut = DECIMALS[toToken] ?? 18;
    const amountIn = parseUnits(String(amount), decimalsIn);

    // quoteOnly: 先用 CoinGecko 快速估算，失败再尝试链上
    if (quoteOnly) {
      const priceQuote = await getPriceQuote(fromToken, toToken, amount);
      if (priceQuote) {
        return NextResponse.json({ amountOut: priceQuote, toToken, fromToken, source: "price" });
      }
    }

    // 链上报价
    let bestAmountOut = BigInt(0);
    let bestFee = 3000;

    for (const fee of FEE_TIERS) {
      try {
        const result = await chainClient.simulateContract({
          address: chain.quoter,
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: BigInt(0) }],
        });
        const out = result.result[0];
        if (out > bestAmountOut) { bestAmountOut = out; bestFee = fee; }
      } catch { /* skip */ }
    }

    if (bestAmountOut === BigInt(0)) {
      if (quoteOnly) return NextResponse.json({ error: "No quote available" }, { status: 400 });
      return NextResponse.json({ error: "No liquidity found for this pair" }, { status: 400 });
    }

    if (quoteOnly) {
      return NextResponse.json({
        amountOut: formatUnits(bestAmountOut, decimalsOut),
        toToken, fromToken, fee: bestFee, source: "onchain",
      });
    }

    const slippageMap = { low: 0.5, normal: 1, high: 3 };
    const slippage = slippageMap[slippagePref as keyof typeof slippageMap] ?? 1;
    const amountOutMinimum = (bestAmountOut * BigInt(Math.floor((100 - slippage) * 100))) / BigInt(10000);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    const calldata = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut, fee: bestFee, recipient: walletAddress as `0x${string}`, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96: BigInt(0) }],
    });

    return NextResponse.json({
      tx: { to: chain.router, data: calldata, value: fromToken === "ETH" ? amountIn.toString() : "0" },
      amountOut: formatUnits(bestAmountOut, decimalsOut),
      toAmount: formatUnits(bestAmountOut, decimalsOut),
      toToken, fromToken, fee: bestFee, chainId: chain.id,
    });
  } catch (err) {
    console.error("swap-quote error:", err);
    return NextResponse.json({ error: "Failed to get swap quote" }, { status: 500 });
  }
}
