import { readFile } from "node:fs/promises";

import { parseStoreEnvelope } from "../adapters/storage/store-envelope";
import { derivePilotSessionView } from "./session-projections";
import { PilotManifestValidationError, PilotScenarioMappingError, PilotStoreIntegrityError } from "./session-errors";
import { parsePilotCurrentPointer, parsePilotSessionManifest } from "./session-schemas";
import { resolvePilotCurrentPath, resolvePilotRoot, resolvePilotSessionPaths } from "./path-safety";
import { PILOT_SCENARIO_NAMES, type PilotScenarioName, type PilotSessionReader } from "./session-contracts";

export interface PilotSessionReaderOptions {
  readonly repoRoot: string;
  readonly readText?: (path: string) => Promise<string>;
}

export function createPilotSessionReader(options: PilotSessionReaderOptions): PilotSessionReader {
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));

  async function loadAtRoot(
    pilotRoot: string,
    sessionId: string,
    expectedManifestChecksum?: string,
  ) {
    const paths = await resolvePilotSessionPaths(pilotRoot, sessionId);
    const manifest = parsePilotSessionManifest(await readText(paths.manifestPath));
    if (manifest.sessionId !== sessionId) {
      throw new PilotManifestValidationError("Manifest is not bound to the selected Pilot Session");
    }
    if (expectedManifestChecksum && manifest.manifestChecksum !== expectedManifestChecksum) {
      throw new PilotManifestValidationError("Current pointer is not bound to the selected manifest");
    }
    let envelope;
    try {
      envelope = parseStoreEnvelope(await readText(paths.storePath));
    } catch (error) {
      throw new PilotStoreIntegrityError("Pilot canonical store failed integrity validation", error);
    }
    return derivePilotSessionView(manifest, envelope);
  }

  return {
    async loadCurrentSession() {
      const pilotRoot = await resolvePilotRoot(options.repoRoot);
      const pointerPath = await resolvePilotCurrentPath(pilotRoot);
      const pointer = parsePilotCurrentPointer(await readText(pointerPath));
      return loadAtRoot(pilotRoot, pointer.sessionId, pointer.manifestChecksum);
    },
    async loadSession(sessionId) {
      return loadAtRoot(await resolvePilotRoot(options.repoRoot), sessionId);
    },
    async loadScenario(sessionId, scenarioName) {
      if (!PILOT_SCENARIO_NAMES.includes(scenarioName as PilotScenarioName)) {
        throw new PilotScenarioMappingError("Pilot scenario name is invalid");
      }
      const session = await loadAtRoot(await resolvePilotRoot(options.repoRoot), sessionId);
      const scenario = session.scenarios.find((candidate) => candidate.name === scenarioName);
      if (!scenario) throw new PilotScenarioMappingError("Pilot scenario is missing");
      return scenario;
    },
  };
}
