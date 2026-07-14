import { unstable_noStore } from "next/cache";

import { ZenfixEmptyState } from "@/components/zenfix/empty-state";
import { PilotSessionNotFoundError } from "@/features/payrun/pilot/session-errors";
import { loadCurrentPilotSession } from "@/features/payrun/presentation/pilot-loader.server";

import { PayRunsView } from "./payruns-view";

export const dynamic = "force-dynamic";

export default async function PayRunsPage({ searchParams }: { readonly searchParams?: { readonly status?: string | readonly string[]; readonly scenario?: string | readonly string[] } }) {
  unstable_noStore();
  try {
    const status = typeof searchParams?.status === "string" ? searchParams.status : searchParams?.status ? "invalid" : undefined;
    const scenario = typeof searchParams?.scenario === "string" ? searchParams.scenario : searchParams?.scenario ? "invalid" : undefined;
    return <PayRunsView session={await loadCurrentPilotSession()} filters={{ status, scenario }} />;
  } catch (error) {
    if (error instanceof PilotSessionNotFoundError) return <ZenfixEmptyState />;
    throw error;
  }
}
