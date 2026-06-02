"use client";

import { RainbowKitProvider, connectorsForWallets, darkTheme } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  okxWallet,
  bitgetWallet,
  imTokenWallet,
  tokenPocketWallet,
  binanceWallet,
  coinbaseWallet,
  rainbowWallet,
  injectedWallet,
  walletConnectWallet,
  baseAccount,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig } from "wagmi";
import { WagmiProvider } from "@privy-io/wagmi";
import { PrivyProvider } from "@privy-io/react-auth";
import { mainnet, arbitrum, linea } from "wagmi/chains";
import { http, fallback } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

type EthereumRequest = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

// Wallet list curated for China-friendly connectivity:
// - The top group is wallets that inject window.ethereum directly OR have
//   their own dedicated bridge that does NOT go through the WalletConnect
//   relay (which is unreliable on mainland-China networks: FCM/Google
//   relay nodes are intermittently blocked).
// - WalletConnect is kept as the last-resort QR fallback for users who
//   have none of the above installed.
//
// Order = display order in the modal. injectedWallet is a catch-all that
// detects Phantom / Brave / Rabby / etc. and surfaces them automatically.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo";
const connectors = connectorsForWallets(
  [
    {
      groupName: "No install needed",
      // baseAccount = Coinbase Smart Wallet: passkey-based (Touch ID / Face ID
      // / Windows Hello), wallet generated in-browser on first use. Zero
      // download, no seed phrase to write down. Single fastest onboarding
      // path for users who have never used a wallet before.
      wallets: [baseAccount],
    },
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, okxWallet, bitgetWallet, injectedWallet],
    },
    {
      groupName: "Other",
      wallets: [
        imTokenWallet,
        tokenPocketWallet,
        binanceWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet,
      ],
    },
  ],
  { appName: "Intent Swap", projectId },
);

// ssr=false: keep wagmi on its default localStorage-backed reconnection
// path. With ssr=true wagmi expects cookieStorage + initialState wiring
// (server reads cookies, client receives state from RSC) — none of which
// we have set up. The visible symptom is the user reporting "I refresh
// the page and the wallet is disconnected." Until we actually need SSR
// of wallet state (we don't — every wallet-aware route is "use client"
// and re-runs on the client anyway), leave SSR off.
const config = createConfig({
  connectors,
  chains: [mainnet, linea, arbitrum],
  transports: {
    [mainnet.id]: fallback([
      http("https://rpc.ankr.com/eth"),
      http("https://cloudflare-eth.com"),
      http("https://ethereum.publicnode.com"),
    ]),
    [linea.id]: http("https://rpc.linea.build"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 窗口重新获得焦点时自动重新请求，捕获移动端切回后的链状态
      refetchOnWindowFocus: true,
    },
  },
});

// 移动端 WalletConnect 切链修复：
// 用户从钱包 app 切回浏览器时，强制刷新页面以同步链状态
function MobileChainSyncFix() {
  useEffect(() => {
    let lastChainId: string | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // 等待 WalletConnect 事件传递（300ms 缓冲）
        setTimeout(async () => {
          try {
            // 直接查询当前连接的 provider 的 chainId
            const eth = (window as { ethereum?: { request?: EthereumRequest } }).ethereum;
            const chainId = await eth?.request?.({ method: "eth_chainId" });
            if (typeof chainId === "string" && chainId !== lastChainId) {
              lastChainId = chainId;
              // 触发页面软刷新，让 wagmi 重新同步链状态
              window.dispatchEvent(new Event("focus"));
              queryClient.invalidateQueries();
            }
          } catch {
            // 忽略错误（WalletConnect 可能没有 window.ethereum）
          }
        }, 300);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return null;
}

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

// When NEXT_PUBLIC_PRIVY_APP_ID isn't set (local dev / branch preview without
// the env), skip Privy entirely so the rest of the stack keeps building.
function MaybePrivy({ children }: { children: React.ReactNode }) {
  if (!privyAppId) return <>{children}</>;
  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        defaultChain: mainnet,
        supportedChains: [mainnet, linea, arbitrum],
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: {
          theme: "dark",
          accentColor: "#f59e0b",
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MaybePrivy>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <RainbowKitProvider
            initialChain={mainnet}
            locale="en-US"
            theme={darkTheme({
              accentColor: "#f59e0b",
              accentColorForeground: "#0c0a09",
              borderRadius: "medium",
              fontStack: "system",
            })}
          >
            <MobileChainSyncFix />
            {children}
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </MaybePrivy>
  );
}
