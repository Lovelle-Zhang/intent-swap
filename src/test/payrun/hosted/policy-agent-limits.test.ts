import { describe, expect, test } from "vitest";

import {
  agentLimitValuesFromLimits,
  applyAgentLimits,
  parseAgentLimits,
  renderAgentLimitFields,
  type AgentLimits,
} from "@/features/payrun/hosted/policy-agent-limits";
import { DEFAULT_POLICY_RULES, usdcMoney } from "@/features/payrun/hosted/workspace-policy";

describe("parseAgentLimits", () => {
  test("parses per-tx caps (to atomic) and merchant allowlists, merged by agent", () => {
    const result = parseAgentLimits({
      agentTxLimits: "agent_a = 25\nagent_b = 10.5",
      agentMerchants: "agent_a = acme_api, data_co\nagent_c = only_this",
    });
    expect(result).toEqual({
      ok: true,
      limits: {
        agent_a: { perTxAtomic: "25000000", merchants: ["acme_api", "data_co"] },
        agent_b: { perTxAtomic: "10500000" },
        agent_c: { merchants: ["only_this"] },
      },
    });
  });
  test("skips blank lines and empty merchant lists; dedups merchants", () => {
    const result = parseAgentLimits({ agentTxLimits: "\n  \n", agentMerchants: "agent_a = m1, m1, ,m2\nagent_b =" });
    expect(result).toEqual({ ok: true, limits: { agent_a: { merchants: ["m1", "m2"] } } });
  });
  test("rejects a malformed per-tx amount with a clear error", () => {
    const result = parseAgentLimits({ agentTxLimits: "agent_a = lots", agentMerchants: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("agent_a");
  });
});

describe("agentLimitValuesFromLimits (round-trips the textareas)", () => {
  test("renders atomic caps back to USDC and joins merchant lists", () => {
    const limits: AgentLimits = {
      agent_a: { perTxAtomic: "25000000", merchants: ["acme_api", "data_co"] },
      agent_b: { perTxAtomic: "0" }, // "0" = no cap, omitted
      agent_c: { merchants: [] }, // empty = omitted
    };
    expect(agentLimitValuesFromLimits(limits)).toEqual({
      agentTxLimits: "agent_a = 25",
      agentMerchants: "agent_a = acme_api, data_co",
    });
  });
  test("a parse -> render -> parse round trip is stable", () => {
    const values = { agentTxLimits: "agent_a = 25", agentMerchants: "agent_a = acme_api, data_co" };
    const parsed = parseAgentLimits(values);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(agentLimitValuesFromLimits(parsed.limits)).toEqual(values);
  });
});

describe("applyAgentLimits (tighten-only overlay)", () => {
  const base = {
    ...DEFAULT_POLICY_RULES,
    transactionLimit: usdcMoney("100000000"), // 100 USDC
    allowedMerchantIds: ["acme_api", "data_co", "cloud_x"],
  };
  test("returns the rules unchanged when the agent has no override", () => {
    expect(applyAgentLimits(base, undefined)).toBe(base);
  });
  test("per-tx cap becomes the min of workspace and agent limits", () => {
    expect(applyAgentLimits(base, { perTxAtomic: "25000000" }).transactionLimit.amountAtomic).toBe("25000000");
    // A cap higher than the workspace limit never loosens it.
    expect(applyAgentLimits(base, { perTxAtomic: "500000000" }).transactionLimit.amountAtomic).toBe("100000000");
    expect(applyAgentLimits(base, { perTxAtomic: "0" }).transactionLimit.amountAtomic).toBe("100000000");
  });
  test("merchant allowlist becomes the intersection with the workspace list", () => {
    const eff = applyAgentLimits(base, { merchants: ["data_co", "not_in_workspace"] });
    expect(eff.allowedMerchantIds).toEqual(["data_co"]); // never adds a merchant the workspace didn't allow
  });
});

describe("renderAgentLimitFields", () => {
  test("renders both textareas with the owner's typed values preserved", () => {
    const html = renderAgentLimitFields({ agentTxLimits: "agent_a = 25", agentMerchants: "agent_a = acme_api" });
    expect(html).toContain('name="agentTxLimits"');
    expect(html).toContain('name="agentMerchants"');
    expect(html).toContain("agent_a = 25");
    expect(html).toContain("agent_a = acme_api");
  });
});
