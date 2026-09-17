import { describe, expect, test, vi } from "vitest";

import {
  deliverVerifiedPayment,
  type VerifiedNotification,
  type VerifiedNotifyDeps,
} from "@/features/payrun/hosted/notify-verified";

const INPUT: VerifiedNotification = {
  payRunId: "payrun_dd27f286",
  agentId: "agent_sandbox_004",
  purpose: "Purchase a verified API result",
  amountAtomic: "420000",
  asset: "USDC",
  rail: "base-sepolia",
  transactionHash: "0xabc",
  recipient: "0xrecipient",
  pinnedMerchant: true,
};

function deps(over: Partial<VerifiedNotifyDeps>): VerifiedNotifyDeps {
  return {
    isEmailEnabled: async () => true,
    getOwnerEmail: async () => "owner@example.com",
    send: async () => true,
    appOrigin: () => "https://intent-swap.app",
    ...over,
  };
}

describe("deliverVerifiedPayment", () => {
  test("sends the rendered receipt to the owner when enabled and address known", async () => {
    const send = vi.fn(async () => true);
    const result = await deliverVerifiedPayment(INPUT, deps({ send }));
    expect(result).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("owner@example.com");
    expect(message.subject).toContain("verified on-chain");
    expect(message.html).toContain("Verified on-chain");
    expect(message.text).toContain("0.42 USDC");
  });

  test("does not send when the workspace turned emails off", async () => {
    const send = vi.fn(async () => true);
    const result = await deliverVerifiedPayment(INPUT, deps({ isEmailEnabled: async () => false, send }));
    expect(result).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  test("does not send when the owner email is unknown", async () => {
    const send = vi.fn(async () => true);
    const result = await deliverVerifiedPayment(INPUT, deps({ getOwnerEmail: async () => null, send }));
    expect(result).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  test("reports a rejected send without inventing success", async () => {
    const result = await deliverVerifiedPayment(INPUT, deps({ send: async () => false }));
    expect(result).toBe(false);
  });
});
