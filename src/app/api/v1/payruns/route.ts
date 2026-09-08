import { handleIntakeRequest } from "@/features/payrun/hosted/intake-handler";
import { handleListPayRuns } from "@/features/payrun/hosted/payruns-read-api";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/v1/payruns — the real external intake endpoint. Authenticates a
// bearer API key, evaluates the submitted intent against the workspace policy
// with the real engine, and persists a decision-only PayRun. Never moves money.
export async function POST(request: Request): Promise<Response> {
  return handleIntakeRequest(getHostedSqlPool(), request);
}

// GET /api/v1/payruns — list the workspace's runs (bearer key). Supports
// ?status=, ?agentId=, ?limit= (default 50, max 100); newest first.
export async function GET(request: Request): Promise<Response> {
  return handleListPayRuns(getHostedSqlPool(), request);
}
