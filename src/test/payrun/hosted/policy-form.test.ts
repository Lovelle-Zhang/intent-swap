import { describe, expect, test } from "vitest";

import { DEFAULT_POLICY_RULES } from "@/features/payrun/hosted/workspace-policy";
import {
  atomicToUsdc,
  parsePolicyForm,
  usdcToAtomic,
  valuesFromForm,
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

describe("valuesFromForm", () => {
  test("reflects raw submitted input verbatim for redisplay", () => {
    const values = valuesFromForm(form({ ...VALID, transactionLimit: "abc", requireReviewForNewMerchant: "on" }));
    expect(values.transactionLimit).toBe("abc");
    expect(values.requireReviewForNewMerchant).toBe(true);
    expect(values.allowedMerchantIds).toBe("merchant_known, merchant_new\nmerchant_known");
  });
});
