import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import { createSupabaseServerClient } from "@/features/payrun/adapters/supabase/server";
import { readZenFixAppOrigin } from "@/features/payrun/hosted/config";
import { AuthUnavailableError, AuthenticationRequiredError } from "@/features/payrun/hosted/errors";
import { getHostedSqlPool } from "@/features/payrun/hosted/runtime";
import { requireVerifiedIdentity } from "@/features/payrun/hosted/session";
import { retryOnTransientUnavailable } from "@/features/payrun/hosted/retry";
import { listWorkspacePayRuns } from "@/features/payrun/hosted/workspace-payruns";
import {
  applyDateRange, applyPayRunFilter, parsePayRunFilter, parsePayRunPage,
} from "@/features/payrun/hosted/payruns-filter";
import { csvFilename, payRunsToCsv } from "@/features/payrun/hosted/payruns-csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /zenfix/payruns/export — the Pay Runs ledger as CSV, honoring the same
// status/search/date filters as the list (pagination is ignored: export ALL
// matching rows). Signed-in owner only; downloads as an attachment.
export async function GET(request: Request) {
  try {
    const view = await retryOnTransientUnavailable(async () => {
      const supabase = createSupabaseServerClient();
      const identity = await requireVerifiedIdentity({ getUser: () => supabase.auth.getUser() });
      return listWorkspacePayRuns(getHostedSqlPool(), identity);
    });
    const params = new URL(request.url).searchParams;
    const filter = parsePayRunFilter(params);
    const page = parsePayRunPage(params);
    const rows = applyDateRange(applyPayRunFilter(view.payRuns, filter), page);
    return new Response(payRunsToCsv(rows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${csvFilename()}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      let appOrigin: string;
      try { appOrigin = readZenFixAppOrigin(); } catch {
        return new Response("ZenFix authentication is temporarily unavailable.", { status: 503 });
      }
      return Response.redirect(new URL("/zenfix/sign-in", appOrigin), 303);
    }
    if (error instanceof PersistenceUnavailableError || error instanceof AuthUnavailableError) {
      return new Response("ZenFix Hosted Sandbox is temporarily unavailable.", { status: 503 });
    }
    throw error;
  }
}
