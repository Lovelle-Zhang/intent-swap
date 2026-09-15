import { describe, expect, test } from "vitest";

import type { ExecutionReport } from "@/features/payrun/domain/types";
import { renderVerificationCard } from "@/features/payrun/hosted/verify-view";

const TX = `0x${"a".repeat(64)}`;

function report(over: Partial<ExecutionReport> = {}): ExecutionReport {
  return {
    payRunId: "payrun_abc",
    outcome: "executed",
    providerReference: "ref_1",
    rail: "base-mainnet",
    transactionHash: TX,
    artifactReference: null,
    reportedAt: "2026-07-13T10:00:02.000Z",
    reportedBy: { kind: "agent", id: "agent_1" },
    ...over,
  } as ExecutionReport;
}

describe("renderVerificationCard", () => {
  test("renders nothing without a report, or when the payment did not execute", () => {
    expect(renderVerificationCard(null, "20.00 USDC")).toBe("");
    expect(renderVerificationCard(report({ outcome: "failed" }), "20.00 USDC")).toBe("");
  });

  test("verified rail: shows what was proven, the authorized amount, and a Basescan link to self-verify", () => {
    const html = renderVerificationCard(report(), "20.00 USDC");
    expect(html).toContain("Verified on-chain");
    expect(html).toContain("Base mainnet");
    expect(html).toContain("not self-reported");
    expect(html).toContain("at least the authorized <b>20.00 USDC</b>");
    // The reader can independently re-check the transfer on the public explorer.
    expect(html).toContain(`https://basescan.org/tx/${TX}`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("Self-reported");
  });

  test("sepolia verified rail links to the testnet explorer", () => {
    const html = renderVerificationCard(report({ rail: "base-sepolia" }), "5 USDC");
    expect(html).toContain("Base Sepolia");
    expect(html).toContain(`https://sepolia.basescan.org/tx/${TX}`);
  });

  test("with persisted verification: binds the payer wallet and flags the pinned-address match", () => {
    const recipient = `0x${"c".repeat(40)}`;
    const sender = `0x${"d".repeat(40)}`;
    const html = renderVerificationCard(
      report({ verification: { amountAtomic: "20000000", recipient, sender, pinnedMerchant: true } }),
      "20.00 USDC",
    );
    expect(html).toContain("Payer wallet bound");
    expect(html).toContain("Matched your pinned address");
    expect(html).toContain("Paid the verified recipient");
    // Addresses are shortened, not dumped in full.
    expect(html).toContain("0xcccc…cccc");
    expect(html).toContain("0xdddd…dddd");
    expect(html).not.toContain(recipient);
  });

  test("with verification but no bound payer: omits the payer-binding point", () => {
    const html = renderVerificationCard(
      report({ verification: { amountAtomic: "20000000", recipient: `0x${"c".repeat(40)}`, sender: null, pinnedMerchant: false } }),
      "20.00 USDC",
    );
    expect(html).toContain("Verified on-chain");
    expect(html).not.toContain("Payer wallet bound");
    expect(html).not.toContain("Matched your pinned address");
  });

  test("unverified rail: labelled self-reported, no proof and no explorer link", () => {
    const html = renderVerificationCard(report({ rail: "stripe" }), "20.00 USDC");
    expect(html).toContain("Self-reported");
    expect(html).toContain("Not verified on-chain");
    expect(html).toContain("verify plain");
    expect(html).not.toContain("Verified on-chain");
    expect(html).not.toContain("basescan.org");
  });
});
