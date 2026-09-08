import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";

const auth = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000a" } as { id: string } | null,
  createClient: vi.fn(),
}));
const store = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));

vi.mock("@/features/payrun/adapters/supabase/server", () => ({ createSupabaseServerClient: auth.createClient }));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => ({}) }));
vi.mock("@/features/payrun/hosted/workspace-policy", async (importActual) => {
  const actual = await importActual<typeof import("@/features/payrun/hosted/workspace-policy")>();
  return { ...actual, getWorkspacePolicy: store.get, saveWorkspacePolicy: store.save };
});

async function loadRoute() {
  return import("@/app/zenfix/policy/route");
}

function postBody(fields: Record<string, string>): Request {
  return new Request("https://zenfix.test/zenfix/policy", {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

describe("hosted policy route", () => {
  beforeEach(async () => {
    auth.user = { id: "00000000-0000-4000-8000-00000000000a" };
    auth.createClient.mockReset().mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) },
    }));
    store.get.mockReset();
    store.save.mockReset().mockResolvedValue(undefined);
    const { DEFAULT_POLICY_RULES } = await import("@/features/payrun/hosted/workspace-policy");
    store.get.mockResolvedValue({ rules: DEFAULT_POLICY_RULES, version: 0, updatedAt: null, dailyBudgetAtomic: "0", agentBudgets: {}, agentLimits: {} });
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });
  afterEach(() => { delete process.env.ZENFIX_APP_ORIGIN; });

  test("GET renders the policy form prefilled from the saved rules", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/policy"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Per-transaction limit");
    expect(html).toContain('name="transactionLimit"');
    expect(html).toContain("Save policy");
  });

  test("GET shows a saved notice after a successful write", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/policy?status=saved"));
    expect(await res.text()).toContain("Policy saved.");
  });

  test("POST with valid input saves the converted rules and redirects", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postBody({
      transactionLimit: "100",
      reviewThreshold: "50",
      absoluteHardLimit: "1000",
      allowedMerchantIds: "merchant_known",
      blockedMerchantIds: "",
      blockedCategories: "",
      requireReviewForNewMerchant: "on",
    }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://zenfix.test/zenfix/policy?status=saved");
    expect(store.save).toHaveBeenCalledTimes(1);
    const savedRules = store.save.mock.calls[0][2];
    expect(savedRules.transactionLimit.amountAtomic).toBe("100000000");
    expect(savedRules.allowedMerchantIds).toEqual(["merchant_known"]);
    expect(savedRules.requireReviewForNewMerchant).toBe(true);
    expect(store.save.mock.calls[0][3]).toBe("0");
  });

  test("POST persists a submitted daily budget as atomic USDC", async () => {
    const { POST } = await loadRoute();
    await POST(postBody({
      transactionLimit: "100",
      reviewThreshold: "50",
      absoluteHardLimit: "1000",
      dailyBudget: "250",
    }));
    expect(store.save.mock.calls[0][3]).toBe("250000000");
  });

  test("POST parses per-agent limits and passes them to save as the sixth argument", async () => {
    const { POST } = await loadRoute();
    await POST(postBody({
      transactionLimit: "100",
      reviewThreshold: "50",
      absoluteHardLimit: "1000",
      agentTxLimits: "agent_ops_01 = 25",
      agentMerchants: "agent_ops_01 = acme_api, data_co",
    }));
    expect(store.save.mock.calls[0][5]).toEqual({
      agent_ops_01: { perTxAtomic: "25000000", merchants: ["acme_api", "data_co"] },
    });
  });

  test("POST with a malformed per-agent limit returns 400 and never writes", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postBody({
      transactionLimit: "100",
      reviewThreshold: "50",
      absoluteHardLimit: "1000",
      agentTxLimits: "agent_ops_01 = lots",
    }));
    expect(res.status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });

  test("POST with a malformed amount returns 400, preserves input, and never writes", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postBody({
      transactionLimit: "abc",
      reviewThreshold: "50",
      absoluteHardLimit: "1000",
    }));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("USDC amount");
    expect(html).toContain('value="abc"');
    expect(store.save).not.toHaveBeenCalled();
  });

  test("anonymous GET redirects to sign-in", async () => {
    auth.user = null;
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/policy"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in");
  });

  test("a persistence outage on load returns 503", async () => {
    store.get.mockRejectedValue(new PersistenceUnavailableError());
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/policy"));
    expect(res.status).toBe(503);
  });
});
