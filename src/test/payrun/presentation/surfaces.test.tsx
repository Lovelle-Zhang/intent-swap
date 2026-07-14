// @vitest-environment jsdom

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CommandCenterView } from "@/app/command-center/command-center-view";
import { PayRunDetailView } from "@/app/payruns/[id]/payrun-detail-view";
import { PayRunsView } from "@/app/payruns/payruns-view";
import { ZenfixEmptyState } from "@/components/zenfix/empty-state";
import { preparePilotSession } from "@/features/payrun/pilot/session-preparation";
import { createPilotSessionReader } from "@/features/payrun/pilot/session-reader";
import type { PilotSessionView } from "@/features/payrun/pilot/session-contracts";
import { findScenarioByPayRunId } from "@/features/payrun/presentation/pilot-session";

let repoRoot: string;
let session: PilotSessionView;

beforeAll(async () => {
  repoRoot = await mkdtemp(join(tmpdir(), "zenfix-command-center-"));
  await preparePilotSession({
    repoRoot,
    createdAt: "2026-07-14T04:30:00.000Z",
    sourceCommit: "4b053a0523bdf8026888feb0c2d2ca70bf948f96",
    operationId: "command-center-test",
  });
  session = await createPilotSessionReader({ repoRoot }).loadCurrentSession();
}, 20_000);

afterAll(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("/command-center", () => {
  it("renders an Agent-first operations canvas from the immutable canonical session", () => {
    const { container } = render(<CommandCenterView session={session} />);

    expect(screen.getByRole("heading", { name: "ZenFix Command Center" })).toBeInTheDocument();
    expect(screen.getByText("Agent Payment Intelligence & Governance")).toBeInTheDocument();
    expect(screen.getByText("Observed Agents")).toBeInTheDocument();
    expect(screen.getByText("Session Pay Runs")).toBeInTheDocument();
    expect(screen.queryByText("Active Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Pay Runs Today")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agent Fleet" })).toBeInTheDocument();
    expect(screen.getByText("Observed in current pilot session")).toBeInTheDocument();
    expect(screen.getAllByText("Current immutable pilot session")).toHaveLength(6);
    expect(screen.getAllByText("Sandbox only")).toHaveLength(6);
    expect(screen.getAllByText("0.84 USDC").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("0.42 USDC").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0.44 USDC")).toBeInTheDocument();
    expect(screen.getByText("8 USDC")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("420000 USDC");
    expect(container).not.toHaveTextContent("440000 USDC");
    expect(container).not.toHaveTextContent("8000000 USDC");
    expect(screen.getAllByText("Not available in current pilot data").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Allowed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Funding Mismatch").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: "Payment Control Flow" })).toBeInTheDocument();
    expect(
      screen.getAllByText("Human review is required before any downstream execution.").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { name: "Agent Activity Stream" })).toBeInTheDocument();
    expect(screen.getAllByText("No downstream evidence created").length).toBeGreaterThanOrEqual(2);

    const lifecycle = screen.getByLabelText("PayRun lifecycle");
    expect(within(lifecycle).getAllByRole("listitem").map((node) => node.textContent)).toEqual([
      expect.stringContaining("Intent"),
      expect.stringContaining("Policy"),
      expect.stringContaining("Approval"),
      expect.stringContaining("Funding"),
      expect.stringContaining("Payment"),
      expect.stringContaining("Proof"),
      expect.stringContaining("Ledger"),
    ]);

    expect(screen.getByRole("link", { name: "Command Center" })).toHaveAttribute("href", "/command-center");
    expect(screen.getByRole("link", { name: "Pay Runs" })).toHaveAttribute("href", "/payruns");
    expect(screen.getByRole("link", { name: "Pilot Validation" })).toHaveAttribute("href", "/pilot-validation");
    expect(screen.queryByText("Wallet")).not.toBeInTheDocument();
    expect(screen.queryByText("Swap")).not.toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });
});

describe("/payruns", () => {
  it("renders the four canonical PayRuns with complete read-only columns", () => {
    const { container } = render(<PayRunsView session={session} filters={{}} />);

    expect(screen.getByRole("heading", { name: "Pay Run Ledger" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View details" })).toHaveLength(4);
    expect(screen.getByTitle(session.scenarios[0]!.payRunId)).toBeInTheDocument();
    expect(screen.getByText("sandbox_prepared")).toBeInTheDocument();
    expect(screen.getAllByText("Not created").length).toBeGreaterThanOrEqual(1);
    expect(container).not.toHaveTextContent("420000 USDC");
    expect(container).not.toHaveTextContent("440000 USDC");
    expect(container).not.toHaveTextContent("8000000 USDC");
  });

  it("applies status and scenario filters without client state", () => {
    const { rerender } = render(<PayRunsView session={session} filters={{ status: "completed" }} />);
    expect(screen.getAllByRole("link", { name: "View details" })).toHaveLength(2);

    rerender(<PayRunsView session={session} filters={{ scenario: "blocked" }} />);
    expect(screen.getAllByRole("link", { name: "View details" })).toHaveLength(1);
    expect(screen.getByText("merchant_unknown.example.test")).toBeInTheDocument();
  });
});

describe("/payruns/[id]", () => {
  it("renders all separated evidence for a completed PayRun", () => {
    const allowed = session.scenarios.find((scenario) => scenario.name === "allowed")!;
    render(<PayRunDetailView session={session} scenario={allowed} />);

    expect(screen.getByText("Why this PayRun completed")).toBeInTheDocument();
    expect(screen.getByText("Funding preparation")).toBeInTheDocument();
    expect(screen.getByText("Payment execution")).toBeInTheDocument();
    expect(screen.getByText("Execution / Artifact proof")).toBeInTheDocument();
    expect(screen.getByText("Ledger summary")).toBeInTheDocument();
    expect(screen.getByText("Validation Receipt Projection")).toBeInTheDocument();
    expect(screen.getByText("0.42 USDC")).toBeInTheDocument();
    expect(screen.getByText(/Audit events/)).toBeInTheDocument();
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings.indexOf("Agent Context")).toBeLessThan(headings.indexOf("Intent"));
    expect(headings.indexOf("Intent")).toBeLessThan(headings.indexOf("Policy Decision"));
    expect(headings.indexOf("Policy Decision")).toBeLessThan(headings.indexOf("Lifecycle Timeline"));
    expect(headings.indexOf("Lifecycle Timeline")).toBeLessThan(headings.indexOf("Approval"));
    expect(headings.indexOf("Approval")).toBeLessThan(headings.indexOf("Funding preparation"));
    expect(headings.indexOf("Audit")).toBeLessThan(headings.indexOf("Technical Evidence"));
    expect(headings.indexOf("Technical Evidence")).toBeLessThan(headings.indexOf("Session Provenance"));
  });

  it("does not synthesize downstream records or a Receipt for Needs Review", () => {
    const review = session.scenarios.find((scenario) => scenario.name === "needs_review")!;
    render(<PayRunDetailView session={session} scenario={review} />);

    expect(screen.getByRole("heading", { name: "Approval" })).toBeInTheDocument();
    expect(screen.getAllByText("Human review is required before any downstream execution.").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Payment execution")).not.toBeInTheDocument();
    expect(screen.queryByText("Execution / Artifact proof")).not.toBeInTheDocument();
    expect(screen.queryByText("Ledger summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Validation Receipt Projection")).not.toBeInTheDocument();
  });

  it("shows only Policy and supporting lineage for Blocked", () => {
    const blocked = session.scenarios.find((scenario) => scenario.name === "blocked")!;
    render(<PayRunDetailView session={session} scenario={blocked} />);

    expect(screen.getByText("Policy Decision")).toBeInTheDocument();
    expect(screen.getByText("merchant.unknown")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Approval" })).toBeInTheDocument();
    expect(screen.getByText("Not created; Policy blocked this PayRun before approval.")).toBeInTheDocument();
    expect(screen.queryByText("Funding preparation")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment execution")).not.toBeInTheDocument();
    expect(screen.queryByText("Execution / Artifact proof")).not.toBeInTheDocument();
    expect(screen.queryByText("Ledger summary")).not.toBeInTheDocument();
  });

  it("returns no scenario for an unknown PayRun ID", () => {
    expect(findScenarioByPayRunId(session, "payrun_unknown")).toBeNull();
  });
});

describe("empty state", () => {
  it("explains how to prepare data without executing the command", () => {
    render(<ZenfixEmptyState />);
    expect(screen.getByText("No pilot session prepared.")).toBeInTheDocument();
    expect(screen.getByText("npm run pilot:prepare")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
