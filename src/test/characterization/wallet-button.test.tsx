// @vitest-environment jsdom

import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const walletMocks = vi.hoisted(() => ({
  account: {
    address: undefined as string | undefined,
    isConnected: false,
  },
  balance: undefined as { formatted: string; symbol: string } | undefined,
  chain: {
    name: "Ethereum",
    unsupported: false,
  },
  mounted: true,
  disconnect: vi.fn(),
  openChainModal: vi.fn(),
  openConnectModal: vi.fn(),
  useBalance: vi.fn(),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({
      children,
    }: {
      children: (state: {
        chain: { name: string; unsupported: boolean };
        mounted: boolean;
        openChainModal: () => void;
        openConnectModal: () => void;
      }) => ReactNode;
    }) =>
      children({
        chain: walletMocks.chain,
        mounted: walletMocks.mounted,
        openChainModal: walletMocks.openChainModal,
        openConnectModal: walletMocks.openConnectModal,
      }),
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => walletMocks.account,
  useBalance: (options: unknown) => {
    walletMocks.useBalance(options);
    return { data: walletMocks.balance };
  },
  useDisconnect: () => ({ disconnect: walletMocks.disconnect }),
}));

import { WalletButton } from "@/components/WalletButton";

const WALLET = "0xabcdef1234567890abcdef1234567890abcdef12";

describe("legacy WalletButton connection behavior", () => {
  beforeEach(() => {
    walletMocks.account.address = undefined;
    walletMocks.account.isConnected = false;
    walletMocks.balance = undefined;
    walletMocks.chain.name = "Ethereum";
    walletMocks.chain.unsupported = false;
    walletMocks.mounted = true;
  });

  it("opens the connect modal and disables balance lookup without an address", () => {
    render(<WalletButton />);

    fireEvent.click(screen.getByTitle("Connect wallet"));

    expect(walletMocks.openConnectModal).toHaveBeenCalledOnce();
    expect(walletMocks.useBalance).toHaveBeenCalledWith({
      address: undefined,
      chainId: 1,
      query: { enabled: false },
    });
  });

  it("shows connected account details and exposes chain/disconnect actions", () => {
    walletMocks.account.address = WALLET;
    walletMocks.account.isConnected = true;
    walletMocks.balance = { formatted: "1.23456", symbol: "ETH" };
    walletMocks.chain.name = "Arbitrum";

    render(<WalletButton />);

    expect(screen.getByTitle(WALLET)).toHaveTextContent("AB");
    expect(screen.getByTitle("Switch network")).toHaveTextContent("ARB");
    fireEvent.click(screen.getByTitle("Switch network"));
    expect(walletMocks.openChainModal).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTitle(WALLET));
    expect(screen.getByText("0xabcd…ef12")).toBeInTheDocument();
    expect(screen.getByText("1.2346 ETH")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(walletMocks.disconnect).toHaveBeenCalledOnce();
  });
});
