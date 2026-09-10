import { PersistenceUnavailableError } from "../adapters/storage";
import type { SqlPool } from "../adapters/storage/postgres/sql";
import { TerminalStateError, VersionConflictError } from "../domain/errors";
import { resolveApiKeyIdentity } from "./api-keys";
import { AuthUnavailableError } from "./errors";
import {
  buildExecutionReport,
  commitExecutionReport,
  parseExecutionReportBody,
} from "./execution-report";
import { retryOnTransientUnavailable } from "./retry";
import { isVerifiedRail, verifyUsdcTransfer } from "./onchain-verify";
import { lookupMerchantAddress } from "./merchant-registry";
import { getWorkspacePolicy } from "./workspace-policy";
import { getWorkspacePayRun } from "./workspace-payruns";
import { openWorkspacePersistence } from "./workspace";

// When an agent claims an execution on a verified rail (base-sepolia / base-mainnet),
// ZenFix requires and verifies a real on-chain USDC transfer — the outcome can no
// longer be merely self-reported.

// Execution-report webhook: ZenFix never executes payments. After an agent
// executes an allowed payment ON ITS OWN RAIL, it reports the outcome + proof
// here; we record it and move the PayRun to the terminal status
// `execution_reported`, closing proposed -> decided -> executed-elsewhere.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function bearer(request: Request): string | null {
  const match = /^Bearer (.+)$/.exec((request.headers.get("authorization") ?? "").trim());
  return match ? match[1] : null;
}

const CONFLICT = { error: "Pay Run was already reported", status: "execution_reported" };

export async function handleExecutionReport(
  pool: SqlPool, request: Request, payRunId: string,
): Promise<Response> {
  const identity = await resolveApiKeyIdentity(pool, bearer(request));
  if (!identity) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON" }, 400);
  }
  const input = parseExecutionReportBody(body);
  if (!input) {
    return json({ error: "Missing or invalid fields: outcome (executed|failed), providerReference" }, 400);
  }

  try {
    const { workspace, persistence } = await retryOnTransientUnavailable(
      () => openWorkspacePersistence(pool, identity),
    );
    try {
      const detail = await getWorkspacePayRun(pool, identity, payRunId);
      if (!detail) return json({ error: "Pay Run not found" }, 404);
      const current = detail.payRun;
      // A run is executable once Policy allowed it, or once a human approved a
      // needs_review run (approved). Anything else has not been authorized.
      if (current.status !== "policy_allowed" && current.status !== "approved") {
        return json({ error: "Pay Run is not awaiting execution", status: current.status }, 409);
      }
      // On-chain proof: a base-sepolia "executed" claim must carry a real USDC
      // transfer tx that we can verify (success, right token, amount >= authorized).
      // An unverifiable claim is rejected (422) — it is never recorded as executed.
      let verified: { chain: string; amountAtomic: string; recipient: string; pinnedMerchant: boolean } | null = null;
      if (input.outcome === "executed" && isVerifiedRail(input.rail)) {
        // If the owner pinned a payout address for this merchant, that address is
        // authoritative — the transfer must have gone there, not merely to an
        // address the agent named. Otherwise fall back to the claimed recipient.
        const policy = await getWorkspacePolicy(pool, identity);
        const pinned = lookupMerchantAddress(policy.merchantAddresses, current.intent.merchant.merchantId);
        const expectedRecipient = pinned ?? input.recipient;
        const result = await verifyUsdcTransfer(
          input.rail, input.transactionHash ?? "", current.intent.quotedAmount.amountAtomic, expectedRecipient,
        );
        if (!result.ok) {
          return json({ error: "On-chain verification failed", reason: result.reason }, 422);
        }
        verified = { chain: input.rail, amountAtomic: result.amountAtomic, recipient: result.recipient, pinnedMerchant: Boolean(pinned) };
      }
      // The persisted run's updatedAt may be ahead of wall clock (intake stamps
      // its transitions forward), and the state machine forbids moving time
      // backwards, so clamp the report time to at least the current updatedAt.
      const now = new Date(Math.max(Date.now(), Date.parse(current.updatedAt))).toISOString();
      const report = buildExecutionReport(current, workspace.projectId, input, now);
      let committed: boolean;
      try {
        committed = await commitExecutionReport(
          persistence, workspace.projectId, current, report, input.idempotencyKey ?? payRunId, now,
        );
      } catch (error) {
        if (error instanceof TerminalStateError || error instanceof VersionConflictError) {
          return json(CONFLICT, 409);
        }
        throw error;
      }
      if (!committed) return json(CONFLICT, 409);
      return json({
        payRunId, status: "execution_reported",
        report: {
          outcome: report.outcome, providerReference: report.providerReference,
          transactionHash: report.transactionHash, rail: report.rail, reportedAt: report.reportedAt,
        },
        verification: verified
          ? { verified: true, chain: verified.chain, amountAtomic: verified.amountAtomic, recipient: verified.recipient, pinnedMerchant: verified.pinnedMerchant }
          : { verified: false },
      }, 200);
    } finally {
      await persistence.close();
    }
  } catch (error) {
    if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
      return json({ error: "ZenFix is temporarily unavailable" }, 503);
    }
    throw error;
  }
}
