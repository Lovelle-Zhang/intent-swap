import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { decideReview, type ReviewAction } from "@/features/payrun/hosted/review";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { getWorkspacePayRun } from "@/features/payrun/hosted/workspace-payruns";
import { openWorkspacePersistence } from "@/features/payrun/hosted/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /zenfix/payruns/:id/review — the signed-in owner approval action. Policy
// may route a Pay Run to review (pending_review); the workspace owner approves
// (→ approved, authorizing execution) or denies (→ denied, terminal) it here.
// ZenFix never executes or moves funds; this only records the human decision.
function toAction(value: FormDataEntryValue | null): ReviewAction | null {
  return value === "approve" || value === "deny" ? value : null;
}

export async function POST(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const { id } = params;
  let appOrigin: string;
  try {
    appOrigin = readZenFixAppOrigin();
  } catch {
    return new Response("ZenFix Hosted Sandbox is temporarily unavailable.", { status: 503 });
  }
  const detailUrl = (status: string) =>
    new URL(`/zenfix/payruns/${encodeURIComponent(id)}?status=${status}`, appOrigin);

  try {
    const form = await request.formData();
    const action = toAction(form.get("action"));
    if (!action) return new Response("action must be approve or deny", { status: 400 });

    const pool = getHostedSqlPool();
    const status = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      const detail = await getWorkspacePayRun(pool, identity, id);
      if (!detail) return null;
      if (detail.payRun.status !== "pending_review") return "not_pending";
      const { persistence } = await openWorkspacePersistence(pool, identity);
      try {
        await decideReview(persistence, identity, detail.payRun, action, new Date().toISOString());
      } finally {
        await persistence.close();
      }
      return action === "approve" ? "approved" : "denied";
    });

    if (status === null) {
      const notFound = new URL("/zenfix/payruns?error=not_found", appOrigin);
      return Response.redirect(notFound, 303);
    }
    return Response.redirect(detailUrl(status), 303);
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
