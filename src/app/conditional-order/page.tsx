"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSignTypedData } from "wagmi";
import { parseUnits, formatUnits, encodePacked, type Hex } from "viem";
import type { ParsedIntent } from "@/app/preview/page";
import { useWebPush } from "@/hooks/useWebPush";
import { CHAIN_TOKENS, DEFAULT_CHAIN_ID, getChainTokens, resolveTokenAddress, getTokenDecimals } from "@/config/tokens";
import { fetchEthPrice } from "@/lib/prices";
import { VAULT_ADDRESSES, VAULT_ABI, buildOrderTypedData, isVaultDeployed, type VaultOrder } from "@/lib/vault";

// MVP: 自动执行只支持 Arbitrum（Mainnet vault owner 未轮换、Linea 缺 Izumi 适配）
const EXEC_CHAIN_ID = 42161;

const ERC20_ALLOWANCE_ABI = [
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
] as const;

// ─── 订阅检查 ────────────────────────────────────────────────────────────────
// FREE BETA: conditional orders are free during beta. The hook below always
// returns "active". To re-enable the paywall, set NEXT_PUBLIC_FREE_TIER=0
// and restore the network-based check (see git history pre-2026-05-24).
function useSubscription() {
  const [status, setStatus] = useState<"loading" | "active" | "inactive">("loading");

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_FREE_TIER !== "0") {
      setStatus("active");
      return;
    }

    const localStatus = localStorage.getItem("subscription-status");
    const localExpiry = Number(localStorage.getItem("subscription-expiry") ?? 0);

    if (localStatus === "active" && localExpiry > Date.now()) {
      setStatus("active");
      return;
    }

    const email = localStorage.getItem("user-email");
    if (!email) { setStatus("inactive"); return; }

    fetch(`https://api.o-sheepps.com/subscriptions/check?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.active) {
          localStorage.setItem("subscription-status", "active");
          localStorage.setItem("subscription-expiry", String(data.expiresAt));
          setStatus("active");
        } else {
          localStorage.removeItem("subscription-status");
          setStatus("inactive");
        }
      })
      .catch(() => {
        setStatus(localStatus === "active" ? "active" : "inactive");
      });
  }, []);

  return status;
}

// Selector list: pull symbols from the canonical mainnet token map.
// Exclude WETH (UI prefers "ETH" for the same trigger token).
const CONDITION_TOKENS = Object.keys(CHAIN_TOKENS[DEFAULT_CHAIN_ID].tokens).filter(t => t !== "WETH");

type Step = "form" | "submitting" | "done" | "error";
type ExecMode = "notify" | "auto";

export default function ConditionalOrderPage() {
  const router = useRouter();
  const subStatus = useSubscription();

  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState("");
  const { state: pushState, prepare: preparePush, bind: bindPush } = useWebPush();

  // Condition fields
  const [condToken, setCondToken] = useState("ETH");
  const [condOp, setCondOp] = useState<"above" | "below">("below");
  const [condPrice, setCondPrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // ─── Auto-execute (Arbitrum only MVP) ─────────────────────────────────
  const [execMode, setExecMode] = useState<ExecMode>("auto");
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const onExecChain = chainId === EXEC_CHAIN_ID;

  // Token addresses on the exec chain
  const execTokens = getChainTokens(EXEC_CHAIN_ID).tokens;
  const fromAddr = intent ? resolveTokenAddress(intent.fromToken, EXEC_CHAIN_ID) : undefined;
  const toAddr = intent ? resolveTokenAddress(intent.toToken, EXEC_CHAIN_ID) : undefined;
  const isFromETH = intent?.fromToken === "ETH";
  // Vault uses address(0) as the ETH key; ERC20 path uses the WETH address.
  const depositTokenKey = isFromETH ? ("0x0000000000000000000000000000000000000000" as Hex) : (fromAddr as Hex | undefined);

  const vaultAddr = VAULT_ADDRESSES[EXEC_CHAIN_ID];
  const vaultReady = isVaultDeployed(EXEC_CHAIN_ID);

  // Required input amount in raw units
  const amountInRaw = useMemo(() => {
    if (!intent || intent.amount == null) return 0n;
    const decimals = getTokenDecimals(intent.fromToken);
    try { return parseUnits(String(intent.amount), decimals); } catch { return 0n; }
  }, [intent]);

  // Vault balance for the input token
  const { data: vaultBalance, refetch: refetchVaultBalance } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "getUserDeposit",
    args: address && depositTokenKey ? [address, depositTokenKey] : undefined,
    chainId: EXEC_CHAIN_ID,
    query: { enabled: !!address && !!depositTokenKey && vaultReady && execMode === "auto" },
  });

  // Current nonce for the user
  const { data: vaultNonce } = useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: "nonces",
    args: address ? [address] : undefined,
    chainId: EXEC_CHAIN_ID,
    query: { enabled: !!address && vaultReady && execMode === "auto" },
  });

  // ERC20 allowance (for non-ETH deposits)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: fromAddr,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: address ? [address, vaultAddr] : undefined,
    chainId: EXEC_CHAIN_ID,
    query: { enabled: !!address && !!fromAddr && !isFromETH && execMode === "auto" },
  });

  const balanceBig = (vaultBalance as bigint | undefined) ?? 0n;
  const allowanceBig = (allowance as bigint | undefined) ?? 0n;
  const needsDeposit = amountInRaw > 0n && balanceBig < amountInRaw;
  const needsApproval = !isFromETH && needsDeposit && allowanceBig < amountInRaw;
  const depositShortfall = amountInRaw > balanceBig ? amountInRaw - balanceBig : 0n;

  // Write hooks for approve + deposit
  const { writeContract: writeApprove, data: approveTxHash, isPending: isApprovePending } = useWriteContract();
  const { writeContract: writeDeposit, data: depositTxHash, isPending: isDepositPending } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: depositTxHash });

  useEffect(() => { if (approveConfirmed) refetchAllowance(); }, [approveConfirmed, refetchAllowance]);
  useEffect(() => { if (depositConfirmed) refetchVaultBalance(); }, [depositConfirmed, refetchVaultBalance]);

  // EIP-712 signing
  const { signTypedDataAsync, isPending: isSigning } = useSignTypedData();

  const fmtBalance = (raw: bigint, sym: string) => {
    try { return formatUnits(raw, getTokenDecimals(sym)); } catch { return "0"; }
  };

  const doApprove = () => {
    if (!fromAddr || amountInRaw === 0n) return;
    writeApprove({
      address: fromAddr,
      abi: ERC20_ALLOWANCE_ABI,
      functionName: "approve",
      args: [vaultAddr, depositShortfall * 10n], // approve 10x to avoid frequent re-approval
      chainId: EXEC_CHAIN_ID,
    });
  };

  const doDeposit = () => {
    if (depositShortfall === 0n) return;
    if (isFromETH) {
      writeDeposit({ address: vaultAddr, abi: VAULT_ABI, functionName: "depositETH",
        args: [], value: depositShortfall, chainId: EXEC_CHAIN_ID });
    } else if (fromAddr) {
      writeDeposit({ address: vaultAddr, abi: VAULT_ABI, functionName: "deposit",
        args: [fromAddr, depositShortfall], chainId: EXEC_CHAIN_ID });
    }
  };

  useEffect(() => {
    const raw = sessionStorage.getItem("conditional-order");
    if (!raw) {
      // 没有 intent 数据，但先等订阅状态确认
      // 如果未订阅，显示付费墙；如果已订阅，再跳回首页
      return;
    }
    const data = JSON.parse(raw);
    setIntent(data.intent);
    // 尝试从意图中预填条件
    if (data.intent?.condition) {
      const c = data.intent.condition;
      if (c.token) setCondToken(c.token);
      if (c.operator) setCondOp(c.operator);
      if (c.targetPrice) setCondPrice(String(c.targetPrice));
    }
    const savedEmail = localStorage.getItem("user-email") ?? "";
    setEmail(savedEmail);

    fetchEthPrice().then((v) => { if (v !== null) setCurrentPrice(v); });
  }, [router]);

  const handleSubmit = async () => {
    if (!intent) return;
    if (!condPrice || isNaN(Number(condPrice))) {
      setError("Please enter a valid target price");
      setStep("error");
      return;
    }
    setStep("submitting");
    setError("");

    try {
      if (email) localStorage.setItem("user-email", email);

      // Base payload (notify-only fields — always sent)
      const payload: Record<string, unknown> = {
        email: email || null,
        fromToken: intent.fromToken,
        toToken: intent.toToken,
        amount: intent.amount ?? 0.01,
        condition: { token: condToken, operator: condOp, targetPrice: Number(condPrice) },
      };

      // Auto-execute path: build signed Order
      if (execMode === "auto") {
        if (!isConnected || !address) throw new Error("Connect wallet to enable auto-execute");
        if (!onExecChain) throw new Error("Switch to Arbitrum to enable auto-execute");
        if (!vaultReady) throw new Error("Vault not deployed on this chain");
        if (!intent.amount) throw new Error("Amount is required for auto-execute");
        if (!fromAddr || !toAddr) throw new Error("Token not supported on Arbitrum");
        if (balanceBig < amountInRaw) throw new Error("Deposit more tokens to the vault first");
        if (vaultNonce == null) throw new Error("Could not read vault nonce");

        // amountOutMinimum: rate-anchored to target price with 5% slippage tolerance.
        // The user is saying "only execute at target price or better"; the contract
        // enforces this by reverting if Uniswap returns less than the minimum.
        const targetPrice = Number(condPrice);
        const toDecimals = getTokenDecimals(intent.toToken);
        let expectedOut: number;
        if (condToken === intent.toToken) {
          expectedOut = (intent.amount as number) / targetPrice;
        } else if (condToken === intent.fromToken) {
          expectedOut = (intent.amount as number) * targetPrice;
        } else {
          throw new Error("Auto-execute requires condition token = from or to token");
        }
        const amountOutMin = parseUnits(expectedOut.toFixed(toDecimals).slice(0, toDecimals + 10), toDecimals);
        const amountOutMinimum = (amountOutMin * 95n) / 100n; // 5% slippage from target

        // Path: single hop, 0.3% fee tier (most common for major pairs).
        // ETH input is wrapped to WETH on the swap side; vault handles the unwrap for ETH deposits.
        const pathFrom = isFromETH ? (execTokens["WETH"] as Hex) : (fromAddr as Hex);
        const pathTo = intent.toToken === "ETH" ? (execTokens["WETH"] as Hex) : (toAddr as Hex);
        const path: Hex = encodePacked(["address", "uint24", "address"], [pathFrom, 3000, pathTo]);

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60); // 30 days

        const order: VaultOrder = {
          user: address as Hex,
          tokenIn: (isFromETH ? "0x0000000000000000000000000000000000000000" : fromAddr) as Hex,
          tokenOut: pathTo,
          amountIn: amountInRaw,
          amountOutMinimum,
          path,
          isMultiHop: false,
          nonce: vaultNonce as bigint,
          deadline,
        };

        const typedData = buildOrderTypedData(order, EXEC_CHAIN_ID, vaultAddr);
        const signature = await signTypedDataAsync({
          domain: typedData.domain,
          types: typedData.types,
          primaryType: typedData.primaryType,
          message: typedData.message,
        });

        // Attach exec fields. Stringify BigInts.
        payload.exec = {
          chainId: EXEC_CHAIN_ID,
          user: address,
          tokenIn: order.tokenIn,
          tokenOut: order.tokenOut,
          amountIn: order.amountIn.toString(),
          amountOutMinimum: order.amountOutMinimum.toString(),
          path: order.path,
          isMultiHop: order.isMultiHop,
          nonce: order.nonce.toString(),
          deadline: order.deadline.toString(),
          signature,
          vaultAddress: vaultAddr,
        };
      }

      const submitRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.error ?? "Submit failed");

      setOrderId(submitData.id);
      setStep("done");
      bindPush(submitData.id).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create order");
      setStep("error");
    }
  };

  // ─── 付费墙 ────────────────────────────────────────────────────────────────
  if (subStatus === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
      </main>
    );
  }

  if (subStatus === "inactive") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full border border-stone-800 flex items-center justify-center mx-auto">
              <span className="text-stone-600 text-xl">⚡</span>
            </div>
            <h1 className="text-stone-200 text-xl font-light">Pro Feature</h1>
            <p className="text-stone-500 text-sm leading-relaxed">
              Conditional orders are available to subscribers. Auto-execute swaps when your price target is hit.
            </p>
          </div>

          <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-2">
            {["Unlimited conditional orders", "Auto-execute on price trigger", "WeChat + browser notifications"].map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <span className="text-gold-400/60 text-xs">✓</span>
                <span className="text-stone-400 text-sm">{f}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <Link
              href="/subscribe"
              className="block w-full py-3 bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-sm transition-colors text-center"
            >
              Subscribe for $9.9 / month →
            </Link>
            <p className="text-center text-emerald-400 text-[11px]">
              · Free during beta — try without paying
            </p>
            <Link href="/" className="block text-center text-stone-700 hover:text-stone-500 text-xs transition-colors">
              ← Back to swap
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 已订阅但没有 intent 数据，跳回首页
  if (!intent) {
    if (typeof window !== "undefined") router.push("/");
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 animate-fade-in">
      <div className="w-full max-w-sm space-y-8">

        {/* Header */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Link href="/" className="text-stone-700 hover:text-stone-500 text-xs transition-colors">←</Link>
              <span className="text-stone-600 text-[10px] tracking-[0.25em] uppercase">Conditional Order</span>
            </div>
            <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
          </div>
          <h1 className="text-stone-200 text-lg font-light">Set trigger & auto-execute</h1>
          <p className="text-stone-600 text-xs mt-1">
            When the condition is met, your swap executes automatically on-chain.
          </p>
        </div>

        {step === "done" ? (
          // 成功态
          <div className="space-y-6">
            <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-full border border-stone-700 flex items-center justify-center mx-auto">
                <span className="text-gold-400 text-lg">✓</span>
              </div>
              <p className="text-stone-200 text-sm">Order created</p>
              <p className="text-stone-600 text-xs">
                Swap will execute automatically when {condToken}{" "}
                {condOp === "below" ? "drops below" : "rises above"}{" "}
                <span className="text-gold-400/70">${Number(condPrice).toLocaleString()}</span>
              </p>
              {orderId && (
                <p className="text-stone-700 text-[10px] font-mono">ID: {orderId}</p>
              )}
              {/* Web Push 状态 */}
              <div className="mt-1">
                {pushState === "subscribed" && (
                  <p className="text-gold-400/60 text-[11px]">🔔 Browser notifications enabled</p>
                )}
                {pushState === "denied" && (
                  <p className="text-amber-400/50 text-[11px]">Notifications blocked — check browser settings</p>
                )}
                {pushState === "requesting" && (
                  <p className="text-stone-600 text-[11px]">Enabling notifications...</p>
                )}
                {pushState === "unsupported" && (
                  <p className="text-stone-700 text-[11px]">Push not supported in this browser</p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Link href="/activity?filter=orders" className="flex-1 py-2.5 text-center text-stone-400 hover:text-stone-200 border border-stone-800 hover:border-stone-700 rounded-xl text-xs transition-colors">
                View activity
              </Link>
              <Link href="/" className="flex-1 py-2.5 text-center bg-gold-500 hover:bg-gold-400 text-stone-950 font-medium rounded-xl text-xs transition-colors">
                New swap
              </Link>
            </div>
          </div>
        ) : step === "error" ? (
          <div className="space-y-4">
            <div className="bg-red-900/10 border border-red-800/30 rounded-xl px-5 py-4">
              <p className="text-red-400/80 text-sm">Something went wrong</p>
              <p className="text-red-400/50 text-xs mt-1 break-words">{error}</p>
            </div>
            <button onClick={() => setStep("form")} className="w-full py-2.5 text-stone-400 hover:text-stone-200 border border-stone-800 hover:border-stone-700 rounded-xl text-xs transition-colors">
              Try again
            </button>
          </div>
        ) : (
          // 表单态
          <div className="space-y-4">
            {/* 交易摘要 */}
            <div className="bg-stone-900/30 border border-stone-800/50 rounded-xl px-5 py-4 space-y-2">
              <p className="text-stone-600 text-[10px] tracking-widest uppercase mb-3">Swap</p>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs">From</span>
                <span className="text-stone-300 text-sm">{intent.amount ?? "—"} {intent.fromToken}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs">To</span>
                <span className="text-stone-400 text-sm">{intent.toToken}</span>
              </div>
            </div>

            {/* 触发条件 */}
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 space-y-3">
              <p className="text-stone-500 text-[10px] tracking-widest uppercase">Trigger condition</p>
              <div className="flex gap-2">
                <select
                  value={condToken}
                  onChange={(e) => setCondToken(e.target.value)}
                  className="flex-1 bg-stone-900/80 border border-stone-700/60 rounded-lg px-3 py-2.5 text-stone-200 text-xs focus:outline-none focus:border-stone-500 transition-colors"
                >
                  {CONDITION_TOKENS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={condOp}
                  onChange={(e) => setCondOp(e.target.value as "above" | "below")}
                  className="flex-1 bg-stone-900/80 border border-stone-700/60 rounded-lg px-3 py-2.5 text-stone-200 text-xs focus:outline-none focus:border-stone-500 transition-colors"
                >
                  <option value="below">drops below</option>
                  <option value="above">rises above</option>
                </select>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-light">$</span>
                <input
                  type="number"
                  value={condPrice}
                  onChange={(e) => setCondPrice(e.target.value)}
                  placeholder="Target price"
                  className="w-full bg-stone-900/80 border border-stone-700/60 rounded-lg pl-7 pr-4 py-2.5 text-stone-200 text-sm focus:outline-none focus:border-stone-500 transition-colors placeholder-stone-700"
                />
              </div>

              {/* 快捷价格选项 */}
              {condToken === "ETH" && currentPrice && (
                <div className="space-y-2 pt-1 border-t border-stone-800/60">
                  <div className="flex items-center justify-between">
                    <p className="text-stone-600 text-[10px] uppercase tracking-wider">Quick select</p>
                    <p className="text-stone-500 text-[11px]">Current price: <span className="text-stone-300 font-medium">${currentPrice.toLocaleString()}</span></p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(condOp === "below"
                      ? [
                          { label: "-5%",  price: Math.round(currentPrice * 0.95) },
                          { label: "-10%", price: Math.round(currentPrice * 0.90) },
                          { label: "-20%", price: Math.round(currentPrice * 0.80) },
                          { label: "-30%", price: Math.round(currentPrice * 0.70) },
                        ]
                      : [
                          { label: "+5%",  price: Math.round(currentPrice * 1.05) },
                          { label: "+10%", price: Math.round(currentPrice * 1.10) },
                          { label: "+20%", price: Math.round(currentPrice * 1.20) },
                          { label: "+50%", price: Math.round(currentPrice * 1.50) },
                        ]
                    ).map(({ label, price }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setCondPrice(String(price))}
                        className={`px-3 py-1.5 rounded-lg text-[11px] transition-all border ${
                          condPrice === String(price)
                            ? "bg-gold-500/20 text-gold-300 border-gold-500/40"
                            : "text-stone-400 hover:text-stone-200 border-stone-800 hover:border-stone-600 bg-stone-900/40"
                        }`}
                      >
                        <span className="text-stone-500">{label}</span> <span className="text-stone-300">${price.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 通知方式 */}
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 space-y-2.5">
              <p className="text-stone-500 text-[10px] tracking-widest uppercase">Notify me when triggered <span className="text-stone-700 normal-case tracking-normal font-normal">(optional)</span></p>

              {/* 浏览器推送 */}
              <button
                type="button"
                onClick={() => {
                  if (pushState === "idle") preparePush();
                }}
                disabled={pushState === "requesting" || pushState === "ready" || pushState === "subscribed" || pushState === "unsupported"}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-xs transition-colors ${
                  pushState === "subscribed"
                    ? "bg-gold-500/10 border-gold-500/30 text-gold-300"
                    : pushState === "ready"
                    ? "bg-stone-800/60 border-stone-600/50 text-stone-200"
                    : pushState === "denied"
                    ? "bg-stone-900/40 border-stone-800/40 text-stone-600 cursor-not-allowed"
                    : pushState === "requesting"
                    ? "bg-stone-900/40 border-stone-800/40 text-stone-500 cursor-wait"
                    : "bg-stone-900/60 border-stone-700/60 text-stone-300 hover:border-stone-600 hover:text-stone-200"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-base">{pushState === "subscribed" || pushState === "ready" ? "🔔" : "🔕"}</span>
                  <span>
                    {pushState === "subscribed" && "Browser notifications on"}
                    {pushState === "ready" && "Ready — activates on order creation"}
                    {pushState === "denied" && "Notifications blocked in browser settings"}
                    {pushState === "requesting" && "Requesting permission..."}
                    {pushState === "unsupported" && "Push not supported in this browser"}
                    {pushState === "idle" && "Enable browser notifications"}
                  </span>
                </span>
                {pushState === "idle" && <span className="text-stone-600 text-sm">→</span>}
              </button>

              {/* 邮件 */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="or enter email address"
                className="w-full bg-stone-900/60 border border-stone-700/60 rounded-xl px-4 py-3 text-stone-200 placeholder-stone-700 text-xs focus:outline-none focus:border-stone-500 transition-colors"
              />
            </div>

            {/* Execution mode */}
            <div className="bg-stone-900/40 border border-stone-800/60 rounded-xl px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-stone-500 text-[10px] tracking-widest uppercase">When condition hits</p>
                <div className="flex bg-stone-950/60 rounded-lg p-0.5 border border-stone-800/60">
                  <button
                    type="button"
                    onClick={() => setExecMode("auto")}
                    className={`px-2.5 py-1 rounded-md text-[10px] tracking-wide transition-colors ${execMode === "auto" ? "bg-gold-500/20 text-gold-300" : "text-stone-500 hover:text-stone-300"}`}
                  >
                    Auto-execute
                  </button>
                  <button
                    type="button"
                    onClick={() => setExecMode("notify")}
                    className={`px-2.5 py-1 rounded-md text-[10px] tracking-wide transition-colors ${execMode === "notify" ? "bg-stone-800 text-stone-200" : "text-stone-500 hover:text-stone-300"}`}
                  >
                    Notify only
                  </button>
                </div>
              </div>

              {execMode === "notify" && (
                <p className="text-stone-600 text-[11px] leading-relaxed">
                  You&apos;ll get a notification when triggered. Execute the swap yourself.
                </p>
              )}

              {execMode === "auto" && (
                <div className="space-y-2.5">
                  {!isConnected ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-stone-600 text-[11px]">Wallet required to pre-fund the vault.</p>
                      <ConnectButton.Custom>
                        {({ openConnectModal }) => (
                          <button type="button" onClick={openConnectModal} className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-stone-200 text-[11px] transition-colors shrink-0">
                            Connect
                          </button>
                        )}
                      </ConnectButton.Custom>
                    </div>
                  ) : !onExecChain ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-stone-600 text-[11px]">Auto-execute lives on Arbitrum.</p>
                      <button type="button" onClick={() => switchChain({ chainId: EXEC_CHAIN_ID })} disabled={isSwitching} className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-stone-200 text-[11px] transition-colors shrink-0 disabled:opacity-50">
                        {isSwitching ? "Switching…" : "Switch to Arbitrum"}
                      </button>
                    </div>
                  ) : !vaultReady ? (
                    <p className="text-amber-400/70 text-[11px]">Vault not deployed on this chain yet.</p>
                  ) : !intent.amount ? (
                    <p className="text-amber-400/70 text-[11px]">Order needs a specific amount (e.g. &quot;swap 100 USDC&quot;) for auto-execute.</p>
                  ) : !fromAddr || !toAddr ? (
                    <p className="text-amber-400/70 text-[11px]">Token pair not supported on Arbitrum yet.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-stone-600">Vault balance ({intent.fromToken})</span>
                        <span className="text-stone-400 font-mono">{fmtBalance(balanceBig, intent.fromToken)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-stone-600">Order needs</span>
                        <span className="text-stone-400 font-mono">{fmtBalance(amountInRaw, intent.fromToken)}</span>
                      </div>
                      {needsDeposit && (
                        <>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-stone-800/60">
                            <span className="text-amber-400/70">Short by</span>
                            <span className="text-amber-400/70 font-mono">{fmtBalance(depositShortfall, intent.fromToken)}</span>
                          </div>
                          {needsApproval ? (
                            <button type="button" onClick={doApprove} disabled={isApprovePending || (!!approveTxHash && !approveConfirmed)} className="w-full py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-stone-200 text-[11px] transition-colors disabled:opacity-50">
                              {isApprovePending ? "Confirm in wallet…" : approveTxHash && !approveConfirmed ? "Approving…" : `Approve ${intent.fromToken}`}
                            </button>
                          ) : (
                            <button type="button" onClick={doDeposit} disabled={isDepositPending || (!!depositTxHash && !depositConfirmed)} className="w-full py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-stone-200 text-[11px] transition-colors disabled:opacity-50">
                              {isDepositPending ? "Confirm in wallet…" : depositTxHash && !depositConfirmed ? "Depositing…" : `Deposit ${fmtBalance(depositShortfall, intent.fromToken)} ${intent.fromToken}`}
                            </button>
                          )}
                          <p className="text-stone-700 text-[10px] leading-relaxed">
                            Tokens stay in the Vault under your address. You can <code className="text-stone-500">withdraw</code> at any time or cancel the order before it triggers.
                          </p>
                        </>
                      )}
                      {!needsDeposit && (
                        <p className="text-emerald-400/70 text-[11px]">✓ Vault has enough — sign the order to arm it.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {step === "submitting" ? (
              <div className="flex items-center justify-center gap-3 py-3">
                <div className="w-4 h-4 border border-stone-700 border-t-gold-500/60 rounded-full animate-spin" />
                <p className="text-stone-500 text-sm">{isSigning ? "Sign in wallet…" : "Creating order..."}</p>
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!condPrice || (execMode === "auto" && (!isConnected || !onExecChain || !vaultReady || !intent.amount || needsDeposit))}
                className="w-full py-3 bg-gold-500 hover:bg-gold-400 disabled:opacity-30 disabled:cursor-not-allowed text-stone-950 font-medium rounded-xl text-sm transition-colors"
              >
                {execMode === "auto" ? "Sign & Create Order" : "Create Order"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
