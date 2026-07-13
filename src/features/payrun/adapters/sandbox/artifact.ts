import { sha256Canonical } from "../storage/canonical-json";
import type {
  CanonicalExecutionProof,
  ExecutionProofRequest,
  PayIntent,
  PaymentExecution,
} from "../../domain/types";

export function prepareSandboxProofRequest(
  intent: PayIntent,
  payment: PaymentExecution,
  occurredAt: string,
): ExecutionProofRequest {
  return {
    id: `proof_request_${intent.payRunId}`,
    projectId: intent.projectId,
    payRunId: intent.payRunId,
    paymentExecutionId: payment.id,
    artifactType: intent.expectedArtifactType,
    provider: "sandbox_artifact_provider",
    createdAt: occurredAt,
  };
}

export function collectSandboxArtifact(
  request: ExecutionProofRequest,
  occurredAt: string,
): CanonicalExecutionProof {
  const artifactReference = `sandbox:artifact:${request.payRunId}`;
  const checksum = sha256Canonical({ artifactReference, artifactType: request.artifactType, outcome: "positive" });
  const artifactProof = {
    projectId: request.projectId,
    payRunId: request.payRunId,
    paymentExecutionId: request.paymentExecutionId,
    requestId: request.id,
    provider: request.provider,
    artifactType: request.artifactType,
    artifactReference,
    checksum,
    verificationStatus: "verified" as const,
    capturedAt: occurredAt,
  };
  return {
    id: `proof_${request.payRunId}`,
    projectId: request.projectId,
    payRunId: request.payRunId,
    paymentExecutionId: request.paymentExecutionId,
    requestId: request.id,
    provider: request.provider,
    artifactType: request.artifactType,
    artifactReference,
    checksum,
    verificationStatus: "verified",
    outcome: "positive",
    evidence: {
      environment: "sandbox",
      kind: "sandbox_execution_proof",
      provider: request.provider,
      reference: artifactReference,
      observedStatus: "verified",
      checksum,
      capturedAt: occurredAt,
      verificationMethod: "deterministic_fixture",
      synthetic: true,
      transactionHash: null,
    },
    artifactProof,
    capturedAt: occurredAt,
  };
}
