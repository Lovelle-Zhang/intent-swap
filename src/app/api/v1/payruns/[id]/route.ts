import { handleGetPayRun } from "@/features/payrun/hosted/payruns-read-api";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/payruns/{id} — one run's decision, human review, and execution
// report (bearer key, workspace-scoped). Lets an agent poll a needs_review run
// for the owner's approve/deny outcome. 401 bad key · 404 not in workspace.
export async function GET(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  return handleGetPayRun(getHostedSqlPool(), request, params.id);
}
