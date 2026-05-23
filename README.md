# Intent Swap

> Swap with intention. Not just tokens.

A natural-language DEX interface. Type what you want — *"Swap 0.1 ETH to USDC"*, *"When ETH drops to $2200, buy 0.1 ETH with USDC"* — and the app parses your intent, finds the best route, and executes the trade.

**Live**: [intent-swap-phi.vercel.app](https://intent-swap-phi.vercel.app/)

## Features

- **Instant swap** — natural-language Uniswap V3 swaps on Ethereum / Arbitrum / Linea
- **Conditional orders** — price-triggered swaps, executed automatically via Gelato
- **Multi-chain** — Ethereum mainnet (Uniswap V3), Arbitrum (Uniswap V3), Linea (Izumi)
- **Non-custodial** — your wallet signs every transaction
- **1,700+ tokens** — search by symbol or paste a contract address

## Tech Stack

- **Frontend**: Next.js 14 · TypeScript · Tailwind · wagmi · RainbowKit
- **Intent parsing**: OpenAI GPT-4o-mini
- **DEX**: Uniswap V3 (Ethereum, Arbitrum) · Izumi Finance (Linea)
- **Automation**: Gelato Relay (conditional orders)
- **Hosting**: Vercel (frontend) · separate Node service for the order monitor (`monitor/`)

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
| `GELATO_RELAY_API_KEY` | Conditional-order execution | https://app.gelato.network |

## Architecture

```
User input  →  Intent Parser (LLM)  →  Route + Quote  →  Wallet signs  →  On-chain swap
                                                              ↓
                                              (conditional orders → Gelato)
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

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel setup, monitor service deployment, and Nginx config.

## License

MIT
