"use client";

import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { mainnet, arbitrum, linea } from "wagmi/chains";
import { http, fallback } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

const config = getDefaultConfig({
  appName: "Intent Swap",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "demo",
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
            const provider = await (window as any).ethereum?.request?.({
              method: "eth_chainId",
            });
            if (provider && provider !== lastChainId) {
              lastChainId = provider;
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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={mainnet}
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
      </QueryClientProvider>
    </WagmiProvider>
  );
}
