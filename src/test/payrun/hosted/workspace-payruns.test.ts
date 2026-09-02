import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { buildPayRunAt, PAY_RUN_ID } from "@/test/payrun/domain/fixtures";

const hostedWorkspace = vi.hoisted(() => ({
  list: vi.fn(),
  close: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/features/payrun/hosted/workspace", () => ({
  openWorkspacePersistence: (...args: unknown[]) => hostedWorkspace.open(...args),
}));

import { listWorkspacePayRuns, projectHostedPayRunSummary } from "@/features/payrun/hosted/workspace-payruns";

describe("hosted workspace PayRun read projection", () => {
  describe("projectHostedPayRunSummary", () => {
    test("maps a decided PayRun to a summary", () => {
      const summary = projectHostedPayRunSummary(buildPayRunAt("policy_allowed"));
      expect(summary).toEqual({
        payRunId: PAY_RUN_ID,
        status: "policy_allowed",
        agentId: "agent_001",
        purpose: "Purchase a verified API result",
        createdAt: expect.any(String),
        amount: { amountAtomic: "420000", asset: "USDC", decimals: 6 },
        policy: { outcome: "allowed", reasonCodes: [] },
      });
    });

    test("policy is null when no decision has been recorded yet", () => {
      expect(projectHostedPayRunSummary(buildPayRunAt("intent_recorded")).policy).toBeNull();
    });
  });

  describe("listWorkspacePayRuns", () => {
    beforeEach(() => {
      hostedWorkspace.close.mockReset().mockResolvedValue(undefined);
      hostedWorkspace.list.mockReset();
      hostedWorkspace.open.mockReset().mockImplementation(async () => ({
        workspace: { projectId: "10000000-0000-4000-8000-00000000000a", name: "Personal Workspace", mode: "sandbox" },
        persistence: { payRuns: { list: hostedWorkspace.list }, close: hostedWorkspace.close },
      }));
    });

    afterEach(() => vi.clearAllMocks());

    test("lists the workspace's PayRuns as summaries and closes persistence", async () => {
      hostedWorkspace.list.mockResolvedValue([
        buildPayRunAt("policy_allowed"),
        buildPayRunAt("pending_review"),
      ]);

      const view = await listWorkspacePayRuns({} as never, { userId: "user-a" });

      expect(view.workspace.projectId).toBe("10000000-0000-4000-8000-00000000000a");
      expect(hostedWorkspace.list).toHaveBeenCalledWith("10000000-0000-4000-8000-00000000000a");
      expect(view.payRuns.map((p) => [p.status, p.policy?.outcome])).toEqual([
        ["policy_allowed", "allowed"],
        ["pending_review", "needs_review"],
      ]);
      expect(hostedWorkspace.close).toHaveBeenCalledOnce();
    });

    test("closes persistence even when the list read fails", async () => {
      hostedWorkspace.list.mockRejectedValue(new Error("read failed"));
      await expect(listWorkspacePayRuns({} as never, { userId: "user-a" })).rejects.toThrow("read failed");
      expect(hostedWorkspace.close).toHaveBeenCalledOnce();
    });
  });
});
