import { atomicToUsdc } from "./policy-form";
import type { HostedPayRunSummary } from "./workspace-payruns";

// Export the Pay Runs ledger as CSV for compliance / accounting. Pure: the route
// applies the same status/search/date filters, then hands the rows here. RFC-4180
// quoting — a field is wrapped in quotes and its quotes doubled whenever it holds
// a comma, quote, or newline — so purposes and reason codes never break columns.

const COLUMNS = [
  "pay_run_id", "created_at", "status", "agent_id", "purpose", "amount", "asset", "decision", "reason_codes",
] as const;

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(run: HostedPayRunSummary): string {
  return [
    run.payRunId,
    run.createdAt,
    run.status,
    run.agentId,
    run.purpose,
    atomicToUsdc(run.amount.amountAtomic),
    run.amount.asset,
    run.policy?.outcome ?? "",
    run.policy ? run.policy.reasonCodes.join(";") : "",
  ].map((v) => cell(String(v))).join(",");
}

export function payRunsToCsv(runs: readonly HostedPayRunSummary[]): string {
  return [COLUMNS.join(","), ...runs.map(row)].join("\r\n");
}

// e.g. zenfix-pay-runs-2026-09-09.csv
export function csvFilename(now: Date = new Date()): string {
  return `zenfix-pay-runs-${now.toISOString().slice(0, 10)}.csv`;
}
