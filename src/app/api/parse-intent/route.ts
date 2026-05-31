import { NextRequest, NextResponse } from "next/server";

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

// Best-effort condition extractor for the LLM-fallback path. The LLM is the
// primary parser; this only fires when the LLM is unavailable (no key, rate
// limit, timeout). Without it, every "buy ETH if ETH drops to $X" gets
// mis-classified as a plain swap.
function extractCondition(text: string): { token: string; operator: "above" | "below"; targetPrice: number } | null {
  // Match: (if|when|once) ... <verb/operator> ... $<number>[kKmM]
  const re = /(?:if|when|once)[\s\S]{0,40}?\$?\s*([\d][\d,.]*)\s*([kKmM])?/i;
  const m = text.match(re);
  if (!m) return null;
  let num = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(num)) return null;
  if (m[2]?.toLowerCase() === "k") num *= 1e3;
  if (m[2]?.toLowerCase() === "m") num *= 1e6;

  // Token the condition watches (try to find a known symbol near the condition)
  const normalized = normalizeText(text);
  const token = TOKENS.find((t) => new RegExp(`\\b${t}\\b`).test(normalized)) ?? null;
  if (!token) return null;

  // Operator: down-language → below, up-language → above. Default below
  // (most common "buy the dip" intent), but "above|rises|>|reaches" wins.
  const lc = text.toLowerCase();
  let operator: "above" | "below" = "below";
  if (/(rises?|raise|above|over|exceeds?|breaks?|hits?|>(?!=)|>=)/.test(lc)) operator = "above";
  if (/(drops?|falls?|sinks?|below|under|<(?!=)|<=|跌|降)/.test(lc)) operator = "below";

  return { token, operator, targetPrice: num };
}

function ruleParse(intent: string) {
  const fromToken = extractToken(intent);
  const toToken = extractToken(intent, fromToken);
  const { amount, amountType } = extractAmount(intent);
  const slippagePref = extractSlippage(intent);
  const condition = extractCondition(intent);
  const amountStr = amount === null ? "some" : amountType === "percentage" ? `${amount}%` : amountType === "max" ? "all" : `${amount}`;
  return {
    intentType: condition ? "conditional" : "swap",
    fromToken, toToken, amount, amountType, slippagePref,
    condition,
    summary: condition
      ? `Swap ${amountStr} ${fromToken} → ${toToken} when ${condition.token} ${condition.operator} $${condition.targetPrice.toLocaleString()}`
      : `Swap ${amountStr} ${fromToken} → ${toToken} with ${slippagePref} slippage`,
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
  "summary": string           // one-line human-readable summary, ALWAYS in English
}

Rules:
- If amount is "all", "max", "全部", "所有", "全", "everything": amountType="max", amount=null (NOT 100)
- If amount is "half", "一半", "50%": amountType="percentage", amount=50
- IMPORTANT: When amountType="max", always set amount=null, never set amount=100
- If a price condition is mentioned (when/if ETH drops below $X): intentType="conditional"
- Always write the summary in English, even when the user's input is in Chinese or another language (the UI is English-only)
- Default slippagePref to "normal" unless explicitly mentioned
- If tokens are ambiguous, default fromToken="ETH", toToken="USDC"
- If user asks advisory questions ("which is better", "what should I buy"), you may reference current prices to suggest a reasonable swap, but make it clear in the summary that this is not financial advice`;

async function llmParse(intent: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OPENAI_API_KEY");

  // 拉实时价格，注入 prompt
  const prices = await fetchPrices();
  const priceContext = Object.keys(prices).length > 0
    ? `\nCurrent market prices (USD): ${Object.entries(prices).map(([k, v]) => `${k}=$${v.toLocaleString()}`).join(", ")}`
    : "";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT + priceContext },
        { role: "user", content: intent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const completion = await res.json();

  const raw = completion?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Empty LLM response");

  const parsed = JSON.parse(raw);
  if (!parsed.fromToken || !parsed.toToken || !parsed.intentType) {
    throw new Error("Invalid LLM response structure");
  }
  return { ...parsed, parsedBy: "llm" };
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export const maxDuration = 30; // Vercel 函数最大 30s

const MAX_INTENT_LENGTH = 500;

export async function POST(req: NextRequest) {
  try {
    const { intent } = await req.json();
    if (!intent || typeof intent !== "string") {
      return NextResponse.json({ error: "Missing intent" }, { status: 400 });
    }
    const trimmed = intent.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ error: "Empty intent" }, { status: 400 });
    }
    if (trimmed.length > MAX_INTENT_LENGTH) {
      return NextResponse.json(
        { error: `Intent too long (max ${MAX_INTENT_LENGTH} characters)` },
        { status: 400 },
      );
    }

    // 优先 LLM，失败降级规则
    try {
      const result = await llmParse(trimmed);
      return NextResponse.json(result);
    } catch (llmErr) {
      console.warn("[parse-intent] LLM failed, falling back to rules:", llmErr);
      return NextResponse.json(ruleParse(trimmed));
    }
  } catch {
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
