import { describe, expect, test } from "vitest";

import type { HostedPayRunSummary } from "@/features/payrun/hosted/workspace-payruns";
import {
  applyPayRunFilter,
  parsePayRunFilter,
  renderFilterBar,
} from "@/features/payrun/hosted/payruns-filter";

function run(overrides: Partial<HostedPayRunSummary>): HostedPayRunSummary {
  return {
    payRunId: "payrun_x",
    status: "policy_allowed",
    agentId: "agent_ops_01",
    purpose: "Buy data",
    createdAt: "2026-09-07T00:00:00.000Z",
    amount: { amountAtomic: "1", asset: "USDC", decimals: 6 },
    policy: null,
    ...overrides,
  };
}

const RUNS: HostedPayRunSummary[] = [
  run({ payRunId: "payrun_a", status: "policy_allowed", agentId: "agent_ops_01", purpose: "Buy dataset" }),
  run({ payRunId: "payrun_b", status: "pending_review", agentId: "agent_ops_02", purpose: "Monthly feed" }),
  run({ payRunId: "payrun_c", status: "blocked", agentId: "agent_ops_01", purpose: "Unknown payee" }),
  run({ payRunId: "payrun_d", status: "denied", agentId: "agent_ops_03", purpose: "Denied by owner" }),
  run({ payRunId: "payrun_e", status: "execution_reported", agentId: "agent_ops_02", purpose: "Executed run" }),
];

describe("parsePayRunFilter", () => {
  test("defaults to all + empty query, and trims q", () => {
    expect(parsePayRunFilter(new URLSearchParams())).toEqual({ state: "all", q: "" });
    expect(parsePayRunFilter(new URLSearchParams("q=%20hi%20"))).toEqual({ state: "all", q: "hi" });
  });
  test("accepts known states, ignores garbage", () => {
    expect(parsePayRunFilter(new URLSearchParams("state=blocked")).state).toBe("blocked");
    expect(parsePayRunFilter(new URLSearchParams("state=bogus")).state).toBe("all");
  });
});

describe("applyPayRunFilter", () => {
  test("all + no query returns everything", () => {
    expect(applyPayRunFilter(RUNS, { state: "all", q: "" })).toHaveLength(5);
  });
  test("blocked folds in denied", () => {
    const ids = applyPayRunFilter(RUNS, { state: "blocked", q: "" }).map((r) => r.payRunId);
    expect(ids).toEqual(["payrun_c", "payrun_d"]);
  });
  test("executed matches execution_reported; needs_review matches pending_review", () => {
    expect(applyPayRunFilter(RUNS, { state: "executed", q: "" }).map((r) => r.payRunId)).toEqual(["payrun_e"]);
    expect(applyPayRunFilter(RUNS, { state: "needs_review", q: "" }).map((r) => r.payRunId)).toEqual(["payrun_b"]);
  });
  test("q is a case-insensitive contains over agent, purpose, and id", () => {
    expect(applyPayRunFilter(RUNS, { state: "all", q: "OPS_02" }).map((r) => r.payRunId)).toEqual(["payrun_b", "payrun_e"]);
    expect(applyPayRunFilter(RUNS, { state: "all", q: "dataset" }).map((r) => r.payRunId)).toEqual(["payrun_a"]);
    expect(applyPayRunFilter(RUNS, { state: "all", q: "payrun_c" }).map((r) => r.payRunId)).toEqual(["payrun_c"]);
  });
  test("state and query combine (AND)", () => {
    expect(applyPayRunFilter(RUNS, { state: "blocked", q: "agent_ops_01" }).map((r) => r.payRunId)).toEqual(["payrun_c"]);
  });
});

describe("renderFilterBar", () => {
  test("marks the active state selected and shows a filtered count + Clear", () => {
    const html = renderFilterBar({ state: "blocked", q: "acme" }, 10, 2);
    expect(html).toContain('<option value="blocked" selected>');
    expect(html).toContain('value="acme"');
    expect(html).toContain("2 of 10");
    expect(html).toContain('href="/zenfix/payruns"');
  });
  test("no active filter shows only the total", () => {
    const html = renderFilterBar({ state: "all", q: "" }, 7, 7);
    expect(html).toContain("7 total");
    expect(html).not.toContain(" of ");
  });
});
