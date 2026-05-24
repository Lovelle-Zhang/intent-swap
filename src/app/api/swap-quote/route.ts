import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, fallback, encodeFunctionData, encodePacked, parseUnits, formatUnits } from "viem";
import { arbitrum, linea, mainnet } from "viem/chains";
import { CHAIN_TOKENS, DECIMALS, HOP_TOKENS, DEFAULT_CHAIN_ID } from "@/config/tokens";

// Server-only: RPC providers used by the quote / route-search loop.
const RPC_URLS: Record<number, string[]> = {
  1: ["https://rpc.ankr.com/eth", "https://ethereum.publicnode.com", "https://1rpc.io/eth", "https://cloudflare-eth.com"],
  42161: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one.publicnode.com", "https://arbitrum.llamarpc.com"],
  59144: ["https://rpc.linea.build", "https://linea.drpc.org"],
};

const FEE_TIERS = [500, 3000, 10000];

function getChainConfig(chainId?: number) {
  const id = chainId ?? DEFAULT_CHAIN_ID;
  const cfg = CHAIN_TOKENS[id] ?? CHAIN_TOKENS[DEFAULT_CHAIN_ID];
  const rpcUrls = RPC_URLS[id] ?? RPC_URLS[DEFAULT_CHAIN_ID];
  return { id, ...cfg, rpcUrls };
}
function getViemChain(chainId: number) {
  if (chainId === 42161) return arbitrum;
  if (chainId === 59144) return linea;
  return mainnet;
}
function resolveToken(symbol: string, tokens: Record<string, `0x${string}`>): `0x${string}` {
  return symbol === "ETH" ? tokens["WETH"] : tokens[symbol];
}

async function getPriceQuote(fromToken: string, toToken: string, amount: number, chainId: number): Promise<string | null> {
  try {
    const chainTokens = (CHAIN_TOKENS[chainId] ?? CHAIN_TOKENS[DEFAULT_CHAIN_ID]).tokens;
    const fromAddr = fromToken === "ETH" ? chainTokens["WETH"] : chainTokens[fromToken];
    const toAddr = toToken === "ETH" ? chainTokens["WETH"] : chainTokens[toToken];
    if (!fromAddr || !toAddr) return null;
    const slug = chainId === 42161 ? "arbitrum" : chainId === 59144 ? "linea" : "ethereum";
    const res = await fetch(`https://coins.llama.fi/prices/current/${slug}:${fromAddr},${slug}:${toAddr}`);
    if (!res.ok) return null;
    const data = await res.json();
    const fp = data.coins[`${slug}:${fromAddr}`]?.price;
    const tp = data.coins[`${slug}:${toAddr}`]?.price;
    if (!fp || !tp) return null;
    return ((amount * fp) / tp).toFixed(6);
  } catch { return null; }
}

// ─── ABIs ────────────────────────────────────────────────────────────────

const QUOTER_SINGLE_ABI = [{
  name: "quoteExactInputSingle", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" },
  ]}],
  outputs: [
    { name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

const QUOTER_MULTI_ABI = [{
  name: "quoteExactInput", type: "function", stateMutability: "nonpayable",
  inputs: [{ name: "path", type: "bytes" }, { name: "amountIn", type: "uint256" }],
  outputs: [
    { name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96AfterList", type: "uint160[]" },
    { name: "initializedTicksCrossedList", type: "uint32[]" }, { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

const ROUTER_SINGLE_ABI = [{
  name: "exactInputSingle", type: "function", stateMutability: "payable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "fee", type: "uint24" }, { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" }, { name: "amountIn", type: "uint256" },
    { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ]}],
  outputs: [{ name: "amountOut", type: "uint256" }],
}] as const;

const ROUTER_MULTI_ABI = [{
  name: "exactInput", type: "function", stateMutability: "payable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "path", type: "bytes" }, { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" }, { name: "amountIn", type: "uint256" },
    { name: "amountOutMinimum", type: "uint256" },
  ]}],
  outputs: [{ name: "amountOut", type: "uint256" }],
}] as const;

// ─── Route types ─────────────────────────────────────────────────────────

interface RouteResult {
  amountOut: bigint;
  path: `0x${string}`;
  route: string[];
  hops: number;
  fees: number[];
}

async function quoteSingle(
  cc: ReturnType<typeof createPublicClient>,
  quoter: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
  symIn: string,
  symOut: string,
): Promise<RouteResult | null> {
  let best: RouteResult | null = null;
  for (const fee of FEE_TIERS) {
    try {
      const r = await cc.simulateContract({
        address: quoter, abi: QUOTER_SINGLE_ABI, functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: BigInt(0) }],
      });
      const out = r.result[0];
      if (!best || out > best.amountOut) {
        best = {
          amountOut: out,
          path: encodePacked(["address", "uint24", "address"], [tokenIn, fee, tokenOut]),
          route: [symIn, symOut], hops: 1, fees: [fee],
        };
      }
    } catch { /* skip */ }
  }
  return best;
}

async function quoteMultiHop(
  cc: ReturnType<typeof createPublicClient>,
  quoter: `0x${string}`,
  tokens: Record<string, `0x${string}`>,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
  symIn: string,
  symOut: string,
): Promise<RouteResult | null> {
  let best: RouteResult | null = null;
  for (const hopSym of HOP_TOKENS) {
    const tokenMid = tokens[hopSym];
    if (!tokenMid || tokenMid === tokenIn || tokenMid === tokenOut) continue;
    for (const fee1 of FEE_TIERS) {
      for (const fee2 of FEE_TIERS) {
        try {
          const path = encodePacked(
            ["address", "uint24", "address", "uint24", "address"],
            [tokenIn, fee1, tokenMid, fee2, tokenOut]
          );
          const r = await cc.simulateContract({
            address: quoter, abi: QUOTER_MULTI_ABI, functionName: "quoteExactInput",
            args: [path, amountIn],
          });
          const out = r.result[0];
          if (!best || out > best.amountOut) {
            best = { amountOut: out, path, route: [symIn, hopSym, symOut], hops: 2, fees: [fee1, fee2] };
          }
        } catch { /* skip */ }
      }
    }
  }
  return best;
}

// ─── Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { fromToken, toToken, amount, slippagePref, walletAddress, quoteOnly, chainId: reqChainId } = await req.json();

    const chain = getChainConfig(reqChainId);
    const tokenIn = resolveToken(fromToken, chain.tokens);
    const tokenOut = resolveToken(toToken, chain.tokens);
    if (!tokenIn || !tokenOut) return NextResponse.json({ error: "Unsupported token" }, { status: 400 });

    const cc = createPublicClient({
      chain: getViemChain(chain.id),
      transport: fallback(chain.rpcUrls.map((url) => http(url))),
    });

    const decimalsIn = DECIMALS[fromToken] ?? 18;
    const decimalsOut = DECIMALS[toToken] ?? 18;
    const amountIn = parseUnits(String(amount), decimalsIn);
    const symIn = fromToken === "ETH" ? "ETH" : fromToken;

    // quoteOnly: 先 DeFiLlama 快速估算
    if (quoteOnly) {
      const pq = await getPriceQuote(fromToken, toToken, amount, chain.id);
      if (pq) return NextResponse.json({ amountOut: pq, toToken, fromToken, source: "price" });
    }

    // 并行查单步 + 多步路由
    const [singleR, multiR] = await Promise.all([
      quoteSingle(cc, chain.quoter, tokenIn, tokenOut, amountIn, symIn, toToken),
      quoteMultiHop(cc, chain.quoter, chain.tokens, tokenIn, tokenOut, amountIn, symIn, toToken),
    ]);

    let best: RouteResult | null = null;
    if (singleR && multiR) best = multiR.amountOut > singleR.amountOut ? multiR : singleR;
    else best = singleR ?? multiR;

    if (!best || best.amountOut === BigInt(0)) {
      return NextResponse.json({ error: "No liquidity found for this pair" }, { status: 400 });
    }

    // Price impact
    let priceImpact: string | undefined;
    try {
      const pq = await getPriceQuote(fromToken, toToken, amount, chain.id);
      if (pq) {
        const onchain = parseFloat(formatUnits(best.amountOut, decimalsOut));
        const fair = parseFloat(pq);
        if (fair > 0) priceImpact = Math.max(0, ((fair - onchain) / fair) * 100).toFixed(2);
      }
    } catch { /* ignore */ }

    if (quoteOnly) {
      return NextResponse.json({
        amountOut: formatUnits(best.amountOut, decimalsOut),
        toToken, fromToken, route: best.route, hops: best.hops, source: "onchain",
        ...(priceImpact !== undefined ? { priceImpact } : {}),
      });
    }

    const slippageMap = { low: 0.5, normal: 1, high: 3 };
    const slippage = slippageMap[slippagePref as keyof typeof slippageMap] ?? 1;
    const amountOutMinimum = (best.amountOut * BigInt(Math.floor((100 - slippage) * 100))) / BigInt(10000);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    const calldata: `0x${string}` = best.hops === 1
      ? encodeFunctionData({
          abi: ROUTER_SINGLE_ABI, functionName: "exactInputSingle",
          args: [{ tokenIn, tokenOut, fee: best.fees[0], recipient: walletAddress as `0x${string}`,
            deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96: BigInt(0) }],
        })
      : encodeFunctionData({
          abi: ROUTER_MULTI_ABI, functionName: "exactInput",
          args: [{ path: best.path, recipient: walletAddress as `0x${string}`,
            deadline, amountIn, amountOutMinimum }],
        });

    return NextResponse.json({
      tx: { to: chain.router, data: calldata, value: fromToken === "ETH" ? amountIn.toString() : "0" },
      amountOut: formatUnits(best.amountOut, decimalsOut),
      toAmount: formatUnits(best.amountOut, decimalsOut),
      toToken, fromToken, route: best.route, hops: best.hops, chainId: chain.id,
      ...(priceImpact !== undefined ? { priceImpact } : {}),
    });
  } catch (err) {
    console.error("swap-quote error:", err);
    return NextResponse.json({ error: "Failed to get swap quote" }, { status: 500 });
  }
}
