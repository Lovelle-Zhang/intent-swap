import { describe, expect, it } from "vitest";

import {
  deserializePayRun,
  payRunSchema,
  serializePayRun,
} from "@/features/payrun/domain/schemas";
import { SchemaValidationError } from "@/features/payrun/domain/errors";
import { buildPayRunAt } from "./fixtures";

describe("PayRun serialization", () => {
  it("round trips the canonical aggregate without floating-point conversion", () => {
    const original = buildPayRunAt("completed");
    const canonical = payRunSchema.parse(original);
    const serialized = serializePayRun(original);
    const restored = deserializePayRun(serialized);

    expect(restored).toEqual(canonical);
    expect(restored.intent.quotedAmount.amountAtomic).toBe("420000");
    expect(typeof restored.intent.quotedAmount.amountAtomic).toBe("string");
    expect(restored.version).toBe(7);
    expect(restored.projectId).toBe(original.projectId);
    expect(restored.policyDecisions[0]).toMatchObject({
      evaluatedBy: {
        service: "zenfix_policy_engine",
        engineVersion: "1.0.0",
      },
      decision: {
        outcome: "allowed",
      },
    });
    expect(restored.fundingPreparation?.attempts).toEqual(
      original.fundingPreparation?.attempts,
    );
    expect(Object.isFrozen(restored)).toBe(true);
  });

  it("rejects malformed JSON and invalid persisted state", () => {
    expect(() => deserializePayRun("not-json")).toThrowError(SchemaValidationError);
    expect(() => deserializePayRun(JSON.stringify({ status: "completed" }))).toThrowError(
      SchemaValidationError,
    );
  });
});
