import { randomUUID } from "node:crypto";

import { createHostedSandboxControlLoop } from "@/features/payrun/adapters/sandbox";
import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import {
  SANDBOX_SCENARIO_IDS,
  type SandboxScenarioId,
} from "@/features/payrun/application/control-loop-commands";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { openWorkspacePersistence } from "@/features/payrun/hosted/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 2B-1: the hosted WRITE path. A signed-in user creates a real PayRun in their
// own Postgres workspace by running the hosted control loop. This is a mutation
// route, deliberately separate from the read-only product surfaces; those keep
// projecting persisted state and never run the loop themselves.
function isScenarioId(value: unknown): value is SandboxScenarioId {
  return typeof value === "string" && (SANDBOX_SCENARIO_IDS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  let appOrigin: string;
  try {
    appOrigin = readZenFixAppOrigin();
  } catch {
    return new Response("ZenFix Hosted Sandbox is temporarily unavailable.", { status: 503 });
  }

  try {
    const form = await request.formData();
    const scenarioId = form.get("scenarioId");
    if (!isScenarioId(scenarioId)) {
      return Response.redirect(new URL("/zenfix/payruns?error=invalid_scenario", appOrigin), 303);
    }

    const supabase = createSupabaseServerClient();
    const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });

    const { workspace, persistence } = await openWorkspacePersistence(getHostedSqlPool(), identity);
    try {
      const service = createHostedSandboxControlLoop(persistence, { projectId: workspace.projectId });
      const runId = randomUUID();
      await service.execute({
        projectId: workspace.projectId,
        scenarioId,
        idempotencyKey: `hosted:${runId}`,
        correlationId: `hosted:${runId}`,
        requester: { actorId: identity.userId, actorType: "user" },
      });
    } finally {
      await persistence.close();
    }

    return Response.redirect(new URL("/zenfix/payruns?status=payrun_created", appOrigin), 303);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return Response.redirect(new URL("/zenfix/sign-in", appOrigin), 303);
    }
    if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
      return new Response("ZenFix Hosted Sandbox is temporarily unavailable.", { status: 503 });
    }
    throw error;
  }
}
