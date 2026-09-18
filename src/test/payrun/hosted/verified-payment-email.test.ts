import { describe, expect, test } from "vitest";

import { renderVerifiedPaymentEmail } from "@/features/payrun/hosted/verified-payment-email";

const BASE = {
  payRunId: "payrun_dd27f286",
  agentId: "agent_sandbox_004",
  purpose: "Purchase a verified API result",
  amountAtomic: "420000",
  asset: "USDC",
  rail: "base-sepolia",
  transactionHash: "0x9f2c4b7e1a3d5f8c0b2e4a6d8f1c3e5b7a9d0c2e4f6a8b1d3e5c7f9a0b2d4e6f",
  recipient: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  pinnedMerchant: true,
  appOrigin: "https://intent-swap.app",
} as const;

describe("renderVerifiedPaymentEmail", () => {
  test("subject and body carry the verified amount and the on-chain fact", () => {
    const email = renderVerifiedPaymentEmail(BASE);
    expect(email.subject).toContain("0.42 USDC");
    expect(email.subject.toLowerCase()).toContain("verified on-chain");
    expect(email.html).toContain("Verified on-chain");
    expect(email.html).toContain("0.42 USDC");
  });

  test("carries the ZenFix brand mark so a forwarded receipt is recognizable", () => {
    const email = renderVerifiedPaymentEmail(BASE);
    // The bracket-and-dot lockup, reproduced email-safe (no SVG/img — Gmail strips
    // both). Tolerant of color tweaks, but the [•] mark must be present.
    expect(email.html).toMatch(/\[<span[^>]*>&bull;<\/span>\]/);
    expect(email.html).toContain("ZenFix");
  });

  test("links the PUBLIC explorer so the reader can verify it themselves", () => {
    const email = renderVerifiedPaymentEmail(BASE);
    const explorer = `https://sepolia.basescan.org/tx/${BASE.transactionHash}`;
    expect(email.html).toContain(explorer);
    expect(email.text).toContain(explorer);
    // the trust line — the whole point of the email
    expect(email.html.toLowerCase()).toContain("don't have to trust zenfix");
  });

  test("includes the Pay Run and tamper-evident audit links", () => {
    const email = renderVerifiedPaymentEmail(BASE);
    expect(email.html).toContain("/zenfix/payruns/payrun_dd27f286");
    expect(email.html).toContain("/api/v1/payruns/payrun_dd27f286/audit");
  });

  test("marks testnet and offers a one-click way to turn the emails off", () => {
    const email = renderVerifiedPaymentEmail(BASE);
    expect(email.html).toContain("TEST MODE");
    expect(email.html).toContain("/zenfix/policy");
    expect(email.text).toContain("/zenfix/policy");
  });

  test("mainnet has no test-mode marker and uses the mainnet explorer", () => {
    const email = renderVerifiedPaymentEmail({ ...BASE, rail: "base-mainnet" });
    expect(email.html).not.toContain("TEST MODE");
    expect(email.html).toContain(`https://basescan.org/tx/${BASE.transactionHash}`);
    expect(email.html).not.toContain("sepolia.basescan.org");
  });

  test("escapes agent-controlled text so a purpose can't inject markup", () => {
    const email = renderVerifiedPaymentEmail({ ...BASE, purpose: '<script>alert(1)</script>' });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  test("omits the recipient row when no address was verified", () => {
    const email = renderVerifiedPaymentEmail({ ...BASE, recipient: null, pinnedMerchant: false });
    expect(email.html).not.toContain("Paid to");
  });
});
