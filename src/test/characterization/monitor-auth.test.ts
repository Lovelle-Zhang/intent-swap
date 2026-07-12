import { afterEach, describe, expect, it } from "vitest";

import {
  startLegacyMonitor,
  type LegacyMonitorFixture,
} from "@/test/helpers/legacy-monitor";

interface JsonResponse {
  status: number;
  body: unknown;
}

async function getJson(
  url: string,
  authorization?: string,
): Promise<JsonResponse> {
  const response = await fetch(url, {
    headers: authorization ? { authorization } : undefined,
    cache: "no-store",
  });
  return { status: response.status, body: await response.json() };
}

describe.sequential("legacy monitor authentication", () => {
  const fixtures: LegacyMonitorFixture[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.stop()));
  });

  it("keeps health public and protects order listing with exact bearer auth", async () => {
    const fixture = await startLegacyMonitor({ apiKey: "slice1-monitor-key" });
    fixtures.push(fixture);

    await expect(getJson(`${fixture.baseUrl}/health`)).resolves.toEqual({
      status: 200,
      body: { ok: true, orders: 0 },
    });
    await expect(getJson(`${fixture.baseUrl}/swap-orders`)).resolves.toEqual({
      status: 401,
      body: { error: "Unauthorized" },
    });
    await expect(
      getJson(`${fixture.baseUrl}/swap-orders`, "bearer slice1-monitor-key"),
    ).resolves.toEqual({
      status: 401,
      body: { error: "Unauthorized" },
    });
    await expect(
      getJson(`${fixture.baseUrl}/swap-orders`, "Bearer wrong-monitor-key"),
    ).resolves.toEqual({
      status: 401,
      body: { error: "Unauthorized" },
    });
    await expect(
      getJson(`${fixture.baseUrl}/swap-orders`, "Bearer slice1-monitor-key"),
    ).resolves.toEqual({
      status: 200,
      body: { orders: [] },
    });
  });

  it("returns 503 for protected routes when the key is not configured", async () => {
    const fixture = await startLegacyMonitor({ apiKey: "" });
    fixtures.push(fixture);

    await expect(getJson(`${fixture.baseUrl}/swap-orders`)).resolves.toEqual({
      status: 503,
      body: { error: "Server misconfigured" },
    });
    await expect(getJson(`${fixture.baseUrl}/health`)).resolves.toEqual({
      status: 200,
      body: { ok: true, orders: 0 },
    });
  });
});
