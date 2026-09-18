import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Abuse mitigation via Upstash Redis (Vercel Marketplace). Two sliding-window
// limiters:
//   - API: per workspace (the API key's owner) across the bearer endpoints, so one
//     key can't drive unbounded DB writes / RPC / email.
//   - Sign-in: per IP for the unauthenticated magic-link endpoint (an email-send
//     amplifier keyed on an attacker-supplied address).
//
// FAIL-OPEN by design: if Upstash isn't configured (env absent) or is unreachable,
// requests are ALLOWED. Rate limiting is protection, not a correctness gate — a
// Redis outage must never take the payment-authorization API down. That also means
// this can ship before the Upstash integration is provisioned; it activates the
// moment the env vars appear.

const API_LIMIT = 120; // requests
const API_WINDOW = "1 m" as const; // per workspace
const SIGNIN_LIMIT = 5; // requests
const SIGNIN_WINDOW = "10 m" as const; // per IP

// The Vercel Upstash integration sets UPSTASH_REDIS_REST_* ; the KV-branded one
// sets KV_REST_API_* . Accept either.
function readRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

// Built once per lambda. `undefined` = not yet resolved; `null` = unconfigured
// (→ fail-open).
let apiLimiter: Ratelimit | null | undefined;
let signInLimiter: Ratelimit | null | undefined;

function build(tokens: number, window: "1 m" | "10 m", prefix: string): Ratelimit | null {
  const redis = readRedis();
  if (!redis) return null;
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, window), prefix, analytics: false });
}

function getApiLimiter(): Ratelimit | null {
  if (apiLimiter === undefined) apiLimiter = build(API_LIMIT, API_WINDOW, "zenfix:api");
  return apiLimiter;
}
function getSignInLimiter(): Ratelimit | null {
  if (signInLimiter === undefined) signInLimiter = build(SIGNIN_LIMIT, SIGNIN_WINDOW, "zenfix:signin");
  return signInLimiter;
}

export interface RateDecision {
  readonly ok: boolean;
  readonly retryAfterSeconds: number;
}

async function check(limiter: Ratelimit | null, key: string): Promise<RateDecision> {
  if (!limiter) return { ok: true, retryAfterSeconds: 0 }; // fail-open: unconfigured
  try {
    const { success, reset } = await limiter.limit(key);
    return {
      ok: success,
      retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (error) {
    console.warn("[zenfix] rate limiter unavailable; allowing request", error);
    return { ok: true, retryAfterSeconds: 0 }; // fail-open: Upstash unreachable
  }
}

// Per-workspace limit for the authenticated bearer API (key = the owner user id).
export const checkApiRateLimit = (workspaceKey: string): Promise<RateDecision> =>
  check(getApiLimiter(), workspaceKey);

// Per-IP limit for the unauthenticated magic-link email endpoint.
export const checkSignInRateLimit = (ip: string): Promise<RateDecision> =>
  check(getSignInLimiter(), ip);

// The client IP as Vercel forwards it (first hop of x-forwarded-for). Falls back to
// a shared bucket when absent, which still bounds total unauthenticated volume.
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

// 429 with a Retry-After header for a rejected API request.
export function rateLimited(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: "Rate limit exceeded. Slow down and retry." }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(Math.max(1, retryAfterSeconds)),
    },
  });
}
