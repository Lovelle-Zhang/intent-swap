import { describe, expect, it } from "vitest";

import { InvariantViolationError } from "@/features/payrun/domain/errors";
import { assertLedgerBalanced } from "@/features/payrun/domain/invariants";
import { SANDBOX_LEDGER_ACCOUNT_ROLES, type LedgerDraft } from "@/features/payrun/domain/types";
import { buildLedgerDraft, PROJECT_ID } from "./fixtures";

describe("ADR-0006 Sandbox Ledger account roles", () => {
  it("uses the accepted closed account-role set", () => {
    expect(SANDBOX_LEDGER_ACCOUNT_ROLES).toEqual([
      "sandbox_funding_source",
      "sandbox_merchant_payable",
      "sandbox_fee_account",
      "sandbox_clearing",
    ]);
  });

  it("accepts balanced project-scoped sandbox roles", () => {
    const draft = buildLedgerDraft({
      entries: [
        {
          ...buildLedgerDraft().entries[0],
          accountId: `sandbox:${PROJECT_ID}:sandbox_merchant_payable`,
          accountRole: "sandbox_merchant_payable",
        },
        {
          ...buildLedgerDraft().entries[1],
          accountId: `sandbox:${PROJECT_ID}:sandbox_funding_source`,
          accountRole: "sandbox_funding_source",
        },
      ],
    } as Partial<LedgerDraft>);

    expect(() => assertLedgerBalanced(draft)).not.toThrow();
  });

  it("rejects an unapproved sandbox account role", () => {
    const draft = buildLedgerDraft({
      entries: [
        {
          ...buildLedgerDraft().entries[0],
          accountId: `sandbox:${PROJECT_ID}:sandbox_live_wallet`,
          accountRole: "sandbox_live_wallet",
        },
        {
          ...buildLedgerDraft().entries[1],
          accountId: `sandbox:${PROJECT_ID}:sandbox_funding_source`,
          accountRole: "sandbox_funding_source",
        },
      ],
    } as Partial<LedgerDraft>);

    expect(() => assertLedgerBalanced(draft)).toThrow(InvariantViolationError);
  });
});
