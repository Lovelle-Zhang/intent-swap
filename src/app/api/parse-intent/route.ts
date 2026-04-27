import { NextRequest, NextResponse } from "next/server";

const TOKENS = ["ETH", "USDC", "DAI", "WBTC", "USDT", "ARB", "WETH", "BTC"];

function extractToken(text: string, exclude?: string): string {
  const upper = text.toUpperCase();
  return TOKENS.find((t) => t !== exclude && upper.includes(t)) ?? "USDC";
}

function extractAmount(text: string): { amount: number | null; amountType: "exact" | "percentage" | "max" | null } {
  if (/\bhalf\b/i.test(text)) return { amount: 50, amountType: "percentage" };
  if (/\ball\b|\bmax\b|\bfull\b/i.test(text)) return { amount: 100, amountType: "max" };
  const pct = text.match(/(\d+)\s*%/);
  if (pct) return { amount: Number(pct[1]), amountType: "percentage" };
  const num = text.match(/(\d+\.?\d*)/);
  if (num) return { amount: Number(num[1]), amountType: "exact" };
  return { amount: null, amountType: null };
}

function extractSlippage(text: string): "low" | "normal" | "high" {
  if (/low\s*slippage|tight|minimal/i.test(text)) return "low";
  if (/high\s*slippage|fast|urgent/i.test(text)) return "high";
  return "normal";
}

// 条件单解析
// 支持: "when ETH drops to 3000", "if ETH > 4000", "ETH falls below 2500 buy 0.1"
function extractCondition(text: string): {
  type: "conditional";
  conditionToken: string;
  operator: "above" | "below";
  targetPrice: number;
  action: "buy" | "sell" | "swap";
} | null {
  const conditionPattern = /\b(when|if|once)\b/i;
  const dropPattern = /\b(drops?|falls?|below|under|less than|<)\b/i;
  const risePattern = /\b(rises?|above|over|greater than|reaches?|hits?|>)\b/i;
  const pricePattern = /\$?(\d+(?:,\d{3})*(?:\.\d+)?)/;

  if (!conditionPattern.test(text)) return null;

  const priceMatch = text.match(pricePattern);
  if (!priceMatch) return null;

  const targetPrice = Number(priceMatch[1].replace(/,/g, ""));
  const conditionToken = extractToken(text);
  const operator = dropPattern.test(text) ? "below" : risePattern.test(text) ? "above" : "below";
  const action = /\bsell\b/i.test(text) ? "sell" : "buy";

  return { type: "conditional", conditionToken, operator, targetPrice, action };
}

export async function POST(req: NextRequest) {
  try {
    const { intent } = await req.json();
    if (!intent || typeof intent !== "string") {
      return NextResponse.json({ error: "Missing intent" }, { status: 400 });
    }

    // 先尝试解析条件单
    const condition = extractCondition(intent);
    if (condition) {
      const { conditionToken, operator, targetPrice, action } = condition;
      const { amount, amountType } = extractAmount(intent);
      const toToken = action === "buy" ? conditionToken : "USDC";
      const fromToken = action === "buy" ? "USDC" : conditionToken;

      return NextResponse.json({
        intentType: "conditional",
        fromToken,
        toToken,
        amount,
        amountType,
        slippagePref: "normal",
        condition: { token: conditionToken, operator, targetPrice },
        summary: `${action === "buy" ? "Buy" : "Sell"} ${conditionToken} when price ${operator === "below" ? "drops below" : "rises above"} $${targetPrice.toLocaleString()}`,
      });
    }

    // 普通 swap
    const fromToken = extractToken(intent);
    const toToken = extractToken(intent, fromToken);
    const { amount, amountType } = extractAmount(intent);
    const slippagePref = extractSlippage(intent);
    const amountStr = amount === null ? "some" : amountType === "percentage" ? `${amount}%` : amountType === "max" ? "all" : `${amount}`;

    return NextResponse.json({
      intentType: "swap",
      fromToken,
      toToken,
      amount,
      amountType,
      slippagePref,
      condition: null,
      summary: `Swap ${amountStr} ${fromToken} → ${toToken} with ${slippagePref} slippage`,
    });
  } catch {
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
