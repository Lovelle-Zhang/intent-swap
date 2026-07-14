import { unstable_noStore } from "next/cache";
import { notFound } from "next/navigation";

import { PilotSessionNotFoundError } from "@/features/payrun/pilot/session-errors";
import { loadCurrentPilotSession } from "@/features/payrun/presentation/pilot-loader.server";
import { findScenarioByPayRunId } from "@/features/payrun/presentation/pilot-session";

import { PayRunDetailView } from "./payrun-detail-view";

export const dynamic = "force-dynamic";

export default async function PayRunDetailPage({ params }: { readonly params: { readonly id: string } }) {
  unstable_noStore();
  try {
    const session = await loadCurrentPilotSession();
    const scenario = findScenarioByPayRunId(session, decodeURIComponent(params.id));
    if (!scenario) notFound();
    return <PayRunDetailView session={session} scenario={scenario} />;
  } catch (error) {
    if (error instanceof PilotSessionNotFoundError) notFound();
    throw error;
  }
}
