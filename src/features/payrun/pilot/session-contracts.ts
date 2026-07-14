import type {
  PayRunExplanation,
  ValidationReceiptProjection,
} from "../application/payrun-explanation";
import type { PayRunStatus } from "../domain/types";

export const PILOT_MANIFEST_SCHEMA_VERSION = 1 as const;
export const PILOT_PREPARATION_COMMAND_VERSION = "pv1-prepare-v1" as const;
export const PILOT_STORE_FILE = "payrun-store.json" as const;
export const PILOT_MANIFEST_FILE = "pilot-session-manifest.json" as const;
export const PILOT_WATERMARK = "SANDBOX / NO REAL FUNDS" as const;

export const PILOT_SCENARIO_NAMES = [
  "allowed",
  "needs_review",
  "blocked",
  "funding_mismatch",
] as const;
export type PilotScenarioName = (typeof PILOT_SCENARIO_NAMES)[number];

export interface PilotManifestScenario {
  readonly name: PilotScenarioName;
  readonly payRunId: string;
  readonly expectedFinalStatus: "completed" | "pending_review" | "blocked";
  readonly actualFinalStatus: "completed" | "pending_review" | "blocked";
}

export interface PilotSessionManifestContent {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly sourceCommit: string;
  readonly storeFile: typeof PILOT_STORE_FILE;
  readonly storeGeneration: number;
  readonly storeEnvelopeChecksum: string;
  readonly scenarios: readonly PilotManifestScenario[];
  readonly preparationCommandVersion: typeof PILOT_PREPARATION_COMMAND_VERSION;
  readonly sandboxOnly: true;
}

export interface PilotSessionManifest extends PilotSessionManifestContent {
  readonly manifestChecksum: string;
}

export interface PilotCurrentPointerContent {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly manifestChecksum: string;
  readonly updatedAt: string;
}

export interface PilotCurrentPointer extends PilotCurrentPointerContent {
  readonly pointerChecksum: string;
}

export interface PilotPolicySummary {
  readonly outcome: "allowed" | "needs_review" | "blocked";
  readonly policyId: string;
  readonly policyVersion: number;
  readonly reasonCodes: readonly string[];
  readonly checks: readonly {
    readonly sequence: number;
    readonly ruleClass: string;
    readonly reasonCode: string;
    readonly outcome: string;
    readonly explanation: string;
  }[];
}

export interface PilotEvidenceSummary {
  readonly status: string;
  readonly reference: string | null;
  readonly synthetic: boolean;
  readonly transactionHash: null;
}

export interface PilotAuditExplanation {
  readonly sequence: number;
  readonly beforeVersion: number;
  readonly afterVersion: number;
  readonly actionCode: string;
  readonly reasonCode: string;
  readonly actorType: "agent" | "user" | "system" | "worker";
  readonly occurredAt: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
}

export interface PilotScenarioView {
  readonly name: PilotScenarioName;
  readonly payRunId: string;
  readonly actualFinalStatus: "completed" | "pending_review" | "blocked";
  readonly agent: {
    readonly id: string;
    readonly name: null;
    readonly ownerId: null;
  };
  readonly purpose: string;
  readonly createdAt: string;
  readonly amount: {
    readonly amountAtomic: string;
    readonly asset: string;
    readonly decimals: number;
  };
  readonly explanation: PayRunExplanation;
  readonly validationReceipt: ValidationReceiptProjection;
  readonly policy: PilotPolicySummary;
  readonly approval: { readonly status: string; readonly requestId: string } | null;
  readonly funding: PilotEvidenceSummary | null;
  readonly payment: PilotEvidenceSummary | null;
  readonly proof: PilotEvidenceSummary | null;
  readonly ledger: { readonly journalId: string; readonly balanced: true } | null;
  readonly audit: readonly PilotAuditExplanation[];
}

export interface PilotSessionView {
  readonly sessionId: string;
  readonly createdAt: string;
  readonly sourceCommit: string;
  readonly storeGeneration: number;
  readonly storeEnvelopeChecksum: string;
  readonly manifestChecksum: string;
  readonly preparationCommandVersion: typeof PILOT_PREPARATION_COMMAND_VERSION;
  readonly sandboxOnly: true;
  readonly watermark: typeof PILOT_WATERMARK;
  readonly scenarios: readonly PilotScenarioView[];
}

export interface PilotSessionReader {
  loadCurrentSession(): Promise<PilotSessionView>;
  loadSession(sessionId: string): Promise<PilotSessionView>;
  loadScenario(sessionId: string, scenarioName: PilotScenarioName): Promise<PilotScenarioView>;
}

export const PILOT_EXPECTED_STATUS: Readonly<Record<PilotScenarioName, PayRunStatus>> = {
  allowed: "completed",
  needs_review: "pending_review",
  blocked: "blocked",
  funding_mismatch: "completed",
};
