import { NextRequest, NextResponse } from "next/server";

const TOKENS = ["ETH", "USDC", "DAI", "WBTC", "USDT", "ARB", "WETH", "BTC"];

// 中文 token 别名
const TOKEN_ALIASES: Record<string, string> = {
  "以太": "ETH", "以太坊": "ETH", "比特": "WBTC", "比特币": "WBTC",
  "稳定币": "USDC", "美元": "USDC", "泰达": "USDT",
};

function normalizeText(text: string): string {
  let result = text.toUpperCase();
  for (const [alias, token] of Object.entries(TOKEN_ALIASES)) {
    result = result.replace(new RegExp(alias, "gi"), token);
  }
  return result;
}

function extractToken(text: string, exclude?: string): string {
  const normalized = normalizeText(text);
  return TOKENS.find((t) => t !== exclude && normalized.includes(t)) ?? "USDC";
}

function extractAmount(text: string): { amount: number | null; amountType: "exact" | "percentage" | "max" | null } {
  // 中文关键词
  if (/half|一半/i.test(text)) return { amount: 50, amountType: "percentage" };
  if (/all|max|full|全部|所有|最大/i.test(text)) return { amount: 100, amountType: "max" };
  const pct = text.match(/(\d+)\s*[%％]/);
  if (pct) return { amount: Number(pct[1]), amountType: "percentage" };
  const num = text.match(/(\d+\.?\d*)/);
  if (num) return { amount: Number(num[1]), amountType: "exact" };
  return { amount: null, amountType: null };
}

function extractSlippage(text: string): "low" | "normal" | "high" {
  if (/low\s*slippage|tight|minimal|低滑点|精确/i.test(text)) return "low";
  if (/high\s*slippage|fast|urgent|高滑点|快速|紧急/i.test(text)) return "high";
  return "normal";
}

function extractCondition(text: string): {
  type: "conditional";
  conditionToken: string;
  operator: "above" | "below";
  targetPrice: number;
  action: "buy" | "sell" | "swap";
} | null {
  const conditionPattern = /\b(when|if|once)\b|当|如果|一旦/i;
  const dropPattern = /\b(drops?|falls?|below|under|less than|<)\b|跌|低于|下跌|跌破/i;
  const risePattern = /\b(rises?|above|over|greater than|reaches?|hits?|>)\b|涨|高于|上涨|突破/i;
  const pricePattern = /\$?(\d+(?:,\d{3})*(?:\.\d+)?)/;

  if (!conditionPattern.test(text)) return null;

  const priceMatch = text.match(pricePattern);
  if (!priceMatch) return null;

  const targetPrice = Number(priceMatch[1].replace(/,/g, ""));
  const conditionToken = extractToken(text);
  const operator = dropPattern.test(text) ? "below" : risePattern.test(text) ? "above" : "below";
  const action = /\bsell\b|卖|卖出/i.test(text) ? "sell" : "buy";

  return { type: "conditional", conditionToken, operator, targetPrice, action };
}

// 中文 swap 方向解析："把 ETH 换成 USDC" / "用 ETH 买 USDC"
function extractChineseSwapDirection(text: string): { fromToken: string; toToken: string } | null {
  const normalized = normalizeText(text);
  // 把 A 换成/兑换 B
  const pattern1 = /把\s*([A-Z]+)\s*[换兑][成为]\s*([A-Z]+)/i;
  // 用 A 买 B
  const pattern2 = /用\s*([A-Z]+)\s*买\s*([A-Z]+)/i;
  // A 换 B / A 兑 B
  const pattern3 = /([A-Z]+)\s*[换兑]\s*([A-Z]+)/i;

  for (const pattern of [pattern1, pattern2, pattern3]) {
    const m = normalized.match(pattern);
    if (m && TOKENS.includes(m[1]) && TOKENS.includes(m[2])) {
      return { fromToken: m[1], toToken: m[2] };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { intent } = await req.json();
    if (!intent || typeof intent !== "string") {
      return NextResponse.json({ error: "Missing intent" }, { status: 400 });
    }

    const condition = extractCondition(intent);
    if (condition) {
      const { conditionToken, operator, targetPrice, action } = condition;
      const { amount, amountType } = extractAmount(intent);
      const toToken = action === "buy" ? conditionToken : "USDC";
      const fromToken = action === "buy" ? "USDC" : conditionToken;

      return NextResponse.json({
        intentType: "conditional",
        fromToken, toToken, amount, amountType,
        slippagePref: "normal",
        condition: { token: conditionToken, operator, targetPrice },
        summary: `${action === "buy" ? "Buy" : "Sell"} ${conditionToken} when price ${operator === "below" ? "drops below" : "rises above"} $${targetPrice.toLocaleString()}`,
      });
    }

    // 中文方向优先
    const chineseDir = extractChineseSwapDirection(intent);
    const fromToken = chineseDir?.fromToken ?? extractToken(intent);
    const toToken = chineseDir?.toToken ?? extractToken(intent, fromToken);
    const { amount, amountType } = extractAmount(intent);
    const slippagePref = extractSlippage(intent);
    const amountStr = amount === null ? "some" : amountType === "percentage" ? `${amount}%` : amountType === "max" ? "all" : `${amount}`;

    return NextResponse.json({
      intentType: "swap",
      fromToken, toToken, amount, amountType, slippagePref,
      condition: null,
      summary: `Swap ${amountStr} ${fromToken} → ${toToken} with ${slippagePref} slippage`,
    });
  } catch {
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
