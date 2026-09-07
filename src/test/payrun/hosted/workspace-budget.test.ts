import { describe, expect, test } from "vitest";

import { agentRemainingAtomic, computeRemainingAtomic } from "@/features/payrun/hosted/workspace-budget";

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

describe("agentRemainingAtomic", () => {
  test("an agent with no cap (absent key or \"0\") passes the hard limit through unchanged", () => {
    expect(agentRemainingAtomic({}, "agent_ops_01", "999999999", "1000000000")).toBe("1000000000");
    expect(agentRemainingAtomic({ other: "40000000" }, "agent_ops_01", "5", "1000000000")).toBe("1000000000");
    expect(agentRemainingAtomic({ agent_ops_01: "0" }, "agent_ops_01", "5", "1000000000")).toBe("1000000000");
  });

  test("a capped agent returns its budget minus what it spent today", () => {
    expect(agentRemainingAtomic({ agent_ops_01: "40000000" }, "agent_ops_01", "30000000", "1000000000")).toBe("10000000");
    expect(agentRemainingAtomic({ agent_ops_01: "40000000" }, "agent_ops_01", "0", "1000000000")).toBe("40000000");
  });

  test("agent remaining floors at 0 when the agent has spent its whole cap", () => {
    expect(agentRemainingAtomic({ agent_ops_01: "40000000" }, "agent_ops_01", "40000000", "1000000000")).toBe("0");
    expect(agentRemainingAtomic({ agent_ops_01: "40000000" }, "agent_ops_01", "55000000", "1000000000")).toBe("0");
  });
});
