import { unstable_noStore } from "next/cache";

import { createServerPilotSessionReader } from "@/features/payrun/pilot/session-reader.server";
import {
  PilotManifestValidationError,
  PilotPathBoundaryError,
  PilotSessionIncompleteError,
  PilotSessionNotFoundError,
  PilotStoreIntegrityError,
} from "@/features/payrun/pilot/session-errors";

import { PilotValidationErrorView, PilotValidationView } from "./pilot-validation-view";

export const dynamic = "force-dynamic";

function safeMessage(error: unknown): string {
  if (error instanceof PilotPathBoundaryError) return "The requested Pilot Session identifier is invalid.";
  if (error instanceof PilotSessionNotFoundError) return "No prepared Pilot Session is available.";
  if (error instanceof PilotSessionIncompleteError) return "This Pilot Session is incomplete and cannot be displayed.";
  if (error instanceof PilotManifestValidationError || error instanceof PilotStoreIntegrityError) {
    return "This Pilot Session failed integrity validation.";
  }
  return "The Pilot Session could not be displayed safely.";
}

export default async function PilotValidationPage({
  searchParams,
}: {
  readonly searchParams?: { readonly session?: string | readonly string[] };
}) {
  unstable_noStore();
  const selected = searchParams?.session;
  if (Array.isArray(selected)) {
    return <PilotValidationErrorView message="The requested Pilot Session identifier is invalid." />;
  }
  try {
    const reader = createServerPilotSessionReader();
    const session = typeof selected === "string"
      ? await reader.loadSession(selected)
      : await reader.loadCurrentSession();
    return <PilotValidationView session={session} />;
  } catch (error) {
    return <PilotValidationErrorView message={safeMessage(error)} />;
  }
}
