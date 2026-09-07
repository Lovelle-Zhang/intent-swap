import { handleExecutionReport } from "@/features/payrun/hosted/intake-execution";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/v1/payruns/:id/execution — the execution-report webhook. An agent
// that executed an allowed payment on its own rail reports the outcome + proof
// here; ZenFix records it and moves the Pay Run to terminal execution_reported.
// ZenFix never executes payments.
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  return handleExecutionReport(getHostedSqlPool(), request, params.id);
}
