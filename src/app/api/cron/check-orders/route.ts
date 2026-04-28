import { NextRequest, NextResponse } from "next/server";

// 简化版：从外部服务拉订单列表（你需要在 api.o-sheepps.com 加一个 GET /swap-orders 接口）
// 或者在这个项目里用 Vercel KV/Postgres 存储

interface Order {
  id: string;
  email: string;
  fromToken: string;
  toToken: string;
  amount: number;
  condition: {
    token: string;
    operator: "above" | "below";
    targetPrice: number;
  };
  createdAt: number;
}

async function fetchOrders(): Promise<Order[]> {
  try {
    const res = await fetch("https://api.o-sheepps.com/swap-orders");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function getCurrentPrice(token: string): Promise<number | null> {
  try {
    const idMap: Record<string, string> = {
      ETH: "ethereum", WETH: "weth", WBTC: "wrapped-bitcoin", BTC: "bitcoin",
      USDC: "usd-coin", USDT: "tether", DAI: "dai", ARB: "arbitrum",
    };
    const id = idMap[token];
    if (!id) return null;
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const data = await res.json();
    return data[id]?.usd ?? null;
  } catch {
    return null;
  }
}

async function notifyUser(order: Order, currentPrice: number) {
  // 这里接入邮件服务（Resend/SendGrid）或 webhook
  console.log(`[TRIGGER] Order ${order.id}: ${order.condition.token} ${order.condition.operator} $${order.condition.targetPrice}, current: $${currentPrice}`);
  
  // 示例：调用外部 webhook（你可以换成邮件 API）
  try {
    await fetch("https://api.o-sheepps.com/swap-orders/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, email: order.email, currentPrice }),
    });
  } catch {
    // ignore
  }
}

export async function GET(req: NextRequest) {
  // Vercel Cron 会带 Authorization header，验证一下
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await fetchOrders();
  const triggered: string[] = [];

  for (const order of orders) {
    const price = await getCurrentPrice(order.condition.token);
    if (price === null) continue;

    const shouldTrigger =
      (order.condition.operator === "below" && price <= order.condition.targetPrice) ||
      (order.condition.operator === "above" && price >= order.condition.targetPrice);

    if (shouldTrigger) {
      await notifyUser(order, price);
      triggered.push(order.id);
    }
  }

  return NextResponse.json({ checked: orders.length, triggered });
}
