import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";

const auth = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000a" } as { id: string } | null,
  getUserError: null as Error | null,
  createClient: vi.fn(),
}));
const read = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/features/payrun/adapters/supabase/server", () => ({ createSupabaseServerClient: auth.createClient }));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => ({}) }));
vi.mock("@/features/payrun/hosted/workspace-payruns", () => ({
  getWorkspacePayRun: (...args: unknown[]) => read.get(...args),
}));

function detailFixture() {
  return {
    workspace: { name: "Personal Workspace", projectId: "10000000-0000-4000-8000-00000000000a", mode: "sandbox" },
    payRun: {
      id: "payrun_abc",
      status: "completed",
      intent: {
        agentId: "agent_sandbox_001",
        purpose: "Purchase a verified API result",
        quotedAmount: { amountAtomic: "420000", asset: "USDC", decimals: 6 },
        createdAt: "2026-07-13T10:00:00.000Z",
      },
      policyDecisions: [{
        outcome: "allowed",
        reasonCodes: ["within_budget"],
        riskLevel: "low",
        nextAction: "prepare_funding",
        checks: [{ ruleClass: "budget", reasonCode: "within_budget", outcome: "satisfied", explanation: "Under the daily cap." }],
      }],
    },
    auditEvents: [{ occurredAt: "2026-07-13T10:00:01.000Z", actionCode: "policy_evaluated", reasonCode: "within_budget" }],
  };
}

describe("hosted PayRun detail", () => {
  beforeEach(() => {
    auth.user = { id: "00000000-0000-4000-8000-00000000000a" };
    auth.getUserError = null;
    auth.createClient.mockReset().mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: auth.user }, error: auth.getUserError }) },
    }));
    read.get.mockReset();
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });
  afterEach(() => { delete process.env.ZENFIX_APP_ORIGIN; });

  test("renders the pay run's intent, policy decision and audit trail", async () => {
    read.get.mockResolvedValue(detailFixture());
    const { GET } = await import("@/app/zenfix/payruns/[id]/route");
    const res = await GET(new Request("https://zenfix.test/zenfix/payruns/payrun_abc"), { params: { id: "payrun_abc" } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("payrun_abc");
    expect(html).toContain("Purchase a verified API result");
    expect(html).toContain("within_budget");
    expect(html).toContain("Under the daily cap.");
    expect(read.get).toHaveBeenCalledWith(expect.anything(), { userId: "00000000-0000-4000-8000-00000000000a" }, "payrun_abc");
  });

  test("returns 404 when the pay run is not in the workspace", async () => {
    read.get.mockResolvedValue(null);
    const { GET } = await import("@/app/zenfix/payruns/[id]/route");
    const res = await GET(new Request("https://zenfix.test/zenfix/payruns/missing"), { params: { id: "missing" } });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Pay Run not found");
  });

  test("anonymous request redirects to sign-in", async () => {
    auth.user = null;
    const { GET } = await import("@/app/zenfix/payruns/[id]/route");
    const res = await GET(new Request("https://zenfix.test/zenfix/payruns/x"), { params: { id: "x" } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in");
  });

  test("persistence outage returns 503", async () => {
    read.get.mockRejectedValue(new PersistenceUnavailableError());
    const { GET } = await import("@/app/zenfix/payruns/[id]/route");
    const res = await GET(new Request("https://zenfix.test/zenfix/payruns/x"), { params: { id: "x" } });
    expect(res.status).toBe(503);
  });
});
