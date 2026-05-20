import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

const RECEIVER_ADDRESS = "0x0f10A63a15c9E0825A67d2858cC8dB0042155D17" as const;
const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const;
const REQUIRED_AMOUNT_RAW = 9_900_000n; // 9.9 USDT (6 decimals), allow ±0.1 tolerance
const MIN_AMOUNT = 9_800_000n;

const USDT_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum.publicnode.com"),
});

export async function POST(req: NextRequest) {
  try {
    const { email, txHash } = await req.json();

    if (!email || !txHash) {
      return NextResponse.json({ error: "email and txHash are required" }, { status: 400 });
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "Invalid transaction hash format" }, { status: 400 });
    }

    // 1. 获取交易收据
    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    } catch {
      return NextResponse.json({ error: "Transaction not found. Please wait for confirmation and try again." }, { status: 400 });
    }

    if (!receipt || receipt.status !== "success") {
      return NextResponse.json({ error: "Transaction failed or not confirmed yet." }, { status: 400 });
    }

    // 2. 解析 USDT Transfer 事件
    const logs = receipt.logs.filter(
      (log) => log.address.toLowerCase() === USDT_CONTRACT.toLowerCase()
    );

    let validTransfer = false;
    for (const log of logs) {
      try {
        // Transfer(address from, address to, uint256 value)
        // topic[0] = event sig, topic[1] = from, topic[2] = to
        if (log.topics.length < 3) continue;
        const to = "0x" + log.topics[2]!.slice(26); // last 20 bytes
        const value = BigInt(log.data);

        if (
          to.toLowerCase() === RECEIVER_ADDRESS.toLowerCase() &&
          value >= MIN_AMOUNT
        ) {
          validTransfer = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!validTransfer) {
      return NextResponse.json(
        { error: `No valid USDT transfer found. Make sure you sent at least 9.8 USDT to ${RECEIVER_ADDRESS}` },
        { status: 400 }
      );
    }

    // 3. 防重放：通知后端记录 txHash（避免同一笔交易激活多个账号）
    try {
      await fetch("https://api.o-sheepps.com/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          txHash,
          activatedAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        }),
      });
    } catch {
      // 后端记录失败不影响前端激活，但记录错误
      console.error("Failed to record subscription on backend");
    }

    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    return NextResponse.json({
      success: true,
      email,
      expiresAt,
      message: "Subscription activated",
    });
  } catch (err) {
    console.error("verify-payment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
