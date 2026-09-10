import { handleAuditRequest } from "@/features/payrun/hosted/audit-chain";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/v1/payruns/{id}/audit — the run's audit trail with its hash chain
// (bearer key, workspace-scoped). Every event carries prevHash + entryHash so an
// auditor can independently re-derive the chain and detect any alteration.
// 401 bad key · 404 not in workspace.
export async function GET(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  return handleAuditRequest(getHostedSqlPool(), request, params.id);
}
