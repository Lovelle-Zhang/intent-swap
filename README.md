# ZenFix PayRun

> An **Agent Payment Control Layer**. Let AI agents spend money inside user-defined rules — every payment attempt becomes an explainable, auditable Pay Run.

**Status:** `SANDBOX / NO REAL FUNDS` — local development sandbox only. Live funds are prohibited until the Hosted Sandbox gates pass. See [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md).

This repository is mid-migration (Incremental Strangler): the ZenFix PayRun domain core lives under `src/features/payrun/`, while the legacy **Intent Swap** DEX surface (documented below) still ships as the current homepage. See [docs/engineering/STATUS_REPORT.md](./docs/engineering/STATUS_REPORT.md) for exactly what is and isn't wired.

### Try the live control loop

```bash
npm install
npm run dev
```

Open **http://localhost:3000/sandbox** and run a scenario. Each click runs the real PayRun control loop on the server, writes a fresh store to disk, and returns the actual state machine — no pre-baked snapshot. The four canonical scenarios (`allowed`, `needs_review`, `blocked`, `funding_mismatch`) exercise the policy allow / human-review / block paths.

---

# Legacy: Intent Swap (DEX)

> Swap with intention. Not just tokens.

A natural-language DEX interface. Type what you want — *"Swap 0.1 ETH to USDC"*, *"When ETH drops to $2200, buy 0.1 ETH with USDC"* — and the app parses your intent, finds the best route, and executes the trade.

**Live**: [intent-swap.app](https://intent-swap.app/)

## Features

- **Instant swap** — natural-language Uniswap V3 swaps on Ethereum / Arbitrum / Linea
- **Conditional orders** — set a price trigger, get notified by email when it fires (auto-execute via on-chain Vault is in progress)
- **Multi-chain** — Ethereum mainnet (Uniswap V3), Arbitrum (Uniswap V3), Linea (Izumi)
- **Non-custodial** — your wallet signs every transaction
- **1,700+ tokens** — search by symbol or paste a contract address

## Tech Stack

- **Frontend**: Next.js 14 · TypeScript · Tailwind · wagmi · RainbowKit
- **Intent parsing**: OpenAI GPT-4o-mini (via raw HTTP)
- **DEX**: Uniswap V3 (Ethereum, Arbitrum) · Izumi Finance (Linea)
- **Monitor**: standalone Node service polls prices and emails on trigger (`monitor/`)
- **Hosting**: Vercel (frontend) · separate host for the monitor service

## Quick Start

```bash
git clone https://github.com/Lovelle-Zhang/intent-swap.git
cd intent-swap
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev
```

Visit http://localhost:3000.

### Required environment variables

| Variable | Purpose | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | Intent parsing | https://platform.openai.com/api-keys |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Wallet connect (RainbowKit) | https://cloud.walletconnect.com |
| `MONITOR_URL` + `INTERNAL_API_KEY` | Conditional-order proxy | self-hosted, see DEPLOYMENT.md |

## Architecture

```
User input  →  Intent Parser (LLM)  →  Route + Quote  →  Wallet signs  →  On-chain swap
                                                              ↓
                                                conditional orders → monitor → email
```

## Project Layout

```
src/             Next.js app (frontend + API routes)
monitor/         Standalone Node service: price polling + conditional-order triggers
contracts/       Solidity: ConditionalSwapVault
public/          Static assets
DEPLOYMENT.md    Deployment guide
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel setup, [monitor/OPERATIONS.md](./monitor/OPERATIONS.md) for the trigger service, and [contracts/SECURITY.md](./contracts/SECURITY.md) for deployed vault addresses, verification, and the security review.

## License

MIT
