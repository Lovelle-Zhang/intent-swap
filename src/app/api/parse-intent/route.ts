import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ─── 规则解析（降级兜底） ───────────────────────────────────────────────────

const TOKENS = ["ETH", "USDC", "DAI", "WBTC", "USDT", "ARB", "WETH", "BTC"];

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
  // 精确词边界匹配，避免 ETH 匹配到 WETH
  const exact = TOKENS.find((t) => t !== exclude && new RegExp(`\\b${t}\\b`).test(normalized));
  if (exact) return exact;
  // 降级：包含匹配（兜底）
  return TOKENS.find((t) => t !== exclude && normalized.includes(t)) ?? "USDC";
}

function extractAmount(text: string): { amount: number | null; amountType: "exact" | "percentage" | "max" | null } {
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

function ruleParse(intent: string) {
  const fromToken = extractToken(intent);
  const toToken = extractToken(intent, fromToken);
  const { amount, amountType } = extractAmount(intent);
  const slippagePref = extractSlippage(intent);
  const amountStr = amount === null ? "some" : amountType === "percentage" ? `${amount}%` : amountType === "max" ? "all" : `${amount}`;
  return {
    intentType: "swap",
    fromToken, toToken, amount, amountType, slippagePref,
    condition: null,
    summary: `Swap ${amountStr} ${fromToken} → ${toToken} with ${slippagePref} slippage`,
    parsedBy: "rules",
  };
}

// ─── 市场价格（CoinGecko 免费 API） ──────────────────────────────────────

const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum", WETH: "weth", WBTC: "wrapped-bitcoin", BTC: "bitcoin",
  USDC: "usd-coin", USDT: "tether", DAI: "dai", ARB: "arbitrum",
};

async function fetchPrices(): Promise<Record<string, number>> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s 超时
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { next: { revalidate: 60 }, signal: controller.signal }
    );
    clearTimeout(timeout);
    const data = await res.json();
    const prices: Record<string, number> = {};
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      if (data[id]?.usd) prices[symbol] = data[id].usd;
    }
    return prices;
  } catch {
    return {}; // 超时/失败时静默跳过，不阻塞 LLM
  }
}

// ─── LLM 解析 ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a DeFi swap intent parser. Extract structured swap information from natural language.

Supported tokens: ETH, WETH, WBTC, BTC, USDC, USDT, DAI, ARB

Return ONLY valid JSON with this exact schema:
{
  "intentType": "swap" | "conditional",
  "fromToken": string,        // source token symbol (uppercase)
  "toToken": string,          // destination token symbol (uppercase)
  "amount": number | null,    // numeric amount or null if unspecified
  "amountType": "exact" | "percentage" | "max" | null,
  "slippagePref": "low" | "normal" | "high",
  "condition": null | {
    "token": string,
    "operator": "above" | "below",
    "targetPrice": number
  },
  "summary": string           // one-line human-readable summary in the same language as input
}

Rules:
- If amount is "all", "max", "全部", "所有", "全", "everything": amountType="max", amount=null (NOT 100)
- If amount is "half", "一半", "50%": amountType="percentage", amount=50
- IMPORTANT: When amountType="max", always set amount=null, never set amount=100
- If a price condition is mentioned (when/if ETH drops below $X): intentType="conditional"
- For Chinese input, write summary in Chinese
- Default slippagePref to "normal" unless explicitly mentioned
- If tokens are ambiguous, default fromToken="ETH", toToken="USDC"
- If user asks advisory questions ("which is better", "what should I buy"), you may reference current prices to suggest a reasonable swap, but make it clear in the summary that this is not financial advice`;

async function llmParse(intent: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });

  // 拉实时价格，注入 prompt
  const prices = await fetchPrices();
  const priceContext = Object.keys(prices).length > 0
    ? `\nCurrent market prices (USD): ${Object.entries(prices).map(([k, v]) => `${k}=$${v.toLocaleString()}`).join(", ")}`
    : "";

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT + priceContext },
      { role: "user", content: intent },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty LLM response");

  const parsed = JSON.parse(raw);

  // 基本校验
  if (!parsed.fromToken || !parsed.toToken || !parsed.intentType) {
    throw new Error("Invalid LLM response structure");
  }

  return { ...parsed, parsedBy: "llm" };
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export const maxDuration = 30; // Vercel 函数最大 30s

export async function POST(req: NextRequest) {
  try {
    const { intent } = await req.json();
    if (!intent || typeof intent !== "string") {
      return NextResponse.json({ error: "Missing intent" }, { status: 400 });
    }

    // 优先 LLM，失败降级规则
    try {
      const result = await llmParse(intent);
      return NextResponse.json(result);
    } catch (llmErr) {
      console.warn("[parse-intent] LLM failed, falling back to rules:", llmErr);
      return NextResponse.json(ruleParse(intent));
    }
  } catch {
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
