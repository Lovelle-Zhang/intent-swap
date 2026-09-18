import { describe, expect, test } from "vitest";

import type { ExecutionReport } from "@/features/payrun/domain/types";
import type { AtomicMoneyView } from "@/features/payrun/presentation/money";
import { renderVerificationCard } from "@/features/payrun/hosted/verify-view";

const TX = `0x${"a".repeat(64)}`;
const usdc = (atomic: string): AtomicMoneyView => ({ amountAtomic: atomic, asset: "USDC", decimals: 6 });

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
    expect(renderVerificationCard(null, usdc("20000000"))).toBe("");
    expect(renderVerificationCard(report({ outcome: "failed" }), usdc("20000000"))).toBe("");
  });

  test("verified rail: shows what was proven, a Basescan link, and when it was checked", () => {
    // The verified card requires a persisted verification (only granted with a
    // pinned merchant anchor); a verified rail without it is self-reported.
    const html = renderVerificationCard(
      report({ verification: { amountAtomic: "20000000", recipient: `0x${"b".repeat(40)}`, sender: null, pinnedMerchant: true } }),
      usdc("20000000"),
    );
    expect(html).toContain("Verified on-chain");
    expect(html).toContain("Base mainnet");
    expect(html).toContain("not self-reported");
    // No "is final" claim — we read the receipt, not a finalized block.
    expect(html).not.toContain("is final");
    expect(html).toContain("Confirmed on-chain");
    // The reader can independently re-check the transfer on the public explorer.
    expect(html).toContain(`https://basescan.org/tx/${TX}`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Checked 2026-07-13 10:00 UTC");
    expect(html).not.toContain("Self-reported");
  });

  test("with persisted verification: binds the payer, flags the pinned match, and shows the exact amount", () => {
    const recipient = `0x${"c".repeat(40)}`;
    const sender = `0x${"d".repeat(40)}`;
    const html = renderVerificationCard(
      report({ verification: { amountAtomic: "20000000", recipient, sender, pinnedMerchant: true } }),
      usdc("20000000"),
    );
    expect(html).toContain("Payer wallet bound");
    // The recipient-was-authorized claim lives in the pinned-match point; the lead
    // point states only the raw on-chain fact (never "the authorized recipient").
    expect(html).toContain("Matched your pinned address");
    expect(html).toContain("Real on-chain transfer");
    expect(html).toContain("Amount matches");
    expect(html).toContain("Transferred <b>20 USDC</b>");
    // Addresses are shortened, not dumped in full.
    expect(html).toContain("0xcccc…cccc");
    expect(html).toContain("0xdddd…dddd");
    expect(html).not.toContain(recipient);
  });

  test("an over-payment is flagged, not painted all-green", () => {
    const html = renderVerificationCard(
      report({ verification: { amountAtomic: "25000000", recipient: `0x${"c".repeat(40)}`, sender: null, pinnedMerchant: false } }),
      usdc("20000000"),
    );
    expect(html).toContain("Over the authorized amount");
    expect(html).toContain("Transferred <b>25 USDC</b>");
    expect(html).toContain("more than the authorized 20 USDC");
    expect(html).not.toContain("Amount matches");
    expect(html).toContain('class="warn"');
  });

  test("with verification but no bound payer: omits the payer-binding point", () => {
    const html = renderVerificationCard(
      report({ verification: { amountAtomic: "20000000", recipient: `0x${"c".repeat(40)}`, sender: null, pinnedMerchant: false } }),
      usdc("20000000"),
    );
    expect(html).toContain("Verified on-chain");
    expect(html).not.toContain("Payer wallet bound");
    expect(html).not.toContain("Matched your pinned address");
  });

  test("unverified rail: labelled self-reported, clock not check, no proof and no explorer link", () => {
    const html = renderVerificationCard(report({ rail: "stripe" }), usdc("20000000"));
    expect(html).toContain("Self-reported");
    expect(html).toContain("Not verified on-chain");
    expect(html).toContain("verify plain");
    expect(html).toContain("doesn't hold the merchant credentials");
    expect(html).not.toContain("Verified on-chain");
    expect(html).not.toContain("basescan.org");
  });
});
