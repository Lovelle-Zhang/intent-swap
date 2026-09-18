import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  checkApiRateLimit,
  checkSignInRateLimit,
  clientIp,
  rateLimited,
} from "@/features/payrun/hosted/rate-limit";

const UPSTASH_ENV = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];

describe("rate-limit", () => {
  beforeEach(() => { for (const k of UPSTASH_ENV) delete process.env[k]; });
  afterEach(() => { for (const k of UPSTASH_ENV) delete process.env[k]; });

  test("FAILS OPEN when Upstash is not configured — API requests are allowed", async () => {
    // No Redis env = abuse mitigation off, never a 503/blocked request. Critical:
    // a payment-authorization API must not go down because the limiter is absent.
    expect(await checkApiRateLimit("user_1")).toEqual({ ok: true, retryAfterSeconds: 0 });
  });

  test("FAILS OPEN when Upstash is not configured — sign-in requests are allowed", async () => {
    expect(await checkSignInRateLimit("1.2.3.4")).toEqual({ ok: true, retryAfterSeconds: 0 });
  });

  test("clientIp reads the first x-forwarded-for hop, else 'unknown'", () => {
    expect(clientIp(new Request("https://x.test", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });

  test("rateLimited() is a 429 with a Retry-After header", async () => {
    const res = rateLimited(30);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect((await res.json()).error).toMatch(/rate limit/i);
  });

  test("rateLimited() clamps a non-positive retry to at least 1 second", () => {
    expect(rateLimited(0).headers.get("retry-after")).toBe("1");
  });
});
