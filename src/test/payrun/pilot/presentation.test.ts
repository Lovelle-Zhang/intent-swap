import { describe, expect, it } from "vitest";

import {
  shortenIdentifier,
  summarizePolicyChecks,
} from "@/app/pilot-validation/presentation";

describe("PV-1 presentation helpers", () => {
  it("shortens long identifiers to one fixed display shape without changing the source value", () => {
    const source = "3864176fa9879116f4af5fc9fb6a34b1471ef93abc4971a814102706a3d3c4cb";

    expect(shortenIdentifier(source)).toBe("3864176fa9...d3c4cb");
    expect(source).toBe("3864176fa9879116f4af5fc9fb6a34b1471ef93abc4971a814102706a3d3c4cb");
    expect(shortenIdentifier("short-value")).toBe("short-value");
  });

  it("derives three high-value policy summaries while retaining the complete ordered checks", () => {
    const checks = [
      { sequence: 1, ruleClass: "identity", reasonCode: "agent.active", outcome: "pass", explanation: "Agent active." },
      { sequence: 2, ruleClass: "payee", reasonCode: "merchant.unknown", outcome: "block", explanation: "Unknown merchant." },
      { sequence: 3, ruleClass: "hard_limit", reasonCode: "budget.project_available", outcome: "pass", explanation: "Budget available." },
    ];

    expect(summarizePolicyChecks(checks)).toEqual([
      { label: "Merchant trust", outcome: "block" },
      { label: "Budget limit", outcome: "pass" },
      { label: "Agent capability", outcome: "pass" },
    ]);
    expect(checks).toHaveLength(3);
  });
});
