import { NextRequest, NextResponse } from "next/server";
import { AutomateSDK } from "@gelatonetwork/automate-sdk";
import { encodeFunctionData, parseUnits } from "viem";

// Gelato Automate 配置
const GELATO_RELAY_API_KEY = process.env.GELATO_RELAY_API_KEY;

// Uniswap V3 Router ABI (仅需要的函数)
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

const SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;

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

export async function POST(req: NextRequest) {
  try {
    const { fromToken, toToken, amount, condition, walletAddress, slippagePref } = await req.json();

    if (!GELATO_RELAY_API_KEY) {
      return NextResponse.json({ error: "Gelato API key not configured" }, { status: 500 });
    }

    // 初始化 Gelato SDK
    const automate = new AutomateSDK(42161, walletAddress); // Arbitrum

    // 构建 swap calldata
    const tokenIn = fromToken === "ETH" ? TOKEN_ADDRESSES["WETH"] : TOKEN_ADDRESSES[fromToken];
    const tokenOut = toToken === "ETH" ? TOKEN_ADDRESSES["WETH"] : TOKEN_ADDRESSES[toToken];
    const decimalsIn = DECIMALS[fromToken] ?? 18;
    const amountIn = parseUnits(amount.toString(), decimalsIn);
    
    const slippageMap = { low: 0.5, normal: 1, high: 3 };
    const slippage = slippageMap[slippagePref as keyof typeof slippageMap] ?? 1;
    
    // 简化：假设 1:1 价格，实际应该调用报价 API
    const amountOutMinimum = (amountIn * BigInt(Math.floor((100 - slippage) * 100))) / BigInt(10000);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h

    const calldata = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn,
        tokenOut,
        fee: 3000,
        recipient: walletAddress as `0x${string}`,
        deadline,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: BigInt(0),
      }],
    });

    // 创建 Gelato 任务（价格条件）
    // 注意：Gelato 的价格 oracle 需要配置，这里简化为时间触发
    const { taskId } = await automate.createTask({
      execAddress: SWAP_ROUTER,
      execData: calldata,
      execSelector: calldata.slice(0, 10) as `0x${string}`, // 函数选择器（前 4 字节）
      dedicatedMsgSender: true,
      name: `Swap ${fromToken} to ${toToken}`,
      // 实际应该用 Gelato 的 Resolver 检查价格条件
      // 这里简化为定时检查（每小时）
      interval: 3600,
    });

    return NextResponse.json({
      success: true,
      taskId,
      message: "Gelato task created successfully",
    });
  } catch (err) {
    console.error("create-gelato-task error:", err);
    return NextResponse.json({ error: "Failed to create Gelato task" }, { status: 500 });
  }
}
