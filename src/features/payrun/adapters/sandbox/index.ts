import type { PayRunPersistence } from "../../application/ports";
import { sha256Canonical } from "../storage/canonical-json";
import {
  SandboxPayRunControlLoopService,
  type SandboxControlLoopDependencies,
} from "../../application/control-loop";
import { evaluateSandboxPolicy } from "./policy";
import {
  buildPolicyRequest,
  buildHostedSandboxScenarioFixture,
  buildSandboxScenarioFixture,
  bindHostedSandboxProject,
  deterministicPayRunId,
  SANDBOX_PROJECT_ID,
} from "./fixtures";
import { completeSandboxFunding, prepareSandboxFunding } from "./funding";
import { completeSandboxPayment, prepareSandboxPayment } from "./payment";
import { collectSandboxArtifact, prepareSandboxProofRequest } from "./artifact";
import { buildSandboxLedgerDraft, commitSandboxLedger } from "./ledger";

export { SANDBOX_PROJECT_ID } from "./fixtures";

type ControlLoopOverrides = Partial<Pick<
  SandboxControlLoopDependencies,
  "completeFunding" | "completePayment" | "collectProof" | "buildLedgerDraft" | "commitLedger"
>>;

type ScenarioFixtureBuilder = typeof buildSandboxScenarioFixture;

export function createDeterministicSandboxControlLoop(
  storage: PayRunPersistence,
  overrides: ControlLoopOverrides = {},
): SandboxPayRunControlLoopService {
  return composeSandboxControlLoop(storage, buildSandboxScenarioFixture, overrides);
}

export function createHostedSandboxControlLoop(
  storage: PayRunPersistence,
  trustedProject: { readonly projectId: string },
  overrides: ControlLoopOverrides = {},
): SandboxPayRunControlLoopService {
  const binding = bindHostedSandboxProject(trustedProject.projectId);
  return composeSandboxControlLoop(
    storage,
    (projectId, payRunId, scenarioId) =>
      buildHostedSandboxScenarioFixture(binding, projectId, payRunId, scenarioId),
    overrides,
  );
}

function composeSandboxControlLoop(
  storage: PayRunPersistence,
  fixtureBuilder: ScenarioFixtureBuilder,
  overrides: ControlLoopOverrides,
): SandboxPayRunControlLoopService {
  return new SandboxPayRunControlLoopService({
    persistence: storage,
    hash: sha256Canonical,
    payRunId: deterministicPayRunId,
    fixture(projectId, payRunId, scenarioId) {
      const fixture = fixtureBuilder(projectId, payRunId, scenarioId);
      return {
        scenarioId,
        project: fixture.project,
        agent: fixture.agent,
        merchant: fixture.merchant,
        intent: fixture.intent,
        policyRequest: buildPolicyRequest(
          fixture,
          `decision_${payRunId}`,
          "2026-07-13T10:02:00.000Z",
        ),
        fundingScopeDigest: fixture.fundingScopeDigest,
      };
    },
    async evaluatePolicy(fixture) {
      return evaluateSandboxPolicy(fixture.policyRequest);
    },
    prepareFunding(fixture, reservation, decision, occurredAt) {
      const source = fixtureBuilder(
        fixture.project.id,
        fixture.intent.payRunId,
        fixture.scenarioId,
      );
      return prepareSandboxFunding(source, reservation, decision, occurredAt);
    },
    completeFunding: completeSandboxFunding,
    preparePayment(payRun, funding, occurredAt) {
      return prepareSandboxPayment(payRun.intent, funding, occurredAt);
    },
    completePayment: completeSandboxPayment,
    prepareProofRequest(payRun, payment, occurredAt) {
      return prepareSandboxProofRequest(payRun.intent, payment, occurredAt);
    },
    collectProof: collectSandboxArtifact,
    buildLedgerDraft: buildSandboxLedgerDraft,
    commitLedger: commitSandboxLedger,
    ...overrides,
  });
}
