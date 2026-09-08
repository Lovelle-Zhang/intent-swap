import { randomUUID } from "node:crypto";

import { PersistenceUnavailableError } from "../adapters/storage";
import type { SqlPool } from "../adapters/storage/postgres/sql";
import type { CanonicalPolicyDecision } from "../domain/types";
import { resolveApiKeyIdentity } from "./api-keys";
import { AuthUnavailableError } from "./errors";
import { buildIntakeEvaluation, type IntakeInput } from "./intake";
import { persistIntakeDecision } from "./intake-persist";
import { sendNeedsReviewWebhook } from "./webhook";
import { usdcToAtomic } from "./policy-form";
import { retryOnTransientUnavailable } from "./retry";
import { getWorkspacePolicy } from "./workspace-policy";
import {
  agentRemainingAtomic,
  computeRemainingAtomic,
  getAgentSpentTodayAtomic,
  getSpentTodayAtomic,
} from "./workspace-budget";
import { openWorkspacePersistence } from "./workspace";

// 2B-intake HTTP boundary: authenticate a real external agent by bearer API key,
// validate the submitted intent, evaluate it against the workspace's stored
// policy with the REAL engine, persist a decision-only PayRun, and answer JSON.
// A "blocked" decision is a successful evaluation and returns HTTP 200.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1] : null;
}

function isMerchant(value: unknown): value is IntakeInput["merchant"] {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m.id === "string" && m.id.length > 0
    && typeof m.payee === "string" && m.payee.length > 0
    && typeof m.category === "string" && m.category.length > 0;
}

function parseBody(body: unknown): IntakeInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.agentId !== "string" || b.agentId.length === 0 ||
    typeof b.purpose !== "string" || b.purpose.length === 0 ||
    typeof b.amount !== "string" || usdcToAtomic(b.amount) === null ||
    typeof b.artifactType !== "string" || b.artifactType.length === 0 ||
    !isMerchant(b.merchant) ||
    (b.idempotencyKey !== undefined && typeof b.idempotencyKey !== "string")
  ) {
    return null;
  }
  return {
    agentId: b.agentId, purpose: b.purpose, amount: b.amount, artifactType: b.artifactType,
    merchant: b.merchant,
    idempotencyKey: typeof b.idempotencyKey === "string" && b.idempotencyKey.length > 0
      ? b.idempotencyKey : randomUUID(),
  };
}

function toResponseDecision(decision: CanonicalPolicyDecision) {
  return {
    outcome: decision.outcome,
    reasonCodes: [...decision.reasonCodes],
    riskLevel: decision.riskLevel,
    nextAction: decision.nextAction,
    checks: decision.checks.map((c) => ({
      ruleClass: c.ruleClass, reasonCode: c.reasonCode, outcome: c.outcome, explanation: c.explanation,
    })),
  };
}

export async function handleIntakeRequest(pool: SqlPool, request: Request): Promise<Response> {
  const identity = await resolveApiKeyIdentity(pool, bearer(request));
  if (!identity) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be JSON" }, 400);
  }
  const input = parseBody(body);
  if (!input) {
    return json(
      { error: "Missing or invalid fields: agentId, purpose, amount, merchant{id,payee,category}, artifactType" },
      400,
    );
  }

  try {
    const now = new Date().toISOString();
    const { workspace, persistence } = await retryOnTransientUnavailable(
      () => openWorkspacePersistence(pool, identity),
    );
    try {
      const policy = await getWorkspacePolicy(pool, identity);
      const spent = await getSpentTodayAtomic(pool, identity, workspace.projectId);
      const remaining = computeRemainingAtomic(
        policy.dailyBudgetAtomic, spent, policy.rules.absoluteHardLimit.amountAtomic,
      );
      const agentSpent = await getAgentSpentTodayAtomic(
        pool, identity, workspace.projectId, input.agentId,
      );
      const agentRemaining = agentRemainingAtomic(
        policy.agentBudgets, input.agentId, agentSpent, policy.rules.absoluteHardLimit.amountAtomic,
      );
      const evaluation = buildIntakeEvaluation(
        input, workspace.projectId, policy.rules, { version: policy.version }, now, remaining, agentRemaining,
        policy.agentLimits[input.agentId],
      );
      await persistIntakeDecision(persistence, workspace.projectId, evaluation, input.idempotencyKey, now);
      // Best-effort needs_review nudge; never blocks or fails the decision.
      if (evaluation.decision.outcome === "needs_review" && policy.notifyWebhookUrl) {
        const q = evaluation.intent.quotedAmount;
        await sendNeedsReviewWebhook(policy.notifyWebhookUrl, {
          event: "payrun.needs_review", payRunId: evaluation.payRunId, workspaceId: workspace.projectId,
          agentId: input.agentId, amount: { amountAtomic: q.amountAtomic, asset: q.asset }, createdAt: now,
        });
      }
      return json({ payRunId: evaluation.payRunId, decision: toResponseDecision(evaluation.decision) }, 200);
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
