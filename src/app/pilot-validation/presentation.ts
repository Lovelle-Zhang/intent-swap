import type { PilotPolicySummary } from "@/features/payrun/pilot/session-contracts";

const IDENTIFIER_PREFIX_LENGTH = 10;
const IDENTIFIER_SUFFIX_LENGTH = 6;
const IDENTIFIER_DISPLAY_LENGTH = IDENTIFIER_PREFIX_LENGTH + 3 + IDENTIFIER_SUFFIX_LENGTH;

export type PolicySummaryOutcome = "pass" | "review" | "block";

export interface PolicyCheckSummary {
  readonly label: "Merchant trust" | "Budget limit" | "Agent capability";
  readonly outcome: PolicySummaryOutcome;
}

export function shortenIdentifier(value: string): string {
  if (value.length <= IDENTIFIER_DISPLAY_LENGTH) return value;
  return `${value.slice(0, IDENTIFIER_PREFIX_LENGTH)}...${value.slice(-IDENTIFIER_SUFFIX_LENGTH)}`;
}

function summarizeOutcome(
  checks: PilotPolicySummary["checks"],
  matches: (reasonCode: string) => boolean,
): PolicySummaryOutcome {
  const outcomes = checks.filter((check) => matches(check.reasonCode)).map((check) => check.outcome);
  if (outcomes.includes("block")) return "block";
  if (outcomes.includes("review")) return "review";
  return "pass";
}

export function summarizePolicyChecks(
  checks: PilotPolicySummary["checks"],
): readonly PolicyCheckSummary[] {
  return [
    {
      label: "Merchant trust",
      outcome: summarizeOutcome(checks, (reasonCode) =>
        reasonCode.startsWith("merchant.") || reasonCode.startsWith("category.")),
    },
    {
      label: "Budget limit",
      outcome: summarizeOutcome(checks, (reasonCode) =>
        reasonCode.startsWith("budget.") || reasonCode.startsWith("amount.")),
    },
    {
      label: "Agent capability",
      outcome: summarizeOutcome(checks, (reasonCode) =>
        reasonCode.startsWith("agent.") || reasonCode.startsWith("auth.")),
    },
  ];
}
