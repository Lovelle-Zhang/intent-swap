import { afterEach, describe, expect, test, vi } from "vitest";

import { isTxHash, verifyBaseSepoliaUsdcTransfer } from "@/features/payrun/hosted/onchain-verify";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TX = `0x${"a".repeat(64)}`;
const RECIPIENT = `0x${"b".repeat(40)}`;

const topicAddr = (addr: string) => `0x${"0".repeat(24)}${addr.slice(2)}`;
const amountData = (atomic: bigint) => `0x${atomic.toString(16).padStart(64, "0")}`;

function transferLog(to: string, atomic: bigint, token = USDC) {
  return { address: token, topics: [TRANSFER, topicAddr(`0x${"1".repeat(40)}`), topicAddr(to)], data: amountData(atomic) };
}

function mockReceipt(receipt: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: receipt }), { status: 200 })));
}

describe("isTxHash", () => {
  test("accepts a 32-byte hex hash, rejects the rest", () => {
    expect(isTxHash(TX)).toBe(true);
    expect(isTxHash("0x1234")).toBe(false);
    expect(isTxHash("nope")).toBe(false);
  });
});

describe("verifyBaseSepoliaUsdcTransfer", () => {
  afterEach(() => vi.restoreAllMocks());

  test("verifies a successful USDC transfer of >= the authorized amount", async () => {
    mockReceipt({ status: "0x1", logs: [transferLog(RECIPIENT, 20_000_000n)] });
    const r = await verifyBaseSepoliaUsdcTransfer(TX, "20000000");
    expect(r).toEqual({ ok: true, amountAtomic: "20000000", recipient: RECIPIENT.toLowerCase() });
  });

  test("accepts an over-payment (transfer amount greater than authorized)", async () => {
    mockReceipt({ status: "0x1", logs: [transferLog(RECIPIENT, 25_000_000n)] });
    expect((await verifyBaseSepoliaUsdcTransfer(TX, "20000000")).ok).toBe(true);
  });

  test("matches the claimed recipient when one is given", async () => {
    mockReceipt({ status: "0x1", logs: [transferLog(RECIPIENT, 20_000_000n)] });
    expect((await verifyBaseSepoliaUsdcTransfer(TX, "20000000", RECIPIENT)).ok).toBe(true);
    const other = await verifyBaseSepoliaUsdcTransfer(TX, "20000000", `0x${"c".repeat(40)}`);
    expect(other.ok).toBe(false);
  });

  test("rejects a bad hash, a reverted tx, a missing tx, an under-payment, and the wrong token", async () => {
    expect((await verifyBaseSepoliaUsdcTransfer("0xshort", "1")).ok).toBe(false);

    mockReceipt({ status: "0x0", logs: [transferLog(RECIPIENT, 20_000_000n)] });
    expect((await verifyBaseSepoliaUsdcTransfer(TX, "20000000")).ok).toBe(false); // reverted

    mockReceipt(null);
    expect((await verifyBaseSepoliaUsdcTransfer(TX, "20000000")).ok).toBe(false); // not found / pending

    mockReceipt({ status: "0x1", logs: [transferLog(RECIPIENT, 10_000_000n)] });
    expect((await verifyBaseSepoliaUsdcTransfer(TX, "20000000")).ok).toBe(false); // under-payment

    mockReceipt({ status: "0x1", logs: [transferLog(RECIPIENT, 20_000_000n, `0x${"e".repeat(40)}`)] });
    expect((await verifyBaseSepoliaUsdcTransfer(TX, "20000000")).ok).toBe(false); // not the USDC contract
  });

  test("reports unverified (never throws) when the RPC is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const r = await verifyBaseSepoliaUsdcTransfer(TX, "20000000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("RPC");
  });
});
