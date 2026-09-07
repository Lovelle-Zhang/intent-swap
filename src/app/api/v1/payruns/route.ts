import { handleIntakeRequest } from "@/features/payrun/hosted/intake-handler";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/v1/payruns — the real external intake endpoint. Authenticates a
// bearer API key, evaluates the submitted intent against the workspace policy
// with the real engine, and persists a decision-only PayRun. Never moves money.
export async function POST(request: Request): Promise<Response> {
  return handleIntakeRequest(getHostedSqlPool(), request);
}
