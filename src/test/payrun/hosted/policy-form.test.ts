import { describe, expect, test } from "vitest";

import { DEFAULT_POLICY_RULES } from "@/features/payrun/hosted/workspace-policy";
import {
  atomicToUsdc,
  parsePolicyForm,
  usdcToAtomic,
  valuesFromForm,
  valuesFromRules,
} from "@/features/payrun/hosted/policy-form";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

const VALID = {
  transactionLimit: "100",
  reviewThreshold: "50",
  absoluteHardLimit: "1000",
  allowedMerchantIds: "merchant_known, merchant_new\nmerchant_known",
  blockedMerchantIds: "",
  blockedCategories: "gambling",
};

describe("policy-form money conversion", () => {
  test("usdcToAtomic parses whole and fractional USDC to 6-decimal atomic", () => {
    expect(usdcToAtomic("100")).toBe("100000000");
    expect(usdcToAtomic("12.50")).toBe("12500000");
    expect(usdcToAtomic("0.000001")).toBe("1");
    expect(usdcToAtomic(" 0 ")).toBe("0");
  });

  test("usdcToAtomic rejects malformed, negative, or over-precise input", () => {
    for (const bad of ["", "abc", "-5", "1.1234567", "1.", ".5", "1,000"]) {
      expect(usdcToAtomic(bad)).toBeNull();
    }
  });

  test("atomicToUsdc renders atomic USDC without trailing zeros", () => {
    expect(atomicToUsdc("100000000")).toBe("100");
    expect(atomicToUsdc("12500000")).toBe("12.5");
    expect(atomicToUsdc("1")).toBe("0.000001");
    expect(atomicToUsdc("0")).toBe("0");
  });

  test("round-trips any atomic value", () => {
    for (const atomic of ["1", "999999", "1000000", "250000000"]) {
      expect(usdcToAtomic(atomicToUsdc(atomic))).toBe(atomic);
    }
  });
});

describe("parsePolicyForm", () => {
  test("builds a rule snapshot, converting amounts and de-duping trimmed lists", () => {
    const result = parsePolicyForm(form({ ...VALID, requireReviewForNewMerchant: "on" }), DEFAULT_POLICY_RULES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.transactionLimit.amountAtomic).toBe("100000000");
    expect(result.rules.reviewThreshold.amountAtomic).toBe("50000000");
    expect(result.rules.absoluteHardLimit.amountAtomic).toBe("1000000000");
    expect(result.rules.allowedMerchantIds).toEqual(["merchant_known", "merchant_new"]);
    expect(result.rules.blockedCategories).toEqual(["gambling"]);
    expect(result.rules.requireReviewForNewMerchant).toBe(true);
    // non-edited fields are carried from the base snapshot
    expect(result.rules.allowedRails).toEqual(DEFAULT_POLICY_RULES.allowedRails);
  });

  test("an unchecked review box parses as false", () => {
    const result = parsePolicyForm(form(VALID), DEFAULT_POLICY_RULES);
    expect(result.ok && result.rules.requireReviewForNewMerchant).toBe(false);
  });

  test("rejects a malformed amount", () => {
    const result = parsePolicyForm(form({ ...VALID, transactionLimit: "abc" }), DEFAULT_POLICY_RULES);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("USDC amount") });
  });

  test("rejects a per-transaction limit above the hard limit", () => {
    const result = parsePolicyForm(form({ ...VALID, transactionLimit: "2000" }), DEFAULT_POLICY_RULES);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("hard limit") });
  });
});

describe("daily budget", () => {
  test("parses a USDC daily budget to atomic", () => {
    const result = parsePolicyForm(form({ ...VALID, dailyBudget: "100" }), DEFAULT_POLICY_RULES);
    expect(result.ok && result.dailyBudgetAtomic).toBe("100000000");
  });

  test("an empty or whitespace daily budget means unlimited (\"0\")", () => {
    expect(parsePolicyForm(form({ ...VALID, dailyBudget: "" }), DEFAULT_POLICY_RULES)).toMatchObject({ dailyBudgetAtomic: "0" });
    expect(parsePolicyForm(form({ ...VALID, dailyBudget: "   " }), DEFAULT_POLICY_RULES)).toMatchObject({ dailyBudgetAtomic: "0" });
  });

  test("rejects a malformed daily budget", () => {
    const result = parsePolicyForm(form({ ...VALID, dailyBudget: "abc" }), DEFAULT_POLICY_RULES);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("daily budget") });
  });

  test("valuesFromRules round-trips the daily budget (USDC<->atomic, \"0\"<->\"\")", () => {
    expect(valuesFromRules(DEFAULT_POLICY_RULES, "0", {}).dailyBudget).toBe("");
    expect(valuesFromRules(DEFAULT_POLICY_RULES, "100000000", {}).dailyBudget).toBe("100");
    expect(valuesFromRules(DEFAULT_POLICY_RULES, "12500000", {}).dailyBudget).toBe("12.5");
  });

  test("valuesFromForm reflects the submitted daily budget verbatim", () => {
    expect(valuesFromForm(form({ ...VALID, dailyBudget: "42.5" })).dailyBudget).toBe("42.5");
  });
});

describe("agent budgets", () => {
  test("parses a \"agentId = usdc\" textarea into an atomic-USDC map, skipping blank lines", () => {
    const result = parsePolicyForm(
      form({ ...VALID, agentBudgets: "agent_ops_01 = 50\n\n  agent_ops_02 = 12.5  \n" }),
      DEFAULT_POLICY_RULES,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agentBudgets).toEqual({ agent_ops_01: "50000000", agent_ops_02: "12500000" });
  });

  test("an empty textarea yields an empty map (no per-agent caps)", () => {
    const result = parsePolicyForm(form({ ...VALID, agentBudgets: "   \n  " }), DEFAULT_POLICY_RULES);
    expect(result.ok && result.agentBudgets).toEqual({});
  });

  test("rejects a malformed agent budget amount with a clear per-agent error", () => {
    const result = parsePolicyForm(form({ ...VALID, agentBudgets: "agent_ops_01 = abc" }), DEFAULT_POLICY_RULES);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Agent budget for agent_ops_01") });
  });

  test("valuesFromRules renders the map back to \"agentId = usdc\" lines", () => {
    const values = valuesFromRules(DEFAULT_POLICY_RULES, "0", { agent_ops_01: "50000000", agent_ops_02: "12500000" });
    expect(values.agentBudgets).toBe("agent_ops_01 = 50\nagent_ops_02 = 12.5");
  });

  test("agent budgets round-trip through render and parse", () => {
    const text = valuesFromRules(DEFAULT_POLICY_RULES, "0", { agent_ops_01: "50000000" }).agentBudgets;
    const result = parsePolicyForm(form({ ...VALID, agentBudgets: text }), DEFAULT_POLICY_RULES);
    expect(result.ok && result.agentBudgets).toEqual({ agent_ops_01: "50000000" });
  });

  test("valuesFromForm reflects the submitted agent-budgets textarea verbatim", () => {
    expect(valuesFromForm(form({ ...VALID, agentBudgets: "agent_x = 9" })).agentBudgets).toBe("agent_x = 9");
  });
});

describe("valuesFromForm", () => {
  test("reflects raw submitted input verbatim for redisplay", () => {
    const values = valuesFromForm(form({ ...VALID, transactionLimit: "abc", requireReviewForNewMerchant: "on" }));
    expect(values.transactionLimit).toBe("abc");
    expect(values.requireReviewForNewMerchant).toBe(true);
    expect(values.allowedMerchantIds).toBe("merchant_known, merchant_new\nmerchant_known");
  });
});
