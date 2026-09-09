import { describe, expect, test } from "vitest";

import type { HostedPayRunSummary } from "@/features/payrun/hosted/workspace-payruns";
import { csvFilename, payRunsToCsv } from "@/features/payrun/hosted/payruns-csv";

function run(overrides: Partial<HostedPayRunSummary>): HostedPayRunSummary {
  return {
    payRunId: "payrun_a", status: "policy_allowed", agentId: "aria", purpose: "Buy data",
    createdAt: "2026-09-09T10:00:00.000Z", amount: { amountAtomic: "20000000", asset: "USDC", decimals: 6 },
    policy: { outcome: "allowed", reasonCodes: [] }, ...overrides,
  };
}

describe("payRunsToCsv", () => {
  test("emits a header and one CRLF-joined row per run, amount in USDC", () => {
    const csv = payRunsToCsv([run({})]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("pay_run_id,created_at,status,agent_id,purpose,amount,asset,decision,reason_codes");
    expect(row).toBe("payrun_a,2026-09-09T10:00:00.000Z,policy_allowed,aria,Buy data,20,USDC,allowed,");
  });

  test("RFC-4180 quotes fields with commas, quotes, or newlines", () => {
    const csv = payRunsToCsv([run({ purpose: 'Buy "premium", now', payRunId: "payrun_b" })]);
    expect(csv.split("\r\n")[1]).toContain('"Buy ""premium"", now"');
  });

  test("joins reason codes with ; and blanks a missing decision", () => {
    const blocked = run({ status: "blocked", policy: { outcome: "blocked", reasonCodes: ["merchant.unknown", "budget.project_limit_exceeded"] } });
    expect(payRunsToCsv([blocked]).split("\r\n")[1]).toContain("blocked,merchant.unknown;budget.project_limit_exceeded");
    const noPolicy = run({ policy: null });
    const cells = payRunsToCsv([noPolicy]).split("\r\n")[1].split(",");
    expect(cells.slice(-2)).toEqual(["", ""]); // decision + reason_codes empty
  });

  test("filename carries the UTC date", () => {
    expect(csvFilename(new Date("2026-09-09T23:00:00.000Z"))).toBe("zenfix-pay-runs-2026-09-09.csv");
  });
});
