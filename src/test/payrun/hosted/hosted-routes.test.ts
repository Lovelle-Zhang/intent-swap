import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";

const auth = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000a" } as { id: string } | null,
  getUserError: null as Error | null,
  exchangeError: null as Error | null,
  otpError: null as Error | null,
  signOut: vi.fn(),
  signInWithOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  createClient: vi.fn(),
}));
const workspace = vi.hoisted(() => ({
  error: null as Error | null,
  resolve: vi.fn(),
}));

vi.mock("@/features/payrun/adapters/supabase/server", () => ({
  createSupabaseServerClient: auth.createClient,
}));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => ({}) }));
vi.mock("@/features/payrun/hosted/workspace", () => ({
  resolvePersonalWorkspace: (...args: unknown[]) => workspace.resolve(...args),
}));
// The Overview route gained a budget dependency; against the fake {} pool it
// cannot run real SQL, so stub the module with an unlimited state.
vi.mock("@/features/payrun/hosted/workspace-budget", () => ({
  getBudgetState: async () => ({
    dailyBudgetAtomic: "0", spentTodayAtomic: "0", remainingAtomic: "1000000000", unlimited: true,
  }),
}));
// The Overview route also derives control-plane stats from pay_runs; the fake
// {} pool cannot run SQL, so stub the read model with a small fixture.
// Overview also renders the onboarding checklist; the fake {} pool cannot run
// SQL, so stub it with a mid-progress state (key done, policy + first run not).
vi.mock("@/features/payrun/hosted/onboarding", () => ({
  getOnboardingState: async () => ({ hasKey: true, hasPolicy: false, hasApiRun: false, complete: false }),
}));
// Overview also renders spend history; stub it against the fake {} pool.
vi.mock("@/features/payrun/hosted/spend-history", async (importActual) => {
  const actual = await importActual<typeof import("@/features/payrun/hosted/spend-history")>();
  return { ...actual, getSpendHistory: async () => [{ day: "2026-09-09", authorizedAtomic: "20000000", count: 1 }] };
});
vi.mock("@/features/payrun/hosted/workspace-overview", () => ({
  getOverviewStats: async () => ({
    today: { allowed: 2, needsReview: 1, blocked: 0, executed: 3 },
    pendingReview: [{
      payRunId: "pr_pending_1", agentId: "agent_ci", purpose: "Test invoice",
      amountAtomic: "12500000", asset: "USDC", createdAt: "2026-09-07T00:00:00.000Z",
    }],
    byAgent: [{ agentId: "agent_ci", authorizedAtomic: "5000000", allowed: 2, needsReview: 1, blocked: 0, executed: 3 }],
  }),
}));

describe("hosted auth and workspace HTTP boundary", () => {
  beforeEach(() => {
    auth.user = { id: "00000000-0000-4000-8000-00000000000a" };
    auth.getUserError = null;
    auth.exchangeError = null;
    auth.otpError = null;
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    auth.signInWithOtp.mockReset().mockImplementation(async () => ({ error: auth.otpError }));
    auth.exchangeCodeForSession.mockReset().mockImplementation(async () => ({ error: auth.exchangeError }));
    auth.createClient.mockReset().mockImplementation(() => ({
      auth: {
        getUser: async () => ({ data: { user: auth.user }, error: auth.getUserError }),
        exchangeCodeForSession: auth.exchangeCodeForSession,
        signInWithOtp: auth.signInWithOtp,
        signOut: auth.signOut,
      },
    }));
    workspace.resolve.mockReset().mockImplementation(async () => {
      if (workspace.error) throw workspace.error;
      return { projectId: "10000000-0000-4000-8000-00000000000a", name: "Personal Workspace", mode: "sandbox" };
    });
    workspace.error = null;
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });

  afterEach(() => { delete process.env.ZENFIX_APP_ORIGIN; });

  test("anonymous workspace request redirects to sign-in", async () => {
    auth.user = null;
    const { GET } = await import("@/app/zenfix/workspace/route");
    const response = await GET(new Request("https://evil.test/zenfix/workspace"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in");
  });

  test("verified login/relogin resolves the same workspace and request injection is ignored", async () => {
    const { GET } = await import("@/app/zenfix/workspace/route");
    const first = await GET(new Request("https://zenfix.test/zenfix/workspace?projectId=forged&ownerUserId=forged"));
    const second = await GET(new Request("https://zenfix.test/zenfix/workspace"));
    expect(first.status).toBe(200);
    const firstBody = await first.text();
    expect(firstBody).toContain("10000000-0000-4000-8000-00000000000a");
    // The Overview shows the onboarding checklist while activation is incomplete.
    expect(firstBody).toContain("Get started");
    // The Overview dashboard renders its decisions tiles and review queue.
    expect(firstBody).toContain("Needs your review");
    expect(firstBody).toContain("Needs review");
    expect(firstBody).toContain("agent_ci");
    expect(second.status).toBe(200);
    expect(workspace.resolve).toHaveBeenNthCalledWith(1, expect.anything(), { userId: auth.user!.id });
    expect(workspace.resolve).toHaveBeenNthCalledWith(2, expect.anything(), { userId: auth.user!.id });
  });

  test("database unavailable returns 503 without fallback", async () => {
    workspace.error = new PersistenceUnavailableError();
    const { GET } = await import("@/app/zenfix/workspace/route");
    const response = await GET(new Request("https://zenfix.test/zenfix/workspace"));
    expect(response.status).toBe(503);
  });

  test("auth verification outage returns 503 at the protected handler", async () => {
    auth.getUserError = new Error("auth offline");
    const { GET } = await import("@/app/zenfix/workspace/route");
    const response = await GET(new Request("https://evil.test/zenfix/workspace"));
    expect(response.status).toBe(503);
  });

  test("magic-link request uses fixed configured callback and invalid email is recoverable", async () => {
    const { POST } = await import("@/app/zenfix/sign-in/request/route");
    const valid = new FormData(); valid.set("email", "Pilot@Example.com");
    const response = await POST(new Request("https://evil.test/zenfix/sign-in/request", { method: "POST", body: valid }));
    expect(response.status).toBe(303);
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "pilot@example.com",
      options: { emailRedirectTo: "https://zenfix.test/auth/callback", shouldCreateUser: true },
    });
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in?status=sent");
  });

  test("invalid email is rejected before Supabase client construction", async () => {
    auth.createClient.mockImplementation(() => { throw new Error("Supabase config missing"); });
    const { POST } = await import("@/app/zenfix/sign-in/request/route");
    const invalid = new FormData(); invalid.set("email", "a@b");
    const response = await POST(new Request("https://evil.test/zenfix/sign-in/request", { method: "POST", body: invalid }));
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in?status=invalid_email");
    expect(auth.createClient).not.toHaveBeenCalled();
  });

  test("callback ignores external next target, fails closed, and sign-out returns to sign-in", async () => {
    const callback = await import("@/app/auth/callback/route");
    const success = await callback.GET(new Request("https://evil.test/auth/callback?code=ok&next=https://evil.test"));
    expect(success.headers.get("location")).toBe("https://zenfix.test/zenfix/workspace");
    auth.exchangeError = new Error("expired");
    const failed = await callback.GET(new Request("https://evil.test/auth/callback?code=bad"));
    expect(failed.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in?status=expired_link");
    const signOut = await import("@/app/zenfix/sign-out/route");
    const loggedOut = await signOut.POST(new Request("https://evil.test/zenfix/sign-out", { method: "POST" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(loggedOut.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in?status=signed_out");
  });
});
