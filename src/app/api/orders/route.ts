import { NextRequest, NextResponse } from "next/server";

const MONITOR_URL = process.env.MONITOR_URL ?? process.env.NEXT_PUBLIC_MONITOR_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";
const SUBSCRIPTION_CHECK_URL = process.env.SUBSCRIPTION_CHECK_URL ?? "https://api.o-sheepps.com/subscriptions/check";

interface OrderBody {
  email?: string | null;
  fromToken: string;
  toToken: string;
  amount: number;
  condition: {
    token: string;
    operator: "above" | "below";
    targetPrice: number;
  };
  // Allow extra fields (summary, raw, wallet, etc.) but they are not validated here
  [key: string]: unknown;
}

function isValidOrder(body: unknown): body is OrderBody {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  if (typeof o.fromToken !== "string" || typeof o.toToken !== "string") return false;
  if (typeof o.amount !== "number" || !isFinite(o.amount) || o.amount <= 0) return false;
  if (!o.condition || typeof o.condition !== "object") return false;
  const c = o.condition as Record<string, unknown>;
  if (typeof c.token !== "string") return false;
  if (c.operator !== "above" && c.operator !== "below") return false;
  if (typeof c.targetPrice !== "number" || !isFinite(c.targetPrice) || c.targetPrice <= 0) return false;
  return true;
}

async function verifySubscription(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const url = `${SUBSCRIPTION_CHECK_URL}?email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.active);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!MONITOR_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: MONITOR_URL or INTERNAL_API_KEY missing" },
      { status: 500 },
    );
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  // FREE BETA: subscription check disabled — set FREE_TIER=0 to re-enable
  if (process.env.FREE_TIER !== "0") {
    // pass — anyone can list their own orders during beta
  } else {
    const active = await verifySubscription(email);
    if (!active) {
      return NextResponse.json({ error: "Active subscription required" }, { status: 403 });
    }
  }

  try {
    // MONITOR_URL already includes the collection path (e.g. /swap-orders), so don't append /orders
    const upstream = await fetch(`${MONITOR_URL}?email=${encodeURIComponent(email)}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${INTERNAL_API_KEY}` },
      cache: "no-store",
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error ?? "Monitor service rejected the request" },
        { status: upstream.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/orders GET] upstream error:", err);
    return NextResponse.json({ error: "Failed to reach monitor service" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!MONITOR_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: MONITOR_URL or INTERNAL_API_KEY missing" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidOrder(body)) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  // FREE BETA: subscription check disabled — set FREE_TIER=0 to re-enable
  if (process.env.FREE_TIER === "0") {
    const active = await verifySubscription(body.email);
    if (!active) {
      return NextResponse.json(
        { error: "Active subscription required to create conditional orders" },
        { status: 403 },
      );
    }
  }

  // 转发到 monitor，附上 bearer key
  try {
    // MONITOR_URL already includes the collection path (e.g. /swap-orders), so don't append /orders
    const upstream = await fetch(`${MONITOR_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INTERNAL_API_KEY}`,
      },
      body: JSON.stringify({ ...body, id: body.id ?? Date.now() }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error ?? "Monitor service rejected the order" },
        { status: upstream.status },
      );
    }
    return NextResponse.json({ ok: true, id: data?.id ?? body.id ?? null });
  } catch (err) {
    console.error("[api/orders] upstream error:", err);
    return NextResponse.json({ error: "Failed to reach monitor service" }, { status: 502 });
  }
}
