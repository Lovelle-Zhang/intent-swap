# Deployment Guide

## 1. Local Setup

### Install dependencies

```bash
git clone https://github.com/Lovelle-Zhang/intent-swap.git
cd intent-swap
npm install
```

Node.js **18+** required.

### Configure environment variables

```bash
cp .env.local.example .env.local
```

Required keys:

| Variable | Purpose | Source |
|---|---|---|
| `OPENAI_API_KEY` | LLM intent parsing | https://platform.openai.com/api-keys |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Wallet connect | https://cloud.walletconnect.com |
| `MONITOR_URL` | URL of the monitor service (e.g. `https://api.your-domain.com/swap-orders`) | — |
| `INTERNAL_API_KEY` | Shared secret between this app and the monitor service | `openssl rand -hex 32` |
| `SUBSCRIPTION_CHECK_URL` | Endpoint that returns `{active: bool}` for a given email | — |
| `FREE_TIER` | Optional. Set to `0` to enforce subscription. Any other value disables the paywall during beta. | — |
| `NEXT_PUBLIC_FREE_TIER` | Same as above, but for the client-side gate in `/conditional-order` | — |

> ⚠️ **Security note**: `MONITOR_URL`, `INTERNAL_API_KEY`, and `SUBSCRIPTION_CHECK_URL` must **not** have a `NEXT_PUBLIC_` prefix — they are used server-side only.
>
> ⚠️ **`INTERNAL_API_KEY` must match the value set on the monitor server.** Anyone with this key can create orders bypassing the subscription check.

### Run

```bash
npm run dev          # http://localhost:3000
npm run build && npm start   # production build
```

---

## 2. Vercel Deployment (Frontend)

1. Connect the GitHub repo to Vercel.
2. Project settings → **Environment Variables**: add all three keys from above.
3. Push to `main` — Vercel auto-deploys.
4. Verify at your Vercel URL.

---

## 3. Order Monitor Service

The conditional-order monitor lives in `monitor/` and runs as a separate Node service. It checks token prices every minute (via CoinGecko) and notifies users when their price conditions trigger.

**Endpoints**:
- `POST /orders` — accept a new conditional order from the frontend
- `GET /orders` — list all stored orders
- `GET /health` — service health check

**Storage**: lowdb (single JSON file `orders.json` on disk — fine for a single-node deployment).

### Required env vars on the monitor server

```env
# Must match the INTERNAL_API_KEY you set on Vercel — without this,
# POST /orders returns 401 and no new conditional orders can be created.
INTERNAL_API_KEY=same_value_as_on_vercel
```

### Optional email notifications

If you want email alerts when orders trigger, also set:

```env
SMTP_HOST=smtp.your-provider.com
SMTP_USER=alerts@your-domain.com
SMTP_PASS=your_smtp_password
```

Without these, triggers are still detected — they just log to console instead of sending email.

### Deploy to a Linux server

```bash
# Copy code
scp -r monitor/ root@<your-server>:/root/intent-swap-monitor

# On the server
ssh root@<your-server>
cd /root/intent-swap-monitor
npm install

# Run with PM2
pm2 start index.js --name intent-swap-monitor
pm2 save
pm2 startup    # follow the printed command to enable boot autostart
```

### Nginx reverse proxy

Add to your server block (e.g. `/etc/nginx/sites-available/api.your-domain.com`):

```nginx
location /swap-orders {
    proxy_pass http://localhost:3001/orders;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

Reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Frontend wiring

In `.env.local` (and Vercel), set the **server-side** `MONITOR_URL` to the public URL where you mounted the monitor — e.g.:

```env
MONITOR_URL=https://api.your-domain.com/swap-orders
INTERNAL_API_KEY=<same value as on the monitor server>
```

The browser **never** talks to the monitor directly. The conditional-order page posts to the Next.js route `/api/orders`, which (1) validates the user has an active subscription via `SUBSCRIPTION_CHECK_URL`, (2) attaches `Authorization: Bearer ${INTERNAL_API_KEY}`, and (3) forwards the order to the monitor. The monitor refuses any POST `/orders` without a matching bearer token (401).

---

## 4. Smart Contracts

Source: `contracts/ConditionalSwapVault.sol`
Deploy script: `contracts/deploy.js`

Currently deployed addresses are recorded in `src/lib/vault.ts`. Update that file after each new deployment.

> 📌 **TODO**: Arbitrum and Linea vault addresses are not yet deployed (placeholder `0x0...0` in `src/lib/vault.ts`).

---

## 5. Pre-Deploy Checklist

- [ ] `npm install` succeeds with no peer-dep warnings
- [ ] `npm run build` succeeds
- [ ] Local smoke test: connect wallet, run an instant swap, create a conditional order
- [ ] All three env vars are set in Vercel
- [ ] Backend service running (`pm2 status` shows `online`)
- [ ] Nginx reverse-proxy routes return 200

---

## 6. Troubleshooting

**Build fails**
- Confirm Node 18+ (`node -v`)
- Delete `node_modules/` and `.next/`, then `npm install`

**Monitor service unreachable**
- `pm2 status` — is it running?
- `pm2 logs intent-swap-monitor` — any crashes?
- `lsof -i :3001` — port available?
- Confirm `MONITOR_URL` (server-side) points to the right host
- Confirm `INTERNAL_API_KEY` matches on both sides (Vercel + monitor server) — mismatch = 401 from monitor

---

## 7. Known Limitations

1. **Conditional orders** use scheduled polling (`monitor/` runs a 1-minute cron against CoinGecko), not a real on-chain resolver. Production should implement a Gelato Web3 Function. See https://docs.gelato.network/web3-services/web3-functions.
2. **Gas estimates** are static heuristics. For precision, call `eth_estimateGas` on the actual swap calldata.
3. **Arbitrum / Linea vaults** not yet deployed — conditional orders are Ethereum-only for now.

---

## References

- Gelato: https://docs.gelato.network
- Uniswap V3: https://docs.uniswap.org/contracts/v3/overview
- wagmi: https://wagmi.sh
- RainbowKit: https://www.rainbowkit.com
