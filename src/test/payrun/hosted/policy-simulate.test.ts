import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  parseSimulateInput, renderSimulateForm, renderSimulateResult, simulateValues,
  type SimulateValues,
} from "@/features/payrun/hosted/policy-simulate";

const auth = vi.hoisted(() => ({ user: { id: "00000000-0000-4000-8000-00000000000a" } as { id: string } | null }));
const evaluate = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/features/payrun/adapters/supabase/server", () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) } }),
}));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => ({}) }));
vi.mock("@/features/payrun/hosted/workspace", () => ({
  resolvePersonalWorkspace: async () => ({ projectId: "10000000-0000-4000-8000-00000000000a", name: "Personal", mode: "sandbox" }),
}));
vi.mock("@/features/payrun/hosted/intake-evaluate", () => ({
  evaluateWorkspaceIntent: (...args: unknown[]) => evaluate.fn(...args),
}));

const VALID: SimulateValues = {
  agentId: "agent_ops_01", purpose: "Dry run", amount: "20",
  merchantId: "acme_api", payee: "ACME", category: "api", artifactType: "api_result",
};
const q = (v: Partial<SimulateValues>) => new URLSearchParams({ ...VALID, ...v } as Record<string, string>).toString();

describe("parseSimulateInput", () => {
  test("builds an IntakeInput from valid values with a non-persisted idempotency key", () => {
    const r = parseSimulateInput(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input).toMatchObject({ agentId: "agent_ops_01", amount: "20", merchant: { id: "acme_api", payee: "ACME", category: "api" } });
      expect(r.input.idempotencyKey).toBe("dry-run");
    }
  });
  test("rejects missing merchant fields and a bad amount", () => {
    expect(parseSimulateInput({ ...VALID, merchantId: "" }).ok).toBe(false);
    expect(parseSimulateInput({ ...VALID, amount: "lots" }).ok).toBe(false);
  });
});

describe("renderSimulateForm / renderSimulateResult", () => {
  test("form is a GET to the simulate route with the intent fields", () => {
    const html = renderSimulateForm(VALID);
    expect(html).toContain('method="get" action="/zenfix/policy/simulate"');
    expect(html).toContain('name="agentId"');
    expect(html).toContain('name="amount"');
  });
  test("result shows the outcome, is clearly a dry run, and lists the checks", () => {
    const html = renderSimulateResult(VALID, {
      outcome: "blocked", reasonCodes: ["merchant.unknown"], riskLevel: "critical", nextAction: "stop",
      checks: [{ ruleClass: "payee", reasonCode: "merchant.unknown", outcome: "block", explanation: "not allow-listed" }],
    } as never);
    expect(html).toContain("Dry-run decision");
    expect(html).toContain("no Pay Run was created");
    expect(html).toContain("merchant.unknown");
    expect(html).toContain("blocked");
  });
});

describe("GET /zenfix/policy/simulate", () => {
  beforeEach(() => {
    auth.user = { id: "00000000-0000-4000-8000-00000000000a" };
    evaluate.fn.mockReset().mockResolvedValue({
      evaluation: {
        decision: {
          outcome: "allowed", reasonCodes: [], riskLevel: "low", nextAction: "prepare_funding",
          checks: [{ ruleClass: "payee", reasonCode: "merchant.allowed", outcome: "pass", explanation: "ok" }],
        },
      },
      policy: {},
    });
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });

  const call = async (query: string) => {
    const { GET } = await import("@/app/zenfix/policy/simulate/route");
    return GET(new Request(`https://zenfix.test/zenfix/policy/simulate?${query}`));
  };

  test("evaluates a valid intent and renders the decision without persisting", async () => {
    const res = await call(q({}));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Dry-run decision");
    expect(html).toContain("allowed");
    expect(evaluate.fn).toHaveBeenCalledTimes(1);
  });

  test("an invalid intent is 400 and never evaluates", async () => {
    const res = await call(q({ amount: "nope" }));
    expect(res.status).toBe(400);
    expect(evaluate.fn).not.toHaveBeenCalled();
  });

  test("simulateValues reads the fields from the query", () => {
    expect(simulateValues(new URLSearchParams(q({ agentId: "agent_x" }))).agentId).toBe("agent_x");
  });
});
