import { NextRequest, NextResponse } from "next/server";

const MONITOR_URL = process.env.MONITOR_URL ?? process.env.NEXT_PUBLIC_MONITOR_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";
const SUBSCRIPTION_CHECK_URL = process.env.SUBSCRIPTION_CHECK_URL ?? "https://api.o-sheepps.com/subscriptions/check";

async function verifySubscription(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    const res = await fetch(`${SUBSCRIPTION_CHECK_URL}?email=${encodeURIComponent(email)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.active);
  } catch {
    return false;
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!MONITOR_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: MONITOR_URL or INTERNAL_API_KEY missing" },
      { status: 500 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  // FREE BETA: subscription check disabled — set FREE_TIER=0 to re-enable
  if (process.env.FREE_TIER === "0") {
    const active = await verifySubscription(email);
    if (!active) {
      return NextResponse.json({ error: "Active subscription required" }, { status: 403 });
    }
  }

  // Monitor verifies ownership (email must match the order's notifyEmail)
  try {
    // MONITOR_URL already includes the collection path (e.g. /swap-orders), so don't append /orders
    const upstream = await fetch(
      `${MONITOR_URL}/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`,
      {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${INTERNAL_API_KEY}` },
      },
    );
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error ?? "Monitor service rejected the cancel" },
        { status: upstream.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/orders DELETE] upstream error:", err);
    return NextResponse.json({ error: "Failed to reach monitor service" }, { status: 502 });
  }
}
