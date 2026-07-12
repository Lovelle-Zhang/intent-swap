import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

interface HealthEnvironment {
  cronSecret?: string;
  internalApiKey?: string;
  monitorUrl?: string;
}

async function loadHealthRoute({
  cronSecret = "",
  internalApiKey = "",
  monitorUrl = "",
}: HealthEnvironment) {
  vi.resetModules();
  vi.stubEnv("CRON_SECRET", cronSecret);
  vi.stubEnv("INTERNAL_API_KEY", internalApiKey);
  vi.stubEnv("MONITOR_URL", monitorUrl);
  vi.stubEnv("RESEND_API_KEY", "");
  return import("@/app/api/cron/health-check/route");
}

function healthRequest(authorization?: string) {
  return new NextRequest("http://localhost/api/cron/health-check", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("legacy API health route", () => {
  it("requires the exact cron bearer secret when configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await loadHealthRoute({
      cronSecret: "slice1-cron-secret",
      internalApiKey: "slice1-monitor-key",
      monitorUrl: "http://127.0.0.1:3002/swap-orders",
    });

    const response = await GET(healthRequest("Bearer wrong"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when monitor URL or internal key is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { GET } = await loadHealthRoute({ cronSecret: "" });

    const response = await GET(healthRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Server misconfigured: MONITOR_URL or INTERNAL_API_KEY missing",
    });
  });

  it("wraps a successful authenticated monitor listing as ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const monitorUrl = "http://127.0.0.1:3002/swap-orders";
    const { GET } = await loadHealthRoute({
      cronSecret: "slice1-cron-secret",
      internalApiKey: "slice1-monitor-key",
      monitorUrl,
    });

    const response = await GET(healthRequest("Bearer slice1-cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(body.elapsed).toEqual(expect.any(Number));
    expect(fetchMock).toHaveBeenCalledWith(
      `${monitorUrl}?email=health-check%40intent-swap.app`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer slice1-monitor-key" },
        cache: "no-store",
      }),
    );
  });
});
