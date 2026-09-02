import { unstable_noStore } from "next/cache";

import { ZenfixEmptyState } from "@/components/zenfix/empty-state";
import { PilotSessionNotFoundError } from "@/features/payrun/pilot/session-errors";
import { loadCurrentPilotSession } from "@/features/payrun/presentation/pilot-loader.server";

import { CommandCenterView } from "./command-center-view";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  unstable_noStore();
  try {
    return <CommandCenterView session={await loadCurrentPilotSession()} />;
  } catch (error) {
    if (error instanceof PilotSessionNotFoundError) return <ZenfixEmptyState />;
    throw error;
  }
}
