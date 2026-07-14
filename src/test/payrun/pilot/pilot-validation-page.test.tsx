// @vitest-environment jsdom

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { preparePilotSession } from "@/features/payrun/pilot/session-preparation";
import { createPilotSessionReader } from "@/features/payrun/pilot/session-reader";
import { PilotValidationView } from "@/app/pilot-validation/pilot-validation-view";

const roots: string[] = [];

afterEach(async () => {
  cleanup();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("/pilot-validation read-only surface", () => {
  it("renders four canonical scenarios, evidence summaries, Audit, provenance, and Sandbox warning", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "zenfix-pilot-page-"));
    roots.push(repoRoot);
    await preparePilotSession({
      repoRoot,
      createdAt: "2026-07-14T00:15:00.000Z",
      sourceCommit: "93ecba37dcf5084360f33adde5e9a520d968bcb0",
      operationId: "page",
    });
    const session = await createPilotSessionReader({ repoRoot }).loadCurrentSession();

    render(<PilotValidationView session={session} />);

    expect(screen.getAllByText("SANDBOX / NO REAL FUNDS").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Funding Mismatch")).toBeInTheDocument();
    expect(screen.getByText(/not_required · Funding not required/)).toBeInTheDocument();
    expect(screen.getByText(/sandbox_prepared · Simulation completed/)).toBeInTheDocument();
    expect(screen.getAllByText("Canonical receipt: unavailable")).toHaveLength(4);
    expect(screen.getAllByText(/Validation receipt projection: validation_receipt/)).toHaveLength(4);
    expect(screen.getByText("Source commit")).toBeInTheDocument();
    expect(screen.getByText("93ecba37dcf5084360f33adde5e9a520d968bcb0")).toBeInTheDocument();
    expect(screen.getAllByText(/Audit sequence/).length).toBeGreaterThan(0);
  }, 20_000);

  it("offers no mutation controls", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(join(process.cwd(), "src/app/pilot-validation/page.tsx"), "utf8"));
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("unstable_noStore");
    expect(source).not.toMatch(/<form|<button|use server|Approve|Deny|Retry|Execute|Run Again/);
    expect(source).not.toContain("preparePilotSession");
    expect(source).not.toContain("createDeterministicSandboxControlLoop");
  });
});
