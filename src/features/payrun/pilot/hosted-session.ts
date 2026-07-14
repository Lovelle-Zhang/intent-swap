import { parseStoreEnvelope } from "../adapters/storage/store-envelope";
import currentPointer from "./hosted-fixture/current.json";
import manifestDocument from "./hosted-fixture/sessions/20260714T042411.375Z-4b053a0/pilot-session-manifest.json";
import storeDocument from "./hosted-fixture/sessions/20260714T042411.375Z-4b053a0/payrun-store.json";
import { derivePilotSessionView } from "./session-projections";
import {
  PilotManifestValidationError,
  PilotSessionNotFoundError,
  PilotStoreIntegrityError,
} from "./session-errors";
import { parsePilotCurrentPointer, parsePilotSessionManifest } from "./session-schemas";
import type { PilotSessionView } from "./session-contracts";

export interface BundledPilotSessionDocuments {
  readonly pointerText: string;
  readonly manifestText: string;
  readonly storeText: string;
}

export function parseBundledPilotSession(documents: BundledPilotSessionDocuments) {
  const pointer = parsePilotCurrentPointer(documents.pointerText);
  const manifest = parsePilotSessionManifest(documents.manifestText);

  if (pointer.sessionId !== manifest.sessionId) {
    throw new PilotManifestValidationError("Hosted pointer is not bound to the bundled Pilot Session");
  }
  if (pointer.manifestChecksum !== manifest.manifestChecksum) {
    throw new PilotManifestValidationError("Hosted pointer is not bound to the bundled manifest");
  }

  let envelope;
  try {
    envelope = parseStoreEnvelope(documents.storeText);
  } catch (error) {
    throw new PilotStoreIntegrityError("Hosted canonical store failed integrity validation", error);
  }

  return derivePilotSessionView(manifest, envelope);
}

export async function loadBundledHostedPilotSession() {
  return parseBundledPilotSession({
    pointerText: JSON.stringify(currentPointer),
    manifestText: JSON.stringify(manifestDocument),
    storeText: JSON.stringify(storeDocument),
  });
}

interface CurrentPilotSessionResolution {
  readonly vercelEnvironment?: string;
  readonly localReader: { loadCurrentSession(): Promise<PilotSessionView> };
  readonly loadBundled?: () => Promise<PilotSessionView>;
}

export async function resolveCurrentPilotSession(options: CurrentPilotSessionResolution) {
  try {
    return await options.localReader.loadCurrentSession();
  } catch (error) {
    if (!(error instanceof PilotSessionNotFoundError) || options.vercelEnvironment !== "preview") {
      throw error;
    }
    return (options.loadBundled ?? loadBundledHostedPilotSession)();
  }
}
