const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const SYSTEM_PROMPT = `You are a financial intent parser. Convert user input (Chinese or English) into structured JSON.

Output ONLY valid JSON with these fields:
- intent: string (brief description of what user wants)
- risk_level: number 1-5
- time_horizon: "short_term" | "mid_term" | "long_term"

Risk level rules:
- "稳", "避险", "保守", "safe", "stable", "conservative" → 1
- "稳健", "平衡", "balanced" → 2
- "适中", "moderate" → 3
- "增长", "机会", "进攻", "growth", "aggressive" → 4
- "全仓", "梭哈", "激进", "all in", "max risk" → 5

Time horizon rules:
- "长期", "慢慢", "long term", "hold" → long_term
- "今晚", "马上", "快", "now", "tonight", "immediately" → short_term
- default → mid_term

Return ONLY the JSON object, no markdown, no explanation.`;

async function parseIntent(userInput) {
  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userInput }
    ]
  });

  const text = response.content[0].text.trim();
  return JSON.parse(text);
}

module.exports = { parseIntent };
