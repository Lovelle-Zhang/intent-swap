import { NextRequest, NextResponse } from "next/server";

// Vercel-cron-driven health check for the monitor pipeline.
//
// Once an hour:
//   1. POST a sentinel order to MONITOR_URL (auth via INTERNAL_API_KEY).
//      The order's condition is "ETH below $1" — never triggers, so it
//      sits inert in monitor's lowdb.
//   2. If the upstream is reachable (any 2xx response), all good.
//   3. If the upstream times out / 5xx / network errors → fan out an
//      email alert to OWNER_EMAIL via Resend so we know to run
//      `tools/refresh-monitor-tunnel.sh`.
//
// Why not page on every 502 from /api/orders directly? Because real user
// errors and tunnel outages look the same from the front door. The cron
// gives us a clean upstream-reachability signal independent of traffic.

const MONITOR_URL = process.env.MONITOR_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM = process.env.RESEND_FROM ?? "Intent Swap <alerts@intent-swap.app>";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "zynono@gmail.com";

async function sendAlert(subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.error("[health-check] no RESEND_API_KEY, can't alert. Body:", body);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [OWNER_EMAIL],
        subject,
        text: body,
      }),
    });
  } catch (e) {
    console.error("[health-check] alert send failed:", e);
  }
}

export async function GET(req: NextRequest) {
  // Vercel signs cron requests with `Authorization: Bearer <CRON_SECRET>`.
  // Reject everything else so this endpoint isn't a public ping target.
  const auth = req.headers.get("authorization") ?? "";
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!MONITOR_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Server misconfigured: MONITOR_URL or INTERNAL_API_KEY missing" },
      { status: 500 },
    );
  }

  // GET the monitor's listing endpoint — cheap, doesn't write to its DB.
  // (POST would also exercise the write path, but every hour for a year
  // would accrete 8760 sentinel rows. GET is enough to prove reachability.)
  const start = Date.now();
  try {
    const res = await fetch(`${MONITOR_URL}?email=health-check%40intent-swap.app`, {
      method: "GET",
      headers: { Authorization: `Bearer ${INTERNAL_API_KEY}` },
      cache: "no-store",
      // Don't wait forever — match the /api/orders proxy's expectation
      signal: AbortSignal.timeout(12000),
    });
    const elapsed = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await sendAlert(
        `🚨 intent-swap monitor: HTTP ${res.status} (${elapsed}ms)`,
        `Health check hit ${MONITOR_URL} and got ${res.status}.\n\n` +
          `Response (truncated):\n${body.slice(0, 500)}\n\n` +
          `Likely fix: run tools/refresh-monitor-tunnel.sh from your dev machine. ` +
          `The CF Quick Tunnel URL rotates on cloudflared restart — see monitor/OPERATIONS.md.`,
      );
      return NextResponse.json({ ok: false, status: res.status, elapsed }, { status: 200 });
    }
    return NextResponse.json({ ok: true, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    await sendAlert(
      `🚨 intent-swap monitor: unreachable (${elapsed}ms)`,
      `Health check failed to reach ${MONITOR_URL}:\n${message}\n\n` +
        `This usually means the CF Quick Tunnel URL rotated (cloudflared restart, ` +
        `server reboot, or cloudflared upgrade).\n\n` +
        `Run from a workstation with the intent-swap repo:\n` +
        `  cd ~/intent-swap && ./tools/refresh-monitor-tunnel.sh\n\n` +
        `That re-syncs Vercel MONITOR_URL to the current tunnel URL and redeploys. ~90s.`,
    );
    return NextResponse.json({ ok: false, error: message, elapsed }, { status: 200 });
  }
}
