import { describe, expect, test } from "vitest";

import { computeRemainingAtomic } from "@/features/payrun/hosted/workspace-budget";

describe("computeRemainingAtomic", () => {
  test("an unlimited budget (\"0\") passes the hard limit through unchanged", () => {
    expect(computeRemainingAtomic("0", "999999999", "1000000000")).toBe("1000000000");
    expect(computeRemainingAtomic("0", "0", "1000000000")).toBe("1000000000");
  });

  test("a set budget returns budget minus spent", () => {
    expect(computeRemainingAtomic("100000000", "60000000", "1000000000")).toBe("40000000");
    expect(computeRemainingAtomic("100000000", "0", "1000000000")).toBe("100000000");
  });

  test("remaining floors at 0 when spent meets or exceeds the budget", () => {
    expect(computeRemainingAtomic("100000000", "100000000", "1000000000")).toBe("0");
    expect(computeRemainingAtomic("100000000", "150000000", "1000000000")).toBe("0");
  });
});
