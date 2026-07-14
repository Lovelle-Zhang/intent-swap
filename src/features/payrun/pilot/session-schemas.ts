import { canonicalClone, sha256Canonical } from "../adapters/storage/canonical-json";
import { PilotManifestValidationError } from "./session-errors";
import {
  PILOT_MANIFEST_SCHEMA_VERSION,
  PILOT_PREPARATION_COMMAND_VERSION,
  PILOT_SCENARIO_NAMES,
  PILOT_STORE_FILE,
  type PilotCurrentPointer,
  type PilotCurrentPointerContent,
  type PilotManifestScenario,
  type PilotSessionManifest,
  type PilotSessionManifestContent,
} from "./session-contracts";

const SESSION_ID = /^([0-9]{8})T([0-9]{6})\.([0-9]{3})Z-([0-9a-f]{7,12})$/;
const SHA_256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PilotManifestValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new PilotManifestValidationError(`${label} has missing or unexpected fields`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PilotManifestValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  const result = string(value, label);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
    throw new PilotManifestValidationError(`${label} must be canonical UTC ISO-8601`);
  }
  return result;
}

export function assertPilotSessionId(value: unknown, sourceCommit?: string): asserts value is string {
  const result = string(value, "sessionId");
  const match = SESSION_ID.exec(result);
  if (!match) throw new PilotManifestValidationError("sessionId has invalid format");
  const iso = `${match[1]!.slice(0, 4)}-${match[1]!.slice(4, 6)}-${match[1]!.slice(6, 8)}T${match[2]!.slice(0, 2)}:${match[2]!.slice(2, 4)}:${match[2]!.slice(4, 6)}.${match[3]}Z`;
  if (new Date(iso).toISOString() !== iso) {
    throw new PilotManifestValidationError("sessionId contains an invalid UTC timestamp");
  }
  if (sourceCommit && !sourceCommit.startsWith(match[4]!)) {
    throw new PilotManifestValidationError("sessionId Git suffix does not match sourceCommit");
  }
}

function checksum(value: unknown, label: string): string {
  const result = string(value, label);
  if (!SHA_256.test(result)) throw new PilotManifestValidationError(`${label} must be SHA-256 hex`);
  return result;
}

function parseScenario(value: unknown, index: number): PilotManifestScenario {
  const item = record(value, `scenarios[${index}]`);
  exactKeys(item, ["name", "payRunId", "expectedFinalStatus", "actualFinalStatus"], `scenarios[${index}]`);
  if (item.name !== PILOT_SCENARIO_NAMES[index]) {
    throw new PilotManifestValidationError("scenarios must use the frozen order");
  }
  const allowedStatuses = new Set(["completed", "pending_review", "blocked"]);
  if (!allowedStatuses.has(item.expectedFinalStatus as string) || !allowedStatuses.has(item.actualFinalStatus as string)) {
    throw new PilotManifestValidationError("scenario status is invalid");
  }
  return {
    name: item.name as PilotManifestScenario["name"],
    payRunId: string(item.payRunId, `scenarios[${index}].payRunId`),
    expectedFinalStatus: item.expectedFinalStatus as PilotManifestScenario["expectedFinalStatus"],
    actualFinalStatus: item.actualFinalStatus as PilotManifestScenario["actualFinalStatus"],
  };
}

function parseManifestContent(value: Record<string, unknown>): PilotSessionManifestContent {
  if (value.schemaVersion !== PILOT_MANIFEST_SCHEMA_VERSION) throw new PilotManifestValidationError("Unsupported manifest schemaVersion");
  const sourceCommit = string(value.sourceCommit, "sourceCommit");
  if (!GIT_SHA.test(sourceCommit)) throw new PilotManifestValidationError("sourceCommit must be a full Git SHA");
  assertPilotSessionId(value.sessionId, sourceCommit);
  if (value.storeFile !== PILOT_STORE_FILE) throw new PilotManifestValidationError("storeFile must be fixed");
  if (!Number.isSafeInteger(value.storeGeneration) || (value.storeGeneration as number) < 0) {
    throw new PilotManifestValidationError("storeGeneration must be a non-negative safe integer");
  }
  if (!Array.isArray(value.scenarios) || value.scenarios.length !== 4) {
    throw new PilotManifestValidationError("Manifest requires exactly four scenarios");
  }
  const scenarios = value.scenarios.map(parseScenario);
  if (new Set(scenarios.map((scenario) => scenario.payRunId)).size !== scenarios.length) {
    throw new PilotManifestValidationError("Scenario PayRun mapping must be unique");
  }
  if (value.preparationCommandVersion !== PILOT_PREPARATION_COMMAND_VERSION || value.sandboxOnly !== true) {
    throw new PilotManifestValidationError("Manifest command version or Sandbox marker is invalid");
  }
  return {
    schemaVersion: PILOT_MANIFEST_SCHEMA_VERSION,
    sessionId: value.sessionId as string,
    createdAt: timestamp(value.createdAt, "createdAt"),
    sourceCommit,
    storeFile: PILOT_STORE_FILE,
    storeGeneration: value.storeGeneration as number,
    storeEnvelopeChecksum: checksum(value.storeEnvelopeChecksum, "storeEnvelopeChecksum"),
    scenarios,
    preparationCommandVersion: PILOT_PREPARATION_COMMAND_VERSION,
    sandboxOnly: true,
  };
}

export function createPilotSessionManifest(content: PilotSessionManifestContent): PilotSessionManifest {
  const parsed = parseManifestContent(record(content, "manifest content"));
  return canonicalClone({ ...parsed, manifestChecksum: sha256Canonical(parsed) });
}

export function parsePilotSessionManifest(text: string): PilotSessionManifest {
  let value: unknown;
  try { value = JSON.parse(text); } catch (error) { throw new PilotManifestValidationError("Manifest is malformed JSON", error); }
  const input = record(value, "manifest");
  exactKeys(input, ["schemaVersion", "sessionId", "createdAt", "sourceCommit", "storeFile", "storeGeneration", "storeEnvelopeChecksum", "scenarios", "preparationCommandVersion", "sandboxOnly", "manifestChecksum"], "manifest");
  const parsed = parseManifestContent(input);
  const actual = checksum(input.manifestChecksum, "manifestChecksum");
  if (actual !== sha256Canonical(parsed)) throw new PilotManifestValidationError("Manifest checksum mismatch");
  return canonicalClone({ ...parsed, manifestChecksum: actual });
}

function parsePointerContent(value: Record<string, unknown>): PilotCurrentPointerContent {
  if (value.schemaVersion !== 1) throw new PilotManifestValidationError("Unsupported pointer schemaVersion");
  assertPilotSessionId(value.sessionId);
  return {
    schemaVersion: 1,
    sessionId: value.sessionId as string,
    manifestChecksum: checksum(value.manifestChecksum, "manifestChecksum"),
    updatedAt: timestamp(value.updatedAt, "updatedAt"),
  };
}

export function createPilotCurrentPointer(content: PilotCurrentPointerContent): PilotCurrentPointer {
  const parsed = parsePointerContent(record(content, "pointer content"));
  return canonicalClone({ ...parsed, pointerChecksum: sha256Canonical(parsed) });
}

export function parsePilotCurrentPointer(text: string): PilotCurrentPointer {
  let value: unknown;
  try { value = JSON.parse(text); } catch (error) { throw new PilotManifestValidationError("Pointer is malformed JSON", error); }
  const input = record(value, "pointer");
  exactKeys(input, ["schemaVersion", "sessionId", "manifestChecksum", "updatedAt", "pointerChecksum"], "pointer");
  const parsed = parsePointerContent(input);
  const actual = checksum(input.pointerChecksum, "pointerChecksum");
  if (actual !== sha256Canonical(parsed)) throw new PilotManifestValidationError("Pointer checksum mismatch");
  return canonicalClone({ ...parsed, pointerChecksum: actual });
}
